// Valores padrão da configuração da cobrança (vêm da planilha COBRANCA2.0).
// Tudo isto pode ser alterado na Área do sistema (Ctrl+Shift+B) e fica salvo
// na nuvem, por empresa.

export const RESULTADOS_PADRAO = [
  { grupo: 'Atendido', codigo: '01', descricao: 'Atendido - Conversa Realizada', ligacao: 'atendida' },
  { grupo: 'Atendido', codigo: '02', descricao: 'Atendido por Terceiro - Recado Deixado', ligacao: 'atendida' },
  { grupo: 'Atendido', codigo: '03', descricao: 'Atendido por Terceiro - Recado Não Aceito', ligacao: 'atendida' },
  { grupo: 'Atendido', codigo: '04', descricao: 'WhatsApp - Mensagem Enviada', ligacao: '' },
  { grupo: 'Atendido', codigo: '05', descricao: 'WhatsApp - Mensagem Visualizada', ligacao: '' },
  { grupo: 'Atendido', codigo: '06', descricao: 'WhatsApp - Resposta Recebida', ligacao: '' },
  { grupo: 'Atendido', codigo: '07', descricao: 'Contato por E-mail', ligacao: '' },
  { grupo: 'Atendido', codigo: '08', descricao: 'Outro Setor / Responsável', ligacao: '' },
  { grupo: 'Atendido', codigo: '09', descricao: 'Cliente Já Pagou - Confirmar Baixa', ligacao: '' },
  { grupo: 'Atendido', codigo: '10', descricao: 'Dúvida Esclarecida - Sem Negócio', ligacao: '' },
  { grupo: 'Atendido', codigo: '11', descricao: 'Recusou Falar / Sem Interesse', ligacao: '' },
  { grupo: 'Promessa de pagamento', codigo: '12', descricao: 'Cliente Pediu Retorno - Com Data', ligacao: '' },
  { grupo: 'Promessa de pagamento', codigo: '13', descricao: 'Cliente Pediu Retorno - Sem Data', ligacao: '' },
  { grupo: 'Promessa de pagamento', codigo: '14', descricao: 'Em Negociação - Em Andamento', ligacao: '', marca: 'negociacao' },
  { grupo: 'Promessa de pagamento', codigo: '15', descricao: 'Acordo Fechado - Aguardando Pagamento', ligacao: '', marca: 'acordo' },
  { grupo: 'Promessa de pagamento', codigo: '16', descricao: 'WhatsApp - Aguardando Resposta', ligacao: '' },
  { grupo: 'Protestos', codigo: '17', descricao: 'Protesto - Informado ao Cliente', ligacao: '' },
  { grupo: 'Protestos', codigo: '18', descricao: 'Protesto - Cliente Regularizará Imediatamente', ligacao: '' },
  { grupo: 'Protestos', codigo: '19', descricao: 'Protesto - Cliente Contestou - Verificar', ligacao: '' },
  { grupo: 'Protestos', codigo: '20', descricao: 'Protesto - Prazo Cumprido - Enviar para Cartório', ligacao: '' },
  { grupo: 'Protestos', codigo: '21', descricao: 'Protesto - Enviado ao Cartório - Aguardando Registro', ligacao: '' },
  { grupo: 'Protestos', codigo: '22', descricao: 'Protesto - Registrado - Aguardando Levantamento', ligacao: '' },
  { grupo: 'Protestos', codigo: '23', descricao: 'Protesto - Pago - Solicitar Baixa no Cartório', ligacao: '' },
  { grupo: 'Protestos', codigo: '24', descricao: 'Protesto - Levantado - Confirmar Recebimento', ligacao: '' },
  { grupo: 'Não consegui contato', codigo: '25', descricao: 'Não Atendido - Sem Resposta', ligacao: 'nao_atendida' },
  { grupo: 'Não consegui contato', codigo: '26', descricao: 'Não Atendido - Linha Ocupada', ligacao: 'nao_atendida' },
  { grupo: 'Não consegui contato', codigo: '27', descricao: 'Não Atendido - Número Inválido', ligacao: 'nao_atendida' },
  { grupo: 'Não consegui contato', codigo: '28', descricao: 'WhatsApp - Número Sem WhatsApp', ligacao: '' },
  { grupo: 'Não consegui contato', codigo: '29', descricao: 'Recado via Correio de Voz', ligacao: '' },
  { grupo: 'Não consegui contato', codigo: '30', descricao: 'Bloqueado / Não Aceita Chamadas', ligacao: '' },
  { grupo: 'Não consegui contato', codigo: '31', descricao: 'Ligação Caiu / Sinal Ruim', ligacao: 'nao_atendida' },
  { grupo: 'Não consegui contato', codigo: '32', descricao: 'Cliente Desconhecido / Mudou-se', ligacao: '' },
  { grupo: 'Não consegui contato', codigo: '33', descricao: 'Ligar Outro Dia', ligacao: '' },
];

