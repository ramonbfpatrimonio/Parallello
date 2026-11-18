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
  configuracaoGet: () => chamar('configuracao:get'),
  configuracaoSalvar: (c) => chamar('configuracao:salvar', c),

  analisar: (f) => chamar('credito:analisar', f),
  vendasMes: (f) => chamar('credito:vendasMes', f),
  pontuacaoMaxima: () => chamar('credito:pontuacaoMaxima'),

  decisoesListar: () => chamar('decisoes:listar'),
  decisoesSalvar: (d) => chamar('decisoes:salvar', d),
  decisoesExcluir: (id) => chamar('decisoes:excluir', id),
  limiteValidar: (decisaoId) => chamar('limite:validar', decisaoId),
  usuarioLogado: () => chamar('sessao:usuario'),
  definirUsuario: (u) => chamar('sessao:definirUsuario', u),
  eventosTestar: (eventos) => chamar('eventos:testar', eventos),
  limiteAplicar: (decisaoId) => chamar('limite:aplicar', decisaoId),

  exportarExcel: (p) => chamar('exportar:excel', p),
  relatorioPdf: (p) => chamar('relatorio:pdf', p),
  relatorioImprimir: (p) => chamar('relatorio:imprimir', p),
  telaPdf: (p) => chamar('tela:pdf', p),
  telaImprimir: (p) => chamar('tela:imprimir', p),
  abrirArquivo: (p) => chamar('arquivo:abrir', p),

  serasaConfig: (conexaoId) => chamar('serasa:config', conexaoId),
  serasaSalvar: (conexaoId, cfg) => chamar('serasa:salvar', { conexaoId, cfg }),
  serasaStatus: () => chamar('serasa:status'),
  serasaConsultas: (alvo) => chamar('serasa:consultas', alvo),
  serasaHistorico: () => chamar('serasa:historico'),
  serasaDocumento: (alvo) => chamar('serasa:documento', alvo),
  serasaConsultar: (p) => chamar('serasa:consultar', p),
  serasaTestar: (p) => chamar('serasa:testar', p),
  serasaTestarAuth: (p) => chamar('serasa:testarAuth', p),

  manualInfo: () => chamar('manual:info'),
  manualAbrirJanela: () => chamar('manual:abrirJanela'),
  manualAbrirExterno: () => chamar('manual:abrirExterno'),
  manualSalvar: () => chamar('manual:salvar'),

  backupExportar: () => chamar('backup:exportar'),
  backupImportar: () => chamar('backup:importar'),
  pastaDados: () => chamar('dados:pasta'),
  abrirPastaDados: () => chamar('dados:abrirPasta'),

  // Parallello: card "Situação de cobrança" (módulo Cobrança)
  cobrancaDisponivel: () => chamar('cobranca:disponivel'),
  cobrancaNuvem: (metodo, ...args) => chamar('cobranca:nuvem', metodo, ...args),
  cobrancaCarteira: (codigo) => chamar('cobranca:carteira', codigo)
});
