// Montagem das mensagens de e-mail e WhatsApp (modelos editáveis).
import { arred2, dataBR, diasEntre, moeda, somarDias } from './formato.js';
import { ehVencido, rotulosFaixas } from './calculos.js';
import { gerarPixCopiaCola, pixConfigurado } from './pix.js';

const LINHA = '--------------------------------------------------';

export function preencher(texto, vars) {
  return String(texto || '').replace(/\{([a-z0-9_]+)\}/gi, (m, k) => (k in vars ? String(vars[k] ?? '') : m));
}

export function nomeEmpresa(config, empresaErp) {
  return (config.financeiro.nomeEmpresa || empresaErp?.nome || config.financeiro.setor || 'Departamento Financeiro').trim();
}

export function emailFinanceiro(config, empresaErp) {
  return (config.financeiro.email || empresaErp?.email || '').trim();
}

function varsBase(ctx) {
  const f = ctx.config.faixas;
  const r = rotulosFaixas(f);
  return {
    empresa: nomeEmpresa(ctx.config, ctx.empresaErp),
    email_financeiro: emailFinanceiro(ctx.config, ctx.empresaErp),
    proximos_dias: f.proximosDias,
    limite1: f.limite1,
    limite2: f.limite2,
    limite3: f.limite3,
    faixa3: r.v3,
    data_limite: dataBR(somarDias(ctx.hoje, 5)),
    hoje: dataBR(ctx.hoje),
  };
}

export function blocoTitulo(t) {
  return [
    `Título / Documento: ${t.docPag}`,
    `Data de Vencimento: ${dataBR(t.vencimento)}`,
    `Valor Original: ${moeda(t.valor)}`,
    `Dias em Atraso: ${t.dias} dias`,
    `Juros e Multa: ${moeda(t.juros + t.multa)}`,
    `Valor Atualizado: ${moeda(t.valorAtual)}`,
  ].join('\n');
}

export function blocoAVencer(t, hoje) {
  return [
    `Título / Documento: ${t.docPag}`,
    `Data de Vencimento: ${dataBR(t.vencimento)} (${diasEntre(hoje, t.vencimento)} dias)`,
    `Valor Original: ${moeda(t.valor)}`,
  ].join('\n');
}

// Rodapé com contato do financeiro, dados bancários e PIX
export function montarRodape(ctx, formato = 'email', valorPix = 0) {
  const fin = ctx.config.financeiro;
  const n = formato === 'whatsapp' ? (s) => `*${s}*` : (s) => s;
  const linha = (rot, v) => (String(v || '').trim() ? `${rot}: ${String(v).trim()}\n` : '');
  let r = `\n${LINHA}\n${n('CONTATO DO FINANCEIRO')}\n`;
  r += linha('Setor', fin.setor);
  r += linha('E-mail', emailFinanceiro(ctx.config, ctx.empresaErp));
  r += linha('Telefone/WhatsApp', fin.telefone);
  r += linha('Atendimento', fin.horario);

  if (fin.incluirDadosBancarios) {
    const banco = linha('Banco', fin.banco) + linha('Agência', fin.agencia) + linha('Conta', fin.conta)
      + linha('Tipo', fin.tipoConta) + linha('Titular', fin.titular) + linha('CNPJ', fin.cnpjTitular);
    if (banco) r += `\n${n('DADOS BANCÁRIOS')}\n${banco}`;
    if (pixConfigurado(fin)) {
      r += `\n${n('PIX')}\n`;
      r += linha('Tipo da chave', fin.tipoChavePix);
      r += linha('Chave', fin.chavePix);
      const cc = gerarPixCopiaCola(fin, fin.pixComValorDoTitulo ? valorPix : 0);
      if (cc) {
        if (fin.pixComValorDoTitulo && valorPix > 0) r += linha('Valor', moeda(valorPix));
        r += `\n${n('PIX Copia e Cola')}\n${cc}\n`;
      }
    }
  }
  if (String(fin.mensagemAdicional || '').trim()) r += `\n${fin.mensagemAdicional.trim()}\n`;
  return r;
}

export function pixDaMensagem(ctx, valor) {
  const fin = ctx.config.financeiro;
  if (!fin.incluirDadosBancarios || !pixConfigurado(fin)) return '';
  return gerarPixCopiaCola(fin, fin.pixComValorDoTitulo ? valor : 0);
}

export function modeloPorFaixa(faixa) {
  return {
    hoje: 'vence_hoje', prox: 'prox7', avencer: 'notificacao',
    v1: 'vencido_1', v2: 'vencido_2', v3: 'vencido_3', v4: 'vencido_4',
  }[faixa] || 'notificacao';
}

