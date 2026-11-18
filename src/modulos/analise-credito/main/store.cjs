// Armazenamento local em JSON (pasta do módulo no Parallello), sem nuvem.
// As conexões são as do Parallello (ctx.conexoes); aqui só fica guardada qual está em uso neste computador.
const { safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { REGRAS_PADRAO } = require('./regrasPadrao.cjs');
const serasa = require('./serasa.cjs');

let pastaDados = null;
let fonte = null; // { listar(), senha(id) } do Parallello
function configurar({ pasta, conexoes }) {
  pastaDados = pasta;
  fonte = conexoes;
}

function pasta() {
  const dir = path.join(pastaDados, 'dados');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ler(nome, padrao) {
  try {
    const arq = path.join(pasta(), nome);
    if (!fs.existsSync(arq)) return padrao;
    return JSON.parse(fs.readFileSync(arq, 'utf8'));
  } catch {
    return padrao;
  }
}

function gravar(nome, dados) {
  const arq = path.join(pasta(), nome);
  const tmp = arq + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2), 'utf8');
  fs.renameSync(tmp, arq);
}

const clone = (o) => JSON.parse(JSON.stringify(o));
const novoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// ---------- Senhas (criptografadas pelo Windows quando disponível)
function cifrar(senha) {
  if (!senha) return { senhaCript: '', senhaTexto: '' };
  if (safeStorage.isEncryptionAvailable()) return { senhaCript: safeStorage.encryptString(senha).toString('base64') };
  return { senhaTexto: senha };
}
function decifrar(c) {
  if (c.senhaCript) {
    try { return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(c.senhaCript, 'base64')) : ''; }
    catch { return ''; }
  }
  return c.senhaTexto || '';
}

// ---------- Conexões (as do Parallello; uma em uso neste computador)
const NA_PARALLELLO = 'As conexões com o banco ficam no Parallello: Ctrl+Shift+B na tela inicial (Configuração > Conexão com o banco).';
const servidorDe = (p) => (p.instancia && !p.porta ? `${p.servidor}\\${p.instancia}` : p.servidor);

async function lerConexoes() {
  const ativaSalva = ler('conexao-ativa.json', {}).ativa || null;
  const lista = (await fonte.listar()).map((p) => ({
    id: p.id,
    nome: p.cliente ? `${p.cliente} › ${p.nome}` : p.nome,
    servidor: servidorDe(p),
    porta: p.porta || '',
    banco: p.banco,
    usuario: p.usuario,
    criptografar: !!p.criptografar,
  }));
  const ativa = lista.find((c) => c.id === ativaSalva) ? ativaSalva : lista[0]?.id || null;
  return { ativa, lista };
}

const publica = (c, ativa) => ({ ...c, ativa: c.id === ativa });

async function listarConexoes() {
  const d = await lerConexoes();
  return d.lista.map((c) => publica(c, d.ativa));
}

// conexão completa (com senha) — só usada no processo principal
async function getConexao(id) {
  const d = await lerConexoes();
  const c = d.lista.find((x) => x.id === (id || d.ativa));
  if (!c) return null;
  return { ...publica(c, d.ativa), senha: await fonte.senha(c.id) };
}

function salvarConexao() { throw new Error(NA_PARALLELLO); }
function excluirConexao() { throw new Error(NA_PARALLELLO); }

async function ativarConexao(id) {
  const d = await lerConexoes();
  if (!d.lista.find((x) => x.id === id)) throw new Error('Conexão não encontrada.');
  gravar('conexao-ativa.json', { ativa: id });
  return true;
}

// ---------- Regras do score
function getRegras() {
  const salvas = ler('regras.json', null);
  if (!salvas) return clone(REGRAS_PADRAO);
  const r = { ...clone(REGRAS_PADRAO), ...salvas };
  // garante critérios novos e atualiza as descrições (versão 1.4: score pelo histórico completo)
  for (const c of REGRAS_PADRAO.criterios) {
    const existente = r.criterios.find((x) => x.id === c.id);
    if (!existente) r.criterios.push(clone(c));
    else existente.descricao = c.descricao;
  }
  if (!Array.isArray(r.grupos) || !r.grupos.length) r.grupos = clone(REGRAS_PADRAO.grupos);
  r.alertas = { ...clone(REGRAS_PADRAO.alertas), ...(salvas.alertas || {}) };
  r.limitePeriodo = { ...clone(REGRAS_PADRAO.limitePeriodo), ...(salvas.limitePeriodo || {}) };
  if (r.mesesHistoricoAtraso === undefined || r.mesesHistoricoAtraso === null || r.mesesHistoricoAtraso === '') {
    r.mesesHistoricoAtraso = REGRAS_PADRAO.mesesHistoricoAtraso;
  }
  r.versao = REGRAS_PADRAO.versao;
  return r;
}
function salvarRegras(r) {
  const { calculo, ...resto } = r || {};
  gravar('regras.json', resto);
  return getRegras();
}

