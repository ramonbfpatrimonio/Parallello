import React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/bricolage-grotesque/500.css'
import '@fontsource/bricolage-grotesque/700.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import './estilo.css'
import { App } from './App.jsx'
import { aplicarTema, lerTema } from './preferencias.js'

aplicarTema(lerTema()) // antes de desenhar, para não piscar o tema claro

// Fora do Electron (vite no navegador) usa uma ponte de demonstração para ajustar o visual.
async function iniciar() {
  if (!window.parallello) {
    const { criarPonteDemo } = await import('./demo.js')
    window.parallello = criarPonteDemo()
  }
  createRoot(document.getElementById('raiz')).render(<App />)
}
iniciar()
