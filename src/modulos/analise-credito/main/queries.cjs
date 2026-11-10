// =====================================================================
// CONSULTAS DA ANÁLISE DE CRÉDITO (versão otimizada — 1.2)
// Base: SCRIPT DE ANALISE DE CREDITO DE CLIENTE COM ANALISE DE SCORE
// Score e limite continuam calculados pelo PERÍODO filtrado (como no script).
//
// Otimizações em relação à 1.1 (mesmos resultados):
//  - Um único lote em vez de duas consultas em paralelo que recalculavam tudo.
//  - Tabelas temporárias: cada tabela grande é lida UMA vez. As CTEs do script
//    eram reexecutadas a cada uso (PedidosHistoricoCompleto era lida 5+ vezes,
//    duas delas por cliente nas subconsultas de vendedor).
//  - OPTION (RECOMPILE) nos filtros "@Param IS NULL OR coluna = @Param": com um
//    cliente informado o SQL Server passa a usar busca por índice em vez de
//    varrer as tabelas inteiras.
//  - Inadimplência sem NOT EXISTS correlacionado: maior valor pago por título
//    é calculado uma vez e cruzado.
//  - Devoluções só são lidas quando "Abater devoluções" está marcado.
//  - Tempo de cada etapa é medido e devolvido ao app.
//
// Correções mantidas da 1.0: #2 percentil (no score.cjs), #3 pagamento
// antecipado não é atraso, #4 resumo mensal sem duplicar, #5 atraso médio em
// [Contas Recebidas], #6 vendedor da 1ª compra só vendas.
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
`;

// registra o tempo da etapa anterior
const etapa = (nome) => `
SET @n = @@ROWCOUNT;
INSERT INTO #Tempos (Etapa, Ms, Linhas) VALUES ('${nome}', DATEDIFF(MILLISECOND, @t, SYSDATETIME()), @n);
SET @t = SYSDATETIME();`;

const ANALISE = HEADER + `
DECLARE @t DATETIME2 = SYSDATETIME(), @n INT;
DECLARE @Hoje DATETIME = GETDATE();

CREATE TABLE #Tempos (Ordem INT IDENTITY(1,1), Etapa VARCHAR(80), Ms INT, Linhas INT);

-- 1) Pedidos do período (PedidosHistoricoCompleto) — lidos uma única vez
SELECT
    p.Numero, p.CodClFo, p.Data AS DataPedido, o.TipoOp, p.Vendedor,
    SUM(ip.ValorTotal) AS TotalPedido
INTO #Ped
FROM Pedidos p
JOIN [Itens de Pedido] ip ON ip.Numero = p.Numero
LEFT JOIN Operações o ON o.codigo = p.CodOp
WHERE (@CodigoCliente IS NULL OR p.CodClFo = @CodigoCliente)
  AND (@DataVendaInicial IS NULL OR p.Data >= @DataVendaInicial)
  AND (@DataVendaFinal IS NULL OR p.Data <= @DataVendaFinal)
GROUP BY p.Numero, p.CodClFo, p.Data, o.TipoOp, p.Vendedor, p.Setor
OPTION (RECOMPILE);
${etapa('Pedidos do período')}

CREATE CLUSTERED INDEX IX_Ped ON #Ped (CodClFo, DataPedido);

-- 2) Resumo por cliente (ResumoCompleto + StatsFiltradas)
SELECT
    CodClFo AS ClienteID,
    SUM(CASE WHEN TipoOp = 'V' THEN TotalPedido ELSE 0 END) AS TotalComprado,
    MAX(CASE WHEN TipoOp = 'V' THEN TotalPedido END) AS MaiorCompra,
    AVG(CASE WHEN TipoOp = 'V' THEN TotalPedido END) AS MediaCompra,
    MIN(CASE WHEN TipoOp = 'V' THEN DataPedido END) AS PrimeiraCompra,
    MAX(CASE WHEN TipoOp = 'V' THEN DataPedido END) AS UltimaCompra,
    COUNT(CASE WHEN TipoOp = 'V' THEN 1 END) AS QtdPedidosVenda,
    DATEDIFF(MONTH, MIN(CASE WHEN TipoOp = 'V' THEN DataPedido END), @Hoje) AS MesesRelacionamento,
    COUNT(*) AS QtdPedidos,
    SUM(CASE WHEN TipoOp = 'B' THEN 1 ELSE 0 END) AS QtdPedidosBonificados
