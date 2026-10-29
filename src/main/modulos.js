// Processo principal de cada sistema. Carregados só quando o sistema é aberto pela primeira vez.
/* eslint-disable @typescript-eslint/no-require-imports */
export const FABRICAS = {
  'gerar-pre-venda': () => require('../modulos/gerar-pre-venda/main/modulo.ts').default,
  'prevenda-ruptura': () => require('../modulos/prevenda-ruptura/main/modulo.js'),
  acompanhamento: () => require('../modulos/acompanhamento/main/modulo.cjs'),
  'pesquisa-relatorios': () => require('../modulos/pesquisa-relatorios/modulo.js'),
};
