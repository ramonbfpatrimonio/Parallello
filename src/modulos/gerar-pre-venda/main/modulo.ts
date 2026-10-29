// Gerar Pré-Venda como módulo do Parallello.
// O processo principal original (janela própria + atualização própria) virou esta função:
// o Parallello entrega o IPC só deste módulo, a pasta de dados e a janela para os diálogos.
// A atualização automática agora é a do Parallello (uma só para todos os sistemas).
import type { BrowserWindow } from 'electron'
import { registrarIpc, type IpcModulo } from './ipc'
import { fecharTodos } from './db'
import { definirPastaDados } from './pasta'

export interface ContextoModulo {
  ipc: IpcModulo
  pastaDados: string
  versao: string
  janela: () => BrowserWindow | null
}

export default function criarModulo(ctx: ContextoModulo) {
  definirPastaDados(ctx.pastaDados)
  registrarIpc(ctx.ipc, ctx.janela)

  // A tela do módulo ainda pergunta pela versão e pelo estado da atualização.
  // Quem atualiza agora é o Parallello (aviso na barra superior), então aqui só responde.
  ctx.ipc.handle('atualizacao:versao', () => ctx.versao)
  ctx.ipc.handle('atualizacao:estadoAtual', () => null)
  ctx.ipc.handle('atualizacao:baixar', () => undefined)
  ctx.ipc.handle('atualizacao:instalar', () => undefined)
  ctx.ipc.handle('atualizacao:verificar', () => ({ ok: false, erro: 'A atualização é feita pelo Parallello, na barra superior.' }))

  return { encerrar: () => fecharTodos() }
}
