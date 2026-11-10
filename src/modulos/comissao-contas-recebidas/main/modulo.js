// Comissão por Contas Recebidas dentro do Parallello.
// O processo principal original (electron/main.js) virou uma função que recebe o contexto do Parallello:
// IPC só deste módulo, pasta de dados, janela para os diálogos, usuário e as conexões únicas.
const { dialog, shell, app } = require('electron');
const path = require('path');
const fs = require('fs');
const store = require('./store');
const erp = require('./erp');
const { processarRelatorio } = require('./processar');
const exportar = require('./exportar');
const { ehSenhaMaster } = require('../../../compartilhado/master.js');

const NA_PARALLELLO = 'As conexões com o banco agora ficam no Parallello: Ctrl+Shift+B na tela inicial (Configuração > Conexão com o banco).';

module.exports = function criarModulo(ctx) {
  // O SQLite (sql.js) carrega de forma assíncrona: os canais esperam ele ficar pronto.
  const pronto = store.init(ctx.pastaDados);
  pronto.catch((e) => console.error('[comissao] não abriu o arquivo de dados:', e));

  const ehAdmin = () => !!ctx.usuario()?.ehAdmin;

  // ---------------- conexões: as mesmas de todos os sistemas do Parallello ----------------
  const servidorDe = (p) => (p.instancia && !p.porta ? `${p.servidor}\\${p.instancia}` : p.servidor);
  async function listarConexoes() {
    const padrao = store.configObter('conexaoPadrao', null);
    const lista = (await ctx.conexoes.listar()).map((p) => ({
      id: p.id,
      nome: p.cliente ? `${p.cliente} › ${p.nome}` : p.nome,
      servidor: servidorDe(p),
      porta: p.porta || null,
      banco: p.banco,
      usuario: p.usuario,
      criptografar: !!p.criptografar,
      temSenha: !!p.temSenha,
      padrao: false,
    }));
    const escolhida = lista.find((c) => c.id === padrao) || lista[0];
    if (escolhida) escolhida.padrao = true;
    return lista.sort((a, b) => Number(b.padrao) - Number(a.padrao));
  }

  async function conexaoCompleta(id) {
    const lista = await listarConexoes();
    const c = lista.find((x) => x.id === id) || (!id ? lista[0] : null);
    if (!c) throw new Error(lista.length ? 'Conexão não encontrada. Escolha outra.' : `Nenhuma conexão cadastrada. ${NA_PARALLELLO}`);
    const senha = await ctx.conexoes.senha(c.id);
    if (!senha && !c.temSenha) throw new Error(`A conexão "${c.nome}" está sem senha neste computador. ${NA_PARALLELLO}`);
    return { ...c, senha };
  }

  // Chaves "com ST" da aba Configurações (área de sistema)
  function colunasST() {
    const st = store.configObter('colunasST', {}) || {};
    return { totalComST: st.totalComST === true, recebidoComST: st.recebidoComST !== false, somaPorBaixa: st.somaPorBaixa !== false };
  }
  // Área de sistema (Ctrl+Shift+B): a senha master do Parallello (P@r@llell0 + data), conferida pelo hash
  let sistemaLiberado = false;
  const exigirSistema = () => {
    if (!sistemaLiberado) throw new Error('Área de sistema bloqueada. Pressione Ctrl+Shift+B e informe a senha.');
  };

  const vendedoresCache = (conexaoId) =>
    store.all('SELECT codigo, nome FROM vendedores_cache WHERE conexao_id = ? ORDER BY nome', [conexaoId]);

  // ---------------- IPC ----------------
  function handle(canal, fn, { soAdmin = false } = {}) {
    ctx.ipc.handle(canal, async (_e, ...args) => {
      try {
        await pronto;
        if (!ctx.usuario()) throw new Error('Entre no Parallello.');
        if (soAdmin && !ehAdmin()) throw new Error('Somente administradores podem alterar as comissões no ERP.');
        return { ok: true, data: await fn(...args) };
      } catch (err) {
        return { ok: false, erro: (err && err.message) || String(err) };
      }
    });
  }

  async function salvarArquivo(titulo, nomePadrao, filtros, bytes) {
    const pasta = store.configObter('pastaExportacao', app.getPath('documents'));
    const r = await dialog.showSaveDialog(ctx.janela(), { title: titulo, defaultPath: path.join(pasta, nomePadrao), filters: filtros });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, Buffer.from(bytes));
    store.configDefinir('pastaExportacao', path.dirname(r.filePath));
    shell.openPath(r.filePath);
    return r.filePath;
  }

  function nomeArquivo(res, ext) {
    const f = res.filtros || {};
    const ven = f.vendedorRotulo ? '_' + f.vendedorRotulo.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_') : '';
    return `Comissao_${f.baixaInicio || ''}_a_${f.baixaFim || ''}${ven}.${ext}`;
  }

  // Conexões (cadastro no Parallello; aqui só escolhe a padrão e testa)
  handle('conexoes:listar', () => listarConexoes());
  handle('conexoes:salvar', () => { throw new Error(NA_PARALLELLO); });
  handle('conexoes:excluir', () => { throw new Error(NA_PARALLELLO); });
  handle('conexoes:padrao', (id) => {
    store.configDefinir('conexaoPadrao', id);
    return true;
  });
  handle('conexoes:testar', async (c) => erp.testar(await conexaoCompleta(c && c.id)));

  // Área de sistema
  handle('sistema:liberar', (senha) => {
    sistemaLiberado = ehSenhaMaster(senha);
    return sistemaLiberado;
  });

  // Vendedores e fabricantes
  handle('vendedores:listar', async (conexaoId, atualizar) => {
    const c = await conexaoCompleta(conexaoId);
    let lista = vendedoresCache(c.id);
    if (atualizar || !lista.length) {
      lista = await erp.vendedores(c);
      store.lote(() => {
        store.run('DELETE FROM vendedores_cache WHERE conexao_id = ?', [c.id]);
        for (const v of lista) store.run('INSERT OR REPLACE INTO vendedores_cache (conexao_id, codigo, nome) VALUES (?,?,?)', [c.id, v.codigo, v.nome]);
      });
    }
    return lista;
  });
  handle('fabricantes:listar', async (conexaoId) => erp.fabricantes(await conexaoCompleta(conexaoId)));

  // Relatório
  handle('relatorio:buscar', async (conexaoId, filtros) => {
    const c = await conexaoCompleta(conexaoId);
    const linhas = await erp.relatorio(c, filtros);
    store.configDefinir('ultimosFiltros', { ...filtros, conexaoId: c.id });
    store.configDefinir('conexaoPadrao', c.id);
    return processarRelatorio(linhas, { ...filtros, conexaoNome: c.nome, colunasST: colunasST() }, vendedoresCache(c.id));
  });

  // Configuração de comissões (grava no ERP: só administradores alteram)
  handle('comissoes:carregar', async (conexaoId, f) => erp.carregarComissoes(await conexaoCompleta(conexaoId), f));
  handle('comissoes:previa', async (conexaoId, f) => erp.previaComissoes(await conexaoCompleta(conexaoId), f));
  handle('comissoes:salvar', async (conexaoId, f) => erp.salvarComissoes(await conexaoCompleta(conexaoId), f), { soAdmin: true });
  handle('comissoes:excluir', async (conexaoId, f) => erp.excluirComissao(await conexaoCompleta(conexaoId), f), { soAdmin: true });

  // Fechamentos (histórico local)
  handle('fechamentos:listar', () =>
    store.all('SELECT id, criado_em, conexao, vendedor, baixa_inicio, baixa_fim, venda_desde, pedidos, recebido, comissao, observacao FROM fechamentos ORDER BY id DESC')
  );
  handle('fechamentos:obter', (id) => {
    const r = store.get('SELECT * FROM fechamentos WHERE id = ?', [id]);
    if (!r) throw new Error('Fechamento não encontrado.');
    return { ...r, dados: JSON.parse(r.dados) };
  });
  handle('fechamentos:salvar', ({ resultado, observacao }) => {
    const f = resultado.filtros || {};
    return store.run(
      'INSERT INTO fechamentos (conexao, vendedor, baixa_inicio, baixa_fim, venda_desde, pedidos, recebido, comissao, observacao, dados) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [f.conexaoNome, f.vendedorRotulo || 'Todos', f.baixaInicio, f.baixaFim, f.vendaDesde, resultado.totais.pedidos, resultado.totais.recebido, resultado.totais.comissao, observacao || '', JSON.stringify(resultado)]
    );
  });
  handle('fechamentos:excluir', (id) => {
    store.run('DELETE FROM fechamentos WHERE id = ?', [id]);
    return true;
  });

  // Exportações
  handle('exportar:excel', async (resultado, opts) =>
    salvarArquivo('Salvar Excel', nomeArquivo(resultado, 'xlsx'), [{ name: 'Excel', extensions: ['xlsx'] }], await exportar.gerarExcel(resultado, opts))
  );
  handle('exportar:pdf', async (resultado, opts) =>
    salvarArquivo('Salvar PDF', nomeArquivo(resultado, 'pdf'), [{ name: 'PDF', extensions: ['pdf'] }], await exportar.gerarPdf(resultado, opts))
  );

  handle('exportar:imprimir', (resultado, opts) => exportar.imprimir(resultado, opts, ctx.janela()));

  // Config simples
  handle('config:obter', (chave, padrao) => store.configObter(chave, padrao));
  handle('config:definir', (chave, valor) => {
    if (chave === 'colunasST') exigirSistema(); // configurações do cálculo só na área de sistema
    store.configDefinir(chave, valor);
    return true;
  });

  // Backup
  handle('backup:info', () => {
    const arq = store.caminho();
    const st = fs.statSync(arq);
    return { caminho: arq, tamanho: st.size, alterado: st.mtime.toISOString(), versao: ctx.versao };
  });
  handle('backup:exportar', async () => {
    exigirSistema();
    const hoje = new Date().toISOString().slice(0, 10);
    const r = await dialog.showSaveDialog(ctx.janela(), {
      title: 'Salvar backup',
      defaultPath: path.join(app.getPath('documents'), `backup-comissao-${hoje}.sqlite`),
      filters: [{ name: 'Backup', extensions: ['sqlite'] }],
    });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, store.exportarBytes());
    return r.filePath;
  });
  handle('backup:restaurar', async () => {
    exigirSistema();
    const r = await dialog.showOpenDialog(ctx.janela(), { title: 'Restaurar backup', properties: ['openFile'], filters: [{ name: 'Backup', extensions: ['sqlite'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    store.restaurar(fs.readFileSync(r.filePaths[0]));
    await erp.fecharTudo();
    return r.filePaths[0];
  });

  // Informação para a tela (mostrar ou não os botões de gravar no ERP)
  handle('sessao:info', () => ({ ehAdmin: ehAdmin(), usuario: ctx.usuario()?.nome ?? '' }));

  return {
    encerrar: () => erp.fecharTudo(),
  };
};
