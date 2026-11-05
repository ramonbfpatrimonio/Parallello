import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { dataBR, dataHoraBR, moeda } from '../fmt.js';
import Icone from '../components/Icone.jsx';
import ResultadoView from '../components/ResultadoView.jsx';
import TabelaArrastavel from '../components/TabelaArrastavel.jsx';
import { Confirmar } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Fechamentos({ visivel }) {
  const avisar = useToast();
  const [lista, setLista] = useState([]);
  const [aberto, setAberto] = useState(null);
  const [mostrarItens, setMostrarItens] = useState(false);
  const [excluir, setExcluir] = useState(null);

  const recarregar = () => api.fechamentos.listar().then(setLista).catch((e) => avisar(e.message, 'erro'));

  useEffect(() => {
    if (visivel) recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visivel]);

  const abrir = async (id) => {
    try {
      setAberto(await api.fechamentos.obter(id));
    } catch (e) {
      avisar(e.message, 'erro');
    }
  };

  const exportar = async (tipo, id) => {
    try {
      const f = aberto && aberto.id === id ? aberto : await api.fechamentos.obter(id);
      const arq = await api.exportar[tipo](f.dados, { mostrarItens });
      if (arq && tipo !== 'imprimir') avisar('Arquivo salvo em ' + arq);
    } catch (e) {
      avisar(e.message, 'erro');
    }
  };

  if (aberto) {
    return (
      <div className="pagina">
        <header className="pagina-topo">
          <div>
            <button className="link-voltar" onClick={() => setAberto(null)}>
              <Icone nome="voltar" tamanho={16} /> Fechamentos
            </button>
            <h1>
              Fechamento #{aberto.id} — {aberto.vendedor}
            </h1>
            <p>
              Baixa {dataBR(aberto.baixa_inicio)} a {dataBR(aberto.baixa_fim)} · vendas desde {dataBR(aberto.venda_desde)} · {aberto.conexao} · salvo em {dataHoraBR(aberto.criado_em)}
              {aberto.observacao ? ` · ${aberto.observacao}` : ''}
            </p>
          </div>
          <div className="acoes">
            <button className="btn" onClick={() => exportar('excel', aberto.id)}>
              <Icone nome="excel" /> Excel
            </button>
            <button className="btn" onClick={() => exportar('pdf', aberto.id)}>
              <Icone nome="pdf" /> PDF
            </button>
            <button className="btn" onClick={() => exportar('imprimir', aberto.id)}>
              <Icone nome="imprimir" /> Imprimir
            </button>
          </div>
        </header>
        <ResultadoView resultado={aberto.dados} mostrarItens={mostrarItens} aoMudarMostrarItens={setMostrarItens} />
      </div>
    );
  }

  return (
    <div className="pagina">
      <header className="pagina-topo">
        <div>
          <h1>Fechamentos</h1>
          <p>Resultados de comissão salvos neste computador</p>
        </div>
      </header>

      {lista.length ? (
        <TabelaArrastavel>
          <table className="tabela">
            <thead>
              <tr>
                <th>#</th>
                <th>Salvo em</th>
                <th>Vendedor</th>
                <th>Período da baixa</th>
                <th>Banco</th>
                <th className="n">Pedidos</th>
                <th className="n">Recebido</th>
                <th className="n">Comissão</th>
                <th>Observação</th>
                <th style={{ width: 186 }} />
              </tr>
            </thead>
            <tbody>
              {lista.map((f) => (
                <tr key={f.id} className="clicavel" onDoubleClick={() => abrir(f.id)}>
                  <td className="mono">{f.id}</td>
                  <td>{dataHoraBR(f.criado_em)}</td>
                  <td>{f.vendedor}</td>
                  <td>
                    {dataBR(f.baixa_inicio)} a {dataBR(f.baixa_fim)}
                  </td>
                  <td>{f.conexao}</td>
                  <td className="n">{f.pedidos}</td>
                  <td className="n">{moeda(f.recebido)}</td>
                  <td className="n forte">{moeda(f.comissao)}</td>
                  <td className="texto-suave">{f.observacao}</td>
                  <td>
                    <div className="acoes-linha">
                      <button className="btn-icone" title="Abrir" onClick={() => abrir(f.id)}>
                        <Icone nome="olho" tamanho={16} />
                      </button>
                      <button className="btn-icone" title="Excel" onClick={() => exportar('excel', f.id)}>
                        <Icone nome="excel" tamanho={16} />
                      </button>
                      <button className="btn-icone" title="PDF" onClick={() => exportar('pdf', f.id)}>
                        <Icone nome="pdf" tamanho={16} />
                      </button>
                      <button className="btn-icone" title="Imprimir" onClick={() => exportar('imprimir', f.id)}>
                        <Icone nome="imprimir" tamanho={16} />
                      </button>
                      <button className="btn-icone perigo" title="Excluir" onClick={() => setExcluir(f)}>
                        <Icone nome="lixo" tamanho={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabelaArrastavel>
      ) : (
        <div className="vazio-grande">
          <Icone nome="fechamentos" tamanho={40} />
          <h3>Nenhum fechamento salvo</h3>
          <p>No Relatório de Comissões, depois de buscar os dados, use “Salvar fechamento”.</p>
        </div>
      )}

      {excluir && (
        <Confirmar
          titulo="Excluir fechamento"
          perigo
          textoOk="Excluir"
          mensagem={`Excluir o fechamento #${excluir.id} (${excluir.vendedor}, ${dataBR(excluir.baixa_inicio)} a ${dataBR(excluir.baixa_fim)})? Isso não altera nada no ERP.`}
          aoConfirmar={async () => {
            await api.fechamentos.excluir(excluir.id).catch((e) => avisar(e.message, 'erro'));
            setExcluir(null);
            recarregar();
          }}
          aoFechar={() => setExcluir(null)}
        />
      )}
    </div>
  );
}
