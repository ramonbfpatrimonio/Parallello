// Cobrança: acesso ao ERP (SQL Server), e-mail pelo SMTP do ERP e exportação.
// Base: electron/cobranca-main.cjs do módulo avulso. A conexão vem das conexões únicas do Parallello.
const { app, shell, dialog, BrowserWindow } = require('electron');
const path = require('path');
const sql = require('mssql');
const nodemailer = require('nodemailer');
const fs = require('fs');

// ---------------- conexão (uma por conexão do Parallello) ----------------
const pools = new Map(); // id da conexão -> { chave, promessa }

function montarConfig(c) {
  let servidor = String(c.servidor || '').trim();
  let instancia = null;
  if (servidor.includes('\\')) [servidor, instancia] = servidor.split('\\');
  const cfg = {
    server: servidor,
    database: String(c.banco || '').trim(),
    user: c.usuario || '',
    password: c.senha || '',
    connectionTimeout: 15000,
    requestTimeout: 120000,
    pool: { max: 5, min: 0, idleTimeoutMillis: 60000 },
    options: { encrypt: !!c.criptografar, trustServerCertificate: true, enableArithAbort: true },
  };
  if (instancia) cfg.options.instanceName = instancia;
  else if (c.porta) cfg.port = Number(c.porta);
  return cfg;
}

function traduzirErro(err, c) {
  const msg = (err && (err.originalError?.message || err.message)) || String(err);
  const code = err && (err.code || err.originalError?.code);
  if (code === 'ELOGIN') return `Falha no login do banco: ${msg}`;
  if (code === 'ESOCKET' || code === 'ETIMEOUT' || code === 'EINSTLOOKUP')
    return `Não foi possível conectar em ${c?.servidor || 'o servidor'}. Verifique se o SQL Server está ligado e acessível. Detalhe: ${msg}`;
  return msg;
}

async function obterPool(c) {
  const chave = JSON.stringify([c.servidor, c.porta, c.banco, c.usuario, c.senha, c.criptografar]);
  const atual = pools.get(c.id);
  if (atual && atual.chave === chave) {
    const pool = await atual.promessa.catch(() => null);
    if (pool && pool.connected) return pool;
  }
  if (atual) atual.promessa.then((p) => p.close()).catch(() => {});
  const promessa = new sql.ConnectionPool(montarConfig(c)).connect();
  pools.set(c.id, { chave, promessa });
  try {
    return await promessa;
  } catch (e) {
    pools.delete(c.id);
    throw new Error(traduzirErro(e, c));
  }
}

async function fecharTudo() {
  for (const { promessa } of pools.values()) await promessa.then((p) => p.close()).catch(() => {});
  pools.clear();
}

// ---------------- consultas ----------------
const SQL_TITULOS = `
SELECT CR.[Codigo], CL.[Nome_Fanta], CL.[NroInsc], CL.[Tel], CL.[email],
       CR.[DocPag], T.[Abrev_Doc], CR.[NroNF], CR.[NroParc], P.[Nome_Guer] AS Vendedor,
       CONVERT(VARCHAR(10), CR.[DataEmi], 23) AS DataEmi,
       CONVERT(VARCHAR(10), CR.[DataVen], 23) AS DataVen,
       CAST(ISNULL(CR.[ValPre], 0) AS DECIMAL(18,2))     AS ValPre,
       CAST(ISNULL(CR.[Juros_Dia], 0) AS DECIMAL(18,6))  AS Juros_Dia,
       CAST(ISNULL(CR.[ValorMulta], 0) AS DECIMAL(18,2)) AS ValorMulta,
       CAST(ISNULL(CR.[Protestado], 0) AS INT)            AS Protestado
FROM [dbo].[Contas a Receber] AS CR
INNER JOIN [dbo].[Clientes] AS CL ON CR.[Codigo] = CL.[Codigo]
LEFT JOIN [dbo].[Pessoal] AS P ON CR.[Vendedor] = P.[Codigo]
LEFT JOIN [dbo].[Tipos de Documentos a Receber] AS T ON CR.[TipoDoc] = T.[Codigo]`;

const SQL_ULTIMO_HIST_CLIENTE = `
SELECT H.[Cliente], CONVERT(VARCHAR(10), H.[Data], 23) AS Data,
       CONVERT(VARCHAR(10), H.[DatProCob], 23) AS DatProCob, H.[Usuario], S.[Descricao] AS Situacao
FROM (
  SELECT [Cliente], [Data], [DatProCob], [Usuario], [Situacao],
         ROW_NUMBER() OVER (PARTITION BY [Cliente] ORDER BY [Data] DESC, [Numero] DESC) AS rn
  FROM [dbo].[HistoricoCobrancas]
) AS H
LEFT JOIN [dbo].[HistoricoCobrancasSituacoes] AS S ON H.[Situacao] = S.[Codigo]
WHERE H.rn = 1`;

