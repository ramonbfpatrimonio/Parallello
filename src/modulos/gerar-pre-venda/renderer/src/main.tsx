import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './estilo.css'
import { App } from './App'
import { iniciarServicos } from './servicos'
import { DURACAO_PRELOADER, Preloader } from './componentes/Preloader'

// Os serviços começam a carregar junto com a tela de abertura.
const servicos = iniciarServicos()
// Dentro do Parallello a abertura é a do Parallello: aqui não espera nem mostra a tela própria.
const dentroDoParallello = Boolean((window as unknown as { api?: { parallello?: unknown } }).api?.parallello)
const tempoMinimo = new Promise((ok) => setTimeout(ok, dentroDoParallello ? 0 : DURACAO_PRELOADER))

function Raiz() {
  const [pronto, setPronto] = useState(false) // serviços prontos e os 4 s passados
  const [preloader, setPreloader] = useState(!dentroDoParallello)
  useEffect(() => {
    void Promise.all([servicos, tempoMinimo]).then(() => {
      setPronto(true)
      if (!dentroDoParallello) setTimeout(() => setPreloader(false), 450) // tempo do esmaecer
    })
  }, [])
  return (
    <>
      {pronto && <App />}
      {preloader && <Preloader saindo={pronto} />}
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Raiz />
  </StrictMode>
)
