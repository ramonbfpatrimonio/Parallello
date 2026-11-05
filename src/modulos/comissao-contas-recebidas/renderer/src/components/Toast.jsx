import { createContext, useCallback, useContext, useState } from 'react';

const Ctx = createContext(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }) {
  const [lista, setLista] = useState([]);
  const avisar = useCallback((texto, tipo = 'ok', ms = 4000) => {
    const id = Math.random().toString(36).slice(2);
    setLista((l) => [...l, { id, texto, tipo }]);
    setTimeout(() => setLista((l) => l.filter((t) => t.id !== id)), tipo === 'erro' ? Math.max(ms, 8000) : ms);
  }, []);
  return (
    <Ctx.Provider value={avisar}>
      {children}
      <div className="toasts">
        {lista.map((t) => (
          <div key={t.id} className={'toast ' + t.tipo} onClick={() => setLista((l) => l.filter((x) => x.id !== t.id))}>
            {t.texto}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
