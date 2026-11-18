import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularTitulo, processarCarteira, montarLista, numeroParcela, top10, titulosDisparoLote, resumoLigacoes, agendadosHoje } from '../renderer/src/logica/calculos.js';
import { crc16, gerarPixCopiaCola, normalizarChavePix } from '../renderer/src/logica/pix.js';
import { CONFIG_PADRAO, mesclarConfig } from '../renderer/src/logica/padroes.js';
import { montarEmailTitulo, montarEmailTodos, montarWhatsApp, montarEmailLote } from '../renderer/src/logica/mensagens.js';
import { brParaISO, normalizarHora, telefoneWhatsApp, diasEntre } from '../renderer/src/logica/formato.js';

const F = CONFIG_PADRAO.faixas;
const HOJE = '2026-11-18';
const base = { Codigo: '00012', Nome_Fanta: 'MERCADO SOL', NroInsc: '12.345.678/0001-90', Tel: '(92) 99999-1234', email: 'a@b.com', Abrev_Doc: 'BOL', NroNF: 100, NroParc: 1, Vendedor: 'JOAO', DataEmi: '2026-09-01', Juros_Dia: 0.33, ValorMulta: 2, Protestado: 0 };

test('juros e valor atual iguais à planilha', () => {
  const t = calcularTitulo({ ...base, DocPag: '100/A', DataVen: '2026-11-08', ValPre: 1000 }, HOJE, F);
  assert.equal(t.dias, 10);
  assert.equal(t.juros, 33); // 1000 * 0,33% * 10
  assert.equal(t.multa, 2);
  assert.equal(t.valorAtual, 1035);
  assert.equal(t.faixa, 'v1');
});

test('título a vencer não tem juros nem multa', () => {
  const t = calcularTitulo({ ...base, DocPag: '1', DataVen: '2026-11-20', ValPre: 500 }, HOJE, F);
  assert.equal(t.dias, 0);
  assert.equal(t.valorAtual, 500);
  assert.equal(t.faixa, 'prox');
  assert.equal(calcularTitulo({ ...base, DocPag: '1', DataVen: HOJE, ValPre: 1 }, HOJE, F).faixa, 'hoje');
  assert.equal(calcularTitulo({ ...base, DocPag: '1', DataVen: '2026-12-30', ValPre: 1 }, HOJE, F).faixa, 'avencer');
});

test('faixas de atraso', () => {
  const fx = (d) => calcularTitulo({ ...base, DocPag: '1', DataVen: d, ValPre: 1 }, HOJE, F).faixa;
  assert.equal(fx('2026-10-19'), 'v1'); // 30 dias
  assert.equal(fx('2026-10-18'), 'v2'); // 31
  assert.equal(fx('2026-09-19'), 'v2'); // 60
  assert.equal(fx('2026-09-18'), 'v3'); // 61
  assert.equal(fx('2026-08-20'), 'v3'); // 90
  assert.equal(fx('2026-08-19'), 'v4'); // 91
});

test('parcela pela letra do documento', () => {
  assert.equal(numeroParcela('123/C', 1), 3);
  assert.equal(numeroParcela('123', 4), 4);
});

test('agenda futura esconde título; top 10 não', () => {
  const linhas = [
    { ...base, DocPag: 'D1', DataVen: '2026-10-01', ValPre: 100 },
    { ...base, DocPag: 'D2', DataVen: '2026-10-01', ValPre: 200 },
  ];
  const registros = [{ documento: 'D1', cliente_codigo: '00012', proxima: true, data_prevista: '2026-11-25', criado_em: '2026-11-17T10:00:00Z' }];
  const r = processarCarteira({ linhas, hoje: HOJE, config: CONFIG_PADRAO, registros, ultimoErpPorCliente: new Map() });
  const lista = montarLista({ titulos: r.titulos, filtro: 'todos', busca: '', mostrarAgendados: false });
  assert.equal(lista[0].titulos.length, 1);
  assert.equal(lista[0].titulos[0].docPag, 'D2');
  assert.equal(top10(r.titulos)[0].titulos.length, 2);
});

test('agenda do ERP vale quando o cliente não tem registro na nuvem', () => {
  const linhas = [{ ...base, DocPag: 'D1', DataVen: '2026-10-01', ValPre: 100 }];
  const erp = new Map([['00012', { proximoContato: '2026-12-01' }]]);
  const r = processarCarteira({ linhas, hoje: HOJE, config: CONFIG_PADRAO, registros: [], ultimoErpPorCliente: erp });
  assert.equal(r.titulos[0].agendadoFuturo, true);
});

test('acordo e negociação pela situação ou pelo resultado', () => {
  const linhas = [
    { ...base, DocPag: 'D1', DataVen: '2026-10-01', ValPre: 100 },
    { ...base, DocPag: 'D2', DataVen: '2026-10-01', ValPre: 100 },
  ];
  const registros = [
    { documento: 'D1', cliente_codigo: '00012', situacao_descricao: 'ACORDO FECHADO', criado_em: '2026-11-17' },
    { documento: 'D2', cliente_codigo: '00012', resultado_codigo: '14', criado_em: '2026-11-17' },
  ];
  const r = processarCarteira({ linhas, hoje: HOJE, config: CONFIG_PADRAO, registros, ultimoErpPorCliente: new Map() });
  assert.equal(r.contagens.acordo.titulos, 1);
  assert.equal(r.contagens.negociacao.titulos, 1);
});

