// ============================================================
// PARALLELLO · MÓDULO COBRANÇA (tela principal)
//
// <CobrancaModulo
//    supabase={clienteSupabaseDoParallello}
//    empresaId={idDaEmpresaLogada}
//    usuario={nomeDoUsuarioDoParallello}
//    verificarSenhaParallello={(senha) => true/false}   // mesma senha do Ctrl+Shift+B do Parallello
//    conexaoSql={configMssqlOpcional}                   // só se o main não souber a conexão
// />
// ============================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './cobranca.css';
import { CobrancaCtx } from './contexto.js';
import { criarNuvemSupabase } from './nuvem.js';
import { mesclarConfig } from './logica/padroes.js';
import { processarCarteira, agendadosHoje, resumoLigacoes } from './logica/calculos.js';
import { hojeISO } from './logica/formato.js';
import { ProvedorAvisos, PedirSenha, useAviso } from './telas/ui.jsx';
import { TelaPin } from './telas/TelaPin.jsx';
import { Painel } from './telas/Painel.jsx';
import { TelaAgendados } from './telas/TelaAgendados.jsx';
import { TelaDisparo } from './telas/TelaDisparo.jsx';
import { TelaLigacoes } from './telas/TelaLigacoes.jsx';
import { TelaPendencias } from './telas/TelaPendencias.jsx';
import { AreaSistema } from './area/AreaSistema.jsx';

const ICONES = {
  painel: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  agenda: 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V9h14v11zM7 11h5v5H7z',
  disparo: 'M2 21l21-9L2 3v7l15 2-15 2v7z',
  ligacoes: 'M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z',
  pendencia: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
  area: 'M12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7zm7.43-2.53a7.8 7.8 0 0 0 0-1.94l2.11-1.65-2-3.46-2.49 1a7.3 7.3 0 0 0-1.68-.98L15 3.5h-4l-.37 2.44a7.3 7.3 0 0 0-1.68.98l-2.49-1-2 3.46 2.11 1.65a7.8 7.8 0 0 0 0 1.94l-2.11 1.65 2 3.46 2.49-1c.52.4 1.08.73 1.68.98L11 20.5h4l.37-2.44a7.3 7.3 0 0 0 1.68-.98l2.49 1 2-3.46z',
  sair: 'M10 17l1.4-1.4-2.6-2.6H20v-2H8.8l2.6-2.6L10 7l-5 5 5 5zM4 5h8V3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8v-2H4V5z',
};

function Icone({ nome }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d={ICONES[nome]} fill="currentColor" /></svg>;
}

export default function CobrancaModulo(props) {
  return (
    <ProvedorAvisos>
      <Modulo {...props} />
    </ProvedorAvisos>
  );
}

