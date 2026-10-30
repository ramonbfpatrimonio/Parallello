// Status de um indicador em relação à meta (mesma regra de src/lib/status.js)
function status(valor, m) {
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

const ROTULO = { ok: 'META ATINGIDA', atencao: 'ALERTA', critico: 'CRÍTICO' };

function fmtLimite(v, tipo) {
  if (tipo === 'pct') return (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
  if (tipo === 'moeda') return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' dias';
}

function faixas(m, tipo) {
  const maior = m.melhor === 'maior';
  const a = fmtLimite(m.meta, tipo);
  const b = fmtLimite(m.atencao, tipo);
  return {
    ok: maior ? `>= ${a}` : `até ${a}`,
    atencao: maior ? `de ${b} até ${a}` : `de ${a} até ${b}`,
    critico: maior ? `abaixo de ${b}` : `acima de ${b}`
  };
}

// Legenda no formato dos comentários da planilha
function legenda(m, tipo) {
  if (!m || !m.ativo) return '';
  const t = m.textos || {};
  const f = faixas(m, tipo);
  return [
    `META ATINGIDA (Verde): ${f.ok}`, t.ok || '', '',
    `ALERTA (Laranja): ${f.atencao}`, t.atencao || '', '',
    `CRÍTICO (Vermelho): ${f.critico}`, t.critico || ''
  ].join('\n');
}

module.exports = { status, ROTULO, legenda, faixas };
