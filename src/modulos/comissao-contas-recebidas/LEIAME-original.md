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
| Backup | Exporta/restaura o arquivo de dados local | (novo) |

O menu lateral abre ao passar o mouse e recolhe ao tirar.

## Rodar
```bash
npm install
npm run dev      # desenvolvimento (Vite + Electron)
npm start        # build do front e abre o Electron
npm run dist     # gera o instalador (electron-builder, pasta release/)
```

O processo principal (electron/ + mssql, exceljs, sql.js) é empacotado pelo esbuild em `dist-electron/main.js`
(`scripts/build-main.js`). O instalador não leva `node_modules`, o que evita erros de "Cannot find module".

## Onde ficam os dados
`%APPDATA%\comissao-contas-recebidas\comissao-local.sqlite` (SQLite via sql.js — sem compilação nativa).
Senhas das conexões: criptografadas com `safeStorage` (DPAPI do Windows, por usuário).

Na primeira abertura já vêm cadastradas as conexões COMERCIO (`HAGE.0001.Log`) e INDUSTRIA (`HAGE.0002.Log`) no servidor `thiago-dell`, usuário `sa` — **falta só informar a senha** em Conexões.

## Conexão com o SQL Server
A biblioteca `mssql` (tedious) conecta por **TCP/IP** (a planilha usava o provider SQLOLEDB do Windows).
Se o teste falhar: SQL Server Configuration Manager → Protocolos → **TCP/IP habilitado**, porta 1433 liberada no firewall.
Instância nomeada: servidor `NOME\INSTANCIA` com o serviço **SQL Server Browser** ativo.

## Regras mantidas da planilha
- Parcela (linha 0): `% Comissão` = média ponderada do `PerComVen` dos itens; `Comissão = Round(Recebido × % / 100, 2)` (arredondamento do VBA).
- Item (linha 1): `Comissão item = (ValorTotal − ICMSFItem − devolução) × PerComVen / 100`.
- Só operações de venda (`TipoOp = 'V'`), devoluções descontadas via `NroRef`.
- Salvar comissões: UPDATE nas cidades existentes + INSERT nas que faltam, para a UF/tipo de cidade escolhidos.

## Melhorias em relação à planilha
- Consultas parametrizadas (sem SQL montado com texto), senha fora do código.
- Gravação de comissões em **transação** com prévia de quantas cidades serão atualizadas/inseridas.
- Total dos pedidos conta cada pedido uma vez (a planilha somava o total do pedido em cada parcela).
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
