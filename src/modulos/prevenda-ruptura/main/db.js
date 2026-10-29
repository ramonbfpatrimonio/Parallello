// Acesso ao SQL Server do ERP (mesmas tabelas em todos os clientes).
// Todas as consultas são parametrizadas; a geração de PV roda numa única transação.
const sql = require('mssql');

const pools = new Map(); // id da conexão -> { chave, pool }

function montarConfig(c, senha) {
  let server = String(c.servidor || '').trim();
  let instanceName = String(c.instancia || '').trim() || undefined;
  if (server.includes('\\')) {
    const [s, inst] = server.split('\\');
    server = s;
    instanceName = instanceName || inst;
  }
  const cfg = {
    server,
    database: c.banco,
    user: c.usuario,
    password: senha,
    connectionTimeout: 15000,
    requestTimeout: 180000,
    pool: { max: 5, min: 0, idleTimeoutMillis: 60000 },
    options: {
      encrypt: !!c.encrypt,
      trustServerCertificate: true,
      enableArithAbort: true,
      useUTC: false,
    },
  };
  if (c.porta) cfg.port = Number(c.porta);
  else if (instanceName) cfg.options.instanceName = instanceName;
  return cfg;
}

async function obterPool(c, senha) {
  const chave = JSON.stringify([c.servidor, c.porta, c.instancia, c.banco, c.usuario, senha, c.encrypt]);
  const atual = pools.get(c.id);
  if (atual && atual.chave === chave && atual.pool.connected) return atual.pool;
  if (atual) { try { await atual.pool.close(); } catch {} pools.delete(c.id); }
  const pool = new sql.ConnectionPool(montarConfig(c, senha));
  pool.on('error', () => {});
  await pool.connect();
  pools.set(c.id, { chave, pool });
  return pool;
}

async function testarConexao(c, senha) {
  const pool = new sql.ConnectionPool(montarConfig(c, senha));
  try {
    await pool.connect();
    const r = await pool.request().query('SELECT @@SERVERNAME AS servidor, DB_NAME() AS banco, @@VERSION AS versao');
    return r.recordset[0];
  } finally {
    try { await pool.close(); } catch {}
  }
}

async function fecharTodos() {
  for (const { pool } of pools.values()) { try { await pool.close(); } catch {} }
  pools.clear();
}

// ------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------
const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
const pad = (v, n) => txt(v).padStart(n, '0');

function dataSQL(d) {
  // aceita 'yyyy-mm-dd' e devolve Date local à meia-noite
  const [a, m, dia] = String(d).slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, dia);
}

// Converte uma linha do banco na linha de ruptura (mesma regra da planilha)
function montarLinha(r) {
  let upc = num(r.UNID_POR_CAIXA);
  if (upc <= 0) upc = 1;
  const pvCx = num(r.PV_CAIXAS), pvUn = num(r.PV_UNIDADES);
  const pdCx = num(r.PD_CAIXAS), pdUn = num(r.PD_UNIDADES);
  const estoque = num(r.ESTOQUE), compra = num(r.COMPRA);
  const pvTotal = pvCx * upc + pvUn;
  const pdTotal = pdCx * upc + pdUn;
  const falta = pvTotal - pdTotal;
  const quebra = (u) => {
    const cx = Math.floor(u / upc);
    return { cx, un: Math.round((u - cx * upc) * 1000) / 1000 };
  };
  const f = quebra(Math.max(falta, 0));
  const e = quebra(Math.max(estoque, 0));
  const c = quebra(Math.max(compra, 0));
  const novaPV = txt(r.NOVA_PV_GERADA);
  const pos = num(r.POSICAO_RUPTURA);
  let situacaoEstoque = 'ok';
  if (estoque <= 0) situacaoEstoque = 'zerado';
  else if (estoque < falta) situacaoEstoque = 'parcial';

  return {
    chave: `${txt(r.ANO)}-${txt(r.N_PREVENDA)}-${txt(r.PRODUTO)}`,
    ano: txt(r.ANO),
    codCliente: txt(r.COD_CLIENTE),
    nomeCliente: txt(r.NOME_CLIENTE),
    codEquipe: txt(r.COD_EQUIPE),
    nomeEquipe: txt(r.NOME_EQUIPE) || 'SEM EQUIPE',
    numero: txt(r.N_PREVENDA),
    nroPedClie: txt(r.N_PED_CLIENTE),
    produto: txt(r.PRODUTO),
    descricao: txt(r.DESCRICAO),
    fabricante: txt(r.FABRICANTE),
    unid: txt(r.UNID),
    upc,
    dataPV: r.DATA_PV ? new Date(r.DATA_PV).toISOString() : null,
    posicao: pos,
    novaPV,
    novaPVAno: txt(r.NOVA_PV_ANO),
    atendida: novaPV !== '',
    pvCx, pvUn, pdCx, pdUn,
    faltaTotal: falta,
    faltaCx: f.cx, faltaUn: f.un,
    estoqueTotal: estoque, estoqueCx: e.cx, estoqueUn: e.un,
    compraTotal: compra, compraCx: c.cx, compraUn: c.un,
    situacaoEstoque,
  };
}

