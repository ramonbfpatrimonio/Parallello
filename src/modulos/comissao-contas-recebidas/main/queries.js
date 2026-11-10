// SQL portado da planilha COMISSAO_POR_CONTAS_RECEBIDAS.xlsm — agora com parâmetros (sem concatenar valores)

// ---------------------------------------------------------------------------
// Relatório (Módulo1.BuscarDadosBanco)
// Parte 1 = parcelas recebidas (TipoLinha 0) | Parte 2 = itens do pedido (TipoLinha 1)
// Acrescentadas as colunas CodVendedor, NomeFabricante (resumos) e TotalST (chaves de ST)
// ---------------------------------------------------------------------------
const RELATORIO = `
SELECT 0 AS TipoLinha, Ped.Data AS DataPedido, Ped.Numero AS Pedido, CR.DataVen AS Vencimento,
  CR.DataPag AS DataBaixa, Cli.Codigo AS CodCliente, Cli.Nome AS NomeCliente,
  CR.DocPag + ISNULL(' - ' + TD.Abrev_Doc, '') AS Documento,
  (SELECT SUM(IP.ValorTotal) FROM [Itens de Pedido] IP WHERE IP.Numero = Ped.Numero)
    - ISNULL((SELECT SUM(IPR.ValorTotal) FROM [Itens de Pedido] IPR INNER JOIN Pedidos PDev ON PDev.Numero = IPR.Numero WHERE PDev.NroRef = Ped.Numero), 0) AS TotalPedido,
  (CR.ValPre - ISNULL(CR.Desconto, 0)) AS ValorRecebido,
  ROUND(ISNULL((SELECT SUM(ROUND(IP2.ValorTotal * ISNULL(CC2.PerComVen, 0) / 100, 2))
      FROM [Itens de Pedido] IP2
      INNER JOIN Produtos Pro2 ON Pro2.Codigo = IP2.Produto
      LEFT JOIN CidadesComissoes CC2 ON LTRIM(RTRIM(CC2.UF)) = LTRIM(RTRIM(Cli.EstEndEnt))
        AND LTRIM(RTRIM(CC2.Cidade)) = LTRIM(RTRIM(Cli.CidEndEnt))
        AND LTRIM(RTRIM(CC2.Fabricante)) = LTRIM(RTRIM(Pro2.Fabricante))
      WHERE IP2.Numero = Ped.Numero), 0)
    / NULLIF((SELECT SUM(IP2.ValorTotal) FROM [Itens de Pedido] IP2 WHERE IP2.Numero = Ped.Numero), 0) * 100, 2) AS PercComis,
  0 AS ValorComissao, '' AS CodProduto, '' AS DescProduto, NULL AS Quant, NULL AS ValorTotalItem, NULL AS PerFabr, NULL AS ValorComissaoItem,
  Ped.Vendedor AS CodVendedor, NULL AS NomeFabricante,
  -- ICMS-ST do pedido (usado pelas chaves "com ST" das Configurações)
  ISNULL((SELECT SUM(ISNULL(IPS.ICMSFItem, 0)) FROM [Itens de Pedido] IPS WHERE IPS.Numero = Ped.Numero), 0) AS TotalST, NULL AS STItem
FROM Pedidos Ped
INNER JOIN Clientes Cli ON Cli.Codigo = Ped.CodClFo
INNER JOIN [Contas Recebidas] CR ON CR.NroRef = Ped.Numero
LEFT JOIN [Tipos de Documentos a Receber] TD ON TD.Codigo = CR.TipoDoc
WHERE CAST(CR.DataPag AS DATE) >= @baixaInicio AND CAST(CR.DataPag AS DATE) <= @baixaFim
  AND Ped.Data >= @vendaDesde AND Ped.CodOp IN (SELECT CodOp FROM Operações WHERE TipoOp = 'V')
  AND (@vendedor IS NULL OR Ped.Vendedor = @vendedor)
  AND (Ped.CodRet IS NULL OR Ped.CodRet <= 0 OR Ped.NroRef IS NOT NULL)
UNION ALL
SELECT 1 AS TipoLinha, NULL AS DataPedido, Ped.Numero AS Pedido, NULL AS Vencimento, NULL AS DataBaixa, NULL AS CodCliente, NULL AS NomeCliente, NULL AS Documento,
  NULL AS TotalPedido, NULL AS ValorRecebido, NULL AS PercComis, NULL AS ValorComissao,
  IP.Produto + ' - ' + ISNULL(FAB.Nome, '') AS CodProduto,
  Pro.Descricao AS DescProduto,
  IP.Quant - ISNULL(RET.QuantRet, 0) AS Quant,
  IP.ValorTotal - ISNULL(RET.ValorRet, 0) AS ValorTotalItem,
  ISNULL(CC.PerComVen, 0) AS PerFabr,
  -- igual ao Ativo: comissão do item sobre o valor do item (sem tirar o ICMS-ST), descontando devolução
  ROUND((IP.ValorTotal - ISNULL(RET.ValorRet, 0)) * ISNULL(CC.PerComVen, 0) / 100, 2) AS ValorComissaoItem,
  Ped.Vendedor AS CodVendedor, FAB.Nome AS NomeFabricante, NULL AS TotalST, ISNULL(IP.ICMSFItem, 0) AS STItem
FROM Pedidos Ped
INNER JOIN Clientes Cli ON Cli.Codigo = Ped.CodClFo
INNER JOIN [Itens de Pedido] IP ON IP.Numero = Ped.Numero
INNER JOIN Produtos Pro ON Pro.Codigo = IP.Produto
LEFT JOIN Fabricantes FAB ON FAB.Codigo = Pro.Fabricante
LEFT JOIN CidadesComissoes CC ON LTRIM(RTRIM(CC.UF)) = LTRIM(RTRIM(Cli.EstEndEnt))
  AND LTRIM(RTRIM(CC.Cidade)) = LTRIM(RTRIM(Cli.CidEndEnt))
  AND LTRIM(RTRIM(CC.Fabricante)) = LTRIM(RTRIM(Pro.Fabricante))
LEFT JOIN (
  SELECT PedR.NroRef AS Numero, IPR.Produto, SUM(IPR.Quant) AS QuantRet, SUM(IPR.ValorTotal) AS ValorRet
  FROM Pedidos PedR INNER JOIN [Itens de Pedido] IPR ON IPR.Numero = PedR.Numero
  WHERE PedR.NroRef IS NOT NULL
  GROUP BY PedR.NroRef, IPR.Produto
) RET ON RET.Numero = Ped.Numero AND RET.Produto = IP.Produto
WHERE Ped.Data >= @vendaDesde AND Ped.CodOp IN (SELECT CodOp FROM Operações WHERE TipoOp = 'V')
  AND (@vendedor IS NULL OR Ped.Vendedor = @vendedor)
  AND EXISTS (SELECT 1 FROM [Contas Recebidas] CR WHERE CR.NroRef = Ped.Numero
              AND CAST(CR.DataPag AS DATE) >= @baixaInicio AND CAST(CR.DataPag AS DATE) <= @baixaFim)
  AND (Ped.CodRet IS NULL OR Ped.CodRet <= 0 OR Ped.NroRef IS NOT NULL)
ORDER BY Pedido DESC, TipoLinha, CodProduto;
`;

