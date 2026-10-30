import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { moeda, numeroBR } from '@shared/numeros'
import { dataBR, hojeLocal, nomeCiclo, plural, situacaoLicenca, somarMeses } from '@shared/licenca'
import { Campo, Modal } from '../Modal.jsx'
import { mensagem } from '../util.js'

const api = () => window.parallello
const SITUACAO = { bloqueada: 'Bloqueada', atrasada: 'Atrasada', vencendo: 'Vencendo', em_dia: 'Em dia', sem_cobranca: 'Sem cobrança' }
const ORDEM = { bloqueada: 0, atrasada: 1, vencendo: 2, em_dia: 3, sem_cobranca: 4 }
const valorTexto = (n) => Number(n || 0).toFixed(2).replace('.', ',')

/**
 * Cobrança da licença do Parallello (mensal, trimestral...). Vencida além da tolerância, a empresa
 * fica bloqueada (ninguém entra) até a baixa do pagamento. Só o super administrador.
 */
export function Cobranca({ avisar }) {
  const [lista, setLista] = useState(null)
  const [erroCarga, setErroCarga] = useState('')
  const [config, setConfig] = useState({ dias_aviso: 5, dias_tolerancia: 3, contato: '' })
  const [baixa, setBaixa] = useState(null)
  const [editando, setEditando] = useState(null)
  const [pagamentos, setPagamentos] = useState([])
  const [parametros, setParametros] = useState(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setErroCarga('')
    try {
      const [es, c] = await Promise.all([api().config.cobrancaEmpresas(), api().config.cobrancaConfig()])
      setLista(es)
      setConfig(c)
    } catch (e) {
      setErroCarga(mensagem(e))
      setLista([])
    }
  }, [avisar])
  useEffect(() => {
    void carregar()
  }, [carregar])

  const hoje = hojeLocal()
  const linhas = useMemo(
    () =>
      (lista ?? [])
        .map((e) => ({ ...e, sit: situacaoLicenca(e.licenca_vencimento, config.dias_aviso, config.dias_tolerancia, hoje) }))
        .sort((a, b) => ORDEM[a.sit.estado] - ORDEM[b.sit.estado] || (a.licenca_vencimento ?? '').localeCompare(b.licenca_vencimento ?? '') || a.nome.localeCompare(b.nome)),
    [lista, config, hoje]
  )
  const receitaMensal = linhas.filter((l) => l.sit.estado !== 'sem_cobranca').reduce((s, l) => s + l.licenca_valor / l.licenca_ciclo_meses, 0)
  const emAberto = linhas.filter((l) => l.sit.estado === 'atrasada' || l.sit.estado === 'bloqueada').reduce((s, l) => s + l.licenca_valor, 0)

  async function executar(fn) {
    setSalvando(true)
    try {
      await fn()
    } catch (e) {
      avisar(mensagem(e), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  const darBaixa = () =>
    executar(async () => {
      const novo = await api().config.registrarPagamento({ empresaId: baixa.e.id, pagoEm: baixa.pagoEm, valor: numeroBR(baixa.valor), forma: baixa.forma, obs: baixa.obs.trim() })
      avisar(`Pagamento de ${baixa.e.nome} registrado. Próximo vencimento: ${dataBR(novo)}.`)
      setBaixa(null)
      await carregar()
    })

  async function abrirEdicao(e) {
    setEditando({ e, valor: valorTexto(e.licenca_valor), ciclo: e.licenca_ciclo_meses, vencimento: e.licenca_vencimento ?? '', semCobranca: !e.licenca_vencimento, obs: e.licenca_obs ?? '' })
    setPagamentos([])
    try {
      setPagamentos(await api().config.pagamentos(e.id))
    } catch (err) {
      avisar(mensagem(err), 'erro')
    }
  }
  const salvarEdicao = () =>
    executar(async () => {
      await api().config.alterarLicenca(editando.e.id, {
        licenca_valor: numeroBR(editando.valor),
        licenca_ciclo_meses: Number(editando.ciclo),
        licenca_vencimento: editando.semCobranca ? null : editando.vencimento || null,
        licenca_obs: editando.obs.trim(),
      })
      avisar(`Licença de ${editando.e.nome} salva.`)
      setEditando(null)
      await carregar()
    })
  const estornar = (p) =>
    executar(async () => {
      if (!confirm(`Estornar o pagamento de ${dataBR(p.pago_em)} (${moeda(p.valor)})? O vencimento volta para ${p.vencimento_anterior ? dataBR(p.vencimento_anterior) : 'sem data'}.`)) return
      const volta = await api().config.estornarPagamento(p.id)
      avisar('Pagamento estornado.')
      setEditando({ ...editando, vencimento: volta ?? '', semCobranca: !volta })
      setPagamentos(await api().config.pagamentos(editando.e.id))
      await carregar()
    })
  const salvarParametros = () =>
    executar(async () => {
      const d = { dias_aviso: Number(parametros.dias_aviso) || 0, dias_tolerancia: Number(parametros.dias_tolerancia) || 0, contato: parametros.contato.trim() }
      await api().config.salvarCobrancaConfig(d)
      setConfig(d)
      setParametros(null)
      avisar('Parâmetros da cobrança salvos.')
    })

  return (
    <section>
      <header className="pagina-cabeca">
        <div>
          <h1>Cobrança</h1>
          <p>
            Licença de cada empresa. O aviso aparece {plural(config.dias_aviso, 'dia', 'dias')} antes do vencimento e o acesso é
            bloqueado depois de {plural(config.dias_tolerancia, 'dia', 'dias')} de atraso.
          </p>
        </div>
        <div className="pagina-acoes">
          <button className="botao" onClick={() => setParametros({ ...config })}>Parâmetros</button>
        </div>
      </header>

      <div className="numeros">
        <div><small>Receita por mês</small><b>{moeda(receitaMensal)}</b></div>
        <div><small>Em atraso</small><b>{moeda(emAberto)}</b></div>
        <div><small>Empresas</small><b>{linhas.length}</b></div>
      </div>

      {erroCarga && <p className="aviso-pagina">{erroCarga}</p>}
      {!lista ? (
        <p className="vazio">Carregando…</p>
      ) : (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Valor</th>
                <th>Vencimento</th>
                <th>Último pagamento</th>
                <th>Situação</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id}>
                  <td><b>{l.nome}</b></td>
                  <td>{l.sit.estado === 'sem_cobranca' ? '—' : <>{moeda(l.licenca_valor)} <small>{nomeCiclo(l.licenca_ciclo_meses).toLowerCase()}</small></>}</td>
                  <td>{dataBR(l.licenca_vencimento) || '—'}</td>
                  <td>{dataBR(l.ultimo_pagamento) || '—'}</td>
                  <td><span className={`situacao ${l.sit.estado}`}>{SITUACAO[l.sit.estado]}</span></td>
                  <td className="col-acoes">
                    {l.sit.estado !== 'sem_cobranca' && (
                      <button className="link" onClick={() => setBaixa({ e: l, pagoEm: hoje, valor: valorTexto(l.licenca_valor), forma: 'PIX', obs: '' })}>Dar baixa</button>
                    )}
                    <button className="link" onClick={() => abrirEdicao(l)}>Licença</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {baixa && (
        <Modal
          titulo={`Dar baixa: ${baixa.e.nome}`}
          aoFechar={() => setBaixa(null)}
          rodape={
            <>
              <button className="botao" onClick={() => setBaixa(null)}>Cancelar</button>
              <button className="botao primario" onClick={darBaixa} disabled={salvando}>Registrar pagamento</button>
            </>
          }
        >
          <div className="formulario">
            <Campo rotulo="Pago em"><input type="date" value={baixa.pagoEm} onChange={(e) => setBaixa({ ...baixa, pagoEm: e.target.value })} /></Campo>
            <Campo rotulo="Valor (R$)"><input value={baixa.valor} onChange={(e) => setBaixa({ ...baixa, valor: e.target.value })} /></Campo>
            <Campo rotulo="Forma">
              <select value={baixa.forma} onChange={(e) => setBaixa({ ...baixa, forma: e.target.value })}>
                {['PIX', 'Boleto', 'Transferência', 'Dinheiro', 'Cartão', 'Outro'].map((f) => <option key={f}>{f}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Observação"><input value={baixa.obs} onChange={(e) => setBaixa({ ...baixa, obs: e.target.value })} /></Campo>
            <p>O vencimento avança para {dataBR(somarMeses(baixa.e.licenca_vencimento ?? baixa.pagoEm, baixa.e.licenca_ciclo_meses))}.</p>
          </div>
        </Modal>
      )}

      {editando && (
        <Modal
          titulo={`Licença de ${editando.e.nome}`}
          largura={560}
          aoFechar={() => setEditando(null)}
          rodape={
            <>
              <button className="botao" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="botao primario" onClick={salvarEdicao} disabled={salvando}>Salvar</button>
            </>
          }
        >
          <div className="formulario">
            <label className="marcador">
              <input type="checkbox" checked={editando.semCobranca} onChange={(e) => setEditando({ ...editando, semCobranca: e.target.checked })} /> Sem cobrança (nunca bloqueia)
            </label>
            {!editando.semCobranca && (
              <>
                <Campo rotulo="Valor (R$)"><input value={editando.valor} onChange={(e) => setEditando({ ...editando, valor: e.target.value })} /></Campo>
                <Campo rotulo="Ciclo">
                  <select value={editando.ciclo} onChange={(e) => setEditando({ ...editando, ciclo: Number(e.target.value) })}>
                    {[1, 2, 3, 6, 12].map((m) => <option key={m} value={m}>{nomeCiclo(m)}</option>)}
                  </select>
                </Campo>
                <Campo rotulo="Vencimento"><input type="date" value={editando.vencimento} onChange={(e) => setEditando({ ...editando, vencimento: e.target.value })} /></Campo>
              </>
            )}
            <Campo rotulo="Observação"><input value={editando.obs} onChange={(e) => setEditando({ ...editando, obs: e.target.value })} /></Campo>
            <h3 className="subtitulo">Pagamentos</h3>
            {pagamentos.length === 0 ? (
              <p>Nenhum pagamento registrado.</p>
            ) : (
              <ul className="pagamentos">
                {pagamentos.map((p, i) => (
                  <li key={p.id}>
                    <span>{dataBR(p.pago_em)} · {moeda(p.valor)} · {p.forma}{p.obs ? ` · ${p.obs}` : ''}</span>
                    {i === 0 && <button className="link" onClick={() => estornar(p)}>Estornar</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Modal>
      )}

      {parametros && (
        <Modal
          titulo="Parâmetros da cobrança"
          aoFechar={() => setParametros(null)}
          rodape={
            <>
              <button className="botao" onClick={() => setParametros(null)}>Cancelar</button>
              <button className="botao primario" onClick={salvarParametros} disabled={salvando}>Salvar</button>
            </>
          }
        >
          <div className="formulario">
            <Campo rotulo="Avisar quantos dias antes do vencimento"><input value={parametros.dias_aviso} onChange={(e) => setParametros({ ...parametros, dias_aviso: e.target.value })} /></Campo>
            <Campo rotulo="Bloquear depois de quantos dias de atraso"><input value={parametros.dias_tolerancia} onChange={(e) => setParametros({ ...parametros, dias_tolerancia: e.target.value })} /></Campo>
            <Campo rotulo="Contato do suporte (aparece nos avisos)"><input value={parametros.contato} onChange={(e) => setParametros({ ...parametros, contato: e.target.value })} /></Campo>
          </div>
        </Modal>
      )}
    </section>
  )
}
