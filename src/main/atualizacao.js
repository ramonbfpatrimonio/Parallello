// Atualização automática do Parallello (GitHub Releases, via electron-updater).
// Uma atualização só para todos os sistemas. O aviso aparece na barra superior:
// "Atualização X disponível" -> baixa em segundo plano -> "Reiniciar e atualizar".
// Se a pessoa não reiniciar, instala ao fechar o programa.
import { app } from 'electron';

let autoUpdater = null;
function updater() {
  if (!autoUpdater) autoUpdater = require('electron-updater').autoUpdater;
  return autoUpdater;
}

export function criarAtualizacao(aoMudar) {
  let estado = { tipo: 'parado' };
  const enviar = (e) => {
    estado = e;
    aoMudar(e);
  };

  const servico = {
    estado: () => estado,
    async verificar() {
      if (!app.isPackaged) return { emDesenvolvimento: true };
      await updater().checkForUpdates().catch((e) => enviar({ tipo: 'erro', mensagem: e?.message ?? String(e) }));
      return { emDesenvolvimento: false };
    },
    async baixar() {
      if (!app.isPackaged) throw new Error('Atualização automática só funciona no programa instalado.');
      enviar({ tipo: 'baixando', percentual: 0, versao: estado.versao });
      await updater().downloadUpdate().catch((e) => enviar({ tipo: 'erro', mensagem: e?.message ?? String(e) }));
      return true;
    },
    instalar() {
      // silencioso (sem a tela do instalador) e abre o programa de novo no fim
      setImmediate(() => updater().quitAndInstall(true, true));
      return true;
    },
  };

  if (app.isPackaged) {
    const u = updater();
    u.autoDownload = false; // só baixa quando a pessoa escolher "Atualizar"
    u.autoInstallOnAppQuit = true; // baixou e não reiniciou: instala ao fechar
    const ocupado = () => estado.tipo === 'baixando' || estado.tipo === 'pronta';
    u.on('checking-for-update', () => !ocupado() && enviar({ tipo: 'verificando' }));
    u.on('update-available', (i) => !ocupado() && enviar({ tipo: 'disponivel', versao: i.version }));
    u.on('update-not-available', () => enviar({ tipo: 'atualizado' }));
    u.on('download-progress', (p) => enviar({ tipo: 'baixando', percentual: Math.round(p.percent), versao: estado.versao }));
    u.on('update-downloaded', (i) => enviar({ tipo: 'pronta', versao: i.version }));
    u.on('error', (e) => enviar({ tipo: 'erro', mensagem: e?.message ?? String(e) }));
    const verificar = () => u.checkForUpdates().catch(() => undefined);
    setTimeout(verificar, 5000);
    setInterval(verificar, 4 * 60 * 60 * 1000); // a cada 4 horas
  }

  return servico;
}
