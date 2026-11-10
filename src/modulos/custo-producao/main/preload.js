const { contextBridge, ipcRenderer } = require('electron');

const canais = {
  validarSenha: 'sistema:validarSenha',
  configGet: 'config:get',
  salvarPreferencias: 'config:salvarPreferencias',
  salvarConexao: 'conexao:salvar',
  duplicarConexao: 'conexao:duplicar',
  excluirConexao: 'conexao:excluir',
  ativarConexao: 'conexao:ativar',
  pastaDados: 'config:pastaDados',
  testarConexao: 'db:testar',
  colunasData: 'db:colunasData',
  consultar: 'custo:consultar',
  histListar: 'hist:listar',
  histSalvar: 'hist:salvar',
  histAbrir: 'hist:abrir',
  histExcluir: 'hist:excluir',
  exportarExcel: 'exportar:excel',
  exportarPdf: 'exportar:pdf',
  imprimir: 'exportar:imprimir',
  backupExportar: 'backup:exportar',
  backupImportar: 'backup:importar'
};

contextBridge.exposeInMainWorld(
  'api',
  Object.fromEntries(Object.entries(canais).map(([nome, canal]) => [nome, (...args) => ipcRenderer.invoke(canal, ...args)]))
);
