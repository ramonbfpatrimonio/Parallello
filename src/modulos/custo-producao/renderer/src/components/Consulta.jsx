import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { descreverFiltros, filtrarOrdens, ordenarOrdens, resumir } from '../lib/calc';
import GradeCusto from './GradeCusto';
import Resumo from './Resumo';
import ModalNome from './ModalNome';
import Icone from './Icone';
import BotoesSaida from './BotoesSaida';

const VAZIO = { dataIni: '', dataFim: '', numeroIni: '', numeroFim: '', produto: '', descricao: '' };
const TITULO = 'Custo de Produto/Produção';

function lerFiltrosAbertos() {
  try { return localStorage.getItem('filtrosAbertos') !== 'nao'; } catch { return true; }
}

export default function Consulta({ config, ativa, aviso }) {
  const [filtros, setFiltros] = useState(VAZIO);
  const [res, setRes] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [soSemCusto, setSoSemCusto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [ordenacao, setOrdenacao] = useState(null);
  const [filtrosAbertos, setFiltrosAbertos] = useState(lerFiltrosAbertos);

  useEffect(() => {
    try { localStorage.setItem('filtrosAbertos', filtrosAbertos ? 'sim' : 'nao'); } catch { /* ignora */ }
  }, [filtrosAbertos]);

  const casas = Number(config?.preferencias?.casasCustoUnit ?? 2);
  const temColunaData = !!ativa?.colunaData;

  const filtradas = useMemo(() => (res ? filtrarOrdens(res.ordens, busca, soSemCusto) : []), [res, busca, soSemCusto]);
  const visiveis = useMemo(() => ordenarOrdens(filtradas, ordenacao), [filtradas, ordenacao]);
  const total = useMemo(() => resumir(visiveis), [visiveis]);
  const resumoGeral = useMemo(() => (res ? resumir(res.ordens) : null), [res]);

  const campo = k => e => setFiltros(f => ({ ...f, [k]: e.target.value }));
  const qtdFiltros = Object.values(filtros).filter(v => String(v).trim()).length;

  async function consultar(e) {
    e?.preventDefault();
    setCarregando(true);
    setErro('');
    try {
      const d = await api.consultar(filtros);
      setRes({ ...d, filtros: { ...filtros }, conexaoNome: ativa?.nome });
      setSoSemCusto(false);
      if (!d.ordens.length) aviso('Nenhuma ordem encontrada para estes filtros.', 'info');
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }

  // A exportação segue a ordem e os filtros que estão na tela
  const dadosSaida = () => ({
    titulo: TITULO,
    filtrosTexto: `${res.conexaoNome ? `Conexão ${res.conexaoNome}  •  ` : ''}${descreverFiltros(res.filtros, res.geradoEm)}`,
    ordens: visiveis,
    casas,
    comData: res.comData
  });

  async function salvarHistorico(nome) {
    try {
      await api.histSalvar({ nome, filtros: res.filtros, ordens: visiveis, comData: res.comData });
      setSalvando(false);
      aviso('Consulta salva no histórico.');
    } catch (err) {
      aviso(err.message, 'erro');
    }
  }

  return (
    <section className="pagina">
      <header className="pagina-topo">
        <div>
          <h1>Custo de produção</h1>
          <p>
            {ativa
              ? <>Ordens de produção custeadas pelos insumos, no banco <b>{ativa.nome}</b>.</>
              : 'Cadastre uma conexão com o banco para consultar.'}
          </p>
        </div>
        <button
          className={`sec botao-filtros ${filtrosAbertos ? '' : 'recolhidos'}`}
          onClick={() => setFiltrosAbertos(v => !v)}
          aria-expanded={filtrosAbertos}
          aria-controls="painel-filtros"
          title={filtrosAbertos ? 'Recolher os filtros' : 'Mostrar os filtros'}
        >
          <Icone nome="filtro" tamanho={16} />
          {filtrosAbertos ? 'Recolher filtros' : 'Mostrar filtros'}
          {!filtrosAbertos && qtdFiltros > 0 && <em className="contador">{qtdFiltros}</em>}
          <Icone nome={filtrosAbertos ? 'recolher' : 'abrir'} tamanho={16} />
        </button>
      </header>

      {config && !ativa && (
        <div className="faixa aviso">
          <Icone nome="banco" />
          <span>Nenhuma conexão cadastrada. Pressione <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>B</kbd> e cadastre o banco do cliente em Conexões.</span>
        </div>
      )}

      <div id="painel-filtros" className={`recolhivel ${filtrosAbertos ? 'aberto' : ''}`} aria-hidden={!filtrosAbertos}>
        <div className="recolhivel-interno">
          <form className="filtros" onSubmit={consultar}>
            <div className={`grupo-filtro ${temColunaData ? '' : 'inativo'}`} title={temColunaData ? '' : 'Escolha a coluna de data na conexão para filtrar por período'}>
              <span className="rotulo">Período</span>
              <div className="linha">
                <input type="date" value={filtros.dataIni} onChange={campo('dataIni')} aria-label="Data inicial" disabled={!temColunaData} />
                <span className="ate">até</span>
                <input type="date" value={filtros.dataFim} onChange={campo('dataFim')} aria-label="Data final" disabled={!temColunaData} />
              </div>
            </div>
            <div className="grupo-filtro">
              <span className="rotulo">Ordens</span>
              <div className="linha">
                <input className="curto" value={filtros.numeroIni} onChange={campo('numeroIni')} placeholder="de" aria-label="Ordem inicial" />
                <span className="ate">até</span>
                <input className="curto" value={filtros.numeroFim} onChange={campo('numeroFim')} placeholder="até" aria-label="Ordem final" />
              </div>
            </div>
            <div className="grupo-filtro">
              <span className="rotulo">Produto acabado</span>
              <div className="linha">
                <input className="curto" value={filtros.produto} onChange={campo('produto')} placeholder="Código" aria-label="Código do produto acabado" />
                <input className="largo" value={filtros.descricao} onChange={campo('descricao')} placeholder="Descrição contém..." aria-label="Descrição do produto acabado" />
              </div>
            </div>
            <div className="filtros-acoes">
              <button type="button" className="sec" onClick={() => setFiltros(VAZIO)}>Limpar</button>
              <button type="submit" disabled={carregando || !ativa}>{carregando ? 'Consultando...' : 'Consultar'}</button>
            </div>
          </form>
          {ativa && !temColunaData && (
            <p className="dica dica-filtros">O período fica liberado depois de escolher a coluna de data desta conexão, na área do sistema.</p>
          )}
        </div>
      </div>

      {!filtrosAbertos && (
        <div className="filtros-resumo">
          <span>{descreverFiltros(filtros)}</span>
          <button className="sec" onClick={consultar} disabled={carregando || !ativa}>{carregando ? 'Consultando...' : 'Consultar de novo'}</button>
        </div>
      )}

      {erro && <div className="faixa erro"><Icone nome="alerta" /><span>{erro}</span></div>}

      {res && (
        <>
          <Resumo
            r={busca || soSemCusto ? total : resumoGeral}
            casas={casas}
            soSemCusto={soSemCusto}
            aoFiltrarSemCusto={() => setSoSemCusto(v => !v)}
          />

          <div className="barra">
            <div className="campo-busca">
              <Icone nome="busca" tamanho={16} />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar ordem, código ou descrição de acabado ou insumo" aria-label="Buscar" />
            </div>
            <span className="barra-info">{descreverFiltros(res.filtros, res.geradoEm)}</span>
            <div className="barra-acoes">
              <button className="sec" onClick={() => setSalvando(true)} disabled={!visiveis.length}><Icone nome="salvar" tamanho={16} /> Salvar no histórico</button>
              <BotoesSaida dados={dadosSaida} desativado={!visiveis.length} aviso={aviso} />
            </div>
          </div>

          <GradeCusto
            ordens={visiveis}
            casas={casas}
            comData={res.comData}
            total={total}
            ordenacao={ordenacao}
            aoOrdenar={setOrdenacao}
          />
        </>
      )}

      {!res && !erro && ativa && (
        <div className="estado-vazio">
          <svg viewBox="0 0 120 64" aria-hidden="true">
            <rect x="8" y="10" width="104" height="10" rx="3" className="b1" />
            <rect x="8" y="27" width="70" height="10" rx="3" className="b2" />
            <rect x="8" y="44" width="40" height="10" rx="3" className="b3" />
          </svg>
          <p>Escolha os filtros e clique em <b>Consultar</b> para ver o custo de cada ordem.</p>
        </div>
      )}

      {salvando && (
        <ModalNome
          titulo="Salvar no histórico"
          descricao="As ordens visíveis ficam guardadas neste computador para consultar e comparar depois."
          padrao={`${ativa?.nome ? `${ativa.nome} — ` : ''}${new Date().toLocaleDateString('pt-BR')}`}
          aoConfirmar={salvarHistorico}
          aoFechar={() => setSalvando(false)}
        />
      )}
    </section>
  );
}
