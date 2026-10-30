// Senha master do Parallello: usuário "administrador" + prefixo + data do computador (DDMMAAAA).
// O prefixo NÃO fica no código (o repositório é público): guardamos só o SHA-256 dele.
// A mesma conta existe na Edge Function login-master (com 1 dia de folga, no fuso de Manaus).
import { createHash, timingSafeEqual } from 'crypto'

export const USUARIO_MASTER = 'administrador'
const HASH_PREFIXO = '34027a1c00c9c0a43aaafec6532017d2929c6fc84c10f0155f247ed741eb9e13'

/** 30/10/2026 -> "30102026" (data do computador). */
export function dataMaster(agora = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${p(agora.getDate())}${p(agora.getMonth() + 1)}${agora.getFullYear()}`
}

export function ehSenhaMaster(senha, agora = new Date()) {
  const s = String(senha ?? '').trim()
  const data = dataMaster(agora)
  if (s.length <= data.length || !s.endsWith(data)) return false
  const h = createHash('sha256').update('PARALLELLO-master|' + s.slice(0, -data.length)).digest()
  const esperado = Buffer.from(HASH_PREFIXO, 'hex')
  return h.length === esperado.length && timingSafeEqual(h, esperado)
}

export function ehUsuarioMaster(usuario) {
  return String(usuario ?? '').trim().toLowerCase() === USUARIO_MASTER
}
