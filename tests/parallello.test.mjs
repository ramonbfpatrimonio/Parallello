// Testes do Parallello: migração dos dados dos programas antigos e catálogo.
// (o roteador de IPC e as telas são testados abrindo o programa: npm run dev)
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { build } from 'esbuild'
import { pathToFileURL } from 'url'

function pastaTemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'parallello-'))
}

// Os arquivos do Parallello usam import/export: empacota com o esbuild antes de carregar
// (funciona em qualquer versão do Node, sem depender de "type": "module").
async function carregar(arquivo, opcoes = {}) {
  const r = await build({ entryPoints: [arquivo], bundle: true, write: false, format: 'esm', platform: 'node', ...opcoes })
  const destino = path.join(pastaTemp(), path.basename(arquivo, '.js') + '.mjs')
  fs.writeFileSync(destino, r.outputFiles[0].text)
  return import(pathToFileURL(destino).href)
}

const { migrarSePreciso } = await carregar('src/main/migracao.js')
const { CATALOGO } = await carregar('src/modulos/catalogo.js')
// roteador com um "electron" falso (o ipcMain falso é lido quando o módulo carrega)
const registrados = {}
globalThis.__ipcFalso = { handle: (c, fn) => { registrados[c] = fn } }
const R = await carregar('src/main/roteador.js', {
  plugins: [{ name: 'electron-falso', setup(b) {
    b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'falso' }))
    b.onLoad({ filter: /.*/, namespace: 'falso' }, () => ({ contents: 'export const ipcMain = globalThis.__ipcFalso' }))
  } }]
})
const { ehSenhaMaster, dataMaster } = await carregar('src/compartilhado/master.js')
// sessao.js com a nuvem e o Electron simulados
const NOMES_NUVEM = ['definirMeusModulos', 'entrar', 'entrarMaster', 'sair', 'token', 'usuarioId', 'online', 'meuPerfil', 'licenca', 'empresas', 'definirModulosEmpresa', 'usuarios', 'criarUsuario', 'alterarUsuario', 'trocarSenha', 'definirModulos', 'conexoes', 'registrarEvento']
const { criarSessao } = await carregar('src/main/sessao.js', {
  plugins: [{
    name: 'simulados',
    setup(b) {
      b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'sim' }))
      b.onResolve({ filter: /nuvem\.js$/ }, (a) => (a.importer.endsWith('sessao.js') ? { path: 'nuvem', namespace: 'sim' } : undefined))
      b.onLoad({ filter: /^electron$/, namespace: 'sim' }, () => ({ contents: 'export const safeStorage = { isEncryptionAvailable: () => false }' }))
      b.onLoad({ filter: /^nuvem$/, namespace: 'sim' }, () => ({
        contents:
          NOMES_NUVEM.map((n) => `export const ${n} = (...a) => globalThis.__nuvem.${n}(...a)`).join('\n') +
          '\nexport const ehErroDeRede = (e) => /fetch failed|sem internet/i.test(e?.message ?? String(e))'
      }))
    }
  }]
})

// Só agora carrega o node:test: no Windows (Node 22) o processo caía sem mensagem
// quando os testes começavam a rodar enquanto o arquivo ainda estava carregando módulos.
const { test } = await import('node:test')

test('migra o Pré-Venda de Ruptura antigo e tira a senha cifrada pelo programa antigo', () => {
  const t = pastaTemp()
  const antiga = path.join(t, 'appdata', 'Pre-Venda de Ruptura', 'dados')
  fs.mkdirSync(antiga, { recursive: true })
  fs.writeFileSync(path.join(antiga, 'config.json'), JSON.stringify({ usuarios: [{ usuario: 'ramon' }], conexoes: [{ id: 'c1', senhaCripto: 'ss:xyz' }, { id: 'c2', senhaCripto: 'b64:YQ==' }] }))
  fs.writeFileSync(path.join(antiga, 'historico.json'), '[{"id":1}]')
  const nova = path.join(t, 'modulos', 'prevenda-ruptura')
  assert.equal(migrarSePreciso('prevenda-ruptura', nova, path.join(t, 'appdata')), antiga)
  const cfg = JSON.parse(fs.readFileSync(path.join(nova, 'config.json'), 'utf8'))
  assert.equal(cfg.usuarios[0].usuario, 'ramon')
  assert.equal(cfg.conexoes[0].senhaCripto, '')
  assert.equal(cfg.conexoes[1].senhaCripto, 'b64:YQ==')
  assert.ok(fs.existsSync(path.join(nova, 'historico.json')))
  // a pasta antiga fica como estava
  assert.match(fs.readFileSync(path.join(antiga, 'config.json'), 'utf8'), /ss:xyz/)
})

