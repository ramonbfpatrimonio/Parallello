import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import Sidebar from './components/Sidebar.jsx';
import { ToastProvider } from './components/Toast.jsx';
import Relatorio from './pages/Relatorio.jsx';
import Configuracao from './pages/Configuracao.jsx';
import Fechamentos from './pages/Fechamentos.jsx';
import Backup from './pages/Backup.jsx';
import Configuracoes from './pages/Configuracoes.jsx';
import SenhaSistema from './components/SenhaSistema.jsx';

const MENU = [
  { id: 'relatorio', rotulo: 'Relatório de Comissões', icone: 'relatorio', grupo: 'Comissões' },
  { id: 'configuracao', rotulo: 'Configurar Comissões', icone: 'config', grupo: 'Comissões' },
  { id: 'fechamentos', rotulo: 'Fechamentos', icone: 'fechamentos', grupo: 'Comissões' },
  { id: 'configuracoes', rotulo: 'Configurações', icone: 'engrenagem', grupo: 'Sistema', sistema: true },
  { id: 'backup', rotulo: 'Backup', icone: 'backup', grupo: 'Sistema', sistema: true }
];

export default function App() {
  const [pagina, setPagina] = useState('relatorio');
  const [conexoes, setConexoes] = useState([]);
  const [conexaoRel, setConexaoRel] = useState(null);
  const [conexaoCfg, setConexaoCfg] = useState(null);
  const [ehAdmin, setEhAdmin] = useState(false);

  // Área de sistema escondida: Ctrl+Shift+B pede a senha master do Parallello; de novo, esconde
  const [sistemaLiberado, setSistemaLiberado] = useState(false);
  const [pedirSenha, setPedirSenha] = useState(false);

  useEffect(() => {
    const atalho = (e) => {
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.code === 'KeyB') {
        e.preventDefault();
        if (sistemaLiberado) {
          setSistemaLiberado(false);
          setPagina((p) => (MENU.find((m) => m.id === p)?.sistema ? 'relatorio' : p));
        } else {
          setPedirSenha(true);
        }
      }
    };
    window.addEventListener('keydown', atalho);
    return () => window.removeEventListener('keydown', atalho);
  }, [sistemaLiberado]);

  const menu = MENU.filter((m) => !m.sistema || sistemaLiberado);

  useEffect(() => {
    api.sessao().then((s) => setEhAdmin(!!s.ehAdmin)).catch(() => {});
  }, []);

  const recarregarConexoes = useCallback(async () => {
    try {
      const lista = await api.conexoes.listar();
      setConexoes(lista);
      const padrao = (lista.find((c) => c.padrao) || lista[0])?.id ?? null;
      const valida = (id) => (lista.some((c) => c.id === id) ? id : padrao);
      setConexaoRel((id) => valida(id));
      setConexaoCfg((id) => valida(id));
    } catch {
      setConexoes([]);
    }
  }, []);

  useEffect(() => {
    recarregarConexoes();
  }, [recarregarConexoes]);

  // As páginas ficam montadas para não perder o que foi buscado ao trocar de menu
  const ver = (id) => ({ display: pagina === id ? 'block' : 'none' });

  return (
    <ToastProvider>
      <div className="app">
        <Sidebar itens={menu} ativo={pagina} aoSelecionar={setPagina} />
        <main className="conteudo">
          <div style={ver('relatorio')}>
            <Relatorio conexoes={conexoes} conexaoId={conexaoRel} setConexaoId={setConexaoRel} />
          </div>
          <div style={ver('configuracao')}>
            <Configuracao conexoes={conexoes} conexaoId={conexaoCfg} setConexaoId={setConexaoCfg} podeGravar={ehAdmin} />
          </div>
          <div style={ver('fechamentos')}>
            <Fechamentos visivel={pagina === 'fechamentos'} />
          </div>
          {sistemaLiberado && (
            <>
              <div style={ver('configuracoes')}>
                <Configuracoes visivel={pagina === 'configuracoes'} />
              </div>
              <div style={ver('backup')}>
                <Backup visivel={pagina === 'backup'} />
              </div>
            </>
          )}
        </main>
      </div>
      {pedirSenha && (
        <SenhaSistema
          aoFechar={() => setPedirSenha(false)}
          aoLiberar={() => {
            setPedirSenha(false);
            setSistemaLiberado(true);
            setPagina('configuracoes');
          }}
        />
      )}
    </ToastProvider>
  );
}
