// Acesso à nuvem (Supabase do Parallello), sempre filtrado pela empresa.
// Roda no processo principal, com o cliente da nuvem já logado (a sessão do Parallello);
// as regras do banco (007_modulo_cobranca.sql) ainda conferem a empresa e a permissão.
const { webcrypto, randomUUID } = require('crypto');
const crypto = { subtle: webcrypto.subtle, randomUUID };

const LOTE = 1000;

async function buscarTudo(montarConsulta) {
  const saida = [];
  for (let de = 0; ; de += LOTE) {
    const { data, error } = await montarConsulta().range(de, de + LOTE - 1);
    if (error) throw new Error(error.message);
    saida.push(...(data || []));
    if (!data || data.length < LOTE) break;
  }
  return saida;
}

function ok({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

async function hashPin(operadorId, pin) {
  const dados = new TextEncoder().encode(`parallello-cobranca|${operadorId}|${String(pin).trim()}`);
  const buf = await crypto.subtle.digest('SHA-256', dados);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function criarNuvemSupabase(supabase, empresaId) {
  if (!supabase) throw new Error('Cliente Supabase não informado.');
  if (!empresaId) throw new Error('Empresa não informada.');
  const emp = String(empresaId);

  return {
    empresaId: emp,

    // ---------- configuração ----------
    async carregarConfig() {
      const data = ok(await supabase.from('cob_config').select('dados').eq('empresa_id', emp).maybeSingle());
      return data?.dados || {};
    },
    async salvarConfig(dados, usuario) {
      ok(await supabase.from('cob_config').upsert({
        empresa_id: emp, dados, atualizado_em: new Date().toISOString(), atualizado_por: usuario || null,
      }));
    },

    // ---------- operadores ----------
    async listarOperadores() {
      return ok(await supabase.from('cob_operadores')
        .select('id,nome,ativo,pode_protestar,pode_disparar_lote,criado_em')
        .eq('empresa_id', emp).order('nome'));
    },
    async salvarOperador({ id, nome, pin, ativo, pode_protestar, pode_disparar_lote }) {
      const nomeLimpo = String(nome || '').trim().toUpperCase();
      if (!nomeLimpo) throw new Error('Informe o nome do operador.');
      const novoId = id || crypto.randomUUID();
      const linha = {
        id: novoId, empresa_id: emp, nome: nomeLimpo, ativo: ativo !== false,
        pode_protestar: Boolean(pode_protestar), pode_disparar_lote: Boolean(pode_disparar_lote),
        atualizado_em: new Date().toISOString(),
      };
      if (pin) linha.pin_hash = await hashPin(novoId, pin);
      if (!id) {
        if (!pin) throw new Error('Informe o PIN do novo operador.');
        ok(await supabase.from('cob_operadores').insert(linha));
      } else {
        ok(await supabase.from('cob_operadores').update(linha).eq('id', id).eq('empresa_id', emp));
      }
      return novoId;
    },
    async excluirOperador(id) {
      ok(await supabase.from('cob_operadores').delete().eq('id', id).eq('empresa_id', emp));
    },
    async entrarComPin(operadorId, pin) {
      const op = ok(await supabase.from('cob_operadores').select('*').eq('id', operadorId).eq('empresa_id', emp).maybeSingle());
      if (!op || !op.ativo) return null;
      const h = await hashPin(op.id, pin);
      if (h !== op.pin_hash) return null;
      const { pin_hash, ...semHash } = op;
      return semHash;
    },

    // ---------- registros ----------
    ultimosRegistrosPorDoc() {
      return buscarTudo(() => supabase.from('cob_ultimo_registro_doc').select('*').eq('empresa_id', emp).order('id'));
    },
    ultimosRegistrosPorCliente() {
      return buscarTudo(() => supabase.from('cob_ultimo_registro_cliente')
        .select('cliente_codigo,criado_em,operador_nome,situacao_descricao,resultado_codigo,resultado_descricao,proxima,data_prevista,hora_prevista,observacao,documento')
        .eq('empresa_id', emp).order('cliente_codigo'));
    },
    async jaRegistradoHoje(documento, dia) {
      const data = ok(await supabase.from('cob_registros').select('id')
        .eq('empresa_id', emp).eq('documento', documento).eq('dia', dia).limit(1));
      return data.length > 0;
    },
    async inserirRegistro(reg) {
      const data = ok(await supabase.from('cob_registros').insert({ ...reg, empresa_id: emp }).select().single());
      return data;
    },
    async atualizarRegistro(id, patch) {
      ok(await supabase.from('cob_registros').update(patch).eq('id', id).eq('empresa_id', emp));
    },
    registrosDoDia(dia) {
      return buscarTudo(() => supabase.from('cob_registros').select('*').eq('empresa_id', emp).eq('dia', dia).order('criado_em'));
    },
    registrosDoPeriodo(de, ate) {
      return buscarTudo(() => supabase.from('cob_registros').select('*').eq('empresa_id', emp)
        .gte('dia', de).lte('dia', ate).order('criado_em'));
    },
    registrosDoCliente(codigo) {
      return buscarTudo(() => supabase.from('cob_registros').select('*').eq('empresa_id', emp)
        .eq('cliente_codigo', codigo).order('criado_em', { ascending: false }));
    },
    registrosPendentesErp() {
      return buscarTudo(() => supabase.from('cob_registros').select('*').eq('empresa_id', emp)
        .eq('erp_gravado', false).order('criado_em'));
    },
    async marcarPagos(docsAbertos) {
      const data = ok(await supabase.rpc('cob_marcar_pagos', { p_empresa: emp, p_docs_abertos: docsAbertos.map((d) => String(d).toUpperCase()) }));
      return data;
    },
    async documentosCobradosPagos() {
      const linhas = await buscarTudo(() => supabase.from('cob_registros').select('documento')
        .eq('empresa_id', emp).eq('titulo_pago', true).order('id'));
      return [...new Set(linhas.map((l) => l.documento))];
    },

    // ---------- eventos (e-mail, WhatsApp, PIX, protesto) ----------
    async inserirEventos(eventos) {
      if (!eventos.length) return;
      ok(await supabase.from('cob_eventos').insert(eventos.map((e) => ({ ...e, empresa_id: emp }))));
    },
    eventosDoCliente(codigo) {
      return buscarTudo(() => supabase.from('cob_eventos').select('*').eq('empresa_id', emp)
        .eq('cliente_codigo', codigo).order('criado_em', { ascending: false }));
    },
    eventosDoLote(loteId) {
      return buscarTudo(() => supabase.from('cob_eventos').select('*').eq('empresa_id', emp).eq('lote_id', loteId).order('criado_em'));
    },
    whatsappPorCliente() {
      return buscarTudo(() => supabase.from('cob_whatsapp_por_cliente').select('cliente_codigo,envios,ultimo').eq('empresa_id', emp).order('cliente_codigo'));
    },
    ultimoEmailPorCliente() {
      return buscarTudo(() => supabase.from('cob_ultimo_email_cliente').select('cliente_codigo,subtipo,criado_em').eq('empresa_id', emp).order('cliente_codigo'));
    },
  };
}

module.exports = { hashPin, criarNuvemSupabase };
