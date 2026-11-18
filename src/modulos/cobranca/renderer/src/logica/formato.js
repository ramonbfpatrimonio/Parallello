// Formatação e datas. As datas do ERP chegam como texto 'AAAA-MM-DD'
// (o SQL já converte), assim não há deslocamento de fuso horário.

const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNumero = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function moeda(v) {
  return fmtMoeda.format(Number(v) || 0);
}

export function numero2(v) {
  return fmtNumero.format(Number(v) || 0);
}

export function moedaCurta(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(v) || 0);
}

export function inteiro(v) {
  return new Intl.NumberFormat('pt-BR').format(Math.round(Number(v) || 0));
}

export function percentual(v, casas = 2) {
  return `${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

export function arred2(v) {
  return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
}

// Data local de hoje em 'AAAA-MM-DD'
export function hojeISO(agora = new Date()) {
  const a = agora.getFullYear();
  const m = String(agora.getMonth() + 1).padStart(2, '0');
  const d = String(agora.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

function paraDiaUTC(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return Date.UTC(a, m - 1, d);
}

// Dias de 'de' até 'ate' (positivo se 'ate' for depois)
export function diasEntre(de, ate) {
  return Math.round((paraDiaUTC(ate) - paraDiaUTC(de)) / 86400000);
}

export function somarDias(iso, dias) {
  const t = new Date(paraDiaUTC(iso) + dias * 86400000);
  return t.toISOString().slice(0, 10);
}

export function dataBR(iso) {
  if (!iso) return '-';
  const s = String(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const [a, m, d] = s.split('-');
  return `${d}/${m}/${a}`;
}

export function dataHoraBR(valor) {
  if (!valor) return '-';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return String(valor);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// 'dd/mm/aaaa' ou 'ddmmaaaa' -> 'AAAA-MM-DD' (ou '' se inválida)
export function brParaISO(txt) {
  const so = String(txt || '').replace(/\D/g, '');
  let d, m, a;
  if (so.length === 8) { d = so.slice(0, 2); m = so.slice(2, 4); a = so.slice(4); }
  else if (so.length === 6) { d = so.slice(0, 2); m = so.slice(2, 4); a = `20${so.slice(4)}`; }
  else return '';
  const iso = `${a}-${m}-${d}`;
  const t = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso) return '';
  return iso;
}

export function soNumeros(txt) {
  return String(txt ?? '').replace(/\D/g, '');
}

// 'hhmm', 'hmm', 'hh' -> 'hh:mm' (ou '' se inválida)
export function normalizarHora(txt) {
  const so = soNumeros(txt);
  let h, m;
  if (so.length === 4) { h = so.slice(0, 2); m = so.slice(2); }
  else if (so.length === 3) { h = `0${so.slice(0, 1)}`; m = so.slice(1); }
  else if (so.length === 2 || so.length === 1) { h = so.padStart(2, '0'); m = '00'; }
  else return '';
  if (Number(h) > 23 || Number(m) > 59) return '';
  return `${h}:${m}`;
}

export function semAcento(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function codigoCliente(cod) {
  const t = String(cod ?? '').trim();
  return /^\d+$/.test(t) && t.length < 5 ? t.padStart(5, '0') : t;
}

// Telefone para o WhatsApp: só dígitos, sem zero inicial, com 55 na frente
export function telefoneWhatsApp(tel) {
  let n = soNumeros(tel);
  if (n.startsWith('0')) n = n.slice(1);
  if (!n) return '';
  if (!n.startsWith('55')) n = `55${n}`;
  return n.length >= 12 ? n : '';
}
