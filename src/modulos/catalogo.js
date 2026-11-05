// Lista dos sistemas que fazem parte do Parallello.
// Usada pelo processo principal (pastas, preload, página) e pela tela inicial (cards).
// Para incluir um sistema novo: crie a pasta em src/modulos/<id>, acrescente aqui,
// registre a função do processo principal em src/main/modulos.js e o ícone em src/shell/src/icones.js.
export const CATALOGO = [
  {
    id: 'gerar-pre-venda',
    nome: 'Gerar Pré-Venda',
    descricao: 'Lê o pedido de compra em PDF, confere os produtos no ERP e grava a pré-venda.',
    cor: '#2563eb',
    fundo: '#070c1a',
    pagina: 'modulos/gerar-pre-venda/renderer/index.html',
  },
  {
    id: 'prevenda-ruptura',
    nome: 'Pré-Venda de Ruptura',
    descricao: 'Encontra o que faltou nas pré-vendas e gera a pré-venda de ruptura no ERP.',
    cor: '#d9473b',
    fundo: '#f4f5f2',
    pagina: 'modulos/prevenda-ruptura/renderer/index.html',
  },
  {
    id: 'acompanhamento',
    nome: 'Acompanhamento de Vendas',
    descricao: 'Vendas por fabricante, ranking de clientes, setor com e sem compra e ruptura.',
    cor: '#3fae6a',
    fundo: '#f4f6fa',
    pagina: 'modulos/acompanhamento/renderer/index.html',
  },
  {
    id: 'pesquisa-relatorios',
    nome: 'Pesquisa de Relatórios',
    descricao: 'Mostra quais relatórios do Ativo.ERP têm as colunas que você procura.',
    cor: '#1d6fd8',
    fundo: '#eef1f2',
    pagina: 'modulos/pesquisa-relatorios/renderer/index.html',
    estatico: true, // página sem build (HTML/JS puro), copiada para out/ pelo scripts/build.mjs
  },
  {
    id: 'indicador-logistico',
    nome: 'Indicador Logístico',
    descricao: 'Cumprimento de entregas, prazo médio, custo por entrega e devoluções, com metas.',
    cor: '#13998a',
    fundo: '#eef3f4',
    pagina: 'modulos/indicador-logistico/renderer/index.html',
  },
  {
    id: 'comissao-contas-recebidas',
    nome: 'Comissão por Contas Recebidas',
    descricao: 'Comissão dos vendedores pelas parcelas recebidas, com resumo por fabricante e fechamentos.',
    cor: '#7a4fe0',
    fundo: '#f3f5f9',
    pagina: 'modulos/comissao-contas-recebidas/renderer/index.html',
  },
];
