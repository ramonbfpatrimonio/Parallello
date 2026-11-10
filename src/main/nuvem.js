// Nuvem do Parallello (Supabase), do lado do processo principal.
//
// A sessão do usuário logado fica AQUI, só na memória (ao fechar o Parallello, pede login de novo).
// As telas que falam direto com a nuvem (Gerar Pré-Venda e o painel de configuração) pedem o
// token desta sessão a cada chamada, então existe um login só para tudo.
import os from 'os'
import { createClient } from '@supabase/supabase-js'
import { URL_NUVEM, CHAVE_NUVEM, emailDoLogin } from '../compartilhado/nuvem-config.js'

const MSG_SEM_INTERNET = 'Sem conexão com a internet.'
const estacao = os.hostname().normalize('NFD').replace(/[^\x20-\x7E]/g, '').slice(0, 60)

// Sem internet (ou rede ruim) o fetch pode ficar pendurado por muito tempo: cada chamada tem um limite.
const LIMITE_MS = 15000
function fetchComLimite(url, opcoes = {}) {
  const limite = AbortSignal.timeout(LIMITE_MS)
  const signal = opcoes.signal ? AbortSignal.any([opcoes.signal, limite]) : limite
  return fetch(url, { ...opcoes, signal }).catch((e) => {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new Error(MSG_SEM_INTERNET)
    throw e
  })
}

let cliente = null
function sb() {
  if (!cliente) {
    cliente = createClient(URL_NUVEM, CHAVE_NUVEM, {
      auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
      global: { headers: { 'x-estacao': estacao }, fetch: fetchComLimite },
    })
  }
  return cliente
}

/** Falha de rede (sem internet / Supabase fora do ar), e não erro de regra. */
export function ehErroDeRede(e) {
  const m = e?.message ?? String(e)
  return m === MSG_SEM_INTERNET || /Failed to fetch|NetworkError|fetch failed|Load failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|network/i.test(m)
}

