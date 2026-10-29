// Relatório 4 — SETORES COM E SEM COMPRA POR FABRICANTE (aba "SetorComSemCompra" / Planilha9)
// Toda a carteira de clientes (Clientes.Vendedor1 = setor), agrupada por Equipe / Setor / Vendedor,
// mostrando quem comprou (A = ativo) e quem não comprou (I = inativo) no período.
// Cores como na planilha: verde comprou, vermelho não comprou, laranja = cliente não está em todas as bases.
const S = require('../lib/sqlbase.cjs');
const VC = require('../lib/vendasCliente.cjs');

function consultas(empresa, filtros) {
  return {
    ...VC.consultas(),
    carteira: `
SELECT
  LTRIM(RTRIM(ISNULL(ev.Equipe, ''))) AS Equipe,
  LTRIM(RTRIM(c.Vendedor1)) AS Setor,
  ISNULL(pes.Nome_Guer, LTRIM(RTRIM(c.Vendedor1))) AS Vendedor,
  LTRIM(RTRIM(c.Codigo)) AS CodCliente,
  LTRIM(RTRIM(ISNULL(c.Tipo,''))) AS TipoCliente,
  ISNULL(c.Nome,'SEM NOME') AS NomeCliente,
  LTRIM(RTRIM(ISNULL(c.NroInsc,''))) AS NroInsc
FROM [dbo].[Clientes] c
LEFT JOIN [dbo].[Equipes de Vendas] ev ON ev.Codigo = c.Vendedor1
LEFT JOIN [dbo].[Pessoal] pes ON pes.Codigo = ev.Vendedor
WHERE ISNULL(c.Vendedor1, '') <> ''
  AND ISNULL(c.Codigo, '') <> ''`
  };
}

