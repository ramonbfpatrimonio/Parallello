// Consultas de vendas por cliente, usadas pelo Ranking ABC (positivação) e pelo Setor com/sem compra.
// Equivalem aos modos VALOR / POSITIVACAO / QTDE_PREVENDA / PRODUTOS das macros (Módulo5 e Planilha9).
const S = require('./sqlbase.cjs');

const CHAVE = `LTRIM(RTRIM(ISNULL(pv.Equipe,''))), LTRIM(RTRIM(ISNULL(pv.Setor,''))), ${S.VENDEDOR}, ${S.COD_CLIENTE}`;

function consultas() {
  return {
    // valor, quantidade e volume por cliente x fabricante
    cliFab: `
SELECT
  LTRIM(RTRIM(ISNULL(pv.Equipe,''))) AS Equipe,
  LTRIM(RTRIM(ISNULL(pv.Setor,''))) AS Setor,
  ${S.VENDEDOR} AS Vendedor,
  ${S.COD_CLIENTE} AS CodCliente,
  MAX(ISNULL(cli.Nome,'SEM NOME')) AS NomeCliente,
  MAX(ISNULL(cli.Tel,'')) AS Telefone,
  MAX(ISNULL(cli.Email,'')) AS Email,
  ${S.FAB} AS Fabricante,
  ${S.VALOR_E_LIQUIDO},
  ISNULL(SUM(pi.Quant), 0) AS Quant,
  ${S.VOLUME_E_LIQUIDO}
${S.fromVendas(true)}
${S.WHERE_VENDAS}
GROUP BY ${CHAVE}, ${S.FAB}`,

    // quantidade de pré-vendas distintas por cliente
    qtdePV: `
SELECT
  LTRIM(RTRIM(ISNULL(pv.Equipe,''))) AS Equipe,
  LTRIM(RTRIM(ISNULL(pv.Setor,''))) AS Setor,
  ${S.VENDEDOR} AS Vendedor,
  ${S.COD_CLIENTE} AS CodCliente,
  COUNT(DISTINCT ${S.NUM_PV}) AS QtdePreVenda
${S.fromVendas(false, { comCliente: false })}
${S.WHERE_VENDAS}
GROUP BY ${CHAVE}`,

    // dias com compra (positivação)
    dias: `
SELECT DISTINCT
  LTRIM(RTRIM(ISNULL(pv.Equipe,''))) AS Equipe,
  LTRIM(RTRIM(ISNULL(pv.Setor,''))) AS Setor,
  ${S.VENDEDOR} AS Vendedor,
  ${S.COD_CLIENTE} AS CodCliente,
  CAST(pv.Data AS DATE) AS Dia
${S.fromVendas(false, { comCliente: false })}
${S.WHERE_VENDAS}`,

    // produtos comprados por cliente
    produtos: `
SELECT
  LTRIM(RTRIM(ISNULL(pv.Equipe,''))) AS Equipe,
  LTRIM(RTRIM(ISNULL(pv.Setor,''))) AS Setor,
  ${S.VENDEDOR} AS Vendedor,
  ${S.COD_CLIENTE} AS CodCliente,
  ${S.FAB} AS Fabricante,
  LTRIM(RTRIM(pi.Produto)) AS CodProduto,
  MAX(ISNULL(p.Descricao,'SEM DESCRIÇÃO')) AS NomeProduto,
  ISNULL(SUM(pi.Quant), 0) AS Quant,
  ${S.VALOR_E_LIQUIDO},
  COUNT(DISTINCT ${S.NUM_PV}) AS PD
${S.fromVendas(true, { comCliente: false })}
${S.WHERE_VENDAS}
GROUP BY ${CHAVE}, ${S.FAB}, LTRIM(RTRIM(pi.Produto))`
  };
}

// Junta os resultados de todas as bases.
// chaveDe(row) define o agrupamento (ranking usa Equipe|Vendedor|Cliente; setor usa só o código do cliente)
function consolidar(porBase, fabs, chaveDe, deduzir) {
  const clientes = new Map();
  const obter = (r) => {
    const k = chaveDe(r);
    let c = clientes.get(k);
    if (!c) {
      c = {
        chave: k,
        equipe: S.txt(r.Equipe),
        setor: S.txt(r.Setor),
        vendedor: S.txt(r.Vendedor),
        cod: S.txt(r.CodCliente),
        nome: '',
        telefone: '',
        email: '',
        valor: {},
        quant: {},
        volume: {},
        qtdePV: 0,
        dias: new Set(),
        produtos: new Map()
      };
      clientes.set(k, c);
    }
    return c;
  };
  for (const { resultados } of porBase) {
    for (const r of resultados.cliFab) {
      const c = obter(r);
      if (!c.nome) c.nome = S.txt(r.NomeCliente);
      if (!c.telefone) c.telefone = S.txt(r.Telefone);
      if (!c.email) c.email = S.txt(r.Email);
      if (S.txt(r.Setor) > c.setor) c.setor = S.txt(r.Setor); // MAX(Setor) como na planilha
      const col = S.colunaFabricante(fabs, r.Fabricante);
      if (!col) continue;
      c.valor[col] = (c.valor[col] || 0) + S.valorDe(r, deduzir);
      c.quant[col] = (c.quant[col] || 0) + S.num(r.Quant);
      c.volume[col] = (c.volume[col] || 0) + S.volumeDe(r, deduzir);
    }
    for (const r of resultados.qtdePV) obter(r).qtdePV += S.num(r.QtdePreVenda);
    for (const r of resultados.dias) obter(r).dias.add(S.dia(r.Dia));
    for (const r of resultados.produtos) {
      const c = obter(r);
      const k = `${S.txt(r.CodProduto)}`;
      let p = c.produtos.get(k);
      if (!p) {
        p = { cod: S.txt(r.CodProduto), nome: S.txt(r.NomeProduto), fab: S.norm(r.Fabricante), quant: 0, valor: 0, pd: 0 };
        c.produtos.set(k, p);
      }
      p.quant += S.num(r.Quant);
      p.valor += S.valorDe(r, deduzir);
      p.pd += S.num(r.PD);
    }
  }
  for (const c of clientes.values()) {
    c.total = fabs.reduce((s, f) => s + (c.valor[f.chave] || 0), 0);
    c.quantTotal = fabs.reduce((s, f) => s + (c.quant[f.chave] || 0), 0);
  }
  return clientes;
}

module.exports = { consultas, consolidar };
