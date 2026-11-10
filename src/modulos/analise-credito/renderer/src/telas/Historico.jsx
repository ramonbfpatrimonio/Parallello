import React, { useEffect, useMemo, useState } from 'react';
import { Search, History, Trash2 } from 'lucide-react';
import { api, fmtMoeda, fmtDataHora, classePerfil, fmtNum, isoParaBr, useOrdenacao, lsGet, lsSet } from '../util.js';
import { Th, CabecalhoPagina, Recolhivel, BotoesExportar, AreaDividida, Vazio } from '../componentes.jsx';
import { montarRelatorio } from '../relatorio.js';

const COLS_EXCEL = [
  { titulo: 'Data', campo: 'dataFmt', largura: 18 },
  { titulo: 'Conexão', campo: 'conexaoNome', largura: 20 },
  { titulo: 'Código', campo: 'codigo', largura: 10 },
  { titulo: 'Cliente', campo: 'nome', largura: 40 },
  { titulo: 'Situação', campo: 'situacao', largura: 16 },
  { titulo: 'Score', campo: 'score' },
  { titulo: 'Perfil', campo: 'perfil', largura: 14 },
  { titulo: 'Limite Atual', campo: 'limiteAtual', tipo: 'moeda', largura: 15 },
  { titulo: 'Limite Sugerido', campo: 'limiteSugerido', tipo: 'moeda', largura: 15 },
  { titulo: 'Limite Aprovado', campo: 'limiteAprovado', tipo: 'moeda', largura: 15 },
  { titulo: 'Prazo Aprovado', campo: 'prazoAprovado', largura: 14 },
  { titulo: 'Período', campo: 'periodoTxt', largura: 24 },
  { titulo: 'Responsável', campo: 'responsavel', largura: 18 },
  { titulo: 'Observação', campo: 'observacao', largura: 48 }
];

const COLS_REL = [
  { titulo: 'Data', campo: 'data', tipo: 'datahora' },
  { titulo: 'Código', campo: 'codigo' },
  { titulo: 'Cliente', campo: 'nome' },
  { titulo: 'Situação', campo: 'situacao' },
  { titulo: 'Score', campo: 'score', tipo: 'num' },
  { titulo: 'Perfil', campo: 'perfil' },
  { titulo: 'Sugerido', campo: 'limiteSugerido', tipo: 'moeda' },
  { titulo: 'Aprovado', campo: 'limiteAprovado', tipo: 'moeda' },
  { titulo: 'Prazo', campo: 'prazoAprovado' },
  { titulo: 'Período', campo: 'periodoTxt' },
  { titulo: 'Responsável', campo: 'responsavel' },
  { titulo: 'Observação', campo: 'observacao' }
];