const EXPR_RECEBIDO = '(ISNULL([ValPre],0) + ISNULL([ValorMulta],0) + ISNULL([Juros],0) + ISNULL([OutrosAcre],0) + ISNULL([TaxCob],0) - ISNULL([Desconto],0))';

async function carteira(pool, codigoCliente) {
  const r = pool.request();
  let texto = SQL_TITULOS;
  if (codigoCliente) { texto += ' WHERE CR.[Codigo] = @codigo'; r.input('codigo', sql.VarChar(30), String(codigoCliente)); }
  texto += ' ORDER BY CL.[Nome_Fanta] ASC, CR.[DataVen] ASC';
  return (await r.query(texto)).recordset;
}

async function carregarTudo(pool) {
  const [titulos, situacoes, empresa, ultimos, recebido, prazo] = await Promise.all([
    carteira(pool),
    pool.request().query('SELECT [Codigo], [Descricao] FROM [dbo].[HistoricoCobrancasSituacoes] ORDER BY [Descricao]'),
    pool.request().query('SELECT TOP 1 [NomeFanta], [email] FROM [dbo].[Empresas]'),
    pool.request().query(SQL_ULTIMO_HIST_CLIENTE),
    pool.request().query(`SELECT ISNULL(SUM(${EXPR_RECEBIDO}),0) AS Geral,
      ISNULL(SUM(CASE WHEN YEAR([DataPag]) = YEAR(GETDATE()) AND MONTH([DataPag]) = MONTH(GETDATE()) THEN ${EXPR_RECEBIDO} ELSE 0 END),0) AS Mes
      FROM [dbo].[Contas Recebidas]`),
    pool.request().query(`SELECT ISNULL(AVG(CAST(DATEDIFF(day, [DataVen], [DataPag]) AS FLOAT)), 0) AS MediaDias
      FROM [dbo].[Contas Recebidas] WHERE [DataPag] IS NOT NULL AND CAST([DataPag] AS DATE) >= CAST([DataVen] AS DATE)`),
  ]);
  const emp = empresa.recordset[0] || {};
  return {
    titulos,
    situacoes: situacoes.recordset.map((s) => ({ codigo: String(s.Codigo).trim(), descricao: String(s.Descricao || '').trim() })),
    empresa: { nome: String(emp.NomeFanta || '').trim(), email: String(emp.email || '').trim() },
    ultimoHistoricoErp: ultimos.recordset.map((h) => ({
      cliente: String(h.Cliente || '').trim(), data: h.Data, proximoContato: h.DatProCob,
      usuario: String(h.Usuario || '').trim(), situacao: String(h.Situacao || '').trim(),
    })),
    recebido: { geral: Number(recebido.recordset[0].Geral) || 0, mes: Number(recebido.recordset[0].Mes) || 0 },
    prazoMedio: Number(prazo.recordset[0].MediaDias) || 0,
  };
}

// Soma recebida dos documentos que foram cobrados (IN parametrizado em blocos)
async function cobradoRecebido(pool, docs) {
  let geral = 0; let mes = 0;
  const lista = [...new Set((docs || []).map((d) => String(d).trim()).filter(Boolean))];
  for (let i = 0; i < lista.length; i += 900) {
    const bloco = lista.slice(i, i + 900);
    const r = pool.request();
    const nomes = bloco.map((d, j) => { r.input(`d${j}`, sql.VarChar(60), d); return `@d${j}`; });
    const rs = await r.query(`SELECT ISNULL(SUM(${EXPR_RECEBIDO}),0) AS Geral,
      ISNULL(SUM(CASE WHEN YEAR([DataPag]) = YEAR(GETDATE()) AND MONTH([DataPag]) = MONTH(GETDATE()) THEN ${EXPR_RECEBIDO} ELSE 0 END),0) AS Mes
      FROM [dbo].[Contas Recebidas] WHERE [DocPag] IN (${nomes.join(',')})`);
    geral += Number(rs.recordset[0].Geral) || 0;
    mes += Number(rs.recordset[0].Mes) || 0;
  }
  return { geral, mes };
}

async function historicoErp(pool, cliente) {
  const rs = await pool.request()
    .input('cliente', sql.VarChar(30), String(cliente))
    .query(`SELECT H.[Numero], CONVERT(VARCHAR(10), H.[Data], 23) AS Data, H.[Hora], H.[Usuario],
              CONVERT(VARCHAR(10), H.[DatProCob], 23) AS DatProCob, H.[HorProCob], H.[ValPend], H.[Observacao],
              H.[Situacao], S.[Descricao] AS SituacaoDescricao
            FROM [dbo].[HistoricoCobrancas] AS H
            LEFT JOIN [dbo].[HistoricoCobrancasSituacoes] AS S ON H.[Situacao] = S.[Codigo]
            WHERE H.[Cliente] = @cliente
            ORDER BY H.[Data] DESC, H.[Numero] DESC`);
  return rs.recordset;
}

