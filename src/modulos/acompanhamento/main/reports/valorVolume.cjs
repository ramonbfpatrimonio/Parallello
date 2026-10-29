// Relatório 2 — VALOR / VOLUME POR FABRICANTE - CONSOLIDADO
// Junta as abas "VolumeFabricante" (Planilha6) e "Valorfabricante" (Planilha5):
// por Equipe / Setor / Vendedor, o valor (R$) e o volume (Quant x Fator_HL) de cada fabricante.
// Opção "mostrarVolume = false" reproduz a aba Valorfabricante (só valor, sem vendedor vazio).
const S = require('../lib/sqlbase.cjs');

function consultas(empresa, filtros) {
  return {
    vendas: `
SELECT
  LTRIM(RTRIM(ISNULL(pv.Equipe,''))) AS Equipe,
  LTRIM(RTRIM(ISNULL(pv.Setor,''))) AS Setor,
  ${S.VENDEDOR} AS Vendedor,
  ${S.FAB} AS Fabricante,
  ${S.VALOR_E_LIQUIDO},
  ${S.VOLUME_E_LIQUIDO}
${S.fromVendas(true, { comCliente: false })}
${S.WHERE_VENDAS}
GROUP BY LTRIM(RTRIM(ISNULL(pv.Equipe,''))), LTRIM(RTRIM(ISNULL(pv.Setor,''))), ${S.VENDEDOR}, ${S.FAB}`
  };
}

function montar(empresa, porBase, filtros) {
  const mostrarVolume = filtros.mostrarVolume !== false;
  const fabs = S.fabricantesDaEmpresa(empresa);
  const mapa = new Map();
  for (const { resultados } of porBase) {
    for (const r of resultados.vendas) {
      const vend = S.txt(r.Vendedor);
      if (!mostrarVolume && !vend) continue;
      const chave = `${S.txt(r.Equipe)}|${S.txt(r.Setor)}|${vend}`;
      const col = S.colunaFabricante(fabs, r.Fabricante);
      if (!col) continue;
      let it = mapa.get(chave);
      if (!it) {
        it = { equipe: S.txt(r.Equipe), setor: S.txt(r.Setor), vendedor: vend, v: {}, q: {} };
        mapa.set(chave, it);
      }
      it.v[col] = (it.v[col] || 0) + S.valorDe(r, filtros.deduzirRetorno);
      it.q[col] = (it.q[col] || 0) + S.volumeDe(r, filtros.deduzirRetorno);
    }
  }
  const itens = [...mapa.entries()].sort((a, b) => (a[0] > b[0] ? 1 : a[0] < b[0] ? -1 : 0)).map((e) => e[1]);

  const tipoFab = mostrarVolume ? 'vv' : 'moeda';
  const colunas = [
    { chave: 'equipe', rotulo: 'Equipe', tipo: 'texto', alinhamento: 'centro' },
    { chave: 'setor', rotulo: 'Setor', tipo: 'texto', alinhamento: 'centro' },
    { chave: 'vendedor', rotulo: 'Vendedor', tipo: 'texto' },
    ...fabs.map((f) => ({ chave: 'f:' + f.chave, rotulo: f.nome, tipo: tipoFab })),
    { chave: 'total', rotulo: 'Total', tipo: tipoFab, destaque: true }
  ];

  const tot = { v: {}, q: {} };
  const celulaFab = (valor, vol) => (mostrarVolume ? { valor, vol } : valor);
  const linhas = itens.map((it, i) => {
    const c = { equipe: it.equipe, setor: it.setor, vendedor: it.vendedor };
    let tv = 0;
    let tq = 0;
    fabs.forEach((f) => {
      const v = it.v[f.chave] || 0;
      const q = it.q[f.chave] || 0;
      c['f:' + f.chave] = v || q ? celulaFab(v, q) : null;
      tot.v[f.chave] = (tot.v[f.chave] || 0) + v;
      tot.q[f.chave] = (tot.q[f.chave] || 0) + q;
      tv += v;
      tq += q;
    });
    c.total = celulaFab(tv, tq);
    // setor com 1 caractere = linha de supervisão (negrito na planilha)
    return { id: 'l' + i, tipo: it.setor.length === 1 ? 'destaque' : 'dado', celulas: c };
  });
  const ct = { equipe: 'TOTAL GERAL' };
  let gv = 0;
  let gq = 0;
  fabs.forEach((f) => {
    ct['f:' + f.chave] = celulaFab(tot.v[f.chave] || 0, tot.q[f.chave] || 0);
    gv += tot.v[f.chave] || 0;
    gq += tot.q[f.chave] || 0;
  });
  ct.total = celulaFab(gv, gq);
  linhas.push({ id: 'total', tipo: 'total', celulas: ct });

  const resumo = [{ rotulo: 'Valor total', valor: gv, tipo: 'moeda' }];
  if (mostrarVolume) resumo.push({ rotulo: 'Volume total', valor: gq, tipo: 'numero' });
  resumo.push({ rotulo: 'Vendedores', valor: itens.length, tipo: 'inteiro' });

  return {
    titulo: mostrarVolume ? 'Valor / volume por fabricante — consolidado' : 'Valor por fabricante — consolidado',
    colunas,
    linhas,
    resumo
  };
}

module.exports = {
  id: 'valor-volume',
  nome: 'Valor / volume por fabricante',
  descricao: 'Equipe, setor e vendedor x fabricante, em R$ e volume',
  usaDeduzir: true,
  opcoes: [{ chave: 'mostrarVolume', rotulo: 'Mostrar volume', padrao: true }],
  consultas,
  montar
};
