// Regras padrão do score — idênticas ao script SQL original.
// Editáveis na área oculta (Ctrl+Shift+B) > Regras do Score.
// Cada critério: faixas avaliadas em ordem (a primeira que bater vale);
// se nenhuma bater (ou o valor não existir), vale "padrao".

const f = (op, valor, pontos) => ({ op, valor, pontos });
const l = (op, valor, limite) => ({ op, valor, limite });

const REGRAS_PADRAO = {
  versao: 1,
  zerarSeInadimplente: true,
  criterios: [
    {
      id: 'faturamento', nome: 'Faturamento', unidade: 'R$',
      descricao: 'Total comprado no período',
      faixas: [f('>', 100000, 20), f('>', 50000, 15), f('>', 10000, 10), f('>', 5000, 5)], padrao: 2
    },
    {
      id: 'tempo', nome: 'Tempo de relacionamento', unidade: 'meses',
      descricao: 'Meses desde a 1ª compra do período até hoje',
      faixas: [f('>', 36, 15), f('>', 24, 10), f('>', 12, 6), f('>', 6, 3)], padrao: 1
    },
    {
      id: 'ticket', nome: 'Ticket médio', unidade: 'R$',
      descricao: 'Total comprado ÷ quantidade de pedidos de venda',
      faixas: [f('>', 5000, 8), f('>', 1000, 5)], padrao: 2
    },
    {
      id: 'pagamento', nome: 'Histórico de pagamento', unidade: 'dias',
      descricao: 'Atraso médio em dias (com valor inadimplente vale o padrão)',
      faixas: [f('=', 0, 20), f('<=', 5, 15), f('<=', 15, 10), f('<=', 30, 5)], padrao: 0
    },
    {
      id: 'volume', nome: 'Volume de negócios', unidade: 'parcelas',
      descricao: 'Quantidade de parcelas pagas',
      faixas: [f('>=', 20, 10), f('>=', 10, 6), f('>=', 5, 3)], padrao: 1
    },
    {
      id: 'frequencia', nome: 'Frequência de compra', unidade: 'pedidos',
      descricao: 'Quantidade de pedidos de venda no período',
      faixas: [f('>=', 50, 10), f('>=', 20, 7), f('>=', 10, 4), f('>=', 5, 2)], padrao: 1
    },
    {
      id: 'recencia', nome: 'Recência', unidade: 'dias',
      descricao: 'Dias desde a última compra',
      faixas: [f('<=', 30, 8), f('<=', 60, 5), f('<=', 90, 3)], padrao: 0
    },
    {
      id: 'crescimento', nome: 'Crescimento', unidade: 'x',
      descricao: 'Maior compra ÷ compra média',
      faixas: [f('>=', 2, 7), f('>=', 1.5, 4), f('>=', 1, 2)], padrao: 1
    }
  ],
  // Faixas de score (da maior para a menor). Limite sugerido usa o Total comprado.
  faixasScore: [
    {
      min: 80, perfil: 'Excelente', observacao: 'Cliente Excelente - Sem atrasos, alto volume', prazoSugerido: 28,
      prazos: ['7', '14', '21', '7/14/21', '14/21/28'],
      limites: [l('>', 500000, 100000), l('>', 200000, 50000), l('>', 100000, 30000)], limitePadrao: 20000
    },
    {
      min: 60, perfil: 'Bom', observacao: 'Cliente Bom - Atrasos raros, bom volume', prazoSugerido: 21,
      prazos: ['7', '14', '21', '7/14/21', '14/21'],
      limites: [l('>', 200000, 30000), l('>', 100000, 15000), l('>', 50000, 10000)], limitePadrao: 5000
    },
    {
      min: 45, perfil: 'Regular', observacao: 'Cliente Regular - Atrasos ocasionais', prazoSugerido: 14,
      prazos: ['7', '14', '7/14', 'N/A', 'N/A'],
      limites: [l('>', 100000, 10000)], limitePadrao: 5000
    },
    {
      min: 30, perfil: 'Risco', observacao: 'Cliente Risco - Atrasos frequentes, avaliar com cautela', prazoSugerido: 7,
      prazos: ['7', '14', 'N/A', 'N/A', 'N/A'],
      limites: [], limitePadrao: 3000
    },
    {
      min: 15, perfil: 'Inadimplente', observacao: 'Cliente Inadimplente - NÃO LIBERAR CRÉDITO', prazoSugerido: 0,
      prazos: ['7', 'N/A', 'N/A', 'N/A', 'N/A'],
      limites: [], limitePadrao: 1000
    },
    {
      min: 0, perfil: 'Inadimplente', observacao: 'Cliente Inadimplente - NÃO LIBERAR CRÉDITO', prazoSugerido: 0,
      prazos: ['À vista', 'N/A', 'N/A', 'N/A', 'N/A'],
      limites: [], limitePadrao: 0
    }
  ]
};

module.exports = { REGRAS_PADRAO };
