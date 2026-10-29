const { contextBridge, ipcRenderer } = require('electron');

const chamar = async (canal, ...args) => {
  const r = await ipcRenderer.invoke(canal, ...args);
  if (!r.ok) throw new Error(r.erro);
  return r.dados;
};

contextBridge.exposeInMainWorld('api', {
  estado: () => chamar('app:estado'),
  setupInicial: (d) => chamar('setup:inicial', d),
  login: (d) => chamar('auth:login', d),
  logout: () => chamar('auth:logout'),

  config: {
    abrir: (senha) => chamar('config:abrir', senha),
    fechar: () => chamar('config:fechar'),
    dados: () => chamar('config:dados'),
    salvarConexao: (d) => chamar('config:salvarConexao', d),
    excluirConexao: (id) => chamar('config:excluirConexao', id),
    testarConexao: (d) => chamar('config:testarConexao', d),
    salvarUsuario: (d) => chamar('config:salvarUsuario', d),
    excluirUsuario: (id) => chamar('config:excluirUsuario', id),
    salvarParametros: (p) => chamar('config:salvarParametros', p),
    verificarTabelas: (id) => chamar('config:verificarTabelas', id),
    criarTabela: (d) => chamar('config:criarTabela', d),
    abrirPasta: () => chamar('config:abrirPasta'),
  },

  erp: {
    fabricantes: () => chamar('erp:fabricantes'),
    buscarClientes: (t) => chamar('erp:buscarClientes', t),
    nomeCliente: (c) => chamar('erp:nomeCliente', c),
    rupturas: (f) => chamar('erp:rupturas', f),
    clientesRupturas: (f) => chamar('erp:clientesRupturas', f),
    validar: (itens) => chamar('erp:validar', itens),
    gerar: (itens) => chamar('erp:gerar', itens),
  },

  historico: () => chamar('historico:listar'),
  exportarExcel: (d) => chamar('exportar:excel', d),
});
