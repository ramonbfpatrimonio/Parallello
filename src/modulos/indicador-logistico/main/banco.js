// Acesso aos bancos SQL Server dos clientes
const sql = require('mssql');
const Q = require('./consultas');

function montarConfig(c, senha) {
  let server = String(c.servidor || '').trim();
  let instanceName;
  if (server.includes('\\')) {
    [server, instanceName] = server.split('\\');
  }
  const cfg = {
    server,
    database: String(c.banco || '').trim(),
    user: String(c.usuario || '').trim(),
    password: senha,
    connectionTimeout: 15000,
    requestTimeout: (Number(c.timeout) || 120) * 1000,
    options: {
      encrypt: !!c.encrypt,
      trustServerCertificate: true,
      useUTC: true,
      enableArithAbort: true
    },
    pool: { max: 4, min: 0, idleTimeoutMillis: 30000 }
  };
  if (instanceName) cfg.options.instanceName = instanceName;
  else if (c.porta) cfg.port = Number(c.porta);
  return cfg;
}

async function comConexao(c, senha, fn) {
  const pool = new sql.ConnectionPool(montarConfig(c, senha));
  await pool.connect();
  try {
    return await fn(pool);
  } finally {
    await pool.close().catch(() => {});
  }
}

function req(pool, p) {
  const r = pool.request();
  r.input('ini', sql.VarChar(20), p.ini);
  r.input('fim', sql.VarChar(20), p.fim);
  if (p.cc !== undefined) r.input('cc', sql.VarChar(30), p.cc);
  return r;
}

// Datas no formato AAAAMMDD (não depende do idioma do SQL Server)
function paramsPeriodo(ini, fim, cc) {
  const a = ini.replace(/-/g, '');
  const b = fim.replace(/-/g, '');
  return { ini: a, fim: b + ' 23:59:59', cc: String(cc) };
}

async function testar(c, senha) {
  return comConexao(c, senha, async (pool) => {
    const info = (await pool.request().query('SELECT @@VERSION AS versao, DB_NAME() AS banco')).recordset[0];
    const tabs = (await pool.request().query(
      "SELECT TABLE_NAME AS nome FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo'"
    )).recordset.map((t) => t.nome.toLowerCase());
    const faltando = Q.TABELAS_NECESSARIAS.filter((t) => !tabs.includes(t.toLowerCase()));
    return { banco: info.banco, versao: String(info.versao).split('\n')[0], faltando };
  });
}

async function buscarPadrao(c, senha, p) {
  return comConexao(c, senha, async (pool) => {
    const [pedidos, retornos, prevendas, custos] = await Promise.all([
      req(pool, p).query(Q.PADRAO_PEDIDOS),
      req(pool, p).query(Q.PADRAO_RETORNOS),
      req(pool, p).query(Q.PADRAO_PREVENDAS),
      req(pool, p).query(Q.PADRAO_CUSTOS)
    ]);
    return {
      pedidos: pedidos.recordset,
      retornos: retornos.recordset,
      prevendas: prevendas.recordset,
      custos: custos.recordset
    };
  });
}

async function buscarPlanilha(c, senha, p, consolidado) {
  return comConexao(c, senha, async (pool) => {
    const linhas = (await req(pool, p).query(Q.PLANILHA_PRINCIPAL)).recordset;
    let dictVendas = [];
    let dictDevolucoes = [];
    if (consolidado) {
      dictVendas = (await req(pool, p).query(Q.PLANILHA_DICT_VENDAS)).recordset;
      dictDevolucoes = (await req(pool, p).query(Q.PLANILHA_DICT_DEVOLUCOES)).recordset;
    }
    return { linhas, dictVendas, dictDevolucoes };
  });
}

module.exports = { testar, buscarPadrao, buscarPlanilha, paramsPeriodo };
