import { useEffect } from 'react';
import Icone from './Icone.jsx';

export default function Modal({ titulo, children, rodape, aoFechar, largura = 520 }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && aoFechar && aoFechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aoFechar]);

  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar && aoFechar()}>
      <div className="modal" style={{ width: largura }}>
        <div className="modal-topo">
          <h3>{titulo}</h3>
          {aoFechar && (
            <button className="btn-icone" onClick={aoFechar} aria-label="Fechar">
              <Icone nome="fechar" />
            </button>
          )}
        </div>
        <div className="modal-corpo">{children}</div>
        {rodape && <div className="modal-rodape">{rodape}</div>}
      </div>
    </div>
  );
}

export function Confirmar({ titulo, mensagem, textoOk = 'Confirmar', perigo, ocupado, aoConfirmar, aoFechar }) {
  return (
    <Modal
      titulo={titulo}
      aoFechar={ocupado ? null : aoFechar}
      rodape={
        <>
          <button className="btn" onClick={aoFechar} disabled={ocupado}>Cancelar</button>
          <button className={'btn ' + (perigo ? 'perigo' : 'primario')} onClick={aoConfirmar} disabled={ocupado}>
            {ocupado ? 'Aguarde…' : textoOk}
          </button>
        </>
      }
    >
      {typeof mensagem === 'string' ? <p>{mensagem}</p> : mensagem}
    </Modal>
  );
}
