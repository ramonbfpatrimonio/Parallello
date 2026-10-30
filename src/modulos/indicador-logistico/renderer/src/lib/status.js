// Mesma regra de electron/status.js
export function status(valor, m) {
  if (!m || !m.ativo || valor === null || valor === undefined) return null;
  if (m.melhor === 'maior') {
    if (valor >= m.meta) return 'ok';
    if (valor >= m.atencao) return 'atencao';
    return 'critico';
  }
  if (valor <= m.meta) return 'ok';
  if (valor <= m.atencao) return 'atencao';
  return 'critico';
}

export const ROTULO_STATUS = { ok: 'Meta atingida', atencao: 'Alerta', critico: 'Crítico' };

function fmtLimite(v, tipo) {
  if (tipo === 'pct') return (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
  if (tipo === 'moeda') return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' dias';
}

// Faixa de cada status em texto (ex.: ">= 98%", "entre 95% e 98%", "< 95%")
export function faixas(m, tipo) {
  const maior = m.melhor === 'maior';
  const a = fmtLimite(m.meta, tipo);
  const b = fmtLimite(m.atencao, tipo);
  return {
    ok: maior ? `≥ ${a}` : `até ${a}`,
    atencao: maior ? `de ${b} até ${a}` : `de ${a} até ${b}`,
    critico: maior ? `abaixo de ${b}` : `acima de ${b}`
  };
}

// Texto do tooltip (equivalente aos comentários da coluna Status da planilha)
export function legenda(m, tipo, st) {
  if (!m || !m.ativo) return '';
  const f = faixas(m, tipo);
  const t = m.textos || {};
  const linha = (k) => `${ROTULO_STATUS[k].toUpperCase()} (${f[k]}): ${t[k] || ''}`;
  return st ? linha(st) : ['ok', 'atencao', 'critico'].map(linha).join('\n\n');
}

export const INDICADORES = {
  cumprimento: { nome: '% Cumprimento de Entregas', tipo: 'pct', linha: 'cumprimento' },
  prazo: { nome: 'Prazo Médio de Entrega', tipo: 'dec', unid: 'dias', linha: 'prazo' },
  custo: { nome: 'Custo por Entrega', tipo: 'moeda', linha: 'custoEntrega' },
  devolucao: { nome: '% Devoluções', tipo: 'pct', linha: 'devolucao' }
};

export function textoMeta(m, tipo) {
  if (!m || !m.ativo) return 'Sem meta';
  const f = (v) => (tipo === 'pct' ? (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%' : tipo === 'moeda' ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' dias');
  return `Meta ${m.melhor === 'maior' ? '≥' : '≤'} ${f(m.meta)}`;
}