const tamanhosPorPool = new WeakMap();
async function tamanhosHistorico(pool) {
  if (tamanhosPorPool.has(pool)) return tamanhosPorPool.get(pool);
  let tamanhos;
  const rs = await pool.request().query(`SELECT COLUMN_NAME, CHARACTER_MAXIMUM_LENGTH AS T
    FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'HistoricoCobrancas'`);
  tamanhos = {};
  for (const c of rs.recordset) tamanhos[c.COLUMN_NAME.toLowerCase()] = c.T;
  tamanhosPorPool.set(pool, tamanhos);
  return tamanhos;
}
function cortar(txt, max) {
  const s = String(txt ?? '');
  return max && max > 0 ? s.slice(0, max) : s;
}

// Grava no ERP (HistoricoCobrancas), como o SalvarHistorico da planilha
async function gravarHistorico(pool, p) {
  const tam = await tamanhosHistorico(pool);
  const agora = new Date();
  const hh = (n) => String(n).padStart(2, '0');
  const hora = `${hh(agora.getHours())}${hh(agora.getMinutes())}${hh(agora.getSeconds())}00`;
  const horProCob = p.horaPrevista ? `${p.horaPrevista.replace(':', '')}0000` : '00000000';
  const datProCob = p.dataPrevista || p.hoje; // sem próxima: data de hoje (igual à planilha)

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const rs = await new sql.Request(tx)
      .input('cliente', sql.VarChar(30), p.cliente)
      .input('hora', sql.VarChar(10), hora)
      .input('usuario', sql.VarChar(200), cortar(p.usuario, tam.usuario))
      .input('datProCob', sql.VarChar(10), datProCob)
      .input('horProCob', sql.VarChar(10), horProCob)
      .input('valPend', sql.Decimal(18, 2), Number(p.valor) || 0)
      .input('obs', sql.NVarChar(sql.MAX), cortar(p.observacao, tam.observacao))
      .input('situacao', sql.VarChar(20), String(p.situacao))
      .query(`DECLARE @num VARCHAR(10);
        SELECT @num = RIGHT('00000' + CAST(ISNULL(MAX(CASE WHEN ISNUMERIC([Numero]) = 1 THEN CAST([Numero] AS BIGINT) END), 0) + 1 AS VARCHAR(10)), 5)
        FROM [dbo].[HistoricoCobrancas] WITH (UPDLOCK, HOLDLOCK) WHERE [Cliente] = @cliente;
        INSERT INTO [dbo].[HistoricoCobrancas]
          ([Cliente], [Numero], [Data], [Hora], [Usuario], [DatProCob], [HorProCob], [DatPrePag], [ValPend], [Observacao], [Situacao])
        VALUES (@cliente, @num, CONVERT(DATE, GETDATE()), @hora, @usuario, @datProCob, @horProCob, @datProCob, @valPend, @obs, @situacao);
        SELECT @num AS Numero;`);
    await tx.commit();
    return { numero: rs.recordset[0]?.Numero };
  } catch (e) {
    try { await tx.rollback(); } catch (_) { /* ignora */ }
    throw e;
  }
}

async function protestar(pool, doc) {
  const rs = await pool.request()
    .input('doc', sql.VarChar(60), String(doc))
    .query('UPDATE [dbo].[Contas a Receber] SET [Protestado] = 1 WHERE [DocPag] = @doc');
  return { linhas: rs.rowsAffected[0] || 0 };
}

// ---------------- e-mail ----------------
async function smtpDoErp(pool) {
  const rs = await pool.request().query('SELECT TOP 1 [SerSMTPCob], [ConSMTPCob], [SenSMTPCob], [PorSMTPCob] FROM [dbo].[ConfiguraçõesAdm]');
  const c = rs.recordset[0];
  if (!c || !String(c.SerSMTPCob || '').trim()) throw new Error('SMTP de cobrança não configurado no ERP (Configurações Adm).');
  const porta = Number(String(c.PorSMTPCob || '').trim()) || 587;
  return {
    host: String(c.SerSMTPCob).trim(),
    port: porta,
    secure: porta === 465,
    auth: { user: String(c.ConSMTPCob || '').trim(), pass: String(c.SenSMTPCob || '').replace(/\s/g, '') },
    connectionTimeout: 60000,
    tls: { rejectUnauthorized: false },
  };
}

