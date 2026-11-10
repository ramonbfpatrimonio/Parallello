# Análise de Crédito (módulo do Parallello)

Sistema Electron + React + Vite a partir do **SCRIPT DE ANALISE DE CREDITO DE CLIENTE COM ANALISE DE SCORE**.
Conecta direto no SQL Server do ERP e guarda tudo localmente (sem nuvem, sem login).

## Como rodar

```bash
npm install
npm run dev      # desenvolvimento (Vite + Electron)
npm start        # build do front e abre o Electron
npm run dist     # gera o instalador em /release
```

O `.npmrc` e o `build.electronDownload` do `package.json` usam o espelho npmmirror,
evitando o erro 504 do GitHub ao baixar o Electron e os binários do electron-builder.

## Logo

Pasta `logo/`: `analise-credito.svg` (vetor) e PNGs de 512, 256, 128 e 64 px, no padrão dos ícones do Parallello
(quadrado arredondado com gradiente, figura em branco e selo de destaque). A mesma logo é usada na barra lateral,
na janela, no instalador (`build/icon.ico`) e no favicon.

Para o card no Parallello:
- Ícone: `logo/analise-credito-256.png` (ou o `.svg`)
- Título: **Análise de Crédito**
- Descrição: *Score, limite e prazo sugeridos por cliente, com histórico de decisões.*
- Cor de destaque (traço do "Abrir"): `#f59e0b` (âmbar)

## Novidades da versão 1.2 — desempenho

- A análise roda num **único lote** com tabelas temporárias: cada tabela grande do ERP é lida uma vez (antes, duas consultas em paralelo recalculavam tudo e as CTEs eram reexecutadas várias vezes, inclusive por cliente).
- `OPTION (RECOMPILE)` nos filtros opcionais: com um cliente informado, o SQL Server usa índice em vez de varrer as tabelas.
- Inadimplência sem `NOT EXISTS` correlacionado; devoluções só são lidas com "Abater devoluções" marcado.
- **Tempo por etapa**: clique no tempo (ex.: "2,4s") acima da tabela para ver quanto cada etapa levou.
- `indices-sugeridos.sql`: índices opcionais para o banco do ERP. O sistema não executa esse script; rode manualmente, com backup, depois de conferir com o responsável pelo banco.

## Novidades da versão 1.1

- **Várias conexões**: cadastro de quantas empresas/bancos quiser no Ctrl+Shift+B (aba Conexões). A conexão em uso é trocada pelo seletor no topo da tela; a conexão da versão 1.0 é migrada automaticamente.
- **PDF e Imprimir** ao lado do Excel em todas as telas (análise, ficha do cliente, vendas por mês e histórico).
- **Barra lateral** recolhida que abre ao passar o mouse e recolhe ao sair.
- **Recolher filtros**: botão no canto superior direito; com os filtros recolhidos aparece um resumo (clique nele para abrir de novo).
- **Puxar a planilha**: arraste a alça acima da tabela para cima para ampliar a planilha; duplo clique alterna entre ampliada e normal.
- **Ordenação**: clique no cabeçalho de qualquer coluna para ordenar crescente; clique de novo para decrescente.
- Decisões gravadas com a conexão em que foram feitas; o histórico filtra pela conexão.

## Telas

- **Análise de Crédito**: filtros do script (cliente, período, status, bloqueio, somente sem compra, abater devoluções), resumo por perfil, tabela ordenável, busca e exportação para Excel com todas as colunas do script.
- **Ficha do cliente** (clique na linha): score com a composição dos 8 critérios, crédito, prazos 1 a 5, pagamentos, compras, vendas por ano/mês (gráfico + pivô) e **Registrar decisão** (situação, limite e prazo aprovados, responsável e observação) com histórico.
- **Vendas por Mês**: o resumo ano × mês do script, para um cliente ou para a empresa toda.
- **Histórico de Decisões**: todas as decisões gravadas neste computador, com filtro e exportação.

## Área oculta — Ctrl+Shift+B

Senha do Parallello: `P@r@llell0` + data do computador no formato **ddmmaaaa** (ex.: `P@r@llell010112026`).
O formato está em `electron/main.cjs`, função `senhaDoDia()`.

- **Conexões**: cadastrar, editar, testar, excluir e definir a conexão em uso. Cada conexão tem nome (empresa), servidor (ou `SERVIDOR\INSTANCIA`), porta, banco, usuário e senha. As senhas são criptografadas pelo Windows.
- **Regras do score**: faixas e pontos de cada critério, zerar se inadimplente, perfis, limites por total comprado, prazo sugerido e prazos 1 a 5. Botão para restaurar as regras originais do script.
- **Backup**: exporta/restaura regras, decisões e conexões (sem senhas) em JSON.

Dados locais: `%APPDATA%\analise-credito\dados\` (`conexoes.json`, `regras.json`, `decisoes.json`).

## Regras de cálculo

- Score, limite e relacionamento calculados **pelo período filtrado**, como no script.
- Ranking (percentil e quintil) calculado entre **todos os clientes** do cadastro, como no `ScoringCliente` do script.

### Correções aplicadas em relação ao script

1. **Posição no mercado**: o percentil passou a ser crescente, então o melhor cliente fica no "Top 20%" (antes ficava invertido).
2. **Pagamento pontual**: pago até o vencimento é pontual; só conta atraso quando pago depois (antes, pagar adiantado contava como atraso).
3. **Resumo mensal**: devoluções são somadas por pedido de origem antes do join, evitando duplicar a venda quando há devoluções em meses diferentes.
4. **Atraso médio**: calculado direto em `[Contas Recebidas]` (vencimento × pagamento), já que os títulos quitados saem de `[Contas a Receber]`.
5. **Ajustes menores**: vendedor da 1ª compra só considera vendas; débito e recebidos consolidados em CTEs (mais rápido); datas como parâmetros tipados (independe do idioma do SQL Server); filtro de data final aceita vazio.

Arquivos principais: `electron/queries.cjs` (SQL), `electron/score.cjs` (cálculo), `electron/regrasPadrao.cjs` (regras originais).
