// Cálculo do score, perfil, limite, prazos, grupo e alertas a partir das linhas do SQL.
// O score depende só dos dados do próprio cliente (histórico completo), então é
// calculado direto nas linhas filtradas.

const n = (v) => (v === null || v === undefined || isNaN(Number(v)) ? 0 : Number(v));
const temValor = (v) => v !== null && v !== undefined && !isNaN(Number(v));

// Valor que cada critério avalia (null = sem valor -> usa o "padrao", igual ao NULLIF do SQL)
const VALORES = {
  faturamento: (m) => n(m.TotalCompradoHistorico),
  tempo: (m) => n(m.MesesRelacionamento),
  ticket: (m) => (n(m.QtdPedidosVenda) ? n(m.TotalCompradoHistorico) / n(m.QtdPedidosVenda) : null),
  pagamento: (m) => n(m.AtrasoMedioScore),                       // ISNULL(am.AtrasoMedioDias, 0)
  volume: (m) => n(m.ParcelasPagasJanela),
  frequencia: (m) => n(m.QtdPedidosVenda),
  recencia: (m) => (temValor(m.DiasSemComprar) ? Number(m.DiasSemComprar) : 999999), // ISNULL(UltimaCompra, '1900-01-01')
  crescimento: (m) => (n(m.MediaCompra) ? n(m.MaiorCompra) / n(m.MediaCompra) : null)
};

function compara(v, op, alvo) {
  const a = Number(alvo);
  switch (op) {
    case '>': return v > a;
    case '>=': return v >= a;
    case '<': return v < a;
    case '<=': return v <= a;
    case '=': return v === a;
    default: return false;
  }
}

function avaliar(valor, crit) {
  if (valor === null || valor === undefined || isNaN(valor)) return Number(crit.padrao) || 0;
  for (const fx of crit.faixas || []) {
    if (compara(valor, fx.op, fx.valor)) return Number(fx.pontos) || 0;
  }
  return Number(crit.padrao) || 0;
}

function pontuacaoMaxima(regras) {
  return (regras.criterios || []).reduce((s, c) => {
    const max = Math.max(Number(c.padrao) || 0, ...(c.faixas || []).map((x) => Number(x.pontos) || 0));
    return s + max;
  }, 0);
}

const porMinimo = (lista, score) =>
  [...(lista || [])].sort((a, b) => Number(b.min) - Number(a.min)).find((x) => score >= Number(x.min)) || null;

function classificarAtraso(m, al) {
  if (!temValor(m.AtrasoMedioScore)) return 'Sem Histórico';
  const d = Math.ceil(Number(m.AtrasoMedioScore));
  if (d <= al.atrasoExcelente) return 'Excelente';
  if (d <= al.atrasoBom) return 'Bom';
  if (d <= al.atrasoMedio) return 'Médio';
  return 'Ruim';
}

function alertaInatividade(m, al) {
  if (!temValor(m.DiasSemComprar)) return { texto: 'Sem compras', nivel: 'sem' };
  const d = Number(m.DiasSemComprar);
  if (d > al.inatividadeCritico) return { texto: `CRÍTICO: Inativo > ${Math.round(al.inatividadeCritico / 30)} meses`, nivel: 'critico' };
  if (d > al.inatividadeAtencao) return { texto: `ATENÇÃO: Inativo > ${Math.round(al.inatividadeAtencao / 30)} meses`, nivel: 'atencao' };
  return { texto: 'Ativo', nivel: 'ok' };
}

function alertaExposicao(m, al) {
  if (!(n(m.LimiteAtual) > 0)) return { texto: 'Sem limite', nivel: 'sem' };
  const p = n(m.PercentualUsoLimite);
  if (p > al.usoLimiteRisco) return { texto: 'RISCO: Limite Esgotado', nivel: 'critico' };
  if (p > al.usoLimiteAtencao) return { texto: 'ATENÇÃO: Uso Elevado', nivel: 'atencao' };
  return { texto: 'Normal', nivel: 'ok' };
}

// (vendas a prazo ÷ meses) × fator × multiplicador pelo atraso médio (bruto, sem arredondar)
function limitePorPeriodo(m, lp) {
  const meses = n(m.MesesPeriodo);
  if (!meses) return 0;
  const at = m.AtrasoMedioScore;
  const mult = !temValor(at) ? lp.semHistorico : Number(at) <= 1 ? lp.ate1 : Number(at) <= 5 ? lp.ate5 : Number(at) <= 15 ? lp.ate15 : lp.acima;
  const v = (n(m.TotalVendidoPrazo) / meses) * n(lp.fatorPrazo) * n(mult);
  return Math.round(v * 100) / 100;
}

// linhas: resultado do SQL; devolve as mesmas linhas com score, perfil, grupo e alertas
function calcularScores(linhas, regras) {
  const al = regras.alertas || {};
  return linhas.map((m) => {
    const inadimplente = n(m.ValorInadimplente) > 0;
    const pontos = {};
    const valores = {};
    let soma = 0;
    for (const crit of regras.criterios || []) {
      const fn = VALORES[crit.id];
      if (!fn) continue;
      const v = fn(m);
      valores[crit.id] = crit.id === 'recencia' && !temValor(m.DiasSemComprar) ? null : v;
      const p = crit.id === 'pagamento' && inadimplente ? Number(crit.padrao) || 0 : avaliar(v, crit);
      pontos[crit.id] = p;
      soma += p;
    }
    const score = inadimplente && regras.zerarSeInadimplente ? 0 : soma;

    const fx = porMinimo(regras.faixasScore, score) || { perfil: '-', prazoSugerido: 0, prazos: [], limites: [], limitePadrao: 0 };
    let limite = Number(fx.limitePadrao) || 0;
    for (const lm of fx.limites || []) {
      if (compara(n(m.TotalCompradoHistorico), lm.op, lm.valor)) { limite = Number(lm.limite) || 0; break; }
    }
    const grupo = porMinimo(regras.grupos, score);
    const prazos = fx.prazos || [];
    const inat = alertaInatividade(m, al);
    const expo = alertaExposicao(m, al);

    return {
      ...m,
      ScoreCredito: score,
      Pontos: pontos,
      ValoresCriterios: valores,
      GrupoRanking: grupo ? grupo.grupo : null,
      ObservacaoCredito: grupo ? grupo.observacao : '',
      PerfilCredito: fx.perfil,
      LimiteSugerido: limite,                                  // pelo score (faixas)
      LimiteSugeridoPeriodo: limitePorPeriodo(m, regras.limitePeriodo || {}), // pelo período (matemática)
      PrazoSugeridoDias: Number(fx.prazoSugerido) || 0,
      Prazo1: prazos[0] || 'N/A',
      Prazo2: prazos[1] || 'N/A',
      Prazo3: prazos[2] || 'N/A',
      Prazo4: prazos[3] || 'N/A',
      Prazo5: prazos[4] || 'N/A',
      PosicaoMercado: score === 0 ? 'INADIMPLENTE' : score < n(al.riscoAlto) ? 'RISCO ALTO' : 'Base',
      ClassificacaoAtraso: classificarAtraso(m, al),
      AlertaInatividade: inat.texto,
      NivelInatividade: inat.nivel,
      AlertaExposicao: expo.texto,
      NivelExposicao: expo.nivel
    };
  });
}

module.exports = { calcularScores, pontuacaoMaxima };
