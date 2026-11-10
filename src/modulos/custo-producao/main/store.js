// Armazenamento 100% local (pasta do módulo no Parallello), em arquivos JSON.
// As conexões são as do Parallello (ctx.conexoes); aqui ficam só a conexão em uso e os ajustes de cada uma
// (coluna de data da ordem e tempo limite da consulta).
const fs = require('fs');
const path = require('path');

const PREF_PADRAO = { casasCustoUnit: 2 };
const AJUSTE_PADRAO = { colunaData: '', timeout: 120 };
const NA_PARALLELLO = 'As conexões com o banco ficam no Parallello: Ctrl+Shift+B na tela inicial (Configuração > Conexão com o banco).';

let pastaDados = null;
let fonte = null; // { listar(), senha(id) } do Parallello
function configurar({ pasta: p, conexoes }) {
  pastaDados = p;
  fonte = conexoes;
}

const pasta = (...p) => path.join(pastaDados, ...p);
const ARQ_CONFIG = () => pasta('config.json');
const ARQ_HIST = () => pasta('historico', 'indice.json');
const ARQ_SNAP = id => pasta('historico', `${String(id).replace(/[^a-z0-9]/gi, '')}.json`);
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function ler(arquivo, padrao) {
  try { return JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch { return padrao; }
}

function gravar(arquivo, dados) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const tmp = `${arquivo}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2), 'utf8');
  fs.renameSync(tmp, arquivo);
}

// ---------------- Configuração e conexões ----------------
function lerLocal() {
  const c = ler(ARQ_CONFIG(), {});
  return { ativaId: c.ativaId || '', ajustes: c.ajustes || {}, preferencias: { ...PREF_PADRAO, ...(c.preferencias || {}) } };
}
function gravarLocal(c) {
  gravar(ARQ_CONFIG(), { versao: 3, ativaId: c.ativaId, ajustes: c.ajustes, preferencias: c.preferencias });
}

async function lerConfig() {
  const local = lerLocal();
  const conexoes = (await fonte.listar()).map(p => ({
    id: p.id,
    nome: p.cliente ? `${p.cliente} › ${p.nome}` : p.nome,
    server: p.servidor,
    instance: p.instancia || '',
    port: p.porta ? String(p.porta) : '',
    database: p.banco,
    user: p.usuario,
    encrypt: !!p.criptografar,
    trustServerCertificate: true,
    temSenha: !!p.temSenha,
    ...AJUSTE_PADRAO,
    ...(local.ajustes[p.id] || {})
  }));
  let ativaId = local.ativaId;
  if (!conexoes.some(x => x.id === ativaId)) ativaId = conexoes[0] ? conexoes[0].id : '';
  return { conexoes, ativaId, preferencias: local.preferencias };
}

async function configPublica() {
  return lerConfig();
}

async function paraMssql(x) {
  return { ...x, password: await fonte.senha(x.id) };
}

async function conexaoAtiva() {
  const c = await lerConfig();
  const x = c.conexoes.find(k => k.id === c.ativaId);
  if (!x) throw new Error('Nenhuma conexão cadastrada. Cadastre na Configuração do Parallello (Ctrl+Shift+B na tela inicial).');
  const completa = await paraMssql(x);
  if (!completa.password) throw new Error(`A conexão "${x.nome}" está sem senha neste computador. Informe na Configuração do Parallello.`);
  return completa;
}

// Conexão para testar / buscar colunas: a do Parallello com os ajustes do formulário
async function conexaoDoFormulario(form = {}) {
  const c = await lerConfig();
  const x = c.conexoes.find(k => k.id === form.id);
  if (!x) throw new Error('Escolha uma das conexões do Parallello.');
  return paraMssql({ ...x, colunaData: form.colunaData ?? x.colunaData, timeout: form.timeout ?? x.timeout });
}

// Salva só os ajustes deste módulo (coluna de data e tempo limite) para a conexão do Parallello
async function salvarConexao(form = {}) {
  const c = await lerConfig();
  if (!c.conexoes.some(k => k.id === form.id)) throw new Error(NA_PARALLELLO);
  const local = lerLocal();
  local.ajustes[form.id] = { colunaData: String(form.colunaData || ''), timeout: Number(form.timeout) || AJUSTE_PADRAO.timeout };
  gravarLocal(local);
  return { config: await configPublica(), id: form.id };
}

function duplicarConexao() { throw new Error(NA_PARALLELLO); }
function excluirConexao() { throw new Error(NA_PARALLELLO); }

async function ativarConexao(id) {
  const c = await lerConfig();
  if (!c.conexoes.some(k => k.id === id)) throw new Error('Conexão não encontrada.');
  const local = lerLocal();
  local.ativaId = id;
  gravarLocal(local);
  return configPublica();
}

async function salvarPreferencias(p = {}) {
  const local = lerLocal();
  local.preferencias = { ...local.preferencias, ...p };
  gravarLocal(local);
  return configPublica();
}

// ---------------- Histórico (fotografias das consultas) ----------------
const somaCentavos = ordens => ordens.reduce((s, o) => s + Math.round((o.custoTotal || 0) * 100), 0) / 100;

function listarHistorico() {
  return ler(ARQ_HIST(), []);
}

async function salvarSnapshot({ nome, filtros, ordens, comData }) {
  if (!Array.isArray(ordens) || !ordens.length) throw new Error('Não há dados para salvar.');
  const cx = (await lerConfig()).conexoes.find((k, _i, l) => k.id === (lerLocal().ativaId || l[0]?.id)) || { id: '', nome: '' };
  const id = novoId();
  const criadoEm = new Date().toISOString();
  const nomeFinal = (nome || '').trim() || `Consulta de ${new Date().toLocaleString('pt-BR')}`;
  const meta = { id, nome: nomeFinal, criadoEm, filtros, conexaoId: cx.id, conexaoNome: cx.nome };
  gravar(ARQ_SNAP(id), { ...meta, comData: !!comData, ordens });
  const lista = listarHistorico();
  lista.unshift({ ...meta, qtdOrdens: ordens.length, custoTotal: somaCentavos(ordens) });
  gravar(ARQ_HIST(), lista);
  return lista;
}

function abrirSnapshot(id) {
  const s = ler(ARQ_SNAP(id), null);
  if (!s) throw new Error('Registro do histórico não encontrado.');
  return s;
}

function excluirSnapshot(id) {
  fs.rmSync(ARQ_SNAP(id), { force: true });
  const lista = listarHistorico().filter(h => h.id !== id);
  gravar(ARQ_HIST(), lista);
  return lista;
}

// ---------------- Backup ----------------
function montarBackup() {
  const c = lerLocal();
  const historico = listarHistorico().map(h => ler(ARQ_SNAP(h.id), null)).filter(Boolean);
  return {
    app: 'custo-producao',
    versao: 3,
    geradoEm: new Date().toISOString(),
    ajustes: c.ajustes,
    ativaId: c.ativaId,
    preferencias: c.preferencias,
    historico
  };
}

function restaurarBackup(dados) {
  if (!dados || dados.app !== 'custo-producao') throw new Error('Este arquivo não é um backup do Custo de Produção.');
  const c = lerLocal();
  if (dados.preferencias) c.preferencias = { ...PREF_PADRAO, ...dados.preferencias };
  if (dados.ajustes) c.ajustes = { ...c.ajustes, ...dados.ajustes };
  if (dados.ativaId) c.ativaId = dados.ativaId;
  gravarLocal(c);

  const porId = new Map(listarHistorico().map(h => [h.id, h]));
  for (const s of dados.historico || []) {
    if (!s || !s.id || !Array.isArray(s.ordens)) continue;
    gravar(ARQ_SNAP(s.id), s);
    const { ordens, comData, ...meta } = s;
    porId.set(s.id, { ...meta, qtdOrdens: ordens.length, custoTotal: somaCentavos(ordens) });
  }
  const lista = [...porId.values()].sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
  gravar(ARQ_HIST(), lista);
  return { conexoes: 0, registros: (dados.historico || []).length };
}

module.exports = {
  configurar, configPublica, conexaoAtiva, conexaoDoFormulario,
  salvarConexao, duplicarConexao, excluirConexao, ativarConexao, salvarPreferencias,
  listarHistorico, salvarSnapshot, abrirSnapshot, excluirSnapshot,
  montarBackup, restaurarBackup, pastaDados: () => pasta()
};
