// Exportação do relatório para Excel (exceljs) e PDF (printToPDF do Electron)
const ExcelJS = require('exceljs');
const { BrowserWindow, app } = require('electron');
const fs = require('fs');
const path = require('path');

const AZUL = 'FF1F4E78';
const AZUL_CLARO = 'FFEBF1FA';
const MOEDA = '"R$" #,##0.00';

function dataBR(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

function rotuloFiltros(f) {
  return [
    `Baixa: ${dataBR(f.baixaInicio)} a ${dataBR(f.baixaFim)}`,
    `Vendas a prazo a partir de: ${dataBR(f.vendaDesde)}`,
    `Vendedor: ${f.vendedorRotulo || 'Todos'}`,
    `Conexão: ${f.conexaoNome || ''}`
  ].join('   |   ');
}

async function gerarExcel(res, { mostrarItens = true } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Comissão por Contas Recebidas';
  const ws = wb.addWorksheet('Comissões', { views: [{ state: 'frozen', ySplit: 4 }], properties: { outlineProperties: { summaryBelow: false } } });

  ws.mergeCells('A1:R1');
  ws.getCell('A1').value = 'PAINEL DE COMISSÕES';
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: AZUL } };
  ws.mergeCells('A2:R2');
  ws.getCell('A2').value = rotuloFiltros(res.filtros || {});
  ws.getCell('A2').font = { size: 10, color: { argb: 'FF555555' } };

  const cab = [
    'Tipo', 'Data Pedido', 'Pedido', 'Vencimento', 'Data Baixa', 'Cód. Cliente', 'Cliente', 'Documento',
    'Total Pedido', 'Valor Recebido', '% Comissão', 'Valor Comissão', 'Produto', 'Descrição', 'Quant.',
    'Valor Item', '% Fabr.', 'Comissão Item'
  ];
  const linhaCab = ws.getRow(4);
  linhaCab.values = cab;
  linhaCab.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    c.alignment = { vertical: 'middle' };
  });
  ws.autoFilter = { from: 'A4', to: 'R4' };

  const larguras = [9, 12, 11, 12, 12, 11, 38, 20, 14, 15, 11, 15, 26, 42, 9, 14, 9, 14];
  larguras.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  for (const col of [9, 10, 12, 16, 18]) ws.getColumn(col).numFmt = MOEDA;
  ws.getColumn(11).numFmt = '0.00 %';
  ws.getColumn(15).numFmt = '#,##0.00';
  ws.getColumn(17).numFmt = '0.00';

  const toDate = (iso) => (iso ? new Date(iso + 'T12:00:00') : null);

  for (const p of res.pedidos) {
    for (const pa of p.parcelas) {
      const r = ws.addRow([
        'Parcela', toDate(p.dataPedido), p.pedido, toDate(pa.vencimento), toDate(pa.dataBaixa), p.codCliente, p.nomeCliente,
        pa.documento, pa.totalPedido, pa.valorRecebido, pa.percComis === null ? null : pa.percComis / 100, pa.valorComissao
      ]);
      r.font = { bold: true };
      r.eachCell({ includeEmpty: true }, (c, n) => {
        if (n <= 18) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_CLARO } };
      });
      for (const col of [2, 4, 5]) r.getCell(col).numFmt = 'dd/mm/yyyy';
    }
    for (const it of p.itens) {
      const r = ws.addRow([
        'Item', null, p.pedido, null, null, null, null, null, null, null, null, null,
        it.produto, it.descProduto, it.quant, it.valorTotalItem, it.perFabr, it.valorComissaoItem
      ]);
      r.outlineLevel = 1;
      r.hidden = !mostrarItens;
    }
  }

  const t = res.totais;
  const rt = ws.addRow(['TOTAL', null, `${t.pedidos} pedidos`, null, null, null, `${t.parcelas} parcelas`, null, t.totalPedidos, t.recebido, null, t.comissao, null, null, null, null, null, t.comissaoItens]);
  rt.eachCell({ includeEmpty: true }, (c, n) => {
    if (n > 18) return;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  });

  // Resumo por fabricante
  const wf = wb.addWorksheet('Por fabricante');
  wf.columns = [
    { header: 'Fabricante', key: 'fabricante', width: 32 },
    { header: 'Pedidos', key: 'pedidos', width: 10 },
    { header: 'Itens', key: 'itens', width: 10 },
    { header: 'Quant.', key: 'quant', width: 12, style: { numFmt: '#,##0.00' } },
    { header: 'Valor vendido', key: 'valor', width: 16, style: { numFmt: MOEDA } },
    { header: 'Comissão', key: 'comissao', width: 16, style: { numFmt: MOEDA } }
  ];
  res.porFabricante.forEach((f) => wf.addRow(f));
  estilizarCab(wf);

  // Resumo por vendedor
  const wv = wb.addWorksheet('Por vendedor');
  wv.columns = [
    { header: 'Código', key: 'codigo', width: 10 },
    { header: 'Vendedor', key: 'nome', width: 30 },
    { header: 'Pedidos', key: 'pedidos', width: 10 },
    { header: 'Parcelas', key: 'parcelas', width: 10 },
    { header: 'Recebido', key: 'recebido', width: 16, style: { numFmt: MOEDA } },
    { header: 'Comissão', key: 'comissao', width: 16, style: { numFmt: MOEDA } }
  ];
  res.porVendedor.forEach((v) => wv.addRow(v));
  estilizarCab(wv);

  return wb.xlsx.writeBuffer();
}