// ------------------------------------------------------------------
// Consulta principal de rupturas
// ------------------------------------------------------------------
// Regra (igual à planilha): PVs com Situacao = parâmetro (padrão 'E') no período,
// comparando quantidade da PV com o que foi para o pedido ([Itens de Pedido]).
// Melhorias: pedido e estoque são agregados antes do JOIN (evita somar em dobro),
// data final inclui o dia inteiro e o ano da PV original é devolvido.
function sqlRupturas({ comCliente, comFabricante, comPedido }) {
  return `
SET NOCOUNT ON;
WITH PV AS (
  SELECT P.Ano, P.Numero, P.Codigo, P.NroPedClie, P.Pedido, P.Equipe, P.Data,
         RTRIM(pi.Produto) AS Produto,
         SUM(pi.Quant) AS PV_CAIXAS, SUM(pi.QuantUnid) AS PV_UNIDADES
  FROM dbo.Prevendas P
  INNER JOIN dbo.PrevendasItens pi ON P.Ano = pi.Ano AND P.Numero = pi.Numero
  WHERE P.Situacao = @situacao
    AND P.Data >= @dataIni AND P.Data < DATEADD(day, 1, @dataFim)
    ${comCliente ? 'AND RTRIM(P.Codigo) = @cliente' : ''}
    ${comPedido ? 'AND P.NroPedClie LIKE @pedido' : ''}
  GROUP BY P.Ano, P.Numero, P.Codigo, P.NroPedClie, P.Pedido, P.Equipe, P.Data, RTRIM(pi.Produto)
),
PD AS (
  SELECT ip.Numero, RTRIM(ip.Produto) AS Produto,
         SUM(ip.Quant) AS PD_CAIXAS, SUM(ip.QuantUnid) AS PD_UNIDADES
  FROM dbo.[Itens de Pedido] ip
  WHERE ip.Numero IN (SELECT Pedido FROM PV)
  GROUP BY ip.Numero, RTRIM(ip.Produto)
),
EST AS (
  SELECT RTRIM(e.Produto) AS Produto, MAX(e.QuantDisp) AS ESTOQUE, MAX(e.QuantPed) AS COMPRA
  FROM dbo.Estoque e
  WHERE RTRIM(e.Produto) IN (SELECT Produto FROM PV)
  GROUP BY RTRIM(e.Produto)
),
Base AS (
  SELECT
    RTRIM(B.Ano) AS ANO,
    RTRIM(B.Numero) AS N_PREVENDA,
    RTRIM(B.Codigo) AS COD_CLIENTE,
    C.Nome AS NOME_CLIENTE,
    RTRIM(B.Equipe) AS COD_EQUIPE,
    ISNULL(RTRIM(EQ.Nome), 'SEM EQUIPE') AS NOME_EQUIPE,
    RTRIM(ISNULL(B.NroPedClie, '')) AS N_PED_CLIENTE,
    B.Produto AS PRODUTO,
    pr.Descricao AS DESCRICAO,
    f.Nome AS FABRICANTE,
    pr.Unid AS UNID,
    CASE WHEN ISNULL(pr.Unidades, 0) <= 0 THEN 1 ELSE pr.Unidades END AS UNID_POR_CAIXA,
    ISNULL(B.PV_CAIXAS, 0) AS PV_CAIXAS,
    ISNULL(B.PV_UNIDADES, 0) AS PV_UNIDADES,
    ISNULL(PD.PD_CAIXAS, 0) AS PD_CAIXAS,
    ISNULL(PD.PD_UNIDADES, 0) AS PD_UNIDADES,
    ISNULL(EST.ESTOQUE, 0) AS ESTOQUE,
    ISNULL(EST.COMPRA, 0) AS COMPRA,
    B.Data AS DATA_PV,
    REF.NumeroNova AS NOVA_PV_GERADA,
    REF.AnoNova AS NOVA_PV_ANO,
    ROW_NUMBER() OVER (PARTITION BY B.Codigo, B.NroPedClie, B.Produto
                       ORDER BY B.Data ASC, B.Numero ASC) AS POSICAO_RUPTURA
  FROM PV B
  INNER JOIN dbo.Produtos pr ON RTRIM(pr.Codigo) = B.Produto
  INNER JOIN dbo.Fabricantes f ON pr.Fabricante = f.Codigo
  INNER JOIN dbo.Clientes C ON C.Codigo = B.Codigo
  LEFT JOIN dbo.Equipes EQ ON B.Equipe = EQ.Codigo
  LEFT JOIN PD ON PD.Numero = B.Pedido AND PD.Produto = B.Produto
  LEFT JOIN EST ON EST.Produto = B.Produto
  OUTER APPLY (
    SELECT TOP 1 RTRIM(R2.Numero) AS NumeroNova, RTRIM(R2.Ano) AS AnoNova
    FROM dbo.RupturasReferencias R2
    INNER JOIN dbo.Prevendas P2 ON R2.Ano = P2.Ano AND R2.Numero = P2.Numero
    WHERE R2.AnoRef = B.Ano AND R2.NumeroRef = B.Numero
      AND RTRIM(R2.Produto) = B.Produto
    ORDER BY R2.Ano ASC, R2.Numero ASC
  ) REF
  ${comFabricante ? 'WHERE RTRIM(f.Nome) = @fabricante' : ''}
)
SELECT * FROM Base
WHERE (PV_CAIXAS * UNID_POR_CAIXA + PV_UNIDADES) > (PD_CAIXAS * UNID_POR_CAIXA + PD_UNIDADES)
ORDER BY DATA_PV ASC, N_PREVENDA ASC, PRODUTO ASC;`;
}

