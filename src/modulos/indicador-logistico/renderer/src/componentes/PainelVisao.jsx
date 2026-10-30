import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Loader2, Truck, Clock, Coins, PackageX, Table2, BarChart3, CheckCircle2, XCircle, Users } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid, Cell } from 'recharts';
import { api } from '../lib/api';
import { fmt, fmtData, fmtDataHora } from '../lib/formato';
import { status, INDICADORES, textoMeta, legenda } from '../lib/status';
import { useAviso, PilulaStatus } from './comum';
import Detalhe from './Detalhe';

const ICONES = { cumprimento: Truck, prazo: Clock, custo: Coins, devolucao: PackageX };
const COR_BARRA = { ok: '#22c55e', atencao: '#eab308', critico: '#ef4444', null: '#14b8a6' };

export default function PainelVisao({ resultado, metas }) {
  const avisar = useAviso();
  const [visao, setVisao] = useState('tabelas');
  const [exportando, setExportando] = useState('');
  const [detalhe, setDetalhe] = useState(null);
  const linhas = useMemo(() => Object.fromEntries(resultado.blocos.flatMap((b) => b.linhas).map((l) => [l.id, l])), [resultado]);
  const f = resultado.filtros;
  const temDetalhe = !!resultado.detalhes;

  async function exportar(tipo) {
    setExportando(tipo);
    try {
      const arq = await api(tipo === 'excel' ? 'exportar:excel' : 'exportar:pdf', { resultado });
      if (arq) avisar('Arquivo salvo.', 'ok');
    } catch (e) {
      avisar(e.message, 'erro');
    } finally {
      setExportando('');
    }
  }

  function abrir(linha, col) {
    if (!temDetalhe || !linha.drill) return;
    setDetalhe({ linha, col });
  }

  return (
    <>
      <div className="faixa-info">
        <span className={`pilula ${resultado.modo === 'planilha' ? 'atencao' : 'destaque'}`}>{resultado.modo === 'planilha' ? 'Modo planilha' : 'Modo padrão'}</span>
        {resultado.conexoes.map((c) => (
          <span key={c.nome} className={`pilula ${c.ok ? 'neutra' : 'critico'}`} title={c.erro || 'Consultada com sucesso'}>
            {c.ok ? <CheckCircle2 size={13} color="var(--ok)" /> : <XCircle size={13} />} {c.nome}
          </span>
        ))}
        {resultado.unificados > 0 && (
          <span className="pilula neutra" title="Pedidos do mesmo cliente no mesmo dia em outra conexão, contados uma vez só"><Users size={13} /> {resultado.unificados} unificados</span>
        )}
        <small>{fmtData(f.ini)} a {fmtData(f.fim)} · {f.selecaoRotulo} · Custo {f.centroRotulo} · {fmtDataHora(resultado.geradoEm)}</small>
        <span className="sep" />
        <div className="segmentado">
          <button className={visao === 'tabelas' ? 'ativo' : ''} onClick={() => setVisao('tabelas')}><Table2 size={15} style={{ verticalAlign: -3 }} /> Tabelas</button>
          <button className={visao === 'graficos' ? 'ativo' : ''} onClick={() => setVisao('graficos')}><BarChart3 size={15} style={{ verticalAlign: -3 }} /> Gráficos</button>
        </div>
        <button className="btn" onClick={() => exportar('excel')} disabled={!!exportando}>
          {exportando === 'excel' ? <Loader2 size={16} className="girar" /> : <FileSpreadsheet size={16} color="#15803d" />} Excel
        </button>
        <button className="btn" onClick={() => exportar('pdf')} disabled={!!exportando}>
          {exportando === 'pdf' ? <Loader2 size={16} className="girar" /> : <FileText size={16} color="#b91c1c" />} PDF
        </button>
      </div>

      {resultado.conexoes.filter((c) => !c.ok).map((c) => (
        <div key={c.nome} className="alerta erro" style={{ marginBottom: 12 }}><XCircle size={16} /><span><b>{c.nome}</b> não respondeu e ficou fora do painel: {c.erro}</span></div>
      ))}

      <div className="kpis">
        {Object.entries(INDICADORES).map(([id, ind]) => {
          const l = linhas[ind.linha];
          const st = status(l?.total, metas[id]);
          const Icone = ICONES[id];
          return (
            <div key={id} className={`card kpi ${st || ''}`}>
              <div className="kpi-topo">{ind.nome}<Icone size={18} /></div>
              <div className="kpi-valor num">{fmt(l?.total, ind.tipo)}{id === 'prazo' && l?.total != null ? <small style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 500 }}> dias</small> : null}</div>
              <div className="kpi-rodape"><span>{textoMeta(metas[id], ind.tipo)}</span><PilulaStatus st={st} dica={legenda(metas[id], ind.tipo)} /></div>
              {st && metas[id]?.textos?.[st] && <div className="kpi-texto">{metas[id].textos[st]}</div>}
            </div>
          );
        })}
      </div>

      {visao === 'tabelas' ? (
        <>
          {resultado.blocos.map((b) => (
            <Bloco key={b.id} bloco={b} colunas={resultado.colunas} metas={metas} onClicar={abrir} temDetalhe={temDetalhe} />
          ))}
          <div className="legenda-cores">
            <b>Entregas programadas:</b>
            <span><i style={{ background: 'var(--ok-bg)', border: '1px solid #86efac' }} /> todas carregadas</span>
            <span><i style={{ background: 'var(--atencao-bg)', border: '1px solid #fcd34d' }} /> carregamento parcial</span>
            <span><i style={{ background: 'var(--critico-bg)', border: '1px solid #fca5a5' }} /> nada carregado</span>
            {temDetalhe && <span style={{ marginLeft: 'auto' }}>Clique em um número para ver os pedidos que formam o valor.</span>}
          </div>
        </>
      ) : (
        <div className="graficos">
          {Object.entries(INDICADORES).map(([id, ind]) => (
            <Grafico key={id} id={id} ind={ind} linha={linhas[ind.linha]} colunas={resultado.colunas} meta={metas[id]} />
          ))}
        </div>
      )}

      {detalhe && <Detalhe resultado={resultado} {...detalhe} onFechar={() => setDetalhe(null)} />}
    </>
  );
}

