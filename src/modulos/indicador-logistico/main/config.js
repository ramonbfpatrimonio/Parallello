// Configurações fixas do sistema
module.exports = {
  // Login master: usuário MASTER + senha = prefixo + data do computador (DDMMAAAA)
  // Ex.: com prefixo "IL" no dia 29/10/2026 a senha é IL29102026
  MASTER_USUARIO: 'MASTER',
  MASTER_PREFIXO: 'IL',

  // Quantidade máxima de consultas guardadas no histórico
  HISTORICO_MAX: 100,

  // Centros de custo iniciais (vindos da aba Lista_Custos da planilha)
  CENTROS_PADRAO: [
    [1, 'Puxadas'], [2, 'Almoxarifado'], [3, 'Administração'], [4, 'Vendas'], [5, 'Entregas'],
    [6, 'Equipamentos PCP'], [7, 'Produção'], [8, "EPI's"], [9, 'Fazendeiro'], [10, 'Manutenção CLP NTC'],
    [11, 'Embalagens/ Etiqueta'], [12, 'Manutenção Veículos'], [13, 'Frete MPM'], [14, 'Retirada de Resíduos'],
    [15, 'Aquisição Matéria Prima'], [16, 'Prestação de Serviço'], [17, 'Expositores'], [18, 'Expositores (2)'],
    [19, 'Hage Comércio'], [20, 'Ganchos'], [21, 'Fardamento'], [22, 'Vale Transporte'], [23, 'Vale Refeição'],
    [24, 'Sindicato'], [25, 'Laboratório'], [26, 'Logística'], [27, 'Comercial'], [28, 'Tarifa Bancária'],
    [29, 'Assessoria'], [30, 'Diretoria'], [31, 'ICMS - SEFAZ'], [32, 'Receita Federal'], [52, 'Log. Entrega']
  ],

  // Metas e legendas iguais às da planilha (coluna Status e comentários das células P9, P15, P21 e P27)
  METAS_PADRAO: {
    cumprimento: {
      ativo: true, melhor: 'maior', meta: 0.98, atencao: 0.95,
      textos: {
        ok: 'A operação está redonda, sem furos de estoque ou cancelamentos.',
        atencao: "Começou a ter um 'vazamento'. Verifique falta de veículo ou cancelamentos.",
        critico: 'A empresa está deixando de entregar uma fatia enorme de pedidos.'
      }
    },
    prazo: {
      ativo: true, melhor: 'menor', meta: 3, atencao: 5,
      textos: {
        ok: 'Prazo excelente e ágil. O caminhão roda rápido e o cliente fica satisfeito.',
        atencao: 'A operação está começando a travar. O estoque fica retido e o cliente espera mais.',
        critico: 'Atraso grave. Problemas de rotatividade de frota ou rotas longas sem planejamento.'
      }
    },
    custo: {
      ativo: true, melhor: 'menor', meta: 100, atencao: 150,
      textos: {
        ok: 'Custo unitário muito saudável. Pagando os custos e sobrando margem.',
        atencao: 'O frete está ficando caro. Se o diesel subir, a margem zera.',
        critico: 'A operação está engolindo o lucro. Caminhão andando com pouca carga (ociosidade).'
      }
    },
    devolucao: {
      ativo: true, melhor: 'menor', meta: 0.015, atencao: 0.03,
      textos: {
        ok: 'Qualidade excelente. Clientes aceitando a mercadoria.',
        atencao: 'Está no limite. Treinar motoristas ou verificar embalagem.',
        critico: 'Alerta máximo! Gasta diesel para levar, o cliente recusa e você tem prejuízo.'
      }
    }
  },

  CONFIG_PADRAO: {
    empresa: 'HAGE ALIMENTOS',
    modoPadrao: 'padrao',
    unificarPadrao: true,
    centroPadrao: '52'
  }
};
