import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './lib/api';
import Consulta from './components/Consulta';
import Historico from './components/Historico';
import Sistema from './components/Sistema';
import ModalSenha from './components/ModalSenha';
import Icone from './components/Icone';

function lerTema() {
  try { return localStorage.getItem('tema') || 'claro'; } catch { return 'claro'; }
}

export default function App() {
  const [aba, setAba] = useState('consulta');
  const [config, setConfig] = useState(null);
  const [sistemaLiberado, setSistemaLiberado] = useState(false);
  const [pedirSenha, setPedirSenha] = useState(false);
  const [toast, setToast] = useState(null);
  const [tema, setTema] = useState(lerTema);
  const timer = useRef();

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    try { localStorage.setItem('tema', tema); } catch { /* ignora */ }
  }, [tema]);

  const aviso = useCallback((texto, tipo = 'ok') => {
    clearTimeout(timer.current);
    setToast({ texto, tipo, chave: Date.now() });
    timer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  const recarregarConfig = useCallback(async () => {
    try { setConfig(await api.configGet()); } catch (e) { aviso(e.message, 'erro'); }
  }, [aviso]);

  useEffect(() => { recarregarConfig(); }, [recarregarConfig]);

  // Atalho oculto: Ctrl+Shift+B
  useEffect(() => {
    const tecla = e => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        if (sistemaLiberado) setAba('sistema');
        else setPedirSenha(true);
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [sistemaLiberado]);

  async function trocarConexao(id) {
    try {
      setConfig(await api.ativarConexao(id));
      const nome = config.conexoes.find(c => c.id === id)?.nome;
      aviso(`Usando a conexão ${nome}.`, 'info');
    } catch (e) { aviso(e.message, 'erro'); }
  }

  function bloquear() {
    setSistemaLiberado(false);
    if (aba === 'sistema') setAba('consulta');
  }

  const conexoes = config?.conexoes || [];
  const ativa = conexoes.find(c => c.id === config?.ativaId) || null;

  const itens = [
    { id: 'consulta', rotulo: 'Custo de produção', icone: 'custo' },
    { id: 'historico', rotulo: 'Histórico', icone: 'historico' },
    ...(sistemaLiberado ? [{ id: 'sistema', rotulo: 'Sistema', icone: 'sistema' }] : [])
  ];

  return (
    <div className="app">
      <aside className="lateral" aria-label="Menu">
        <div className="marca">
          <svg className="selo" viewBox="0 0 40 40" aria-hidden="true">
            <rect width="40" height="40" rx="10" />
            <path d="M10 28h20M13 24v-7M18 24V12M23 24v-5M28 24v-9" />
          </svg>
          <div className="some">
            <strong>Custo de Produção</strong>
            <span>Parallello</span>
          </div>
        </div>

        <nav className="menu">
          {itens.map(i => (
            <button key={i.id} className={aba === i.id ? 'ativo' : ''} onClick={e => { setAba(i.id); e.currentTarget.blur(); }} aria-current={aba === i.id ? 'page' : undefined} title={i.rotulo}>
              <Icone nome={i.icone} />
              <span className="some">{i.rotulo}</span>
            </button>
          ))}
        </nav>

        <div className="lateral-rodape">
          <div className="troca-mini" title={ativa ? `Banco em uso: ${ativa.nome}` : 'Nenhuma conexão'} aria-hidden="true">
            <Icone nome="banco" />
            <b>{ativa ? ativa.nome.split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase() : '—'}</b>
          </div>
          <div className="troca-conexao">
            <label htmlFor="sel-conexao"><Icone nome="banco" tamanho={14} /> Banco em uso</label>
            {conexoes.length ? (
              <>
                <select id="sel-conexao" value={config.ativaId} onChange={e => { trocarConexao(e.target.value); e.target.blur(); }}>
                  {conexoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                {ativa && <small title={`${ativa.server} / ${ativa.database}`}>{ativa.server}{ativa.instance ? `\\${ativa.instance}` : ''} / {ativa.database}</small>}
              </>
            ) : (
              <small>Nenhuma conexão no Parallello. Cadastre na Configuração (Ctrl+Shift+B na tela inicial).</small>
            )}
          </div>

          <div className="lateral-acoes">
            <button className="icone-btn" onClick={() => setTema(t => (t === 'escuro' ? 'claro' : 'escuro'))} title={tema === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'}>
              <Icone nome={tema === 'escuro' ? 'sol' : 'lua'} />
            </button>
            {sistemaLiberado && (
              <button className="icone-btn" onClick={bloquear} title="Fechar a área do sistema">
                <Icone nome="cadeado" />
              </button>
            )}
          </div>
        </div>
      </aside>

      <main className="conteudo">
        {/* As telas ficam montadas para não perder a consulta ao trocar de aba */}
        <div hidden={aba !== 'consulta'}><Consulta config={config} ativa={ativa} aviso={aviso} /></div>
        <div hidden={aba !== 'historico'}><Historico config={config} aviso={aviso} ativo={aba === 'historico'} /></div>
        {sistemaLiberado && (
          <div hidden={aba !== 'sistema'}><Sistema config={config} setConfig={setConfig} aviso={aviso} /></div>
        )}
      </main>

      {pedirSenha && (
        <ModalSenha
          aoFechar={() => setPedirSenha(false)}
          aoLiberar={() => { setPedirSenha(false); setSistemaLiberado(true); setAba('sistema'); }}
        />
      )}

      {toast && <div key={toast.chave} className={`toast ${toast.tipo}`} role="status">{toast.texto}</div>}
    </div>
  );
}
