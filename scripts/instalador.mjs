// Prepara o "Instalador do Parallello" (programa pequeno que baixa e instala a versão mais recente).
//   node scripts/instalador.mjs        -> só compila em out-instalador/ (para testar: npx electron out-instalador)
//   npm run instalador                 -> compila e gera dist-instalador/Instalador-Parallello.exe
// Ele não muda a cada versão: gere de novo só quando mexer na pasta instalador/.
import { build } from 'esbuild'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const origem = (p) => resolve(raiz, 'instalador', p)
const destino = (p) => resolve(raiz, 'out-instalador', p)

rmSync(destino(''), { recursive: true, force: true })
mkdirSync(destino(''), { recursive: true })
await build({
  entryPoints: [origem('main.js')],
  outfile: destino('main.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
  logLevel: 'warning',
})
for (const f of ['preload.js', 'index.html', 'marca.svg']) copyFileSync(origem(f), destino(f))
const pacote = JSON.parse(readFileSync(resolve(raiz, 'package.json'), 'utf8'))
writeFileSync(
  destino('package.json'),
  JSON.stringify({ name: 'instalador-parallello', productName: 'Instalador do Parallello', version: pacote.version, description: 'Baixa e instala a versão mais recente do Parallello', author: pacote.author, main: 'main.js' }, null, 2)
)
console.log('Instalador compilado em out-instalador/')
