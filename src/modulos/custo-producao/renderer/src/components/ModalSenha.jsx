import { useState } from 'react';
import { api } from '../lib/api';
import Icone from './Icone';

export default function ModalSenha({ aoFechar, aoLiberar }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');

  async function confirmar(e) {
    e.preventDefault();
    try {
      if (await api.validarSenha(senha)) aoLiberar();
      else { setErro('Senha incorreta. Use a senha do Parallello com a data de hoje.'); setSenha(''); }
    } catch (err) {
      setErro(err.message);
    }
  }

  return (
    <div className="fundo-modal" onMouseDown={aoFechar}>
      <form className="modal" onMouseDown={e => e.stopPropagation()} onSubmit={confirmar}>
        <div className="modal-icone"><Icone nome="cadeado" tamanho={22} /></div>
        <h3>Área do sistema</h3>
        <p className="dica">Conexões, configurações e backup. Informe a senha do Parallello.</p>
        <input
          type="password"
          autoFocus
          value={senha}
          onChange={e => { setSenha(e.target.value); setErro(''); }}
          onKeyDown={e => e.key === 'Escape' && aoFechar()}
          placeholder="Senha"
          aria-label="Senha"
        />
        {erro && <div className="erro-campo">{erro}</div>}
        <div className="acoes-modal">
          <button type="button" className="sec" onClick={aoFechar}>Cancelar</button>
          <button type="submit">Entrar</button>
        </div>
      </form>
    </div>
  );
}
