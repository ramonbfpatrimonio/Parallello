// Parallello — processo principal.
//
// Uma janela com a barra do Parallello (login, tela inicial e abas) e, abaixo dela, a tela de cada
// sistema aberto, cada uma num WebContentsView próprio (isolada, com o seu preload).
// O processo principal de cada sistema roda aqui dentro, com IPC só dele (ver roteador.js).
//
// Login único: quem entra no Parallello é o mesmo usuário em todos os sistemas (sessao.js).
// Conexão única: o cadastro das conexões com o banco é um só (src/compartilhado/conexoes.ts).
import { app, BrowserWindow, WebContentsView, Menu, ipcMain, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { CATALOGO } from '../modulos/catalogo.js';
import { FABRICAS } from './modulos.js';
import { ipcDoModulo, vincularTela, desvincularTela, moduloDaTela } from './roteador.js';
import { migrarSePreciso } from './migracao.js';
import { criarAtualizacao } from './atualizacao.js';
import { criarSessao } from './sessao.js';
import { ehSenhaMaster } from '../compartilhado/master.js';
import * as conexoesCentrais from '../compartilhado/conexoes';
import * as nuvem from './nuvem.js';
import * as bancoSql from '../modulos/gerar-pre-venda/main/db';

const ALTURA_BARRA = 48;
const DEV_URL = process.env.PARALLELLO_DEV_URL || '';
const PASTA_OUT = path.join(__dirname, '..'); // out/
const PASTA_RENDERER = path.join(PASTA_OUT, 'renderer');
const PASTA_PRELOAD = path.join(PASTA_OUT, 'preload');

// Datas no formato brasileiro (DD/MM/AAAA) nos campos de data de todos os sistemas.
app.commandLine.appendSwitch('lang', 'pt-BR');

// Pasta fixa e sem acento para os dados (todos os sistemas ficam em %APPDATA%\Parallello\modulos\<id>).
app.setPath('userData', process.env.PARALLELLO_USERDATA || path.join(app.getPath('appData'), 'Parallello'));
const pastaModulos = () => path.join(app.getPath('userData'), 'modulos');

let janela = null;
const ativos = new Map(); // id -> { instancia, erro } (processo principal do módulo, criado uma vez)
const abas = new Map(); // id -> WebContentsView (tela aberta)
let ordemAbas = []; // ids na ordem em que foram abertos
let atual = null; // id do sistema em primeiro plano; null = tela inicial
let cobrindo = false; // a tela do Parallello mostra uma janela por cima (login, aviso, senha master)
const carregando = new Set(); // sistemas abrindo: a tela do Parallello mostra o preloader até terminar
let tema = 'claro'; // tema do Parallello, aplicado também nas telas dos sistemas
let atualizacao = null;
let sessao = null;

const infoAba = (id) => CATALOGO.find((x) => x.id === id);

// ---------------- estado para a tela do Parallello ----------------
function estado() {
  return {
    versao: app.getVersion(),
    atual,
    abas: ordemAbas.slice(),
    carregando: [...carregando],
    erros: Object.fromEntries([...ativos].filter(([, a]) => a.erro).map(([id, a]) => [id, a.erro])),
    atualizacao: atualizacao ? atualizacao.estado() : { tipo: 'parado' },
    sessao: sessao ? sessao.publico() : { logado: false },
  };
}
function avisarMudanca() {
  if (janela && !janela.isDestroyed()) janela.webContents.send('parallello:estado', estado());
}
function avisarTelas(canal, dados) {
  for (const view of abas.values()) if (!view.webContents.isDestroyed()) view.webContents.send(canal, dados);
}

// ---------------- conexão única ----------------
function prepararConexoes() {
  const pasta = app.getPath('userData');
  conexoesCentrais.definirPasta(pasta);
  // As conexões eram do Gerar Pré-Venda: a primeira vez, traz o arquivo dele (com as senhas deste PC).
  const destino = path.join(pasta, 'conexoes.json');
  const doGerar = path.join(pastaModulos(), 'gerar-pre-venda', 'conexoes.json');
  if (!fs.existsSync(destino)) {
    try {
      migrarSePreciso('gerar-pre-venda', path.join(pastaModulos(), 'gerar-pre-venda'), app.getPath('appData'));
      if (fs.existsSync(doGerar)) fs.copyFileSync(doGerar, destino);
    } catch (e) {
      console.error('[parallello] conexões do Gerar Pré-Venda:', e);
    }
  }
}

/** Conexões que os sistemas enxergam: as ativas da empresa atual. */
const conexoesParaModulos = {
  async listar() {
    const emp = sessao?.empresaAtual();
    const todas = await conexoesCentrais.listarPerfis();
    return todas.filter((p) => p.ativo !== false && (emp ? p.empresaId === emp.id : true));
  },
  async senha(id) {
    return (await conexoesCentrais.obterPerfil(id)).senha;
  },
  async obter(id) {
    return conexoesCentrais.obterPerfil(id);
  },
};

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
      usuario: () => sessao.usuarioParaModulo(),
      conexoes: conexoesParaModulos,
    }) || {};
  } catch (erro) {
    console.error(`[parallello] ${id} não iniciou:`, erro);
    registro.erro = `${erro?.message ?? erro}\n\nPasta de dados: ${pastaDados}`;
  }
  ativos.set(id, registro);
  return registro;
}