test('só migra uma vez e não sobrescreve dados que já existem', () => {
  const t = pastaTemp()
  const antiga = path.join(t, 'appdata', 'Acompanhamento de Vendas', 'dados')
  fs.mkdirSync(antiga, { recursive: true })
  fs.writeFileSync(path.join(antiga, 'dados.json'), JSON.stringify({ empresas: [{ nome: 'Hage', bases: [{ senhaCifrada: 'ss:1' }] }] }))
  const nova = path.join(t, 'modulos', 'acompanhamento')
  fs.mkdirSync(nova, { recursive: true })
  fs.writeFileSync(path.join(nova, 'dados.json'), '{"empresas":[]}')
  assert.equal(migrarSePreciso('acompanhamento', nova, path.join(t, 'appdata')), null)
  assert.equal(fs.readFileSync(path.join(nova, 'dados.json'), 'utf8'), '{"empresas":[]}')
  // segunda vez: nem olha
  fs.rmSync(path.join(nova, 'dados.json'))
  assert.equal(migrarSePreciso('acompanhamento', nova, path.join(t, 'appdata')), null)
  assert.ok(!fs.existsSync(path.join(nova, 'dados.json')))
})

test('migra o Pesquisa de Relatórios (dados e pasta de backup escolhida)', () => {
  const t = pastaTemp()
  const antiga = path.join(t, 'appdata', 'PesquisaRelatorios')
  fs.mkdirSync(path.join(antiga, 'dados', 'imagens'), { recursive: true })
  fs.writeFileSync(path.join(antiga, 'dados', 'relatorios.json'), '{}')
  fs.writeFileSync(path.join(antiga, 'config.json'), '{"pastaBackup":"D:/bk"}')
  const nova = path.join(t, 'modulos', 'pesquisa-relatorios')
  migrarSePreciso('pesquisa-relatorios', nova, path.join(t, 'appdata'))
  assert.ok(fs.existsSync(path.join(nova, 'dados', 'relatorios.json')))
  assert.ok(fs.existsSync(path.join(nova, 'dados', 'imagens')))
  assert.equal(JSON.parse(fs.readFileSync(path.join(nova, 'config.json'), 'utf8')).pastaBackup, 'D:/bk')
})

test('Gerar Pré-Venda: copia conexões sem a senha cifrada (cada computador informa de novo)', () => {
  const t = pastaTemp()
  const antiga = path.join(t, 'appdata', 'Gerar Pré-Venda')
  fs.mkdirSync(antiga, { recursive: true })
  fs.writeFileSync(path.join(antiga, 'conexoes.json'), JSON.stringify({ versao: 1, perfis: [{ id: 'p', nome: 'X', senhaCifrada: 'abc' }] }))
  fs.writeFileSync(path.join(antiga, 'acesso-offline.dat'), 'cifrado')
  const nova = path.join(t, 'modulos', 'gerar-pre-venda')
  migrarSePreciso('gerar-pre-venda', nova, path.join(t, 'appdata'))
  const c = JSON.parse(fs.readFileSync(path.join(nova, 'conexoes.json'), 'utf8'))
  assert.equal(c.perfis[0].nome, 'X')
  assert.equal(c.perfis[0].senhaCifrada, undefined)
  assert.ok(!fs.existsSync(path.join(nova, 'acesso-offline.dat')))
})

