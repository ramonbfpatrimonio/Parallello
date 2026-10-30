/** Mensagem limpa de um erro vindo do processo principal (tira o "Error invoking remote method..."). */
export function mensagem(erro) {
  return String(erro?.message ?? erro).replace(/^Error invoking remote method '[^']+': /, '').replace(/^Error: /, '')
}

export const NOME_PAPEL = { master: 'Administrador (senha master)', super_admin: 'Super administrador', admin: 'Administrador', operador: 'Operador' }