async function buscarRupturas(pool, filtros, parametros) {
  const cliente = txt(filtros.cliente) ? pad(filtros.cliente, 5) : '';
  const fabricante = txt(filtros.fabricante) && filtros.fabricante !== 'TODOS' ? txt(filtros.fabricante) : '';
  const pedido = txt(filtros.pedido);
  const req = pool.request();
  req.input('situacao', sql.VarChar(5), parametros.situacaoPV || 'E');
  req.input('dataIni', sql.Date, dataSQL(filtros.dataIni));
  req.input('dataFim', sql.Date, dataSQL(filtros.dataFim));
  if (cliente) req.input('cliente', sql.VarChar(20), cliente);
  if (fabricante) req.input('fabricante', sql.VarChar(100), fabricante);
  if (pedido) req.input('pedido', sql.VarChar(60), `%${pedido.replace(/[[%_]/g, '[$&]')}%`);
  const r = await req.query(sqlRupturas({ comCliente: !!cliente, comFabricante: !!fabricante, comPedido: !!pedido }));
  return r.recordset.map(montarLinha).filter((l) => l.faltaTotal > 0);
}

// Resumo "Clientes com rupturas": apenas itens pendentes (sem PV de ruptura gerada)
function resumirClientes(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    if (l.atendida) continue;
    let c = mapa.get(l.codCliente);
    if (!c) {
      c = { codCliente: l.codCliente, nomeCliente: l.nomeCliente, pedidos: new Set(), itensPendentes: 0, primeira: l.dataPV, ultima: l.dataPV };
      mapa.set(l.codCliente, c);
    }
    c.pedidos.add(l.nroPedClie || `PV ${l.numero}`);
    c.itensPendentes++;
    if (l.dataPV && (!c.primeira || l.dataPV < c.primeira)) c.primeira = l.dataPV;
    if (l.dataPV && (!c.ultima || l.dataPV > c.ultima)) c.ultima = l.dataPV;
  }
  return [...mapa.values()]
    .map((c) => ({ ...c, qtdPedidos: c.pedidos.size, pedidos: undefined }))
    .sort((a, b) => b.itensPendentes - a.itensPendentes || a.nomeCliente.localeCompare(b.nomeCliente));
}

