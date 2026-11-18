import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Gauge, X, Search, Loader2, History, User, FileText } from 'lucide-react';
import { api, fmtDataHora, fmtNum } from '../util.js';
import CardSerasa from './CardSerasa.jsx';

const soDigitos = (t) => String(t || '').replace(/\D/g, '');
const formatarDoc = (d) => (d.length === 14
  ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : d);

// Janela de consulta avulsa do Score Serasa (botão na tela Análise de Crédito).
// Aceita o código do cliente no ERP ou um CPF/CNPJ digitado, e mostra o histórico de consultas.
export default function ConsultaSerasa({ conexaoId, onFechar }) {
  const [entrada, setEntrada] = useState('');
  const [alvo, setAlvo] = useState(null); // { cliente: {ClienteID, Nome} } | { documento }
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState('');
  const [historico, setHistorico] = useState([]);
  const [filtroHist, setFiltroHist] = useState('');
  const campo = useRef(null);

  const carregarHistorico = () => api.serasaHistorico().then(setHistorico).catch(() => setHistorico([]));
  useEffect(() => { carregarHistorico(); campo.current?.focus(); }, [conexaoId]);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFechar]);

  const buscar = async (e) => {
    e?.preventDefault();
    setErro('');
    const texto = entrada.trim();
    if (!texto) return;
    const dig = soDigitos(texto);
    // 11 ou 14 dígitos = CPF/CNPJ; até 6 caracteres = código do cliente
    if (dig.length === 11 || dig.length === 14) { setAlvo({ documento: dig }); return; }
    if (texto.length > 6) { setErro('Informe o código do cliente ou um CPF (11 dígitos) / CNPJ (14 dígitos).'); return; }
    setBuscando(true);
    try {
      const doc = await api.serasaDocumento(texto);
      setAlvo({ cliente: { ClienteID: texto.padStart(5, '0'), Nome: doc.nome || '' } });
    } catch (err) { setErro(err.message); setAlvo(null); }
    finally { setBuscando(false); }
  };

  const abrirDoHistorico = (c) => {
    setErro('');
    if (c.codigo) { setEntrada(c.codigo); setAlvo({ cliente: { ClienteID: c.codigo, Nome: c.nome || '' } }); }
    else { setEntrada(formatarDoc(c.documento || '')); setAlvo({ documento: c.documento }); }
  };

  const histFiltrado = useMemo(() => {
    const t = filtroHist.trim().toLowerCase();
    const td = soDigitos(t);
    return historico.filter((c) => !t
      || (c.codigo || '').toLowerCase().includes(t)
      || (c.nome || '').toLowerCase().includes(t)
      || (c.responsavel || '').toLowerCase().includes(t)
      || (td && (c.documento || '').includes(td)));
  }, [historico, filtroHist]);

  const chaveAlvo = alvo ? (alvo.cliente ? `c${alvo.cliente.ClienteID}` : `d${alvo.documento}`) : '';
  const titulo = alvo?.cliente
    ? <><User size={15} />{alvo.cliente.ClienteID}{alvo.cliente.Nome ? ` · ${alvo.cliente.Nome}` : ''}</>
    : alvo ? <><FileText size={15} />{formatarDoc(alvo.documento)} <span className="muted pequeno">(documento sem cliente vinculado)</span></> : null;

  return (
    <div className="modal-fundo" onMouseDown={onFechar}>
      <div className="modal grande consulta-serasa" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Consulta Score Serasa">
        <div className="cs-cab">
          <h3><Gauge size={18} /> Consulta Score Serasa</h3>
          <button className="btn-x fechar" onClick={onFechar} title="Fechar (Esc)"><X size={18} /></button>
        </div>

        <form className="cs-busca" onSubmit={buscar}>
          <label>Cliente (código) ou CPF/CNPJ
            <input ref={campo} value={entrada} onChange={(e) => setEntrada(e.target.value)} placeholder="Ex.: 01916 ou 11.222.333/0001-81" />
          </label>
          <button className="btn primario" disabled={buscando || !entrada.trim()}>
            {buscando ? <Loader2 size={15} className="gira" /> : <Search size={15} />}Buscar
          </button>
        </form>
        {erro && <div className="erro">{erro}</div>}

        <div className="cs-corpo">
          {alvo ? (
            <div className="cs-alvo">
              <div className="cs-alvo-tit">{titulo}</div>
              <CardSerasa key={chaveAlvo} conexaoId={conexaoId}
                cliente={alvo.cliente} documento={alvo.cliente ? undefined : alvo.documento}
                onConsultou={carregarHistorico} />
            </div>
          ) : (
            <div className="cs-dica"><Gauge size={22} />
              <div><b>Informe um cliente ou documento</b>
                <p className="muted pequeno">Digite o código do cliente no ERP ou um CPF/CNPJ e clique em Buscar. Uma consulta recente é reaproveitada sem nova cobrança, conforme a validade configurada.</p></div>
            </div>
          )}

          <div className="cs-hist">
            <div className="cs-hist-cab">
              <h4><History size={15} /> Histórico de consultas <span className="muted pequeno">({fmtNum(historico.length)})</span></h4>
              <div className="busca pequena"><Search size={14} /><input value={filtroHist} onChange={(e) => setFiltroHist(e.target.value)} placeholder="Filtrar por código, nome, documento ou responsável…" /></div>
            </div>
            <div className="tabela-wrap cs-hist-tab">
              <table className="tabela">
                <thead><tr><th>Data</th><th>Cliente / documento</th><th className="num">Score</th><th>Faixa</th><th>Responsável</th><th>Origem</th></tr></thead>
                <tbody>
                  {histFiltrado.map((c) => (
                    <tr key={c.id} className="clicavel" onClick={() => abrirDoHistorico(c)} title="Abrir esta consulta">
                      <td>{fmtDataHora(c.data)}</td>
                      <td>{c.codigo ? <><b>{c.codigo}</b> {c.nome}</> : <span className="muted">Sem cliente vinculado</span>}<small className="muted bloco-txt">{c.tipoDocumento} {formatarDoc(c.documento || '')}</small></td>
                      <td className="num forte">{c.score ?? '—'}</td>
                      <td>{c.faixa || '—'}</td>
                      <td>{c.responsavel || c.usuarioWindows || '—'}</td>
                      <td>{c.origem === 'demo' ? 'Demonstração' : c.ambiente === 'homologacao' ? 'Homologação' : 'Serasa'}</td>
                    </tr>
                  ))}
                  {!histFiltrado.length && <tr><td colSpan={6} className="muted centro-txt">Nenhuma consulta registrada nesta conexão.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