function Bloco({ bloco, colunas, metas, onClicar, temDetalhe }) {
  const principal = bloco.linhas.find((l) => l.indicador);
  const metaP = principal ? metas[principal.indicador] : null;
  const stTotal = principal ? status(principal.total, metaP) : null;
  const dica = principal ? legenda(metaP, principal.tipo) : '';
  return (
    <div className="card bloco">
      <div className="card-cab">
        <h2>{bloco.titulo}</h2>
        <span className="sub">{metaP?.ativo && stTotal ? metaP.textos?.[stTotal] : ''}</span>
      </div>
      <div className="rolagem">
        <table className="ind">
          <thead>
            <tr>
              <th className="nome">Indicador</th>
              <th style={{ textAlign: 'center' }}>Unid.</th>
              {colunas.map((c) => <th key={c.key}>{c.label}</th>)}
              <th>Total / Média</th>
              <th style={{ textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {bloco.linhas.map((l) => {
              const meta = l.indicador ? metas[l.indicador] : null;
              const clicavel = temDetalhe && l.drill;
              return (
                <tr key={l.id} className={l.indicador ? 'principal' : ''}>
                  <th className="nome">{l.nome}</th>
                  <td className="unid">{l.unid}</td>
                  {colunas.map((c) => {
                    const v = l.valores[c.key];
                    const cor = l.cores?.[c.key] || (meta ? status(v, meta) : null);
                    return (
                      <td key={c.key} className={`${cor ? 'c-' + cor : ''} ${clicavel && v ? 'clicavel' : ''}`} onClick={() => clicavel && v && onClicar(l, c)}>
                        {fmt(v, l.tipo)}
                      </td>
                    );
                  })}
                  <td className={`total ${clicavel && l.total ? 'clicavel' : ''}`} onClick={() => clicavel && l.total && onClicar(l, null)}>{fmt(l.total, l.tipo)}</td>
                  <td className="status">{l.indicador ? <PilulaStatus st={stTotal} dica={dica} semMeta={metaP?.ativo ? '—' : 'Sem meta'} /> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Grafico({ id, ind, linha, colunas, meta }) {
  const escala = ind.tipo === 'pct' ? 100 : 1;
  const dados = colunas.map((c) => {
    const v = linha?.valores[c.key];
    return { mes: c.label, valor: v === null || v === undefined ? null : v * escala, st: status(v, meta) };
  });
  const fmtEixo = (v) => (ind.tipo === 'pct' ? `${v}%` : ind.tipo === 'moeda' ? `R$ ${v}` : v);
  return (
    <div className="card">
      <div className="card-cab">
        <h2>{ind.nome}</h2>
        <div className="grafico-legenda">
          {meta?.ativo && <span><i style={{ background: '#0f3d3a', height: 2, verticalAlign: 3 }} />{textoMeta(meta, ind.tipo)}</span>}
          <span>Total: <b className="num">{fmt(linha?.total, ind.tipo)}</b></span>
        </div>
      </div>
      <div style={{ height: 260, padding: '12px 12px 4px 0' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#e9eff1" />
            <XAxis dataKey="mes" tickLine={false} axisLine={{ stroke: '#dbe4e7' }} fontSize={12} />
            <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={fmtEixo} width={70} />
            <Tooltip
              cursor={{ fill: 'rgba(15,118,110,0.06)' }}
              formatter={(v) => [fmt(v / escala, ind.tipo), ind.nome]}
              contentStyle={{ borderRadius: 8, border: '1px solid #dbe4e7', fontSize: 13 }}
            />
            {meta?.ativo && <ReferenceLine y={meta.meta * escala} stroke="#0f3d3a" strokeDasharray="5 4" strokeWidth={1.5} />}
            <Bar dataKey="valor" radius={[4, 4, 0, 0]} maxBarSize={42}>
              {dados.map((d, i) => <Cell key={i} fill={COR_BARRA[d.st]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
