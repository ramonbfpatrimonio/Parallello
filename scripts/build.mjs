// npm run build -> out/ (main, preloads e as telas de todos os sistemas)
import { build as viteBuild } from 'vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { compilarMain, copiarEstaticos } from './compilar-main.mjs'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
await viteBuild({ configFile: resolve(raiz, 'vite.config.mjs'), logLevel: 'warn' })
await compilarMain()
copiarEstaticos()
console.log('Build pronto em out/')
