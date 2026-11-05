// Testes do motor de cálculo: node tests/engine.test.js
const assert = require('assert');
const { calcularPadrao, calcularPlanilha } = require('../main/motor');

let ok = 0;
function teste(nome, fn) {
  fn();
  ok++;
  console.log('✔', nome);
}
const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} != ${b}`);
const L = (r, id) => r.blocos.flatMap((b) => b.linhas).find((l) => l.id === id);

// ---------------------------------------------------------------------------
// 1) Modo planilha reproduz exatamente os números salvos na planilha (filtro TODOS)
// ---------------------------------------------------------------------------
teste('modo planilha reproduz a planilha (TODOS, 2026)', () => {
  const r7 = [364, 352, 320, 274, 447, 443, 336, 395, 139, 11, 0, 0];
  const r8 = [352, 291, 296, 281, 374, 395, 342, 355, 80, 9, 0, 0];
  const r13 = [1162, 1219, 1478, 1313, 1582, 2703, 2453, 1270, 1036, 23, 0, 0];
  const r19 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 200, 0, 0];
  const r20 = [398, 369, 339, 313, 497, 514, 397, 394, 94, 9, 0, 0];
  const r25 = [42, 47, 68, 36, 54, 142, 92, 28, 33, 0, 0, 0];

  // divide os dados entre duas conexões, com um cliente/dia repetido (deve contar 1 vez)
  const linhasA = [], linhasB = [], dvA = [], dvB = [], ddA = [], ddB = [];
  for (let m = 1; m <= 10; m++) {
    const i = m - 1;
    linhasA.push({ Mes: m, QtdL7: 999, QtdCargaA: r20[i], QtdOp99: r20[i] - r8[i], QtdDevL25: 0, SomaDiasL13: r13[i], CustoTotal: r19[i] });
    const data = `2026-${String(m).padStart(2, '0')}-10`;
    dvA.push({ Mes: m, NroInsc: 'X' + m, DataPedido: new Date(data), QtdePedidos: r7[i] });
    dvB.push({ Mes: m, NroInsc: 'X' + m, DataPedido: new Date(data), QtdePedidos: 7777 }); // duplicado -> ignorado
    if (r25[i]) ddA.push({ Mes: m, NroInsc: 'Y' + m, DataRetorno: new Date(data), QtdeRetornos: r25[i] });
  }
  const res = calcularPlanilha({
    consolidado: true,
    conexoes: [
      { nome: 'COMERCIO', linhas: linhasA, dictVendas: dvA, dictDevolucoes: ddA },
      { nome: 'INDUSTRIA', linhas: linhasB, dictVendas: dvB, dictDevolucoes: ddB }
    ]
  });
  assert.strictEqual(L(res, 'programadas').total, 3081);
  assert.strictEqual(L(res, 'realizadas').total, 2775);
  perto(L(res, 'cumprimento').total, 0.8782934557904255, 'O9');
  assert.strictEqual(L(res, 'somaDias').total, 14239);
  perto(L(res, 'prazo').total, 5.131171171171172, 'O15');
  perto(L(res, 'prazo').valores['09'], 12.95, 'K15');
  assert.strictEqual(L(res, 'custo').total, 200);
  assert.strictEqual(L(res, 'realizadasRef').total, 3324);
  perto(L(res, 'custoEntrega').total, 0.06016847172081829, 'O21');
  perto(L(res, 'custoEntrega').valores['10'], 22.22222222222222, 'L21');
  assert.strictEqual(L(res, 'devolvidos').total, 542);
  perto(L(res, 'devolucao').total, 0.15872892146539966, 'O27');
  perto(L(res, 'cumprimento').valores['04'], 1.0255474452554745, 'F9 (acima de 100%, como na planilha)');
  assert.strictEqual(L(res, 'cumprimento').valores['11'], null);
});

teste('modo planilha + status reproduzem a planilha atualizada (INDUSTRIA)', () => {
  const { status, ROTULO } = require('../main/status');
  const { METAS_PADRAO } = require('../main/config');
  const r7 = [240, 195, 220, 215, 361, 334, 267, 314, 139, 7];
  const r8 = [213, 163, 194, 194, 278, 259, 233, 280, 80, 6];
  const r13 = [643, 710, 828, 748, 1185, 1518, 1522, 817, 983, 14];
  const r19 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 100];
  const r20 = [240, 195, 220, 215, 361, 334, 267, 314, 94, 6];
  const r25 = [28, 33, 26, 21, 83, 79, 34, 34, 14, 0];
  const linhas = r7.map((_, i) => ({ Mes: i + 1, QtdL7: r7[i], QtdCargaA: r20[i], QtdOp99: r20[i] - r8[i], QtdDevL25: r25[i], SomaDiasL13: r13[i], CustoTotal: r19[i] }));
  const res = calcularPlanilha({ consolidado: false, conexoes: [{ nome: 'INDUSTRIA', linhas }] });
  assert.strictEqual(L(res, 'programadas').total, 2292);
  assert.strictEqual(L(res, 'realizadas').total, 1900);
  perto(L(res, 'cumprimento').total, 0.8250134750141521, 'O9');
  perto(L(res, 'prazo').total, 4.72, 'O15');
  perto(L(res, 'custoEntrega').total, 0.04452359750667854, 'O21');
  perto(L(res, 'devolucao').total, 0.13527547652584887, 'O27');
  // coluna Status (P9, P15, P21, P27)
  assert.strictEqual(ROTULO[status(L(res, 'cumprimento').total, METAS_PADRAO.cumprimento)], 'CRÍTICO');
  assert.strictEqual(ROTULO[status(L(res, 'prazo').total, METAS_PADRAO.prazo)], 'ALERTA');
  assert.strictEqual(ROTULO[status(L(res, 'custoEntrega').total, METAS_PADRAO.custo)], 'META ATINGIDA');
  assert.strictEqual(ROTULO[status(L(res, 'devolucao').total, METAS_PADRAO.devolucao)], 'CRÍTICO');
  // limites exatos da macro
  assert.strictEqual(status(0.98, METAS_PADRAO.cumprimento), 'ok');
  assert.strictEqual(status(0.95, METAS_PADRAO.cumprimento), 'atencao');
  assert.strictEqual(status(0.9499, METAS_PADRAO.cumprimento), 'critico');
  assert.strictEqual(status(150, METAS_PADRAO.custo), 'atencao');
  assert.strictEqual(status(0.015, METAS_PADRAO.devolucao), 'ok');
  assert.strictEqual(status(0.0301, METAS_PADRAO.devolucao), 'critico');
});

teste('modo planilha + status reproduzem a planilha corrigida (COMERCIO, nov/2026)', () => {
  const { status, ROTULO } = require('../main/status');
  const { METAS_PADRAO } = require('../main/config');
  const r7 = [158, 174, 119, 98, 136, 180, 130, 153, 111, 176];
  const r8 = [139, 128, 102, 87, 96, 136, 109, 137, 89, 107];
  const r13 = [519, 509, 650, 565, 397, 1185, 931, 453, 784, 950];
  const r20 = [158, 174, 119, 98, 136, 180, 130, 153, 111, 121];
  const r25 = [19, 46, 17, 11, 40, 44, 21, 16, 22, 14];
  const linhas = r7.map((_, i) => ({ Mes: i + 1, QtdL7: r7[i], QtdCargaA: r20[i], QtdOp99: r20[i] - r8[i], QtdDevL25: r25[i], SomaDiasL13: r13[i], CustoTotal: 0 }));
  const res = calcularPlanilha({ consolidado: false, conexoes: [{ nome: 'COMERCIO', linhas }] });
  assert.strictEqual(L(res, 'programadas').total, 1435);
  assert.strictEqual(L(res, 'realizadas').total, 1130);
  perto(L(res, 'cumprimento').total, 0.7965357609350683, 'O9');
  perto(L(res, 'prazo').total, 6.144247787610619, 'O15');
  perto(L(res, 'custoEntrega').total, 0, 'O21');
  assert.strictEqual(L(res, 'devolvidos').total, 250);
  perto(L(res, 'devolucao').total, 0.17582994154427062, 'O27');
  assert.strictEqual(ROTULO[status(L(res, 'cumprimento').total, METAS_PADRAO.cumprimento)], 'CRÍTICO');
  assert.strictEqual(ROTULO[status(L(res, 'prazo').total, METAS_PADRAO.prazo)], 'CRÍTICO');
  assert.strictEqual(ROTULO[status(L(res, 'custoEntrega').total, METAS_PADRAO.custo)], 'META ATINGIDA');
  assert.strictEqual(ROTULO[status(L(res, 'devolucao').total, METAS_PADRAO.devolucao)], 'CRÍTICO');
});

teste('modo padrão conta o pedido devolvido uma vez mesmo com vários retornos', () => {
  const a = {
    nome: 'A',
    pedidos: [{ Numero: 1, Data: new Date('2026-03-02T00:00:00Z'), Situacao: 'A' }],
    retornos: [
      { Numero: 10, Data: new Date('2026-03-05T00:00:00Z'), CodOp: 98, NroRef: 1 },
      { Numero: 11, Data: new Date('2026-03-06T00:00:00Z'), CodOp: 99, NroRef: 1 }
    ],
    prevendas: [], custos: []
  };
  const r = calcularPadrao({ ini: '2026-03-01', fim: '2026-03-31', conexoes: [a], unificar: true });
  assert.strictEqual(L(r, 'devolvidos').total, 1);
  assert.strictEqual(L(r, 'devolucao').total, 1);
});

// ---------------------------------------------------------------------------
// 2) Modo padrão: cálculo por pedido
// ---------------------------------------------------------------------------
const d = (s) => new Date(s + 'T00:00:00Z');

teste('modo padrão calcula por pedido, com unificação entre conexões', () => {
  const comercio = {
    nome: 'COMERCIO',
    pedidos: [
      { Numero: 1, Data: d('2026-01-05'), Carga: 10, CodCli: 100, NroInsc: 'AAA', Situacao: 'A', DataAcerto: d('2026-01-08') },
      { Numero: 2, Data: d('2026-01-05'), Carga: 10, CodCli: 101, NroInsc: 'BBB', Situacao: 'A', DataAcerto: d('2026-01-09') },
      { Numero: 3, Data: d('2026-01-20'), Carga: 11, CodCli: 102, NroInsc: null, Situacao: 'F', DataAcerto: null },
      { Numero: 4, Data: d('2026-02-02'), Carga: 12, CodCli: 100, NroInsc: 'AAA', Situacao: 'A', DataAcerto: d('2026-02-04') },
      { Numero: 4, Data: d('2026-02-02'), Carga: 12, CodCli: 100, NroInsc: 'AAA', Situacao: 'A', DataAcerto: d('2026-02-04') } // linha duplicada
    ],
    retornos: [
      { Numero: 900, Data: d('2026-01-10'), CodOp: 99, NroRef: 2 },
      { Numero: 901, Data: d('2026-02-10'), CodOp: 98, NroRef: 4 }
    ],
    prevendas: [
      { Pedido: 1, DataPrevenda: d('2026-01-03') },
      { Pedido: 2, DataPrevenda: d('2026-01-03') },
      { Pedido: 4, DataPrevenda: d('2026-01-31') }
    ],
    custos: [
      { DataEntra: d('2026-01-15'), Codigo: 5, NroNF: 1, Valor: 300 },
      { DataEntra: d('2026-03-15'), Codigo: 5, NroNF: 2, Valor: 150 } // mês sem pedidos: não pode sumir
    ]
  };
  const industria = {
    nome: 'INDUSTRIA',
    pedidos: [
      { Numero: 1, Data: d('2026-01-05'), Carga: 1, CodCli: 7, NroInsc: 'AAA', Situacao: 'A', DataAcerto: d('2026-01-06') }, // mesmo cliente/dia -> unificado
      { Numero: 2, Data: d('2026-01-06'), Carga: 1, CodCli: 7, NroInsc: 'AAA', Situacao: 'A', DataAcerto: d('2026-01-07') }
    ],
    retornos: [],
    prevendas: [{ Pedido: 2, DataPrevenda: d('2026-01-06') }],
    custos: [{ DataEntra: d('2026-01-20'), Codigo: 9, NroNF: 3, Valor: 100 }]
  };

  const r = calcularPadrao({ ini: '2026-01-01', fim: '2026-03-31', conexoes: [comercio, industria], unificar: true });
  assert.deepStrictEqual(r.colunas.map((c) => c.key), ['2026-01', '2026-02', '2026-03']);
  assert.strictEqual(r.unificados, 1);
  // Jan: programadas = 1,2,3 (COM) + 2 (IND) = 4 ; carregadas = 1,2,IND2 = 3 ; realizadas = 1, IND2 = 2 (pedido 2 teve op.99)
  assert.strictEqual(L(r, 'programadas').valores['2026-01'], 4);
  assert.strictEqual(L(r, 'carregadas').valores['2026-01'], 3);
  assert.strictEqual(L(r, 'realizadas').valores['2026-01'], 2);
  perto(L(r, 'cumprimento').valores['2026-01'], 0.5, 'cumprimento jan');
  // prazo: pedido 1 -> 5 dias, IND2 -> 1 dia
  assert.strictEqual(L(r, 'somaDias').valores['2026-01'], 6);
  assert.strictEqual(L(r, 'comPrazo').valores['2026-01'], 2);
  perto(L(r, 'prazo').valores['2026-01'], 3, 'prazo jan');
  // devoluções: jan pedido 2 (99) ; fev pedido 4 (98, realizado mesmo assim)
  assert.strictEqual(L(r, 'devolvidos').valores['2026-01'], 1);
  assert.strictEqual(L(r, 'devolvidos').valores['2026-02'], 1);
  assert.strictEqual(L(r, 'realizadas').valores['2026-02'], 1);
  // custos (março aparece mesmo sem pedidos)
  assert.strictEqual(L(r, 'custo').valores['2026-01'], 400);
  assert.strictEqual(L(r, 'custo').valores['2026-03'], 150);
  assert.strictEqual(L(r, 'custoEntrega').valores['2026-03'], null);
  perto(L(r, 'custoEntrega').total, 550 / 3, 'custo/entrega total');
  // totais por soma/soma
  perto(L(r, 'cumprimento').total, 3 / 5, 'cumprimento total');
  perto(L(r, 'devolucao').total, 2 / 4, 'devolução total');
  // cor da carga em janeiro: 3 carregadas de 4 -> amarelo
  assert.strictEqual(L(r, 'programadas').cores['2026-01'], 'amarelo');
  assert.strictEqual(r.detalhes.pedidos.length, 5);
  assert.ok(r.detalhes.pedidos.every((p) => p.realizada <= p.carregada));
});

teste('modo padrão sem unificação soma tudo', () => {
  const a = { nome: 'A', pedidos: [{ Numero: 1, Data: d('2026-05-01'), NroInsc: 'Z', Situacao: 'A' }], retornos: [], prevendas: [], custos: [] };
  const b = { nome: 'B', pedidos: [{ Numero: 1, Data: d('2026-05-01'), NroInsc: 'Z', Situacao: 'A' }], retornos: [], prevendas: [], custos: [] };
  const r = calcularPadrao({ ini: '2026-05-01', fim: '2026-05-31', conexoes: [a, b], unificar: false });
  assert.strictEqual(L(r, 'programadas').total, 2);
  assert.strictEqual(L(r, 'programadas').cores['2026-05'], 'verde');
  assert.strictEqual(L(r, 'prazo').total, null);
});

teste('período atravessando o ano separa os meses', () => {
  const a = {
    nome: 'A',
    pedidos: [
      { Numero: 1, Data: d('2025-12-15'), Situacao: 'A' },
      { Numero: 2, Data: d('2026-12-15'), Situacao: 'A' }
    ],
    retornos: [], prevendas: [], custos: []
  };
  const r = calcularPadrao({ ini: '2025-12-01', fim: '2026-12-31', conexoes: [a], unificar: true });
  assert.strictEqual(r.colunas.length, 13);
  assert.strictEqual(L(r, 'programadas').valores['2025-12'], 1);
  assert.strictEqual(L(r, 'programadas').valores['2026-12'], 1);
});

console.log(`\n${ok} testes passaram.`);