// ---------- Configuração geral (guia "Configuração" da Área do sistema)
const CONFIG_PADRAO = {
  calculo: {
    abaterRetornos: true,   // abate devoluções (vendas do período e vendas por mês)
    somarST: true           // soma o ICMS-ST do item (ICMSFItem) — @AbaterST do script
  },
  eventos: {
    ativo: false,          // gera eventos de sistema no ERP
    obrigatorio: true,     // se o evento falhar, a operação não é feita
    modelo: ''             // INSERT INTO ... VALUES (@Data, @Usuario, ...) — ajustar à tabela de eventos do ERP
  },
  limite: {
    regraPadrao: 2,         // @RegraAplicar: 1 = pelo período (matemática), 2 = pelo score
    permitirAplicar: true   // mostra o botão "Aplicar no ERP" nas decisões
  }
};
function getConfiguracao() {
  const salva = ler('configuracao.json', null);
  // aproveita o que foi salvo na 1.4.1 (que guardava isso nas regras)
  const antiga = salva ? null : (ler('regras.json', {}) || {}).calculo;
  const base = salva || (antiga ? { calculo: antiga } : {});
  return {
    ...clone(CONFIG_PADRAO), ...base,
    calculo: { ...CONFIG_PADRAO.calculo, ...(base.calculo || {}) },
    limite: { ...CONFIG_PADRAO.limite, ...(base.limite || {}) },
    eventos: { ...CONFIG_PADRAO.eventos, ...(base.eventos || {}) }
  };
}
function salvarConfiguracao(c) {
  const atual = getConfiguracao();
  const nova = {
    ...atual, ...c,
    calculo: { ...atual.calculo, ...((c && c.calculo) || {}) },
    limite: { ...atual.limite, ...((c && c.limite) || {}) },
    eventos: { ...atual.eventos, ...((c && c.eventos) || {}) }
  };
  gravar('configuracao.json', nova);
  return nova;
}
function regrasPadrao() { return clone(REGRAS_PADRAO); }

// ---------- Decisões de crédito (vinculadas à conexão em que foram feitas)
function listarDecisoes() { return ler('decisoes.json', []); }
function salvarDecisao(d) {
  const lista = listarDecisoes();
  const item = { ...d, id: d.id || novoId(), data: d.data || new Date().toISOString() };
  const i = lista.findIndex((x) => x.id === item.id);
  if (i >= 0) lista[i] = item; else lista.unshift(item);
  gravar('decisoes.json', lista);
  return item;
}
function obterDecisao(id) { return listarDecisoes().find((x) => x.id === id) || null; }
function excluirDecisao(id) {
  gravar('decisoes.json', listarDecisoes().filter((x) => x.id !== id));
  return true;
}

// ---------- Serasa: configuração por conexão (secret criptografado) e consultas
function lerSerasaTudo() { return ler('serasa.json', { porConexao: {} }); }

// sem o secret — vai para a tela
function getSerasa(conexaoId) {
  const salvo = lerSerasaTudo().porConexao[conexaoId] || null;
  const cfg = serasa.mesclarPadrao(salvo);
  const temSecret = !!(salvo && (salvo.secretCript || salvo.secretTexto));
  return { ...cfg, conexaoId, temSecret };
}

function getSerasaSecret(conexaoId) {
  const salvo = lerSerasaTudo().porConexao[conexaoId];
  return salvo ? decifrar({ senhaCript: salvo.secretCript, senhaTexto: salvo.secretTexto }) : '';
}

