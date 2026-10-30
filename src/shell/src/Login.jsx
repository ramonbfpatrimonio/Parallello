import React, { useState } from 'react'
import marca from './assets/marca.svg'
import { mensagem } from './util.js'

const api = () => window.parallello

export function Login({ ultimoUsuario, versao }) {
  const [usuario, setUsuario] = useState(ultimoUsuario || '')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [entrando, setEntrando] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setErro('')
    setEntrando(true)
    try {
      await api().entrar(usuario, senha)
    } catch (err) {
      setErro(mensagem(err))
      setSenha('')
    } finally {
      setEntrando(false)
    }
  }

  return (
    <main className="login">
      <section className="login-marca" aria-hidden="true">
        <img src={marca} alt="" className="login-barras" />
      </section>
      <section className="login-lado">
        <form className="login-form" onSubmit={entrar}>
          <div className="login-nome">
            <img src={marca} alt="" />
            <span>Parallello</span>
          </div>
          <p className="login-texto">Entre com o seu usuário. O mesmo acesso vale para todos os sistemas liberados para você.</p>
          <label className="campo">
            <span className="campo-rotulo">Usuário</span>
            <input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus={!usuario} autoComplete="username" spellCheck={false} />
          </label>
          <label className="campo">
            <span className="campo-rotulo">Senha</span>
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus={!!usuario} autoComplete="current-password" />
          </label>
          {erro && (
            <p className="erro" role="alert">
              {erro}
            </p>
          )}
          <button className="botao primario largo" disabled={entrando || !usuario.trim() || !senha}>
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <p className="login-rodape">Parallello {versao}</p>
      </section>
    </main>
  )
}
