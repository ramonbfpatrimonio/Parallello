import React, { useCallback, useEffect, useRef, useState } from 'react'
import { CATALOGO } from '../../modulos/catalogo.js'
import { ICONES } from './icones.js'
import marca from './assets/marca.svg'
import { Login } from './Login.jsx'
import { LiberarModulos } from './LiberarModulos.jsx'
import { Configuracao } from './config/Configuracao.jsx'
import { Preloader } from './Preloader.jsx'
import { Modal } from './Modal.jsx'
import { mensagem, NOME_PAPEL } from './util.js'
import { aplicarTema, gravarVisao, lerTema, lerVisao } from './preferencias.js'

const api = () => window.parallello

function saudacao(agora = new Date()) {
  const h = agora.getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function dataPorExtenso(agora = new Date()) {
  const t = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0]

export function App() {
  const [estado, setEstado] = useState(null)
  const [abertura, setAbertura] = useState(true)
  const [pagina, setPagina] = useState('inicio') // 'inicio' | 'modulos' | 'config' (quando nenhum sistema está à frente)
  const [semAcesso, setSemAcesso] = useState(null)
  const [pedirMaster, setPedirMaster] = useState(false)
  const [avisos, setAvisos] = useState([])
  const seq = useRef(0)

  const avisar = useCallback((texto, tipo = 'ok') => {
    const id = ++seq.current
    setAvisos((l) => [...l, { id, texto, tipo }])
    setTimeout(() => setAvisos((l) => l.filter((a) => a.id !== id)), tipo === 'erro' ? 8000 : 3500)
  }, [])

  useEffect(() => {
    api().estado().then(setEstado)
    const tirar = [
      api().aoMudar(setEstado),
      api().aoPedirMaster(() => setPedirMaster(true)),
      api().aoAviso((t) => avisar(t, 'erro')),
    ]
    return () => tirar.forEach((f) => f())
  }, [avisar])

  const logado = !!estado?.sessao?.logado
  const configLiberada = !!estado?.sessao?.configLiberada
  const terminarAbertura = useCallback(() => setAbertura(false), [])

  // Ctrl+Shift+B na tela do Parallello: configuração (senha master)
  useEffect(() => {
    const tecla = (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'B' || e.key === 'b' || e.code === 'KeyB')) {
        e.preventDefault()
        if (!logado) return
        if (configLiberada) {
          setPagina('config')
          void api().mostrar(null)
        } else setPedirMaster(true)
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [logado, configLiberada])

  // configuração liberada (senha master ou entrou como administrador): abre junto; trancou: volta ao início
  useEffect(() => {
    if (configLiberada) {
      setPagina('config')
      void api().mostrar(null)
    } else setPagina((p) => (p === 'config' ? 'inicio' : p))
  }, [configLiberada])

  useEffect(() => {
    if (!logado) setPagina('inicio')
  }, [logado])

  // pedido de configuração vindo de um sistema (Ctrl+Shift+B dentro do Gerar): já liberada, só mostra
  useEffect(() => {
    if (pedirMaster && configLiberada) {
      setPedirMaster(false)
      setPagina('config')
    }
  }, [pedirMaster, configLiberada])

  if (abertura) return <Preloader aoTerminar={terminarAbertura} />
  if (!estado) return null
  if (!logado)
    return (
      <>
        <Login ultimoUsuario={estado.sessao?.ultimoUsuario} versao={estado.versao} />
        <AvisoAtualizacao a={estado.atualizacao} atual={estado.versao} />
      </>
    )

  const sessao = estado.sessao
  const abrir = async (id) => {
    const r = await api().abrir(id)
    if (r && !r.ok && r.mensagem) setSemAcesso(r.mensagem)
  }
  const irPara = (p) => {
    setPagina(p)
    void api().mostrar(null)
  }

  return (
    <div className="app">
      <Barra estado={estado} pagina={pagina} irPara={irPara} />
      {pagina === 'config' && configLiberada ? (
        <Configuracao sessao={sessao} avisar={avisar} />
      ) : pagina === 'modulos' ? (
        <LiberarModulos sessao={sessao} avisar={avisar} aoSalvar={() => irPara('inicio')} />
      ) : (
        <Inicio estado={estado} abrir={abrir} irPara={irPara} />
      )}

      {semAcesso && (
        <Modal titulo="Sem acesso" aoFechar={() => setSemAcesso(null)} rodape={<button className="botao primario" onClick={() => setSemAcesso(null)} autoFocus>Entendi</button>}>
          <p>{semAcesso}</p>
        </Modal>
      )}
      {pedirMaster && <SenhaMaster aoFechar={() => setPedirMaster(false)} />}
      <AvisoAtualizacao a={estado.atualizacao} atual={estado.versao} />

      <div className="avisos" role="status" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`aviso ${a.tipo}`}>{a.texto}</div>
        ))}
      </div>
    </div>
  )
}

