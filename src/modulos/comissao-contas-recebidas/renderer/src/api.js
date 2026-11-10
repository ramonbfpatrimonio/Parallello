async function call(canal, ...args) {
  if (!window.api) throw new Error('Este sistema precisa ser aberto pelo aplicativo (Electron).');
  const r = await window.api.invoke(canal, ...args);
  if (!r || !r.ok) throw new Error((r && r.erro) || 'Erro desconhecido');
  return r.data;
}

export const api = {
  liberarSistema: (senha) => call('sistema:liberar', senha),
  conexoes: {
    listar: () => call('conexoes:listar'),
    salvar: (c) => call('conexoes:salvar', c),
    excluir: (id) => call('conexoes:excluir', id),
    padrao: (id) => call('conexoes:padrao', id),
    testar: (c) => call('conexoes:testar', c)
  },
  vendedores: (conexaoId, atualizar = false) => call('vendedores:listar', conexaoId, atualizar),
  fabricantes: (conexaoId) => call('fabricantes:listar', conexaoId),
  relatorio: (conexaoId, filtros) => call('relatorio:buscar', conexaoId, filtros),
  comissoes: {
    carregar: (conexaoId, f) => call('comissoes:carregar', conexaoId, f),
    previa: (conexaoId, f) => call('comissoes:previa', conexaoId, f),
    salvar: (conexaoId, f) => call('comissoes:salvar', conexaoId, f),
    excluir: (conexaoId, f) => call('comissoes:excluir', conexaoId, f)
  },
  fechamentos: {
    listar: () => call('fechamentos:listar'),
    obter: (id) => call('fechamentos:obter', id),
    salvar: (resultado, observacao) => call('fechamentos:salvar', { resultado, observacao }),
    excluir: (id) => call('fechamentos:excluir', id)
  },
  exportar: {
    excel: (resultado, opts) => call('exportar:excel', resultado, opts),
    pdf: (resultado, opts) => call('exportar:pdf', resultado, opts),
    imprimir: (resultado, opts) => call('exportar:imprimir', resultado, opts)
  },
  config: {
    obter: (chave, padrao) => call('config:obter', chave, padrao),
    definir: (chave, valor) => call('config:definir', chave, valor)
  },
  sessao: () => call('sessao:info'),
  backup: {
    info: () => call('backup:info'),
    exportar: () => call('backup:exportar'),
    restaurar: () => call('backup:restaurar')
  }
};
