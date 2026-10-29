// Relatório 5 — RUPTURA POR FABRICANTE (aba "Rupturaporfabricante" / Planilha10)
// Ruptura = o que foi pedido na pré-venda menos o que foi faturado no pedido,
// em caixas (Unidades por caixa) + unidades fracionadas, com o valor da falta.
// Só pré-vendas com Situacao = 'E' (como na planilha).
const S = require('../lib/sqlbase.cjs');

const PEDIDO_UN = '( PVI.Quant * Pro.Unidades + PVI.QuantUnid )';
const FATURADO_UN = '( ISNULL(IP.Quant,0) * ISNULL(IP.QutUndPro,0) + ISNULL(IP.QuantUnid,0) )';
const FALTA_UN = `( ${PEDIDO_UN} - ${FATURADO_UN} )`;
const FALTA_CX = `CAST( FLOOR( ${FALTA_UN} / NULLIF( Pro.Unidades, 0 ) ) AS INT )`;

function fromRuptura() {
  return `
FROM [dbo].[Prevendas] PV
INNER JOIN [dbo].[PrevendasItens] PVI ON PVI.Ano = PV.Ano AND PVI.Numero = PV.Numero
LEFT JOIN [dbo].[Itens de Pedido] IP ON IP.Numero = PV.Pedido AND IP.Produto = PVI.Produto
INNER JOIN [dbo].[Produtos] Pro ON Pro.Codigo = PVI.Produto
INNER JOIN [dbo].[Clientes] Cli ON Cli.Codigo = PV.Codigo
INNER JOIN [dbo].[ClientesEquipes] CE ON CE.Cliente = PV.Codigo AND CE.Equipe = PV.Equipe
INNER JOIN [dbo].[Equipes de Vendas] EV ON EV.Equipe = PV.Equipe AND EV.Codigo = CE.Setor
LEFT JOIN [dbo].[Fabricantes] Fab ON Fab.Codigo = Pro.Fabricante
LEFT JOIN [dbo].[Pessoal] Pes ON Pes.Codigo = EV.Vendedor
INNER JOIN [dbo].[Operações] op ON op.Codigo = PV.Operacao
WHERE CAST(PV.Data AS DATE) BETWEEN @ini AND @fim
  AND PV.Situacao = 'E'
  AND LTRIM(RTRIM(op.TipoOp)) = 'V'
  AND ${FALTA_UN} > 0`;
}

