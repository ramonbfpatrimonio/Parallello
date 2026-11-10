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

// documento "006487-C/C - BO" → parcela C de C (a última)
function parcelaFinal(doc) {
  const m = /-([A-Z0-9]+)\/([A-Z0-9]+)/i.exec(doc || '');
  return !!m && m[1].toUpperCase() === m[2].toUpperCase();
}

// última parcela = baixa mais recente (empate: a que vem por último)
function ultimaParcela(parcelas) {
  return parcelas.reduce((u, pa) => (!u || String(pa.dataBaixa || '') >= String(u.dataBaixa || '') ? pa : u), null);
}

/**
 * @param {Array} linhas linhas do SQL RELATORIO
 * @param {Object} filtros filtros usados
 * @param {Array} vendedores [{codigo, nome}] para dar nome aos códigos
 */
function processarRelatorio(linhas, filtros, vendedores = []) {
  // Chaves das Configurações (área oculta)
  const cfg = filtros.colunasST || {};
  const totalComST = cfg.totalComST === true; // padrão: Total pedido sem ST
  const recebidoComST = cfg.recebidoComST !== false; // padrão: Recebido como está no banco (com ST)
  const somaPorBaixa = cfg.somaPorBaixa !== false; // padrão: Total dos pedidos somado por baixa (como a planilha)
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
        totalST: 0,
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
      // % e comissão são calculados depois, quando todos os itens do pedido já foram lidos
      p.dataPedido = p.dataPedido || dataISO(l.DataPedido);
      p.codCliente = p.codCliente || txt(l.CodCliente);
      p.nomeCliente = p.nomeCliente || txt(l.NomeCliente);
      p.totalSemST = num(l.TotalPedido) || 0;
      p.totalST = num(l.TotalST) || 0;
      p.parcelas.push({
        vencimento: dataISO(l.Vencimento),
        dataBaixa: dataISO(l.DataBaixa),
        documento: txt(l.Documento),
        recebidoBanco: num(l.ValorRecebido) || 0
      });
    } else {
      const cod = txt(l.CodProduto);
      const item = {
        codProduto: cod.split(' - ')[0].trim(),
        produto: cod,
        descProduto: txt(l.DescProduto),
        fabricante: txt(l.NomeFabricante) || '(sem fabricante)',
        quant: num(l.Quant) || 0,
        valorTotalItem: num(l.ValorTotalItem) || 0,
        valorSemST: num(l.ValorTotalItem) || 0,
        perFabr: num(l.PerFabr) || 0,
        valorComissaoItem: num(l.ValorComissaoItem) || 0,
        stItem: num(l.STItem) || 0
      };
      p.itens.push(item);
      p.comissaoItens = r2(p.comissaoItens + item.valorComissaoItem);
    }
  }

  const lista = [...pedidos.values()];

  // Total pedido, Recebido, % Com. e Comissão de cada parcela
  for (const p of lista) {
    // chave "Total pedido com ST": o valor dos itens com ST também passa a incluir o ST
    // (só o valor mostrado; a comissão do item continua sobre o valor sem ST, igual ao Ativo)
    for (const i of p.itens) i.valorTotalItem = totalComST ? r2(i.valorSemST + (i.stItem || 0)) : i.valorSemST;
    const totalComSTValor = r2((p.totalSemST || 0) + (p.totalST || 0));
    p.totalPedido = totalComST ? totalComSTValor : r2(p.totalSemST || 0);
    // Igual ao Ativo: comissão do título = Recebido × (comissão dos itens ÷ Total pedido), SEM arredondar a proporção.
    // A coluna % Com. só mostra essa proporção com 2 casas (pedido de um item só: o % do fabricante).
    const proporcao = p.totalPedido ? p.comissaoItens / p.totalPedido : 0;
    const perc = p.itens.length === 1 ? p.itens[0].perFabr || 0 : Math.round(proporcao * 100 * 100) / 100;
    for (const pa of p.parcelas) {
      const banco = pa.recebidoBanco;
      // sem ST: tira o ST proporcional da parcela (parcela × ST ÷ total do pedido com ST)
      const recebido = recebidoComST || !p.totalST || !totalComSTValor ? banco : r2(banco - (banco * p.totalST) / totalComSTValor);
      pa.totalPedido = p.totalPedido;
      pa.valorRecebido = recebido;
      pa.percComis = perc;
      pa.valorComissao = roundVBA(recebido * proporcao, 2);
    }
    // Igual ao Ativo: quando a última parcela do pedido (ex.: C/C) está no relatório junto com as anteriores,
    // ela fica com a sobra do arredondamento (comissão do total − comissão das outras parcelas).
    if (p.parcelas.length > 1) {
      const ult = ultimaParcela(p.parcelas);
      if (ult && parcelaFinal(ult.documento)) {
        const somaReceb = p.parcelas.reduce((x, pa) => x + pa.valorRecebido, 0);
        const outras = p.parcelas.filter((pa) => pa !== ult).reduce((x, pa) => x + pa.valorComissao, 0);
        ult.valorComissao = r2(roundVBA(somaReceb * proporcao, 2) - outras);
      }
    }
    for (const pa of p.parcelas) {
      p.recebido = r2(p.recebido + pa.valorRecebido);
      p.comissao = r2(p.comissao + pa.valorComissao);
    }
  }

  const totais = {
    pedidos: lista.filter((p) => p.parcelas.length).length,
    parcelas: lista.reduce((s, p) => s + p.parcelas.length, 0),
    itens: lista.reduce((s, p) => s + p.itens.length, 0),
    // chave "Total pedido somado por baixa": ligada = soma em cada baixa (como a planilha); desligada = cada pedido uma vez
    totalPedidos: r2(lista.reduce((s, p) => s + (somaPorBaixa ? p.parcelas.length : p.parcelas.length ? 1 : 0) * p.totalPedido, 0)),
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
