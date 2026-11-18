// Regras da planilha COBRANCA2.0 (CarregarDadosDashboard) portadas para JS.
import { arred2, diasEntre, somarDias } from './formato.js';

export const FAIXA = {
  HOJE: 'hoje',
  PROX: 'prox',
  AVENCER: 'avencer',
  V1: 'v1',
  V2: 'v2',
  V3: 'v3',
  V4: 'v4',
};

export function rotulosFaixas(f) {
  return {
    hoje: 'Vence hoje',
    prox: `Próximos ${f.proximosDias} dias`,
    avencer: 'A vencer',
    v1: `Vencido 1–${f.limite1}`,
    v2: `Vencido ${f.limite1 + 1}–${f.limite2}`,
    v3: `Vencido ${f.limite2 + 1}–${f.limite3}`,
    v4: `Vencido +${f.limite3}`,
  };
}

export const ACAO_RECOMENDADA = {
  hoje: 'Lembrete / E-mail',
  prox: 'Lembrete / E-mail',
  avencer: 'Lembrete / E-mail',
  v1: 'Ligar / E-mail',
  v2: 'Cobrança ativa / E-mail',
  v3: 'Notificar / E-mail',
  v4: 'Protesto / E-mail',
};

export function ehVencido(faixa) {
  return faixa === 'v1' || faixa === 'v2' || faixa === 'v3' || faixa === 'v4';
}

export function classificarFaixa(dias, dataVen, hoje, f) {
  if (dataVen === hoje) return FAIXA.HOJE;
  if (dias <= 0) {
    // a vencer
    return diasEntre(hoje, dataVen) <= f.proximosDias ? FAIXA.PROX : FAIXA.AVENCER;
  }
  if (dias <= f.limite1) return FAIXA.V1;
  if (dias <= f.limite2) return FAIXA.V2;
  if (dias <= f.limite3) return FAIXA.V3;
  return FAIXA.V4;
}