function SenhaMaster({ aoFechar }) {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  async function entrar(e) {
    e.preventDefault()
    try {
      await api().config.abrir(senha)
      aoFechar()
    } catch (err) {
      setErro(mensagem(err))
      setSenha('')
    }
  }
  return (
    <Modal
      titulo="Configuração do Parallello"
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="botao" onClick={aoFechar}>Cancelar</button>
          <button className="botao primario" form="f-master">Abrir</button>
        </>
      }
    >
      <form id="f-master" onSubmit={entrar} className="formulario">
        <p>Conexão com o banco, usuários, empresas, cobrança e eventos. Digite a senha master.</p>
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus aria-label="Senha master" />
        {erro && <p className="erro">{erro}</p>}
      </form>
    </Modal>
  )
}

function Barra({ estado, pagina, irPara }) {
  const sessao = estado.sessao
  const noInicio = estado.atual === null && pagina === 'inicio'
  const naLiberacao = estado.atual === null && pagina === 'modulos'
  const naConfig = estado.atual === null && pagina === 'config'
  return (
    <header className="barra">
      <button className={'barra-marca' + (noInicio ? ' ativa' : '')} onClick={() => irPara('inicio')} title="Tela inicial (Ctrl+Tab alterna entre as abas)">
        <img src={marca} alt="" className="barra-marca-icone" />
        <span className="barra-marca-nome">Parallello</span>
      </button>

      <button className={'barra-item' + (naLiberacao ? ' ativa' : '')} onClick={() => irPara('modulos')}>
        Liberar módulos
      </button>
      {sessao.configLiberada && (
        <button className={'barra-item' + (naConfig ? ' ativa' : '')} onClick={() => irPara('config')}>
          Configuração
        </button>
      )}

      <nav className="abas" aria-label="Sistemas abertos">
        {estado.abas.map((id) => {
          const m = CATALOGO.find((x) => x.id === id) ?? { id, nome: 'Configuração', cor: '#f0b43c' }
          const ativa = estado.atual === id
          return (
            <div key={id} className={'aba' + (ativa ? ' ativa' : '')} style={{ '--cor': m.cor }}>
              <button className="aba-abrir" onClick={() => api().mostrar(id)} aria-current={ativa ? 'page' : undefined}>
                {ICONES[id] ? <img src={ICONES[id]} alt="" /> : <span className="aba-cadeado" aria-hidden="true" />}
                <span>{m.nome}</span>
              </button>
              <button className="aba-fechar" onClick={() => api().fechar(id)} title={`Fechar ${m.nome}`} aria-label={`Fechar ${m.nome}`}>
                <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" /></svg>
              </button>
            </div>
          )
        })}
      </nav>

      <Situacao sessao={sessao} />
      <Atualizacao a={estado.atualizacao} />
      <Usuario sessao={sessao} />
    </header>
  )
}

function Situacao({ sessao }) {
  const l = sessao.licenca
  if (sessao.modo === 'offline') return <span className="pilula" title="Entrou com o acesso guardado neste computador">Sem internet</span>
  if (sessao.modo === 'master') return <span className="pilula" title="Senha master sem conexão com a nuvem">Master, sem nuvem</span>
  if (l?.estado === 'vencendo') return <span className="pilula alerta">Licença vence em {l.dias} dia{l.dias === 1 ? '' : 's'}</span>
  if (l?.estado === 'atrasada') return <span className="pilula alerta">Licença vencida: regularize para não bloquear</span>
  return null
}

