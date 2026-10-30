# Indicador Logístico

Sistema desktop (Electron + React + Vite) feito a partir da planilha **INDICADOR_LOGISTICO.xlsm**.
Consulta os bancos SQL Server do ERP e mostra o painel de logística com 4 indicadores:
cumprimento de entregas, prazo médio, custo por entrega e devoluções.
Tudo fica salvo **localmente** (sem nuvem).

## Como rodar

```bash
npm install
npm run dev        # desenvolvimento (Vite + Electron)
npm run start      # gera o build e abre o Electron
npm test           # testes do motor de cálculo
npm run dist       # gera o instalador Windows (electron-builder) em release/
```

> O processo principal (pasta `electron/`) é empacotado pelo **esbuild** num arquivo só (`dist-electron/main.js`)
> junto com mssql e exceljs. Por isso o instalador **não leva node_modules** e não acontece mais o erro
> "Cannot find module" depois de instalar. Todas as dependências ficam em devDependencies de propósito.

## Primeiro acesso

- Usuário: **MASTER**
- Senha: prefixo + data do computador no formato DDMMAAAA (ex.: `IL29102026` em 29/10/2026)
- O prefixo fica em `electron/config.js` (`MASTER_PREFIXO`). Troque antes de gerar o setup.

Depois de entrar com o MASTER:
1. **Usuários**: crie pelo menos um administrador.
2. **Conexões**: cadastre os bancos (ex.: COMERCIO → `HAGE.0001.Log`, INDUSTRIA → `HAGE.0002.Log`, servidor `THIAGO-DELL`) e clique em **Testar**. O teste também confere se as 7 tabelas usadas existem.
3. **Metas** e **Centros de custo** já vêm preenchidos; ajuste se precisar.

## Telas

| Tela | O que faz |
|---|---|
| Painel | Atualiza sozinho ao mudar datas ou conexão depois da primeira consulta (como a planilha). Filtros (período, conexão/grupo/todas, centro de custo, modo), 4 cards, tabelas mensais com cores, gráficos, exportação Excel/PDF. Clique em um número para ver os pedidos que formam o valor. |
| Histórico | Toda consulta é salva (últimas 100) e pode ser reaberta sem conexão com o banco. |
| Metas | Meta e limite de alerta de cada indicador (Meta atingida / Alerta / Crítico), com a explicação de cada situação. Já vêm com os valores da planilha: Cumprimento ≥ 98% (alerta ≥ 95%), Prazo ≤ 3 dias (alerta ≤ 5), Custo ≤ R$ 100 (alerta ≤ R$ 150), Devolução ≤ 1,5% (alerta ≤ 3%). |
| Centros de custo | Lista da antiga aba oculta Lista_Custos. |
| Conexões | Vários bancos, com grupo e ordem de prioridade. Senhas criptografadas (Windows DPAPI via safeStorage). |
| Usuários | Administrador (tudo) e Operador (painel, histórico, exportação). |
| Configurações | Nome da empresa, padrões do painel, backup/restauração, troca de senha. |

## Modos de cálculo

**Padrão (corrigido)**: calculado pedido a pedido, com o mesmo critério em todos os blocos:

| Indicador | Regra |
|---|---|
| Entregas programadas | Pedidos de venda (`Operações.TipoOp = 'V'`) no período, pelo mês do pedido |
| Entregas realizadas | Pedidos em carga com `Situacao = 'A'` e **sem** retorno op. 99 |
| % Cumprimento | Realizadas ÷ Programadas (total = soma ÷ soma) |
| Prazo médio | Dias entre a 1ª pré-venda do pedido e o `DataAcerto` da carga, só das entregas realizadas ÷ nº dessas entregas |
| Custo por entrega | Soma de `NotasPagarCustosContas.Valor` do centro de custo ÷ entregas realizadas |
| % Devoluções | Pedidos carregados com retorno 98/99 ÷ pedidos carregados (mês do pedido de origem) |

- Os meses são separados por **ano e mês** (um período de 2025 a 2026 não mistura dezembros).
- Custos de um mês sem pedidos aparecem normalmente.
- **Unificar** (consultando mais de uma conexão): o mesmo cliente (`Clientes.NroInsc`) no mesmo dia conta uma vez só, valendo a conexão de cima na lista. Isso vale para todos os indicadores.

**Planilha**: réplica fiel da macro `ConsultarPainel`. Os números batem com a planilha (inclusive % acima de 100%, médias de percentuais e as devoluções contadas pela data do retorno no filtro TODOS). Serve para comparar.

## Estrutura

```
electron/
  main.js       janela + todos os canais IPC (login, cadastros, consulta, exportação, backup)
  preload.js    ponte segura (window.api.chamar)
  config.js     senha master, centros e metas padrão
  consultas.js  SQL (modo padrão e modo planilha), todas parametrizadas
  banco.js      conexão SQL Server (mssql)
  motor.js      cálculos dos dois modos
  exportar.js   Excel (exceljs) e PDF (printToPDF)
  store.js      arquivos JSON locais + histórico
  segredo.js    criptografia das senhas
src/
  App.jsx, paginas/*, componentes/*, lib/*
tests/engine.test.js
```

Dados locais: `%APPDATA%\Indicador Logístico\dados` (botão **Abrir pasta de dados** em Configurações).

## Para colocar no Parallello depois

O app foi feito isolado para encaixar como card:
- **Lógica sem Electron**: `electron/motor.js`, `consultas.js`, `banco.js` e `exportar.js` não dependem da janela. Dá para copiar para o processo principal do Parallello.
- **Canais IPC**: todos começam com prefixos (`painel:`, `conexoes:`…). No Parallello, renomeie para `logistica:painel:…` para não colidir com os outros apps.
- **Telas**: `src/paginas` + `src/componentes` usam só `lib/api.js` para falar com o Electron. Troque o canal ali.
- **Logo do card**: `public/logo.svg`.
