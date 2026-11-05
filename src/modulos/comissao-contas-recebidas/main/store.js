// Armazenamento local em SQLite (sql.js — puro WebAssembly, sem compilação nativa)
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

let SQL = null;
let db = null;
let arquivo = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS conexoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  servidor TEXT NOT NULL,
  porta INTEGER,
  banco TEXT NOT NULL,
  usuario TEXT,
  senha TEXT,
  criptografar INTEGER DEFAULT 0,
  padrao INTEGER DEFAULT 0,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT
);
CREATE TABLE IF NOT EXISTS vendedores_cache (
  conexao_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  nome TEXT,
  PRIMARY KEY (conexao_id, codigo)
);
CREATE TABLE IF NOT EXISTS fechamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  criado_em TEXT DEFAULT (datetime('now','localtime')),
  conexao TEXT,
  vendedor TEXT,
  baixa_inicio TEXT,
  baixa_fim TEXT,
  venda_desde TEXT,
  pedidos INTEGER,
  recebido REAL,
  comissao REAL,
  observacao TEXT,
  dados TEXT
);
`;

function limparParams(p) {
  return (p || []).map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
}

function all(q, p) {
  const st = db.prepare(q);
  try {
    st.bind(limparParams(p));
    const out = [];
    while (st.step()) out.push(st.getAsObject());
    return out;
  } finally {
    st.free();
  }
}

function get(q, p) {
  return all(q, p)[0] || null;
}

function run(q, p) {
  db.run(q, limparParams(p));
  const r = get('SELECT last_insert_rowid() AS id');
  persistir();
  return r ? r.id : null;
}

let emLote = false;
// Executa várias gravações e salva o arquivo uma única vez no final
function lote(fn) {
  emLote = true;
  db.run('BEGIN');
  try {
    const r = fn();
    db.run('COMMIT');
    return r;
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  } finally {
    emLote = false;
    persistir();
  }
}

function persistir() {
  if (emLote) return;
  const tmp = arquivo + '.tmp';
  fs.writeFileSync(tmp, Buffer.from(db.export()));
  fs.renameSync(tmp, arquivo);
}

// No Parallello as conexões são as do próprio Parallello (a tabela "conexoes" fica só para
// os backups antigos continuarem válidos).

// O sql-wasm.wasm vai ao lado do processo principal compilado (scripts/compilar-main.mjs).
function arquivoWasm() {
  const junto = path.join(__dirname, 'sql-wasm.wasm');
  if (!fs.existsSync(junto)) throw new Error('Arquivo sql-wasm.wasm não encontrado junto do programa. Gere de novo (npm run build).');
  return junto;
}

async function init(pasta) {
  fs.mkdirSync(pasta, { recursive: true });
  arquivo = path.join(pasta, 'comissao-local.sqlite');
  SQL = await initSqlJs({ wasmBinary: fs.readFileSync(arquivoWasm()) });
  db = fs.existsSync(arquivo) ? new SQL.Database(fs.readFileSync(arquivo)) : new SQL.Database();
  db.run(SCHEMA);
  persistir();
}

function caminho() {
  return arquivo;
}

function exportarBytes() {
  return Buffer.from(db.export());
}

function restaurar(bytes) {
  let novo;
  let tabelas;
  try {
    novo = new SQL.Database(bytes);
    tabelas = new Set((novo.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values || []).map((r) => r[0]));
  } catch {
    if (novo) novo.close();
    throw new Error('O arquivo escolhido não é um backup válido deste sistema.');
  }
  for (const t of ['conexoes', 'config', 'fechamentos']) {
    if (!tabelas.has(t)) {
      novo.close();
      throw new Error('O arquivo escolhido não é um backup válido deste sistema.');
    }
  }
  db.close();
  db = novo;
  db.run(SCHEMA);
  persistir();
}

// ---------- Config chave/valor ----------
function configObter(chave, padrao = null) {
  const r = get('SELECT valor FROM config WHERE chave = ?', [chave]);
  if (!r) return padrao;
  try {
    return JSON.parse(r.valor);
  } catch {
    return padrao;
  }
}

function configDefinir(chave, valor) {
  run('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor', [
    chave,
    JSON.stringify(valor)
  ]);
}

module.exports = { init, all, get, run, lote, caminho, exportarBytes, restaurar, configObter, configDefinir };