export const FAIXAS_PADRAO = {
  proximosDias: 7, // "Próximos 7 dias" e disparo em lote
  limite1: 30,     // Vencido 1–30
  limite2: 60,     // Vencido 31–60
  limite3: 90,     // Vencido 61–90; acima disso é +90
  minimoObservacao: 20,
};

export const FINANCEIRO_PADRAO = {
  setor: 'Departamento Financeiro',
  email: '',
  telefone: '',
  horario: '',
  banco: '',
  agencia: '',
  conta: '',
  tipoConta: '',
  titular: '',
  cnpjTitular: '',
  chavePix: '',
  tipoChavePix: 'CNPJ',
  cidadePix: 'MANAUS',
  incluirDadosBancarios: true,
  pixComValorDoTitulo: true,
  qrCodeNoEmail: true,
  mensagemAdicional: '',
  nomeEmpresa: '', // vazio = usa o NomeFanta da tabela Empresas do ERP
};

const LINHA = '--------------------------------------------------';

export const MODELOS_PADRAO = {
  notificacao: {
    nome: 'Notificação (a vencer)',
    assunto: 'Notificação de Título a Vencer - {empresa}',
    corpo:
`Prezado(a) {cliente},

Informamos que há um compromisso financeiro próximo do vencimento. Solicitamos, por gentileza, que programe o pagamento dentro do prazo estabelecido, a fim de evitar encargos por atraso.

Documento: {documento}
Valor: {valor}
Vencimento: {vencimento}

Agradecemos pela atenção e parceria.

Atenciosamente,
{empresa} – Contas a Receber.`,
  },
  vence_hoje: {
    nome: 'Vence hoje',
    assunto: 'Lembrete de Vencimento - Título(s) com vencimento hoje ({vencimento}) - {empresa}',
    corpo:
`Prezado(a) {cliente},

Esperamos que esta mensagem o(a) encontre bem.

Passamos para lembrá-lo(a) de que o(s) título(s) abaixo relacionado(s) vence(m) hoje, {vencimento}. Solicitamos a gentileza de efetuar o pagamento até o final do dia para evitar a incidência de juros, multa e demais encargos previstos.

Título / Documento: {documento}
Data de Vencimento: {vencimento}
Valor: {valor}

Já pagou? Por favor, desconsidere este aviso e envie o comprovante em resposta a este e-mail para que possamos dar baixa no título.

Atenciosamente,
{empresa}`,
  },
  prox7: {
    nome: 'Próximos dias',
    assunto: 'Lembrete de Vencimento - Título(s) com vencimento em {proximos_dias} dias ({vencimento}) - {empresa}',
    corpo:
`Prezado(a) {cliente},

Esperamos que esta mensagem o(a) encontre bem.

Passamos para lembrá-lo(a) de que o(s) título(s) abaixo relacionado(s) vence(m) nos próximos dias. Antecipamos o aviso para que possa se organizar e efetuar o pagamento dentro do prazo, evitando juros, multa e demais encargos.

Título / Documento: {documento}
Data de Vencimento: {vencimento}
Valor: {valor}

Já pagou? Por favor, desconsidere este aviso e envie o comprovante em resposta a este e-mail para que possamos dar baixa no título.

Atenciosamente,
{empresa}`,
  },
  vencido_1: {
    nome: 'Vencido – 1ª faixa',
    assunto: 'Aviso de Título em Atraso ({faixa}) - {empresa}',
    corpo:
`Prezado(a) {cliente},

Esperamos que esta mensagem o(a) encontre bem.

Identificamos que o(s) título(s) abaixo relacionado(s) encontra(m)-se em atraso, conforme detalhamento:

{bloco_titulo}

${LINHA}

Este é um atraso recente, período em que ainda é possível regularizar a situação de forma amigável. Solicitamos a gentileza de efetuar o pagamento até {data_limite} ou entrar em contato conosco.

Atenciosamente,
{empresa}`,
  },
  vencido_2: {
    nome: 'Vencido – 2ª faixa',
    assunto: 'Aviso de Título em Atraso ({faixa}) - {empresa}',
    corpo:
`Prezado(a) {cliente},

Esperamos que esta mensagem o(a) encontre bem.

Identificamos que o(s) título(s) abaixo relacionado(s) encontra(m)-se com um atraso considerável ({faixa}), conforme detalhamento:

{bloco_titulo}

${LINHA}

Solicitamos a gentileza de efetuar o pagamento ou entrar em contato conosco para negociarmos a regularização e evitar maiores transtornos.

Atenciosamente,
{empresa}`,
  },
  vencido_3: {
    nome: 'Vencido – 3ª faixa',
    assunto: 'URGENTE: Título em Atraso ({faixa}) - {empresa}',
    corpo:
`Prezado(a) {cliente},

Esperamos que esta mensagem o(a) encontre bem.

Identificamos que o(s) título(s) abaixo relacionado(s) encontra(m)-se com um atraso crítico ({faixa}), conforme detalhamento:

{bloco_titulo}

${LINHA}

Solicitamos a regularização imediata para evitar a inclusão do nome nos órgãos de proteção ao crédito (SPC/SERASA) e demais medidas cabíveis.

Atenciosamente,
{empresa}`,
  },
  vencido_4: {
    nome: 'Vencido – última faixa (notificação extrajudicial)',
    assunto: 'Notificação Extrajudicial - Título em Atraso ({faixa}) - {empresa}',
    corpo:
`Prezado(a) {cliente},

Esperamos que esta mensagem o(a) encontre bem.

Vimos, por meio deste, notificá-lo(a) formalmente sobre a existência de título(s) em aberto em nosso sistema, conforme detalhamento abaixo:

{bloco_titulo}

${LINHA}

SITUAÇÃO ATUAL
Identificamos que o referido título encontra-se em atraso há mais de {limite3} dias, sem que tenhamos recebido qualquer manifestação ou proposta de regularização por parte de V.Sa., apesar das tentativas anteriores de contato.

Diante disso, informamos que, caso o pagamento não seja efetuado no prazo de 5 (cinco) dias úteis a contar do recebimento deste e-mail, adotaremos as seguintes medidas:

- Envio do título a protesto em cartório, nos termos do art. 1º da Lei nº 9.492/1997;
- Inclusão do nome do(a) sacado(a) e/ou avalista(s) nos cadastros de proteção ao crédito (SPC, SERASA e demais órgãos);
- Negativação e restrição de crédito junto ao nosso cadastro interno e parceiros comerciais;
- Cobrança judicial, com acréscimo de honorários advocatícios, custas processuais e demais encargos previstos em contrato;
- Suspensão imediata de fornecimento de produtos/serviços e/ou cancelamento de contratos vigentes.

FORMAS DE REGULARIZAÇÃO
Para evitar as medidas acima, solicitamos que o pagamento seja realizado via boleto atualizado ou PIX.
Por favor, entre em contato conosco imediatamente para envio dos dados de pagamento.

Atenciosamente,
{empresa}
E-mail: {email_financeiro}`,
  },
  email_todos: {
    nome: 'E-mail com todos os vencidos do cliente',
    assunto: 'Aviso de Títulos em Aberto - {empresa}',
    assuntoUrgente: 'URGENTE: Títulos em Atraso ({faixa3}) - {empresa}',
    assuntoProtesto: 'Notificação Extrajudicial e Aviso de Débitos - {empresa}',
    corpo:
`Prezado(a) {cliente},

Esperamos que esta mensagem o(a) encontre bem.

Identificamos em nosso sistema os seguintes títulos vencidos em aberto, organizados por período:

{blocos_por_faixa}{aviso_protesto}Solicitamos a gentileza de entrar em contato conosco ou efetuar o pagamento dos títulos em aberto para regularizarmos a situação.

Total em aberto: {total}

Atenciosamente,
{empresa}`,
  },
  aviso_protesto: {
    nome: 'Trecho de aviso de protesto (usado no e-mail com todos)',
    corpo:
`SITUAÇÃO ATUAL
Identificamos que o(s) título(s) acima de {limite3} dias encontra(m)-se em atraso sem que tenhamos recebido qualquer manifestação. Caso o pagamento não seja efetuado no prazo de 5 (cinco) dias úteis, adotaremos as seguintes medidas:

- Envio do título a protesto em cartório, nos termos do art. 1º da Lei nº 9.492/1997;
- Inclusão do nome nos cadastros de proteção ao crédito (SPC, SERASA e demais órgãos);
- Negativação e restrição de crédito junto ao nosso cadastro interno;
- Cobrança judicial, com acréscimo de honorários advocatícios e demais encargos.

`,
  },
  lote7: {
    nome: 'Disparo em lote (títulos a vencer)',
    assunto: 'Lembrete de Vencimento - Títulos a Vencer em {proximos_dias} Dias - {empresa}',
    corpo:
`Prezado(a) {cliente},

Esperamos que esta mensagem o(a) encontre bem.

Passamos para lembrá-lo(a) de que o(s) título(s) abaixo relacionado(s) vence(m) nos próximos dias. Antecipamos o aviso para que possa se organizar e efetuar o pagamento dentro do prazo, evitando juros, multa e demais encargos.

{blocos_a_vencer}Por favor, entre em contato conosco caso já tenha realizado o pagamento ou para obter o boleto atualizado.

Atenciosamente,
{empresa}`,
  },
  whatsapp: {
    nome: 'WhatsApp',
    corpo:
`Olá, {cliente}!

Identificamos os seguintes títulos em aberto:

{blocos_titulos}Por favor, entre em contato conosco para regularizarmos a situação.

Atenciosamente, {empresa}.`,
  },
};

export const CONFIG_PADRAO = {
  faixas: FAIXAS_PADRAO,
  financeiro: FINANCEIRO_PADRAO,
  resultados: RESULTADOS_PADRAO,
  modelos: MODELOS_PADRAO,
};

// Junta o que está salvo na nuvem com os padrões (campos novos ganham o padrão)
export function mesclarConfig(salva) {
  const s = salva || {};
  const modelos = { ...MODELOS_PADRAO };
  for (const [k, v] of Object.entries(s.modelos || {})) {
    if (modelos[k]) modelos[k] = { ...modelos[k], ...v };
  }
  return {
    faixas: { ...FAIXAS_PADRAO, ...(s.faixas || {}) },
    financeiro: { ...FINANCEIRO_PADRAO, ...(s.financeiro || {}) },
    resultados: Array.isArray(s.resultados) && s.resultados.length ? s.resultados : RESULTADOS_PADRAO,
    modelos,
  };
}