async function clientesComRupturas(pool, filtros, parametros) {
  const linhas = await buscarRupturas(pool, { dataIni: filtros.dataIni, dataFim: filtros.dataFim }, parametros);
  return resumirClientes(linhas);
}

async function listarFabricantes(pool) {
  const r = await pool.request().query(`
SELECT RTRIM(Nome) AS Nome FROM dbo.Fabricantes
WHERE Nome IS NOT NULL AND RTRIM(Nome) <> ''
GROUP BY RTRIM(Nome) ORDER BY RTRIM(Nome);`);
  return r.recordset.map((x) => x.Nome);
}

async function buscarClientes(pool, termo) {
  const t = txt(termo);
  if (!t) return [];
  const req = pool.request();
  req.input('cod', sql.VarChar(20), /^\d+$/.test(t) ? pad(t, 5) : t);
  req.input('nome', sql.VarChar(120), `%${t.replace(/[[%_]/g, '[$&]')}%`);
  const r = await req.query(`
SELECT TOP 30 RTRIM(Codigo) AS Codigo, RTRIM(Nome) AS Nome
FROM dbo.Clientes
WHERE RTRIM(Codigo) = @cod OR Nome LIKE @nome
ORDER BY CASE WHEN RTRIM(Codigo) = @cod THEN 0 ELSE 1 END, Nome;`);
  return r.recordset;
}

async function nomeCliente(pool, codigo) {
  const req = pool.request();
  req.input('cod', sql.VarChar(20), pad(codigo, 5));
  const r = await req.query('SELECT TOP 1 RTRIM(Nome) AS Nome FROM dbo.Clientes WHERE RTRIM(Codigo) = @cod');
  return r.recordset[0]?.Nome || null;
}

// ------------------------------------------------------------------
// Validações (usadas na tela e repetidas no servidor antes de gravar)
// ------------------------------------------------------------------
function validarSelecao(itens) {
  const erros = [];
  if (!itens.length) erros.push('Selecione as linhas de ruptura que deseja gerar a pré-venda.');
  if (itens.some((i) => i.atendida)) erros.push('Não é possível criar pré-venda de rupturas já atendidas.');
  const pedidos = new Set(itens.map((i) => i.nroPedClie));
  if (pedidos.size > 1) erros.push('Misturar pedidos diferentes na mesma PV não é permitido.');
  const clientes = new Set(itens.map((i) => i.codCliente));
  if (clientes.size > 1) erros.push('Misturar clientes diferentes na mesma PV não é permitido.');
  const equipes = new Map();
  for (const i of itens) {
    if (!equipes.has(i.nomeEquipe)) equipes.set(i.nomeEquipe, new Set());
    equipes.get(i.nomeEquipe).add(i.numero);
  }
  if (equipes.size > 1) {
    const det = [...equipes.entries()].map(([e, pvs]) => `Equipe: ${e} — PVs: ${[...pvs].join(', ')}`).join('\n');
    erros.push('Existem pré-vendas na seleção de equipes distintas, não é possível gerar a Pré-Venda:\n' + det);
  }
  const prods = new Map();
  for (const i of itens) prods.set(i.produto, (prods.get(i.produto) || 0) + 1);
  const rep = [...prods.entries()].filter(([, n]) => n > 1).map(([p]) => p);
  if (rep.length) erros.push(`O mesmo produto aparece mais de uma vez na seleção (${rep.join(', ')}). Gere uma PV por vez para esses itens.`);
  if (itens.some((i) => i.faltaCx <= 0 && i.faltaUn <= 0)) erros.push('Há linhas sem quantidade em falta.');
  return erros;
}

