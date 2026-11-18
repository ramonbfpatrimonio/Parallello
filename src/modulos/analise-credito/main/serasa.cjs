// =====================================================================
// INTEGRAÇÃO SERASA (ou outro birô) — configurável por conexão
//
// A documentação da API da Serasa só é liberada com contrato, então tudo
// que muda de contrato para contrato é configurável no Ctrl+Shift+B:
//   - autenticação OAuth2 (client credentials) — URL, envio e caminho do token
//   - consulta — método, URL e corpo com marcadores {documento} {tipo} {produto}
//   - mapeamento — em que campo do JSON de retorno vêm score, pendências etc.
// Modo demonstração gera dados fictícios para mostrar o card sem contrato.
// =====================================================================

// fetch do Electron respeita o proxy do Windows; fora do Electron usa o do Node
function obterFetch() {
  try {
    const { net } = require('electron');
    if (net && typeof net.fetch === 'function') return net.fetch.bind(net);
  } catch { /* fora do Electron */ }
  return globalThis.fetch;
}

const CONFIG_PADRAO = {
  ativo: false,
  modoDemo: false,
  ambiente: 'homologacao',
  auth: {
    tipo: 'oauth2',             // 'oauth2' | 'nenhuma'
    url: '',
    envio: 'basic',             // 'basic' | 'form' | 'json'
    clientId: '',
    escopo: '',
    caminhoToken: 'access_token|accessToken',
    caminhoExpira: 'expires_in|expiresIn'
  },
  consulta: {
    metodo: 'POST',
    url: '',
    corpo: '{\n  "documento": "{documento}",\n  "tipoDocumento": "{tipo}",\n  "produto": "{produto}"\n}',
    produto: '',
    cabecalhos: ''              // JSON opcional com cabeçalhos extras
  },
  documento: { coluna: 'NroInsc', colunaTipo: '' },
  mapa: {
    score: 'score',
    faixa: '',
    mensagem: '',
    pendencias: '',             // caminho da LISTA de pendências
    pendenciaDescricao: 'descricao',
    pendenciaValor: 'valor',
    pendenciaData: 'data',
    pendenciaCredor: 'credor',
    valorPendencias: '',
    qtdProtestos: ''
  },
  custo: { validadeDias: 30, confirmar: true, limiteMensal: 0 },
  faixas: [
    { ate: 300, nome: 'Baixo', cor: '#d23c3c' },
    { ate: 500, nome: 'Regular', cor: '#e8a317' },
    { ate: 700, nome: 'Bom', cor: '#2b9a4a' },
    { ate: 1000, nome: 'Excelente', cor: '#1f7a3d' }
  ]
};

const clone = (o) => JSON.parse(JSON.stringify(o));

function mesclarPadrao(cfg) {
  const base = clone(CONFIG_PADRAO);
  if (!cfg) return base;
  const r = { ...base, ...cfg };
  for (const k of ['auth', 'consulta', 'documento', 'mapa', 'custo']) r[k] = { ...base[k], ...(cfg[k] || {}) };
  r.faixas = Array.isArray(cfg.faixas) && cfg.faixas.length ? cfg.faixas : base.faixas;
  return r;
}

// ---------- Documento (NroInsc guarda CPF, CNPJ e documentos estrangeiros)
function classificarDocumento(bruto, tipoBruto) {
  const texto = String(bruto ?? '').trim();
  const digitos = texto.replace(/\D/g, '');
  let tipo = 'OUTRO';
  if (digitos.length === 14 && cnpjValido(digitos)) tipo = 'CNPJ';
  else if (digitos.length === 11 && cpfValido(digitos)) tipo = 'CPF';
  return { bruto: texto, digitos, tipo, tipoBruto: tipoBruto == null ? '' : String(tipoBruto).trim(), formatado: formatarDocumento(digitos, tipo) };
}

