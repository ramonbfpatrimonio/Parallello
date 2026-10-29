// Trechos SQL compartilhados — portados das macros da planilha Acompanhamento_DiarioVolume.
// Regras mantidas da planilha:
//  - só operações de venda: LTRIM(RTRIM(op.TipoOp)) = 'V'
//  - Valor = Preco * Quant ; Volume = Quant * Fator_HL
//  - "Deduzir retorno": se a pré-venda está com Situacao = 'E', desconta os itens dos pedidos de
//    retorno (Pedidos.CodRet > 0) que referenciam o pedido da pré-venda (NroRef = pv.Pedido), mesmo produto.
// Diferença proposital: o período usa CAST(pv.Data AS DATE) em todas as consultas
// (algumas macros usavam pv.Data direto, o que pode perder vendas do último dia se houver hora gravada).

const FAB = "UPPER(LTRIM(RTRIM(ISNULL(fab.Nome,'SEM FABRICANTE'))))";
const VENDEDOR = "LTRIM(RTRIM(ISNULL(pv.Vendedor,''))) + '-' + ISNULL(pes.Nome_Guer,'SEM NOME')";
const COD_CLIENTE = 'LTRIM(RTRIM(pv.Codigo))';
const NUM_PV = "CAST(pv.Ano AS VARCHAR(10)) + '-' + CAST(pv.Numero AS VARCHAR(20))";

function exprValor(deduzir) {
  return deduzir
    ? "(CASE WHEN ISNULL(pv.Situacao,'') = 'E' THEN (pi.Preco * pi.Quant) - ISNULL(Ret.ValorRet, 0) ELSE (pi.Preco * pi.Quant) END)"
    : '(pi.Preco * pi.Quant)';
}

function exprVolume(deduzir) {
  return deduzir
    ? "(CASE WHEN ISNULL(pv.Situacao,'') = 'E' THEN (ISNULL(pi.Quant,0) * ISNULL(p.Fator_HL,0)) - ISNULL(Ret.QuantRet, 0) ELSE (ISNULL(pi.Quant,0) * ISNULL(p.Fator_HL,0)) END)"
    : '(ISNULL(pi.Quant,0) * ISNULL(p.Fator_HL,0))';
}

// FROM padrão das vendas (pré-venda + itens + produto + operação + fabricante + vendedor + cliente)
function fromVendas(deduzir, { comCliente = true } = {}) {
  let s = `
FROM [dbo].[Prevendas] pv
INNER JOIN [dbo].[PrevendasItens] pi ON pi.Ano = pv.Ano AND pi.Numero = pv.Numero
INNER JOIN [dbo].[Produtos] p ON p.Codigo = pi.Produto
INNER JOIN [dbo].[Operações] op ON op.Codigo = pv.Operacao
LEFT JOIN [dbo].[Fabricantes] fab ON fab.Codigo = p.Fabricante
LEFT JOIN [dbo].[Pessoal] pes ON pes.Codigo = pv.Vendedor`;
  if (comCliente) {
    s += `
LEFT JOIN [dbo].[Clientes] cli ON LTRIM(RTRIM(cli.Codigo)) = LTRIM(RTRIM(pv.Codigo))`;
  }
  if (deduzir) {
    s += `
OUTER APPLY (
  SELECT SUM(ipr.ValorTotal) AS ValorRet,
         SUM(ipr.Quant * ISNULL(prr.Fator_HL, 0)) AS QuantRet
  FROM [dbo].[Pedidos] ppr
  INNER JOIN [dbo].[Itens de Pedido] ipr ON ipr.Numero = ppr.Numero
  LEFT JOIN [dbo].[Produtos] prr ON prr.Codigo = ipr.Produto
  WHERE ppr.CodRet > 0
    AND ppr.NroRef = pv.Pedido
    AND ipr.Produto = pi.Produto
) Ret`;
  }
  return s;
}

// Traz o valor/volume BRUTO e o LÍQUIDO (com retorno deduzido) na mesma consulta,
// para a opção "Deduzir retorno" trocar na hora, sem consultar o banco de novo.
// Exige fromVendas(true) (OUTER APPLY dos retornos).
const VALOR_E_LIQUIDO = `ISNULL(SUM(${exprValor(false)}), 0) AS Valor,
  ISNULL(SUM(${exprValor(true)}), 0) AS ValorLiq`;
const VOLUME_E_LIQUIDO = `ISNULL(SUM(${exprVolume(false)}), 0) AS Volume,
  ISNULL(SUM(${exprVolume(true)}), 0) AS VolumeLiq`;
const valorDe = (r, deduzir) => num(deduzir && r.ValorLiq !== undefined ? r.ValorLiq : r.Valor);
const volumeDe = (r, deduzir) => num(deduzir && r.VolumeLiq !== undefined ? r.VolumeLiq : r.Volume);

const WHERE_VENDAS = `
WHERE CAST(pv.Data AS DATE) BETWEEN @ini AND @fim
  AND LTRIM(RTRIM(op.TipoOp)) = 'V'`;

// ---------- Normalização usada para juntar resultados de bases diferentes ----------
function norm(v) {
  return String(v == null ? '' : v).replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function txt(v) {
  return v == null ? '' : String(v).trim();
}
// Igual ao AjustaCodigo do VBA: completa com zeros à esquerda
function ajustaCodigo(s, tamanho) {
  let r = String(s || '').trim();
  while (r.length && r.length < tamanho) r = '0' + r;
  return r;
}
function dia(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

// Lista de fabricantes configurada na empresa (ordem das colunas)
function fabricantesDaEmpresa(empresa) {
  const lista = (empresa.fabricantes || []).filter((f) => f.ativo !== false).map((f) => ({ nome: f.nome, chave: norm(f.nome) }));
  if (empresa.agruparOutros) lista.push({ nome: 'Outros', chave: '__OUTROS__' });
  return lista;
}

// Devolve a chave da coluna do fabricante, ou null se ele não estiver na lista
function colunaFabricante(fabs, nomeFab) {
  const k = norm(nomeFab);
  if (fabs.find((f) => f.chave === k)) return k;
  if (fabs.find((f) => f.chave === '__OUTROS__')) return '__OUTROS__';
  return null;
}

module.exports = {
  FAB, VENDEDOR, COD_CLIENTE, NUM_PV, exprValor, exprVolume, fromVendas, WHERE_VENDAS,
  VALOR_E_LIQUIDO, VOLUME_E_LIQUIDO, valorDe, volumeDe,
  norm, num, txt, ajustaCodigo, dia, fabricantesDaEmpresa, colunaFabricante
};
