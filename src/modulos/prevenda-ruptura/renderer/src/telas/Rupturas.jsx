import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Campo, Modal, cxun, fmtData, hojeISO, useDialogos, useOrdenacao } from '../ui.jsx';

const FILTROS_INICIAIS = () => ({ cliente: '', nomeCliente: '', fabricante: 'TODOS', pedido: '', dataIni: hojeISO(), dataFim: hojeISO() });

export default function Rupturas({ ativa, pedidoExterno, onPendentes, conexao }) {
  const dlg = useDialogos();
  const [f, setF] = useState(FILTROS_INICIAIS);
  const [estadoCliente, setEstadoCliente] = useState(''); // '', 'ok', 'erro'
  const [fabricantes, setFabricantes] = useState([]);
  const [linhas, setLinhas] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [soPendentes, setSoPendentes] = useState(false);
  const [texto, setTexto] = useState('');
  const [sel, setSel] = useState(new Set());
  const [ancora, setAncora] = useState(null);
  const [confirmacao, setConfirmacao] = useState(null);
  const [resultado, setResultado] = useState(null);
  const ord = useOrdenacao();

  useEffect(() => {
    window.api.erp.fabricantes().then(setFabricantes).catch((e) => dlg.erro(e, 'Não foi possível carregar os fabricantes'));
  }, [conexao.id]);

  // vindo da tela "Clientes com rupturas"
  useEffect(() => {
    if (!pedidoExterno) return;
    const nf = { ...FILTROS_INICIAIS(), cliente: pedidoExterno.cliente, nomeCliente: pedidoExterno.nomeCliente, dataIni: pedidoExterno.dataIni, dataFim: pedidoExterno.dataFim };
    setF(nf);
    setEstadoCliente('ok');
    setSoPendentes(true);
    buscar(nf);
  }, [pedidoExterno]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function buscar(filtros = f, silencioso = false) {
    if (!filtros.dataIni || !filtros.dataFim) return dlg.alerta('Informe o período inicial e final.');
    if (filtros.dataIni > filtros.dataFim) return dlg.alerta('O período inicial é maior que o final.');
    setCarregando(true);
    try {
      const r = await window.api.erp.rupturas(filtros);
      setLinhas(r);
      setSel(new Set());
      setAncora(null);
      const pend = r.filter((l) => !l.atendida).length;
      onPendentes(pend);
      if (!silencioso && pend === 0) {
        dlg.alerta(r.length ? 'Todas as rupturas do período já foram atendidas.' : 'Não há ruptura para esse filtro no período selecionado.', { titulo: 'Nenhuma ruptura pendente', tipo: 'info' });
      }
    } catch (e) {
      dlg.erro(e, 'Erro ao buscar as rupturas');
    } finally { setCarregando(false); }
  }

  const limpar = () => {
    setF(FILTROS_INICIAIS());
    setEstadoCliente('');
    setLinhas(null);
    setSel(new Set());
    setTexto('');
    onPendentes(null);
  };

  // ---------- lista visível ----------
  const visiveis = useMemo(() => {
    if (!linhas) return [];
    const t = texto.trim().toLowerCase();
    let v = linhas.filter((l) => (!soPendentes || !l.atendida));
    if (t) v = v.filter((l) => [l.codCliente, l.nomeCliente, l.numero, l.nroPedClie, l.produto, l.descricao, l.fabricante, l.novaPV].some((x) => String(x).toLowerCase().includes(t)));
    return ord.aplicar(v, { falta: (l) => l.faltaTotal, estoque: (l) => l.estoqueTotal, compra: (l) => l.compraTotal, pv: (l) => l.pvCx * l.upc + l.pvUn, pd: (l) => l.pdCx * l.upc + l.pdUn, posicao: (l) => l.posicao });
  }, [linhas, soPendentes, texto, ord]);

  const tot = useMemo(() => {
    const l = linhas || [];
    return { total: l.length, pend: l.filter((x) => !x.atendida).length, atend: l.filter((x) => x.atendida).length };
  }, [linhas]);

  const selecionadas = useMemo(() => visiveis.filter((l) => sel.has(l.chave)).concat((linhas || []).filter((l) => sel.has(l.chave) && !visiveis.includes(l))), [visiveis, linhas, sel]);

  const clicarLinha = (l, idx, ev) => {
    if (l.atendida) return;
    const n = new Set(sel);
    if (ev.shiftKey && ancora !== null) {
      const [a, b] = [Math.min(ancora, idx), Math.max(ancora, idx)];
      for (let i = a; i <= b; i++) if (!visiveis[i].atendida) n.add(visiveis[i].chave);
    } else if (n.has(l.chave)) n.delete(l.chave);
    else n.add(l.chave);
    setSel(n);
    setAncora(idx);
  };

  const selecionarPedido = () => {
    const ref = selecionadas[0];
    if (!ref) return;
    const n = new Set(sel);
    for (const l of linhas) if (!l.atendida && l.codCliente === ref.codCliente && l.nroPedClie === ref.nroPedClie && l.nomeEquipe === ref.nomeEquipe) n.add(l.chave);
    setSel(n);
  };

  const todasPendentesVisiveis = visiveis.filter((l) => !l.atendida);
  const todasMarcadas = todasPendentesVisiveis.length > 0 && todasPendentesVisiveis.every((l) => sel.has(l.chave));
  const marcarTodas = () => setSel(todasMarcadas ? new Set() : new Set(todasPendentesVisiveis.map((l) => l.chave)));

  // ---------- gerar PV ----------
  async function prepararGeracao() {
    const itens = selecionadas;
    if (!itens.length) return dlg.alerta('Selecione as linhas de ruptura que deseja gerar a pré-venda.');
    try {
      const erros = await window.api.erp.validar(itens);
      if (erros.length) return dlg.alerta(erros.join('\n\n'), { titulo: 'Ação bloqueada', tipo: 'erro' });
    } catch (e) { return dlg.erro(e); }
    const p = itens[0];
    const naoSelecionados = p.nroPedClie
      ? linhas.filter((l) => !l.atendida && !sel.has(l.chave) && l.codCliente === p.codCliente && l.nroPedClie === p.nroPedClie)
      : [];
    const estoqueBaixo = itens.filter((l) => l.faltaTotal > l.estoqueTotal);
    setConfirmacao({ itens, naoSelecionados, estoqueBaixo });
  }

  async function gerar() {
    const { itens } = confirmacao;
    setConfirmacao((c) => ({ ...c, gerando: true }));
    try {
      const r = await window.api.erp.gerar(itens);
      setConfirmacao(null);
      setResultado(r);
      buscar(f, true);
    } catch (e) {
      setConfirmacao(null);
      dlg.erro(e, 'A pré-venda não foi gerada');
    }
  }

  const exportar = async () => {
    if (!visiveis.length) return;
    try {
      const titulo = `Rupturas — ${conexao.nome} — ${fmtData(f.dataIni + 'T12:00')} a ${fmtData(f.dataFim + 'T12:00')}${f.cliente ? ' — Cliente ' + f.cliente : ''}`;
      const arq = await window.api.exportarExcel({ tipo: 'rupturas', linhas: visiveis, titulo });
      if (arq) dlg.toast('Planilha exportada.');
    } catch (e) { dlg.erro(e); }
  };

  return (
    <>
      <div className="cabeca">
        <div>
          <h1>Rupturas</h1>
          <p>Itens da pré-venda que não foram para o pedido. Selecione as linhas e gere a pré-venda de ruptura.</p>
        </div>
      </div>

      <form className="filtros" onSubmit={(e) => { e.preventDefault(); buscar(); }}>
        <ClienteFiltro f={f} setF={setF} estado={estadoCliente} setEstado={setEstadoCliente} ativa={ativa} />
        <Campo rotulo="Fabricante">
          <select value={f.fabricante} onChange={set('fabricante')} style={{ width: 170 }}>
            <option value="TODOS">Todos</option>
            {fabricantes.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Nº pedido do cliente"><input value={f.pedido} onChange={set('pedido')} style={{ width: 130 }} /></Campo>
        <Campo rotulo="Período inicial"><input type="date" value={f.dataIni} onChange={set('dataIni')} /></Campo>
        <Campo rotulo="Período final"><input type="date" value={f.dataFim} onChange={set('dataFim')} /></Campo>
        <div className="acoes">
          <button type="button" className="btn" onClick={limpar}>Limpar</button>
          <button className="btn primario" disabled={carregando}>{carregando ? <><span className="carregando" /> Buscando…</> : 'Buscar rupturas'}</button>
        </div>
      </form>

      <div className="barra">
        {linhas && (
          <div className="resumo num">
            <span><b>{tot.total}</b> itens com falta</span>
            <span className="pend"><b>{tot.pend}</b> pendentes</span>
            <span className="atend"><b>{tot.atend}</b> já atendidos</span>
          </div>
        )}
        <div className="direita">
          <label className="check"><input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} /> Exibir só pendentes</label>
          <input className="solto" placeholder="Filtrar na lista…" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <button className="btn" onClick={exportar} disabled={!visiveis.length}>Exportar Excel</button>
          {sel.size > 0 ? (
            <div className="selecao-info">
              <span><b>{sel.size}</b> selecionada{sel.size > 1 ? 's' : ''}</span>
              <button className="btn fantasma peq" onClick={selecionarPedido} title="Seleciona todas as linhas pendentes do mesmo cliente, pedido e equipe">Todo o pedido</button>
              <button className="btn fantasma peq" onClick={() => setSel(new Set())}>Limpar</button>
              <button className="btn gerar" onClick={prepararGeracao}>Gerar pré-venda</button>
            </div>
          ) : (
            <button className="btn gerar" disabled>Gerar pré-venda</button>
          )}
        </div>
      </div>

      <div className="grade-wrap">
        <table className="grade">
          <thead>
            <tr>
              <th className="c" onClick={marcarTodas} title="Marcar/desmarcar pendentes visíveis">
                <input type="checkbox" readOnly checked={todasMarcadas} style={{ accentColor: 'var(--marca)' }} />
              </th>
              {[
                ['nomeCliente', 'Cliente'], ['numero', 'Nº PV'], ['posicao', 'PV ref.'], ['nroPedClie', 'Nº ped. cliente'],
                ['descricao', 'Produto'], ['fabricante', 'Fabricante'], ['unid', 'Und', 'c'], ['pv', 'Pré-venda', 'r'],
                ['pd', 'Pedido', 'r'], ['falta', 'Falta', 'r'], ['estoque', 'Estoque'], ['compra', 'Compra', 'r'], ['dataPV', 'Data PV', 'c'],
              ].map(([k, n, cl]) => <th key={k} className={cl} onClick={() => ord.alternar(k)}>{n}{ord.seta(k)}</th>)}
            </tr>
          </thead>
          <tbody>
            {linhas === null && <tr className="vazio"><td colSpan={15}>Informe os filtros e clique em <b>Buscar rupturas</b>.</td></tr>}
            {linhas && visiveis.length === 0 && <tr className="vazio"><td colSpan={15}>Nenhuma linha para exibir com os filtros atuais.</td></tr>}
            {visiveis.map((l, idx) => {
              const s = sel.has(l.chave);
              const cob = l.faltaTotal > 0 ? Math.min(1, Math.max(0, l.estoqueTotal) / l.faltaTotal) : 1;
              return (
                <tr key={l.chave} className={`${l.atendida ? 'atendida' : 'clicavel'} ${s ? 'selecionada' : ''}`} onClick={(e) => clicarLinha(l, idx, e)}>
                  <td className="chk">{!l.atendida && <input type="checkbox" checked={s} readOnly tabIndex={-1} />}</td>
                  <td className="duplo" title={`${l.codCliente} - ${l.nomeCliente}`}><span><b className="num">{l.codCliente}</b>{l.nomeCliente}</span></td>
                  <td className="num">{l.numero}</td>
                  <td>
                    <span className="posicao"><span className="n">{l.posicao}ª</span>
                      {l.atendida ? <span className="selo atendida">PV {l.novaPV}</span> : <span className="selo pend">ruptura</span>}
                    </span>
                  </td>
                  <td>{l.nroPedClie}</td>
                  <td className="duplo prod desc" title={l.descricao}><span><b className="num">{l.produto}</b>{l.descricao}</span></td>
                  <td className="duplo fab" title={l.fabricante}><span>{l.fabricante}</span></td>
                  <td className="c">{l.unid}/{l.upc}</td>
                  <td className="r num">{cxun(l.pvCx, l.pvUn)}</td>
                  <td className="r num">{cxun(l.pdCx, l.pdUn)}</td>
                  <td className="r num falta">{cxun(l.faltaCx, l.faltaUn)}</td>
                  <td className="num">
                    <span className={`estoque est-${l.situacaoEstoque}`} title={l.situacaoEstoque === 'ok' ? 'Estoque cobre a falta' : l.situacaoEstoque === 'parcial' ? 'Estoque cobre só parte da falta' : 'Sem estoque'}>
                      <span className={`cobertura est-${l.situacaoEstoque}`}><i style={{ width: `${cob * 100}%` }} /></span>
                      {cxun(l.estoqueCx, l.estoqueUn)}
                    </span>
                  </td>
                  <td className="r num">{cxun(l.compraCx, l.compraUn)}</td>
                  <td className="c num">{fmtData(l.dataPV)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirmacao && <ConfirmarGeracao dados={confirmacao} onCancelar={() => setConfirmacao(null)} onGerar={gerar} />}
      {resultado && <Resultado r={resultado} onFechar={() => setResultado(null)} />}
    </>
  );
}

function ClienteFiltro({ f, setF, estado, setEstado, ativa }) {
  const [sugestoes, setSugestoes] = useState([]);
  const [aberta, setAberta] = useState(false);
  const [foco, setFoco] = useState(0);
  const tRef = useRef();

  const mudar = (v) => {
    setF((x) => ({ ...x, cliente: v, nomeCliente: '' }));
    setEstado('');
    clearTimeout(tRef.current);
    if (v.trim().length >= 2 && !/^\d+$/.test(v.trim())) {
      tRef.current = setTimeout(async () => {
        try { const r = await window.api.erp.buscarClientes(v); setSugestoes(r); setAberta(true); setFoco(0); } catch {}
      }, 250);
    } else setAberta(false);
  };

  const escolher = (c) => {
    setF((x) => ({ ...x, cliente: c.Codigo, nomeCliente: c.Nome }));
    setEstado('ok');
    setAberta(false);
  };

  const conferir = async () => {
    setTimeout(() => setAberta(false), 150);
    const v = f.cliente.trim();
    if (!v || !/^\d+$/.test(v)) return;
    const cod = v.padStart(5, '0');
    try {
      const nome = await window.api.erp.nomeCliente(cod);
      setF((x) => ({ ...x, cliente: cod, nomeCliente: nome || 'Cliente não encontrado' }));
      setEstado(nome ? 'ok' : 'erro');
    } catch {}
  };

  const tecla = (e) => {
    if (!aberta || !sugestoes.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setFoco((i) => Math.min(i + 1, sugestoes.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setFoco((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); escolher(sugestoes[foco]); }
    if (e.key === 'Escape') setAberta(false);
  };

  return (
    <div className="cliente-campo">
      <Campo rotulo="Cliente (código ou nome)">
        <input className="cod" style={{ width: 150 }} value={f.cliente} onChange={(e) => mudar(e.target.value)} onBlur={conferir} onKeyDown={tecla} placeholder="Todos" />
      </Campo>
      <div className={`cliente-nome ${estado}`} title={f.nomeCliente}>{f.nomeCliente || (f.cliente ? '…' : 'Todos os clientes')}</div>
      {aberta && ativa && (
        <div className="lista-busca">
          {sugestoes.length === 0 && <div style={{ padding: 10, color: 'var(--tinta-2)' }}>Nenhum cliente encontrado.</div>}
          {sugestoes.map((c, i) => (
            <button type="button" key={c.Codigo} className={i === foco ? 'foco' : ''} onMouseDown={() => escolher(c)}><b>{c.Codigo}</b>{c.Nome}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfirmarGeracao({ dados, onCancelar, onGerar }) {
  const { itens, naoSelecionados, estoqueBaixo, gerando } = dados;
  const p = itens[0];
  const origens = [...new Set(itens.map((i) => i.numero))];
  return (
    <Modal tamanho="largo" titulo="Gerar pré-venda de ruptura" sub="Confira os dados antes de gravar no ERP." semPre onFechar={gerando ? undefined : onCancelar}
      rodape={<>
        <button className="btn" onClick={onCancelar} disabled={gerando}>Cancelar</button>
        <button className="btn gerar" onClick={onGerar} disabled={gerando} autoFocus>
          {gerando ? <><span className="carregando" /> Gravando no ERP…</> : `Gerar pré-venda com ${itens.length} ${itens.length > 1 ? 'itens' : 'item'}`}
        </button>
      </>}>
      <div className="ficha">
        <div><span>Cliente</span><b>{p.codCliente}</b> {p.nomeCliente}</div>
        <div><span>Nº pedido do cliente</span><b>{p.nroPedClie || '—'}</b></div>
        <div><span>Equipe</span><b>{p.nomeEquipe}</b></div>
        <div><span>PV{origens.length > 1 ? 's' : ''} de origem</span><b>{origens.join(', ')}</b></div>
      </div>
      {naoSelecionados.length > 0 && (
        <div className="alerta aviso">
          <b>Existem outros {naoSelecionados.length} {naoSelecionados.length > 1 ? 'itens pendentes' : 'item pendente'} deste pedido que não foram selecionados.</b> A pré-venda será gerada só com os itens marcados.
        </div>
      )}
      {estoqueBaixo.length > 0 && (
        <div className="alerta aviso">
          <b>Estoque insuficiente para {estoqueBaixo.length > 1 ? 'os itens' : 'o item'}:</b>
          <ul>{estoqueBaixo.map((l) => <li key={l.chave}>{l.produto} — {l.descricao} · falta {cxun(l.faltaCx, l.faltaUn)}, estoque {cxun(l.estoqueCx, l.estoqueUn)}</li>)}</ul>
        </div>
      )}
      <table className="mini">
        <thead><tr><th>PV origem</th><th>Ruptura</th><th>Produto</th><th>Descrição</th><th className="r">Quantidade (cx/un)</th></tr></thead>
        <tbody>
          {itens.map((l) => (
            <tr key={l.chave}><td>{l.numero}</td><td>{l.posicao}ª</td><td>{l.produto}</td><td>{l.descricao}</td><td className="r num"><b>{cxun(l.faltaCx, l.faltaUn)}</b></td></tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

function Resultado({ r, onFechar }) {
  return (
    <Modal titulo="Pré-venda gerada" semPre onFechar={onFechar} rodape={<button className="btn primario" autoFocus onClick={onFechar}>OK</button>}>
      <div className="pv-gerada">
        <div className="numero">{r.numero}<small>/{r.ano}</small></div>
        <div>{r.qtdItens} {r.qtdItens > 1 ? 'itens' : 'item'} · cliente {r.codCliente} · referência {r.pvOrigens.join(', ')}</div>
      </div>
      {!r.eventoOk && <div className="alerta aviso" style={{ marginTop: 12 }}>A PV foi gravada, mas não foi possível registrar o evento em EventosSistema.</div>}
    </Modal>
  );
}
