import React, { useEffect, useState } from 'react';
import {
  X, Database, Plus, Pencil, Trash2, PlugZap, CheckCircle2, Save, RotateCcw, Download, Upload,
  FolderOpen, Loader2, SlidersHorizontal, HardDrive, Star, Gauge, Lock, Settings2
} from 'lucide-react';
import { CabecalhoPagina } from '../componentes.jsx';
import { api, fmtNum } from '../util.js';
import ConfigSerasa from './ConfigSerasa.jsx';

const OPS = ['>', '>=', '=', '<=', '<'];

// Tela de Configurações (liberada pelo Ctrl+Shift+B). Fica na barra lateral até
// o usuário fechar; o App mantém este componente montado enquanto estiver liberada,
// então a aba e as edições não salvas continuam ao trocar de tela.
export default function AreaOculta({ visivel, onFechar, onConexoesAlteradas }) {
  const [aba, setAba] = useState('conexoes');
  const ABAS = [
    ['conexoes', 'Conexões', Database],
    ['configuracao', 'Configuração', Settings2],
    ['regras', 'Regras do score', SlidersHorizontal],
    ['serasa', 'Serasa (API)', Gauge],
    ['backup', 'Backup', HardDrive]
  ];
  return (
    <div className="pagina rolavel config-pagina">
      <CabecalhoPagina
        titulo="Área do sistema"
        subtitulo="Restrita ao administrador — fica na barra lateral até você fechar"
        acoes={<button className="btn" onClick={onFechar} title="Fecha e bloqueia a Área do sistema (o Ctrl+Shift+B pede a senha de novo)"><Lock size={15} />Fechar área do sistema</button>}
      />
      <div className="abas abas-pagina">
        {ABAS.map(([id, nome, Icone]) => (
          <button key={id} className={`aba ${aba === id ? 'ativa' : ''}`} onClick={() => setAba(id)}><Icone size={15} />{nome}</button>
        ))}
      </div>
      <div className="config-corpo">
        <div hidden={aba !== 'conexoes'}><Conexoes visivel={visivel && aba === 'conexoes'} onAlterou={onConexoesAlteradas} /></div>
        <div hidden={aba !== 'configuracao'}><Configuracao /></div>
        <div hidden={aba !== 'regras'}><Regras /></div>
        <div hidden={aba !== 'serasa'}><ConfigSerasa /></div>
        <div hidden={aba !== 'backup'}><Backup onAlterou={onConexoesAlteradas} /></div>
      </div>
    </div>
  );
}

