// =====================================================================
// CONSULTAS DA ANÁLISE DE CRÉDITO — versão 1.4
// Base: "CONSULTA DEFINITIVA - RANKING CORRIGIDO E OBSERVAÇÃO DE NEGÓCIO"
//
// Regras do script novo:
//  - Score calculado pelo HISTÓRICO COMPLETO de compras do cliente
//    (o período filtra quem aparece e os números "do período").
//  - @AbaterST: soma o ICMS-ST do item (ICMSFItem) ao valor dos pedidos.
//  - Atraso médio do score: só pagamentos dos últimos @MesesHistoricoAtraso meses
//    (Contas Recebidas com NroRef). Contagens de pontualidade: histórico completo.
//  - Grupo do ranking por faixa fixa de score (calculado no app, regras editáveis).
//  - Média por mês, dias sem comprar, frequência média e uso do limite.
//
// Mantido da otimização 1.2: um lote só, tabelas temporárias, OPTION (RECOMPILE).
// Como o score agora só depende dos dados do próprio cliente, a consulta lê o
// histórico apenas dos clientes que entram no filtro (o script lia a base toda).
// =====================================================================

const HEADER = `
SET NOCOUNT ON;
DECLARE @CodigoCliente CHAR(5) = NULLIF(LTRIM(RTRIM(@pCodigoCliente)), '');
DECLARE @DataVendaInicial DATE = TRY_CONVERT(DATE, @pDataInicial, 23);
DECLARE @DataVendaFinal DATE = TRY_CONVERT(DATE, @pDataFinal, 23);
DECLARE @StatusCliente VARCHAR(10) = NULLIF(@pStatusCliente, '');
DECLARE @Bloqueado CHAR(1) = NULLIF(@pBloqueado, '');
DECLARE @SomenteClientesSemCompra CHAR(1) = NULLIF(@pSomenteSemCompra, '');
DECLARE @AbaterRetornos BIT = @pAbaterRetornos;
DECLARE @AbaterST BIT = @pSomarST;                          -- soma o ICMS-ST (ICMSFItem)
DECLARE @MesesHistoricoAtraso INT = NULLIF(@pMesesAtraso, 0); -- 0 = histórico completo
`;

const etapa = (nome) => `
SET @n = @@ROWCOUNT;
INSERT INTO #Tempos (Etapa, Ms, Linhas) VALUES ('${nome}', DATEDIFF(MILLISECOND, @t, SYSDATETIME()), @n);
SET @t = SYSDATETIME();`;

