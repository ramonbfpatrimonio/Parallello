-- ============================================================================
-- PRODUÇÃO EM CASCATA — CUSTO BASEADO EM KG/GRAMAS (Ex: 7/17 = 7,017)
-- ============================================================================

WITH BaseInsumos AS (
    SELECT 
        PP.[Numero]            AS NumeroOrdem,
        PPI.[Item]             AS ItemSequencia,
        PPI.[Produto]          AS CodigoProduto,
        PI.[Descricao]         AS DescricaoProduto,
        
        -- Coluna unificada renomeada para Quant
        CONVERT(VARCHAR(50), PPI.[Quant]) + '/' + CONVERT(VARCHAR(50), PPI.[QuantUnid]) AS Quant,
        
        -- CONVERSÃO PARA KG: (KG + (GRAMA / 1000))
        CAST(
            PPI.[Quant] + (PPI.[QuantUnid] / 1000.0)
        AS DECIMAL(18,4)) AS QuantidadeRealKg,

        -- Custo Unitário do Insumo (Aqui ainda é unitário para a multiplicação)
        CAST(
            CASE 
                WHEN ULT.[Estoque] IS NULL OR ULT.[Estoque] = 0 THEN 0.00
                ELSE ((ULT.[Custo] / ULT.[Estoque]) * ISNULL(PI.[Unidades], 1)) 
            END 
        AS DECIMAL(18,4))      AS CustoUnitarioBase,

        -- CUSTO TOTAL DO INSUMO = Custo Unitário * QuantidadeRealKg
        CAST(
            CASE 
                WHEN ULT.[Estoque] IS NULL OR ULT.[Estoque] = 0 THEN 0.00
                ELSE (((ULT.[Custo] / ULT.[Estoque]) * ISNULL(PI.[Unidades], 1)) * (PPI.[Quant] + (PPI.[QuantUnid] / 1000.0)))
            END 
        AS DECIMAL(18,2))      AS CustoTotalInsumo

    FROM [dbo].[ProdutosProducao] PP
    INNER JOIN [dbo].[ProdutosProducaoItens] PPI
        ON PP.[Numero] = PPI.[Numero]
    LEFT JOIN [dbo].[Produtos] PI 
        ON PPI.[Produto] = PI.[Codigo]
        
    OUTER APPLY (
        SELECT TOP 1 
            M.[Estoque], 
            M.[Custo]
        FROM [dbo].[Movimentações] M
        WHERE M.[Produto] = PPI.[Produto]
          AND M.[Estoque] IS NOT NULL 
          AND M.[Custo] > 0 -- <--- AQUI ESTÁ A ALTERAÇÃO: Só busca movimentações com custo maior que zero
        ORDER BY 
            M.[Data] DESC, 
            M.[NroOrdem] DESC,
            %%physloc%% DESC 
    ) AS ULT
),

BaseCompleta AS (
    -- PARTE 1: PRODUTO ACABADO
    SELECT 
        1 AS Ordem,
        PP.[Numero]            AS NumeroOrdem, 
        0 AS ItemSequencia,                    
        'PRODUTO ACABADO'      AS TipoItem,
        PP.[Produto]           AS CodigoProduto,
        PA.[Descricao]         AS DescricaoProduto,
        CONVERT(VARCHAR(50), PP.[Quant]) + '/' + CONVERT(VARCHAR(50), PP.[QuantUnid]) AS Quant,
        
        -- CUSTO DO ACABADO (A SOMA) renomeado para Custo
        ISNULL(SUM(B.[CustoTotalInsumo]), 0.00) AS Custo

    FROM [dbo].[ProdutosProducao] PP
    LEFT JOIN [dbo].[Produtos] PA ON PP.[Produto] = PA.[Codigo]
    LEFT JOIN BaseInsumos B ON PP.[Numero] = B.NumeroOrdem
    GROUP BY 
        PP.[Numero], PP.[Produto], PA.[Descricao], PP.[Quant], PP.[QuantUnid]

    UNION ALL

    -- PARTE 2: INSUMOS
    SELECT 
        2 AS Ordem,
        NumeroOrdem,     
        ItemSequencia,   
        'INSUMO'               AS TipoItem,
        CodigoProduto,
        DescricaoProduto,
        Quant,
        CAST(CustoUnitarioBase AS DECIMAL(18,2)) AS Custo -- Custo do insumo renomeado
    FROM BaseInsumos
)

-- =======================================================
-- SELECT FINAL
-- =======================================================
SELECT 
    TipoItem,
    CodigoProduto,
    DescricaoProduto,
    Quant,
    Custo
FROM BaseCompleta
ORDER BY NumeroOrdem, Ordem, ItemSequencia;