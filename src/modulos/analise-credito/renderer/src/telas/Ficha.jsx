import React, { useEffect, useState } from 'react';
import { ArrowLeft, Phone, Mail, CalendarDays, AlertTriangle, Wallet, CreditCard, ShoppingCart, ClipboardCheck, Save } from 'lucide-react';
import { api, fmtMoeda, fmtNum, fmtData, fmtDataHora, classePerfil, lsGet, lsSet, isoParaBr, useOrdenacao, montarPivot, MESES } from '../util.js';
import { Th, CabecalhoPagina, BotoesExportar } from '../componentes.jsx';
import { montarRelatorio } from '../relatorio.js';
import VendasMes from './VendasMes.jsx';

const SITUACOES = ['Aprovado', 'Aprovado parcial', 'Negado', 'Em análise'];

function Linha({ rotulo, valor, classe }) {
  return <div className="linha"><span>{rotulo}</span><b className={classe || ''}>{valor}</b></div>;
}

function fmtValorCriterio(v, unidade) {
  if (v === null || v === undefined) return 'sem dados';
  if (unidade === 'R$') return fmtMoeda(v);
  if (unidade === 'x') return `${fmtNum(v, 2)}x`;
  return `${fmtNum(v, unidade === 'dias' ? 1 : 0)} ${unidade}`;
}

const maxCriterio = (cr) => Math.max(Number(cr.padrao) || 0, ...cr.faixas.map((x) => Number(x.pontos) || 0));

