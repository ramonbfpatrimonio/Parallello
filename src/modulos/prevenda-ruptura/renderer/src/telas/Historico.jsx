import React, { useEffect, useMemo, useState } from 'react';
import { Modal, cxun, fmtDataHora, useDialogos } from '../ui.jsx';

export default function Historico({ conexao }) {
  const dlg = useDialogos();
  const [lista, setLista] = useState([]);
  const [texto, setTexto] = useState('');
  const [aberto, setAberto] = useState(null);

  useEffect(() => { window.api.historico().then(setLista).catch((e) => dlg.erro(e)); }, [conexao.id]);

  const visiveis = useMemo(() => {
    const t = texto.trim().toLowerCase();
    if (!t) return lista;
    return lista.filter((h) => [h.numero, h.codCliente, h.nomeCliente, h.nroPedClie, h.usuario, h.nomeEquipe, ...(h.pvOrigens || [])].some((x) => String(x || '').toLowerCase().includes(t)));
  }, [lista, texto]);

  const exportar = async () => {
    try {
      const arq = await window.api.exportarExcel({ tipo: 'historico', linhas: visiveis, titulo: `PVs de ruptura geradas — ${conexao.nome}` });
      if (arq) dlg.toast('Planilha exportada.');
    } catch (e) { dlg.erro(e); }
  };

  return (
    <>
      <div className="cabeca">
        <div>
          <h1>PVs geradas</h1>
          <p>Pré-vendas de ruptura geradas por este computador para {conexao.nome}.</p>
        </div>
      </div>
      <div className="barra">
        <div className="resumo num"><span><b>{lista.length}</b> pré-vendas registradas</span></div>
        <div className="direita">
          <input className="solto" placeholder="Filtrar por PV, cliente, pedido, usuário…" value={texto} onChange={(e) => setTexto(e.target.value)} style={{ width: 280 }} />
          <button className="btn" onClick={exportar} disabled={!visiveis.length}>Exportar Excel</button>
        </div>
      </div>
      <div className="grade-wrap">
        <table className="grade">
          <thead><tr><th>Data e hora</th><th>PV gerada</th><th>Cliente</th><th>Nº ped. cliente</th><th>Equipe</th><th className="r">Itens</th><th>PVs de origem</th><th>Usuário</th><th>Estação</th></tr></thead>
          <tbody>
            {visiveis.length === 0 && <tr className="vazio"><td colSpan={9}>{lista.length ? 'Nada encontrado com esse filtro.' : 'Nenhuma pré-venda de ruptura foi gerada ainda neste computador.'}</td></tr>}
            {visiveis.map((h) => (
              <tr key={h.id} className="clicavel" onClick={() => setAberto(h)}>
                <td className="num">{fmtDataHora(h.quando)}</td>
                <td className="num"><b style={{ color: 'var(--atendida)' }}>{h.numero}/{h.ano}</b></td>
                <td>{h.codCliente} — {h.nomeCliente}</td>
                <td>{h.nroPedClie}</td>
                <td>{h.nomeEquipe}</td>
                <td className="r num">{h.qtdItens}</td>
                <td>{(h.pvOrigens || []).join(', ')}</td>
                <td>{String(h.usuario || '').toUpperCase()}</td>
                <td>{h.estacao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {aberto && (
        <Modal tamanho="largo" titulo={`Pré-venda ${aberto.numero}/${aberto.ano}`} sub={`${aberto.codCliente} — ${aberto.nomeCliente}. Gerada em ${fmtDataHora(aberto.quando)} por ${String(aberto.usuario).toUpperCase()}.`} semPre onFechar={() => setAberto(null)}
          rodape={<button className="btn primario" onClick={() => setAberto(null)}>Fechar</button>}>
          <table className="mini">
            <thead><tr><th>PV origem</th><th>Produto</th><th>Descrição</th><th className="r">Quantidade (cx/un)</th></tr></thead>
            <tbody>{(aberto.itens || []).map((i, k) => <tr key={k}><td>{i.pvOrigem}</td><td>{i.produto}</td><td>{i.descricao}</td><td className="r num">{cxun(i.faltaCx, i.faltaUn)}</td></tr>)}</tbody>
          </table>
        </Modal>
      )}
    </>
  );
}
