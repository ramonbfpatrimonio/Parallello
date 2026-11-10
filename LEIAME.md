# Parallello

Um programa só (Electron + React) com os sistemas:

| Sistema | O que faz | Pasta |
|---|---|---|
| **Gerar Pré-Venda** | Lê o pedido de compra em PDF e grava a pré-venda no ERP | `src/modulos/gerar-pre-venda` |
| **Pré-Venda de Ruptura** | Gera a PV de ruptura no ERP | `src/modulos/prevenda-ruptura` |
| **Acompanhamento de Vendas** | Relatórios de vendas por fabricante, ranking, setor e ruptura | `src/modulos/acompanhamento` |
| **Pesquisa de Relatórios** | Quais relatórios do Ativo.ERP têm as colunas procuradas | `src/modulos/pesquisa-relatorios` |
| **Indicador Logístico** | Cumprimento de entregas, prazo médio, custo por entrega e devoluções, com metas | `src/modulos/indicador-logistico` |
| **Comissão por Contas Recebidas (Cidade/Comissão)** | Comissão dos vendedores pelas parcelas recebidas, configuração de % por fabricante no ERP e fechamentos | `src/modulos/comissao-contas-recebidas` |

## Login, módulos e configuração (um só para tudo)

- **Abertura:** ao iniciar, aparece a marca do Parallello, que esmaece e dá lugar ao nome; depois, o login.
- **Login único.** O mesmo usuário e senha valem para todos os sistemas: **nenhum sistema pede login**, todos abrem
  direto. Os usuários ficam na nuvem (Supabase), por empresa.
  - Suporte: usuário **`administrador`**, senha **`P@r@llell0` + data do computador (DDMMAAAA)**. Funciona sem
    internet e já abre a **Configuração** junto. Com internet, também abre o super administrador na nuvem.
  - Usuários: o nome de login criado em Configuração > Usuários (ex.: `joao`). Contas antigas do Gerar entram pelo e-mail.
  - Sem internet: quem já entrou naquele computador entra por até 7 dias.
- **Módulos em dois níveis:**
  - **Permissão** (Configuração > Usuários): o que cada um *pode* usar. Super administrador e master: todos.
    Administrador da empresa: os contratados pela empresa. Operador: os marcados pelo administrador.
  - **Liberar módulos** (aba na barra, para todos): cada pessoa marca os sistemas que quer e clica em **Salvar**.
    Só os liberados aparecem na tela inicial (os outros nem aparecem). Marcar um módulo sem permissão mostra
    "Você não tem acesso ao módulo ...". Começa em branco.
- **Configuração do Parallello** (**Ctrl+Shift+B** na tela inicial + senha master; abre sozinha ao entrar como
  `administrador`; aparece como aba "Configuração" até ser trancada):
  - **Conexão com o banco:** a conexão única (SQL Server do ERP) usada por todos os sistemas e todos os computadores
    da empresa. A senha do SQL fica em cada computador, cifrada pelo Windows. Sem empresa na nuvem (senha master na
    instalação, sem internet), a conexão fica só naquele computador e depois pode ser enviada para a empresa.
    As regras do Gerar Pré-Venda por conexão (equipe, vendedor, CSTs...) ficam no fim do formulário.
  - **Usuários:** criar, editar, trocar senha, desativar e dar permissão de módulos aos operadores.
  - **Empresas** e **Cobrança** (super administrador): clientes do Parallello, módulos contratados, bloqueio,
    licença mensal (valor, vencimento, baixa de pagamento, estorno, parâmetros de aviso e tolerância).
  - **Eventos do sistema:** quem fez o quê, quando e em qual computador.
  - Ctrl+Shift+B dentro do Gerar Pré-Venda também abre esta configuração. Dentro do Pré-Venda de Ruptura e do
    Acompanhamento, o Ctrl+Shift+B continua abrindo a configuração própria deles (parâmetros, tabelas, fabricantes).
  - **Modelos de Pedido** e **Aparência** continuam dentro do Gerar Pré-Venda (menu lateral, para o super administrador).
- **Como cada sistema usa a conexão:** o Pré-Venda de Ruptura entra sozinho na última empresa usada (*Trocar empresa*
  no menu lateral); o Acompanhamento soma todas as conexões ativas; o Indicador Logístico usa "Todas", por grupo
  (o campo *Cliente*) ou uma conexão; o Gerar Pré-Venda escolhe a conexão na faixa superior; o Comissão por Contas
  Recebidas escolhe a conexão no próprio filtro (lembra a última usada). Gravar % de comissão no ERP
  (*Configurar Comissões*) é só para administradores; os demais consultam.
- **Licença:** a cobrança mensal vale para o Parallello inteiro. Vencendo ou atrasada, aparece o aviso na barra;
  passou da tolerância, ninguém da empresa entra até a baixa do pagamento.

