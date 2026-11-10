// Análise de Crédito de Cliente dentro do Parallello.
// O electron/main.cjs original virou uma função que recebe o contexto do Parallello:
// IPC só deste módulo, pasta de dados, janela para os diálogos e as conexões únicas.
const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const store = require('./store.cjs');
const db = require('./db.cjs');
const { calcularScores, pontuacaoMaxima } = require('./score.cjs');
const { ehSenhaMaster } = require('../../../compartilhado/master.js');

module.exports = function criarModulo(ctx) {
  store.configurar({ pasta: ctx.pastaDados, conexoes: ctx.conexoes });
  let areaLiberada = false;
  const exigirArea = () => {
    if (!areaLiberada) throw new Error('Área do sistema bloqueada. Pressione Ctrl+Shift+B e informe a senha.');
  };

  const trata = (fn) => async (_e, ...args) => {
    try {
      if (!ctx.usuario()) throw new Error('Entre no Parallello.');
      return { ok: true, dados: await fn(...args) };
    } catch (err) {
      return { ok: false, erro: err && err.message ? err.message : String(err) };
    }
  };
  const ipcMain = { handle: (canal, fn) => ctx.ipc.handle(canal, fn) };
  const janela = () => ctx.janela();

  async function conexaoAtiva() {
    const c = await store.getConexao();
    if (!c) throw new Error('Nenhuma conexão cadastrada. Cadastre na Configuração do Parallello (Ctrl+Shift+B na tela inicial).');
    if (!c.senha) throw new Error(`A conexão "${c.nome}" está sem senha neste computador. Informe na Configuração do Parallello.`);
    return c;
  }

  // ---------- Senha (a master do Parallello, conferida pelo hash)
  ipcMain.handle('senha:validar', trata((s) => (areaLiberada = ehSenhaMaster(String(s || '')))));

  // ---------- Conexões (cadastro no Parallello; aqui escolhe a em uso e testa)
  ipcMain.handle('conexoes:listar', trata(() => store.listarConexoes()));
  ipcMain.handle('conexoes:salvar', trata((c) => store.salvarConexao(c)));
  ipcMain.handle('conexoes:excluir', trata((id) => store.excluirConexao(id)));
  ipcMain.handle('conexoes:ativar', trata(async (id) => { await db.fechar?.(); return store.ativarConexao(id); }));
  ipcMain.handle('conexoes:testar', trata(async (c) => {
    const salva = await store.getConexao(c && c.id);
    if (!salva) throw new Error('Conexão não encontrada.');
    return db.testar(salva);
  }));

  // ---------- Regras (área do sistema)
  ipcMain.handle('regras:get', trata(() => store.getRegras()));
  ipcMain.handle('regras:salvar', trata((r) => { exigirArea(); return store.salvarRegras(r); }));
  ipcMain.handle('regras:padrao', trata(() => store.regrasPadrao()));

  // ---------- Análise
  ipcMain.handle('credito:analisar', trata(async (filtros) => {
    const inicio = Date.now();
    const conexao = await conexaoAtiva();
    const regras = store.getRegras();
    const { metricas, linhas, tempos } = await db.analisar(conexao, filtros);
    const tBanco = Date.now();
    const { mapa, totalClientes, pontuacaoMaxima: max } = calcularScores(metricas, regras);
    const resultado = linhas.map((l) => ({ ...l, ClienteID: String(l.ClienteID).trim(), ...(mapa.get(String(l.ClienteID).trim()) || {}) }));
    resultado.sort((a, b) => (b.ScoreCredito || 0) - (a.ScoreCredito || 0) || String(a.Nome || '').localeCompare(String(b.Nome || ''), 'pt-BR'));
    return {
      linhas: resultado, totalClientesRanking: totalClientes, pontuacaoMaxima: max,
      segundos: (Date.now() - inicio) / 1000,
      tempos: [...tempos, { Etapa: 'Cálculo do score no app', Ms: Date.now() - tBanco, Linhas: metricas.length }],
      executadoEm: new Date().toISOString(),
      conexao: { id: conexao.id, nome: conexao.nome }
    };
  }));

  ipcMain.handle('credito:vendasMes', trata(async (filtros) => db.vendasMes(await conexaoAtiva(), filtros)));
  ipcMain.handle('credito:pontuacaoMaxima', trata(() => pontuacaoMaxima(store.getRegras())));

  // ---------- Decisões (gravadas com a conexão em uso e o usuário do Parallello)
  ipcMain.handle('decisoes:listar', trata(() => store.listarDecisoes()));
  ipcMain.handle('decisoes:salvar', trata(async (d) => {
    const c = await store.getConexao();
    return store.salvarDecisao({ ...d, conexaoId: c ? c.id : null, conexaoNome: c ? c.nome : '', usuarioParallello: ctx.usuario()?.nome ?? '' });
  }));
  ipcMain.handle('decisoes:excluir', trata((id) => store.excluirDecisao(id)));

// ---------- Exportar Excel
  // payload: { nomeArquivo, abas: [{ nome, colunas: [{ titulo, campo, tipo }], linhas }] }
  ipcMain.handle('exportar:excel', trata(async (payload) => {
    const { canceled, filePath } = await dialog.showSaveDialog(janela(), {
      title: 'Exportar para Excel',
      defaultPath: payload.nomeArquivo || 'analise-credito.xlsx',
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    });
    if (canceled || !filePath) return null;
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    for (const aba of payload.abas || []) {
      const ws = wb.addWorksheet(String(aba.nome || 'Dados').slice(0, 31));
      ws.columns = aba.colunas.map((c) => ({
        header: c.titulo,
        key: c.campo,
        width: c.largura || Math.max(12, String(c.titulo).length + 2),
        style: c.tipo === 'moeda' ? { numFmt: '"R$" #,##0.00' }
          : c.tipo === 'data' ? { numFmt: 'dd/mm/yyyy' }
          : c.tipo === 'decimal' ? { numFmt: '#,##0.00' } : {}
      }));
      for (const l of aba.linhas || []) {
        const row = {};
        for (const c of aba.colunas) {
          let v = l[c.campo];
          if (c.tipo === 'data' && v) v = new Date(v);
          row[c.campo] = v;
        }
        ws.addRow(row);
      }
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: aba.colunas.length } };
    }
    await wb.xlsx.writeFile(filePath);
    return filePath;
  }));
  
  // ---------- Relatórios: PDF e impressão
  // O front monta o HTML do relatório; aqui ele é aberto numa janela oculta.
  async function abrirRelatorio(html) {
    const tmp = path.join(app.getPath('temp'), `analise-credito-relatorio-${Date.now()}.html`);
    fs.writeFileSync(tmp, html, 'utf8');
    const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    await w.loadFile(tmp);
    const fechar = () => { try { w.destroy(); } catch { /* ignora */ } try { fs.unlinkSync(tmp); } catch { /* ignora */ } };
    return { w, fechar };
  }
  
  const RODAPE = `<div style="width:100%;font-size:8px;color:#7a8594;padding:0 12mm;display:flex;justify-content:space-between;font-family:Segoe UI,Arial">
    <span>Análise de Crédito</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`;
  
  ipcMain.handle('relatorio:pdf', trata(async ({ html, nomeArquivo, paisagem }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(janela(), {
      title: 'Salvar PDF',
      defaultPath: nomeArquivo || 'relatorio.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (canceled || !filePath) return null;
    const { w, fechar } = await abrirRelatorio(html);
    try {
      const pdf = await w.webContents.printToPDF({
        landscape: !!paisagem,
        printBackground: true,
        pageSize: 'A4',
        margins: { top: 0.4, bottom: 0.55, left: 0.4, right: 0.4 },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: RODAPE
      });
      fs.writeFileSync(filePath, pdf);
      shell.openPath(filePath);
      return filePath;
    } finally { fechar(); }
  }));
  
  ipcMain.handle('relatorio:imprimir', trata(async ({ html, paisagem }) => {
    const { w, fechar } = await abrirRelatorio(html);
    return new Promise((resolve, reject) => {
      w.webContents.print({ silent: false, printBackground: true, landscape: !!paisagem, pageSize: 'A4' }, (ok, motivo) => {
        fechar();
        if (ok || motivo === 'cancelled' || motivo === 'Print job canceled') resolve(ok);
        else reject(new Error(`Não foi possível imprimir: ${motivo}`));
      });
    });
  }));
  
  ipcMain.handle('arquivo:abrir', trata((p) => shell.openPath(p)));

  // ---------- Backup (área do sistema)
  ipcMain.handle('backup:exportar', trata(async () => {
    exigirArea();
    const d = new Date();
    const nome = `backup-analise-credito-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    const { canceled, filePath } = await dialog.showSaveDialog(janela(), {
      title: 'Salvar backup', defaultPath: path.join(app.getPath('documents'), nome), filters: [{ name: 'Backup', extensions: ['json'] }]
    });
    if (canceled || !filePath) return null;
    fs.writeFileSync(filePath, JSON.stringify(store.montarBackup(), null, 2), 'utf8');
    return filePath;
  }));

  ipcMain.handle('backup:importar', trata(async () => {
    exigirArea();
    const { canceled, filePaths } = await dialog.showOpenDialog(janela(), {
      title: 'Restaurar backup', properties: ['openFile'], filters: [{ name: 'Backup', extensions: ['json'] }]
    });
    if (canceled || !filePaths || !filePaths[0]) return null;
    const b = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    return store.restaurarBackup(b);
  }));

  ipcMain.handle('dados:pasta', trata(() => store.pasta()));
  ipcMain.handle('dados:abrirPasta', trata(() => shell.openPath(store.pasta())));

  return { encerrar: () => db.fechar?.() };
};
