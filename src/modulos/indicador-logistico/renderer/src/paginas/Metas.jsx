import React, { useEffect, useState } from 'react';
import { Save, Loader2, Truck, Clock, Coins, PackageX, RotateCcw } from 'lucide-react';
import { api } from '../lib/api';
import { useAviso, Confirmar } from '../componentes/comum';
import { faixas } from '../lib/status';

const DEF = {
  cumprimento: { nome: '% Cumprimento de Entregas', icone: Truck, sufixo: '%', escala: 100, tipo: 'pct', desc: 'Entregas realizadas ÷ entregas programadas. Quanto maior, melhor.' },
  prazo: { nome: 'Prazo Médio de Entrega', icone: Clock, sufixo: 'dias', escala: 1, tipo: 'dec', desc: 'Dias entre a primeira pré-venda e o acerto da carga. Quanto menor, melhor.' },
  custo: { nome: 'Custo por Entrega', icone: Coins, sufixo: 'R$', escala: 1, tipo: 'moeda', desc: 'Custo logístico do centro de custo ÷ entregas realizadas. Quanto menor, melhor.' },
  devolucao: { nome: '% Devoluções', icone: PackageX, sufixo: '%', escala: 100, tipo: 'pct', desc: 'Pedidos devolvidos (op. 98/99) ÷ pedidos carregados. Quanto menor, melhor.' }
};

const NIVEIS = [
  { k: 'ok', rotulo: 'Meta atingida' },
  { k: 'atencao', rotulo: 'Alerta' },
  { k: 'critico', rotulo: 'Crítico' }
];

export default function Metas() {
  const avisar = useAviso();
  const [m, setM] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [restaurar, setRestaurar] = useState(false);

  useEffect(() => { api('metas:obter').then(setM).catch((e) => avisar(e.message, 'erro')); }, []);

  const set = (id, k, v) => setM((x) => ({ ...x, [id]: { ...x[id], [k]: v } }));
  const setTexto = (id, k, v) => setM((x) => ({ ...x, [id]: { ...x[id], textos: { ...x[id].textos, [k]: v } } }));

  async function salvar() {
    for (const [id, d] of Object.entries(DEF)) {
      const x = m[id];
      if (!x.ativo) continue;
      const ruim = x.melhor === 'maior' ? Number(x.atencao) > Number(x.meta) : Number(x.atencao) < Number(x.meta);
      if (ruim) return avisar(`${d.nome}: o limite de alerta precisa ser ${x.melhor === 'maior' ? 'menor' : 'maior'} ou igual à meta.`, 'erro');
    }
    setSalvando(true);
    try { setM(await api('metas:salvar', m)); avisar('Metas salvas.', 'ok'); } catch (e) { avisar(e.message, 'erro'); } finally { setSalvando(false); }
  }

  async function confirmarRestaurar() {
    try { setM(await api('metas:restaurar')); setRestaurar(false); avisar('Metas da planilha restauradas.', 'ok'); } catch (e) { avisar(e.message, 'erro'); }
  }

  if (!m) return <div className="vazio"><Loader2 className="girar" /></div>;

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <div><h1>Metas</h1><p>Definem a cor dos meses, a coluna Status e a explicação de cada situação no painel.</p></div>
        <div className="acoes">
          <button className="btn" onClick={() => setRestaurar(true)}><RotateCcw size={16} /> Restaurar padrão</button>
          <button className="btn primario" onClick={salvar} disabled={salvando}>{salvando ? <Loader2 size={16} className="girar" /> : <Save size={16} />} Salvar metas</button>
        </div>
      </div>
      <div className="metas">
        {Object.entries(DEF).map(([id, d]) => {
          const x = m[id];
          const Icone = d.icone;
          const maior = x.melhor === 'maior';
          const f = faixas(x, d.tipo);
          const entrada = (k) => (
            <div className="input-sufixo">
              <input type="number" step="0.01" min="0" disabled={!x.ativo}
                value={Number.isFinite(x[k]) ? +(x[k] * d.escala).toFixed(4) : ''}
                onChange={(e) => set(id, k, e.target.value === '' ? 0 : Number(e.target.value) / d.escala)} />
              <em>{d.sufixo}</em>
            </div>
          );
          return (
            <div key={id} className="card">
              <div className="card-cab">
                <h2><Icone size={17} color="var(--accent)" /> {d.nome}</h2>
                <label className="check"><input type="checkbox" checked={x.ativo} onChange={(e) => set(id, 'ativo', e.target.checked)} /> Usar meta</label>
              </div>
              <div className="card-corpo" style={{ opacity: x.ativo ? 1 : 0.55 }}>
                <p className="sub" style={{ marginTop: 0 }}>{d.desc}</p>
                <div className="grade g2">
                  <label className="campo"><span>Meta atingida ({maior ? 'a partir de' : 'até'})</span>{entrada('meta')}</label>
                  <label className="campo"><span>Alerta ({maior ? 'a partir de' : 'até'})</span>{entrada('atencao')}</label>
                </div>
                <div className="niveis">
                  {NIVEIS.map((n) => (
                    <label key={n.k} className={`nivel ${n.k}`}>
                      <span><b>{n.rotulo}</b> {f[n.k]}</span>
                      <textarea rows={2} disabled={!x.ativo} value={x.textos?.[n.k] || ''} onChange={(e) => setTexto(id, n.k, e.target.value)} placeholder="Explicação mostrada no painel" />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {restaurar && <Confirmar texto="Voltar todas as metas e explicações para os valores da planilha?" rotuloSim="Restaurar" onSim={confirmarRestaurar} onNao={() => setRestaurar(false)} />}
    </div>
  );
}