function cpfValido(c) {
  if (/^(\d)\1{10}$/.test(c)) return false;
  const dv = (n) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

function cnpjValido(c) {
  if (/^(\d)\1{13}$/.test(c)) return false;
  const dv = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((acc, p, i) => acc + Number(c[i]) * p, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}

function formatarDocumento(d, tipo) {
  if (tipo === 'CNPJ') return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (tipo === 'CPF') return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return d;
}

// ---------- Leitura de campos do JSON: "dados.score", "itens[0].valor", "a|b" (alternativas)
function lerCaminho(obj, caminho) {
  if (!caminho) return undefined;
  for (const alt of String(caminho).split('|').map((s) => s.trim()).filter(Boolean)) {
    let atual = obj;
    for (const parte of alt.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)) {
      if (atual == null) break;
      atual = atual[parte];
    }
    if (atual !== undefined && atual !== null) return atual;
  }
  return undefined;
}

const numero = (v) => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return isNaN(n) ? null : n;
};

function extrair(json, mapa) {
  const lista = lerCaminho(json, mapa.pendencias);
  const pendencias = Array.isArray(lista)
    ? lista.map((p) => ({
        descricao: String(lerCaminho(p, mapa.pendenciaDescricao) ?? ''),
        valor: numero(lerCaminho(p, mapa.pendenciaValor)),
        data: lerCaminho(p, mapa.pendenciaData) ?? null,
        credor: String(lerCaminho(p, mapa.pendenciaCredor) ?? '')
      }))
    : [];
  const valorPend = numero(lerCaminho(json, mapa.valorPendencias));
  return {
    score: numero(lerCaminho(json, mapa.score)),
    faixa: lerCaminho(json, mapa.faixa) ?? null,
    mensagem: lerCaminho(json, mapa.mensagem) ?? null,
    pendencias,
    valorPendencias: valorPend ?? (pendencias.length ? pendencias.reduce((s, p) => s + (p.valor || 0), 0) : null),
    qtdProtestos: numero(lerCaminho(json, mapa.qtdProtestos))
  };
}

// ---------- Marcadores {documento} {tipo} {produto}
function aplicarMarcadores(texto, valores, modo) {
  return String(texto || '').replace(/\{(documento|tipo|produto)\}/g, (_, k) => {
    const v = String(valores[k] ?? '');
    if (modo === 'url') return encodeURIComponent(v);
    if (modo === 'json') return JSON.stringify(v).slice(1, -1);
    return v;
  });
}

// ---------- HTTP
async function requisicao(url, opcoes, timeoutMs = 30000) {
  const f = obterFetch();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const inicio = Date.now();
  try {
    const r = await f(url, { ...opcoes, signal: ctrl.signal });
    const texto = await r.text();
    let json = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { /* não é JSON */ }
    return { status: r.status, ok: r.ok, texto, json, ms: Date.now() - inicio };
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`Tempo esgotado ao chamar ${url}`);
    throw new Error(`Falha de rede ao chamar ${url}: ${e.message}`);
  } finally { clearTimeout(t); }
}

const erroHttp = (etapa, r) => {
  const corpo = (r.texto || '').slice(0, 400);
  return new Error(`${etapa} retornou HTTP ${r.status}${corpo ? ` — ${corpo}` : ''}`);
};

// cache de token em memória por conexão
const tokens = new Map();

