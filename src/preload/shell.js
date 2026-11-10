// Ponte da tela do Parallello (login, barra superior, tela inicial, Liberar módulos e Configuração).
const { contextBridge, ipcRenderer } = require('electron');

const chamar = (canal, ...args) => ipcRenderer.invoke('parallello:' + canal, ...args);
const ouvir = (canal) => (fn) => {
  const ouvinte = (_e, dados) => fn(dados);
  ipcRenderer.on('parallello:' + canal, ouvinte);
  return () => ipcRenderer.removeListener('parallello:' + canal, ouvinte);
};

contextBridge.exposeInMainWorld('parallello', {
  estado: () => chamar('estado'),
  abrir: (id) => chamar('abrir', id),
  mostrar: (id) => chamar('mostrar', id),
  fechar: (id) => chamar('fechar', id),
  cobrir: (sim) => chamar('cobrir', sim),
  definirTema: (tema) => chamar('tema', tema),
  abrirPastaDados: () => chamar('abrirPastaDados'),
  entrar: (usuario, senha) => chamar('entrar', usuario, senha),
  sair: () => chamar('sair'),
  atualizarSessao: () => chamar('atualizarSessao'),
  escolherEmpresa: (id) => chamar('escolherEmpresa', id),
  /** Liberar módulos: os que a própria pessoa quer ver na tela inicial */
  definirMeusModulos: (modulos) => chamar('meusModulos', modulos),
  config: {
    abrir: (senha) => chamar('config:abrir', senha),
    fechar: () => chamar('config:fechar'),
    usuarios: () => chamar('config:usuarios'),
    definirModulos: (id, modulos) => chamar('config:usuarios:modulos', id, modulos),
    criarUsuario: (dados) => chamar('config:usuarios:criar', dados),
    alterarUsuario: (id, dados) => chamar('config:usuarios:alterar', id, dados),
    trocarSenha: (id, senha) => chamar('config:usuarios:senha', id, senha),
    empresas: () => chamar('config:empresas'),
    criarEmpresa: (d) => chamar('config:empresas:criar', d),
    alterarEmpresa: (id, d) => chamar('config:empresas:alterar', id, d),
    modulosEmpresa: (id, modulos) => chamar('config:empresas:modulos', id, modulos),
    cobrancaConfig: () => chamar('config:cobranca:config'),
    salvarCobrancaConfig: (d) => chamar('config:cobranca:salvarConfig', d),
    cobrancaEmpresas: () => chamar('config:cobranca:empresas'),
    alterarLicenca: (id, d) => chamar('config:cobranca:licenca', id, d),
    pagamentos: (id) => chamar('config:cobranca:pagamentos', id),
    registrarPagamento: (d) => chamar('config:cobranca:pagar', d),
    estornarPagamento: (id) => chamar('config:cobranca:estornar', id),
    eventos: (filtro) => chamar('config:eventos', filtro),
    conexoes: () => chamar('config:conexoes'),
    salvarConexao: (perfil, senha) => chamar('config:conexoes:salvar', perfil, senha),
    salvarSenhaConexao: (id, senha) => chamar('config:conexoes:senha', id, senha),
    excluirConexao: (id) => chamar('config:conexoes:excluir', id),
    enviarConexao: (id) => chamar('config:conexoes:enviar', id),
    testarConexao: (perfil, senha) => chamar('config:conexoes:testar', perfil, senha),
  },
  atualizacao: {
    verificar: () => chamar('atualizacao:verificar'),
    baixar: () => chamar('atualizacao:baixar'),
    instalar: () => chamar('atualizacao:instalar'),
  },
  aoMudar: ouvir('estado'),
  aoPedirMaster: ouvir('pedirMaster'),
  aoAviso: ouvir('aviso'),
});
