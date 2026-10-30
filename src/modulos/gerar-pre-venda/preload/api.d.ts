import type {
  DadosConexaoNuvem,
  ClienteErp, PedidoEnvio, PerfilConexao, PreVendaExistente, ProdutoErp, ResultadoGeracao, ResultadoPdf, ResultadoTeste
} from '../shared/tipos'

export type EstadoAtualizacao =
  | { tipo: 'verificando' }
  | { tipo: 'disponivel'; versao: string }
  | { tipo: 'baixando'; percentual: number }
  | { tipo: 'pronta'; versao: string }
  | { tipo: 'atualizado' }
  | { tipo: 'erro'; mensagem: string }

export interface PerfilOffline {
  id: string
  nome: string
  email: string
  papel: string
  ativo: boolean
  empresa_id: string | null
  empresa_nome: string
  empresa_ativa: boolean
  licenca?: unknown
}

export type RegistroFila = Record<string, unknown> & { chave_local: string; _tipo?: 'prevenda' | 'evento' }

export interface AparenciaLocal {
  empresaId: string
  empresaNome: string
  fundo: string | null
  logo: string | null
  /** 'preencher': cobre toda a área (recorta as sobras); 'inteira': mostra a imagem toda */
  ajuste?: 'preencher' | 'inteira'
  atualizadoEm: string
}

export interface Api {
  conexoes: {
    listar(): Promise<PerfilConexao[]>
    salvar(perfil: PerfilConexao, senha?: string): Promise<PerfilConexao>
    excluir(id: string): Promise<void>
    testar(perfil: PerfilConexao, senha?: string): Promise<ResultadoTeste>
    nativoDisponivel(): Promise<boolean>
    sincronizar(empresaId: string, lista: DadosConexaoNuvem[]): Promise<void>
    salvarSenha(id: string, senha: string): Promise<PerfilConexao>
    exportar(ids: string[], senhaArquivo: string): Promise<boolean>
    importar(senhaArquivo: string): Promise<number>
  }
  pdf: {
    abrir(): Promise<ResultadoPdf | null>
    lerArquivo(arquivo: File): Promise<ResultadoPdf>
  }
  erp: {
    produtos(conexaoId: string, codigos: string[]): Promise<Record<string, ProdutoErp | null>>
    cliente(conexaoId: string, cnpj: string): Promise<ClienteErp | null>
    verificarPedido(conexaoId: string, clienteCodigo: string, pedido: string): Promise<PreVendaExistente[]>
    limitePedido(conexaoId: string): Promise<number>
    status(conexaoId: string): Promise<string>
    gerar(conexaoId: string, envio: PedidoEnvio): Promise<ResultadoGeracao>
  }
  sistema: {
    estacao(): Promise<string>
  }
  aparencia: {
    ler(): Promise<AparenciaLocal | null>
    salvar(a: AparenciaLocal | null): Promise<void>
  }
  offline: {
    lembrar(email: string, senha: string, perfil: PerfilOffline): Promise<void>
    atualizarPerfil(perfil: PerfilOffline): Promise<void>
    entrar(email: string, senha: string): Promise<PerfilOffline>
    perfilPorId(id: string): Promise<PerfilOffline | null>
    esquecer(email: string): Promise<void>
  }
  fila: {
    adicionar(r: RegistroFila): Promise<number>
    listar(): Promise<RegistroFila[]>
    remover(chaves: string[]): Promise<number>
  }
  /** Login único do Parallello (a sessão é do Parallello, não do Gerar Pré-Venda). */
  parallello: {
    sessao(): Promise<SessaoParallello>
    /** Token da sessão da nuvem (null = sem internet ou entrou com a senha master sem nuvem). */
    token(): Promise<string | null>
    escolherEmpresa(id: string): Promise<unknown>
    /** Abre a configuração do Parallello (pede a senha master na tela do Parallello). */
    pedirPainel(): Promise<boolean>
    aoMudar(fn: (s: SessaoParallello) => void): () => void
  }
  atualizacao: {
    versao(): Promise<string>
    instalar(): Promise<void>
    baixar(): Promise<void>
    estadoAtual(): Promise<EstadoAtualizacao | null>
    verificar(): Promise<{ ok: boolean; erro?: string }>
    aoMudar(fn: (estado: EstadoAtualizacao) => void): () => void
  }
}

export interface SessaoParallello {
  logado: boolean
  /** nuvem | offline (sem internet) | master (só este computador) | master-nuvem */
  modo: 'nuvem' | 'offline' | 'master' | 'master-nuvem' | null
  perfil: (PerfilOffline & { usuario?: string; modulos?: string[] }) | null
  modulos: string[]
  empresaAtual: { id: string; nome: string } | null
  empresas: { id: string; nome: string }[]
  internet: boolean
  ehAdmin: boolean
  ehSuper: boolean
}

declare global {
  interface Window {
    api: Api
  }
}
