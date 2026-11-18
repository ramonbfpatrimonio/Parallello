import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Users, Wallet, AlertTriangle, TrendingUp, Gauge, Loader2, Play, Timer, Clock, CalendarRange, ShieldCheck } from 'lucide-react';
import { api, fmtMoeda, fmtNum, fmtData, classePerfil, periodoMesAtual, lsGet, lsSet, isoParaBr, useOrdenacao } from '../util.js';
import { Th, CabecalhoPagina, Recolhivel, BotoesExportar, AreaDividida, Vazio } from '../componentes.jsx';
import { montarRelatorio } from '../relatorio.js';
import ConsultaSerasa from './ConsultaSerasa.jsx';

const PERFIS = ['Excelente', 'Bom', 'Regular', 'Risco', 'Inadimplente'];

export const COLUNAS_EXPORT = [
  { titulo: 'Código', campo: 'ClienteID', largura: 10 },
  { titulo: 'Nome', campo: 'Nome', largura: 40 },
  { titulo: 'Fantasia', campo: 'Nome_Fanta', largura: 30 },
  { titulo: 'Telefone', campo: 'Telefone', largura: 16 },
  { titulo: 'E-mail', campo: 'Email', largura: 28 },
  { titulo: 'Cidade', campo: 'Cidade', largura: 20 },
  { titulo: 'Data Cadastro', campo: 'DataCadastro', tipo: 'data' },
  { titulo: 'Limite Atual', campo: 'LimiteAtual', tipo: 'moeda', largura: 15 },
  { titulo: 'Score', campo: 'ScoreCredito' },
  { titulo: 'Perfil', campo: 'PerfilCredito', largura: 14 },
  { titulo: 'Grupo Ranking', campo: 'GrupoRanking' },
  { titulo: 'Limite Sugerido (score)', campo: 'LimiteSugerido', tipo: 'moeda', largura: 17 },
  { titulo: 'Limite Sugerido (período)', campo: 'LimiteSugeridoPeriodo', tipo: 'moeda', largura: 18 },
  { titulo: 'Vendas a Prazo no Período', campo: 'TotalVendidoPrazo', tipo: 'moeda', largura: 18 },
  { titulo: 'Prazo Sugerido (dias)', campo: 'PrazoSugeridoDias' },
  { titulo: 'Observação', campo: 'ObservacaoCredito', largura: 48 },
  { titulo: 'Prazo 1', campo: 'Prazo1' },
  { titulo: 'Prazo 2', campo: 'Prazo2' },
  { titulo: 'Prazo 3', campo: 'Prazo3' },
  { titulo: 'Prazo 4', campo: 'Prazo4' },
  { titulo: 'Prazo 5', campo: 'Prazo5' },
  { titulo: 'Posição Mercado', campo: 'PosicaoMercado', largura: 32 },
  { titulo: 'Débito', campo: 'Debito', tipo: 'moeda', largura: 15 },
  { titulo: 'Saldo Disponível', campo: 'SaldoDisponivel', tipo: 'moeda', largura: 16 },
  { titulo: 'Status', campo: 'StatusCliente' },
  { titulo: 'Bloqueado', campo: 'Bloqueado' },
  { titulo: 'Total Comprado (histórico)', campo: 'TotalCompradoHistorico', tipo: 'moeda', largura: 18 },
  { titulo: 'Maior Compra', campo: 'MaiorCompra', tipo: 'moeda', largura: 15 },
  { titulo: 'Ticket Médio', campo: 'TicketMedio', tipo: 'moeda', largura: 15 },
  { titulo: 'Primeira Compra', campo: 'PrimeiraCompra', tipo: 'data' },
  { titulo: 'Última Compra', campo: 'UltimaCompra', tipo: 'data' },
  { titulo: 'Qtd Pedidos Venda', campo: 'QtdPedidosVenda' },
  { titulo: 'Meses Relacionamento', campo: 'MesesRelacionamento' },
  { titulo: 'Vendas no Período', campo: 'TotalVendasPeriodo', tipo: 'moeda', largura: 16 },
  { titulo: 'Média por Mês', campo: 'MediaMes', tipo: 'moeda', largura: 15 },
  { titulo: 'Qtd Pedidos', campo: 'QtdPedidos' },
  { titulo: 'Qtd Bonificados', campo: 'QtdPedidosBonificados' },
  { titulo: 'Qtd Devoluções', campo: 'QtdPedidosDevolucao' },
  { titulo: 'Atraso Médio (dias)', campo: 'AtrasoMedioDias' },
  { titulo: 'Classificação Atraso', campo: 'ClassificacaoAtraso', largura: 16 },
  { titulo: 'Parcelas Pagas', campo: 'TotalParcelasPagas' },
  { titulo: 'Parcelas c/ Atraso', campo: 'ParcelasComAtraso' },
  { titulo: '% Atraso', campo: 'PercentualAtraso', tipo: 'decimal' },
  { titulo: 'Valor Inadimplente', campo: 'ValorInadimplente', tipo: 'moeda', largura: 16 },
  { titulo: 'Parcelas Vencidas', campo: 'QtdParcelasVencidas' },
  { titulo: 'Total a Receber', campo: 'TotalAReceber', tipo: 'moeda', largura: 15 },
  { titulo: 'Total Recebido', campo: 'TotalRecebido', tipo: 'moeda', largura: 15 },
  { titulo: 'Pag. Pontual', campo: 'PagPontual' },
  { titulo: 'Pag. Atraso', campo: 'PagAtraso' },
  { titulo: 'Pag. Adiantado', campo: 'PagAdiantado' },
  { titulo: '% Pontual', campo: 'PercentualPontual', tipo: 'decimal' },
  { titulo: '% Adiantado', campo: 'PercentualAdiantado', tipo: 'decimal' },
  { titulo: 'Dias sem Comprar', campo: 'DiasSemComprar' },
  { titulo: 'Alerta Inatividade', campo: 'AlertaInatividade', largura: 26 },
  { titulo: 'Frequência Média (dias)', campo: 'FrequenciaMediaDias' },
  { titulo: '% Uso do Limite', campo: 'PercentualUsoLimite', tipo: 'decimal' },
  { titulo: 'Alerta Exposição', campo: 'AlertaExposicao', largura: 24 },
  { titulo: 'Vendedor Última Compra', campo: 'VendedorUltimaCompra', largura: 18 },
  { titulo: 'Vendedor Primeira Compra', campo: 'VendedorPrimeiraCompra', largura: 18 }
];

