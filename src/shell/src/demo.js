// Ponte falsa, só para ver a tela no navegador (sem Electron).
export function criarPonteDemo() {
  let estado = { versao: '1.0.0', atual: null, abas: [], erros: {}, atualizacao: { tipo: 'parado' } }
  const ouvintes = new Set()
  const mudar = (novo) => {
    estado = { ...estado, ...novo }
    ouvintes.forEach((f) => f(estado))
  }
  return {
    estado: async () => estado,
    abrir: async (id) => mudar({ atual: id, abas: estado.abas.includes(id) ? estado.abas : [...estado.abas, id] }),
    mostrar: async (id) => mudar({ atual: id }),
    fechar: async (id) => mudar({ abas: estado.abas.filter((x) => x !== id), atual: estado.atual === id ? null : estado.atual }),
    abrirPastaDados: async () => '',
    atualizacao: { verificar: async () => ({}), baixar: async () => true, instalar: async () => true },
    aoMudar: (fn) => {
      ouvintes.add(fn)
      return () => ouvintes.delete(fn)
    }
  }
}
