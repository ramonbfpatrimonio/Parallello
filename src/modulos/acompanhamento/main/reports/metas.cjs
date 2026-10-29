// METAS DE VOLUME (abas ocultas "Venda por vol x meta por vol", "Meta por Dia" e "Visão Macro").
// Na planilha a meta mensal e o realizado eram digitados à mão. Aqui:
//  - a meta mensal por setor x fabricante é cadastrada no sistema (salva localmente);
//  - o realizado (volume = Quant x Fator_HL) vem do banco, por setor, fabricante e dia.
// Regras da planilha mantidas:
//  - meta semanal = meta mensal ÷ dias úteis do mês × dias úteis da semana
//                   + o que faltou na semana anterior  -> base + MAX(metaAnterior - realAnterior, 0)
//  - meta diária  = meta da semana ÷ dias úteis da semana
//                   + o que faltou no dia anterior     -> MAX(base + (metaAnterior - realAnterior), 0)
//  - Visão Macro: ranking pelo déficit (quem deve menos primeiro).
const S = require('../lib/sqlbase.cjs');

function limitesDoMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { ini: `${mes}-01`, fim: `${mes}-${String(ultimo).padStart(2, '0')}`, ano: a, mes: m, ultimo };
}

function diasUteis(mes, cfg) {
  const { ano, mes: m, ultimo } = limitesDoMes(mes);
  const fora = new Set(cfg.diasNaoUteis || []);
  const sabado = cfg.sabadoUtil !== false;
  const lista = [];
  for (let d = 1; d <= ultimo; d++) {
    const data = new Date(Date.UTC(ano, m - 1, d));
    const dow = data.getUTCDay();
    const iso = data.toISOString().slice(0, 10);
    if (dow === 0) continue;
    if (dow === 6 && !sabado) continue;
    if (fora.has(iso)) continue;
    lista.push(iso);
  }
  return lista;
}

// semana começando na segunda-feira
function inicioSemana(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

const NOMES_DIA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
function rotuloDia(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)} — ${NOMES_DIA[d.getUTCDay()]}`;
}

// "103" | "101,102" | "2*" (todos os setores que começam com 2)
function casaSetor(padrao, setor) {
  const s = S.norm(setor);
  return String(padrao || '')
    .split(',')
    .map((p) => S.norm(p))
    .filter(Boolean)
    .some((p) => (p.endsWith('*') ? s.startsWith(p.slice(0, -1)) : s === p));
}

function consultas(empresa, filtros) {
  const d = !!filtros.deduzirRetorno;
  return {
    realizado: `
SELECT
  LTRIM(RTRIM(ISNULL(pv.Setor,''))) AS Setor,
  ${S.FAB} AS Fabricante,
  CAST(pv.Data AS DATE) AS Dia,
  ISNULL(SUM(${S.exprVolume(d)}), 0) AS Volume,
  ISNULL(SUM(${S.exprValor(d)}), 0) AS Valor
