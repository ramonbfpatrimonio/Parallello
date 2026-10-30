// Armazenamento local em arquivos JSON (pasta de dados do usuário)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let base = null;

function setBase(dir) {
  base = dir;
  fs.mkdirSync(path.join(base, 'historico'), { recursive: true });
}

function dir() {
  if (!base) throw new Error('Pasta de dados não definida.');
  return base;
}

function arquivo(nome) {
  return path.join(dir(), nome + '.json');
}

function ler(nome, padrao) {
  try {
    return JSON.parse(fs.readFileSync(arquivo(nome), 'utf8'));
  } catch {
    return padrao;
  }
}

function gravar(nome, dados) {
  const f = arquivo(nome);
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2), 'utf8');
  fs.renameSync(tmp, f);
}

function novoId() {
  return crypto.randomUUID();
}

// ---------- Histórico ----------
function historicoListar() {
  return ler('historico/indice', []);
}

function historicoSalvar(entrada, max) {
  const id = novoId();
  const indice = historicoListar();
  const resumo = { id, ...entrada.resumo };
  fs.writeFileSync(path.join(dir(), 'historico', id + '.json'), JSON.stringify(entrada.resultado), 'utf8');
  indice.unshift(resumo);
  while (indice.length > max) {
    const velho = indice.pop();
    try { fs.unlinkSync(path.join(dir(), 'historico', velho.id + '.json')); } catch { /* ignora */ }
  }
  gravar('historico/indice', indice);
  return id;
}

function historicoObter(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(dir(), 'historico', id + '.json'), 'utf8'));
  } catch {
    return null;
  }
}

function historicoExcluir(id) {
  const indice = historicoListar().filter((h) => h.id !== id);
  gravar('historico/indice', indice);
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    try { fs.unlinkSync(path.join(dir(), 'historico', id + '.json')); } catch { /* ignora */ }
  }
}

module.exports = { setBase, dir, ler, gravar, novoId, historicoListar, historicoSalvar, historicoObter, historicoExcluir };
