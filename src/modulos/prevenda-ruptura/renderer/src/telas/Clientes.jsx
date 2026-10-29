import React, { useState } from 'react';
import { Campo, fmtData, hojeISO, useDialogos, useOrdenacao } from '../ui.jsx';

export default function Clientes({ conexao, onAbrirCliente }) {
  const dlg = useDialogos();
  const [dataIni, setDataIni] = useState(hojeISO());
  const [dataFim, setDataFim] = useState(hojeISO());
  const [lista, setLista] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const ord = useOrdenacao();

  const consultar = async (e) => {
    e?.preventDefault();
    if (dataIni > dataFim) return dlg.alerta('O período inicial é maior que o final.');
    setCarregando(true);
    try { setLista(await window.api.erp.clientesRupturas({ dataIni, dataFim })); }
    catch (err) { dlg.erro(err, 'Erro ao consultar os clientes'); }
    finally { setCarregando(false); }
  };

  const exportar = async () => {
    try {
      const arq = await window.api.exportarExcel({ tipo: 'clientes', linhas: visiveis, titulo: `Clientes com rupturas — ${conexao.nome} — ${fmtData(dataIni + 'T12:00')} a ${fmtData(dataFim + 'T12:00')}` });
      if (arq) dlg.toast('Planilha exportada.');
    } catch (err) { dlg.erro(err); }
  };

  const visiveis = lista ? ord.aplicar(lista) : [];
  const totalItens = (lista || []).reduce((s, c) => s + c.itensPendentes, 0);

  return (
    <>
      <div className="cabeca">
        <div>
          <h1>Clientes com rupturas</h1>
          <p>Clientes com itens ainda pendentes no período. Clique no cliente para ver as rupturas dele.</p>
        </div>
      </div>
      <form className="filtros" onSubmit={consultar}>
        <Campo rotulo="Período inicial"><input type="date" value={dataIni} onChange={(e) => setDataIni(e.target.value)} /></Campo>
        <Campo rotulo="Período final"><input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} /></Campo>
        <div className="acoes">
          <button type="button" className="btn" onClick={() => setLista(null)}>Limpar</button>
          <button className="btn primario" disabled={carregando}>{carregando ? <><span className="carregando" /> Consultando…</> : 'Consultar'}</button>
        </div>
      </form>
      <div className="barra">
        {lista && <div className="resumo num"><span><b>{lista.length}</b> clientes com ruptura</span><span className="pend"><b>{totalItens}</b> itens pendentes</span></div>}
        <div className="direita"><button className="btn" onClick={exportar} disabled={!visiveis.length}>Exportar Excel</button></div>
      </div>
      <div className="grade-wrap">
        <table className="grade">
          <thead>
            <tr>
              {[['codCliente', 'Código'], ['nomeCliente', 'Cliente'], ['qtdPedidos', 'Pedidos do cliente', 'r'], ['itensPendentes', 'Itens pendentes', 'r'], ['primeira', 'Primeira ruptura', 'c'], ['ultima', 'Última ruptura', 'c']]
                .map(([k, n, cl]) => <th key={k} className={cl} onClick={() => ord.alternar(k)}>{n}{ord.seta(k)}</th>)}
            </tr>
          </thead>
          <tbody>
            {lista === null && <tr className="vazio"><td colSpan={6}>Escolha o período e clique em <b>Consultar</b>.</td></tr>}
            {lista && lista.length === 0 && <tr className="vazio"><td colSpan={6}>Nenhum cliente com ruptura pendente no período.</td></tr>}
            {visiveis.map((c) => (
              <tr key={c.codCliente} className="clicavel" onClick={() => onAbrirCliente({ cliente: c.codCliente, nomeCliente: c.nomeCliente, dataIni, dataFim })}>
                <td className="num">{c.codCliente}</td>
                <td><b style={{ fontWeight: 600 }}>{c.nomeCliente}</b></td>
                <td className="r num">{c.qtdPedidos}</td>
                <td className="r num falta">{c.itensPendentes}</td>
                <td className="c num">{fmtData(c.primeira)}</td>
                <td className="c num">{fmtData(c.ultima)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
