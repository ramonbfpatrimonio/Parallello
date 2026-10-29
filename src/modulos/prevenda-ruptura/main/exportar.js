const ExcelJS = require('exceljs');

const fmtData = (iso) => (iso ? new Date(iso) : null);
const cxun = (cx, un) => `${cx}/${un}`;

const LAYOUTS = {
  rupturas: {
    colunas: [
      ['CODIGO', 9], ['CLIENTE', 32], ['N PREVENDA', 11], ['PV REF.', 24], ['N PED CLIENTE', 15], ['PRODUTO', 10],
      ['DESCRICAO', 42], ['FABRICANTE', 16], ['UND', 8], ['PRE-VENDA', 11], ['PEDIDO', 11], ['FALTA', 11],
      ['ESTOQUE', 11], ['COMPRA', 11], ['DATA PV', 12], ['EQUIPE', 14],
    ],
    linha: (l) => [
      l.codCliente, l.nomeCliente, l.numero,
      `${l.posicao}ª RUPTURA${l.novaPV ? ' - PV ' + l.novaPV : ''}`,
      l.nroPedClie, l.produto, l.descricao, l.fabricante, `${l.unid}/${l.upc}`,
      cxun(l.pvCx, l.pvUn), cxun(l.pdCx, l.pdUn), cxun(l.faltaCx, l.faltaUn), cxun(l.estoqueCx, l.estoqueUn),
      cxun(l.compraCx, l.compraUn), fmtData(l.dataPV), l.nomeEquipe,
    ],
    cor: (l) => (l.atendida ? 'FF008000' : null),
  },
  clientes: {
    colunas: [['CODIGO', 10], ['CLIENTE', 40], ['QTD N PED CLIENTE', 18], ['ITENS PENDENTES', 16], ['PRIMEIRA RUPTURA', 18], ['ULTIMA RUPTURA', 18]],
    linha: (c) => [c.codCliente, c.nomeCliente, c.qtdPedidos, c.itensPendentes, fmtData(c.primeira), fmtData(c.ultima)],
  },
  historico: {
    colunas: [['DATA/HORA', 18], ['PV GERADA', 12], ['CLIENTE', 36], ['N PED CLIENTE', 15], ['EQUIPE', 14], ['ITENS', 8], ['PVs ORIGEM', 24], ['USUÁRIO', 14], ['ESTAÇÃO', 16]],
    linha: (h) => [fmtData(h.quando), `${h.numero}/${h.ano}`, `${h.codCliente} - ${h.nomeCliente}`, h.nroPedClie, h.nomeEquipe, h.qtdItens, (h.pvOrigens || []).join(', '), h.usuario, h.estacao],
  },
};

async function exportarExcel(arquivo, tipo, linhas, titulo) {
  const lay = LAYOUTS[tipo];
  if (!lay) throw new Error('Tipo de exportação inválido.');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Pré-Venda de Ruptura';
  const ws = wb.addWorksheet(tipo === 'clientes' ? 'Clientes com Rupturas' : tipo === 'historico' ? 'Histórico' : 'Rupturas', {
    views: [{ state: 'frozen', ySplit: 3 }],
  });
  ws.mergeCells(1, 1, 1, lay.colunas.length);
  ws.getCell(1, 1).value = titulo || '';
  ws.getCell(1, 1).font = { bold: true, size: 12 };
  const cab = ws.getRow(3);
  lay.colunas.forEach(([nome, larg], i) => {
    ws.getColumn(i + 1).width = larg;
    const cel = cab.getCell(i + 1);
    cel.value = nome;
    cel.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F4B3A' } };
    cel.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  linhas.forEach((l, idx) => {
    const row = ws.getRow(4 + idx);
    lay.linha(l).forEach((v, i) => {
      const cel = row.getCell(i + 1);
      cel.value = v;
      if (v instanceof Date) cel.numFmt = tipo === 'historico' ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy';
    });
    const cor = lay.cor && lay.cor(l);
    if (cor) row.eachCell((c) => { c.font = { color: { argb: cor } }; });
    if (tipo === 'rupturas' && !l.atendida) {
      row.getCell(12).font = { color: { argb: 'FFFF0000' }, bold: true };
      row.getCell(13).font = { color: { argb: l.situacaoEstoque === 'zerado' ? 'FFFF0000' : l.situacaoEstoque === 'parcial' ? 'FF0070C0' : 'FF00B050' } };
    }
  });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + linhas.length, column: lay.colunas.length } };
  await wb.xlsx.writeFile(arquivo);
}

module.exports = { exportarExcel };
