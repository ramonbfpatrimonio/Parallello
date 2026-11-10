// Conexão com o SQL Server e consulta de Custo de Produto/Produção
const sql = require('mssql');

let pool = null;
let chavePool = null;

function paraMssql(c) {
  const cfg = {
    server: (c.server || '').trim(),
    database: (c.database || '').trim(),
    user: (c.user || '').trim(),
    password: c.password || '',
    requestTimeout: (Number(c.timeout) || 120) * 1000,
    connectionTimeout: 15000,
    options: {
      encrypt: !!c.encrypt,
      trustServerCertificate: c.trustServerCertificate !== false,
      enableArithAbort: true
    }
  };
  if (c.instance && c.instance.trim()) cfg.options.instanceName = c.instance.trim();
  else if (c.port) cfg.port = Number(c.port);
  return cfg;
}

function validarConexao(c) {
  if (!c || !c.server || !c.database) {
    throw new Error('Conexão não configurada. Pressione Ctrl+Shift+B para abrir a área do sistema.');
  }
}

async function obterPool(c) {
  validarConexao(c);
  const chave = JSON.stringify(paraMssql(c));
  if (pool && chavePool === chave && pool.connected) return pool;
  await fechar();
  pool = await new sql.ConnectionPool(paraMssql(c)).connect();
  chavePool = chave;
  return pool;
}

async function fechar() {
  if (pool) {
    try { await pool.close(); } catch { /* ignora */ }
  }
  pool = null;
  chavePool = null;
}

async function testar(c) {
  validarConexao(c);
  const p = await new sql.ConnectionPool(paraMssql(c)).connect();
  try {
    const r = await p.request().query(`
      SELECT DB_NAME() AS banco,
             OBJECT_ID(N'dbo.ProdutosProducao')      AS t1,
             OBJECT_ID(N'dbo.ProdutosProducaoItens') AS t2,
             OBJECT_ID(N'dbo.Produtos')              AS t3,
             OBJECT_ID(N'dbo.Movimentações')         AS t4`);
    const l = r.recordset[0];
    const faltando = [];
    if (!l.t1) faltando.push('ProdutosProducao');
    if (!l.t2) faltando.push('ProdutosProducaoItens');
    if (!l.t3) faltando.push('Produtos');
    if (!l.t4) faltando.push('Movimentações');
    return { banco: l.banco, faltando };
  } finally {
    await p.close();
  }
}

// Colunas de data da tabela ProdutosProducao (para o filtro de período)
async function colunasData(c) {
  const p = await obterPool(c);
  const r = await p.request().query(`
    SELECT name FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.ProdutosProducao')
      AND system_type_id IN (40, 42, 43, 58, 61)
    ORDER BY column_id`);
  return r.recordset.map(x => x.name);
}

const NOME_COLUNA = /^[A-Za-z_][A-Za-z0-9_]*$/;
const n = v => (v === null || v === undefined ? 0 : Number(v));
const texto = v => (v === null || v === undefined ? '' : String(v).trim());

/**
 * Mesma lógica da consulta original:
 *  - Quantidade em kg = Quant + QuantUnid / 1000  (ex.: 7/17 = 7,017)
 *  - Custo unitário do insumo = (Custo / Estoque) * Unidades,
 *    da última movimentação com Custo > 0 (Data, NroOrdem, %%physloc%% desc)
 *  - Custo total do insumo = custo unitário * quantidade em kg
 *  - Custo do produto acabado = soma dos custos totais dos insumos
 */
