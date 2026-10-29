// Parallello — processo principal.
//
// Uma janela com a barra do Parallello (tela inicial + abas) e, abaixo dela, a tela de cada
// sistema aberto, cada uma num WebContentsView próprio (isolada, com o seu preload).
// O processo principal de cada sistema roda aqui dentro, com IPC só dele (ver roteador.js).
import { app, BrowserWindow, WebContentsView, Menu, ipcMain, shell } from 'electron';
import path from 'path';
import { CATALOGO } from '../modulos/catalogo.js';
import { FABRICAS } from './modulos.js';
import { ipcDoModulo, vincularTela, desvincularTela } from './roteador.js';
import { migrarSePreciso } from './migracao.js';
import { criarAtualizacao } from './atualizacao.js';

const ALTURA_BARRA = 48;
const DEV_URL = process.env.PARALLELLO_DEV_URL || '';
const PASTA_OUT = path.join(__dirname, '..'); // out/
const PASTA_RENDERER = path.join(PASTA_OUT, 'renderer');
const PASTA_PRELOAD = path.join(PASTA_OUT, 'preload');

// Pasta fixa e sem acento para os dados (todos os sistemas ficam em %APPDATA%\Parallello\modulos\<id>).
app.setPath('userData', process.env.PARALLELLO_USERDATA || path.join(app.getPath('appData'), 'Parallello'));
const pastaModulos = () => path.join(app.getPath('userData'), 'modulos');

let janela = null;
const ativos = new Map(); // id -> { instancia, erro } (processo principal do módulo, criado uma vez)
const abas = new Map(); // id -> WebContentsView (tela aberta)
let ordemAbas = []; // ids na ordem em que foram abertos
let atual = null; // id do sistema em primeiro plano; null = tela inicial
let atualizacao = null;

// ---------------- estado para a tela do Parallello ----------------
function estado() {
  return {
    versao: app.getVersion(),
    atual,
    abas: ordemAbas.slice(),
    erros: Object.fromEntries([...ativos].filter(([, a]) => a.erro).map(([id, a]) => [id, a.erro])),
    atualizacao: atualizacao ? atualizacao.estado() : { tipo: 'parado' },
  };
}
function avisarMudanca() {
  if (janela && !janela.isDestroyed()) janela.webContents.send('parallello:estado', estado());
}

// ---------------- processo principal de cada sistema ----------------
function iniciarModulo(id) {
  if (ativos.has(id)) return ativos.get(id);
  const pastaDados = path.join(pastaModulos(), id);
  const registro = { instancia: null, erro: null };
  try {
    migrarSePreciso(id, pastaDados, app.getPath('appData'));
    const criar = FABRICAS[id]();
    registro.instancia = criar({
      id,
      ipc: ipcDoModulo(id),
      pastaDados,
      pastaRecursos: path.join(PASTA_RENDERER, 'modulos', id),
      versao: app.getVersion(),
      janela: () => janela,
      webContents: () => abas.get(id)?.webContents ?? null,
      enviar: (canal, ...args) => {
        const wc = abas.get(id)?.webContents;
        if (wc && !wc.isDestroyed()) wc.send(canal, ...args);
      },
      atualizacao,
    }) || {};
  } catch (erro) {
    console.error(`[parallello] ${id} não iniciou:`, erro);
    registro.erro = `${erro?.message ?? erro}\n\nPasta de dados: ${pastaDados}`;
  }
  ativos.set(id, registro);
  return registro;
}

// ---------------- telas (abas) ----------------
function urlDaPagina(m) {
  if (DEV_URL && !m.estatico) return `${DEV_URL}/${m.pagina}`;
  return null;
}

function criarAba(m) {
  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(PASTA_PRELOAD, `${m.id}.js`),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  view.setBackgroundColor(m.fundo);
  const wc = view.webContents;
  vincularTela(wc.id, m.id);
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // a tela de um sistema nunca navega para fora dela mesma
  wc.on('will-navigate', (e, url) => {
    if (!DEV_URL || !url.startsWith(DEV_URL)) e.preventDefault();
  });
  wc.on('render-process-gone', (_e, detalhes) => {
    if (detalhes.reason !== 'clean-exit' && !wc.isDestroyed()) wc.reload();
  });
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12' && !app.isPackaged) wc.toggleDevTools();
    // Ctrl+Tab / Ctrl+Shift+Tab: passa para a próxima aba (a tela inicial entra no ciclo)
    if (input.key === 'Tab' && input.control) {
      e.preventDefault();
      alternarAba(input.shift ? -1 : 1);
    }
  });
  const url = urlDaPagina(m);
  if (url) void wc.loadURL(url);
  else void wc.loadFile(path.join(PASTA_RENDERER, m.pagina));
  janela.contentView.addChildView(view);
  return view;
}

function posicionar() {
  if (!janela) return;
  const [largura, altura] = janela.getContentSize();
  for (const [id, view] of abas) {
    view.setBounds({ x: 0, y: ALTURA_BARRA, width: largura, height: Math.max(0, altura - ALTURA_BARRA) });
    view.setVisible(id === atual);
  }
}

