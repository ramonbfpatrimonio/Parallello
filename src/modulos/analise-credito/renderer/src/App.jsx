import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Gauge, BarChart3, History, Database, ChevronDown, Lock, CheckCircle2 } from 'lucide-react';
import { api } from './util.js';
import logo from './assets/logo.svg';
import Analise from './telas/Analise.jsx';
import Ficha from './telas/Ficha.jsx';
import VendasMes from './telas/VendasMes.jsx';
import Historico from './telas/Historico.jsx';
import AreaOculta from './telas/AreaOculta.jsx';

const MENU = [
  { id: 'analise', nome: 'Análise de Crédito', icone: Gauge },
  { id: 'vendas', nome: 'Vendas por Mês', icone: BarChart3 },
  { id: 'historico', nome: 'Histórico de Decisões', icone: History }
];

export default function App() {
  const [tela, setTela] = useState('analise');
  const [fichaCliente, setFichaCliente] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [filtrosUsados, setFiltrosUsados] = useState(null);
  const [pedindoSenha, setPedindoSenha] = useState(false);
  const [areaOculta, setAreaOculta] = useState(false);
  const [conexoes, setConexoes] = useState([]);
  const ativa = conexoes.find((c) => c.ativa) || null;

  const carregarConexoes = useCallback(() => {
    api.conexoesListar().then(setConexoes).catch(() => setConexoes([]));
  }, []);

  useEffect(() => { carregarConexoes(); }, [carregarConexoes]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey && e.shiftKey && (e.code === 'KeyB' || e.key.toLowerCase() === 'b')) {
        e.preventDefault();
        if (!areaOculta) setPedindoSenha(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [areaOculta]);

  const trocarConexao = async (id) => {
    await api.conexoesAtivar(id);
    setResultado(null);
    setFichaCliente(null);
    carregarConexoes();
  };

  const irPara = (id) => { setFichaCliente(null); setTela(id); };
  const telaAtual = MENU.find((m) => m.id === tela);

  return (
    <div className="app">
      <BarraLateral tela={tela} onIr={irPara} ativa={ativa} />

      <div className="principal">
        <div className="topo">
          <div className="trilha">
            <span>Parallello</span><span className="sep">/</span>
            <span className={fichaCliente ? '' : 'atual'}>{telaAtual?.nome}</span>
            {fichaCliente && <><span className="sep">/</span><span className="atual">{fichaCliente.Nome}</span></>}
          </div>
          <SeletorConexao conexoes={conexoes} ativa={ativa} onTrocar={trocarConexao} />
        </div>

        <main className="conteudo">
          {conexoes.length === 0 && (
            <div className="aviso"><Lock size={15} /> Nenhuma conexão cadastrada. Cadastre na Configuração do Parallello (Ctrl+Shift+B na tela inicial).</div>
          )}
          {tela === 'analise' && !fichaCliente && (
            <Analise
              key={ativa?.id || 'sem'}
              resultado={resultado}
              empresa={ativa?.nome}
              onResultado={(r, f) => { setResultado(r); setFiltrosUsados(f); }}
              onAbrir={(c) => setFichaCliente(c)}
            />
          )}
          {tela === 'analise' && fichaCliente && (
            <Ficha
              cliente={fichaCliente}
              filtros={filtrosUsados}
              empresa={ativa?.nome}
              conexaoId={ativa?.id}
              pontuacaoMaxima={resultado?.pontuacaoMaxima}
              onVoltar={() => setFichaCliente(null)}
            />
          )}
          {tela === 'vendas' && <VendasMes key={ativa?.id || 'sem'} empresa={ativa?.nome} />}
          {tela === 'historico' && <Historico conexoes={conexoes} ativa={ativa} />}
        </main>
      </div>

      {pedindoSenha && (
        <ModalSenha
          onCancelar={() => setPedindoSenha(false)}
          onOk={() => { setPedindoSenha(false); setAreaOculta(true); }}
        />
      )}
      {areaOculta && (
        <AreaOculta
          onFechar={() => { setAreaOculta(false); carregarConexoes(); }}
          onConexoesAlteradas={carregarConexoes}
        />
      )}
    </div>
  );
}

// Barra lateral: recolhida mostra só os ícones; abre ao passar o mouse e recolhe ao sair
function BarraLateral({ tela, onIr, ativa }) {
  return (
    <aside className="lateral">
      <div className="lateral-painel">
        <div className="marca">
          <img className="marca-logo" src={logo} alt="Análise de Crédito" />
          <div className="rotulo">
            <div className="marca-nome">Análise de Crédito</div>
            <div className="marca-sub">Score de clientes</div>
          </div>
        </div>
        <nav>
          {MENU.map((m) => {
            const Icone = m.icone;
            return (
              <button key={m.id} className={`menu-item ${tela === m.id ? 'ativo' : ''}`} onClick={() => onIr(m.id)} title={m.nome}>
                <span className="menu-icone"><Icone size={19} /></span>
                <span className="rotulo">{m.nome}</span>
              </button>
            );
          })}
        </nav>
        <div className="lateral-rodape">
          <span className={`menu-icone ${ativa ? 'ok' : 'off'}`}><Database size={17} /></span>
          <span className="rotulo">
            <small>Conexão</small>
            {ativa ? ativa.nome : 'Não configurada'}
          </span>
        </div>
      </div>
    </aside>
  );
}

function SeletorConexao({ conexoes, ativa, onTrocar }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);
  if (!conexoes.length) return null;
  return (
    <div className="seletor" ref={ref}>
      <button className="seletor-btn" onClick={() => setAberto(!aberto)} title="Trocar a conexão (empresa)">
        <span className="pulso" />
        <span className="seletor-txt"><small>Conexão</small>{ativa?.nome || 'Selecione'}</span>
        <ChevronDown size={15} className={aberto ? 'gira180' : ''} />
      </button>
      {aberto && (
        <div className="seletor-menu">
          {conexoes.map((c) => (
            <button key={c.id} className={`seletor-item ${c.ativa ? 'ativo' : ''}`}
              onClick={() => { setAberto(false); if (!c.ativa) onTrocar(c.id); }}>
              <span className="seletor-item-txt">
                <b>{c.nome}</b>
                <small>{c.servidor} · {c.banco}</small>
              </span>
              {c.ativa && <CheckCircle2 size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ModalSenha({ onOk, onCancelar }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const confirmar = async (e) => {
    e.preventDefault();
    try {
      if (await api.validarSenha(senha)) onOk();
      else { setErro('Senha inválida.'); setSenha(''); }
    } catch (err) { setErro(err.message); }
  };
  return (
    <div className="modal-fundo" onMouseDown={onCancelar}>
      <form className="modal pequeno" onMouseDown={(e) => e.stopPropagation()} onSubmit={confirmar}>
        <img className="modal-logo" src={logo} alt="" />
        <h3>Área do sistema</h3>
        <p className="muted">Informe a senha do Parallello.</p>
        <input type="password" autoFocus value={senha} onChange={(e) => { setSenha(e.target.value); setErro(''); }} placeholder="Senha" />
        {erro && <div className="erro-txt">{erro}</div>}
        <div className="acoes">
          <button type="button" className="btn" onClick={onCancelar}>Cancelar</button>
          <button type="submit" className="btn primario">Entrar</button>
        </div>
      </form>
    </div>
  );
}