// Módulo4.CriarListaSuspensaVendedores
const VENDEDORES = `
SELECT LTRIM(RTRIM(Codigo)) AS Codigo, LTRIM(RTRIM(Nome_Guer)) AS Nome
FROM Pessoal WHERE Cargo = 'V' AND Situacao = 'A' ORDER BY Nome_Guer;
`;

// Planilha1.Worksheet_Change (busca do nome) — agora carrega a lista toda para autocompletar
const FABRICANTES = `SELECT LTRIM(RTRIM(Codigo)) AS Codigo, LTRIM(RTRIM(Nome)) AS Nome FROM Fabricantes ORDER BY Nome;`;

// ---------------------------------------------------------------------------
// Configuração de comissões (Módulo3)
// "Tipo de Cidade": Todas | Cidade 001 | Outras Cidades
// ---------------------------------------------------------------------------
function filtroCidade(tipo, coluna) {
  if (tipo === 'Cidade 001') return ` AND ${coluna} = '001' `;
  if (tipo === 'Outras Cidades') return ` AND ${coluna} <> '001' `;
  return '';
}

function carregarComissoes(tipo) {
  return `
SELECT CC.Fabricante, F.Nome AS NomeFabricante,
  MAX(CASE WHEN CC.Cidade = '001' THEN CC.PerComVen ELSE 0 END) AS Perc001,
  MAX(CASE WHEN CC.Cidade <> '001' THEN CC.PerComVen ELSE 0 END) AS PercOutras,
  MAX(CC.PerComTel) AS PerComTel,
  MAX(CC.PerDesc) AS PerDesc,
  CASE WHEN MIN(CASE WHEN CC.Cidade <> '001' THEN CC.PerComVen END)
         <> MAX(CASE WHEN CC.Cidade <> '001' THEN CC.PerComVen END) THEN 1 ELSE 0 END AS OutrasVariam
FROM CidadesComissoes CC
INNER JOIN Cidades C ON C.Codigo = CC.Cidade AND C.Estado = CC.UF
INNER JOIN Fabricantes F ON F.Codigo = CC.Fabricante
WHERE C.Estado = @uf ${filtroCidade(tipo, 'CC.Cidade')}
GROUP BY CC.Fabricante, F.Nome
ORDER BY CC.Fabricante;`;
}

