// Acesso ao ERP (SQL Server) — somente consultas parametrizadas
const sql = require('mssql');
const Q = require('./queries');

const UFS = 'AC,AL,AM,AP,BA,CE,DF,ES,GO,MA,MG,MS,MT,PA,PB,PE,PI,PR,RJ,RN,RO,RR,RS,SC,SE,SP,TO'.split(',');
const TIPOS_CIDADE = ['Todas', 'Cidade 001', 'Outras Cidades'];

const pools = new Map(); // id -> { chave, promessa }

function montarConfig(c) {
  let servidor = String(c.servidor || '').trim();
  let instancia = null;
  if (servidor.includes('\\')) [servidor, instancia] = servidor.split('\\');
  const cfg = {
    server: servidor,
    database: String(c.banco || '').trim(),
    user: c.usuario || '',
    password: c.senha || '',
    connectionTimeout: 15000,
    requestTimeout: 180000,
    pool: { max: 5, min: 0, idleTimeoutMillis: 60000 },
    options: { encrypt: !!c.criptografar, trustServerCertificate: true, enableArithAbort: true }
  };
  if (instancia) cfg.options.instanceName = instancia;
  else if (c.porta) cfg.port = Number(c.porta);
  return cfg;
}

function traduzirErro(err, c) {
  const msg = (err && (err.originalError?.message || err.message)) || String(err);
  const code = err && (err.code || err.originalError?.code);
  const alvo = c ? `${c.servidor}${c.porta && !String(c.servidor).includes('\\') ? ':' + c.porta : ''}` : 'o servidor';
  if (code === 'ELOGIN') return `Falha no login do banco: ${msg}`;
  if (code === 'ESOCKET' || code === 'ETIMEOUT' || code === 'EINSTLOOKUP')
    return `Não foi possível conectar em ${alvo}. Verifique se o SQL Server está ligado, com TCP/IP habilitado, porta liberada no firewall e (para instância nomeada) o SQL Server Browser ativo. Detalhe: ${msg}`;
  return msg;
}

async function obterPool(c) {
  const chave = JSON.stringify([c.servidor, c.porta, c.banco, c.usuario, c.senha, c.criptografar]);
  const atual = pools.get(c.id);
  if (atual && atual.chave === chave) return atual.promessa;
  if (atual) atual.promessa.then((p) => p.close()).catch(() => {});
  const promessa = new sql.ConnectionPool(montarConfig(c)).connect();
  pools.set(c.id, { chave, promessa });
  promessa.catch(() => pools.delete(c.id));
  return promessa;
}

async function executar(c, fn) {
  try {
    const pool = await obterPool(c);
    return await fn(pool);
  } catch (err) {
    throw new Error(traduzirErro(err, c));
  }
}

async function testar(c) {
  let pool;
  try {
    pool = await new sql.ConnectionPool(montarConfig(c)).connect();
    const r = await pool.request().query('SELECT DB_NAME() AS Banco, @@SERVERNAME AS Servidor, @@VERSION AS Versao');
    const row = r.recordset[0] || {};
    return { banco: row.Banco, servidor: row.Servidor, versao: String(row.Versao || '').split('\n')[0] };
  } catch (err) {
    throw new Error(traduzirErro(err, c));
  } finally {
    if (pool) pool.close().catch(() => {});
  }
}

