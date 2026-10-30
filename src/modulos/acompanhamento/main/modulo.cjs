const { dialog, safeStorage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const store = require('./lib/store.cjs');
const db = require('./lib/db.cjs');
const { gerarExcel } = require('./lib/exportar.cjs');
const crypto = require('crypto');

// Módulo do Parallello: o processo principal original virou uma função que recebe o contexto
// (IPC só deste módulo, pasta de dados, janela para os diálogos).
module.exports = function criarModulo(ctx) {
  const ipcMain = ctx.ipc;
  store.init(ctx.pastaDados);

  const RELATORIOS = [
    require('./reports/acompanhamento.cjs'),
    require('./reports/valorVolume.cjs'),
    require('./reports/ranking.cjs'),
    require('./reports/setorComSemCompra.cjs'),
    require('./reports/ruptura.cjs')
  ];

  let configLiberada = false; // área de configuração desbloqueada nesta sessão (Ctrl+Shift+B + senha)

  // ---------------- senha da área de configuração ----------------
  // Senha master: "@t1v0ERP10" + data do computador em DDMMAAAA (ex.: 29/10/2026 -> @t1v0ERP1029102026).
  // Muda todo dia e sempre funciona. Opcionalmente o administrador pode cadastrar uma senha própria,
  // que passa a valer junto com a master.
  const PREFIXO_MASTER = '@t1v0ERP10';
  function senhaMasterDoDia(agora = new Date()) {
    const dd = String(agora.getDate()).padStart(2, '0');
    const mm = String(agora.getMonth() + 1).padStart(2, '0');
    return PREFIXO_MASTER + dd + mm + agora.getFullYear();
  }
  const hashSenha = (s) => crypto.createHash('sha256').update('acomp-vendas::' + String(s)).digest('hex');
  function igual(h1, h2) {
    const a = Buffer.from(h1, 'hex');
    const b = Buffer.from(h2, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  function senhaConfere(senha) {
    const digitada = hashSenha(senha);
    if (igual(digitada, hashSenha(senhaMasterDoDia()))) return true;
    const propria = (store.get().preferencias || {}).senhaConfigHash;
    return !!propria && igual(digitada, propria);
  }
  function exigirConfig() {
    if (!configLiberada) throw new Error('Área de configuração bloqueada.');
  }
  const cache = new Map(); // relatorioId -> { assinatura, porBase }

  // ---------------- senha das bases ----------------
  function cifrar(texto) {
    if (!texto) return '';
    if (safeStorage.isEncryptionAvailable()) return 'ss:' + safeStorage.encryptString(texto).toString('base64');
    return 'b64:' + Buffer.from(texto, 'utf8').toString('base64');
  }
  function decifrar(valor) {
    if (!valor) return '';
    if (valor.startsWith('ss:')) return safeStorage.decryptString(Buffer.from(valor.slice(3), 'base64'));
    if (valor.startsWith('b64:')) return Buffer.from(valor.slice(4), 'base64').toString('utf8');
    return valor;
  }
  db.setDecifrador((v) => {
    try {
      return decifrar(v);
    } catch (_) {
      throw new Error('Não foi possível ler a senha salva (backup de outro computador?). Digite a senha da base novamente.');
    }
  });

  // dados enviados para a tela nunca levam a senha
  // Conexão única do Parallello: as bases são as conexões cadastradas no Parallello
  // (Ctrl+Shift+B na tela inicial), as mesmas de todos os sistemas. Todas as ativas são somadas.
  const paraBase = (p) => ({
    id: p.id,
    nome: p.cliente && p.cliente !== p.nome ? `${p.cliente} › ${p.nome}` : p.nome,
    servidor: p.servidor,
    porta: p.porta ? String(p.porta) : '',
    instancia: p.instancia || '',
    banco: p.banco,
    usuario: p.usuario,
    ativa: true,
    timeoutSeg: 180,
    criptografar: !!p.criptografar,
    temSenha: !!p.temSenha
  });
  async function basesCentrais() {
    return (await ctx.conexoes.listar()).map(paraBase);
  }

  // dados enviados para a tela nunca levam a senha
  async function dadosParaTela() {
    const d = JSON.parse(JSON.stringify(store.get()));
    const bases = await basesCentrais();
    d.empresas.forEach((e) => { e.bases = bases; });
    if (d.preferencias) delete d.preferencias.senhaConfigHash;
    d.pastaDados = store.pasta();
    d.configLiberada = configLiberada;
    d.versaoApp = ctx.versao;
    d.basesDoParallello = true;
    return d;
  }

  async function empresaAtiva() {
    const d = store.get();
    const e = d.empresas.find((x) => x.id === d.empresaAtivaId);
    if (!e) throw new Error('Nenhuma empresa selecionada.');
    // a senha vai só na memória, para a consulta (b64: é lido pelo decifrador do db.cjs)
    const bases = await Promise.all((await basesCentrais()).map(async (b) => ({
      ...b,
      senhaCifrada: 'b64:' + Buffer.from(await ctx.conexoes.senha(b.id), 'utf8').toString('base64')
    })));
    return { ...e, bases };
  }

  function progresso(msg) {
    ctx.enviar('progresso', msg);
  }

  // ---------------- dados / empresas ----------------
  ipcMain.handle('dados:obter', () => dadosParaTela());

  ipcMain.handle('empresa:salvar', (_e, empresa) => {
    exigirConfig();
    store.atualizar((d) => {
      const atual = d.empresas.find((x) => x.id === empresa.id);
      const { bases: _bases, ...resto } = empresa; // bases: as conexões do Parallello (não gravam aqui)
      const nova = { ...(atual || store.novaEmpresa(empresa.nome)), ...resto, bases: [] };
      if (atual) d.empresas = d.empresas.map((x) => (x.id === nova.id ? nova : x));
      else d.empresas.push(nova);
      if (!d.empresaAtivaId) d.empresaAtivaId = nova.id;
      return d;
    });
    cache.clear();
    return dadosParaTela();
  });

  ipcMain.handle('empresa:nova', (_e, nome) => {
    exigirConfig();
    const emp = store.novaEmpresa(nome);
    store.atualizar((d) => { d.empresas.push(emp); d.empresaAtivaId = emp.id; return d; });
    cache.clear();
    return dadosParaTela();
  });

  ipcMain.handle('empresa:excluir', (_e, id) => {
    exigirConfig();
    store.atualizar((d) => {
      d.empresas = d.empresas.filter((x) => x.id !== id);
      if (d.empresaAtivaId === id) d.empresaAtivaId = d.empresas[0] ? d.empresas[0].id : null;
      return d;
    });
    cache.clear();
    return dadosParaTela();
  });

  ipcMain.handle('empresa:ativar', (_e, id) => {
    store.atualizar((d) => { d.empresaAtivaId = id; return d; });
    cache.clear();
    return dadosParaTela();
  });

  ipcMain.handle('preferencias:salvar', (_e, prefs) => {
    exigirConfig();
    store.atualizar((d) => { d.preferencias = { ...d.preferencias, ...prefs }; return d; });
    return dadosParaTela();
  });

  ipcMain.handle('base:testar', async (_e, { base }) => {
    exigirConfig();
    try {
      const senha = await ctx.conexoes.senha(base.id);
      const r = await db.testar({ ...base, id: 'teste-' + base.id, senhaCifrada: 'b64:' + Buffer.from(senha, 'utf8').toString('base64') });
      return { ok: true, ...r };
    } catch (err) {
      return { ok: false, erro: err.message };
    }
  });

  // ---------------- relatórios ----------------
  ipcMain.handle('relatorios:listar', () =>
    RELATORIOS.map((r) => ({
      id: r.id, nome: r.nome, descricao: r.descricao, usaDeduzir: r.usaDeduzir,
      opcoes: r.opcoes || [], filtrosLista: r.filtrosLista || [], filtrosTexto: r.filtrosTexto || []
    }))
  );

  function validarPeriodo(f) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.ini || '') || !/^\d{4}-\d{2}-\d{2}$/.test(f.fim || '')) {
      throw new Error('Informe a data inicial e a final.');
    }
    if (f.fim < f.ini) throw new Error('A data final não pode ser menor que a inicial.');
  }

  function cabecalho(rel, emp, filtros, extra) {
    const br = (s) => s.split('-').reverse().join('/');
    return {
      ...extra,
      subtitulo: `${emp.nome} • ${br(filtros.ini)} a ${br(filtros.fim)}` +
        (rel.usaDeduzir ? ` • Deduzir retorno: ${filtros.deduzirRetorno ? 'SIM' : 'NÃO'}` : ''),
      geradoEm: new Date().toISOString()
    };
  }

  ipcMain.handle('relatorio:executar', async (_e, { id, filtros }) => {
    const rel = RELATORIOS.find((r) => r.id === id);
    if (!rel) throw new Error('Relatório não encontrado.');
    validarPeriodo(filtros);
    const emp = await empresaAtiva();
    const t0 = Date.now();
    const porBase = await db.executarEmTodas(emp, rel.consultas(emp, filtros), { ini: filtros.ini, fim: filtros.fim }, progresso);
    progresso('Montando o relatório...');
    cache.set(id, { empresaId: emp.id, porBase, filtrosConsulta: { ini: filtros.ini, fim: filtros.fim } });
    const tabela = rel.montar(emp, porBase, filtros);
    progresso(null);
    return cabecalho(rel, emp, filtros, { ...tabela, bases: porBase.map((b) => b.base.nome || b.base.banco), segundos: (Date.now() - t0) / 1000 });
  });

  // refaz a montagem com novos filtros locais, sem consultar o banco de novo
  ipcMain.handle('relatorio:remontar', async (_e, { id, filtros }) => {
    const rel = RELATORIOS.find((r) => r.id === id);
    const emp = await empresaAtiva();
    const c = cache.get(id);
    if (!c || c.empresaId !== emp.id) return null;
    const f = { ...filtros, ...c.filtrosConsulta };
    const tabela = rel.montar(emp, c.porBase, f);
    return cabecalho(rel, emp, f, { ...tabela, bases: c.porBase.map((b) => b.base.nome || b.base.banco) });
  });

  // ---------------- configuração protegida ----------------
  ipcMain.handle('config:desbloquear', (_e, senha) => {
    configLiberada = senhaConfere(senha);
    return configLiberada;
  });
  ipcMain.handle('config:bloquear', () => { configLiberada = false; return true; });
  ipcMain.handle('config:alterarSenha', (_e, { atual, nova }) => {
    exigirConfig();
    if (!senhaConfere(atual)) throw new Error('A senha atual não confere.');
    if (!nova || String(nova).length < 6) throw new Error('A nova senha precisa ter pelo menos 6 caracteres.');
    store.atualizar((d) => { d.preferencias = { ...d.preferencias, senhaConfigHash: hashSenha(nova) }; return d; });
    return true;
  });

  // ---------------- exportação ----------------
  function nomeArquivo(t) {
    return String(t || 'relatorio').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').slice(0, 60);
  }

  ipcMain.handle('exportar:excel', async (_e, { titulo, planilhas }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(ctx.janela(), {
      title: 'Salvar em Excel',
      defaultPath: `${nomeArquivo(titulo)}_${new Date().toISOString().slice(0, 10)}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    });
    if (canceled || !filePath) return null;
    await gerarExcel(filePath, planilhas);
    shell.showItemInFolder(filePath);
    return filePath;
  });

  ipcMain.handle('exportar:pdf', async (_e, { titulo }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(ctx.janela(), {
      title: 'Salvar em PDF',
      defaultPath: `${nomeArquivo(titulo)}_${new Date().toISOString().slice(0, 10)}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (canceled || !filePath) return null;
    const pdf = await _e.sender.printToPDF({
      landscape: true,
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.4, bottom: 0.4, left: 0.3, right: 0.3 }
    });
    fs.writeFileSync(filePath, pdf);
    shell.openPath(filePath);
    return filePath;
  });

  // ---------------- backup ----------------
  ipcMain.handle('backup:exportar', async () => {
    exigirConfig();
    const { canceled, filePath } = await dialog.showSaveDialog(ctx.janela(), {
      title: 'Salvar cópia de segurança',
      defaultPath: `backup-acompanhamento-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'Backup', extensions: ['json'] }]
    });
    if (canceled || !filePath) return null;
    store.exportarPara(filePath);
    return filePath;
  });

  ipcMain.handle('backup:importar', async () => {
    exigirConfig();
    const { canceled, filePaths } = await dialog.showOpenDialog(ctx.janela(), {
      title: 'Restaurar cópia de segurança',
      properties: ['openFile'],
      filters: [{ name: 'Backup', extensions: ['json'] }]
    });
    if (canceled || !filePaths[0]) return null;
    store.importarDe(filePaths[0]);
    cache.clear();
    return dadosParaTela();
  });

  ipcMain.handle('backup:abrirPasta', () => { exigirConfig(); return shell.openPath(store.pasta()); });
  ipcMain.handle('backup:listar', () => (exigirConfig(), store.listarBackups()).map((b) => ({ nome: b.nome, data: b.data })));

  return {
    // fechar a aba tranca de novo a área de configuração
    aoFecharAba() { configLiberada = false; },
    encerrar: () => db.fecharTudo()
  };
};
