// Ponte falsa, só para ver a tela no navegador (sem Electron): npm run dev e abra /shell/index.html
export function criarPonteDemo() {
  const sessaoVazia = { logado: false, ultimoUsuario: 'administrador' }
  let estado = { versao: '1.0.0', atual: null, abas: [], erros: {}, atualizacao: /atualizacao/.test(location.search) ? { tipo: 'disponivel', versao: '1.0.6' } : { tipo: 'parado' }, sessao: sessaoVazia }
  let usuarios = [
    { id: 'master', nome: 'Administrador (senha master)', usuario: 'administrador', papel: 'master', ativo: true, modulos: [], local: true },
    { id: 'u1', nome: 'Deyse Lima', usuario: 'deyse', papel: 'admin', ativo: true, modulos: ['gerar-pre-venda'] },
    { id: 'u2', nome: 'João Souza', usuario: 'joao', papel: 'operador', ativo: true, modulos: [] }
  ]
  const ouvintes = new Set()
  const mudar = (novo) => {
    estado = { ...estado, ...novo }
    ouvintes.forEach((f) => f(estado))
  }
  const ouvir = () => () => () => undefined // eventos que não acontecem na demonstração
  return {
    estado: async () => estado,
    entrar: async (u) =>
      u === 'joao'
        ? mudar({ sessao: { logado: true, modo: 'nuvem', perfil: { nome: 'João Souza', usuario: 'joao', papel: 'operador' }, modulos: [], permitidos: ['acompanhamento', 'pesquisa-relatorios'], configLiberada: false, empresaAtual: { id: 'e1', nome: 'Hage' }, empresas: [], ehAdmin: false, ehSuper: false, internet: true } })
        : mudar({ sessao: { logado: true, modo: 'master', perfil: { nome: 'Administrador', usuario: u, papel: 'super_admin' }, modulos: [], permitidos: ['gerar-pre-venda', 'prevenda-ruptura', 'acompanhamento', 'pesquisa-relatorios', 'indicador-logistico', 'comissao-contas-recebidas'], configLiberada: true, empresaAtual: { id: 'e1', nome: 'Hage' }, empresas: [{ id: 'e1', nome: 'Hage', modulos: null }], ehAdmin: true, ehSuper: true, internet: false } }),
    definirMeusModulos: async (m) => mudar({ sessao: { ...estado.sessao, modulos: m } }),
    sair: async () => mudar({ sessao: sessaoVazia, abas: [], atual: null }),
    abrir: async (id) => {
      if (!estado.sessao.permitidos.includes(id)) return { ok: false, mensagem: `Você não tem acesso ao módulo ${id}. Sem licença para este módulo.` }
      mudar({ atual: id, abas: estado.abas.includes(id) ? estado.abas : [...estado.abas, id] })
      return { ok: true }
    },
    mostrar: async (id) => mudar({ atual: id }),
    fechar: async (id) => mudar({ abas: estado.abas.filter((x) => x !== id), atual: estado.atual === id ? null : estado.atual }),
    cobrir: async () => undefined,
    abrirPastaDados: async () => '',
    atualizarSessao: async () => estado.sessao,
    escolherEmpresa: async () => estado.sessao,
    config: {
      abrir: async () => mudar({ sessao: { ...estado.sessao, configLiberada: true } }),
      fechar: async () => mudar({ sessao: { ...estado.sessao, configLiberada: false } }),
      usuarios: async () => ({ usuarios: usuarios.filter((u) => !u.local), contratados: null }),
      definirModulos: async (id, m) => { usuarios = usuarios.map((u) => (u.id === id ? { ...u, modulos: m } : u)) },
      criarUsuario: async () => undefined,
      alterarUsuario: async () => undefined,
      trocarSenha: async () => undefined,
      empresas: async () => [{ id: 'e1', nome: 'Hage', cnpj: '', ativa: true, retencao_meses: 24, usuarios: 3, prevendas_mes: 12, total_mes: 45000 }],
      cobrancaConfig: async () => ({ dias_aviso: 5, dias_tolerancia: 3, contato: '' }),
      cobrancaEmpresas: async () => [{ id: 'e1', nome: 'Hage', licenca_valor: 450, licenca_ciclo_meses: 1, licenca_vencimento: '2026-11-05', licenca_obs: '', ultimo_pagamento: '2026-10-05' }],
      eventos: async () => [],
      conexoes: async () => ({ empresa: { id: 'e1', nome: 'Hage' }, nuvem: false, perfis: [], locais: [], nativo: false })
    },
    atualizacao: {
      verificar: async () => ({}),
      baixar: async () => {
        let p = 0
        const t = setInterval(() => {
          p += 20
          mudar({ atualizacao: p >= 100 ? { tipo: 'pronta', versao: '1.0.6' } : { tipo: 'baixando', percentual: p, versao: '1.0.6' } })
          if (p >= 100) clearInterval(t)
        }, 300)
        return true
      },
      instalar: async () => true,
    },
    aoMudar: (fn) => {
      ouvintes.add(fn)
      return () => ouvintes.delete(fn)
    },
    aoPedirMaster: ouvir(),
    aoAviso: ouvir()
  }
}
