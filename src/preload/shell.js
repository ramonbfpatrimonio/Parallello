// Ponte da tela do Parallello (barra superior e tela inicial).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('parallello', {
  estado: () => ipcRenderer.invoke('parallello:estado'),
  abrir: (id) => ipcRenderer.invoke('parallello:abrir', id),
  mostrar: (id) => ipcRenderer.invoke('parallello:mostrar', id),
  fechar: (id) => ipcRenderer.invoke('parallello:fechar', id),
  abrirPastaDados: () => ipcRenderer.invoke('parallello:abrirPastaDados'),
  atualizacao: {
    verificar: () => ipcRenderer.invoke('parallello:atualizacao:verificar'),
    baixar: () => ipcRenderer.invoke('parallello:atualizacao:baixar'),
    instalar: () => ipcRenderer.invoke('parallello:atualizacao:instalar'),
  },
  aoMudar: (fn) => {
    const ouvinte = (_e, estado) => fn(estado);
    ipcRenderer.on('parallello:estado', ouvinte);
    return () => ipcRenderer.removeListener('parallello:estado', ouvinte);
  },
});
