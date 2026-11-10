// Migração dos dados dos programas antigos (instalados separadamente) para o Parallello.
//
// Na primeira vez que cada sistema abre dentro do Parallello, os dados do programa antigo
// (se existirem neste computador) são COPIADOS para a pasta nova. A pasta antiga não é alterada.
//
// As senhas do SQL Server ficam cifradas pelo Windows com uma chave de cada programa,
// então as do programa antigo não podem ser lidas aqui: elas são retiradas da cópia e
// cada conexão pede a senha uma vez. Todo o resto (empresas, conexões, usuários,
// histórico, relatórios, preferências) vem junto.
import fs from 'fs';
import path from 'path';

const MARCA = '.migracao-verificada';

// Cópia recursiva feita à mão, sem sobrescrever o que já existe. Não usa fs.cpSync: no Windows,
// em algumas versões do Node 22, ele derruba o processo sem mensagem quando o caminho tem acento
// (ex.: "Gerar Pré-Venda", "Indicador Logístico").
function copiar(origem, destino) {
  const info = fs.statSync(origem);
  if (info.isDirectory()) {
    fs.mkdirSync(destino, { recursive: true });
    for (const nome of fs.readdirSync(origem)) copiar(path.join(origem, nome), path.join(destino, nome));
  } else if (info.isFile() && !fs.existsSync(destino)) {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.copyFileSync(origem, destino);
  }
}

function editarJson(arquivo, fn) {
  if (!fs.existsSync(arquivo)) return;
  try {
    const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    fs.writeFileSync(arquivo, JSON.stringify(fn(dados) ?? dados, null, 2), 'utf8');
  } catch (_) {
    /* arquivo ilegível: o próprio módulo trata */
  }
}

