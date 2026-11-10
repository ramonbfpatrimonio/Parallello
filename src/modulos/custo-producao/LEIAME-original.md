# Custo de Produto/Produção

Módulo do Parallello que calcula o custo das ordens de produção a partir dos insumos.
Electron + React + Vite. Os dados ficam só no computador, sem nuvem e sem tela de login.

## Rodar e gerar

```
npm install
npm run dev     # desenvolvimento (Vite + Electron)
npm start       # compila o front e abre o app
npm run dist    # gera o instalador em /release
```

O processo principal é empacotado com esbuild em `dist-electron/` (mssql, exceljs e dependências vão dentro de um único arquivo). Por isso o instalador não leva `node_modules` e não acontece erro de "Cannot find module" depois de instalado.

O `.npmrc` e o script `dist` já usam o mirror do Electron e do electron-builder.
Isso evita o erro 504 do GitHub ao baixar o Electron, o NSIS e o winCodeSign.

## Área do sistema (oculta)

Pressione **Ctrl+Shift+B** e informe a senha do Parallello: `P@r@llell0` + data do computador no formato **DDMMAAAA**.
Exemplo para 10/11/2026: `P@r@llell010112026`.
A regra fica em `senhaDoDia()` no arquivo `electron/main.js`.

A área tem três abas:
- **Conexões:** cadastre quantos bancos quiser (um por cliente), com nome, servidor, instância, porta, banco, usuário e senha. Cada conexão tem a sua coluna de data da ordem ("Buscar no banco") e pode ser testada, duplicada ou excluída. A conexão em uso é escolhida na barra lateral, por qualquer usuário.
- **Preferências:** casas decimais do custo unitário.
- **Backup:** gera e restaura um arquivo `.json` com todas as conexões, preferências e histórico. As senhas dos bancos não vão no backup.

A configuração da versão 1.0 (uma conexão só) é migrada sozinha para "Conexão principal".

## Telas

- **Custo de Produção:** filtros por período, faixa de ordens, código e descrição do acabado. Cada ordem aparece como produto acabado e os insumos se expandem abaixo dela. Mostra totais, custo por kg, % de cada insumo e destaque em vermelho para insumo sem custo. Exporta para Excel e PDF e salva a consulta no histórico.
- **Na planilha:** clique no cabeçalho para ordenar (crescente, decrescente, volta ao original); os insumos de cada ordem seguem a mesma coluna. Arraste o puxador acima da planilha para cima para aumentá-la (duplo clique ou o botão no canto alterna tela cheia; setas ↑/↓ também funcionam). A altura escolhida fica guardada.
- **Filtros:** o botão no canto superior direito recolhe e mostra os filtros; recolhidos, aparece um resumo com "Consultar de novo".
- **Saída:** Excel, PDF e Imprimir (abre a janela de impressão do Windows), sempre na ordem e com os filtros da tela.
- **Barra lateral:** fica recolhida só com ícones e abre ao passar o mouse.
- **Histórico:** consultas salvas, para abrir, ordenar, exportar, imprimir ou excluir. Também compara duas consultas pelo custo/kg de cada produto acabado.

## Regras de cálculo (iguais à consulta original)

- Quantidade em kg = `Quant + QuantUnid / 1000` (7/17 = 7,017 kg).
- Custo unitário do insumo = `(Custo / Estoque) × Unidades`, da última movimentação com `Custo > 0`, ordenada por `Data`, `NroOrdem` e `%%physloc%%`, decrescente.
- Custo total do insumo = custo unitário × quantidade em kg, arredondado em 2 casas.
- Custo do acabado = soma dos custos totais dos insumos.
- Custo unitário do acabado = custo do acabado ÷ kg produzidos.

A consulta fica em `electron/db.js`. A versão original está em `sql/custo_producao_original.sql`.

## Desempenho

O `OUTER APPLY` em `Movimentações` roda uma vez por insumo. Em bases grandes, este índice ajuda bastante:

```sql
CREATE INDEX IX_Movimentacoes_Produto_Data
ON [dbo].[Movimentações] ([Produto], [Data] DESC, [NroOrdem] DESC)
INCLUDE ([Estoque], [Custo]);
```

## Integração com o Parallello

- Não há login próprio; a área de sistema usa a mesma senha do Parallello.
- Dentro do Parallello, a conexão pode vir da conexão única do sistema. Para isso, troque `store.conexaoAtiva()` em `electron/main.js` pela conexão do Parallello.
- O tema claro/escuro fica no botão da lua/sol na barra lateral.
- Os dados locais ficam em `%APPDATA%\Custo de Produção` (`config.json` e a pasta `historico\`).
