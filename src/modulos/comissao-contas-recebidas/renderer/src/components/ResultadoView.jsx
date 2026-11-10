import { Fragment, useEffect, useMemo, useState } from 'react';
import Icone from './Icone.jsx';
import TabelaArrastavel from './TabelaArrastavel.jsx';
import { dataBR, moeda, pct, qtd } from '../fmt.js';

// Mostra o resultado do relatório (usado no Relatório e nos Fechamentos)
export default function ResultadoView({ resultado, mostrarItens, aoMudarMostrarItens }) {
  const [aba, setAba] = useState('detalhado');
  const [busca, setBusca] = useState('');
  const [abertos, setAbertos] = useState(() => new Set());

  useEffect(() => {
    setAbertos(mostrarItens ? new Set(resultado.pedidos.map((p) => p.pedido)) : new Set());
  }, [resultado, mostrarItens]);

  const pedidos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return resultado.pedidos;
    return resultado.pedidos.filter(
      (p) =>
        p.pedido.toLowerCase().includes(q) ||
        p.nomeCliente.toLowerCase().includes(q) ||
        p.codCliente.toLowerCase().includes(q) ||
        p.parcelas.some((pa) => pa.documento.toLowerCase().includes(q)) ||
        p.itens.some((i) => i.descProduto.toLowerCase().includes(q) || i.fabricante.toLowerCase().includes(q))
    );
  }, [resultado, busca]);

  const alternar = (id) =>
    setAbertos((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const t = resultado.totais;
  const diferenca = Math.round(((t.comissaoItens || 0) - t.comissao) * 100) / 100;

  return (
    <div className="resultado">
      <div className="kpis">
        <div className="kpi">
          <span>Pedidos</span>
          <strong>{t.pedidos}</strong>
          <small>
            {t.pedidos}/{t.parcelas} (pedidos/parcelas)
          </small>
        </div>
        <div className="kpi">
          <span>Total dos pedidos</span>
          <strong>{moeda(t.totalPedidos)}</strong>
        </div>
        <div className="kpi">
          <span>Total recebido</span>
          <strong>{moeda(t.recebido)}</strong>
          <small>baixas no período</small>
        </div>
        <div className="kpi destaque">
          <span>Comissão a pagar</span>
          <strong>{moeda(t.comissao)}</strong>
          <small title="Soma da comissão calculada item a item (sem devoluções), para conferência">
            pelos itens: {moeda(t.comissaoItens)}
            {diferenca !== 0 && <em className={diferenca > 0 ? 'pos' : 'neg'}> ({diferenca > 0 ? '+' : ''}{moeda(diferenca)})</em>}
          </small>
        </div>
      </div>

      <TabelaArrastavel
        cabecalho={
          <div className="barra-resultado">
            <div className="abas">
              {[
                ['detalhado', 'Detalhado'],
                ['fabricante', `Por fabricante (${resultado.porFabricante.length})`],
                ['vendedor', `Por vendedor (${resultado.porVendedor.length})`]
              ].map(([id, r]) => (
                <button key={id} className={'aba' + (aba === id ? ' ativa' : '')} onClick={() => setAba(id)}>
                  {r}
                </button>
              ))}
            </div>
            {aba === 'detalhado' && (
              <div className="barra-direita">
                <div className="busca">
                  <Icone nome="buscar" tamanho={15} />
                  <input placeholder="Filtrar pedido, cliente, documento, produto…" value={busca} onChange={(e) => setBusca(e.target.value)} />
                </div>
                <label className="chave">
                  <input type="checkbox" checked={mostrarItens} onChange={(e) => aoMudarMostrarItens(e.target.checked)} />
                  <span className="trilho" />
                  Mostrar itens
                </label>
              </div>
            )}
          </div>
        }
      >
        {aba === 'detalhado' && (
          <table className="tabela">
            <thead>
              <tr>
                <th style={{ width: 34 }} />
                <th>Pedido</th>
                <th>Data</th>
                <th>Cliente</th>
                <th>Documento</th>
                <th>Vencimento</th>
                <th>Baixa</th>
                <th className="n">Total pedido</th>
                <th className="n">Recebido</th>
                <th className="n">% Com.</th>
                <th className="n">Comissão</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => {
                const aberto = abertos.has(p.pedido);
                return (
                  <Fragment key={p.pedido}>
                    {p.parcelas.map((pa, idx) => (
                      <tr key={idx} className={'linha-parcela' + (idx > 0 ? ' continua' : '')}>
                        <td>
                          {idx === 0 && p.itens.length > 0 && (
                            <button className={'btn-expandir' + (aberto ? ' aberto' : '')} onClick={() => alternar(p.pedido)} title={aberto ? 'Ocultar itens' : 'Mostrar itens'}>
                              <Icone nome="seta" tamanho={14} />
                            </button>
                          )}
                        </td>
                        {/* parcelas seguintes do mesmo pedido: só o número do pedido fica em branco */}
                        <td className="mono">
                          {idx === 0 && (
                            <>
                              {p.pedido}
                              {temST(p) && (
                                <span className="selo-st" title={`Pedido com ICMS-ST: ${moeda(totalSTPedido(p))}`}>
                                  ST
                                </span>
                              )}
                            </>
                          )}
                        </td>
                        <td>{dataBR(p.dataPedido)}</td>
                        <td>
                          <span className="cod">{p.codCliente}</span> {p.nomeCliente}
                        </td>
                        <td className="mono">{pa.documento}</td>
                        <td>{dataBR(pa.vencimento)}</td>
                        <td>{dataBR(pa.dataBaixa)}</td>
                        <td className="n">{moeda(pa.totalPedido)}</td>
                        <td className="n">{moeda(pa.valorRecebido)}</td>
                        <td className="n">{pct(pa.percComis)}</td>
                        <td className="n forte">{moeda(pa.valorComissao)}</td>
                      </tr>
                    ))}
                    {aberto && p.itens.length > 0 && (
                      <tr className="linha-itens">
                        <td />
                        <td colSpan={10}>
                          <table className="subtabela">
                            <thead>
                              <tr>
                                <th>Produto</th>
                                <th>Descrição</th>
                                <th>Fabricante</th>
                                <th className="n">Quant.</th>
                                <th className="n">Valor item</th>
                                <th className="n">ICMS-ST</th>
                                <th className="n">% Fabr.</th>
                                <th className="n">Comissão item</th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.itens.map((i, k) => (
                                <tr key={k}>
                                  <td className="mono">{i.codProduto}</td>
                                  <td>{i.descProduto}</td>
                                  <td>{i.fabricante}</td>
                                  <td className="n">{qtd(i.quant)}</td>
                                  <td className="n">{moeda(i.valorTotalItem)}</td>
                                  <td className="n">{i.stItem ? <span className="valor-st">{moeda(i.stItem)}</span> : '—'}</td>
                                  <td className="n">{pct(i.perFabr)}</td>
                                  <td className="n">{moeda(i.valorComissaoItem)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {!pedidos.length && (
                <tr>
                  <td colSpan={11} className="vazio">
                    Nenhum pedido encontrado com esse filtro.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td />
                <td colSpan={6}>
                  TOTAL — {t.pedidos} pedidos / {t.parcelas} parcelas
                </td>
                <td className="n">{moeda(t.totalPedidos)}</td>
                <td className="n">{moeda(t.recebido)}</td>
                <td />
                <td className="n">{moeda(t.comissao)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        {aba === 'fabricante' && (
          <table className="tabela">
            <thead>
              <tr>
                <th>Fabricante</th>
                <th className="n">Pedidos</th>
                <th className="n">Itens</th>
                <th className="n">Quant.</th>
                <th className="n">Valor vendido</th>
                <th className="n">Comissão (itens)</th>
                <th style={{ width: '28%' }}>Participação</th>
              </tr>
            </thead>
            <tbody>
              {resultado.porFabricante.map((f) => (
                <tr key={f.fabricante}>
                  <td>{f.fabricante}</td>
                  <td className="n">{f.pedidos}</td>
                  <td className="n">{f.itens}</td>
                  <td className="n">{qtd(f.quant)}</td>
                  <td className="n">{moeda(f.valor)}</td>
                  <td className="n forte">{moeda(f.comissao)}</td>
                  <td>
                    <Barra valor={f.comissao} total={t.comissaoItens} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>TOTAL</td>
                <td />
                <td className="n">{t.itens}</td>
                <td />
                <td className="n">{moeda(resultado.porFabricante.reduce((s, f) => s + f.valor, 0))}</td>
                <td className="n">{moeda(t.comissaoItens)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}

        {aba === 'vendedor' && (
          <table className="tabela">
            <thead>
              <tr>
                <th>Código</th>
                <th>Vendedor</th>
                <th className="n">Pedidos</th>
                <th className="n">Parcelas</th>
                <th className="n">Recebido</th>
                <th className="n">Comissão</th>
                <th style={{ width: '28%' }}>Participação</th>
              </tr>
            </thead>
            <tbody>
              {resultado.porVendedor.map((v) => (
                <tr key={v.codigo}>
                  <td className="mono">{v.codigo}</td>
                  <td>{v.nome || '—'}</td>
                  <td className="n">{v.pedidos}</td>
                  <td className="n">{v.parcelas}</td>
                  <td className="n">{moeda(v.recebido)}</td>
                  <td className="n forte">{moeda(v.comissao)}</td>
                  <td>
                    <Barra valor={v.comissao} total={t.comissao} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>TOTAL</td>
                <td className="n">{t.pedidos}</td>
                <td className="n">{t.parcelas}</td>
                <td className="n">{moeda(t.recebido)}</td>
                <td className="n">{moeda(t.comissao)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </TabelaArrastavel>
    </div>
  );
}

function Barra({ valor, total }) {
  const p = total > 0 ? Math.max(0, Math.min(100, (valor / total) * 100)) : 0;
  return (
    <div className="barra">
      <div className="barra-trilho">
        <div className="barra-valor" style={{ width: p + '%' }} />
      </div>
      <span>{p.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>
    </div>
  );
}

// pedido tem ICMS-ST?
function totalSTPedido(p) {
  return p.totalST || p.itens.reduce((x, i) => x + (i.stItem || 0), 0);
}
function temST(p) {
  return totalSTPedido(p) > 0;
}