async function consultarCusto(c, filtros = {}) {
  const p = await obterPool(c);
  const req = p.request();
  const where = [];

  // A coluna de data é configurada em cada conexão
  const colData = texto(c.colunaData);
  if (colData && !NOME_COLUNA.test(colData)) {
    throw new Error(`Nome da coluna de data inválido na conexão "${c.nome}".`);
  }

  if (texto(filtros.numeroIni)) { where.push('PP.[Numero] >= @numIni'); req.input('numIni', sql.NVarChar, texto(filtros.numeroIni)); }
  if (texto(filtros.numeroFim)) { where.push('PP.[Numero] <= @numFim'); req.input('numFim', sql.NVarChar, texto(filtros.numeroFim)); }
  if (texto(filtros.produto)) { where.push('PP.[Produto] = @prod'); req.input('prod', sql.NVarChar, texto(filtros.produto)); }
  if (texto(filtros.descricao)) { where.push('PA.[Descricao] LIKE @desc'); req.input('desc', sql.NVarChar, `%${texto(filtros.descricao)}%`); }
  if (colData && filtros.dataIni) { where.push(`PP.[${colData}] >= @dIni`); req.input('dIni', sql.Date, new Date(`${filtros.dataIni}T00:00:00Z`)); }
  if (colData && filtros.dataFim) { where.push(`PP.[${colData}] < DATEADD(DAY, 1, @dFim)`); req.input('dFim', sql.Date, new Date(`${filtros.dataFim}T00:00:00Z`)); }

  const filtroWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const selData = colData ? `, PP.[${colData}] AS DataOrdem` : '';

  const consulta = `
SET NOCOUNT ON;

-- 1) PRODUTOS ACABADOS (ordens de produção)
SELECT
    PP.[Numero]    AS NumeroOrdem,
    PP.[Produto]   AS CodigoProduto,
    PA.[Descricao] AS DescricaoProduto,
    CONVERT(VARCHAR(50), PP.[Quant]) + '/' + CONVERT(VARCHAR(50), PP.[QuantUnid]) AS Quant,
    CAST(PP.[Quant] + (PP.[QuantUnid] / 1000.0) AS DECIMAL(18,4)) AS QuantKg
    ${selData}
FROM [dbo].[ProdutosProducao] PP
LEFT JOIN [dbo].[Produtos] PA ON PP.[Produto] = PA.[Codigo]
${filtroWhere}
ORDER BY PP.[Numero];

-- 2) INSUMOS
SELECT
    PP.[Numero]    AS NumeroOrdem,
    PPI.[Item]     AS ItemSequencia,
    PPI.[Produto]  AS CodigoProduto,
    PI.[Descricao] AS DescricaoProduto,
    CONVERT(VARCHAR(50), PPI.[Quant]) + '/' + CONVERT(VARCHAR(50), PPI.[QuantUnid]) AS Quant,
    CAST(PPI.[Quant] + (PPI.[QuantUnid] / 1000.0) AS DECIMAL(18,4)) AS QuantKg,
    CAST(
        CASE
            WHEN ULT.[Estoque] IS NULL OR ULT.[Estoque] = 0 THEN 0.00
            ELSE ((ULT.[Custo] / ULT.[Estoque]) * ISNULL(PI.[Unidades], 1))
        END
    AS DECIMAL(18,4)) AS CustoUnit,
    CAST(
        CASE
            WHEN ULT.[Estoque] IS NULL OR ULT.[Estoque] = 0 THEN 0.00
            ELSE (((ULT.[Custo] / ULT.[Estoque]) * ISNULL(PI.[Unidades], 1)) * (PPI.[Quant] + (PPI.[QuantUnid] / 1000.0)))
        END
    AS DECIMAL(18,2)) AS CustoTotal,
    CAST(CASE WHEN ULT.[Estoque] IS NULL OR ULT.[Estoque] = 0 THEN 1 ELSE 0 END AS BIT) AS SemCusto
FROM [dbo].[ProdutosProducao] PP
LEFT JOIN [dbo].[Produtos] PA ON PP.[Produto] = PA.[Codigo]
INNER JOIN [dbo].[ProdutosProducaoItens] PPI ON PP.[Numero] = PPI.[Numero]
LEFT JOIN [dbo].[Produtos] PI ON PPI.[Produto] = PI.[Codigo]
OUTER APPLY (
    SELECT TOP 1 M.[Estoque], M.[Custo]
    FROM [dbo].[Movimentações] M
    WHERE M.[Produto] = PPI.[Produto]
      AND M.[Estoque] IS NOT NULL
      AND M.[Custo] > 0
    ORDER BY M.[Data] DESC, M.[NroOrdem] DESC, %%physloc%% DESC
) AS ULT
${filtroWhere}
ORDER BY PP.[Numero], PPI.[Item];`;

  const r = await req.query(consulta);
  const [rsOrdens = [], rsInsumos = []] = r.recordsets;

  const mapa = new Map();
  const ordens = rsOrdens.map(o => {
    const ordem = {
      numero: o.NumeroOrdem,
      data: o.DataOrdem ?? null,
      codigo: o.CodigoProduto,
      descricao: texto(o.DescricaoProduto),
      quant: o.Quant ?? '',
      quantKg: n(o.QuantKg),
      insumos: []
    };
    mapa.set(String(o.NumeroOrdem), ordem);
    return ordem;
  });

  for (const i of rsInsumos) {
    const o = mapa.get(String(i.NumeroOrdem));
    if (!o) continue;
    o.insumos.push({
      item: i.ItemSequencia,
      codigo: i.CodigoProduto,
      descricao: texto(i.DescricaoProduto),
      quant: i.Quant ?? '',
      quantKg: n(i.QuantKg),
      custoUnit: n(i.CustoUnit),
      custoTotal: n(i.CustoTotal),
      semCusto: !!i.SemCusto
    });
  }

  for (const o of ordens) {
    // soma em centavos para não acumular erro de ponto flutuante (igual ao SUM do SQL)
    const centavos = o.insumos.reduce((s, i) => s + Math.round(i.custoTotal * 100), 0);
    o.custoTotal = centavos / 100;
    o.custoKg = o.quantKg > 0 ? o.custoTotal / o.quantKg : 0;
    o.insumosSemCusto = o.insumos.filter(i => i.semCusto).length;
  }

  return { ordens, geradoEm: new Date().toISOString(), comData: !!colData };
}

module.exports = { testar, colunasData, consultarCusto, fechar };