A tela inicial mostra um card por sistema. Clicar abre o sistema numa **aba** na barra superior; dá para deixar
vários abertos ao mesmo tempo e alternar pelas abas (ou **Ctrl+Tab** / **Ctrl+Shift+Tab**). A marca *Parallello*
no canto volta para a tela inicial. Sair (menu do usuário, no canto direito) fecha todos os sistemas.

Os detalhes de cada sistema estão no `LEIAME-original.md` da pasta dele (o que fala de login e conexões
próprias foi substituído pelo que está acima). A nuvem está em `supabase/LEIAME.md`.

## Comandos

```bash
npm install
npm run dev        # abre o Parallello com recarga automática das telas
npm test           # testes de todos os sistemas + do Parallello (PGHOST=... npm test inclui as regras da nuvem)
npm run typecheck  # TypeScript do Gerar Pré-Venda
npm run build      # gera out/
npm run dist       # gera o instalador em dist/  (npm run rebuild:nativo antes, se usar o ODBC nativo)
npm run release    # gera e publica no GitHub (atualização automática)
```

O Pré-Venda de Ruptura aceita `--demo`
(ERP simulado, sem SQL Server). Em desenvolvimento, **F12** abre o DevTools da tela que está à frente.

## Como está organizado

```
src/
  main/                 processo principal do Parallello
    index.js            janela, abas (um WebContentsView por sistema), permissões, canais da Configuração
    sessao.js           login do Parallello (nuvem, sem internet, senha master) e módulos liberados
    nuvem.js            sessão da nuvem (Supabase); os sistemas usam o token dela
    roteador.js         IPC: entrega cada chamada ao sistema dono da tela que chamou
    migracao.js         copia os dados dos programas antigos na primeira abertura
    atualizacao.js      atualização automática (uma só para tudo)
    modulos.js          liga o id de cada sistema ao processo principal dele
  compartilhado/         conexões com o banco (uma só para todos), senha master, endereço da nuvem
  preload/shell.js      ponte da tela inicial / barra
  shell/                abertura, login, tela inicial, barra, Liberar módulos e Configuração (React)
  modulos/
    catalogo.js         nome, descrição, cor e página de cada sistema (cards e abas)
    <sistema>/          o código de cada programa, quase sem mudanças
supabase/               nuvem: migrações, Edge Functions e LEIAME
scripts/                build (Vite + esbuild), dev e testes
tests/                  testes do Parallello (e tests/sql: regras da nuvem)
```

### Como os sistemas convivem

- **Telas isoladas:** cada sistema roda num `WebContentsView` próprio, com o seu preload e o seu `window.api`.
  Nada de CSS, React ou armazenamento do navegador é compartilhado entre eles.
- **IPC sem conflito:** vários sistemas usam o mesmo nome de canal (`exportar:excel`, `config:abrir`...).
  O `roteador.js` registra cada canal uma vez e entrega a chamada ao sistema dono da tela que chamou.
  Por isso as telas e os preloads não precisaram mudar.
- **Processo principal:** o `main` de cada programa virou uma função `criarModulo(ctx)`, iniciada só quando
  o sistema é aberto pela primeira vez. O `ctx` traz o IPC do sistema, a pasta de dados e a janela para os
  diálogos de abrir/salvar, e também `ctx.usuario()` (quem entrou no Parallello) e `ctx.conexoes`
  (as conexões da empresa, com a senha deste computador). O que mudou em cada um:
  - `acompanhamento/main/modulo.cjs` (era `electron/main.cjs`)
  - `prevenda-ruptura/main/modulo.js` (era `electron/main.js`) e `store.js` recebe a pasta
  - `gerar-pre-venda/main/modulo.ts` (era `index.ts` + `atualizacao.ts`) e `pasta.ts` no lugar do `userData`
  - `pesquisa-relatorios/modulo.js` (era `main.js`)
  - `indicador-logistico/main/modulo.js` (era `electron/main.js`)
  - Login e conexões próprias saíram de todos (agora são do Parallello). O Gerar Pré-Venda usa a sessão da
    nuvem do Parallello; conexões, usuários, empresas, cobrança e eventos saíram dele para a Configuração.
- **Build único:** o Vite gera as telas React (várias páginas num build só) e o esbuild empacota o processo
  principal com `mssql`, `exceljs` e `supabase-js` dentro. No instalador vão em `node_modules` só o
  `electron-updater`, o `pdfjs-dist` e o driver opcional `msnodesqlv8`.

### Incluir um sistema novo

