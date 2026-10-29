// Relatório 1 — ACOMPANHAMENTO DIÁRIO DE VENDAS (aba "Acompanhamento Diário" / Módulo1.AtualizarVendas)
// Valor vendido por supervisão x fabricante. A supervisão é a equipe cujo código é o 1º dígito do setor.
const S = require('../lib/sqlbase.cjs');

function consultas(empresa) {
  const prefixos = String(empresa.prefixosSupervisao || '')
    .split(',')
    .map((p) => p.trim())
    .filter((p) => /^[0-9A-Za-z]{1,3}$/.test(p));
  const filtroPrefixo = prefixos.length
    ? `AND LEFT(LTRIM(RTRIM(pv.Setor)),1) IN (${prefixos.map((p) => `'${p}'`).join(',')})`
    : '';
  return {
    vendas: `
SELECT
  LTRIM(RTRIM(ISNULL(ev.Codigo,''))) AS Codigo,
  ISNULL(ev.Vendedor, 'Supervisão ' + LEFT(LTRIM(RTRIM(pv.Setor)),1)) AS Supervisao,
  ISNULL(ps.Nome_Guer, 'Sem Nome') AS Nome,
  ${S.FAB} AS Fabricante,
  SUM(pi.Preco * pi.Quant) AS Valor
FROM [dbo].[PrevendasItens] pi
INNER JOIN [dbo].[Prevendas] pv ON pv.Ano = pi.Ano AND pv.Numero = pi.Numero
INNER JOIN [dbo].[Produtos] p ON p.Codigo = pi.Produto
INNER JOIN [dbo].[Operações] op ON op.Codigo = pv.Operacao
LEFT JOIN [dbo].[Fabricantes] fab ON fab.Codigo = p.Fabricante
LEFT JOIN (SELECT DISTINCT LTRIM(RTRIM(Codigo)) AS Codigo, Vendedor
           FROM [dbo].[Equipes de Vendas]
           WHERE Vendedor IS NOT NULL AND LTRIM(RTRIM(Vendedor)) <> '') ev
       ON ev.Codigo = LEFT(LTRIM(RTRIM(pv.Setor)),1)
LEFT JOIN (SELECT DISTINCT LTRIM(RTRIM(Codigo)) AS Codigo, Nome_Guer FROM [dbo].[Pessoal]) ps
       ON ps.Codigo = LTRIM(RTRIM(ev.Vendedor))
WHERE CAST(pv.Data AS DATE) BETWEEN @ini AND @fim
  ${filtroPrefixo}
  AND LTRIM(RTRIM(op.TipoOp)) = 'V'
GROUP BY LTRIM(RTRIM(ISNULL(ev.Codigo,''))),
         ISNULL(ev.Vendedor, 'Supervisão ' + LEFT(LTRIM(RTRIM(pv.Setor)),1)),
         ISNULL(ps.Nome_Guer, 'Sem Nome'),
         ${S.FAB}`
  };
}

function limparCodigo(v) {
  let s = S.txt(v).replace(/ /g, '');
  if (/^-?\d+$/.test(s)) s = String(parseInt(s, 10));
  return s;
}

function montar(empresa, porBase) {
  const fabs = S.fabricantesDaEmpresa(empresa);
  const mapa = new Map();
  for (const { resultados } of porBase) {
    for (const r of resultados.vendas) {
      const cod = limparCodigo(r.Codigo);
      const sup = limparCodigo(r.Supervisao);
      if (!cod && !sup) continue;
      const chave = `${cod}|${sup}`;
      let item = mapa.get(chave);
      const nome = S.norm(r.Nome);
      if (!item) {
        item = { cod, sup, nome, valores: {} };
        mapa.set(chave, item);
      } else if (nome.length > item.nome.length) {
        item.nome = nome;
      }
      const col = S.colunaFabricante(fabs, r.Fabricante);
      if (!col) continue;
      item.valores[col] = (item.valores[col] || 0) + S.num(r.Valor);
    }
  }
  const numOu0 = (s) => (/^\d+$/.test(s) ? Number(s) : 0);
  const itens = [...mapa.values()].sort((a, b) => numOu0(a.cod) - numOu0(b.cod) || numOu0(a.sup) - numOu0(b.sup));

  const colunas = [
    { chave: 'codigo', rotulo: 'Código', tipo: 'texto', alinhamento: 'centro' },
    { chave: 'supervisao', rotulo: 'Supervisão', tipo: 'texto', alinhamento: 'centro' },
    { chave: 'nome', rotulo: 'Nome', tipo: 'texto' },
    ...fabs.map((f) => ({ chave: 'f:' + f.chave, rotulo: f.nome, tipo: 'moeda' })),
    { chave: 'total', rotulo: 'Total Faturado', tipo: 'moeda', destaque: true }
  ];
  const totais = {};
  const linhas = itens.map((it, i) => {
    const celulas = { codigo: it.cod, supervisao: it.sup, nome: it.nome };
    let total = 0;
    fabs.forEach((f) => {
      const v = it.valores[f.chave] || 0;
      celulas['f:' + f.chave] = v;
      totais['f:' + f.chave] = (totais['f:' + f.chave] || 0) + v;
      total += v;
    });
    celulas.total = total;
    totais.total = (totais.total || 0) + total;
    return { id: 'l' + i, tipo: 'dado', celulas };
  });
  linhas.push({ id: 'total', tipo: 'total', celulas: { nome: 'Total', ...totais } });

  return {
    titulo: 'Acompanhamento diário de vendas',
    colunas,
    linhas,
    resumo: [
      { rotulo: 'Total faturado', valor: totais.total || 0, tipo: 'moeda' },
      { rotulo: 'Supervisões', valor: itens.length, tipo: 'inteiro' }
    ]
  };
}

module.exports = {
  id: 'acompanhamento',
  nome: 'Acompanhamento diário',
  descricao: 'Valor vendido por supervisão e fabricante',
  usaDeduzir: false,
  consultas,
  montar
};
