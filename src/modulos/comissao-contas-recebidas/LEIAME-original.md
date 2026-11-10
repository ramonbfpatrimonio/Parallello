# Comissão por Contas Recebidas

Sistema Electron + React (Vite) criado a partir da planilha `COMISSAO_POR_CONTAS_RECEBIDAS.xlsm`.
Consulta o ERP (SQL Server) e guarda tudo o que é do próprio sistema **localmente**, sem nuvem.

## Telas
| Menu | O que faz | Equivalente na planilha |
|---|---|---|
| Relatório de Comissões | Parcelas baixadas no período + itens de cada pedido, totais, resumo por fabricante e por vendedor, exportação Excel/PDF | aba `Relatorio_Comissoes` + `BuscarDadosBanco`, `AlternarItens`, `CriarListaSuspensaVendedores` |
| Configurar Comissões | % por fabricante (Cidade 001, Outras, Tel. Op., Desconto) por UF — **grava no ERP** (`CidadesComissoes`) | aba `Config_Comissoes` + Módulo3 |
| Fechamentos | Resultados salvos localmente para consultar/reimprimir | (novo) |
| Conexões | Bancos SQL Server (COMERCIO, INDUSTRIA…) com senha criptografada | conexões fixas no VBA |
| Configurações | Chaves **Total pedido com ST** (padrão: sem) e **Recebido com ST** (padrão: com; desligada tira o ST proporcional da parcela) e **Total pedido somado por baixa** (padrão: ligada, como a planilha) | (novo) |
| Backup | Exporta/restaura o arquivo de dados local | (novo) |

O menu lateral abre ao passar o mouse e recolhe ao tirar.

**Área de sistema (Conexões, Configurações e Backup) fica escondida.** `Ctrl+Shift+B` pede a senha — a mesma do Parallello:
`P@r@llell0` + data do computador em DDMMAAAA (ex.: em 05/11/2026 → `P@r@llell005112026`). `Ctrl+Shift+B` de novo esconde.
A senha é conferida em `electron/main.js` (`senhaSistemaDoDia`).

## Rodar
```bash
npm install
npm run dev      # desenvolvimento (Vite + Electron)
npm start        # build do front e abre o Electron
npm run dist     # gera o instalador (electron-builder, pasta release/)
```

O processo principal (electron/ + mssql, exceljs, sql.js) é empacotado pelo esbuild em `dist-electron/main.js`
(`scripts/build-main.js`). O instalador não leva `node_modules`, o que evita erros de "Cannot find module".

O electron-builder usa o Electron já instalado em `node_modules/electron/dist` (`"electronDist"` no package.json),
então o `npm run dist` não baixa o Electron do GitHub (evita erros 504/timeout).

## Onde ficam os dados
`%APPDATA%\comissao-contas-recebidas\comissao-local.sqlite` (SQLite via sql.js — sem compilação nativa).
Senhas das conexões: criptografadas com `safeStorage` (DPAPI do Windows, por usuário).

Na primeira abertura já vêm cadastradas as conexões COMERCIO (`HAGE.0001.Log`) e INDUSTRIA (`HAGE.0002.Log`) no servidor `thiago-dell`, usuário `sa` — **falta só informar a senha** em Conexões.

## Conexão com o SQL Server
A biblioteca `mssql` (tedious) conecta por **TCP/IP** (a planilha usava o provider SQLOLEDB do Windows).
Se o teste falhar: SQL Server Configuration Manager → Protocolos → **TCP/IP habilitado**, porta 1433 liberada no firewall.
Instância nomeada: servidor `NOME\INSTANCIA` com o serviço **SQL Server Browser** ativo.

## Regras mantidas da planilha
- Parcela (linha 0): `Comissão = Round(Recebido × comissão dos itens ÷ Total pedido, 2)` — proporção sem arredondar, igual ao relatório do Ativo; `% Com.` mostra a proporção com 2 casas (pedido de um item: % do fabricante).
- Pedido com várias parcelas: o número do pedido aparece só na 1ª parcela (as demais informações se repetem); o "Total dos pedidos" soma o total do pedido em cada baixa, igual à planilha.
- Item (linha 1): `Comissão item = (ValorTotal − devolução) × PerComVen / 100` (sem tirar o ICMS-ST, igual ao Ativo).
- Pedido parcelado: quando a última parcela (ex.: C/C) está no relatório com as anteriores, ela fica com a sobra do arredondamento (igual ao Ativo).
- Só operações de venda (`TipoOp = 'V'`), devoluções descontadas via `NroRef` (igual ao Ativo).
- Salvar comissões: UPDATE nas cidades existentes + INSERT nas que faltam, para a UF/tipo de cidade escolhidos.

## Melhorias em relação à planilha
- Consultas parametrizadas (sem SQL montado com texto), senha fora do código.
- Gravação de comissões em **transação** com prévia de quantas cidades serão atualizadas/inseridas.
- Aviso quando as "outras cidades" da UF têm percentuais diferentes (a planilha mostrava só o maior).
- KPI de conferência: comissão pelas parcelas × soma da comissão dos itens.

## Estrutura
```
assets/logo/  logo do módulo (SVG, PNG 512, ICO) — use no card do Parallello
build/        icon.ico do instalador
scripts/      build-main.js (empacota o processo principal)
electron/  main.js (IPC) · preload.js · store.js (SQLite local) · erp.js (SQL Server) · queries.js · processar.js · exportar.js
src/       App.jsx · components/ (Sidebar, ResultadoView, Modal, Toast…) · pages/ (Relatorio, Configuracao, Fechamentos, Conexoes, Backup)
```
