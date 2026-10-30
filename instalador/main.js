// Instalador do Parallello: pede a senha do administrador, baixa a versão mais recente
// publicada no GitHub, confere o arquivo e instala sem perguntas, mostrando cada etapa.
import { app, BrowserWindow, ipcMain, net } from 'electron'
import { createHash } from 'crypto'
import { execFile, spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ehSenhaMaster, ehUsuarioMaster } from '../src/compartilhado/master.js'

const REPO = 'ramonbfpatrimonio/Parallello'
// PARALLELLO_INSTALADOR_API: só para testes (servidor falso no lugar do GitHub)
const API = process.env.PARALLELLO_INSTALADOR_API || `https://api.github.com/repos/${REPO}`
const TESTE = !!process.env.PARALLELLO_INSTALADOR_API

let janela = null
let liberado = false
let release = null // { versao, setup: { nome, url, tamanho }, sha512 }
let arquivo = null

function criarJanela() {
  janela = new BrowserWindow({
    width: 560,
    height: 640,
    resizable: false,
    maximizable: false,
    title: 'Instalador do Parallello',
    backgroundColor: '#e9edf0',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  })
  janela.setMenu(null)
  janela.once('ready-to-show', () => janela.show())
  janela.loadFile(path.join(__dirname, 'index.html'))
}

const exigir = () => {
  if (!liberado) throw new Error('Informe a senha do administrador primeiro.')
}
const enviar = (canal, dados) => janela?.webContents.send(canal, dados)

async function buscarJson(url) {
  const r = await net.fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Instalador-Parallello' } })
  if (r.status === 404) throw new Error('Ainda não há nenhuma versão publicada do Parallello.')
  if (r.status === 403) throw new Error('O GitHub limitou as consultas deste computador. Tente de novo daqui a alguns minutos.')
  if (!r.ok) throw new Error(`O GitHub respondeu ${r.status}.`)
  return r.json()
}
async function buscarTexto(url) {
  const r = await net.fetch(url, { headers: { 'User-Agent': 'Instalador-Parallello' } })
  if (!r.ok) throw new Error(`Não foi possível ler ${url} (${r.status}).`)
  return r.text()
}

function erroDeRede(e) {
  const m = String(e?.message ?? e)
  if (/ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_NETWORK|ERR_TIMED_OUT|ERR_PROXY/i.test(m)) {
    return new Error('Sem conexão com a internet. Confira a rede e tente de novo.')
  }
  return e instanceof Error ? e : new Error(m)
}

/** Versão do Parallello já instalada neste computador (ou null). */
function versaoInstalada() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(null)
    const chaves = ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall']
    let achou = null
    let faltam = chaves.length
    for (const chave of chaves) {
      execFile('reg', ['query', chave, '/s', '/f', 'Parallello', '/d'], { windowsHide: true }, (_e, saida) => {
        const blocos = String(saida || '').split(/\r?\n(?=HKEY_)/)
        for (const b of blocos) {
          if (!/DisplayName\s+REG_SZ\s+Parallello\b/i.test(b)) continue
          const v = b.match(/DisplayVersion\s+REG_SZ\s+(\S+)/i)
          const local = b.match(/InstallLocation\s+REG_SZ\s+(.+)/i)
          achou = { versao: v?.[1] ?? null, pasta: local?.[1]?.trim() ?? null }
        }
        if (--faltam === 0) resolve(achou)
      })
    }
  })
}

function caminhoDoPrograma(pasta) {
  const candidatos = [
    pasta && path.join(pasta, 'Parallello.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Parallello', 'Parallello.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Parallello', 'Parallello.exe'),
  ].filter(Boolean)
  return candidatos.find((c) => fs.existsSync(c)) ?? null
}

// ------------------------------------------------------------------ etapas
ipcMain.handle('senha', (_e, usuario, senha) => {
  if (!ehUsuarioMaster(usuario) || !ehSenhaMaster(senha)) throw new Error('Usuário ou senha do administrador incorretos.')
  liberado = true
  return true
})

ipcMain.handle('procurar', async () => {
  exigir()
  try {
    const r = await buscarJson(`${API}/releases/latest`)
    const setup = (r.assets || []).find((a) => /^Parallello-Setup-.*\.exe$/i.test(a.name))
    if (!setup) throw new Error(`A versão ${r.tag_name} ainda não tem o instalador. Se acabou de publicar, espere o GitHub terminar e tente de novo.`)
    const yml = (r.assets || []).find((a) => a.name === 'latest.yml')
    let sha512 = null
    if (yml) {
      const texto = await buscarTexto(yml.browser_download_url)
      sha512 = texto.match(/^sha512:\s*(\S+)/m)?.[1] ?? null
    }
    release = { versao: String(r.tag_name || '').replace(/^v/, ''), data: r.published_at, setup: { nome: setup.name, url: setup.browser_download_url, tamanho: setup.size }, sha512 }
    const instalado = await versaoInstalada()
    return { versao: release.versao, data: release.data, tamanho: setup.size, instalada: instalado?.versao ?? null }
  } catch (e) {
    throw erroDeRede(e)
  }
})