// ---------------- tema claro/escuro nas telas dos sistemas ----------------
// A Pesquisa de Relatórios e o Custo Produto/Produção já têm tema escuro próprio: só trocamos o atributo deles. Os outros ganham o
// escuro por um filtro de cor (inverte claro/escuro mantendo os tons). O que já era escuro (menu lateral, botões,
// cabeçalho de tabela, avisos) e as imagens voltam ao normal, para não ficarem claros no tema escuro.
const TEMA_NATIVO = new Set(['pesquisa-relatorios', 'custo-producao']);
// Dentro do Parallello o preloader é o do Parallello: os de cada sistema (e o interruptor de tema próprio) somem.
const CSS_FIXO = {
  'pesquisa-relatorios': '#preloader, #tema-app { display: none !important; }',
  'custo-producao': '.lateral-acoes button[title^="Usar tema"] { display: none !important; }',
};
const CSS_ESCURO = `
html { filter: invert(0.9) hue-rotate(180deg) !important; background: #fff !important; min-height: 100%; }
img, video, canvas, picture, iframe, embed, object, .pl-sem-inverter { filter: invert(1) hue-rotate(180deg) !important; }
.pl-sem-inverter img, .pl-sem-inverter video, .pl-sem-inverter canvas, .pl-sem-inverter picture, .pl-sem-inverter .pl-sem-inverter { filter: none !important; }
`;
// Marca os elementos de fundo escuro (para não inverterem) e acompanha o que a tela desenhar depois.
const JS_MARCAR_ESCUROS = `(() => {
  if (window.__plMarcar) return window.__plMarcar(true);
  const luz = (cor) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(cor);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(',').map(Number);
    if (a < 0.6) return null;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  const PULAR = new Set(['TD', 'TR', 'TBODY', 'SPAN', 'B', 'I', 'STRONG', 'EM', 'OPTION', 'PATH', 'svg', 'path', 'G', 'g']);
  let ligado = false, agendado = 0;
  const marcar = () => {
    agendado = 0;
    if (!ligado) return;
    for (const el of document.querySelectorAll('body *')) {
      if (PULAR.has(el.tagName) || el.closest('.pl-sem-inverter') !== null && !el.classList.contains('pl-sem-inverter')) continue;
      const cs = getComputedStyle(el);
      let l = luz(cs.backgroundColor);
      if (l === null && cs.backgroundImage.includes('gradient')) l = luz(cs.backgroundImage); // menu lateral em degradê
      if (l !== null && l < 0.38) el.classList.add('pl-sem-inverter');
      else if (el.classList.contains('pl-sem-inverter') && (l === null || l >= 0.38)) el.classList.remove('pl-sem-inverter');
    }
  };
  const obs = new MutationObserver(() => { if (ligado && !agendado) agendado = setTimeout(marcar, 200); });
  window.__plMarcar = (sim) => {
    ligado = sim;
    if (sim) { obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }); marcar(); }
    else { obs.disconnect(); document.querySelectorAll('.pl-sem-inverter').forEach((e) => e.classList.remove('pl-sem-inverter')); }
  };
  window.__plMarcar(true);
})()`;
const cssTema = new Map(); // webContents.id -> chave do insertCSS do tema

