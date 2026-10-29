// Modo de demonstração (PVR_DEMO=1): simula o ERP em memória para testar as telas sem SQL Server.
const real = require('./db');

const hoje = new Date();
const dia = (d) => new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - d);
const ano = String(hoje.getFullYear());

const produtos = [
  ['000221', 'AÇUCAR DE COCO 250G - VIVA VITTA', 'VIVA VITTA', 'UN', 1],
  ['000236', 'CHIA 150G - VIVA VITTA', 'VIVA VITTA', 'UN', 1],
  ['000248', 'CRAVO DA ÍNDIA 15G - TEMPEROU', 'TEMPEROU', 'UN', 1],
  ['000738', 'MG15 MINGAU FARINHA LACTEA ALCAF 12X200g', 'ALCAFOODS', 'CX', 12],
  ['000412', 'COLORAU 500G - TEMPEROU', 'TEMPEROU', 'FD', 24],
  ['000915', 'FLOCAO DE MILHO 500G - NUTREMA', 'NUTREMA', 'FD', 20],
  ['001102', 'COPO DESC. 200ML C/100 - IBEPLAS', 'IBEPLAS', 'CX', 25],
];
const estoque = { '000221': 0, '000236': 0, '000248': 40, '000738': 30, '000412': 500, '000915': 15, '001102': 0 };
const compra = { '000221': 120, '000236': 0, '000248': 0, '000738': 24, '000412': 0, '000915': 60, '001102': 250 };

// [ano, numero, cliente, nome, equipeCod, equipeNome, nped, data(dias atrás), itens:[prod, pvCx, pvUn, pdCx, pdUn]]
const pvs = [
  ['002007', '01923', 'SUPERMERCADOS DB LTDA', '1', 'ALFA', '123456', 3, [['000221', 901, 0, 0, 0]]],
  ['002037', '01923', 'SUPERMERCADOS DB LTDA', '1', 'ALFA', '123456', 2, [['000221', 901, 0, 0, 0]]],
  ['002038', '01923', 'SUPERMERCADOS DB LTDA', '1', 'ALFA', '12345659', 2, [['000221', 901, 0, 0, 0], ['000236', 900, 0, 719, 0], ['000248', 700, 0, 697, 0], ['000738', 80, 6, 65, 0]]],
  ['002045', '01923', 'SUPERMERCADOS DB LTDA', '1', 'ALFA', '12345659', 1, [['000221', 901, 0, 901, 0]]],
  ['002051', '02955', 'RENAN DOS SANTOS ARAUJO', '2', 'BETA', '7781', 1, [['000412', 10, 0, 4, 12], ['000915', 6, 0, 0, 0], ['001102', 3, 0, 1, 0]]],
  ['002052', '02955', 'RENAN DOS SANTOS ARAUJO', '3', 'GAMA', '7782', 1, [['000248', 50, 0, 20, 0]]],
  ['002060', '03310', 'MERCADINHO BOA VISTA', '1', 'ALFA', '', 0, [['000738', 12, 0, 10, 0], ['000412', 5, 0, 5, 0]]],
];
const refs = [ // [anoNova, numNova, anoRef, numRef, prod]
  [ano, '002037', ano, '002007', '000221'],
  [ano, '002045', ano, '002038', '000221'],
];
let indice = 2060;

