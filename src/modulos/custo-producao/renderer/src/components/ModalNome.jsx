import { useState } from 'react';

export default function ModalNome({ titulo, descricao, padrao = '', rotuloBotao = 'Salvar', aoConfirmar, aoFechar }) {
  const [nome, setNome] = useState(padrao);
  return (
    <div className="fundo-modal" onMouseDown={aoFechar}>
      <form
        className="modal"
        onMouseDown={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); aoConfirmar(nome); }}
      >
        <h3>{titulo}</h3>
        {descricao && <p className="dica">{descricao}</p>}
        <input autoFocus value={nome} onChange={e => setNome(e.target.value)} onKeyDown={e => e.key === 'Escape' && aoFechar()} aria-label="Nome" />
        <div className="acoes-modal">
          <button type="button" className="sec" onClick={aoFechar}>Cancelar</button>
          <button type="submit">{rotuloBotao}</button>
        </div>
      </form>
    </div>
  );
}
