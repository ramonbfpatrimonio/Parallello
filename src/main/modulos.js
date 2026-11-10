// Processo principal de cada sistema. Carregados só quando o sistema é aberto pela primeira vez.
/* eslint-disable @typescript-eslint/no-require-imports */
export const FABRICAS = {
  'gerar-pre-venda': () => require('../modulos/gerar-pre-venda/main/modulo.ts').default,
  'prevenda-ruptura': () => require('../modulos/prevenda-ruptura/main/modulo.js'),
  acompanhamento: () => require('../modulos/acompanhamento/main/modulo.cjs'),
  'pesquisa-relatorios': () => require('../modulos/pesquisa-relatorios/modulo.js'),
  'indicador-logistico': () => require('../modulos/indicador-logistico/main/modulo.js'),
  'comissao-contas-recebidas': () => require('../modulos/comissao-contas-recebidas/main/modulo.js'),
  'analise-credito': () => require('../modulos/analise-credito/main/modulo.js'),
  'custo-producao': () => require('../modulos/custo-producao/main/modulo.js'),
};
