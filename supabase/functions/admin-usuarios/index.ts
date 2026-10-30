// Edge Function: empresas e usuários (precisa da service role, por isso roda no Supabase).
//
// Parallello: o usuário entra com um NOME DE LOGIN (ex.: "joao"). O e-mail interno
// da nuvem é joao@parallello.app (montado aqui e no programa). Quem mandar um
// e-mail de verdade (com @) continua sendo criado com o e-mail, como antes.
//
// Ações:
//   criar_empresa  (super_admin)            -> cria a empresa e o administrador dela
//   criar          (admin da empresa/super) -> cria usuário; admin só na própria empresa
//   senha          (admin da empresa/super) -> troca a senha; admin só de usuários da própria empresa
//
// Publicar: painel Edge Functions > admin-usuarios > colar este código > Deploy
// (ou: npx supabase functions deploy admin-usuarios)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const erro = (mensagem: string, status = 400) => resposta({ erro: mensagem }, status)

const DOMINIO = 'parallello.app'

/** "João Silva" -> "joao.silva"; e-mail fica como está. */
function normalizarLogin(texto: string): { email: string; usuario: string | null } {
  const t = String(texto ?? '').trim().toLowerCase()
  if (t.includes('@')) return { email: t, usuario: t.endsWith('@' + DOMINIO) ? t.split('@')[0] : null }
  const usuario = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '')
  if (usuario.length < 3) throw new Error('O usuário precisa ter pelo menos 3 letras ou números.')
  return { email: `${usuario}@${DOMINIO}`, usuario }
}

function traduzir(msg: string): string {
  if (/already been registered|already registered|already exists|duplicate key/i.test(msg)) return 'Já existe um usuário com este nome. Escolha outro (ex.: joao.hage).'
  if (/password/i.test(msg) && /short|least|weak/i.test(msg)) return 'Senha fraca: use pelo menos 6 caracteres.'
  if (/invalid.*email|email.*invalid/i.test(msg)) return 'E-mail inválido.'
  return msg
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: eu } = await comoUsuario.auth.getUser()
  if (!eu?.user) return erro('Sessão expirada. Entre novamente.', 401)

  const admin = createClient(url, service, { auth: { persistSession: false } })
  const { data: meu } = await admin
    .from('perfis')
    .select('papel, ativo, empresa_id, empresas(ativa)')
    .eq('id', eu.user.id)
    .single()
  const empresaAtiva = (meu?.empresas as { ativa?: boolean } | null)?.ativa ?? false
  const souSuper = !!meu && meu.ativo && meu.papel === 'super_admin'
  const souAdmin = !!meu && meu.ativo && meu.papel === 'admin' && empresaAtiva
  if (!souSuper && !souAdmin) return erro('Apenas administradores podem gerenciar usuários.', 403)

  const corpo = await req.json().catch(() => ({}))

  // Cria o usuário já com empresa, papel, nome de login e módulos no app_metadata
  // (o gatilho do banco cria o perfil).
  async function criarUsuario(login: string, senha: string, nome: string, papel: string, empresaId: string, modulos: string[] = []) {
    if (!login || !senha || String(senha).length < 6) throw new Error('Informe o usuário e a senha (mínimo 6 caracteres).')
    const { email, usuario } = normalizarLogin(login)
    const lista = Array.isArray(modulos) ? modulos.map(String).filter(Boolean) : []
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome },
      app_metadata: { empresa_id: empresaId, papel, usuario, modulos: lista }
    })
    if (error) throw new Error(traduzir(error.message))
    // Garante o perfil mesmo se o gatilho for antigo
    await admin.from('perfis').upsert({ id: data.user.id, email: data.user.email, nome: nome || usuario || email, papel, empresa_id: empresaId, ativo: true, usuario, modulos: lista })
    return data.user.id
  }

  try {
    if (corpo.acao === 'criar_empresa') {
      if (!souSuper) return erro('Apenas o super administrador cria empresas.', 403)
      const nome = String(corpo.nome ?? '').trim()
      if (!nome) return erro('Informe o nome da empresa.')
      const { data: emp, error } = await admin
        .from('empresas')
        .insert({ nome, cnpj: String(corpo.cnpj ?? '').replace(/\D/g, '') })
        .select('id')
        .single()
      if (error) return erro(error.message)
      try {
        await criarUsuario(corpo.admin_usuario ?? corpo.admin_email, corpo.admin_senha, corpo.admin_nome, 'admin', emp.id, corpo.admin_modulos ?? [])
      } catch (e) {
        await admin.from('empresas').delete().eq('id', emp.id) // desfaz: empresa sem administrador não serve
        return erro((e as Error).message)
      }
      return resposta({ id: emp.id })
    }

    if (corpo.acao === 'criar') {
      const papel = corpo.papel === 'admin' ? 'admin' : 'operador'
      const empresaId = souSuper ? corpo.empresa_id : meu!.empresa_id
      if (!empresaId) return erro('Escolha a empresa do usuário.')
      const id = await criarUsuario(corpo.usuario ?? corpo.email, corpo.senha, corpo.nome, papel, empresaId, corpo.modulos ?? [])
      return resposta({ id })
    }

    if (corpo.acao === 'senha') {
      const { id, senha } = corpo
      if (!id || !senha || String(senha).length < 6) return erro('A senha precisa ter pelo menos 6 caracteres.')
      const { data: alvo } = await admin.from('perfis').select('empresa_id, papel').eq('id', id).single()
      if (!alvo) return erro('Usuário não encontrado.', 404)
      if (!souSuper && (alvo.empresa_id !== meu!.empresa_id || alvo.papel === 'super_admin')) {
        return erro('Você só pode trocar a senha de usuários da sua empresa.', 403)
      }
      const { error } = await admin.auth.admin.updateUserById(id, { password: senha })
      if (error) return erro(traduzir(error.message))
      return resposta({ ok: true })
    }

    return erro('Ação desconhecida.')
  } catch (e) {
    return erro((e as Error).message)
  }
})