INTO #Res
FROM #Ped
GROUP BY CodClFo;

-- vendedor da primeira e da última venda
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
${etapa('Resumo por cliente')}

-- 3) Contas recebidas — uma leitura (atraso médio, recebidos, pontuais/atrasados)
SELECT
    crd.Codigo,
    AVG(CASE WHEN crd.DataPag IS NOT NULL AND crd.DataVen IS NOT NULL
             THEN CAST(DATEDIFF(DAY, crd.DataVen, crd.DataPag) AS FLOAT) END) AS AtrasoMedioDias,
    SUM(CASE WHEN crd.DataPag IS NOT NULL AND crd.DataVen IS NOT NULL THEN 1 ELSE 0 END) AS TotalParcelasPagas,
    SUM(CASE WHEN CAST(crd.DataPag AS DATE) > CAST(crd.DataVen AS DATE) THEN 1 ELSE 0 END) AS ParcelasComAtraso,
    SUM(crd.ValPre) AS TotalRecebido,
    SUM(CASE WHEN CAST(crd.DataPag AS DATE) <= CAST(crd.DataVen AS DATE) THEN 1 ELSE 0 END) AS PagPontual,
    SUM(CASE WHEN CAST(crd.DataPag AS DATE) >  CAST(crd.DataVen AS DATE) THEN 1 ELSE 0 END) AS PagAtraso
INTO #Rec
FROM [Contas Recebidas] crd
GROUP BY crd.Codigo;

-- maior valor pago por título (substitui o NOT EXISTS da inadimplência)
SELECT Codigo, DocPag, MAX(ValPre) AS MaxValPre
INTO #RecDoc
FROM [Contas Recebidas]
WHERE DocPag IS NOT NULL
GROUP BY Codigo, DocPag;
${etapa('Contas recebidas')}

-- 4) Contas a receber — débito e inadimplência numa leitura
SELECT
    cr.Codigo,
    SUM(cr.ValPre) AS Debito,
    SUM(CASE WHEN cr.DataVen < @Hoje AND (d.MaxValPre IS NULL OR cr.ValPre IS NULL OR d.MaxValPre < cr.ValPre)
             THEN cr.ValPre ELSE 0 END) AS ValorInadimplente,
    SUM(CASE WHEN cr.DataVen < @Hoje AND (d.MaxValPre IS NULL OR cr.ValPre IS NULL OR d.MaxValPre < cr.ValPre)
             THEN 1 ELSE 0 END) AS QtdParcelasVencidas
INTO #Arec
FROM [Contas a Receber] cr
LEFT JOIN #RecDoc d ON d.Codigo = cr.Codigo AND d.DocPag = cr.DocPag
WHERE cr.NroRef IS NOT NULL
GROUP BY cr.Codigo;
${etapa('Contas a receber')}

-- 5) Devoluções vinculadas às vendas do período (só se for abater)
--    (com RECOMPILE, "@AbaterRetornos = 1" falso faz o SQL Server nem ler as tabelas)
SELECT p.CodClFo, SUM(ip.ValorTotal) AS ValorTotalRetorno
INTO #Ret
FROM Pedidos p
JOIN [Itens de Pedido] ip ON ip.Numero = p.Numero
JOIN Operações o ON o.codigo = p.CodOp
WHERE @AbaterRetornos = 1
  AND o.TipoOp IN ('R', 'D')
  AND (@CodigoCliente IS NULL OR p.CodClFo = @CodigoCliente)
  AND p.NroRef IN (SELECT Numero FROM #Ped WHERE TipoOp = 'V')
GROUP BY p.CodClFo
OPTION (RECOMPILE);
${etapa('Devoluções das vendas')}

-- 6) Quantidade de devoluções no período e clientes com movimentação
SELECT p.CodClFo, COUNT(*) AS Qtd
INTO #Dev
FROM Pedidos p
JOIN Operações o ON o.Codigo = p.CodOp
WHERE o.TipoOp IN ('R', 'D')
  AND (@CodigoCliente IS NULL OR p.CodClFo = @CodigoCliente)
  AND (@DataVendaInicial IS NULL OR p.Data >= @DataVendaInicial)
  AND (@DataVendaFinal IS NULL OR p.Data <= @DataVendaFinal)
GROUP BY p.CodClFo
OPTION (RECOMPILE);

