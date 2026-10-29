// Exporta qualquer tabela do sistema para Excel (.xlsx), com cabeçalho, cores,
// formatos de moeda/percentual e linhas agrupadas (botões +/- do Excel) para os níveis.
const ExcelJS = require('exceljs');

const AZUL = 'FF1F4E79';
const COR_TIPO = {
  grupo: 'FFDCE6F1',
  total: 'FFDCE6F1',
  subtotal: 'FFFFFFC8',
  destaque: null
};
const COR_FONTE = {
  verde: 'FF008000',
  vermelho: 'FFC00000',
  laranja: 'FFFF8C00',
  ouro: 'FFB8860B',
  prata: 'FF808080',
  bronze: 'FFCD7F32'
};
const FMT_MOEDA = '"R$" #,##0.00;"R$" -#,##0.00;"-"';
const FMT_INT = '#,##0';
const FMT_NUM = '#,##0.00';

const brl = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = (v) => Math.round(Number(v || 0)).toLocaleString('pt-BR');

// Converte as colunas do sistema em colunas do Excel (o tipo "mr" vira duas: Meta e Realizado)
function expandirColunas(colunas) {
  const out = [];
  for (const c of colunas) {
    if (c.tipo === 'mr') {
      out.push({ ...c, sub: 'meta', titulo: `${c.rotulo} — Meta`, fmt: FMT_INT });
      out.push({ ...c, sub: 'real', titulo: `${c.rotulo} — Realizado`, fmt: FMT_INT });
    } else {
      out.push({ ...c, titulo: c.rotulo });
    }
  }
  return out;
}

function valorCelula(col, v) {
  if (v === null || v === undefined || v === '') return { valor: null };
  switch (col.tipo) {
    case 'moeda': return { valor: Number(v), fmt: FMT_MOEDA };
    case 'inteiro': return { valor: Number(v), fmt: FMT_INT };
    case 'numero': return { valor: Number(v), fmt: FMT_NUM };
    case 'numero0': return { valor: Number(v), fmt: FMT_INT };
    case 'pct':
    case 'pctbarra': return { valor: Number(v), fmt: '0.00%' };
    case 'pct0': return { valor: Number(v), fmt: '0%' };
    case 'vv': return { valor: `${brl(v.valor)} - Vol / ${int(v.vol)}`, rich: [brl(v.valor) + ' - Vol / ', int(v.vol)] };
    case 'vq': return { valor: `${brl(v.valor)} - VOL/${int(v.vol)}` };
    case 'pvq': return { valor: `${int(v.qtd)} - VOL/${int(v.vol)}` };
    case 'rupt': return { valor: `${brl(v.valor)} - RUPT - ${int(v.cx)}/${int(v.frac)}` };
    case 'cxfrac': return { valor: `${int(v.cx)}/${int(v.frac)}` };
    case 'mr': return { valor: Number(v[col.sub] || 0), fmt: FMT_INT };
    default: return { valor: String(v) };
  }
}

function achatar(linhas, nivel = 0, out = []) {
  for (const l of linhas) {
    out.push({ ...l, nivel });
    if (l.filhos && l.filhos.length) achatar(l.filhos, nivel + 1, out);
  }
  return out;
}

function adicionarPlanilha(wb, nome, tabela, info) {
  const ws = wb.addWorksheet(nome.slice(0, 31).replace(/[\\/?*[\]:]/g, '-'), {
    views: [{ state: 'frozen', ySplit: 4 }],
    properties: { outlineLevelRow: 0 }
  });
  ws.properties.outlineProperties = { summaryBelow: false };
  const cols = expandirColunas(tabela.colunas);

  ws.mergeCells(1, 1, 1, Math.max(cols.length, 1));
  const t = ws.getCell(1, 1);
  t.value = (info.titulo || nome).toUpperCase();
  t.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  t.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 24;
  ws.getCell(2, 1).value = info.subtitulo || '';
  ws.getCell(2, 1).font = { italic: true, color: { argb: 'FF555555' } };

  const cab = ws.getRow(4);
  cols.forEach((c, i) => {
    const cel = cab.getCell(i + 1);
    cel.value = c.titulo;
    cel.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    cel.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  cab.height = 30;

  const larguras = cols.map((c) => Math.max(10, c.titulo.length + 2));
  let r = 5;
  for (const l of achatar(tabela.linhas)) {
    const row = ws.getRow(r);
    cols.forEach((c, i) => {
      let v = l.celulas[c.chave];
      if (i === 0 && l.nivel > 0 && v == null) v = undefined;
      const { valor, fmt, rich } = valorCelula(c, v);
      const cel = row.getCell(i + 1);
      if (rich) {
        cel.value = { richText: [{ text: rich[0] }, { text: rich[1], font: { bold: true } }] };
      } else {
        cel.value = valor;
      }
      if (fmt) cel.numFmt = fmt;
      if (c.alinhamento === 'centro') cel.alignment = { horizontal: 'center' };
      if (c.larga && l.nivel > 0 && l.tipo === 'filho') cel.alignment = { indent: 2 };
      const tam = valor == null ? 0 : String(rich ? rich.join('') : valor).length;
      if (tam + 2 > larguras[i]) larguras[i] = Math.min(tam + 2, 60);
      cel.border = { bottom: { style: 'hair', color: { argb: 'FFBBBBBB' } } };
    });
    const fundo = COR_TIPO[l.tipo];
    if (fundo) row.eachCell({ includeEmpty: true }, (cel) => {
      cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fundo } };
    });
    const negrito = ['grupo', 'total', 'subtotal', 'destaque'].includes(l.tipo) || l.negrito;
    const cor = COR_FONTE[l.cor];
    if (negrito || cor || l.tipo === 'filho') {
      row.eachCell({ includeEmpty: true }, (cel) => {
        cel.font = {
          ...(cel.font || {}),
          bold: !!negrito,
          size: l.tipo === 'filho' ? 9 : 11,
          color: cor ? { argb: cor } : undefined
        };
      });
    }
    if (l.nivel > 0) row.outlineLevel = Math.min(l.nivel, 7);
    r++;
  }
  ws.columns.forEach((col, i) => { col.width = larguras[i] || 12; });

  if (info.resumo && info.resumo.length) {
    r += 1;
    ws.getCell(r, 1).value = 'Resumo';
    ws.getCell(r, 1).font = { bold: true };
    r++;
    for (const item of info.resumo) {
      ws.getCell(r, 1).value = item.rotulo;
      const { valor, fmt } = valorCelula({ tipo: item.tipo }, item.valor);
      ws.getCell(r, 2).value = valor;
      if (fmt) ws.getCell(r, 2).numFmt = fmt;
      r++;
    }
  }
  return ws;
}

// planilhas: [{ nome, tabela:{colunas, linhas}, titulo, subtitulo, resumo }]
async function gerarExcel(caminho, planilhas) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Acompanhamento de Vendas';
  wb.created = new Date();
  for (const p of planilhas) adicionarPlanilha(wb, p.nome, p.tabela, p);
  await wb.xlsx.writeFile(caminho);
}

module.exports = { gerarExcel, expandirColunas, valorCelula };
