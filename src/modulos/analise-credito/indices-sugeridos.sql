-- =====================================================================
-- ÍNDICES SUGERIDOS PARA A ANÁLISE DE CRÉDITO  (OPCIONAL)
--
-- O sistema NÃO executa este script. Rode manualmente no banco do ERP,
-- de preferência fora do horário de uso, depois de:
--   1) fazer backup do banco;
--   2) conferir com o fornecedor do ERP / responsável pelo banco.
--
-- Cada índice só é criado se ainda não existir outro com o mesmo nome.
-- Antes de criar, veja a seção "DIAGNÓSTICO" no final: o ERP pode já ter
-- índices equivalentes com outros nomes.
--
-- Para desfazer: DROP INDEX <nome> ON <tabela>;
-- =====================================================================

-- Pedidos por cliente e data (filtro de cliente/período e clientes com movimentação)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AC_Pedidos_Cliente_Data' AND object_id = OBJECT_ID('Pedidos'))
    CREATE NONCLUSTERED INDEX IX_AC_Pedidos_Cliente_Data
        ON Pedidos (CodClFo, Data)
        INCLUDE (Numero, CodOp, Vendedor, Setor, NroRef);

-- Pedidos por data (análise de todos os clientes num período)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AC_Pedidos_Data' AND object_id = OBJECT_ID('Pedidos'))
    CREATE NONCLUSTERED INDEX IX_AC_Pedidos_Data
        ON Pedidos (Data)
        INCLUDE (Numero, CodClFo, CodOp, Vendedor, Setor);

-- Devoluções pelo pedido de origem (abater devoluções)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AC_Pedidos_NroRef' AND object_id = OBJECT_ID('Pedidos'))
    CREATE NONCLUSTERED INDEX IX_AC_Pedidos_NroRef
        ON Pedidos (NroRef)
        INCLUDE (Numero, CodClFo, CodOp, Data)
        WHERE NroRef IS NOT NULL;

-- Itens pelo número do pedido
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AC_ItensPedido_Numero' AND object_id = OBJECT_ID('[Itens de Pedido]'))
    CREATE NONCLUSTERED INDEX IX_AC_ItensPedido_Numero
        ON [Itens de Pedido] (Numero)
        INCLUDE (ValorTotal);

-- Contas recebidas por cliente/título
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AC_ContasRecebidas_Codigo' AND object_id = OBJECT_ID('[Contas Recebidas]'))
    CREATE NONCLUSTERED INDEX IX_AC_ContasRecebidas_Codigo
        ON [Contas Recebidas] (Codigo, DocPag)
        INCLUDE (DataVen, DataPag, ValPre);

-- Contas a receber por cliente/título
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AC_ContasReceber_Codigo' AND object_id = OBJECT_ID('[Contas a Receber]'))
    CREATE NONCLUSTERED INDEX IX_AC_ContasReceber_Codigo
        ON [Contas a Receber] (Codigo, DocPag)
        INCLUDE (DataVen, ValPre, NroRef);

-- =====================================================================
-- DIAGNÓSTICO: índices que já existem nessas tabelas (rode antes)
-- =====================================================================
/*
SELECT t.name AS Tabela, i.name AS Indice, i.type_desc,
       STUFF((SELECT ', ' + c.name FROM sys.index_columns ic
              JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
              WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
              ORDER BY ic.key_ordinal FOR XML PATH('')), 1, 2, '') AS Chave
FROM sys.indexes i
JOIN sys.tables t ON t.object_id = i.object_id
WHERE t.name IN ('Pedidos', 'Itens de Pedido', 'Contas Recebidas', 'Contas a Receber', 'Clientes')
  AND i.type > 0
ORDER BY t.name, i.name;
*/
