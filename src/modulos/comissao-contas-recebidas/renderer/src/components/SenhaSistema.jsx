import { useState } from 'react';
import Modal from './Modal.jsx';
import Icone from './Icone.jsx';
import { api } from '../api.js';

// Tela de senha da área de sistema (Ctrl+Shift+B)
export default function SenhaSistema({ aoLiberar, aoFechar }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [verificando, setVerificando] = useState(false);

  const entrar = async (e) => {
    e && e.preventDefault();
    setVerificando(true);
    try {
      if (await api.liberarSistema(senha)) aoLiberar();
      else {
        setErro('Senha incorreta.');
        setSenha('');
      }
    } catch (err) {
      setErro(err.message);
    } finally {
      setVerificando(false);
    }
  };

  return (
    <Modal
      titulo="Área de sistema"
      largura={400}
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="btn" onClick={aoFechar}>Cancelar</button>
          <button className="btn primario" onClick={entrar} disabled={!senha || verificando}>
            {verificando ? 'Verificando…' : 'Entrar'}
          </button>
        </>
      }
    >
      <form onSubmit={entrar} className="senha-sistema">
        <div className="senha-icone">
          <Icone nome="cadeado" tamanho={26} />
        </div>
        <label className="campo">
          <span>Senha do administrador</span>
          <input type="password" value={senha} autoFocus onChange={(e) => { setSenha(e.target.value); setErro(''); }} />
        </label>
        {erro && <div className="texto-erro">{erro}</div>}
      </form>
    </Modal>
  );
}
