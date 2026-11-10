import React, { useEffect, useState } from 'react';
import {
  X, Database, Plus, Pencil, Trash2, PlugZap, CheckCircle2, Save, RotateCcw, Download, Upload,
  FolderOpen, Loader2, SlidersHorizontal, HardDrive, Star
} from 'lucide-react';
import { api, fmtNum } from '../util.js';

const OPS = ['>', '>=', '=', '<=', '<'];

export default function AreaOculta({ onFechar, onConexoesAlteradas }) {
  const [aba, setAba] = useState('conexoes');
  const ABAS = [
    ['conexoes', 'Conexões', Database],
    ['regras', 'Regras do score', SlidersHorizontal],
    ['backup', 'Backup', HardDrive]
  ];
  return (
    <div className="modal-fundo">
      <div className="modal grande">
        <div className="modal-cab">
          <div>
            <h2>Área do sistema</h2>
            <p className="muted pequeno">Configurações restritas ao administrador</p>
          </div>
          <button className="btn-icone" onClick={onFechar} title="Fechar"><X size={18} /></button>
        </div>
        <div className="abas">
          {ABAS.map(([id, nome, Icone]) => (
            <button key={id} className={`aba ${aba === id ? 'ativa' : ''}`} onClick={() => setAba(id)}><Icone size={15} />{nome}</button>
          ))}
        </div>
        <div className="modal-corpo">
          {aba === 'conexoes' && <Conexoes onAlterou={onConexoesAlteradas} />}
          {aba === 'regras' && <Regras />}
          {aba === 'backup' && <Backup onAlterou={onConexoesAlteradas} />}
        </div>
      </div>
    </div>
  );
}

// ======================= CONEXÕES =======================
const VAZIA = { id: null, nome: '', servidor: '', porta: '1433', banco: '', usuario: '', senha: '', criptografar: false };

