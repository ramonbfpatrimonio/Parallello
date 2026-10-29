# Acompanhamento de Vendas

Programa desktop (Electron + React + Vite) que substitui a planilha **Acompanhamento_DiarioVolume_.xlsm**.
Ele lê as vendas direto do SQL Server do ERP e **salva tudo localmente**, sem nuvem e sem login.

## O que tem

| Tela | Equivale na planilha |
|---|---|
| Acompanhamento diário | aba *Acompanhamento Diário* (Módulo1) |
| Valor / volume por fabricante | abas *VolumeFabricante* e *Valorfabricante* (chave “Mostrar volume”) |
| Ranking ABC de clientes | aba *positivacaocliente* (Módulo5) |
| Setor com / sem compra | aba *SetorComSemCompra* (Planilha9) |
| Ruptura por fabricante | aba *Rupturaporfabricante* (Planilha10) |
| Empresas e conexões (oculta) | as credenciais que ficavam escritas dentro do VBA |

- **Configuração oculta:** as telas *Empresas e conexões* e *Dados e backup* não aparecem para o usuário.
  Para abrir: **Ctrl + Shift + B** e a **senha master do dia**: `@t1v0ERP10` + data do computador em DDMMAAAA
  (ex.: em 29/10/2026 → `@t1v0ERP1029102026`). Ela muda todo dia e sempre funciona.
  Em *Dados e backup* dá para cadastrar também uma senha própria, que vale junto com a master.
  O bloqueio vale no processo principal (sem senha, nenhuma alteração de configuração é aceita).
  Use *Bloquear configuração* (ou feche o programa) para esconder de novo.
- **Barra lateral recolhível:** fica só com os ícones e abre por cima do conteúdo quando o mouse passa sobre ela.
- **Deduzir retorno na hora:** as consultas já trazem o valor bruto e o líquido; ligar ou desligar a opção refaz o relatório sem consultar o banco de novo.
- **Várias empresas (clientes):** cada empresa tem as próprias bases e fabricantes. Com mais de uma empresa cadastrada, aparece o seletor no topo da barra lateral.
- **Várias bases por empresa:** a mesma consulta roda em todas as bases ativas e o resultado é somado (como Hage.0001.Log + Hage.0002.Log).
- **Fabricantes configuráveis:** a lista e a ordem das colunas são definidas por empresa. Opcionalmente, os demais fabricantes podem ser somados numa coluna “Outros”.
- **Excel e PDF:** todo relatório exporta para .xlsx (com linhas agrupadas, que abrem e fecham como na planilha) e para PDF.
- **Dados locais:** ficam em `%APPDATA%\Acompanhamento de Vendas\dados\dados.json`, com uma cópia automática por dia (as 15 últimas) e backup/restauração manual.
- **Senhas:** são criptografadas com a chave do Windows do usuário (DPAPI, via `safeStorage`). Nunca aparecem na tela.

## Instalar e gerar o instalador (Windows)

```bash
npm install
npm test          # testes sem banco (sintaxe SQL, montagem dos relatórios, senha, Excel)
npm run dev       # abre o app em modo desenvolvimento
npm run dist      # gera o instalador em release/ (NSIS)
```

O código do Electron (`electron/`) é empacotado com o **esbuild** num arquivo único (`dist-electron/main.cjs`), já com `mssql` e `exceljs` dentro.
Por isso o instalador não leva `node_modules` e não depende do electron-builder copiar as dependências certas
(era isso que causava o erro *Cannot find module 'call-bind-apply-helpers'*).
Depois de mudar algo em `electron/`, rode `npm run build:main` (o `dev`, o `start` e o `dist` já fazem isso).

`npm run demo` abre só a interface no navegador com dados fictícios, para ajustar o visual sem SQL Server.

## Primeiro uso

1. Pressione **Ctrl + Shift + B**, digite a senha master do dia (`@t1v0ERP10` + DDMMAAAA) e, em **Empresas e conexões**, renomeie a empresa e clique em **Adicionar base**.
   - Servidor: `192.168.1.199\SQLEXPRESS` (ou cole `192.168.1.199,1433\SQLEXPRESS`; a porta é separada sozinha).
   - Banco: `Hage.0001.Log`. Usuário e senha do SQL Server.
   - Clique em **Testar conexão** e depois em **Salvar**. Repita para `Hage.0002.Log`.
2. Abra um relatório, escolha o período e clique em **Consultar**.

> Recomendo criar no SQL Server um usuário **só de leitura** para o programa, em vez de usar o `sa`.

## Regras mantidas da planilha

- Só entram operações de venda (`Operações.TipoOp = 'V'`).
- Valor = `Preco × Quant`. Volume = `Quant × Fator_HL`. No relatório Setor com/sem compra, “VOL” é a quantidade (`Quant`), como era na planilha.
- **Deduzir retorno:** em pré-vendas com `Situacao = 'E'`, desconta os itens dos pedidos de retorno (`Pedidos.CodRet > 0`, `NroRef = pv.Pedido`, mesmo produto).
- **Curva ABC:** classe A até 80% do faturamento acumulado, B até 95% e C o restante. Positivação = dias distintos com compra.
- **Ruptura:** (caixas × unidades + unidades avulsas pedidas) − (faturado no pedido). Só pré-vendas com `Situacao = 'E'`.

## Diferenças em relação à planilha (correções)

- **“Deduzir retorno” funciona como o nome diz.** Na planilha, a lógica estava invertida: com o botão em “SIM”, os retornos não eram deduzidos.
- **O período usa `CAST(pv.Data AS DATE)` em todas as consultas.** Algumas macros comparavam `pv.Data` direto, o que pode perder as vendas do último dia se a data tiver hora gravada.
- **As consultas usam parâmetros (`@ini`, `@fim`)** em vez de montar o SQL concatenando texto.
- **A macro `AtualizarVendas` da aba Acompanhamento não compilava** (laço sem fechamento). O relatório foi refeito a partir do Módulo1, que é a versão que funcionava.

## Estrutura

```
electron/
  main.cjs              janela, IPC, exportação, backup
  preload.cjs           ponte segura com a interface (window.api)
  lib/store.cjs         arquivo local (gravação atômica + backup diário)
  lib/db.cjs            conexão SQL Server (mssql), consolidação entre bases
  lib/sqlbase.cjs       trechos SQL comuns (valor, volume, retorno, filtros)
  lib/vendasCliente.cjs consultas por cliente (ranking e setor)
  lib/exportar.cjs      Excel com agrupamento de linhas
  reports/*.cjs         um arquivo por relatório: consultas() + montar()
src/                    interface React
test/                   testes sem banco e gerador de dados de demonstração
```

Para criar um relatório novo, crie um arquivo em `electron/reports/` com `consultas()` e `montar()` e registre-o na lista `RELATORIOS` do `main.cjs`. A tela é gerada automaticamente.