SELECT DISTINCT p.CodClFo
INTO #Mov
FROM Pedidos p
WHERE @DataVendaInicial IS NOT NULL
  AND (@CodigoCliente IS NULL OR p.CodClFo = @CodigoCliente)
  AND p.Data >= @DataVendaInicial
  AND (@DataVendaFinal IS NULL OR p.Data <= @DataVendaFinal)
OPTION (RECOMPILE);
${etapa('Devoluções e movimentação')}

-- RESULTADO 1: métricas de todos os clientes (base do score e do ranking)
SELECT
    c.Codigo AS ClienteID,
    r.TotalComprado,
    r.MesesRelacionamento,
    r.QtdPedidosVenda,
    r.MaiorCompra,
    r.MediaCompra,
    DATEDIFF(DAY, ISNULL(r.UltimaCompra, '19000101'), @Hoje) AS DiasUltimaCompra,
    rc.AtrasoMedioDias,
    rc.TotalParcelasPagas,
    a.ValorInadimplente
FROM Clientes c
LEFT JOIN #Res r ON r.ClienteID = c.Codigo
LEFT JOIN #Rec rc ON rc.Codigo = c.Codigo
LEFT JOIN #Arec a ON a.Codigo = c.Codigo;
${etapa('Métricas para o ranking')}

-- RESULTADO 2: clientes filtrados com os detalhes
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
    CASE WHEN c.Tipo = 'B' THEN 'Bloqueado' WHEN c.Tipo = 'D' THEN 'Desativado' ELSE 'Ativo' END AS StatusCliente,
    CASE WHEN ISNULL(c.MotBloqVnd, '') <> '' THEN 'S' ELSE 'N' END AS Bloqueado,
    ISNULL(r.TotalComprado, 0) AS TotalCompradoHistorico,
    ISNULL(r.MaiorCompra, 0) AS MaiorCompra,
    ISNULL(CAST(r.MediaCompra AS DECIMAL(15,2)), 0) AS TicketMedio,
    r.PrimeiraCompra,
    r.UltimaCompra,
    ISNULL(r.QtdPedidosVenda, 0) AS QtdPedidosVenda,
    ISNULL(r.MesesRelacionamento, 0) AS MesesRelacionamento,
    CASE WHEN ISNULL(r.QtdPedidosVenda, 0) > 0
         THEN r.TotalComprado - ISNULL(rt.ValorTotalRetorno, 0)
         ELSE 0 END AS TotalVendasPeriodo,
    ISNULL(r.QtdPedidos, 0) AS QtdPedidos,
    ISNULL(r.QtdPedidosBonificados, 0) AS QtdPedidosBonificados,
    ISNULL(dv.Qtd, 0) AS QtdPedidosDevolucao,
    ISNULL(rc.AtrasoMedioDias, 0) AS AtrasoMedioDias,
    ISNULL(rc.TotalParcelasPagas, 0) AS TotalParcelasPagas,
    ISNULL(rc.ParcelasComAtraso, 0) AS ParcelasComAtraso,
    CASE WHEN ISNULL(rc.TotalParcelasPagas, 0) > 0
         THEN CAST(rc.ParcelasComAtraso AS FLOAT) / CAST(rc.TotalParcelasPagas AS FLOAT) * 100
         ELSE 0 END AS PercentualAtraso,
    ISNULL(a.ValorInadimplente, 0) AS ValorInadimplente,
    ISNULL(a.QtdParcelasVencidas, 0) AS QtdParcelasVencidas,
    ISNULL(a.Debito, 0) AS TotalAReceber,
    ISNULL(rc.TotalRecebido, 0) AS TotalRecebido,
    ISNULL(rc.PagPontual, 0) AS PagPontual,
    ISNULL(rc.PagAtraso, 0) AS PagAtraso,
    v.VendedorUltimaCompra,
    v.VendedorPrimeiraCompra
