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
      <div className="rodape">{demo ? <span className="demo-tag">Modo demonstração — sem banco real</span> : 'Dados salvos somente neste computador.'}</div>
    </div>
  );
}

export default function Entrada({ estado, onSetupFeito, onLogin }) {
  return (
    <div className="entrada">
      <Lado demo={estado.demo} />
      <div className="entrada-form">
        {estado.primeiroUso ? <Setup onFeito={onSetupFeito} /> : <Login estado={estado} onLogin={onLogin} />}
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

function Login({ estado, onLogin }) {
  const [usuario, setUsuario] = useState(estado.ultimoUsuario || '');
  const [senha, setSenha] = useState('');
  const [conexaoId, setConexaoId] = useState(
    estado.conexoes.find((c) => c.id === estado.ultimaConexaoId)?.id || estado.conexoes[0]?.id || ''
  );
  const [erro, setErro] = useState('');
  const [entrando, setEntrando] = useState(false);
  // se a lista de empresas mudou (ex.: cadastrada agora), usa uma válida
  const idValido = estado.conexoes.some((c) => c.id === conexaoId)
    ? conexaoId
    : estado.conexoes.find((c) => c.id === estado.ultimaConexaoId)?.id || estado.conexoes[0]?.id || '';

  const entrar = async (e) => {
    e.preventDefault();
    setErro('');
    if (!usuario.trim()) return setErro('Digite o usuário!');
    if (!senha) return setErro('Digite a senha!');
    setEntrando(true);
    try {
      onLogin(await window.api.login({ usuario, senha, conexaoId: idValido }));
    } catch (err) {
      setErro(err.message);
      setSenha('');
    } finally { setEntrando(false); }
  };

  const semEmpresa = estado.conexoes.length === 0;
  return (
    <form onSubmit={entrar}>
      <h2>Entrar</h2>
      {semEmpresa && <div className="aviso-box">Nenhuma empresa cadastrada. Pressione <b>Ctrl+Shift+B</b> para abrir as configurações e cadastrar a conexão com o banco.</div>}
      <Campo rotulo="Empresa">
        <select value={idValido} onChange={(e) => setConexaoId(e.target.value)} disabled={semEmpresa}>
          {estado.conexoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Usuário"><input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus={!usuario} /></Campo>
      <Campo rotulo="Senha"><input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus={!!usuario} /></Campo>
      {erro && <div className="erro-box">{erro}</div>}
      <button className="btn primario" disabled={entrando || semEmpresa} style={{ justifyContent: 'center', height: 38 }}>
        {entrando ? <><span className="carregando" /> Conectando ao banco…</> : 'Entrar'}
      </button>
    </form>
  );
}