async function aplicarTemaNaTela(id, view) {
  const wc = view.webContents;
  if (wc.isDestroyed()) return;
  const escuro = tema === 'escuro';
  view.setBackgroundColor(escuro ? '#1a1d21' : infoAba(id)?.fundo ?? '#ffffff');
  try {
    const anterior = cssTema.get(wc.id);
    if (anterior) {
      cssTema.delete(wc.id);
      await wc.removeInsertedCSS(anterior);
    }
    if (TEMA_NATIVO.has(id)) {
      await wc.executeJavaScript(`(() => {
        const d = document.documentElement;
        window.__temaParallello = ${JSON.stringify(tema)};
        d.setAttribute('data-tema', window.__temaParallello);
        if (!window.__observaTema) {
          window.__observaTema = new MutationObserver(() => {
            if (d.getAttribute('data-tema') !== window.__temaParallello) d.setAttribute('data-tema', window.__temaParallello);
          });
          window.__observaTema.observe(d, { attributes: true, attributeFilter: ['data-tema'] });
        }
      })()`);
    } else if (escuro) {
      cssTema.set(wc.id, await wc.insertCSS(CSS_ESCURO));
      await wc.executeJavaScript(JS_MARCAR_ESCUROS);
    } else {
      await wc.executeJavaScript('window.__plMarcar && window.__plMarcar(false)');
    }
  } catch (e) {
    if (!wc.isDestroyed()) console.warn(`[parallello] tema em ${id}:`, e.message);
  }
}
function definirTema(novo) {
  tema = novo === 'escuro' ? 'escuro' : 'claro';
  if (janela && !janela.isDestroyed()) janela.setBackgroundColor(tema === 'escuro' ? '#0f161d' : '#e9edf0');
  for (const [id, view] of abas) void aplicarTemaNaTela(id, view);
  return tema;
}

/** Mostra o preloader até a tela carregar (e a animação girar até o fim). */
const TEMPO_MINIMO_PRELOADER = 1500;
function acompanharCarga(id, view) {
  carregando.add(id);
  const wc = view.webContents;
  const carregou = new Promise((ok) => {
    wc.once('did-finish-load', ok);
    wc.once('did-fail-load', ok);
    setTimeout(ok, 15000); // nunca prende a tela
  });
  const minimo = new Promise((ok) => setTimeout(ok, TEMPO_MINIMO_PRELOADER));
  void Promise.all([carregou, minimo]).then(() => {
    if (!carregando.delete(id)) return;
    posicionar();
    if (atual === id && !cobrindo && !wc.isDestroyed()) wc.focus();
    avisarMudanca();
  });
}

// ---------------- telas (abas) ----------------
function criarAba(info) {
  const dono = info.modulo ?? info.id;
  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(PASTA_PRELOAD, `${dono}.js`),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  view.setBackgroundColor(tema === 'escuro' ? '#1a1d21' : info.fundo);
  const wc = view.webContents;
  vincularTela(wc.id, dono);
  // tema do Parallello: reaplicado a cada carga da página (o CSS injetado não sobrevive a recarregar)
  wc.on('dom-ready', () => {
    cssTema.delete(wc.id);
    if (CSS_FIXO[info.id]) void wc.insertCSS(CSS_FIXO[info.id]).catch(() => {});
    void aplicarTemaNaTela(info.id, view);
  });
  acompanharCarga(info.id, view);
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
  const query = info.query ? '?' + new URLSearchParams(info.query) : '';
  if (DEV_URL && !info.estatico) void wc.loadURL(`${DEV_URL}/${info.pagina}${query}`);
  else void wc.loadFile(path.join(PASTA_RENDERER, info.pagina), info.query ? { query: info.query } : undefined);
  janela.contentView.addChildView(view);
  return view;
}

