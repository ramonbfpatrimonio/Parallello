const { contextBridge, ipcRenderer } = require('electron')

// Erros do processo principal chegam como "Error invoking remote method 'x': Error: mensagem"
const chamar = async (canal, ...args) => {
  try {
    return await ipcRenderer.invoke(canal, ...args)
  } catch (e) {
    throw new Error(String(e?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
  }
}

contextBridge.exposeInMainWorld('instalador', {
  senha: (usuario, senha) => chamar('senha', usuario, senha),
  procurar: () => chamar('procurar'),
  baixar: () => chamar('baixar'),
  conferir: () => chamar('conferir'),
  fecharAberto: () => chamar('fechar-aberto'),
  instalar: () => chamar('instalar'),
  abrir: () => chamar('abrir'),
  sair: () => chamar('sair'),
  aoProgresso: (fn) => ipcRenderer.on('progresso', (_e, p) => fn(p)),
})
