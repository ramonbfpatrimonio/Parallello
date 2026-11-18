# Manual do módulo Cobrança

## 1. Primeiro acesso (administrador)

1. No Parallello, abra **Cobrança**.
2. Aperte **Ctrl+Shift+B** e digite a senha do Parallello. A **Área do sistema** aparece na barra lateral e fica lá até você clicar em **Fechar área**.
3. Em **Operadores**, clique em **Novo operador** e informe o nome e o PIN (de 4 a 8 números). Marque também:
   - **Pode protestar títulos no ERP**
   - **Pode fazer o disparo de e-mails em lote**
4. Em **Financeiro e PIX**, preencha o setor, o e-mail, o telefone, o horário, os dados bancários e a chave PIX. Leia o **Teste do PIX** com o app do banco para conferir o recebedor e depois clique em **Salvar**.
5. Em **E-mail (SMTP)**, clique em **Testar conexão**. O e-mail sai pelo SMTP de cobrança do ERP.

Tudo isso fica salvo na nuvem, só para a empresa logada.

## 2. Entrar

Abra **Cobrança**, clique no seu nome e digite o **PIN**. Para trocar de operador, use o ícone no rodapé da barra lateral.

O nome do operador vai em cada registro, no histórico do ERP (campo Usuário) e no resumo de ligações.

## 3. Painel de cobrança

- **Indicadores:** total a receber, vencido, a vencer, juros e multas, valor médio, perda estimada, maior devedor, clientes e títulos vencidos, atraso médio, prazo médio de recebimento, total recebido, cobrado e recebido, ligações de hoje e taxa de atendimento. O botão **Ocultar indicadores** esconde os cards.
- **Faixas:** Todas, Vence hoje, A vencer, Próximos 7 dias, Vencido 1–30, 31–60, 61–90, +90, Com acordo, Negociação e Top 10 devedores. Cada uma mostra quantos clientes tem e o valor.
- **Busca:** por código, CPF/CNPJ, nome, documento ou NF.
- **Ordenar:** clique no cabeçalho (Cliente, Vencimento, Valor, Valor atual, Dias).
- **Excel, PDF e Imprimir** saem com o que está na tela.

Os títulos com retorno agendado para depois de hoje somem do painel até a data. O aviso azul mostra quantos estão escondidos, e o **Mostrar** traz eles de volta.

## 4. Registrar uma cobrança

Em **Registrar**, no título:

1. Escolha o **resultado do contato**. Dá para filtrar digitando, por exemplo "25" ou "whatsapp".
2. Escreva a **descrição** (mínimo de 20 caracteres; ela fica em maiúsculas).
3. Escolha a **situação**, que vem do ERP.
4. Se houver **próximo contato**, informe a data e, se quiser, a hora.
5. Clique em **Salvar registro**.

O registro vai para a nuvem e para o histórico de cobranças do ERP. Não é permitido registrar o mesmo documento duas vezes no mesmo dia.

Se o ERP estiver fora do ar, o registro fica salvo na nuvem e aparece em **Pendentes no ERP**. Lá o botão **Gravar todos no ERP** tenta de novo.

## 5. E-mail

- **E-mail** (no título): o modelo é escolhido pela faixa do título (lembrete, aviso de atraso, urgente ou notificação extrajudicial). Dá para trocar o modelo nos botões e editar o texto.
- **E-mail todos** (no cliente): junta todos os títulos vencidos do cliente, separados por faixa, com subtotais.
- O rodapé com o contato do financeiro, os dados bancários e o PIX entra sozinho. O QR code do PIX vai no corpo do e-mail se a opção estiver marcada.

## 6. WhatsApp

Em **WhatsApp**, no cliente:

1. Marque os títulos que vão na mensagem. Os vencidos já vêm marcados.
2. Confira o telefone e o texto, que dá para editar.
3. Escolha **WhatsApp do computador** ou **WhatsApp Web** e clique em **Abrir WhatsApp**.

Cada envio é contado no cliente ("WhatsApp: N envios"). Depois da conversa, registre o resultado.

## 7. PIX

Em **PIX**, no título, o PIX sai com o valor atualizado. Você pode mudar o valor ou deixar o cliente digitar.

O botão **Copiar PIX copia e cola** copia o código e fica verde com "✓ Copiado!". O mesmo botão aparece no e-mail e no WhatsApp.

## 8. Protestar

O botão **Protestar** aparece nos títulos da última faixa que ainda não foram protestados. Depois da confirmação, o título fica marcado como protestado no ERP.

Só operadores com permissão conseguem protestar.

## 9. Histórico

Em **Histórico**, no cliente, há duas abas:

- **Cobrança (Parallello):** registros, e-mails, WhatsApp e protestos, com operador e data. Mostra também se cada registro já entrou no ERP.
- **Histórico do ERP:** o que está na tabela HistoricoCobrancas.

## 10. Agendados hoje

Mostra os retornos marcados para hoje, em ordem de horário, com Registrar, WhatsApp, E-mail e Histórico. O número na barra lateral é a quantidade do dia.

## 11. Disparo de lembretes

Envia o lembrete para os títulos que vencem de amanhã até daqui a 7 dias (esse número muda em Área do sistema → Faixas e regras):

1. Confira a lista e desmarque quem não deve receber.
2. Clique em **Disparar** e confirme.

Há uma pausa de 2 segundos entre os e-mails. No fim sai o relatório (enviados, falha, sem e-mail), que pode ir para Excel ou PDF.

Só operadores com permissão conseguem disparar.

## 12. Resumo de ligações

Escolha o período e veja, por operador, as ligações atendidas e não atendidas, o total e a taxa de atendimento.

Conta como **atendida** o resultado 01, 02 ou 03 e como **não atendida** o 25, 26, 27 ou 31. Isso pode ser mudado em Área do sistema → Resultados de contato. Para ver cada ligação, use **Ver cada ligação**.

## 13. Área do sistema (Ctrl+Shift+B)

| Aba | Para quê |
|---|---|
| Operadores | Cadastrar, editar, desativar e excluir operadores; trocar PIN; permissões |
| Financeiro e PIX | Rodapé das mensagens, dados bancários, chave PIX, PIX com valor, QR no e-mail |
| Modelos de mensagem | Textos de todos os e-mails e do WhatsApp, com variáveis como {cliente}, {documento}, {valor} |
| Resultados de contato | A lista de resultados (os 33 da planilha), o que conta como ligação e o que marca acordo ou negociação |
| Faixas e regras | Dias dos "Próximos dias", limites das faixas de atraso e mínimo de caracteres da descrição |
| E-mail (SMTP) | Teste do SMTP de cobrança do ERP |

## Sem internet

A Cobrança salva na nuvem, então sem internet aparece um aviso no topo e nada é salvo até a conexão voltar.