ipcMain.handle('baixar', async () => {
  exigir()
  if (!release) throw new Error('Procure a versão primeiro.')
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'parallello-instalar-'))
  const destino = path.join(pasta, release.setup.nome)
  try {
    const r = await net.fetch(release.setup.url, { headers: { 'User-Agent': 'Instalador-Parallello' } })
    if (!r.ok || !r.body) throw new Error(`O download falhou (${r.status}).`)
    const total = Number(r.headers.get('content-length')) || release.setup.tamanho || 0
    const saida = fs.createWriteStream(destino)
    const hash = createHash('sha512')
    let recebido = 0
    let ultimo = 0
    const leitor = r.body.getReader()
    for (;;) {
      const { done, value } = await leitor.read()
      if (done) break
      const pedaco = Buffer.from(value)
      hash.update(pedaco)
      if (!saida.write(pedaco)) await new Promise((ok) => saida.once('drain', ok))
      recebido += pedaco.length
      const agora = Date.now()
      if (agora - ultimo > 120) {
        ultimo = agora
        enviar('progresso', { recebido, total })
      }
    }
    await new Promise((ok, falha) => saida.end((e) => (e ? falha(e) : ok())))
    enviar('progresso', { recebido, total: total || recebido })
    arquivo = { caminho: destino, sha512: hash.digest('base64'), tamanho: recebido }
    return { tamanho: recebido }
  } catch (e) {
    throw erroDeRede(e)
  }
})

ipcMain.handle('conferir', () => {
  exigir()
  if (!arquivo) throw new Error('Baixe o instalador primeiro.')
  if (release.setup.tamanho && arquivo.tamanho !== release.setup.tamanho) {
    throw new Error('O arquivo baixado está incompleto. Tente de novo.')
  }
  if (release.sha512 && arquivo.sha512 !== release.sha512) {
    throw new Error('O arquivo baixado não confere com o publicado (pode ter sido corrompido no caminho). Tente de novo.')
  }
  return { conferido: !!release.sha512 }
})

ipcMain.handle('fechar-aberto', () => {
  exigir()
  if (process.platform !== 'win32' || TESTE) return { fechou: false }
  return new Promise((resolve) => {
    execFile('taskkill', ['/IM', 'Parallello.exe', '/F', '/T'], { windowsHide: true }, (e) => {
      // dá um tempo para o Windows liberar os arquivos
      setTimeout(() => resolve({ fechou: !e }), e ? 0 : 1500)
    })
  })
})

ipcMain.handle('instalar', async () => {
  exigir()
  if (!arquivo) throw new Error('Baixe o instalador primeiro.')
  if (TESTE || process.platform !== 'win32') {
    await new Promise((ok) => setTimeout(ok, 600))
    return { ok: true }
  }
  // /S = instala sem perguntas (na mesma pasta da instalação anterior, se houver)
  const codigo = await new Promise((resolve, reject) => {
    const p = spawn(arquivo.caminho, ['/S'], { windowsHide: true })
    p.on('error', reject)
    p.on('exit', resolve)
  })
  if (codigo !== 0) throw new Error(`O instalador terminou com erro (código ${codigo}). Feche o Parallello, se estiver aberto, e tente de novo.`)
  fs.rm(path.dirname(arquivo.caminho), { recursive: true, force: true }, () => {})
  const instalado = await versaoInstalada()
  return { ok: true, versao: instalado?.versao ?? release.versao }
})

ipcMain.handle('abrir', async () => {
  exigir()
  if (TESTE) return true
  const instalado = await versaoInstalada()
  const exe = caminhoDoPrograma(instalado?.pasta)
  if (!exe) throw new Error('Instalado, mas não achei o Parallello.exe. Abra pelo atalho da área de trabalho.')
  spawn(exe, [], { detached: true, stdio: 'ignore' }).unref()
  setTimeout(() => app.quit(), 800)
  return true
})

ipcMain.handle('sair', () => app.quit())

app.whenReady().then(criarJanela)
app.on('window-all-closed', () => app.quit())