function montar(empresa, porBase, filtros) {
  const fabs = S.fabricantesDaEmpresa(empresa);
  const nBases = porBase.length;

  // vendas por código de cliente (soma de todas as bases, como na planilha)
  const vendas = VC.consolidar(porBase, fabs, (r) => S.norm(r.CodCliente), !!filtros.deduzirRetorno);

  const tipoFiltro = S.norm(filtros.tipo || '');
  const situacao = S.norm(filtros.situacao || 'TODOS');
  const equipeFiltro = S.norm(filtros.equipe || '');
  const setorFiltro = S.norm(filtros.setor || '');
  const clienteFiltro = filtros.cliente ? S.norm(S.ajustaCodigo(filtros.cliente, 5)) : '';

  // carteira (Setor|Cliente), lembrando em quantas bases o cliente aparece
  const carteira = new Map();
  const presenca = new Map();
  const equipes = new Set();
  const setores = new Set();
  const insc = new Set();
  for (const { resultados } of porBase) {
    const vistos = new Set();
    for (const r of resultados.carteira) {
      const cod = S.norm(r.CodCliente);
      const setor = S.norm(r.Setor);
      if (!cod || !setor) continue;
      const k = `${setor}|${cod}`;
      if (!vistos.has(k)) {
        presenca.set(k, (presenca.get(k) || 0) + 1);
        vistos.add(k);
      }
      if (S.txt(r.Equipe)) equipes.add(S.txt(r.Equipe));
      const tipo = S.norm(r.TipoCliente);
      if (S.txt(r.NroInsc) && (!tipoFiltro || tipo === tipoFiltro)) insc.add(S.norm(r.NroInsc));
      if (!equipeFiltro || S.norm(r.Equipe) === equipeFiltro) setores.add(S.txt(r.Setor));

      if (equipeFiltro && S.norm(r.Equipe) !== equipeFiltro) continue;
      if (setorFiltro && setor !== setorFiltro) continue;
      if (clienteFiltro && cod !== clienteFiltro) continue;
      if (tipoFiltro && tipo !== tipoFiltro) continue;
      if (!carteira.has(k)) {
        carteira.set(k, {
          equipe: S.txt(r.Equipe),
          setor: S.txt(r.Setor),
          vendedor: S.txt(r.Vendedor),
          cod,
          nome: S.txt(r.NomeCliente),
          tipo: S.txt(r.TipoCliente)
        });
      }
    }
  }

  let lista = [...carteira.entries()].map(([k, c]) => {
    const v = vendas.get(c.cod);
    return { ...c, k, venda: v, total: v ? v.total : 0, emTodas: (presenca.get(k) || 0) >= nBases };
  });
  if (situacao === 'ATIVOS') lista = lista.filter((c) => c.total !== 0);
  if (situacao === 'INATIVOS') lista = lista.filter((c) => c.total === 0);

  const chaveOrd = (c) => `${c.equipe}|${c.setor}|${c.vendedor}|${c.cod}|${c.nome}|${c.tipo}`;
  lista.sort((a, b) => (chaveOrd(a) > chaveOrd(b) ? 1 : chaveOrd(a) < chaveOrd(b) ? -1 : 0));

  const colunas = [
    { chave: 'equipe', rotulo: 'Equipe', tipo: 'texto', alinhamento: 'centro' },
    { chave: 'setor', rotulo: 'Setor', tipo: 'texto', alinhamento: 'centro' },
    { chave: 'vendedor', rotulo: 'Vendedor', tipo: 'texto' },
    { chave: 'cliente', rotulo: 'Cliente', tipo: 'texto', larga: true },
    { chave: 'tipo', rotulo: 'Tipo', tipo: 'texto', alinhamento: 'centro' },
    { chave: 'ai', rotulo: 'A/I', tipo: 'texto', alinhamento: 'centro' },
    ...fabs.map((f) => ({ chave: 'f:' + f.chave, rotulo: f.nome, tipo: 'vq' })),
    { chave: 'qtdePV', rotulo: 'Qtde Pré-venda', tipo: 'pvq' },
    { chave: 'posit', rotulo: 'Positivação', tipo: 'inteiro' },
    { chave: 'total', rotulo: 'Total Cliente', tipo: 'moeda', destaque: true }
  ];

  const linhas = [];
  let grupo = null;
  const geral = { clientes: 0, comVenda: 0, qtdePV: 0, posit: 0, total: 0, quant: 0 };
  const fecharGrupo = () => {
    if (!grupo) return;
    grupo.linha.celulas.cliente = `— SETOR — ${grupo.comVenda}/${grupo.clientes}`;
    grupo.linha.celulas.qtdePV = { qtd: grupo.qtdePV, vol: grupo.quant };
    grupo.linha.celulas.posit = grupo.posit;
    grupo.linha.celulas.total = grupo.total;
    linhas.push(grupo.linha);
  };

  lista.forEach((c, i) => {
    const chaveGrupo = `${c.equipe}|${c.setor}|${c.vendedor}`;
    if (!grupo || grupo.chave !== chaveGrupo) {
      fecharGrupo();
      grupo = {
        chave: chaveGrupo, clientes: 0, comVenda: 0, qtdePV: 0, posit: 0, total: 0, quant: 0,
        linha: { id: 'g' + i, tipo: 'grupo', celulas: { equipe: c.equipe, setor: c.setor, vendedor: c.vendedor }, filhos: [] }
      };
    }
    const v = c.venda;
    const cel = {
      cliente: `${c.cod} - ${c.nome}`,
      tipo: c.tipo,
      ai: c.total === 0 ? 'I' : 'A',
      qtdePV: { qtd: v ? v.qtdePV : 0, vol: v ? v.quantTotal : 0 },
      posit: v ? v.dias.size : 0,
      total: c.total
    };
    fabs.forEach((f) => {
      cel['f:' + f.chave] = { valor: v ? v.valor[f.chave] || 0 : 0, vol: v ? v.quant[f.chave] || 0 : 0 };
    });
    const filhos = v
      ? [...v.produtos.values()]
          .sort((a, b) => (a.fab + a.cod > b.fab + b.cod ? 1 : -1))
          .map((p, j) => {
            const pc = { cliente: `${p.cod} - ${p.nome}` };
            const col = S.colunaFabricante(fabs, p.fab);
            if (col) pc['f:' + col] = { valor: p.valor, vol: p.quant };
            pc.qtdePV = { qtd: p.pd, vol: p.quant };
            return { id: `c${i}p${j}`, tipo: 'filho', celulas: pc };
          })
      : [];
    const cor = !c.emTodas ? 'laranja' : c.total > 0 ? 'verde' : 'vermelho';
    grupo.linha.filhos.push({ id: 'c' + i, tipo: 'dado', cor, negrito: c.total === 0, celulas: cel, filhos });

    grupo.clientes++;
    geral.clientes++;
    if (c.total > 0) { grupo.comVenda++; geral.comVenda++; }
    grupo.qtdePV += cel.qtdePV.qtd;
    grupo.quant += cel.qtdePV.vol;
    grupo.posit += cel.posit;
    if (c.total > 0) grupo.total += c.total;
    geral.qtdePV += cel.qtdePV.qtd;
    geral.quant += cel.qtdePV.vol;
    geral.posit += cel.posit;
    if (c.total > 0) geral.total += c.total;
  });
  fecharGrupo();

  if (lista.length) {
    linhas.push({
      id: 'total',
      tipo: 'total',
      celulas: {
        equipe: 'TOTAL GERAL',
        cliente: `${geral.comVenda}/${geral.clientes} clientes com compra`,
        qtdePV: { qtd: geral.qtdePV, vol: geral.quant },
        posit: geral.posit,
        total: geral.total
      }
    });
  }

  const cobertura = geral.clientes ? geral.comVenda / geral.clientes : 0;
  return {
    titulo: 'Setores com e sem compra por fabricante',
    colunas,
    linhas,
    vazio: 'Nenhum cliente encontrado para os filtros informados.',
    listas: {
      equipe: [...equipes].sort(),
      setor: [...setores].sort((a, b) => (Number(a) || 0) - (Number(b) || 0) || (a > b ? 1 : -1))
    },
    resumo: [
      { rotulo: 'Clientes únicos (NroInsc)', valor: insc.size, tipo: 'inteiro' },
      { rotulo: 'Clientes na lista', valor: geral.clientes, tipo: 'inteiro' },
      { rotulo: 'Positivados', valor: geral.comVenda, tipo: 'inteiro' },
      { rotulo: 'Cobertura', valor: cobertura, tipo: 'pct' },
      { rotulo: 'Total vendido', valor: geral.total, tipo: 'moeda' }
    ]
  };
}

module.exports = {
  id: 'setor-com-sem-compra',
  nome: 'Setor com / sem compra',
  descricao: 'Carteira por setor: quem comprou e quem não comprou',
  usaDeduzir: true,
  filtrosLista: [
    { chave: 'tipo', rotulo: 'Tipo', opcoes: ['', 'A', 'B', 'C', 'D'], local: true },
    { chave: 'situacao', rotulo: 'Situação', opcoes: ['TODOS', 'ATIVOS', 'INATIVOS'], local: true },
    { chave: 'equipe', rotulo: 'Equipe', dinamica: true, local: true },
    { chave: 'setor', rotulo: 'Setor', dinamica: true, local: true }
  ],
  filtrosTexto: [{ chave: 'cliente', rotulo: 'Cód. cliente', local: true }],
  consultas,
  montar
};