function Usuario({ sessao }) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef(null)
  useEffect(() => {
    if (!aberto) return
    api().cobrir(true)
    const fora = (e) => caixa.current && !caixa.current.contains(e.target) && setAberto(false)
    window.addEventListener('mousedown', fora)
    return () => {
      window.removeEventListener('mousedown', fora)
      api().cobrir(false)
    }
  }, [aberto])
  const p = sessao.perfil
  const papel = sessao.modo?.startsWith('master') ? 'master' : p?.papel
  return (
    <div className="usuario" ref={caixa}>
      <button className="usuario-botao" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}>
        <span className="usuario-avatar" aria-hidden="true">{primeiroNome(p?.nome).charAt(0).toUpperCase()}</span>
        <span className="usuario-textos">
          <b>{primeiroNome(p?.nome)}</b>
          <small>{sessao.empresaAtual?.nome ?? NOME_PAPEL[papel]}</small>
        </span>
      </button>
      {aberto && (
        <div className="usuario-menu" role="menu">
          <div className="usuario-menu-cabeca">
            <b>{p?.nome}</b>
            <small>{p?.usuario} · {NOME_PAPEL[papel] ?? papel}</small>
          </div>
          {sessao.ehSuper && sessao.empresas.length > 0 && (
            <label className="campo">
              <span className="campo-rotulo">Empresa</span>
              <select
                value={sessao.empresaAtual?.id ?? ''}
                onChange={async (e) => {
                  await api().escolherEmpresa(e.target.value)
                  setAberto(false)
                }}
              >
                {sessao.empresas.map((e) => (
                  <option key={e.id} value={e.id}>{e.nome}</option>
                ))}
              </select>
            </label>
          )}
          <InterruptorTema />
          {sessao.ehAdmin && (
            <>
              <button className="usuario-menu-item" role="menuitem" onClick={() => api().atualizarSessao().then(() => setAberto(false))}>
                Atualizar permissões
              </button>
              <button className="usuario-menu-item" role="menuitem" onClick={() => api().abrirPastaDados()}>
                Abrir a pasta de dados
              </button>
            </>
          )}
          <button className="usuario-menu-item sair" role="menuitem" onClick={() => api().sair()}>
            Sair do Parallello
          </button>
        </div>
      )}
    </div>
  )
}

function InterruptorTema() {
  const [tema, setTema] = useState(lerTema)
  const escuro = tema === 'escuro'
  function trocar() {
    const novo = escuro ? 'claro' : 'escuro'
    aplicarTema(novo)
    setTema(novo)
  }
  return (
    <button className="usuario-menu-item tema" role="menuitemcheckbox" aria-checked={escuro} onClick={trocar}>
      <span>Tema {escuro ? 'escuro' : 'claro'}</span>
      <span className={'interruptor' + (escuro ? ' ligado' : '')} aria-hidden="true">
        <svg className="interruptor-sol" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" /></svg>
        <svg className="interruptor-lua" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
        <span className="interruptor-bola" />
      </span>
    </button>
  )
}

/**
 * Aviso de atualização no meio da tela, por cima de tudo (inclusive dos sistemas abertos).
 * "Depois" esconde até a próxima etapa (quando terminar de baixar, ele aparece de novo).
 */
function AvisoAtualizacao({ a, atual }) {
  const [dispensado, setDispensado] = useState(null)
  const [erro, setErro] = useState(null)
  const chave = `${a?.tipo}:${a?.versao}`
  const visivel = ['disponivel', 'baixando', 'pronta'].includes(a?.tipo) && dispensado !== chave
  useEffect(() => {
    if (!visivel) return
    api().cobrir(true)
    return () => api().cobrir(false)
  }, [visivel])
  if (!visivel) return null
  const depois = () => setDispensado(chave)
  const executar = async (fn) => {
    setErro(null)
    try {
      await fn()
    } catch (e) {
      setErro(mensagem(e))
    }
  }
  return (
    <div className="atualizar-fundo">
      <div className="atualizar" role="alertdialog" aria-modal="true" aria-labelledby="atualizar-titulo">
        <img src={marca} alt="" className="atualizar-marca" />
        {a.tipo === 'disponivel' && (
          <>
            <h2 id="atualizar-titulo">Nova versão do Parallello</h2>
            <p>A versão <b>{a.versao}</b> está disponível{atual ? <> (você está na {atual})</> : null}. Atualize para receber as correções e novidades.</p>
            <div className="atualizar-acoes">
              <button className="botao" onClick={depois}>Depois</button>
              <button className="botao primario" onClick={() => executar(() => api().atualizacao.baixar())} autoFocus>Atualizar agora</button>
            </div>
          </>
        )}
        {a.tipo === 'baixando' && (
          <>
            <h2 id="atualizar-titulo">Baixando a versão {a.versao}</h2>
            <div className="atualizar-barra"><span style={{ width: `${a.percentual}%` }} /></div>
            <p className="atualizar-pct">{a.percentual}%</p>
            <div className="atualizar-acoes">
              <button className="botao" onClick={depois}>Continuar usando enquanto baixa</button>
            </div>
          </>
        )}
        {a.tipo === 'pronta' && (
          <>
            <h2 id="atualizar-titulo">Atualização pronta</h2>
            <p>A versão <b>{a.versao}</b> foi baixada. O Parallello fecha, instala e abre de novo em poucos segundos.</p>
            <div className="atualizar-acoes">
              <button className="botao" onClick={depois}>Depois (instala ao fechar)</button>
              <button className="botao primario" onClick={() => executar(() => api().atualizacao.instalar())} autoFocus>Reiniciar e atualizar</button>
            </div>
          </>
        )}
        {erro && <p className="erro">{erro}</p>}
      </div>
    </div>
  )
}