const ANALISE = HEADER + `
DECLARE @t DATETIME2 = SYSDATETIME(), @n INT;
DECLARE @Hoje DATETIME = GETDATE();
CREATE TABLE #Tempos (Ordem INT IDENTITY(1,1), Etapa VARCHAR(80), Ms INT, Linhas INT);

-- 1) Clientes do filtro (status, bloqueio e movimentação no período)
SELECT c.Codigo
INTO #Cli
FROM Clientes c
WHERE (@CodigoCliente IS NULL OR c.Codigo = @CodigoCliente)
  AND (@StatusCliente IS NULL OR
       (@StatusCliente = 'Ativo' AND ISNULL(c.Tipo, '') NOT IN ('B','D')) OR
       (@StatusCliente = 'Bloqueado' AND c.Tipo = 'B') OR
       (@StatusCliente = 'Desativado' AND c.Tipo = 'D'))
  AND (@Bloqueado IS NULL OR
       (@Bloqueado = 'S' AND ISNULL(c.MotBloqVnd, '') <> '') OR
       (@Bloqueado = 'N' AND ISNULL(c.MotBloqVnd, '') = ''))
  -- normal: só quem teve pedido no período; "Somente sem compra": só quem NÃO teve
  AND (@DataVendaInicial IS NULL
       OR (ISNULL(@SomenteClientesSemCompra, '') <> 'S' AND EXISTS (
            SELECT 1 FROM Pedidos p
            WHERE p.CodClFo = c.Codigo
              AND p.Data >= @DataVendaInicial
              AND (@DataVendaFinal IS NULL OR p.Data <= @DataVendaFinal)))
       OR (@SomenteClientesSemCompra = 'S' AND NOT EXISTS (
            SELECT 1 FROM Pedidos p
            WHERE p.CodClFo = c.Codigo
              AND p.Data >= @DataVendaInicial
              AND (@DataVendaFinal IS NULL OR p.Data <= @DataVendaFinal))))
OPTION (RECOMPILE);
${etapa('Clientes do filtro')}
CREATE UNIQUE CLUSTERED INDEX IX_Cli ON #Cli (Codigo);

-- 2) Pedidos do histórico completo desses clientes (com ICMS-ST opcional)
SELECT
    p.Numero, p.CodClFo, p.Data AS DataPedido, p.NroRef, o.TipoOp, p.Vendedor,
    SUM(ip.ValorTotal + CASE WHEN @AbaterST = 1 THEN ISNULL(ip.ICMSFItem, 0) ELSE 0 END) AS TotalPedido
INTO #Ped
FROM #Cli k
JOIN Pedidos p ON p.CodClFo = k.Codigo
JOIN [Itens de Pedido] ip ON ip.Numero = p.Numero
LEFT JOIN Operações o ON o.codigo = p.CodOp
GROUP BY p.Numero, p.CodClFo, p.Data, p.NroRef, o.TipoOp, p.Vendedor
OPTION (RECOMPILE);
${etapa('Pedidos (histórico completo)')}
CREATE CLUSTERED INDEX IX_Ped ON #Ped (CodClFo, DataPedido);
CREATE NONCLUSTERED INDEX IX_Ped_Num ON #Ped (Numero) INCLUDE (TipoOp, DataPedido);

-- 3) Histórico de compras (HistoricoTotal / ResumoCompleto)
SELECT
    CodClFo AS ClienteID,
    SUM(TotalPedido) AS TotalComprado,
    MAX(TotalPedido) AS MaiorCompra,
    AVG(TotalPedido) AS MediaCompra,
    COUNT(*) AS QtdPedidosVenda,
    MIN(DataPedido) AS PrimeiraCompra,
    MAX(DataPedido) AS UltimaCompra,
    DATEDIFF(MONTH, MIN(DataPedido), @Hoje) AS MesesRelacionamento
INTO #Hist
FROM #Ped
WHERE TipoOp = 'V'
GROUP BY CodClFo;

SELECT ClienteID,
       MAX(CASE WHEN RnUlt = 1 THEN Vendedor END) AS VendedorUltimaCompra,
       MAX(CASE WHEN RnPri = 1 THEN Vendedor END) AS VendedorPrimeiraCompra
INTO #Vend
FROM (
    SELECT CodClFo AS ClienteID, Vendedor,
           ROW_NUMBER() OVER (PARTITION BY CodClFo ORDER BY DataPedido DESC, Numero DESC) AS RnUlt,
           ROW_NUMBER() OVER (PARTITION BY CodClFo ORDER BY DataPedido ASC, Numero ASC) AS RnPri
    FROM #Ped
    WHERE TipoOp = 'V'
) x
WHERE RnUlt = 1 OR RnPri = 1
GROUP BY ClienteID;
${etapa('Histórico de compras')}

-- 4) Números do período (StatsFiltradas / TotalVendasPeriodo)
SELECT
    CodClFo AS ClienteID,
    COUNT(*) AS QtdPedidos,
    SUM(CASE WHEN TipoOp = 'B' THEN 1 ELSE 0 END) AS QtdPedidosBonificados,
    SUM(CASE WHEN TipoOp IN ('R', 'D') THEN 1 ELSE 0 END) AS QtdDevolucoes,
    SUM(CASE WHEN TipoOp = 'V' THEN TotalPedido ELSE 0 END) AS VendasPeriodo,
    COUNT(CASE WHEN TipoOp = 'V' THEN 1 END) AS QtdVendasPeriodo
INTO #Per
FROM #Ped
WHERE (@DataVendaInicial IS NULL OR DataPedido >= @DataVendaInicial)
  AND (@DataVendaFinal IS NULL OR DataPedido <= @DataVendaFinal)
GROUP BY CodClFo;

-- devoluções (qualquer data) das vendas feitas no período, por cliente
SELECT d.CodClFo AS ClienteID, SUM(d.TotalPedido) AS ValorRetorno
INTO #RetPer
FROM #Ped d
JOIN #Ped v ON v.Numero = d.NroRef
WHERE @AbaterRetornos = 1
  AND d.TipoOp IN ('R', 'D')
  AND v.TipoOp = 'V'
  AND (@DataVendaInicial IS NULL OR v.DataPedido >= @DataVendaInicial)
  AND (@DataVendaFinal IS NULL OR v.DataPedido <= @DataVendaFinal)
GROUP BY d.CodClFo
OPTION (RECOMPILE);
${etapa('Números do período')}

-- 5) Contas recebidas (com NroRef)
--    janela do score = últimos @MesesHistoricoAtraso meses; contagens = histórico completo
SELECT
    crd.Codigo,
    AVG(CASE WHEN crd.DataPag IS NOT NULL AND crd.NroRef IS NOT NULL
              AND (@MesesHistoricoAtraso IS NULL OR crd.DataPag >= DATEADD(MONTH, -@MesesHistoricoAtraso, @Hoje))
             THEN CAST(DATEDIFF(DAY, crd.DataVen, crd.DataPag) AS FLOAT) END) AS AtrasoMedioScore,
    SUM(CASE WHEN crd.DataPag IS NOT NULL AND crd.NroRef IS NOT NULL
              AND (@MesesHistoricoAtraso IS NULL OR crd.DataPag >= DATEADD(MONTH, -@MesesHistoricoAtraso, @Hoje))
             THEN 1 ELSE 0 END) AS ParcelasPagasJanela,
    SUM(CASE WHEN crd.DataPag IS NOT NULL AND crd.NroRef IS NOT NULL THEN 1 ELSE 0 END) AS TotalParcelasPagas,
    -- por data, ignorando horas (CONVERT 120 do script = comparar só a data)
    SUM(CASE WHEN crd.DataPag IS NOT NULL AND crd.NroRef IS NOT NULL AND CAST(crd.DataPag AS DATE) = CAST(crd.DataVen AS DATE)
             THEN 1 ELSE 0 END) AS PagPontual,
    SUM(CASE WHEN crd.DataPag IS NOT NULL AND crd.NroRef IS NOT NULL AND CAST(crd.DataPag AS DATE) > CAST(crd.DataVen AS DATE)
             THEN 1 ELSE 0 END) AS PagAtraso,
    SUM(CASE WHEN crd.DataPag IS NOT NULL AND crd.NroRef IS NOT NULL AND CAST(crd.DataPag AS DATE) < CAST(crd.DataVen AS DATE)
             THEN 1 ELSE 0 END) AS PagAdiantado,
    SUM(crd.ValPre) AS TotalRecebido
INTO #Rec
FROM #Cli k
JOIN [Contas Recebidas] crd ON crd.Codigo = k.Codigo
GROUP BY crd.Codigo
OPTION (RECOMPILE);

-- maior valor pago por título (para a inadimplência)
SELECT crd.Codigo, crd.DocPag, MAX(crd.ValPre) AS MaxValPre
INTO #RecDoc
FROM #Cli k
JOIN [Contas Recebidas] crd ON crd.Codigo = k.Codigo
WHERE crd.DocPag IS NOT NULL
GROUP BY crd.Codigo, crd.DocPag
OPTION (RECOMPILE);
${etapa('Contas recebidas')}

-- 6) Contas a receber: débito e inadimplência
SELECT
    cr.Codigo,
    SUM(cr.ValPre) AS Debito,
    SUM(CASE WHEN cr.DataVen < @Hoje AND (d.MaxValPre IS NULL OR cr.ValPre IS NULL OR d.MaxValPre < cr.ValPre)
             THEN cr.ValPre ELSE 0 END) AS ValorInadimplente,
    SUM(CASE WHEN cr.DataVen < @Hoje AND (d.MaxValPre IS NULL OR cr.ValPre IS NULL OR d.MaxValPre < cr.ValPre)
             THEN 1 ELSE 0 END) AS QtdParcelasVencidas
INTO #Arec
FROM #Cli k
JOIN [Contas a Receber] cr ON cr.Codigo = k.Codigo
LEFT JOIN #RecDoc d ON d.Codigo = cr.Codigo AND d.DocPag = cr.DocPag
WHERE cr.NroRef IS NOT NULL
GROUP BY cr.Codigo
OPTION (RECOMPILE);
${etapa('Contas a receber')}

-- 7) Vendas a prazo do período para o limite matemático (VendasPeriodo do script):
--    (ValorTotal - Desconto + ICMS-ST), pedidos sem NroRef, operações com prazo, Data < data final
SELECT P.CodClFo, SUM((I.ValorTotal - ISNULL(I.DescontoTotal, 0)) + ISNULL(I.ICMSFItem, 0)) * 1.0 AS TotalVendidoPrazo
INTO #VPrazo
FROM #Cli k
JOIN Pedidos P ON P.CodClFo = k.Codigo
JOIN Operações O ON P.CodOp = O.CodOp
JOIN [Itens de Pedido] I ON P.Numero = I.Numero
WHERE @DataVendaInicial IS NOT NULL
  AND P.Data >= @DataVendaInicial
  AND (@DataVendaFinal IS NULL OR P.Data < @DataVendaFinal)
  AND (P.NroRef IS NULL OR P.NroRef = '')
  AND (ISNULL(O.Prazo01, 0) > 0 OR ISNULL(O.Prazo02, 0) > 0 OR ISNULL(O.Prazo03, 0) > 0 OR ISNULL(O.Prazo04, 0) > 0)
GROUP BY P.CodClFo
OPTION (RECOMPILE);
${etapa('Vendas a prazo (limite pelo período)')}

-- RESULTADO 1: clientes com todos os indicadores (score, grupo e alertas são calculados no app)
SELECT
    c.Codigo AS ClienteID,
    c.Nome,
    c.Nome_Fanta,
    c.Tel AS Telefone,
    c.Email,
    ci.Nome AS Cidade,
    c.DataCada AS DataCadastro,
    ISNULL(c.LimPerCred, 0) AS LimiteAtual,
    ISNULL(a.Debito, 0) AS Debito,
    ISNULL(c.LimPerCred, 0) - ISNULL(a.Debito, 0) AS SaldoDisponivel,
    CASE WHEN ISNULL(c.LimPerCred, 0) > 0
         THEN CAST(ISNULL(a.Debito, 0) AS FLOAT) / CAST(c.LimPerCred AS FLOAT) * 100
         ELSE 0 END AS PercentualUsoLimite,
    CASE WHEN c.Tipo = 'B' THEN 'Bloqueado' WHEN c.Tipo = 'D' THEN 'Desativado' ELSE 'Ativo' END AS StatusCliente,
    CASE WHEN ISNULL(c.MotBloqVnd, '') <> '' THEN 'S' ELSE 'N' END AS Bloqueado,

    -- histórico completo
    ISNULL(h.TotalComprado, 0) AS TotalCompradoHistorico,
    ISNULL(h.MaiorCompra, 0) AS MaiorCompra,
    h.MediaCompra,
    ISNULL(CAST(h.MediaCompra AS DECIMAL(15,2)), 0) AS TicketMedio,
    h.PrimeiraCompra,
    h.UltimaCompra,
    ISNULL(h.QtdPedidosVenda, 0) AS QtdPedidosVenda,
    ISNULL(h.MesesRelacionamento, 0) AS MesesRelacionamento,
    DATEDIFF(DAY, h.UltimaCompra, @Hoje) AS DiasSemComprar,
    CASE WHEN ISNULL(h.QtdPedidosVenda, 0) > 1
         THEN DATEDIFF(DAY, h.PrimeiraCompra, h.UltimaCompra) / (h.QtdPedidosVenda - 1)
         ELSE 0 END AS FrequenciaMediaDias,

    -- período
    CASE WHEN ISNULL(pe.QtdVendasPeriodo, 0) > 0
         THEN pe.VendasPeriodo - ISNULL(rp.ValorRetorno, 0) ELSE 0 END AS TotalVendasPeriodo,
    CAST(CASE WHEN ISNULL(pe.QtdVendasPeriodo, 0) > 0 AND @DataVendaInicial IS NOT NULL
              THEN (pe.VendasPeriodo - ISNULL(rp.ValorRetorno, 0))
                   / NULLIF(DATEDIFF(MONTH, @DataVendaInicial, ISNULL(@DataVendaFinal, @Hoje)) + 1, 0)
              ELSE 0 END AS DECIMAL(18,2)) AS MediaMes,
    ISNULL(pe.QtdPedidos, 0) AS QtdPedidos,
    ISNULL(pe.QtdPedidosBonificados, 0) AS QtdPedidosBonificados,
    ISNULL(pe.QtdDevolucoes, 0) AS QtdPedidosDevolucao,

    -- pagamentos
    rc.AtrasoMedioScore,
    CAST(CEILING(ISNULL(rc.AtrasoMedioScore, 0)) AS INT) AS AtrasoMedioDias,
    ISNULL(rc.ParcelasPagasJanela, 0) AS ParcelasPagasJanela,
    ISNULL(rc.TotalParcelasPagas, 0) AS TotalParcelasPagas,
    ISNULL(rc.PagPontual, 0) AS PagPontual,
    ISNULL(rc.PagAtraso, 0) AS PagAtraso,
    ISNULL(rc.PagAdiantado, 0) AS PagAdiantado,
    ISNULL(rc.PagAtraso, 0) AS ParcelasComAtraso,
    CASE WHEN ISNULL(rc.TotalParcelasPagas, 0) > 0
         THEN CAST(rc.PagAtraso AS FLOAT) / CAST(rc.TotalParcelasPagas AS FLOAT) * 100 ELSE 0 END AS PercentualAtraso,
    CASE WHEN ISNULL(rc.TotalParcelasPagas, 0) > 0
         THEN CAST(rc.PagPontual AS FLOAT) / CAST(rc.TotalParcelasPagas AS FLOAT) * 100 ELSE 0 END AS PercentualPontual,
    CASE WHEN ISNULL(rc.TotalParcelasPagas, 0) > 0
         THEN CAST(rc.PagAdiantado AS FLOAT) / CAST(rc.TotalParcelasPagas AS FLOAT) * 100 ELSE 0 END AS PercentualAdiantado,

    ISNULL(vp.TotalVendidoPrazo, 0) AS TotalVendidoPrazo,
    CASE WHEN @DataVendaInicial IS NOT NULL
         THEN DATEDIFF(MONTH, @DataVendaInicial, ISNULL(@DataVendaFinal, @Hoje)) + 1 END AS MesesPeriodo,
    CAST(ISNULL(c.NaoCalcLim, 0) AS INT) AS NaoCalcLim,
    ISNULL(a.ValorInadimplente, 0) AS ValorInadimplente,
    ISNULL(a.QtdParcelasVencidas, 0) AS QtdParcelasVencidas,
    ISNULL(a.Debito, 0) AS TotalAReceber,
    ISNULL(rc.TotalRecebido, 0) AS TotalRecebido,
    v.VendedorUltimaCompra,
    v.VendedorPrimeiraCompra
FROM #Cli k
JOIN Clientes c ON c.Codigo = k.Codigo
OUTER APPLY (SELECT TOP 1 Nome FROM Cidades WHERE Codigo = c.CidEndEnt) ci
LEFT JOIN #Hist h ON h.ClienteID = c.Codigo
LEFT JOIN #Vend v ON v.ClienteID = c.Codigo
LEFT JOIN #Per pe ON pe.ClienteID = c.Codigo
LEFT JOIN #RetPer rp ON rp.ClienteID = c.Codigo
LEFT JOIN #Rec rc ON rc.Codigo = c.Codigo
LEFT JOIN #Arec a ON a.Codigo = c.Codigo
LEFT JOIN #VPrazo vp ON vp.CodClFo = c.Codigo
WHERE (@SomenteClientesSemCompra IS NULL
       OR (@SomenteClientesSemCompra = 'S' AND ISNULL(pe.QtdPedidos, 0) = 0))
OPTION (RECOMPILE);
${etapa('Indicadores dos clientes')}

-- RESULTADO 2: tempos por etapa
SELECT Etapa, Ms, Linhas FROM #Tempos ORDER BY Ordem;

DROP TABLE #Cli, #Ped, #Hist, #Vend, #Per, #RetPer, #Rec, #RecDoc, #Arec, #VPrazo, #Tempos;
`;

