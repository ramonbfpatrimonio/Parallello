const { contextBridge, ipcRenderer } = require('electron');

const chamar = async (canal, ...args) => {
  const r = await ipcRenderer.invoke(canal, ...args);
  if (!r.ok) throw new Error(r.erro);
  return r.dados;
};

contextBridge.exposeInMainWorld('api', {
  validarSenha: (s) => chamar('senha:validar', s),

  conexoesListar: () => chamar('conexoes:listar'),
  conexoesSalvar: (c) => chamar('conexoes:salvar', c),
  conexoesExcluir: (id) => chamar('conexoes:excluir', id),
  conexoesAtivar: (id) => chamar('conexoes:ativar', id),
  conexoesTestar: (c) => chamar('conexoes:testar', c),

  regrasGet: () => chamar('regras:get'),
  regrasSalvar: (r) => chamar('regras:salvar', r),
  regrasPadrao: () => chamar('regras:padrao'),

  analisar: (f) => chamar('credito:analisar', f),
  vendasMes: (f) => chamar('credito:vendasMes', f),
  pontuacaoMaxima: () => chamar('credito:pontuacaoMaxima'),

  decisoesListar: () => chamar('decisoes:listar'),
  decisoesSalvar: (d) => chamar('decisoes:salvar', d),
  decisoesExcluir: (id) => chamar('decisoes:excluir', id),

  exportarExcel: (p) => chamar('exportar:excel', p),
  relatorioPdf: (p) => chamar('relatorio:pdf', p),
  relatorioImprimir: (p) => chamar('relatorio:imprimir', p),
  abrirArquivo: (p) => chamar('arquivo:abrir', p),

  backupExportar: () => chamar('backup:exportar'),
  backupImportar: () => chamar('backup:importar'),
  pastaDados: () => chamar('dados:pasta'),
  abrirPastaDados: () => chamar('dados:abrirPasta')
});