function Conexoes({ onAlterou }) {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(null); // null = nenhuma em edição
  const [msg, setMsg] = useState(null);
  const [testando, setTestando] = useState('');

  const carregar = () => api.conexoesListar().then((l) => { setLista(l); return l; });
  useEffect(() => { carregar(); }, []);

  const muda = (campo) => (e) => setForm({ ...form, [campo]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const testar = async (c) => {
    setTestando(c.id || 'form'); setMsg(null);
    try {
      const r = await api.conexoesTestar(c);
      setMsg({ ok: true, txt: `${c.nome || 'Conexão'}: conectado em ${r.Servidor} / ${r.Banco} — ${fmtNum(r.Clientes)} clientes.` });
    } catch (e) { setMsg({ ok: false, txt: `${c.nome || 'Conexão'}: ${e.message}` }); }
    finally { setTestando(''); }
  };

  const salvar = async (e) => {
    e.preventDefault();
    try {
      const salva = await api.conexoesSalvar(form);
      setMsg({ ok: true, txt: `Conexão "${salva.nome}" salva.` });
      setForm(null);
      await carregar();
      onAlterou?.();
    } catch (err) { setMsg({ ok: false, txt: err.message }); }
  };

  const excluir = async (c) => {
    if (!window.confirm(`Excluir a conexão "${c.nome}"? As decisões já registradas continuam no histórico.`)) return;
    await api.conexoesExcluir(c.id);
    if (form?.id === c.id) setForm(null);
    await carregar();
    onAlterou?.();
  };

  const ativar = async (c) => {
    await api.conexoesAtivar(c.id);
    await carregar();
    onAlterou?.();
  };

  return (
    <div className="conexoes">
      <div className="conexoes-lista">
        <div className="conexoes-topo">
          <h3>{lista.length} conexão(ões) do Parallello</h3>
        </div>
        {lista.length === 0 && <p className="muted">Nenhuma conexão cadastrada no Parallello.</p>}
        {lista.map((c) => (
          <div key={c.id} className={`conexao-card ${c.ativa ? 'ativa' : ''}`}>
            <div className="conexao-ico"><Database size={18} /></div>
            <div className="conexao-info">
              <b>{c.nome} {c.ativa && <span className="selo"><Star size={11} />Em uso</span>}</b>
              <small>{c.servidor}{c.porta && !String(c.servidor).includes('\\') ? `:${c.porta}` : ''} · {c.banco} · {c.usuario}</small>
            </div>
            <div className="conexao-acoes">
              {!c.ativa && <button className="btn-icone" title="Usar esta conexão" onClick={() => ativar(c)}><CheckCircle2 size={16} /></button>}
              <button className="btn-icone" title="Testar" onClick={() => testar(c)} disabled={!!testando}>
                {testando === c.id ? <Loader2 size={16} className="gira" /> : <PlugZap size={16} />}
              </button>
            </div>
          </div>
        ))}
        {msg && <div className={msg.ok ? 'sucesso' : 'erro'}>{msg.txt}</div>}
      </div>

      <div className="conexoes-form">
        <div className="card centro dica">
          <Database size={28} />
          <p>As conexões são as mesmas de todos os sistemas do Parallello.</p>
          <p className="muted pequeno">Para cadastrar ou alterar, use a Configuração do Parallello (Ctrl+Shift+B na tela inicial). Aqui você escolhe qual está em uso e testa.</p>
        </div>
      </div>
    </div>
  );
}

// ======================= REGRAS =======================
function Regras() {
  const [r, setR] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { api.regrasGet().then(setR); }, []);
  if (!r) return <p className="muted">Carregando…</p>;

  const atualiza = (fn) => { const novo = JSON.parse(JSON.stringify(r)); fn(novo); setR(novo); setMsg(null); };
  const num = (v) => (v === '' ? '' : Number(v));
  const max = r.criterios.reduce((s, c) => s + Math.max(Number(c.padrao) || 0, ...c.faixas.map((x) => Number(x.pontos) || 0)), 0);

  const salvar = async () => {
    try { const salvo = await api.regrasSalvar(r); setR(salvo); setMsg({ ok: true, txt: 'Regras salvas. Refaça a análise para aplicar.' }); }
    catch (e) { setMsg({ ok: false, txt: e.message }); }
  };
  const restaurar = async () => {
    if (!window.confirm('Restaurar as regras originais do script? As alterações serão perdidas.')) return;
    const p = await api.regrasPadrao(); setR(p); setMsg({ ok: true, txt: 'Regras originais carregadas. Clique em Salvar para aplicar.' });
  };

  return (
    <div className="regras">
      <div className="regras-topo">
        <label className="switch"><input type="checkbox" checked={r.zerarSeInadimplente}
          onChange={(e) => atualiza((n) => { n.zerarSeInadimplente = e.target.checked; })} /><i />Zerar o score quando houver valor inadimplente</label>
        <span className="pill">Pontuação máxima: <b>{max}</b></span>
      </div>

      <h3>Critérios</h3>
      <p className="muted pequeno">As faixas são avaliadas de cima para baixo; vale a primeira que atender. Se nenhuma atender, vale o padrão.</p>
      <div className="criterios-edit">
        {r.criterios.map((c, ci) => (
          <div key={c.id} className="card crit-edit">
            <div className="crit-cab"><b>{c.nome}</b><span className="muted pequeno">{c.descricao} ({c.unidade})</span></div>
            <table className="tabela compacta">
              <thead><tr><th>Se valor</th><th>Referência</th><th>Pontos</th><th></th></tr></thead>
              <tbody>
                {c.faixas.map((fx, fi) => (
                  <tr key={fi} className="sem-clique">
                    <td><select value={fx.op} onChange={(e) => atualiza((n) => { n.criterios[ci].faixas[fi].op = e.target.value; })}>{OPS.map((o) => <option key={o}>{o}</option>)}</select></td>
                    <td><input type="number" step="any" value={fx.valor} onChange={(e) => atualiza((n) => { n.criterios[ci].faixas[fi].valor = num(e.target.value); })} /></td>
                    <td><input type="number" step="any" value={fx.pontos} onChange={(e) => atualiza((n) => { n.criterios[ci].faixas[fi].pontos = num(e.target.value); })} /></td>
                    <td><button className="btn-x" onClick={() => atualiza((n) => { n.criterios[ci].faixas.splice(fi, 1); })}><X size={14} /></button></td>
                  </tr>
                ))}
                <tr className="sem-clique padrao">
                  <td colSpan={2}>Padrão (nenhuma faixa)</td>
                  <td><input type="number" step="any" value={c.padrao} onChange={(e) => atualiza((n) => { n.criterios[ci].padrao = num(e.target.value); })} /></td>
                  <td></td>
                </tr>
              </tbody>
            </table>
            <button className="link" onClick={() => atualiza((n) => { n.criterios[ci].faixas.push({ op: c.faixas[0]?.op || '>', valor: 0, pontos: 0 }); })}><Plus size={13} /> adicionar faixa</button>
          </div>
        ))}
      </div>

      <h3>Faixas de score (perfil, limite e prazos)</h3>
      <p className="muted pequeno">Da maior para a menor. O limite sugerido usa o Total comprado; se nenhuma regra de limite atender, vale o limite padrão.</p>
      {r.faixasScore.map((fx, i) => (
        <div key={i} className="card faixa-edit">
          <div className="form-grade quatro">
            <label>Score mínimo<input type="number" value={fx.min} onChange={(e) => atualiza((n) => { n.faixasScore[i].min = num(e.target.value); })} /></label>
            <label>Perfil<input value={fx.perfil} onChange={(e) => atualiza((n) => { n.faixasScore[i].perfil = e.target.value; })} /></label>
            <label>Prazo sugerido (dias)<input type="number" value={fx.prazoSugerido} onChange={(e) => atualiza((n) => { n.faixasScore[i].prazoSugerido = num(e.target.value); })} /></label>
            <label>Limite padrão (R$)<input type="number" value={fx.limitePadrao} onChange={(e) => atualiza((n) => { n.faixasScore[i].limitePadrao = num(e.target.value); })} /></label>
          </div>
          <label className="campo">Observação<input value={fx.observacao} onChange={(e) => atualiza((n) => { n.faixasScore[i].observacao = e.target.value; })} /></label>
          <div className="form-grade cinco">
            {[0, 1, 2, 3, 4].map((p) => (
              <label key={p}>Prazo {p + 1}<input value={fx.prazos[p] || ''} onChange={(e) => atualiza((n) => { n.faixasScore[i].prazos[p] = e.target.value; })} /></label>
            ))}
          </div>
          <div className="limites">
            <span className="muted pequeno">Limite por total comprado:</span>
            {fx.limites.map((lm, li) => (
              <div key={li} className="limite-linha">
                se total
                <select value={lm.op} onChange={(e) => atualiza((n) => { n.faixasScore[i].limites[li].op = e.target.value; })}>{OPS.map((o) => <option key={o}>{o}</option>)}</select>
                <input type="number" value={lm.valor} onChange={(e) => atualiza((n) => { n.faixasScore[i].limites[li].valor = num(e.target.value); })} />
                → limite
                <input type="number" value={lm.limite} onChange={(e) => atualiza((n) => { n.faixasScore[i].limites[li].limite = num(e.target.value); })} />
                <button className="btn-x" onClick={() => atualiza((n) => { n.faixasScore[i].limites.splice(li, 1); })}><X size={14} /></button>
              </div>
            ))}
            <button className="link" onClick={() => atualiza((n) => { n.faixasScore[i].limites.push({ op: '>', valor: 0, limite: 0 }); })}><Plus size={13} /> regra de limite</button>
          </div>
        </div>
      ))}

      {msg && <div className={msg.ok ? 'sucesso' : 'erro'}>{msg.txt}</div>}
      <div className="acoes fixas">
        <button className="btn" onClick={restaurar}><RotateCcw size={15} />Restaurar regras originais</button>
        <button className="btn primario" onClick={salvar}><Save size={15} />Salvar regras</button>
      </div>
    </div>
  );
}

// ======================= BACKUP =======================
function Backup({ onAlterou }) {
  const [msg, setMsg] = useState(null);
  const [pasta, setPasta] = useState('');
  useEffect(() => { api.pastaDados().then(setPasta).catch(() => {}); }, []);

  const exportar = async () => {
    try { const p = await api.backupExportar(); if (p) setMsg({ ok: true, txt: `Backup salvo em ${p}` }); }
    catch (e) { setMsg({ ok: false, txt: e.message }); }
  };
  const importar = async () => {
    if (!window.confirm('Restaurar um backup? As regras serão substituídas; decisões e conexões do backup serão somadas às atuais.')) return;
    try {
      const r = await api.backupImportar();
      if (r) { setMsg({ ok: true, txt: `Backup restaurado: ${r.decisoes} decisão(ões) novas.` }); onAlterou?.(); }
    } catch (e) { setMsg({ ok: false, txt: e.message }); }
  };

  return (
    <div className="form-config">
      <div className="card">
        <h3>Backup dos dados locais</h3>
        <p className="muted">Inclui as regras do score e o histórico de decisões (as conexões são as do Parallello).</p>
        <div className="acoes esquerda">
          <button className="btn primario" onClick={exportar}><Download size={15} />Fazer backup</button>
          <button className="btn" onClick={importar}><Upload size={15} />Restaurar backup</button>
          <button className="btn" onClick={() => api.abrirPastaDados()}><FolderOpen size={15} />Abrir pasta dos dados</button>
        </div>
      </div>
      {msg && <div className={msg.ok ? 'sucesso' : 'erro'}>{msg.txt}</div>}
      {pasta && <p className="muted pequeno">Dados locais: {pasta}</p>}
    </div>
  );
}
