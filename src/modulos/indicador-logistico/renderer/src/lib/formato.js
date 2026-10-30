export function fmt(v, tipo) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (tipo === 'pct') return (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  if (tipo === 'dec') return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (tipo === 'moeda') return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return Math.round(v).toLocaleString('pt-BR');
}

export const fmtData = (s) => (s ? s.split('-').reverse().join('/') : '');

export const fmtDataHora = (iso) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';

export function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
