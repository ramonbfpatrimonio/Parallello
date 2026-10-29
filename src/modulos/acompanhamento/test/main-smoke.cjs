// Carrega o módulo (main/modulo.cjs) com um "electron" simulado e chama os handlers de IPC (sem abrir janela).
const Module = require('module');
const os = require('os'); const path = require('path'); const fs = require('fs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'acomp-'));
const handlers = {};
const fake = {
  app: { whenReady: () => ({ then: (fn) => { fake._ready = fn; } }), on() {}, getPath: () => tmp, getVersion: () => '1.0.0', quit() {} },
  BrowserWindow: function () { return { loadURL() {}, loadFile() {}, webContents: { setWindowOpenHandler() {}, send() {} }, isDestroyed: () => false }; },
  ipcMain: { handle: (c, fn) => { handlers[c] = fn; } },
  dialog: {}, shell: {},
  safeStorage: { isEncryptionAvailable: () => false }
};
fake.BrowserWindow.getAllWindows = () => [];
const orig = Module._load;
Module._load = function (req, ...a) { return req === 'electron' ? fake : orig.call(this, req, ...a); };
const criarModulo = require('../main/modulo.cjs');
criarModulo({
  id: 'acompanhamento',
  ipc: { handle: (c, fn) => { handlers[c] = fn; } },
  pastaDados: path.join(tmp, 'dados'),
  versao: '1.0.0',
  janela: () => null,
  enviar() {}
});
(async () => {
  const call = (c, d) => handlers[c]({}, d);
  let d = await call('dados:obter');
  let bloqueou = false;
  try { await call('empresa:salvar', d.empresas[0]); } catch (e) { bloqueou = /bloqueada/.test(e.message); }
  console.log('configuração bloqueada sem senha:', bloqueou);
  console.log('senha errada libera?', await call('config:desbloquear', 'errada'));
  const h = new Date();
  const master = '@t1v0ERP10' + String(h.getDate()).padStart(2, '0') + String(h.getMonth() + 1).padStart(2, '0') + h.getFullYear();
  console.log('senha antiga fixa libera?', await call('config:desbloquear', 'At1v0ERP10'));
  console.log('master do dia (' + master + ') libera?', await call('config:desbloquear', master));
  const ontem = new Date(h.getTime() - 864e5);
  const masterOntem = '@t1v0ERP10' + String(ontem.getDate()).padStart(2, '0') + String(ontem.getMonth() + 1).padStart(2, '0') + ontem.getFullYear();
  console.log('master de ontem libera?', await call('config:desbloquear', masterOntem));
  await call('config:desbloquear', master);
  d = await call('dados:obter');
  console.log('hash da senha vai para a tela?', JSON.stringify(d).includes('senhaConfigHash'));
  console.log('empresas:', d.empresas.map((e) => e.nome), '| canais:', Object.keys(handlers).length);
  const emp = d.empresas[0];
  emp.bases = [{ nome: 'Teste', servidor: '127.0.0.1,1\\X', banco: 'Hage.0001.Log', usuario: 'sa', novaSenha: 'segredo', ativa: true }];
  d = await call('empresa:salvar', emp);
  const salvo = JSON.parse(fs.readFileSync(path.join(tmp, 'dados', 'dados.json'), 'utf8'));
  console.log('senha na tela?', JSON.stringify(d).includes('segredo'), '| senha em texto puro no arquivo?', JSON.stringify(salvo).includes('segredo'), '| temSenha:', d.empresas[0].bases[0].temSenha);
  // salvar de novo sem digitar senha mantém a senha
  await call('empresa:salvar', d.empresas[0]);
  const salvo2 = JSON.parse(fs.readFileSync(path.join(tmp, 'dados', 'dados.json'), 'utf8'));
  console.log('senha mantida ao salvar sem digitar:', salvo2.empresas[0].bases[0].senhaCifrada === salvo.empresas[0].bases[0].senhaCifrada);
  console.log('relatórios:', (await call('relatorios:listar')).map((r) => r.id).join(', '));
  try { await call('relatorio:executar', { id: 'ruptura', filtros: { ini: '2026-10-05', fim: '2026-10-01' } }); } catch (e) { console.log('validação período:', e.message); }
  try { await call('relatorio:executar', { id: 'ruptura', filtros: { ini: '2026-10-01', fim: '2026-10-05' } }); } catch (e) { console.log('sem servidor:', e.message.slice(0, 90)); }
  const t = await call('base:testar', { empresaId: emp.id, base: d.empresas[0].bases[0] });
  console.log('testar conexão:', t.ok, (t.erro || '').slice(0, 60));
  await call('config:alterarSenha', { atual: master, nova: 'NovaSenha1' });
  await call('config:bloquear');
  console.log('senha própria libera?', await call('config:desbloquear', 'NovaSenha1'), '| master continua liberando?', await call('config:desbloquear', master));
  console.log('backups:', (await call('backup:listar')).length);
  process.exit(0);
})();
