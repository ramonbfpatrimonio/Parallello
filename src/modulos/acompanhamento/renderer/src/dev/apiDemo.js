// API de demonstração — usada SOMENTE no navegador durante o desenvolvimento (npm run vite),
// para ver as telas sem Electron e sem SQL Server. Não é incluída no build do app.
import demo from './demo-data.json';

export function criarApiDemo() {
  let dados = {
    versao: 1,
    empresaAtivaId: demo.empresa.id,
    empresas: [demo.empresa, { ...demo.empresa, id: 'demo2', nome: 'Outro Cliente Ltda', bases: [] }],
    preferencias: { deduzirRetorno: false },
    pastaDados: 'C:\\Users\\ramon\\AppData\\Roaming\\Acompanhamento de Vendas\\dados',
    versaoApp: '1.0.0',
    configLiberada: false
  };
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const R = demo.relatorios;
  return {
    obterDados: async () => dados,
    listarRelatorios: async () => Object.values(R).map((r) => r.meta),
    executarRelatorio: async ({ id }) => { await espera(300); return R[id].resultado; },
    remontarRelatorio: async ({ id }) => R[id].resultado,
    salvarEmpresa: async (e) => { dados = { ...dados, empresas: dados.empresas.map((x) => (x.id === e.id ? e : x)) }; return dados; },
    novaEmpresa: async () => dados,
    excluirEmpresa: async () => dados,
    ativarEmpresa: async (id) => { dados = { ...dados, empresaAtivaId: id }; return dados; },
    salvarPreferencias: async (p) => { dados = { ...dados, preferencias: { ...dados.preferencias, ...p } }; return dados; },
    testarBase: async () => { await espera(500); return { ok: true, banco: 'Hage.0001.Log', servidor: 'SERVIDOR', prevendas: 184233 }; },
    desbloquearConfig: async (senha) => {
      const d = new Date();
      const master = '@t1v0ERP10' + String(d.getDate()).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0') + d.getFullYear();
      const ok = senha === master;
      dados = { ...dados, configLiberada: ok };
      return ok;
    },
    bloquearConfig: async () => { dados = { ...dados, configLiberada: false }; return true; },
    alterarSenhaConfig: async () => true,
    exportarExcel: async () => null,
    exportarPdf: async () => null,
    exportarBackup: async () => null,
    importarBackup: async () => null,
    abrirPastaDados: async () => null,
    listarBackups: async () => [{ nome: 'dados-2026-10-22.json', data: Date.now() }, { nome: 'dados-2026-10-21.json', data: Date.now() - 864e5 }],
    aoProgredir: () => () => {}
  };
}
