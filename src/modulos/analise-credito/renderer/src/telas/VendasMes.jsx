import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Loader2, Play } from 'lucide-react';
import { api, fmtMoeda, fmtNum, MESES, MESES_LONGOS, montarPivot, useOrdenacao, lsGet, lsSet } from '../util.js';
import { Th, CabecalhoPagina, Recolhivel, BotoesExportar, AreaDividida, Vazio } from '../componentes.jsx';
import { montarRelatorio } from '../relatorio.js';

// Usado como tela própria (cliente opcional) e dentro da ficha (codigoFixo)
export default function VendasMes({ codigoFixo, empresa, onDados }) {
  const embutido = !!codigoFixo;
  const [codigo, setCodigo] = useState(codigoFixo || '');
  const [codigoConsultado, setCodigoConsultado] = useState(codigoFixo || '');
  // abater devoluções e somar ICMS-ST vêm de Área do sistema › Configuração
  const [calculo, setCalculo] = useState(null);
  const abater = calculo ? calculo.abaterRetornos !== false : true;
  const somarST = calculo ? calculo.somarST !== false : true;
  const [linhas, setLinhas] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [anoSel, setAnoSel] = useState(null);
  const [qtdAnos, setQtdAnos] = useState(() => lsGet('ac.vendasQtdAnos', 3));
  const mudarQtdAnos = (n) => { setQtdAnos(n); lsSet('ac.vendasQtdAnos', n); };
  const [filtrosAbertos, setFiltrosAbertos] = useState(() => lsGet('ac.vendasFiltrosAbertos', true));

  const buscar = async (cod = codigo) => {
    setErro(''); setCarregando(true);
    try {
      const r = await api.vendasMes({ codigo: cod });
      setLinhas(r.linhas);
      setCalculo(r.calculo);
      setCodigoConsultado(cod);
      onDados?.(r.linhas);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  };

  useEffect(() => { if (embutido) buscar(codigoFixo); }, [codigoFixo]);

  // pivot completo e o recorte dos últimos N anos (gráfico, tabela e exportações usam o recorte)
  const pivotCompleto = useMemo(() => (linhas ? montarPivot(linhas, true) : null), [linhas]);
  const pivot = useMemo(() => {
    if (!pivotCompleto) return null;
    const anos = pivotCompleto.anos.slice(-qtdAnos);
    const totalMeses = Array(12).fill(0).map((_, i) => anos.reduce((s, a) => s + a.meses[i], 0));
    return { anos, totalMeses, totalGeral: totalMeses.reduce((s, v) => s + v, 0) };
  }, [pivotCompleto, qtdAnos]);
  const { ordenadas: anosOrd, ordem, alternar } = useOrdenacao(pivot?.anos || [], { campo: 'ano', desc: false });

  // cores dos anos: o mais recente em azul forte, os anteriores em cores bem distintas
  const CORES = ['#2457c5', '#00a3b4', '#f0a40b', '#8b5cf6', '#e0567a', '#2b9a4a', '#64748b', '#b45309', '#0ea5e9', '#a78bfa'];
  const anosGrafico = pivot?.anos || [];
  const corDoAno = (ano) => CORES[Math.max(0, anosGrafico.length - 1 - anosGrafico.findIndex((a) => a.ano === ano)) % CORES.length];
  const maxMes = Math.max(1, ...anosGrafico.flatMap((a) => a.meses.map((v) => Math.abs(v))));
  const alvo = codigoConsultado ? `cliente ${codigoConsultado}` : 'empresa toda';

  const colunasRel = [{ titulo: 'Ano', campo: 'ano' }, ...MESES.map((m, i) => ({ titulo: m, campo: `m${i}`, tipo: 'moeda' })), { titulo: 'Total ano', campo: 'total', tipo: 'moeda' }];
  const rotuloTotal = `TOTAL (${anosGrafico.length} ${anosGrafico.length === 1 ? 'ano' : 'anos'})`;
  const rodape = () => ({ ano: rotuloTotal, total: pivot.totalGeral, ...Object.fromEntries(pivot.totalMeses.map((v, i) => [`m${i}`, v])) });

  const exportarExcel = async () => {
    const colunas = [{ titulo: 'Ano', campo: 'Ano' },
      ...MESES_LONGOS.map((m, i) => ({ titulo: m, campo: `m${i}`, tipo: 'moeda', largura: 14 })),
      { titulo: 'Total Ano', campo: 'total', tipo: 'moeda', largura: 16 }];
    const dados = anosOrd.map((a) => ({ ...a, Ano: String(a.ano) }));
    dados.push({ ...rodape(), Ano: rotuloTotal });
    try {
      const arq = await api.exportarExcel({ nomeArquivo: `vendas-por-mes-${codigoConsultado || 'geral'}.xlsx`, abas: [{ nome: 'Vendas por Mês', colunas, linhas: dados }] });
      if (arq) api.abrirArquivo(arq);
    } catch (err) { setErro(err.message); }
  };

  const html = () => montarRelatorio({
    titulo: 'Vendas por Ano e Mês',
    subtitulo: `Últimos ${qtdAnos} anos — ${alvo}`,
    empresa,
    filtros: [abater ? 'Abatendo devoluções (no mês da devolução)' : 'Sem abater devoluções', somarST ? 'Somando ICMS-ST' : 'Sem ICMS-ST'],
    paisagem: true,
    blocos: [{ tipo: 'tabela', colunas: colunasRel, linhas: anosOrd, rodape: rodape() }]
  });
  const pdf = () => api.relatorioPdf({ html: html(), nomeArquivo: `vendas-por-mes-${codigoConsultado || 'geral'}.pdf`, paisagem: true }).catch((e) => setErro(e.message));
  const imprimir = () => api.relatorioImprimir({ html: html(), paisagem: true }).catch((e) => setErro(e.message));

  // ---------- gráfico: 3 tipos, escolhidos na lista suspensa da própria guia
  const [tipoGrafico, setTipoGrafico] = useState(() => lsGet('ac.vendasTipoGrafico', 'agrupado'));
  const mudarTipo = (t) => { setTipoGrafico(t); lsSet('ac.vendasTipoGrafico', t); };
  const comVenda = anosGrafico.filter((a) => a.total !== 0);
  const anoUnico = anosGrafico.find((a) => a.ano === anoSel) || comVenda[comVenda.length - 1] || anosGrafico[anosGrafico.length - 1];

  const seletorTipo = (
    <label className="tipo-grafico" title="Escolha o tipo de gráfico">
      <span>Gráfico</span>
      <select value={tipoGrafico} onChange={(e) => mudarTipo(e.target.value)}>
        <option value="agrupado">Barras por ano (comparativo)</option>
        <option value="linhas">Linhas por ano</option>
        <option value="ano">Barras de um ano</option>
      </select>
    </label>
  );
  const filtroAnos = (
    <div className="anos-filtro" title="Quantos anos mostrar no gráfico e na tabela">
      <span>Últimos</span>
      {[3, 5, 7, 10].map((n) => (
        <button key={n} className={qtdAnos === n ? 'sel' : ''} onClick={() => mudarQtdAnos(n)}>{n}</button>
      ))}
      <span>anos</span>
    </div>
  );
  const legenda = (
    <div className="vendas-legenda">
      {anosGrafico.map((a) => (
        <button key={a.ano} className={`leg-ano ${anoSel === a.ano ? 'sel' : ''}`} onClick={() => setAnoSel(anoSel === a.ano ? null : a.ano)}
          title={`Total de ${a.ano}: ${fmtMoeda(a.total)} — clique para destacar`}>
          <i style={{ background: corDoAno(a.ano) }} /><b>{a.ano}</b><span>{fmtMoeda(a.total)}</span>
        </button>
      ))}
    </div>
  );
  const botoesAno = (
    <div className="vendas-legenda">
      {anosGrafico.map((a) => (
        <button key={a.ano} className={`ano-btn ${anoUnico?.ano === a.ano ? 'sel' : ''}`} onClick={() => setAnoSel(a.ano)} title={`Total de ${a.ano}: ${fmtMoeda(a.total)}`}>{a.ano}</button>
      ))}
    </div>
  );

  const graficoAgrupado = (
    <div className="grafico agrupado">
      {MESES.map((m, i) => (
        <div key={m} className="gcol">
          <div className="gbarras">
            {anosGrafico.map((a) => {
              const v = a.meses[i];
              const apagado = anoSel && anoSel !== a.ano;
              return (
                <div key={a.ano} className={`gb ${v < 0 ? 'neg' : ''}`} title={`${MESES_LONGOS[i]}/${a.ano}: ${fmtMoeda(v)}`}
                  style={{ height: `${(Math.abs(v) / maxMes) * 100}%`, background: v < 0 ? undefined : corDoAno(a.ano), opacity: apagado ? 0.22 : 1 }} />
              );
            })}
          </div>
          <div className="gmes">{m}</div>
        </div>
      ))}
    </div>
  );

  const maxAno = anoUnico ? Math.max(1, ...anoUnico.meses.map((v) => Math.abs(v))) : 1;
  const graficoAno = anoUnico && (
    <div className="grafico">
      {anoUnico.meses.map((v, i) => (
        <div key={i} className="gcol" title={`${MESES_LONGOS[i]}/${anoUnico.ano}: ${fmtMoeda(v)}`}>
          <div className="gval">{v ? fmtNum(Math.round(v)) : ''}</div>
          <div className={`gbar ${v < 0 ? 'neg' : ''}`} style={{ height: `${(Math.abs(v) / maxAno) * 100}%` }} />
          <div className="gmes">{MESES[i]}</div>
        </div>
      ))}
    </div>
  );

  const graficoLinhas = <GraficoLinhas anos={anosGrafico} corDoAno={corDoAno} anoSel={anoSel} />;

  const grafico = pivot && (
    <div className="vendas-grafico">
      <div className="vendas-grafico-topo">
        <div className="vendas-grafico-ctrl">{seletorTipo}{filtroAnos}</div>
        {tipoGrafico === 'ano' ? botoesAno : legenda}
      </div>
      {tipoGrafico === 'linhas' ? graficoLinhas : tipoGrafico === 'ano' ? graficoAno : graficoAgrupado}
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
            <tr key={a.ano} className={anoSel === a.ano ? 'sel' : ''} onClick={() => setAnoSel(anoSel === a.ano ? null : a.ano)}>
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
            <td>{rotuloTotal}</td>
            {pivot.totalMeses.map((v, i) => <td key={i} className="num">{fmtMoeda(v)}</td>)}
            <td className="num">{fmtMoeda(pivot.totalGeral)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );

  const chaveAbater = calculo && (
    <span className="calculo-info" title="Definido em Área do sistema › Configuração">
      {abater ? 'Abatendo devoluções' : 'Sem abater devoluções'} · {somarST ? 'Somando ICMS-ST' : 'Sem ICMS-ST'}
    </span>
  );

  if (embutido) {
    return (
      <div className="card">
        <div className="tabela-topo">
          <h3><BarChart3 size={16} /> Vendas por ano e mês <span className="muted pequeno">(últimos {qtdAnos} anos)</span></h3>
          <div className="acoes-inline">{chaveAbater}</div>
        </div>
        {erro && <div className="erro">{erro}</div>}
        {carregando && <p className="muted">Carregando…</p>}
        {pivot && !carregando && <>{grafico}<div className="pivot-embutido">{tabela}</div></>}
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
          {chaveAbater}
          <button className="btn primario grande" disabled={carregando}>
            {carregando ? <Loader2 size={16} className="gira" /> : <Play size={15} />}{carregando ? 'Consultando…' : 'Consultar'}
          </button>
        </form>
      </Recolhivel>
      {!filtrosAbertos && (
        <div className="filtros-resumo" onClick={alternarFiltros}>
          <span>{codigo ? `Cliente ${codigo}` : 'Empresa toda'}</span>

        </div>
      )}
      {erro && <div className="erro">{erro}</div>}
      {pivot && <div className="card grafico-card">{grafico}</div>}
    </>
  );

  return (
    <div className="pagina cheia">
      <CabecalhoPagina
        titulo="Vendas por Mês"
        subtitulo="Últimos 3, 5, 7 ou 10 anos por mês; devoluções abatidas no mês em que ocorreram"
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

// valor curto para o eixo: 66 mil, 1,2 mi
function curto(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (a >= 1e3) return `${Math.round(v / 1e3).toLocaleString('pt-BR')} mil`;
  return Math.round(v).toLocaleString('pt-BR');
}

// Gráfico de linhas: um ano por linha, meses no eixo X (SVG, escala automática)
function GraficoLinhas({ anos, corDoAno, anoSel }) {
  const W = 1200, H = 250, esq = 58, dir = 14, topo = 12, base = 28;
  const valores = anos.flatMap((a) => a.meses);
  const minV = Math.min(0, ...valores);
  const maxV = Math.max(1, ...valores);
  const passoBruto = (maxV - minV) / 4;
  const mag = 10 ** Math.floor(Math.log10(passoBruto || 1));
  const passo = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((p) => p >= passoBruto) || passoBruto;
  const y0 = Math.floor(minV / passo) * passo;
  const y1 = Math.max(y0 + passo, Math.ceil(maxV / passo) * passo);
  const X = (i) => esq + ((W - esq - dir) * (i + 0.5)) / 12;
  const Y = (v) => topo + (H - topo - base) * (1 - (v - y0) / (y1 - y0));
  const marcas = [];
  for (let v = y0; v <= y1 + passo / 2; v += passo) marcas.push(v);
  // o ano destacado é desenhado por último, por cima dos outros
  const ordem = [...anos].sort((a, b) => (a.ano === anoSel) - (b.ano === anoSel));
  return (
    <svg className="grafico-linhas" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Vendas por mês, uma linha por ano">
      {marcas.map((v) => (
        <g key={v}>
          <line x1={esq} x2={W - dir} y1={Y(v)} y2={Y(v)} className={v === 0 ? 'eixo' : 'grade'} />
          <text x={esq - 8} y={Y(v) + 4} textAnchor="end" className="rot">{curto(v)}</text>
        </g>
      ))}
      {MESES.map((m, i) => <text key={m} x={X(i)} y={H - 8} textAnchor="middle" className="rot">{m}</text>)}
      {ordem.map((a) => {
        const apagado = anoSel && anoSel !== a.ano;
        const cor = corDoAno(a.ano);
        // no ano atual a linha para no mês corrente (os meses que ainda não chegaram não descem a zero)
        const hoje = new Date();
        const meses = a.ano === hoje.getFullYear() ? a.meses.slice(0, hoje.getMonth() + 1) : a.meses;
        return (
          <g key={a.ano} opacity={apagado ? 0.18 : 1}>
            <polyline points={meses.map((v, i) => `${X(i)},${Y(v)}`).join(' ')} fill="none" stroke={cor} strokeWidth={anoSel === a.ano ? 3.2 : 2.2} strokeLinejoin="round" />
            {meses.map((v, i) => (
              <circle key={i} cx={X(i)} cy={Y(v)} r={anoSel === a.ano ? 5 : 4} fill="#fff" stroke={cor} strokeWidth="2">
                <title>{`${MESES_LONGOS[i]}/${a.ano}: ${fmtMoeda(v)}`}</title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