// ------------------------------------------------------------------
// Geração da pré-venda de ruptura (transação única)
// ------------------------------------------------------------------
async function gerarPreVenda(pool, { itens, usuario, estacao, parametros }) {
  const erros = validarSelecao(itens);
  if (erros.length) throw new Error(erros.join('\n\n'));

  const anoAtual = String(new Date().getFullYear());
  const primeiro = itens[0];
  const pvOrigens = [...new Set(itens.map((i) => i.numero))];
  const obs = `${parametros.textoObs || 'PRE-VENDA DE RUPTURA REFERENCIADA DA PRE VENDA'} ${pvOrigens.join(', ')}`.trim();

  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  let numeroNovo;
  try {
    const R = () => new sql.Request(tx);

    // 1) Nenhum item pode já ter sido atendido (proteção contra duas estações ao mesmo tempo)
    for (const i of itens) {
      const r = await R()
        .input('ano', sql.VarChar(10), i.ano)
        .input('num', sql.VarChar(20), i.numero)
        .input('prod', sql.VarChar(30), i.produto)
        .query(`
SELECT TOP 1 RTRIM(R2.Numero) AS Numero
FROM dbo.RupturasReferencias R2 WITH (UPDLOCK, HOLDLOCK)
INNER JOIN dbo.Prevendas P2 ON R2.Ano = P2.Ano AND R2.Numero = P2.Numero
WHERE R2.AnoRef = @ano AND RTRIM(R2.NumeroRef) = @num AND RTRIM(R2.Produto) = @prod`);
      if (r.recordset.length) {
        throw new Error(`O produto ${i.produto} da PV ${i.numero} já foi atendido pela PV ${r.recordset[0].Numero}. Atualize a consulta.`);
      }
    }

    // 2) Dados do cabeçalho copiados da PV original (no ano DELA, não no ano atual)
    const cab = await R()
      .input('ano', sql.VarChar(10), primeiro.ano)
      .input('num', sql.VarChar(20), primeiro.numero)
      .query(`
SELECT TOP 1 RTRIM(Equipe) AS Equipe, RTRIM(Setor) AS Setor, RTRIM(Vendedor) AS Vendedor, RTRIM(Operacao) AS Operacao
FROM dbo.Prevendas WHERE Ano = @ano AND RTRIM(Numero) = @num`);
    const o = cab.recordset[0] || {};
    const equipe = txt(o.Equipe) || parametros.equipePadrao || '1';
    const setor = txt(o.Setor) || parametros.setorPadrao || '101';
    const vendedor = txt(o.Vendedor) || parametros.vendedorPadrao || '101';
    const operacao = txt(o.Operacao) || parametros.operacaoPadrao || '02';

    // 3) Próximo número com trava (UPDLOCK/HOLDLOCK) — nunca duplica
    const idx = await R()
      .input('ano', sql.VarChar(10), anoAtual)
      .query('SELECT Numero FROM dbo.PrevendasIndice WITH (UPDLOCK, HOLDLOCK) WHERE Ano = @ano');
    let proximo = idx.recordset.length ? num(idx.recordset[0].Numero) + 1 : 1;
    // segurança: se o índice estiver atrasado, pula números que já existem
    for (let tent = 0; tent < 1000; tent++) {
      const ex = await R()
        .input('ano', sql.VarChar(10), anoAtual)
        .input('num', sql.VarChar(20), String(proximo).padStart(6, '0'))
        .query('SELECT 1 AS x FROM dbo.Prevendas WHERE Ano = @ano AND RTRIM(Numero) = @num');
      if (!ex.recordset.length) break;
      proximo++;
    }
    if (idx.recordset.length) {
      await R().input('ano', sql.VarChar(10), anoAtual).input('n', sql.Int, proximo)
        .query('UPDATE dbo.PrevendasIndice SET Numero = @n WHERE Ano = @ano');
    } else {
      await R().input('ano', sql.VarChar(10), anoAtual).input('n', sql.Int, proximo)
        .query('INSERT INTO dbo.PrevendasIndice (Ano, Numero) VALUES (@ano, @n)');
    }
    numeroNovo = String(proximo).padStart(6, '0');

    // 4) Cabeçalho (mesmas colunas e valores da planilha)
    await R()
      .input('ano', sql.VarChar(10), anoAtual)
      .input('num', sql.VarChar(20), numeroNovo)
      .input('equipe', sql.VarChar(20), equipe)
      .input('setor', sql.VarChar(20), setor)
      .input('vendedor', sql.VarChar(20), vendedor)
      .input('cliente', sql.VarChar(20), primeiro.codCliente)
      .input('operacao', sql.VarChar(20), operacao)
      .input('obs', sql.VarChar(500), obs)
      .input('nped', sql.VarChar(60), primeiro.nroPedClie)
      .query(`
INSERT INTO dbo.Prevendas (Ano, Numero, Data, Equipe, Setor, Vendedor, TeleOpera, Situacao, Codigo, Operacao,
  ObsInterna, ObsFatura, Pedido, DataMovSai, NroMovSai, NroPedClie, ModDescCon, Origem, AnoOrigem, NroOrigem,
  SiglaOL, DataVisita, HoraVisita, Latitude, Longitude, NroLocEnt)
VALUES (@ano, @num, GETDATE(), @equipe, @setor, @vendedor, '', '', @cliente, @operacao,
  @obs, '', '', NULL, '', @nped, '', '', '', '',
  '', NULL, '', 0, 0, 0)`);

    // 5) Itens + referência
    for (const i of itens) {
      const pr = await R()
        .input('ano', sql.VarChar(10), i.ano)
        .input('num', sql.VarChar(20), i.numero)
        .input('prod', sql.VarChar(30), i.produto)
        .query(`
SELECT TOP 1 PrecoTab, Preco, PerDesInc, PerDesRep, DescProm, PerDesProm, PerDesCom, ICMSF, CustoComer
FROM dbo.PrevendasItens WHERE Ano = @ano AND RTRIM(Numero) = @num AND RTRIM(Produto) = @prod`);
      let p = pr.recordset[0];
      if (!p) {
        const pv = await R().input('prod', sql.VarChar(30), i.produto)
          .query('SELECT TOP 1 PrecoVenda FROM dbo.Produtos WHERE RTRIM(Codigo) = @prod');
        const preco = num(pv.recordset[0]?.PrecoVenda);
        p = { PrecoTab: preco, Preco: preco };
      }
      await R()
        .input('ano', sql.VarChar(10), anoAtual)
        .input('num', sql.VarChar(20), numeroNovo)
        .input('prod', sql.VarChar(30), i.produto)
        .input('quant', sql.Float, num(i.faltaCx))
        .input('quantUnid', sql.Float, num(i.faltaUn))
        .input('precoTab', sql.Float, num(p.PrecoTab))
        .input('perDesInc', sql.Float, num(p.PerDesInc))
        .input('perDesRep', sql.Float, num(p.PerDesRep))
        .input('descProm', sql.Float, num(p.DescProm))
        .input('perDesProm', sql.Float, num(p.PerDesProm))
        .input('perDesCom', sql.Float, num(p.PerDesCom))
        .input('preco', sql.Float, num(p.Preco))
        .input('icmsf', sql.Float, num(p.ICMSF))
        .input('custo', sql.Float, num(p.CustoComer))
        .query(`
INSERT INTO dbo.PrevendasItens (Ano, Numero, Produto, Combo, Quant, QuantUnid, PrecoTab, PerDesInc, PerDesRep,
  DescProm, PerDesProm, PerDesCom, Preco, ICMSF, CustoComer, BloqFamEsc)
VALUES (@ano, @num, @prod, '', @quant, @quantUnid, @precoTab, @perDesInc, @perDesRep,
  @descProm, @perDesProm, @perDesCom, @preco, @icmsf, @custo, 0)`);

      await R()
        .input('ano', sql.VarChar(10), anoAtual)
        .input('num', sql.VarChar(20), numeroNovo)
        .input('anoRef', sql.VarChar(10), i.ano)
        .input('numRef', sql.VarChar(20), i.numero)
        .input('prod', sql.VarChar(30), i.produto)
        .query(`
INSERT INTO dbo.RupturasReferencias (Ano, Numero, AnoRef, NumeroRef, Produto)
VALUES (@ano, @num, @anoRef, @numRef, @prod)`);
    }

    await tx.commit();
  } catch (e) {
    try { await tx.rollback(); } catch {}
    throw e;
  }

  // 6) Evento do sistema (fora da transação, como na planilha: falha aqui não desfaz a PV)
  const descricao = `Pré-venda de Ruptura gerada via sistema. Num: ${numeroNovo}/${anoAtual} | Cliente: ${primeiro.codCliente} | Pedido Compra: ${primeiro.nroPedClie} | Itens: ${itens.length} | Equipe: ${primeiro.nomeEquipe}`;
  let eventoOk = false;
  if (parametros.registrarEvento !== false) {
    try {
      await registrarEvento(pool, 'P', usuario, estacao, descricao);
      eventoOk = true;
    } catch {}
  }

  return {
    ano: anoAtual,
    numero: numeroNovo,
    qtdItens: itens.length,
    codCliente: primeiro.codCliente,
    nomeCliente: primeiro.nomeCliente,
    nroPedClie: primeiro.nroPedClie,
    nomeEquipe: primeiro.nomeEquipe,
    pvOrigens,
    eventoOk,
    itens: itens.map((i) => ({ produto: i.produto, descricao: i.descricao, faltaCx: i.faltaCx, faltaUn: i.faltaUn, pvOrigem: i.numero })),
  };
}