// colunas da tela (também usadas no PDF/impressão)
const COLS = [
  { titulo: 'Cliente', campo: 'Nome' },
  { titulo: 'Cidade', campo: 'Cidade' },
  { titulo: 'Score', campo: 'ScoreCredito', num: true },
  { titulo: 'Perfil', campo: 'PerfilCredito' },
  { titulo: 'Limite atual', campo: 'LimiteAtual', num: true },
  { titulo: 'Lim. score', campo: 'LimiteSugerido', num: true },
  { titulo: 'Lim. período', campo: 'LimiteSugeridoPeriodo', num: true },
  { titulo: 'Uso do limite', campo: 'PercentualUsoLimite', num: true },
  { titulo: 'Saldo', campo: 'SaldoDisponivel', num: true },
  { titulo: 'Inadimplente', campo: 'ValorInadimplente', num: true },
  { titulo: 'Atraso médio', campo: 'AtrasoMedioDias', num: true },
  { titulo: 'Vendas período', campo: 'TotalVendasPeriodo', num: true },
  { titulo: 'Média/mês', campo: 'MediaMes', num: true },
  { titulo: 'Sem comprar', campo: 'DiasSemComprar', num: true }
];

const CLASSE_ATRASO = { Excelente: 'p-exc', Bom: 'p-bom', 'Médio': 'p-reg', Ruim: 'p-ina', 'Sem Histórico': '' };
const CLASSE_NIVEL = { critico: 'nivel-critico', atencao: 'nivel-atencao', ok: '', sem: 'muted' };

const COLS_RELATORIO = [
  { titulo: 'Código', campo: 'ClienteID' },
  { titulo: 'Cliente', campo: 'Nome' },
  { titulo: 'Cidade', campo: 'Cidade' },
  { titulo: 'Score', campo: 'ScoreCredito', tipo: 'num' },
  { titulo: 'Perfil', campo: 'PerfilCredito' },
  { titulo: 'Lim. atual', campo: 'LimiteAtual', tipo: 'moeda' },
  { titulo: 'Lim. score', campo: 'LimiteSugerido', tipo: 'moeda' },
  { titulo: 'Lim. período', campo: 'LimiteSugeridoPeriodo', tipo: 'moeda' },
  { titulo: 'Prazo', campo: 'PrazoSugeridoDias', tipo: 'num' },
  { titulo: 'Uso lim.', campo: 'PercentualUsoLimite', tipo: 'pct' },
  { titulo: 'Inadimplente', campo: 'ValorInadimplente', tipo: 'moeda' },
  { titulo: 'Atraso', campo: 'AtrasoMedioDias', valor: (l) => `${l.AtrasoMedioDias} d · ${l.ClassificacaoAtraso}` },
  { titulo: 'Vendas período', campo: 'TotalVendasPeriodo', tipo: 'moeda' },
  { titulo: 'Média/mês', campo: 'MediaMes', tipo: 'moeda' },
  { titulo: 'Sem comprar', campo: 'DiasSemComprar', valor: (l) => (l.DiasSemComprar == null ? '—' : `${l.DiasSemComprar} d`) }
];

