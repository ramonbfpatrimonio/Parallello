import React, { useEffect, useState } from 'react';
import { Campo, Modal, fmtDataHora, useDialogos } from '../ui.jsx';

const ABAS = [['conexoes', 'Empresas e conexões'], ['usuarios', 'Usuários'], ['banco', 'Banco de dados'], ['parametros', 'Parâmetros']];

export default function Configuracao({ onFechar }) {
  const dlg = useDialogos();
  const [aba, setAba] = useState('conexoes');
  const [dados, setDados] = useState(null);
  const recarregar = () => window.api.config.dados().then(setDados).catch((e) => dlg.erro(e));
  useEffect(() => { recarregar(); }, []);

  return (
    <Modal tamanho="enorme" titulo="Configurações" sub="Área restrita. As alterações ficam salvas só neste computador." onFechar={onFechar} semPre
      rodape={<><span style={{ marginRight: 'auto', color: 'var(--tinta-3)', fontSize: 12 }}>{dados?.pastaDados}</span><button className="btn" onClick={() => window.api.config.abrirPasta()}>Abrir pasta de dados</button><button className="btn primario" onClick={onFechar}>Fechar</button></>}>
      <div className="config" style={{ margin: '-14px -20px', height: 'calc(100% + 28px)' }}>
        <nav>{ABAS.map(([id, n]) => <button key={id} className={aba === id ? 'ativo' : ''} onClick={() => setAba(id)}>{n}</button>)}</nav>
        <div className="painel">
          {!dados ? <span className="carregando" /> : (
            <>
              {aba === 'conexoes' && <Conexoes dados={dados} recarregar={recarregar} />}
              {aba === 'usuarios' && <Usuarios dados={dados} recarregar={recarregar} />}
              {aba === 'banco' && <Banco dados={dados} />}
              {aba === 'parametros' && <Parametros dados={dados} recarregar={recarregar} />}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ---------------- Conexões ----------------
const VAZIA = { id: null, nome: '', servidor: '', porta: '', instancia: '', banco: '', usuario: 'sa', encrypt: false };

function Conexoes({ dados, recarregar }) {
  const dlg = useDialogos();
  const [form, setForm] = useState(dados.conexoes.length ? null : { ...VAZIA });
  const [senha, setSenha] = useState('');
  const [teste, setTeste] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const editar = (c) => { setForm({ ...VAZIA, ...c }); setSenha(''); setTeste(null); };
  const testar = async () => {
    setTeste({ rodando: true });
    try { const r = await window.api.config.testarConexao({ dados: form, senha }); setTeste({ ok: true, r }); }
    catch (e) { setTeste({ erro: e.message }); }
  };
  const salvar = async () => {
    try { await window.api.config.salvarConexao({ dados: form, senha }); dlg.toast('Conexão salva.'); setForm(null); recarregar(); }
    catch (e) { dlg.erro(e); }
  };
  const excluir = async (c) => {
    if (!(await dlg.confirmar(`Excluir a conexão "${c.nome}"? O histórico local dessa empresa é mantido.`, { titulo: 'Excluir conexão' }))) return;
    try { await window.api.config.excluirConexao(c.id); recarregar(); } catch (e) { dlg.erro(e); }
  };

  return (
    <>
      <h3>Empresas e conexões</h3>
      <p className="desc">Cadastre o banco SQL Server do ERP de cada cliente. No login, o usuário escolhe com qual empresa vai trabalhar.</p>
      {!form && (
        <>
          <table className="mini" style={{ marginBottom: 14 }}>
            <thead><tr><th>Empresa</th><th>Servidor</th><th>Banco</th><th>Usuário SQL</th><th /></tr></thead>
            <tbody>
              {dados.conexoes.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--tinta-2)' }}>Nenhuma conexão cadastrada.</td></tr>}
              {dados.conexoes.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.nome}</b></td>
                  <td>{c.servidor}{c.instancia ? '\\' + c.instancia : ''}{c.porta ? ':' + c.porta : ''}</td>
                  <td>{c.banco}</td><td>{c.usuario}</td>
                  <td className="r"><button className="btn peq" onClick={() => editar(c)}>Editar</button> <button className="btn peq perigo" onClick={() => excluir(c)}>Excluir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn primario" onClick={() => editar(VAZIA)}>Nova conexão</button>
        </>
      )}
      {form && (
        <div className="cartao">
          <div className="grade-form">
            <Campo rotulo="Nome da empresa" className="s3"><input value={form.nome} onChange={set('nome')} autoFocus placeholder="Ex.: Hage Distribuidora" /></Campo>
            <Campo rotulo="Banco de dados" className="s3"><input value={form.banco} onChange={set('banco')} placeholder="Ex.: HAGE.0001.LOG" /></Campo>
            <Campo rotulo="Servidor" className="s2" dica="Nome ou IP. Aceita SERVIDOR\INSTANCIA."><input value={form.servidor} onChange={set('servidor')} placeholder="Ex.: 192.168.0.10" /></Campo>
            <Campo rotulo="Instância (opcional)" className="s2" dica="Ex.: SQLEXPRESS. Usa o SQL Browser."><input value={form.instancia} onChange={set('instancia')} /></Campo>
            <Campo rotulo="Porta (opcional)" className="s2" dica="Se informada, ignora a instância. Padrão 1433."><input value={form.porta} onChange={set('porta')} inputMode="numeric" /></Campo>
            <Campo rotulo="Usuário do SQL" className="s3"><input value={form.usuario} onChange={set('usuario')} /></Campo>
            <Campo rotulo={form.id ? 'Senha do SQL (deixe em branco para manter)' : 'Senha do SQL'} className="s3"><input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} /></Campo>
            <label className="check s6"><input type="checkbox" checked={form.encrypt} onChange={set('encrypt')} /> Usar conexão criptografada (TLS)</label>
          </div>
          <p className="desc" style={{ margin: '10px 0 0', fontSize: 12 }}>A autenticação é por usuário e senha do SQL Server. A senha fica criptografada pelo Windows neste computador.</p>
          <div className="linha-acoes">
            <button className="btn" onClick={testar} disabled={teste?.rodando}>{teste?.rodando ? <><span className="carregando" /> Testando…</> : 'Testar conexão'}</button>
            <button className="btn primario" onClick={salvar}>Salvar conexão</button>
            {dados.conexoes.length > 0 && <button className="btn fantasma" onClick={() => setForm(null)}>Cancelar</button>}
            {teste?.ok && <span className="ok-txt">Conectado ao banco {teste.r.banco} ({teste.r.servidor}).</span>}
          </div>
          {teste?.erro && <div className="erro-box" style={{ marginTop: 10 }}>{teste.erro}</div>}
        </div>
      )}
    </>
  );
}

// ---------------- Usuários ----------------
function Usuarios({ dados, recarregar }) {
  const dlg = useDialogos();
  const [form, setForm] = useState(null);
  const salvar = async (e) => {
    e.preventDefault();
    if (form.senha !== form.confirmar) return dlg.alerta('As senhas não conferem!');
    try { await window.api.config.salvarUsuario(form); dlg.toast(`Usuário '${form.usuario}' salvo.`); setForm(null); recarregar(); }
    catch (err) { dlg.erro(err); }
  };
  const excluir = async (u) => {
    if (!(await dlg.confirmar(`Excluir o usuário "${u.usuario}"?`, { titulo: 'Excluir usuário' }))) return;
    try { await window.api.config.excluirUsuario(u.id); recarregar(); } catch (e) { dlg.erro(e); }
  };
  return (
    <>
      <h3>Usuários</h3>
      <p className="desc">Quem pode entrar no sistema. O nome do usuário é gravado no log de eventos do ERP a cada pré-venda gerada.</p>
      <table className="mini" style={{ marginBottom: 14 }}>
        <thead><tr><th>Usuário</th><th>Situação</th><th>Criado em</th><th /></tr></thead>
        <tbody>
          {dados.usuarios.map((u) => (
            <tr key={u.id}>
              <td><b>{u.usuario}</b></td>
              <td>{u.ativo ? <span className="ok-txt">Ativo</span> : <span className="erro-txt">Desativado</span>}</td>
              <td>{fmtDataHora(u.criadoEm)}</td>
              <td className="r"><button className="btn peq" onClick={() => setForm({ ...u, senha: '', confirmar: '' })}>Editar</button> <button className="btn peq perigo" onClick={() => excluir(u)}>Excluir</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!form && <button className="btn primario" onClick={() => setForm({ id: null, usuario: '', senha: '', confirmar: '', ativo: true })}>Novo usuário</button>}
      {form && (
        <form className="cartao" onSubmit={salvar}>
          <div className="grade-form">
            <Campo rotulo="Usuário" className="s2"><input value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} autoFocus /></Campo>
            <Campo rotulo={form.id ? 'Nova senha (opcional)' : 'Senha'} className="s2"><input type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} /></Campo>
            <Campo rotulo="Confirmar senha" className="s2"><input type="password" value={form.confirmar} onChange={(e) => setForm({ ...form, confirmar: e.target.value })} /></Campo>
            {form.id && <label className="check s6"><input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Usuário ativo</label>}
          </div>
          <div className="linha-acoes"><button className="btn primario">Salvar usuário</button><button type="button" className="btn fantasma" onClick={() => setForm(null)}>Cancelar</button></div>
        </form>
      )}
    </>
  );
}

// ---------------- Banco ----------------
function Banco({ dados }) {
  const dlg = useDialogos();
  const [id, setId] = useState(dados.conexoes[0]?.id || '');
  const [res, setRes] = useState(null);
  const [rodando, setRodando] = useState(false);
  const verificar = async () => {
    setRodando(true); setRes(null);
    try { setRes(await window.api.config.verificarTabelas(id)); } catch (e) { dlg.erro(e); } finally { setRodando(false); }
  };
  const criar = async (nome) => {
    if (!(await dlg.confirmar(`Criar a tabela dbo.${nome} no banco desta empresa?`, { titulo: 'Criar tabela', sim: 'Criar tabela', nao: 'Cancelar' }))) return;
    try { await window.api.config.criarTabela({ id, nome }); dlg.toast(`Tabela ${nome} criada.`); verificar(); } catch (e) { dlg.erro(e); }
  };
  if (!dados.conexoes.length) return <p className="desc">Cadastre uma conexão primeiro.</p>;
  const faltando = res?.filter((t) => !t.existe) || [];
  return (
    <>
      <h3>Banco de dados</h3>
      <p className="desc">Confere se o banco da empresa tem as tabelas que o sistema usa. RupturasReferencias e EventosSistema não são tabelas padrão do ERP: se faltarem, podem ser criadas aqui.</p>
      <div className="linha-acoes" style={{ marginTop: 0 }}>
        <select className="solto" value={id} onChange={(e) => { setId(e.target.value); setRes(null); }}>{dados.conexoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
        <button className="btn primario" onClick={verificar} disabled={rodando}>{rodando ? <><span className="carregando" /> Verificando…</> : 'Verificar tabelas'}</button>
      </div>
      {res && (
        <table className="mini" style={{ marginTop: 14 }}>
          <thead><tr><th>Tabela</th><th>Origem</th><th>Situação</th><th /></tr></thead>
          <tbody>{res.map((t) => (
            <tr key={t.tabela}>
              <td>dbo.{t.tabela.includes(' ') ? `[${t.tabela}]` : t.tabela}</td>
              <td>{t.extra ? 'Criada para a ruptura' : 'ERP'}</td>
              <td>{t.existe ? <span className="ok-txt">Encontrada</span> : <span className="erro-txt">Não encontrada</span>}</td>
              <td className="r">{!t.existe && t.extra && <button className="btn peq primario" onClick={() => criar(t.tabela)}>Criar tabela</button>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {faltando.some((t) => t.extra) && (
        <>
          <p className="desc" style={{ marginTop: 14 }}>Script que será executado (se preferir, rode você mesmo no SQL Server Management Studio):</p>
          {faltando.filter((t) => t.extra).map((t) => <pre key={t.tabela} className="script">{dados.scripts[t.tabela]}</pre>)}
        </>
      )}
      {faltando.some((t) => !t.extra) && <div className="erro-box" style={{ marginTop: 12 }}>Faltam tabelas do ERP. Confira se o banco selecionado é o banco do ERP.</div>}
    </>
  );
}

// ---------------- Parâmetros ----------------
function Parametros({ dados, recarregar }) {
  const dlg = useDialogos();
  const [p, setP] = useState(dados.parametros);
  const set = (k) => (e) => setP({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const salvar = async () => { try { await window.api.config.salvarParametros(p); dlg.toast('Parâmetros salvos.'); recarregar(); } catch (e) { dlg.erro(e); } };
  return (
    <>
      <h3>Parâmetros</h3>
      <p className="desc">Valem para todas as empresas deste computador.</p>
      <div className="cartao">
        <div className="grade-form">
          <Campo rotulo="Situação da PV considerada" className="s2" dica="Na planilha original: E"><input value={p.situacaoPV} onChange={set('situacaoPV')} maxLength={3} /></Campo>
          <Campo rotulo="Texto da observação interna" className="s4" dica="Os números das PVs de origem são adicionados no final."><input value={p.textoObs} onChange={set('textoObs')} /></Campo>
        </div>
      </div>
      <div className="cartao">
        <b>Valores usados se a PV de origem não for encontrada</b>
        <div className="grade-form" style={{ marginTop: 10 }}>
          <Campo rotulo="Equipe" className="s2"><input value={p.equipePadrao} onChange={set('equipePadrao')} /></Campo>
          <Campo rotulo="Setor" className="s2"><input value={p.setorPadrao} onChange={set('setorPadrao')} /></Campo>
          <Campo rotulo="Vendedor" className="s2"><input value={p.vendedorPadrao} onChange={set('vendedorPadrao')} /></Campo>
          <Campo rotulo="Operação" className="s2"><input value={p.operacaoPadrao} onChange={set('operacaoPadrao')} /></Campo>
        </div>
      </div>
      <label className="check"><input type="checkbox" checked={p.registrarEvento} onChange={set('registrarEvento')} /> Registrar cada PV gerada em dbo.EventosSistema</label>
      <div className="linha-acoes"><button className="btn primario" onClick={salvar}>Salvar parâmetros</button></div>
    </>
  );
}
