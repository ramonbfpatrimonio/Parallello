const sql = require('mssql');
const { ANALISE, VENDAS_MES } = require('./queries.cjs');

let pool = null;
let poolKey = '';

function montarConfig(c) {
  const servidor = String(c.servidor || '').trim();
  const cfg = {
    user: c.usuario,
    password: c.senha,
    database: c.banco,
    requestTimeout: 600000,
    connectionTimeout: 30000,
    pool: { max: 5, min: 0, idleTimeoutMillis: 60000 },
    options: {
      encrypt: !!c.criptografar,
      trustServerCertificate: true,
      useUTC: false,
      enableArithAbort: true
    }
  };
  if (servidor.includes('\\')) {
    const [host, instancia] = servidor.split('\\');
    cfg.server = host;
    cfg.options.instanceName = instancia;
  } else {
    cfg.server = servidor;
    if (c.porta) cfg.port = Number(c.porta);
  }
  return cfg;
}

async function obterPool(c) {
  if (!c || !c.servidor || !c.banco) throw new Error('Conexão com o banco não configurada. Configure no Ctrl+Shift+B.');
  const chave = JSON.stringify(c);
  if (pool && poolKey === chave && pool.connected) return pool;
  if (pool) { try { await pool.close(); } catch { /* ignora */ } }
  pool = await new sql.ConnectionPool(montarConfig(c)).connect();
  poolKey = chave;
  return pool;
}

async function testar(c) {
  const p = await new sql.ConnectionPool(montarConfig(c)).connect();
  try {
    const r = await p.request().query('SELECT DB_NAME() AS Banco, @@SERVERNAME AS Servidor, (SELECT COUNT(*) FROM Clientes) AS Clientes');
    return r.recordset[0];
  } finally {
    await p.close();
  }
}

function codigoNormalizado(codigo) {
  const s = String(codigo || '').trim();
  if (!s) return null;
  return /^\d+$/.test(s) && s.length < 5 ? s.padStart(5, '0') : s;
}

function parametros(req, f = {}) {
  req.input('pCodigoCliente', sql.VarChar(10), codigoNormalizado(f.codigo));
  req.input('pDataInicial', sql.VarChar(10), f.dataInicial || null);
  req.input('pDataFinal', sql.VarChar(10), f.dataFinal || null);
  req.input('pStatusCliente', sql.VarChar(10), f.status || null);
  req.input('pBloqueado', sql.VarChar(1), f.bloqueado || null);
  req.input('pSomenteSemCompra', sql.VarChar(1), f.somenteSemCompra ? 'S' : null);
  req.input('pAbaterRetornos', sql.Bit, f.abaterRetornos === false ? 0 : 1);
  return req;
}

async function analisar(conexao, filtros) {
  const p = await obterPool(conexao);
  // um único lote: [0] métricas de todos os clientes, [1] clientes filtrados, [2] tempos por etapa
  const r = await parametros(p.request(), filtros).query(ANALISE);
  const [metricas = [], linhas = [], tempos = []] = r.recordsets || [];
  return { metricas, linhas, tempos };
}

async function vendasMes(conexao, filtros) {
  const p = await obterPool(conexao);
  const r = await parametros(p.request(), filtros).query(VENDAS_MES);
  return r.recordset;
}

module.exports = { testar, analisar, vendasMes, codigoNormalizado };