async function registrarEvento(pool, tipo, usuario, estacao, descricao) {
  const agora = new Date();
  const d = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
  const h = `${String(agora.getHours()).padStart(2, '0')}${String(agora.getMinutes()).padStart(2, '0')}${String(agora.getSeconds()).padStart(2, '0')}`;
  await pool.request()
    .input('data', sql.VarChar(10), d)
    .input('hora', sql.VarChar(6), h)
    .input('tipo', sql.VarChar(2), tipo)
    .input('usuario', sql.VarChar(60), String(usuario || 'USUARIO_NAO_LOGADO').toUpperCase())
    .input('estacao', sql.VarChar(60), estacao || '')
    .input('desc', sql.VarChar(sql.MAX), descricao)
    .query('INSERT INTO dbo.EventosSistema (Data, Hora, Tipo, Usuario, Estacao, Descricao) VALUES (@data, @hora, @tipo, @usuario, @estacao, @desc)');
}

// ------------------------------------------------------------------
// Verificação da estrutura do banco
// ------------------------------------------------------------------
const TABELAS_ERP = ['Prevendas', 'PrevendasItens', 'PrevendasIndice', 'Produtos', 'Fabricantes', 'Clientes', 'Equipes', 'Estoque', 'Itens de Pedido'];
const TABELAS_EXTRAS = ['RupturasReferencias', 'EventosSistema'];

