import React, { useEffect } from 'react'

const api = () => window.parallello

/**
 * Janela por cima de tudo. As telas dos sistemas ficam numa camada própria do Electron,
 * então enquanto a janela está aberta o Parallello esconde a tela do sistema (cobrir).
 */
export function Modal({ titulo, children, rodape, aoFechar, largura = 440 }) {
  useEffect(() => {
    api().cobrir(true)
    const tecla = (e) => {
      if (e.key === 'Escape' && aoFechar) aoFechar()
    }
    window.addEventListener('keydown', tecla)
    return () => {
      window.removeEventListener('keydown', tecla)
      api().cobrir(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar?.()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} style={{ maxWidth: largura }}>
        <h2 className="modal-titulo">{titulo}</h2>
        <div className="modal-corpo">{children}</div>
        {rodape && <div className="modal-rodape">{rodape}</div>}
      </div>
    </div>
  )
}

export function Campo({ rotulo, children, dica }) {
  return (
    <label className="campo">
      <span className="campo-rotulo">{rotulo}</span>
      {children}
      {dica && <span className="campo-dica">{dica}</span>}
    </label>
  )
}
