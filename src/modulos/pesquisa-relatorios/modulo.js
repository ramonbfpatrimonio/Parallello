'use strict';
// Pesquisa de Relatórios como módulo do Parallello.
// O processo principal original (janela própria + atualização própria) virou esta função:
// o Parallello entrega o IPC só deste módulo, a pasta de dados e a janela para os diálogos.
// A atualização automática agora é a do Parallello (uma só para todos os sistemas).
const { dialog, shell, app } = require('electron');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { Store } = require('./src/store');
const { Nuvem } = require('./src/nuvem');
const nuvemConfig = require('./src/nuvem-config');
const { criarHandlers } = require('./src/handlers');

const INTERVALO_BACKUP_MS = 10 * 60 * 1000;

module.exports = function criarModulo(ctx) {
  let store = null;
  let temporizadorBackup = null;
  const janela = () => ctx.janela();

  // ---------- nuvem (Supabase): leitura em tempo real é livre; escrever exige login (Ctrl+Shift+B) ----------
  const nuvem = new Nuvem({
    criarCliente: (url, anonKey) => createClient(url, anonKey),
    aoAtualizarDados: (db) => {
      store.aplicarDaNuvem(db);
      // Usa o banco JÁ normalizado pelo store como "retrato" — senão a próxima comparação acha
      // diferença à toa (normalização não é mudança de verdade) e fica reenviando pra nuvem sem parar.
      nuvem.sincronizarRetratoCom(store.db);
      ctx.enviar('nuvem:dados', { db: store.db });
    },
    aoAtualizarStatus: (status) => ctx.enviar('nuvem:status', status),
  });
  let nuvemConfigurada = false;
  try {
    nuvem.configurar(nuvemConfig.url, nuvemConfig.anonKey);
    nuvemConfigurada = true;
  } catch (_) {
    // sem URL/chave preenchidas: o programa segue funcionando só com os dados locais
  }
  function obterBaseLocalParaNuvem() {
    return {
      versao: store.db.versao,
      modulosOcultos: store.db.modulosOcultos,
      modulosEscolhidos: store.db.modulosEscolhidos,
      nuvemVinculada: store.db.nuvemVinculada,
      tema: store.db.tema,
    };
  }

  // ---------- configuração (pasta de backup escolhida pelo usuário) ----------
  const arquivoConfig = () => path.join(ctx.pastaDados, 'config.json');

  function lerConfig() {
    try {
      return JSON.parse(fs.readFileSync(arquivoConfig(), 'utf8'));
    } catch (_) {
      return {};
    }
  }

  function salvarPastaBackup(pasta) {
    fs.mkdirSync(path.dirname(arquivoConfig()), { recursive: true });
    fs.writeFileSync(arquivoConfig(), JSON.stringify({ ...lerConfig(), pastaBackup: pasta }, null, 2));
  }

  function pastaBackupPadrao() {
    return path.join(app.getPath('documents'), 'Pesquisa de Relatorios', 'Backup');
  }

  // ---------- janelas de arquivo ----------
  const dialogo = {
    async abrirImagem() {
      const r = await dialog.showOpenDialog(janela(), {
        title: 'Escolha a imagem da tela de filtro',
        properties: ['openFile'],
        filters: [{ name: 'Imagens', extensions: ['gif', 'png', 'jpg', 'jpeg', 'webp', 'bmp'] }],
      });
      return r.canceled ? null : r.filePaths[0];
    },
    async abrirPastaImagens() {
      const r = await dialog.showOpenDialog(janela(), { title: 'Escolha a pasta com as imagens', properties: ['openDirectory'] });
      return r.canceled ? null : r.filePaths[0];
    },
    async escolherPastaBackup() {
      const r = await dialog.showOpenDialog(janela(), { title: 'Escolha a pasta de backup', properties: ['openDirectory', 'createDirectory'] });
      return r.canceled ? null : r.filePaths[0];
    },
    async abrirJSON() {
      const r = await dialog.showOpenDialog(janela(), {
        title: 'Importar dados',
        properties: ['openFile'],
        filters: [{ name: 'Dados (JSON)', extensions: ['json'] }],
      });
      return r.canceled ? null : r.filePaths[0];
    },
    async abrirCSV() {
      const r = await dialog.showOpenDialog(janela(), {
        title: 'Escolha o arquivo CSV de relatórios',
        properties: ['openFile'],
        filters: [{ name: 'Planilha CSV', extensions: ['csv'] }],
      });
      return r.canceled ? null : r.filePaths[0];
    },
    async salvarJSON(nomeSugerido) {
      const r = await dialog.showSaveDialog(janela(), {
        title: 'Exportar dados',
        defaultPath: nomeSugerido,
        filters: [{ name: 'Dados (JSON)', extensions: ['json'] }],
      });
      return r.canceled ? null : r.filePath;
    },
    async salvarCSV(nomeSugerido) {
      const r = await dialog.showSaveDialog(janela(), {
        title: 'Exportar resultado da pesquisa',
        defaultPath: nomeSugerido,
        filters: [{ name: 'Planilha CSV', extensions: ['csv'] }],
      });
      return r.canceled ? null : r.filePath;
    },
  };

  // ---------- dados ----------
  const pastaDadosRelatorios = path.join(ctx.pastaDados, 'dados');
  store = new Store({
    pastaDados: pastaDadosRelatorios,
    pastaBackup: lerConfig().pastaBackup || pastaBackupPadrao(),
    seedPath: path.join(ctx.pastaRecursos, 'data', 'seed.json'),
  }).iniciar();

  const handlers = criarHandlers({
    store,
    dialogo,
    versao: ctx.versao,
    pastaRecursos: ctx.pastaRecursos,
    salvarPastaBackup,
    abrirPasta: async (pasta) => {
      const erro = await shell.openPath(pasta);
      if (erro) throw new Error('Não foi possível abrir a pasta: ' + erro);
      return true;
    },
    abrirArquivo: async (arquivo) => {
      const erro = await shell.openPath(arquivo);
      if (erro) throw new Error('Não foi possível abrir o arquivo: ' + erro);
      return true;
    },
    // A atualização é do Parallello inteiro: o botão daqui só pede para ele verificar.
    verificarAtualizacoes: async () => {
      const r = await ctx.atualizacao.verificar();
      return { emDesenvolvimento: !!r.emDesenvolvimento };
    },
    baixarAtualizacao: () => ctx.atualizacao.baixar(),
    instalarAtualizacao: () => ctx.atualizacao.instalar(),
    nuvem,
  });
  for (const [nome, fn] of Object.entries(handlers)) {
    ctx.ipc.handle('api:' + nome, async (_evento, ...args) => {
      const resultado = await fn(...args);
      // Depois de qualquer ação que grava algo, reflete na nuvem (não faz nada se não houver
      // sessão de escrita, ou se nada realmente mudou — o diff cuida disso sozinho).
      if (resultado.ok && nuvem.leituraAtiva) nuvem.registrarMudancaLocal(store.db).catch(() => {});
      return resultado;
    });
  }

  if (nuvemConfigurada) {
    nuvem.iniciarSincronizacao(obterBaseLocalParaNuvem).catch(() => {
      // sem internet ou nuvem fora do ar: o programa continua funcionando só com os dados locais
    });
  }

  // Backup automático: ao abrir (feito no iniciar), a cada 10 minutos se algo mudou, e ao fechar.
  temporizadorBackup = setInterval(() => {
    try {
      store.backupSeMudou('auto');
    } catch (_) {
      /* tenta de novo no próximo ciclo */
    }
  }, INTERVALO_BACKUP_MS);

  return {
    encerrar() {
      clearInterval(temporizadorBackup);
      try {
        store.backupSeMudou('auto');
      } catch (_) {
        /* não impede de fechar */
      }
    },
  };
};