// ======================= CONFIGURAÇÃO =======================
function Configuracao() {
  const [c, setC] = useState(null);
  const [msg, setMsg] = useState(null);
  const [testando, setTestando] = useState(false);
  useEffect(() => { api.configuracaoGet().then(setC).catch((e) => setMsg({ ok: false, txt: e.message })); }, []);
  if (!c) return <p className="muted">Carregando…</p>;

  const mudaCalculo = (campo) => (e) => { setC({ ...c, calculo: { ...c.calculo, [campo]: e.target.checked } }); setMsg(null); };
  const mudaLimite = (campo, valor) => { setC({ ...c, limite: { ...c.limite, [campo]: valor } }); setMsg(null); };
  const mudaEventos = (campo, valor) => { setC({ ...c, eventos: { ...c.eventos, [campo]: valor } }); setMsg(null); };
  const testarEvento = async () => {
    setTestando(true); setMsg(null);
    try { const r = await api.eventosTestar(c.eventos); setMsg({ ok: true, txt: `Evento de teste gravado e desfeito com sucesso na conexão "${r.conexao}". O modelo está correto.` }); }
    catch (e) { setMsg({ ok: false, txt: `Teste do evento falhou: ${e.message}` }); }
    finally { setTestando(false); }
  };
  const salvar = async () => {
    try { setC(await api.configuracaoSalvar(c)); setMsg({ ok: true, txt: 'Configuração salva. Refaça a análise para aplicar.' }); }
    catch (e) { setMsg({ ok: false, txt: e.message }); }
  };

  return (
    <div className="form-config">
      <div className="card">
        <h3>Cálculo dos valores</h3>
        <div className="opcoes-lista">
          <label className="switch"><input type="checkbox" checked={c.calculo.abaterRetornos !== false} onChange={mudaCalculo('abaterRetornos')} /><i />
            <span><b>Abater devoluções</b><small>Desconta as devoluções das vendas do período e das vendas por mês.</small></span>
          </label>
          <label className="switch"><input type="checkbox" checked={c.calculo.somarST !== false} onChange={mudaCalculo('somarST')} /><i />
            <span><b>Somar ICMS-ST</b><small>Soma o ICMS-ST do item (ICMSFItem) aos valores dos pedidos, do score e das vendas por mês.</small></span>
          </label>
        </div>
      </div>
      <div className="card">
        <h3>Limite de crédito</h3>
        <div className="form-grade">
          <label>Regra padrão do limite aprovado
            <select value={Number(c.limite.regraPadrao) === 1 ? 1 : 2} onChange={(e) => mudaLimite('regraPadrao', Number(e.target.value))}>
              <option value={2}>Pelo score (faixas)</option>
              <option value={1}>Pelo período (média de vendas a prazo)</option>
            </select>
          </label>
        </div>
        <div className="opcoes-lista" style={{ marginTop: 14 }}>
          <label className="switch"><input type="checkbox" checked={c.limite.permitirAplicar !== false} onChange={(e) => mudaLimite('permitirAplicar', e.target.checked)} /><i />
            <span><b>Permitir aplicar o limite no ERP</b><small>Mostra o botão "Aplicar no ERP" nas decisões. Grava em Clientes.LimPerCred após confirmação; o login da conexão precisa de permissão de alteração.</small></span>
          </label>
        </div>
      </div>
      <div className="card">
        <h3>Eventos de sistema no ERP</h3>
        <div className="opcoes-lista">
          <label className="switch"><input type="checkbox" checked={!!c.eventos.ativo} onChange={(e) => mudaEventos('ativo', e.target.checked)} /><i />
            <span><b>Gerar eventos no ERP</b><small>Registrar decisão, excluir decisão e aplicar limite gravam um evento na tabela de eventos do ERP.</small></span>
          </label>
          <label className="switch"><input type="checkbox" checked={c.eventos.obrigatorio !== false} onChange={(e) => mudaEventos('obrigatorio', e.target.checked)} /><i />
            <span><b>Evento obrigatório</b><small>Se o evento não puder ser gravado, a operação é cancelada. No "Aplicar no ERP", evento e limite são gravados juntos (ou nenhum dos dois).</small></span>
          </label>
        </div>
        <label className="campo">INSERT do evento
          <textarea rows={5} className="mono" value={c.eventos.modelo} onChange={(e) => mudaEventos('modelo', e.target.value)}
            placeholder={'INSERT INTO [TabelaDeEventos] (Data, Usuario, Acao, Descricao, Cliente)\nVALUES (@Data, @Usuario, @Acao, @Descricao, @Cliente)'} />
        </label>
        <p className="muted pequeno">
          Parâmetros: <code>@Data</code> <code>@Usuario</code> <code>@UsuarioCodigo</code> <code>@Computador</code> <code>@Modulo</code> <code>@Acao</code> (o que foi feito: "Alterou limite de crédito", "Registrou decisão de crédito", "Excluiu decisão de crédito")
          {' '}<code>@Evento</code> (LIMITE_APLICADO, DECISAO_REGISTRADA, DECISAO_EXCLUIDA) <code>@Descricao</code> (começa pela ação, com cliente e valores) <code>@Cliente</code> <code>@ValorAnterior</code> <code>@ValorNovo</code>.
          Use só um INSERT; os valores entram como parâmetros, nunca no texto.
        </p>
        <div className="acoes esquerda">
          <button className="btn" onClick={testarEvento} disabled={testando || !c.eventos.modelo}>
            {testando ? <Loader2 size={15} className="gira" /> : <PlugZap size={15} />}Testar evento (grava e desfaz)
          </button>
        </div>
      </div>
      {msg && <div className={msg.ok ? 'sucesso' : 'erro'}>{msg.txt}</div>}
      <div className="acoes esquerda">
        <button className="btn primario" onClick={salvar}><Save size={15} />Salvar configuração</button>
      </div>
    </div>
  );
}

