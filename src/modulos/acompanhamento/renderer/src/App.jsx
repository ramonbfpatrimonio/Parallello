import React, { useEffect, useState, useCallback, useRef } from 'react';
import { BarChart3, CalendarDays, Layers, Trophy, Users, PackageX, Building2, ShieldCheck, Lock, KeyRound, Store } from 'lucide-react';
import ReportPage from './pages/ReportPage.jsx';
import EmpresasPage from './pages/EmpresasPage.jsx';
import BackupPage from './pages/BackupPage.jsx';
import { Carregando, Aviso } from './components/Comuns.jsx';
import { hojeISO } from './format.js';

const ICONES = {
  acompanhamento: CalendarDays,
  'valor-volume': Layers,
  ranking: Trophy,
  'setor-com-sem-compra': Users,
  ruptura: PackageX
};
const PAGINAS_CONFIG = ['empresas', 'backup'];

// Janela de senha da área de configuração (aberta com Ctrl+Shift+B)
function JanelaSenha({ onFechar, onLiberar }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const campo = useRef(null);
  useEffect(() => { campo.current && campo.current.focus(); }, []);

  const confirmar = async (e) => {
    e.preventDefault();
    setVerificando(true);
    const ok = await window.api.desbloquearConfig(senha);
    setVerificando(false);
    if (ok) onLiberar();
    else { setErro(true); setSenha(''); campo.current && campo.current.focus(); }
  };

  return (
    <div className="modal-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <form className="modal" onSubmit={confirmar} onKeyDown={(e) => { if (e.key === 'Escape') onFechar(); }}>
        <div className="modal-icone"><KeyRound size={20} /></div>
        <h3>Área de configuração</h3>
        <p className="ajuda">Digite a senha de acesso.</p>
        <input
          ref={campo}
          type="password"
          className="input"
          value={senha}
          autoComplete="off"
          onChange={(e) => { setSenha(e.target.value); setErro(false); }}
        />
        {erro && <div className="erro-senha">Senha incorreta.</div>}
        <div className="modal-acoes">
          <button type="button" className="btn" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn primario" disabled={!senha || verificando}>Entrar</button>
        </div>
      </form>
    </div>
  );
}