function traduzir(msg) {
  if (/Invalid login credentials/i.test(msg)) return 'Usuário ou senha incorretos.'
  if (/Email not confirmed/i.test(msg)) return 'Usuário ainda não confirmado.'
  if (/Failed to fetch|NetworkError|fetch failed|Load failed|ENOTFOUND|EAI_AGAIN/i.test(msg)) return MSG_SEM_INTERNET
  if (/row-level security|permission denied/i.test(msg)) return 'Sem permissão para esta operação.'
  const falta = msg.match(/Could not find the (?:table|function) '?public\.(\w+)/i) || msg.match(/column [\w.]*\b(modulos|usuario)\b does not exist/i)
  if (falta) return `A nuvem ainda não foi atualizada para o Parallello (falta "${falta[1]}"). No Supabase, abra o SQL Editor e rode supabase/migrations/005_parallello.sql.`
  return msg
}

async function ou(p) {
  let r
  try {
    r = await p
  } catch (e) {
    throw new Error(traduzir(e?.message ?? String(e)))
  }
  if (r.error) throw new Error(traduzir(r.error.message))
  return r.data
}

async function funcao(nome, corpo) {
  let r
  try {
    r = await sb().functions.invoke(nome, { body: corpo })
  } catch (e) {
    throw new Error(traduzir(e?.message ?? String(e)))
  }
  const { data, error } = r
  if (error) {
    let msg = error.message
    try {
      const ctx = error.context
      const j = ctx && typeof ctx.json === 'function' ? await ctx.json() : null
      if (j?.erro) msg = j.erro
    } catch {
      /* mantém a mensagem original */
    }
    if (/not found|404/i.test(msg) && nome === 'login-master') msg = 'A função login-master ainda não foi publicada no Supabase (Edge Functions).'
    throw new Error(traduzir(msg))
  }
  if (data?.erro) throw new Error(data.erro)
  return data
}

// ---------------------------------------------------------------- sessão
export async function entrar(login, senha) {
  const { error } = await sb().auth.signInWithPassword({ email: emailDoLogin(login), password: senha }).catch((e) => ({ error: e }))
  if (error) throw new Error(traduzir(error.message))
}

/** Senha master do Parallello: a Edge Function login-master devolve um acesso de uso único do super administrador. */
export async function entrarMaster(senha) {
  const r = await funcao('login-master', { usuario: 'administrador', senha })
  if (!r?.token_hash) throw new Error('Não foi possível entrar com a senha master na nuvem.')
  const { error } = await sb().auth.verifyOtp({ token_hash: r.token_hash, type: 'magiclink' })
  if (error) throw new Error(traduzir(error.message))
}

export async function sair() {
  try {
    await sb().auth.signOut({ scope: 'local' })
  } catch {
    /* sem internet: a sessão da memória é apagada mesmo assim */
  }
}

/** Token da sessão atual (renovado sozinho), ou null sem sessão. */
export async function token() {
  try {
    const { data } = await sb().auth.getSession()
    return data.session?.access_token ?? null
  } catch {
    return null
  }
}

export async function usuarioId() {
  const { data } = await sb().auth.getSession()
  return data.session?.user.id ?? null
}

export async function online() {
  try {
    const r = await fetch(`${URL_NUVEM}/auth/v1/health`, { headers: { apikey: CHAVE_NUVEM }, cache: 'no-store' })
    return r.ok
  } catch {
    return false
  }
}

// ---------------------------------------------------------------- perfil
const COLUNAS_PERFIL = 'id, nome, email, usuario, papel, ativo, empresa_id, modulos, modulos_visiveis, empresas(nome, ativa, modulos)'

function paraPerfil(p) {
  return {
    id: p.id,
    nome: p.nome,
    email: p.email,
    usuario: p.usuario || (String(p.email || '').endsWith('@parallello.app') ? p.email.split('@')[0] : p.email),
    papel: p.papel,
    ativo: p.ativo,
    empresa_id: p.empresa_id,
    empresa_nome: p.empresas?.nome ?? '',
    empresa_ativa: p.empresas?.ativa ?? false,
    empresa_modulos: p.empresas?.modulos ?? null,
    modulos: p.modulos ?? [],
    modulos_visiveis: p.modulos_visiveis ?? [],
  }
}

export async function meuPerfil() {
  const id = await usuarioId()
  if (!id) return null
  // perfil e licença ao mesmo tempo (uma ida à nuvem a menos no login)
  const [p, lic] = await Promise.all([
    ou(sb().from('perfis').select(COLUNAS_PERFIL).eq('id', id).maybeSingle()),
    licenca().catch((e) => {
      if (ehErroDeRede(e)) throw e
      return null // super administrador, sem empresa, ou sem a migração 004: entra sem cobrança
    }),
  ])
  if (!p) return null
  const perfil = paraPerfil(p)
  if (perfil.papel !== 'super_admin' && perfil.empresa_id) perfil.licenca = lic
  return perfil
}

export async function licenca(empresaId = null) {
  const r = await ou(sb().rpc('minha_licenca', { p_empresa: empresaId }))
  const l = r?.[0]
  return l ? { ...l, valor: Number(l.valor) } : null
}

// ---------------------------------------------------------------- empresas (super administrador)
export async function empresas() {
  const r = (await ou(sb().from('empresas').select('id, nome, ativa, modulos').order('nome'))) ?? []
  return r
}

export async function definirModulosEmpresa(empresaId, modulos) {
  return ou(sb().rpc('definir_modulos_empresa', { p_empresa: empresaId, p_modulos: modulos }))
}

// ---------------------------------------------------------------- usuários e módulos
export async function usuarios(empresaId) {
  let q = sb().from('perfis').select(COLUNAS_PERFIL).order('nome')
  if (empresaId) q = q.eq('empresa_id', empresaId)
  return ((await ou(q)) ?? []).map(paraPerfil)
}

export async function criarUsuario({ usuario, senha, nome, papel, empresaId, modulos }) {
  return funcao('admin-usuarios', { acao: 'criar', usuario, senha, nome, papel, empresa_id: empresaId, modulos })
}

export async function alterarUsuario(id, dados) {
  const permitido = {}
  for (const k of ['nome', 'papel', 'ativo']) if (k in dados) permitido[k] = dados[k]
  await ou(sb().from('perfis').update(permitido).eq('id', id))
}

export async function trocarSenha(id, senha) {
  return funcao('admin-usuarios', { acao: 'senha', id, senha })
}

export async function definirModulos(usuarioId, modulos) {
  return ou(sb().rpc('definir_modulos', { p_usuario: usuarioId, p_modulos: modulos }))
}

/** Módulos que o próprio usuário escolheu ver (só vale o que ele tem permissão). */
export async function definirMeusModulos(modulos) {
  return ou(sb().rpc('definir_meus_modulos', { p_modulos: modulos }))
}

// ---------------------------------------------------------------- empresas (configuração, super administrador)
export async function resumoEmpresas() {
  const r = (await ou(sb().rpc('resumo_empresas'))) ?? []
  return r.map((e) => ({ ...e, usuarios: Number(e.usuarios), prevendas_mes: Number(e.prevendas_mes), total_mes: Number(e.total_mes) }))
}

export async function criarEmpresa({ nome, cnpj, admin_nome, admin_usuario, admin_senha }) {
  const r = await funcao('admin-usuarios', { acao: 'criar_empresa', nome, cnpj, admin_nome, admin_usuario, admin_senha })
  return r.id
}

export async function alterarEmpresa(id, d) {
  const permitido = {}
  for (const k of ['nome', 'cnpj', 'ativa', 'retencao_meses']) if (k in d) permitido[k] = d[k]
  await ou(sb().from('empresas').update(permitido).eq('id', id))
}

// ---------------------------------------------------------------- cobrança da licença
export async function configCobranca() {
  const c = await ou(sb().from('config_cobranca').select('dias_aviso, dias_tolerancia, contato').eq('id', 1).maybeSingle())
  return c ?? { dias_aviso: 5, dias_tolerancia: 3, contato: '' }
}
export async function salvarConfigCobranca(d) {
  await ou(sb().from('config_cobranca').update({ dias_aviso: d.dias_aviso, dias_tolerancia: d.dias_tolerancia, contato: d.contato, atualizado_em: new Date().toISOString() }).eq('id', 1))
}
export async function empresasCobranca() {
  const es = (await ou(sb().from('empresas').select('id, nome, cnpj, ativa, licenca_valor, licenca_ciclo_meses, licenca_vencimento, licenca_obs').order('nome'))) ?? []
  const pg = (await ou(sb().from('pagamentos_licenca').select('empresa_id, pago_em').order('pago_em', { ascending: false }))) ?? []
  return es.map((e) => ({ ...e, licenca_valor: Number(e.licenca_valor), ultimo_pagamento: pg.find((x) => x.empresa_id === e.id)?.pago_em ?? null }))
}
export async function alterarLicenca(id, d) {
  await ou(sb().from('empresas').update({ licenca_valor: d.licenca_valor, licenca_ciclo_meses: d.licenca_ciclo_meses, licenca_vencimento: d.licenca_vencimento, licenca_obs: d.licenca_obs }).eq('id', id))
}
export async function pagamentos(empresaId) {
  const r = (await ou(sb().from('pagamentos_licenca').select('*').eq('empresa_id', empresaId).order('id', { ascending: false }))) ?? []
  return r.map((x) => ({ ...x, valor: Number(x.valor) }))
}
export async function registrarPagamento({ empresaId, pagoEm, valor, forma, obs }) {
  return ou(sb().rpc('registrar_pagamento', { p_empresa: empresaId, p_pago_em: pagoEm, p_valor: valor, p_forma: forma, p_obs: obs }))
}
export async function estornarPagamento(id) {
  return ou(sb().rpc('estornar_pagamento', { p_id: id }))
}

// ---------------------------------------------------------------- eventos do sistema
export async function eventos({ desde, texto, empresaId, limite = 500 } = {}) {
  let q = sb().from('eventos_sistema').select('id, criado_em, empresa_id, usuario_nome, estacao, acao, entidade, descricao, empresas(nome)').order('criado_em', { ascending: false }).limit(limite)
  if (empresaId) q = q.eq('empresa_id', empresaId)
  if (desde) q = q.gte('criado_em', desde)
  if (texto?.trim()) {
    const t = texto.trim().replace(/[%,()]/g, ' ')
    q = q.or(`descricao.ilike.%${t}%,usuario_nome.ilike.%${t}%,estacao.ilike.%${t}%,acao.ilike.%${t}%,entidade.ilike.%${t}%`)
  }
  return (await ou(q)) ?? []
}

// ---------------------------------------------------------------- conexões da empresa (conexão única)
export async function conexoes(empresaId) {
  return (await ou(sb().from('conexoes_empresa').select('id, empresa_id, dados, atualizado_em').eq('empresa_id', empresaId))) ?? []
}
export async function salvarConexao(empresaId, dados) {
  await ou(sb().from('conexoes_empresa').upsert({ id: dados.id, empresa_id: empresaId, dados: { ...dados, empresaId } }))
}
export async function excluirConexao(id) {
  await ou(sb().from('conexoes_empresa').delete().eq('id', id))
}

// ---------------------------------------------------------------- eventos
export async function registrarEvento({ acao, entidade, descricao = '', detalhes = {}, empresaId = null }) {
  await ou(
    sb().rpc('registrar_evento', {
      p_acao: acao,
      p_entidade: entidade,
      p_descricao: descricao,
      p_detalhes: detalhes,
      p_chave_local: null,
      p_criado_em: null,
      p_empresa_id: empresaId,
    })
  )
}