export default function Ficha({ cliente: c, filtros, empresa, conexaoId, pontuacaoMaxima, onVoltar }) {
  const [regras, setRegras] = useState(null);
  const [decisoes, setDecisoes] = useState([]);
  const [msg, setMsg] = useState(null);
  const [vendasLinhas, setVendasLinhas] = useState(null);
  const prazos = [c.Prazo1, c.Prazo2, c.Prazo3, c.Prazo4, c.Prazo5].filter((p) => p && p !== 'N/A');
  const [form, setForm] = useState({
    situacao: 'Aprovado',
    limiteAprovado: c.LimiteSugerido ?? 0,
    prazoAprovado: prazos[prazos.length - 1] || '',
    responsavel: lsGet('ac.responsavel', ''),
    observacao: ''
  });
  const { ordenadas: decisoesOrd, ordem, alternar } = useOrdenacao(decisoes, { campo: 'data', desc: true });

  const carregarDecisoes = () =>
    api.decisoesListar().then((l) => setDecisoes(l.filter((d) => d.codigo === c.ClienteID && (!d.conexaoId || !conexaoId || d.conexaoId === conexaoId)).map((d) => ({
      ...d, score: d.snapshot?.score, perfil: d.snapshot?.perfil, limiteSugerido: d.snapshot?.limiteSugerido
    })))).catch(() => {});

  useEffect(() => {
    api.regrasGet().then(setRegras).catch(() => {});
    carregarDecisoes();
  }, [c.ClienteID]);

  const muda = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  const salvar = async (e) => {
    e.preventDefault();
    try {
      lsSet('ac.responsavel', form.responsavel);
      await api.decisoesSalvar({
        codigo: c.ClienteID,
        nome: c.Nome,
        fantasia: c.Nome_Fanta,
        situacao: form.situacao,
        limiteAprovado: Number(String(form.limiteAprovado).replace(',', '.')) || 0,
        prazoAprovado: form.prazoAprovado,
        responsavel: form.responsavel,
        observacao: form.observacao,
        periodo: { inicial: filtros?.dataInicial || null, final: filtros?.dataFinal || null },
        snapshot: {
          score: c.ScoreCredito, perfil: c.PerfilCredito, limiteAtual: c.LimiteAtual, limiteSugerido: c.LimiteSugerido,
          prazoSugerido: c.PrazoSugeridoDias, debito: c.Debito, saldo: c.SaldoDisponivel,
          inadimplente: c.ValorInadimplente, atrasoMedio: c.AtrasoMedioDias, vendasPeriodo: c.TotalVendasPeriodo,
          posicao: c.PosicaoMercado, pontos: c.Pontos
        }
      });
      setForm({ ...form, observacao: '' });
      setMsg({ ok: true, txt: 'Decisão registrada.' });
      setTimeout(() => setMsg(null), 3000);
      carregarDecisoes();
    } catch (err) { setMsg({ ok: false, txt: err.message }); }
  };

  const max = pontuacaoMaxima || 98;
  const pct = Math.max(0, Math.min(100, ((c.ScoreCredito || 0) / max) * 100));

  // ---------- Relatório da ficha (PDF / impressão)
  const htmlFicha = () => {
    const blocos = [
      {
        tipo: 'grade', colunas: 3, blocos: [
          { tipo: 'destaque', rotulo: 'Score de crédito', valor: `${c.ScoreCredito} / ${max}`, perfil: c.PerfilCredito, texto: `${c.ObservacaoCredito} · ${c.PosicaoMercado}` },
          {
            tipo: 'kv', titulo: 'Crédito', itens: [
              ['Limite atual', fmtMoeda(c.LimiteAtual)], ['Limite sugerido', fmtMoeda(c.LimiteSugerido), true],
              ['Débito em aberto', fmtMoeda(c.Debito)], ['Saldo disponível', fmtMoeda(c.SaldoDisponivel)],
              ['Prazo sugerido', `${c.PrazoSugeridoDias} dias`], ['Prazos', [c.Prazo1, c.Prazo2, c.Prazo3, c.Prazo4, c.Prazo5].filter((p) => p !== 'N/A').join(' · ')]
            ]
          },
          {
            tipo: 'kv', titulo: 'Pagamentos', itens: [
              ['Atraso médio', `${fmtNum(c.AtrasoMedioDias, 1)} dias`], ['Parcelas pagas', fmtNum(c.TotalParcelasPagas)],
              ['Pagas com atraso', `${fmtNum(c.ParcelasComAtraso)} (${fmtNum(c.PercentualAtraso, 1)}%)`],
              ['Valor inadimplente', fmtMoeda(c.ValorInadimplente)], ['Parcelas vencidas', fmtNum(c.QtdParcelasVencidas)],
              ['Total recebido', fmtMoeda(c.TotalRecebido)]
            ]
          }
        ]
      },
      {
        tipo: 'grade', colunas: 2, blocos: [
          {
            tipo: 'tabela', titulo: 'Composição do score',
            colunas: [{ titulo: 'Critério', campo: 'nome' }, { titulo: 'Valor', campo: 'valor' }, { titulo: 'Pontos', campo: 'pts' }],
            linhas: (regras?.criterios || []).map((cr) => ({ nome: cr.nome, valor: fmtValorCriterio(c.ValoresCriterios?.[cr.id], cr.unidade), pts: `${c.Pontos?.[cr.id] ?? 0} / ${maxCriterio(cr)}` }))
          },
          {
            tipo: 'kv', titulo: 'Compras no período', itens: [
              ['Total comprado', fmtMoeda(c.TotalCompradoHistorico)], ['Vendas no período', fmtMoeda(c.TotalVendasPeriodo)],
              ['Maior compra', fmtMoeda(c.MaiorCompra)], ['Ticket médio', fmtMoeda(c.TicketMedio)],
              ['Pedidos de venda', fmtNum(c.QtdPedidosVenda)], ['Devoluções', fmtNum(c.QtdPedidosDevolucao)],
              ['Primeira / última compra', `${fmtData(c.PrimeiraCompra)} / ${fmtData(c.UltimaCompra)}`],
              ['Meses de relacionamento', fmtNum(c.MesesRelacionamento)]
            ]
          }
        ]
      }
    ];
    if (vendasLinhas) {
      const pv = montarPivot(vendasLinhas, filtros?.abaterRetornos !== false);
      blocos.push({
        tipo: 'tabela', titulo: 'Vendas por ano e mês',
        colunas: [{ titulo: 'Ano', campo: 'ano' }, ...MESES.map((m, i) => ({ titulo: m, campo: `m${i}`, tipo: 'moeda' })), { titulo: 'Total', campo: 'total', tipo: 'moeda' }],
        linhas: pv.anos,
        rodape: { ano: 'TOTAL', total: pv.totalGeral, ...Object.fromEntries(pv.totalMeses.map((v, i) => [`m${i}`, v])) }
      });
    }
    if (decisoesOrd.length) {
      blocos.push({
        tipo: 'tabela', titulo: 'Histórico de decisões',
        colunas: [
          { titulo: 'Data', campo: 'data', tipo: 'datahora' }, { titulo: 'Situação', campo: 'situacao' },
          { titulo: 'Score', campo: 'score', tipo: 'num' }, { titulo: 'Sugerido', campo: 'limiteSugerido', tipo: 'moeda' },
          { titulo: 'Aprovado', campo: 'limiteAprovado', tipo: 'moeda' }, { titulo: 'Prazo', campo: 'prazoAprovado' },
          { titulo: 'Responsável', campo: 'responsavel' }, { titulo: 'Observação', campo: 'observacao' }
        ],
        linhas: decisoesOrd
      });
    }
    return montarRelatorio({
      titulo: `Ficha de Crédito — ${c.Nome}`,
      subtitulo: `${c.ClienteID}${c.Nome_Fanta ? ` · ${c.Nome_Fanta}` : ''}${c.Cidade ? ` · ${c.Cidade}` : ''} · ${c.StatusCliente}`,
      empresa,
      filtros: filtros?.dataInicial ? [`Período: ${isoParaBr(filtros.dataInicial)} a ${isoParaBr(filtros.dataFinal)}`] : [],
      paisagem: true,
      blocos
    });
  };

  const nomeArq = `ficha-credito-${c.ClienteID}`;

  return (
    <div className="pagina rolavel">
      <CabecalhoPagina
        voltar={<button className="link voltar" onClick={onVoltar}><ArrowLeft size={15} /> Voltar para a lista</button>}
        titulo={c.Nome}
        subtitulo={`${c.ClienteID}${c.Nome_Fanta ? ` · ${c.Nome_Fanta}` : ''}${c.Cidade ? ` · ${c.Cidade}` : ''} · ${c.StatusCliente}${c.Bloqueado === 'S' ? ' · bloqueado para venda' : ''}`}
        acoes={
          <BotoesExportar
            onPdf={() => api.relatorioPdf({ html: htmlFicha(), nomeArquivo: `${nomeArq}.pdf`, paisagem: true }).catch((e) => setMsg({ ok: false, txt: e.message }))}
            onImprimir={() => api.relatorioImprimir({ html: htmlFicha(), paisagem: true }).catch((e) => setMsg({ ok: false, txt: e.message }))}
          />
        }
      />

      <div className="contatos">
        {c.Telefone && <span><Phone size={14} />{c.Telefone}</span>}
        {c.Email && <span><Mail size={14} />{c.Email}</span>}
        <span><CalendarDays size={14} />Cadastro {fmtData(c.DataCadastro)}</span>
      </div>

      <div className="grade-ficha">
        <div className="card score-card">
          <div className="score-topo">
            <div>
              <span className="muted">Score de crédito</span>
              <div className="score-grande">{c.ScoreCredito}<small>/{max}</small></div>
            </div>
            <div className={`anel ${classePerfil(c.PerfilCredito)}`} style={{ '--pct': `${pct}%` }}>
              <span>{c.PerfilCredito}</span>
            </div>
          </div>
          <p className="obs">{c.ObservacaoCredito}</p>
          <div className="linha"><span>Posição</span><b>{c.PosicaoMercado}</b></div>
          <div className="linha"><span>Grupo do ranking (1 = melhores)</span><b>{c.GrupoRanking ?? '—'}</b></div>
          {Number(c.ValorInadimplente) > 0 && (
            <div className="alerta"><AlertTriangle size={15} /> {fmtMoeda(c.ValorInadimplente)} vencido em aberto — score zerado.</div>
          )}

          <h4>Composição do score</h4>
          <div className="criterios">
            {(regras?.criterios || []).map((cr) => {
              const maxCr = maxCriterio(cr);
              const pts = c.Pontos?.[cr.id] ?? 0;
              return (
                <div key={cr.id} className="criterio">
                  <div className="criterio-topo"><span>{cr.nome}</span><b>{pts}<small>/{maxCr}</small></b></div>
                  <div className="barra fina"><div className="barra-fill" style={{ width: `${maxCr ? (pts / maxCr) * 100 : 0}%` }} /></div>
                  <div className="criterio-valor">{fmtValorCriterio(c.ValoresCriterios?.[cr.id], cr.unidade)}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="coluna">
          <div className="card">
            <h3><CreditCard size={16} /> Crédito</h3>
            <Linha rotulo="Limite atual" valor={fmtMoeda(c.LimiteAtual)} />
            <Linha rotulo="Limite sugerido" valor={fmtMoeda(c.LimiteSugerido)} classe="destaque" />
            <Linha rotulo="Débito em aberto" valor={fmtMoeda(c.Debito)} />
            <Linha rotulo="Saldo disponível" valor={fmtMoeda(c.SaldoDisponivel)} classe={Number(c.SaldoDisponivel) < 0 ? 'txt-neg' : ''} />
            <Linha rotulo="Prazo sugerido" valor={`${c.PrazoSugeridoDias} dias`} />
            <div className="prazos">
              {[c.Prazo1, c.Prazo2, c.Prazo3, c.Prazo4, c.Prazo5].map((p, i) => (
                <span key={i} className={`prazo ${p === 'N/A' ? 'na' : ''}`}>{p}</span>
              ))}
            </div>
          </div>

          <div className="card">
            <h3><Wallet size={16} /> Pagamentos</h3>
            <Linha rotulo="Atraso médio" valor={`${fmtNum(c.AtrasoMedioDias, 1)} dias`} />
            <Linha rotulo="Parcelas pagas" valor={fmtNum(c.TotalParcelasPagas)} />
            <Linha rotulo="Pagas com atraso" valor={`${fmtNum(c.ParcelasComAtraso)} (${fmtNum(c.PercentualAtraso, 1)}%)`} />
            <Linha rotulo="Pontuais / atrasados" valor={`${fmtNum(c.PagPontual)} / ${fmtNum(c.PagAtraso)}`} />
            <Linha rotulo="Valor inadimplente" valor={fmtMoeda(c.ValorInadimplente)} classe={Number(c.ValorInadimplente) > 0 ? 'txt-neg' : ''} />
            <Linha rotulo="Parcelas vencidas" valor={fmtNum(c.QtdParcelasVencidas)} />
            <Linha rotulo="Total a receber" valor={fmtMoeda(c.TotalAReceber)} />
            <Linha rotulo="Total recebido" valor={fmtMoeda(c.TotalRecebido)} />
          </div>
        </div>

        <div className="coluna">
          <div className="card">
            <h3><ShoppingCart size={16} /> Compras no período</h3>
            <Linha rotulo="Total comprado" valor={fmtMoeda(c.TotalCompradoHistorico)} />
            <Linha rotulo="Vendas no período" valor={fmtMoeda(c.TotalVendasPeriodo)} />
            <Linha rotulo="Maior compra" valor={fmtMoeda(c.MaiorCompra)} />
            <Linha rotulo="Ticket médio" valor={fmtMoeda(c.TicketMedio)} />
            <Linha rotulo="Pedidos de venda" valor={fmtNum(c.QtdPedidosVenda)} />
            <Linha rotulo="Pedidos (todos) / bonificados" valor={`${fmtNum(c.QtdPedidos)} / ${fmtNum(c.QtdPedidosBonificados)}`} />
            <Linha rotulo="Devoluções" valor={fmtNum(c.QtdPedidosDevolucao)} />
            <Linha rotulo="Primeira / última compra" valor={`${fmtData(c.PrimeiraCompra)} / ${fmtData(c.UltimaCompra)}`} />
            <Linha rotulo="Meses de relacionamento" valor={fmtNum(c.MesesRelacionamento)} />
            <Linha rotulo="Vendedor 1ª / última" valor={`${c.VendedorPrimeiraCompra || '—'} / ${c.VendedorUltimaCompra || '—'}`} />
          </div>

          <form className="card decisao" onSubmit={salvar}>
            <h3><ClipboardCheck size={16} /> Registrar decisão</h3>
            <div className="form-grade">
              <label>Situação
                <select value={form.situacao} onChange={muda('situacao')}>
                  {SITUACOES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label>Limite aprovado (R$)
                <input type="number" step="0.01" value={form.limiteAprovado} onChange={muda('limiteAprovado')} />
              </label>
              <label>Prazo aprovado
                <input list="prazos-sug" value={form.prazoAprovado} onChange={muda('prazoAprovado')} placeholder="ex.: 7/14/21" />
                <datalist id="prazos-sug">{prazos.map((p) => <option key={p} value={p} />)}</datalist>
              </label>
              <label>Responsável
                <input value={form.responsavel} onChange={muda('responsavel')} />
              </label>
            </div>
            <label className="campo">Observação
              <textarea rows={2} value={form.observacao} onChange={muda('observacao')} />
            </label>
            <div className="acoes">
              {msg && <span className={msg.ok ? 'txt-ok' : 'txt-neg'}>{msg.txt}</span>}
              <button className="btn primario"><Save size={15} />Salvar decisão</button>
            </div>
          </form>
        </div>
      </div>

      <VendasMes codigoFixo={c.ClienteID} abaterInicial={filtros?.abaterRetornos !== false} empresa={empresa} onDados={setVendasLinhas} />

      <div className="card">
        <h3>Histórico de decisões deste cliente</h3>
        {decisoes.length === 0 ? <p className="muted">Nenhuma decisão registrada ainda.</p> : (
          <div className="tabela-wrap baixa">
            <table className="tabela">
              <thead>
                <tr>
                  <Th titulo="Data" campo="data" ordem={ordem} onOrdenar={alternar} />
                  <Th titulo="Situação" campo="situacao" ordem={ordem} onOrdenar={alternar} />
                  <Th titulo="Score" campo="score" num ordem={ordem} onOrdenar={alternar} />
                  <Th titulo="Perfil" campo="perfil" ordem={ordem} onOrdenar={alternar} />
                  <Th titulo="Limite sugerido" campo="limiteSugerido" num ordem={ordem} onOrdenar={alternar} />
                  <Th titulo="Limite aprovado" campo="limiteAprovado" num ordem={ordem} onOrdenar={alternar} />
                  <Th titulo="Prazo" campo="prazoAprovado" ordem={ordem} onOrdenar={alternar} />
                  <Th titulo="Responsável" campo="responsavel" ordem={ordem} onOrdenar={alternar} />
                  <Th titulo="Conexão" campo="conexaoNome" ordem={ordem} onOrdenar={alternar} />
                  <th>Observação</th>
                </tr>
              </thead>
              <tbody>
                {decisoesOrd.map((d) => (
                  <tr key={d.id} className="sem-clique">
                    <td>{fmtDataHora(d.data)}</td>
                    <td><span className={`sit sit-${(d.situacao || '').split(' ')[0].toLowerCase()}`}>{d.situacao}</span></td>
                    <td className="num">{d.score}</td>
                    <td><span className={`chip ${classePerfil(d.perfil)}`}>{d.perfil}</span></td>
                    <td className="num">{fmtMoeda(d.limiteSugerido)}</td>
                    <td className="num forte">{fmtMoeda(d.limiteAprovado)}</td>
                    <td>{d.prazoAprovado || '—'}</td>
                    <td>{d.responsavel || '—'}</td>
                    <td>{d.conexaoNome || '—'}</td>
                    <td className="obs-cel">{d.observacao || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