async function verificarTabelas(pool) {
  const todas = [...TABELAS_ERP, ...TABELAS_EXTRAS];
  const r = await pool.request().query(`
SELECT t.name FROM sys.tables t INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
WHERE s.name = 'dbo' AND t.name IN (${todas.map((t) => `'${t}'`).join(',')})`);
  const existentes = new Set(r.recordset.map((x) => x.name.toLowerCase()));
  return todas.map((t) => ({ tabela: t, existe: existentes.has(t.toLowerCase()), extra: TABELAS_EXTRAS.includes(t) }));
}

const SCRIPT_TABELAS = {
  RupturasReferencias: `CREATE TABLE dbo.RupturasReferencias (
  Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  Ano VARCHAR(4) NOT NULL,
  Numero VARCHAR(10) NOT NULL,
  AnoRef VARCHAR(4) NOT NULL,
  NumeroRef VARCHAR(10) NOT NULL,
  Produto VARCHAR(20) NOT NULL
);
CREATE INDEX IX_RupturasReferencias_Ref ON dbo.RupturasReferencias (AnoRef, NumeroRef, Produto);`,
  EventosSistema: `CREATE TABLE dbo.EventosSistema (
  Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  Data DATE NOT NULL,
  Hora CHAR(6) NOT NULL,
  Tipo VARCHAR(2) NOT NULL,
  Usuario VARCHAR(60) NULL,
  Estacao VARCHAR(60) NULL,
  Descricao VARCHAR(MAX) NULL
);`,
};

async function criarTabela(pool, nome) {
  if (!SCRIPT_TABELAS[nome]) throw new Error('Tabela desconhecida: ' + nome);
  const lista = await verificarTabelas(pool);
  if (lista.find((t) => t.tabela === nome)?.existe) return { jaExistia: true };
  for (const parte of SCRIPT_TABELAS[nome].split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
    await pool.request().batch(parte);
  }
  return { criada: true };
}

module.exports = {
  obterPool, testarConexao, fecharTodos,
  buscarRupturas, clientesComRupturas, resumirClientes, listarFabricantes, buscarClientes, nomeCliente,
  gerarPreVenda, validarSelecao, verificarTabelas, criarTabela, SCRIPT_TABELAS,
  montarLinha, sqlRupturas,
};