${S.fromVendas(d, { comCliente: false })}
${S.WHERE_VENDAS}
GROUP BY LTRIM(RTRIM(ISNULL(pv.Setor,''))), ${S.FAB}, CAST(pv.Data AS DATE)`
  };
}

// realizado[linhaId][fab][diaUtil] = volume
function distribuirRealizado(porBase, linhas, fabs, uteis) {
  const real = {};
  const setoresSemMeta = new Map();
  linhas.forEach((l) => { real[l.id] = {}; });
  const paraDiaUtil = (dia) => {
    // venda em dia não útil conta no dia útil anterior (ou no primeiro do mês)
    let alvo = uteis[0];
    for (const u of uteis) { if (u <= dia) alvo = u; else break; }
    return alvo;
  };
  for (const { resultados } of porBase) {
    for (const r of resultados.realizado) {
      const col = S.colunaFabricante(fabs, r.Fabricante);
      if (!col) continue;
      const diaU = paraDiaUtil(S.dia(r.Dia));
      if (!diaU) continue;
      const vol = S.num(r.Volume);
      const linha = linhas.find((l) => casaSetor(l.setores, r.Setor));
      if (!linha) {
        const k = S.txt(r.Setor);
        setoresSemMeta.set(k, (setoresSemMeta.get(k) || 0) + vol);
        continue;
      }
      const porFab = real[linha.id][col] || (real[linha.id][col] = {});
      porFab[diaU] = (porFab[diaU] || 0) + vol;
    }
  }
  return { real, setoresSemMeta };
}

function calcular(empresa, mes, cfgMes, porBase) {
  const fabs = S.fabricantesDaEmpresa(empresa).filter((f) => f.chave !== '__OUTROS__');
  const linhas = (cfgMes.linhas || []).filter((l) => S.txt(l.setores));
  const uteis = diasUteis(mes, cfgMes);
  const N = uteis.length || 1;
  const { real, setoresSemMeta } = distribuirRealizado(porBase, linhas, fabs, uteis);

  // semanas do mês
  const semanas = [];
  uteis.forEach((d) => {
    const ini = inicioSemana(d);
    let s = semanas.find((x) => x.ini === ini);
    if (!s) { s = { ini, dias: [] }; semanas.push(s); }
    s.dias.push(d);
  });
  semanas.forEach((s, i) => {
    const a = s.dias[0];
    const b = s.dias[s.dias.length - 1];
    s.rotulo = `${i + 1}ª semana (${a.slice(8, 10)} a ${b.slice(8, 10)}/${b.slice(5, 7)})`;
  });

  // cálculo por linha x fabricante
  const calc = {}; // calc[linhaId][fab] = { metaMes, realMes, semanas:[{meta, real}], dias:{iso:{meta, real}} }
  for (const l of linhas) {
    calc[l.id] = {};
    for (const f of fabs) {
      const metaMes = S.num((l.metas || {})[f.chave]);
      const porDia = (real[l.id] || {})[f.chave] || {};
      const realMes = Object.values(porDia).reduce((s, v) => s + v, 0);
      const baseDia = metaMes / N;
      const rs = [];
      const ds = {};
      let anterior = null;
      for (const s of semanas) {
        const base = baseDia * s.dias.length;
        const meta = anterior ? base + Math.max(anterior.meta - anterior.real, 0) : base;
        const realS = s.dias.reduce((acc, d) => acc + (porDia[d] || 0), 0);
        const item = { meta, real: realS };
        rs.push(item);
        anterior = item;
        // dias da semana
        const baseD = meta / s.dias.length;
        let ant = null;
        for (const d of s.dias) {
          const metaD = ant ? Math.max(baseD + (ant.meta - ant.real), 0) : baseD;
          const realD = porDia[d] || 0;
          ds[d] = { meta: metaD, real: realD };
          ant = ds[d];
        }
      }
      calc[l.id][f.chave] = { metaMes, realMes, semanas: rs, dias: ds };
    }
  }

  // ---------- monta as tabelas ----------
  // posição do mês: dias úteis decorridos (as barras do mensal são coloridas pelo ritmo esperado até hoje)
  const hoje = new Date().toISOString().slice(0, 10);
  const decorridos = uteis.filter((d) => d <= hoje).length;
  const colunasBase = (rotuloTotal, esperado = 1) => [
    { chave: 'setor', rotulo: 'Setor', tipo: 'texto', alinhamento: 'centro' },
    { chave: 'supervisor', rotulo: 'Supervisor', tipo: 'texto' },
    ...fabs.map((f) => ({ chave: 'f:' + f.chave, rotulo: f.nome, tipo: 'mr', esperado })),
    { chave: 'total', rotulo: rotuloTotal, tipo: 'mr', destaque: true, esperado },
    { chave: 'pct', rotulo: '% da meta', tipo: 'pct' },
    { chave: 'deficit', rotulo: 'Falta bater', tipo: 'numero0' }
  ];
  const tabela = (rotuloTotal, pegar, esperado) => {
    const tot = {};
    let tm = 0;
    let tr = 0;
    const ls = linhas.map((l, i) => {
      const c = { setor: l.setores, supervisor: l.supervisor || '' };
      let m = 0;
      let r = 0;
      fabs.forEach((f) => {
        const v = pegar(calc[l.id][f.chave]);
        c['f:' + f.chave] = v;
        m += v.meta;
        r += v.real;
        tot[f.chave] = tot[f.chave] || { meta: 0, real: 0 };
        tot[f.chave].meta += v.meta;
        tot[f.chave].real += v.real;
      });
      c.total = { meta: m, real: r };
      c.pct = m > 0 ? r / m : 0;
      c.deficit = Math.max(m - r, 0);
      tm += m;
      tr += r;
      return { id: 'm' + i, tipo: 'dado', celulas: c };
    });
    const ct = { setor: 'Total' };
    fabs.forEach((f) => { ct['f:' + f.chave] = tot[f.chave] || { meta: 0, real: 0 }; });
    ct.total = { meta: tm, real: tr };
    ct.pct = tm > 0 ? tr / tm : 0;
    ct.deficit = Math.max(tm - tr, 0);
    if (ls.length) ls.push({ id: 'total', tipo: 'total', celulas: ct });
    return { colunas: colunasBase(rotuloTotal, esperado), linhas: ls, totalMeta: tm, totalReal: tr };
  };

  const mensal = tabela('Total', (x) => ({ meta: x.metaMes, real: x.realMes }), N ? Math.max(decorridos, 1) / N : 1);
  const tabSemanas = semanas.map((s, i) => ({
    rotulo: s.rotulo,
    ...tabela('Total da semana', (x) => x.semanas[i])
  }));
  const tabDias = uteis.map((d) => ({
    dia: d,
    rotulo: rotuloDia(d),
    semana: semanas.findIndex((s) => s.dias.includes(d)),
    ...tabela('Total do dia', (x) => x.dias[d])
  }));

  // Visão macro
  const macroLinhas = mensal.linhas
    .filter((l) => l.tipo === 'dado')
    .map((l) => ({
      setor: l.celulas.setor,
      supervisor: l.celulas.supervisor,
      meta: l.celulas.total.meta,
      real: l.celulas.total.real,
      pct: l.celulas.pct,
      deficit: Math.max(l.celulas.total.meta - l.celulas.total.real, 0)
    }))
    .sort((a, b) => a.deficit - b.deficit);
  const macro = {
    colunas: [
      { chave: 'pos', rotulo: 'Posição', tipo: 'texto', alinhamento: 'centro' },
      { chave: 'setor', rotulo: 'Setor', tipo: 'texto', alinhamento: 'centro' },
      { chave: 'supervisor', rotulo: 'Supervisor', tipo: 'texto' },
      { chave: 'meta', rotulo: 'Meta total', tipo: 'numero0' },
      { chave: 'real', rotulo: 'Realizado total', tipo: 'numero0' },
      { chave: 'pct', rotulo: '% da meta', tipo: 'pctbarra' },
      { chave: 'deficit', rotulo: 'Déficit (falta bater)', tipo: 'numero0', destaque: true }
    ],
    linhas: macroLinhas.map((m, i) => ({ id: 'v' + i, tipo: 'dado', celulas: { pos: `${i + 1}º`, ...m } })),
    dados: macroLinhas
  };

  return {
    mes,
    fabricantes: fabs.map((f) => ({ chave: f.chave, nome: f.nome })),
    diasUteis: uteis,
    decorridos,
    mensal,
    semanas: tabSemanas,
    dias: tabDias,
    macro,
    setoresSemMeta: [...setoresSemMeta.entries()].map(([setor, volume]) => ({ setor, volume })).sort((a, b) => b.volume - a.volume)
  };
}

module.exports = { consultas, calcular, diasUteis, limitesDoMes, casaSetor };
