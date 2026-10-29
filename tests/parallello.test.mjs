// Testes do Parallello: migração dos dados dos programas antigos e catálogo.
// (o roteador de IPC e as telas são testados abrindo o programa: npm run dev)
import { test } from 'node:test'
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
  // carrega o roteador com um "electron" falso
  const registrados = {}
  globalThis.__ipcFalso = { handle: (c, fn) => { registrados[c] = fn } }
  const R = await carregar('src/main/roteador.js', {
    plugins: [{ name: 'electron-falso', setup(b) {
      b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'falso' }))
      b.onLoad({ filter: /.*/, namespace: 'falso' }, () => ({ contents: 'export const ipcMain = globalThis.__ipcFalso' }))
    } }]
  })
  R.ipcDoModulo('a').handle('exportar:excel', () => 'A')
  R.ipcDoModulo('b').handle('exportar:excel', () => 'B')
  R.vincularTela(10, 'a')
  R.vincularTela(20, 'b')
  assert.equal(await registrados['exportar:excel']({ sender: { id: 10 } }), 'A')
  assert.equal(await registrados['exportar:excel']({ sender: { id: 20 } }), 'B')
  assert.throws(() => registrados['exportar:excel']({ sender: { id: 99 } }), /não está disponível/)
  assert.throws(() => R.ipcDoModulo('a').handle('parallello:estado', () => 0), /reservado/)
})