function filtrosIniciais() {
  const p = periodoMesAtual();
  return lsGet('ac.filtros', {
    codigo: '', dataInicial: p.ini, dataFinal: p.fim, status: 'Ativo', bloqueado: '',
    somenteSemCompra: false, abaterRetornos: true, somarST: true
  });
}

function descreverFiltros(f) {
  const r = [];
  r.push(f.codigo ? `Cliente ${f.codigo}` : 'Todos os clientes');
  r.push(f.dataInicial || f.dataFinal ? `${isoParaBr(f.dataInicial) || '…'} a ${isoParaBr(f.dataFinal) || '…'}` : 'Sem período');
  r.push(f.status ? `Status: ${f.status}` : 'Todos os status');
  if (f.bloqueado) r.push(f.bloqueado === 'S' ? 'Bloqueados' : 'Não bloqueados');
  if (f.somenteSemCompra) r.push('Somente sem compra');
  return r;
}

// ajustes de cálculo (definidos em Configurações › Regras do score) — vão no PDF
function descreverCalculo(calculo) {
  if (!calculo) return [];
  return [
    calculo.abaterRetornos !== false ? 'Abatendo devoluções' : 'Sem abater devoluções',
    calculo.somarST !== false ? 'Somando ICMS-ST' : 'Sem ICMS-ST'
  ];
}

