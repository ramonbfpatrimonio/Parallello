import React, { useEffect, useState } from 'react';
import { Download, Upload, FolderOpen, ShieldCheck, KeyRound } from 'lucide-react';
import { Aviso, Toggle } from '../components/Comuns.jsx';
import { limparErro } from './ReportPage.jsx';

export default function BackupPage({ dados, setDados, avisar }) {
  const [backups, setBackups] = useState([]);
  useEffect(() => { window.api.listarBackups().then(setBackups); }, [dados]);

  const exportar = async () => {
    const p = await window.api.exportarBackup();
    if (p) avisar('Cópia salva em ' + p);
  };
  const importar = async () => {
    if (!window.confirm('Restaurar substitui todas as empresas e conexões atuais pelas do arquivo. Continuar?')) return;
    try {
      const novos = await window.api.importarBackup();
      if (novos) { setDados(novos); avisar('Cópia de segurança restaurada.'); }
    } catch (err) {
      avisar(limparErro(err), 'erro');
    }
  };
  const prefs = dados.preferencias || {};

  return (
    <>
      <div className="card card-corpo">
        <h3><ShieldCheck size={16} style={{ verticalAlign: -3 }} /> Dados salvos neste computador</h3>
        <p className="ajuda">
          Tudo fica salvo localmente, sem nuvem: empresas, conexões e fabricantes. Os dados de vendas não são copiados —
          eles são lidos do SQL Server do ERP a cada consulta.
        </p>
        <p className="ajuda">Pasta: <code>{dados.pastaDados}</code></p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn primario" onClick={exportar}><Download size={15} /> Salvar cópia de segurança</button>
          <button className="btn" onClick={importar}><Upload size={15} /> Restaurar cópia</button>
          <button className="btn" onClick={() => window.api.abrirPastaDados()}><FolderOpen size={15} /> Abrir pasta</button>
        </div>
        <div style={{ marginTop: 14 }}>
          <Aviso tipo="info">
            As senhas das bases são criptografadas com a chave do Windows deste usuário. Ao restaurar a cópia em outro computador,
            digite a senha de cada base novamente em “Empresas e conexões”.
          </Aviso>
        </div>
      </div>

      <div className="card card-corpo">
        <h3>Preferências</h3>
        <Toggle checked={prefs.deduzirRetorno} onChange={async (v) => setDados(await window.api.salvarPreferencias({ deduzirRetorno: v }))}>
          Começar os relatórios com “Deduzir retorno” ligado
        </Toggle>
      </div>

      <AlterarSenha avisar={avisar} />

      <div className="card card-corpo">
        <h3>Cópias automáticas</h3>
        <p className="ajuda">O sistema guarda uma cópia por dia (as 15 mais recentes) na pasta “backups”.</p>
        <table className="edicao" style={{ marginTop: 8 }}>
          <thead><tr><th>Arquivo</th><th>Data</th></tr></thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.nome}><td>{b.nome}</td><td>{new Date(b.data).toLocaleString('pt-BR')}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AlterarSenha({ avisar }) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [repetir, setRepetir] = useState('');
  const salvar = async () => {
    if (nova !== repetir) return avisar('A confirmação não confere com a nova senha.', 'erro');
    try {
      await window.api.alterarSenhaConfig({ atual, nova });
      setAtual(''); setNova(''); setRepetir('');
      avisar('Senha de acesso alterada.');
    } catch (err) {
      avisar(limparErro(err), 'erro');
    }
  };
  return (
    <div className="card card-corpo">
      <h3><KeyRound size={16} style={{ verticalAlign: -3 }} /> Senha da área de configuração</h3>
      <p className="ajuda">
        A configuração fica oculta para os usuários. Para abrir: <b>Ctrl + Shift + B</b> e a senha master do dia
        (<b>@t1v0ERP10</b> + data do computador em DDMMAAAA), que sempre funciona. Se quiser, cadastre abaixo uma senha
        própria, que passa a valer junto com a master.
      </p>
      <div className="grade" style={{ marginTop: 10, maxWidth: 760 }}>
        <label className="campo"><span>Senha atual</span><input className="input" type="password" value={atual} onChange={(e) => setAtual(e.target.value)} /></label>
        <label className="campo"><span>Nova senha</span><input className="input" type="password" value={nova} onChange={(e) => setNova(e.target.value)} /></label>
        <label className="campo"><span>Repetir nova senha</span><input className="input" type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} /></label>
        <div className="campo"><span>&nbsp;</span><button className="btn" onClick={salvar} disabled={!atual || !nova}>Alterar senha</button></div>
      </div>
    </div>
  );
}
