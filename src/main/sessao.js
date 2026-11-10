// Login do Parallello e módulos liberados para quem está usando.
//
// Três jeitos de entrar:
//  - nuvem:   usuário da nuvem (ex.: "joao" -> joao@parallello.app). Os módulos liberados, a
//             empresa e a licença vêm da nuvem. Depois do primeiro acesso, entra sem internet
//             por até 7 dias (modo offline, com o que foi guardado neste computador).
//  - master:  "administrador" + P@r@llell0 + data do computador (DDMMAAAA). Funciona sem internet,
//             para instalar e configurar. Com internet, também abre a sessão do super administrador
//             na nuvem (Edge Function login-master). Os módulos do administrador ficam neste computador.
//  - offline: usuário da nuvem sem internet (ver acima).
//
// Módulos em dois níveis:
//  - permitidos: o que a pessoa PODE usar. Super administrador e master: todos. Administrador da empresa:
//    os contratados pela empresa. Operador: os que o administrador permitiu na Configuração > Usuários.
//  - liberados (visíveis): o que a própria pessoa escolheu em "Liberar módulos". Só esses aparecem na
//    tela inicial. Começa vazio.
//
// Configuração do Parallello (conexões, usuários, empresas, cobrança, eventos): liberada pela senha master
// (Ctrl+Shift+B) ou ao entrar como administrador.
import fs from 'fs'
import path from 'path'
import { safeStorage } from 'electron'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import * as nuvem from './nuvem.js'
import { ehSenhaMaster, ehUsuarioMaster, dataMaster } from '../compartilhado/master.js'
import { normalizarLogin } from '../compartilhado/nuvem-config.js'
import { situacaoLicenca, hojeLocal, maisRecente, dataBR } from '../modulos/gerar-pre-venda/shared/licenca'

const DIAS_OFFLINE = 7

