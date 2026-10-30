import React, { useState } from 'react'
import { Conexoes } from './Conexoes.jsx'
import { Usuarios } from './Usuarios.jsx'
import { Empresas } from './Empresas.jsx'
import { Cobranca } from './Cobranca.jsx'
import { Eventos } from './Eventos.jsx'

const api = () => window.parallello

/**
 * Configuração do Parallello (Ctrl+Shift+B + senha master; abre sozinha ao entrar como administrador).
 * Modelos de pedido e aparência continuam no Gerar Pré-Venda.
 */
export function Configuracao({ sessao, avisar }) {
  const abas = [
    { id: 'conexao', nome: 'Conexão com o banco', mostrar: true },
    { id: 'usuarios', nome: 'Usuários', mostrar: true },
    { id: 'empresas', nome: 'Empresas', mostrar: sessao.ehSuper },
    { id: 'cobranca', nome: 'Cobrança', mostrar: sessao.ehSuper },
    { id: 'eventos', nome: 'Eventos do sistema', mostrar: true },
  ].filter((a) => a.mostrar)
  const [aba, setAba] = useState('conexao')

  return (
    <main className="config">
      <nav className="config-nav" aria-label="Configuração">
        <p className="config-titulo">Configuração</p>
        {sessao.ehSuper && sessao.empresas.length > 0 && (
          <label className="campo config-empresa">
            <span className="campo-rotulo">Empresa</span>
            <select value={sessao.empresaAtual?.id ?? ''} onChange={(e) => api().escolherEmpresa(e.target.value)}>
              {sessao.empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </label>
        )}
        {!sessao.ehSuper && sessao.empresaAtual && <p className="config-empresa-fixa">{sessao.empresaAtual.nome}</p>}
        {abas.map((a) => (
          <button key={a.id} className={aba === a.id ? 'ativa' : ''} aria-current={aba === a.id ? 'page' : undefined} onClick={() => setAba(a.id)}>
            {a.nome}
          </button>
        ))}
        <button className="config-trancar" onClick={() => api().config.fechar()}>Trancar a configuração</button>
      </nav>
      <div className="config-conteudo" key={sessao.empresaAtual?.id ?? 'sem-empresa'}>
        {aba === 'conexao' && <Conexoes avisar={avisar} />}
        {aba === 'usuarios' && <Usuarios sessao={sessao} avisar={avisar} />}
        {aba === 'empresas' && sessao.ehSuper && <Empresas sessao={sessao} avisar={avisar} />}
        {aba === 'cobranca' && sessao.ehSuper && <Cobranca avisar={avisar} />}
        {aba === 'eventos' && <Eventos sessao={sessao} avisar={avisar} />}
      </div>
    </main>
  )
}