FROM Clientes c
OUTER APPLY (SELECT TOP 1 Nome FROM Cidades WHERE Codigo = c.CidEndEnt) ci
LEFT JOIN #Res r ON r.ClienteID = c.Codigo
LEFT JOIN #Vend v ON v.ClienteID = c.Codigo
LEFT JOIN #Rec rc ON rc.Codigo = c.Codigo
LEFT JOIN #Arec a ON a.Codigo = c.Codigo
LEFT JOIN #Ret rt ON rt.CodClFo = c.Codigo
LEFT JOIN #Dev dv ON dv.CodClFo = c.Codigo
WHERE (@CodigoCliente IS NULL OR c.Codigo = @CodigoCliente)
  AND (@StatusCliente IS NULL OR
       (@StatusCliente = 'Ativo' AND ISNULL(c.Tipo, '') NOT IN ('B','D')) OR
       (@StatusCliente = 'Bloqueado' AND c.Tipo = 'B') OR
       (@StatusCliente = 'Desativado' AND c.Tipo = 'D'))
  AND (@Bloqueado IS NULL OR
       (@Bloqueado = 'S' AND ISNULL(c.MotBloqVnd, '') <> '') OR
       (@Bloqueado = 'N' AND ISNULL(c.MotBloqVnd, '') = ''))
  AND (@SomenteClientesSemCompra IS NULL
       OR (@SomenteClientesSemCompra = 'S' AND ISNULL(r.QtdPedidos, 0) = 0))
  AND (@DataVendaInicial IS NULL OR EXISTS (SELECT 1 FROM #Mov m WHERE m.CodClFo = c.Codigo))
OPTION (RECOMPILE);
${etapa('Detalhes dos clientes')}

-- RESULTADO 3: tempos por etapa
SELECT Etapa, Ms, Linhas FROM #Tempos ORDER BY Ordem;

DROP TABLE #Ped, #Res, #Vend, #Rec, #RecDoc, #Arec, #Ret, #Dev, #Mov, #Tempos;
`;

// Resumo de vendas por ano/mês (histórico completo) — o pivô é montado no app
// Correção #4: devoluções somadas por pedido de origem antes do join
const VENDAS_MES = HEADER + `
;WITH
VendasOriginais AS (
    SELECT p.Numero, YEAR(p.Data) AS Ano, MONTH(p.Data) AS Mes, SUM(ip.ValorTotal) AS ValorVenda
    FROM Pedidos p
    JOIN [Itens de Pedido] ip ON ip.Numero = p.Numero
    JOIN Operações o ON o.Codigo = p.CodOp
    WHERE o.TipoOp = 'V'
      AND (@CodigoCliente IS NULL OR p.CodClFo = @CodigoCliente)
    GROUP BY p.Numero, YEAR(p.Data), MONTH(p.Data)
),
RetornosBrutos AS (
    SELECT p.NroRef AS NumeroVendaOriginal, YEAR(p.Data) AS Ano, MONTH(p.Data) AS Mes, SUM(ip.ValorTotal) AS ValorRetorno
    FROM Pedidos p
    JOIN [Itens de Pedido] ip ON ip.Numero = p.Numero
    JOIN Operações o ON o.codigo = p.CodOp
    WHERE o.TipoOp IN ('R', 'D')
      AND (@CodigoCliente IS NULL OR p.CodClFo = @CodigoCliente)
      AND p.NroRef IS NOT NULL
    GROUP BY p.NroRef, YEAR(p.Data), MONTH(p.Data)
),
RetornosPorVenda AS (
    SELECT NumeroVendaOriginal, SUM(ValorRetorno) AS ValorRetorno
    FROM RetornosBrutos
    GROUP BY NumeroVendaOriginal
),
VendasAgrupadas AS (
    SELECT v.Ano, v.Mes, SUM(v.ValorVenda) AS TotalVendas, SUM(ISNULL(r.ValorRetorno, 0)) AS TotalRetornos
    FROM VendasOriginais v
    LEFT JOIN RetornosPorVenda r ON v.Numero = r.NumeroVendaOriginal
    GROUP BY v.Ano, v.Mes
),
RetornosSemVenda AS (
    SELECT Ano, Mes, SUM(ValorRetorno) AS TotalRetornos
    FROM RetornosBrutos r
    WHERE NOT EXISTS (SELECT 1 FROM VendasOriginais v WHERE v.Numero = r.NumeroVendaOriginal)
    GROUP BY Ano, Mes
)
SELECT Ano, Mes, SUM(TotalVendas) AS Vendas, SUM(TotalRetornos) AS Retornos, MAX(TemVenda) AS TemVenda
FROM (
    SELECT Ano, Mes, TotalVendas, TotalRetornos, 1 AS TemVenda FROM VendasAgrupadas
    UNION ALL
    SELECT Ano, Mes, 0, TotalRetornos, 0 FROM RetornosSemVenda
) x
GROUP BY Ano, Mes
ORDER BY Ano, Mes
OPTION (RECOMPILE);
`;

module.exports = { ANALISE, VENDAS_MES };
