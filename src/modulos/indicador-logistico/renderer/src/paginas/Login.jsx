import React, { useState } from 'react';
import { Loader2, LogIn, Truck, Clock, Coins, PackageX, AlertTriangle, Info } from 'lucide-react';
import { api } from '../lib/api';
import logo from '../assets/logo.svg';

export default function Login({ temUsuarios, onEntrar }) {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    try {
      onEntrar(await api('auth:entrar', { usuario, senha }));
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login">
      <section className="login-lado">
        <div>
          <img src={logo} alt="" width="56" height="56" />
          <h1>Indicador Logístico</h1>
          <p>Painel de entregas, prazo, custo e devoluções, calculado direto dos bancos do ERP. Os dados ficam salvos neste computador.</p>
          <div className="login-lista">
            <div><Truck size={20} /> Cumprimento de entregas</div>
            <div><Clock size={20} /> Prazo médio de entrega</div>
            <div><Coins size={20} /> Custo por entrega</div>
            <div><PackageX size={20} /> Devoluções</div>
          </div>
        </div>
        <small style={{ opacity: 0.6 }}>Dados locais · sem nuvem</small>
      </section>
      <section className="login-form">
        <form onSubmit={entrar}>
          <div>
            <h2>Entrar</h2>
            <span className="sub">Use seu usuário e senha.</span>
          </div>
          {!temUsuarios && (
            <div className="alerta info"><Info size={16} /><span>Primeiro acesso: entre com o usuário <b>MASTER</b> e cadastre os usuários do sistema.</span></div>
          )}
          <label className="campo"><span>Usuário</span>
            <input autoFocus value={usuario} onChange={(e) => setUsuario(e.target.value)} />
          </label>
          <label className="campo"><span>Senha</span>
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} />
          </label>
          {erro && <div className="alerta erro"><AlertTriangle size={16} />{erro}</div>}
          <button className="btn primario" style={{ height: 40, justifyContent: 'center' }} disabled={carregando || !usuario || !senha}>
            {carregando ? <Loader2 size={18} className="girar" /> : <LogIn size={18} />} Entrar
          </button>
        </form>
      </section>
    </div>
  );
}