export function criarSessao({ pasta, catalogo, aoMudar }) {
  const arq = (n) => path.join(pasta, n)
  const idsModulos = () => catalogo.map((m) => m.id)

  // ------------------------------------------------------------ arquivos deste computador
  function lerJson(nome, padrao) {
    try {
      return JSON.parse(fs.readFileSync(arq(nome), 'utf8'))
    } catch {
      return padrao
    }
  }
  function gravarJson(nome, dados) {
    fs.mkdirSync(pasta, { recursive: true })
    const tmp = arq(nome) + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(dados, null, 2), 'utf8')
    fs.renameSync(tmp, arq(nome))
  }
  const local = () => lerJson('parallello.json', {})
  const salvarLocal = (patch) => gravarJson('parallello.json', { ...local(), ...patch })

  function lerCifrado(nome, padrao) {
    try {
      const bruto = fs.readFileSync(arq(nome))
      const txt = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(bruto) : Buffer.from(bruto.toString('utf8'), 'base64').toString('utf8')
      return JSON.parse(txt)
    } catch {
      return padrao
    }
  }
  function gravarCifrado(nome, dados) {
    fs.mkdirSync(pasta, { recursive: true })
    const txt = JSON.stringify(dados)
    const conteudo = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(txt) : Buffer.from(Buffer.from(txt, 'utf8').toString('base64'), 'utf8')
    fs.writeFileSync(arq(nome) + '.tmp', conteudo)
    fs.renameSync(arq(nome) + '.tmp', arq(nome))
  }

  // ------------------------------------------------------------ acesso sem internet
  // Guarda uma verificação da senha (scrypt com sal, nunca a senha) e o perfil, cifrados pelo Windows.
  const derivar = (senha, sal) => scryptSync(String(senha), sal, 32, { N: 16384, r: 8, p: 1 })
  function lembrarOffline(login, senha, perfil) {
    const creds = lerCifrado('acesso-offline.dat', {})
    const sal = randomBytes(16)
    creds[login] = { sal: sal.toString('base64'), hash: derivar(senha, sal).toString('base64'), perfil, validoAte: new Date(Date.now() + DIAS_OFFLINE * 86400000).toISOString() }
    gravarCifrado('acesso-offline.dat', creds)
  }
  function esquecerOffline(login) {
    const creds = lerCifrado('acesso-offline.dat', {})
    delete creds[login]
    gravarCifrado('acesso-offline.dat', creds)
  }
  function entrarOffline(login, senha) {
    const c = lerCifrado('acesso-offline.dat', {})[login]
    if (!c) throw new Error('Sem internet, e este usuário ainda não entrou neste computador com internet. Conecte-se para o primeiro acesso.')
    if (new Date(c.validoAte).getTime() < Date.now()) throw new Error(`Sem internet há mais de ${DIAS_OFFLINE} dias desde o último acesso com internet. Conecte à internet para entrar.`)
    const calc = derivar(senha, Buffer.from(c.sal, 'base64'))
    const esperado = Buffer.from(c.hash, 'base64')
    if (calc.length !== esperado.length || !timingSafeEqual(calc, esperado)) throw new Error('Usuário ou senha incorretos.')
    return c.perfil
  }

  // ------------------------------------------------------------ estado
  let s = vazio()
  function vazio() {
    return { logado: false, modo: null, perfil: null, modulos: [], permitidos: [], empresaAtual: null, empresas: [], internet: true, licenca: null, diaMaster: null, configLiberada: false }
  }

  const ehSuper = () => s.logado && (s.perfil?.papel === 'super_admin' || s.modo === 'master')
  const ehAdmin = () => ehSuper() || (s.logado && s.perfil?.papel === 'admin')
  const temNuvem = () => s.modo === 'nuvem' || s.modo === 'master-nuvem'

  /** O que a pessoa pode usar (ver cabeçalho). */
  function calcularPermitidos(perfil) {
    const todos = idsModulos()
    if (!perfil) return []
    if (perfil.papel === 'super_admin') return todos
    const contratados = Array.isArray(perfil.empresa_modulos) ? todos.filter((m) => perfil.empresa_modulos.includes(m)) : todos
    if (perfil.papel === 'admin') return contratados
    return contratados.filter((m) => (perfil.modulos ?? []).includes(m))
  }
  /** O que aparece na tela inicial: o que a pessoa liberou, dentro do permitido. */
  // Na tela inicial aparece tudo o que a pessoa liberou para si (mesmo sem permissão);
  // a permissão é conferida só na hora de abrir o módulo.
  function calcularVisiveis(escolhidos) {
    return idsModulos().filter((m) => (escolhidos ?? []).includes(m))
  }
  const modulosDoMaster = () => calcularVisiveis(local().modulosAdministrador ?? [])

  function estadoLicenca(perfil) {
    const l = perfil?.licenca
    if (!l || perfil.papel === 'super_admin') return null
    const sit = situacaoLicenca(l.vencimento, l.dias_aviso, l.dias_tolerancia, maisRecente(hojeLocal(), l.hoje))
    return { ...l, ...sit }
  }

  function motivoBloqueio(perfil) {
    if (!perfil.ativo) return 'Seu usuário está desativado. Fale com o administrador.'
    if (perfil.papel !== 'super_admin' && !perfil.empresa_id) return 'Seu usuário não está ligado a nenhuma empresa. Fale com o administrador.'
    if (perfil.papel !== 'super_admin' && !perfil.empresa_ativa) return 'Acesso da empresa suspenso. Fale com o suporte.'
    const l = estadoLicenca(perfil)
    if (l?.estado === 'bloqueada') {
      const contato = l.contato?.trim() ? ` Fale com o suporte: ${l.contato.trim()}.` : ' Fale com o suporte.'
      return `Licença vencida em ${dataBR(l.vencimento)}. O acesso foi bloqueado por falta de pagamento.${contato}`
    }
    return ''
  }

  const mudou = () => aoMudar?.(publico())

  // ------------------------------------------------------------ empresas (super administrador escolhe)
  async function carregarEmpresas() {
    if (!ehSuper() || !temNuvem()) return
    try {
      s.empresas = await nuvem.empresas()
    } catch (e) {
      if (!nuvem.ehErroDeRede(e)) throw e
    }
  }

  function definirEmpresaInicial() {
    if (s.perfil && s.perfil.papel !== 'super_admin' && s.modo !== 'master' && s.perfil.empresa_id) {
      s.empresaAtual = { id: s.perfil.empresa_id, nome: s.perfil.empresa_nome }
      return
    }
    const lembrada = local().empresa
    const naLista = s.empresas.find((e) => e.id === lembrada?.id)
    if (naLista) s.empresaAtual = { id: naLista.id, nome: naLista.nome }
    else if (s.empresas.length) s.empresaAtual = { id: s.empresas[0].id, nome: s.empresas[0].nome }
    else s.empresaAtual = lembrada?.id ? lembrada : null // sem internet: a última usada neste computador
  }

  /** Copia as conexões da empresa (nuvem) para este computador. */
  let sincronizar = async () => {}
  function aoSincronizar(fn) {
    sincronizar = fn
  }
  async function sincronizarConexoes() {
    if (!s.empresaAtual || !temNuvem()) return
    try {
      const lista = await nuvem.conexoes(s.empresaAtual.id)
      await sincronizar(s.empresaAtual.id, lista.map((c) => ({ ...c.dados, id: c.id, empresaId: s.empresaAtual.id })))
    } catch (e) {
      if (!nuvem.ehErroDeRede(e)) console.error('[parallello] conexões da nuvem:', e.message)
    }
  }

  // ------------------------------------------------------------ entrar / sair
  // Cada login ganha um número: o que termina em segundo plano só vale se a pessoa ainda estiver nele.
  let geracao = 0
  const aindaNela = (g) => g === geracao && s.logado

  async function conectarMasterNaNuvem(senha, g) {
    try {
      await nuvem.entrarMaster(senha)
      const p = await nuvem.meuPerfil()
      if (!aindaNela(g)) return
      if (p?.papel !== 'super_admin' || !p.ativo) {
        await nuvem.sair()
        return
      }
      s.modo = 'master-nuvem'
      s.internet = true
      s.perfil = { ...s.perfil, id: p.id, email: p.email ?? '' }
      await carregarEmpresas()
      if (!aindaNela(g)) return
      definirEmpresaInicial()
      mudou()
      await sincronizarConexoes()
      if (!aindaNela(g)) return
      void nuvem.registrarEvento({ acao: 'entrou', entidade: 'sessão', descricao: 'Entrou no Parallello com a senha master' }).catch(() => {})
      mudou()
    } catch (e) {
      // sem internet ou função não publicada: continua no modo master só deste computador
      console.warn('[parallello] master sem nuvem:', e.message)
    }
  }

  /** Empresas e conexões da nuvem depois que a pessoa já entrou (não segura a tela de login). */
  async function completarEmSegundoPlano(g) {
    try {
      await carregarEmpresas()
      if (!aindaNela(g)) return
      definirEmpresaInicial()
      mudou()
      await sincronizarConexoes()
      if (aindaNela(g)) mudou()
    } catch (e) {
      console.warn('[parallello] dados da nuvem depois do login:', e.message)
    }
  }

  async function entrar(usuario, senha) {
    const login = normalizarLogin(usuario)
    if (!login) throw new Error('Informe o usuário.')
    if (!senha) throw new Error('Informe a senha.')
    await sair(false)

    // -------- master: entra na hora (só deste computador) e liga a nuvem em segundo plano
    if (ehUsuarioMaster(login)) {
      if (!ehSenhaMaster(senha)) throw new Error('Usuário ou senha incorretos.')
      s = {
        ...vazio(),
        logado: true,
        modo: 'master',
        perfil: { id: 'master', nome: 'Administrador', usuario: 'administrador', email: '', papel: 'super_admin', ativo: true, empresa_id: null, empresa_nome: '', empresa_ativa: true },
        permitidos: idsModulos(),
        modulos: modulosDoMaster(),
        internet: false,
        diaMaster: dataMaster(),
        configLiberada: true, // entrou como administrador: a configuração já abre junto
      }
      definirEmpresaInicial()
      salvarLocal({ ultimoUsuario: 'administrador' })
      const sessaoAtual = ++geracao
      mudou()
      void conectarMasterNaNuvem(senha, sessaoAtual)
      return publico()
    }

    // -------- usuário da nuvem
    let perfil
    let modo = 'nuvem'
    try {
      await nuvem.entrar(login, senha)
      perfil = await nuvem.meuPerfil()
      if (!perfil) throw new Error('Perfil do usuário não encontrado na nuvem. Fale com o administrador.')
      const motivo = motivoBloqueio(perfil)
      if (motivo) {
        esquecerOffline(login)
        await nuvem.sair()
        throw new Error(motivo)
      }
      lembrarOffline(login, senha, perfil)
    } catch (e) {
      if (!nuvem.ehErroDeRede(e)) throw e
      perfil = entrarOffline(login, senha) // sem internet: o que foi guardado neste computador
      const motivo = motivoBloqueio(perfil)
      if (motivo) throw new Error(motivo)
      modo = 'offline'
    }
    const permitidos = calcularPermitidos(perfil)
    s = { ...vazio(), logado: true, modo, perfil, permitidos, modulos: calcularVisiveis(perfil.modulos_visiveis), internet: modo === 'nuvem', licenca: estadoLicenca(perfil) }
    definirEmpresaInicial()
    salvarLocal({ ultimoUsuario: login })
    const sessaoAtual = ++geracao
    if (modo === 'nuvem') void nuvem.registrarEvento({ acao: 'entrou', entidade: 'sessão', descricao: 'Entrou no Parallello' }).catch(() => {})
    mudou()
    // empresas (super administrador) e conexões da empresa chegam logo depois, sem segurar o login
    if (modo === 'nuvem') void completarEmSegundoPlano(sessaoAtual)
    return publico()
  }

  async function sair(avisar = true) {
    if (s.logado && temNuvem()) {
      await nuvem.registrarEvento({ acao: 'saiu', entidade: 'sessão', descricao: 'Saiu do Parallello' }).catch(() => {})
      await nuvem.sair()
    }
    geracao++
    s = vazio()
    if (avisar) mudou()
  }

  /** Relê o perfil da nuvem (módulos liberados podem ter mudado). */
  async function atualizar() {
    if (!s.logado) return publico()
    if (s.modo === 'nuvem') {
      try {
        const p = await nuvem.meuPerfil()
        if (p) {
          const motivo = motivoBloqueio(p)
          if (motivo) {
            await sair()
            throw new Error(motivo)
          }
          s.perfil = p
          s.permitidos = calcularPermitidos(p)
          s.modulos = calcularVisiveis(p.modulos_visiveis)
          s.licenca = estadoLicenca(p)
          s.internet = true
        }
      } catch (e) {
        if (!nuvem.ehErroDeRede(e)) throw e
        s.internet = false
      }
    }
    if (s.modo === 'master' || s.modo === 'master-nuvem') {
      if (s.diaMaster !== dataMaster()) {
        await sair()
        throw new Error('A senha master vale só no dia em que foi usada. Entre de novo.')
      }
      s.modulos = modulosDoMaster()
    }
    await carregarEmpresas()
    mudou()
    return publico()
  }

  async function escolherEmpresa(id) {
    if (!ehSuper()) throw new Error('Só o super administrador troca de empresa.')
    const e = s.empresas.find((x) => x.id === id)
    if (!e) throw new Error('Empresa não encontrada.')
    s.empresaAtual = { id: e.id, nome: e.nome }
    salvarLocal({ empresa: s.empresaAtual })
    await sincronizarConexoes()
    mudou()
    return publico()
  }

  // ------------------------------------------------------------ "Liberar módulos": cada um escolhe os seus
  async function definirMeusModulos(modulos) {
    if (!s.logado) throw new Error('Entre no Parallello.')
    // pode liberar qualquer módulo para a própria tela; o acesso é conferido ao abrir
    const pedidos = [...new Set(modulos ?? [])].filter((m) => idsModulos().includes(m))
    if (s.modo?.startsWith('master')) {
      salvarLocal({ modulosAdministrador: pedidos })
      s.modulos = modulosDoMaster()
    } else if (s.modo === 'nuvem') {
      const r = await nuvem.definirMeusModulos(pedidos)
      s.perfil = { ...s.perfil, modulos_visiveis: r }
      s.modulos = calcularVisiveis(r)
      lembrarPerfilOffline()
    } else {
      throw new Error('Sem internet: a escolha dos módulos é salva na nuvem. Tente de novo com internet.')
    }
    mudou()
    return s.modulos
  }
  function lembrarPerfilOffline() {
    const login = normalizarLogin(s.perfil?.usuario || s.perfil?.email)
    const creds = lerCifrado('acesso-offline.dat', {})
    if (creds[login]) {
      creds[login].perfil = s.perfil
      gravarCifrado('acesso-offline.dat', creds)
    }
  }

  // ------------------------------------------------------------ configuração (senha master)
  function liberarConfig(senha) {
    if (!s.logado) throw new Error('Entre no Parallello primeiro.')
    if (!ehSenhaMaster(senha)) throw new Error('Senha master incorreta.')
    s.configLiberada = true
    mudou()
    return true
  }
  function fecharConfig() {
    s.configLiberada = false
    mudou()
  }
  function exigirConfig() {
    if (!s.logado || !s.configLiberada) throw new Error('Configuração bloqueada. Pressione Ctrl+Shift+B na tela inicial.')
  }
  function exigirNuvem() {
    if (!temNuvem()) throw new Error(s.modo === 'master' ? 'Sem conexão com a nuvem: entre com internet para alterar usuários, empresas e cobrança.' : 'Sem internet: esta parte da configuração precisa da nuvem.')
  }

  async function listarUsuarios() {
    exigirConfig()
    exigirNuvem()
    const empresaId = s.empresaAtual?.id ?? null
    if (!empresaId) return { usuarios: [], contratados: null }
    const lista = (await nuvem.usuarios(empresaId)).filter((u) => u.papel !== 'super_admin')
    const contratados = s.empresas.find((e) => e.id === empresaId)?.modulos ?? s.perfil?.empresa_modulos ?? null
    return { usuarios: lista, contratados }
  }

  /** Permissão de módulos de um usuário (Configuração > Usuários). */
  async function definirModulos(usuarioId, modulos) {
    exigirConfig()
    exigirNuvem()
    const r = await nuvem.definirModulos(usuarioId, (modulos ?? []).filter((m) => idsModulos().includes(m)))
    if (usuarioId === s.perfil?.id) await atualizar()
    return r
  }

  async function definirModulosEmpresa(empresaId, modulos) {
    exigirConfig()
    exigirNuvem()
    if (!ehSuper()) throw new Error('Apenas o super administrador define os módulos contratados.')
    const r = await nuvem.definirModulosEmpresa(empresaId, modulos === null ? null : modulos.filter((m) => idsModulos().includes(m)))
    await carregarEmpresas()
    mudou()
    return r
  }

  async function criarUsuario(d) {
    exigirConfig()
    exigirNuvem()
    if (!s.empresaAtual) throw new Error('Escolha a empresa.')
    if (ehUsuarioMaster(d.usuario)) throw new Error('"administrador" é reservado para a senha master.')
    const papel = d.papel === 'admin' ? 'admin' : 'operador'
    return nuvem.criarUsuario({ usuario: d.usuario, senha: d.senha, nome: d.nome, papel, empresaId: s.empresaAtual.id, modulos: d.modulos ?? [] })
  }
  async function alterarUsuario(id, d) {
    exigirConfig()
    exigirNuvem()
    return nuvem.alterarUsuario(id, d)
  }
  async function trocarSenha(id, senha) {
    exigirConfig()
    exigirNuvem()
    if (!senha || senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.')
    return nuvem.trocarSenha(id, senha)
  }

  /** Chamada da nuvem para a configuração: confere a liberação e a internet antes. */
  async function naConfig(fn, { soSuper = false } = {}) {
    exigirConfig()
    exigirNuvem()
    if (soSuper && !ehSuper()) throw new Error('Apenas o super administrador.')
    return fn()
  }

  // ------------------------------------------------------------ o que as telas enxergam
  function publico() {
    return {
      logado: s.logado,
      modo: s.modo,
      perfil: s.perfil,
      modulos: s.modulos,
      permitidos: s.permitidos,
      configLiberada: s.configLiberada,
      empresaAtual: s.empresaAtual,
      empresas: ehSuper() ? s.empresas.map((e) => ({ id: e.id, nome: e.nome, ativa: e.ativa, modulos: e.modulos ?? null })) : [],
      internet: s.internet,
      ehAdmin: ehAdmin(),
      ehSuper: ehSuper(),
      licenca: s.licenca,
      ultimoUsuario: local().ultimoUsuario ?? '',
    }
  }

  /** Para os sistemas: quem está usando e de qual empresa. */
  function usuarioParaModulo() {
    if (!s.logado) return null
    return {
      id: s.perfil.id,
      nome: s.perfil.nome,
      usuario: s.perfil.usuario || s.perfil.email,
      papel: s.modo?.startsWith('master') ? 'master' : s.perfil.papel,
      ehAdmin: ehAdmin(),
      ehSuper: ehSuper(),
      empresa: s.empresaAtual,
    }
  }

  return {
    entrar,
    sair,
    atualizar,
    escolherEmpresa,
    publico,
    usuarioParaModulo,
    podeAbrir: (id) => s.logado && s.permitidos.includes(id),
    estaNaTela: (id) => s.logado && s.modulos.includes(id),
    definirMeusModulos,
    liberarConfig,
    fecharConfig,
    exigirConfig,
    naConfig,
    carregarEmpresas: async () => { await carregarEmpresas(); mudou() },
    logado: () => s.logado,
    temNuvem,
    ehAdmin,
    ehSuper,
    empresaAtual: () => s.empresaAtual,
    aoSincronizar,
    sincronizarConexoes,
    listarUsuarios,
    definirModulos,
    definirModulosEmpresa,
    criarUsuario,
    alterarUsuario,
    trocarSenha,
    token: () => (temNuvem() ? nuvem.token() : Promise.resolve(null)),
  }
}
