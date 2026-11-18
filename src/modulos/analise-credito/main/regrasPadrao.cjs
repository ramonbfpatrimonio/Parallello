// Regras padrão do score — iguais à "CONSULTA DEFINITIVA" do Ramon.
// Editáveis no Ctrl+Shift+B › Regras do score.
// Cada critério: faixas avaliadas em ordem (vale a primeira que bater);
// se nenhuma bater (ou o valor não existir), vale "padrao".

const f = (op, valor, pontos) => ({ op, valor, pontos });
const l = (op, valor, limite) => ({ op, valor, limite });

const REGRAS_PADRAO = {
  versao: 2,
  zerarSeInadimplente: true,
  // @MesesHistoricoAtraso: pagamentos considerados no atraso médio do score (0 = histórico completo)
  mesesHistoricoAtraso: 12,
  criterios: [
    {
      id: 'faturamento', nome: 'Faturamento', unidade: 'R$',
      descricao: 'Total comprado (histórico completo)',
      faixas: [f('>', 100000, 20), f('>', 50000, 15), f('>', 10000, 10), f('>', 5000, 5)], padrao: 2
    },
    {
      id: 'tempo', nome: 'Tempo de relacionamento', unidade: 'meses',
      descricao: 'Meses desde a 1ª compra até hoje',
      faixas: [f('>', 36, 15), f('>', 24, 10), f('>', 12, 6), f('>', 6, 3)], padrao: 1
    },
    {
      id: 'ticket', nome: 'Ticket médio', unidade: 'R$',
      descricao: 'Total comprado ÷ quantidade de pedidos de venda',
      faixas: [f('>', 5000, 8), f('>', 1000, 5)], padrao: 2
    },
    {
      id: 'pagamento', nome: 'Histórico de pagamento', unidade: 'dias',
      descricao: 'Atraso médio nos últimos meses configurados (com valor inadimplente vale o padrão)',
      faixas: [f('=', 0, 20), f('<=', 5, 15), f('<=', 15, 10), f('<=', 30, 5)], padrao: 0
    },
    {
      id: 'volume', nome: 'Volume de negócios', unidade: 'parcelas',
      descricao: 'Parcelas pagas nos últimos meses configurados',
      faixas: [f('>=', 20, 10), f('>=', 10, 6), f('>=', 5, 3)], padrao: 1
    },
    {
      id: 'frequencia', nome: 'Frequência de compra', unidade: 'pedidos',
      descricao: 'Quantidade de pedidos de venda (histórico completo)',
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
  // Perfil, limite e prazos (da maior para a menor faixa). Limite sugerido usa o Total comprado.
  faixasScore: [
    {
      min: 80, perfil: 'Excelente', prazoSugerido: 28,
      prazos: ['7', '14', '21', '7/14/21', '14/21/28'],
      limites: [l('>', 500000, 100000), l('>', 200000, 50000), l('>', 100000, 30000)], limitePadrao: 20000
    },
    {
      min: 60, perfil: 'Bom', prazoSugerido: 21,
      prazos: ['7', '14', '21', '7/14/21', '14/21'],
      limites: [l('>', 200000, 30000), l('>', 100000, 15000), l('>', 50000, 10000)], limitePadrao: 5000
    },
    {
      min: 45, perfil: 'Regular', prazoSugerido: 14,
      prazos: ['7', '14', '7/14', 'N/A', 'N/A'],
      limites: [l('>', 100000, 10000)], limitePadrao: 5000
    },
    {
      min: 30, perfil: 'Risco', prazoSugerido: 7,
      prazos: ['7', '14', 'N/A', 'N/A', 'N/A'],
      limites: [], limitePadrao: 3000
    },
    {
      min: 15, perfil: 'Inadimplente', prazoSugerido: 0,
      prazos: ['7', 'N/A', 'N/A', 'N/A', 'N/A'],
      limites: [], limitePadrao: 1000
    },
    {
      min: 0, perfil: 'Inadimplente', prazoSugerido: 0,
      prazos: ['À vista', 'N/A', 'N/A', 'N/A', 'N/A'],
      limites: [], limitePadrao: 0
    }
  ],
  // Grupo do ranking por faixa fixa de score, com a observação de negócio
  grupos: [
    { min: 80, grupo: 1, observacao: 'Grupo 1 (Excelente): Alto valor, sem atrasos, compra muito e há muito tempo.' },
    { min: 60, grupo: 2, observacao: 'Grupo 2 (Bom): Ótimo cliente, compra bem e raramente atrasa.' },
    { min: 40, grupo: 3, observacao: 'Grupo 3 (Regular): Compra de forma mediana, avaliar com atenção.' },
    { min: 20, grupo: 4, observacao: 'Grupo 4 (Risco): Histórico fraco, volume baixo ou atrasos frequentes.' },
    { min: 0, grupo: 5, observacao: 'Grupo 5 (Inadimplente): Possui dívidas em aberto ou compras ínfimas. Não liberar crédito.' }
  ],
  // Limite pelo período (regra matemática do script):
  // (vendas a prazo do período ÷ meses) × fator de prazo × multiplicador pelo atraso médio
  limitePeriodo: {
    fatorPrazo: 1.0,
    semHistorico: 0.8,   // sem pagamentos no histórico do atraso
    ate1: 1.5,           // atraso médio até 1 dia
    ate5: 1.2,           // até 5 dias
    ate15: 1.0,          // até 15 dias
    acima: 0.5           // acima de 15 dias
  },
  // Limites dos alertas e classificações
  alertas: {
    atrasoExcelente: 1,       // atraso médio (arredondado para cima) até X dias = Excelente
    atrasoBom: 5,             // até X = Bom
    atrasoMedio: 15,          // até X = Médio; acima = Ruim
    inatividadeAtencao: 90,   // dias sem comprar
    inatividadeCritico: 180,
    usoLimiteAtencao: 70,     // % do limite em uso
    usoLimiteRisco: 90,
    riscoAlto: 30             // score abaixo disso = RISCO ALTO (0 = INADIMPLENTE)
  }
};

module.exports = { REGRAS_PADRAO };