function consultas() {
  return {
    faltas: `
SELECT
  LTRIM(RTRIM(ISNULL(EV.Equipe,''))) AS Equipe,
  LTRIM(RTRIM(ISNULL(CE.Setor,''))) AS Setor,
  ISNULL(Pes.Nome_Guer,'SEM NOME') AS Vendedor,
  LTRIM(RTRIM(PV.Codigo)) AS CodCliente,
  MAX(ISNULL(Cli.Nome,'SEM NOME')) AS NomeCliente,
  MAX(LTRIM(RTRIM(ISNULL(Cli.Tipo,'')))) AS TipoCliente,
  UPPER(LTRIM(RTRIM(ISNULL(Fab.Nome,'SEM FABRICANTE')))) AS Fabricante,
  LTRIM(RTRIM(PVI.Produto)) AS CodProduto,
  MAX(ISNULL(Pro.Descricao,'SEM NOME')) AS NomeProduto,
  MAX(ISNULL(Pro.Unid,'')) AS Unid,
  MAX(ISNULL(Pro.Unidades,0)) AS Unidades,
  SUM(${FALTA_CX}) AS FaltaCx,
  SUM(${FALTA_UN} - ${FALTA_CX} * Pro.Unidades) AS FaltaFrac,
  SUM(( PVI.Quant - ISNULL(IP.Quant,0) ) * PVI.Preco
      + ROUND( ROUND( PVI.Preco / NULLIF(Pro.Unidades,0), 6 ) * ( PVI.QuantUnid - ISNULL(IP.QuantUnid,0) ), 2 )) AS ValorTotal,
  COUNT(DISTINCT CAST(PV.Ano AS VARCHAR(10)) + '-' + CAST(PV.Numero AS VARCHAR(20))) AS QtdPedidos
${fromRuptura()}
GROUP BY LTRIM(RTRIM(ISNULL(EV.Equipe,''))), LTRIM(RTRIM(ISNULL(CE.Setor,''))), ISNULL(Pes.Nome_Guer,'SEM NOME'),
         LTRIM(RTRIM(PV.Codigo)), UPPER(LTRIM(RTRIM(ISNULL(Fab.Nome,'SEM FABRICANTE')))), LTRIM(RTRIM(PVI.Produto))`,

    // pedidos distintos por cliente x fabricante
    pedidosFab: `
SELECT
  LTRIM(RTRIM(ISNULL(EV.Equipe,''))) AS Equipe,
  LTRIM(RTRIM(ISNULL(CE.Setor,''))) AS Setor,
  ISNULL(Pes.Nome_Guer,'SEM NOME') AS Vendedor,
  LTRIM(RTRIM(PV.Codigo)) AS CodCliente,
  UPPER(LTRIM(RTRIM(ISNULL(Fab.Nome,'SEM FABRICANTE')))) AS Fabricante,
  COUNT(DISTINCT CAST(PV.Ano AS VARCHAR(10)) + '-' + CAST(PV.Numero AS VARCHAR(20))) AS QtdPedidos
${fromRuptura()}
GROUP BY LTRIM(RTRIM(ISNULL(EV.Equipe,''))), LTRIM(RTRIM(ISNULL(CE.Setor,''))), ISNULL(Pes.Nome_Guer,'SEM NOME'),
         LTRIM(RTRIM(PV.Codigo)), UPPER(LTRIM(RTRIM(ISNULL(Fab.Nome,'SEM FABRICANTE'))))`,

    // pedidos distintos por cliente (todos os fabricantes)
    pedidosCli: `
SELECT
  LTRIM(RTRIM(ISNULL(EV.Equipe,''))) AS Equipe,
  LTRIM(RTRIM(ISNULL(CE.Setor,''))) AS Setor,
  ISNULL(Pes.Nome_Guer,'SEM NOME') AS Vendedor,
  LTRIM(RTRIM(PV.Codigo)) AS CodCliente,
  COUNT(DISTINCT CAST(PV.Ano AS VARCHAR(10)) + '-' + CAST(PV.Numero AS VARCHAR(20))) AS QtdPedidos
${fromRuptura()}
GROUP BY LTRIM(RTRIM(ISNULL(EV.Equipe,''))), LTRIM(RTRIM(ISNULL(CE.Setor,''))), ISNULL(Pes.Nome_Guer,'SEM NOME'),
         LTRIM(RTRIM(PV.Codigo))`
  };
}

