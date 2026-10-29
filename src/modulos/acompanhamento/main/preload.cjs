const { contextBridge, ipcRenderer } = require('electron');

const chamar = (canal) => (dados) => ipcRenderer.invoke(canal, dados);

contextBridge.exposeInMainWorld('api', {
  obterDados: chamar('dados:obter'),
  salvarEmpresa: chamar('empresa:salvar'),
  novaEmpresa: chamar('empresa:nova'),
  excluirEmpresa: chamar('empresa:excluir'),
  ativarEmpresa: chamar('empresa:ativar'),
  salvarPreferencias: chamar('preferencias:salvar'),
  testarBase: chamar('base:testar'),

  listarRelatorios: chamar('relatorios:listar'),
  executarRelatorio: chamar('relatorio:executar'),
  remontarRelatorio: chamar('relatorio:remontar'),

  desbloquearConfig: chamar('config:desbloquear'),
  bloquearConfig: chamar('config:bloquear'),
  alterarSenhaConfig: chamar('config:alterarSenha'),

  exportarExcel: chamar('exportar:excel'),
  exportarPdf: chamar('exportar:pdf'),

  exportarBackup: chamar('backup:exportar'),
  importarBackup: chamar('backup:importar'),
  abrirPastaDados: chamar('backup:abrirPasta'),
  listarBackups: chamar('backup:listar'),

  aoProgredir: (fn) => {
    const ouvinte = (_e, msg) => fn(msg);
    ipcRenderer.on('progresso', ouvinte);
    return () => ipcRenderer.removeListener('progresso', ouvinte);
  }
});
