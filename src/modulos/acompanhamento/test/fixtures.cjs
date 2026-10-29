// Dados de exemplo simulando o retorno de DUAS bases do ERP.
const empresa = {
  id: 'e1',
  nome: 'Empresa Teste',
  fabricantes: ['Leite Manaus', 'Manalac', 'Fazendeiro', 'Temperou', 'Viva Vitta', 'Alcafoods', 'Morango'].map((n) => ({ nome: n, ativo: true })),
  agruparOutros: false,
  prefixosSupervisao: '1,2,3,4,5',
  bases: []
};

const b = (nome, resultados) => ({ base: { id: nome, nome }, resultados });

const dados = {
  acompanhamento: [
    b('0001', { vendas: [
      { Codigo: '1', Supervisao: '339', Nome: 'MANAUS', Fabricante: 'LEITE MANAUS', Valor: 100 },
      { Codigo: '1', Supervisao: '339', Nome: 'MANAUS', Fabricante: 'MANALAC', Valor: 200 },
      { Codigo: '2', Supervisao: '338', Nome: 'INTERIOR', Fabricante: 'FAZENDEIRO', Valor: 80 },
      { Codigo: '1', Supervisao: '339', Nome: 'Manaus', Fabricante: 'XPTO', Valor: 999 }
    ] }),
    b('0002', { vendas: [
      { Codigo: '01 ', Supervisao: '339', Nome: 'MANAUS', Fabricante: 'Leite  Manaus', Valor: 50 }
    ] })
  ],

  valorVolume: [
    b('0001', { vendas: [
      { Equipe: '1', Setor: '104', Vendedor: '346-MARCOS', Fabricante: 'LEITE MANAUS', Valor: 337.5, ValorLiq: 300, Volume: 1, VolumeLiq: 0.5 },
      { Equipe: '1', Setor: '104', Vendedor: '346-MARCOS', Fabricante: 'MANALAC', Valor: 748.9, Volume: 4 },
      { Equipe: '1', Setor: '105', Vendedor: '', Fabricante: 'LEITE MANAUS', Valor: 0, Volume: 0 }
    ] }),
    b('0002', { vendas: [
      { Equipe: '1', Setor: '104', Vendedor: '346-MARCOS', Fabricante: 'LEITE MANAUS', Valor: 10, Volume: 2 }
    ] })
  ],

  ranking: [
    b('0001', {
      cliFab: [
        { Equipe: '1', Setor: '405', Vendedor: '152-HAGE', CodCliente: '00001', NomeCliente: 'G O COMERCIO', Telefone: '(92) 3238-2243', Email: 'a@b.com', Fabricante: 'LEITE MANAUS', Valor: 300, ValorLiq: 200, Quant: 3, Volume: 1 },
        { Equipe: '1', Setor: '405', Vendedor: '152-HAGE', CodCliente: '00002', NomeCliente: 'RUFINO', Telefone: '', Email: '', Fabricante: 'MANALAC', Valor: 200, Quant: 2, Volume: 1 },
        { Equipe: '1', Setor: '405', Vendedor: '152-HAGE', CodCliente: '00003', NomeCliente: 'PADARIA SOL', Telefone: '', Email: '', Fabricante: 'MANALAC', Valor: 50, Quant: 1, Volume: 1 },
        { Equipe: '1', Setor: '405', Vendedor: '152-HAGE', CodCliente: '00004', NomeCliente: 'MERCADINHO', Telefone: '', Email: '', Fabricante: 'MORANGO', Valor: 50, Quant: 1, Volume: 1 }
      ],
      qtdePV: [
        { Equipe: '1', Setor: '405', Vendedor: '152-HAGE', CodCliente: '00001', QtdePreVenda: 2 },
        { Equipe: '1', Setor: '405', Vendedor: '152-HAGE', CodCliente: '00002', QtdePreVenda: 1 }
      ],
      dias: [
        { Equipe: '1', Setor: '405', Vendedor: '152-HAGE', CodCliente: '00001', Dia: new Date('2026-10-01T00:00:00Z') },
        { Equipe: '1', Setor: '405', Vendedor: '152-HAGE', CodCliente: '00001', Dia: new Date('2026-10-02T00:00:00Z') }
      ],
      produtos: [
        { Equipe: '1', Setor: '405', Vendedor: '152-HAGE', CodCliente: '00001', Fabricante: 'LEITE MANAUS', CodProduto: '000100', NomeProduto: 'LEITE 1L', Quant: 3, Valor: 300, PD: 2 }
      ]
    }),
    b('0002', {
      cliFab: [
        { Equipe: '1', Setor: '405', Vendedor: '152-HAGE', CodCliente: '00001', NomeCliente: 'G O COMERCIO', Telefone: '', Email: '', Fabricante: 'LEITE MANAUS', Valor: 400, Quant: 4, Volume: 2 }
      ],
      qtdePV: [{ Equipe: '1', Setor: '405', Vendedor: '152-HAGE', CodCliente: '00001', QtdePreVenda: 1 }],
      dias: [{ Equipe: '1', Setor: '405', Vendedor: '152-HAGE', CodCliente: '00001', Dia: new Date('2026-10-01T00:00:00Z') }],
      produtos: [
        { Equipe: '1', Setor: '405', Vendedor: '152-HAGE', CodCliente: '00001', Fabricante: 'LEITE MANAUS', CodProduto: '000200', NomeProduto: 'LEITE 200ML', Quant: 4, Valor: 400, PD: 1 }
      ]
    })
  ],

  setor: (() => {
    const cart = [
      { Equipe: '1', Setor: '101', Vendedor: 'JOSE RIBEIRO', CodCliente: '00001', TipoCliente: 'C', NomeCliente: 'R DA G TAVARES', NroInsc: '111' },
      { Equipe: '1', Setor: '101', Vendedor: 'JOSE RIBEIRO', CodCliente: '00002', TipoCliente: 'A', NomeCliente: 'SEM COMPRA LTDA', NroInsc: '222' },
      { Equipe: '1', Setor: '102', Vendedor: 'MARIA LUIZA', CodCliente: '00003', TipoCliente: 'B', NomeCliente: 'CLIENTE TRES', NroInsc: '333' }
    ];
    const vazio = { cliFab: [], qtdePV: [], dias: [], produtos: [] };
    return [
      b('0001', {
        ...vazio,
        carteira: cart,
        cliFab: [{ Equipe: '1', Setor: '101', Vendedor: '1-JOSE', CodCliente: '00001', NomeCliente: 'R DA G TAVARES', Telefone: '', Email: '', Fabricante: 'LEITE MANAUS', Valor: 337.5, ValorLiq: 300, Quant: 1, Volume: 1 }],
        qtdePV: [{ Equipe: '1', Setor: '101', Vendedor: '1-JOSE', CodCliente: '00001', QtdePreVenda: 2 }],
        dias: [{ Equipe: '1', Setor: '101', Vendedor: '1-JOSE', CodCliente: '00001', Dia: '2026-10-03' }],
        produtos: [{ Equipe: '1', Setor: '101', Vendedor: '1-JOSE', CodCliente: '00001', Fabricante: 'LEITE MANAUS', CodProduto: '000708', NomeProduto: 'LEITE', Quant: 1, Valor: 337.5, PD: 1 }]
      }),
      b('0002', {
        ...vazio,
        carteira: [...cart, { Equipe: '1', Setor: '102', Vendedor: 'MARIA LUIZA', CodCliente: '00009', TipoCliente: 'C', NomeCliente: 'SO NA BASE 2', NroInsc: '111' }],
        cliFab: [{ Equipe: '1', Setor: '102', Vendedor: '2-MARIA', CodCliente: '00003', NomeCliente: 'CLIENTE TRES', Telefone: '', Email: '', Fabricante: 'MANALAC', Valor: 100, Quant: 2, Volume: 1 }]
      })
    ];
  })(),

  ruptura: [
    b('0001', {
      faltas: [
        { Equipe: '1', Setor: '102', Vendedor: 'MARIA LUIZA', CodCliente: '01537', NomeCliente: 'EMPORIO JESUS', TipoCliente: 'A', Fabricante: 'FAZENDEIRO', CodProduto: '000642', NomeProduto: 'ROSQUINHAS COCO', Unid: 'CX', Unidades: 20, FaltaCx: 1, FaltaFrac: 0, ValorTotal: 77.6, QtdPedidos: 1 },
        { Equipe: '1', Setor: '104', Vendedor: 'MARCOS', CodCliente: '00468', NomeCliente: 'MARIA LUCINEIDE', TipoCliente: 'A', Fabricante: 'ALCAFOODS', CodProduto: '000900', NomeProduto: 'CEREAL', Unid: 'CX', Unidades: 12, FaltaCx: 1, FaltaFrac: 0, ValorTotal: 85.01, QtdPedidos: 1 }
      ],
      pedidosFab: [
        { Equipe: '1', Setor: '102', Vendedor: 'MARIA LUIZA', CodCliente: '01537', Fabricante: 'FAZENDEIRO', QtdPedidos: 1 },
        { Equipe: '1', Setor: '104', Vendedor: 'MARCOS', CodCliente: '00468', Fabricante: 'ALCAFOODS', QtdPedidos: 1 }
      ],
      pedidosCli: [
        { Equipe: '1', Setor: '102', Vendedor: 'MARIA LUIZA', CodCliente: '01537', QtdPedidos: 1 },
        { Equipe: '1', Setor: '104', Vendedor: 'MARCOS', CodCliente: '00468', QtdPedidos: 1 }
      ]
    }),
    b('0002', {
      faltas: [
        { Equipe: '1', Setor: '102', Vendedor: 'MARIA LUIZA', CodCliente: '01537', NomeCliente: 'EMPORIO JESUS', TipoCliente: 'A', Fabricante: 'FAZENDEIRO', CodProduto: '000700', NomeProduto: 'BISCOITO', Unid: 'CX', Unidades: 20, FaltaCx: 0, FaltaFrac: 5, ValorTotal: 20, QtdPedidos: 1 }
      ],
      pedidosFab: [
        { Equipe: '1', Setor: '102', Vendedor: 'MARIA LUIZA', CodCliente: '01537', Fabricante: 'FAZENDEIRO', QtdPedidos: 1 }
      ],
      pedidosCli: [
        { Equipe: '1', Setor: '102', Vendedor: 'MARIA LUIZA', CodCliente: '01537', QtdPedidos: 1 }
      ]
    })
  ]
};

module.exports = { empresa, porBase: (nome) => dados[nome] };
