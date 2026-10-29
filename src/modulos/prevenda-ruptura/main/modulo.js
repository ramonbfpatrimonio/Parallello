const { app, dialog, shell } = require('electron');
const path = require('path');
const os = require('os');
const store = require('./store');
const { exportarExcel } = require('./exportar');

const DEMO = process.env.PVR_DEMO === '1' || process.argv.includes('--demo');
const db = DEMO ? require('./mock') : require('./db');

// Módulo do Parallello: o processo principal original virou uma função que recebe o contexto
// (IPC só deste módulo, pasta de dados, janela para os diálogos).
module.exports = function criarModulo(ctx) {
  const ipcMain = ctx.ipc;
  store.definirPasta(ctx.pastaDados);

  const sessao = { usuario: null, conexao: null, configLiberada: false };

  // --------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------
  function handle(canal, fn) {
    ipcMain.handle(canal, async (_e, ...args) => {
      try {
        return { ok: true, dados: await fn(...args) };
      } catch (err) {
        return { ok: false, erro: traduzirErro(err) };
      }
    });
  }

  function traduzirErro(err) {
    const m = String(err?.message || err);
    if (/decrypt/i.test(m)) return 'A senha do banco salva para esta conexão não pôde ser lida (veio de outro programa ou computador). Abra a configuração (Ctrl+Shift+B), edite a conexão e informe a senha do banco novamente.';
    if (/Login failed/i.test(m)) return 'Falha no login do SQL Server: usuário ou senha do banco incorretos.';
    if (/ESOCKET|ECONNREFUSED|getaddrinfo|ENOTFOUND/i.test(m)) return 'Não foi possível alcançar o servidor SQL. Verifique o nome do servidor/porta, a rede e se o SQL Server aceita conexões TCP/IP.\n\nDetalhe: ' + m;
    if (/ETIMEOUT|timeout/i.test(m)) return 'Tempo esgotado ao falar com o SQL Server.\n\nDetalhe: ' + m;
    if (/Cannot open database/i.test(m)) return 'O banco informado não existe ou o usuário não tem acesso a ele.\n\nDetalhe: ' + m;
    if (/Port for .* not found|instance/i.test(m)) return 'Instância do SQL Server não encontrada. Informe a porta TCP ou verifique se o serviço SQL Server Browser está ativo.\n\nDetalhe: ' + m;
    if (/Invalid object name/i.test(m)) return 'Tabela não encontrada no banco: ' + m + '\n\nUse Configurações → Banco de dados para verificar a estrutura.';
    return m;
  }

  function exigirLogin() {
    if (!sessao.usuario || !sessao.conexao) throw new Error('Sessão expirada. Faça login novamente.');
  }
  function exigirConfig() {
    if (!sessao.configLiberada) throw new Error('Área de configuração bloqueada.');
  }
  function conexaoPorId(id) {
    const c = store.config().conexoes.find((x) => x.id === id);
    if (!c) throw new Error('Conexão não encontrada.');
    return c;
  }
  async function poolDe(c) { return db.obterPool(c, store.decripto(c.senhaCripto)); }
  async function poolAtual() { exigirLogin(); return poolDe(conexaoPorId(sessao.conexao.id)); }
  // Senha master fixa: '@t1v0ERP10' + data do computador (DDMMAAAA). Ex.: 29/10/2026 -> @t1v0ERP1029102026
  function senhaMasterDoDia(d = new Date()) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `@t1v0ERP10${dd}${mm}${d.getFullYear()}`;
  }
  function confereMaster(senha) {
    const a = Buffer.from(String(senha || ''), 'utf8');
    const b = Buffer.from(senhaMasterDoDia(), 'utf8');
    return a.length === b.length && require('crypto').timingSafeEqual(a, b);
  }
  const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const semSenha = (c) => ({ ...c, senhaCripto: undefined, temSenha: !!c.senhaCripto });

  // --------------------------------------------------------------
  // Estado inicial / login
  // --------------------------------------------------------------
  handle('app:estado', () => {
    const c = store.config();
    return {
      primeiroUso: c.usuarios.length === 0,
      conexoes: c.conexoes.map((x) => ({ id: x.id, nome: x.nome })),
      ultimaConexaoId: c.ultimaConexaoId,
      ultimoUsuario: c.ultimoUsuario,
      demo: DEMO,
      versao: ctx.versao,
      estacao: os.hostname(),
      sessao: sessao.usuario ? { usuario: sessao.usuario, conexao: sessao.conexao } : null,
    };
  });

  handle('setup:inicial', ({ senhaMaster, usuario, senha }) => {
    const c = store.config();
    if (c.usuarios.length) throw new Error('A configuração inicial já foi feita.');
    if (!confereMaster(senhaMaster)) throw new Error('Senha master incorreta.');
    if (!usuario || usuario.trim().length < 3) throw new Error('Usuário deve ter pelo menos 3 caracteres.');
    if (!senha || senha.length < 3) throw new Error('Senha deve ter pelo menos 3 caracteres.');
    c.usuarios.push({ id: novoId(), usuario: usuario.trim(), ...store.gerarHash(senha), ativo: true, criadoEm: new Date().toISOString() });
    c.ultimoUsuario = usuario.trim();
    store.salvarConfig(c);
    sessao.configLiberada = true; // já abre a configuração para cadastrar a primeira conexão
    return true;
  });

  handle('auth:login', async ({ usuario, senha, conexaoId }) => {
    const c = store.config();
    const u = c.usuarios.find((x) => x.usuario.toLowerCase() === String(usuario || '').trim().toLowerCase());
    if (!u) throw new Error(`USUÁRIO NÃO CADASTRADO!\n\nO usuário '${usuario}' não foi encontrado.`);
    if (!u.ativo) throw new Error('Usuário desativado.');
    if (!store.confere(senha, u)) throw new Error('SENHA INCORRETA! Tente novamente.');
    const con = c.conexoes.find((x) => x.id === conexaoId);
    if (!con) throw new Error('Selecione a empresa/conexão.');
    await poolDe(con); // testa a conexão já no login
    sessao.usuario = u.usuario;
    sessao.conexao = { id: con.id, nome: con.nome, banco: con.banco, servidor: con.servidor };
    c.ultimaConexaoId = con.id;
    c.ultimoUsuario = u.usuario;
    store.salvarConfig(c);
    return { usuario: sessao.usuario, conexao: sessao.conexao };
  });

  handle('auth:logout', () => { sessao.usuario = null; sessao.conexao = null; sessao.configLiberada = false; return true; });

  // --------------------------------------------------------------
  // Configuração (oculta, Ctrl+Shift+B + senha master)
  // --------------------------------------------------------------
  handle('config:abrir', (senha) => {
    if (!confereMaster(senha)) throw new Error('Senha master incorreta.');
    sessao.configLiberada = true;
    return true;
  });
  handle('config:fechar', () => { sessao.configLiberada = false; return true; });

  handle('config:dados', () => {
    exigirConfig();
    const c = store.config();
    return {
      conexoes: c.conexoes.map(semSenha),
      usuarios: c.usuarios.map((u) => ({ id: u.id, usuario: u.usuario, ativo: u.ativo, criadoEm: u.criadoEm })),
      parametros: c.parametros,
      pastaDados: store.pastaDados(),
      scripts: db.SCRIPT_TABELAS,
    };
  });

  function normalizarConexao(dados) {
    const obrig = { nome: 'Nome da empresa', servidor: 'Servidor', banco: 'Banco de dados', usuario: 'Usuário do SQL' };
    for (const [k, rotulo] of Object.entries(obrig)) {
      if (!String(dados[k] || '').trim()) throw new Error(`Preencha: ${rotulo}.`);
    }
    return {
      nome: dados.nome.trim(),
      servidor: dados.servidor.trim(),
      porta: String(dados.porta || '').trim(),
      instancia: String(dados.instancia || '').trim(),
      banco: dados.banco.trim(),
      usuario: dados.usuario.trim(),
      encrypt: !!dados.encrypt,
    };
  }

  handle('config:salvarConexao', ({ dados, senha }) => {
    exigirConfig();
    const c = store.config();
    const base = normalizarConexao(dados);
    if (dados.id) {
      const i = c.conexoes.findIndex((x) => x.id === dados.id);
      if (i < 0) throw new Error('Conexão não encontrada.');
      c.conexoes[i] = { ...c.conexoes[i], ...base, ...(senha ? { senhaCripto: store.cripto(senha) } : {}) };
    } else {
      if (!senha) throw new Error('Informe a senha do banco.');
      c.conexoes.push({ id: novoId(), ...base, senhaCripto: store.cripto(senha) });
    }
    store.salvarConfig(c);
    return true;
  });

  handle('config:excluirConexao', (id) => {
    exigirConfig();
    const c = store.config();
    c.conexoes = c.conexoes.filter((x) => x.id !== id);
    if (c.ultimaConexaoId === id) c.ultimaConexaoId = null;
    store.salvarConfig(c);
    return true;
  });

  handle('config:testarConexao', async ({ dados, senha }) => {
    exigirConfig();
    let s = senha;
    if (!s && dados.id) s = store.decripto(conexaoPorId(dados.id).senhaCripto);
    return db.testarConexao(normalizarConexao(dados), s);
  });

  handle('config:salvarUsuario', ({ id, usuario, senha, ativo }) => {
    exigirConfig();
    const c = store.config();
    const nome = String(usuario || '').trim();
    if (nome.length < 3) throw new Error('Usuário deve ter pelo menos 3 caracteres!');
    if (c.usuarios.some((u) => u.usuario.toLowerCase() === nome.toLowerCase() && u.id !== id)) throw new Error('Usuário já existe! Escolha outro nome.');
    if (id) {
      const u = c.usuarios.find((x) => x.id === id);
      if (!u) throw new Error('Usuário não encontrado.');
      u.usuario = nome;
      u.ativo = ativo !== false;
      if (senha) {
        if (senha.length < 3) throw new Error('Senha deve ter pelo menos 3 caracteres!');
        Object.assign(u, store.gerarHash(senha));
      }
    } else {
      if (!senha || senha.length < 3) throw new Error('Senha deve ter pelo menos 3 caracteres!');
      c.usuarios.push({ id: novoId(), usuario: nome, ...store.gerarHash(senha), ativo: true, criadoEm: new Date().toISOString() });
    }
    if (!c.usuarios.some((u) => u.ativo)) throw new Error('É preciso manter pelo menos um usuário ativo.');
    store.salvarConfig(c);
    return true;
  });

  handle('config:excluirUsuario', (id) => {
    exigirConfig();
    const c = store.config();
    const resto = c.usuarios.filter((x) => x.id !== id);
    if (!resto.some((u) => u.ativo)) throw new Error('É preciso manter pelo menos um usuário ativo.');
    c.usuarios = resto;
    store.salvarConfig(c);
    return true;
  });

  handle('config:salvarParametros', (p) => {
    exigirConfig();
    const c = store.config();
    c.parametros = {
      ...c.parametros,
      situacaoPV: String(p.situacaoPV || 'E').trim().toUpperCase() || 'E',
      equipePadrao: String(p.equipePadrao || '').trim(),
      setorPadrao: String(p.setorPadrao || '').trim(),
      vendedorPadrao: String(p.vendedorPadrao || '').trim(),
      operacaoPadrao: String(p.operacaoPadrao || '').trim(),
      textoObs: String(p.textoObs || '').trim(),
      registrarEvento: p.registrarEvento !== false,
    };
    store.salvarConfig(c);
    return c.parametros;
  });

  handle('config:verificarTabelas', async (id) => { exigirConfig(); return db.verificarTabelas(await poolDe(conexaoPorId(id))); });
  handle('config:criarTabela', async ({ id, nome }) => { exigirConfig(); return db.criarTabela(await poolDe(conexaoPorId(id)), nome); });
  handle('config:abrirPasta', () => { shell.openPath(store.pastaDados()); return true; });

  // --------------------------------------------------------------
  // ERP
  // --------------------------------------------------------------
  handle('erp:fabricantes', async () => db.listarFabricantes(await poolAtual()));
  handle('erp:buscarClientes', async (termo) => db.buscarClientes(await poolAtual(), termo));
  handle('erp:nomeCliente', async (cod) => db.nomeCliente(await poolAtual(), cod));
  handle('erp:rupturas', async (filtros) => db.buscarRupturas(await poolAtual(), filtros, store.config().parametros));
  handle('erp:clientesRupturas', async (filtros) => db.clientesComRupturas(await poolAtual(), filtros, store.config().parametros));

  handle('erp:validar', (itens) => db.validarSelecao(itens));

  handle('erp:gerar', async (itens) => {
    const pool = await poolAtual();
    const r = await db.gerarPreVenda(pool, {
      itens,
      usuario: sessao.usuario,
      estacao: os.hostname(),
      parametros: store.config().parametros,
    });
    store.adicionarHistorico({
      id: novoId(),
      quando: new Date().toISOString(),
      usuario: sessao.usuario,
      estacao: os.hostname(),
      conexaoId: sessao.conexao.id,
      conexaoNome: sessao.conexao.nome,
      ...r,
    });
    return r;
  });

  handle('historico:listar', () => {
    exigirLogin();
    return store.historico().filter((h) => h.conexaoId === sessao.conexao.id);
  });

  handle('exportar:excel', async ({ tipo, linhas, titulo }) => {
    const nomePadrao = `${tipo === 'clientes' ? 'Clientes_com_Rupturas' : tipo === 'historico' ? 'Historico_PV_Ruptura' : 'Rupturas'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const r = await dialog.showSaveDialog(ctx.janela(), {
      title: 'Exportar para Excel',
      defaultPath: path.join(app.getPath('documents'), nomePadrao),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (r.canceled || !r.filePath) return null;
    await exportarExcel(r.filePath, tipo, linhas, titulo);
    shell.showItemInFolder(r.filePath);
    return r.filePath;
  });

  return {
    // fechar a aba encerra a sessão (login) e tranca a configuração
    aoFecharAba() { sessao.usuario = null; sessao.conexao = null; sessao.configLiberada = false; },
    encerrar: () => db.fecharTodos()
  };
};
