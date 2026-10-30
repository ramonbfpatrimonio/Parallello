import React, { useState } from 'react';
import { Campo } from '../ui.jsx';

function Lado({ demo }) {
  return (
    <div className="entrada-lado">
      <div>
        <h1>Pré-Venda<br />de Ruptura</h1>
        <p>Encontre os itens que ficaram de fora do pedido faturado e gere a pré-venda de reposição no ERP, referenciada à PV de origem.</p>
        <div className="marca-fluxo" aria-hidden="true">
          <b>Pré-venda</b><i>−</i><b>Pedido</b><i>=</i><b className="falta">Falta</b>
        </div>
      </div>
      <div className="rodape">{demo ? <span className="demo-tag">Modo demonstração — sem banco real</span> : 'Conexão e usuário: os do Parallello.'}</div>
    </div>
  );
}

export default function Entrada({ estado, erroInicial, onSetupFeito, onLogin }) {
  return (
    <div className="entrada">
      <Lado demo={estado.demo} />
      <div className="entrada-form">
        {estado.primeiroUso ? <Setup onFeito={onSetupFeito} /> : <Login estado={estado} erroInicial={erroInicial} onLogin={onLogin} />}
      </div>
    </div>
  );
}

function Setup({ onFeito }) {
  const [f, setF] = useState({ senhaMaster: '', usuario: '', senha: '', confSenha: '' });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const salvar = async (e) => {
    e.preventDefault();
    setErro('');
    if (f.senha !== f.confSenha) return setErro('As senhas do usuário não conferem.');
    setSalvando(true);
    try {
      await window.api.setupInicial({ senhaMaster: f.senhaMaster, usuario: f.usuario, senha: f.senha });
      onFeito();
    } catch (err) { setErro(err.message); } finally { setSalvando(false); }
  };

  return (
    <form onSubmit={salvar}>
      <h2>Configuração inicial</h2>
      <p className="sub">Informe a senha master para liberar a instalação e cadastre o primeiro usuário.</p>
      <Campo rotulo="Senha master"><input type="password" value={f.senhaMaster} onChange={set('senhaMaster')} autoFocus /></Campo>
      <Campo rotulo="Primeiro usuário"><input value={f.usuario} onChange={set('usuario')} /></Campo>
      <Campo rotulo="Senha do usuário"><input type="password" value={f.senha} onChange={set('senha')} /></Campo>
      <Campo rotulo="Confirmar senha"><input type="password" value={f.confSenha} onChange={set('confSenha')} /></Campo>
      {erro && <div className="erro-box">{erro}</div>}
      <button className="btn primario" disabled={salvando} style={{ justifyContent: 'center', height: 38 }}>
        {salvando ? <span className="carregando" /> : 'Salvar e cadastrar a primeira empresa'}
      </button>
    </form>
  );
}

// Login único: o usuário é o do Parallello. Aqui só se escolhe a empresa (conexão com o banco).
function Login({ estado, erroInicial, onLogin }) {
  const [conexaoId, setConexaoId] = useState(
    estado.conexoes.find((c) => c.id === estado.ultimaConexaoId)?.id || estado.conexoes[0]?.id || ''
  );
  const [erro, setErro] = useState(erroInicial || '');
  const [entrando, setEntrando] = useState(false);
  const idValido = estado.conexoes.some((c) => c.id === conexaoId)
    ? conexaoId
    : estado.conexoes.find((c) => c.id === estado.ultimaConexaoId)?.id || estado.conexoes[0]?.id || '';

  const entrar = async (e) => {
    e.preventDefault();
    setErro('');
    setEntrando(true);
    try {
      onLogin(await window.api.login({ conexaoId: idValido }));
    } catch (err) {
      setErro(err.message);
    } finally { setEntrando(false); }
  };

  const semEmpresa = estado.conexoes.length === 0;
  return (
    <form onSubmit={entrar}>
      <h2>Escolha a empresa</h2>
      <p className="sub">Você entrou no Parallello como <b>{estado.ultimoUsuario}</b>.</p>
      {semEmpresa && <div className="aviso-box">Nenhuma conexão com o banco cadastrada. Na tela inicial do Parallello, pressione <b>Ctrl+Shift+B</b> e cadastre a conexão (ela vale para todos os sistemas).</div>}
      <Campo rotulo="Empresa">
        <select value={idValido} onChange={(e) => setConexaoId(e.target.value)} disabled={semEmpresa} autoFocus>
          {estado.conexoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </Campo>
      {erro && <div className="erro-box">{erro}</div>}
      <button className="btn primario" disabled={entrando || semEmpresa} style={{ justifyContent: 'center', height: 38 }}>
        {entrando ? <><span className="carregando" /> Conectando ao banco…</> : 'Continuar'}
      </button>
    </form>
  );
}
