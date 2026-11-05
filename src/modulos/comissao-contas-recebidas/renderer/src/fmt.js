const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dec2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dec3 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

export const moeda = (v) => brl.format(Number(v) || 0);
export const pct = (v) => (v === null || v === undefined || v === '' ? '—' : dec2.format(Number(v) || 0) + ' %');
export const qtd = (v) => dec3.format(Number(v) || 0);
export const num2 = (v) => dec2.format(Number(v) || 0);

export function dataBR(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function dataHoraBR(s) {
  if (!s) return '';
  const [d, h] = String(s).replace('T', ' ').split(' ');
  return `${dataBR(d)} ${String(h || '').slice(0, 5)}`;
}

const pad = (n) => String(n).padStart(2, '0');
export const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function periodoPadrao() {
  const h = new Date();
  return {
    baixaInicio: isoLocal(new Date(h.getFullYear(), h.getMonth(), 1)),
    baixaFim: isoLocal(new Date(h.getFullYear(), h.getMonth() + 1, 0)),
    vendaDesde: isoLocal(new Date(h.getFullYear(), h.getMonth() - 1, 1))
  };
}

export function parseNumero(v) {
  if (v === null || v === undefined) return 0;
  let s = String(v).trim().replace('%', '').trim();
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isFinite(n) ? n : NaN;
}

export const paraCampo = (n) => (n === null || n === undefined ? '' : dec2.format(Number(n) || 0).replace(/\./g, ''));
