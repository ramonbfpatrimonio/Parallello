// Projeto Supabase do Parallello (era o do Gerar Pré-Venda).
// A chave "anon" é pública por natureza: quem protege os dados são as regras RLS (supabase/migrations).
export const URL_NUVEM = 'https://pgbwgdnclmzlszvacdfo.supabase.co'
export const CHAVE_NUVEM =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnYndnZG5jbG16bHN6dmFjZGZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyNTE2MDYsImV4cCI6MjEwNzgyNzYwNn0.PaE9vlT9nU5BryxyH9BhLVnKjv7dEkwh4g9uY7ySIsk'

/** Domínio do e-mail interno: o usuário "joao" entra na nuvem como joao@parallello.app. */
export const DOMINIO_LOGIN = 'parallello.app'

/** "João Silva" -> "joao.silva" (mesma regra da Edge Function admin-usuarios). E-mail fica como está. */
export function normalizarLogin(texto) {
  const t = String(texto ?? '').trim().toLowerCase()
  if (t.includes('@')) return t
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '')
}

export function emailDoLogin(texto) {
  const t = normalizarLogin(texto)
  return t.includes('@') ? t : `${t}@${DOMINIO_LOGIN}`
}