export default function App() {
  const [dados, setDados] = useState(null);
  const [relatorios, setRelatorios] = useState([]);
  const [pagina, setPagina] = useState('acompanhamento');
  const [periodo, setPeriodo] = useState({ ini: hojeISO(), fim: hojeISO() });
  const [estados, setEstados] = useState({});
  const [ocupado, setOcupado] = useState(false);
  const [msgProgresso, setMsgProgresso] = useState(null);
  const [toast, setToast] = useState(null);
  const [pedindoSenha, setPedindoSenha] = useState(false);

  // barra lateral: abre com o mouse por cima e fecha ao sair
  // (continua aberta enquanto a lista de empresas estiver em uso, para não fechar no meio da escolha)
  const [menuAberto, setMenuAberto] = useState(false);
  const selecionandoEmpresa = useRef(false);
  const tempoFechar = useRef(null);
  const abrirMenu = () => { clearTimeout(tempoFechar.current); setMenuAberto(true); };
  const fecharMenu = () => {
    clearTimeout(tempoFechar.current);
    tempoFechar.current = setTimeout(() => { if (!selecionandoEmpresa.current) setMenuAberto(false); }, 120);
  };

  const liberada = !!(dados && dados.configLiberada);

  useEffect(() => {
    Promise.all([window.api.obterDados(), window.api.listarRelatorios()]).then(([d, r]) => {
      setDados(d);
      setRelatorios(r);
    });
    return window.api.aoProgredir(setMsgProgresso);
  }, []);

  // Ctrl + Shift + B abre a configuração (pede a senha se ainda estiver bloqueada)
  useEffect(() => {
    const tecla = (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'B' || e.key === 'b' || e.code === 'KeyB')) {
        e.preventDefault();
        if (liberada) setPagina('empresas');
        else setPedindoSenha(true);
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [liberada]);

  const avisar = useCallback((msg, tipo = 'ok') => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), tipo === 'erro' ? 7000 : 3500);
  }, []);

  const carregar = useCallback(async (fn) => {
    setOcupado(true);
    try { await fn(); } finally { setOcupado(false); setMsgProgresso(null); }
  }, []);

  if (!dados) return <Carregando msg="Abrindo..." />;

  const empresa = dados.empresas.find((e) => e.id === dados.empresaAtivaId);
  const rel = relatorios.find((r) => r.id === pagina);
  const paginaAtual = !liberada && PAGINAS_CONFIG.includes(pagina) ? relatorios[0] && relatorios[0].id : pagina;
  const relAtual = rel || relatorios.find((r) => r.id === paginaAtual);

  const trocarEmpresa = async (id) => {
    setDados(await window.api.ativarEmpresa(id));
    setEstados({});
  };

  const liberar = async () => {
    setPedindoSenha(false);
    setDados(await window.api.obterDados());
    setPagina('empresas');
  };

  const bloquear = async () => {
    await window.api.bloquearConfig();
    setDados(await window.api.obterDados());
    setPagina(relatorios[0] ? relatorios[0].id : 'acompanhamento');
  };

  const titulos = {
    empresas: ['Empresas e conexões', 'Clientes atendidos, bases do SQL Server e fabricantes'],
    backup: ['Dados e cópia de segurança', 'Tudo salvo localmente neste computador']
  };
  const [titulo, sub] = relAtual ? [relAtual.nome, relAtual.descricao] : titulos[paginaAtual] || ['', ''];

  const Item = ({ id, icone: Icone, children }) => (
    <button className={paginaAtual === id ? 'ativo' : ''} onClick={() => setPagina(id)} title={typeof children === 'string' ? children : undefined}>
      <Icone size={17} /> <span className="rotulo some">{children}</span>
    </button>
  );

  return (
    <div className="app">
      <aside className={'lateral' + (menuAberto ? ' aberta' : '')} onMouseEnter={abrirMenu} onMouseLeave={fecharMenu}>
        <div className="marca">
          <div className="marca-icone"><BarChart3 size={19} /></div>
          <div className="some"><b>Acompanhamento</b><small>de vendas</small></div>
        </div>
        {dados.empresas.length > 1 && (
          <div className="seletor-empresa" title={empresa ? empresa.nome : ''}>
            <span className="icone-empresa"><Store size={18} /></span>
            <div className="some">
              <label>Empresa</label>
              <select
                value={dados.empresaAtivaId || ''}
                onFocus={() => { selecionandoEmpresa.current = true; }}
                onBlur={() => { selecionandoEmpresa.current = false; }}
                onChange={(e) => { selecionandoEmpresa.current = false; e.target.blur(); trocarEmpresa(e.target.value); }}
              >
                {dados.empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>
          </div>
        )}
        <nav className="nav">
          <h6><span className="some">Relatórios</span></h6>
          {relatorios.map((r) => <Item key={r.id} id={r.id} icone={ICONES[r.id] || BarChart3}>{r.nome}</Item>)}
          {liberada && (
            <>
              <h6><span className="some">Configuração</span></h6>
              <Item id="empresas" icone={Building2}>Empresas e conexões</Item>
              <Item id="backup" icone={ShieldCheck}>Dados e backup</Item>
              <button onClick={bloquear} title="Ocultar a configuração novamente">
                <Lock size={17} /> <span className="rotulo some">Bloquear configuração</span>
              </button>
            </>
          )}
        </nav>
        <div className="rodape-lateral some">
          {empresa && dados.empresas.length === 1 ? <div className="empresa-rodape">{empresa.nome}</div> : null}
          Versão {dados.versaoApp} • dados locais
        </div>
      </aside>

      <main className="conteudo">
        <header className="topo">
          <div>
            <h1>{titulo}</h1>
            <p>{sub}{empresa && relAtual ? ` • ${empresa.nome}` : ''}</p>
          </div>
        </header>
        <div className="pagina">
          {relAtual && (
            <ReportPage
              key={relAtual.id + '|' + dados.empresaAtivaId}
              rel={relAtual}
              periodo={periodo}
              setPeriodo={setPeriodo}
              prefs={dados.preferencias}
              estado={estados[relAtual.id]}
              setEstado={(s) => setEstados((e) => ({ ...e, [relAtual.id]: s }))}
              empresa={empresa}
              carregar={carregar}
            />
          )}
          {liberada && paginaAtual === 'empresas' && <EmpresasPage dados={dados} setDados={setDados} avisar={avisar} />}
          {liberada && paginaAtual === 'backup' && <BackupPage dados={dados} setDados={setDados} avisar={avisar} />}
        </div>
      </main>

      {pedindoSenha && <JanelaSenha onFechar={() => setPedindoSenha(false)} onLiberar={liberar} />}
      {ocupado && <Carregando msg={msgProgresso} />}
      {toast && (
        <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 60, maxWidth: 460, boxShadow: '0 10px 30px rgba(16,24,40,.15)', borderRadius: 9 }}>
          <Aviso tipo={toast.tipo}>{toast.msg}</Aviso>
        </div>
      )}
    </div>
  );
}
