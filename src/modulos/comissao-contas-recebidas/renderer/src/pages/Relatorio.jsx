import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { periodoPadrao } from '../fmt.js';
import Icone from '../components/Icone.jsx';
import SeletorConexao from '../components/SeletorConexao.jsx';
import ResultadoView from '../components/ResultadoView.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Relatorio({ conexoes, conexaoId, setConexaoId }) {
  const avisar = useToast();
  const [filtros, setFiltros] = useState(() => ({ ...periodoPadrao(), vendedor: '' }));
  const [vendedores, setVendedores] = useState([]);
  const [carregandoVend, setCarregandoVend] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [mostrarItens, setMostrarItens] = useState(false);
  const [exportando, setExportando] = useState('');
  const [modalFechamento, setModalFechamento] = useState(false);

  // recupera os últimos filtros usados
  useEffect(() => {
    api.config
      .obter('ultimosFiltros', null)
      .then((f) => {
        if (f) setFiltros((a) => ({ ...a, vendedor: f.vendedor || '', vendaDesde: f.vendaDesde || a.vendaDesde }));
      })
      .catch(() => {});
    api.config.obter('mostrarItens', false).then((v) => setMostrarItens(!!v)).catch(() => {});
  }, []);

  const carregarVendedores = async (atualizar) => {
    if (!conexaoId) return;
    setCarregandoVend(true);
    try {
      const lista = await api.vendedores(conexaoId, atualizar);
      setVendedores(lista);
      if (atualizar) avisar(`${lista.length} vendedores atualizados do banco.`);
    } catch (e) {
      if (atualizar) avisar(e.message, 'erro');
      setVendedores([]);
    } finally {
      setCarregandoVend(false);
    }
  };

  useEffect(() => {
    carregarVendedores(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conexaoId]);

  const set = (k) => (e) => setFiltros((f) => ({ ...f, [k]: e.target.value }));

  const vendedorRotulo = () => {
    if (!filtros.vendedor) return '';
    const v = vendedores.find((x) => x.codigo === filtros.vendedor);
    return v ? `${v.codigo} - ${v.nome}` : filtros.vendedor;
  };

  const buscar = async () => {
    setBuscando(true);
    try {
      const r = await api.relatorio(conexaoId, { ...filtros, vendedor: filtros.vendedor || null, vendedorRotulo: vendedorRotulo() });
      setResultado(r);
      if (!r.pedidos.length) avisar('Nenhum dado encontrado para os filtros informados.', 'info');
    } catch (e) {
      avisar(e.message, 'erro');
    } finally {
      setBuscando(false);
    }
  };

  const mudarMostrarItens = (v) => {
    setMostrarItens(v);
    api.config.definir('mostrarItens', v).catch(() => {});
  };

  const exportar = async (tipo) => {
    setExportando(tipo);
    try {
      const arq = await api.exportar[tipo](resultado, { mostrarItens });
      if (arq && tipo !== 'imprimir') avisar('Arquivo salvo em ' + arq);
    } catch (e) {
      avisar(e.message, 'erro');
    } finally {
      setExportando('');
    }
  };

  return (
    <div className="pagina">
      <header className="pagina-topo">
        <div>
          <h1>Relatório de Comissões</h1>
          <p>Comissão dos vendedores sobre as contas recebidas no período</p>
        </div>
        {resultado && resultado.pedidos.length > 0 && (
          <div className="acoes">
            <button className="btn" onClick={() => exportar('excel')} disabled={!!exportando}>
              <Icone nome="excel" /> {exportando === 'excel' ? 'Gerando…' : 'Excel'}
            </button>
            <button className="btn" onClick={() => exportar('pdf')} disabled={!!exportando}>
              <Icone nome="pdf" /> {exportando === 'pdf' ? 'Gerando…' : 'PDF'}
            </button>
            <button className="btn" onClick={() => exportar('imprimir')} disabled={!!exportando}>
              <Icone nome="imprimir" /> {exportando === 'imprimir' ? 'Abrindo…' : 'Imprimir'}
            </button>
            <button className="btn primario" onClick={() => setModalFechamento(true)}>
              <Icone nome="salvar" /> Salvar fechamento
            </button>
          </div>
        )}
      </header>

      <section className="cartao filtros">
        <SeletorConexao conexoes={conexoes} valor={conexaoId} aoMudar={setConexaoId} />
        <label className="campo">
          <span>Baixa início</span>
          <input type="date" value={filtros.baixaInicio} onChange={set('baixaInicio')} />
        </label>
        <label className="campo">
          <span>Baixa fim</span>
          <input type="date" value={filtros.baixaFim} onChange={set('baixaFim')} />
        </label>
        <label className="campo">
          <span>Vendas a prazo a partir de</span>
          <input type="date" value={filtros.vendaDesde} onChange={set('vendaDesde')} />
        </label>
        <label className="campo largo">
          <span>Vendedor</span>
          <div className="com-botao">
            <select value={filtros.vendedor} onChange={set('vendedor')}>
              <option value="">Todos os vendedores</option>
              {filtros.vendedor && !vendedores.some((v) => v.codigo === filtros.vendedor) && <option value={filtros.vendedor}>{filtros.vendedor}</option>}
              {vendedores.map((v) => (
                <option key={v.codigo} value={v.codigo}>
                  {v.codigo} - {v.nome}
                </option>
              ))}
            </select>
            <button className="btn-icone borda" onClick={() => carregarVendedores(true)} disabled={carregandoVend} title="Atualizar lista de vendedores do banco">
              <Icone nome="atualizar" className={carregandoVend ? 'girando' : ''} />
            </button>
          </div>
        </label>
        <button className="btn primario grande" onClick={buscar} disabled={buscando || !conexaoId}>
          <Icone nome="buscar" /> {buscando ? 'Buscando…' : 'Buscar dados'}
        </button>
      </section>

      {buscando && !resultado && <div className="carregando">Consultando o banco…</div>}

      {resultado ? (
        <div className={buscando ? 'esmaecido' : ''}>
          <ResultadoView resultado={resultado} mostrarItens={mostrarItens} aoMudarMostrarItens={mudarMostrarItens} />
        </div>
      ) : (
        !buscando && (
          <div className="vazio-grande">
            <Icone nome="relatorio" tamanho={40} />
            <h3>Escolha o período e clique em “Buscar dados”</h3>
            <p>O relatório traz as parcelas baixadas no período e os itens de cada pedido, com a comissão por fabricante.</p>
          </div>
        )
      )}

      {modalFechamento && (
        <SalvarFechamento
          resultado={resultado}
          aoFechar={() => setModalFechamento(false)}
          aoSalvar={() => {
            setModalFechamento(false);
            avisar('Fechamento salvo. Consulte em “Fechamentos”.');
          }}
        />
      )}
    </div>
  );
}

function SalvarFechamento({ resultado, aoFechar, aoSalvar }) {
  const avisar = useToast();
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    setSalvando(true);
    try {
      await api.fechamentos.salvar(resultado, obs);
      aoSalvar();
    } catch (e) {
      avisar(e.message, 'erro');
      setSalvando(false);
    }
  };
  const f = resultado.filtros;
  return (
    <Modal
      titulo="Salvar fechamento"
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="btn" onClick={aoFechar}>Cancelar</button>
          <button className="btn primario" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <p className="texto-suave">
        Guarda uma cópia deste resultado neste computador para consultar e reimprimir depois, sem precisar ir ao banco.
      </p>
      <dl className="resumo-lista">
        <dt>Vendedor</dt>
        <dd>{f.vendedorRotulo || 'Todos'}</dd>
        <dt>Comissão</dt>
        <dd>{resultado.totais.comissao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</dd>
      </dl>
      <label className="campo">
        <span>Observação (opcional)</span>
        <textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: comissão paga em 05/11" />
      </label>
    </Modal>
  );
}