export default function Historico({ conexoes, ativa }) {
  const [lista, setLista] = useState([]);
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('');
  const [conexaoFiltro, setConexaoFiltro] = useState(ativa?.id || '');
  const [erro, setErro] = useState('');
  const [filtrosAbertos, setFiltrosAbertos] = useState(() => lsGet('ac.histFiltrosAbertos', true));

  const carregar = () => api.decisoesListar().then((l) => setLista(l.map((d) => ({
    ...d,
    score: d.snapshot?.score, perfil: d.snapshot?.perfil,
    limiteAtual: d.snapshot?.limiteAtual, limiteSugerido: d.snapshot?.limiteSugerido,
    periodoTxt: d.periodo?.inicial ? `${isoParaBr(d.periodo.inicial)} a ${isoParaBr(d.periodo.final)}` : 'Geral'
  })))).catch((e) => setErro(e.message));
  useEffect(() => { carregar(); }, []);
  useEffect(() => { setConexaoFiltro(ativa?.id || ''); }, [ativa?.id]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return lista.filter((d) => (!situacao || d.situacao === situacao) &&
      (!conexaoFiltro || !d.conexaoId || d.conexaoId === conexaoFiltro) &&
      (!t || `${d.codigo} ${d.nome || ''} ${d.fantasia || ''} ${d.responsavel || ''}`.toLowerCase().includes(t)));
  }, [lista, busca, situacao, conexaoFiltro]);

  const { ordenadas, ordem, alternar } = useOrdenacao(filtradas, { campo: 'data', desc: true });

  const excluir = async (d) => {
    if (!window.confirm(`Excluir a decisão de ${d.nome} em ${fmtDataHora(d.data)}?`)) return;
    await api.decisoesExcluir(d.id);
    carregar();
  };

  const nomeConexao = conexaoFiltro ? (conexoes.find((c) => c.id === conexaoFiltro)?.nome || '') : 'Todas as conexões';
  const descricao = [nomeConexao, situacao || 'Todas as situações', busca ? `Busca: ${busca}` : null].filter(Boolean);

  const exportarExcel = async () => {
    try {
      const arq = await api.exportarExcel({
        nomeArquivo: 'historico-decisoes-credito.xlsx',
        abas: [{ nome: 'Decisões', colunas: COLS_EXCEL, linhas: ordenadas.map((d) => ({ ...d, dataFmt: fmtDataHora(d.data) })) }]
      });
      if (arq) api.abrirArquivo(arq);
    } catch (e) { setErro(e.message); }
  };
  const html = () => montarRelatorio({
    titulo: 'Histórico de Decisões de Crédito',
    subtitulo: `${fmtNum(ordenadas.length)} decisão(ões)`,
    empresa: conexaoFiltro ? nomeConexao : '',
    filtros: descricao,
    paisagem: true,
    blocos: [{ tipo: 'tabela', colunas: COLS_REL, linhas: ordenadas }]
  });
  const pdf = () => api.relatorioPdf({ html: html(), nomeArquivo: 'historico-decisoes-credito.pdf', paisagem: true }).catch((e) => setErro(e.message));
  const imprimir = () => api.relatorioImprimir({ html: html(), paisagem: true }).catch((e) => setErro(e.message));

  const alternarFiltros = () => setFiltrosAbertos((v) => { lsSet('ac.histFiltrosAbertos', !v); return !v; });

  const topo = (
    <>
      <Recolhivel aberto={filtrosAbertos}>
        <div className="card filtros">
          <label>Conexão
            <select value={conexaoFiltro} onChange={(e) => setConexaoFiltro(e.target.value)}>
              <option value="">Todas as conexões</option>
              {conexoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label>Situação
            <select value={situacao} onChange={(e) => setSituacao(e.target.value)}>
              <option value="">Todas</option>
              <option>Aprovado</option><option>Aprovado parcial</option><option>Negado</option><option>Em análise</option>
            </select>
          </label>
          <label className="largo">Buscar
            <div className="busca"><Search size={15} />
              <input placeholder="Código, cliente ou responsável…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
          </label>
        </div>
      </Recolhivel>
      {!filtrosAbertos && (
        <div className="filtros-resumo" onClick={alternarFiltros}>{descricao.map((t) => <span key={t}>{t}</span>)}</div>
      )}
      {erro && <div className="erro">{erro}</div>}
    </>
  );

  return (
    <div className="pagina cheia">
      <CabecalhoPagina
        titulo="Histórico de Decisões"
        subtitulo="Decisões de crédito registradas neste computador"
        filtrosAbertos={filtrosAbertos}
        onAlternarFiltros={alternarFiltros}
        acoes={<BotoesExportar onExcel={exportarExcel} onPdf={pdf} onImprimir={imprimir} desabilitado={!ordenadas.length} />}
      />
      <AreaDividida topo={topo}>
        <div className={`card tabela-card ${ordenadas.length ? '' : 'centro'}`}>
          {ordenadas.length === 0 ? (
            <Vazio icone={History} titulo="Nenhuma decisão encontrada" texto="As decisões registradas na ficha do cliente aparecem aqui." />
          ) : (
            <>
              <div className="tabela-topo"><span className="muted pequeno">{fmtNum(ordenadas.length)} registro(s)</span></div>
              <div className="tabela-wrap">
                <table className="tabela">
                  <thead>
                    <tr>
                      <Th titulo="Data" campo="data" ordem={ordem} onOrdenar={alternar} />
                      <Th titulo="Cliente" campo="nome" ordem={ordem} onOrdenar={alternar} />
                      <Th titulo="Situação" campo="situacao" ordem={ordem} onOrdenar={alternar} />
                      <Th titulo="Score" campo="score" num ordem={ordem} onOrdenar={alternar} />
                      <Th titulo="Perfil" campo="perfil" ordem={ordem} onOrdenar={alternar} />
                      <Th titulo="Sugerido" campo="limiteSugerido" num ordem={ordem} onOrdenar={alternar} />
                      <Th titulo="Aprovado" campo="limiteAprovado" num ordem={ordem} onOrdenar={alternar} />
                      <Th titulo="Prazo" campo="prazoAprovado" ordem={ordem} onOrdenar={alternar} />
                      <Th titulo="Período analisado" campo="periodoTxt" ordem={ordem} onOrdenar={alternar} />
                      <Th titulo="Responsável" campo="responsavel" ordem={ordem} onOrdenar={alternar} />
                      {!conexaoFiltro && <Th titulo="Conexão" campo="conexaoNome" ordem={ordem} onOrdenar={alternar} />}
                      <th>Observação</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenadas.map((d) => (
                      <tr key={d.id} className="sem-clique">
                        <td>{fmtDataHora(d.data)}</td>
                        <td><div className="cli-nome">{d.nome}</div><div className="cli-sub">{d.codigo}</div></td>
                        <td><span className={`sit sit-${(d.situacao || '').split(' ')[0].toLowerCase()}`}>{d.situacao}</span></td>
                        <td className="num">{d.score}</td>
                        <td><span className={`chip ${classePerfil(d.perfil)}`}>{d.perfil}</span></td>
                        <td className="num">{fmtMoeda(d.limiteSugerido)}</td>
                        <td className="num forte">{fmtMoeda(d.limiteAprovado)}</td>
                        <td>{d.prazoAprovado || '—'}</td>
                        <td>{d.periodoTxt}</td>
                        <td>{d.responsavel || '—'}</td>
                        {!conexaoFiltro && <td>{d.conexaoNome || '—'}</td>}
                        <td className="obs-cel">{d.observacao || '—'}</td>
                        <td><button className="btn-x" title="Excluir" onClick={() => excluir(d)}><Trash2 size={15} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </AreaDividida>
    </div>
  );
}
