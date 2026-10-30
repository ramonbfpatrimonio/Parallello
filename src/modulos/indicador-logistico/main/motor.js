// Motor de cálculo dos indicadores.
//  - calcularPadrao: regra corrigida, calculada pedido a pedido (consistente entre os blocos)
//  - calcularPlanilha: réplica fiel da macro ConsultarPainel da planilha

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function ymd(v) {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function diffDias(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

function mesesEntre(ini, fim) {
  let y = +ini.slice(0, 4);
  let m = +ini.slice(5, 7);
  const ye = +fim.slice(0, 4);
  const me = +fim.slice(5, 7);
  const out = [];
  while ((y < ye || (y === ye && m <= me)) && out.length < 120) {
    out.push({ key: `${y}-${String(m).padStart(2, '0')}`, label: `${MESES[m - 1]}/${String(y).slice(2)}` });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

const div = (a, b) => (b > 0 ? a / b : null);
const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());

function zeros(cols) {
  const o = {};
  cols.forEach((c) => { o[c.key] = 0; });
  return o;
}

function soma(obj) {
  return Object.values(obj).reduce((a, b) => a + (b || 0), 0);
}

function razao(num, den, cols) {
  const o = {};
  cols.forEach((c) => { o[c.key] = div(num[c.key], den[c.key]); });
  return o;
}

function linha(id, nome, unid, tipo, valores, total, extra = {}) {
  return { id, nome, unid, tipo, valores, total, ...extra };
}

// --------------------------------------------------------------------------
// MODO PADRÃO
// conexoes: [{ nome, pedidos, retornos, prevendas, custos }] na ordem de prioridade
// --------------------------------------------------------------------------
function calcularPadrao({ ini, fim, conexoes, unificar }) {
  const cols = mesesEntre(ini, fim);
  const chaves = new Set(cols.map((c) => c.key));
  const programadas = zeros(cols);
  const carregadas = zeros(cols);
  const realizadas = zeros(cols);
  const somaDias = zeros(cols);
  const comPrazo = zeros(cols);
  const devolvidos = zeros(cols);
  const custo = zeros(cols);

  const pedidosDet = [];
  const custosDet = [];
  const donoChave = new Map();
  let unificados = 0;
  const usarUnificacao = unificar && conexoes.length > 1;

  for (const cx of conexoes) {
    const ret = new Map();
    for (const r of cx.retornos || []) {
      const ref = txt(r.NroRef);
      if (!ret.has(ref)) ret.set(ref, []);
      ret.get(ref).push({ numero: txt(r.Numero), op: Number(r.CodOp), data: ymd(r.Data) });
    }
    const prev = new Map();
    for (const p of cx.prevendas || []) prev.set(txt(p.Pedido), ymd(p.DataPrevenda));

    const vistos = new Set();
    for (const p of cx.pedidos || []) {
      const numero = txt(p.Numero);
      if (vistos.has(numero)) continue;
      vistos.add(numero);
      const data = ymd(p.Data);
      if (!data) continue;
      const mes = data.slice(0, 7);
      if (!chaves.has(mes)) continue;

      const insc = txt(p.NroInsc);
      if (usarUnificacao) {
        const chave = (insc ? 'I:' + insc : 'C:' + cx.nome + ':' + txt(p.CodCli)) + '|' + data;
        const dono = donoChave.get(chave);
        if (dono === undefined) donoChave.set(chave, cx.nome);
        else if (dono !== cx.nome) { unificados++; continue; }
      }

      const situacao = txt(p.Situacao).toUpperCase();
      const carregada = situacao === 'A';
      const rets = ret.get(numero) || [];
      const tem99 = rets.some((r) => r.op === 99);
      const tem98 = rets.some((r) => r.op === 98);
      const realizada = carregada && !tem99;
      const devolvido = carregada && (tem98 || tem99);
      const dataAcerto = ymd(p.DataAcerto);
      const dataPrevenda = prev.get(numero) || null;
      let dias = null;
      if (realizada && dataAcerto && dataPrevenda) {
        const d = diffDias(dataPrevenda, dataAcerto);
        if (d >= 0) dias = d;
      }

      programadas[mes]++;
      if (carregada) carregadas[mes]++;
      if (realizada) realizadas[mes]++;
      if (dias !== null) { somaDias[mes] += dias; comPrazo[mes]++; }
      if (devolvido) devolvidos[mes]++;

      pedidosDet.push({
        conexao: cx.nome, numero, data, mes, carga: txt(p.Carga), cliente: txt(p.CodCli), nroInsc: insc,
        situacao, carregada, realizada, devolvido, dataPrevenda, dataAcerto, dias,
        retornos: rets.map((r) => `${r.op} nº ${r.numero}${r.data ? ' em ' + r.data.split('-').reverse().join('/') : ''}`).join('; ')
      });
    }

    for (const c of cx.custos || []) {
      const data = ymd(c.DataEntra);
      if (!data) continue;
      const mes = data.slice(0, 7);
      if (!chaves.has(mes)) continue;
      const valor = Number(c.Valor) || 0;
      custo[mes] += valor;
      custosDet.push({ conexao: cx.nome, mes, data, codigo: txt(c.Codigo), nroNF: txt(c.NroNF), valor });
    }
  }

  const corCarga = {};
  cols.forEach((c) => {
    const k = c.key;
    if (programadas[k] > 0) {
      corCarga[k] = carregadas[k] >= programadas[k] ? 'verde' : carregadas[k] > 0 ? 'amarelo' : 'vermelho';
    }
  });

  const t = {
    programadas: soma(programadas), carregadas: soma(carregadas), realizadas: soma(realizadas),
    somaDias: soma(somaDias), comPrazo: soma(comPrazo), devolvidos: soma(devolvidos), custo: soma(custo)
  };

  const blocos = [
    {
      id: 'entregas', titulo: 'Entregas Realizadas', indicador: 'cumprimento',
      linhas: [
        linha('programadas', 'Entregas Programadas', 'un.', 'int', programadas, t.programadas, { drill: 'programadas', cores: corCarga }),
        linha('realizadas', 'Entregas Realizadas', 'un.', 'int', realizadas, t.realizadas, { drill: 'realizadas' }),
        linha('cumprimento', '% Cumprimento de Entregas', '%', 'pct', razao(realizadas, programadas, cols), div(t.realizadas, t.programadas), { indicador: 'cumprimento' })
      ]
    },
    {
      id: 'prazo', titulo: 'Prazo Médio de Entrega', indicador: 'prazo',
      linhas: [
        linha('somaDias', 'Soma de Dias de Entrega', 'dias', 'int', somaDias, t.somaDias, { drill: 'comPrazo' }),
        linha('comPrazo', 'Entregas com Prazo Apurado', 'un.', 'int', comPrazo, t.comPrazo, { drill: 'comPrazo' }),
        linha('prazo', 'Prazo Médio de Entrega', 'dias', 'dec', razao(somaDias, comPrazo, cols), div(t.somaDias, t.comPrazo), { indicador: 'prazo' })
      ]
    },
    {
      id: 'custo', titulo: 'Custo por Entrega', indicador: 'custo',
      linhas: [
        linha('custo', 'Custo Logístico Total', 'R$', 'moeda', custo, t.custo, { drill: 'custos' }),
        linha('realizadasRef', 'Entregas Realizadas (ref.)', 'un.', 'int', realizadas, t.realizadas, { drill: 'realizadas' }),
        linha('custoEntrega', 'Custo por Entrega', 'R$', 'moeda', razao(custo, realizadas, cols), div(t.custo, t.realizadas), { indicador: 'custo' })
      ]
    },
    {
      id: 'devolucoes', titulo: 'Devoluções', indicador: 'devolucao',
      linhas: [
        linha('devolvidos', 'Pedidos Devolvidos (op. 98/99)', 'un.', 'int', devolvidos, t.devolvidos, { drill: 'devolvidos' }),
        linha('carregadas', 'Pedidos Carregados (ref.)', 'un.', 'int', carregadas, t.carregadas, { drill: 'carregadas' }),
        linha('devolucao', '% Devoluções', '%', 'pct', razao(devolvidos, carregadas, cols), div(t.devolvidos, t.carregadas), { indicador: 'devolucao' })
      ]
    }
  ];

  return {
    modo: 'padrao',
    colunas: cols,
    blocos,
    detalhes: { pedidos: pedidosDet, custos: custosDet },
    unificados
  };
}

// --------------------------------------------------------------------------
// MODO PLANILHA — mesmos números da macro VBA (inclusive as inconsistências)
// conexoes: [{ nome, linhas, dictVendas, dictDevolucoes }]
// --------------------------------------------------------------------------
function calcularPlanilha({ conexoes, consolidado }) {
  const cols = MESES.map((m, i) => ({ key: String(i + 1).padStart(2, '0'), label: m }));
  const arr = () => Array(13).fill(0);
  const L7 = arr(), vendasBruto = arr(), cargaA = arr(), op99 = arr(), dev25 = arr(), dias = arr(), custo = arr();
  const dictL7 = new Map();
  const dictL25 = new Map();

  for (const cx of conexoes) {
    for (const r of cx.linhas || []) {
      const mes = Number(r.Mes);
      if (!(mes >= 1 && mes <= 12)) continue;
      if (!consolidado) L7[mes] += Number(r.QtdL7) || 0;
      vendasBruto[mes] += Number(r.QtdL7) || 0;
      cargaA[mes] += Number(r.QtdCargaA) || 0;
      op99[mes] += Number(r.QtdOp99) || 0;
      dias[mes] += Number(r.SomaDiasL13) || 0;
      custo[mes] += Number(r.CustoTotal) || 0;
      if (!consolidado) dev25[mes] += Number(r.QtdDevL25) || 0;
    }
    if (consolidado) {
      for (const r of cx.dictVendas || []) {
        const mes = Number(r.Mes);
        if (!(mes >= 1 && mes <= 12)) continue;
        const ch = `${String(mes).padStart(2, '0')}_${txt(r.NroInsc)}_${ymd(r.DataPedido)}`;
        if (!dictL7.has(ch)) dictL7.set(ch, Number(r.QtdePedidos) || 0);
      }
      for (const r of cx.dictDevolucoes || []) {
        const mes = Number(r.Mes);
        if (!(mes >= 1 && mes <= 12)) continue;
        const ch = `${String(mes).padStart(2, '0')}_${txt(r.NroInsc)}_${ymd(r.DataRetorno)}`;
        if (!dictL25.has(ch)) dictL25.set(ch, Number(r.QtdeRetornos) || 0);
      }
    }
  }

  if (consolidado) {
    for (const [ch, v] of dictL7) L7[Number(ch.slice(0, 2))] += v;
    for (const [ch, v] of dictL25) dev25[Number(ch.slice(0, 2))] += v;
  }

  const v = (fn) => { const o = {}; cols.forEach((c, i) => { o[c.key] = fn(i + 1); }); return o; };
  const L8 = arr();
  for (let m = 1; m <= 12; m++) L8[m] = Math.max(0, cargaA[m] - op99[m]);

  const pct9 = v((m) => (L7[m] > 0 ? L8[m] / L7[m] : null));
  const pct27 = v((m) => (cargaA[m] > 0 ? dev25[m] / cargaA[m] : null));
  const media = (o) => { const xs = Object.values(o).filter((x) => x !== null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
  const tot = (a) => a.slice(1).reduce((x, y) => x + y, 0);

  const corCarga = {};
  for (let m = 1; m <= 12; m++) {
    if (vendasBruto[m] > 0) {
      corCarga[cols[m - 1].key] = cargaA[m] >= vendasBruto[m] ? 'verde' : cargaA[m] > 0 ? 'amarelo' : 'vermelho';
    }
  }

  const blocos = [
    {
      id: 'entregas', titulo: 'Entregas Realizadas', indicador: 'cumprimento',
      linhas: [
        linha('programadas', 'Entregas Programadas', 'un.', 'int', v((m) => L7[m]), tot(L7), { cores: corCarga }),
        linha('realizadas', 'Entregas Realizadas', 'un.', 'int', v((m) => L8[m]), tot(L8)),
        linha('cumprimento', '% Cumprimento de Entregas', '%', 'pct', pct9, media(pct9), { indicador: 'cumprimento' })
      ]
    },
    {
      id: 'prazo', titulo: 'Prazo Médio de Entrega', indicador: 'prazo',
      linhas: [
        linha('somaDias', 'Soma de Dias de Entrega', 'dias', 'int', v((m) => dias[m]), tot(dias)),
        linha('comPrazo', 'Nº de Entregas (ref.)', 'un.', 'int', v((m) => L8[m]), tot(L8)),
        linha('prazo', 'Prazo Médio de Entrega', 'dias', 'dec', v((m) => div(dias[m], L8[m])), div(tot(dias), tot(L8)), { indicador: 'prazo' })
      ]
    },
    {
      id: 'custo', titulo: 'Custo por Entrega', indicador: 'custo',
      linhas: [
        linha('custo', 'Custo Logístico Total', 'R$', 'moeda', v((m) => custo[m]), tot(custo)),
        linha('realizadasRef', 'Nº de Entregas (ref.)', 'un.', 'int', v((m) => cargaA[m]), tot(cargaA)),
        linha('custoEntrega', 'Custo por Entrega', 'R$', 'moeda', v((m) => div(custo[m], cargaA[m])), div(tot(custo), tot(cargaA)), { indicador: 'custo' })
      ]
    },
    {
      id: 'devolucoes', titulo: 'Devoluções', indicador: 'devolucao',
      linhas: [
        linha('devolvidos', 'Quantidade Devolvida', 'un.', 'int', v((m) => dev25[m]), tot(dev25)),
        linha('carregadas', 'Quantidade Entregue (ref.)', 'un.', 'int', v((m) => cargaA[m]), tot(cargaA)),
        linha('devolucao', '% Devoluções', '%', 'pct', pct27, media(pct27), { indicador: 'devolucao' })
      ]
    }
  ];

  return { modo: 'planilha', colunas: cols, blocos, detalhes: null, unificados: 0 };
}

module.exports = { calcularPadrao, calcularPlanilha, mesesEntre, ymd, diffDias };
