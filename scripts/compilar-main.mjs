// Empacota o processo principal e os preloads com o esbuild.
// Tudo (mssql, exceljs, supabase...) vai dentro do arquivo; ficam de fora só o Electron,
// o electron-updater, o pdfjs-dist e o driver nativo opcional (msnodesqlv8),
// que o instalador leva em node_modules.
import { build } from 'esbuild'
import { cpSync, mkdirSync, rmSync, copyFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = (p) => resolve(raiz, 'src', p)
const out = (p) => resolve(raiz, 'out', p)

const comum = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: false,
  logLevel: 'warning',
  alias: { '@shared': src('modulos/gerar-pre-venda/shared') },
  loader: { '.node': 'empty' }
}

export async function compilarMain({ dev = false } = {}) {
  rmSync(out('main'), { recursive: true, force: true })
  rmSync(out('preload'), { recursive: true, force: true })
  await build({
    ...comum,
    entryPoints: [src('main/index.js')],
    outfile: out('main/index.js'),
    external: ['electron', 'electron-updater', 'pdfjs-dist', 'msnodesqlv8'],
    define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') }
  })
  // preloads: um por tela. Só podem usar o módulo 'electron' (telas em sandbox).
  const preloads = {
    shell: src('preload/shell.js'),
    'gerar-pre-venda': src('modulos/gerar-pre-venda/preload/index.ts'),
    'prevenda-ruptura': src('modulos/prevenda-ruptura/main/preload.js'),
    acompanhamento: src('modulos/acompanhamento/main/preload.cjs'),
    'pesquisa-relatorios': src('modulos/pesquisa-relatorios/preload.js')
  }
  await Promise.all(
    Object.entries(preloads).map(([nome, entrada]) =>
      build({ ...comum, platform: 'browser', entryPoints: [entrada], outfile: out(`preload/${nome}.js`), external: ['electron'] })
    )
  )
}

// Arquivos que não passam pelo Vite: a tela do Pesquisa de Relatórios (HTML/JS puro),
// os dados iniciais dela e o ícone da janela.
export function copiarEstaticos() {
  const pq = src('modulos/pesquisa-relatorios')
  const destino = out('renderer/modulos/pesquisa-relatorios')
  rmSync(destino, { recursive: true, force: true })
  mkdirSync(resolve(destino, 'src'), { recursive: true })
  cpSync(resolve(pq, 'renderer'), resolve(destino, 'renderer'), { recursive: true })
  cpSync(resolve(pq, 'data'), resolve(destino, 'data'), { recursive: true })
  for (const f of ['busca.js', 'csv.js']) copyFileSync(resolve(pq, 'src', f), resolve(destino, 'src', f))
  copyFileSync(resolve(raiz, 'build/icon.png'), out('icone.png'))
}
