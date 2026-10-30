// Exportação do painel para Excel e PDF
const fs = require('fs');
const { status, ROTULO, legenda, faixas } = require('./status');

const COR = {
  titulo: 'FF0F3D3A', faixa: 'FF0F766E', cab: 'FFE6F2F1',
  verde: ['FFC6EFCE', 'FF006100'], amarelo: ['FFFFEB9C', 'FF9C6500'], vermelho: ['FFFFC7CE', 'FF9C0006'],
  ok: ['FFC6EFCE', 'FF006100'], atencao: ['FFFFEB9C', 'FF9C6500'], critico: ['FFFFC7CE', 'FF9C0006']
};
const FMT = { int: '#,##0', pct: '0.00%', dec: '0.00', moeda: '"R$" #,##0.00' };

function fill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function fmtData(s) {
  return s ? s.split('-').reverse().join('/') : '';
}

async function excel(arquivo, { resultado, metas, empresa }) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Indicador Logístico';
  const ws = wb.addWorksheet('Painel', { views: [{ showGridLines: false }], pageSetup: { orientation: 'landscape', fitToPage: true } });
  const cols = resultado.colunas;
  const nCols = cols.length + 4;
  const f = resultado.filtros || {};

  ws.getColumn(1).width = 34;
  ws.getColumn(2).width = 7;
  cols.forEach((_, i) => { ws.getColumn(3 + i).width = 12; });
  ws.getColumn(cols.length + 3).width = 15;
  ws.getColumn(cols.length + 4).width = 16;

  ws.mergeCells(1, 1, 1, nCols);
  ws.getCell(1, 1).value = empresa || '';
  ws.getCell(1, 1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  ws.getCell(1, 1).fill = fill(COR.titulo);
  ws.mergeCells(2, 1, 2, nCols);
  ws.getCell(2, 1).value = 'LOGÍSTICA - Painel de Indicadores';
  ws.getCell(2, 1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  ws.getCell(2, 1).fill = fill(COR.faixa);
  ws.getRow(3).values = ['Período:', `${fmtData(f.ini)} a ${fmtData(f.fim)}`, '', '', 'Conexão:', f.selecaoRotulo || '', '', '', 'Custo:', f.centroRotulo || ''];
  ws.getRow(4).values = ['Modo:', resultado.modo === 'planilha' ? 'Modo planilha (igual ao Excel)' : 'Padrão (corrigido)', '', '', 'Gerado em:', new Date(resultado.geradoEm).toLocaleString('pt-BR')];
  [3, 4].forEach((r) => { ws.getRow(r).font = { size: 10 }; });

  let r = 6;
  for (const bloco of resultado.blocos) {
    ws.mergeCells(r, 1, r, nCols);
    ws.getCell(r, 1).value = bloco.titulo;
    ws.getCell(r, 1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getCell(r, 1).fill = fill(COR.faixa);
    r++;
    const cab = ['Indicador', 'Unid.', ...cols.map((c) => c.label), 'Total', 'Status'];
    ws.getRow(r).values = cab;
    ws.getRow(r).font = { bold: true };
    for (let c = 1; c <= nCols; c++) {
      ws.getCell(r, c).fill = fill(COR.cab);
      ws.getCell(r, c).alignment = { horizontal: c <= 2 ? 'left' : 'center' };
    }
    r++;
    for (const l of bloco.linhas) {
      ws.getCell(r, 1).value = l.nome;
      ws.getCell(r, 2).value = l.unid;
      const meta = l.indicador ? metas[l.indicador] : null;
      cols.forEach((c, i) => {
        const cell = ws.getCell(r, 3 + i);
        cell.value = l.valores[c.key] ?? null;
        cell.numFmt = FMT[l.tipo];
        const cor = l.cores?.[c.key] || (meta ? status(l.valores[c.key], meta) : null);
        if (cor && COR[cor]) {
          cell.fill = fill(COR[cor][0]);
          cell.font = { color: { argb: COR[cor][1] } };
        }
      });
      const tc = ws.getCell(r, cols.length + 3);
      tc.value = l.total ?? null;
      tc.numFmt = FMT[l.tipo];
      tc.font = { bold: true };
      if (meta) {
        const st = status(l.total, meta);
        const sc = ws.getCell(r, cols.length + 4);
        sc.value = st ? ROTULO[st] : '—';
        if (st) { sc.fill = fill(COR[st][0]); sc.font = { bold: true, color: { argb: COR[st][1] } }; }
        sc.alignment = { horizontal: 'center' };
        const leg = legenda(meta, l.tipo);
        if (leg) sc.note = { texts: [{ text: leg }] };
        ws.getRow(r).getCell(1).font = { bold: true };
      }
      r++;
    }
    r++;
  }

  if (resultado.detalhes?.pedidos?.length) {
    const wp = wb.addWorksheet('Pedidos');
    wp.columns = [
      { header: 'Conexão', key: 'conexao', width: 14 }, { header: 'Pedido', key: 'numero', width: 10 },
      { header: 'Data', key: 'data', width: 11 }, { header: 'Carga', key: 'carga', width: 8 },
      { header: 'Cliente', key: 'cliente', width: 9 }, { header: 'Inscrição', key: 'nroInsc', width: 18 },
      { header: 'Situação carga', key: 'situacao', width: 9 }, { header: 'Carregado', key: 'carregada', width: 10 },
      { header: 'Realizado', key: 'realizada', width: 10 }, { header: 'Devolvido', key: 'devolvido', width: 10 },
      { header: 'Pré-venda', key: 'dataPrevenda', width: 11 }, { header: 'Acerto', key: 'dataAcerto', width: 11 },
      { header: 'Dias', key: 'dias', width: 6 }, { header: 'Retornos', key: 'retornos', width: 40 }
    ];
    for (const p of resultado.detalhes.pedidos) {
      wp.addRow({
        ...p, data: fmtData(p.data), dataPrevenda: fmtData(p.dataPrevenda), dataAcerto: fmtData(p.dataAcerto),
        carregada: p.carregada ? 'Sim' : 'Não', realizada: p.realizada ? 'Sim' : 'Não', devolvido: p.devolvido ? 'Sim' : 'Não'
      });
    }
    wp.getRow(1).font = { bold: true };
    wp.autoFilter = { from: 'A1', to: 'N1' };
    wp.views = [{ state: 'frozen', ySplit: 1 }];
  }
  if (resultado.detalhes?.custos?.length) {
    const wc = wb.addWorksheet('Custos');
    wc.columns = [
      { header: 'Conexão', key: 'conexao', width: 14 }, { header: 'Data entrada', key: 'data', width: 12 },
      { header: 'Código', key: 'codigo', width: 10 }, { header: 'Nº NF', key: 'nroNF', width: 12 },
      { header: 'Valor', key: 'valor', width: 14, style: { numFmt: FMT.moeda } }
    ];
    resultado.detalhes.custos.forEach((c) => wc.addRow({ ...c, data: fmtData(c.data) }));
    wc.getRow(1).font = { bold: true };
  }

  await wb.xlsx.writeFile(arquivo);
}

// ------------------------------- PDF -------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function fmt(v, tipo) {
  if (v === null || v === undefined) return '—';
  if (tipo === 'pct') return (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  if (tipo === 'dec') return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (tipo === 'moeda') return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return Math.round(v).toLocaleString('pt-BR');
}

function htmlPdf({ resultado, metas, empresa }) {
  const cols = resultado.colunas;
  const f = resultado.filtros || {};
  const bg = { verde: '#c6efce', amarelo: '#ffeb9c', vermelho: '#ffc7ce', ok: '#c6efce', atencao: '#ffeb9c', critico: '#ffc7ce' };
  const fg = { verde: '#006100', amarelo: '#9c6500', vermelho: '#9c0006', ok: '#006100', atencao: '#9c6500', critico: '#9c0006' };
  let blocos = '';
  let legendas = '';
  for (const b of resultado.blocos) {
    let linhas = '';
    for (const l of b.linhas) {
      const meta = l.indicador ? metas[l.indicador] : null;
      const tds = cols.map((c) => {
        const cor = l.cores?.[c.key] || (meta ? status(l.valores[c.key], meta) : null);
        const st = cor ? `style="background:${bg[cor]};color:${fg[cor]}"` : '';
        return `<td ${st}>${fmt(l.valores[c.key], l.tipo)}</td>`;
      }).join('');
      const s = meta ? status(l.total, meta) : null;
      const stCel = meta ? `<td class="st" ${s ? `style="background:${bg[s]};color:${fg[s]}"` : ''}>${s ? ROTULO[s] : '—'}</td>` : '<td></td>';
      linhas += `<tr class="${l.indicador ? 'ind' : ''}"><th>${esc(l.nome)}</th><td class="u">${esc(l.unid)}</td>${tds}<td class="tot">${fmt(l.total, l.tipo)}</td>${stCel}</tr>`;
    }
    const pl = b.linhas.find((x) => x.indicador);
    const m = pl ? metas[pl.indicador] : null;
    if (m && m.ativo) {
      legendas += `<div class="leg"><b>${esc(pl.nome)}</b>${['ok', 'atencao', 'critico'].map((k) =>
        `<p><span style="background:${bg[k]};color:${fg[k]}">${ROTULO[k]}</span> ${esc(faixas(m, pl.tipo)[k])} — ${esc(m.textos?.[k] || '')}</p>`).join('')}</div>`;
    }
    blocos += `<h2>${esc(b.titulo)}</h2><table><thead><tr><th>Indicador</th><th>Unid.</th>${cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}<th>Total</th><th>Status</th></tr></thead><tbody>${linhas}</tbody></table>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:'Segoe UI',Arial,sans-serif;color:#13232f;margin:0;font-size:9.5px}
    header{background:#0f3d3a;color:#fff;padding:12px 16px}
    header h1{margin:0;font-size:17px} header p{margin:3px 0 0;opacity:.85;font-size:10px}
    .f{padding:8px 16px;color:#40525e;font-size:10px}
    main{padding:0 16px}
    h2{font-size:11px;margin:12px 0 4px;color:#0f766e;text-transform:uppercase;letter-spacing:.04em}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #d5e0e3;padding:3px 4px;text-align:right;white-space:nowrap}
    thead th{background:#e6f2f1;text-align:center}
    tbody th{text-align:left;font-weight:500}
    .legs{display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;page-break-inside:avoid}
    .leg b{display:block;margin-bottom:2px} .leg p{margin:2px 0;color:#40525e}
    .leg span{display:inline-block;min-width:82px;text-align:center;font-weight:700;border-radius:3px;padding:0 4px;margin-right:4px}
    tr.ind th{font-weight:700} td.u{text-align:center;color:#5d6d78} td.tot{font-weight:700} td.st{text-align:center;font-weight:700}
  </style></head><body>
    <header><h1>${esc(empresa)}</h1><p>LOGÍSTICA — Painel de Indicadores</p></header>
    <div class="f">Período: <b>${fmtData(f.ini)} a ${fmtData(f.fim)}</b> &nbsp;·&nbsp; Conexão: <b>${esc(f.selecaoRotulo)}</b> &nbsp;·&nbsp; Custo: <b>${esc(f.centroRotulo)}</b> &nbsp;·&nbsp; Modo: <b>${resultado.modo === 'planilha' ? 'Planilha' : 'Padrão'}</b> &nbsp;·&nbsp; Gerado em ${new Date(resultado.geradoEm).toLocaleString('pt-BR')}</div>
    <main>${blocos}${legendas ? `<h2>Legenda do status</h2><div class="legs">${legendas}</div>` : ''}</main></body></html>`;
}

async function pdf(arquivo, dados) {
  const { BrowserWindow } = require('electron');
  const win = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlPdf(dados)));
    const buf = await win.webContents.printToPDF({ landscape: true, pageSize: 'A4', printBackground: true, margins: { marginType: 'custom', top: 0.3, bottom: 0.3, left: 0.3, right: 0.3 } });
    fs.writeFileSync(arquivo, buf);
  } finally {
    win.destroy();
  }
}

module.exports = { excel, pdf, htmlPdf };