let transporte = null;
let chaveSmtp = '';
async function enviarEmail(pool, { para, assunto, corpo, qrPngBase64 }) {
  const cfg = await smtpDoErp(pool);
  const chave = JSON.stringify(cfg);
  if (!transporte || chave !== chaveSmtp) { transporte = nodemailer.createTransport(cfg); chaveSmtp = chave; }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const msg = { from: cfg.auth.user, to: para, subject: assunto, text: corpo };
  if (qrPngBase64) {
    msg.html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;white-space:pre-wrap">${esc(corpo)}</div>`
      + '<p style="font-family:Segoe UI,Arial,sans-serif"><b>PIX - Escaneie o QR Code:</b><br>'
      + '<img src="cid:qrpix" width="220" height="220" alt="QR Code PIX"></p>';
    msg.attachments = [{ filename: 'pix.png', content: Buffer.from(qrPngBase64, 'base64'), cid: 'qrpix' }];
  }
  const info = await transporte.sendMail(msg);
  return { id: info.messageId };
}

// ---------------- exportação ----------------
function htmlRelatorio({ titulo, subtitulo, colunas, linhas }) {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const th = colunas.map((c) => `<th style="text-align:${c.alinhar || 'left'}">${esc(c.titulo)}</th>`).join('');
  const tr = linhas.map((l) => `<tr class="${l._grupo ? 'g' : ''}">${colunas.map((c) => `<td style="text-align:${c.alinhar || 'left'}">${esc(l[c.chave])}</td>`).join('')}</tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:Segoe UI,Arial,sans-serif;font-size:10px;color:#1f2937;margin:18px}
    h1{font-size:15px;margin:0 0 2px} p{margin:0 0 10px;color:#6b7280}
    table{width:100%;border-collapse:collapse} th{background:#1e3c72;color:#fff;padding:5px;font-weight:600}
    td{padding:4px 5px;border-bottom:1px solid #e5e7eb} tr.g td{background:#eef2f9;font-weight:600}
  </style></head><body><h1>${esc(titulo)}</h1><p>${esc(subtitulo || '')}</p><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></body></html>`;
}

async function janelaRelatorio(dados) {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: false } });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlRelatorio(dados))}`);
  return win;
}

async function exportar(dados, janela) {
  const nomeBase = (dados.arquivo || 'cobranca').replace(/[\\/:*?"<>|]/g, '-');
  if (dados.formato === 'imprimir') {
    const win = await janelaRelatorio(dados);
    await new Promise((res) => win.webContents.print({ landscape: true }, () => res()));
    win.close();
    return { ok: true };
  }
  if (dados.formato === 'pdf') {
    const { canceled, filePath } = await dialog.showSaveDialog(janela, { defaultPath: path.join(app.getPath('documents'), `${nomeBase}.pdf`), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (canceled || !filePath) return { ok: false };
    const win = await janelaRelatorio(dados);
    const pdf = await win.webContents.printToPDF({ landscape: true, printBackground: true, pageSize: 'A4' });
    win.close();
    fs.writeFileSync(filePath, pdf);
    shell.openPath(filePath);
    return { ok: true, caminho: filePath };
  }
  // Excel
  const ExcelJS = require('exceljs');
  const { canceled, filePath } = await dialog.showSaveDialog(janela, { defaultPath: path.join(app.getPath('documents'), `${nomeBase}.xlsx`), filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
  if (canceled || !filePath) return { ok: false };
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet((dados.titulo || 'Cobrança').slice(0, 31).replace(/[\\/*?:[\]]/g, '-'));
  ws.columns = dados.colunas.map((c) => ({ header: c.titulo, key: c.chave, width: c.largura || 16 }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3C72' } };
  for (const l of dados.linhas) {
    const linha = {};
    for (const c of dados.colunas) linha[c.chave] = l[`${c.chave}_num`] ?? l[c.chave];
    const row = ws.addRow(linha);
    if (l._grupo) { row.font = { bold: true }; row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2F9' } }; }
  }
  dados.colunas.forEach((c, i) => { if (c.formato === 'moeda') ws.getColumn(i + 1).numFmt = '"R$" #,##0.00'; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  await wb.xlsx.writeFile(filePath);
  shell.openPath(filePath);
  return { ok: true, caminho: filePath };
}

module.exports = {
  obterPool, fecharTudo, carregarTudo, carteira, cobradoRecebido, historicoErp, gravarHistorico, protestar,
  enviarEmail, smtpDoErp, exportar, htmlRelatorio,
  testarSmtp: async (pool) => { const c = await smtpDoErp(pool); await nodemailer.createTransport(c).verify(); return { host: c.host, port: c.port, user: c.auth.user }; },
};
