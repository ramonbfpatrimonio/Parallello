# Pré-Venda de Ruptura

Programa desktop (Electron + React + Vite) que substitui a planilha **PREVENDA_RUPTURA.xlsm**.
Ele roda sem nuvem: as configurações, os usuários e o histórico ficam em arquivos JSON na pasta de dados do Windows
(`%APPDATA%\Pre-Venda de Ruptura\dados`). O programa se conecta direto ao SQL Server do ERP de cada cliente.

## Comandos

```bash
npm install
npm run dev        # desenvolvimento conectando no banco real
npm run dev:demo   # modo demonstração: simula o ERP em memória, sem SQL Server
npm run dist       # gera o instalador Windows em release/ (no Linux precisa do wine)
```

O processo principal do Electron (`electron/*.js` + mssql + exceljs) é empacotado pelo **esbuild** num único arquivo,
`dist-electron/main.js`. Por isso o instalador não leva `node_modules`, e todas as bibliotecas ficam em `devDependencies`.
Isso evita o erro `Cannot find module ...` que o electron-builder causa quando deixa dependências de fora.
Os scripts `dev`, `dev:demo`, `start` e `dist` já rodam o `build:main` antes.

O executável instalado também aceita `--demo`.

## Primeiro uso

1. Na primeira abertura, o programa pede a **senha master** e cadastra o **primeiro usuário**.
2. Em seguida abre a configuração para cadastrar a primeira empresa (conexão SQL Server). Use **Testar conexão** antes de salvar.
3. Em **Banco de dados → Verificar tabelas**, confira se o banco tem `RupturasReferencias` e `EventosSistema`. Se faltar alguma, ela pode ser criada pelo próprio programa (o script aparece na tela).
4. Depois disso, as configurações só abrem com **Ctrl+Shift+B** + senha master.

### Senha master

A senha master é fixa no código e muda todo dia: `@t1v0ERP10` + a data do computador no formato DDMMAAAA.
Exemplo: em 29/10/2026 a senha é `@t1v0ERP1029102026`. Ela não pode ser alterada pela tela; para mudar o padrão,
edite `senhaMasterDoDia()` em `electron/main.js`.

## Estrutura

| Arquivo | O que faz |
|---|---|
| `electron/main.js` | (fonte; o build gera `dist-electron/main.js`) Janela, sessão (login), canais IPC e permissões da área de configuração |
| `electron/db.js` | Todas as consultas SQL: rupturas, clientes, fabricantes, geração da PV em transação, verificação e criação de tabelas |
| `electron/store.js` | Armazenamento local (JSON); hash scrypt das senhas de usuários; senha do banco criptografada pelo Windows (DPAPI/safeStorage) |
| `electron/mock.js` | ERP simulado para o modo demonstração |
| `electron/exportar.js` | Exportação para Excel (exceljs) |
| `src/telas/*` | Telas: Entrada (setup/login), Rupturas, Clientes, Histórico, Configuração |

## Regras mantidas da planilha

- Ruptura = PV com situação `E` (configurável) no período, cuja quantidade (caixas × unid/caixa + unidades) é maior que a do pedido em `[Itens de Pedido]`.
- Posição da ruptura (1ª, 2ª…) é calculada por cliente + nº pedido do cliente + produto, em ordem de data e número da PV.
- A linha fica "atendida" quando existe referência em `RupturasReferencias` cuja PV ainda existe em `Prevendas`.
- A geração bloqueia: linhas já atendidas, pedidos diferentes e equipes diferentes. Ela avisa quando há itens do pedido fora da seleção e quando o estoque é insuficiente.
- Os dados copiados são os mesmos: equipe, setor, vendedor e operação vêm da PV original; preços e descontos vêm do item original, ou de `Produtos.PrecoVenda` quando o item não existe. Também grava a observação, `RupturasReferencias` e `EventosSistema`.

## Correções em relação à planilha

- **Transação única:** cabeçalho, itens e referências são gravados juntos. Se der erro no meio, nada fica gravado.
- **Número da PV:** o número em `PrevendasIndice` é reservado com trava (`UPDLOCK, HOLDLOCK`), então duas máquinas não pegam o mesmo número. O programa também pula números que já existam em `Prevendas`.
- **Dupla geração:** antes de gravar, o programa confere de novo no banco se o item já foi atendido por outra estação.
- **Virada do ano:** equipe, vendedor, preços e `AnoRef` usam o ano da PV de origem, não o ano atual.
- **Consultas:** são todas parametrizadas, sem concatenar texto.
- **Pedido e estoque:** são somados antes do JOIN, o que evita quantidades em dobro quando há mais de uma linha.
- **Data final:** o período inclui o dia final inteiro, mesmo quando `Data` tem hora.
- **Comparação de estoque:** é feita em unidades reais. O ICMSF não é mais arredondado para 2 casas pelo programa.
- **Validações novas:** bloqueia misturar clientes diferentes e o mesmo produto repetido na seleção.
- **Abas recriadas:** a aba "Clientes com rupturas" e a lista de fabricantes funcionam de novo. Na planilha, as macros delas tinham sido apagadas.

## Limitações conhecidas

- A autenticação é só por usuário e senha do SQL Server. Autenticação do Windows exigiria um driver nativo (`msnodesqlv8`).
- O histórico de "PVs geradas" é local, por computador. O registro central continua em `EventosSistema`.
- O instalador não é assinado digitalmente, então o Windows SmartScreen pode avisar na primeira execução.
