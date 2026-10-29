// Armazenamento local (sem nuvem): arquivos JSON na pasta de dados do usuário.
// Senhas de usuários: hash scrypt. Senhas das conexões: criptografadas pelo SO (safeStorage/DPAPI).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { safeStorage } = require('electron');

const PADRAO = {
  versao: 1,
  usuarios: [], // { id, usuario, salt, hash, ativo, criadoEm }
  conexoes: [], // { id, nome, servidor, porta, instancia, banco, usuario, senhaCripto, encrypt }
  ultimaConexaoId: null,
  ultimoUsuario: '',
  parametros: {
    situacaoPV: 'E',
    equipePadrao: '1',
    setorPadrao: '101',
    vendedorPadrao: '101',
    operacaoPadrao: '02',
    textoObs: 'PRE-VENDA DE RUPTURA REFERENCIADA DA PRE VENDA',
    registrarEvento: true,
  },
};

// Pasta definida pelo Parallello (uma por módulo).
let pasta = null;
function definirPasta(p) { pasta = p; }

function dir() {
  if (!pasta) throw new Error('Pasta de dados não definida.');
  const d = pasta;
  fs.mkdirSync(d, { recursive: true });
  return d;
}
const arqConfig = () => path.join(dir(), 'config.json');
const arqHistorico = () => path.join(dir(), 'historico.json');

function lerJSON(arq, padrao) {
  try {
    if (!fs.existsSync(arq)) return structuredClone(padrao);
    return JSON.parse(fs.readFileSync(arq, 'utf8'));
  } catch (e) {
    // arquivo corrompido: guarda cópia e recomeça
    try { fs.copyFileSync(arq, arq + '.corrompido-' + Date.now()); } catch {}
    return structuredClone(padrao);
  }
}

function gravarJSON(arq, dados) {
  const tmp = arq + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2), 'utf8');
  if (fs.existsSync(arq)) fs.copyFileSync(arq, arq + '.bak');
  fs.renameSync(tmp, arq);
}

function config() {
  const c = lerJSON(arqConfig(), PADRAO);
  c.parametros = { ...PADRAO.parametros, ...(c.parametros || {}) };
  c.usuarios = c.usuarios || [];
  c.conexoes = c.conexoes || [];
  return c;
}
function salvarConfig(c) { gravarJSON(arqConfig(), c); }

// ---------- hash de senhas ----------
function gerarHash(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(senha), salt, 64).toString('hex');
  return { salt, hash };
}
function confere(senha, reg) {
  if (!reg || !reg.salt) return false;
  const h = crypto.scryptSync(String(senha), reg.salt, 64);
  const ref = Buffer.from(reg.hash, 'hex');
  return ref.length === h.length && crypto.timingSafeEqual(ref, h);
}

// ---------- criptografia de senha de conexão ----------
function cripto(txt) {
  if (!txt) return '';
  if (safeStorage.isEncryptionAvailable()) return 'ss:' + safeStorage.encryptString(txt).toString('base64');
  return 'b64:' + Buffer.from(txt, 'utf8').toString('base64');
}
function decripto(v) {
  if (!v) return '';
  if (v.startsWith('ss:')) return safeStorage.decryptString(Buffer.from(v.slice(3), 'base64'));
  if (v.startsWith('b64:')) return Buffer.from(v.slice(4), 'base64').toString('utf8');
  return v;
}

// ---------- histórico local ----------
function historico() { return lerJSON(arqHistorico(), []); }
function adicionarHistorico(reg) {
  const h = historico();
  h.unshift(reg);
  gravarJSON(arqHistorico(), h.slice(0, 5000));
}

module.exports = {
  config, salvarConfig, gerarHash, confere, cripto, decripto,
  historico, adicionarHistorico, pastaDados: dir, definirPasta,
};
