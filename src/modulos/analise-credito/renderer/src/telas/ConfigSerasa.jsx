import React, { useEffect, useState } from 'react';
import { Save, PlugZap, KeyRound, Loader2, Plus, X, Info, FlaskConical } from 'lucide-react';
import { api, fmtMoeda, fmtNum } from '../util.js';

// Configuração da Serasa (API) — uma por conexão, porque cada empresa tem o próprio contrato
export default function ConfigSerasa() {
  const [conexoes, setConexoes] = useState([]);
  const [conexaoId, setConexaoId] = useState('');
  const [cfg, setCfg] = useState(null);
  const [secret, setSecret] = useState('');
  const [msg, setMsg] = useState(null);
  const [ocupado, setOcupado] = useState('');
  const [teste, setTeste] = useState({ codigo: '', documento: '' });
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    api.conexoesListar().then((l) => {
      setConexoes(l);
      setConexaoId((l.find((c) => c.ativa) || l[0])?.id || '');
    });
  }, []);

  useEffect(() => {
    if (!conexaoId) return;
    setCfg(null); setSecret(''); setMsg(null); setResultado(null);
    api.serasaConfig(conexaoId).then(setCfg).catch((e) => setMsg({ ok: false, txt: e.message }));
  }, [conexaoId]);

  if (!conexoes.length) return <p className="muted">Cadastre uma conexão primeiro (aba Conexões).</p>;
  if (!cfg) return <p className="muted">Carregando…</p>;

  const set = (grupo, campo) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
    setCfg((c) => (grupo ? { ...c, [grupo]: { ...c[grupo], [campo]: v } } : { ...c, [campo]: v }));
    setMsg(null);
  };
  const setFaixa = (i, campo, v) => setCfg((c) => ({ ...c, faixas: c.faixas.map((f, j) => (j === i ? { ...f, [campo]: campo === 'ate' ? Number(v) : v } : f)) }));
  const formCfg = () => ({ ...cfg, secret });

  const salvar = async () => {
    try {
      const s = await api.serasaSalvar(conexaoId, formCfg());
      setCfg(s); setSecret('');
      setMsg({ ok: true, txt: 'Configuração da Serasa salva para esta conexão.' });
    } catch (e) { setMsg({ ok: false, txt: e.message }); }
  };

  const testarAuth = async () => {
    setOcupado('auth'); setMsg(null);
    try { const r = await api.serasaTestarAuth({ conexaoId, cfg: formCfg() }); setMsg({ ok: true, txt: `Autenticação OK — token recebido (${r.token}).` }); }
    catch (e) { setMsg({ ok: false, txt: e.message }); }
    finally { setOcupado(''); }
  };

  const testarConsulta = async () => {
    if (!teste.codigo && !teste.documento) { setMsg({ ok: false, txt: 'Informe o código de um cliente ou um documento para testar.' }); return; }
    if (!cfg.modoDemo && !window.confirm('A consulta de teste é feita na API configurada e pode ser cobrada. Continuar?')) return;
    setOcupado('consulta'); setMsg(null); setResultado(null);
    try { setResultado(await api.serasaTestar({ conexaoId, cfg: formCfg(), codigo: teste.codigo, documento: teste.documento })); }
    catch (e) { setMsg({ ok: false, txt: e.message }); }
    finally { setOcupado(''); }
  };

  const desabilitado = !cfg.ativo && !cfg.modoDemo;

  return (
    <div className="cfg-serasa">
      <div className="cfg-topo card">
        <label>Conexão (empresa)
          <select value={conexaoId} onChange={(e) => setConexaoId(e.target.value)}>
            {conexoes.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.ativa ? ' (em uso)' : ''}</option>)}
          </select>
        </label>
        <label className="switch"><input type="checkbox" checked={cfg.ativo} onChange={set(null, 'ativo')} /><i />Integração ativa</label>
        <label className="switch"><input type="checkbox" checked={cfg.modoDemo} onChange={set(null, 'modoDemo')} /><i />Modo demonstração</label>
        <label>Ambiente
          <select value={cfg.ambiente} onChange={set(null, 'ambiente')}>
            <option value="homologacao">Homologação (teste)</option>
            <option value="producao">Produção</option>
          </select>
        </label>
      </div>
      {cfg.modoDemo && <div className="serasa-aviso"><Info size={15} />Modo demonstração: o card mostra dados fictícios e nenhuma chamada é feita à Serasa.</div>}

      <div className={`cfg-grade ${desabilitado ? 'apagado' : ''}`}>
        <section className="card">
          <h3><KeyRound size={16} /> Autenticação</h3>
          <div className="form-grade">
            <label>Tipo
              <select value={cfg.auth.tipo} onChange={set('auth', 'tipo')}>
                <option value="oauth2">OAuth2 (client credentials)</option>
                <option value="nenhuma">Sem autenticação</option>
              </select>
            </label>
            <label>Envio das credenciais
              <select value={cfg.auth.envio} onChange={set('auth', 'envio')} disabled={cfg.auth.tipo === 'nenhuma'}>
                <option value="basic">Cabeçalho Basic</option>
                <option value="form">Formulário (client_id / client_secret)</option>
                <option value="json">JSON no corpo</option>
              </select>
            </label>
            <label className="col2">URL do token
              <input value={cfg.auth.url} onChange={set('auth', 'url')} placeholder="https://… (fornecida pela Serasa)" disabled={cfg.auth.tipo === 'nenhuma'} />
            </label>
            <label>Client ID<input value={cfg.auth.clientId} onChange={set('auth', 'clientId')} disabled={cfg.auth.tipo === 'nenhuma'} /></label>
            <label>Client Secret
              <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} disabled={cfg.auth.tipo === 'nenhuma'}
                placeholder={cfg.temSecret ? '•••••• (salvo — deixe vazio para manter)' : ''} />
            </label>
            <label>Escopo (opcional)<input value={cfg.auth.escopo} onChange={set('auth', 'escopo')} disabled={cfg.auth.tipo === 'nenhuma'} /></label>
            <label>Campo do token no retorno<input value={cfg.auth.caminhoToken} onChange={set('auth', 'caminhoToken')} disabled={cfg.auth.tipo === 'nenhuma'} /></label>
          </div>
          <div className="acoes esquerda">
            <button className="btn" onClick={testarAuth} disabled={!!ocupado || cfg.auth.tipo === 'nenhuma'}>
              {ocupado === 'auth' ? <Loader2 size={15} className="gira" /> : <PlugZap size={15} />}Testar autenticação
            </button>
          </div>
        </section>

        <section className="card">
          <h3><PlugZap size={16} /> Consulta</h3>
          <div className="form-grade">
            <label>Método
              <select value={cfg.consulta.metodo} onChange={set('consulta', 'metodo')}>
                <option>POST</option><option>GET</option>
              </select>
            </label>
            <label>Produto / relatório contratado<input value={cfg.consulta.produto} onChange={set('consulta', 'produto')} placeholder="código do produto" /></label>
            <label className="col2">URL da consulta
              <input value={cfg.consulta.url} onChange={set('consulta', 'url')} placeholder="https://…/{documento}" />
            </label>
            {cfg.consulta.metodo !== 'GET' && (
              <label className="col2">Corpo (JSON)
                <textarea rows={5} className="mono" value={cfg.consulta.corpo} onChange={set('consulta', 'corpo')} />
              </label>
            )}
            <label className="col2">Cabeçalhos extras (JSON, opcional)
              <input className="mono" value={cfg.consulta.cabecalhos} onChange={set('consulta', 'cabecalhos')} placeholder='{"X-Exemplo": "valor"}' />
            </label>
          </div>
          <p className="muted pequeno">Marcadores: <code>{'{documento}'}</code> só números · <code>{'{tipo}'}</code> CPF ou CNPJ · <code>{'{produto}'}</code></p>
        </section>

        <section className="card">
          <h3>Documento do cliente</h3>
          <div className="form-grade">
            <label>Coluna do documento (Clientes)<input value={cfg.documento.coluna} onChange={set('documento', 'coluna')} /></label>
            <label>Coluna do tipo (opcional)<input value={cfg.documento.colunaTipo} onChange={set('documento', 'colunaTipo')} placeholder="ex.: TipoInsc" /></label>
          </div>
          <p className="muted pequeno">CPF e CNPJ são identificados pelos dígitos verificadores. Documentos estrangeiros ou inválidos não são enviados à Serasa.</p>

          <h3 className="sep-h">Controle de custo</h3>
          <div className="form-grade">
            <label>Reaproveitar consulta por (dias)<input type="number" min="0" value={cfg.custo.validadeDias} onChange={set('custo', 'validadeDias')} /></label>
            <label>Limite de consultas por mês (0 = sem limite)<input type="number" min="0" value={cfg.custo.limiteMensal} onChange={set('custo', 'limiteMensal')} /></label>
            <label className="switch col2"><input type="checkbox" checked={cfg.custo.confirmar} onChange={set('custo', 'confirmar')} /><i />Pedir confirmação antes de cada consulta cobrada</label>
          </div>
        </section>

        <section className="card">
          <h3>Campos do retorno</h3>
          <p className="muted pequeno">Caminho de cada informação no JSON da API (ex.: <code>resultado.score</code>, <code>itens[0].valor</code>; use <code>|</code> para alternativas). Use o teste abaixo para ver o retorno real.</p>
          <div className="form-grade">
            <label>Score<input className="mono" value={cfg.mapa.score} onChange={set('mapa', 'score')} /></label>
            <label>Faixa (opcional)<input className="mono" value={cfg.mapa.faixa} onChange={set('mapa', 'faixa')} /></label>
            <label>Mensagem (opcional)<input className="mono" value={cfg.mapa.mensagem} onChange={set('mapa', 'mensagem')} /></label>
            <label>Lista de pendências<input className="mono" value={cfg.mapa.pendencias} onChange={set('mapa', 'pendencias')} /></label>
            <label>↳ Descrição<input className="mono" value={cfg.mapa.pendenciaDescricao} onChange={set('mapa', 'pendenciaDescricao')} /></label>
            <label>↳ Valor<input className="mono" value={cfg.mapa.pendenciaValor} onChange={set('mapa', 'pendenciaValor')} /></label>
            <label>↳ Data<input className="mono" value={cfg.mapa.pendenciaData} onChange={set('mapa', 'pendenciaData')} /></label>
            <label>↳ Credor<input className="mono" value={cfg.mapa.pendenciaCredor} onChange={set('mapa', 'pendenciaCredor')} /></label>
            <label>Valor total das pendências<input className="mono" value={cfg.mapa.valorPendencias} onChange={set('mapa', 'valorPendencias')} placeholder="vazio = soma da lista" /></label>
            <label>Quantidade de protestos<input className="mono" value={cfg.mapa.qtdProtestos} onChange={set('mapa', 'qtdProtestos')} /></label>
          </div>
        </section>

        <section className="card col-inteira">
          <h3>Faixas do medidor</h3>
          <div className="faixas-edit">
            {cfg.faixas.map((f, i) => (
              <div key={i} className="faixa-linha">
                <input type="color" value={f.cor} onChange={(e) => setFaixa(i, 'cor', e.target.value)} />
                <input value={f.nome} onChange={(e) => setFaixa(i, 'nome', e.target.value)} />
                <span className="muted pequeno">até</span>
                <input type="number" min="0" max="1000" value={f.ate} onChange={(e) => setFaixa(i, 'ate', e.target.value)} />
                <button className="btn-x" onClick={() => setCfg((c) => ({ ...c, faixas: c.faixas.filter((_, j) => j !== i) }))} disabled={cfg.faixas.length <= 1}><X size={14} /></button>
              </div>
            ))}
            <button className="link" onClick={() => setCfg((c) => ({ ...c, faixas: [...c.faixas, { ate: 1000, nome: 'Nova', cor: '#2457c5' }] }))}><Plus size={13} /> faixa</button>
          </div>
        </section>

        <section className="card col-inteira">
          <h3><FlaskConical size={16} /> Testar consulta</h3>
          <p className="muted pequeno">Usa a configuração da tela (mesmo sem salvar). O resultado do teste não é gravado no histórico do cliente.</p>
          <div className="teste-linha">
            <label>Código do cliente<input value={teste.codigo} onChange={(e) => setTeste({ ...teste, codigo: e.target.value })} placeholder="lê o documento do banco" /></label>
            <span className="muted">ou</span>
            <label>Documento<input value={teste.documento} onChange={(e) => setTeste({ ...teste, documento: e.target.value })} placeholder="CPF ou CNPJ" /></label>
            <button className="btn primario" onClick={testarConsulta} disabled={!!ocupado}>
              {ocupado === 'consulta' ? <Loader2 size={15} className="gira" /> : <FlaskConical size={15} />}Testar
            </button>
          </div>
          {resultado && (
            <div className="teste-resultado">
              <div className="teste-extraido">
                <div><span>Documento</span><b>{resultado.documento.tipo} {resultado.documento.formatado}</b></div>
                <div><span>Score</span><b>{resultado.extraido.score ?? 'não encontrado'}</b></div>
                <div><span>Pendências</span><b>{resultado.extraido.pendencias.length}</b></div>
                <div><span>Valor pendências</span><b>{resultado.extraido.valorPendencias != null ? fmtMoeda(resultado.extraido.valorPendencias) : '—'}</b></div>
                <div><span>Protestos</span><b>{resultado.extraido.qtdProtestos ?? '—'}</b></div>
                <div><span>Tempo</span><b>{fmtNum(resultado.ms)} ms</b></div>
              </div>
              <pre className="json">{JSON.stringify(resultado.retorno, null, 2)}</pre>
            </div>
          )}
        </section>
      </div>

      {msg && <div className={msg.ok ? 'sucesso' : 'erro'}>{msg.txt}</div>}
      <div className="acoes fixas">
        <button className="btn primario" onClick={salvar}><Save size={15} />Salvar configuração</button>
      </div>
    </div>
  );
}
