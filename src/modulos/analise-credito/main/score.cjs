// Cálculo do score, perfil, limite, prazos e ranking a partir das métricas do SQL.

const n = (v) => (v === null || v === undefined || isNaN(Number(v)) ? 0 : Number(v));

// Valor que cada critério avalia (null = sem valor -> usa o "padrao", igual ao NULLIF do SQL)
const VALORES = {
  faturamento: (m) => n(m.TotalComprado),
  tempo: (m) => n(m.MesesRelacionamento),
  ticket: (m) => (n(m.QtdPedidosVenda) ? n(m.TotalComprado) / n(m.QtdPedidosVenda) : null),
  pagamento: (m) => n(m.AtrasoMedioDias),
  volume: (m) => n(m.TotalParcelasPagas),
  frequencia: (m) => n(m.QtdPedidosVenda),
  recencia: (m) => n(m.DiasUltimaCompra),
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

function faixaDoScore(score, regras) {
  const faixas = [...(regras.faixasScore || [])].sort((a, b) => b.min - a.min);
  return faixas.find((fx) => score >= Number(fx.min)) || faixas[faixas.length - 1];
}

function posicaoMercado(score, pr) {
  if (score === 0) return 'INADIMPLENTE - Não liberar crédito';
  if (score < 30) return 'RISCO ALTO - Avaliar com cautela';
  if (pr >= 0.8) return 'Top 20% melhores clientes';
  if (pr >= 0.6) return 'Acima da média (20-40%)';
  if (pr >= 0.4) return 'Na média (40-60%)';
  if (pr >= 0.2) return 'Abaixo da média (60-80%)';
  return 'Base da pirâmide (últimos 20%)';
}

// metricas: linhas de METRICAS (todos os clientes). Retorna Map(codigo -> resultado)
function calcularScores(metricas, regras) {
  const res = metricas.map((m) => {
    const inadimplente = n(m.ValorInadimplente) > 0;
    const pontos = {};
    const valores = {};
    let soma = 0;
    for (const crit of regras.criterios || []) {
      const fn = VALORES[crit.id];
      if (!fn) continue;
      const v = fn(m);
      valores[crit.id] = v;
      const p = crit.id === 'pagamento' && inadimplente ? Number(crit.padrao) || 0 : avaliar(v, crit);
      pontos[crit.id] = p;
      soma += p;
    }
    const score = inadimplente && regras.zerarSeInadimplente ? 0 : soma;
    return { codigo: String(m.ClienteID).trim(), score, pontos, valores, totalComprado: n(m.TotalComprado) };
  });

  // Correção #2: percentil ascendente (o melhor cliente fica perto de 1)
  const total = res.length;
  const asc = res.map((r) => r.score).sort((a, b) => a - b);
  const primeiraPos = new Map();
  asc.forEach((s, i) => { if (!primeiraPos.has(s)) primeiraPos.set(s, i); });

  // NTILE(5) ordenado do maior para o menor score (1 = melhores)
  const desc = [...res].sort((a, b) => b.score - a.score || a.codigo.localeCompare(b.codigo));
  const base = Math.floor(total / 5);
  const resto = total % 5;
  const quintil = new Map();
  let idx = 0;
  for (let g = 1; g <= 5; g++) {
    const tam = base + (g <= resto ? 1 : 0);
    for (let k = 0; k < tam; k++) quintil.set(desc[idx++].codigo, g);
  }

  const mapa = new Map();
  for (const r of res) {
    const pr = total > 1 ? primeiraPos.get(r.score) / (total - 1) : 0;
    const fx = faixaDoScore(r.score, regras) || { perfil: '-', observacao: '', prazoSugerido: 0, prazos: [], limites: [], limitePadrao: 0 };
    let limite = Number(fx.limitePadrao) || 0;
    for (const lm of fx.limites || []) {
      if (compara(r.totalComprado, lm.op, lm.valor)) { limite = Number(lm.limite) || 0; break; }
    }
    const prazos = fx.prazos || [];
    mapa.set(r.codigo, {
      ScoreCredito: r.score,
      Pontos: r.pontos,
      ValoresCriterios: r.valores,
      PercentilRank: pr,
      GrupoRanking: quintil.get(r.codigo) || null,
      PerfilCredito: fx.perfil,
      LimiteSugerido: limite,
      PrazoSugeridoDias: Number(fx.prazoSugerido) || 0,
      ObservacaoCredito: fx.observacao,
      Prazo1: prazos[0] || 'N/A',
      Prazo2: prazos[1] || 'N/A',
      Prazo3: prazos[2] || 'N/A',
      Prazo4: prazos[3] || 'N/A',
      Prazo5: prazos[4] || 'N/A',
      PosicaoMercado: posicaoMercado(r.score, pr)
    });
  }
  return { mapa, totalClientes: total, pontuacaoMaxima: pontuacaoMaxima(regras) };
}

module.exports = { calcularScores, pontuacaoMaxima };