// Resumo de vendas por ano/mês (histórico completo), como no PASSO 3 do script:
// vendas no mês da venda; devoluções (com NroRef) abatidas no mês da devolução.
// O app monta o pivô e aplica "Abater devoluções".
const VENDAS_MES = HEADER + `
;WITH
Vendas AS (
    SELECT YEAR(p.Data) AS Ano, MONTH(p.Data) AS Mes,
           SUM(ip.ValorTotal + CASE WHEN @AbaterST = 1 THEN ISNULL(ip.ICMSFItem, 0) ELSE 0 END) AS Valor
    FROM Pedidos p
    JOIN [Itens de Pedido] ip ON ip.Numero = p.Numero
    JOIN Operações o ON o.Codigo = p.CodOp
    WHERE o.TipoOp = 'V'
      AND (@CodigoCliente IS NULL OR p.CodClFo = @CodigoCliente)
    GROUP BY YEAR(p.Data), MONTH(p.Data)
),
Retornos AS (
    SELECT YEAR(p.Data) AS Ano, MONTH(p.Data) AS Mes,
           SUM(ip.ValorTotal + CASE WHEN @AbaterST = 1 THEN ISNULL(ip.ICMSFItem, 0) ELSE 0 END) AS Valor
    FROM Pedidos p
    JOIN [Itens de Pedido] ip ON ip.Numero = p.Numero
    JOIN Operações o ON o.Codigo = p.CodOp
    WHERE o.TipoOp IN ('R', 'D')
      AND p.NroRef IS NOT NULL
      AND (@CodigoCliente IS NULL OR p.CodClFo = @CodigoCliente)
    GROUP BY YEAR(p.Data), MONTH(p.Data)
)
SELECT Ano, Mes, SUM(Vendas) AS Vendas, SUM(Retornos) AS Retornos, 1 AS TemVenda
FROM (
    SELECT Ano, Mes, Valor AS Vendas, 0 AS Retornos FROM Vendas
    UNION ALL
    SELECT Ano, Mes, 0, Valor FROM Retornos
) x
GROUP BY Ano, Mes
ORDER BY Ano, Mes
OPTION (RECOMPILE);
`;

// Leitura do limite atual antes de aplicar (validação)
const LIMITE_CLIENTE = `
SELECT TOP 1 c.Codigo, c.Nome, ISNULL(c.LimPerCred, 0) AS LimiteAtual, CAST(ISNULL(c.NaoCalcLim, 0) AS INT) AS NaoCalcLim
FROM Clientes c
WHERE c.Codigo = @c;
`;

// PASSO 2 do script: aplica o limite (só para quem não está marcado com NaoCalcLim)
const APLICAR_LIMITE = `
SET NOCOUNT ON;
UPDATE Clientes
SET LimPerCred = @novo
WHERE Codigo = @c
  AND ISNULL(NaoCalcLim, 0) = 0;
SELECT @@ROWCOUNT AS Linhas;
`;

module.exports = { ANALISE, VENDAS_MES, LIMITE_CLIENTE, APLICAR_LIMITE };
