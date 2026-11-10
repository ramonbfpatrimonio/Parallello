export const norm = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const fmt = (v, casas) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
export const moeda = v => `R$ ${fmt(v, 2)}`;
export const numero = (v, casas = 2) => fmt(v, casas);
export const pct = v => `${fmt((v || 0) * 100, 2)}%`;
export const data = d => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '');
export const dataHora = d => (d ? new Date(d).toLocaleString('pt-BR') : '');

export function filtrarOrdens(ordens, busca, soSemCusto) {
  const t = norm(busca).trim();
  return ordens.filter(o => {
    if (soSemCusto && !o.insumosSemCusto) return false;
    if (!t) return true;
    if ([o.numero, o.codigo, o.descricao].some(v => norm(v).includes(t))) return true;
    return o.insumos.some(i => norm(i.codigo).includes(t) || norm(i.descricao).includes(t));
  });
}

// ---------------- Ordenação pelos cabeçalhos ----------------
const VALOR_ACABADO = {
  ordem: o => o.numero,
  data: o => (o.data ? new Date(o.data).getTime() : null),
  produto: o => o.descricao,
  codigo: o => o.codigo,
  quant: o => o.quantKg,
  kg: o => o.quantKg,
  unit: o => o.custoKg,
  total: o => o.custoTotal,
  comp: o => o.insumosSemCusto
};
const VALOR_INSUMO = {
  ordem: i => i.item,
  data: i => i.item,
  produto: i => i.descricao,
  codigo: i => i.codigo,
  quant: i => i.quantKg,
  kg: i => i.quantKg,
  unit: i => i.custoUnit,
  total: i => i.custoTotal,
  comp: i => i.custoTotal
};

const NUM = /^-?\d+(\.\d+)?$/;
function comparar(a, b) {
  const va = a ?? null;
  const vb = b ?? null;
  if (va === null && vb === null) return 0;
  if (va === null) return 1; // vazios sempre no fim
  if (vb === null) return -1;
  if (typeof va === 'number' && typeof vb === 'number') return va - vb;
  if (NUM.test(String(va)) && NUM.test(String(vb))) return Number(va) - Number(vb);
  return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' });
}

// Ordena os acabados e, dentro de cada um, os insumos pela mesma coluna
export function ordenarOrdens(ordens, ordenacao) {
  if (!ordenacao || !VALOR_ACABADO[ordenacao.chave]) return ordens;
  const sinal = ordenacao.dir === 'desc' ? -1 : 1;
  const fa = VALOR_ACABADO[ordenacao.chave];
  const fi = VALOR_INSUMO[ordenacao.chave];
  return [...ordens]
    .sort((a, b) => {
      const r = comparar(fa(a), fa(b));
      return r === 0 ? comparar(a.numero, b.numero) : r * sinal;
    })
    .map(o => ({ ...o, insumos: [...o.insumos].sort((a, b) => comparar(fi(a), fi(b)) * sinal || comparar(a.item, b.item)) }));
}

// Crescente → decrescente → ordem original
export function proximaOrdenacao(atual, chave) {
  if (!atual || atual.chave !== chave) return { chave, dir: 'asc' };
  if (atual.dir === 'asc') return { chave, dir: 'desc' };
  return null;
}

export function resumir(ordens) {
  const centavos = ordens.reduce((s, o) => s + Math.round((o.custoTotal || 0) * 100), 0);
  const kg = ordens.reduce((s, o) => s + (o.quantKg || 0), 0);
  const insumos = ordens.reduce((s, o) => s + o.insumos.length, 0);
  const semCusto = ordens.reduce((s, o) => s + (o.insumosSemCusto || 0), 0);
  const custo = centavos / 100;
  return { ordens: ordens.length, insumos, semCusto, custo, kg, custoKg: kg > 0 ? custo / kg : 0 };
}

export function descreverFiltros(f = {}, geradoEm) {
  const partes = [];
  if (f.dataIni || f.dataFim) partes.push(`Período: ${f.dataIni ? data(f.dataIni) : '...'} a ${f.dataFim ? data(f.dataFim) : '...'}`);
  if (f.numeroIni || f.numeroFim) partes.push(`Ordens: ${f.numeroIni || '...'} a ${f.numeroFim || '...'}`);
  if (f.produto) partes.push(`Produto: ${f.produto}`);
  if (f.descricao) partes.push(`Descrição contém: ${f.descricao}`);
  if (!partes.length) partes.push('Sem filtros (todas as ordens)');
  if (geradoEm) partes.push(`Gerado em ${dataHora(geradoEm)}`);
  return partes.join('  •  ');
}

// Comparação por produto acabado: custo/kg médio ponderado em cada fotografia
export function compararSnapshots(a, b) {
  const agrupar = snap => {
    const m = new Map();
    for (const o of snap.ordens) {
      const k = String(o.codigo);
      const g = m.get(k) || { codigo: o.codigo, descricao: o.descricao, custo: 0, kg: 0, ordens: 0 };
      g.custo += o.custoTotal || 0;
      g.kg += o.quantKg || 0;
      g.ordens += 1;
      m.set(k, g);
    }
    return m;
  };
  const ga = agrupar(a);
  const gb = agrupar(b);
  const codigos = new Set([...ga.keys(), ...gb.keys()]);
  return [...codigos].map(k => {
    const x = ga.get(k);
    const y = gb.get(k);
    const kgA = x && x.kg > 0 ? x.custo / x.kg : null;
    const kgB = y && y.kg > 0 ? y.custo / y.kg : null;
    const dif = kgA !== null && kgB !== null ? kgB - kgA : null;
    return {
      codigo: (x || y).codigo,
      descricao: (y || x).descricao,
      custoKgA: kgA,
      custoKgB: kgB,
      diferenca: dif,
      variacao: dif !== null && kgA > 0 ? dif / kgA : null
    };
  }).sort((p, q) => Math.abs(q.variacao ?? 0) - Math.abs(p.variacao ?? 0));
}