function estilizarCab(ws) {
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  });
}

// ---------------- PDF ----------------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const moeda = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v) => (v === null || v === undefined ? '' : (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %');
const qtd = (v) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

function htmlRelatorio(res, { mostrarItens }) {
  const t = res.totais;
  let linhas = '';
  for (const p of res.pedidos) {
    for (const pa of p.parcelas) {
      linhas += `<tr class="parc"><td>${esc(p.pedido)}</td><td>${dataBR(p.dataPedido)}</td><td>${esc(p.codCliente)} - ${esc(p.nomeCliente)}</td><td>${esc(pa.documento)}</td><td>${dataBR(pa.vencimento)}</td><td>${dataBR(pa.dataBaixa)}</td><td class="n">${moeda(pa.totalPedido)}</td><td class="n">${moeda(pa.valorRecebido)}</td><td class="n">${pct(pa.percComis)}</td><td class="n">${moeda(pa.valorComissao)}</td></tr>`;
    }
    if (mostrarItens && p.itens.length) {
      linhas += `<tr class="itens"><td></td><td colspan="9"><table class="sub"><thead><tr><th>Produto</th><th>Descrição</th><th class="n">Quant.</th><th class="n">Valor</th><th class="n">% Fabr.</th><th class="n">Comissão</th></tr></thead><tbody>`;
      for (const i of p.itens)
        linhas += `<tr><td>${esc(i.produto)}</td><td>${esc(i.descProduto)}</td><td class="n">${qtd(i.quant)}</td><td class="n">${moeda(i.valorTotalItem)}</td><td class="n">${pct(i.perFabr)}</td><td class="n">${moeda(i.valorComissaoItem)}</td></tr>`;
      linhas += `</tbody></table></td></tr>`;
    }
  }
  const fab = res.porFabricante
    .map((f) => `<tr><td>${esc(f.fabricante)}</td><td class="n">${f.pedidos}</td><td class="n">${moeda(f.valor)}</td><td class="n">${moeda(f.comissao)}</td></tr>`)
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} body{font-family:'Segoe UI',Arial,sans-serif;font-size:9.5px;color:#1d2433;margin:0}
  h1{font-size:16px;margin:0 0 2px;color:#1f4e78} .f{color:#555;margin-bottom:10px}
  .k{display:flex;gap:8px;margin-bottom:10px} .k div{flex:1;border:1px solid #d8dee9;border-radius:6px;padding:6px 8px}
  .k b{display:block;font-size:13px;color:#1f4e78} table{width:100%;border-collapse:collapse}
  th{background:#1f4e78;color:#fff;text-align:left;padding:4px 5px;font-weight:600} td{padding:3px 5px;border-bottom:1px solid #e6e9ef}
  .n{text-align:right;white-space:nowrap} tr.parc td{background:#ebf1fa;font-weight:600}
  table.sub th{background:#eef1f6;color:#333} table.sub td{border-bottom:1px dotted #e3e6ec}
  tfoot td{background:#1f4e78;color:#fff;font-weight:700} h2{font-size:12px;color:#1f4e78;margin:16px 0 6px}
  thead{display:table-header-group} tr{page-break-inside:avoid}
  </style></head><body>
  <h1>Comissão por Contas Recebidas</h1>
  <div class="f">${esc(rotuloFiltros(res.filtros || {}))}</div>
  <div class="k"><div>Pedidos<b>${t.pedidos}</b></div><div>Parcelas<b>${t.parcelas}</b></div><div>Total recebido<b>${moeda(t.recebido)}</b></div><div>Comissão<b>${moeda(t.comissao)}</b></div></div>
  <table><thead><tr><th>Pedido</th><th>Data</th><th>Cliente</th><th>Documento</th><th>Venc.</th><th>Baixa</th><th class="n">Total pedido</th><th class="n">Recebido</th><th class="n">% Com.</th><th class="n">Comissão</th></tr></thead>
  <tbody>${linhas}</tbody>
  <tfoot><tr><td colspan="6">TOTAL — ${t.pedidos} pedidos / ${t.parcelas} parcelas</td><td class="n">${moeda(t.totalPedidos)}</td><td class="n">${moeda(t.recebido)}</td><td></td><td class="n">${moeda(t.comissao)}</td></tr></tfoot></table>
  ${fab ? `<h2>Resumo por fabricante</h2><table><thead><tr><th>Fabricante</th><th class="n">Pedidos</th><th class="n">Valor vendido</th><th class="n">Comissão (itens)</th></tr></thead><tbody>${fab}</tbody></table>` : ''}
  </body></html>`;
}

async function gerarPdf(res, opts = {}) {
  const tmp = path.join(app.getPath('temp'), `comissao-relatorio-${Date.now()}.html`);
  fs.writeFileSync(tmp, htmlRelatorio(res, opts), 'utf8');
  const win = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
  try {
    await win.loadFile(tmp);
    return await win.webContents.printToPDF({
      landscape: true,
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.4, bottom: 0.4, left: 0.35, right: 0.35 },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="font-size:8px;width:100%;text-align:right;padding-right:24px;color:#777">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>'
    });
  } finally {
    win.destroy();
    fs.unlink(tmp, () => {});
  }
}

module.exports = { gerarExcel, gerarPdf, htmlRelatorio };