test('Indicador Logístico: copia usuários, histórico e conexões; tira só a senha cifrada pelo Windows', () => {
  const t = pastaTemp()
  const antiga = path.join(t, 'appdata', 'Indicador Logístico', 'dados')
  fs.mkdirSync(path.join(antiga, 'historico'), { recursive: true })
  fs.writeFileSync(path.join(antiga, 'usuarios.json'), '[{"usuario":"ramon"}]')
  fs.writeFileSync(path.join(antiga, 'conexoes.json'), JSON.stringify([{ nome: 'COMERCIO', senhaCripto: 'ss:abc' }, { nome: 'INDUSTRIA', senhaCripto: 'gcm:xyz' }]))
  fs.writeFileSync(path.join(antiga, 'historico', 'indice.json'), '[]')
  const nova = path.join(t, 'modulos', 'indicador-logistico')
  assert.equal(migrarSePreciso('indicador-logistico', nova, path.join(t, 'appdata')), antiga)
  const c = JSON.parse(fs.readFileSync(path.join(nova, 'conexoes.json'), 'utf8'))
  assert.equal(c[0].senhaCripto, '')
  assert.equal(c[1].senhaCripto, 'gcm:xyz')
  assert.ok(fs.existsSync(path.join(nova, 'usuarios.json')))
  assert.ok(fs.existsSync(path.join(nova, 'historico', 'indice.json')))
})

test('Comissão por Contas Recebidas: copia só o arquivo de dados (sem o cache do Chromium)', () => {
  const t = pastaTemp()
  const antiga = path.join(t, 'appdata', 'Comissão por Contas Recebidas')
  fs.mkdirSync(path.join(antiga, 'Cache'), { recursive: true })
  fs.writeFileSync(path.join(antiga, 'comissao-local.sqlite'), 'sqlite')
  fs.writeFileSync(path.join(antiga, 'Cache', 'lixo'), 'x')
  const nova = path.join(t, 'modulos', 'comissao-contas-recebidas')
  assert.equal(migrarSePreciso('comissao-contas-recebidas', nova, path.join(t, 'appdata')), antiga)
  assert.equal(fs.readFileSync(path.join(nova, 'comissao-local.sqlite'), 'utf8'), 'sqlite')
  assert.ok(!fs.existsSync(path.join(nova, 'Cache')))
})

test('sem programa antigo: abre vazio e marca como verificado', () => {
  const t = pastaTemp()
  const nova = path.join(t, 'modulos', 'acompanhamento')
  assert.equal(migrarSePreciso('acompanhamento', nova, path.join(t, 'nada')), null)
  assert.ok(fs.existsSync(path.join(nova, '.migracao-verificada')))
})

test('catálogo: ids únicos, todos com página, ícone e processo principal', async () => {
  const ids = CATALOGO.map((m) => m.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const m of CATALOGO) {
    assert.ok(fs.existsSync(path.join('src', m.pagina)), m.pagina)
    assert.ok(fs.existsSync(path.join('src/modulos', m.id, 'icone.png')), m.id)
  }
  const fonte = fs.readFileSync('src/main/modulos.js', 'utf8')
  for (const id of ids) assert.ok(fonte.includes(`'${id}'`) || fonte.includes(`${id}:`), id)
})

test('roteador: o mesmo canal em dois módulos chega a cada um pelo remetente', async () => {
  R.ipcDoModulo('a').handle('exportar:excel', () => 'A')
  R.ipcDoModulo('b').handle('exportar:excel', () => 'B')
  R.vincularTela(10, 'a')
  R.vincularTela(20, 'b')
  assert.equal(await registrados['exportar:excel']({ sender: { id: 10 } }), 'A')
  assert.equal(await registrados['exportar:excel']({ sender: { id: 20 } }), 'B')
  assert.throws(() => registrados['exportar:excel']({ sender: { id: 99 } }), /não está disponível/)
  assert.throws(() => R.ipcDoModulo('a').handle('parallello:estado', () => 0), /reservado/)
})

// ---------------------------------------------------------------- login do Parallello