// secret vazio = mantém o atual
function salvarSerasa(conexaoId, cfg) {
  if (!conexaoId) throw new Error('Selecione a conexão.');
  const tudo = lerSerasaTudo();
  const atual = tudo.porConexao[conexaoId] || {};
  const { secret, temSecret, conexaoId: _c, ...limpo } = cfg || {};
  const item = serasa.mesclarPadrao(limpo);
  if (secret) {
    const c = cifrar(secret);
    item.secretCript = c.senhaCript; item.secretTexto = c.senhaTexto;
  } else {
    item.secretCript = atual.secretCript; item.secretTexto = atual.secretTexto;
  }
  tudo.porConexao[conexaoId] = item;
  gravar('serasa.json', tudo);
  serasa.tokens.delete(conexaoId);
  return getSerasa(conexaoId);
}

function listarConsultasSerasa(filtro = {}) {
  return ler('serasa-consultas.json', []).filter((c) =>
    (!filtro.conexaoId || c.conexaoId === filtro.conexaoId) && (!filtro.codigo || c.codigo === filtro.codigo) &&
    (!filtro.documento || c.documento === filtro.documento));
}

function salvarConsultaSerasa(c) {
  const lista = ler('serasa-consultas.json', []);
  const item = { ...c, id: novoId(), data: new Date().toISOString() };
  lista.unshift(item);
  gravar('serasa-consultas.json', lista);
  return item;
}

// ---------- Backup (as conexões são as do Parallello e não entram)
function montarBackup() {
  return {
    sistema: 'Analise de Credito',
    versao: 3,
    exportadoEm: new Date().toISOString(),
    regras: getRegras(),
    configuracao: getConfiguracao(),
    decisoes: listarDecisoes(),
    serasa: {
      // configurações sem o Client Secret
      porConexao: Object.fromEntries(Object.entries(lerSerasaTudo().porConexao).map(([id, c]) => {
        const { secretCript, secretTexto, ...resto } = c;
        return [id, resto];
      })),
      consultas: ler('serasa-consultas.json', [])
    }
  };
}

function restaurarBackup(b) {
  if (!b || b.sistema !== 'Analise de Credito') throw new Error('Arquivo de backup inválido.');
  if (b.regras) gravar('regras.json', b.regras);
  if (b.configuracao) gravar('configuracao.json', b.configuracao);
  let qtdDecisoes = 0;
  if (Array.isArray(b.decisoes)) {
    const atuais = listarDecisoes();
    const ids = new Set(atuais.map((x) => x.id));
    const novas = b.decisoes.filter((x) => !ids.has(x.id));
    qtdDecisoes = novas.length;
    gravar('decisoes.json', [...novas, ...atuais].sort((a, z) => String(z.data).localeCompare(String(a.data))));
  }
  // conexões de backups antigos são ignoradas: no Parallello elas vêm da Configuração central
  const qtdConexoes = 0;
  // Serasa: configurações (mantendo o secret local) e consultas
  let qtdSerasa = 0;
  if (b.serasa) {
    const tudo = lerSerasaTudo();
    for (const [id, cfg] of Object.entries(b.serasa.porConexao || {})) {
      const atual = tudo.porConexao[id] || {};
      tudo.porConexao[id] = { ...cfg, secretCript: atual.secretCript, secretTexto: atual.secretTexto };
    }
    gravar('serasa.json', tudo);
    if (Array.isArray(b.serasa.consultas)) {
      const atuais = ler('serasa-consultas.json', []);
      const ids = new Set(atuais.map((x) => x.id));
      const novas = b.serasa.consultas.filter((x) => !ids.has(x.id));
      qtdSerasa = novas.length;
      gravar('serasa-consultas.json', [...novas, ...atuais].sort((a, z) => String(z.data).localeCompare(String(a.data))));
    }
  }
  return { decisoes: qtdDecisoes, conexoes: qtdConexoes, consultasSerasa: qtdSerasa };
}

module.exports = {
  configurar, pasta, listarConexoes, getConexao, salvarConexao, excluirConexao, ativarConexao,
  getRegras, salvarRegras, regrasPadrao, getConfiguracao, salvarConfiguracao,
  listarDecisoes, salvarDecisao, excluirDecisao, obterDecisao, montarBackup, restaurarBackup,
  getSerasa, getSerasaSecret, salvarSerasa, listarConsultasSerasa, salvarConsultaSerasa
};
