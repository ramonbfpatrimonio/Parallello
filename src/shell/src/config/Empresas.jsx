import React, { useCallback, useEffect, useState } from 'react'
import { formatarCnpj, moeda } from '@shared/numeros'
import { CATALOGO } from '../../../modulos/catalogo.js'
import { Campo, Modal } from '../Modal.jsx'
import { mensagem } from '../util.js'

const api = () => window.parallello

/** Empresas (clientes do Parallello): cadastro, bloqueio e módulos contratados. Só o super administrador. */
export function Empresas({ sessao, avisar }) {
  const [lista, setLista] = useState(null)
  const [erroCarga, setErroCarga] = useState('')
  const [nova, setNova] = useState(false)
  const [editando, setEditando] = useState(null)
  const [contrato, setContrato] = useState(null) // { empresa, modulos: Set | null }

  const carregar = useCallback(async () => {
    setErroCarga('')
    try {
      setLista(await api().config.empresas())
    } catch (e) {
      setErroCarga(mensagem(e))
      setLista([])
    }
  }, [avisar])
  useEffect(() => {
    void carregar()
  }, [carregar])

  const modulosDe = (id) => sessao.empresas.find((e) => e.id === id)?.modulos ?? null

  async function bloquear(e) {
    if (!confirm(e.ativa ? `Bloquear ${e.nome}? Ninguém da empresa entra até liberar de novo.` : `Liberar ${e.nome}?`)) return
    try {
      await api().config.alterarEmpresa(e.id, { ativa: !e.ativa })
      avisar(e.ativa ? `${e.nome} bloqueada.` : `${e.nome} liberada.`)
      await carregar()
    } catch (err) {
      avisar(mensagem(err), 'erro')
    }
  }

  async function salvarContrato() {
    try {
      await api().config.modulosEmpresa(contrato.empresa.id, contrato.modulos === null ? null : [...contrato.modulos])
      avisar(`Módulos de ${contrato.empresa.nome} salvos.`)
      setContrato(null)
    } catch (e) {
      avisar(mensagem(e), 'erro')
    }
  }

  return (
    <section>
      <header className="pagina-cabeca">
        <div>
          <h1>Empresas</h1>
          <p>Clientes que usam o Parallello. Cada empresa só vê os próprios usuários, conexões e histórico.</p>
        </div>
        <div className="pagina-acoes">
          <button className="botao primario" onClick={() => setNova(true)}>Nova empresa</button>
        </div>
      </header>

      {erroCarga && <p className="aviso-pagina">{erroCarga}</p>}
      {!lista ? (
        <p className="vazio">Carregando…</p>
      ) : (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Usuários</th>
                <th>Pré-vendas no mês</th>
                <th>Módulos contratados</th>
                <th>Situação</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => {
                const mods = modulosDe(e.id)
                return (
                  <tr key={e.id} className={e.ativa ? '' : 'inativo'}>
                    <td>
                      <b>{e.nome}</b>
                      <small>{e.cnpj ? formatarCnpj(e.cnpj) : 'sem CNPJ'}{sessao.empresaAtual?.id === e.id ? ' · em uso' : ''}</small>
                    </td>
                    <td>{e.usuarios}</td>
                    <td>{e.prevendas_mes} <small>{moeda(e.total_mes)}</small></td>
                    <td>{mods === null ? 'Todos' : mods.length === 0 ? 'Nenhum' : mods.map((m) => CATALOGO.find((c) => c.id === m)?.nome ?? m).join(', ')}</td>
                    <td>{e.ativa ? 'Ativa' : 'Bloqueada'}</td>
                    <td className="col-acoes">
                      {sessao.empresaAtual?.id !== e.id && <button className="link" onClick={() => api().escolherEmpresa(e.id)}>Usar esta</button>}
                      <button className="link" onClick={() => setContrato({ empresa: e, modulos: mods === null ? null : new Set(mods) })}>Módulos</button>
                      <button className="link" onClick={() => setEditando(e)}>Editar</button>
                      <button className="link" onClick={() => bloquear(e)}>{e.ativa ? 'Bloquear' : 'Liberar'}</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {nova && <NovaEmpresa aoFechar={() => setNova(false)} aoSalvar={async (nome) => { setNova(false); await carregar(); avisar(`Empresa ${nome} criada. O administrador dela já pode entrar no Parallello.`) }} />}
      {editando && <EditarEmpresa e={editando} aoFechar={() => setEditando(null)} aoSalvar={async () => { setEditando(null); await carregar(); avisar('Empresa salva.') }} />}
      {contrato && (
        <Modal
          titulo={`Módulos contratados por ${contrato.empresa.nome}`}
          aoFechar={() => setContrato(null)}
          rodape={
            <>
              <button className="botao" onClick={() => setContrato(null)}>Cancelar</button>
              <button className="botao primario" onClick={salvarContrato}>Salvar</button>
            </>
          }
        >
          <p>O administrador da empresa e os usuários dela só conseguem usar o que estiver marcado.</p>
          <div className="lista-marcadores">
            <label className="marcador">
              <input type="checkbox" checked={contrato.modulos === null} onChange={(ev) => setContrato({ ...contrato, modulos: ev.target.checked ? null : new Set(CATALOGO.map((m) => m.id)) })} />
              Todos (inclusive os que forem criados)
            </label>
            {CATALOGO.map((m) => (
              <label key={m.id} className="marcador">
                <input
                  type="checkbox"
                  disabled={contrato.modulos === null}
                  checked={contrato.modulos === null || contrato.modulos.has(m.id)}
                  onChange={() => {
                    const s = new Set(contrato.modulos)
                    s.has(m.id) ? s.delete(m.id) : s.add(m.id)
                    setContrato({ ...contrato, modulos: s })
                  }}
                />
                {m.nome}
              </label>
            ))}
          </div>
        </Modal>
      )}
    </section>
  )
}

function NovaEmpresa({ aoFechar, aoSalvar }) {
  const [f, setF] = useState({ nome: '', cnpj: '', admin_nome: '', admin_usuario: '', admin_senha: '', retencao_meses: 24 })
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function salvar(e) {
    e.preventDefault()
    setErro('')
    setSalvando(true)
    try {
      await api().config.criarEmpresa({ ...f, cnpj: f.cnpj.replace(/\D/g, ''), retencao_meses: Number(f.retencao_meses) || 24 })
      await aoSalvar(f.nome)
    } catch (err) {
      setErro(mensagem(err))
    } finally {
      setSalvando(false)
    }
  }
  return (
    <Modal
      titulo="Nova empresa"
      aoFechar={aoFechar}
      largura={520}
      rodape={
        <>
          <button className="botao" onClick={aoFechar}>Cancelar</button>
          <button className="botao primario" form="f-empresa" disabled={salvando}>{salvando ? 'Criando…' : 'Criar empresa'}</button>
        </>
      }
    >
      <form id="f-empresa" onSubmit={salvar} className="formulario">
        <Campo rotulo="Nome"><input value={f.nome} onChange={set('nome')} autoFocus /></Campo>
        <Campo rotulo="CNPJ"><input value={f.cnpj} onChange={set('cnpj')} /></Campo>
        <Campo rotulo="Histórico do Gerar Pré-Venda guardado por (meses)"><input value={f.retencao_meses} onChange={set('retencao_meses')} /></Campo>
        <p>Administrador da empresa (entra no Parallello e cadastra os usuários dela):</p>
        <Campo rotulo="Nome do administrador"><input value={f.admin_nome} onChange={set('admin_nome')} /></Campo>
        <Campo rotulo="Usuário para entrar" dica="Ex.: maria.hage. Precisa ser único no Parallello."><input value={f.admin_usuario} onChange={set('admin_usuario')} spellCheck={false} /></Campo>
        <Campo rotulo="Senha" dica="Pelo menos 6 caracteres."><input type="password" value={f.admin_senha} onChange={set('admin_senha')} /></Campo>
        {erro && <p className="erro">{erro}</p>}
      </form>
    </Modal>
  )
}

function EditarEmpresa({ e, aoFechar, aoSalvar }) {
  const [f, setF] = useState({ nome: e.nome, cnpj: e.cnpj ?? '', retencao_meses: e.retencao_meses })
  const [erro, setErro] = useState('')
  async function salvar(ev) {
    ev.preventDefault()
    try {
      await api().config.alterarEmpresa(e.id, { nome: f.nome.trim(), cnpj: f.cnpj.replace(/\D/g, ''), retencao_meses: Number(f.retencao_meses) || 24 })
      await aoSalvar()
    } catch (err) {
      setErro(mensagem(err))
    }
  }
  return (
    <Modal
      titulo={`Editar ${e.nome}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="botao" onClick={aoFechar}>Cancelar</button>
          <button className="botao primario" form="f-editar-empresa">Salvar</button>
        </>
      }
    >
      <form id="f-editar-empresa" onSubmit={salvar} className="formulario">
        <Campo rotulo="Nome"><input value={f.nome} onChange={(ev) => setF({ ...f, nome: ev.target.value })} autoFocus /></Campo>
        <Campo rotulo="CNPJ"><input value={f.cnpj} onChange={(ev) => setF({ ...f, cnpj: ev.target.value })} /></Campo>
        <Campo rotulo="Histórico do Gerar Pré-Venda guardado por (meses)"><input value={f.retencao_meses} onChange={(ev) => setF({ ...f, retencao_meses: ev.target.value })} /></Campo>
        {erro && <p className="erro">{erro}</p>}
      </form>
    </Modal>
  )
}
