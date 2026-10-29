import React, { useEffect, useMemo, useState } from 'react';
import { Save, Plus, Trash2, RefreshCw, Copy, DownloadCloud, FileSpreadsheet, Target } from 'lucide-react';
import DataTable from '../components/DataTable.jsx';
import { Toggle, Aviso, Resumo } from '../components/Comuns.jsx';
import { mesAtual, nomeMes, int, pct } from '../format.js';
import { limparErro } from './ReportPage.jsx';

const norm = (s) => String(s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
const novaLinha = () => ({ id: Math.random().toString(36).slice(2, 10), setores: '', supervisor: '', metas: {} });

function mesAnterior(mes) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// semana / dia de hoje (ou o último dia útil já passado) para abrir as abas Semanal e Diário
function indiceHoje(r, aba) {
  if (!r) return 0;
  const hoje = new Date().toISOString().slice(0, 10);
  const idxDia = r.dias.filter((d) => d.dia <= hoje).length - 1;
  if (aba === 'diario') return Math.max(0, idxDia);
  if (aba === 'semanal') return idxDia >= 0 ? r.dias[idxDia].semana : 0;
  return 0;
}

function Calendario({ mes, cfg, onChange }) {
  const [a, m] = mes.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  const primeiroDow = (new Date(a, m - 1, 1).getDay() + 6) % 7; // segunda = 0
  const fora = new Set(cfg.diasNaoUteis || []);
  const celulas = [];
  for (let i = 0; i < primeiroDow; i++) celulas.push(<i key={'v' + i} />);
  for (let d = 1; d <= ultimo; d++) {
    const iso = `${mes}-${String(d).padStart(2, '0')}`;
    const dow = new Date(a, m - 1, d).getDay();
    const domingo = dow === 0;
    const sabadoFora = dow === 6 && cfg.sabadoUtil === false;
    const util = !domingo && !sabadoFora && !fora.has(iso);
    celulas.push(
      <button
        key={iso}
        className={domingo ? 'domingo' : util ? 'util' : 'fora'}
        title={util ? 'Dia útil — clique para marcar como feriado' : 'Não útil — clique para voltar a ser útil'}
        disabled={domingo || sabadoFora}
        onClick={() => {
          const n = new Set(fora);
          if (n.has(iso)) n.delete(iso); else n.add(iso);
          onChange({ ...cfg, diasNaoUteis: [...n].sort() });
        }}
      >
        {d}
      </button>
    );
  }
  return (
    <div className="calendario">
      {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => <span key={i}>{d}</span>)}
      {celulas}
    </div>
  );
}

