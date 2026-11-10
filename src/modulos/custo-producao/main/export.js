// Exportação para Excel e PDF
const fs = require('fs');
const os = require('os');
const path = require('path');
const ExcelJS = require('exceljs');
const { BrowserWindow } = require('electron');

const fmtData = d => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '');
const brl = (v, casas = 2) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function totais(ordens) {
  const centavos = ordens.reduce((s, o) => s + Math.round((o.custoTotal || 0) * 100), 0);
  const kg = ordens.reduce((s, o) => s + (o.quantKg || 0), 0);
  return { custo: centavos / 100, kg };
}

async function excel(caminho, { titulo, filtrosTexto, ordens, casas = 2, comData }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Parallello';
  const ws = wb.addWorksheet('Custo de Produção', { views: [{ state: 'frozen', ySplit: 4 }] });

  const cols = [
    { h: 'Ordem', k: 'ordem', w: 10 },
    ...(comData ? [{ h: 'Data', k: 'data', w: 12 }] : []),
    { h: 'Tipo', k: 'tipo', w: 18 },
    { h: 'Código', k: 'codigo', w: 12 },
    { h: 'Descrição', k: 'descricao', w: 48 },
    { h: 'Quant', k: 'quant', w: 11 },
    { h: 'Qtd (kg)', k: 'kg', w: 12 },
    { h: 'Custo Unit.', k: 'unit', w: 14 },
    { h: 'Custo Total', k: 'total', w: 16 },
    { h: '% Custo', k: 'pct', w: 10 }
  ];
  ws.columns = cols.map(c => ({ key: c.k, width: c.w }));
  const ultima = String.fromCharCode(64 + cols.length);

  ws.mergeCells(`A1:${ultima}1`);
  ws.getCell('A1').value = titulo;
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1F3A5F' } };
  ws.mergeCells(`A2:${ultima}2`);
  ws.getCell('A2').value = filtrosTexto;
  ws.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF666666' } };

  const cab = ws.getRow(4);
  cols.forEach((c, i) => { cab.getCell(i + 1).value = c.h; });
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cab.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } }; c.alignment = { vertical: 'middle' }; });

  const fmtUnit = `#,##0.${'0'.repeat(casas)}`;
  const aplicarFormatos = linha => {
    linha.getCell('kg').numFmt = '#,##0.000';
    linha.getCell('unit').numFmt = fmtUnit;
    linha.getCell('total').numFmt = '#,##0.00';
    linha.getCell('pct').numFmt = '0.00%';
  };

  for (const o of ordens) {
    const la = ws.addRow({
      ordem: o.numero, data: comData ? fmtData(o.data) : undefined, tipo: 'PRODUTO ACABADO',
      codigo: o.codigo, descricao: o.descricao, quant: o.quant, kg: o.quantKg,
      unit: o.custoKg, total: o.custoTotal, pct: 1
    });
    la.font = { bold: true };
    la.eachCell({ includeEmpty: true }, c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF6' } }; });
    aplicarFormatos(la);
    la.getCell('unit').note = 'Custo por kg produzido';

    for (const i of o.insumos) {
      const li = ws.addRow({
        ordem: o.numero, data: comData ? fmtData(o.data) : undefined, tipo: 'INSUMO',
        codigo: i.codigo, descricao: i.descricao, quant: i.quant, kg: i.quantKg,
        unit: i.custoUnit, total: i.custoTotal, pct: o.custoTotal > 0 ? i.custoTotal / o.custoTotal : 0
      });
      aplicarFormatos(li);
      if (i.semCusto) li.getCell('descricao').font = { color: { argb: 'FFC0392B' } };
    }
  }

  const t = totais(ordens);
  const lt = ws.addRow({ descricao: 'TOTAL GERAL', kg: t.kg, unit: t.kg > 0 ? t.custo / t.kg : 0, total: t.custo });
  lt.font = { bold: true };
  aplicarFormatos(lt);
  lt.getCell('pct').value = null;

  await wb.xlsx.writeFile(caminho);
}

