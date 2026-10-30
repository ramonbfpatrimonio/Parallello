import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from './lib/api';
import { AvisoProvider } from './componentes/comum';
import BarraLateral from './componentes/BarraLateral';
import Login from './paginas/Login';
import Painel from './paginas/Painel';
import Historico from './paginas/Historico';
import Metas from './paginas/Metas';
import Centros from './paginas/Centros';
import Configuracoes from './paginas/Configuracoes';

export default function App() {
  const [estado, setEstado] = useState(null);
  const [sessao, setSessao] = useState(null);
  const [pagina, setPagina] = useState('painel');
  const [painel, setPainel] = useState({ filtros: null, resultado: null }); // mantém o painel ao trocar de tela

  useEffect(() => {
    api('auth:estado').then((e) => { setEstado(e); setSessao(e.sessao); }).catch(() => setEstado({ temUsuarios: true }));
  }, []);

  async function sair() {
    await api('auth:sair');
    setSessao(null);
    setPagina('painel');
    setPainel({ filtros: null, resultado: null });
    setEstado(await api('auth:estado'));
  }

  if (!estado) return <div className="vazio"><Loader2 className="girar" /></div>;

  const admin = sessao && (sessao.perfil === 'master' || sessao.perfil === 'admin');
  const telas = {
    painel: <Painel estado={painel} setEstado={setPainel} irPara={setPagina} admin={admin} />,
    historico: <Historico admin={admin} />,
    metas: <Metas />,
    centros: <Centros />,
    configuracoes: <Configuracoes sessao={sessao} admin={admin} />
  };

  return (
    <AvisoProvider>
      {!sessao ? (
        <Login temUsuarios={estado.temUsuarios} onEntrar={(s) => { setSessao(s); setPagina(s.perfil === 'master' && !estado.temUsuarios ? 'usuarios' : 'painel'); }} />
      ) : (
        <div className="app">
          <BarraLateral pagina={pagina} setPagina={setPagina} sessao={sessao} onSair={sair} />
          <main className="conteudo">{telas[pagina] || telas.painel}</main>
        </div>
      )}
    </AvisoProvider>
  );
}
