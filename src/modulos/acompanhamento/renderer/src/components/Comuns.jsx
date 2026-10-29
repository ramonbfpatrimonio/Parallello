import React from 'react';
import { AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { brl, int, dec, pct } from '../format.js';
import { ATALHOS } from '../format.js';

export function Toggle({ checked, onChange, children }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="trilho" />
      {children}
    </label>
  );
}

export function Aviso({ tipo = 'info', children }) {
  const Icone = tipo === 'erro' || tipo === 'alerta' ? AlertTriangle : tipo === 'ok' ? CheckCircle2 : Info;
  return (
    <div className={'aviso ' + tipo}>
      <Icone size={17} style={{ flex: 'none', marginTop: 1 }} />
      <div>{children}</div>
    </div>
  );
}

export function valorResumo(item) {
  switch (item.tipo) {
    case 'moeda': return brl(item.valor);
    case 'inteiro': return int(item.valor);
    case 'numero': return dec(item.valor);
    case 'pct': return pct(item.valor, 1);
    default: return String(item.valor);
  }
}

export function Resumo({ itens }) {
  if (!itens || !itens.length) return null;
  return (
    <div className="resumo">
      {itens.map((k, i) => (
        <div key={k.rotulo} className={'card kpi' + (i === 0 ? ' acento' : '')}>
          <span>{k.rotulo}</span>
          <b>{valorResumo(k)}</b>
        </div>
      ))}
    </div>
  );
}

export function Periodo({ ini, fim, onChange }) {
  return (
    <>
      <label className="campo">
        <span>Data inicial</span>
        <input type="date" className="input" value={ini} onChange={(e) => onChange(e.target.value, fim)} />
      </label>
      <label className="campo">
        <span>Data final</span>
        <input type="date" className="input" value={fim} onChange={(e) => onChange(ini, e.target.value)} />
      </label>
      <div className="campo">
        <span>Atalhos</span>
        <div className="atalhos">
          {ATALHOS.map((a) => {
            const [i, f] = a.fn();
            return (
              <button key={a.rotulo} className={'chip' + (i === ini && f === fim ? ' on' : '')} onClick={() => onChange(i, f)}>
                {a.rotulo}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

export function Carregando({ msg }) {
  return (
    <div className="carregando">
      <div className="caixa"><div className="giro" /><span>{msg || 'Consultando...'}</span></div>
    </div>
  );
}
