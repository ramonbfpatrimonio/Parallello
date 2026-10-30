import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Modal } from './comum';
import { fmt, fmtData } from '../lib/formato';

const FILTROS = {
  programadas: () => true,
  realizadas: (p) => p.realizada,
  carregadas: (p) => p.carregada,
  comPrazo: (p) => p.dias !== null,
  devolvidos: (p) => p.devolvido
};
const LIMITE = 2000;

export default function Detalhe({ resultado, linha, col, onFechar }) {
  const [busca, setBusca] = useState('');
  const custos = linha.drill === 'custos';
  const periodo = col ? col.label : 'Período inteiro';

  const itens = useMemo(() => {
    const base = custos ? resultado.detalhes.custos : resultado.detalhes.pedidos.filter(FILTROS[linha.drill] || (() => true));
    const doMes = col ? base.filter((x) => x.mes === col.key) : base;
    const t = busca.trim().toLowerCase();
    if (!t) return doMes;
    return doMes.filter((x) => Object.values(x).some((v) => String(v ?? '').toLowerCase().includes(t)));
  }, [resultado, linha, col, busca, custos]);

  const soma = custos ? itens.reduce((a, c) => a + c.valor, 0) : null;

  return (
    <Modal largo titulo={`${linha.nome} — ${periodo}`} onFechar={onFechar}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <div className="campo" style={{ flex: 1, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--muted)' }} />
          <input style={{ paddingLeft: 32 }} placeholder="Buscar por pedido, carga, cliente, inscrição…" value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
        </div>
        <span className="pilula destaque">{itens.length.toLocaleString('pt-BR')} {custos ? 'lançamentos' : 'pedidos'}</span>
        {custos && <span className="pilula neutra">Soma: {fmt(soma, 'moeda')}</span>}
      </div>
      <div style={{ maxHeight: '62vh', overflow: 'auto', border: '1px solid var(--line-2)', borderRadius: 8 }}>
        {custos ? (
          <table className="tabela">
            <thead><tr><th>Conexão</th><th>Data entrada</th><th>Código</th><th>Nº NF</th><th className="dir">Valor</th></tr></thead>
            <tbody>
              {itens.slice(0, LIMITE).map((c, i) => (
                <tr key={i}><td>{c.conexao}</td><td>{fmtData(c.data)}</td><td>{c.codigo}</td><td>{c.nroNF}</td><td className="dir num">{fmt(c.valor, 'moeda')}</td></tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>Conexão</th><th>Pedido</th><th>Data</th><th>Carga</th><th>Cliente</th><th>Inscrição</th>
                <th className="centro">Situação</th><th>Pré-venda</th><th>Acerto</th><th className="dir">Dias</th><th>Retornos</th>
              </tr>
            </thead>
            <tbody>
              {itens.slice(0, LIMITE).map((p) => (
                <tr key={p.conexao + p.numero}>
                  <td>{p.conexao}</td><td className="num">{p.numero}</td><td>{fmtData(p.data)}</td><td>{p.carga}</td>
                  <td>{p.cliente}</td><td className="mono">{p.nroInsc}</td>
                  <td className="centro">
                    {p.devolvido ? <span className="pilula critico">Devolvido</span> : p.realizada ? <span className="pilula ok">Entregue</span> : p.carregada ? <span className="pilula atencao">Carregado</span> : <span className="pilula neutra">{p.situacao || 'Sem carga'}</span>}
                  </td>
                  <td>{fmtData(p.dataPrevenda)}</td><td>{fmtData(p.dataAcerto)}</td>
                  <td className="dir num">{p.dias ?? '—'}</td><td className="sub">{p.retornos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!itens.length && <div className="vazio">Nada encontrado.</div>}
      </div>
      {itens.length > LIMITE && <p className="sub">Mostrando os primeiros {LIMITE.toLocaleString('pt-BR')}. Use a busca ou exporte para Excel para ver todos.</p>}
    </Modal>
  );
}
