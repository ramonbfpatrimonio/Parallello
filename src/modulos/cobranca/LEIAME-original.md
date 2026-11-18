# Parallello · Módulo Cobrança 1.0.0

Este módulo leva a planilha **COBRANCA2.0.xlsm** para dentro do Parallello. Os títulos continuam vindo do ERP, como na planilha. O histórico e o protesto continuam sendo gravados no ERP, e todo o resto agora fica salvo **na nuvem**, no Supabase do Parallello e separado por empresa.

- **Acesso:** o módulo não tem login próprio. Dentro dele, cada operador entra com o próprio **PIN**, cadastrado pelo administrador.
- **Área do sistema:** abre com **Ctrl+Shift+B** e a senha do Parallello. Ali ficam operadores, financeiro/PIX, modelos de mensagem, resultados de contato e faixas.
- **Análise de Crédito:** a ficha do cliente ganha o card **Situação de cobrança**.

Para ligar o módulo ao Parallello, siga o **INTEGRAR-NO-PARALLELLO.md**. O passo a passo de uso está no **MANUAL.md**.

## O que tem no zip

```
supabase/cobranca.sql                 tabelas, views e função na nuvem (rodar uma vez)
electron/cobranca-main.cjs            processo principal: ERP, SMTP, WhatsApp, cópia, Excel/PDF/Imprimir
electron/cobranca-preload.cjs         trecho para colar no preload
src/modulos/cobranca/                 o módulo (React)
  CobrancaModulo.jsx                  tela principal, PIN, barra lateral, Ctrl+Shift+B
  nuvem.js                            acesso ao Supabase (sempre por empresa)
  logica/                             regras da planilha: juros, faixas, KPIs, agenda, PIX, mensagens
  telas/                              painel, modais, agendados, disparo, ligações, pendências
  area/                               Área do sistema
  cobranca.css                        estilos (variáveis no topo para casar com as cores do Parallello)
src/modulos/analise-credito/CardSituacaoCobranca.jsx
tests/logica.test.js                  testes das regras (npm test)
dev/                                  teste do módulo sozinho, com dados simulados (npm run dev)
.npmrc                                espelho do Electron para o npm run dist não dar 504
```

## Da planilha para o módulo

| Planilha | Módulo |
|---|---|
| Painel com KPIs, faixas e Top 10 | Igual, com busca por código, CPF/CNPJ, nome, documento ou NF, ordenação nos cabeçalhos e Excel/PDF/Imprimir |
| Juros = valor × (Juros_Dia ÷ 100) × dias; valor atual = valor + juros + multa | Igual |
| Formulário de registro (33 resultados, situação, próxima, data/hora) | Igual: grava na nuvem **e** no `HistoricoCobrancas` do ERP |
| Agenda: retorno futuro some do painel | Igual, e aparece um aviso "N títulos escondidos — Mostrar" |
| E-mail individual, "E-mail (Todos)" e disparo de 7 dias | Igual, pelo SMTP de cobrança do ERP, com relatório (enviados / falha / sem e-mail) |
| WhatsApp com checkboxes | Igual, com escolha dos títulos, texto editável e WhatsApp do computador ou Web |
| PIX copia e cola + QR code | Igual, agora com o botão **Copiar PIX copia e cola** e PIX com o valor do título |
| Protestar (UPDATE Protestado) | Igual, só para operador com permissão |
| LOG_LIGACOES e resumo do dia | Sai do resultado de cada registro, por operador e por período |
| CONFIG_FINANCEIRO | Área do sistema → Financeiro e PIX |
| Verificar títulos pagos | Automático a cada atualização |

## Correções em relação à planilha

1. **Sem senha no código:** a planilha tinha o usuário e a senha do SQL fixos. O módulo usa a conexão única do Parallello.
2. **Consultas parametrizadas:** um nome ou documento com apóstrofo não quebra mais a consulta.
3. **Números como números:** nada de "R$" guardado como texto e convertido de volta.
4. **Juros_Dia com todas as casas:** a planilha arredondava a taxa para 2 casas (`DECIMAL(18,2)`) antes de calcular, e agora o cálculo usa a taxa cheia. Se o ERP guarda a taxa com mais de 2 casas, os juros ficam um pouco diferentes dos da planilha, e corretos.
5. **Multa só em vencido:** a planilha somava no KPI a multa de títulos a vencer, e agora não soma mais.
6. **Agenda por documento:** a planilha lia as colunas trocadas (Próxima × Resultado). Isso foi corrigido.
7. **Número do histórico no ERP:** a planilha usava contagem + 1. O módulo usa o maior número + 1 com bloqueio, assim dois operadores ao mesmo tempo não geram número repetido.
8. **Um registro por documento por dia:** garantido também pelo banco, com um índice único na nuvem.
9. **WhatsApp:** acentos, `%`, `&` e `#` vão codificados do jeito certo (a planilha quebrava alguns).
10. **QR code:** a planilha baixava o QR de um site externo. Agora ele é gerado no próprio app.
11. **Se o ERP recusar a gravação**, o registro fica salvo na nuvem e aparece em **Pendentes no ERP**, com o botão para gravar de novo.

## O que é gravado no ERP

O módulo só escreve no ERP nestes casos:

- **INSERT em `HistoricoCobrancas`:** cada registro de cobrança, com os mesmos campos da planilha (Cliente, Numero, Data, Hora, Usuario = operador, DatProCob, HorProCob, DatPrePag, ValPend, Observacao, Situacao).
- **UPDATE `Contas a Receber.Protestado = 1`:** no protesto, pedido pelo operador e confirmado na tela.

Todo o resto é leitura: Contas a Receber, Clientes, Pessoal, Tipos de Documentos a Receber, Contas Recebidas, HistoricoCobrancas, HistoricoCobrancasSituacoes, Empresas e ConfiguraçõesAdm (o SMTP).

## Testes

```bat
npm install
npm test        :: regras da planilha, PIX (CRC do exemplo oficial do Bacen), mensagens
npm run dev     :: abre o módulo com dados simulados em http://localhost:5199
```