function linhas(filtros) {
  const ini = new Date(filtros.dataIni + 'T00:00:00');
  const fim = new Date(filtros.dataFim + 'T23:59:59');
  const out = [];
  const cont = new Map();
  const cli = filtros.cliente ? String(filtros.cliente).trim().padStart(5, '0') : '';
  for (const [numero, cod, nome, eqc, eqn, nped, d, itens] of pvs) {
    const data = dia(d);
    if (data < ini || data > fim) continue;
    if (cli && cod !== cli) continue;
    if (filtros.pedido && !nped.includes(filtros.pedido)) continue;
    for (const [prod, pvCx, pvUn, pdCx, pdUn] of itens) {
      const p = produtos.find((x) => x[0] === prod);
      if (filtros.fabricante && filtros.fabricante !== 'TODOS' && p[2] !== filtros.fabricante) continue;
      const k = `${cod}|${nped}|${prod}`;
      cont.set(k, (cont.get(k) || 0) + 1);
      const ref = refs.find((r) => r[2] === ano && r[3] === numero && r[4] === prod);
      const upc = p[4];
      if (pvCx * upc + pvUn <= pdCx * upc + pdUn) continue;
      out.push(real.montarLinha({
        ANO: ano, N_PREVENDA: numero, COD_CLIENTE: cod, NOME_CLIENTE: nome, COD_EQUIPE: eqc, NOME_EQUIPE: eqn,
        N_PED_CLIENTE: nped, PRODUTO: prod, DESCRICAO: p[1], FABRICANTE: p[2], UNID: p[3], UNID_POR_CAIXA: upc,
        PV_CAIXAS: pvCx, PV_UNIDADES: pvUn, PD_CAIXAS: pdCx, PD_UNIDADES: pdUn,
        ESTOQUE: estoque[prod] * upc, COMPRA: compra[prod] * upc, DATA_PV: data,
        NOVA_PV_GERADA: ref ? ref[1] : null, NOVA_PV_ANO: ref ? ref[0] : null, POSICAO_RUPTURA: cont.get(k),
      }));
    }
  }
  return out;
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  async obterPool() { return {}; },
  async testarConexao() { await espera(400); return { servidor: 'DEMO', banco: 'DEMO', versao: 'Modo demonstração' }; },
  async fecharTodos() {},
  async buscarRupturas(_p, filtros) { await espera(300); return linhas(filtros); },
  async clientesComRupturas(_p, filtros) { await espera(300); return real.resumirClientes(linhas(filtros)); },
  async listarFabricantes() { return [...new Set(produtos.map((p) => p[2]))].sort(); },
  async buscarClientes(_p, termo) {
    const t = String(termo || '').toUpperCase();
    const m = new Map(pvs.map((p) => [p[1], p[2]]));
    return [...m.entries()].filter(([c, n]) => c.includes(t) || n.includes(t)).map(([Codigo, Nome]) => ({ Codigo, Nome }));
  },
  async nomeCliente(_p, cod) { const c = pvs.find((p) => p[1] === String(cod).padStart(5, '0')); return c ? c[2] : null; },
  validarSelecao: real.validarSelecao,
  async gerarPreVenda(_p, { itens }) {
    const erros = real.validarSelecao(itens);
    if (erros.length) throw new Error(erros.join('\n\n'));
    await espera(600);
    indice++;
    const numero = String(indice).padStart(6, '0');
    for (const i of itens) refs.push([ano, numero, i.ano, i.numero, i.produto]);
    const p = itens[0];
    return {
      ano, numero, qtdItens: itens.length, codCliente: p.codCliente, nomeCliente: p.nomeCliente, nroPedClie: p.nroPedClie,
      nomeEquipe: p.nomeEquipe, pvOrigens: [...new Set(itens.map((i) => i.numero))], eventoOk: true,
      itens: itens.map((i) => ({ produto: i.produto, descricao: i.descricao, faltaCx: i.faltaCx, faltaUn: i.faltaUn, pvOrigem: i.numero })),
    };
  },
  async verificarTabelas() {
    return ['Prevendas', 'PrevendasItens', 'PrevendasIndice', 'Produtos', 'Fabricantes', 'Clientes', 'Equipes', 'Estoque', 'Itens de Pedido', 'RupturasReferencias', 'EventosSistema']
      .map((t) => ({ tabela: t, existe: t !== 'EventosSistema', extra: ['RupturasReferencias', 'EventosSistema'].includes(t) }));
  },
  async criarTabela() { await espera(300); return { criada: true }; },
  SCRIPT_TABELAS: real.SCRIPT_TABELAS,
};
