import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CATALOGO } from '../../modulos/catalogo.js'
import { ICONES } from './icones.js'
import { Campo, Modal } from './Modal.jsx'
import { mensagem, NOME_PAPEL } from './util.js'

const api = () => window.parallello
const iguais = (a, b) => [...a].sort().join(',') === [...b].sort().join(',')

/**
 * Liberar módulos: quem pode abrir cada sistema.
 * Começa em branco: ninguém (nem o administrador) tem módulo até ser liberado aqui.
 */
export function Modulos({ sessao, avisar }) {
  const [dados, setDados] = useState(null) // { usuarios, contratados }
  const [marcados, setMarcados] = useState({}) // usuarioId -> Set de módulos (edição)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [novo, setNovo] = useState(false)
  const [editando, setEditando] = useState(null)
  const [senhaDe, setSenhaDe] = useState(null)
  const [contrato, setContrato] = useState(null) // edição dos módulos contratados (super)

  const carregar = useCallback(async () => {
    setErro('')
    try {
      const r = await api().usuarios.listar()
      setDados(r)
      setMarcados(Object.fromEntries(r.usuarios.map((u) => [u.id, new Set(u.modulos ?? [])])))
      setContrato(r.contratados === null ? null : new Set(r.contratados))
    } catch (e) {
      setErro(mensagem(e))
      setDados({ usuarios: [], contratados: null })
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar, sessao.empresaAtual?.id, sessao.modo])

  const contratados = dados?.contratados ?? null
  const podeMarcar = (id) => sessao.ehSuper || contratados === null || contratados.includes(id)
  const alterados = useMemo(
    () => (dados?.usuarios ?? []).filter((u) => marcados[u.id] && !iguais(marcados[u.id], u.modulos ?? [])),
    [dados, marcados]
  )
  const contratoAlterado =
    !!sessao.ehSuper &&
    !!dados &&
    sessao.modo !== 'master' &&
    sessao.modo !== 'offline' &&
    ((contrato === null) !== (contratados === null) || (contrato !== null && contratados !== null && !iguais(contrato, contratados)))

  function alternar(usuarioId, moduloId) {
    setMarcados((m) => {
      const s = new Set(m[usuarioId])
      s.has(moduloId) ? s.delete(moduloId) : s.add(moduloId)
      return { ...m, [usuarioId]: s }
    })
  }
  function todosDoUsuario(usuarioId, marcar) {
    setMarcados((m) => ({ ...m, [usuarioId]: new Set(marcar ? CATALOGO.filter((x) => podeMarcar(x.id)).map((x) => x.id) : []) }))
  }

  async function salvar() {
    setSalvando(true)
    try {
      if (contratoAlterado) await api().definirModulosEmpresa(contrato === null ? null : [...contrato])
      for (const u of alterados) await api().usuarios.definirModulos(u.id, [...marcados[u.id]])
      await carregar()
      avisar('Módulos salvos.')
    } catch (e) {
      avisar(mensagem(e), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  const semNuvem = sessao.modo === 'master' || sessao.modo === 'offline'
  const usuarios = dados?.usuarios ?? []

  return (
    <main className="pagina">
      <header className="pagina-cabeca">
        <div>
          <h1>Liberar módulos</h1>
          <p>
            Marque os sistemas que cada usuário pode abrir e clique em <b>Salvar</b>.
            {sessao.empresaAtual ? <> Empresa: <b>{sessao.empresaAtual.nome}</b>.</> : null}
          </p>
        </div>
        <div className="pagina-acoes">
          {!semNuvem && (
            <button className="botao" onClick={() => setNovo(true)}>
              Novo usuário
            </button>
          )}
          <button className="botao primario" onClick={salvar} disabled={salvando || (!alterados.length && !contratoAlterado)}>
            {salvando ? 'Salvando…' : alterados.length + (contratoAlterado ? 1 : 0) > 0 ? `Salvar (${alterados.length + (contratoAlterado ? 1 : 0)})` : 'Salvar'}
          </button>
        </div>
      </header>

      {semNuvem && (
        <p className="aviso-pagina">
          {sessao.modo === 'master'
            ? 'Sem conexão com a nuvem: aqui aparece só o administrador deste computador. Os usuários da nuvem aparecem quando houver internet.'
            : 'Sem internet: a liberação de módulos precisa da nuvem.'}
        </p>
      )}
      {erro && <p className="erro">{erro}</p>}

      {sessao.ehSuper && !semNuvem && sessao.empresaAtual && (
        <section className="contrato">
          <h2>Módulos contratados por {sessao.empresaAtual.nome}</h2>
          <p>O administrador da empresa só consegue liberar o que estiver contratado.</p>
          <div className="contrato-linha">
            <label className="marcador">
              <input type="checkbox" checked={contrato === null} onChange={(e) => setContrato(e.target.checked ? null : new Set(CATALOGO.map((m) => m.id)))} />
              Todos
            </label>
            {CATALOGO.map((m) => (
              <label key={m.id} className="marcador">
                <input
                  type="checkbox"
                  disabled={contrato === null}
                  checked={contrato === null || contrato.has(m.id)}
                  onChange={() =>
                    setContrato((c) => {
                      const s = new Set(c)
                      s.has(m.id) ? s.delete(m.id) : s.add(m.id)
                      return s
                    })
                  }
                />
                {m.nome}
              </label>
            ))}
          </div>
        </section>
      )}

      {!dados ? (
        <p className="vazio">Carregando…</p>
      ) : usuarios.length === 0 ? (
        <p className="vazio">{sessao.empresaAtual ? 'Nenhum usuário nesta empresa. Clique em "Novo usuário".' : 'Escolha a empresa na barra superior.'}</p>
      ) : (
        <div className="tabela-rolagem">
          <table className="tabela-modulos">
            <thead>
              <tr>
                <th className="col-usuario">Usuário</th>
                {CATALOGO.map((m) => (
                  <th key={m.id} className="col-modulo" title={m.nome}>
                    <img src={ICONES[m.id]} alt="" />
                    <span>{m.nome}</span>
                  </th>
                ))}
                <th className="col-acoes" />
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const sel = marcados[u.id] ?? new Set()
                const mudou = alterados.includes(u)
                return (
                  <tr key={u.id} className={(u.ativo ? '' : 'inativo ') + (mudou ? 'alterado' : '')}>
                    <td className="col-usuario">
                      <b>{u.nome}</b>
                      <small>
                        {u.usuario} · {NOME_PAPEL[u.papel] ?? u.papel}
                        {!u.ativo && ' · desativado'}
                      </small>
                    </td>
                    {CATALOGO.map((m) => (
                      <td key={m.id} className="col-modulo">
                        <input
                          type="checkbox"
                          aria-label={`${m.nome} para ${u.nome}`}
                          checked={sel.has(m.id)}
                          disabled={!podeMarcar(m.id)}
                          title={podeMarcar(m.id) ? undefined : 'Módulo não contratado pela empresa'}
                          onChange={() => alternar(u.id, m.id)}
                        />
                      </td>
                    ))}
                    <td className="col-acoes">
                      <button className="link" onClick={() => todosDoUsuario(u.id, sel.size === 0)}>
                        {sel.size === 0 ? 'Marcar todos' : 'Desmarcar'}
                      </button>
                      {!u.local && (
                        <>
                          {(u.id !== sessao.perfil?.id || sessao.ehSuper) && (
                            <button className="link" onClick={() => setEditando(u)}>
                              Editar
                            </button>
                          )}
                          <button className="link" onClick={() => setSenhaDe(u)}>
                            Senha
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {novo && <NovoUsuario aoFechar={() => setNovo(false)} aoSalvar={async () => { setNovo(false); await carregar(); avisar('Usuário criado.') }} podeMarcar={podeMarcar} />}
      {editando && <EditarUsuario u={editando} eu={sessao.perfil?.id} aoFechar={() => setEditando(null)} aoSalvar={async () => { setEditando(null); await carregar(); avisar('Usuário salvo.') }} />}
      {senhaDe && <TrocarSenha u={senhaDe} aoFechar={() => setSenhaDe(null)} aoSalvar={() => { setSenhaDe(null); avisar('Senha alterada.') }} />}
    </main>
  )
}

function NovoUsuario({ aoFechar, aoSalvar, podeMarcar }) {
  const [f, setF] = useState({ nome: '', usuario: '', senha: '', papel: 'operador', modulos: new Set() })
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function salvar(e) {
    e.preventDefault()
    setErro('')
    setSalvando(true)
    try {
      await api().usuarios.criar({ ...f, modulos: [...f.modulos] })
      await aoSalvar()
    } catch (err) {
      setErro(mensagem(err))
    } finally {
      setSalvando(false)
    }
  }
  return (
    <Modal
      titulo="Novo usuário"
      aoFechar={aoFechar}
      largura={520}
      rodape={
        <>
          <button className="botao" onClick={aoFechar}>Cancelar</button>
          <button className="botao primario" form="f-novo" disabled={salvando}>{salvando ? 'Criando…' : 'Criar usuário'}</button>
        </>
      }
    >
      <form id="f-novo" onSubmit={salvar} className="formulario">
        <Campo rotulo="Nome"><input value={f.nome} onChange={set('nome')} autoFocus /></Campo>
        <Campo rotulo="Usuário (para entrar)" dica="Sem espaços, ex.: joao ou joao.hage. Precisa ser único no Parallello.">
          <input value={f.usuario} onChange={set('usuario')} spellCheck={false} />
        </Campo>
        <Campo rotulo="Senha" dica="Pelo menos 6 caracteres."><input type="password" value={f.senha} onChange={set('senha')} /></Campo>
        <Campo rotulo="Papel">
          <select value={f.papel} onChange={set('papel')}>
            <option value="operador">Operador: usa os sistemas liberados</option>
            <option value="admin">Administrador: também cadastra usuários e libera módulos</option>
          </select>
        </Campo>
        <fieldset className="campo">
          <legend className="campo-rotulo">Módulos</legend>
          <div className="lista-marcadores">
            {CATALOGO.map((m) => (
              <label key={m.id} className="marcador">
                <input
                  type="checkbox"
                  disabled={!podeMarcar(m.id)}
                  checked={f.modulos.has(m.id)}
                  onChange={() => {
                    const s = new Set(f.modulos)
                    s.has(m.id) ? s.delete(m.id) : s.add(m.id)
                    setF({ ...f, modulos: s })
                  }}
                />
                {m.nome}
              </label>
            ))}
          </div>
        </fieldset>
        {erro && <p className="erro">{erro}</p>}
      </form>
    </Modal>
  )
}

function EditarUsuario({ u, eu, aoFechar, aoSalvar }) {
  const [f, setF] = useState({ nome: u.nome, papel: u.papel, ativo: u.ativo })
  const [erro, setErro] = useState('')
  const proprio = u.id === eu
  async function salvar(e) {
    e.preventDefault()
    setErro('')
    try {
      await api().usuarios.alterar(u.id, proprio ? { nome: f.nome } : f)
      await aoSalvar()
    } catch (err) {
      setErro(mensagem(err))
    }
  }
  return (
    <Modal
      titulo={`Editar ${u.nome}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="botao" onClick={aoFechar}>Cancelar</button>
          <button className="botao primario" form="f-editar">Salvar</button>
        </>
      }
    >
      <form id="f-editar" onSubmit={salvar} className="formulario">
        <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} autoFocus /></Campo>
        <Campo rotulo="Usuário"><input value={u.usuario} disabled /></Campo>
        {u.papel !== 'super_admin' && !proprio && (
          <>
            <Campo rotulo="Papel">
              <select value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value })}>
                <option value="operador">Operador</option>
                <option value="admin">Administrador</option>
              </select>
            </Campo>
            <label className="marcador">
              <input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Usuário ativo (desmarcado: não entra mais)
            </label>
          </>
        )}
        {erro && <p className="erro">{erro}</p>}
      </form>
    </Modal>
  )
}

function TrocarSenha({ u, aoFechar, aoSalvar }) {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  async function salvar(e) {
    e.preventDefault()
    setErro('')
    try {
      await api().usuarios.trocarSenha(u.id, senha)
      aoSalvar()
    } catch (err) {
      setErro(mensagem(err))
    }
  }
  return (
    <Modal
      titulo={`Nova senha de ${u.nome}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="botao" onClick={aoFechar}>Cancelar</button>
          <button className="botao primario" form="f-senha">Trocar senha</button>
        </>
      }
    >
      <form id="f-senha" onSubmit={salvar} className="formulario">
        <Campo rotulo="Nova senha" dica="Pelo menos 6 caracteres."><input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus /></Campo>
        {erro && <p className="erro">{erro}</p>}
      </form>
    </Modal>
  )
}
