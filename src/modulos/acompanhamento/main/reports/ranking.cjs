// Relatório 3 — RANKING POR CLIENTE / FABRICANTE + CURVA ABC (aba "positivacaocliente" / Módulo5)
// Clientes ordenados pelo total comprado, % do faturamento, % acumulado e classe ABC
// (A até 80% acumulado, B até 95%, C o restante). Cada cliente abre a lista de produtos.
const S = require('../lib/sqlbase.cjs');
const VC = require('../lib/vendasCliente.cjs');

function consultas(empresa, filtros) {
  return VC.consultas();
}

function classe(pctAcum) {
  if (pctAcum <= 0.8 + 1e-9) return { classe: 'A', pctCli: 0.2, pctFat: 0.8 };
  if (pctAcum <= 0.95 + 1e-9) return { classe: 'B', pctCli: 0.3, pctFat: 0.15 };
  return { classe: 'C', pctCli: 0.5, pctFat: 0.05 };
}

function montar(empresa, porBase, filtros) {
  const fabs = S.fabricantesDaEmpresa(empresa);
  const clientes = VC.consolidar(porBase, fabs, (r) => `${S.txt(r.Equipe)}|${S.txt(r.Vendedor)}|${S.norm(r.CodCliente)}`, !!filtros.deduzirRetorno);
  let lista = [...clientes.values()];

  const busca = S.norm(filtros.busca || '');
  if (busca) lista = lista.filter((c) => S.norm(`${c.cod} ${c.nome} ${c.vendedor}`).includes(busca));

  lista.sort((a, b) => b.total - a.total);
  const totalGeral = lista.reduce((s, c) => s + c.total, 0);

  const colunas = [
    { chave: 'equipe', rotulo: 'Equipe', tipo: 'texto', alinhamento: 'centro' },
    { chave: 'setor', rotulo: 'Setor', tipo: 'texto', alinhamento: 'centro' },
    { chave: 'vendedor', rotulo: 'Vendedor', tipo: 'texto' },
    { chave: 'cliente', rotulo: 'Cliente / Produto', tipo: 'texto', larga: true },
    { chave: 'telefone', rotulo: 'Telefone', tipo: 'texto' },
    { chave: 'email', rotulo: 'E-mail', tipo: 'texto' },
    { chave: 'total', rotulo: 'Total Cliente', tipo: 'moeda', destaque: true },
    { chave: 'media', rotulo: 'Média de Compra', tipo: 'moeda' },
    { chave: 'ranking', rotulo: 'Ranking', tipo: 'texto', alinhamento: 'centro' },
    { chave: 'pct', rotulo: '% Fat.', tipo: 'pct' },
    { chave: 'pctAcum', rotulo: '% Acum.', tipo: 'pct' },
    { chave: 'pctCli', rotulo: '% Clientes', tipo: 'pct0' },
    { chave: 'pctFat', rotulo: '% Fat. Classe', tipo: 'pct0' },
    { chave: 'abc', rotulo: 'Curva ABC', tipo: 'texto', alinhamento: 'centro', abc: true },
    ...fabs.map((f) => ({ chave: 'f:' + f.chave, rotulo: f.nome, tipo: 'moeda' })),
    { chave: 'qtdePV', rotulo: 'Qtde Pré-venda', tipo: 'inteiro' },
    { chave: 'posit', rotulo: 'Positivação', tipo: 'inteiro' }
  ];

  let acum = 0;
  const totFab = {};
  let somaPV = 0;
  let somaPosit = 0;
  const contABC = { A: 0, B: 0, C: 0 };
  const linhas = lista.map((c, i) => {
    const pct = totalGeral > 0 ? c.total / totalGeral : 0;
    acum += pct;
    const k = classe(acum);
    contABC[k.classe]++;
    const cel = {
      equipe: c.equipe,
      setor: c.setor,
      vendedor: c.vendedor,
      cliente: `${c.cod} - ${c.nome || 'SEM NOME'}`,
      telefone: c.telefone,
      email: c.email,
      total: c.total,
      media: c.qtdePV > 0 ? c.total / c.qtdePV : 0,
      ranking: `${i + 1}º`,
      pct,
      pctAcum: acum,
      pctCli: k.pctCli,
      pctFat: k.pctFat,
      abc: k.classe,
      qtdePV: c.qtdePV,
      posit: c.dias.size
    };
    fabs.forEach((f) => {
      const v = c.valor[f.chave] || 0;
      cel['f:' + f.chave] = v || null;
      totFab[f.chave] = (totFab[f.chave] || 0) + v;
    });
    somaPV += c.qtdePV;
    somaPosit += c.dias.size;

    const filhos = [...c.produtos.values()]
      .sort((a, b) => (a.cod > b.cod ? 1 : -1))
      .map((p, j) => {
        const pc = { cliente: `${p.cod} - ${p.nome}` };
        const col = S.colunaFabricante(fabs, p.fab);
        if (col) pc['f:' + col] = p.valor;
        return { id: `l${i}p${j}`, tipo: 'filho', celulas: pc };
      });
    const cor = i === 0 ? 'ouro' : i === 1 ? 'prata' : i === 2 ? 'bronze' : null;
    return { id: 'l' + i, tipo: 'dado', cor, celulas: cel, filhos };
  });

  const ct = {
    equipe: 'TOTAL GERAL',
    total: totalGeral,
    media: somaPV > 0 ? totalGeral / somaPV : 0,
    pct: 1,
    pctAcum: 1,
    pctCli: 1,
    pctFat: 1,
    qtdePV: somaPV,
    posit: somaPosit
  };
  fabs.forEach((f) => { ct['f:' + f.chave] = totFab[f.chave] || 0; });
  linhas.push({ id: 'total', tipo: 'total', celulas: ct });

  return {
    titulo: 'Ranking por cliente / fabricante — curva ABC',
    colunas,
    linhas,
    resumo: [
      { rotulo: 'Faturamento', valor: totalGeral, tipo: 'moeda' },
      { rotulo: 'Clientes', valor: lista.length, tipo: 'inteiro' },
      { rotulo: 'Classe A', valor: contABC.A, tipo: 'inteiro' },
      { rotulo: 'Classe B', valor: contABC.B, tipo: 'inteiro' },
      { rotulo: 'Classe C', valor: contABC.C, tipo: 'inteiro' },
      { rotulo: 'Ticket médio', valor: ct.media, tipo: 'moeda' }
    ]
  };
}

module.exports = {
  id: 'ranking',
  nome: 'Ranking ABC de clientes',
  descricao: 'Positivação, ticket médio e curva ABC por cliente',
  usaDeduzir: true,
  filtrosTexto: [{ chave: 'busca', rotulo: 'Buscar cliente / vendedor', local: true }],
  consultas,
  montar
};