export default function Analise({ resultado, empresa, conexaoId, onResultado, onAbrir }) {
  const [f, setF] = useState(filtrosIniciais);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [perfilFiltro, setPerfilFiltro] = useState('');
  const [alertaFiltro, setAlertaFiltro] = useState('');
  const [filtrosAbertos, setFiltrosAbertos] = useState(() => lsGet('ac.filtrosAbertos', true));
  const [serasaAberta, setSerasaAberta] = useState(false);

  const alternarFiltros = () => { setFiltrosAbertos((v) => { lsSet('ac.filtrosAbertos', !v); return !v; }); };
  const muda = (campo) => (e) => setF({ ...f, [campo]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const analisar = async (e) => {
    e?.preventDefault();
    setErro(''); setCarregando(true);
    try {
      lsSet('ac.filtros', f);
      const r = await api.analisar(f);
      onResultado(r, f);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  };

  const linhas = resultado?.linhas || [];

  const resumo = useMemo(() => {
    const porPerfil = Object.fromEntries(PERFIS.map((p) => [p, 0]));
    let vendas = 0, inad = 0, sugerido = 0, sugeridoPeriodo = 0, inativos = 0, limite = 0;
    for (const l of linhas) {
      if (['atencao', 'critico'].includes(l.NivelInatividade)) inativos++;
      if (['atencao', 'critico'].includes(l.NivelExposicao)) limite++;
      porPerfil[l.PerfilCredito] = (porPerfil[l.PerfilCredito] || 0) + 1;
      vendas += Number(l.TotalVendasPeriodo) || 0;
      inad += Number(l.ValorInadimplente) || 0;
      sugerido += Number(l.LimiteSugerido) || 0;
      sugeridoPeriodo += Number(l.LimiteSugeridoPeriodo) || 0;
    }
    return { porPerfil, vendas, inad, sugerido, sugeridoPeriodo, inativos, limite };
  }, [linhas]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return linhas.filter((l) =>
      (!perfilFiltro || l.PerfilCredito === perfilFiltro) &&
      (!alertaFiltro || (alertaFiltro === 'inativo' ? ['atencao', 'critico'].includes(l.NivelInatividade) : ['atencao', 'critico'].includes(l.NivelExposicao))) &&
      (!t || `${l.ClienteID} ${l.Nome || ''} ${l.Nome_Fanta || ''} ${l.Cidade || ''}`.toLowerCase().includes(t)));
  }, [linhas, busca, perfilFiltro, alertaFiltro]);

  const { ordenadas, ordem, alternar } = useOrdenacao(filtradas, { campo: 'ScoreCredito', desc: true });

  const usados = resultado ? (lsGet('ac.filtros', f)) : f;
  const nomeBase = `analise-credito-${usados.dataInicial || 'geral'}-a-${usados.dataFinal || ''}`;

  const exportarExcel = async () => {
    try {
      const arq = await api.exportarExcel({ nomeArquivo: `${nomeBase}.xlsx`, abas: [{ nome: 'Análise de Crédito', colunas: COLUNAS_EXPORT, linhas: ordenadas }] });
      if (arq) api.abrirArquivo(arq);
    } catch (err) { setErro(err.message); }
  };

  const htmlRelatorio = () => montarRelatorio({
    titulo: 'Análise de Crédito',
    subtitulo: `${fmtNum(ordenadas.length)} cliente(s)${perfilFiltro ? ` · perfil ${perfilFiltro}` : ''}${alertaFiltro ? ` · ${alertaFiltro === 'inativo' ? 'inativos' : 'limite alto'}` : ''}${busca ? ` · busca "${busca}"` : ''}`,
    empresa,
    filtros: [...descreverFiltros(usados), ...descreverCalculo(resultado?.calculo)],
    paisagem: true,
    blocos: [
      {
        tipo: 'grade', colunas: 4, blocos: [
          { tipo: 'kv', itens: [['Clientes', fmtNum(ordenadas.length), true]] },
          { tipo: 'kv', itens: [['Vendas no período', fmtMoeda(ordenadas.reduce((s, l) => s + (Number(l.TotalVendasPeriodo) || 0), 0)), true]] },
          { tipo: 'kv', itens: [['Inadimplência', fmtMoeda(ordenadas.reduce((s, l) => s + (Number(l.ValorInadimplente) || 0), 0)), true]] },
          { tipo: 'kv', itens: [
            ['Limite sugerido (score)', fmtMoeda(ordenadas.reduce((s, l) => s + (Number(l.LimiteSugerido) || 0), 0)), true],
            ['Limite pelo período (total)', fmtMoeda(ordenadas.reduce((s, l) => s + (Number(l.LimiteSugeridoPeriodo) || 0), 0)), true]] }
        ]
      },
      { tipo: 'tabela', colunas: COLS_RELATORIO, linhas: ordenadas }
    ]
  });

  const pdf = async () => { try { await api.relatorioPdf({ html: htmlRelatorio(), nomeArquivo: `${nomeBase}.pdf`, paisagem: true }); } catch (err) { setErro(err.message); } };
  const imprimir = async () => { try { await api.relatorioImprimir({ html: htmlRelatorio(), paisagem: true }); } catch (err) { setErro(err.message); } };

  const topo = (
    <>
      <Recolhivel aberto={filtrosAbertos}>
        <form className="card filtros" onSubmit={analisar}>
          <label>Cliente (código)
            <input value={f.codigo} onChange={muda('codigo')} placeholder="Todos" maxLength={5} />
          </label>
          <label>Data inicial
            <input type="date" value={f.dataInicial} onChange={muda('dataInicial')} />
          </label>
          <label>Data final
            <input type="date" value={f.dataFinal} onChange={muda('dataFinal')} />
          </label>
          <label>Status
            <select value={f.status} onChange={muda('status')}>
              <option value="">Todos</option>
              <option value="Ativo">Ativo</option>
              <option value="Bloqueado">Bloqueado</option>
              <option value="Desativado">Desativado</option>
            </select>
          </label>
          <label>Bloqueio de venda
            <select value={f.bloqueado} onChange={muda('bloqueado')}>
              <option value="">Todos</option>
              <option value="S">Bloqueados</option>
              <option value="N">Não bloqueados</option>
            </select>
          </label>
          <div className="checks">
            <label className="switch"><input type="checkbox" checked={f.somenteSemCompra} onChange={muda('somenteSemCompra')} /><i />Somente sem compra</label>
          </div>
          <button className="btn primario grande" disabled={carregando}>
            {carregando ? <Loader2 size={16} className="gira" /> : <Play size={15} />}{carregando ? 'Analisando…' : 'Analisar'}
          </button>
        </form>
      </Recolhivel>

      {!filtrosAbertos && (
        <div className="filtros-resumo" onClick={alternarFiltros} title="Mostrar filtros">
          {descreverFiltros(f).map((t) => <span key={t}>{t}</span>)}
          <button className="btn primario pequeno" onClick={(e) => { e.stopPropagation(); analisar(); }} disabled={carregando}>
            {carregando ? <Loader2 size={14} className="gira" /> : <Play size={13} />}Analisar
          </button>
        </div>
      )}

      {erro && <div className="erro">{erro}</div>}

      {resultado && (
        <div className="resumo">
          <div className="kpi"><div className="kpi-ico azul"><Users size={18} /></div><div className="kpi-txt"><span>Clientes</span><strong title={fmtNum(linhas.length)}>{fmtNum(linhas.length)}</strong></div></div>
          <div className="kpi"><div className="kpi-ico verde"><TrendingUp size={18} /></div><div className="kpi-txt"><span>Vendas no período</span><strong title={fmtMoeda(resumo.vendas)}>{fmtMoeda(resumo.vendas)}</strong></div></div>
          <div className="kpi" title="Soma do limite sugerido pelo score (faixas) dos clientes listados"><div className="kpi-ico roxo"><Wallet size={18} /></div><div className="kpi-txt"><span>Limite sugerido (score)</span><strong title={fmtMoeda(resumo.sugerido)}>{fmtMoeda(resumo.sugerido)}</strong></div></div>
          <div className="kpi" title="Soma do limite pelo período (média de vendas a prazo × multiplicador do atraso)"><div className="kpi-ico ciano"><CalendarRange size={18} /></div><div className="kpi-txt"><span>Limite pelo período (total)</span><strong title={fmtMoeda(resumo.sugeridoPeriodo)}>{fmtMoeda(resumo.sugeridoPeriodo)}</strong></div></div>
          <div className="kpi"><div className="kpi-ico vermelho"><AlertTriangle size={18} /></div><div className="kpi-txt"><span>Inadimplência</span><strong className="txt-neg" title={fmtMoeda(resumo.inad)}>{fmtMoeda(resumo.inad)}</strong></div></div>
          <div className="kpi perfis">
            {PERFIS.map((p) => (
              <button key={p} className={`chip ${classePerfil(p)} ${perfilFiltro === p ? 'sel' : ''}`}
                onClick={() => setPerfilFiltro(perfilFiltro === p ? '' : p)} title="Filtrar pelo perfil">
                {p} <b>{resumo.porPerfil[p] || 0}</b>
              </button>
            ))}
            <span className="chips-sep" />
            <button className={`chip alerta-chip ${alertaFiltro === 'inativo' ? 'sel' : ''}`} onClick={() => setAlertaFiltro(alertaFiltro === 'inativo' ? '' : 'inativo')} title="Clientes inativos há mais de 3 meses">
              <Clock size={13} />Inativos <b>{resumo.inativos}</b>
            </button>
            <button className={`chip alerta-chip ${alertaFiltro === 'limite' ? 'sel' : ''}`} onClick={() => setAlertaFiltro(alertaFiltro === 'limite' ? '' : 'limite')} title="Uso do limite acima de 70%">
              <Gauge size={13} />Limite alto <b>{resumo.limite}</b>
            </button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="pagina cheia">
      <CabecalhoPagina
        titulo="Análise de Crédito"
        subtitulo="Score, limite e prazo sugeridos por cliente"
        filtrosAbertos={filtrosAbertos}
        onAlternarFiltros={alternarFiltros}
        acoes={<>
          <button className="btn serasa-btn" onClick={() => setSerasaAberta(true)} title="Consultar o Score Serasa de um cliente ou CPF/CNPJ">
            <ShieldCheck size={15} />Score Serasa
          </button>
          {resultado && <BotoesExportar onExcel={exportarExcel} onPdf={pdf} onImprimir={imprimir} desabilitado={!ordenadas.length} />}
        </>}
      />

      <AreaDividida topo={topo}>
        {resultado ? (
          <div className="card tabela-card">
            <div className="tabela-topo">
              <div className="busca">
                <Search size={15} />
                <input placeholder="Buscar por código, nome, fantasia ou cidade…" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
              <span className="muted pequeno">
                {fmtNum(ordenadas.length)} de {fmtNum(linhas.length)}
              </span>
              <Tempos segundos={resultado.segundos} tempos={resultado.tempos} />
            </div>
            <div className="tabela-wrap">
              <table className="tabela">
                <thead>
                  <tr>{COLS.map((c) => <Th key={c.campo} titulo={c.titulo} campo={c.campo} num={c.num} ordem={ordem} onOrdenar={alternar} />)}</tr>
                </thead>
                <tbody>
                  {ordenadas.map((l) => (
                    <tr key={l.ClienteID} onClick={() => onAbrir(l)}>
                      <td>
                        <div className="cli-nome">{l.Nome}</div>
                        <div className="cli-sub">{l.ClienteID}{l.Nome_Fanta ? ` · ${l.Nome_Fanta}` : ''}{l.Bloqueado === 'S' && <span className="tag-bloq">bloqueado</span>}</div>
                      </td>
                      <td>{l.Cidade || '—'}</td>
                      <td className="num"><span className={`score ${classePerfil(l.PerfilCredito)}`}>{l.ScoreCredito ?? '—'}</span></td>
                      <td><span className={`chip ${classePerfil(l.PerfilCredito)}`}>{l.PerfilCredito}</span></td>
                      <td className="num">{fmtMoeda(l.LimiteAtual)}</td>
                      <td className="num forte">{fmtMoeda(l.LimiteSugerido)}</td>
                      <td className="num forte">{fmtMoeda(l.LimiteSugeridoPeriodo)}</td>
                      <td className={`num ${CLASSE_NIVEL[l.NivelExposicao] || ''}`} title={l.AlertaExposicao}>
                        {Number(l.LimiteAtual) > 0 ? `${fmtNum(l.PercentualUsoLimite, 0)}%` : '—'}
                      </td>
                      <td className={`num ${Number(l.SaldoDisponivel) < 0 ? 'txt-neg' : ''}`}>{fmtMoeda(l.SaldoDisponivel)}</td>
                      <td className={`num ${Number(l.ValorInadimplente) > 0 ? 'txt-neg' : 'muted'}`}>{fmtMoeda(l.ValorInadimplente)}</td>
                      <td className="num">
                        <span className="atraso-cel">{l.AtrasoMedioDias} d<span className={`mini ${CLASSE_ATRASO[l.ClassificacaoAtraso] || ''}`}>{l.ClassificacaoAtraso}</span></span>
                      </td>
                      <td className="num">{fmtMoeda(l.TotalVendasPeriodo)}</td>
                      <td className="num">{fmtMoeda(l.MediaMes)}</td>
                      <td className={`num ${CLASSE_NIVEL[l.NivelInatividade] || ''}`} title={`${l.AlertaInatividade} · última compra ${fmtData(l.UltimaCompra)}`}>
                        {l.DiasSemComprar == null ? '—' : `${fmtNum(l.DiasSemComprar)} d`}
                      </td>
                    </tr>
                  ))}
                  {ordenadas.length === 0 && (
                    <tr className="sem-clique"><td colSpan={COLS.length} className="vazio">Nenhum cliente encontrado com esses filtros.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="card tabela-card centro">
            {carregando
              ? <Vazio icone={Loader2} titulo="Analisando clientes…" texto="Calculando score, limite e prazos." />
              : <Vazio icone={Gauge} titulo="Nenhuma análise ainda" texto="Defina os filtros e clique em Analisar." />}
          </div>
        )}
      </AreaDividida>
      {serasaAberta && <ConsultaSerasa conexaoId={conexaoId} onFechar={() => setSerasaAberta(false)} />}
    </div>
  );
}

// Tempo total da consulta; ao clicar mostra quanto cada etapa levou
function Tempos({ segundos, tempos = [] }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);
  const max = Math.max(1, ...tempos.map((t) => t.Ms || 0));
  return (
    <div className="tempos" ref={ref}>
      <button className="tempos-btn" onClick={() => setAberto(!aberto)} title="Ver o tempo de cada etapa">
        <Timer size={14} />{fmtNum(segundos, 1)}s
      </button>
      {aberto && (
        <div className="tempos-menu">
          <b>Tempo por etapa</b>
          {tempos.map((t) => (
            <div key={t.Etapa} className="tempo-linha">
              <div className="tempo-topo"><span>{t.Etapa}</span><span>{fmtNum((t.Ms || 0) / 1000, 2)}s</span></div>
              <div className="barra fina"><div className="barra-fill" style={{ width: `${((t.Ms || 0) / max) * 100}%` }} /></div>
              <small>{fmtNum(t.Linhas)} linha(s)</small>
            </div>
          ))}
          <p className="muted pequeno">Total incluindo rede e app: {fmtNum(segundos, 1)}s</p>
        </div>
      )}
    </div>
  );
}