function htmlRelatorio({ titulo, filtrosTexto, ordens, casas = 2, comData }) {
  const t = totais(ordens);
  const linhas = ordens.map(o => {
    const acabado = `<tr class="ac"><td>${esc(o.numero)}</td>${comData ? `<td>${fmtData(o.data)}</td>` : ''}<td>PRODUTO ACABADO</td><td>${esc(o.codigo)}</td><td>${esc(o.descricao)}</td><td class="n">${esc(o.quant)}</td><td class="n">${brl(o.quantKg, 3)}</td><td class="n">${brl(o.custoKg, casas)}</td><td class="n">${brl(o.custoTotal)}</td><td class="n">100,00%</td></tr>`;
    const ins = o.insumos.map(i => `<tr${i.semCusto ? ' class="sc"' : ''}><td></td>${comData ? '<td></td>' : ''}<td>INSUMO</td><td>${esc(i.codigo)}</td><td>${esc(i.descricao)}</td><td class="n">${esc(i.quant)}</td><td class="n">${brl(i.quantKg, 3)}</td><td class="n">${brl(i.custoUnit, casas)}</td><td class="n">${brl(i.custoTotal)}</td><td class="n">${o.custoTotal > 0 ? brl((i.custoTotal / o.custoTotal) * 100) : '0,00'}%</td></tr>`).join('');
    return acabado + ins;
  }).join('');

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
    body{font-family:Segoe UI,Arial,sans-serif;font-size:9px;color:#222;margin:0}
    h1{font-size:15px;margin:0 0 2px;color:#1f3a5f} .f{color:#666;margin-bottom:8px}
    table{width:100%;border-collapse:collapse} th{background:#1f3a5f;color:#fff;text-align:left;padding:4px}
    td{padding:3px 4px;border-bottom:1px solid #e3e6eb} .n{text-align:right;white-space:nowrap}
    tr.ac td{background:#e8eef6;font-weight:600} tr.sc td{color:#c0392b}
    tfoot td{font-weight:700;border-top:2px solid #1f3a5f} thead{display:table-header-group} tr{page-break-inside:avoid}
  </style></head><body>
  <h1>${esc(titulo)}</h1><div class="f">${esc(filtrosTexto)}</div>
  <table><thead><tr><th>Ordem</th>${comData ? '<th>Data</th>' : ''}<th>Tipo</th><th>Código</th><th>Descrição</th><th class="n">Quant</th><th class="n">Qtd (kg)</th><th class="n">Custo Unit.</th><th class="n">Custo Total</th><th class="n">% Custo</th></tr></thead>
  <tbody>${linhas}</tbody>
  <tfoot><tr><td colspan="${comData ? 6 : 5}">TOTAL GERAL — ${ordens.length} ordens</td><td class="n">${brl(t.kg, 3)}</td><td class="n">${brl(t.kg > 0 ? t.custo / t.kg : 0, casas)}</td><td class="n">${brl(t.custo)}</td><td></td></tr></tfoot>
  </table></body></html>`;
}

async function pdf(caminho, dados) {
  const tmp = path.join(os.tmpdir(), `custo-producao-${Date.now()}.html`);
  fs.writeFileSync(tmp, htmlRelatorio(dados), 'utf8');
  const janela = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
  try {
    await janela.loadFile(tmp);
    const buffer = await janela.webContents.printToPDF({
      landscape: true,
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="font-size:8px;width:100%;text-align:right;padding-right:20px;color:#888">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>'
    });
    fs.writeFileSync(caminho, buffer);
  } finally {
    janela.destroy();
    fs.rmSync(tmp, { force: true });
  }
}

// Impressão direta: abre o diálogo de impressão do Windows
async function imprimir(dados) {
  const tmp = path.join(os.tmpdir(), `custo-producao-impressao-${Date.now()}.html`);
  fs.writeFileSync(tmp, htmlRelatorio(dados), 'utf8');
  const janela = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
  try {
    await janela.loadFile(tmp);
    return await new Promise((resolve, reject) => {
      janela.webContents.print(
        { silent: false, printBackground: true, landscape: true, margins: { marginType: 'default' } },
        (ok, motivo) => {
          if (ok) resolve(true);
          else if (!motivo || /cancel/i.test(motivo)) resolve(false);
          else reject(new Error(`Não foi possível imprimir: ${motivo}`));
        }
      );
    });
  } finally {
    janela.destroy();
    fs.rmSync(tmp, { force: true });
  }
}

module.exports = { excel, pdf, imprimir };
