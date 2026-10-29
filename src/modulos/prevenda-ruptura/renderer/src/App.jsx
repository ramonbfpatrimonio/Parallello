import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DialogosProvider, Modal, useDialogos } from './ui.jsx';
import Entrada from './telas/Entrada.jsx';
import Rupturas from './telas/Rupturas.jsx';
import Clientes from './telas/Clientes.jsx';
import Historico from './telas/Historico.jsx';
import Configuracao from './telas/Configuracao.jsx';

export default function App() {
  return <DialogosProvider><Raiz /></DialogosProvider>;
}

function Raiz() {
  const [estado, setEstado] = useState(null);
  const [sessao, setSessao] = useState(null);
  const [pedirSenha, setPedirSenha] = useState(false);
  const [configAberta, setConfigAberta] = useState(false);

  const recarregar = useCallback(async () => {
    const e = await window.api.estado();
    setEstado(e);
    if (e.sessao) setSessao(e.sessao);
    return e;
  }, []);
  useEffect(() => { recarregar(); }, [recarregar]);

  // Atalho oculto da configuração: Ctrl+Shift+B
  useEffect(() => {
    const k = (ev) => {
      if (ev.ctrlKey && ev.shiftKey && (ev.key === 'B' || ev.key === 'b')) {
        ev.preventDefault();
        if (estado && !estado.primeiroUso && !configAberta) setPedirSenha(true);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [estado, configAberta]);

  if (!estado) return null;

  const fecharConfig = async () => {
    await window.api.config.fechar();
    setConfigAberta(false);
    recarregar();
  };

  return (
    <>
      {sessao ? (
        <Principal sessao={sessao} demo={estado.demo} versao={estado.versao} onSair={async () => { await window.api.logout(); setSessao(null); recarregar(); }} />
      ) : (
        <Entrada estado={estado} onSetupFeito={async () => { await recarregar(); setConfigAberta(true); }} onLogin={setSessao} />
      )}
      {pedirSenha && <SenhaMaster onCancelar={() => setPedirSenha(false)} onOk={() => { setPedirSenha(false); setConfigAberta(true); }} />}
      {configAberta && <Configuracao onFechar={fecharConfig} />}
    </>
  );
}

function SenhaMaster({ onOk, onCancelar }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const entrar = async (e) => {
    e.preventDefault();
    try { await window.api.config.abrir(senha); onOk(); } catch (err) { setErro(err.message); setSenha(''); }
  };
  return (
    <Modal titulo="Configurações" sub="Digite a senha master para continuar." onFechar={onCancelar} semPre
      rodape={<><button className="btn" onClick={onCancelar}>Cancelar</button><button className="btn primario" form="f-master">Entrar</button></>}>
      <form id="f-master" onSubmit={entrar} className="campo">
        <input type="password" autoFocus value={senha} onChange={(e) => setSenha(e.target.value)} aria-label="Senha master" />
        {erro && <small className="erro-txt">{erro}</small>}
      </form>
    </Modal>
  );
}

const ICONES = {
  rupturas: <path d="M4 20V10M10 20V4M16 20v-6M16 9V7M22 20H2" />,
  clientes: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.7.8 2.7 2.5 3 5.2" /></>,
  historico: <><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3 3.5V8h4.5M12 7.5V12l3 2" /></>,
  sair: <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l4-4-4-4M14 12H4" />,
};
const Icone = ({ nome }) => (
  <svg className="ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONES[nome]}</svg>
);

const TELAS = [
  ['rupturas', 'Rupturas'],
  ['clientes', 'Clientes com rupturas'],
  ['historico', 'PVs geradas'],
];

function Principal({ sessao, demo, versao, onSair }) {
  const dlg = useDialogos();
  const [tela, setTela] = useState('rupturas');
  const [pedidoRupturas, setPedidoRupturas] = useState(null); // filtros vindos da tela de clientes
  const [pendentes, setPendentes] = useState(null);
  const [aberto, setAberto] = useState(false);
  const tempo = useRef();

  // abre ao passar o mouse e fecha ao sair (com pequeno atraso para não piscar)
  const abrir = () => { clearTimeout(tempo.current); tempo.current = setTimeout(() => setAberto(true), 60); };
  const fechar = () => { clearTimeout(tempo.current); tempo.current = setTimeout(() => setAberto(false), 180); };
  useEffect(() => () => clearTimeout(tempo.current), []);

  const sair = async () => {
    setAberto(false);
    if (await dlg.confirmar('Deseja realmente sair? Você precisará fazer login novamente.', { titulo: 'Sair do sistema' })) onSair();
  };
  const ir = (id) => { setTela(id); setAberto(false); };
  const inicial = sessao.usuario.trim().charAt(0).toUpperCase();

  return (
    <div className="casca">
      <div className="trilho-vaga">
        <aside className={`trilho ${aberto ? 'aberto' : ''}`} onMouseEnter={abrir} onMouseLeave={fechar} onFocus={abrir} onBlur={fechar}>
          <div className="titulo">
            <span className="logo" aria-hidden="true"><i /><i /><i /></span>
            <span className="rot">Pré-Venda de Ruptura<small>{sessao.conexao.nome}</small></span>
          </div>
          <nav>
            {TELAS.map(([id, nome]) => (
              <button key={id} className={tela === id ? 'ativo' : ''} onClick={() => ir(id)} title={aberto ? undefined : nome}>
                <Icone nome={id} />
                <span className="rot">{nome}</span>
                {id === 'rupturas' && pendentes > 0 && <span className="cont">{pendentes}</span>}
              </button>
            ))}
          </nav>
          <div className="base">
            <div className="usuario">
              <span className="avatar" title={sessao.usuario.toUpperCase()}>{inicial}</span>
              <span className="rot">
                <b>{sessao.usuario.toUpperCase()}</b>
                <small>{sessao.conexao.banco}</small>
              </span>
            </div>
            <div className="rot detalhes">
              {demo && <span className="demo-tag">Modo demonstração</span>}
              <span>v{versao}</span>
            </div>
            <button className="sair" onClick={sair} title={aberto ? undefined : 'Sair'}>
              <Icone nome="sair" /><span className="rot">Sair</span>
            </button>
          </div>
        </aside>
      </div>
      <main className="palco">
        <div style={{ display: tela === 'rupturas' ? 'contents' : 'none' }}>
          <Rupturas ativa={tela === 'rupturas'} pedidoExterno={pedidoRupturas} onPendentes={setPendentes} conexao={sessao.conexao} />
        </div>
        {tela === 'clientes' && (
          <Clientes conexao={sessao.conexao} onAbrirCliente={(f) => { setPedidoRupturas({ ...f, t: Date.now() }); setTela('rupturas'); }} />
        )}
        {tela === 'historico' && <Historico conexao={sessao.conexao} />}
      </main>
    </div>
  );
}