function montar(empresa, porBase, filtros) {
  const fabs = S.fabricantesDaEmpresa(empresa);
  const equipeFiltro = S.norm(filtros.equipe || '');
  const setoresFiltro = String(filtros.setor || '')
    .split(',')
    .map((s) => S.norm(s))
    .filter(Boolean);
  const clienteFiltro = filtros.cliente ? S.norm(S.ajustaCodigo(filtros.cliente, 5)) : '';

  const clientes = new Map();
  const equipes = new Set();
  const setores = new Set();
  const chaveCli = (r) => `${S.txt(r.Equipe)}|${S.txt(r.Setor)}|${S.txt(r.Vendedor)}|${S.norm(r.CodCliente)}`;
  const passa = (r) =>
    (!equipeFiltro || S.norm(r.Equipe) === equipeFiltro) &&
    (!setoresFiltro.length || setoresFiltro.includes(S.norm(r.Setor))) &&
    (!clienteFiltro || S.norm(r.CodCliente) === clienteFiltro);

  for (const { resultados } of porBase) {
    for (const r of resultados.faltas) {
      equipes.add(S.txt(r.Equipe));
      if (!equipeFiltro || S.norm(r.Equipe) === equipeFiltro) setores.add(S.txt(r.Setor));
      if (!passa(r)) continue;
      const k = chaveCli(r);
      let c = clientes.get(k);
      if (!c) {
        c = {
          equipe: S.txt(r.Equipe), setor: S.txt(r.Setor), vendedor: S.txt(r.Vendedor),
          cod: S.txt(r.CodCliente), nome: S.txt(r.NomeCliente), tipo: S.txt(r.TipoCliente),
          fab: {}, pedidos: 0, produtos: new Map()
        };
        clientes.set(k, c);
      }
      const col = S.colunaFabricante(fabs, r.Fabricante);
      if (!col) continue;
      const f = c.fab[col] || (c.fab[col] = { valor: 0, cx: 0, frac: 0, ped: 0 });
      f.valor += S.num(r.ValorTotal);
      f.cx += S.num(r.FaltaCx);
      f.frac += S.num(r.FaltaFrac);
      const kp = S.txt(r.CodProduto);
      let p = c.produtos.get(kp);
      if (!p) {
        p = { cod: kp, nome: S.txt(r.NomeProduto), col, und: `${S.txt(r.Unid)}/${S.num(r.Unidades)}`, valor: 0, cx: 0, frac: 0, ped: 0 };
        c.produtos.set(kp, p);
      }
      p.valor += S.num(r.ValorTotal);
      p.cx += S.num(r.FaltaCx);
      p.frac += S.num(r.FaltaFrac);
      p.ped += S.num(r.QtdPedidos);
    }
    for (const r of resultados.pedidosCli) {
      const c = passa(r) && clientes.get(chaveCli(r));
      if (c) c.pedidos += S.num(r.QtdPedidos);
    }
    for (const r of resultados.pedidosFab) {
      const c = passa(r) && clientes.get(chaveCli(r));
      if (!c) continue;
      const col = S.colunaFabricante(fabs, r.Fabricante);
      if (col && c.fab[col]) c.fab[col].ped += S.num(r.QtdPedidos);
    }
  }

  const lista = [...clientes.values()].filter((c) => Object.keys(c.fab).length);
  const ord = (c) => `${c.equipe}|${c.setor}|${c.vendedor}|${c.cod}`;
  lista.sort((a, b) => (ord(a) > ord(b) ? 1 : ord(a) < ord(b) ? -1 : 0));

  const colunas = [
    { chave: 'equipe', rotulo: 'Equipe', tipo: 'texto', alinhamento: 'centro' },
    { chave: 'setor', rotulo: 'Setor', tipo: 'texto', alinhamento: 'centro' },
    { chave: 'vendedor', rotulo: 'Vendedor', tipo: 'texto' },
    { chave: 'cliente', rotulo: 'Cliente', tipo: 'texto', larga: true },
    { chave: 'und', rotulo: 'Tipo / UND', tipo: 'texto', alinhamento: 'centro' },
    ...fabs.map((f) => ({ chave: 'f:' + f.chave, rotulo: f.nome, tipo: 'rupt' })),
    { chave: 'pedidos', rotulo: 'Pedidos', tipo: 'inteiro' },
    { chave: 'qtd', rotulo: 'Qtde Ruptura (cx/un)', tipo: 'cxfrac' },
    { chave: 'total', rotulo: 'Total Ruptura', tipo: 'moeda', destaque: true }
  ];

  const somar = (alvo, f) => {
    alvo.valor += f.valor; alvo.cx += f.cx; alvo.frac += f.frac; alvo.ped += f.ped || 0;
  };
  const vazio = () => ({ valor: 0, cx: 0, frac: 0, ped: 0 });

  const linhas = [];
  let grupo = null;
  const geral = { fab: {}, pedidos: 0, tot: vazio(), clientes: 0 };
  const celulasTotais = (acc) => {
    const c = {};
    fabs.forEach((f) => { c['f:' + f.chave] = acc.fab[f.chave] || vazio(); });
    c.pedidos = acc.pedidos;
    c.qtd = { cx: acc.tot.cx, frac: acc.tot.frac };
    c.total = acc.tot.valor;
    return c;
  };
  const fechar = () => {
    if (!grupo) return;
    linhas.push(grupo.linha);
    // a linha do setor já traz os totais do setor (equivale ao "TOTAL SETOR - n CLIENTES")
    Object.assign(grupo.linha.celulas, celulasTotais(grupo));
    grupo.linha.celulas.cliente = `— SETOR — ${grupo.clientes} cliente${grupo.clientes === 1 ? '' : 's'}`;
  };

  lista.forEach((c, i) => {
    const kg = `${c.equipe}|${c.setor}|${c.vendedor}`;
    if (!grupo || grupo.chave !== kg) {
      fechar();
      grupo = {
        chave: kg, fab: {}, pedidos: 0, tot: vazio(), clientes: 0,
        linha: { id: 'g' + i, tipo: 'grupo', celulas: { equipe: c.equipe, setor: c.setor, vendedor: c.vendedor }, filhos: [] }
      };
    }
    const tot = vazio();
    const cel = { cliente: `${c.cod} - ${c.nome}`, und: c.tipo };
    fabs.forEach((f) => {
      const v = c.fab[f.chave] || vazio();
      cel['f:' + f.chave] = v;
      somar(tot, v);
      for (const acc of [grupo, geral]) {
        acc.fab[f.chave] = acc.fab[f.chave] || vazio();
        somar(acc.fab[f.chave], v);
      }
    });
    cel.pedidos = c.pedidos;
    cel.qtd = { cx: tot.cx, frac: tot.frac };
    cel.total = tot.valor;
    for (const acc of [grupo, geral]) {
      acc.pedidos += c.pedidos;
      acc.clientes++;
      somar(acc.tot, { ...tot, ped: 0 });
    }
    const filhos = [...c.produtos.values()]
      .sort((a, b) => (a.col + a.cod > b.col + b.cod ? 1 : -1))
      .map((p, j) => ({
        id: `c${i}p${j}`,
        tipo: 'filho',
        celulas: {
          cliente: `${p.cod} - ${p.nome}`,
          und: p.und,
          ['f:' + p.col]: { valor: p.valor, cx: p.cx, frac: p.frac, ped: p.ped },
          pedidos: p.ped,
          qtd: { cx: p.cx, frac: p.frac },
          total: p.valor
        }
      }));
    grupo.linha.filhos.push({ id: 'c' + i, tipo: 'dado', celulas: cel, filhos });
  });
  fechar();
  if (lista.length) {
    linhas.push({ id: 'total', tipo: 'total', celulas: { equipe: 'TOTAL GERAL', cliente: `${geral.clientes} cliente${geral.clientes === 1 ? '' : 's'} com ruptura`, ...celulasTotais(geral) } });
  }

  return {
    titulo: 'Ruptura por fabricante — consolidado',
    colunas,
    linhas,
    vazio: 'Nenhuma ruptura encontrada no período.',
    listas: { equipe: [...equipes].filter(Boolean).sort(), setor: [...setores].filter(Boolean).sort((a, b) => (Number(a) || 0) - (Number(b) || 0)) },
    resumo: [
      { rotulo: 'Valor em ruptura', valor: geral.tot.valor, tipo: 'moeda' },
      { rotulo: 'Caixas faltantes', valor: geral.tot.cx, tipo: 'inteiro' },
      { rotulo: 'Unidades avulsas', valor: geral.tot.frac, tipo: 'inteiro' },
      { rotulo: 'Clientes afetados', valor: geral.clientes, tipo: 'inteiro' },
      { rotulo: 'Pedidos', valor: geral.pedidos, tipo: 'inteiro' }
    ]
  };
}

module.exports = {
  id: 'ruptura',
  nome: 'Ruptura por fabricante',
  descricao: 'Pedido na pré-venda x faturado: caixas, unidades e valor da falta',
  usaDeduzir: false,
  filtrosLista: [
    { chave: 'equipe', rotulo: 'Equipe', dinamica: true, local: true },
    { chave: 'setor', rotulo: 'Setor', dinamica: true, local: true, multipla: true }
  ],
  filtrosTexto: [{ chave: 'cliente', rotulo: 'Cód. cliente', local: true }],
  consultas,
  montar
};