function previaComissao(tipo) {
  const w = filtroCidade(tipo, 'C.Codigo');
  return `
SELECT
  (SELECT COUNT(*) FROM CidadesComissoes CC INNER JOIN Cidades C ON C.Codigo = CC.Cidade AND C.Estado = CC.UF
    WHERE C.Estado = @uf AND CC.Fabricante = @fab ${w}) AS Atualizar,
  (SELECT COUNT(*) FROM Cidades C WHERE C.Estado = @uf ${w}
    AND NOT EXISTS (SELECT 1 FROM CidadesComissoes CC WHERE CC.Cidade = C.Codigo AND CC.UF = C.Estado AND CC.Fabricante = @fab)) AS Inserir;`;
}

function atualizarComissao(tipo) {
  return `
UPDATE CC SET
  CC.PerComVen = CASE WHEN CC.Cidade = '001' THEN @p001 ELSE @pOutras END,
  CC.PerComTel = @pTel,
  CC.PerDesc = @pDesc
FROM CidadesComissoes CC
INNER JOIN Cidades C ON C.Codigo = CC.Cidade AND C.Estado = CC.UF
WHERE C.Estado = @uf AND CC.Fabricante = @fab ${filtroCidade(tipo, 'C.Codigo')};`;
}

function inserirComissao(tipo) {
  return `
INSERT INTO CidadesComissoes (UF, Cidade, Fabricante, PerDesc, PerComVen, PerComTel)
SELECT C.Estado, C.Codigo, @fab, @pDesc, CASE WHEN C.Codigo = '001' THEN @p001 ELSE @pOutras END, @pTel
FROM Cidades C
WHERE C.Estado = @uf ${filtroCidade(tipo, 'C.Codigo')}
  AND NOT EXISTS (SELECT 1 FROM CidadesComissoes CC WHERE CC.Cidade = C.Codigo AND CC.UF = C.Estado AND CC.Fabricante = @fab);`;
}

function excluirComissao(tipo) {
  return `
DELETE CC
FROM CidadesComissoes CC
INNER JOIN Cidades C ON C.Codigo = CC.Cidade AND C.Estado = CC.UF
WHERE C.Estado = @uf AND CC.Fabricante = @fab ${filtroCidade(tipo, 'C.Codigo')};`;
}

module.exports = {
  RELATORIO,
  VENDEDORES,
  FABRICANTES,
  carregarComissoes,
  previaComissao,
  atualizarComissao,
  inserirComissao,
  excluirComissao
};
