// Armazenamento local em arquivo JSON (sem nuvem).
// - Gravação atômica (grava em .tmp e renomeia) para não corromper o arquivo.
// - Cópia de segurança automática diária na pasta "backups" (mantém as 15 últimas).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FABRICANTES_PADRAO = [
  'Leite Manaus', 'Manalac', 'Fazendeiro', 'Temperou', 'Viva Vitta', 'Alcafoods', 'Morango'
];

let dir = null;
let file = null;
let data = null;

function uid() {
  return crypto.randomBytes(8).toString('hex');
}

function estruturaVazia() {
  return {
    versao: 1,
    empresaAtivaId: null,
    empresas: [],
    preferencias: { deduzirRetorno: false, tema: 'claro' }
  };
}

function novaEmpresa(nome) {
  return {
    id: uid(),
    nome: nome || 'Nova empresa',
    bases: [],
    fabricantes: FABRICANTES_PADRAO.map((n) => ({ nome: n, ativo: true })),
    agruparOutros: false,
    prefixosSupervisao: '1,2,3,4,5'
  };
}

function normalizar(d) {
  const base = estruturaVazia();
  const out = { ...base, ...d, preferencias: { ...base.preferencias, ...(d.preferencias || {}) } };
  out.empresas = (out.empresas || []).map((e) => ({ ...novaEmpresa(e.nome), ...e }));
  if (!out.empresas.find((e) => e.id === out.empresaAtivaId)) {
    out.empresaAtivaId = out.empresas[0] ? out.empresas[0].id : null;
  }
  return out;
}

function init(pasta) {
  dir = pasta;
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'backups'), { recursive: true });
  file = path.join(dir, 'dados.json');
  if (fs.existsSync(file)) {
    try {
      data = normalizar(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (err) {
      // arquivo corrompido: guarda uma cópia e tenta o backup mais recente
      fs.copyFileSync(file, file + '.corrompido-' + Date.now());
      const ultimo = listarBackups()[0];
      data = ultimo ? normalizar(JSON.parse(fs.readFileSync(ultimo.caminho, 'utf8'))) : estruturaVazia();
    }
  } else {
    data = estruturaVazia();
    const emp = novaEmpresa('Minha empresa');
    data.empresas.push(emp);
    data.empresaAtivaId = emp.id;
    salvar();
  }
  backupDiario();
  return data;
}

function salvar() {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function get() {
  return data;
}

function set(novo) {
  data = normalizar(novo);
  salvar();
  return data;
}

function atualizar(fn) {
  const copia = JSON.parse(JSON.stringify(data));
  const r = fn(copia);
  return set(r || copia);
}

function listarBackups() {
  const pasta = path.join(dir, 'backups');
  return fs
    .readdirSync(pasta)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ nome: f, caminho: path.join(pasta, f), data: fs.statSync(path.join(pasta, f)).mtimeMs }))
    .sort((a, b) => b.data - a.data);
}

function backupDiario() {
  const hoje = new Date().toISOString().slice(0, 10);
  const destino = path.join(dir, 'backups', `dados-${hoje}.json`);
  if (!fs.existsSync(destino) && fs.existsSync(file)) fs.copyFileSync(file, destino);
  listarBackups().slice(15).forEach((b) => fs.unlinkSync(b.caminho));
}

function exportarPara(caminho) {
  fs.writeFileSync(
    caminho,
    JSON.stringify({ app: 'acompanhamento-vendas', exportadoEm: new Date().toISOString(), dados: data }, null, 2),
    'utf8'
  );
}

function importarDe(caminho) {
  const conteudo = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  const dados = conteudo && conteudo.dados ? conteudo.dados : conteudo;
  if (!dados || !Array.isArray(dados.empresas)) throw new Error('Arquivo de backup inválido.');
  // guarda o estado atual antes de substituir
  fs.copyFileSync(file, path.join(dir, 'backups', `antes-restaurar-${Date.now()}.json`));
  return set(dados);
}

module.exports = {
  init, get, set, atualizar, salvar, uid, novaEmpresa,
  exportarPara, importarDe, listarBackups, FABRICANTES_PADRAO,
  pasta: () => dir
};