1. Copie o programa para `src/modulos/<id>/` e transforme o `main` numa função `criarModulo(ctx)`
   (use `ctx.ipc.handle` no lugar de `ipcMain.handle`, `ctx.janela()` nos diálogos, `ctx.enviar()` no lugar de
   `janela.webContents.send` e `ctx.pastaDados` no lugar de `app.getPath('userData')`). Login: use
   `ctx.usuario()`; banco: `await ctx.conexoes.listar()` e `await ctx.conexoes.senha(id)`.
2. Acrescente o sistema em `src/modulos/catalogo.js`, em `src/main/modulos.js`, o ícone em `src/shell/src/icones.js`,
   o preload em `scripts/compilar-main.mjs` e a página em `vite.config.mjs`. O módulo novo aparece
   sozinho em *Liberar módulos* e nas permissões de Configuração > Usuários.

## Dados

Tudo fica em `%APPDATA%\Parallello`: as conexões com o banco em `conexoes.json` (com as senhas do SQL deste
computador, cifradas pelo Windows), o acesso sem internet em `acesso-offline.dat` e os dados de cada sistema em
`modulos\<sistema>` (menu do usuário → *Abrir a pasta de dados*).
Os backups do Pesquisa de Relatórios continuam em `Documentos\Pesquisa de Relatorios\Backup`.

**Vindo dos programas separados:** na primeira vez que cada sistema abre, o Parallello **copia** os dados do programa
antigo deste computador (histórico, relatórios, metas, fabricantes, aparência...). A pasta antiga não é alterada.
Usuários e conexões próprias de cada programa não são mais usados: valem os do Parallello. As conexões do Gerar
Pré-Venda viram as conexões do Parallello. As **senhas do SQL Server** não vêm (o Windows cifra com uma chave de
cada programa): informe a senha de cada conexão uma vez em Configuração (Ctrl+Shift+B).

## Atualização automática (publicar uma versão nova)

Uma atualização para todos os sistemas, pelo GitHub Releases de `ramonbfpatrimonio/Parallello`
(público, configurado em `electron-builder.yml`). O instalador é gerado **pelo próprio GitHub**
(roteiro `.github/workflows/release.yml`), então não precisa de token nem de gerar nada no seu computador.

### Uma vez só
No GitHub: **Settings → Actions → General → Workflow permissions → Read and write permissions → Save**.

### Toda versão nova
Dê dois cliques em **`publicar.cmd`** (ou, no cmd, `publicar.cmd minor` para 1.0.x → 1.1.0, `publicar.cmd major` para 2.0.0). Ele:
1. traz o que já está no GitHub e confere o código (typecheck e testes). Se algo falhar, nada é publicado;
2. guarda as alterações, sobe a versão no `package.json` e cria a tag (ex.: `v1.0.1`);
3. envia ao GitHub.

O GitHub gera o instalador em uns 5 a 10 minutos (acompanhe em **Actions**) e publica o Release com
`Parallello-Setup-x.y.z.exe`, `.blockmap` e `latest.yml`.

Nos computadores: o Parallello verifica ao abrir e a cada 4 horas. O aviso aparece na barra superior:
*Atualizar para X* → baixa em segundo plano → *Reiniciar e atualizar*. Se não reiniciar, instala ao fechar.
O primeiro computador de cada cliente é instalado com o `.exe` do Release; depois disso, tudo é automático.
Os avisos de atualização que existiam dentro do Gerar Pré-Venda e do Pesquisa de Relatórios agora ficam a cargo do Parallello.

### Instalador do Parallello (para computadores novos)
Todo Release leva também o **`Instalador-Parallello.exe`** (pasta `instalador/`). É um `.exe` só, sem instalação:
pede o usuário `administrador` e a senha master (`P@r@llell0` + data do computador), procura a versão mais recente
no GitHub, baixa, confere o arquivo, fecha o Parallello se estiver aberto e instala sem perguntas, marcando
cada etapa com um check verde. Se uma etapa falhar, aparece o motivo e o botão **Tentar de novo**.

Link que sempre baixa o instalador mais recente:
https://github.com/ramonbfpatrimonio/Parallello/releases/latest/download/Instalador-Parallello.exe

Para testar no seu computador: `node scripts/instalador.mjs` e depois `npx electron out-instalador`.
Para gerar o `.exe` localmente: `npm run instalador` (sai em `dist-instalador\`).

Gerar localmente continua possível: `npm run dist` (só o instalador, em `dist\`) ou `npm run release` (gera e publica do seu computador, com `GH_TOKEN`).

## Supabase

Continuam os mesmos projetos de antes, sem mudança nas tabelas nem nas Edge Functions:
- Gerar Pré-Venda: endereço/chave em `src/modulos/gerar-pre-venda/renderer/src/servicos/nuvem.ts` (ou no `.env` da raiz).
- Pesquisa de Relatórios: `src/modulos/pesquisa-relatorios/src/nuvem-config.js`.
