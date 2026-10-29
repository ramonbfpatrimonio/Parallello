# Parallello

Um programa só (Electron + React) com os quatro sistemas:

| Sistema | O que faz | Pasta |
|---|---|---|
| **Gerar Pré-Venda** | Lê o pedido de compra em PDF e grava a pré-venda no ERP (login Supabase) | `src/modulos/gerar-pre-venda` |
| **Pré-Venda de Ruptura** | Gera a PV de ruptura no ERP (usuários locais) | `src/modulos/prevenda-ruptura` |
| **Acompanhamento de Vendas** | Relatórios de vendas por fabricante, ranking, setor e ruptura | `src/modulos/acompanhamento` |
| **Pesquisa de Relatórios** | Quais relatórios do Ativo.ERP têm as colunas procuradas | `src/modulos/pesquisa-relatorios` |

A tela inicial mostra um card por sistema. Clicar abre o sistema numa **aba** na barra superior; dá para deixar
vários abertos ao mesmo tempo e alternar pelas abas (ou **Ctrl+Tab** / **Ctrl+Shift+Tab**). A marca *Parallello*
no canto volta para a tela inicial. Fechar a aba (×) fecha a tela; no Pré-Venda de Ruptura também encerra o login
e no Acompanhamento tranca de novo a configuração.

Cada sistema continua igual por dentro: mesmas telas, mesmas regras, mesmo **Ctrl+Shift+B** e mesmas senhas.
Os detalhes de cada um estão no `LEIAME-original.md` da pasta do sistema.

## Comandos

```bash
npm install
npm run dev        # abre o Parallello com recarga automática das telas
npm test           # testes de todos os sistemas + do Parallello (sem banco)
npm run typecheck  # TypeScript do Gerar Pré-Venda
npm run build      # gera out/
npm run dist       # gera o instalador em dist/  (npm run rebuild:nativo antes, se usar o ODBC nativo)
npm run release    # gera e publica no GitHub (atualização automática)
```

`npm run dev -- --abrir=prevenda-ruptura` já abre direto num sistema. O Pré-Venda de Ruptura aceita `--demo`
(ERP simulado, sem SQL Server). Em desenvolvimento, **F12** abre o DevTools da tela que está à frente.

## Como está organizado

```
src/
  main/                 processo principal do Parallello
    index.js            janela, abas (um WebContentsView por sistema), ciclo de vida
    roteador.js         IPC: entrega cada chamada ao sistema dono da tela que chamou
    migracao.js         copia os dados dos programas antigos na primeira abertura
    atualizacao.js      atualização automática (uma só para tudo)
    modulos.js          liga o id de cada sistema ao processo principal dele
  preload/shell.js      ponte da tela inicial / barra
  shell/                tela inicial e barra superior (React)
  modulos/
    catalogo.js         nome, descrição, cor e página de cada sistema (cards e abas)
    <sistema>/          o código de cada programa, quase sem mudanças
scripts/                build (Vite + esbuild), dev e testes
tests/                  testes do Parallello
```

### Como os sistemas convivem

- **Telas isoladas:** cada sistema roda num `WebContentsView` próprio, com o seu preload e o seu `window.api`.
  Nada de CSS, React ou armazenamento do navegador é compartilhado entre eles.
- **IPC sem conflito:** vários sistemas usam o mesmo nome de canal (`exportar:excel`, `config:abrir`...).
  O `roteador.js` registra cada canal uma vez e entrega a chamada ao sistema dono da tela que chamou.
  Por isso as telas e os preloads não precisaram mudar.
- **Processo principal:** o `main` de cada programa virou uma função `criarModulo(ctx)`, iniciada só quando
  o sistema é aberto pela primeira vez. O `ctx` traz o IPC do sistema, a pasta de dados e a janela para os
  diálogos de abrir/salvar. O que mudou em cada um:
  - `acompanhamento/main/modulo.cjs` (era `electron/main.cjs`)
  - `prevenda-ruptura/main/modulo.js` (era `electron/main.js`) e `store.js` recebe a pasta
  - `gerar-pre-venda/main/modulo.ts` (era `index.ts` + `atualizacao.ts`) e `pasta.ts` no lugar do `userData`
  - `pesquisa-relatorios/modulo.js` (era `main.js`)
- **Build único:** o Vite gera as telas React (várias páginas num build só) e o esbuild empacota o processo
  principal com `mssql`, `exceljs` e `supabase-js` dentro. No instalador vão em `node_modules` só o
  `electron-updater`, o `pdfjs-dist` e o driver opcional `msnodesqlv8`.

### Incluir um sistema novo

1. Copie o programa para `src/modulos/<id>/` e transforme o `main` numa função `criarModulo(ctx)`
   (use `ctx.ipc.handle` no lugar de `ipcMain.handle`, `ctx.janela()` nos diálogos, `ctx.enviar()` no lugar de
   `janela.webContents.send` e `ctx.pastaDados` no lugar de `app.getPath('userData')`).
2. Acrescente o sistema em `src/modulos/catalogo.js`, em `src/main/modulos.js`, o ícone em `src/shell/src/icones.js`,
   o preload em `scripts/compilar-main.mjs` e a página em `vite.config.mjs`.

## Dados

Tudo fica em `%APPDATA%\Parallello\modulos\<sistema>` (o link *Abrir a pasta de dados* na tela inicial abre essa pasta).
Os backups do Pesquisa de Relatórios continuam em `Documentos\Pesquisa de Relatorios\Backup`.

**Vindo dos programas separados:** na primeira vez que cada sistema abre, o Parallello **copia** os dados do programa
antigo deste computador (empresas, conexões, usuários, histórico, relatórios, aparência). A pasta antiga não é alterada.
As **senhas do SQL Server** não vêm: o Windows cifra essas senhas com uma chave de cada programa, então o Parallello
não consegue lê-las. Informe a senha de cada conexão uma vez (Acompanhamento e Pré-Venda de Ruptura: Ctrl+Shift+B →
editar a conexão; Gerar Pré-Venda: o próprio programa pede). No Gerar Pré-Venda, entre uma vez com internet para
liberar o acesso offline de novo.

## Atualização automática

Uma atualização para os quatro sistemas, pelo GitHub Releases (`ramonbfpatrimonio/Parallello`, em `electron-builder.yml`).
Crie o repositório público e publique com `npm run release`. O aviso aparece na barra superior:
*Atualizar para X* → baixa em segundo plano → *Reiniciar e atualizar*. Se não reiniciar, instala ao fechar.
Os avisos de atualização que existiam dentro do Gerar Pré-Venda e do Pesquisa de Relatórios agora ficam a cargo do Parallello.

## Supabase

Continuam os mesmos projetos de antes, sem mudança nas tabelas nem nas Edge Functions:
- Gerar Pré-Venda: endereço/chave em `src/modulos/gerar-pre-venda/renderer/src/servicos/nuvem.ts` (ou no `.env` da raiz).
- Pesquisa de Relatórios: `src/modulos/pesquisa-relatorios/src/nuvem-config.js`.
