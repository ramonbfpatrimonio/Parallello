import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Search, BarChart3, AlertTriangle, Database } from 'lucide-react';
import { api } from '../lib/api';
import { useAviso } from '../componentes/comum';
import PainelVisao from '../componentes/PainelVisao';

function filtrosIniciais(cfg) {
  const ano = new Date().getFullYear();
  return {
    ini: `${ano}-01-01`, fim: `${ano}-12-31`, selecao: 'todas',
    centro: cfg?.centroPadrao || '', modo: cfg?.modoPadrao || 'padrao', unificar: cfg?.unificarPadrao !== false
  };
}

function decodificarSelecao(v) {
  if (v === 'todas') return { tipo: 'todas' };
  if (v.startsWith('g:')) return { tipo: 'grupo', valor: v.slice(2) };
  return { tipo: 'conexao', valor: v.slice(2) };
}

export default function Painel({ estado, setEstado, irPara, admin }) {
  const avisar = useAviso();
  const [conexoes, setConexoes] = useState([]);
  const [centros, setCentros] = useState([]);
  const [metas, setMetas] = useState(null);
  const [f, setF] = useState(estado.filtros);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const ultimaConsulta = useRef(0);

  useEffect(() => {
    Promise.all([api('conexoes:listar'), api('centros:listar'), api('metas:obter'), api('config:obter')])
      .then(([cx, ce, me, cfg]) => {
        setConexoes(cx); setCentros(ce); setMetas(me);
        if (!estado.filtros) setF(filtrosIniciais(cfg));
      })
      .catch((e) => avisar(e.message, 'erro'));
  }, []);

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const ativas = conexoes.filter((c) => c.ativo);
  const grupos = [...new Set(ativas.map((c) => c.grupo).filter(Boolean))].sort();

  async function consultar(automatico = false) {
    const minha = ++ultimaConsulta.current;
    setErro('');
    setCarregando(true);
    try {
      const resultado = await api('painel:consultar', { ...f, selecao: decodificarSelecao(f.selecao) });
      if (minha !== ultimaConsulta.current) return; // chegou uma consulta mais nova
      setEstado({ filtros: f, resultado });
      const falhas = resultado.conexoes.filter((c) => !c.ok);
      if (falhas.length) avisar(`Painel atualizado, mas ${falhas.length} conexão(ões) falharam.`, 'erro');
      else if (!automatico) avisar('Painel atualizado.', 'ok');
    } catch (e) {
      if (minha === ultimaConsulta.current) setErro(e.message);
    } finally {
      if (minha === ultimaConsulta.current) setCarregando(false);
    }
  }

  // Igual à planilha: depois da primeira consulta, mudar as datas ou a conexão atualiza o painel sozinho
  const chaveAuto = f ? `${f.ini}|${f.fim}|${f.selecao}` : '';
  const chaveAnterior = useRef(chaveAuto);
  useEffect(() => {
    if (!f || chaveAuto === chaveAnterior.current) return;
    chaveAnterior.current = chaveAuto;
    const valido = /^\d{4}-\d{2}-\d{2}$/.test(f.ini) && /^\d{4}-\d{2}-\d{2}$/.test(f.fim) && f.ini <= f.fim && f.centro;
    if (!estado.resultado || !valido) return;
    const t = setTimeout(() => consultar(true), 700);
    return () => clearTimeout(t);
  }, [chaveAuto]);

  if (!f) return <div className="vazio"><Loader2 className="girar" /></div>;

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <div>
          <h1>Painel de Indicadores</h1>
          <p>Logística · entregas, prazo, custo e devoluções</p>
        </div>
      </div>

      <div className="card">
        <div className="filtros">
          <label className="campo"><span>Data inicial</span><input type="date" value={f.ini} onChange={(e) => set('ini', e.target.value)} /></label>
          <label className="campo"><span>Data final</span><input type="date" value={f.fim} onChange={(e) => set('fim', e.target.value)} /></label>
          <label className="campo"><span>Conexão</span>
            <select value={f.selecao} onChange={(e) => set('selecao', e.target.value)}>
              <option value="todas">TODAS (consolidado)</option>
              {grupos.length > 0 && <optgroup label="Grupos">{grupos.map((g) => <option key={g} value={'g:' + g}>{g}</option>)}</optgroup>}
              {ativas.length > 0 && <optgroup label="Conexões">{ativas.map((c) => <option key={c.id} value={'c:' + c.id}>{c.nome}</option>)}</optgroup>}
            </select>
          </label>
          <label className="campo"><span>Centro de custo</span>
            <select value={f.centro} onChange={(e) => set('centro', e.target.value)}>
              <option value="">Selecione…</option>
              {centros.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} - {c.descricao || '(sem descrição)'}</option>)}
            </select>
          </label>
          <label className="campo"><span>Modo de cálculo</span>
            <div className="segmentado">
              <button type="button" className={f.modo === 'padrao' ? 'ativo' : ''} onClick={() => set('modo', 'padrao')}>Padrão</button>
              <button type="button" className={f.modo === 'planilha' ? 'ativo' : ''} onClick={() => set('modo', 'planilha')}>Planilha</button>
            </div>
          </label>
          <button className="btn primario" style={{ height: 36 }} onClick={() => consultar(false)} disabled={carregando || !ativas.length}>
            {carregando ? <Loader2 size={17} className="girar" /> : <Search size={17} />} {carregando ? 'Consultando…' : 'Consultar'}
          </button>
        </div>
        <div className="filtros-extra">
          {f.modo === 'padrao' ? (
            <label className="check" title="Quando consultar mais de uma conexão, o mesmo cliente (inscrição) no mesmo dia conta uma vez só">
              <input type="checkbox" checked={f.unificar} onChange={(e) => set('unificar', e.target.checked)} />
              Unificar entregas do mesmo cliente no mesmo dia entre conexões
            </label>
          ) : (
            <span>Modo planilha: números idênticos aos da planilha INDICADOR_LOGISTICO (inclusive as inconsistências), para comparação.</span>
          )}
          {estado.resultado && <span style={{ marginLeft: 'auto' }}>Ao mudar as datas ou a conexão, o painel atualiza sozinho.</span>}
        </div>
      </div>

      {!ativas.length && (
        <div className="alerta aviso" style={{ marginTop: 14 }}>
          <Database size={16} />
          <span>Nenhuma conexão com o banco. {admin ? 'Cadastre na configuração do Parallello (Ctrl+Shift+B na tela inicial).' : 'Peça a um administrador para cadastrar.'}</span>
        </div>
      )}
      {erro && <div className="alerta erro" style={{ marginTop: 14 }}><AlertTriangle size={16} />{erro}</div>}

      {estado.resultado && metas ? (
        <PainelVisao resultado={estado.resultado} metas={metas} />
      ) : (
        <div className="inicio-vazio">
          <BarChart3 size={44} />
          <h2>Escolha os filtros e clique em Consultar</h2>
          <p>O resultado fica salvo no Histórico e pode ser aberto depois, mesmo sem conexão com o banco.</p>
        </div>
      )}
    </div>
  );
}