const REGRAS = {
  acompanhamento: {
    origens: (ad) => [path.join(ad, 'Acompanhamento de Vendas', 'dados'), path.join(ad, 'acompanhamento-vendas', 'dados')],
    temDados: (o) => fs.existsSync(path.join(o, 'dados.json')),
    copiar: (o, d) => {
      copiar(o, d);
      editarJson(path.join(d, 'dados.json'), (x) => {
        (x.empresas || []).forEach((e) => (e.bases || []).forEach((b) => {
          if (String(b.senhaCifrada || '').startsWith('ss:')) b.senhaCifrada = '';
        }));
      });
    },
  },
  'prevenda-ruptura': {
    origens: (ad) => [path.join(ad, 'Pre-Venda de Ruptura', 'dados'), path.join(ad, 'prevenda-ruptura', 'dados')],
    temDados: (o) => fs.existsSync(path.join(o, 'config.json')),
    copiar: (o, d) => {
      copiar(o, d);
      editarJson(path.join(d, 'config.json'), (x) => {
        (x.conexoes || []).forEach((c) => {
          if (String(c.senhaCripto || '').startsWith('ss:')) c.senhaCripto = '';
        });
      });
    },
  },
  'gerar-pre-venda': {
    origens: (ad) => [path.join(ad, 'Gerar Pré-Venda'), path.join(ad, 'Gerar Pre-Venda'), path.join(ad, 'gerar-pre-venda')],
    temDados: (o) => fs.existsSync(path.join(o, 'conexoes.json')) || fs.existsSync(path.join(o, 'aparencia.json')),
    copiar: (o, d) => {
      fs.mkdirSync(d, { recursive: true });
      // O acesso offline e a fila são cifrados pelo programa antigo: não vêm (basta entrar uma vez com internet).
      for (const nome of ['conexoes.json', 'aparencia.json']) {
        const arq = path.join(o, nome);
        if (fs.existsSync(arq)) fs.copyFileSync(arq, path.join(d, nome));
      }
      editarJson(path.join(d, 'conexoes.json'), (x) => {
        (x.perfis || []).forEach((p) => delete p.senhaCifrada);
      });
    },
  },
  'indicador-logistico': {
    origens: (ad) => [path.join(ad, 'Indicador Logístico', 'dados'), path.join(ad, 'Indicador Logistico', 'dados'), path.join(ad, 'indicador-logistico', 'dados')],
    temDados: (o) => fs.existsSync(path.join(o, 'usuarios.json')) || fs.existsSync(path.join(o, 'conexoes.json')),
    copiar: (o, d) => {
      copiar(o, d);
      // 'ss:' = cifrada pelo Windows com a chave do programa antigo; 'gcm:' (chave do computador) continua valendo
      editarJson(path.join(d, 'conexoes.json'), (x) => {
        (Array.isArray(x) ? x : []).forEach((c) => {
          if (String(c.senhaCripto || '').startsWith('ss:')) c.senhaCripto = '';
        });
      });
    },
  },
  'comissao-contas-recebidas': {
    // só o arquivo de dados (fechamentos e preferências); as conexões passam a ser as do Parallello
    origens: (ad) => [path.join(ad, 'Comissão por Contas Recebidas'), path.join(ad, 'Comissao por Contas Recebidas'), path.join(ad, 'comissao-contas-recebidas')],
    temDados: (o) => fs.existsSync(path.join(o, 'comissao-local.sqlite')),
    copiar: (o, d) => copiar(path.join(o, 'comissao-local.sqlite'), path.join(d, 'comissao-local.sqlite')),
  },
  'analise-credito': {
    // regras do score e decisões; as conexões passam a ser as do Parallello
    origens: (ad) => [path.join(ad, 'Analise de Credito'), path.join(ad, 'Análise de Crédito'), path.join(ad, 'analise-credito')],
    temDados: (o) => fs.existsSync(path.join(o, 'dados')),
    copiar: (o, d) => {
      for (const f of ['regras.json', 'decisoes.json']) {
        if (fs.existsSync(path.join(o, 'dados', f))) copiar(path.join(o, 'dados', f), path.join(d, 'dados', f));
      }
    },
  },
  'custo-producao': {
    // preferências e histórico; as conexões passam a ser as do Parallello
    origens: (ad) => [path.join(ad, 'Custo de Produção'), path.join(ad, 'Custo de Producao'), path.join(ad, 'custo-producao')],
    temDados: (o) => fs.existsSync(path.join(o, 'config.json')) || fs.existsSync(path.join(o, 'historico')),
    copiar: (o, d) => {
      if (fs.existsSync(path.join(o, 'historico'))) copiar(path.join(o, 'historico'), path.join(d, 'historico'));
      const cfg = (() => { try { return JSON.parse(fs.readFileSync(path.join(o, 'config.json'), 'utf8')); } catch { return null; } })();
      if (cfg && !fs.existsSync(path.join(d, 'config.json'))) {
        fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(d, 'config.json'), JSON.stringify({ versao: 3, ativaId: '', ajustes: {}, preferencias: { ...(cfg.preferencias || {}), colunaData: undefined } }, null, 2));
      }
    },
  },
  'pesquisa-relatorios': {
    origens: (ad) => [path.join(ad, 'PesquisaRelatorios')],
    temDados: (o) => fs.existsSync(path.join(o, 'dados')),
    copiar: (o, d) => {
      copiar(path.join(o, 'dados'), path.join(d, 'dados'));
      const cfg = path.join(o, 'config.json');
      if (fs.existsSync(cfg)) fs.copyFileSync(cfg, path.join(d, 'config.json'));
    },
  },
};

/** Devolve a pasta de onde os dados vieram, ou null. Nunca impede o módulo de abrir. */
export function migrarSePreciso(moduloId, pastaDados, pastaAppData) {
  fs.mkdirSync(pastaDados, { recursive: true });
  const marca = path.join(pastaDados, MARCA);
  if (fs.existsSync(marca)) return null;
  let origemUsada = null;
  const regra = REGRAS[moduloId];
  try {
    const jaTemDados = fs.readdirSync(pastaDados).length > 0;
    if (regra && !jaTemDados) {
      const origem = regra.origens(pastaAppData).find((o) => fs.existsSync(o) && regra.temDados(o));
      if (origem) {
        regra.copiar(origem, pastaDados);
        origemUsada = origem;
      }
    }
  } catch (erro) {
    console.error(`[parallello] migração de ${moduloId} falhou:`, erro);
  }
  fs.writeFileSync(marca, JSON.stringify({ em: new Date().toISOString(), origem: origemUsada }), 'utf8');
  return origemUsada;
}
