// Área administrativa do Gerar Pré-Venda.
//
// No Parallello, conexões, usuários, empresas, cobrança e eventos ficam na CONFIGURAÇÃO DO PARALLELLO
// (Ctrl+Shift+B + senha master). Aqui ficaram só Modelos de Pedido e Aparência, que aparecem direto
// para o super administrador (ou quem entrou com a senha master). Ctrl+Shift+B dentro do Gerar abre a
// configuração do Parallello.

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { nuvem as nuvemSessao, type NovoEvento, type Nuvem, type Perfil } from './servicos'
import { useSessao } from './contexto'

interface Admin {
  perfil: Perfil | null // quem está com o painel aberto
  nuvem: Nuvem | null // cliente da sessão administrativa (null = sem internet)
  ehSuper: boolean
  /** true quando liberado direto (super administrador logado): não tem "Fechar" */
  automatico: boolean
  abrirLogin(): void
  fechar(motivo?: string): void
  /** Evento feito pelo administrador (fica no nome dele). */
  registrar(e: NovoEvento): Promise<void>
}

const AdminCtx = createContext<Admin>(null as unknown as Admin)
export const useAdmin = () => useContext(AdminCtx)

export function AdminProvider({ children }: { children: ReactNode }) {
  const { perfil, registrarEvento, internet, offline, ehAdmin } = useSessao()

  // Ctrl+Shift+B dentro do Gerar: abre a configuração do Parallello
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'B' || e.key === 'b' || e.code === 'KeyB')) {
        e.preventDefault()
        void window.api.parallello.pedirPainel()
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  const valor = useMemo<Admin>(() => {
    const liberado = perfil?.papel === 'super_admin'
    return {
      perfil: liberado ? perfil : null,
      nuvem: internet && !offline ? nuvemSessao : null,
      ehSuper: liberado && perfil?.papel === 'super_admin',
      automatico: true,
      abrirLogin: () => void window.api.parallello.pedirPainel(),
      fechar: () => undefined,
      registrar: (e: NovoEvento) => registrarEvento(e)
    }
  }, [perfil, internet, offline, registrarEvento, ehAdmin])

  return <AdminCtx.Provider value={valor}>{children}</AdminCtx.Provider>
}
