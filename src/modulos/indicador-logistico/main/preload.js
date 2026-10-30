const { contextBridge, ipcRenderer } = require('electron');

const CANAIS = [
  'auth:estado', 'auth:entrar', 'auth:sair', 'auth:trocarSenha',
  'usuarios:listar', 'usuarios:salvar', 'usuarios:excluir',
  'conexoes:listar', 'conexoes:salvar', 'conexoes:excluir', 'conexoes:ordenar', 'conexoes:testar',
  'centros:listar', 'centros:salvar', 'centros:restaurar',
  'metas:obter', 'metas:salvar', 'metas:restaurar', 'config:obter', 'config:salvar',
  'painel:consultar', 'historico:listar', 'historico:obter', 'historico:excluir',
  'exportar:excel', 'exportar:pdf', 'backup:exportar', 'backup:importar',
  'app:info', 'app:abrirPastaDados'
];

contextBridge.exposeInMainWorld('api', {
  chamar: (canal, dados) => {
    if (!CANAIS.includes(canal)) return Promise.resolve({ ok: false, erro: 'Canal não permitido: ' + canal });
    return ipcRenderer.invoke(canal, dados);
  }
});
