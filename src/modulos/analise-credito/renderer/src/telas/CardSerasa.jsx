import React, { useEffect, useMemo, useState } from 'react';
import { Gauge, RefreshCw, Loader2, AlertTriangle, ShieldAlert, History, FileWarning, Info, Lock } from 'lucide-react';
import { api, fmtMoeda, fmtNum, fmtData, fmtDataHora, lsGet } from '../util.js';

const FAIXAS_PADRAO = [
  { ate: 300, nome: 'Baixo', cor: '#d23c3c' },
  { ate: 500, nome: 'Regular', cor: '#e8a317' },
  { ate: 700, nome: 'Bom', cor: '#2b9a4a' },
  { ate: 1000, nome: 'Excelente', cor: '#1f7a3d' }
];

const faixaDe = (score, faixas) => {
  if (score === null || score === undefined) return null;
  const ord = [...faixas].sort((a, b) => a.ate - b.ate);
  return ord.find((f) => score <= Number(f.ate)) || ord[ord.length - 1];
};

const diasDesde = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
const textoIdade = (iso) => {
  const d = diasDesde(iso);
  return d <= 0 ? 'hoje' : d === 1 ? 'há 1 dia' : `há ${d} dias`;
};

// ---------- Medidor em meia-lua (0 a 1000)
function Medidor({ score, faixas }) {
  const cx = 150, cy = 140, r = 110, esp = 22;
  const ang = (v) => Math.PI - (Math.max(0, Math.min(1000, v)) / 1000) * Math.PI;
  const ponto = (v, raio) => [cx + raio * Math.cos(ang(v)), cy - raio * Math.sin(ang(v))];
  const ord = [...faixas].sort((a, b) => a.ate - b.ate);
  let ini = 0;
  const arcos = ord.map((f) => {
    const fim = Math.min(1000, Number(f.ate));
    const [x1, y1] = ponto(ini + (ini ? 6 : 0), r);
    const [x2, y2] = ponto(fim - (fim < 1000 ? 6 : 0), r);
    const d = `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
    const a = { d, cor: f.cor, ativo: score !== null && score > ini - 1 && score <= fim };
    ini = fim;
    return a;
  });
  const temScore = score !== null && score !== undefined;
  const [mx, my] = temScore ? ponto(score, r) : [cx, cy];
  const f = faixaDe(score, faixas);
  return (
    <svg viewBox="0 0 300 175" className="medidor" role="img" aria-label={temScore ? `Score ${score}` : 'Sem consulta'}>
      {arcos.map((a, i) => (
        <path key={i} d={a.d} fill="none" stroke={a.cor} strokeWidth={esp} strokeLinecap="round" opacity={!temScore || a.ativo ? 1 : 0.28} />
      ))}
      {temScore && (
        <g className="marcador">
          <circle cx={mx} cy={my} r="13" fill="#fff" stroke="#172033" strokeWidth="4" />
          <circle cx={mx} cy={my} r="5" fill={f?.cor || '#172033'} />
        </g>
      )}
      <text x={cx - r} y={cy + 30} textAnchor="middle" className="medidor-lim">0</text>
      <text x={cx + r} y={cy + 30} textAnchor="middle" className="medidor-lim">1000</text>
      <text x={cx} y={cy - 18} textAnchor="middle" className="medidor-num">{temScore ? fmtNum(score) : '—'}</text>
      <text x={cx} y={cy + 6} textAnchor="middle" className="medidor-faixa" fill={f?.cor || '#7a8599'}>{f ? f.nome : 'sem consulta'}</text>
    </svg>
  );
}

// ---------- Evolução do score (consultas salvas)
function Evolucao({ consultas, faixas }) {
  const pontos = consultas.filter((c) => c.score !== null && c.score !== undefined).slice().reverse();
  if (pontos.length < 2) {
    return <div className="evolucao-vazia"><History size={18} />O gráfico de evolução aparece a partir da 2ª consulta.</div>;
  }
  const W = 420, H = 170, m = { l: 34, r: 12, t: 10, b: 24 };
  const t0 = new Date(pontos[0].data).getTime();
  const t1 = new Date(pontos[pontos.length - 1].data).getTime();
  const x = (d) => m.l + ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - m.l - m.r);
  const y = (v) => m.t + (1 - v / 1000) * (H - m.t - m.b);
  const ord = [...faixas].sort((a, b) => a.ate - b.ate);
  let ini = 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="evolucao">
      {ord.map((f, i) => {
        const fim = Math.min(1000, Number(f.ate));
        const r = <rect key={i} x={m.l} y={y(fim)} width={W - m.l - m.r} height={y(ini) - y(fim)} fill={f.cor} opacity="0.07" />;
        ini = fim;
        return r;
      })}
      {[0, 250, 500, 750, 1000].map((v) => (
        <g key={v}>
          <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="#e4e8ef" />
          <text x={m.l - 6} y={y(v) + 4} textAnchor="end" className="ev-eixo">{v}</text>
        </g>
      ))}
      <polyline fill="none" stroke="#2457c5" strokeWidth="2.5" strokeLinejoin="round"
        points={pontos.map((p) => `${x(p.data)},${y(p.score)}`).join(' ')} />
      {pontos.map((p, i) => (
        <g key={p.id}>
          <circle cx={x(p.data)} cy={y(p.score)} r="4.5" fill="#fff" stroke={faixaDe(p.score, faixas)?.cor || '#2457c5'} strokeWidth="2.5">
            <title>{`${fmtData(p.data)}: ${p.score}`}</title>
          </circle>
          {(i === 0 || i === pontos.length - 1) && (
            <text x={x(p.data)} y={H - 6} textAnchor={i === 0 ? 'start' : 'end'} className="ev-eixo">{fmtData(p.data)}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

// cliente = { ClienteID, Nome } (ficha) — ou documento = CPF/CNPJ só com dígitos (consulta avulsa)
export default function CardSerasa({ cliente, documento: documentoDireto, conexaoId, onUltima, onConsultou }) {
  const chave = cliente?.ClienteID || documentoDireto;
  const alvo = cliente ? cliente.ClienteID : { documento: documentoDireto };
  const [status, setStatus] = useState(null);
  const [consultas, setConsultas] = useState([]);
  const [documento, setDocumento] = useState(null);
  const [erroDoc, setErroDoc] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [confirmando, setConfirmando] = useState(null); // { forcar }

  const carregar = async () => {
    try {
      const [st, lista] = await Promise.all([api.serasaStatus(), api.serasaConsultas(alvo)]);
      setStatus(st); setConsultas(lista);
    } catch (e) { setErro(e.message); }
  };

  useEffect(() => {
    setErro(''); setAviso(''); setDocumento(null); setErroDoc('');
    carregar();
    api.serasaDocumento(alvo).then(setDocumento).catch((e) => setErroDoc(e.message));
  }, [chave, conexaoId]);

  const ultima = consultas[0] || null;
  useEffect(() => { onUltima?.(ultima); }, [ultima?.id]);

  const faixas = status?.faixas?.length ? status.faixas : FAIXAS_PADRAO;
  const dentroValidade = ultima && status?.validadeDias > 0 && diasDesde(ultima.data) < status.validadeDias;
  const docInvalido = documento && documento.tipo === 'OUTRO';

  const pedirConsulta = (forcar) => {
    setErro(''); setAviso('');
    const vaiCobrar = !status.modoDemo && (forcar || !dentroValidade);
    if (vaiCobrar && status.confirmar) setConfirmando({ forcar });
    else executar(forcar);
  };

  const executar = async (forcar) => {
    setConfirmando(null); setCarregando(true);
    try {
      const r = await api.serasaConsultar({
        codigo: cliente?.ClienteID, documento: cliente ? undefined : documentoDireto, nome: cliente?.Nome, forcar, responsavel: lsGet('ac.responsavel', '')
      });
      if (r.cache) setAviso(`Mostrando a consulta de ${fmtDataHora(r.consulta.data)} (dentro da validade de ${status.validadeDias} dias, sem nova cobrança).`);
      await carregar();
      onConsultou?.(r.consulta);
    } catch (e) { setErro(e.message); }
    finally { setCarregando(false); }
  };

  const f = ultima ? faixaDe(ultima.score, faixas) : null;
  const restam = status?.limiteMensal > 0 ? Math.max(0, status.limiteMensal - status.consultasMes) : null;

  return (
    <div className="card serasa">
      <div className="serasa-cab">
        <h3><Gauge size={16} /> Score Serasa
          {status?.modoDemo && <span className="selo-demo">demonstração</span>}
          {status && !status.modoDemo && status.configurada && status.ambiente === 'homologacao' && <span className="selo-demo">homologação</span>}
        </h3>
        <div className="serasa-acoes">
          {documento && !docInvalido && <span className="doc">{documento.tipo} {documento.formatado}</span>}
          {status?.disponivel && (
            ultima && dentroValidade
              ? <button className="btn" onClick={() => pedirConsulta(true)} disabled={carregando || docInvalido} title="Faz uma nova consulta na Serasa">
                  {carregando ? <Loader2 size={15} className="gira" /> : <RefreshCw size={15} />}Consultar novamente
                </button>
              : <button className="btn primario" onClick={() => pedirConsulta(false)} disabled={carregando || docInvalido || !!erroDoc}>
                  {carregando ? <Loader2 size={15} className="gira" /> : <Gauge size={15} />}Consultar score
                </button>
          )}
        </div>
      </div>

      {status && !status.disponivel && (
        <div className="serasa-off"><Lock size={18} />
          <div><b>Integração Serasa não configurada para esta conexão.</b>
            <p className="muted pequeno">O administrador configura a API no Ctrl+Shift+B › Serasa (API).</p></div>
        </div>
      )}
      {erroDoc && <div className="erro">{erroDoc}</div>}
      {docInvalido && (
        <div className="serasa-aviso"><Info size={15} />Documento "{documento.bruto}"{documento.tipoBruto ? ` (tipo ${documento.tipoBruto})` : ''} não é CPF nem CNPJ — cliente do exterior não pode ser consultado na Serasa.</div>
      )}
      {erro && <div className="erro">{erro}</div>}
      {aviso && <div className="serasa-aviso"><Info size={15} />{aviso}</div>}

      {confirmando && (
        <div className="serasa-confirma">
          <AlertTriangle size={18} />
          <div>
            <b>Confirmar consulta na Serasa?</b>
            <p>Esta consulta pode ser cobrada conforme o contrato da empresa.{restam !== null ? ` Restam ${restam} de ${status.limiteMensal} consultas neste mês.` : ''}</p>
          </div>
          <button className="btn" onClick={() => setConfirmando(null)}>Cancelar</button>
          <button className="btn primario" onClick={() => executar(confirmando.forcar)}>Consultar</button>
        </div>
      )}

      {status?.disponivel && (
        <div className="serasa-corpo">
          <div className="serasa-medidor">
            <Medidor score={ultima ? ultima.score : null} faixas={faixas} />
            <div className="faixas-legenda">
              {[...faixas].sort((a, b) => a.ate - b.ate).map((fx, i, arr) => (
                <span key={fx.nome + i} className={f?.nome === fx.nome ? 'ativa' : ''}>
                  <i style={{ background: fx.cor }} />{fx.nome} <small>{i === 0 ? 0 : Number(arr[i - 1].ate) + 1}–{fx.ate}</small>
                </span>
              ))}
            </div>
            <p className="muted pequeno centro-txt">
              {ultima ? <>Consultado {textoIdade(ultima.data)} · {fmtDataHora(ultima.data)}{ultima.mensagem ? <><br />{ultima.mensagem}</> : null}</> : (cliente ? 'Nenhuma consulta realizada para este cliente.' : 'Nenhuma consulta realizada para este documento.')}
            </p>
          </div>

          <div className="serasa-evolucao">
            <h4>Evolução do score</h4>
            <Evolucao consultas={consultas} faixas={faixas} />
            {restam !== null && <p className="muted pequeno">Consultas no mês: {status.consultasMes} de {status.limiteMensal}</p>}
          </div>

          <div className="serasa-pend">
            <h4>Pendências</h4>
            {!ultima ? <p className="muted pequeno">Consulte o score para ver as pendências.</p> : (
              <>
                <div className="pend-resumo">
                  <div><span>Valor em pendências</span><b className={ultima.valorPendencias ? 'txt-neg' : ''}>{ultima.valorPendencias != null ? fmtMoeda(ultima.valorPendencias) : '—'}</b></div>
                  <div><span>Protestos</span><b className={ultima.qtdProtestos ? 'txt-neg' : ''}>{ultima.qtdProtestos != null ? fmtNum(ultima.qtdProtestos) : '—'}</b></div>
                </div>
                {ultima.pendencias?.length ? (
                  <div className="pend-lista">
                    {ultima.pendencias.map((p, i) => (
                      <div key={i} className="pend-item">
                        <FileWarning size={15} />
                        <div><b>{p.descricao || 'Pendência'}</b><small>{[p.credor, p.data ? fmtData(p.data) : null].filter(Boolean).join(' · ')}</small></div>
                        <span>{p.valor != null ? fmtMoeda(p.valor) : ''}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="ok-txt"><ShieldAlert size={15} />Nenhuma pendência retornada.</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