function Atualizacao({ a }) {
  if (a.tipo === 'disponivel') {
    return (
      <button className="pilula destaque" onClick={() => api().atualizacao.baixar()} title="Baixa em segundo plano; dá para continuar usando">
        Atualizar para {a.versao}
      </button>
    )
  }
  if (a.tipo === 'baixando') {
    return (
      <span className="pilula" role="status">
        <span className="pilula-barra"><span style={{ width: `${a.percentual}%` }} /></span>
        Baixando {a.percentual}%
      </span>
    )
  }
  if (a.tipo === 'pronta') {
    return (
      <button className="pilula destaque" onClick={() => api().atualizacao.instalar()} title="Fecha, instala e abre de novo em poucos segundos">
        Reiniciar e atualizar para {a.versao}
      </button>
    )
  }
  return null
}

const ICONES_VISAO = {
  grande: <svg viewBox="0 0 20 20"><rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.5" /><rect x="11" y="2.5" width="6.5" height="6.5" rx="1.5" /><rect x="2.5" y="11" width="6.5" height="6.5" rx="1.5" /><rect x="11" y="11" width="6.5" height="6.5" rx="1.5" /></svg>,
  medio: <svg viewBox="0 0 20 20">{[2.5, 8.25, 14].flatMap((y) => [2.5, 8.25, 14].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="3.5" height="3.5" rx="0.8" />))}</svg>,
  lista: <svg viewBox="0 0 20 20"><rect x="2.5" y="3" width="3" height="3" rx="0.8" /><rect x="2.5" y="8.5" width="3" height="3" rx="0.8" /><rect x="2.5" y="14" width="3" height="3" rx="0.8" /><path d="M8 4.5h9.5M8 10h9.5M8 15.5h9.5" /></svg>,
}
const NOMES_VISAO = { grande: 'Ícones grandes', medio: 'Ícones médios', lista: 'Lista' }

function Inicio({ estado, abrir, irPara }) {
  const agora = new Date()
  const sessao = estado.sessao
  const [visao, setVisao] = useState(lerVisao)
  const liberados = new Set(sessao.modulos)
  const abertos = new Set(estado.abas)
  const visiveis = CATALOGO.filter((m) => liberados.has(m.id))
  const mudarVisao = (v) => {
    setVisao(v)
    gravarVisao(v)
  }
  return (
    <main className="inicio">
      <div className="inicio-topo">
        <section className="cabeca">
          <h1>{saudacao(agora)}, {primeiroNome(sessao.perfil?.nome)}.</h1>
          <p className="cabeca-data">{dataPorExtenso(agora)}</p>
          <p className="cabeca-texto">
            {visiveis.length === 0
              ? 'Nenhum sistema liberado ainda. Abra "Liberar módulos" e marque os sistemas que você usa.'
              : 'Escolha um sistema. Os que você abrir ficam nas abas lá em cima, cada um do jeito que você deixou.'}
          </p>
          {visiveis.length === 0 && (
            <button className="botao primario" onClick={() => irPara('modulos')}>Liberar módulos</button>
          )}
        </section>
        {visiveis.length > 0 && (
          <div className="visao" role="radiogroup" aria-label="Ver os módulos como">
            {Object.keys(ICONES_VISAO).map((v) => (
              <button key={v} role="radio" aria-checked={visao === v} className={visao === v ? 'ativo' : ''} onClick={() => mudarVisao(v)} title={NOMES_VISAO[v]} aria-label={NOMES_VISAO[v]}>
                {ICONES_VISAO[v]}
              </button>
            ))}
          </div>
        )}
      </div>

      {visiveis.length > 0 && (
        <ul className={`cards visao-${visao}`}>
          {visiveis.map((m) => {
            const aberto = abertos.has(m.id)
            const erro = estado.erros[m.id]
            return (
              <li key={m.id}>
                <button className="card" style={{ '--cor': m.cor }} onClick={() => abrir(m.id)} disabled={!!erro} title={visao === 'lista' ? undefined : m.descricao}>
                  <span className="card-logo">
                    <img src={ICONES[m.id]} alt="" />
                  </span>
                  {aberto && <span className="card-aberto">Aberto</span>}
                  <span className="card-textos">
                    <span className="card-nome">{m.nome}</span>
                    <span className="card-descricao">{m.descricao}</span>
                  </span>
                  <span className="card-rodape">
                    <span className="card-faixa" aria-hidden="true" />
                    {erro ? 'Não abriu' : aberto ? 'Voltar para a aba' : 'Abrir'}
                  </span>
                </button>
                {erro && (
                  <p className="card-erro" role="alert">
                    {erro}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <footer className="rodape">
        <span>Parallello {estado.versao}</span>
      </footer>
    </main>
  )
}
