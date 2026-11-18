import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// ---------- avisos (toasts) ----------
const AvisoCtx = createContext(() => {});
export const useAviso = () => useContext(AvisoCtx);

export function ProvedorAvisos({ children }) {
  const [avisos, setAvisos] = useState([]);
  const avisar = useCallback((texto, tipo = 'ok', ms = 4500) => {
    const id = Math.random().toString(36).slice(2);
    setAvisos((a) => [...a, { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), ms);
  }, []);
  return (
    <AvisoCtx.Provider value={avisar}>
      {children}
      <div className="cob-avisos">
        {avisos.map((a) => (
          <div key={a.id} className={`cob-aviso cob-aviso-${a.tipo}`} role="status">{a.texto}</div>
        ))}
      </div>
    </AvisoCtx.Provider>
  );
}

// ---------- modal ----------
export function Modal({ titulo, subtitulo, onFechar, children, rodape, largura = 640, fecharFora = false }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onFechar?.(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onFechar]);
  return (
    <div className="cob-modal-fundo" onMouseDown={(e) => { if (fecharFora && e.target === e.currentTarget) onFechar?.(); }}>
      <div className="cob-modal" style={{ maxWidth: largura }} role="dialog" aria-modal="true">
        <div className="cob-modal-topo">
          <div>
            <h3>{titulo}</h3>
            {subtitulo && <p>{subtitulo}</p>}
          </div>
          <button type="button" className="cob-x" onClick={onFechar} aria-label="Fechar">×</button>
        </div>
        <div className="cob-modal-corpo">{children}</div>
        {rodape && <div className="cob-modal-rodape">{rodape}</div>}
      </div>
    </div>
  );
}

export function Botao({ variante = 'secundario', pequeno, carregando, children, ...props }) {
  return (
    <button type="button" className={`cob-btn cob-btn-${variante}${pequeno ? ' cob-btn-p' : ''}`} disabled={carregando || props.disabled} {...props}>
      {carregando ? <span className="cob-spin" /> : null}
      {children}
    </button>
  );
}

export function Campo({ rotulo, dica, erro, children, largo }) {
  return (
    <label className={`cob-campo${largo ? ' cob-campo-largo' : ''}`}>
      <span className="cob-campo-rotulo">{rotulo}</span>
      {children}
      {dica && !erro && <span className="cob-campo-dica">{dica}</span>}
      {erro && <span className="cob-campo-erro">{erro}</span>}
    </label>
  );
}

export function Info({ rotulo, valor }) {
  return (
    <div className="cob-info">
      <span>{rotulo}</span>
      <strong>{valor ?? '-'}</strong>
    </div>
  );
}

export function Selo({ tipo, children, title }) {
  return <span className={`cob-selo cob-selo-${tipo}`} title={title}>{children}</span>;
}

// ---------- confirmação ----------
export function Confirmar({ titulo, texto, rotuloOk = 'Confirmar', perigo, onOk, onFechar }) {
  const [rodando, setRodando] = useState(false);
  return (
    <Modal titulo={titulo} onFechar={onFechar} largura={460}
      rodape={(
        <>
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao variante={perigo ? 'perigo' : 'primario'} carregando={rodando}
            onClick={async () => { setRodando(true); try { await onOk(); } finally { setRodando(false); } }}>
            {rotuloOk}
          </Botao>
        </>
      )}>
      <div className="cob-texto">{texto}</div>
    </Modal>
  );
}

// ---------- pedir senha ----------
export function PedirSenha({ titulo, texto, onConfirmar, onFechar }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [rodando, setRodando] = useState(false);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const ok = async (e) => {
    e?.preventDefault();
    setRodando(true); setErro('');
    try {
      const certo = await onConfirmar(senha);
      if (!certo) { setErro('Senha incorreta.'); setSenha(''); ref.current?.focus(); }
    } finally { setRodando(false); }
  };
  return (
    <Modal titulo={titulo} onFechar={onFechar} largura={400}
      rodape={(<><Botao onClick={onFechar}>Cancelar</Botao><Botao variante="primario" carregando={rodando} onClick={ok}>Entrar</Botao></>)}>
      <form onSubmit={ok}>
        {texto && <p className="cob-texto">{texto}</p>}
        <Campo rotulo="Senha" erro={erro}>
          <input ref={ref} type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="off" />
        </Campo>
      </form>
    </Modal>
  );
}

export function Vazio({ titulo, texto, children }) {
  return (
    <div className="cob-vazio">
      <strong>{titulo}</strong>
      {texto && <p>{texto}</p>}
      {children}
    </div>
  );
}

export function Abas({ abas, ativa, onTrocar }) {
  return (
    <div className="cob-abas" role="tablist">
      {abas.map((a) => (
        <button key={a.id} type="button" role="tab" aria-selected={ativa === a.id}
          className={`cob-aba${ativa === a.id ? ' ativa' : ''}`} onClick={() => onTrocar(a.id)}>
          {a.rotulo}{a.contador != null && <span className="cob-aba-cont">{a.contador}</span>}
        </button>
      ))}
    </div>
  );
}
