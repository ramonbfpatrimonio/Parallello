import React, { useEffect, useState } from 'react'
import { CATALOGO } from '../../modulos/catalogo.js'
import { ICONES } from './icones.js'
import { mensagem } from './util.js'

const api = () => window.parallello

/**
 * Liberar módulos: cada pessoa escolhe quais sistemas quer na tela inicial (pode marcar todos).
 * A permissão (definida pelo administrador na Configuração) é conferida só ao abrir o módulo.
 */
export function LiberarModulos({ sessao, avisar, aoSalvar }) {
  const [marcados, setMarcados] = useState(() => new Set(sessao.modulos))
  const [salvando, setSalvando] = useState(false)
  useEffect(() => setMarcados(new Set(sessao.modulos)), [sessao.modulos.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const alterado = [...marcados].sort().join(',') !== [...sessao.modulos].sort().join(',')

  const todos = marcados.size === CATALOGO.length
  function alternar(m) {
    setMarcados((atual) => {
      const s = new Set(atual)
      s.has(m.id) ? s.delete(m.id) : s.add(m.id)
      return s
    })
  }

  async function salvar() {
    setSalvando(true)
    try {
      await api().definirMeusModulos([...marcados])
      avisar('Alteração salva.')
      aoSalvar?.()
    } catch (e) {
      avisar(mensagem(e), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <main className="pagina">
      <header className="pagina-cabeca">
        <div>
          <h1>Liberar módulos</h1>
          <p>Marque os sistemas que você usa e clique em <b>Salvar</b>. Só os liberados aparecem na sua tela inicial.</p>
        </div>
        <div className="pagina-acoes">
          <button className="botao" onClick={() => setMarcados(todos ? new Set() : new Set(CATALOGO.map((m) => m.id)))}>
            {todos ? 'Desmarcar todos' : 'Marcar todos'}
          </button>
          <button className="botao primario" onClick={salvar} disabled={salvando || !alterado}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </header>

      <ul className="liberar">
        {CATALOGO.map((m) => {
          const marcado = marcados.has(m.id)
          return (
            <li key={m.id}>
              <label className={'liberar-item' + (marcado ? ' marcado' : '')} style={{ '--cor': m.cor }}>
                <input type="checkbox" checked={marcado} onChange={() => alternar(m)} />
                <img src={ICONES[m.id]} alt="" />
                <span className="liberar-textos">
                  <b>{m.nome}</b>
                  <small>{m.descricao}</small>
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
