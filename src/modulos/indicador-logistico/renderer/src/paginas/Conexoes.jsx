import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, PlugZap, Loader2, ChevronUp, ChevronDown, CheckCircle2, AlertTriangle, Database, Info } from 'lucide-react';
import { api } from '../lib/api';
import { useAviso, Modal, Confirmar } from '../componentes/comum';

const VAZIA = { nome: '', grupo: '', servidor: '', porta: '', banco: '', usuario: 'sa', senha: '', encrypt: false, timeout: 120, ativo: true };

export default function Conexoes() {
  const avisar = useAviso();
  const [lista, setLista] = useState(null);
  const [form, setForm] = useState(null);
  const [excluir, setExcluir] = useState(null);
  const [testando, setTestando] = useState(null);
  const [teste, setTeste] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = () => api('conexoes:listar').then(setLista).catch((e) => avisar(e.message, 'erro'));
  useEffect(() => { carregar(); }, []);

  const grupos = [...new Set((lista || []).map((c) => c.grupo).filter(Boolean))];
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function testar(c) {
    setTestando(c.id || 'form');
    setTeste(null);
    try {
      const r = await api('conexoes:testar', c);
      setTeste({ ok: true, ...r, alvo: c.id || 'form' });
      if (c.id && !form) avisar(r.faltando.length ? `${c.nome}: conectou, mas faltam tabelas: ${r.faltando.join(', ')}` : `${c.nome}: conexão OK (${r.banco}).`, r.faltando.length ? 'erro' : 'ok');
    } catch (e) {
      setTeste({ ok: false, erro: e.message, alvo: c.id || 'form' });
      if (c.id && !form) avisar(`${c.nome}: ${e.message}`, 'erro');
    } finally {
      setTestando(null);
    }
  }

  async function salvar() {
    setSalvando(true);
    try { await api('conexoes:salvar', form); setForm(null); setTeste(null); carregar(); avisar('Conexão salva.', 'ok'); } catch (e) { avisar(e.message, 'erro'); } finally { setSalvando(false); }
  }

  async function mover(i, d) {
    const nova = [...lista];
    [nova[i], nova[i + d]] = [nova[i + d], nova[i]];
    setLista(nova);
    try { await api('conexoes:ordenar', { ids: nova.map((c) => c.id) }); } catch (e) { avisar(e.message, 'erro'); carregar(); }
  }

  async function confirmarExclusao() {
    try { await api('conexoes:excluir', { id: excluir.id }); setExcluir(null); carregar(); } catch (e) { avisar(e.message, 'erro'); }
  }

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <div><h1>Conexões</h1><p>Bancos SQL Server do ERP de cada cliente. As senhas ficam criptografadas neste computador.</p></div>
        <button className="btn primario" onClick={() => { setTeste(null); setForm({ ...VAZIA }); }}><Plus size={16} /> Nova conexão</button>
      </div>

      <div className="alerta info" style={{ marginBottom: 14 }}>
        <Info size={16} />
        <span>Use o <b>Grupo</b> para juntar bancos no filtro do painel (ex.: COMERCIO e INDUSTRIA). A <b>ordem</b> define a prioridade na unificação: se o mesmo cliente aparece no mesmo dia em duas conexões, conta a que está mais acima.</span>
      </div>

      <div className="card lista-conexoes">
        <div className="linha cab"><span></span><span>Nome</span><span>Grupo</span><span>Servidor / banco</span><span>Usuário</span><span>Situação</span><span></span></div>
        {!lista ? <div className="vazio"><Loader2 className="girar" /></div> : !lista.length ? (
          <div className="vazio"><Database size={34} /><p>Nenhuma conexão cadastrada.</p></div>
        ) : lista.map((c, i) => (
          <div className="linha" key={c.id}>
            <div className="ordem">
              <button disabled={i === 0} onClick={() => mover(i, -1)} title="Subir"><ChevronUp size={16} /></button>
              <button disabled={i === lista.length - 1} onClick={() => mover(i, 1)} title="Descer"><ChevronDown size={16} /></button>
            </div>
            <b>{c.nome}</b>
            <span>{c.grupo ? <span className="pilula destaque">{c.grupo}</span> : <span className="sub">—</span>}</span>
            <span><span className="mono">{c.servidor}{c.porta ? ':' + c.porta : ''}</span><br /><span className="sub">{c.banco}</span></span>
            <span>{c.usuario}{!c.temSenha && <span className="pilula atencao" style={{ marginLeft: 6 }}>sem senha</span>}</span>
            <span>{c.ativo ? <span className="pilula ok">Ativa</span> : <span className="pilula neutra">Inativa</span>}</span>
            <span className="acoes" style={{ justifyContent: 'flex-end' }}>
              <button className="btn pequeno" onClick={() => testar(c)} disabled={!!testando}>
                {testando === c.id ? <Loader2 size={15} className="girar" /> : <PlugZap size={15} />} Testar
              </button>
              <button className="btn fantasma icone" onClick={() => { setTeste(null); setForm({ ...c, senha: '' }); }} title="Editar"><Pencil size={15} /></button>
              <button className="btn fantasma icone perigo" onClick={() => setExcluir(c)} title="Excluir"><Trash2 size={15} /></button>
            </span>
          </div>
        ))}
      </div>

      {form && (
        <Modal titulo={form.id ? 'Editar conexão' : 'Nova conexão'} onFechar={() => setForm(null)} rodape={<>
          <button className="btn" onClick={() => testar(form)} disabled={!!testando || !form.servidor || !form.banco}>
            {testando === (form.id || 'form') ? <Loader2 size={16} className="girar" /> : <PlugZap size={16} />} Testar conexão
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={() => setForm(null)}>Cancelar</button>
          <button className="btn primario" onClick={salvar} disabled={salvando}>{salvando && <Loader2 size={16} className="girar" />} Salvar</button>
        </>}>
          <div className="grade g2">
            <label className="campo"><span>Nome *</span><input value={form.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex.: COMERCIO" autoFocus /></label>
            <label className="campo"><span>Grupo</span>
              <input list="grupos" value={form.grupo} onChange={(e) => set('grupo', e.target.value.toUpperCase())} placeholder="Ex.: HAGE" />
              <datalist id="grupos">{grupos.map((g) => <option key={g} value={g} />)}</datalist>
            </label>
            <label className="campo" style={{ gridColumn: 'span 2' }}><span>Servidor *</span>
              <input className="mono" value={form.servidor} onChange={(e) => set('servidor', e.target.value)} placeholder="NOME-DO-PC ou NOME-DO-PC\SQLEXPRESS ou 192.168.0.10" />
              <small>Para instância nomeada use SERVIDOR\INSTANCIA (a porta é ignorada).</small>
            </label>
            <label className="campo"><span>Banco *</span><input className="mono" value={form.banco} onChange={(e) => set('banco', e.target.value)} placeholder="HAGE.0001.Log" /></label>
            <label className="campo"><span>Porta</span><input type="number" value={form.porta} onChange={(e) => set('porta', e.target.value)} placeholder="1433" /></label>
            <label className="campo"><span>Usuário</span><input value={form.usuario} onChange={(e) => set('usuario', e.target.value)} /></label>
            <label className="campo"><span>Senha</span>
              <input type="password" value={form.senha} onChange={(e) => set('senha', e.target.value)} placeholder={form.id && form.temSenha ? '•••••• (deixe vazio para manter)' : ''} />
            </label>
            <label className="campo"><span>Tempo limite da consulta (s)</span><input type="number" min="10" value={form.timeout} onChange={(e) => set('timeout', e.target.value)} /></label>
            <div className="campo" style={{ justifyContent: 'flex-end', gap: 10 }}>
              <label className="check"><input type="checkbox" checked={form.ativo} onChange={(e) => set('ativo', e.target.checked)} /> Conexão ativa</label>
              <label className="check"><input type="checkbox" checked={form.encrypt} onChange={(e) => set('encrypt', e.target.checked)} /> Criptografar (TLS)</label>
            </div>
          </div>
          {teste && teste.alvo === (form.id || 'form') && (
            <div className={`alerta ${teste.ok ? (teste.faltando?.length ? 'aviso' : 'info') : 'erro'}`} style={{ marginTop: 16 }}>
              {teste.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              <span>
                {teste.ok ? <>Conectado em <b>{teste.banco}</b>. {teste.versao}{teste.faltando?.length ? <><br />Tabelas não encontradas: <b>{teste.faltando.join(', ')}</b></> : <><br />Todas as tabelas necessárias foram encontradas.</>}</> : teste.erro}
              </span>
            </div>
          )}
        </Modal>
      )}
      {excluir && <Confirmar texto={`Excluir a conexão "${excluir.nome}"?`} onSim={confirmarExclusao} onNao={() => setExcluir(null)} />}
    </div>
  );
}