test('senha master: administrador + P@r@llell0 + data do computador', () => {
  const dia = new Date(2026, 9, 30)
  assert.equal(dataMaster(dia), '30102026')
  assert.equal(ehSenhaMaster('P@r@llell030102026', dia), true)
  assert.equal(ehSenhaMaster('P@r@llell029102026', dia), false, 'data de outro dia não vale')
  assert.equal(ehSenhaMaster('P@rallell030102026', dia), false, 'prefixo errado')
  assert.equal(ehSenhaMaster('30102026', dia), false)
})

const CATALOGO_TESTE = ['gerar-pre-venda', 'prevenda-ruptura', 'acompanhamento', 'pesquisa-relatorios', 'indicador-logistico'].map((id) => ({ id }))
function nuvemFalsa(extra = {}) {
  const base = { sair: async () => {}, registrarEvento: async () => {}, empresas: async () => [], conexoes: async () => [], token: async () => null }
  globalThis.__nuvem = { ...base, ...extra }
}
const hoje = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `P@r@llell0${p(d.getDate())}${p(d.getMonth() + 1)}${d.getFullYear()}`
}

test('master sem internet: abre a configuração, começa sem módulos e libera para si mesmo', async () => {
  nuvemFalsa({ entrarMaster: async () => { throw new Error('fetch failed') } })
  const s = criarSessao({ pasta: pastaTemp(), catalogo: CATALOGO_TESTE })
  await assert.rejects(s.entrar('administrador', 'errada'), /incorretos/)
  const pub = await s.entrar('Administrador', hoje())
  assert.equal(pub.modo, 'master')
  assert.equal(pub.configLiberada, true, 'administrador já abre a configuração')
  assert.deepEqual(pub.modulos, [], 'tela inicial começa em branco')
  assert.equal(pub.permitidos.length, 5, 'master pode usar todos')
  assert.equal(s.estaNaTela('acompanhamento'), false)
  await s.definirMeusModulos(['acompanhamento'])
  assert.equal(s.estaNaTela('acompanhamento'), true)
  assert.equal(s.estaNaTela('gerar-pre-venda'), false)
  assert.equal(s.podeAbrir('gerar-pre-venda'), true, 'master tem acesso a todos')
  assert.deepEqual(await s.definirMeusModulos(['nao-existe', 'acompanhamento']), ['acompanhamento'], 'módulo desconhecido é ignorado')
  await assert.rejects(s.listarUsuarios(), /nuvem/, 'usuários precisam da nuvem')
})

test('usuário da nuvem: libera o que quiser para a tela, mas só abre o que tem permissão; depois entra sem internet', async () => {
  const pasta = pastaTemp()
  const perfil = { id: 'u1', nome: 'João', usuario: 'joao', papel: 'operador', ativo: true, empresa_id: 'e1', empresa_nome: 'Hage', empresa_ativa: true, empresa_modulos: ['acompanhamento', 'indicador-logistico'], modulos: ['acompanhamento', 'gerar-pre-venda'], modulos_visiveis: ['acompanhamento', 'indicador-logistico'] }
  const logins = []
  const escolhas = []
  nuvemFalsa({
    entrar: async (login) => { logins.push(login) },
    meuPerfil: async () => perfil,
    definirMeusModulos: async (m) => { escolhas.push(m); return m }
  })
  let s = criarSessao({ pasta, catalogo: CATALOGO_TESTE })
  const pub = await s.entrar(' Joao ', 'segredo1')
  assert.deepEqual(logins, ['joao'], 'login normalizado')
  assert.equal(pub.modo, 'nuvem')
  assert.equal(pub.configLiberada, false)
  assert.deepEqual(pub.permitidos, ['acompanhamento'], 'gerar-pre-venda não foi contratado; indicador não foi permitido')
  assert.deepEqual(pub.modulos, ['acompanhamento', 'indicador-logistico'], 'aparece tudo o que ele liberou para a tela')
  assert.equal(s.podeAbrir('acompanhamento'), true)
  assert.equal(s.podeAbrir('indicador-logistico'), false, 'mas só abre o que tem permissão')
  await s.definirMeusModulos(['acompanhamento', 'indicador-logistico', 'gerar-pre-venda'])
  assert.deepEqual(escolhas.pop(), ['acompanhamento', 'indicador-logistico', 'gerar-pre-venda'], 'salva mesmo sem permissão')
  assert.equal(s.podeAbrir('gerar-pre-venda'), false)
  await s.definirMeusModulos([])
  assert.deepEqual(escolhas, [[]])
  assert.deepEqual(s.publico().modulos, [])
  await assert.rejects(s.listarUsuarios(), /bloqueada/, 'configuração só com a senha master')
  await s.sair()
  assert.equal(s.logado(), false)

  // sem internet: o acesso guardado neste computador
  nuvemFalsa({ entrar: async () => { throw new Error('fetch failed') } })
  s = criarSessao({ pasta, catalogo: CATALOGO_TESTE })
  await assert.rejects(s.entrar('joao', 'errada'), /incorretos/)
  const off = await s.entrar('joao', 'segredo1')
  assert.equal(off.modo, 'offline')
  assert.deepEqual(off.permitidos, ['acompanhamento'])
  await assert.rejects(s.definirMeusModulos(['acompanhamento']), /Sem internet/)
  await assert.rejects(s.entrar('maria', 'x'), /ainda não entrou neste computador/)
})

