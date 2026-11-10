import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { compararSnapshots, dataHora, descreverFiltros, moeda, numero, ordenarOrdens, pct, resumir } from '../lib/calc';
import GradeCusto from './GradeCusto';
import Resumo from './Resumo';
import Icone from './Icone';
import BotoesSaida from './BotoesSaida';

export default function Historico({ config, aviso, ativo }) {
  const [lista, setLista] = useState([]);
  const [aberto, setAberto] = useState(null);
  const [selA, setSelA] = useState('');
  const [selB, setSelB] = useState('');
  const [comparacao, setComparacao] = useState(null);
  const [ordenacao, setOrdenacao] = useState(null);
  const casas = Number(config?.preferencias?.casasCustoUnit ?? 2);

  async function carregar() {
    try { setLista(await api.histListar()); } catch (e) { aviso(e.message, 'erro'); }
  }

  useEffect(() => { if (ativo) carregar(); }, [ativo]); // eslint-disable-line react-hooks/exhaustive-deps

  async function abrir(id) {
    try { setAberto(await api.histAbrir(id)); setComparacao(null); setOrdenacao(null); } catch (e) { aviso(e.message, 'erro'); }
  }

  async function excluir(h) {
    if (!window.confirm(`Excluir "${h.nome}" do histórico? Esta ação não pode ser desfeita.`)) return;
    try {
      setLista(await api.histExcluir(h.id));
      if (aberto?.id === h.id) setAberto(null);
      aviso('Consulta excluída do histórico.');
    } catch (e) { aviso(e.message, 'erro'); }
  }

  async function comparar() {
    if (!selA || !selB || selA === selB) { aviso('Escolha duas consultas diferentes.', 'info'); return; }
    try {
      const [a, b] = await Promise.all([api.histAbrir(selA), api.histAbrir(selB)]);
      const [antigo, novo] = String(a.criadoEm) <= String(b.criadoEm) ? [a, b] : [b, a];
      setComparacao({ antigo, novo, linhas: compararSnapshots(antigo, novo) });
    } catch (e) { aviso(e.message, 'erro'); }
  }

  const ordensAbertas = useMemo(() => (aberto ? ordenarOrdens(aberto.ordens, ordenacao) : []), [aberto, ordenacao]);

  const dadosSaida = () => ({
    titulo: `Custo de Produto/Produção — ${aberto.nome}`,
    filtrosTexto: `${aberto.conexaoNome ? `Conexão ${aberto.conexaoNome}  •  ` : ''}${descreverFiltros(aberto.filtros, aberto.criadoEm)}`,
    ordens: ordensAbertas,
    casas,
    comData: aberto.comData
  });

  const totalAberto = useMemo(() => (aberto ? resumir(aberto.ordens) : null), [aberto]);
  const rotulo = h => `${h.nome} (${dataHora(h.criadoEm)})`;

  if (aberto) {
    return (
      <section className="pagina">
        <header className="pagina-topo">
          <div>
            <button className="link voltar" onClick={() => setAberto(null)}><Icone nome="voltar" tamanho={16} /> Histórico</button>
            <h1>{aberto.nome}</h1>
            <p>Salva em {dataHora(aberto.criadoEm)}{aberto.conexaoNome ? `, banco ${aberto.conexaoNome}` : ''}. {descreverFiltros(aberto.filtros)}.</p>
          </div>
          <div className="barra-acoes">
            <BotoesSaida dados={dadosSaida} aviso={aviso} />
          </div>
        </header>
        <Resumo r={totalAberto} casas={casas} />
        <GradeCusto ordens={ordensAbertas} casas={casas} comData={aberto.comData} total={totalAberto} ordenacao={ordenacao} aoOrdenar={setOrdenacao} />
      </section>
    );
  }

  return (
    <section className="pagina">
      <header className="pagina-topo">
        <div>
          <h1>Histórico</h1>
          <p>Consultas salvas neste computador. Abra uma para rever ou compare duas para ver como o custo por kg mudou.</p>
        </div>
      </header>

      <div className="painel comparar">
        <h2>Comparar custo por kg</h2>
        <div className="linha-comparar">
          <select value={selA} onChange={e => setSelA(e.target.value)} aria-label="Primeira consulta">
            <option value="">Primeira consulta</option>
            {lista.map(h => <option key={h.id} value={h.id}>{rotulo(h)}</option>)}
          </select>
          <span className="fraco">com</span>
          <select value={selB} onChange={e => setSelB(e.target.value)} aria-label="Segunda consulta">
            <option value="">Segunda consulta</option>
            {lista.map(h => <option key={h.id} value={h.id}>{rotulo(h)}</option>)}
          </select>
          <button onClick={comparar} disabled={lista.length < 2}>Comparar</button>
          {comparacao && <button className="sec" onClick={() => setComparacao(null)}>Fechar comparação</button>}
        </div>
        {lista.length < 2 && <p className="dica">Salve pelo menos duas consultas para comparar.</p>}
      </div>

      {comparacao && (
        <div className="tabela-scroll">
          <table className="grade simples">
            <thead>
              <tr>
                <th>Produto acabado</th>
                <th className="num">{comparacao.antigo.nome}</th>
                <th className="num">{comparacao.novo.nome}</th>
                <th className="num">Diferença /kg</th>
                <th className="num">Variação</th>
              </tr>
            </thead>
            <tbody>
              {comparacao.linhas.map(l => (
                <tr key={l.codigo}>
                  <td className="produto"><span className="cod">{l.codigo}</span><span className="desc">{l.descricao}</span></td>
                  <td className="num">{l.custoKgA === null ? '—' : numero(l.custoKgA, casas)}</td>
                  <td className="num">{l.custoKgB === null ? '—' : numero(l.custoKgB, casas)}</td>
                  <td className="num">{l.diferenca === null ? '—' : numero(l.diferenca, casas)}</td>
                  <td className={`num ${l.variacao > 0 ? 'sobe' : l.variacao < 0 ? 'desce' : ''}`}>
                    {l.variacao === null ? '—' : `${l.variacao > 0 ? '+' : l.variacao < 0 ? '−' : ''}${pct(Math.abs(l.variacao))}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!comparacao && (
        lista.length ? (
          <div className="tabela-scroll">
            <table className="grade simples">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Banco</th>
                  <th>Salva em</th>
                  <th>Filtros</th>
                  <th className="num">Ordens</th>
                  <th className="num">Custo total</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {lista.map(h => (
                  <tr key={h.id} className="clicavel" onClick={() => abrir(h.id)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && abrir(h.id)}>
                    <td className="forte">{h.nome}</td>
                    <td>{h.conexaoNome || '—'}</td>
                    <td className="fraco">{dataHora(h.criadoEm)}</td>
                    <td className="fraco quebra">{descreverFiltros(h.filtros)}</td>
                    <td className="num">{h.qtdOrdens}</td>
                    <td className="num valor">{moeda(h.custoTotal)}</td>
                    <td className="num">
                      <button className="icone-btn perigo" title="Excluir do histórico" onClick={e => { e.stopPropagation(); excluir(h); }}>
                        <Icone nome="lixo" tamanho={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="estado-vazio">
            <p>Nenhuma consulta salva ainda. Em Custo de produção, consulte e use <b>Salvar no histórico</b>.</p>
          </div>
        )
      )}
    </section>
  );
}
