import React, { useEffect, useState } from 'react';
import { Save, Loader2, Download, Upload, FolderOpen, KeyRound } from 'lucide-react';
import { api } from '../lib/api';
import { useAviso } from '../componentes/comum';

export default function Configuracoes({ sessao, admin }) {
  const avisar = useAviso();
  const [cfg, setCfg] = useState(null);
  const [centros, setCentros] = useState([]);
  const [info, setInfo] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [senha, setSenha] = useState({ atual: '', nova: '', confirma: '' });

  useEffect(() => {
    Promise.all([api('config:obter'), api('centros:listar'), api('app:info')])
      .then(([c, ce, i]) => { setCfg(c); setCentros(ce); setInfo(i); })
      .catch((e) => avisar(e.message, 'erro'));
  }, []);

  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));

  async function salvar() {
    setSalvando(true);
    try { setCfg(await api('config:salvar', cfg)); avisar('Configurações salvas.', 'ok'); } catch (e) { avisar(e.message, 'erro'); } finally { setSalvando(false); }
  }

  async function backup(tipo) {
    try {
      const r = await api(tipo === 'exportar' ? 'backup:exportar' : 'backup:importar');
      if (r) avisar(tipo === 'exportar' ? 'Backup salvo. As senhas das conexões não vão no backup.' : 'Backup restaurado. Confira as senhas das conexões.', 'ok');
      if (r && tipo === 'importar') setCfg(await api('config:obter'));
    } catch (e) { avisar(e.message, 'erro'); }
  }

  async function trocarSenha() {
    if (senha.nova !== senha.confirma) return avisar('A confirmação não confere.', 'erro');
    try { await api('auth:trocarSenha', senha); setSenha({ atual: '', nova: '', confirma: '' }); avisar('Senha alterada.', 'ok'); } catch (e) { avisar(e.message, 'erro'); }
  }

  if (!cfg) return <div className="vazio"><Loader2 className="girar" /></div>;

  return (
    <div className="pagina" style={{ maxWidth: 1000 }}>
      <div className="pagina-topo">
        <div><h1>Configurações</h1><p>Versão {info?.versao}</p></div>
        {admin && <button className="btn primario" onClick={salvar} disabled={salvando}>{salvando ? <Loader2 size={16} className="girar" /> : <Save size={16} />} Salvar</button>}
      </div>

      <div className="grade" style={{ gap: 16 }}>
        {admin && (
          <div className="card">
            <div className="card-cab"><h2>Painel</h2></div>
            <div className="card-corpo grade g2">
              <label className="campo" style={{ gridColumn: 'span 2' }}><span>Nome da empresa (aparece no Excel e no PDF)</span>
                <input value={cfg.empresa} onChange={(e) => set('empresa', e.target.value)} />
              </label>
              <label className="campo"><span>Modo de cálculo ao abrir</span>
                <select value={cfg.modoPadrao} onChange={(e) => set('modoPadrao', e.target.value)}>
                  <option value="padrao">Padrão (corrigido)</option>
                  <option value="planilha">Planilha (igual ao Excel)</option>
                </select>
              </label>
              <label className="campo"><span>Centro de custo ao abrir</span>
                <select value={cfg.centroPadrao} onChange={(e) => set('centroPadrao', e.target.value)}>
                  <option value="">Nenhum</option>
                  {centros.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} - {c.descricao}</option>)}
                </select>
              </label>
              <label className="check" style={{ gridColumn: 'span 2' }}>
                <input type="checkbox" checked={cfg.unificarPadrao} onChange={(e) => set('unificarPadrao', e.target.checked)} />
                Unificar entregas do mesmo cliente no mesmo dia entre conexões (marcado por padrão)
              </label>
            </div>
          </div>
        )}

        {admin && (
          <div className="card">
            <div className="card-cab"><h2>Dados e backup</h2></div>
            <div className="card-corpo">
              <p className="sub" style={{ marginTop: 0 }}>Os dados ficam em: <span className="mono">{info?.pastaDados}</span></p>
              <div className="acoes">
                <button className="btn" onClick={() => backup('exportar')}><Download size={16} /> Fazer backup</button>
                <button className="btn" onClick={() => backup('importar')}><Upload size={16} /> Restaurar backup</button>
                <button className="btn" onClick={() => api('app:abrirPastaDados')}><FolderOpen size={16} /> Abrir pasta de dados</button>
              </div>
              <p className="sub">O backup leva usuários, conexões (sem as senhas), centros de custo, metas e configurações. O histórico de consultas fica na pasta de dados.</p>
            </div>
          </div>
        )}

        {sessao.perfil !== 'master' && !sessao.parallello && (
          <div className="card">
            <div className="card-cab"><h2><KeyRound size={16} /> Minha senha</h2></div>
            <div className="card-corpo grade g3">
              <label className="campo"><span>Senha atual</span><input type="password" value={senha.atual} onChange={(e) => setSenha({ ...senha, atual: e.target.value })} /></label>
              <label className="campo"><span>Nova senha</span><input type="password" value={senha.nova} onChange={(e) => setSenha({ ...senha, nova: e.target.value })} /></label>
              <label className="campo"><span>Confirmar</span><input type="password" value={senha.confirma} onChange={(e) => setSenha({ ...senha, confirma: e.target.value })} /></label>
              <div><button className="btn" onClick={trocarSenha} disabled={!senha.atual || !senha.nova}>Alterar senha</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
