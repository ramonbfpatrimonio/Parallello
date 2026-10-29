import React, { useEffect, useState } from 'react'
import { CATALOGO } from '../../modulos/catalogo.js'
import { ICONES } from './icones.js'
import marca from './assets/marca.svg'

const api = () => window.parallello

function saudacao(agora = new Date()) {
  const h = agora.getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function dataPorExtenso(agora = new Date()) {
  const t = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function App() {
  const [estado, setEstado] = useState(null)

  useEffect(() => {
    api().estado().then(setEstado)
    return api().aoMudar(setEstado)
  }, [])

  if (!estado) return null
  const abertos = new Set(estado.abas)

  return (
    <div className="app">
      <Barra estado={estado} />
      {/* A tela inicial fica sempre por baixo; quando um sistema está à frente, a tela dele a cobre. */}
      <Inicio estado={estado} abertos={abertos} />
    </div>
  )
}

function Barra({ estado }) {
  const noInicio = estado.atual === null
  return (
    <header className="barra">
      <button
        className={'barra-marca' + (noInicio ? ' ativa' : '')}
        onClick={() => api().mostrar(null)}
        title="Tela inicial (Ctrl+Tab alterna entre as abas)"
      >
        <img src={marca} alt="" className="barra-marca-icone" />
        <span className="barra-marca-nome">Parallello</span>
      </button>

      <nav className="abas" aria-label="Sistemas abertos">
        {estado.abas.map((id) => {
          const m = CATALOGO.find((x) => x.id === id)
          const ativa = estado.atual === id
          return (
            <div key={id} className={'aba' + (ativa ? ' ativa' : '')} style={{ '--cor': m.cor }}>
              <button className="aba-abrir" onClick={() => api().mostrar(id)} aria-current={ativa ? 'page' : undefined}>
                <img src={ICONES[id]} alt="" />
                <span>{m.nome}</span>
              </button>
              <button className="aba-fechar" onClick={() => api().fechar(id)} title={`Fechar ${m.nome}`} aria-label={`Fechar ${m.nome}`}>
                <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" /></svg>
              </button>
            </div>
          )
        })}
      </nav>

      <Atualizacao a={estado.atualizacao} />
    </header>
  )
}

function Atualizacao({ a }) {
  if (a.tipo === 'disponivel') {
    return (
      <button className="pilula destaque" onClick={() => api().atualizacao.baixar()} title="Baixa em segundo plano; dá para continuar usando">
        Atualizar para {a.versao}
      </button>
    )
  }
  if (a.tipo === 'baixando') {
    return (
      <span className="pilula" role="status">
        <span className="pilula-barra"><span style={{ width: `${a.percentual}%` }} /></span>
        Baixando {a.percentual}%
      </span>
    )
  }
  if (a.tipo === 'pronta') {
    return (
      <button className="pilula destaque" onClick={() => api().atualizacao.instalar()} title="Fecha, instala e abre de novo em poucos segundos">
        Reiniciar e atualizar para {a.versao}
      </button>
    )
  }
  return null
}

function Inicio({ estado, abertos }) {
  const agora = new Date()
  return (
    <main className="inicio">
      <section className="cabeca">
        <h1>{saudacao(agora)}.</h1>
        <p className="cabeca-data">{dataPorExtenso(agora)}</p>
        <p className="cabeca-texto">Escolha um sistema. Os que você abrir ficam nas abas lá em cima, cada um do jeito que você deixou.</p>
      </section>

      <ul className="cards">
        {CATALOGO.map((m) => {
          const aberto = abertos.has(m.id)
          const erro = estado.erros[m.id]
          return (
            <li key={m.id}>
              <button className="card" style={{ '--cor': m.cor }} onClick={() => api().abrir(m.id)} disabled={!!erro}>
                <span className="card-logo">
                  <img src={ICONES[m.id]} alt="" />
                </span>
                {aberto && <span className="card-aberto">Aberto</span>}
                <span className="card-nome">{m.nome}</span>
                <span className="card-descricao">{m.descricao}</span>
                <span className="card-rodape">
                  <span className="card-faixa" aria-hidden="true" />
                  {erro ? 'Não abriu' : aberto ? 'Voltar para a aba' : 'Abrir'}
                </span>
              </button>
              {erro && (
                <p className="card-erro" role="alert">
                  {erro}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      <footer className="rodape">
        <span>Parallello {estado.versao}</span>
        <button className="link" onClick={() => api().abrirPastaDados()}>
          Abrir a pasta de dados
        </button>
      </footer>
    </main>
  )
}