async function obterToken(chave, cfg, secret) {
  const a = cfg.auth;
  if (a.tipo === 'nenhuma') return null;
  if (!a.url) throw new Error('URL de autenticação não configurada.');
  if (!a.clientId || !secret) throw new Error('Client ID ou Client Secret não configurados.');
  const guardado = tokens.get(chave);
  if (guardado && guardado.expira > Date.now() + 30000) return guardado.token;

  const headers = { Accept: 'application/json' };
  let body;
  if (a.envio === 'json') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({ grant_type: 'client_credentials', client_id: a.clientId, client_secret: secret, ...(a.escopo ? { scope: a.escopo } : {}) });
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    const p = new URLSearchParams({ grant_type: 'client_credentials' });
    if (a.escopo) p.set('scope', a.escopo);
    if (a.envio === 'form') { p.set('client_id', a.clientId); p.set('client_secret', secret); }
    else headers.Authorization = `Basic ${Buffer.from(`${a.clientId}:${secret}`).toString('base64')}`;
    body = p.toString();
  }
  const r = await requisicao(a.url, { method: 'POST', headers, body });
  if (!r.ok) throw erroHttp('Autenticação', r);
  const token = lerCaminho(r.json || {}, a.caminhoToken);
  if (!token) throw new Error(`Autenticação OK, mas o token não foi encontrado em "${a.caminhoToken}". Retorno: ${(r.texto || '').slice(0, 300)}`);
  const exp = numero(lerCaminho(r.json || {}, a.caminhoExpira)) || 300;
  tokens.set(chave, { token: String(token), expira: Date.now() + exp * 1000 });
  return String(token);
}

async function chamarApi(chave, cfg, secret, doc) {
  const c = cfg.consulta;
  if (!c.url) throw new Error('URL de consulta não configurada.');
  const token = await obterToken(chave, cfg, secret);
  const valores = { documento: doc.digitos, tipo: doc.tipo, produto: c.produto };
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (c.cabecalhos && c.cabecalhos.trim()) {
    let extra;
    try { extra = JSON.parse(aplicarMarcadores(c.cabecalhos, valores, 'json')); }
    catch { throw new Error('Cabeçalhos extras: JSON inválido.'); }
    Object.assign(headers, extra);
  }
  const opcoes = { method: c.metodo || 'POST', headers };
  if (opcoes.method !== 'GET' && c.corpo && c.corpo.trim()) {
    const corpo = aplicarMarcadores(c.corpo, valores, 'json');
    try { JSON.parse(corpo); } catch { throw new Error('Corpo da consulta: JSON inválido.'); }
    headers['Content-Type'] = 'application/json';
    opcoes.body = corpo;
  }
  const r = await requisicao(aplicarMarcadores(c.url, valores, 'url'), opcoes, 45000);
  if (r.status === 401) tokens.delete(chave);
  if (!r.ok) throw erroHttp('Consulta', r);
  if (!r.json) throw new Error(`A consulta não retornou JSON. Retorno: ${(r.texto || '').slice(0, 300)}`);
  return { json: r.json, ms: r.ms };
}

// ---------- Modo demonstração (dados fictícios e estáveis por documento)
function demo(doc, quando = new Date()) {
  let h = 0;
  for (const ch of doc.digitos) h = (h * 31 + Number(ch)) % 100003;
  const base = 180 + (h % 760);
  const variacao = Math.round(Math.sin(quando.getTime() / 86400000 / 9 + h) * 45);
  const score = Math.max(0, Math.min(1000, base + variacao));
  const pendencias = score < 400 ? [
    { descricao: 'Dívida vencida (demonstração)', valor: 1840.5, data: '2026-08-14', credor: 'Fornecedor Exemplo Ltda' },
    { descricao: 'Protesto em cartório (demonstração)', valor: 3200, data: '2026-05-02', credor: '1º Tabelionato de Protesto' }
  ] : [];
  return {
    json: { demonstracao: true, documento: doc.digitos, score, pendencias, protestos: score < 400 ? 1 : 0 },
    extraido: {
      score, faixa: null, mensagem: 'Dados fictícios — modo demonstração', pendencias,
      valorPendencias: pendencias.reduce((s, p) => s + p.valor, 0) || null, qtdProtestos: score < 400 ? 1 : 0
    },
    ms: 300
  };
}

function faixaDoScore(score, faixas) {
  if (score === null || score === undefined) return null;
  const ord = [...faixas].sort((a, b) => a.ate - b.ate);
  return ord.find((f) => score <= Number(f.ate)) || ord[ord.length - 1];
}

module.exports = {
  CONFIG_PADRAO, mesclarPadrao, classificarDocumento, lerCaminho, extrair,
  aplicarMarcadores, obterToken, chamarApi, demo, faixaDoScore, tokens
};
