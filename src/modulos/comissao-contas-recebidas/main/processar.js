// Transforma as linhas do banco no resultado do relatório (mesmas regras da planilha)

// Round do VBA (arredondamento bancário) — a planilha calculava L = Round(J * K / 100, 2)
function roundVBA(x, casas = 2) {
  if (x === null || x === undefined || isNaN(x)) return 0;
  const f = Math.pow(10, casas);
  const v = Number((x * f).toFixed(8));
  const t = Math.trunc(v);
  const frac = Math.abs(v - t);
  if (Math.abs(frac - 0.5) < 1e-7) return (t % 2 === 0 ? t : t + Math.sign(v)) / f;
  return Math.round(v) / f;
}

function r2(x) {
  return Math.round((Number(x) || 0) * 100 + Number.EPSILON * 100) / 100;
}

function dataISO(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function txt(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function num(v) {
  return v === null || v === undefined || v === '' ? null : Number(v);
}

function chaveVendedor(c) {
  const s = txt(c);
  return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s.toUpperCase();
}

/**
 * @param {Array} linhas linhas do SQL RELATORIO
 * @param {Object} filtros filtros usados
 * @param {Array} vendedores [{codigo, nome}] para dar nome aos códigos
 */
function processarRelatorio(linhas, filtros, vendedores = []) {
  const nomes = new Map(vendedores.map((v) => [chaveVendedor(v.codigo), v.nome]));
  const pedidos = new Map();

  const pegarPedido = (numero, codVendedor) => {
    const k = txt(numero);
    if (!pedidos.has(k)) {
      pedidos.set(k, {
        pedido: k,
        codVendedor: txt(codVendedor),
        nomeVendedor: nomes.get(chaveVendedor(codVendedor)) || '',
        dataPedido: null,
        codCliente: '',
        nomeCliente: '',
        totalPedido: 0,
        totalBruto: 0,
        totalST: 0,
        totalDevolvido: 0,
        parcelas: [],
        itens: [],
        recebido: 0,
        comissao: 0,
        comissaoItens: 0
      });
    }
    return pedidos.get(k);
  };

  for (const l of linhas) {
    const p = pegarPedido(l.Pedido, l.CodVendedor);
    if (Number(l.TipoLinha) === 0) {
      const recebido = num(l.ValorRecebido) || 0;
      const perc = num(l.PercComis);
      const comissao = perc === null ? 0 : roundVBA(recebido * (perc / 100), 2);
      p.dataPedido = p.dataPedido || dataISO(l.DataPedido);
      p.codCliente = p.codCliente || txt(l.CodCliente);
      p.nomeCliente = p.nomeCliente || txt(l.NomeCliente);
      p.totalPedido = num(l.TotalPedido) || 0;
      p.totalBruto = num(l.TotalBruto) || 0;
      p.totalST = num(l.TotalST) || 0;
      p.totalDevolvido = num(l.TotalDevolvido) || 0;
      p.parcelas.push({
        vencimento: dataISO(l.Vencimento),
        dataBaixa: dataISO(l.DataBaixa),
        documento: txt(l.Documento),
        totalPedido: num(l.TotalPedido) || 0,
        valorRecebido: recebido,
        recebidoBruto: num(l.RecebidoBruto) ?? recebido,
        percComis: perc,
        valorComissao: comissao
      });
      p.recebido = r2(p.recebido + recebido);
      p.comissao = r2(p.comissao + comissao);
    } else {
      const cod = txt(l.CodProduto);
      const item = {
        codProduto: cod.split(' - ')[0].trim(),
        produto: cod,
        descProduto: txt(l.DescProduto),
        fabricante: txt(l.NomeFabricante) || '(sem fabricante)',
        quant: num(l.Quant) || 0,
        valorTotalItem: num(l.ValorTotalItem) || 0,
        perFabr: num(l.PerFabr) || 0,
        valorComissaoItem: num(l.ValorComissaoItem) || 0,
        stItem: num(l.STItem) || 0
      };
      p.itens.push(item);
      p.comissaoItens = r2(p.comissaoItens + item.valorComissaoItem);
    }
  }

  const lista = [...pedidos.values()];

  const totais = {
    pedidos: lista.filter((p) => p.parcelas.length).length,
    parcelas: lista.reduce((s, p) => s + p.parcelas.length, 0),
    itens: lista.reduce((s, p) => s + p.itens.length, 0),
    // igual à planilha (SUMIF nas linhas de parcela): o total do pedido entra uma vez por parcela
    totalPedidos: r2(lista.reduce((s, p) => s + p.parcelas.length * p.totalPedido, 0)),
    totalBruto: r2(lista.reduce((s, p) => s + p.parcelas.length * p.totalBruto, 0)),
    totalST: r2(lista.reduce((s, p) => s + p.parcelas.length * p.totalST, 0)),
    totalDevolvido: r2(lista.reduce((s, p) => s + p.parcelas.length * p.totalDevolvido, 0)),
    recebido: r2(lista.reduce((s, p) => s + p.recebido, 0)),
    comissao: r2(lista.reduce((s, p) => s + p.comissao, 0)),
    comissaoItens: r2(lista.reduce((s, p) => s + p.comissaoItens, 0))
  };

  const fab = new Map();
  for (const p of lista) {
    for (const i of p.itens) {
      const f = fab.get(i.fabricante) || { fabricante: i.fabricante, itens: 0, quant: 0, valor: 0, comissao: 0, pedidos: new Set() };
      f.itens += 1;
      f.quant += i.quant;
      f.valor += i.valorTotalItem;
      f.comissao += i.valorComissaoItem;
      f.pedidos.add(p.pedido);
      fab.set(i.fabricante, f);
    }
  }
  const porFabricante = [...fab.values()]
    .map((f) => ({ fabricante: f.fabricante, pedidos: f.pedidos.size, itens: f.itens, quant: r2(f.quant), valor: r2(f.valor), comissao: r2(f.comissao) }))
    .sort((a, b) => b.comissao - a.comissao);

  const ven = new Map();
  for (const p of lista) {
    if (!p.parcelas.length) continue;
    const k = chaveVendedor(p.codVendedor);
    const v = ven.get(k) || { codigo: p.codVendedor, nome: p.nomeVendedor, pedidos: 0, parcelas: 0, recebido: 0, comissao: 0 };
    v.pedidos += 1;
    v.parcelas += p.parcelas.length;
    v.recebido += p.recebido;
    v.comissao += p.comissao;
    ven.set(k, v);
  }
  const porVendedor = [...ven.values()]
    .map((v) => ({ ...v, recebido: r2(v.recebido), comissao: r2(v.comissao) }))
    .sort((a, b) => b.comissao - a.comissao);

  return {
    geradoEm: new Date().toISOString(),
    filtros,
    pedidos: lista,
    totais,
    porFabricante,
    porVendedor
  };
}

module.exports = { processarRelatorio, roundVBA, chaveVendedor };
