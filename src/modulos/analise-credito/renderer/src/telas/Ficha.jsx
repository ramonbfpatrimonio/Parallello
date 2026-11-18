import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Phone, Mail, CalendarDays, AlertTriangle, Wallet, CreditCard, ShoppingCart, ClipboardCheck, Save, Clock, Gauge, CalendarRange, UserCheck, RefreshCw, DatabaseZap, CheckCircle2, Loader2, X } from 'lucide-react';
import { comLayoutDaTela } from '../impressao.js';
import { api, fmtMoeda, fmtNum, fmtData, fmtDataHora, classePerfil, isoParaBr, useOrdenacao, montarPivot, MESES, fmtDias, mesesPeriodo } from '../util.js';
import { Th, CabecalhoPagina, BotoesExportar } from '../componentes.jsx';
import VendasMes from './VendasMes.jsx';
import CardSerasa from './CardSerasa.jsx';
// Parallello: card do módulo Cobrança (aparece só para quem tem a Cobrança liberada)
import CardSituacaoCobranca from '../../../../cobranca/renderer/src/CardSituacaoCobranca.jsx';

const COBRANCA = {
  nuvem: {
    carregarConfig: () => api.cobrancaNuvem('carregarConfig'),
    registrosDoCliente: (codigo) => api.cobrancaNuvem('registrosDoCliente', codigo),
    eventosDoCliente: (codigo) => api.cobrancaNuvem('eventosDoCliente', codigo),
  },
  erp: { carteiraCliente: (codigo) => api.cobrancaCarteira(codigo) },
};

const SITUACOES = ['Aprovado', 'Aprovado parcial', 'Negado', 'Em análise'];
const BASE_LIMITE = { score: 'pelo score', periodo: 'pelo período', manual: 'manual' };

function Linha({ rotulo, valor, classe }) {
  return <div className="linha"><span>{rotulo}</span><b className={classe || ''}>{valor}</b></div>;
}

function fmtValorCriterio(v, unidade) {
  if (v === null || v === undefined) return 'sem dados';
  if (unidade === 'R$') return fmtMoeda(v);
  if (unidade === 'x') return `${fmtNum(v, 2)}x`;
  if (unidade === 'dias') return fmtDias(v);
  return `${fmtNum(v, unidade === 'dias' ? 1 : 0)} ${unidade}`;
}

const maxCriterio = (cr) => Math.max(Number(cr.padrao) || 0, ...cr.faixas.map((x) => Number(x.pontos) || 0));

const CLASSE_ATRASO = { Excelente: 'p-exc', Bom: 'p-bom', 'Médio': 'p-reg', Ruim: 'p-ina' };
const CLASSE_NIVEL = { critico: 'nivel-critico', atencao: 'nivel-atencao' };

