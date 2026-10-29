// npm run dev -> Vite (telas com recarga automática) + Electron.
// Mudou algo do processo principal (src/main, src/modulos/*/main)? Feche a janela e rode de novo.
import { createServer } from 'vite'
import { spawn } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { compilarMain, copiarEstaticos } from './compilar-main.mjs'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const servidor = await createServer({ configFile: resolve(raiz, 'vite.config.mjs') })
await servidor.listen()
const url = servidor.resolvedUrls.local[0].replace(/\/$/, '')
await compilarMain({ dev: true })
copiarEstaticos()

const electron = createRequire(import.meta.url)('electron')
const args = ['.', ...process.argv.slice(2)]
const filho = spawn(electron, args, { cwd: raiz, stdio: 'inherit', env: { ...process.env, PARALLELLO_DEV_URL: url } })
filho.on('close', async (codigo) => {
  await servidor.close()
  process.exit(codigo ?? 0)
})
