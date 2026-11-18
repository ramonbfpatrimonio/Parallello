// Cobrança dentro do Parallello (base: módulo avulso 1.0.0, da planilha COBRANCA2.0.xlsm).
// O que era "registrarCobranca()" virou uma função que recebe o contexto do Parallello:
// IPC só deste módulo, janela para os diálogos, usuário logado, conexões únicas e a nuvem
// já logada (as tabelas cob_* ficam no Supabase do Parallello: supabase/migrations/007_modulo_cobranca.sql).
const { shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const erp = require('./erp');
const { criarNuvemSupabase } = require('./nuvem');
const { ehSenhaMaster } = require('../../../compartilhado/master.js');

const NA_PARALLELLO = 'As conexões com o banco ficam no Parallello: Ctrl+Shift+B na tela inicial (Configuração > Conexão com o banco).';

// O que a tela pode pedir à nuvem (os mesmos nomes do nuvem.js do módulo)
const LEITURA = new Set([
  'carregarConfig', 'listarOperadores', 'ultimosRegistrosPorDoc', 'ultimosRegistrosPorCliente', 'jaRegistradoHoje',
  'registrosDoDia', 'registrosDoPeriodo', 'registrosDoCliente', 'registrosPendentesErp', 'documentosCobradosPagos',
  'eventosDoCliente', 'eventosDoLote', 'whatsappPorCliente', 'ultimoEmailPorCliente',
]);
const OPERACAO = new Set(['inserirRegistro', 'atualizarRegistro', 'marcarPagos', 'inserirEventos']);
const AREA = new Set(['salvarConfig', 'salvarOperador', 'excluirOperador']); // só com a Área do sistema liberada

function traduzirNuvem(msg) {
  if (/row-level security|permission denied|Sem permissão/i.test(msg)) return 'Sem permissão na nuvem para a Cobrança. Confira se o módulo Cobrança está liberado para a empresa e para o seu usuário.';
  if (/cob_registros_um_por_dia|duplicate key/i.test(msg)) return 'Este documento já tem registro de cobrança hoje.';
  if (/Could not find the (table|function)|relation .*cob_.* does not exist|schema cache/i.test(msg)) return 'A nuvem ainda não tem as tabelas da Cobrança. No Supabase, abra o SQL Editor e rode supabase/migrations/007_modulo_cobranca.sql.';
  if (/JWT|not authenticated|invalid claim/i.test(msg)) return 'Sessão da nuvem expirada. Saia e entre de novo no Parallello.';
  return msg;
}

module.exports = function criarModulo(ctx) {
  const arqConfig = path.join(ctx.pastaDados, 'config.json');
  const lerConfig = () => { try { return JSON.parse(fs.readFileSync(arqConfig, 'utf8')); } catch { return {}; } };
  const gravarConfig = (c) => { fs.mkdirSync(ctx.pastaDados, { recursive: true }); fs.writeFileSync(arqConfig, JSON.stringify(c, null, 2)); };

  let areaLiberada = false;
  let operador = null; // quem entrou com o PIN (vale para o protesto)

  // ---------------- conexões: as do Parallello; a escolhida fica guardada neste computador ----------------
  const servidorDe = (p) => (p.instancia && !p.porta ? `${p.servidor}\\${p.instancia}` : p.servidor);
  async function listarConexoes() {
    const escolhida = lerConfig().conexao || null;
    const lista = (await ctx.conexoes.listar()).map((p) => ({
      id: p.id,
      nome: p.cliente ? `${p.cliente} › ${p.nome}` : p.nome,
      servidor: servidorDe(p),
      porta: p.porta || null,
      banco: p.banco,
      usuario: p.usuario,
      criptografar: !!p.criptografar,
      temSenha: !!p.temSenha,
    }));
    const ativa = (lista.find((c) => c.id === escolhida) || lista[0])?.id || null;
    return lista.map((c) => ({ ...c, ativa: c.id === ativa }));
  }
  async function pool() {
    const lista = await listarConexoes();
    const c = lista.find((x) => x.ativa);
    if (!c) throw new Error(`Nenhuma conexão cadastrada. ${NA_PARALLELLO}`);
    const senha = await ctx.conexoes.senha(c.id);
    if (!senha && !c.temSenha) throw new Error(`A conexão "${c.nome}" está sem senha neste computador. ${NA_PARALLELLO}`);
    return erp.obterPool({ ...c, senha });
  }

  // ---------------- nuvem: sempre a empresa do usuário logado ----------------
  async function nuvem() {
    const u = ctx.usuario();
    const empresaId = u?.empresa?.id;
    if (!empresaId) throw new Error(u?.ehSuper ? 'Escolha a empresa no Parallello antes de abrir a Cobrança.' : 'Seu usuário não está ligado a nenhuma empresa.');
    if (!(await ctx.nuvem.token())) throw new Error('Sem conexão com a nuvem do Parallello. A Cobrança salva tudo na nuvem: confira a internet e entre de novo no Parallello.');
    return criarNuvemSupabase(ctx.nuvem.cliente(), empresaId);
  }

  // ---------------- IPC ----------------
  function handle(canal, fn) {
    ctx.ipc.handle(canal, async (_e, ...args) => {
      try {
        if (!ctx.usuario()) throw new Error('Entre no Parallello.');
        return { ok: true, dados: await fn(...args) };
      } catch (err) {
        return { ok: false, erro: traduzirNuvem((err && err.message) || String(err)) };
      }
    });
  }

  handle('sessao:info', () => {
    const u = ctx.usuario();
    return { usuario: u?.nome || u?.usuario || '', empresaId: u?.empresa?.id || null, empresaNome: u?.empresa?.nome || '' };
  });
  handle('sistema:liberar', (senha) => (areaLiberada = ehSenhaMaster(String(senha || ''))));
  handle('sistema:fechar', () => { areaLiberada = false; return true; });

  handle('conexoes:listar', () => listarConexoes());
  handle('conexoes:escolher', async (id) => {
    const lista = await listarConexoes();
    if (!lista.some((c) => c.id === id)) throw new Error('Conexão não encontrada.');
    gravarConfig({ ...lerConfig(), conexao: id });
    return true;
  });

  handle('nuvem', async (metodo, ...args) => {
    const n = await nuvem();
    if (AREA.has(metodo)) {
      if (!areaLiberada) throw new Error('Área do sistema bloqueada. Pressione Ctrl+Shift+B e informe a senha.');
    } else if (!LEITURA.has(metodo) && !OPERACAO.has(metodo) && metodo !== 'entrarComPin') {
      throw new Error(`Operação não permitida: ${metodo}`);
    }
    const r = await n[metodo](...args);
    if (metodo === 'entrarComPin') operador = r;
    return r;
  });
  handle('operador:sair', () => { operador = null; return true; });

  handle('erp:carregar', async () => erp.carregarTudo(await pool()));
  handle('erp:carteiraCliente', async (codigo) => erp.carteira(await pool(), codigo));
  handle('erp:cobradoRecebido', async (docs) => erp.cobradoRecebido(await pool(), docs));
  handle('erp:historicoErp', async (cliente) => erp.historicoErp(await pool(), cliente));
  handle('erp:gravarHistorico', async (p) => erp.gravarHistorico(await pool(), p));
  handle('erp:protestar', async (doc) => {
    if (!operador?.pode_protestar) throw new Error('Este operador não tem permissão para protestar.');
    return erp.protestar(await pool(), doc);
  });
  handle('erp:enviarEmail', async (m) => erp.enviarEmail(await pool(), m));
  handle('erp:testarSmtp', async () => {
    if (!areaLiberada) throw new Error('Área do sistema bloqueada.');
    return erp.testarSmtp(await pool());
  });
  handle('erp:abrirExterno', async (url) => {
    if (!/^(whatsapp:\/\/|https:\/\/wa\.me\/|https:\/\/web\.whatsapp\.com\/|mailto:)/.test(String(url))) throw new Error('Endereço não permitido.');
    await shell.openExternal(url);
    return true;
  });
  handle('erp:copiar', (texto) => { clipboard.writeText(String(texto ?? '')); return true; });
  handle('erp:exportar', (dados) => erp.exportar(dados, ctx.janela()));

  return { encerrar: () => erp.fecharTudo() };
};