function posicionar() {
  if (!janela) return;
  const [largura, altura] = janela.getContentSize();
  for (const [id, view] of abas) {
    view.setBounds({ x: 0, y: ALTURA_BARRA, width: largura, height: Math.max(0, altura - ALTURA_BARRA) });
    view.setVisible(id === atual && !cobrindo && !carregando.has(id));
  }
}

function mostrar(id) {
  atual = id && abas.has(id) ? id : null;
  posicionar();
  if (atual && !cobrindo && !carregando.has(atual)) abas.get(atual)?.webContents.focus();
  else janela.webContents.focus();
  const m = infoAba(atual);
  janela.setTitle(m ? `${m.nome} — Parallello` : 'Parallello');
  avisarMudanca();
}

function abrirAba(info) {
  if (!abas.has(info.id)) {
    abas.set(info.id, criarAba(info));
    ordemAbas.push(info.id);
  }
  mostrar(info.id);
}

/** Abre um sistema. Sem login ou sem o módulo liberado, devolve o motivo (a tela mostra a mensagem). */
function abrir(id) {
  const m = CATALOGO.find((x) => x.id === id);
  if (!m) throw new Error('Sistema desconhecido: ' + id);
  if (!sessao.logado()) return { ok: false, motivo: 'login' };
  if (!sessao.podeAbrir(id)) {
    return {
      ok: false,
      motivo: 'sem-acesso',
      mensagem: `Você não tem acesso ao módulo ${m.nome}. Sem licença para este módulo.`,
    };
  }
  const reg = iniciarModulo(id);
  if (reg.erro) {
    avisarMudanca();
    return { ok: false, motivo: 'erro', mensagem: reg.erro };
  }
  abrirAba(m);
  return { ok: true };
}

