// Testes sem banco: valida a sintaxe T-SQL das consultas e a montagem dos relatórios
// com dados de exemplo simulando DUAS bases (como Hage.0001 e Hage.0002).
const assert = require('assert');
const { Parser } = require('node-sql-parser');
const fx = require('./fixtures.cjs');

const parser = new Parser();
const RELS = {
  acompanhamento: require('../main/reports/acompanhamento.cjs'),
  valorVolume: require('../main/reports/valorVolume.cjs'),
  ranking: require('../main/reports/ranking.cjs'),
  setor: require('../main/reports/setorComSemCompra.cjs'),
  ruptura: require('../main/reports/ruptura.cjs')
};
const db = require('../main/lib/db.cjs');
const S = require('../main/lib/sqlbase.cjs');

let ok = 0;
function teste(nome, fn) {
  try {
    fn();
    ok++;
    console.log('  ✓ ' + nome);
  } catch (err) {
    console.error('  ✗ ' + nome + '\n    ' + err.message);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------- SQL
console.log('\nSintaxe SQL (T-SQL)');
function checarSQL(nome, texto) {
  // o parser não conhece OUTER APPLY / GROUPING SETS: troca por formas equivalentes só para checar o resto
  let t = texto
    .replace(/OUTER APPLY \(([\s\S]*?)\) Ret/g, 'LEFT JOIN ($1) Ret ON 1=1')
    .replace(/GROUP BY GROUPING SETS \(\s*\(([\s\S]*?)\),\s*\(([\s\S]*?)\)\s*\)/g, 'GROUP BY $1');
  // checa parênteses balanceados no texto ORIGINAL
  let p = 0;
  for (const ch of texto) { if (ch === '(') p++; if (ch === ')') p--; assert(p >= 0, 'parêntese fechado a mais'); }
  assert.strictEqual(p, 0, 'parênteses desbalanceados');
  parser.astify(t, { database: 'TransactSQL' });
}
for (const [nomeRel, rel] of Object.entries(RELS)) {
  for (const deduzir of [false, true]) {
    const qs = rel.consultas(fx.empresa, { deduzirRetorno: deduzir });
    for (const [nq, texto] of Object.entries(qs)) {
      teste(`${nomeRel}.${nq} (deduzir=${deduzir})`, () => checarSQL(nq, texto));
    }
  }
}

// ---------------------------------------------------------------- servidor
console.log('\nConexão');
teste('interpreta "192.168.1.199,1433\\SQLEXPRESS"', () => {
  const r = db.interpretarServidor('192.168.1.199,1433\\SQLEXPRESS');
  assert.deepStrictEqual(r, { host: '192.168.1.199', porta: 1433, instancia: 'SQLEXPRESS' });
  const cfg = db.montarConfig({ servidor: '192.168.1.199,1433\\SQLEXPRESS', banco: 'Hage.0001.Log', usuario: 'u' });
  assert.strictEqual(cfg.port, 1433);
  assert.strictEqual(cfg.options.instanceName, undefined);
});
teste('instância sem porta usa instanceName', () => {
  const cfg = db.montarConfig({ servidor: 'SERVIDOR\\SQLEXPRESS', banco: 'x', usuario: 'u' });
  assert.strictEqual(cfg.options.instanceName, 'SQLEXPRESS');
  assert.strictEqual(cfg.server, 'SERVIDOR');
});

// ---------------------------------------------------------------- montagem
const achatar = (ls, out = []) => { ls.forEach((l) => { out.push(l); if (l.filhos) achatar(l.filhos, out); }); return out; };
const MANALAC = 'f:MANALAC';
const LEITE = 'f:LEITE MANAUS';

console.log('\nAcompanhamento diário');
teste('soma as duas bases e calcula total por linha e geral', () => {
  const r = RELS.acompanhamento.montar(fx.empresa, fx.porBase('acompanhamento'), {});
  const dados = r.linhas.filter((l) => l.tipo === 'dado');
  assert.strictEqual(dados.length, 2);
  const l1 = dados.find((l) => l.celulas.codigo === '1');
  assert.strictEqual(l1.celulas[LEITE], 100 + 50);
  assert.strictEqual(l1.celulas[MANALAC], 200);
  assert.strictEqual(l1.celulas.total, 350);
  const tot = r.linhas.find((l) => l.tipo === 'total');
  assert.strictEqual(tot.celulas.total, 350 + 80);
  assert.strictEqual(dados[0].celulas.codigo, '1', 'ordenado pelo código');
});
teste('fabricante fora da lista é ignorado (igual à planilha)', () => {
  const r = RELS.acompanhamento.montar(fx.empresa, fx.porBase('acompanhamento'), {});
  const tot = r.linhas.find((l) => l.tipo === 'total');
  assert.strictEqual(tot.celulas.total, 430);
});
teste('com "Outros" ligado, o fabricante fora da lista vai para Outros', () => {
  const emp = { ...fx.empresa, agruparOutros: true };
  const r = RELS.acompanhamento.montar(emp, fx.porBase('acompanhamento'), {});
  const tot = r.linhas.find((l) => l.tipo === 'total');
  assert.strictEqual(tot.celulas['f:__OUTROS__'], 999);
  assert.strictEqual(tot.celulas.total, 430 + 999);
});

console.log('\nValor / volume');
teste('valor e volume consolidados por equipe/setor/vendedor', () => {
  const r = RELS.valorVolume.montar(fx.empresa, fx.porBase('valorVolume'), { mostrarVolume: true });
  const l = r.linhas.find((x) => x.celulas.setor === '104');
  assert.deepStrictEqual(l.celulas[LEITE], { valor: 337.5 + 10, vol: 1 + 2 });
  const tot = r.linhas.find((x) => x.tipo === 'total');
  assert.strictEqual(tot.celulas.total.valor, 337.5 + 10 + 748.9);
});
teste('modo só valor descarta vendedor vazio', () => {
  const r = RELS.valorVolume.montar(fx.empresa, fx.porBase('valorVolume'), { mostrarVolume: false });
  assert(!r.linhas.find((x) => x.celulas.vendedor === '' && x.tipo === 'dado'));
  assert.strictEqual(typeof r.linhas[0].celulas.total, 'number');
});

console.log('\nRanking ABC');
teste('ordena por total, % acumulado e classes A/B/C', () => {
  const r = RELS.ranking.montar(fx.empresa, fx.porBase('ranking'), {});
  const dados = r.linhas.filter((l) => l.tipo === 'dado');
  assert.deepStrictEqual(dados.map((d) => d.celulas.cliente.slice(0, 5)), ['00001', '00002', '00003', '00004']);
  assert.deepStrictEqual(dados.map((d) => d.celulas.abc), ['A', 'B', 'B', 'C']);
  assert.strictEqual(dados[0].cor, 'ouro');
  assert(Math.abs(dados[3].celulas.pctAcum - 1) < 1e-9);
});
teste('cliente presente nas duas bases é somado e positivação conta dias distintos', () => {
  const r = RELS.ranking.montar(fx.empresa, fx.porBase('ranking'), {});
  const c1 = r.linhas.find((l) => l.celulas.cliente && l.celulas.cliente.startsWith('00001'));
  assert.strictEqual(c1.celulas.total, 700);
  assert.strictEqual(c1.celulas.qtdePV, 3);
  assert.strictEqual(c1.celulas.posit, 2, 'dia repetido nas duas bases conta uma vez');
  assert.strictEqual(c1.celulas.media, 700 / 3);
  assert.strictEqual(c1.filhos.length, 2);
});
teste('busca local filtra clientes', () => {
  const r = RELS.ranking.montar(fx.empresa, fx.porBase('ranking'), { busca: 'padaria' });
  assert.strictEqual(r.linhas.filter((l) => l.tipo === 'dado').length, 1);
});

console.log('\nSetor com / sem compra');
teste('carteira inteira com A/I, contagem por setor e cores', () => {
  const r = RELS.setor.montar(fx.empresa, fx.porBase('setor'), { situacao: 'TODOS' });
  const grupos = r.linhas.filter((l) => l.tipo === 'grupo');
  assert.strictEqual(grupos.length, 2);
  const g101 = grupos.find((g) => g.celulas.setor === '101');
  assert.strictEqual(g101.celulas.cliente, '— SETOR — 1/2');
  const semCompra = g101.filhos.find((c) => c.celulas.ai === 'I');
  assert.strictEqual(semCompra.cor, 'vermelho');
  const comCompra = g101.filhos.find((c) => c.celulas.ai === 'A');
  assert.strictEqual(comCompra.cor, 'verde');
  const soNaBase2 = achatar(r.linhas).find((l) => l.celulas.cliente && l.celulas.cliente.startsWith('00009'));
  assert.strictEqual(soNaBase2.cor, 'laranja');
});
teste('filtro ATIVOS / INATIVOS / tipo / setor', () => {
  const at = RELS.setor.montar(fx.empresa, fx.porBase('setor'), { situacao: 'ATIVOS' });
  assert(achatar(at.linhas).filter((l) => l.tipo === 'dado').every((l) => l.celulas.ai === 'A'));
  const inat = RELS.setor.montar(fx.empresa, fx.porBase('setor'), { situacao: 'INATIVOS' });
  assert(achatar(inat.linhas).filter((l) => l.tipo === 'dado').every((l) => l.celulas.ai === 'I'));
  const tipo = RELS.setor.montar(fx.empresa, fx.porBase('setor'), { tipo: 'B' });
  assert.strictEqual(achatar(tipo.linhas).filter((l) => l.tipo === 'dado').length, 1);
  const set = RELS.setor.montar(fx.empresa, fx.porBase('setor'), { setor: '102' });
  assert.strictEqual(set.linhas.filter((l) => l.tipo === 'grupo').length, 1);
  const cli = RELS.setor.montar(fx.empresa, fx.porBase('setor'), { cliente: '1' });
  assert.strictEqual(achatar(cli.linhas).filter((l) => l.tipo === 'dado').length, 1, 'código 1 vira 00001');
});
teste('clientes únicos por NroInsc entre as bases', () => {
  const r = RELS.setor.montar(fx.empresa, fx.porBase('setor'), {});
  assert.strictEqual(r.resumo.find((x) => x.rotulo.startsWith('Clientes únicos')).valor, 3);
});

console.log('\nRuptura');
teste('caixas, frações, valor e pedidos por cliente e setor', () => {
  const r = RELS.ruptura.montar(fx.empresa, fx.porBase('ruptura'), {});
  const g = r.linhas.find((l) => l.tipo === 'grupo');
  const c = g.filhos[0];
  assert.deepStrictEqual(c.celulas['f:FAZENDEIRO'], { valor: 77.6 + 20, cx: 1 + 0, frac: 0 + 5, ped: 2 });
  assert.deepStrictEqual(c.celulas.qtd, { cx: 1, frac: 5 });
  assert.strictEqual(c.celulas.pedidos, 2);
  assert.strictEqual(c.filhos.length, 2);
  const tot = r.linhas.find((l) => l.tipo === 'total');
  assert.strictEqual(tot.celulas.total, 97.6 + 85.01);
});
teste('filtro de vários setores separados por vírgula', () => {
  const r = RELS.ruptura.montar(fx.empresa, fx.porBase('ruptura'), { setor: '104' });
  assert.strictEqual(r.linhas.filter((l) => l.tipo === 'grupo').length, 1);
  const r2 = RELS.ruptura.montar(fx.empresa, fx.porBase('ruptura'), { setor: '102, 104' });
  assert.strictEqual(r2.linhas.filter((l) => l.tipo === 'grupo').length, 2);
});

console.log('\nDeduzir retorno (troca na hora, sem nova consulta)');
teste('valor/volume usa ValorLiq/VolumeLiq quando ligado', () => {
  const bruto = RELS.valorVolume.montar(fx.empresa, fx.porBase('valorVolume'), { deduzirRetorno: false });
  const liq = RELS.valorVolume.montar(fx.empresa, fx.porBase('valorVolume'), { deduzirRetorno: true });
  const b = bruto.linhas.find((x) => x.celulas.setor === '104').celulas[LEITE];
  const l = liq.linhas.find((x) => x.celulas.setor === '104').celulas[LEITE];
  assert.deepStrictEqual(b, { valor: 347.5, vol: 3 });
  assert.deepStrictEqual(l, { valor: 337.5 - 37.5 + 10, vol: 1 - 0.5 + 2 });
});
teste('ranking e setor usam o líquido quando ligado', () => {
  const r = RELS.ranking.montar(fx.empresa, fx.porBase('ranking'), { deduzirRetorno: true });
  const c1 = r.linhas.find((l) => l.celulas.cliente && l.celulas.cliente.startsWith('00001'));
  assert.strictEqual(c1.celulas.total, 700 - 100);
  const s2 = RELS.setor.montar(fx.empresa, fx.porBase('setor'), { deduzirRetorno: true });
  const c = achatar(s2.linhas).find((l) => l.celulas.cliente && l.celulas.cliente.startsWith('00001'));
  assert.strictEqual(c.celulas.total, 300);
});
teste('as consultas trazem bruto e líquido juntos (uma consulta só)', () => {
  const q = RELS.valorVolume.consultas(fx.empresa, {}).vendas;
  assert(/AS ValorLiq/.test(q) && /AS VolumeLiq/.test(q) && /OUTER APPLY/.test(q));
  assert.strictEqual(JSON.stringify(RELS.ranking.consultas(fx.empresa, { deduzirRetorno: true })), JSON.stringify(RELS.ranking.consultas(fx.empresa, { deduzirRetorno: false })));
});

console.log('\nExportação Excel');
const { gerarExcel } = require('../main/lib/exportar.cjs');
const os = require('os');
const path = require('path');
const ExcelJS = require('exceljs');
(async () => {
  const destino = path.join(os.tmpdir(), 'teste-export.xlsx');
  const setor = RELS.setor.montar(fx.empresa, fx.porBase('setor'), {});
  const ruptura = RELS.ruptura.montar(fx.empresa, fx.porBase('ruptura'), {});
  await gerarExcel(destino, [
    { nome: 'Setor', tabela: setor, titulo: setor.titulo, resumo: setor.resumo },
    { nome: 'Ruptura', tabela: ruptura, titulo: ruptura.titulo }
  ]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(destino);
  teste('gera as abas com agrupamento de linhas', () => {
    assert.strictEqual(wb.worksheets.length, 2);
    const ws = wb.getWorksheet('Setor');
    let agrupadas = 0;
    ws.eachRow((row) => { if (row.outlineLevel > 0) agrupadas++; });
    assert(agrupadas > 0);
  });
  console.log(`\n${ok} testes passaram${process.exitCode ? ' — HÁ FALHAS' : ''}.`);
})();
