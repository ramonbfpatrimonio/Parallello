// Conexão com o SQL Server do ERP (somente leitura).
// Cada empresa pode ter várias bases (ex.: Hage.0001.Log e Hage.0002.Log);
// os relatórios rodam a mesma consulta em todas as bases ativas e somam o resultado.
const sql = require('mssql');

const pools = new Map(); // chave -> { pool, assinatura }
let decifrar = (s) => s; // substituído pelo main (safeStorage)

function setDecifrador(fn) {
  decifrar = fn;
}

// Aceita "192.168.1.199", "192.168.1.199\\SQLEXPRESS", "192.168.1.199,1433\\SQLEXPRESS"
function interpretarServidor(texto, portaCampo, instanciaCampo) {
  let host = String(texto || '').trim();
  let instancia = (instanciaCampo || '').trim();
  let porta = portaCampo ? Number(portaCampo) : null;
  const barra = host.indexOf('\\');
  if (barra >= 0) {
    if (!instancia) instancia = host.slice(barra + 1);
    host = host.slice(0, barra);
  }
  const virgula = host.indexOf(',');
  if (virgula >= 0) {
    if (!porta) porta = Number(host.slice(virgula + 1)) || null;
    host = host.slice(0, virgula);
  }
  return { host, porta, instancia };
}

function montarConfig(base) {
  const { host, porta, instancia } = interpretarServidor(base.servidor, base.porta, base.instancia);
  const cfg = {
    server: host,
    database: base.banco,
    user: base.usuario,
    password: base.senhaCifrada ? decifrar(base.senhaCifrada) : '',
    connectionTimeout: 15000,
    requestTimeout: (Number(base.timeoutSeg) || 180) * 1000,
    pool: { max: 4, min: 0, idleTimeoutMillis: 60000 },
    options: {
      encrypt: !!base.criptografar,
      trustServerCertificate: true,
      enableArithAbort: true
    }
  };
  // Porta explícita tem prioridade (não depende do SQL Browser). Sem porta, usa a instância nomeada.
  if (porta) cfg.port = porta;
  else if (instancia) cfg.options.instanceName = instancia;
  return cfg;
}

async function obterPool(base) {
  const cfg = montarConfig(base);
  const assinatura = JSON.stringify({ ...cfg, password: base.senhaCifrada || '' });
  const atual = pools.get(base.id);
  if (atual && atual.assinatura === assinatura && atual.pool.connected) return atual.pool;
  if (atual) {
    try { await atual.pool.close(); } catch (_) { /* ignora */ }
  }
  const pool = new sql.ConnectionPool(cfg);
  await pool.connect();
  pools.set(base.id, { pool, assinatura });
  return pool;
}

async function testar(base) {
  const pool = await obterPool(base);
  const r = await pool.request().query(
    "SELECT DB_NAME() AS banco, @@SERVERNAME AS servidor, (SELECT COUNT(*) FROM [dbo].[Prevendas]) AS prevendas"
  );
  return r.recordset[0];
}

// params: { ini: 'YYYY-MM-DD', fim: 'YYYY-MM-DD', ...outros textos }
function aplicarParametros(request, params) {
  Object.entries(params || {}).forEach(([nome, valor]) => {
    if (valor === undefined) return;
    if ((nome === 'ini' || nome === 'fim') && typeof valor === 'string') {
      request.input(nome, sql.Date, valor);
    } else if (typeof valor === 'number') {
      request.input(nome, sql.Int, valor);
    } else {
      request.input(nome, sql.VarChar(200), valor);
    }
  });
}

function basesAtivas(empresa) {
  const bases = (empresa.bases || []).filter((b) => b.ativa !== false);
  if (!bases.length) {
    throw new Error('Nenhuma base ativa cadastrada para esta empresa. Cadastre em "Empresas e conexões".');
  }
  return bases;
}

// Executa várias consultas em cada base ativa (em paralelo por base).
// consultas: { nome: textoSQL }  ->  retorna [{ base, resultados: { nome: rows[] } }]
async function executarEmTodas(empresa, consultas, params, aoProgredir) {
  const bases = basesAtivas(empresa);
  const saida = [];
  for (const base of bases) {
    if (aoProgredir) aoProgredir(`Consultando ${base.nome || base.banco}...`);
    let pool;
    try {
      pool = await obterPool(base);
    } catch (err) {
      throw new Error(`Não foi possível conectar na base "${base.nome || base.banco}": ${err.message}`);
    }
    const resultados = {};
    await Promise.all(
      Object.entries(consultas).map(async ([nome, texto]) => {
        const req = pool.request();
        aplicarParametros(req, params);
        try {
          const r = await req.query(texto);
          resultados[nome] = r.recordset;
        } catch (err) {
          throw new Error(`Erro na consulta "${nome}" da base "${base.nome || base.banco}": ${err.message}`);
        }
      })
    );
    saida.push({ base, resultados });
  }
  return saida;
}

async function fecharTudo() {
  for (const { pool } of pools.values()) {
    try { await pool.close(); } catch (_) { /* ignora */ }
  }
  pools.clear();
}

module.exports = { setDecifrador, testar, executarEmTodas, fecharTudo, interpretarServidor, montarConfig };
