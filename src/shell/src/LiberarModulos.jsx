import React, { useEffect, useState } from 'react'
import { CATALOGO } from '../../modulos/catalogo.js'
import { ICONES } from './icones.js'
import { mensagem } from './util.js'

const api = () => window.parallello

/**
 * Liberar módulos: cada pessoa escolhe quais sistemas quer na tela inicial.
 * Só dá para liberar o que ela tem permissão (definida pelo administrador na Configuração).
 */
export function LiberarModulos({ sessao, avisar, semAcesso }) {
  const [marcados, setMarcados] = useState(() => new Set(sessao.modulos))
  const [salvando, setSalvando] = useState(false)
  useEffect(() => setMarcados(new Set(sessao.modulos)), [sessao.modulos.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const permitidos = new Set(sessao.permitidos ?? [])
  const alterado = [...marcados].sort().join(',') !== [...sessao.modulos].sort().join(',')

  function alternar(m) {
    if (!permitidos.has(m.id)) {
      semAcesso(`Você não tem acesso ao módulo ${m.nome}. Peça ao administrador para permitir na Configuração do Parallello.`)
      return
    }
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
      avisar('Módulos salvos. Eles já aparecem na tela inicial.')
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
