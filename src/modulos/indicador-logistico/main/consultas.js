// Consultas SQL (parametrizadas). Parâmetros: @ini, @fim (texto AAAAMMDD) e @cc (centro de custo).
// As tabelas são as mesmas usadas pela planilha INDICADOR_LOGISTICO.xlsm.

const TABELAS_NECESSARIAS = [
  'Pedidos', 'Operações', 'Cargas', 'Prevendas', 'Clientes',
  'Notas a Pagar Programadas', 'NotasPagarCustosContas'
];

// ======================= MODO PADRÃO (dados por pedido) =======================

const PADRAO_PEDIDOS = `
SELECT P.[Numero] AS Numero, P.[Data] AS Data, P.[Carga] AS Carga, P.[CodClFo] AS CodCli,
       CLI.[NroInsc] AS NroInsc, C.[Situacao] AS Situacao, C.[DataAcerto] AS DataAcerto
FROM [dbo].[Pedidos] P
INNER JOIN [dbo].[Operações] O ON P.[CodOp] = O.[Codigo]
LEFT JOIN [dbo].[Cargas] C ON P.[Data] = C.[Data] AND P.[Carga] = C.[Carga]
LEFT JOIN [dbo].[Clientes] CLI ON P.[CodClFo] = CLI.[Codigo]
WHERE P.[Data] >= @ini AND P.[Data] <= @fim AND O.[TipoOp] = 'V'`;

// Retornos (98/99) de pedidos do período. A data do retorno pode ser posterior ao período.
const PADRAO_RETORNOS = `
SELECT R.[Numero] AS Numero, R.[Data] AS Data, R.[CodOp] AS CodOp, R.[NroRef] AS NroRef
FROM [dbo].[Pedidos] R
INNER JOIN [dbo].[Pedidos] PO ON R.[NroRef] = PO.[Numero]
WHERE R.[CodOp] IN (98, 99) AND R.[Data] >= @ini
  AND PO.[Data] >= @ini AND PO.[Data] <= @fim`;

const PADRAO_PREVENDAS = `
SELECT PV.[Pedido] AS Pedido, MIN(PV.[Data]) AS DataPrevenda
FROM [dbo].[Prevendas] PV
INNER JOIN [dbo].[Pedidos] P ON PV.[Pedido] = P.[Numero]
WHERE P.[Data] >= @ini AND P.[Data] <= @fim
GROUP BY PV.[Pedido]`;

const PADRAO_CUSTOS = `
SELECT NPP.[DataEntra] AS DataEntra, NPP.[Codigo] AS Codigo, NPP.[NroNF] AS NroNF, NPCC.[Valor] AS Valor
FROM [dbo].[Notas a Pagar Programadas] NPP
INNER JOIN [dbo].[NotasPagarCustosContas] NPCC
        ON NPP.[Codigo] = NPCC.[Codigo] AND CAST(NPP.[NroNF] AS BIGINT) = CAST(NPCC.[NroNF] AS BIGINT)
WHERE NPP.[DataEntra] >= @ini AND NPP.[DataEntra] <= @fim
  AND CAST(NPCC.[CentCusto] AS VARCHAR(30)) = @cc`;

// ======================= MODO PLANILHA (réplica fiel do VBA) =======================

