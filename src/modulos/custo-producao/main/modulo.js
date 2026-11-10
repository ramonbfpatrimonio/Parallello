// Custo Produto/Produção dentro do Parallello.
// O electron/main.js original virou uma função que recebe o contexto do Parallello:
// IPC só deste módulo, pasta de dados, janela para os diálogos e as conexões únicas.
const { app, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const db = require('./db');
const exportar = require('./export');
const { ehSenhaMaster } = require('../../../compartilhado/master.js');

module.exports = function criarModulo(ctx) {
  store.configurar({ pasta: ctx.pastaDados, conexoes: ctx.conexoes });
  let sistemaLiberado = false;
  const exigirSistema = () => {
    if (!sistemaLiberado) throw new Error('Área do sistema bloqueada. Pressione Ctrl+Shift+B e informe a senha.');
  };

  function handle(canal, fn) {
    ctx.ipc.handle(canal, async (_e, ...args) => {
      try {
        if (!ctx.usuario()) throw new Error('Entre no Parallello.');
        return { ok: true, dados: await fn(...args) };
      } catch (err) {
        return { ok: false, erro: (err && err.message) || String(err) };
      }
    });
  }

  const nomeArquivo = (ext) => `Custo_Producao_${new Date().toISOString().slice(0, 10)}.${ext}`;
  async function escolherDestino(ext, nome) {
    const r = await dialog.showSaveDialog(ctx.janela(), {
      title: 'Salvar arquivo',
      defaultPath: path.join(app.getPath('documents'), nome || nomeArquivo(ext)),
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    return r.canceled ? null : r.filePath;
  }

  // Sistema (área oculta): a senha master do Parallello, conferida pelo hash
  handle('sistema:validarSenha', (senha) => (sistemaLiberado = ehSenhaMaster(String(senha || ''))));

  // Configuração
  handle('config:get', () => store.configPublica());
  handle('config:salvarPreferencias', (p) => { exigirSistema(); return store.salvarPreferencias(p); });
  handle('config:pastaDados', () => store.pastaDados());

  // Conexões: cadastro no Parallello; aqui escolhe a em uso e ajusta coluna de data e tempo limite
  handle('conexao:salvar', async (form) => { exigirSistema(); await db.fechar(); return store.salvarConexao(form); });
  handle('conexao:duplicar', (id) => store.duplicarConexao(id));
  handle('conexao:excluir', (id) => store.excluirConexao(id));
  handle('conexao:ativar', async (id) => { await db.fechar(); return store.ativarConexao(id); });

  // Banco
  handle('db:testar', async (form) => db.testar(await store.conexaoDoFormulario(form)));
  handle('db:colunasData', async (form) => db.colunasData(await store.conexaoDoFormulario(form)));
  handle('custo:consultar', async (filtros) => db.consultarCusto(await store.conexaoAtiva(), filtros));

  // Histórico
  handle('hist:listar', () => store.listarHistorico());
  handle('hist:salvar', (dados) => store.salvarSnapshot(dados));
  handle('hist:abrir', (id) => store.abrirSnapshot(id));
  handle('hist:excluir', (id) => store.excluirSnapshot(id));

  // Exportação
  handle('exportar:excel', async (dados) => {
    const destino = await escolherDestino('xlsx');
    if (!destino) return null;
    await exportar.excel(destino, dados);
    return destino;
  });
  handle('exportar:pdf', async (dados) => {
    const destino = await escolherDestino('pdf');
    if (!destino) return null;
    await exportar.pdf(destino, dados);
    return destino;
  });
  handle('exportar:imprimir', (dados) => exportar.imprimir(dados));

  // Backup (área do sistema)
  handle('backup:exportar', async () => {
    exigirSistema();
    const destino = await escolherDestino('json', `Backup_Custo_Producao_${new Date().toISOString().slice(0, 10)}.json`);
    if (!destino) return null;
    fs.writeFileSync(destino, JSON.stringify(store.montarBackup(), null, 2), 'utf8');
    return destino;
  });
  handle('backup:importar', async () => {
    exigirSistema();
    const r = await dialog.showOpenDialog(ctx.janela(), {
      title: 'Restaurar backup',
      properties: ['openFile'],
      filters: [{ name: 'Backup', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const dados = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
    return store.restaurarBackup(dados);
  });

  return { encerrar: () => db.fechar() };
};
