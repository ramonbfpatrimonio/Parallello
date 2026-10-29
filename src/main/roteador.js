// Roteador de IPC.
//
// Cada sistema foi escrito como programa independente e registra canais com o mesmo nome
// que outros usam (ex.: 'exportar:excel', 'config:abrir'). Aqui cada canal é registrado
// uma vez só no ipcMain e a chamada é entregue ao módulo dono da tela que chamou
// (identificado pelo webContents de quem enviou). Assim nenhum código das telas precisou mudar.
import { ipcMain } from 'electron';

const canais = new Map(); // canal -> Map(moduloId -> handler)
const donos = new Map(); // webContents.id -> moduloId

function registrarCanal(canal) {
  const porModulo = new Map();
  canais.set(canal, porModulo);
  ipcMain.handle(canal, (evento, ...args) => {
    const moduloId = donos.get(evento.sender.id);
    const fn = moduloId && porModulo.get(moduloId);
    if (!fn) throw new Error(`O canal "${canal}" não está disponível nesta tela.`);
    return fn(evento, ...args);
  });
  return porModulo;
}

/** IPC de um módulo: mesma assinatura do ipcMain.handle, mas só atende as telas do módulo. */
export function ipcDoModulo(moduloId) {
  return {
    handle(canal, fn) {
      if (canal.startsWith('parallello:')) throw new Error('Canal reservado ao Parallello: ' + canal);
      const porModulo = canais.get(canal) || registrarCanal(canal);
      if (porModulo.has(moduloId)) throw new Error(`Canal "${canal}" registrado duas vezes em ${moduloId}.`);
      porModulo.set(moduloId, fn);
    },
    removeHandler(canal) {
      const porModulo = canais.get(canal);
      if (porModulo) porModulo.delete(moduloId);
    },
  };
}

export function vincularTela(webContentsId, moduloId) {
  donos.set(webContentsId, moduloId);
}

export function desvincularTela(webContentsId) {
  donos.delete(webContentsId);
}