function Modulo({ supabase, empresaId, usuario, verificarSenhaParallello, conexaoSql, nuvem: nuvemExterna, erp: erpExterno }) {
  const avisar = useAviso();
  const nuvem = useMemo(() => nuvemExterna || criarNuvemSupabase(supabase, empresaId), [nuvemExterna, supabase, empresaId]);
  const erp = erpExterno || (typeof window !== 'undefined' ? window.parallelloCobranca : null);

  const [config, setConfig] = useState(null);
  const [erroInicio, setErroInicio] = useState('');
  const [operador, setOperador] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(`cob-operador-${empresaId}`) || 'null'); } catch (_) { return null; }
  });
  const [tela, setTela] = useState('painel');
  const [areaAberta, setAreaAberta] = useState(false);
  const [pedindoSenha, setPedindoSenha] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  const [dadosErp, setDadosErp] = useState(null);
  const [nuvemDados, setNuvemDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState('');
  const [extras, setExtras] = useState({ cobrado: null, ligacoesHoje: null, pendentes: 0 });
  const [hoje, setHoje] = useState(hojeISO());
  const carregamento = useRef(0);

  // ---------- internet ----------
  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ---------- Ctrl+Shift+B ----------
  useEffect(() => {
    const k = (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'B' || e.key === 'b')) {
        e.preventDefault(); e.stopImmediatePropagation();
        if (areaAberta) setTela('area'); else setPedindoSenha(true);
      }
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [areaAberta]);

  // ---------- configuração ----------
  const carregarConfig = useCallback(async () => {
    try {
      setErroInicio('');
      if (conexaoSql && erp?.definirConexao) await erp.definirConexao(conexaoSql);
      setConfig(mesclarConfig(await nuvem.carregarConfig()));
    } catch (e) {
      setErroInicio(e.message || String(e));
    }
  }, [nuvem, erp, conexaoSql]);
  useEffect(() => { carregarConfig(); }, [carregarConfig]);

  const salvarConfig = useCallback(async (nova) => {
    await nuvem.salvarConfig(nova, operador?.nome || usuario);
    setConfig(mesclarConfig(nova));
  }, [nuvem, operador, usuario]);

  // ---------- operador ----------
  const definirOperador = (op) => {
    setOperador(op);
    try {
      if (op) sessionStorage.setItem(`cob-operador-${empresaId}`, JSON.stringify(op));
      else sessionStorage.removeItem(`cob-operador-${empresaId}`);
    } catch (_) { /* sem sessionStorage */ }
  };

  // ---------- dados ----------
  const carregar = useCallback(async () => {
    if (!erp) { setErroCarga('A ponte com o Electron (window.parallelloCobranca) não foi encontrada. Veja o INTEGRAR-NO-PARALLELLO.md.'); return; }
    const n = ++carregamento.current;
    setCarregando(true); setErroCarga('');
    const dia = hojeISO(); setHoje(dia);
    try {
      const [erpDados, porDoc, porCli, whats, emails] = await Promise.all([
        erp.carregar(),
        nuvem.ultimosRegistrosPorDoc(),
        nuvem.ultimosRegistrosPorCliente(),
        nuvem.whatsappPorCliente(),
        nuvem.ultimoEmailPorCliente(),
      ]);
      if (n !== carregamento.current) return;
      setDadosErp(erpDados);
      setNuvemDados({
        porDoc, porCli,
        whats: new Map(whats.map((w) => [w.cliente_codigo, w])),
        emails: new Map(emails.map((e) => [e.cliente_codigo, e])),
      });
      // Em segundo plano: verificar pagos, cobrado recebido, ligações de hoje e pendências do ERP
      (async () => {
        try {
          const abertos = [...new Set(erpDados.titulos.map((t) => String(t.DocPag || '').trim()).filter(Boolean))];
          await nuvem.marcarPagos(abertos);
          const docs = await nuvem.documentosCobradosPagos();
          const cobrado = docs.length ? await erp.cobradoRecebido(docs) : { geral: 0, mes: 0 };
          const regsHoje = await nuvem.registrosDoDia(dia);
          const pend = await nuvem.registrosPendentesErp();
          if (n === carregamento.current) setExtras({ cobrado, regsHoje, pendentes: pend.length });
        } catch (e) {
          if (n === carregamento.current) avisar(`Alguns indicadores não carregaram: ${e.message}`, 'aviso');
        }
      })();
    } catch (e) {
      if (n === carregamento.current) setErroCarga(e.message || String(e));
    } finally {
      if (n === carregamento.current) setCarregando(false);
    }
  }, [erp, nuvem, avisar]);

  useEffect(() => { if (config && operador) carregar(); }, [config, operador, carregar]);

  const carteira = useMemo(() => {
    if (!dadosErp || !nuvemDados || !config) return null;
    const ultimoErp = new Map((dadosErp.ultimoHistoricoErp || []).map((h) => [h.cliente, h]));
    return processarCarteira({ linhas: dadosErp.titulos, hoje, config, registros: nuvemDados.porDoc, ultimoErpPorCliente: ultimoErp });
  }, [dadosErp, nuvemDados, config, hoje]);

  const ligacoesHoje = useMemo(() => (extras.regsHoje && config ? resumoLigacoes(extras.regsHoje, config.resultados).total : null), [extras.regsHoje, config]);
  const qtdAgendados = useMemo(() => (carteira ? agendadosHoje(carteira.titulos, hoje).length : 0), [carteira, hoje]);

  // Atualização otimista depois de registrar / protestar / enviar
  const aplicarRegistroLocal = useCallback((reg) => {
    setNuvemDados((nd) => {
      if (!nd) return nd;
      const doc = String(reg.documento).toUpperCase();
      const porDoc = nd.porDoc.filter((r) => String(r.documento).toUpperCase() !== doc).concat(reg);
      const porCli = nd.porCli.filter((r) => r.cliente_codigo !== reg.cliente_codigo).concat(reg);
      return { ...nd, porDoc, porCli };
    });
    setExtras((x) => ({ ...x, regsHoje: x.regsHoje ? [...x.regsHoje, reg] : x.regsHoje, pendentes: x.pendentes + (reg.erp_gravado ? 0 : 1) }));
  }, []);
  const aplicarProtestoLocal = useCallback((docPag) => {
    setDadosErp((d) => (d ? { ...d, titulos: d.titulos.map((t) => (String(t.DocPag).trim() === docPag ? { ...t, Protestado: 1 } : t)) } : d));
  }, []);
  const aplicarEnvioLocal = useCallback((tipo, codigo, subtipo) => {
    setNuvemDados((nd) => {
      if (!nd) return nd;
      if (tipo === 'whatsapp') {
        const whats = new Map(nd.whats);
        const w = whats.get(codigo) || { cliente_codigo: codigo, envios: 0 };
        whats.set(codigo, { ...w, envios: w.envios + 1, ultimo: new Date().toISOString() });
        return { ...nd, whats };
      }
      const emails = new Map(nd.emails);
      emails.set(codigo, { cliente_codigo: codigo, subtipo, criado_em: new Date().toISOString() });
      return { ...nd, emails };
    });
  }, []);

  const ctx = {
    nuvem, erp, config, salvarConfig, operador, usuario, hoje,
    dadosErp, nuvemDados, carteira, extras, ligacoesHoje, carregando, erroCarga,
    recarregar: carregar, aplicarRegistroLocal, aplicarProtestoLocal, aplicarEnvioLocal,
    empresaErp: dadosErp?.empresa || null,
    situacoes: dadosErp?.situacoes || [],
    irPara: setTela,
    setPendentes: (n) => setExtras((x) => ({ ...x, pendentes: n })),
  };

  // ---------- telas de estado ----------
  if (erroInicio) {
    return (
      <div className="cob cob-centro">
        <div className="cob-cartao-estado">
          <h2>Não foi possível abrir a Cobrança</h2>
          <p>{!online ? 'Sem internet. A Cobrança salva tudo na nuvem e precisa de conexão para funcionar.' : erroInicio}</p>
          <button type="button" className="cob-btn cob-btn-primario" onClick={carregarConfig}>Tentar de novo</button>
        </div>
      </div>
    );
  }
  if (!config) return <div className="cob cob-centro"><span className="cob-spin cob-spin-g" /> Abrindo a Cobrança…</div>;

  const senhaModal = pedindoSenha && (
    <PedirSenha titulo="Área do sistema" texto="Digite a senha do Parallello."
      onFechar={() => setPedindoSenha(false)}
      onConfirmar={async (s) => {
        const ok = await verificarSenhaParallello?.(s);
        if (ok) { setPedindoSenha(false); setAreaAberta(true); setTela('area'); }
        return ok;
      }} />
  );

  if (!operador && tela !== 'area') {
    return (
      <CobrancaCtx.Provider value={ctx}>
        <div className="cob">
          {!online && <div className="cob-offline">Sem internet — a Cobrança precisa de conexão para salvar na nuvem.</div>}
          <TelaPin onEntrar={definirOperador} areaAberta={areaAberta} abrirArea={() => setTela('area')} />
          {senhaModal}
        </div>
      </CobrancaCtx.Provider>
    );
  }

  const itens = [
    { id: 'painel', rotulo: 'Painel de cobrança', icone: 'painel' },
    { id: 'agendados', rotulo: 'Agendados hoje', icone: 'agenda', badge: qtdAgendados || null },
    { id: 'disparo', rotulo: `Disparo de lembretes`, icone: 'disparo' },
    { id: 'ligacoes', rotulo: 'Resumo de ligações', icone: 'ligacoes' },
  ];
  if (extras.pendentes > 0) itens.push({ id: 'pendencias', rotulo: 'Pendentes no ERP', icone: 'pendencia', badge: extras.pendentes, alerta: true });

  return (
    <CobrancaCtx.Provider value={ctx}>
      <div className="cob cob-layout">
        <nav className="cob-lateral" aria-label="Cobrança">
          <div className="cob-lateral-marca"><span className="cob-logo">R$</span><span className="cob-lateral-texto">Cobrança</span></div>
          {itens.map((i) => (
            <button key={i.id} type="button" className={`cob-lateral-item${tela === i.id ? ' ativo' : ''}${i.alerta ? ' alerta' : ''}`} onClick={() => setTela(i.id)} title={i.rotulo}>
              <Icone nome={i.icone} />
              <span className="cob-lateral-texto">{i.rotulo}</span>
              {i.badge ? <span className="cob-badge">{i.badge}</span> : null}
            </button>
          ))}
          {areaAberta && (
            <div className="cob-lateral-area">
              <button type="button" className={`cob-lateral-item${tela === 'area' ? ' ativo' : ''}`} onClick={() => setTela('area')} title="Área do sistema">
                <Icone nome="area" /><span className="cob-lateral-texto">Área do sistema</span>
              </button>
              <button type="button" className="cob-lateral-fechar cob-lateral-texto" onClick={() => { setAreaAberta(false); if (tela === 'area') setTela('painel'); }}>Fechar área</button>
            </div>
          )}
          <div className="cob-lateral-rodape">
            {operador ? (
              <button type="button" className="cob-lateral-item" onClick={() => { definirOperador(null); setTela('painel'); }} title="Trocar operador">
                <Icone nome="sair" />
                <span className="cob-lateral-texto"><small>Operador</small><br />{operador.nome}</span>
              </button>
            ) : null}
          </div>
        </nav>
        <main className="cob-conteudo">
          {!online && <div className="cob-offline">Sem internet — nada será salvo até a conexão voltar.</div>}
          {tela === 'painel' && <Painel />}
          {tela === 'agendados' && <TelaAgendados />}
          {tela === 'disparo' && <TelaDisparo />}
          {tela === 'ligacoes' && <TelaLigacoes />}
          {tela === 'pendencias' && <TelaPendencias />}
          {tela === 'area' && areaAberta && <AreaSistema onFechar={() => setTela(operador ? 'painel' : 'pin')} />}
        </main>
        {senhaModal}
      </div>
    </CobrancaCtx.Provider>
  );
}
