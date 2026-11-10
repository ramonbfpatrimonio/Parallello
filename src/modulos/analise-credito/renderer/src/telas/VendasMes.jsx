import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Loader2, Play } from 'lucide-react';
import { api, fmtMoeda, MESES, MESES_LONGOS, montarPivot, useOrdenacao, lsGet, lsSet } from '../util.js';
import { Th, CabecalhoPagina, Recolhivel, BotoesExportar, AreaDividida, Vazio } from '../componentes.jsx';
import { montarRelatorio } from '../relatorio.js';

// Usado como tela própria (cliente opcional) e dentro da ficha (codigoFixo)
export default function VendasMes({ codigoFixo, abaterInicial = true, empresa, onDados }) {
  const embutido = !!codigoFixo;
  const [codigo, setCodigo] = useState(codigoFixo || '');
  const [codigoConsultado, setCodigoConsultado] = useState(codigoFixo || '');
  const [abater, setAbater] = useState(abaterInicial);
  const [linhas, setLinhas] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [anoSel, setAnoSel] = useState(null);
  const [filtrosAbertos, setFiltrosAbertos] = useState(() => lsGet('ac.vendasFiltrosAbertos', true));

  const buscar = async (cod = codigo) => {
    setErro(''); setCarregando(true);
    try {
      const r = await api.vendasMes({ codigo: cod, abaterRetornos: true });
      setLinhas(r);
      setCodigoConsultado(cod);
      onDados?.(r);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  };

  useEffect(() => { if (embutido) buscar(codigoFixo); }, [codigoFixo]);

  const pivot = useMemo(() => (linhas ? montarPivot(linhas, abater) : null), [linhas, abater]);
  const { ordenadas: anosOrd, ordem, alternar } = useOrdenacao(pivot?.anos || [], { campo: 'ano', desc: false });

  useEffect(() => {
    if (!pivot) return;
    const comVenda = pivot.anos.filter((a) => a.total !== 0);
    setAnoSel((comVenda[comVenda.length - 1] || pivot.anos[pivot.anos.length - 1])?.ano ?? null);
  }, [pivot]);

  const anoDados = pivot?.anos.find((a) => a.ano === anoSel);
  const maxMes = anoDados ? Math.max(1, ...anoDados.meses.map((v) => Math.abs(v))) : 1;
  const alvo = codigoConsultado ? `cliente ${codigoConsultado}` : 'empresa toda';

  const colunasRel = [{ titulo: 'Ano', campo: 'ano' }, ...MESES.map((m, i) => ({ titulo: m, campo: `m${i}`, tipo: 'moeda' })), { titulo: 'Total ano', campo: 'total', tipo: 'moeda' }];
  const rodape = () => ({ ano: 'TOTAL GERAL', total: pivot.totalGeral, ...Object.fromEntries(pivot.totalMeses.map((v, i) => [`m${i}`, v])) });

  const exportarExcel = async () => {
    const colunas = [{ titulo: 'Ano', campo: 'Ano' },
      ...MESES_LONGOS.map((m, i) => ({ titulo: m, campo: `m${i}`, tipo: 'moeda', largura: 14 })),
      { titulo: 'Total Ano', campo: 'total', tipo: 'moeda', largura: 16 }];
    const dados = anosOrd.map((a) => ({ ...a, Ano: String(a.ano) }));
    dados.push({ ...rodape(), Ano: 'TOTAL GERAL' });
    try {
      const arq = await api.exportarExcel({ nomeArquivo: `vendas-por-mes-${codigoConsultado || 'geral'}.xlsx`, abas: [{ nome: 'Vendas por Mês', colunas, linhas: dados }] });
      if (arq) api.abrirArquivo(arq);
    } catch (err) { setErro(err.message); }
  };

  const html = () => montarRelatorio({
    titulo: 'Vendas por Ano e Mês',
    subtitulo: `Histórico completo — ${alvo}`,
    empresa,
    filtros: [abater ? 'Abatendo devoluções' : 'Sem abater devoluções'],
    paisagem: true,
    blocos: [{ tipo: 'tabela', colunas: colunasRel, linhas: anosOrd, rodape: rodape() }]
  });
  const pdf = () => api.relatorioPdf({ html: html(), nomeArquivo: `vendas-por-mes-${codigoConsultado || 'geral'}.pdf`, paisagem: true }).catch((e) => setErro(e.message));
  const imprimir = () => api.relatorioImprimir({ html: html(), paisagem: true }).catch((e) => setErro(e.message));

  const grafico = anoDados && (
    <div className="grafico">
      {anoDados.meses.map((v, i) => (
        <div key={i} className="gcol" title={`${MESES_LONGOS[i]}/${anoDados.ano}: ${fmtMoeda(v)}`}>
          <div className="gval">{v ? fmtMoeda(v).replace('R$', '').trim().replace(/,\d\d$/, '') : ''}</div>
          <div className={`gbar ${v < 0 ? 'neg' : ''}`} style={{ height: `${(Math.abs(v) / maxMes) * 100}%` }} />
          <div className="gmes">{MESES[i]}</div>
        </div>
      ))}
    </div>
  );

  const chipsAnos = pivot && (
    <div className="anos-chips">
      {pivot.anos.map((a) => (
        <button key={a.ano} className={`chip ano ${anoSel === a.ano ? 'sel' : ''}`} onClick={() => setAnoSel(a.ano)}>{a.ano}</button>
      ))}
    </div>
  );

  const tabela = pivot && (
    <div className="tabela-wrap">
      <table className="tabela pivot">
        <thead>
          <tr>
            <Th titulo="Ano" campo="ano" ordem={ordem} onOrdenar={alternar} />
            {MESES.map((m, i) => <Th key={m} titulo={m} campo={`m${i}`} num ordem={ordem} onOrdenar={alternar} />)}
            <Th titulo="Total ano" campo="total" num ordem={ordem} onOrdenar={alternar} />
          </tr>
        </thead>
        <tbody>
          {anosOrd.map((a) => (
            <tr key={a.ano} className={anoSel === a.ano ? 'sel' : ''} onClick={() => setAnoSel(a.ano)}>
              <td className="forte">{a.ano}</td>
              {a.meses.map((v, i) => (
                <td key={i} className={`num ${v < 0 ? 'txt-neg' : v === 0 ? 'muted' : ''}`}
                  title={abater ? `Vendas ${fmtMoeda(a.brutas[i])} − devoluções ${fmtMoeda(a.devol[i])}` : ''}>
                  {fmtMoeda(v)}
                </td>
              ))}
              <td className="num forte">{fmtMoeda(a.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="total">
            <td>TOTAL GERAL</td>
            {pivot.totalMeses.map((v, i) => <td key={i} className="num">{fmtMoeda(v)}</td>)}
            <td className="num">{fmtMoeda(pivot.totalGeral)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );

  const chaveAbater = (
    <label className="switch"><input type="checkbox" checked={abater} onChange={(e) => setAbater(e.target.checked)} /><i />Abater devoluções</label>
  );

  if (embutido) {
    return (
      <div className="card">
        <div className="tabela-topo">
          <h3><BarChart3 size={16} /> Vendas por ano e mês <span className="muted pequeno">(histórico completo)</span></h3>
          <div className="acoes-inline">{chaveAbater}</div>
        </div>
        {erro && <div className="erro">{erro}</div>}
        {carregando && <p className="muted">Carregando…</p>}
        {pivot && !carregando && <>{chipsAnos}{grafico}<div className="pivot-embutido">{tabela}</div></>}
      </div>
    );
  }

  const alternarFiltros = () => setFiltrosAbertos((v) => { lsSet('ac.vendasFiltrosAbertos', !v); return !v; });

  const topo = (
    <>
      <Recolhivel aberto={filtrosAbertos}>
        <form className="card filtros" onSubmit={(e) => { e.preventDefault(); buscar(); }}>
          <label>Cliente (código)
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Todos (empresa)" maxLength={5} />
          </label>
          <div className="checks">{chaveAbater}</div>
          <button className="btn primario grande" disabled={carregando}>
            {carregando ? <Loader2 size={16} className="gira" /> : <Play size={15} />}{carregando ? 'Consultando…' : 'Consultar'}
          </button>
        </form>
      </Recolhivel>
      {!filtrosAbertos && (
        <div className="filtros-resumo" onClick={alternarFiltros}>
          <span>{codigo ? `Cliente ${codigo}` : 'Empresa toda'}</span>
          <span>{abater ? 'Abatendo devoluções' : 'Sem abater devoluções'}</span>
        </div>
      )}
      {erro && <div className="erro">{erro}</div>}
      {pivot && <div className="card grafico-card">{chipsAnos}{grafico}</div>}
    </>
  );

  return (
    <div className="pagina cheia">
      <CabecalhoPagina
        titulo="Vendas por Mês"
        subtitulo="Histórico completo por ano e mês, com abatimento das devoluções pelo pedido de origem"
        filtrosAbertos={filtrosAbertos}
        onAlternarFiltros={alternarFiltros}
        acoes={pivot && <BotoesExportar onExcel={exportarExcel} onPdf={pdf} onImprimir={imprimir} />}
      />
      <AreaDividida topo={topo}>
        <div className={`card tabela-card ${pivot ? '' : 'centro'}`}>
          {pivot ? tabela : (
            carregando
              ? <Vazio icone={Loader2} titulo="Consultando vendas…" />
              : <Vazio icone={BarChart3} titulo="Nenhuma consulta ainda" texto="Informe um cliente (ou deixe vazio para a empresa toda) e clique em Consultar." />
          )}
        </div>
      </AreaDividida>
    </div>
  );
}
