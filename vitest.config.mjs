import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
export default defineConfig({
  resolve: { alias: { '@shared': resolve(__dirname, 'src/modulos/gerar-pre-venda/shared') } },
  test: { include: ['src/modulos/gerar-pre-venda/tests/**/*.test.ts'] }
})
