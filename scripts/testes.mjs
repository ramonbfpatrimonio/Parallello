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
  ['Indicador Logístico', 'node', ['src/modulos/indicador-logistico/test/engine.test.js']],
  // roda o arquivo direto (sem --test): no Windows, se o processo cair, o erro aparece na tela em vez de sumir
  ['Parallello', 'node', ['tests/parallello.test.mjs']]
]
// Regras do banco da nuvem (RLS): só com um PostgreSQL disponível (PGHOST=... npm test)
if (process.env.PGHOST && process.platform !== 'win32') etapas.push(['Nuvem (regras do banco)', 'sh', ['tests/sql/rodar.sh']])
let falhou = false
for (const [nome, cmd, args] of etapas) {
  console.log(`\n=== ${nome} ===`)
  const r = spawnSync(cmd, args, { cwd: raiz, stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) falhou = true
}
console.log(falhou ? '\nAlgum teste falhou.' : '\nTodos os testes passaram.')
process.exit(falhou ? 1 : 0)
