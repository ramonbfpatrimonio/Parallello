// Interface de todos os sistemas num build só (várias páginas).
// Cada sistema continua com a sua própria página, CSS e React; só o build é compartilhado.
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const raiz = resolve(__dirname, 'src')

export default defineConfig({
  root: raiz,
  base: './',
  envDir: __dirname, // .env com VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (Gerar Pré-Venda)
  plugins: [react()],
  resolve: {
    alias: { '@shared': resolve(raiz, 'modulos/gerar-pre-venda/shared') }
  },
  server: { port: 5190, strictPort: true },
  build: {
    outDir: resolve(__dirname, 'out/renderer'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        shell: resolve(raiz, 'shell/index.html'),
        'gerar-pre-venda': resolve(raiz, 'modulos/gerar-pre-venda/renderer/index.html'),
        'prevenda-ruptura': resolve(raiz, 'modulos/prevenda-ruptura/renderer/index.html'),
        acompanhamento: resolve(raiz, 'modulos/acompanhamento/renderer/index.html')
      }
    }
  }
})
