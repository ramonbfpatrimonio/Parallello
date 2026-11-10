import { useMemo, useState } from 'react';

export const api = window.api;

export const fmtMoeda = (v) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const fmtNum = (v, casas = 0) =>
  (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

export const fmtData = (v) => {
  if (!v) return '—';
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR');
};

export const fmtDataHora = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

export const isoDia = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const isoParaBr = (s) => (s ? String(s).split('-').reverse().join('/') : '');

export function periodoMesAtual() {
  const h = new Date();
  return { ini: isoDia(new Date(h.getFullYear(), h.getMonth(), 1)), fim: isoDia(new Date(h.getFullYear(), h.getMonth() + 1, 0)) };
}

export const classePerfil = (p) =>
  ({ Excelente: 'p-exc', Bom: 'p-bom', Regular: 'p-reg', Risco: 'p-ris', Inadimplente: 'p-ina' }[p] || 'p-reg');

export function lsGet(chave, padrao) {
  try { const v = localStorage.getItem(chave); return v ? JSON.parse(v) : padrao; } catch { return padrao; }
}
export function lsSet(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* ignora */ }
}

export const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// ---------- Ordenação de tabelas (clique no cabeçalho: crescente → decrescente)
function comparar(a, b) {
  const va = a ?? null, vb = b ?? null;
  if (va === null && vb === null) return 0;
  if (va === null) return 1;
  if (vb === null) return -1;
  if (va instanceof Date || vb instanceof Date) return +new Date(va) - +new Date(vb);
  if (typeof va === 'number' && typeof vb === 'number') return va - vb;
  const na = Number(va), nb = Number(vb);
  if (va !== '' && vb !== '' && !isNaN(na) && !isNaN(nb) && typeof va !== 'boolean') return na - nb;
  const da = /^\d{4}-\d{2}-\d{2}/.test(va) ? Date.parse(va) : NaN;
  const db = /^\d{4}-\d{2}-\d{2}/.test(vb) ? Date.parse(vb) : NaN;
  if (!isNaN(da) && !isNaN(db)) return da - db;
  return String(va).localeCompare(String(vb), 'pt-BR', { sensitivity: 'base', numeric: true });
}

export function ordenarLista(lista, ordem) {
  if (!ordem?.campo) return lista;
  const pegar = typeof ordem.campo === 'function' ? ordem.campo : (x) => x?.[ordem.campo];
  return [...lista].sort((x, y) => {
    const c = comparar(pegar(x), pegar(y));
    return ordem.desc ? -c : c;
  });
}

export function useOrdenacao(lista, inicial = { campo: null, desc: false }) {
  const [ordem, setOrdem] = useState(inicial);
  const ordenadas = useMemo(() => ordenarLista(lista, ordem), [lista, ordem]);
  const alternar = (campo) => setOrdem((o) => (o.campo === campo ? { campo, desc: !o.desc } : { campo, desc: false }));
  return { ordenadas, ordem, alternar };
}

// ---------- Pivô ano x mês igual ao script (anos do 1º com venda até o atual)
export function montarPivot(linhas, abater) {
  const anoAtual = new Date().getFullYear();
  const anosVenda = linhas.filter((l) => l.TemVenda).map((l) => Number(l.Ano));
  const anoMin = anosVenda.length ? Math.min(...anosVenda) : anoAtual;
  const anos = [];
  for (let a = anoMin; a <= anoAtual; a++) anos.push({ ano: a, meses: Array(12).fill(0), brutas: Array(12).fill(0), devol: Array(12).fill(0), total: 0 });
  for (const l of linhas) {
    const item = anos.find((x) => x.ano === Number(l.Ano));
    if (!item) continue;
    const m = Number(l.Mes) - 1;
    const vendas = Number(l.Vendas) || 0;
    const ret = Number(l.Retornos) || 0;
    item.brutas[m] += vendas;
    item.devol[m] += ret;
    item.meses[m] += abater ? vendas - ret : vendas;
  }
  anos.forEach((a) => {
    a.total = a.meses.reduce((s, v) => s + v, 0);
    a.meses.forEach((v, i) => { a[`m${i}`] = v; });
  });
  const totalMeses = Array(12).fill(0).map((_, i) => anos.reduce((s, a) => s + a.meses[i], 0));
  return { anos, totalMeses, totalGeral: totalMeses.reduce((s, v) => s + v, 0) };
}