const PLANILHA_PRINCIPAL = `
WITH Vendas AS (
  SELECT MONTH(P.[Data]) AS Mes, COUNT(P.[Numero]) AS QtdL7
  FROM [dbo].[Pedidos] P
  INNER JOIN [dbo].[Operações] O ON P.[CodOp] = O.[Codigo]
  WHERE P.[Data] >= @ini AND P.[Data] <= @fim AND O.[TipoOp] = 'V'
  GROUP BY MONTH(P.[Data])
),
CargasA AS (
  SELECT MONTH(P.[Data]) AS Mes, COUNT(P.[Numero]) AS QtdCargaA
  FROM [dbo].[Pedidos] P
  INNER JOIN [dbo].[Operações] O ON P.[CodOp] = O.[Codigo]
  INNER JOIN [dbo].[Cargas] C ON P.[Data] = C.[Data] AND P.[Carga] = C.[Carga]
  WHERE P.[Data] >= @ini AND P.[Data] <= @fim AND C.[Situacao] = 'A' AND O.[TipoOp] = 'V'
  GROUP BY MONTH(P.[Data])
),
Retornos99 AS (
  SELECT MONTH(P_Origem.[Data]) AS Mes, COUNT(P_Ret.[Numero]) AS QtdOp99
  FROM [dbo].[Pedidos] P_Ret
  INNER JOIN [dbo].[Pedidos] P_Origem ON P_Ret.[NroRef] = P_Origem.[Numero]
  WHERE P_Ret.[Data] >= @ini AND P_Ret.[Data] <= @fim AND P_Ret.[CodOp] = 99
    AND P_Origem.[Data] >= @ini AND P_Origem.[Data] <= @fim
  GROUP BY MONTH(P_Origem.[Data])
),
Devolucoes AS (
  SELECT MONTH(P_Origem.[Data]) AS Mes, COUNT(P_Ret.[Numero]) AS QtdDevL25
  FROM [dbo].[Pedidos] P_Ret
  INNER JOIN [dbo].[Pedidos] P_Origem ON P_Ret.[NroRef] = P_Origem.[Numero]
  WHERE P_Ret.[Data] >= @ini AND P_Ret.[Data] <= @fim AND P_Ret.[CodOp] IN (98, 99)
    AND P_Origem.[Data] >= @ini AND P_Origem.[Data] <= @fim
  GROUP BY MONTH(P_Origem.[Data])
),
SomaDias AS (
  SELECT Mes, SUM(DiasDaCarga) AS SomaDiasL13
  FROM (
      SELECT MONTH(C.[DataAcerto]) AS Mes,
             DATEDIFF(day, SubCarga.DataPrevenda, C.[DataAcerto]) AS DiasDaCarga
      FROM (
          SELECT DISTINCT P.[Data], P.[Carga], MIN(PV.[Data]) AS DataPrevenda
          FROM [dbo].[Pedidos] P
          INNER JOIN [dbo].[Cargas] C ON P.[Data] = C.[Data] AND P.[Carga] = C.[Carga]
          INNER JOIN [dbo].[Prevendas] PV ON PV.[Pedido] = P.[Numero]
          WHERE P.[Data] >= @ini AND P.[Data] <= @fim AND C.[DataAcerto] IS NOT NULL
          GROUP BY P.[Data], P.[Carga]
      ) SubCarga
      INNER JOIN [dbo].[Cargas] C ON SubCarga.[Data] = C.[Data] AND SubCarga.[Carga] = C.[Carga]
  ) AS ResultadoCarga
  GROUP BY Mes
),
Custos AS (
  SELECT MONTH(NPP.[DataEntra]) AS Mes, SUM(NPCC.[Valor]) AS CustoTotal
  FROM [dbo].[Notas a Pagar Programadas] NPP
  INNER JOIN [dbo].[NotasPagarCustosContas] NPCC
          ON NPP.[Codigo] = NPCC.[Codigo] AND CAST(NPP.[NroNF] AS BIGINT) = CAST(NPCC.[NroNF] AS BIGINT)
  WHERE NPP.[DataEntra] >= @ini AND NPP.[DataEntra] <= @fim
    AND CAST(NPCC.[CentCusto] AS VARCHAR(30)) = @cc
  GROUP BY MONTH(NPP.[DataEntra])
)
SELECT M.[Mes], ISNULL(V.QtdL7, 0) AS QtdL7, ISNULL(CA.QtdCargaA, 0) AS QtdCargaA,
       ISNULL(R.QtdOp99, 0) AS QtdOp99, ISNULL(D.QtdDevL25, 0) AS QtdDevL25,
       ISNULL(S.SomaDiasL13, 0) AS SomaDiasL13, ISNULL(CUS.CustoTotal, 0) AS CustoTotal
FROM (SELECT DISTINCT MONTH([Data]) AS Mes FROM [dbo].[Pedidos] WHERE [Data] >= @ini AND [Data] <= @fim) M
LEFT JOIN Vendas V ON M.[Mes] = V.[Mes]
LEFT JOIN CargasA CA ON M.[Mes] = CA.[Mes]
LEFT JOIN Retornos99 R ON M.[Mes] = R.[Mes]
LEFT JOIN Devolucoes D ON M.[Mes] = D.[Mes]
LEFT JOIN SomaDias S ON M.[Mes] = S.[Mes]
LEFT JOIN Custos CUS ON M.[Mes] = CUS.[Mes]
ORDER BY M.[Mes]`;

const PLANILHA_DICT_VENDAS = `
SELECT MONTH(P.[Data]) AS Mes, CLI.[NroInsc] AS NroInsc, CAST(P.[Data] AS DATE) AS DataPedido, COUNT(P.[Numero]) AS QtdePedidos
FROM [dbo].[Pedidos] P
INNER JOIN [dbo].[Operações] O ON P.[CodOp] = O.[Codigo]
INNER JOIN (SELECT C.[Codigo], C.[NroInsc] FROM [dbo].[Clientes] C WHERE C.[NroInsc] IS NOT NULL) CLI
        ON P.[CodClFo] = CLI.[Codigo]
WHERE P.[Data] >= @ini AND P.[Data] <= @fim AND O.[TipoOp] = 'V'
GROUP BY MONTH(P.[Data]), CLI.[NroInsc], CAST(P.[Data] AS DATE)`;

const PLANILHA_DICT_DEVOLUCOES = `
SELECT MONTH(P_Ret.[Data]) AS Mes, CLI.[NroInsc] AS NroInsc, CAST(P_Ret.[Data] AS DATE) AS DataRetorno, COUNT(P_Ret.[Numero]) AS QtdeRetornos
FROM [dbo].[Pedidos] P_Ret
INNER JOIN [dbo].[Pedidos] P_Origem ON P_Ret.[NroRef] = P_Origem.[Numero]
INNER JOIN (SELECT C.[Codigo], C.[NroInsc] FROM [dbo].[Clientes] C WHERE C.[NroInsc] IS NOT NULL) CLI
        ON P_Origem.[CodClFo] = CLI.[Codigo]
WHERE P_Ret.[Data] >= @ini AND P_Ret.[Data] <= @fim AND P_Ret.[CodOp] IN (98, 99)
  AND P_Origem.[Data] >= @ini AND P_Origem.[Data] <= @fim
GROUP BY MONTH(P_Ret.[Data]), CLI.[NroInsc], CAST(P_Ret.[Data] AS DATE)`;

module.exports = {
  TABELAS_NECESSARIAS,
  PADRAO_PEDIDOS, PADRAO_RETORNOS, PADRAO_PREVENDAS, PADRAO_CUSTOS,
  PLANILHA_PRINCIPAL, PLANILHA_DICT_VENDAS, PLANILHA_DICT_DEVOLUCOES
};
