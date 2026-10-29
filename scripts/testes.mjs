// npm test -> roda os testes de todos os sistemas (sem banco, sem Electron).
import { spawnSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readdirSync } from 'fs'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pq = 'src/modulos/pesquisa-relatorios/test'
const etapas = [
  ['Gerar Pré-Venda', 'npx', ['vitest', 'run']],
  ['Acompanhamento de Vendas', 'node', ['src/modulos/acompanhamento/test/run-tests.cjs']],
  ['Acompanhamento de Vendas (módulo)', 'node', ['src/modulos/acompanhamento/test/main-smoke.cjs']],
  ['Pesquisa de Relatórios', 'node', ['--test', ...readdirSync(resolve(raiz, pq)).filter((f) => f.endsWith('.test.js')).map((f) => `${pq}/${f}`)]],
  ['Parallello', 'node', ['--test', 'tests/parallello.test.mjs']]
]
let falhou = false
for (const [nome, cmd, args] of etapas) {
  console.log(`\n=== ${nome} ===`)
  const r = spawnSync(cmd, args, { cwd: raiz, stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) falhou = true
}
console.log(falhou ? '\nAlgum teste falhou.' : '\nTodos os testes passaram.')
process.exit(falhou ? 1 : 0)
