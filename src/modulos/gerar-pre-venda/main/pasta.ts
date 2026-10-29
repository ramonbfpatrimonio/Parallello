// Pasta de dados deste módulo, definida pelo Parallello ao iniciar.
import { mkdirSync } from 'fs'
import { join } from 'path'

let pasta = ''

export function definirPastaDados(p: string) {
  mkdirSync(p, { recursive: true })
  pasta = p
}

export function arquivoDados(nome: string): string {
  if (!pasta) throw new Error('Pasta de dados não definida.')
  return join(pasta, nome)
}
