const { contextBridge, ipcRenderer } = require('electron');

const CANAIS = new Set([
  'conexoes:listar', 'conexoes:salvar', 'conexoes:excluir', 'conexoes:padrao', 'conexoes:testar',
  'vendedores:listar', 'fabricantes:listar',
  'relatorio:buscar',
  'comissoes:carregar', 'comissoes:previa', 'comissoes:salvar', 'comissoes:excluir',
  'fechamentos:listar', 'fechamentos:obter', 'fechamentos:salvar', 'fechamentos:excluir',
  'exportar:excel', 'exportar:pdf',
  'config:obter', 'config:definir',
  'backup:info', 'backup:exportar', 'backup:restaurar',
  'sessao:info',
  'sistema:liberar', 'exportar:imprimir'
]);

contextBridge.exposeInMainWorld('api', {
  invoke: (canal, ...args) =>
    CANAIS.has(canal) ? ipcRenderer.invoke(canal, ...args) : Promise.resolve({ ok: false, erro: 'Canal não permitido: ' + canal })
});
