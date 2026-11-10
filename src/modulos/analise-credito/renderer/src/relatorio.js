// Monta o HTML dos relatórios (PDF e impressão).
import { fmtMoeda, fmtNum, fmtData, fmtDataHora } from './util.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function formatar(v, tipo) {
  switch (tipo) {
    case 'moeda': return fmtMoeda(v);
    case 'data': return fmtData(v);
    case 'datahora': return fmtDataHora(v);
    case 'decimal': return fmtNum(v, 2);
    case 'decimal1': return fmtNum(v, 1);
    case 'num': return fmtNum(v);
    case 'pct': return `${fmtNum(v, 1)}%`;
    default: return v === null || v === undefined || v === '' ? '—' : String(v);
  }
}

const NUMERICOS = new Set(['moeda', 'decimal', 'decimal1', 'num', 'pct']);

function tabela(b) {
  const cab = b.colunas.map((c) => `<th class="${NUMERICOS.has(c.tipo) ? 'n' : ''}">${esc(c.titulo)}</th>`).join('');
  const corpo = b.linhas.map((l) =>
    `<tr>${b.colunas.map((c) => {
      const v = typeof c.valor === 'function' ? c.valor(l) : l[c.campo];
      return `<td class="${NUMERICOS.has(c.tipo) ? 'n' : ''}">${esc(formatar(v, c.tipo))}</td>`;
    }).join('')}</tr>`).join('');
  const rodape = b.rodape
    ? `<tfoot><tr>${b.colunas.map((c) => {
        const v = b.rodape[c.campo];
        return `<td class="${NUMERICOS.has(c.tipo) ? 'n' : ''}">${v === undefined ? '' : esc(typeof v === 'string' && !NUMERICOS.has(c.tipo) ? v : formatar(v, c.tipo))}</td>`;
      }).join('')}</tr></tfoot>`
    : '';
  return `${b.titulo ? `<h2>${esc(b.titulo)}</h2>` : ''}
    <table class="tab"><thead><tr>${cab}</tr></thead><tbody>${corpo || `<tr><td colspan="${b.colunas.length}" class="vazio">Sem registros</td></tr>`}</tbody>${rodape}</table>`;
}

function kv(b) {
  return `<div class="kv">${b.titulo ? `<h3>${esc(b.titulo)}</h3>` : ''}
    ${b.itens.map(([k, v, destaque]) => `<div class="kv-l"><span>${esc(k)}</span><b class="${destaque ? 'dest' : ''}">${esc(v)}</b></div>`).join('')}</div>`;
}

function bloco(b) {
  if (b.tipo === 'tabela') return tabela(b);
  if (b.tipo === 'kv') return kv(b);
  if (b.tipo === 'grade') return `<div class="grade" style="grid-template-columns:repeat(${b.colunas || b.blocos.length},1fr)">${b.blocos.map(bloco).join('')}</div>`;
  if (b.tipo === 'destaque') {
    return `<div class="destaque"><div><span>${esc(b.rotulo)}</span><strong>${esc(b.valor)}</strong></div>
      <div class="perfil">${esc(b.perfil || '')}</div><p>${esc(b.texto || '')}</p></div>`;
  }
  if (b.tipo === 'html') return b.html;
  return '';
}

export function montarRelatorio({ titulo, subtitulo, empresa, filtros = [], blocos = [], paisagem = true }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
<style>
  @page { size: A4 ${paisagem ? 'landscape' : 'portrait'}; margin: 10mm 10mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1b2430; font-size: 9.5px; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1e3a5f; padding-bottom: 6px; margin-bottom: 8px; }
  header h1 { font-size: 16px; margin: 0; color: #1e3a5f; }
  header .sub { color: #5c6878; font-size: 10px; margin-top: 2px; }
  header .dir { text-align: right; color: #5c6878; font-size: 9px; line-height: 1.5; }
  header .emp { color: #1b2430; font-weight: 700; font-size: 10.5px; }
  .filtros { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; }
  .filtros span { background: #eef2f7; border-radius: 10px; padding: 2px 8px; color: #334155; }
  h2 { font-size: 11.5px; margin: 12px 0 5px; color: #1e3a5f; }
  h3 { font-size: 10.5px; margin: 0 0 5px; color: #1e3a5f; }
  .tab { width: 100%; border-collapse: collapse; }
  .tab th { background: #1e3a5f; color: #fff; font-weight: 600; text-align: left; padding: 4px 5px; font-size: 8.5px; }
  .tab td { padding: 3px 5px; border-bottom: 1px solid #e3e8ef; }
  .tab tbody tr:nth-child(even) td { background: #f7f9fc; }
  .tab .n { text-align: right; white-space: nowrap; }
  .tab tfoot td { font-weight: 700; background: #eef2f7; border-top: 1px solid #1e3a5f; }
  .tab tr { page-break-inside: avoid; }
  .tab thead { display: table-header-group; }
  .vazio { text-align: center; color: #8a94a3; padding: 12px; }
  .grade { display: grid; gap: 10px; margin-bottom: 6px; }
  .kv { border: 1px solid #e3e8ef; border-radius: 6px; padding: 7px 9px; }
  .kv-l { display: flex; justify-content: space-between; gap: 8px; padding: 2.5px 0; border-bottom: 1px dashed #eef1f5; }
  .kv-l span { color: #5c6878; }
  .kv-l b.dest { color: #1e3a5f; font-size: 11px; }
  .destaque { border: 1px solid #e3e8ef; border-radius: 6px; padding: 8px 10px; }
  .destaque span { color: #5c6878; }
  .destaque strong { display: block; font-size: 26px; color: #1e3a5f; }
  .destaque .perfil { font-weight: 700; font-size: 12px; margin-top: 2px; }
  .destaque p { margin: 4px 0 0; color: #334155; }
</style></head><body>
<header>
  <div><h1>${esc(titulo)}</h1>${subtitulo ? `<div class="sub">${esc(subtitulo)}</div>` : ''}</div>
  <div class="dir">${empresa ? `<div class="emp">${esc(empresa)}</div>` : ''}<div>Gerado em ${esc(fmtDataHora(new Date()))}</div></div>
</header>
${filtros.length ? `<div class="filtros">${filtros.map((f) => `<span>${esc(f)}</span>`).join('')}</div>` : ''}
${blocos.map(bloco).join('\n')}
</body></html>`;
}
