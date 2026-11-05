import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Icone from '../components/Icone.jsx';
import { Confirmar } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Backup({ visivel }) {
  const avisar = useToast();
  const [info, setInfo] = useState(null);
  const [confirmar, setConfirmar] = useState(false);

  const carregar = () => api.backup.info().then(setInfo).catch(() => {});
  useEffect(() => {
    if (visivel) carregar();
  }, [visivel]);

  return (
    <div className="pagina">
      <header className="pagina-topo">
        <div>
          <h1>Backup</h1>
          <p>Fechamentos e preferências ficam num único arquivo neste computador (as conexões são as do Parallello)</p>
        </div>
      </header>

      <div className="grade-cartoes duas">
        <div className="cartao">
          <h3 className="cartao-titulo">Arquivo de dados</h3>
          {info && (
            <dl className="resumo-lista">
              <dt>Local</dt>
              <dd className="mono quebra">{info.caminho}</dd>
              <dt>Tamanho</dt>
              <dd>{(info.tamanho / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB</dd>
              <dt>Última alteração</dt>
              <dd>{new Date(info.alterado).toLocaleString('pt-BR')}</dd>
              <dt>Versão do sistema</dt>
              <dd>{info.versao}</dd>
            </dl>
          )}
        </div>
        <div className="cartao">
          <h3 className="cartao-titulo">Cópia de segurança</h3>
          <p className="texto-suave">Salve uma cópia periodicamente (pendrive, rede, Drive). Para levar para outro computador, faça o backup aqui e restaure lá.</p>
          <div className="pilha">
            <button
              className="btn primario"
              onClick={async () => {
                try {
                  const arq = await api.backup.exportar();
                  if (arq) avisar('Backup salvo em ' + arq);
                } catch (e) {
                  avisar(e.message, 'erro');
                }
              }}
            >
              <Icone nome="baixar" /> Fazer backup
            </button>
            <button className="btn" onClick={() => setConfirmar(true)}>
              <Icone nome="subir" /> Restaurar backup
            </button>
          </div>
        </div>
      </div>

      {confirmar && (
        <Confirmar
          titulo="Restaurar backup"
          perigo
          textoOk="Escolher arquivo"
          mensagem="Os fechamentos e preferências deste computador serão substituídos pelos do backup. Deseja continuar?"
          aoConfirmar={async () => {
            setConfirmar(false);
            try {
              const arq = await api.backup.restaurar();
              if (arq) {
                avisar('Backup restaurado. Recarregando…');
                setTimeout(() => window.location.reload(), 900);
              }
            } catch (e) {
              avisar(e.message, 'erro');
            }
          }}
          aoFechar={() => setConfirmar(false)}
        />
      )}
    </div>
  );
}