function paraData(s, rotulo) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`Preencha a data "${rotulo}" corretamente.`);
  const [a, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

async function relatorio(c, f) {
  const baixaInicio = paraData(f.baixaInicio, 'Baixa início');
  const baixaFim = paraData(f.baixaFim, 'Baixa fim');
  const vendaDesde = paraData(f.vendaDesde, 'Vendas a partir de');
  if (baixaFim < baixaInicio) throw new Error('A data final da baixa é anterior à data inicial.');
  let vendedor = null;
  if (f.vendedor !== null && f.vendedor !== undefined && String(f.vendedor).trim() !== '') {
    const s = String(f.vendedor).trim();
    if (!/^\d+$/.test(s)) throw new Error('Código de vendedor inválido.');
    vendedor = parseInt(s, 10);
  }
  return executar(c, async (pool) => {
    const r = await pool
      .request()
      .input('baixaInicio', sql.Date, baixaInicio)
      .input('baixaFim', sql.Date, baixaFim)
      .input('vendaDesde', sql.Date, vendaDesde)
      .input('vendedor', sql.Int, vendedor)
      .query(Q.RELATORIO);
    return r.recordset;
  });
}

async function vendedores(c) {
  return executar(c, async (pool) => {
    const r = await pool.request().query(Q.VENDEDORES);
    return r.recordset.map((v) => ({ codigo: String(v.Codigo), nome: v.Nome || '' }));
  });
}

async function fabricantes(c) {
  return executar(c, async (pool) => {
    const r = await pool.request().query(Q.FABRICANTES);
    return r.recordset.map((v) => ({ codigo: String(v.Codigo), nome: v.Nome || '' }));
  });
}

function validarFiltroConfig(f) {
  const uf = String(f.uf || '').trim().toUpperCase();
  if (!UFS.includes(uf)) throw new Error('Selecione uma UF válida.');
  const tipo = TIPOS_CIDADE.includes(f.tipoCidade) ? f.tipoCidade : 'Todas';
  return { uf, tipo };
}

function numero(v) {
  if (v === null || v === undefined || String(v).trim() === '') return 0;
  let s = String(v).trim().replace('%', '').trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  if (!isFinite(n)) throw new Error(`Valor inválido: ${v}`);
  return n;
}

function validarLinhas(linhas) {
  const vistos = new Set();
  return (linhas || []).map((l) => {
    const fab = String(l.codigo || '').trim();
    if (!fab) throw new Error('Há linha sem código de fabricante.');
    if (vistos.has(fab)) throw new Error(`O fabricante ${fab} aparece mais de uma vez.`);
    vistos.add(fab);
    const v = { fab, p001: numero(l.p001), pOutras: numero(l.pOutras), pTel: numero(l.pTel), pDesc: numero(l.pDesc) };
    for (const k of ['p001', 'pOutras', 'pTel', 'pDesc'])
      if (v[k] < 0 || v[k] > 100) throw new Error(`Percentual fora de 0–100 no fabricante ${fab}.`);
    return v;
  });
}

async function carregarComissoes(c, f) {
  const { uf, tipo } = validarFiltroConfig(f);
  return executar(c, async (pool) => {
    const r = await pool.request().input('uf', sql.VarChar(2), uf).query(Q.carregarComissoes(tipo));
    return r.recordset.map((x) => ({
      codigo: String(x.Fabricante).trim(),
      nome: x.NomeFabricante || '',
      p001: Number(x.Perc001) || 0,
      pOutras: Number(x.PercOutras) || 0,
      pTel: Number(x.PerComTel) || 0,
      pDesc: Number(x.PerDesc) || 0,
      outrasVariam: !!x.OutrasVariam
    }));
  });
}

async function previaComissoes(c, f) {
  const { uf, tipo } = validarFiltroConfig(f);
  const linhas = f.linhas ? validarLinhas(f.linhas) : [{ fab: String(f.codigo || '').trim() }];
  return executar(c, async (pool) => {
    const out = [];
    for (const l of linhas) {
      const r = await pool.request().input('uf', sql.VarChar(2), uf).input('fab', sql.VarChar(20), l.fab).query(Q.previaComissao(tipo));
      out.push({ codigo: l.fab, atualizar: r.recordset[0].Atualizar, inserir: r.recordset[0].Inserir });
    }
    return out;
  });
}

async function salvarComissoes(c, f) {
  const { uf, tipo } = validarFiltroConfig(f);
  const linhas = validarLinhas(f.linhas);
  if (!linhas.length) throw new Error('Nenhum fabricante para salvar.');
  return executar(c, async (pool) => {
    const tx = new sql.Transaction(pool);
    await tx.begin();
    let atualizadas = 0;
    let inseridas = 0;
    try {
      for (const l of linhas) {
        const req = () =>
          new sql.Request(tx)
            .input('uf', sql.VarChar(2), uf)
            .input('fab', sql.VarChar(20), l.fab)
            .input('p001', sql.Decimal(18, 4), l.p001)
            .input('pOutras', sql.Decimal(18, 4), l.pOutras)
            .input('pTel', sql.Decimal(18, 4), l.pTel)
            .input('pDesc', sql.Decimal(18, 4), l.pDesc);
        const u = await req().query(Q.atualizarComissao(tipo));
        const i = await req().query(Q.inserirComissao(tipo));
        atualizadas += u.rowsAffected.reduce((a, b) => a + b, 0);
        inseridas += i.rowsAffected.reduce((a, b) => a + b, 0);
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
    return { atualizadas, inseridas, fabricantes: linhas.length };
  });
}

async function excluirComissao(c, f) {
  const { uf, tipo } = validarFiltroConfig(f);
  const fab = String(f.codigo || '').trim();
  if (!fab) throw new Error('Fabricante não informado.');
  return executar(c, async (pool) => {
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const r = await new sql.Request(tx).input('uf', sql.VarChar(2), uf).input('fab', sql.VarChar(20), fab).query(Q.excluirComissao(tipo));
      await tx.commit();
      return { excluidas: r.rowsAffected.reduce((a, b) => a + b, 0) };
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
  });
}

async function fecharTudo() {
  for (const { promessa } of pools.values()) promessa.then((p) => p.close()).catch(() => {});
  pools.clear();
}

module.exports = {
  UFS,
  testar,
  relatorio,
  vendedores,
  fabricantes,
  carregarComissoes,
  previaComissoes,
  salvarComissoes,
  excluirComissao,
  fecharTudo
};