function mostrar(id) {
  atual = id;
  posicionar();
  if (id) abas.get(id)?.webContents.focus();
  else janela.webContents.focus();
  const m = CATALOGO.find((x) => x.id === id);
  janela.setTitle(m ? `${m.nome} — Parallello` : 'Parallello');
  avisarMudanca();
}

function abrir(id) {
  const m = CATALOGO.find((x) => x.id === id);
  if (!m) throw new Error('Sistema desconhecido: ' + id);
  const reg = iniciarModulo(id);
  if (reg.erro) {
    avisarMudanca();
    return false;
  }
  if (!abas.has(id)) {
    abas.set(id, criarAba(m));
    ordemAbas.push(id);
  }
  mostrar(id);
  return true;
}

function fechar(id) {
  const view = abas.get(id);
  if (!view) return;
  const i = ordemAbas.indexOf(id);
  ordemAbas = ordemAbas.filter((x) => x !== id);
  abas.delete(id);
  desvincularTela(view.webContents.id);
  janela.contentView.removeChildView(view);
  view.webContents.close();
  try {
    ativos.get(id)?.instancia?.aoFecharAba?.();
  } catch (_) {
    /* ignora */
  }
  if (atual === id) mostrar(ordemAbas[Math.min(i, ordemAbas.length - 1)] ?? null);
  else avisarMudanca();
}

function alternarAba(passo) {
  const ciclo = [null, ...ordemAbas];
  const i = ciclo.indexOf(atual);
  mostrar(ciclo[(i + passo + ciclo.length) % ciclo.length]);
}

// ---------------- janela ----------------
function criarJanela() {
  janela = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    title: 'Parallello',
    backgroundColor: '#e9edf0',
    icon: path.join(PASTA_OUT, 'icone.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(PASTA_PRELOAD, 'shell.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  janela.once('ready-to-show', () => {
    janela.maximize();
    janela.show();
  });
  for (const ev of ['resize', 'maximize', 'unmaximize', 'restore', 'enter-full-screen', 'leave-full-screen']) {
    janela.on(ev, posicionar);
  }
  janela.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  janela.webContents.on('will-navigate', (e) => e.preventDefault());
  janela.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12' && !app.isPackaged) janela.webContents.toggleDevTools();
    if (input.key === 'Tab' && input.control) {
      e.preventDefault();
      alternarAba(input.shift ? -1 : 1);
    }
  });
  if (DEV_URL) void janela.loadURL(`${DEV_URL}/shell/index.html`);
  else void janela.loadFile(path.join(PASTA_RENDERER, 'shell', 'index.html'));
  janela.on('closed', () => {
    janela = null;
  });
}

// ---------------- canais da tela do Parallello ----------------
function daJanela(fn) {
  return (evento, ...args) => {
    if (!janela || evento.sender !== janela.webContents) throw new Error('Canal do Parallello.');
    return fn(...args);
  };
}
ipcMain.handle('parallello:estado', daJanela(() => estado()));
ipcMain.handle('parallello:abrir', daJanela((id) => abrir(id)));
ipcMain.handle('parallello:mostrar', daJanela((id) => (id && abas.has(id) ? mostrar(id) : mostrar(null))));
ipcMain.handle('parallello:fechar', daJanela((id) => fechar(id)));
ipcMain.handle('parallello:atualizacao:verificar', daJanela(() => atualizacao.verificar()));
ipcMain.handle('parallello:atualizacao:baixar', daJanela(() => atualizacao.baixar()));
ipcMain.handle('parallello:atualizacao:instalar', daJanela(() => atualizacao.instalar()));
ipcMain.handle('parallello:abrirPastaDados', daJanela(() => shell.openPath(pastaModulos())));

// ---------------- ciclo de vida ----------------
let encerrando = false;
async function encerrarModulos() {
  for (const [id, { instancia }] of ativos) {
    try {
      await instancia?.encerrar?.();
    } catch (erro) {
      console.error(`[parallello] erro ao encerrar ${id}:`, erro);
    }
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!janela) return;
    if (janela.isMinimized()) janela.restore();
    janela.focus();
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('br.com.ramon.parallello');
    // Alguns servidores (Supabase) recusam acentos no user agent: só ASCII.
    app.userAgentFallback = app.userAgentFallback.normalize('NFD').replace(/[^\x20-\x7E]/g, '');
    Menu.setApplicationMenu(null);
    atualizacao = criarAtualizacao(() => avisarMudanca());
    criarJanela();
    // Atalho de linha de comando: Parallello.exe --abrir=gerar-pre-venda
    const pedido = process.argv.find((a) => a.startsWith('--abrir='));
    if (pedido) janela.webContents.once('did-finish-load', () => abrir(pedido.slice(8)));
  });

  app.on('before-quit', async (e) => {
    if (encerrando) return;
    e.preventDefault();
    encerrando = true;
    await encerrarModulos();
    app.quit();
  });

  app.on('window-all-closed', () => app.quit());
}