export default function Ficha({ cliente: c, filtros, empresa, conexaoId, pontuacaoMaxima, mesesAtraso, atualizadoEm, onAtualizado, onVoltar }) {
  const [regras, setRegras] = useState(null);
  const [decisoes, setDecisoes] = useState([]);
  const [msg, setMsg] = useState(null);
  const [vendasLinhas, setVendasLinhas] = useState(null);
  const [serasaUltima, setSerasaUltima] = useState(null);
  const [config, setConfig] = useState(null);
  const [cobranca, setCobranca] = useState(null);
  useEffect(() => { api.cobrancaDisponivel?.().then((ok) => setCobranca(ok ? COBRANCA : null)).catch(() => setCobranca(null)); }, []);
  const [limiteERP, setLimiteERP] = useState(null);       // limite atualizado depois de aplicar
  const [aplicando, setAplicando] = useState(null);       // decisão em validação/aplicação
  const [destaque, setDestaque] = useState(null);         // decisão recém-registrada
  const [usuario, setUsuario] = useState(null);           // usuário do login (Parallello)
  const meses = c.MesesPeriodo || mesesPeriodo(filtros?.dataInicial, filtros?.dataFinal);
  const textoPeriodo = filtros?.dataInicial
    ? `${isoParaBr(filtros.dataInicial)} a ${filtros.dataFinal ? isoParaBr(filtros.dataFinal) : 'hoje'}${meses ? ` · ${meses} ${meses === 1 ? 'mês' : 'meses'}` : ''}`
    : 'Sem período (histórico completo)';
  const historicoRef = useRef(null);
  const limiteAtual = limiteERP ?? c.LimiteAtual;
  const sugestoes = { score: Number(c.LimiteSugerido) || 0, periodo: Number(c.LimiteSugeridoPeriodo) || 0 };
  const prazos = [c.Prazo1, c.Prazo2, c.Prazo3, c.Prazo4, c.Prazo5].filter((p) => p && p !== 'N/A');
  const [form, setForm] = useState({
    situacao: 'Aprovado',
    base: 'score',
    limiteAprovado: c.LimiteSugerido ?? 0,
    prazoAprovado: prazos[prazos.length - 1] || '',
    responsavel: '',
    observacao: ''
  });
  const { ordenadas: decisoesOrd, ordem, alternar } = useOrdenacao(decisoes, { campo: 'data', desc: true });

  const carregarDecisoes = () =>
    api.decisoesListar().then((l) => setDecisoes(l.filter((d) => d.codigo === c.ClienteID && (!d.conexaoId || !conexaoId || d.conexaoId === conexaoId)).map((d) => ({
      ...d, score: d.snapshot?.score, perfil: d.snapshot?.perfil, limiteSugerido: d.snapshot?.limiteSugerido
    })))).catch(() => {});

  useEffect(() => {
    api.regrasGet().then(setRegras).catch(() => {});
    api.configuracaoGet().then((cfg) => {
      setConfig(cfg);
      // regra padrão do limite (@RegraAplicar): 1 = período, 2 = score
      const base = Number(cfg?.limite?.regraPadrao) === 1 ? 'periodo' : 'score';
      setForm((f) => ({ ...f, base, limiteAprovado: sugestoes[base] }));
    }).catch(() => {});
    api.usuarioLogado().then((u) => { setUsuario(u); setForm((f) => ({ ...f, responsavel: u.nome })); }).catch(() => {});
    carregarDecisoes();
  }, [c.ClienteID]);

  const muda = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });
  const mudaBase = (e) => {
    const base = e.target.value;
    setForm({ ...form, base, limiteAprovado: base === 'manual' ? form.limiteAprovado : sugestoes[base] });
  };
  const mudaLimite = (e) => setForm({ ...form, limiteAprovado: e.target.value, base: 'manual' });
  const permitirAplicar = config?.limite?.permitirAplicar !== false;

  const salvar = async (e) => {
    e.preventDefault();
    try {
      const salva = await api.decisoesSalvar({
        codigo: c.ClienteID,
        nome: c.Nome,
        fantasia: c.Nome_Fanta,
        situacao: form.situacao,
        baseLimite: form.base,
        limiteAprovado: Number(String(form.limiteAprovado).replace(',', '.')) || 0,
        prazoAprovado: form.prazoAprovado,
        responsavel: form.responsavel,
        observacao: form.observacao,
        periodo: { inicial: filtros?.dataInicial || null, final: filtros?.dataFinal || null },
        snapshot: {
          score: c.ScoreCredito, perfil: c.PerfilCredito, limiteAtual: limiteAtual, limiteSugerido: c.LimiteSugerido,
          limiteSugeridoPeriodo: c.LimiteSugeridoPeriodo,
          prazoSugerido: c.PrazoSugeridoDias, debito: c.Debito, saldo: c.SaldoDisponivel,
          inadimplente: c.ValorInadimplente, atrasoMedio: c.AtrasoMedioDias, vendasPeriodo: c.TotalVendasPeriodo,
          posicao: c.PosicaoMercado, pontos: c.Pontos
        }
      });
      setForm({ ...form, observacao: '' });
      setMsg(salva.avisoEvento
        ? { ok: false, txt: `Decisão registrada, mas: ${salva.avisoEvento}` }
        : { ok: true, txt: permitirAplicar && form.situacao !== 'Em análise'
          ? 'Decisão registrada. Para gravar o limite no ERP, use "Aplicar no ERP" no histórico abaixo.'
          : 'Decisão registrada.' });
      setTimeout(() => setMsg(null), 6000);
      await carregarDecisoes();
      // leva até o histórico, onde a decisão é aplicada de fato
      setDestaque(salva.id);
      setTimeout(() => historicoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
      setTimeout(() => setDestaque(null), 4000);
    } catch (err) { setMsg({ ok: false, txt: err.message }); }
  };

  const max = pontuacaoMaxima || 98;
  const pct = Math.max(0, Math.min(100, ((c.ScoreCredito || 0) / max) * 100));

  // ---------- PDF / impressão: imprime a própria tela (igual ao painel, com gráficos)
  // o layout da tela é congelado e reduzido para caber na folha (cards lado a lado, como no sistema)
  const pdf = () => comLayoutDaTela('.ficha-pagina', () => api.telaPdf({ nomeArquivo: `${nomeArq}.pdf`, paisagem: true }))
    .catch((e) => setMsg({ ok: false, txt: e.message }));
  const imprimir = () => comLayoutDaTela('.ficha-pagina', () => api.telaImprimir({ paisagem: true }))
    .catch((e) => setMsg({ ok: false, txt: e.message }));

  // ---------- Atualizar informações (consulta este cliente de novo no banco)
  const [atualizando, setAtualizando] = useState(false);
  const atualizar = async () => {
    setAtualizando(true); setMsg(null);
    try {
      const base = { ...(filtros || {}), codigo: c.ClienteID };
      let r = await api.analisar(base);
      // se o cliente saiu do filtro (ex.: mudou de status), busca só pelo código e período
      if (!r.linhas.length) r = await api.analisar({ codigo: c.ClienteID, dataInicial: base.dataInicial, dataFinal: base.dataFinal });
      if (!r.linhas.length) throw new Error('O cliente não teve movimentação no período filtrado.');
      onAtualizado?.(r.linhas[0], r);
    } catch (e) { setMsg({ ok: false, txt: `Não foi possível atualizar: ${e.message}` }); }
    finally { setAtualizando(false); }
  };

  const nomeArq = `ficha-credito-${c.ClienteID}`;

  return (
    <div className="pagina rolavel ficha-pagina">
      <div className="so-impressao">
        <span><b>Análise de Crédito</b>{empresa ? ` · ${empresa}` : ''}</span>
        <span>Impresso em {fmtDataHora(new Date())}</span>
      </div>
      <CabecalhoPagina
        voltar={<button className="link voltar" onClick={onVoltar}><ArrowLeft size={15} /> Voltar para a lista</button>}
        titulo={c.Nome}
        subtitulo={`${c.ClienteID}${c.Nome_Fanta ? ` · ${c.Nome_Fanta}` : ''}${c.Cidade ? ` · ${c.Cidade}` : ''} · ${c.StatusCliente}${c.Bloqueado === 'S' ? ' · bloqueado para venda' : ''}`}
        acoes={
          <>
            <div className="atualizar-grupo">
              {atualizadoEm && <span className="muted pequeno">Atualizado às {new Date(atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
              <button className="btn" onClick={atualizar} disabled={atualizando} title="Consulta este cliente de novo no banco">
                {atualizando ? <Loader2 size={15} className="gira" /> : <RefreshCw size={15} />}{atualizando ? 'Atualizando…' : 'Atualizar informações'}
              </button>
            </div>
            <BotoesExportar onPdf={pdf} onImprimir={imprimir} />
          </>
        }
      />

      {(['atencao', 'critico'].includes(c.NivelInatividade) || ['atencao', 'critico'].includes(c.NivelExposicao) || Number(c.ValorInadimplente) > 0) && (
        <div className="alertas-ficha">
          {Number(c.ValorInadimplente) > 0 && <span className="alerta-pill nivel-critico"><AlertTriangle size={14} />Inadimplente: {fmtMoeda(c.ValorInadimplente)} vencido</span>}
          {['atencao', 'critico'].includes(c.NivelInatividade) && <span className={`alerta-pill ${CLASSE_NIVEL[c.NivelInatividade]}`}><Clock size={14} />{c.AlertaInatividade} ({fmtNum(c.DiasSemComprar)} dias)</span>}
          {['atencao', 'critico'].includes(c.NivelExposicao) && <span className={`alerta-pill ${CLASSE_NIVEL[c.NivelExposicao]}`}><Gauge size={14} />{c.AlertaExposicao} ({fmtNum(c.PercentualUsoLimite, 0)}% do limite)</span>}
        </div>
      )}

      <div className="contatos">
        <span className="periodo-pill"><CalendarRange size={14} />Período: <b>{textoPeriodo}</b></span>
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
            <Linha rotulo={limiteERP !== null ? 'Limite atual (atualizado no ERP)' : 'Limite atual'} valor={fmtMoeda(limiteAtual)} classe={limiteERP !== null ? 'txt-ok' : ''} />
            <Linha rotulo="Limite sugerido pelo score" valor={fmtMoeda(c.LimiteSugerido)} classe={form.base === 'score' ? 'destaque' : ''} />
            <div className="linha" title={`Vendas a prazo no período ${fmtMoeda(c.TotalVendidoPrazo)} ÷ ${c.MesesPeriodo || 0} mês(es) × fator × multiplicador do atraso`}>
              <span>Limite sugerido pelo período</span>
              <b className={form.base === 'periodo' ? 'destaque' : ''}>{fmtMoeda(c.LimiteSugeridoPeriodo)}</b>
            </div>
            <Linha rotulo="Débito em aberto" valor={fmtMoeda(c.Debito)} />
            <Linha rotulo="Saldo disponível" valor={fmtMoeda(c.SaldoDisponivel)} classe={Number(c.SaldoDisponivel) < 0 ? 'txt-neg' : ''} />
            {Number(c.LimiteAtual) > 0 && (
              <div className="uso-limite">
                <div className="linha"><span>Uso do limite</span><b className={CLASSE_NIVEL[c.NivelExposicao] || ''}>{fmtNum(c.PercentualUsoLimite, 1)}% · {c.AlertaExposicao}</b></div>
                <div className="barra"><div className={`barra-fill uso ${c.NivelExposicao}`} style={{ width: `${Math.min(100, Number(c.PercentualUsoLimite) || 0)}%` }} /></div>
              </div>
            )}
            <Linha rotulo="Prazo sugerido" valor={`${c.PrazoSugeridoDias} dias`} />
            <div className="prazos">
              {[c.Prazo1, c.Prazo2, c.Prazo3, c.Prazo4, c.Prazo5].map((p, i) => (
                <span key={i} className={`prazo ${p === 'N/A' ? 'na' : ''}`}>{p}</span>
              ))}
            </div>
          </div>

          <div className="card">
            <h3><Wallet size={16} /> Pagamentos</h3>
            <div className="linha"><span>Atraso médio{mesesAtraso ? ` (últimos ${mesesAtraso} meses)` : ''}</span>
              <b>{fmtDias(c.AtrasoMedioScore)} <span className={`mini ${CLASSE_ATRASO[c.ClassificacaoAtraso] || ''}`}>{c.ClassificacaoAtraso}</span></b></div>
            <Linha rotulo="Parcelas pagas no período do score" valor={fmtNum(c.ParcelasPagasJanela)} />
            <Linha rotulo="Parcelas pagas (histórico)" valor={fmtNum(c.TotalParcelasPagas)} />
            <Linha rotulo="Pagas no vencimento (pontuais)" valor={fmtNum(c.PagPontual)} />
            <Linha rotulo="Pagas adiantadas" valor={fmtNum(c.PagAdiantado)} classe="txt-ok" />
            <Linha rotulo="Pagas com atraso" valor={fmtNum(c.PagAtraso)} classe={Number(c.PagAtraso) > 0 ? 'txt-neg' : ''} />
            <Linha rotulo="% pontual" valor={`${fmtNum(c.PercentualPontual, 1)}%`} />
            <Linha rotulo="% adiantado" valor={`${fmtNum(c.PercentualAdiantado, 1)}%`} />
            <Linha rotulo="% atraso" valor={`${fmtNum(c.PercentualAtraso, 1)}%`} />
            <Linha rotulo="Valor inadimplente" valor={fmtMoeda(c.ValorInadimplente)} classe={Number(c.ValorInadimplente) > 0 ? 'txt-neg' : ''} />
            <Linha rotulo="Parcelas vencidas" valor={fmtNum(c.QtdParcelasVencidas)} />
            <Linha rotulo="Total a receber" valor={fmtMoeda(c.TotalAReceber)} />
            <Linha rotulo="Total recebido" valor={fmtMoeda(c.TotalRecebido)} />
          </div>
        </div>

        <div className="coluna">
          <div className="card">
            <h3><ShoppingCart size={16} /> Compras</h3>
            <Linha rotulo="Vendas no período" valor={fmtMoeda(c.TotalVendasPeriodo)} />
            <Linha rotulo="Média por mês no período" valor={fmtMoeda(c.MediaMes)} classe="destaque" />
            <Linha rotulo="Total comprado (histórico)" valor={fmtMoeda(c.TotalCompradoHistorico)} />
            <Linha rotulo="Maior compra" valor={fmtMoeda(c.MaiorCompra)} />
            <Linha rotulo="Ticket médio" valor={fmtMoeda(c.TicketMedio)} />
            <Linha rotulo="Pedidos de venda (histórico)" valor={fmtNum(c.QtdPedidosVenda)} />
            <Linha rotulo="Pedidos no período" valor={fmtNum(c.QtdPedidos)} />
            <Linha rotulo="Bonificados no período" valor={fmtNum(c.QtdPedidosBonificados)} />
            <Linha rotulo="Devoluções no período" valor={fmtNum(c.QtdPedidosDevolucao)} />
            <Linha rotulo="Primeira compra" valor={fmtData(c.PrimeiraCompra)} />
            <Linha rotulo="Última compra" valor={fmtData(c.UltimaCompra)} />
            <Linha rotulo="Meses de relacionamento" valor={fmtNum(c.MesesRelacionamento)} />
            <Linha rotulo="Frequência média de compra" valor={c.FrequenciaMediaDias ? `a cada ${fmtNum(c.FrequenciaMediaDias)} dias` : '—'} />
            <Linha rotulo="Dias sem comprar" valor={c.DiasSemComprar == null ? '—' : `${fmtNum(c.DiasSemComprar)} · ${c.AlertaInatividade}`} classe={CLASSE_NIVEL[c.NivelInatividade] || ''} />
            <Linha rotulo="Vendedor da 1ª compra" valor={c.VendedorPrimeiraCompra || '—'} />
            <Linha rotulo="Vendedor da última compra" valor={c.VendedorUltimaCompra || '—'} />
          </div>

          <form className="card decisao" onSubmit={salvar}>
            <h3><ClipboardCheck size={16} /> Registrar decisão</h3>
            <div className="form-grade">
              <label>Situação
                <select value={form.situacao} onChange={muda('situacao')}>
                  {SITUACOES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label>Base do limite
                <select value={form.base} onChange={mudaBase}>
                  <option value="score">Pelo score — {fmtMoeda(sugestoes.score)}</option>
                  <option value="periodo">Pelo período — {fmtMoeda(sugestoes.periodo)}</option>
                  <option value="manual">Manual</option>
                </select>
              </label>
              <label>Limite aprovado (R$)
                <input type="number" step="0.01" min="0" value={form.limiteAprovado} onChange={mudaLimite} />
              </label>
              <label>Prazo aprovado
                <input list="prazos-sug" value={form.prazoAprovado} onChange={muda('prazoAprovado')} placeholder="ex.: 7/14/21" />
                <datalist id="prazos-sug">{prazos.map((p) => <option key={p} value={p} />)}</datalist>
              </label>
              <label>Responsável
                <div className="campo-login" title={usuario?.origem === 'parallello' ? 'Usuário do login do Parallello' : 'Usuário do Windows (sem login do Parallello)'}>
                  <UserCheck size={15} /><span>{form.responsavel || '—'}</span>
                  <small>{usuario?.origem === 'parallello' ? 'login' : 'Windows'}</small>
                </div>
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

      <CardSerasa cliente={c} conexaoId={conexaoId} onUltima={setSerasaUltima} />

      {cobranca && <CardSituacaoCobranca codigoCliente={c.ClienteID} nuvem={cobranca.nuvem} erp={cobranca.erp} />}

      <VendasMes codigoFixo={c.ClienteID} empresa={empresa} onDados={setVendasLinhas} />

      <div className="card" ref={historicoRef}>
        <h3>Histórico de decisões deste cliente</h3>
        {permitirAplicar && decisoes.length > 0 && <p className="muted pequeno">O limite só é gravado no ERP quando você clica em <b>Aplicar no ERP</b> e confirma. Cada decisão pode ser aplicada uma única vez.</p>}
        {decisoes.length === 0 ? <p className="muted">Nenhuma decisão registrada ainda.</p> : (
          <div className="tabela-wrap baixa">
            <table className="tabela">
              <thead>
                <tr>
                  <Th titulo="Data" campo="data" ordem={ordem} onOrdenar={alternar} />
                  <Th titulo="Situação" campo="situacao" ordem={ordem} onOrdenar={alternar} />
                  <Th titulo="Score" campo="score" num ordem={ordem} onOrdenar={alternar} />
                  <Th titulo="Perfil" campo="perfil" ordem={ordem} onOrdenar={alternar} />
                  <Th titulo="Sugerido (score)" campo="limiteSugerido" num ordem={ordem} onOrdenar={alternar} />
                  <Th titulo="Limite aprovado" campo="limiteAprovado" num ordem={ordem} onOrdenar={alternar} />
                  <th>ERP</th>
                  <Th titulo="Prazo" campo="prazoAprovado" ordem={ordem} onOrdenar={alternar} />
                  <Th titulo="Responsável" campo="responsavel" ordem={ordem} onOrdenar={alternar} />
                  <Th titulo="Conexão" campo="conexaoNome" ordem={ordem} onOrdenar={alternar} />
                  <th>Observação</th>
                </tr>
              </thead>
              <tbody>
                {decisoesOrd.map((d) => (
                  <tr key={d.id} className={`sem-clique ${destaque === d.id ? 'recem' : ''}`}>
                    <td>{fmtDataHora(d.data)}</td>
                    <td><span className={`sit sit-${(d.situacao || '').split(' ')[0].toLowerCase()}`}>{d.situacao}</span></td>
                    <td className="num">{d.score}</td>
                    <td><span className={`chip ${classePerfil(d.perfil)}`}>{d.perfil}</span></td>
                    <td className="num">{fmtMoeda(d.limiteSugerido)}</td>
                    <td className="num forte">{fmtMoeda(d.limiteAprovado)}{d.baseLimite && <div className="cli-sub base-lim">{BASE_LIMITE[d.baseLimite]}</div>}</td>
                    <td className="erp-cel">
                      {d.aplicacao && (
                        <span className="aplicado" title={`${fmtMoeda(d.aplicacao.limiteAnterior)} → ${fmtMoeda(d.aplicacao.limiteNovo)} · ${d.aplicacao.usuarioWindows || ''}`}>
                          <CheckCircle2 size={14} />Aplicado {fmtDataHora(d.aplicacao.data)}
                        </span>
                      )}
                      {permitirAplicar && d.situacao !== 'Em análise' && !d.aplicacao && (
                        <button className="btn primario pequeno" onClick={() => setAplicando({ decisao: d })}><DatabaseZap size={14} />Aplicar no ERP</button>
                      )}
                      {!d.aplicacao && (d.situacao === 'Em análise' || !permitirAplicar) && <span className="muted">—</span>}
                    </td>
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

      {aplicando && (
        <ConfirmarAplicacao
          decisao={aplicando.decisao}
          onFechar={() => setAplicando(null)}
          onAplicado={(nova) => {
            setLimiteERP(nova.aplicacao.limiteNovo);
            setMsg({ ok: true, txt: `Limite de ${fmtMoeda(nova.aplicacao.limiteNovo)} gravado no ERP.` });
            carregarDecisoes();
          }}
        />
      )}
    </div>
  );
}

// Validação antes de gravar no ERP: lê o limite atual no banco e mostra o que vai mudar
function ConfirmarAplicacao({ decisao, onFechar, onAplicado }) {
  const [v, setV] = useState(null);
  const [erro, setErro] = useState('');
  const [etapa, setEtapa] = useState('validando'); // validando | confirmar | aplicando | ok
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    api.limiteValidar(decisao.id)
      .then((r) => { setV(r); setEtapa('confirmar'); })
      .catch((e) => { setErro(e.message); setEtapa('erro'); });
  }, [decisao.id]);

  const aplicar = async () => {
    setEtapa('aplicando'); setErro('');
    try {
      const nova = await api.limiteAplicar(decisao.id);
      setResultado(nova); setEtapa('ok'); onAplicado(nova);
    } catch (e) { setErro(e.message); setEtapa('confirmar'); }
  };

  const dif = v ? v.limiteNovo - v.limiteAtual : 0;
  return (
    <div className="modal-fundo" onMouseDown={etapa === 'aplicando' ? undefined : onFechar}>
      <div className="modal medio" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-cab">
          <h2><DatabaseZap size={18} /> Aplicar limite no ERP</h2>
          {etapa !== 'aplicando' && <button className="btn-icone" onClick={onFechar}><X size={18} /></button>}
        </div>
        <div className="aplicar-corpo">
          {etapa === 'validando' && <p className="muted"><Loader2 size={15} className="gira" /> Validando no banco…</p>}
          {etapa === 'erro' && <div className="erro">{erro}</div>}

          {v && etapa !== 'ok' && etapa !== 'erro' && (
            <>
              <p>Você vai alterar o <b>limite de crédito</b> deste cliente diretamente no ERP:</p>
              <div className="aplicar-resumo">
                <div><span>Cliente</span><b>{v.codigo} · {v.nome}</b></div>
                <div><span>Conexão</span><b>{v.conexaoNome}</b></div>
                <div><span>Decisão</span><b>{v.situacao} · {fmtDataHora(decisao.data)}</b></div>
              </div>
              <div className="aplicar-valores">
                <div><span>Limite atual no ERP</span><b>{fmtMoeda(v.limiteAtual)}</b></div>
                <div className="seta">→</div>
                <div><span>Novo limite</span><b className="novo">{fmtMoeda(v.limiteNovo)}</b>
                  <small className={dif >= 0 ? 'txt-ok' : 'txt-neg'}>{dif >= 0 ? '+' : ''}{fmtMoeda(dif)}</small></div>
              </div>
              {v.igual && <div className="serasa-aviso">O limite no ERP já é igual ao aprovado.</div>}
              {v.limiteNovo === 0 && <div className="alerta"><AlertTriangle size={15} />O limite ficará zerado (venda a prazo bloqueada pelo limite).</div>}
              <p className="muted pequeno">Depois de aplicada, esta decisão fica encerrada: para mudar o limite de novo será preciso registrar outra decisão.</p>
              <p className="muted pequeno">Grava em Clientes.LimPerCred. Clientes marcados com "não calcular limite" (NaoCalcLim) não são alterados.</p>
              {erro && <div className="erro">{erro}</div>}
            </>
          )}

          {etapa === 'ok' && resultado && (
            <div className="sucesso">
              Limite atualizado no ERP: {fmtMoeda(resultado.aplicacao.limiteAnterior)} → <b>{fmtMoeda(resultado.aplicacao.limiteNovo)}</b>.
              Refaça a análise para atualizar saldo e uso do limite.
            </div>
          )}
        </div>
        <div className="acoes aplicar-acoes">
          {etapa === 'ok' || etapa === 'erro'
            ? <button className="btn primario" onClick={onFechar}>Fechar</button>
            : (
              <>
                <button className="btn" onClick={onFechar} disabled={etapa === 'aplicando'}>Cancelar</button>
                <button className="btn primario" onClick={aplicar} disabled={etapa !== 'confirmar'}>
                  {etapa === 'aplicando' ? <Loader2 size={15} className="gira" /> : <DatabaseZap size={15} />}Confirmar e aplicar
                </button>
              </>
            )}
        </div>
      </div>
    </div>
  );
}
