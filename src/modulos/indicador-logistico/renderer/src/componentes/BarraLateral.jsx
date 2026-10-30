import React from 'react';
import { LayoutDashboard, History, Target, Wallet, Settings, LogOut } from 'lucide-react';
import logo from '../assets/logo.svg';

export const PAGINAS = [
  { id: 'painel', rotulo: 'Painel', icone: LayoutDashboard },
  { id: 'historico', rotulo: 'Histórico', icone: History },
  { id: 'metas', rotulo: 'Metas', icone: Target, admin: true },
  { id: 'centros', rotulo: 'Centros de custo', icone: Wallet, admin: true },
  // Conexões e Usuários: agora no Parallello (conexão única e login único)
  { id: 'configuracoes', rotulo: 'Configurações', icone: Settings }
];

const PERFIL = { master: 'Master', admin: 'Administrador', operador: 'Operador' };

export default function BarraLateral({ pagina, setPagina, sessao, onSair }) {
  const admin = sessao.perfil === 'master' || sessao.perfil === 'admin';
  const iniciais = sessao.nome.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <aside className="lateral">
      <div className="marca">
        <img src={logo} alt="" />
        <div><b>Indicador Logístico</b><small>Painel de indicadores</small></div>
      </div>
      <nav>
        {PAGINAS.filter((p) => !p.admin || admin).map((p) => {
          const Icone = p.icone;
          return (
            <button key={p.id} className={`item ${pagina === p.id ? 'ativo' : ''}`} onClick={() => setPagina(p.id)} title={p.rotulo}>
              <Icone size={20} /><span className="rotulo">{p.rotulo}</span>
            </button>
          );
        })}
      </nav>
      <div className="rodape">
        <div className="usuario">
          <div className="avatar">{iniciais}</div>
          <div><b>{sessao.nome}</b><small>{PERFIL[sessao.perfil]}</small></div>
        </div>
        {!sessao.parallello && <button className="item" onClick={onSair} title="Sair"><LogOut size={20} /><span className="rotulo">Sair</span></button>}
      </div>
    </aside>
  );
}