test('licença bloqueada ou usuário desativado não entram', async () => {
  const perfil = { id: 'u2', nome: 'Ana', papel: 'admin', ativo: true, empresa_id: 'e1', empresa_nome: 'Hage', empresa_ativa: true, modulos: [], licenca: { vencimento: '2020-01-01', dias_aviso: 5, dias_tolerancia: 3, contato: '(92) 99999-0000', valor: 100, ciclo_meses: 1 } }
  nuvemFalsa({ entrar: async () => {}, meuPerfil: async () => perfil })
  const s = criarSessao({ pasta: pastaTemp(), catalogo: CATALOGO_TESTE })
  await assert.rejects(s.entrar('ana', 'segredo1'), /Licença vencida em 01\/01\/2020.*\(92\) 99999-0000/)
  perfil.licenca = null
  perfil.ativo = false
  await assert.rejects(s.entrar('ana', 'segredo1'), /desativado/)
  assert.equal(s.logado(), false)
})

test('administrador da empresa: pode usar os contratados; na configuração (senha master) dá permissão aos usuários', async () => {
  const chamadas = []
  const perfil = { id: 'a1', nome: 'Admin', papel: 'admin', ativo: true, empresa_id: 'e1', empresa_nome: 'Hage', empresa_ativa: true, empresa_modulos: ['acompanhamento', 'pesquisa-relatorios'], modulos: [], modulos_visiveis: [] }
  nuvemFalsa({
    entrar: async () => {},
    meuPerfil: async () => perfil,
    usuarios: async () => [{ id: 'a1', nome: 'Admin', papel: 'admin', modulos: [] }, { id: 'o1', nome: 'Op', papel: 'operador', modulos: [] }, { id: 's1', nome: 'Super', papel: 'super_admin', modulos: [] }],
    definirModulos: async (id, m) => { chamadas.push([id, m]); return m }
  })
  const s = criarSessao({ pasta: pastaTemp(), catalogo: CATALOGO_TESTE })
  const pub = await s.entrar('admin', 'segredo1')
  assert.deepEqual(pub.permitidos, ['acompanhamento', 'pesquisa-relatorios'], 'administrador usa os contratados')
  await assert.rejects(s.listarUsuarios(), /bloqueada/)
  assert.throws(() => s.liberarConfig('errada'), /incorreta/)
  s.liberarConfig(hoje())
  const { usuarios } = await s.listarUsuarios()
  assert.deepEqual(usuarios.map((u) => u.id), ['a1', 'o1'], 'super administradores não aparecem')
  await s.definirModulos('o1', ['pesquisa-relatorios', 'nao-existe'])
  assert.deepEqual(chamadas, [['o1', ['pesquisa-relatorios']]])
  await assert.rejects(s.criarUsuario({ usuario: 'administrador', senha: '123456' }), /reservado/)
  s.fecharConfig()
  await assert.rejects(s.listarUsuarios(), /bloqueada/)
})
