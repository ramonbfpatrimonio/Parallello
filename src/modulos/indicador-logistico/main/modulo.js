const { app, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const CFG = require('./config');
const store = require('./store');
const banco = require('./banco');
const motor = require('./motor');
const exportar = require('./exportar');

// Módulo do Parallello: o processo principal original virou uma função que recebe o contexto
// (IPC só deste módulo, pasta de dados, janela para os diálogos).
module.exports = function criarModulo(ctx) {
  store.setBase(ctx.pastaDados);

  // Login único: a sessão é a do Parallello (administrador do Parallello = administrador aqui).
  let sessao = null; // { id, usuario, nome, perfil }
  function sessaoDoParallello() {
    const u = ctx.usuario();
    if (!u) return null;
    return { id: u.id, usuario: u.usuario, nome: u.nome, perfil: u.ehAdmin ? 'admin' : 'operador', parallello: true };
  }
  const NA_CONFIG_PARALLELLO = 'Conexões e usuários agora ficam no Parallello: conexões em Ctrl+Shift+B na tela inicial, usuários em "Liberar módulos".';

  // Conexão única do Parallello (as mesmas de todos os sistemas). Grupo = cliente da conexão.
  const paraConexao = (p) => ({
    id: p.id,
    nome: p.nome,
    grupo: String(p.cliente || '').trim().toUpperCase(),
    servidor: p.instancia && !p.porta ? `${p.servidor}\\${p.instancia}` : p.servidor,
    porta: p.porta || '',
    banco: p.banco,
    usuario: p.usuario,
    encrypt: !!p.criptografar,
    timeout: 120,
    ativo: true,
    temSenha: !!p.temSenha,
  });
  async function conexoesCentrais() { return (await ctx.conexoes.listar()).map(paraConexao); }

  // ============================== Dados ==============================
  const dados = {
    usuarios: () => store.ler('usuarios', []),
    conexoes: () => store.ler('conexoes', []),
    centros: () => store.ler('centros', CFG.CENTROS_PADRAO.map(([codigo, descricao]) => ({ codigo: String(codigo), descricao }))),
    metas: () => {
      const salvas = store.ler('metas', {});
      const out = {};
      for (const [k, p] of Object.entries(CFG.METAS_PADRAO)) {
        const s = salvas[k] || {};
        out[k] = { ...p, ...s, melhor: p.melhor, textos: { ...p.textos, ...(s.textos || {}) } };
      }
      return out;
    },
    config: () => ({ ...CFG.CONFIG_PADRAO, ...store.ler('config', {}) })
  };





  const ehAdmin = () => sessao && (sessao.perfil === 'master' || sessao.perfil === 'admin');

  // IPC padronizado: { ok, dados } ou { ok:false, erro }
  function handle(canal, fn, nivel = 'logado') {
    ctx.ipc.handle(canal, async (_e, arg) => {
      try {
        sessao = sessaoDoParallello();
        if (nivel !== 'publico' && !sessao) throw new Error('Sessão expirada. Entre novamente.');
        if (nivel === 'admin' && !ehAdmin()) throw new Error('Acesso permitido somente a administradores.');
        return { ok: true, dados: await fn(arg || {}) };
      } catch (err) {
        return { ok: false, erro: err && err.message ? err.message : String(err) };
      }
    });
  }

  // ============================== Login ==============================
  handle('auth:estado', () => ({ temUsuarios: true, sessao }), 'publico');
  handle('auth:entrar', () => {
    if (!sessao) throw new Error('Entre no Parallello.');
    return sessao;
  }, 'publico');
  handle('auth:sair', () => true, 'publico');
  handle('auth:trocarSenha', () => { throw new Error('A senha é a do Parallello. Peça ao administrador para trocar em "Liberar módulos".'); });

  // ============================== Usuários ==============================
  handle('usuarios:listar', () => { throw new Error(NA_CONFIG_PARALLELLO); }, 'admin');

  handle('usuarios:salvar', () => { throw new Error(NA_CONFIG_PARALLELLO); }, 'admin');

  handle('usuarios:excluir', () => { throw new Error(NA_CONFIG_PARALLELLO); }, 'admin');

  // ============================== Conexões ==============================
  handle('conexoes:listar', () => conexoesCentrais());

  handle('conexoes:salvar', () => { throw new Error(NA_CONFIG_PARALLELLO); }, 'admin');

  handle('conexoes:excluir', () => { throw new Error(NA_CONFIG_PARALLELLO); }, 'admin');

  handle('conexoes:ordenar', () => { throw new Error(NA_CONFIG_PARALLELLO); }, 'admin');

  handle('conexoes:testar', async (c) => banco.testar(c, c.senha || (c.id ? await ctx.conexoes.senha(c.id) : '')), 'admin');

  // ============================== Cadastros simples ==============================
  handle('centros:listar', () => dados.centros());
  handle('centros:salvar', ({ lista }) => {
    const limpos = [];
    const vistos = new Set();
    for (const c of lista || []) {
      const codigo = String(c.codigo || '').trim();
      if (!codigo || vistos.has(codigo)) continue;
      vistos.add(codigo);
      limpos.push({ codigo, descricao: String(c.descricao || '').trim() });
    }
    limpos.sort((a, b) => Number(a.codigo) - Number(b.codigo) || a.codigo.localeCompare(b.codigo));
    store.gravar('centros', limpos);
    return limpos;
  }, 'admin');
  handle('centros:restaurar', () => {
    const l = CFG.CENTROS_PADRAO.map(([codigo, descricao]) => ({ codigo: String(codigo), descricao }));
    store.gravar('centros', l);
    return l;
  }, 'admin');

  handle('metas:obter', () => dados.metas());
  handle('metas:salvar', (m) => {
    const atual = dados.metas();
    for (const k of Object.keys(CFG.METAS_PADRAO)) {
      if (!m[k]) continue;
      const t = m[k].textos || {};
      atual[k] = {
        ...atual[k], ativo: !!m[k].ativo, meta: Number(m[k].meta) || 0, atencao: Number(m[k].atencao) || 0, melhor: CFG.METAS_PADRAO[k].melhor,
        textos: { ok: String(t.ok ?? '').trim(), atencao: String(t.atencao ?? '').trim(), critico: String(t.critico ?? '').trim() }
      };
    }
    store.gravar('metas', atual);
    return dados.metas();
  }, 'admin');
  handle('metas:restaurar', () => {
    store.gravar('metas', {});
    return dados.metas();
  }, 'admin');

  handle('config:obter', () => dados.config());
  handle('config:salvar', (c) => {
    const atual = { ...dados.config(), ...c };
    store.gravar('config', atual);
    return atual;
  }, 'admin');

  // ============================== Painel ==============================
  async function resolverSelecao(selecao) {
    const todas = await conexoesCentrais();
    const ativas = todas.filter((c) => c.ativo);
    if (!selecao || selecao.tipo === 'todas') return { conexoes: ativas, rotulo: 'TODAS' };
    if (selecao.tipo === 'grupo') return { conexoes: ativas.filter((c) => c.grupo === selecao.valor), rotulo: selecao.valor };
    const c = todas.find((x) => x.id === selecao.valor);
    return { conexoes: c ? [c] : [], rotulo: c ? c.nome : '?' };
  }

  handle('painel:consultar', async (f) => {
    const dataOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
    if (!dataOk(f.ini) || !dataOk(f.fim)) throw new Error('Informe as datas inicial e final.');
    if (f.ini > f.fim) throw new Error('A data inicial é maior que a data final.');
    if (!f.centro) throw new Error('Selecione o centro de custo.');
    const { conexoes, rotulo } = await resolverSelecao(f.selecao);
    if (!conexoes.length) throw new Error('Nenhuma conexão ativa para o filtro escolhido. Cadastre em Conexões.');

    const modo = f.modo === 'planilha' ? 'planilha' : 'padrao';
    const p = banco.paramsPeriodo(f.ini, f.fim, f.centro);
    const consolidado = conexoes.length > 1;

    const respostas = await Promise.all(conexoes.map(async (c) => {
      try {
        const senha = await ctx.conexoes.senha(c.id);
        const r = modo === 'planilha' ? await banco.buscarPlanilha(c, senha, p, consolidado) : await banco.buscarPadrao(c, senha, p);
        return { nome: c.nome, ok: true, ...r };
      } catch (err) {
        return { nome: c.nome, ok: false, erro: err.message || String(err) };
      }
    }));
    const okas = respostas.filter((r) => r.ok);
    if (!okas.length) throw new Error('Nenhuma conexão respondeu:\n' + respostas.map((r) => `• ${r.nome}: ${r.erro}`).join('\n'));

    const res = modo === 'planilha'
      ? motor.calcularPlanilha({ conexoes: okas, consolidado })
      : motor.calcularPadrao({ ini: f.ini, fim: f.fim, conexoes: okas, unificar: f.unificar !== false });

    const centro = dados.centros().find((c) => c.codigo === String(f.centro));
    const resultado = {
      ...res,
      geradoEm: new Date().toISOString(),
      usuario: sessao.nome,
      filtros: {
        ini: f.ini, fim: f.fim, selecao: f.selecao, selecaoRotulo: rotulo, centro: String(f.centro),
        centroRotulo: centro ? `${centro.codigo} - ${centro.descricao}` : String(f.centro), modo, unificar: f.unificar !== false
      },
      conexoes: respostas.map((r) => ({ nome: r.nome, ok: r.ok, erro: r.erro || null }))
    };

    const tot = (id) => resultado.blocos.flatMap((b) => b.linhas).find((l) => l.id === id)?.total ?? null;
    resultado.historicoId = store.historicoSalvar({
      resumo: {
        geradoEm: resultado.geradoEm, usuario: resultado.usuario, ini: f.ini, fim: f.fim, modo,
        selecaoRotulo: rotulo, centroRotulo: resultado.filtros.centroRotulo,
        totais: { cumprimento: tot('cumprimento'), prazo: tot('prazo'), custoEntrega: tot('custoEntrega'), devolucao: tot('devolucao') },
        falhas: respostas.filter((r) => !r.ok).length
      },
      resultado
    }, CFG.HISTORICO_MAX);
    return resultado;
  });

  // ============================== Histórico ==============================
  handle('historico:listar', () => store.historicoListar());
  handle('historico:obter', ({ id }) => {
    const r = store.historicoObter(id);
    if (!r) throw new Error('Consulta não encontrada no histórico.');
    return r;
  });
  handle('historico:excluir', ({ id }) => { store.historicoExcluir(id); return true; }, 'admin');

  // ============================== Exportação ==============================
  function nomeArquivo(resultado, ext) {
    const f = resultado.filtros || {};
    return `Indicador_Logistico_${(f.ini || '').replace(/-/g, '')}-${(f.fim || '').replace(/-/g, '')}_${String(f.selecaoRotulo || '').replace(/[^\w-]+/g, '_')}.${ext}`;
  }

  handle('exportar:excel', async ({ resultado }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(ctx.janela(), {
      title: 'Salvar planilha', defaultPath: path.join(app.getPath('documents'), nomeArquivo(resultado, 'xlsx')),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    });
    if (canceled || !filePath) return null;
    await exportar.excel(filePath, { resultado, metas: dados.metas(), empresa: dados.config().empresa });
    shell.showItemInFolder(filePath);
    return filePath;
  });

  handle('exportar:pdf', async ({ resultado }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(ctx.janela(), {
      title: 'Salvar PDF', defaultPath: path.join(app.getPath('documents'), nomeArquivo(resultado, 'pdf')),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (canceled || !filePath) return null;
    await exportar.pdf(filePath, { resultado, metas: dados.metas(), empresa: dados.config().empresa });
    shell.openPath(filePath);
    return filePath;
  });

  // ============================== Backup ==============================
  handle('backup:exportar', async () => {
    const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const { canceled, filePath } = await dialog.showSaveDialog(ctx.janela(), {
      title: 'Salvar backup', defaultPath: path.join(app.getPath('documents'), `backup_indicador_logistico_${hoje}.json`),
      filters: [{ name: 'Backup', extensions: ['json'] }]
    });
    if (canceled || !filePath) return null;
    const pacote = {
      sistema: 'indicador-logistico', versao: ctx.versao, geradoEm: new Date().toISOString(),
      // usuários e conexões são do Parallello (não vão no backup do Indicador)
      centros: dados.centros(), metas: dados.metas(), config: dados.config()
    };
    fs.writeFileSync(filePath, JSON.stringify(pacote, null, 2), 'utf8');
    return filePath;
  }, 'admin');

  handle('backup:importar', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(ctx.janela(), {
      title: 'Restaurar backup', properties: ['openFile'], filters: [{ name: 'Backup', extensions: ['json'] }]
    });
    if (canceled || !filePaths?.length) return null;
    const pacote = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    if (pacote.sistema !== 'indicador-logistico') throw new Error('Este arquivo não é um backup do Indicador Logístico.');
    store.gravar('centros', pacote.centros || []);
    store.gravar('metas', pacote.metas || {});
    store.gravar('config', pacote.config || {});
    return true;
  }, 'admin');

  // ============================== Sistema ==============================
  handle('app:info', () => ({ versao: ctx.versao, pastaDados: store.dir() }));
  handle('app:abrirPastaDados', () => shell.openPath(store.dir()), 'admin');

  return {
    // fechar a aba encerra a sessão (login)
    aoFecharAba() { sessao = null; }
  };
};