export default function MetasPage({ dados, setDados, empresa, prefs, carregar, avisar, abaInicial }) {
  const [mes, setMes] = useState(mesAtual());
  const [aba, setAba] = useState(abaInicial || 'cadastro');
  const [cfg, setCfg] = useState(null);
  const [alterado, setAlterado] = useState(false);
  const [deduzir, setDeduzir] = useState(prefs.deduzirRetorno);
  const [res, setRes] = useState(null);
  const [erro, setErro] = useState(null);
  const [sub, setSub] = useState(0);

  useEffect(() => { if (abaInicial) setAba(abaInicial); }, [abaInicial]);

  const fabs = useMemo(() => (empresa?.fabricantes || []).filter((f) => f.ativo !== false).map((f) => ({ nome: f.nome, chave: norm(f.nome) })), [empresa]);

  useEffect(() => {
    const salvo = (empresa?.metas || {})[mes];
    setCfg(salvo ? JSON.parse(JSON.stringify(salvo)) : { sabadoUtil: true, diasNaoUteis: [], linhas: [] });
    setAlterado(false);
    setRes(null);
    setErro(null);
    setSub(0);
  }, [mes, empresa?.id]);

  if (!cfg || !empresa) return null;

  const mudar = (patch) => { setCfg({ ...cfg, ...patch }); setAlterado(true); };
  const mudarLinha = (i, patch) => mudar({ linhas: cfg.linhas.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  const salvar = async () => {
    const novos = await window.api.salvarMetasMes({ mes, cfg });
    setDados(novos);
    setAlterado(false);
    avisar('Metas de ' + nomeMes(mes) + ' salvas.');
  };

  const carregarSetores = () => carregar(async () => {
    try {
      const lista = await window.api.setoresDoMes({ mes });
      const existentes = new Set(cfg.linhas.map((l) => l.setores.trim()));
      const novas = lista.filter((s) => !existentes.has(s.setor)).map((s) => ({ ...novaLinha(), setores: s.setor, supervisor: s.nome }));
      mudar({ linhas: [...cfg.linhas, ...novas] });
      avisar(novas.length ? `${novas.length} setor(es) adicionados.` : 'Todos os setores do mês já estão na lista.');
    } catch (err) {
      avisar(limparErro(err), 'erro');
    }
  });

  const copiarAnterior = () => {
    const ant = (empresa.metas || {})[mesAnterior(mes)];
    if (!ant) return avisar('Não há metas cadastradas em ' + nomeMes(mesAnterior(mes)) + '.', 'erro');
    mudar({ linhas: ant.linhas.map((l) => ({ ...l, id: novaLinha().id, metas: { ...l.metas } })) });
  };

  const calcular = () => carregar(async () => {
    try {
      if (alterado) await salvar();
      const r = await window.api.calcularMetas({ mes, deduzirRetorno: deduzir });
      setRes(r);
      setErro(null);
      setSub(indiceHoje(r, aba));
    } catch (err) {
      setErro(limparErro(err));
    }
  });

  const totalLinha = (l) => fabs.reduce((s, f) => s + (Number(l.metas[f.chave]) || 0), 0);
  const totalGeral = cfg.linhas.reduce((s, l) => s + totalLinha(l), 0);
  const nUteis = (() => {
    const [a, m] = mes.split('-').map(Number);
    let n = 0;
    for (let d = 1; d <= new Date(a, m, 0).getDate(); d++) {
      const iso = `${mes}-${String(d).padStart(2, '0')}`;
      const dow = new Date(a, m - 1, d).getDay();
      if (dow === 0 || (dow === 6 && cfg.sabadoUtil === false) || (cfg.diasNaoUteis || []).includes(iso)) continue;
      n++;
    }
    return n;
  })();

  const exportar = async () => {
    if (!res) return;
    const planilhas = [
      { nome: 'Mensal', titulo: `Metas x realizado — ${nomeMes(mes)}`, tabela: res.mensal },
      ...res.semanas.map((s, i) => ({ nome: `Semana ${i + 1}`, titulo: s.rotulo, tabela: s })),
      { nome: 'Visão Macro', titulo: 'Visão macro — quem deve menos para quem', tabela: res.macro }
    ];
    await window.api.exportarExcel({ titulo: `Metas ${mes}`, planilhas });
  };

  const tabelaAtual = res && (aba === 'mensal' ? res.mensal : aba === 'semanal' ? res.semanas[sub] : aba === 'diario' ? res.dias[sub] : null);

  return (
    <>
      <div className="card filtros">
        <label className="campo"><span>Mês</span>
          <input type="month" className="input" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
        </label>
        <div className="campo"><span>Retornos</span><Toggle checked={deduzir} onChange={setDeduzir}>Deduzir retorno</Toggle></div>
        <div className="campo"><span>Dias úteis no mês</span><b style={{ height: 34, display: 'flex', alignItems: 'center', fontSize: 16 }}>{nUteis}</b></div>
        <div className="acoes">
          {alterado && <span className="selo">alterações não salvas</span>}
          <button className="btn" onClick={salvar} disabled={!alterado}><Save size={15} /> Salvar metas</button>
          <button className="btn primario" onClick={() => { if (aba === 'cadastro') setAba('mensal'); calcular(); }}>
            <RefreshCw size={15} /> Calcular realizado
          </button>
        </div>
      </div>

      <div className="card">
        <div className="abas">
          {[['cadastro', 'Cadastro das metas'], ['mensal', 'Mensal'], ['semanal', 'Semanal'], ['diario', 'Diário'], ['macro', 'Visão macro']].map(([k, r]) => (
            <button key={k} className={aba === k ? 'ativo' : ''} onClick={() => { setAba(k); setSub(indiceHoje(res, k)); }}>{r}</button>
          ))}
        </div>

        {aba === 'cadastro' && (
          <div className="card-corpo">
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div>
                <h3>Dias úteis de {nomeMes(mes)}</h3>
                <Calendario mes={mes} cfg={cfg} onChange={(c) => { setCfg(c); setAlterado(true); }} />
                <div style={{ marginTop: 10 }}>
                  <Toggle checked={cfg.sabadoUtil !== false} onChange={(v) => mudar({ sabadoUtil: v })}>Sábado é dia útil</Toggle>
                </div>
                <p className="ajuda">Clique num dia para marcar feriado.</p>
              </div>
              <div style={{ flex: 1, minWidth: 320 }}>
                <Aviso tipo="info">
                  Meta de <b>volume</b> (Quant × Fator_HL) por setor e fabricante. A meta semanal e a diária são calculadas
                  como na planilha: meta do mês ÷ dias úteis, somando o que faltou na semana/dia anterior.
                  Em “Setor” use um código (103), vários (101,102) ou um prefixo (2* = todos que começam com 2).
                </Aviso>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <button className="btn" onClick={carregarSetores}><DownloadCloud size={15} /> Trazer setores que venderam no mês</button>
                  <button className="btn" onClick={copiarAnterior}><Copy size={15} /> Copiar metas do mês anterior</button>
                  <button className="btn" onClick={() => mudar({ linhas: [...cfg.linhas, novaLinha()] })}><Plus size={15} /> Adicionar linha</button>
                </div>
              </div>
            </div>

            <div className="secao" style={{ overflowX: 'auto' }}>
              {!cfg.linhas.length ? (
                <div className="vazio"><Target size={28} /><b>Nenhuma meta cadastrada para {nomeMes(mes)}</b>Traga os setores do mês ou copie as metas do mês anterior.</div>
              ) : (
                <table className="edicao">
                  <thead>
                    <tr>
                      <th>Setor</th>
                      <th>Supervisor</th>
                      {fabs.map((f) => <th key={f.chave} style={{ textAlign: 'right' }}>{f.nome}</th>)}
                      <th style={{ textAlign: 'right' }}>Total</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {cfg.linhas.map((l, i) => (
                      <tr key={l.id}>
                        <td><input className="input" style={{ width: 90 }} value={l.setores} onChange={(e) => mudarLinha(i, { setores: e.target.value })} /></td>
                        <td><input className="input" style={{ width: 170 }} value={l.supervisor} onChange={(e) => mudarLinha(i, { supervisor: e.target.value })} /></td>
                        {fabs.map((f) => (
                          <td key={f.chave}>
                            <input
                              className="input numero"
                              inputMode="decimal"
                              value={l.metas[f.chave] ?? ''}
                              onChange={(e) => {
                                const v = e.target.value.replace(',', '.').replace(/[^\d.]/g, '');
                                mudarLinha(i, { metas: { ...l.metas, [f.chave]: v === '' ? '' : v } });
                              }}
                            />
                          </td>
                        ))}
                        <td style={{ textAlign: 'right', fontWeight: 650 }}>{int(totalLinha(l))}</td>
                        <td><button className="btn mini fantasma perigo" onClick={() => mudar({ linhas: cfg.linhas.filter((_, j) => j !== i) })}><Trash2 size={14} /></button></td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={2}><b>Total</b></td>
                      {fabs.map((f) => (
                        <td key={f.chave} style={{ textAlign: 'right', fontWeight: 650 }}>
                          {int(cfg.linhas.reduce((s, l) => s + (Number(l.metas[f.chave]) || 0), 0))}
                        </td>
                      ))}
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{int(totalGeral)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {aba !== 'cadastro' && !res && !erro && (
          <div className="vazio"><RefreshCw size={28} /><b>Clique em “Calcular realizado”</b>O sistema busca o volume vendido no banco e compara com as metas de {nomeMes(mes)}.</div>
        )}
        {aba !== 'cadastro' && erro && <div className="card-corpo"><Aviso tipo="erro">{erro}</Aviso></div>}

        {res && aba === 'semanal' && (
          <div className="seletor-sub">
            {res.semanas.map((s, i) => <button key={i} className={'chip' + (sub === i ? ' on' : '')} onClick={() => setSub(i)}>{s.rotulo}</button>)}
          </div>
        )}
        {res && aba === 'diario' && (
          <div className="seletor-sub">
            {res.dias.map((d, i) => <button key={d.dia} className={'chip' + (sub === i ? ' on' : '')} onClick={() => setSub(i)}>{d.rotulo}</button>)}
          </div>
        )}
      </div>

      {res && aba !== 'cadastro' && aba !== 'macro' && tabelaAtual && (
        <>
          <Resumo itens={[
            { rotulo: 'Meta (volume)', valor: tabelaAtual.totalMeta, tipo: 'inteiro' },
            { rotulo: 'Realizado', valor: tabelaAtual.totalReal, tipo: 'inteiro' },
            { rotulo: '% da meta', valor: tabelaAtual.totalMeta ? tabelaAtual.totalReal / tabelaAtual.totalMeta : 0, tipo: 'pct' },
            { rotulo: 'Falta bater', valor: Math.max(tabelaAtual.totalMeta - tabelaAtual.totalReal, 0), tipo: 'inteiro' },
            ...(aba === 'mensal' ? [{ rotulo: 'Dias úteis decorridos', valor: `${res.decorridos} de ${res.diasUteis.length}`, tipo: 'texto' }] : [])
          ]} />
          <DataTable colunas={tabelaAtual.colunas} linhas={tabelaAtual.linhas} vazio="Cadastre as metas na aba “Cadastro das metas”."
            barra={<button className="btn mini" onClick={exportar}><FileSpreadsheet size={14} /> Excel</button>} />
        </>
      )}

      {res && aba === 'macro' && <VisaoMacro res={res} mes={mes} exportar={exportar} />}

      {res && res.setoresSemMeta.length > 0 && aba !== 'cadastro' && (
        <Aviso tipo="alerta">
          Venderam no mês mas não têm meta: {res.setoresSemMeta.slice(0, 12).map((s) => `${s.setor} (${int(s.volume)} vol)`).join(', ')}
          {res.setoresSemMeta.length > 12 ? '…' : ''}. Esse volume não entra nas tabelas acima.
        </Aviso>
      )}
    </>
  );
}

function VisaoMacro({ res, mes, exportar }) {
  const dados = res.macro.dados;
  const meta = dados.reduce((s, d) => s + d.meta, 0);
  const real = dados.reduce((s, d) => s + d.real, 0);
  const esperado = res.diasUteis.length ? res.decorridos / res.diasUteis.length : 0;
  const cor = (p) => (p >= esperado * 0.95 ? 'var(--ok)' : p >= esperado * 0.7 ? 'var(--warn)' : 'var(--bad)');
  return (
    <>
      <Resumo itens={[
        { rotulo: 'Meta do mês', valor: meta, tipo: 'inteiro' },
        { rotulo: 'Realizado', valor: real, tipo: 'inteiro' },
        { rotulo: '% da meta', valor: meta ? real / meta : 0, tipo: 'pct' },
        { rotulo: 'Esperado até hoje', valor: esperado, tipo: 'pct' },
        { rotulo: 'Falta bater', valor: Math.max(meta - real, 0), tipo: 'inteiro' }
      ]} />
      <div className="card card-corpo">
        <div className="secao-topo">
          <h3>Visão macro — quem deve menos para quem • {nomeMes(mes)}</h3>
          <div className="acoes legenda">
            <span><i style={{ background: 'var(--ok)' }} />no ritmo</span>
            <span><i style={{ background: 'var(--warn)' }} />atenção</span>
            <span><i style={{ background: 'var(--bad)' }} />abaixo do ritmo</span>
            <button className="btn mini" onClick={exportar}><FileSpreadsheet size={14} /> Excel</button>
          </div>
        </div>
        {!dados.length ? <div className="vazio"><b>Sem metas cadastradas</b></div> : (
          <div className="macro-barras">
            {dados.map((d, i) => (
              <div className="macro-linha" key={d.setor + i}>
                <span className="pos">{i + 1}º</span>
                <span className="nome"><b>{d.supervisor || '—'}</b><small>Setor {d.setor}</small></span>
                <div className="macro-trilho">
                  <i style={{ width: `${Math.min(d.pct, 1) * 100}%`, background: cor(d.pct) }} />
                  <em>{pct(d.pct, 1)} • {int(d.real)} de {int(d.meta)}</em>
                </div>
                <span className="def"><b>{int(d.deficit)}</b><small>falta bater</small></span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
