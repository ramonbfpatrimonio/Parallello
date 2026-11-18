const sql = require('mssql');
const { ANALISE, VENDAS_MES, LIMITE_CLIENTE, APLICAR_LIMITE } = require('./queries.cjs');

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
  req.input('pSomarST', sql.Bit, f.somarST === false ? 0 : 1);
  req.input('pMesesAtraso', sql.Int, Number.isFinite(Number(f.mesesAtraso)) ? Number(f.mesesAtraso) : 12);
  return req;
}

async function analisar(conexao, filtros) {
  const p = await obterPool(conexao);
  // um único lote: [0] clientes filtrados com os indicadores, [1] tempos por etapa
  const r = await parametros(p.request(), filtros).query(ANALISE);
  const [linhas = [], tempos = []] = r.recordsets || [];
  return { linhas, tempos };
}

async function vendasMes(conexao, filtros) {
  const p = await obterPool(conexao);
  const r = await parametros(p.request(), filtros).query(VENDAS_MES);
  return r.recordset;
}

// Documento do cliente (coluna configurável; padrão NroInsc) e, opcionalmente, a coluna de tipo
const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
async function documentoCliente(conexao, codigo, colunas = {}) {
  const col = colunas.coluna || 'NroInsc';
  const colTipo = colunas.colunaTipo || '';
  if (!IDENT.test(col)) throw new Error(`Nome de coluna inválido: ${col}`);
  if (colTipo && !IDENT.test(colTipo)) throw new Error(`Nome de coluna inválido: ${colTipo}`);
  const p = await obterPool(conexao);
  const r = await p.request()
    .input('c', sql.VarChar(10), codigoNormalizado(codigo))
    .query(`SELECT TOP 1 CAST([${col}] AS VARCHAR(60)) AS Documento${colTipo ? `, CAST([${colTipo}] AS VARCHAR(30)) AS TipoDoc` : ''}, CAST(Nome AS VARCHAR(150)) AS Nome FROM Clientes WHERE Codigo = @c`);
  if (!r.recordset.length) throw new Error(`Cliente ${codigo} não encontrado.`);
  return r.recordset[0];
}

async function limiteCliente(conexao, codigo) {
  const p = await obterPool(conexao);
  const r = await p.request().input('c', sql.VarChar(10), codigoNormalizado(codigo)).query(LIMITE_CLIENTE);
  if (!r.recordset.length) throw new Error(`Cliente ${codigo} não encontrado no banco.`);
  return r.recordset[0];
}

// ---------- Eventos de sistema no ERP
// O INSERT vem da Área do sistema › Configuração, com parâmetros nomeados (nunca concatenados).
function validarModeloEvento(sqlTexto) {
  const t = String(sqlTexto || '').trim().replace(/;\s*$/, '');
  if (!/^INSERT\s+INTO\s/i.test(t)) throw new Error('O modelo do evento precisa ser um único INSERT INTO.');
  if (t.includes(';')) throw new Error('O modelo do evento deve ter um único comando (sem ";").');
  if (/\b(UPDATE|DELETE|DROP|ALTER|TRUNCATE|EXEC|EXECUTE|MERGE|CREATE|GRANT)\b/i.test(t.replace(/'[^']*'/g, ''))) {
    throw new Error('O modelo do evento só pode conter o INSERT.');
  }
  return t;
}

function parametrosEvento(req, ev) {
  const texto = (v, n) => (v == null ? null : String(v).slice(0, n));
  return req
    .input('Data', sql.DateTime, ev.data ? new Date(ev.data) : new Date())
    .input('Usuario', sql.VarChar(100), texto(ev.usuario, 100))
    .input('UsuarioCodigo', sql.VarChar(30), texto(ev.usuarioCodigo, 30))
    .input('Computador', sql.VarChar(100), texto(ev.computador, 100))
    .input('Modulo', sql.VarChar(60), texto(ev.modulo || 'Analise de Credito', 60))
    .input('Evento', sql.VarChar(60), texto(ev.evento, 60))
    .input('Acao', sql.VarChar(100), texto(ev.acao, 100))
    .input('Descricao', sql.VarChar(500), texto(ev.descricao, 500))
    .input('Cliente', sql.VarChar(10), ev.cliente ? codigoNormalizado(ev.cliente) : null)
    .input('ValorAnterior', sql.Decimal(18, 2), ev.valorAnterior ?? null)
    .input('ValorNovo', sql.Decimal(18, 2), ev.valorNovo ?? null);
}

// tx opcional: quando vem, o evento entra na mesma transação do UPDATE
async function inserirEvento(conexao, modelo, ev, tx) {
  const sqlEvento = validarModeloEvento(modelo);
  const req = tx ? new sql.Request(tx) : (await obterPool(conexao)).request();
  await parametrosEvento(req, ev).query(sqlEvento);
}

// teste: executa o INSERT e desfaz (nada fica gravado)
async function testarEvento(conexao, modelo, ev) {
  const p = await obterPool(conexao);
  const tx = new sql.Transaction(p);
  await tx.begin();
  try {
    await inserirEvento(conexao, modelo, ev, tx);
    return true;
  } finally {
    try { await tx.rollback(); } catch { /* ignora */ }
  }
}

// UPDATE dentro de transação: se afetar mais de 1 linha, desfaz.
// evento: { modelo, dados } — gravado na mesma transação (se falhar, o UPDATE também é desfeito)
async function aplicarLimite(conexao, codigo, novo, evento) {
  const p = await obterPool(conexao);
  const tx = new sql.Transaction(p);
  await tx.begin();
  try {
    const r = await new sql.Request(tx)
      .input('c', sql.VarChar(10), codigoNormalizado(codigo))
      .input('novo', sql.Decimal(18, 2), novo)
      .query(APLICAR_LIMITE);
    const linhas = r.recordset?.[0]?.Linhas ?? 0;
    if (linhas > 1) throw new Error(`O UPDATE afetaria ${linhas} clientes — operação desfeita.`);
    if (linhas === 1 && evento) {
      try { await inserirEvento(conexao, evento.modelo, evento.dados, tx); }
      catch (e) { throw new Error(`Não foi possível gravar o evento de sistema no ERP (${e.message}). O limite não foi alterado.`); }
    }
    await tx.commit();
    return linhas;
  } catch (e) {
    try { await tx.rollback(); } catch { /* já desfeita */ }
    if (/permission|permiss/i.test(e.message)) {
      throw new Error('O usuário da conexão não tem permissão para alterar a tabela Clientes (LimPerCred). Use um login com permissão de UPDATE.');
    }
    throw e;
  }
}

module.exports = { testar, analisar, vendasMes, documentoCliente, limiteCliente, aplicarLimite, inserirEvento, testarEvento, validarModeloEvento, codigoNormalizado };