// ======================= CONEXÕES =======================
// No Parallello as conexões são as da Configuração central: aqui só escolhe a em uso e testa.
function Conexoes({ visivel, onAlterou }) {
  const [lista, setLista] = useState([]);
  const [msg, setMsg] = useState(null);
  const [testando, setTestando] = useState('');

  const carregar = () => api.conexoesListar().then((l) => { setLista(l); return l; });
  useEffect(() => { carregar(); }, []);
  // atualiza a marca "Em uso" ao voltar para a aba (a conexão pode ter sido trocada no topo)
  useEffect(() => { if (visivel) carregar(); }, [visivel]);

  const testar = async (c) => {
    setTestando(c.id); setMsg(null);
    try {
      const r = await api.conexoesTestar(c);
      setMsg({ ok: true, txt: `${c.nome || 'Conexão'}: conectado em ${r.Servidor} / ${r.Banco} — ${fmtNum(r.Clientes)} clientes.` });
    } catch (e) { setMsg({ ok: false, txt: `${c.nome || 'Conexão'}: ${e.message}` }); }
    finally { setTestando(''); }
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
          <p className="muted pequeno">Para cadastrar ou alterar, use a Configuração do Parallello (Ctrl+Shift+B na tela inicial). Aqui você escolhe qual está em uso e testa. A configuração da Serasa continua por conexão.</p>
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

      <div className="card">
        <div className="form-grade quatro">
          <label>Histórico do atraso no score (meses)
            <input type="number" min="0" value={r.mesesHistoricoAtraso} onChange={(e) => atualiza((n) => { n.mesesHistoricoAtraso = num(e.target.value); })} />
          </label>
        </div>
        <p className="muted pequeno">Atraso médio e parcelas pagas usados no score consideram só os pagamentos desses últimos meses (0 = histórico completo). As contagens de pontualidade na ficha usam o histórico completo.</p>
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

      <h3>Limite pelo período</h3>
      <p className="muted pequeno">(Vendas a prazo do período ÷ meses do período) × fator de prazo × multiplicador pelo atraso médio.</p>
      <div className="card">
        <div className="form-grade seis-col">
          <label>Fator de prazo<input type="number" step="0.01" value={r.limitePeriodo.fatorPrazo} onChange={(e) => atualiza((n) => { n.limitePeriodo.fatorPrazo = num(e.target.value); })} /></label>
          <label>Sem histórico<input type="number" step="0.01" value={r.limitePeriodo.semHistorico} onChange={(e) => atualiza((n) => { n.limitePeriodo.semHistorico = num(e.target.value); })} /></label>
          <label>Atraso até 1 dia<input type="number" step="0.01" value={r.limitePeriodo.ate1} onChange={(e) => atualiza((n) => { n.limitePeriodo.ate1 = num(e.target.value); })} /></label>
          <label>Até 5 dias<input type="number" step="0.01" value={r.limitePeriodo.ate5} onChange={(e) => atualiza((n) => { n.limitePeriodo.ate5 = num(e.target.value); })} /></label>
          <label>Até 15 dias<input type="number" step="0.01" value={r.limitePeriodo.ate15} onChange={(e) => atualiza((n) => { n.limitePeriodo.ate15 = num(e.target.value); })} /></label>
          <label>Acima de 15 dias<input type="number" step="0.01" value={r.limitePeriodo.acima} onChange={(e) => atualiza((n) => { n.limitePeriodo.acima = num(e.target.value); })} /></label>
        </div>
      </div>

      <h3>Grupos do ranking e observação</h3>
      <p className="muted pequeno">Grupo por faixa fixa de score (1 = melhores). A observação aparece na análise e na ficha.</p>
      <div className="card">
        {r.grupos.map((g, i) => (
          <div key={i} className="grupo-linha">
            <label>Score mínimo<input type="number" value={g.min} onChange={(e) => atualiza((n) => { n.grupos[i].min = num(e.target.value); })} /></label>
            <label>Grupo<input type="number" value={g.grupo} onChange={(e) => atualiza((n) => { n.grupos[i].grupo = num(e.target.value); })} /></label>
            <label className="obs-grupo">Observação<input value={g.observacao} onChange={(e) => atualiza((n) => { n.grupos[i].observacao = e.target.value; })} /></label>
          </div>
        ))}
      </div>

      <h3>Alertas</h3>
      <div className="card">
        <div className="form-grade quatro">
          <label>Atraso "Excelente" até (dias)<input type="number" value={r.alertas.atrasoExcelente} onChange={(e) => atualiza((n) => { n.alertas.atrasoExcelente = num(e.target.value); })} /></label>
          <label>Atraso "Bom" até (dias)<input type="number" value={r.alertas.atrasoBom} onChange={(e) => atualiza((n) => { n.alertas.atrasoBom = num(e.target.value); })} /></label>
          <label>Atraso "Médio" até (dias)<input type="number" value={r.alertas.atrasoMedio} onChange={(e) => atualiza((n) => { n.alertas.atrasoMedio = num(e.target.value); })} /></label>
          <label>"RISCO ALTO" abaixo do score<input type="number" value={r.alertas.riscoAlto} onChange={(e) => atualiza((n) => { n.alertas.riscoAlto = num(e.target.value); })} /></label>
          <label>Inatividade: atenção acima de (dias)<input type="number" value={r.alertas.inatividadeAtencao} onChange={(e) => atualiza((n) => { n.alertas.inatividadeAtencao = num(e.target.value); })} /></label>
          <label>Inatividade: crítico acima de (dias)<input type="number" value={r.alertas.inatividadeCritico} onChange={(e) => atualiza((n) => { n.alertas.inatividadeCritico = num(e.target.value); })} /></label>
          <label>Uso do limite: atenção acima de (%)<input type="number" value={r.alertas.usoLimiteAtencao} onChange={(e) => atualiza((n) => { n.alertas.usoLimiteAtencao = num(e.target.value); })} /></label>
          <label>Uso do limite: risco acima de (%)<input type="number" value={r.alertas.usoLimiteRisco} onChange={(e) => atualiza((n) => { n.alertas.usoLimiteRisco = num(e.target.value); })} /></label>
        </div>
      </div>

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
    if (!window.confirm('Restaurar um backup? As regras e a configuração serão substituídas; decisões e consultas Serasa do backup serão somadas às atuais.')) return;
    try {
      const r = await api.backupImportar();
      if (r) { setMsg({ ok: true, txt: `Backup restaurado: ${r.decisoes} decisão(ões) e ${r.consultasSerasa || 0} consulta(s) Serasa novas. Informe o Client Secret da Serasa novamente.` }); onAlterou?.(); }
    } catch (e) { setMsg({ ok: false, txt: e.message }); }
  };

  return (
    <div className="form-config">
      <div className="card">
        <h3>Backup dos dados locais</h3>
        <p className="muted">Inclui as regras do score, o histórico de decisões, a configuração e as consultas da Serasa (sem o Client Secret). As conexões são as do Parallello.</p>
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
