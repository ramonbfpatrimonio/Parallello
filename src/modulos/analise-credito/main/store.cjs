// Armazenamento local em JSON (pasta do módulo no Parallello), sem nuvem.
// As conexões são as do Parallello (ctx.conexoes); aqui só fica guardada qual está em uso neste computador.
const path = require('path');
const fs = require('fs');
const { REGRAS_PADRAO } = require('./regrasPadrao.cjs');

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
  for (const c of REGRAS_PADRAO.criterios) {
    if (!r.criterios.find((x) => x.id === c.id)) r.criterios.push(clone(c));
  }
  return r;
}
function salvarRegras(r) { gravar('regras.json', r); return getRegras(); }
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
function excluirDecisao(id) {
  gravar('decisoes.json', listarDecisoes().filter((x) => x.id !== id));
  return true;
}

// ---------- Backup (regras e decisões; as conexões são as do Parallello)
function montarBackup() {
  return {
    sistema: 'Analise de Credito',
    versao: 3,
    exportadoEm: new Date().toISOString(),
    regras: getRegras(),
    decisoes: listarDecisoes()
  };
}

function restaurarBackup(b) {
  if (!b || b.sistema !== 'Analise de Credito') throw new Error('Arquivo de backup inválido.');
  if (b.regras) gravar('regras.json', b.regras);
  let qtdDecisoes = 0;
  if (Array.isArray(b.decisoes)) {
    const atuais = listarDecisoes();
    const ids = new Set(atuais.map((x) => x.id));
    const novas = b.decisoes.filter((x) => !ids.has(x.id));
    qtdDecisoes = novas.length;
    gravar('decisoes.json', [...novas, ...atuais].sort((a, z) => String(z.data).localeCompare(String(a.data))));
  }
  return { decisoes: qtdDecisoes, conexoes: 0 };
}

module.exports = {
  configurar, pasta, listarConexoes, getConexao, salvarConexao, excluirConexao, ativarConexao,
  getRegras, salvarRegras, regrasPadrao,
  listarDecisoes, salvarDecisao, excluirDecisao, montarBackup, restaurarBackup
};
