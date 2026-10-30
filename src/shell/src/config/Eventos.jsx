import React, { useCallback, useEffect, useState } from 'react'
import { mensagem } from '../util.js'

const api = () => window.parallello
const PERIODOS = [
  [1, 'Hoje'],
  [7, '7 dias'],
  [30, '30 dias'],
  [90, '90 dias'],
]

const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** Eventos do sistema: quem fez o quê, quando e de qual computador. */
export function Eventos({ sessao, avisar }) {
  const [dias, setDias] = useState(7)
  const [texto, setTexto] = useState('')
  const [todas, setTodas] = useState(false)
  const [lista, setLista] = useState(null)
  const [erroCarga, setErroCarga] = useState('')

  const carregar = useCallback(async () => {
    setLista(null)
    setErroCarga('')
    try {
      const desde = new Date()
      desde.setHours(0, 0, 0, 0)
      desde.setDate(desde.getDate() - (dias - 1))
      setLista(await api().config.eventos({ desde: desde.toISOString(), texto, todasEmpresas: todas }))
    } catch (e) {
      setErroCarga(mensagem(e))
      setLista([])
    }
  }, [dias, texto, todas, avisar])
  useEffect(() => {
    void carregar()
  }, [dias, todas]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section>
      <header className="pagina-cabeca">
        <div>
          <h1>Eventos do sistema</h1>
          <p>Quem entrou, criou, alterou, excluiu, liberou ou gerou algo, com dia, hora e computador.</p>
        </div>
      </header>
      <form className="filtros" onSubmit={(e) => { e.preventDefault(); void carregar() }}>
        <div className="segmentos" role="radiogroup" aria-label="Período">
          {PERIODOS.map(([d, rotulo]) => (
            <button key={d} type="button" role="radio" aria-checked={dias === d} className={dias === d ? 'ativo' : ''} onClick={() => setDias(d)}>{rotulo}</button>
          ))}
        </div>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por usuário, computador ou descrição" aria-label="Buscar" />
        <button className="botao">Buscar</button>
        {sessao.ehSuper && (
          <label className="marcador"><input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} /> Todas as empresas</label>
        )}
      </form>
      {erroCarga && <p className="aviso-pagina">{erroCarga}</p>}
      {!lista ? (
        <p className="vazio">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="vazio">Nenhum evento no período.</p>
      ) : (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Usuário</th>
                <th>Computador</th>
                <th>Ação</th>
                <th>Descrição</th>
                {todas && <th>Empresa</th>}
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{dataHora(e.criado_em)}</td>
                  <td>{e.usuario_nome}</td>
                  <td>{e.estacao}</td>
                  <td className="nowrap">{e.acao} {e.entidade}</td>
                  <td>{e.descricao}</td>
                  {todas && <td>{e.empresas?.nome ?? ''}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