test('KPIs', () => {
  const linhas = [
    { ...base, DocPag: 'D1', DataVen: '2026-11-08', ValPre: 1000 },
    { ...base, Codigo: '2', Nome_Fanta: 'B', DocPag: 'D2', DataVen: '2026-11-25', ValPre: 500 },
  ];
  const r = processarCarteira({ linhas, hoje: HOJE, config: CONFIG_PADRAO, registros: [], ultimoErpPorCliente: new Map() });
  assert.equal(r.kpis.total, 1535);
  assert.equal(r.kpis.vencido, 1035);
  assert.equal(r.kpis.aVencer, 500);
  assert.equal(r.kpis.clientes, 2);
  assert.equal(r.kpis.maiorDevedor.nome, 'MERCADO SOL');
});

test('disparo em lote pega de amanhã até hoje + 7', () => {
  const ts = ['2026-11-18', '2026-11-19', '2026-11-25', '2026-11-26'].map((d) => ({ vencimento: d }));
  assert.deepEqual(titulosDisparoLote(ts, HOJE, 7).map((t) => t.vencimento), ['2026-11-19', '2026-11-25']);
});

test('agendados de hoje em ordem de hora', () => {
  const ts = [
    { ultimoRegistro: { proxima: true, data_prevista: HOJE, hora_prevista: '15:00' }, docPag: 'B' },
    { ultimoRegistro: { proxima: true, data_prevista: HOJE, hora_prevista: '09:30' }, docPag: 'A' },
    { ultimoRegistro: { proxima: true, data_prevista: '2026-11-19' }, docPag: 'C' },
  ];
  assert.deepEqual(agendadosHoje(ts, HOJE).map((t) => t.docPag), ['A', 'B']);
});

test('resumo de ligações por operador', () => {
  const regs = [
    { operador_nome: 'ANA', resultado_codigo: '01' },
    { operador_nome: 'ANA', resultado_codigo: '25' },
    { operador_nome: 'ANA', resultado_codigo: '07' },
    { operador_nome: 'BIA', resultado_codigo: '02' },
  ];
  const r = resumoLigacoes(regs, CONFIG_PADRAO.resultados);
  assert.equal(r.linhas[0].operador, 'ANA');
  assert.equal(r.linhas[0].total, 2);
  assert.equal(r.total.atendidas, 2);
  assert.equal(r.total.taxa, (2 / 3) * 100);
});

test('PIX: CRC16 do exemplo oficial e payload válido', () => {
  // Exemplo do manual do BR Code (Bacen)
  const semCrc = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';
  assert.equal(crc16(semCrc), '1D3D');
  const fin = { ...CONFIG_PADRAO.financeiro, chavePix: '12.345.678/0001-90', tipoChavePix: 'CNPJ', titular: 'Hage Alimentos Ltda', cidadePix: 'Manaus' };
  const p = gerarPixCopiaCola(fin, 1035.5);
  assert.match(p, /0114123456780001905204/);
  assert.match(p, /54071035\.50/);
  assert.equal(p.slice(-4), crc16(p.slice(0, -4)));
  assert.equal(normalizarChavePix('(92) 99999-1234', 'Celular'), '+5592999991234');
});

test('mensagens', () => {
  const ctx = { config: mesclarConfig({ financeiro: { chavePix: 'a@b.com', tipoChavePix: 'E-mail' } }), empresaErp: { nome: 'HAGE ALIMENTOS', email: 'fin@hage.com' }, hoje: HOJE };
  const linhas = [
    { ...base, DocPag: 'D1', DataVen: '2026-11-08', ValPre: 1000 },
    { ...base, DocPag: 'D2', DataVen: '2026-07-01', ValPre: 300 },
    { ...base, DocPag: 'D3', DataVen: '2026-11-22', ValPre: 50 },
  ];
  const r = processarCarteira({ linhas, hoje: HOJE, config: ctx.config, registros: [], ultimoErpPorCliente: new Map() });
  const g = montarLista({ titulos: r.titulos, filtro: 'todos', busca: '' })[0];
  const e = montarEmailTitulo(g.titulos.find((t) => t.docPag === 'D1'), ctx);
  assert.match(e.assunto, /Aviso de Título em Atraso \(Vencido 1–30\) - HAGE ALIMENTOS/);
  assert.match(e.corpo, /Valor Atualizado: R\$\s1\.035,00/);
  assert.match(e.corpo, /PIX Copia e Cola/);
  const todos = montarEmailTodos(g, ctx);
  assert.match(todos.assunto, /Notificação Extrajudicial/);
  assert.match(todos.corpo, /TÍTULOS EM ATRASO \(\+90 DIAS\)/);
  assert.ok(!todos.corpo.includes('D3'));
  const w = montarWhatsApp(g, g.titulos.slice(0, 1), ctx);
  assert.match(w.texto, /\*CONTATO DO FINANCEIRO\*/);
  const lote = montarEmailLote(g, [g.titulos.find((t) => t.docPag === 'D3')], ctx);
  assert.match(lote.corpo, /\(4 dias\)/);
});

test('formatos', () => {
  assert.equal(brParaISO('25/12/2026'), '2026-12-25');
  assert.equal(brParaISO('31/02/2026'), '');
  assert.equal(normalizarHora('930'), '09:30');
  assert.equal(normalizarHora('2561'), '');
  assert.equal(telefoneWhatsApp('(092) 99999-1234'), '5592999991234');
  assert.equal(telefoneWhatsApp('1234'), '');
  assert.equal(diasEntre('2026-11-08', HOJE), 10);
});
