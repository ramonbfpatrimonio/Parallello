import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import Icone from './Icone';

export default function Sistema({ config, setConfig, aviso }) {
  const [aba, setAba] = useState('conexoes');
  return (
    <section className="pagina">
      <header className="pagina-topo">
        <div>
          <h1>Sistema</h1>
          <p>Conexão em uso e ajustes da consulta, preferências de exibição e backup dos dados deste computador.</p>
        </div>
      </header>
      <div className="sub-abas" role="tablist">
        {[['conexoes', 'Conexões'], ['config', 'Preferências'], ['backup', 'Backup']].map(([id, r]) => (
          <button key={id} role="tab" aria-selected={aba === id} className={aba === id ? 'ativa' : ''} onClick={() => setAba(id)}>{r}</button>
        ))}
      </div>
      {aba === 'conexoes' && <Conexoes config={config} setConfig={setConfig} aviso={aviso} />}
      {aba === 'config' && <Preferencias config={config} setConfig={setConfig} aviso={aviso} />}
      {aba === 'backup' && <Backup setConfig={setConfig} aviso={aviso} />}
    </section>
  );
}

// ---------------- Conexões: as do Parallello à esquerda, ajustes deste sistema à direita ----------------
function Conexoes({ config, setConfig, aviso }) {
  const conexoes = config?.conexoes || [];
  const [selecionada, setSelecionada] = useState(null);
  const [f, setF] = useState(null);
  const [alterado, setAlterado] = useState(false);
  const [testando, setTestando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [colunas, setColunas] = useState([]);
  const [buscando, setBuscando] = useState(false);

  // Seleciona a conexão em uso ao abrir
  useEffect(() => {
    if (!config || selecionada) return;
    if (config.ativaId) escolher(config.ativaId);
  }, [config]); // eslint-disable-line react-hooks/exhaustive-deps

  function escolher(id) {
    if (alterado && !window.confirm('Há alterações não salvas nesta conexão. Descartar?')) return;
    const c = conexoes.find(x => x.id === id);
    if (!c) return;
    setSelecionada(id);
    setF({ ...c });
    setAlterado(false);
    setResultado(null);
    setColunas([]);
  }

  const campo = k => e => {
    setF(x => ({ ...x, [k]: e.target.value }));
    setAlterado(true);
    setResultado(null);
  };

  async function testar() {
    setTestando(true);
    setResultado(null);
    try {
      const r = await api.testarConexao(f);
      setResultado(r.faltando.length
        ? { ok: false, texto: `Conectou ao banco ${r.banco}, mas faltam as tabelas ${r.faltando.join(', ')}. Confira se é o banco do ERP.` }
        : { ok: true, texto: `Conectou ao banco ${r.banco}. As quatro tabelas da consulta estão lá.` });
    } catch (e) {
      setResultado({ ok: false, texto: `Não conectou: ${e.message}` });
    } finally {
      setTestando(false);
    }
  }

  async function buscarColunas() {
    setBuscando(true);
    try {
      const c = await api.colunasData(f);
      setColunas(c);
      if (!c.length) aviso('A tabela ProdutosProducao não tem colunas de data neste banco.', 'info');
    } catch (e) { aviso(e.message, 'erro'); } finally { setBuscando(false); }
  }

  async function salvar(e) {
    e.preventDefault();
    try {
      const r = await api.salvarConexao(f);
      setConfig(r.config);
      setF({ ...r.config.conexoes.find(x => x.id === r.id) });
      setAlterado(false);
      aviso(`Ajustes de ${f.nome} salvos.`);
    } catch (err) { aviso(err.message, 'erro'); }
  }

  async function usar() {
    try {
      setConfig(await api.ativarConexao(f.id));
      aviso(`Usando a conexão ${f.nome}.`);
    } catch (err) { aviso(err.message, 'erro'); }
  }

  if (!config) return null;
  if (!conexoes.length) {
    return (
      <div className="painel estreito">
        <h2>Nenhuma conexão no Parallello</h2>
        <p>As conexões com o banco são as mesmas de todos os sistemas. Cadastre na Configuração do Parallello (Ctrl+Shift+B na tela inicial) e volte aqui para escolher a coluna de data da ordem.</p>
      </div>
    );
  }
  if (!f) return null;
  const emUso = f.id === config.ativaId;
  const opcoesData = [...new Set([f.colunaData, ...colunas].filter(Boolean))];

  return (
    <div className="conexoes">
      <div className="conexoes-lista">
        <ul>
          {conexoes.map(c => (
            <li key={c.id}>
              <button className={selecionada === c.id ? 'selecionada' : ''} onClick={() => escolher(c.id)} aria-current={selecionada === c.id}>
                <span className="cx-nome">
                  {c.nome}
                  {c.id === config.ativaId && <em className="em-uso">em uso</em>}
                </span>
                <span className="cx-detalhe">{c.server}{c.instance ? `\\${c.instance}` : ''} / {c.database}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="dica">As conexões são as do Parallello: cadastro e senha ficam na Configuração do Parallello (Ctrl+Shift+B na tela inicial).</p>
      </div>

      <form className="painel editor" onSubmit={salvar}>
        <div className="editor-topo">
          <strong className="nome-conexao">{f.nome}</strong>
          {emUso ? <span className="selo-uso">Conexão em uso</span> : <button type="button" className="sec" onClick={usar} disabled={alterado}>Usar esta conexão</button>}
        </div>

        <div className="grupo-campos">
          <h3>Servidor (do Parallello)</h3>
          <div className="campos tres">
            <label>Servidor<input value={f.server} disabled /></label>
            <label>Instância<input value={f.instance} disabled /></label>
            <label>Porta<input value={f.port} disabled /></label>
          </div>
          <label>Banco de dados<input value={f.database} disabled /></label>
        </div>

        <div className="grupo-campos">
          <h3>Consulta</h3>
          <div className="campos">
            <label>Coluna de data da ordem
              <div className="linha-campo">
                <select value={f.colunaData} onChange={campo('colunaData')}>
                  <option value="">Sem filtro por período</option>
                  {opcoesData.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button type="button" className="sec" onClick={buscarColunas} disabled={buscando}>{buscando ? 'Buscando...' : 'Buscar no banco'}</button>
              </div>
              <span className="dica">Coluna de ProdutosProducao usada no filtro de período.</span>
            </label>
            <label>Tempo limite da consulta (segundos)<input type="number" min="15" value={f.timeout} onChange={campo('timeout')} /></label>
          </div>
        </div>

        {resultado && (
          <div className={`faixa ${resultado.ok ? 'ok' : 'erro'}`}><Icone nome={resultado.ok ? 'banco' : 'alerta'} /><span>{resultado.texto}</span></div>
        )}

        <div className="editor-acoes">
          <span className="espaco" />
          <button type="button" className="sec" onClick={testar} disabled={testando}>{testando ? 'Testando...' : 'Testar conexão'}</button>
          <button type="submit" disabled={!alterado}>Salvar ajustes</button>
        </div>
      </form>
    </div>
  );
}

// ---------------- Preferências ----------------
function Preferencias({ config, setConfig, aviso }) {
  const [casas, setCasas] = useState(2);
  useEffect(() => { if (config) setCasas(config.preferencias.casasCustoUnit); }, [config]);

  async function salvar(v) {
    setCasas(v);
    try {
      setConfig(await api.salvarPreferencias({ casasCustoUnit: Number(v) }));
      aviso('Preferência salva.');
    } catch (err) { aviso(err.message, 'erro'); }
  }

  return (
    <div className="painel estreito">
      <h2>Casas decimais do custo unitário</h2>
      <div className="segmentado" role="radiogroup">
        {[2, 3, 4].map(n => (
          <button key={n} role="radio" aria-checked={Number(casas) === n} className={Number(casas) === n ? 'ativo' : ''} onClick={() => salvar(n)}>{n} casas</button>
        ))}
      </div>
      <p className="dica">Muda só a exibição. O cálculo usa sempre 4 casas, como na consulta.</p>

      <h2>Como o custo é calculado</h2>
      <ul className="regras">
        <li>Quantidade em kg = Quant + QuantUnid ÷ 1000. Exemplo: 7/17 = 7,017 kg.</li>
        <li>Custo unitário do insumo = (Custo ÷ Estoque) × Unidades, da última movimentação com custo maior que zero.</li>
        <li>Custo total do insumo = custo unitário × quantidade em kg.</li>
        <li>Custo do acabado = soma dos custos dos insumos. O custo unitário do acabado é esse valor dividido pelos kg produzidos.</li>
      </ul>
    </div>
  );
}

// ---------------- Backup ----------------
function Backup({ setConfig, aviso }) {
  const [pasta, setPasta] = useState('');
  useEffect(() => { api.pastaDados().then(setPasta).catch(() => {}); }, []);

  async function exportar() {
    try {
      const destino = await api.backupExportar();
      if (destino) aviso(`Backup salvo em ${destino}`);
    } catch (e) { aviso(e.message, 'erro'); }
  }

  async function importar() {
    if (!window.confirm('Restaurar um backup? Os ajustes e o histórico do arquivo serão gravados neste computador.')) return;
    try {
      const r = await api.backupImportar();
      if (r) {
        setConfig(await api.configGet());
        aviso(`Backup restaurado: ${r.registros} consultas.`);
      }
    } catch (e) { aviso(e.message, 'erro'); }
  }

  return (
    <div className="painel estreito">
      <h2>Backup dos dados deste computador</h2>
      <p>O arquivo leva os ajustes de cada conexão, as preferências e o histórico. As conexões em si são as do Parallello.</p>
      <p className="dica">Pasta dos dados: <code>{pasta}</code></p>
      <div className="editor-acoes">
        <span className="espaco" />
        <button className="sec" onClick={importar}>Restaurar backup</button>
        <button onClick={exportar}>Gerar backup</button>
      </div>
    </div>
  );
}
