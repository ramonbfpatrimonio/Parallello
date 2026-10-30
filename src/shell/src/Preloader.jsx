import React, { useEffect, useState } from 'react'
import marca from './assets/marca.svg'

/**
 * Abertura do Parallello: as duas barras da marca aparecem, esmaecem e dão lugar ao nome.
 * Some sozinha depois de ~3 s (ou na hora, para quem pediu menos movimento no Windows).
 */
export function Preloader({ aoTerminar }) {
  const [fase, setFase] = useState('marca') // marca -> nome -> saindo
  useEffect(() => {
    const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const tempos = reduzido ? [0, 300, 600] : [1100, 2500, 2950]
    const t = [
      setTimeout(() => setFase('nome'), tempos[0]),
      setTimeout(() => setFase('saindo'), tempos[1]),
      setTimeout(() => aoTerminar(), tempos[2]),
    ]
    return () => t.forEach(clearTimeout)
  }, [aoTerminar])
  return (
    <div className={`preloader fase-${fase}`} aria-hidden="true">
      <img src={marca} alt="" className="preloader-marca" />
      <span className="preloader-nome">Parallello</span>
    </div>
  )
}