function fechar(id) {
  const view = abas.get(id);
  if (!view) return;
  const i = ordemAbas.indexOf(id);
  ordemAbas = ordemAbas.filter((x) => x !== id);
  abas.delete(id);
  carregando.delete(id);
  cssTema.delete(view.webContents.id);
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

function fecharTodas() {
  for (const id of [...ordemAbas]) fechar(id);
  mostrar(null);
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
/** Canal que as telas dos sistemas também podem usar (Gerar Pré-Venda e o painel de configuração). */
function daTela(fn) {
  return (evento, ...args) => {
    const ehJanela = janela && evento.sender === janela.webContents;
    const modulo = moduloDaTela(evento.sender.id);
    if (!ehJanela && !modulo) throw new Error('Canal do Parallello.');
    return fn(...args);
  };
}
const canal = (nome, fn) => ipcMain.handle('parallello:' + nome, daJanela(fn));

canal('estado', () => estado());
canal('abrir', (id) => abrir(id));
canal('mostrar', (id) => mostrar(id));
canal('fechar', (id) => fechar(id));
canal('cobrir', (sim) => {
  cobrindo = !!sim;
  posicionar();
  if (!cobrindo && atual) abas.get(atual)?.webContents.focus();
});
canal('tema', (novo) => definirTema(novo));
canal('atualizacao:verificar', () => atualizacao.verificar());
canal('atualizacao:baixar', () => atualizacao.baixar());
canal('atualizacao:instalar', () => atualizacao.instalar());
canal('abrirPastaDados', () => shell.openPath(app.getPath('userData')));

// login e usuários
canal('entrar', (usuario, senha) => sessao.entrar(usuario, senha));
canal('sair', () => sessao.sair());
canal('atualizarSessao', () => sessao.atualizar());
canal('meusModulos', (modulos) => sessao.definirMeusModulos(modulos));

// ---------------- configuração do Parallello (Ctrl+Shift+B + senha master) ----------------
canal('config:abrir', (senha) => sessao.liberarConfig(senha));
canal('config:fechar', () => sessao.fecharConfig());

// usuários e permissões
canal('config:usuarios', () => sessao.listarUsuarios());
canal('config:usuarios:modulos', (id, modulos) => sessao.definirModulos(id, modulos));
canal('config:usuarios:criar', (dados) => sessao.criarUsuario(dados));
canal('config:usuarios:alterar', (id, dados) => sessao.alterarUsuario(id, dados));
canal('config:usuarios:senha', (id, senha) => sessao.trocarSenha(id, senha));

// empresas (super administrador)
canal('config:empresas', () => sessao.naConfig(() => nuvem.resumoEmpresas(), { soSuper: true }));
canal('config:empresas:criar', (d) => sessao.naConfig(async () => {
  const id = await nuvem.criarEmpresa(d);
  if (d.retencao_meses) await nuvem.alterarEmpresa(id, { retencao_meses: d.retencao_meses });
  await sessao.carregarEmpresas();
  return id;
}, { soSuper: true }));
canal('config:empresas:alterar', (id, d) => sessao.naConfig(async () => {
  await nuvem.alterarEmpresa(id, d);
  await sessao.carregarEmpresas();
}, { soSuper: true }));
canal('config:empresas:modulos', (id, modulos) => sessao.definirModulosEmpresa(id, modulos));

// cobrança da licença (super administrador)
const cobranca = (fn) => (...a) => sessao.naConfig(() => fn(...a), { soSuper: true });
canal('config:cobranca:config', cobranca(() => nuvem.configCobranca()));
canal('config:cobranca:salvarConfig', cobranca((d) => nuvem.salvarConfigCobranca(d)));
canal('config:cobranca:empresas', cobranca(() => nuvem.empresasCobranca()));
canal('config:cobranca:licenca', cobranca((id, d) => nuvem.alterarLicenca(id, d)));
canal('config:cobranca:pagamentos', cobranca((id) => nuvem.pagamentos(id)));
canal('config:cobranca:pagar', cobranca((d) => nuvem.registrarPagamento(d)));
canal('config:cobranca:estornar', cobranca((id) => nuvem.estornarPagamento(id)));

// eventos do sistema
canal('config:eventos', (filtro) => sessao.naConfig(() => nuvem.eventos({ ...filtro, empresaId: filtro?.todasEmpresas ? null : sessao.empresaAtual()?.id })));

// conexão única com o banco
const paraNuvem = ({ temSenha, atualizadoEm, ...dados }) => dados; // eslint-disable-line no-unused-vars
canal('config:conexoes', async () => {
  sessao.exigirConfig();
  await sessao.sincronizarConexoes();
  const emp = sessao.empresaAtual();
  const todas = await conexoesCentrais.listarPerfis();
  return {
    empresa: emp,
    nuvem: sessao.temNuvem(),
    perfis: todas.filter((p) => (emp ? p.empresaId === emp.id : !p.empresaId)),
    locais: emp ? todas.filter((p) => !p.empresaId) : [],
    nativo: bancoSql.nativoDisponivel(),
  };
});
canal('config:conexoes:salvar', async (perfil, senha) => {
  sessao.exigirConfig();
  const emp = sessao.empresaAtual();
  if (emp && !sessao.temNuvem()) throw new Error('Sem internet: o cadastro da conexão é da empresa e precisa da nuvem. Sem internet dá para salvar só a senha deste computador.');
  const novo = !perfil.id;
  const salvo = await conexoesCentrais.salvarPerfil({ ...perfil, empresaId: emp ? emp.id : '' }, senha || undefined);
  if (emp) {
    try {
      await nuvem.salvarConexao(emp.id, paraNuvem(salvo));
    } catch (e) {
      if (novo) await conexoesCentrais.excluirPerfil(salvo.id).catch(() => {});
      throw new Error(`A conexão não foi salva na empresa: ${e.message}`);
    }
  }
  await bancoSql.fecharPool(salvo.id);
  return salvo;
});
canal('config:conexoes:senha', async (id, senha) => {
  sessao.exigirConfig();
  const r = await conexoesCentrais.salvarSenha(id, senha);
  await bancoSql.fecharPool(id);
  return r;
});
canal('config:conexoes:excluir', async (id) => {
  sessao.exigirConfig();
  const emp = sessao.empresaAtual();
  const p = (await conexoesCentrais.listarPerfis()).find((x) => x.id === id);
  if (p?.empresaId) {
    if (!sessao.temNuvem()) throw new Error('Sem internet: não dá para excluir a conexão da empresa agora.');
    await nuvem.excluirConexao(id);
  }
  await conexoesCentrais.excluirPerfil(id);
  await bancoSql.fecharPool(id);
  return emp;
});
canal('config:conexoes:enviar', async (id) => {
  sessao.exigirConfig();
  const emp = sessao.empresaAtual();
  if (!emp || !sessao.temNuvem()) throw new Error('Escolha a empresa (com internet) para enviar a conexão.');
  const p = (await conexoesCentrais.listarPerfis()).find((x) => x.id === id);
  if (!p) throw new Error('Conexão não encontrada.');
  const salvo = await conexoesCentrais.salvarPerfil({ ...p, empresaId: emp.id });
  await nuvem.salvarConexao(emp.id, paraNuvem(salvo));
  return salvo;
});
canal('config:conexoes:testar', async (perfil, senha) => {
  sessao.exigirConfig();
  return bancoSql.testar(perfil, await conexoesCentrais.senhaParaTeste(perfil, senha));
});

// usados também pelas telas dos sistemas
ipcMain.handle('parallello:sessao', daTela(() => ({ ...sessao.publico(), usuario: sessao.usuarioParaModulo() })));
ipcMain.handle('parallello:token', daTela(() => sessao.token()));
ipcMain.handle('parallello:escolherEmpresa', daTela((id) => sessao.escolherEmpresa(id)));
// Ctrl+Shift+B dentro de um sistema que não tem configuração própria (Gerar Pré-Venda): configuração do Parallello
ipcMain.handle(
  'parallello:pedirPainel',
  daTela(() => {
    if (janela && !janela.isDestroyed()) {
      mostrar(null);
      janela.webContents.send('parallello:pedirMaster');
    }
    return true;
  })
);

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
    prepararConexoes();
    sessao = criarSessao({
      pasta: app.getPath('userData'),
      catalogo: CATALOGO,
      aoMudar: (pub) => {
        if (!pub.logado) fecharTodas(); // saiu: fecha todos os sistemas
        avisarMudanca();
        avisarTelas('parallello:sessao-mudou', { ...pub, usuario: sessao.usuarioParaModulo() });
      },
    });
    sessao.aoSincronizar((empresaId, lista) => conexoesCentrais.sincronizar(empresaId, lista));
    atualizacao = criarAtualizacao(() => avisarMudanca());
    criarJanela();
    // Releitura periódica: módulos liberados/bloqueios mudam na nuvem com o programa aberto
    setInterval(() => {
      if (sessao.logado()) sessao.atualizar().catch((e) => janela?.webContents.send('parallello:aviso', e.message));
    }, 5 * 60 * 1000);
  });

  app.on('before-quit', async (e) => {
    if (encerrando) return;
    e.preventDefault();
    encerrando = true;
    await sessao?.sair(false).catch(() => {});
    await encerrarModulos();
    app.quit();
  });

  app.on('window-all-closed', () => app.quit());
}
