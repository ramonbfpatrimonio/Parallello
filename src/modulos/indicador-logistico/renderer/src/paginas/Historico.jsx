import React, { useEffect, useState } from 'react';
import { ArrowLeft, Trash2, Eye, Loader2, History } from 'lucide-react';
import { api } from '../lib/api';
import { fmt, fmtData, fmtDataHora } from '../lib/formato';
import { status, INDICADORES } from '../lib/status';
import { useAviso, Confirmar } from '../componentes/comum';
import PainelVisao from '../componentes/PainelVisao';

const CHAVE_TOTAL = { cumprimento: 'cumprimento', prazo: 'prazo', custo: 'custoEntrega', devolucao: 'devolucao' };

export default function Historico({ admin }) {
  const avisar = useAviso();
  const [lista, setLista] = useState(null);
  const [metas, setMetas] = useState(null);
  const [aberto, setAberto] = useState(null);
  const [excluir, setExcluir] = useState(null);

  const carregar = () => Promise.all([api('historico:listar'), api('metas:obter')])
    .then(([l, m]) => { setLista(l); setMetas(m); })
    .catch((e) => avisar(e.message, 'erro'));
  useEffect(() => { carregar(); }, []);

  async function abrir(id) {
    try { setAberto(await api('historico:obter', { id })); } catch (e) { avisar(e.message, 'erro'); }
  }

  async function confirmarExclusao() {
    try { await api('historico:excluir', { id: excluir }); setExcluir(null); carregar(); } catch (e) { avisar(e.message, 'erro'); }
  }

  if (aberto) {
    return (
      <div className="pagina">
        <div className="pagina-topo">
          <div>
            <button className="btn fantasma" style={{ marginLeft: -10, marginBottom: 6 }} onClick={() => setAberto(null)}><ArrowLeft size={16} /> Voltar ao histórico</button>
            <h1>Consulta de {fmtDataHora(aberto.geradoEm)}</h1>
            <p>Gerada por {aberto.usuario} · dados como estavam no momento da consulta</p>
          </div>
        </div>
        <PainelVisao resultado={aberto} metas={metas} />
      </div>
    );
  }

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <div><h1>Histórico</h1><p>Todas as consultas ficam salvas neste computador (últimas 100).</p></div>
      </div>
      <div className="card">
        {!lista ? <div className="vazio"><Loader2 className="girar" /></div> : !lista.length ? (
          <div className="vazio"><History size={36} /><p>Nenhuma consulta ainda.</p></div>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>Data / hora</th><th>Usuário</th><th>Período</th><th>Conexão</th><th>Centro de custo</th><th>Modo</th>
                {Object.values(INDICADORES).map((i) => <th key={i.nome} className="dir">{i.nome.replace(' de Entregas', '').replace(' de Entrega', '')}</th>)}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((h) => (
                <tr key={h.id}>
                  <td>{fmtDataHora(h.geradoEm)}</td>
                  <td>{h.usuario}</td>
                  <td>{fmtData(h.ini)} a {fmtData(h.fim)}</td>
                  <td>{h.selecaoRotulo}{h.falhas ? <span className="pilula critico" style={{ marginLeft: 6 }}>{h.falhas} falha(s)</span> : null}</td>
                  <td>{h.centroRotulo}</td>
                  <td><span className={`pilula ${h.modo === 'planilha' ? 'atencao' : 'destaque'}`}>{h.modo === 'planilha' ? 'Planilha' : 'Padrão'}</span></td>
                  {Object.entries(INDICADORES).map(([id, i]) => {
                    const v = h.totais?.[CHAVE_TOTAL[id]];
                    const st = status(v, metas?.[id]);
                    return <td key={id} className="dir num" style={{ color: st ? `var(--${st})` : undefined, fontWeight: 600 }}>{fmt(v, i.tipo)}</td>;
                  })}
                  <td className="dir" style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn pequeno" onClick={() => abrir(h.id)}><Eye size={15} /> Abrir</button>
                    {admin && <button className="btn fantasma icone perigo" style={{ marginLeft: 4 }} onClick={() => setExcluir(h.id)} title="Excluir"><Trash2 size={15} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {excluir && <Confirmar texto="Excluir esta consulta do histórico?" onSim={confirmarExclusao} onNao={() => setExcluir(null)} />}
    </div>
  );
}