// E-mail de um título
export function montarEmailTitulo(t, ctx, chaveModelo) {
  const chave = chaveModelo || modeloPorFaixa(t.faixa);
  const m = ctx.config.modelos[chave];
  const r = rotulosFaixas(ctx.config.faixas);
  const vars = {
    ...varsBase(ctx),
    cliente: t.nome,
    documento: t.docPag,
    vencimento: dataBR(t.vencimento),
    valor: moeda(t.valorAtual),
    valor_original: moeda(t.valor),
    valor_atualizado: moeda(t.valorAtual),
    dias: t.dias,
    encargos: moeda(t.juros + t.multa),
    faixa: r[t.faixa],
    bloco_titulo: blocoTitulo(t),
  };
  return {
    chaveModelo: chave,
    assunto: preencher(m.assunto, vars),
    corpo: preencher(m.corpo, vars) + montarRodape(ctx, 'email', t.valorAtual),
    valorPix: t.valorAtual,
  };
}

function tituloFaixaEmail(fx, f) {
  if (fx === 'v4') return `TÍTULOS EM ATRASO (+${f.limite3} DIAS)`;
  if (fx === 'v3') return `TÍTULOS VENCIDOS DE ${f.limite2 + 1} A ${f.limite3} DIAS`;
  if (fx === 'v2') return `TÍTULOS VENCIDOS DE ${f.limite1 + 1} A ${f.limite2} DIAS`;
  return `TÍTULOS VENCIDOS DE 1 A ${f.limite1} DIAS`;
}

// E-mail com todos os títulos vencidos do cliente, agrupados por faixa
export function montarEmailTodos(grupo, ctx) {
  const vencidos = grupo.titulos.filter((t) => ehVencido(t.faixa));
  if (!vencidos.length) return null;
  const ordem = ['v4', 'v3', 'v2', 'v1'];
  let blocos = '';
  let total = 0;
  for (const fx of ordem) {
    const lista = vencidos.filter((t) => t.faixa === fx);
    if (!lista.length) continue;
    const sub = arred2(lista.reduce((s, t) => s + t.valorAtual, 0));
    total += sub;
    blocos += `*** ${tituloFaixaEmail(fx, ctx.config.faixas)} ***\n\n`;
    blocos += lista.map((t) => `${blocoTitulo(t)}\n${LINHA}\n`).join('\n');
    blocos += `\nSubtotal: ${moeda(sub)}\n\n`;
  }
  total = arred2(total);
  const temProtesto = vencidos.some((t) => t.faixa === 'v4');
  const temUrgente = vencidos.some((t) => t.faixa === 'v3');
  const m = ctx.config.modelos.email_todos;
  const vars = {
    ...varsBase(ctx),
    cliente: grupo.nome,
    blocos_por_faixa: blocos,
    aviso_protesto: temProtesto ? preencher(ctx.config.modelos.aviso_protesto.corpo, varsBase(ctx)) : '',
    total: moeda(total),
  };
  const assunto = temProtesto ? m.assuntoProtesto : temUrgente ? m.assuntoUrgente : m.assunto;
  return {
    chaveModelo: 'email_todos',
    assunto: preencher(assunto, vars),
    corpo: preencher(m.corpo, vars) + montarRodape(ctx, 'email', total),
    valorPix: total,
    documentos: vencidos.map((t) => t.docPag),
  };
}

// WhatsApp com os títulos escolhidos
export function montarWhatsApp(grupo, titulos, ctx) {
  const total = arred2(titulos.reduce((s, t) => s + t.valorAtual, 0));
  const blocos = titulos.map((t) => [
    `Título / Documento: ${t.docPag}`,
    `Data de Vencimento: ${dataBR(t.vencimento)}`,
    `Valor Original: ${moeda(t.valor)}`,
    `Dias em Atraso: ${t.dias} dias`,
    `Juros e Multa: ${moeda(t.juros + t.multa)}`,
    `Valor Atualizado: ${moeda(t.valorAtual)}`,
    '',
    LINHA,
    '',
  ].join('\n')).join('\n');
  const vars = { ...varsBase(ctx), cliente: grupo.nome, blocos_titulos: blocos, total: moeda(total) };
  return {
    texto: preencher(ctx.config.modelos.whatsapp.corpo, vars) + '\n' + montarRodape(ctx, 'whatsapp', total),
    valorPix: total,
  };
}

// E-mail do disparo em lote (títulos a vencer nos próximos dias)
export function montarEmailLote(cliente, titulos, ctx) {
  const blocos = titulos.map((t) => `${blocoAVencer(t, ctx.hoje)}\n${LINHA}\n\n`).join('');
  const total = arred2(titulos.reduce((s, t) => s + t.valor, 0));
  const m = ctx.config.modelos.lote7;
  const vars = { ...varsBase(ctx), cliente: cliente.nome, blocos_a_vencer: blocos, total: moeda(total) };
  return {
    assunto: preencher(m.assunto, vars),
    corpo: preencher(m.corpo, vars) + montarRodape(ctx, 'email', total),
    valorPix: total,
  };
}

export function linkWhatsApp(telefone, texto, modo = 'app') {
  const t = encodeURIComponent(texto);
  return modo === 'web'
    ? `https://wa.me/${telefone}?text=${t}`
    : `whatsapp://send?phone=${telefone}&text=${t}`;
}
