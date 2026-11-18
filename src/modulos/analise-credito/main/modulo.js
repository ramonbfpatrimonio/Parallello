// Análise de Crédito de Cliente dentro do Parallello (base: versão standalone 1.9.0).
// O electron/main.cjs original virou uma função que recebe o contexto do Parallello:
// IPC só deste módulo, pasta de dados, janela para os diálogos, a tela do módulo
// (PDF/impressão da ficha), o usuário logado e as conexões únicas.
const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const store = require('./store.cjs');
const db = require('./db.cjs');
const { calcularScores, pontuacaoMaxima } = require('./score.cjs');
const serasa = require('./serasa.cjs');
const { ehSenhaMaster } = require('../../../compartilhado/master.js');

module.exports = function criarModulo(ctx) {
store.configurar({ pasta: ctx.pastaDados, conexoes: ctx.conexoes });
let areaLiberada = false;
const exigirArea = () => {
  if (!areaLiberada) throw new Error('Área do sistema bloqueada. Pressione Ctrl+Shift+B e informe a senha.');
};
const ipcMain = { handle: (canal, fn) => ctx.ipc.handle(canal, fn) };
const janela = () => ctx.janela();
// a tela do módulo (WebContentsView): é ela que vira PDF / vai para a impressora
const tela = () => {
  const wc = ctx.webContents?.();
  if (!wc || wc.isDestroyed()) throw new Error('Tela do módulo não encontrada.');
  return wc;
};

const trata = (fn) => async (_e, ...args) => {
  try {
    if (!ctx.usuario()) throw new Error('Entre no Parallello.');
    return { ok: true, dados: await fn(...args) };
  }
  catch (err) { return { ok: false, erro: err && err.message ? err.message : String(err) }; }
};

async function conexaoAtiva() {
  const c = await store.getConexao();
  if (!c) throw new Error('Nenhuma conexão cadastrada. Cadastre na Configuração do Parallello (Ctrl+Shift+B na tela inicial).');
  if (!c.senha) throw new Error(`A conexão "${c.nome}" está sem senha neste computador. Informe na Configuração do Parallello.`);
  return c;
}

// ---------- Senha
// a master do Parallello, conferida pelo hash
ipcMain.handle('senha:validar', trata((s) => (areaLiberada = ehSenhaMaster(String(s || '')))));

// ---------- Conexões
ipcMain.handle('conexoes:listar', trata(() => store.listarConexoes()));
ipcMain.handle('conexoes:salvar', trata((c) => store.salvarConexao(c)));
ipcMain.handle('conexoes:excluir', trata((id) => store.excluirConexao(id)));
ipcMain.handle('conexoes:ativar', trata((id) => store.ativarConexao(id)));
ipcMain.handle('conexoes:testar', trata(async (c) => {
  const salva = await store.getConexao(c && c.id);
  if (!salva) throw new Error('Conexão não encontrada.');
  return db.testar(salva);
}));

// ---------- Regras
ipcMain.handle('regras:get', trata(() => store.getRegras()));
ipcMain.handle('regras:salvar', trata((r) => { exigirArea(); return store.salvarRegras(r); }));
ipcMain.handle('regras:padrao', trata(() => store.regrasPadrao()));

// ---------- Configuração geral
ipcMain.handle('configuracao:get', trata(() => store.getConfiguracao()));
ipcMain.handle('configuracao:salvar', trata((c) => { exigirArea(); return store.salvarConfiguracao(c); }));

// ---------- Análise
ipcMain.handle('credito:analisar', trata(async (filtros) => {
  const inicio = Date.now();
  const conexao = await conexaoAtiva();
  const regras = store.getRegras();
  const { calculo } = store.getConfiguracao();
  const { linhas, tempos } = await db.analisar(conexao, {
    ...filtros,
    abaterRetornos: calculo.abaterRetornos !== false,
    somarST: calculo.somarST !== false,
    mesesAtraso: regras.mesesHistoricoAtraso
  });
  const tBanco = Date.now();
  const resultado = calcularScores(linhas.map((l) => ({ ...l, ClienteID: String(l.ClienteID).trim() })), regras);
  resultado.sort((a, b) => (b.ScoreCredito || 0) - (a.ScoreCredito || 0) || String(a.Nome || '').localeCompare(String(b.Nome || ''), 'pt-BR'));
  return {
    linhas: resultado,
    pontuacaoMaxima: pontuacaoMaxima(regras),
    mesesHistoricoAtraso: regras.mesesHistoricoAtraso,
    calculo,
    segundos: (Date.now() - inicio) / 1000,
    tempos: [...tempos, { Etapa: 'Cálculo do score no app', Ms: Date.now() - tBanco, Linhas: linhas.length }],
    executadoEm: new Date().toISOString(),
    conexao: { id: conexao.id, nome: conexao.nome }
  };
}));

// vendas por mês: ICMS-ST e devoluções seguem Área do sistema › Configuração
ipcMain.handle('credito:vendasMes', trata(async (filtros) => {
  const { calculo } = store.getConfiguracao();
  const linhas = await db.vendasMes(await conexaoAtiva(), { ...filtros, somarST: calculo.somarST !== false });
  const abater = calculo.abaterRetornos !== false;
  return { calculo, linhas: abater ? linhas : linhas.map((l) => ({ ...l, Retornos: 0 })) };
}));
ipcMain.handle('credito:pontuacaoMaxima', trata(() => pontuacaoMaxima(store.getRegras())));

// ---------- Decisões (gravadas com a conexão ativa)
ipcMain.handle('decisoes:listar', trata(() => store.listarDecisoes()));
// ---------- Usuário do login (vem do Parallello)
// No Parallello o usuário é sempre o do login.
function usuarioLogado() {
  const u = ctx.usuario();
  return { nome: u?.nome || u?.usuario || '', codigo: String(u?.usuario || ''), origem: 'parallello' };
}
ipcMain.handle('sessao:usuario', trata(() => usuarioLogado()));
ipcMain.handle('sessao:definirUsuario', trata(() => usuarioLogado()));

// ---------- Eventos de sistema no ERP
// o que foi feito, em texto (parâmetro @Acao e início da @Descricao)
const ACOES = {
  LIMITE_APLICADO: 'Alterou limite de crédito',
  DECISAO_REGISTRADA: 'Registrou decisão de crédito',
  DECISAO_EXCLUIDA: 'Excluiu decisão de crédito',
  TESTE: 'Teste de evento'
};
function dadosEvento(evento, extra) {
  const u = usuarioLogado();
  const acao = ACOES[evento] || evento;
  return {
    usuario: u.nome, usuarioCodigo: u.codigo, computador: os.hostname(), modulo: 'Analise de Credito',
    evento, acao, ...extra,
    descricao: extra && extra.descricao ? `${acao}: ${extra.descricao}` : acao
  };
}
// grava o evento (se ativo). Obrigatório: erro impede a operação; opcional: devolve o aviso
async function registrarEvento(conexao, evento, extra) {
  const { eventos } = store.getConfiguracao();
  if (!eventos.ativo || !eventos.modelo) return null;
  try {
    await db.inserirEvento(conexao, eventos.modelo, dadosEvento(evento, extra));
    return null;
  } catch (e) {
    const msg = `Evento de sistema não gravado no ERP: ${e.message}`;
    if (eventos.obrigatorio) throw new Error(`${msg}. A operação foi cancelada.`);
    return msg;
  }
}

const fmtBR = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

ipcMain.handle('decisoes:salvar', trata(async (d) => {
  const c = await conexaoAtiva();
  const u = usuarioLogado();
  const item = { ...d, responsavel: u.nome, responsavelCodigo: u.codigo, conexaoId: c.id, conexaoNome: c.nome };
  // evento primeiro: se for obrigatório e falhar, a decisão não é gravada
  const aviso = await registrarEvento(c, 'DECISAO_REGISTRADA', {
    cliente: d.codigo,
    descricao: `cliente ${d.codigo} - ${d.nome}, situação ${d.situacao}, limite aprovado ${fmtBR(d.limiteAprovado)}, prazo ${d.prazoAprovado || '-'} (Análise de Crédito).`,
    valorAnterior: d.snapshot?.limiteAtual ?? null,
    valorNovo: d.limiteAprovado
  });
  const salva = store.salvarDecisao(item);
  return aviso ? { ...salva, avisoEvento: aviso } : salva;
}));

ipcMain.handle('decisoes:excluir', trata(async (id) => {
  const d = store.obterDecisao(id);
  if (d) {
    const c = await conexaoAtiva();
    await registrarEvento(c, 'DECISAO_EXCLUIDA', {
      cliente: d.codigo,
      descricao: `cliente ${d.codigo} - ${d.nome}, decisão ${d.situacao} de ${new Date(d.data).toLocaleString('pt-BR')}, limite aprovado ${fmtBR(d.limiteAprovado)} (Análise de Crédito).`,
      valorNovo: d.limiteAprovado
    });
  }
  return store.excluirDecisao(id);
}));

ipcMain.handle('eventos:testar', trata(async (eventos) => {
  exigirArea();
  const conexao = await conexaoAtiva();
  db.validarModeloEvento(eventos.modelo);
  await db.testarEvento(conexao, eventos.modelo, dadosEvento('TESTE', {
    cliente: null, descricao: 'gravação de teste, desfeita em seguida (Análise de Crédito)', valorAnterior: 0, valorNovo: 0
  }));
  return { ok: true, conexao: conexao.nome };
}));

// ---------- Aplicar o limite aprovado no ERP (Clientes.LimPerCred)
// 1) validação: lê o limite atual no banco e devolve o que vai mudar (mensagem de confirmação)
// 2) aplicação: valida de novo, faz o UPDATE em transação e grava a auditoria na decisão
async function validarAplicacao(decisaoId) {
  const { limite } = store.getConfiguracao();
  if (limite.permitirAplicar === false) throw new Error('Aplicar limite no ERP está desativado em Área do sistema › Configuração.');
  const d = store.obterDecisao(decisaoId);
  if (!d) throw new Error('Decisão não encontrada.');
  if (d.situacao === 'Em análise') throw new Error('Decisão "Em análise" não pode ser aplicada. Registre a decisão final primeiro.');
  if (d.aplicacao) {
    throw new Error(`Esta decisão já foi aplicada em ${new Date(d.aplicacao.data).toLocaleString('pt-BR')}. Para alterar o limite de novo, registre uma nova decisão.`);
  }
  const conexao = await conexaoAtiva();
  if (d.conexaoId && d.conexaoId !== conexao.id) {
    throw new Error(`Esta decisão foi registrada na conexão "${d.conexaoNome}". Troque para essa conexão para aplicar.`);
  }
  const novo = Number(d.limiteAprovado);
  if (!Number.isFinite(novo) || novo < 0) throw new Error('Limite aprovado inválido.');
  const cli = await db.limiteCliente(conexao, d.codigo);
  if (Number(cli.NaoCalcLim) === 1) {
    throw new Error(`O cliente ${d.codigo} está marcado no ERP para não calcular limite (NaoCalcLim). O limite não será alterado.`);
  }
  const atual = Number(cli.LimiteAtual) || 0;
  return {
    decisaoId, codigo: d.codigo, nome: cli.Nome || d.nome, conexaoNome: conexao.nome,
    situacao: d.situacao, limiteAtual: atual, limiteNovo: novo, igual: Math.abs(atual - novo) < 0.005,
    dataDecisao: d.data
  };
}

ipcMain.handle('limite:validar', trata((decisaoId) => validarAplicacao(decisaoId)));

ipcMain.handle('limite:aplicar', trata(async (decisaoId) => {
  const v = await validarAplicacao(decisaoId);
  const conexao = await conexaoAtiva();
  const { eventos } = store.getConfiguracao();
  // o evento entra na mesma transação do UPDATE
  const evento = eventos.ativo && eventos.modelo ? {
    modelo: eventos.modelo,
    dados: dadosEvento('LIMITE_APLICADO', {
      cliente: v.codigo,
      descricao: `cliente ${v.codigo} - ${v.nome}, de ${fmtBR(v.limiteAtual)} para ${fmtBR(v.limiteNovo)} (decisão ${v.situacao} de ${new Date(v.dataDecisao).toLocaleString('pt-BR')}, Análise de Crédito).`,
      valorAnterior: v.limiteAtual,
      valorNovo: v.limiteNovo
    })
  } : null;
  const linhas = await db.aplicarLimite(conexao, v.codigo, v.limiteNovo, evento);
  if (linhas !== 1) throw new Error('Nenhum cliente foi alterado (o cliente pode ter sido marcado com NaoCalcLim). Nada foi gravado.');
  const d = store.obterDecisao(decisaoId);
  const aplicacao = {
    data: new Date().toISOString(),
    limiteAnterior: v.limiteAtual,
    limiteNovo: v.limiteNovo,
    conexaoId: conexao.id, conexaoNome: conexao.nome,
    usuarioWindows: (() => { try { return os.userInfo().username; } catch { return ''; } })(),
    usuario: usuarioLogado().nome,
    computador: os.hostname(),
    eventoGravado: !!evento
  };
  return store.salvarDecisao({ ...d, aplicacao });
}));

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

// ---------- Impressão / PDF da própria tela (fica igual ao painel, com gráficos)
// O renderer congela o layout da tela e aplica zoom para caber na folha (src/impressao.js);
// aqui a página é impressa em escala 100%. O CSS @media print esconde barra lateral, topo e botões.
const MARGEM_POL = 0.3;
ipcMain.handle('tela:pdf', trata(async ({ nomeArquivo, paisagem = true }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(janela(), {
    title: 'Salvar PDF', defaultPath: nomeArquivo || 'ficha.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (canceled || !filePath) return null;
  const pdf = await tela().printToPDF({
    landscape: !!paisagem,
    printBackground: true,
    pageSize: 'A4',
    margins: { top: MARGEM_POL, bottom: 0.45, left: MARGEM_POL, right: MARGEM_POL },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: RODAPE
  });
  fs.writeFileSync(filePath, pdf);
  shell.openPath(filePath);
  return filePath;
}));

ipcMain.handle('tela:imprimir', trata(({ paisagem = true }) => new Promise((resolve, reject) => {
  tela().print({
    silent: false,
    printBackground: true,
    landscape: !!paisagem,
    pageSize: 'A4',
    scaleFactor: 100,
    margins: { marginType: 'custom', top: 28, bottom: 28, left: 28, right: 28 }
  }, (ok, motivo) => {
    if (ok || /cancel/i.test(String(motivo || ''))) resolve(ok);
    else reject(new Error(`Não foi possível imprimir: ${motivo}`));
  });
})));

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

// ---------- Serasa (configuração por conexão)
const inicioDoMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString(); };

function statusSerasa(conexaoId) {
  const cfg = store.getSerasa(conexaoId);
  const configurada = cfg.ativo && !!cfg.consulta.url && (cfg.auth.tipo === 'nenhuma' || (!!cfg.auth.url && !!cfg.auth.clientId && cfg.temSecret));
  const mes = inicioDoMes();
  const consultasMes = store.listarConsultasSerasa({ conexaoId }).filter((c) => c.origem === 'api' && c.data >= mes).length;
  return {
    disponivel: cfg.modoDemo || configurada,
    configurada, ativo: cfg.ativo, modoDemo: cfg.modoDemo, ambiente: cfg.ambiente,
    validadeDias: Number(cfg.custo.validadeDias) || 0, confirmar: !!cfg.custo.confirmar,
    limiteMensal: Number(cfg.custo.limiteMensal) || 0, consultasMes, faixas: cfg.faixas
  };
}

async function lerDocumento(conexao, cfg, codigo, documentoDireto) {
  if (documentoDireto) return serasa.classificarDocumento(documentoDireto);
  const r = await db.documentoCliente(conexao, codigo, cfg.documento);
  return { ...serasa.classificarDocumento(r.Documento, r.TipoDoc), nome: r.Nome ? String(r.Nome).trim() : '' };
}

function exigirDocumentoNacional(doc) {
  if (!doc.digitos) throw new Error('Cliente sem documento cadastrado (NroInsc vazio).');
  if (doc.tipo === 'OUTRO') {
    throw new Error(`Documento "${doc.bruto}"${doc.tipoBruto ? ` (tipo ${doc.tipoBruto})` : ''} não é um CPF ou CNPJ válido — clientes do exterior não podem ser consultados na Serasa.`);
  }
}

ipcMain.handle('serasa:config', trata(async (conexaoId) => { exigirArea(); return store.getSerasa(conexaoId || (await conexaoAtiva()).id); }));
ipcMain.handle('serasa:salvar', trata(({ conexaoId, cfg }) => { exigirArea(); return store.salvarSerasa(conexaoId, cfg); }));
ipcMain.handle('serasa:status', trata(async () => statusSerasa((await conexaoAtiva()).id)));
// aceita o código do cliente (texto) ou { codigo, documento } — documento = só os dígitos do CPF/CNPJ
const alvoSerasa = (a) => (a && typeof a === 'object' ? a : { codigo: a });
ipcMain.handle('serasa:consultas', trata(async (alvo) => {
  const { codigo, documento } = alvoSerasa(alvo);
  return store.listarConsultasSerasa({ conexaoId: (await conexaoAtiva()).id, ...(codigo ? { codigo } : { documento: String(documento || '').replace(/\D/g, '') }) });
}));
// histórico de todas as consultas da conexão (sem o retorno bruto da API, para ficar leve)
ipcMain.handle('serasa:historico', trata(async () =>
  store.listarConsultasSerasa({ conexaoId: (await conexaoAtiva()).id }).map(({ retorno, ...c }) => c)));

ipcMain.handle('serasa:documento', trata(async (alvo) => {
  const conexao = await conexaoAtiva();
  const { codigo, documento } = alvoSerasa(alvo);
  return lerDocumento(conexao, store.getSerasa(conexao.id), codigo, documento);
}));

// consulta do card (usa cache dentro da validade, a menos que "forcar")
ipcMain.handle('serasa:consultar', trata(async ({ codigo, documento, nome, forcar, responsavel }) => {
  const conexao = await conexaoAtiva();
  const cfg = store.getSerasa(conexao.id);
  const st = statusSerasa(conexao.id);
  if (!st.disponivel) throw new Error('Integração Serasa não configurada para esta conexão.');

  const doc = await lerDocumento(conexao, cfg, codigo, documento);
  exigirDocumentoNacional(doc);
  if (!nome && doc.nome) nome = doc.nome;
  codigo = codigo || null;

  const anteriores = store.listarConsultasSerasa({ conexaoId: conexao.id, ...(codigo ? { codigo } : { documento: doc.digitos }) });
  const ultima = anteriores[0];
  if (!forcar && ultima && st.validadeDias > 0) {
    const dias = (Date.now() - new Date(ultima.data).getTime()) / 86400000;
    if (dias < st.validadeDias) return { cache: true, consulta: ultima };
  }

  let resultado;
  if (cfg.modoDemo) {
    resultado = serasa.demo(doc);
  } else {
    if (st.limiteMensal > 0 && st.consultasMes >= st.limiteMensal) {
      throw new Error(`Limite de ${st.limiteMensal} consultas no mês atingido para esta conexão.`);
    }
    const r = await serasa.chamarApi(conexao.id, cfg, store.getSerasaSecret(conexao.id), doc);
    resultado = { json: r.json, extraido: serasa.extrair(r.json, cfg.mapa), ms: r.ms };
  }
  const faixa = serasa.faixaDoScore(resultado.extraido.score, cfg.faixas);
  const consulta = store.salvarConsultaSerasa({
    conexaoId: conexao.id, conexaoNome: conexao.nome,
    codigo, nome, documento: doc.digitos, tipoDocumento: doc.tipo,
    origem: cfg.modoDemo ? 'demo' : 'api', ambiente: cfg.ambiente,
    score: resultado.extraido.score,
    faixa: resultado.extraido.faixa || faixa?.nome || null,
    mensagem: resultado.extraido.mensagem,
    pendencias: resultado.extraido.pendencias,
    valorPendencias: resultado.extraido.valorPendencias,
    qtdProtestos: resultado.extraido.qtdProtestos,
    ms: resultado.ms,
    usuarioWindows: (() => { try { return os.userInfo().username; } catch { return ''; } })(),
    computador: os.hostname(),
    responsavel: responsavel || '',
    retorno: resultado.json
  });
  return { cache: false, consulta };
}));

// teste da área oculta: usa a configuração do formulário (sem salvar) e não grava consulta
ipcMain.handle('serasa:testar', trata(async ({ conexaoId, cfg, codigo, documento }) => {
  exigirArea();
  const conexao = await store.getConexao(conexaoId);
  if (!conexao) throw new Error('Conexão não encontrada.');
  const config = serasa.mesclarPadrao(cfg);
  const secret = cfg.secret || store.getSerasaSecret(conexaoId);
  const doc = await lerDocumento(conexao, config, codigo, documento);
  exigirDocumentoNacional(doc);
  serasa.tokens.delete(`teste-${conexaoId}`);
  if (config.modoDemo) {
    const d = serasa.demo(doc);
    return { documento: doc, retorno: d.json, extraido: d.extraido, ms: d.ms };
  }
  const r = await serasa.chamarApi(`teste-${conexaoId}`, config, secret, doc);
  return { documento: doc, retorno: r.json, extraido: serasa.extrair(r.json, config.mapa), ms: r.ms };
}));

ipcMain.handle('serasa:testarAuth', trata(async ({ conexaoId, cfg }) => {
  exigirArea();
  const config = serasa.mesclarPadrao(cfg);
  const secret = cfg.secret || store.getSerasaSecret(conexaoId);
  serasa.tokens.delete(`teste-${conexaoId}`);
  const t = await serasa.obterToken(`teste-${conexaoId}`, config, secret);
  return { ok: true, token: t ? `${t.slice(0, 8)}…` : '(sem autenticação)' };
}));

ipcMain.handle('arquivo:abrir', trata((p) => shell.openPath(p)));

// ---------- Backup
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

// ---------- Manual do usuário (o PDF vai em out/main/manual, fora do .asar para o leitor de PDF abrir)
const MANUAL_ARQUIVO = 'Manual do Usuario - Analise de Credito.pdf';
function caminhoManual() {
  const base = path.join(__dirname, 'manual').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  const p = path.join(base, MANUAL_ARQUIVO);
  if (!fs.existsSync(p)) throw new Error('Manual do usuário não encontrado na instalação.');
  return p;
}
ipcMain.handle('manual:info', trata(() => {
  const p = caminhoManual();
  return { nome: MANUAL_ARQUIVO, url: pathToFileURL(p).href, bytes: fs.statSync(p).size };
}));
ipcMain.handle('manual:abrirJanela', trata(async () => {
  const p = caminhoManual();
  const w = new BrowserWindow({
    width: 1100, height: 860, title: 'Manual do Usuário — Análise de Crédito', icon: path.join(__dirname, '..', 'icone.png'),
    autoHideMenuBar: true, webPreferences: { plugins: true, contextIsolation: true, nodeIntegration: false }
  });
  await w.loadURL(pathToFileURL(p).href);
  return true;
}));
ipcMain.handle('manual:abrirExterno', trata(async () => {
  // abre no leitor de PDF padrão do Windows (copia para a pasta temporária para não travar o arquivo instalado)
  const destino = path.join(app.getPath('temp'), MANUAL_ARQUIVO);
  fs.copyFileSync(caminhoManual(), destino);
  const erro = await shell.openPath(destino);
  if (erro) throw new Error(erro);
  return true;
}));
ipcMain.handle('manual:salvar', trata(async () => {
  const { canceled, filePath } = await dialog.showSaveDialog(janela(), {
    title: 'Salvar manual do usuário', defaultPath: path.join(app.getPath('documents'), MANUAL_ARQUIVO), filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (canceled || !filePath) return null;
  fs.copyFileSync(caminhoManual(), filePath);
  return filePath;
}));

// ---------- Parallello: card "Situação de cobrança" na ficha (dados do módulo Cobrança) ----------
// Só para quem pode abrir a Cobrança; lê os títulos do ERP pela conexão em uso aqui e os registros da nuvem.
const cobErp = require('../../cobranca/main/erp');
const { criarNuvemSupabase: nuvemCobranca } = require('../../cobranca/main/nuvem');
const cobrancaLiberada = () => !!(ctx.podeAbrir?.('cobranca') && ctx.usuario()?.empresa?.id);
ipcMain.handle('cobranca:disponivel', trata(() => cobrancaLiberada()));
ipcMain.handle('cobranca:nuvem', trata(async (metodo, ...args) => {
  if (!cobrancaLiberada()) throw new Error('Módulo Cobrança não liberado.');
  if (!['carregarConfig', 'registrosDoCliente', 'eventosDoCliente'].includes(metodo)) throw new Error('Operação não permitida.');
  if (!(await ctx.nuvem.token())) throw new Error('Sem conexão com a nuvem do Parallello.');
  return nuvemCobranca(ctx.nuvem.cliente(), ctx.usuario().empresa.id)[metodo](...args);
}));
ipcMain.handle('cobranca:carteira', trata(async (codigo) => {
  if (!cobrancaLiberada()) throw new Error('Módulo Cobrança não liberado.');
  return cobErp.carteira(await cobErp.obterPool(await conexaoAtiva()), codigo);
}));

return { encerrar: async () => { await db.fechar?.(); await cobErp.fecharTudo(); } };
};