// Parcela: letra depois da barra do documento (A=1, B=2...), senão NroParc
export function numeroParcela(docPag, nroParc) {
  const doc = String(docPag ?? '').trim();
  const i = doc.indexOf('/');
  if (i >= 0) {
    const letra = doc.charAt(i + 1).toUpperCase();
    if (letra >= 'A' && letra <= 'Z') return letra.charCodeAt(0) - 64;
  }
  const n = Number(nroParc);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// Um título do ERP -> título com juros, valor atual, faixa e ação
export function calcularTitulo(linha, hoje, f) {
  const valor = Number(linha.ValPre) || 0;
  const taxa = Number(linha.Juros_Dia) || 0;
  const multaBanco = Number(linha.ValorMulta) || 0;
  const dataVen = String(linha.DataVen).slice(0, 10);
  const atraso = diasEntre(dataVen, hoje);
  const dias = atraso > 0 ? atraso : 0;

  let juros = 0;
  let multa = 0;
  let valorAtual = valor;
  if (dias > 0) {
    juros = arred2(valor * (taxa / 100) * dias);
    multa = arred2(multaBanco);
    valorAtual = arred2(valor + juros + multa);
  }
  const faixa = classificarFaixa(dias, dataVen, hoje, f);

  return {
    codigo: String(linha.Codigo ?? '').trim(),
    nome: String(linha.Nome_Fanta ?? '').trim(),
    documentoCliente: String(linha.NroInsc ?? '').trim(),
    telefone: String(linha.Tel ?? '').trim(),
    email: String(linha.email ?? '').trim(),
    docPag: String(linha.DocPag ?? '').trim(),
    tipoDoc: String(linha.Abrev_Doc ?? '').trim(),
    nf: linha.NroNF ?? '',
    parcela: numeroParcela(linha.DocPag, linha.NroParc),
    vendedor: String(linha.Vendedor ?? '').trim(),
    emissao: linha.DataEmi ? String(linha.DataEmi).slice(0, 10) : '',
    vencimento: dataVen,
    valor: arred2(valor),
    taxaJurosDia: taxa,
    juros,
    multa,
    multaCadastrada: arred2(multaBanco),
    valorAtual,
    dias,
    faixa,
    acao: ACAO_RECOMENDADA[faixa],
    protestado: Boolean(Number(linha.Protestado)) || linha.Protestado === true,
  };
}

// Último registro por documento e por cliente (registros vêm da nuvem)
export function indexarRegistros(registros) {
  const porDoc = new Map();
  const porCliente = new Map();
  const ordenados = [...(registros || [])].sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
  for (const r of ordenados) {
    const doc = String(r.documento || '').trim().toUpperCase();
    if (doc && !porDoc.has(doc)) porDoc.set(doc, r);
    const cli = String(r.cliente_codigo || '').trim();
    if (cli && !porCliente.has(cli)) porCliente.set(cli, r);
  }
  return { porDoc, porCliente };
}

export function marcaDoRegistro(reg, resultados) {
  if (!reg) return '';
  const sit = String(reg.situacao_descricao || '').toUpperCase();
  const res = (resultados || []).find((x) => x.codigo === reg.resultado_codigo);
  if (sit.includes('ACORDO') || res?.marca === 'acordo') return 'acordo';
  if (sit.includes('NEGOCIA') || res?.marca === 'negociacao') return 'negociacao';
  return '';
}

// Título escondido por ter retorno marcado para depois de hoje
export function agendadoFuturo(t, idx, ultimoErpPorCliente, hoje) {
  const reg = idx.porDoc.get(t.docPag.toUpperCase());
  if (reg) {
    return Boolean(reg.proxima && reg.data_prevista && String(reg.data_prevista).slice(0, 10) > hoje);
  }
  // Sem registro do documento na nuvem: vale a agenda do ERP para o cliente,
  // desde que o cliente não tenha nenhum registro na nuvem (igual à planilha)
  if (idx.porCliente.has(t.codigo)) return false;
  const erp = ultimoErpPorCliente?.get(t.codigo);
  return Boolean(erp?.proximoContato && String(erp.proximoContato).slice(0, 10) > hoje);
}

/**
 * Processa todos os títulos do ERP e devolve títulos enriquecidos, KPIs e
 * contagens das faixas.
 */
export function processarCarteira({ linhas, hoje, config, registros, ultimoErpPorCliente }) {
  const f = config.faixas;
  const idx = indexarRegistros(registros);
  const titulos = (linhas || []).map((l) => {
    const t = calcularTitulo(l, hoje, f);
    const reg = idx.porDoc.get(t.docPag.toUpperCase());
    t.ultimoRegistro = reg || null;
    t.marca = marcaDoRegistro(reg, config.resultados);
    t.agendadoFuturo = agendadoFuturo(t, idx, ultimoErpPorCliente, hoje);
    const erp = ultimoErpPorCliente?.get(t.codigo);
    t.ultimaCobrancaErp = erp || null;
    return t;
  });

  const kpis = calcularKpis(titulos);
  const contagens = contarFaixas(titulos);
  return { titulos, kpis, contagens, indice: idx };
}

export function calcularKpis(titulos) {
  let total = 0, vencido = 0, aVencer = 0, juros = 0, multas = 0, perda = 0;
  let somaDias = 0, qtdVencidos = 0, qtdMais = 0, maiorAtraso = 0;
  const clientes = new Set();
  const clientesVencidos = new Set();
  const devedores = new Map();

  for (const t of titulos) {
    total += t.valorAtual;
    juros += t.juros;
    multas += t.multa;
    clientes.add(t.codigo);
    if (t.dias > maiorAtraso) maiorAtraso = t.dias;
    if (ehVencido(t.faixa)) {
      vencido += t.valorAtual;
      somaDias += t.dias;
      qtdVencidos += 1;
      clientesVencidos.add(t.codigo);
      const d = devedores.get(t.codigo) || { codigo: t.codigo, nome: t.nome, valor: 0 };
      d.valor += t.valorAtual;
      devedores.set(t.codigo, d);
    } else {
      aVencer += t.valorAtual;
    }
    if (t.faixa === 'v4') { perda += t.valorAtual; qtdMais += 1; }
  }

  let maior = null;
  for (const d of devedores.values()) if (!maior || d.valor > maior.valor) maior = d;

  const qtd = titulos.length;
  return {
    total: arred2(total),
    vencido: arred2(vencido),
    aVencer: arred2(aVencer),
    percVencido: total > 0 ? (vencido / total) * 100 : 0,
    clientes: clientes.size,
    documentos: qtd,
    mediaAtraso: qtdVencidos > 0 ? somaDias / qtdVencidos : 0,
    valorMedio: qtd > 0 ? total / qtd : 0,
    perdaEstimada: arred2(perda),
    percPerda: qtd > 0 ? (qtdMais / qtd) * 100 : 0,
    juros: arred2(juros),
    multas: arred2(multas),
    maiorDevedor: maior ? { ...maior, valor: arred2(maior.valor), perc: vencido > 0 ? (maior.valor / vencido) * 100 : 0 } : null,
    clientesVencidos: clientesVencidos.size,
    titulosVencidos: qtdVencidos,
    maiorAtraso,
  };
}

const vazio = () => ({ clientes: new Set(), titulos: 0, valor: 0 });

export function contarFaixas(titulos) {
  const c = {
    todos: vazio(), hoje: vazio(), avencer: vazio(), prox: vazio(),
    v1: vazio(), v2: vazio(), v3: vazio(), v4: vazio(), acordo: vazio(), negociacao: vazio(),
  };
  const add = (k, t) => { c[k].clientes.add(t.codigo); c[k].titulos += 1; c[k].valor += t.valorAtual; };
  for (const t of titulos) {
    add('todos', t);
    if (t.faixa === 'hoje') { add('hoje', t); add('avencer', t); }
    else if (t.faixa === 'prox') { add('prox', t); add('avencer', t); }
    else if (t.faixa === 'avencer') add('avencer', t);
    else add(t.faixa, t);
    if (t.marca === 'acordo') add('acordo', t);
    if (t.marca === 'negociacao') add('negociacao', t);
  }
  const saida = {};
  for (const [k, v] of Object.entries(c)) saida[k] = { clientes: v.clientes.size, titulos: v.titulos, valor: arred2(v.valor) };
  return saida;
}

export function filtrarPorFaixa(t, filtro) {
  switch (filtro) {
    case 'todos':
    case 'top10': return true;
    case 'hoje': return t.faixa === 'hoje';
    case 'avencer': return t.faixa === 'hoje' || t.faixa === 'prox' || t.faixa === 'avencer';
    case 'prox': return t.faixa === 'prox';
    case 'acordo': return t.marca === 'acordo';
    case 'negociacao': return t.marca === 'negociacao';
    default: return t.faixa === filtro;
  }
}

export function combinaBusca(t, termo) {
  const s = String(termo || '').trim();
  if (!s) return true;
  const so = s.replace(/\D/g, '');
  const up = s.toUpperCase();
  if (t.nome.toUpperCase().includes(up)) return true;
  if (t.docPag.toUpperCase().includes(up)) return true;
  if (so) {
    if (t.codigo.replace(/\D/g, '').includes(so)) return true;
    if (t.documentoCliente.replace(/\D/g, '').includes(so)) return true;
    if (String(t.nf).includes(so)) return true;
  }
  return false;
}

// Agrupa por cliente, na ordem do nome (como a planilha)
export function agruparPorCliente(titulos) {
  const mapa = new Map();
  for (const t of titulos) {
    let g = mapa.get(t.codigo);
    if (!g) {
      g = {
        codigo: t.codigo, nome: t.nome, documentoCliente: t.documentoCliente,
        telefone: t.telefone, email: t.email, titulos: [],
        valor: 0, valorAtual: 0, vencido: 0, maiorAtraso: 0,
      };
      mapa.set(t.codigo, g);
    }
    g.titulos.push(t);
    g.valor += t.valor;
    g.valorAtual += t.valorAtual;
    if (ehVencido(t.faixa)) g.vencido += t.valorAtual;
    if (t.dias > g.maiorAtraso) g.maiorAtraso = t.dias;
  }
  const grupos = [...mapa.values()];
  for (const g of grupos) {
    g.valor = arred2(g.valor); g.valorAtual = arred2(g.valorAtual); g.vencido = arred2(g.vencido);
    g.titulos.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  }
  grupos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return grupos;
}

// Top 10: maior valor vencido; empate pelo maior atraso. Só títulos vencidos.
export function top10(titulos) {
  const grupos = agruparPorCliente(titulos.filter((t) => ehVencido(t.faixa)));
  grupos.sort((a, b) => (b.vencido - a.vencido) || (b.maiorAtraso - a.maiorAtraso));
  return grupos.slice(0, 10);
}

export function montarLista({ titulos, filtro, busca, mostrarAgendados }) {
  if (filtro === 'top10') return top10(titulos.filter((t) => combinaBusca(t, busca)));
  const lista = titulos.filter((t) =>
    filtrarPorFaixa(t, filtro) && combinaBusca(t, busca) && (mostrarAgendados || !t.agendadoFuturo));
  return agruparPorCliente(lista);
}

export function contarOcultosAgendados(titulos, filtro, busca) {
  if (filtro === 'top10') return 0;
  return titulos.filter((t) => t.agendadoFuturo && filtrarPorFaixa(t, filtro) && combinaBusca(t, busca)).length;
}

// Agendados para hoje: último registro do documento com data prevista = hoje
export function agendadosHoje(titulos, hoje) {
  return titulos
    .filter((t) => t.ultimoRegistro?.proxima && String(t.ultimoRegistro.data_prevista || '').slice(0, 10) === hoje)
    .sort((a, b) => String(a.ultimoRegistro.hora_prevista || '99:99').localeCompare(String(b.ultimoRegistro.hora_prevista || '99:99')));
}

// Títulos a vencer de amanhã até hoje + N dias (regra do disparo em lote)
export function titulosDisparoLote(titulos, hoje, dias) {
  const limite = somarDias(hoje, dias);
  return titulos.filter((t) => t.vencimento > hoje && t.vencimento <= limite);
}

// Resumo de ligações por operador, a partir dos registros da nuvem
export function resumoLigacoes(registros, resultados) {
  const tipo = new Map((resultados || []).map((r) => [r.codigo, r.ligacao]));
  const ops = new Map();
  for (const r of registros || []) {
    const t = tipo.get(r.resultado_codigo);
    if (t !== 'atendida' && t !== 'nao_atendida') continue;
    const op = r.operador_nome || '(sem operador)';
    const o = ops.get(op) || { operador: op, atendidas: 0, naoAtendidas: 0 };
    if (t === 'atendida') o.atendidas += 1; else o.naoAtendidas += 1;
    ops.set(op, o);
  }
  const linhas = [...ops.values()].map((o) => ({
    ...o, total: o.atendidas + o.naoAtendidas,
    taxa: o.atendidas + o.naoAtendidas > 0 ? (o.atendidas / (o.atendidas + o.naoAtendidas)) * 100 : 0,
  })).sort((a, b) => b.total - a.total);
  const tot = linhas.reduce((acc, l) => ({ atendidas: acc.atendidas + l.atendidas, naoAtendidas: acc.naoAtendidas + l.naoAtendidas }), { atendidas: 0, naoAtendidas: 0 });
  const total = tot.atendidas + tot.naoAtendidas;
  return { linhas, total: { ...tot, total, taxa: total > 0 ? (tot.atendidas / total) * 100 : 0 } };
}
