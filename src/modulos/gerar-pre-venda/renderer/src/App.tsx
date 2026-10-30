import { useEffect, useState } from 'react'
import { AvisosProvider, ConexoesProvider, SessaoProvider, useSessao } from './contexto'
import { Faixa } from './componentes/Faixa'
import { Icone } from './componentes/Icone'
import { Pagina_Pedido } from './paginas/Pedido'
import { Pagina_Historico } from './paginas/Historico'
import { Pagina_Aparencia } from './paginas/Aparencia'
import { Pagina_Modelos } from './paginas/Modelos'
import { AvisoLicenca } from './componentes/AvisoLicenca'
import { AdminProvider, useAdmin } from './admin'

export type Aba = 'pedido' | 'historico' | 'modelos' | 'aparencia'
// Conexões, usuários, empresas, cobrança e eventos ficam na Configuração do Parallello (Ctrl+Shift+B).
// Modelos de pedido e aparência continuam aqui, para o super administrador.
const ABAS_ADMIN: Aba[] = ['modelos', 'aparencia']

function abaInicial(): Aba {
  const a = new URLSearchParams(location.search).get('aba') as Aba | null
  return a && ['pedido', 'historico', ...ABAS_ADMIN].includes(a) ? a : 'pedido'
}

function Casca() {
  const { perfil, carregando, erro } = useSessao()
  if (carregando) return <div className="carregando"><span><span className="spinner" /> Carregando…</span></div>
  if (!perfil) return <div className="carregando"><span>{erro || 'Entre no Parallello para usar o Gerar Pré-Venda.'}</span></div>
  return (
    <AdminProvider>
      <ConexoesProvider>
        <Programa />
      </ConexoesProvider>
    </AdminProvider>
  )
}

function Programa() {
  const admin = useAdmin()
  const [aba, setAba] = useState<Aba>(abaInicial)
  const [versao, setVersao] = useState('')
  useEffect(() => {
    window.api.atualizacao.versao().then(setVersao).catch(() => undefined)
  }, [])

  // Saiu do super administrador: volta para o pedido se estava numa aba de administração
  useEffect(() => {
    if (!admin.ehSuper && ABAS_ADMIN.includes(aba)) setAba('pedido')
  }, [admin.ehSuper]) // eslint-disable-line react-hooks/exhaustive-deps

  const itens: { id: Aba; rotulo: string; icone: string; mostrar: boolean }[] = [
    { id: 'pedido', rotulo: 'Pedido', icone: 'pedido', mostrar: true },
    { id: 'historico', rotulo: 'Histórico', icone: 'historico', mostrar: true },
    { id: 'modelos', rotulo: 'Modelos de Pedido', icone: 'modelo', mostrar: admin.ehSuper },
    { id: 'aparencia', rotulo: 'Aparência', icone: 'imagem', mostrar: admin.ehSuper }
  ]
  const visiveis = itens.filter((i) => i.mostrar)

  return (
    <div className="casca">
      <Faixa irPara={() => void window.api.parallello.pedirPainel()} />
      <AvisoLicenca />
      <div className="corpo">
        <nav className="nav" aria-label="Menu">
          {visiveis.map((i, n) => (
            <div key={i.id}>
              {n === 2 && <div className="nav-separador">Administração</div>}
              <button className={aba === i.id ? 'ativo' : ''} onClick={() => setAba(i.id)} aria-current={aba === i.id ? 'page' : undefined}>
                <Icone nome={i.icone} /> <span className="rotulo-nav">{i.rotulo}</span>
              </button>
            </div>
          ))}
          <div className="rodape"><span className="rotulo-nav">Versão </span>{versao}</div>
        </nav>
        {/* O pedido fica montado o tempo todo para não perder o que foi feito ao trocar de aba. */}
        <Pagina_Pedido visivel={aba === 'pedido'} />
        <Pagina_Historico visivel={aba === 'historico'} />
        {admin.ehSuper && <Pagina_Aparencia visivel={aba === 'aparencia'} />}
        {admin.ehSuper && <Pagina_Modelos visivel={aba === 'modelos'} />}
      </div>
    </div>
  )
}

export function App() {
  return (
    <AvisosProvider>
      <SessaoProvider>
        <Casca />
      </SessaoProvider>
    </AvisosProvider>
  )
}
