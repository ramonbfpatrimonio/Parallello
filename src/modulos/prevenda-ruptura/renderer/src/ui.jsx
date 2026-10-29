import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const fmtData = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');
export const fmtDataHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
export const cxun = (cx, un) => `${cx}/${un}`;

export function Modal({ titulo, sub, children, rodape, onFechar, tamanho = '', semPre = false }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && onFechar) onFechar(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onFechar]);
  return (
    <div className="veu" onMouseDown={(e) => { if (e.target === e.currentTarget && onFechar) onFechar(); }}>
      <div className={`modal ${tamanho}`} role="dialog" aria-modal="true">
        {titulo && (
          <header>
            <div><h2>{titulo}</h2>{sub && <p>{sub}</p>}</div>
            {onFechar && <button className="btn fantasma peq" onClick={onFechar} aria-label="Fechar">✕</button>}
          </header>
        )}
        <div className={`corpo ${semPre ? 'sem-pre' : ''}`}>{children}</div>
        {rodape && <footer>{rodape}</footer>}
      </div>
    </div>
  );
}

// ---------- diálogos (substituem os MsgBox da planilha) ----------
const Ctx = createContext(null);
const ICONES = { erro: '!', aviso: '!', info: 'i', ok: '✓' };

export function DialogosProvider({ children }) {
  const [fila, setFila] = useState([]);
  const [toast, setToast] = useState(null);
  const tRef = useRef();

  const abrir = useCallback((d) => new Promise((resolve) => setFila((f) => [...f, { ...d, resolve }])), []);
  const fechar = (valor) => setFila((f) => { f[0]?.resolve(valor); return f.slice(1); });

  const api = {
    alerta: (texto, { titulo = 'Atenção', tipo = 'aviso' } = {}) => abrir({ texto, titulo, tipo, confirma: false }),
    erro: (texto, titulo = 'Não foi possível concluir') => abrir({ texto: String(texto?.message || texto), titulo, tipo: 'erro', confirma: false }),
    confirmar: (texto, { titulo = 'Confirmar', tipo = 'aviso', sim = 'Sim', nao = 'Não' } = {}) => abrir({ texto, titulo, tipo, confirma: true, sim, nao }),
    toast: (texto) => { clearTimeout(tRef.current); setToast(texto); tRef.current = setTimeout(() => setToast(null), 2800); },
  };

  const d = fila[0];
  return (
    <Ctx.Provider value={api}>
      {children}
      {d && (
        <Modal
          onFechar={() => fechar(false)}
          rodape={d.confirma ? (
            <>
              <button className="btn" onClick={() => fechar(false)}>{d.nao}</button>
              <button className="btn primario" autoFocus onClick={() => fechar(true)}>{d.sim}</button>
            </>
          ) : <button className="btn primario" autoFocus onClick={() => fechar(true)}>OK</button>}
        >
          <div className="dlg-linha">
            <div className={`icone ${d.tipo}`}>{ICONES[d.tipo]}</div>
            <div><b style={{ display: 'block', marginBottom: 4 }}>{d.titulo}</b>{d.texto}</div>
          </div>
        </Modal>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </Ctx.Provider>
  );
}
export const useDialogos = () => useContext(Ctx);

export function Campo({ rotulo, dica, children, className = '' }) {
  return (
    <label className={`campo ${className}`}>
      <span>{rotulo}</span>
      {children}
      {dica && <small>{dica}</small>}
    </label>
  );
}

// ordenação simples por coluna
export function useOrdenacao(inicial = null) {
  const [ord, setOrd] = useState(inicial);
  const alternar = (campo) => setOrd((o) => (o && o.campo === campo ? (o.dir === 1 ? { campo, dir: -1 } : null) : { campo, dir: 1 }));
  const aplicar = (lista, acessores = {}) => {
    if (!ord) return lista;
    const f = acessores[ord.campo] || ((x) => x[ord.campo]);
    return [...lista].sort((a, b) => {
      const va = f(a), vb = f(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * ord.dir;
      return String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR', { numeric: true }) * ord.dir;
    });
  };
  const seta = (campo) => (ord && ord.campo === campo ? <span className="seta">{ord.dir === 1 ? '▲' : '▼'}</span> : null);
  return { alternar, aplicar, seta };
}
