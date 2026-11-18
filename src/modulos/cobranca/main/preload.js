// Ponte da tela da Cobrança com o processo principal (só os canais deste módulo).
const { contextBridge, ipcRenderer } = require('electron');

const CANAIS = new Set([
  'sessao:info', 'sistema:liberar', 'sistema:fechar', 'conexoes:listar', 'conexoes:escolher', 'nuvem', 'operador:sair',
  'erp:carregar', 'erp:carteiraCliente', 'erp:cobradoRecebido', 'erp:historicoErp', 'erp:gravarHistorico', 'erp:protestar',
  'erp:enviarEmail', 'erp:testarSmtp', 'erp:abrirExterno', 'erp:copiar', 'erp:exportar',
]);

const chamar = async (canal, ...args) => {
  if (!CANAIS.has(canal)) throw new Error(`Canal não permitido: ${canal}`);
  const r = await ipcRenderer.invoke(canal, ...args);
  if (!r || !r.ok) throw new Error(r?.erro || 'Falha na operação.');
  return r.dados;
};

contextBridge.exposeInMainWorld('api', { chamar });
