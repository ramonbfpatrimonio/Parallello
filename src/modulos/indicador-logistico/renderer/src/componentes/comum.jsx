import React, { createContext, useCallback, useContext, useState } from 'react';
import { X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

// ------------------------------ Avisos (toasts) ------------------------------
const AvisoCtx = createContext(() => {});
export const useAviso = () => useContext(AvisoCtx);

export function AvisoProvider({ children }) {
  const [lista, setLista] = useState([]);
  const avisar = useCallback((texto, tipo = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setLista((l) => [...l, { id, texto, tipo }]);
    setTimeout(() => setLista((l) => l.filter((a) => a.id !== id)), tipo === 'erro' ? 7000 : 3500);
  }, []);
  return (
    <AvisoCtx.Provider value={avisar}>
      {children}
      <div className="avisos">
        {lista.map((a) => (
          <div key={a.id} className={`aviso ${a.tipo}`}>
            {a.tipo === 'ok' ? <CheckCircle2 size={18} /> : a.tipo === 'erro' ? <AlertTriangle size={18} /> : <Info size={18} />}
            <span style={{ whiteSpace: 'pre-line' }}>{a.texto}</span>
          </div>
        ))}
      </div>
    </AvisoCtx.Provider>
  );
}

// ------------------------------ Modal ------------------------------
export function Modal({ titulo, onFechar, children, rodape, largo }) {
  return (
    <div className="fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className={`modal ${largo ? 'largo' : ''}`} role="dialog" aria-label={titulo}>
        <div className="modal-cab">
          <h3>{titulo}</h3>
          <button className="btn fantasma icone" onClick={onFechar} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="modal-corpo">{children}</div>
        {rodape && <div className="modal-rodape">{rodape}</div>}
      </div>
    </div>
  );
}

// ------------------------------ Confirmação ------------------------------
export function Confirmar({ texto, onSim, onNao, rotuloSim = 'Excluir' }) {
  return (
    <Modal titulo="Confirmar" onFechar={onNao} rodape={<>
      <button className="btn" onClick={onNao}>Cancelar</button>
      <button className="btn primario" style={{ background: 'var(--critico)', borderColor: 'var(--critico)' }} onClick={onSim}>{rotuloSim}</button>
    </>}>
      <p style={{ margin: 0 }}>{texto}</p>
    </Modal>
  );
}

export function PilulaStatus({ st, dica, semMeta = 'Sem meta' }) {
  if (!st) return <span className="pilula neutra" title={dica}>{semMeta}</span>;
  const t = { ok: 'Meta atingida', atencao: 'Alerta', critico: 'Crítico' }[st];
  return <span className={`pilula ${st}`} title={dica} style={dica ? { cursor: 'help' } : undefined}>{t}</span>;
}
