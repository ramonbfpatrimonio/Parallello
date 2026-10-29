const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const brl = (v) => 'R$ ' + nf2.format(Number(v || 0));
export const int = (v) => nf0.format(Math.round(Number(v || 0)));
export const dec = (v) => nf2.format(Number(v || 0));
export const pct = (v, casas = 2) => (Number(v || 0) * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + '%';
export const pct1 = (v) => nf1.format(Number(v || 0) * 100) + '%';

export function dataBR(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function hojeISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function iso(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export const ATALHOS = [
  { rotulo: 'Hoje', fn: () => { const h = hojeISO(); return [h, h]; } },
  { rotulo: 'Ontem', fn: () => { const d = new Date(); d.setDate(d.getDate() - 1); const s = iso(d); return [s, s]; } },
  { rotulo: 'Mês atual', fn: () => { const d = new Date(); return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))]; } },
  { rotulo: 'Mês anterior', fn: () => { const d = new Date(); return [iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), iso(new Date(d.getFullYear(), d.getMonth(), 0))]; } },
  { rotulo: 'Ano atual', fn: () => { const d = new Date(); return [iso(new Date(d.getFullYear(), 0, 1)), iso(new Date(d.getFullYear(), 11, 31))]; } }
];

export function mesAtual() {
  return hojeISO().slice(0, 7);
}

export function nomeMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  const s = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
