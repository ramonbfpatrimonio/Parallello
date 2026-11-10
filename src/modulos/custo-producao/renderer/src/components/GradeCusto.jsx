import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { data, moeda, numero, pct, proximaOrdenacao } from '../lib/calc';
import Icone from './Icone';

const CORES = 5; // insumos com cor própria na barra; o resto vira "outros"
const ALTURA_MIN = 200;
const CHAVE_ALTURA = 'alturaPlanilha';

function lerAltura() {
  try { const v = Number(localStorage.getItem(CHAVE_ALTURA)); return v >= ALTURA_MIN ? v : null; } catch { return null; }
}
function gravarAltura(v) {
  try { if (v) localStorage.setItem(CHAVE_ALTURA, String(Math.round(v))); else localStorage.removeItem(CHAVE_ALTURA); } catch { /* ignora */ }
}
const alturaMaxima = () => Math.max(ALTURA_MIN, window.innerHeight - 96);

// Barra de composição: quanto cada insumo pesa no custo do acabado
function Composicao({ ordem }) {
  const partes = useMemo(() => {
    if (!(ordem.custoTotal > 0)) return [];
    const ordenados = [...ordem.insumos].filter(i => i.custoTotal > 0).sort((a, b) => b.custoTotal - a.custoTotal);
    const top = ordenados.slice(0, CORES).map((i, n) => ({ chave: i.item, rotulo: i.descricao || i.codigo, valor: i.custoTotal, classe: `c${n + 1}` }));
    const resto = ordenados.slice(CORES).reduce((s, i) => s + i.custoTotal, 0);
    if (resto > 0) top.push({ chave: 'outros', rotulo: `Outros ${ordenados.length - CORES} insumos`, valor: resto, classe: 'outros' });
    return top.map(p => ({ ...p, fracao: p.valor / ordem.custoTotal }));
  }, [ordem]);

  if (!partes.length) return <div className="composicao vazia" title="Nenhum insumo com custo">sem custo</div>;
  return (
    <div className="composicao" role="img" aria-label={`Composição do custo: ${partes.map(p => `${p.rotulo} ${pct(p.fracao)}`).join(', ')}`}>
      {partes.map(p => (
        <i key={p.chave} className={p.classe} style={{ flexGrow: p.fracao }} title={`${p.rotulo}: ${pct(p.fracao)}`} />
      ))}
      {ordem.insumosSemCusto > 0 && <b className="marca-sc" title={`${ordem.insumosSemCusto} insumo(s) sem custo`} />}
    </div>
  );
}

// Cabeçalho que ordena ao clicar
function Th({ chave, ordenacao, aoOrdenar, num, className = '', title, children }) {
  const ativo = ordenacao?.chave === chave;
  const dir = ativo ? ordenacao.dir : null;
  return (
    <th
      className={`ordenavel ${num ? 'num' : ''} ${ativo ? 'ordenado' : ''} ${className}`}
      aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
      title={title}
    >
      <button type="button" onClick={() => aoOrdenar(proximaOrdenacao(ordenacao, chave))}>
        <span>{children}</span>
        <svg className="seta-ord" viewBox="0 0 10 14" aria-hidden="true">
          <path className={dir === 'asc' ? 'on' : ''} d="M5 1 9 6H1z" />
          <path className={dir === 'desc' ? 'on' : ''} d="M5 13 1 8h8z" />
        </svg>
      </button>
    </th>
  );
}

export default function GradeCusto({ ordens, casas = 2, comData, total, ordenacao, aoOrdenar }) {
  const [abertos, setAbertos] = useState(() => new Set());
  const [altura, setAltura] = useState(lerAltura);
  const [arrastando, setArrastando] = useState(false);
  const scrollRef = useRef(null);
  const wrapRef = useRef(null);
  const alturaRef = useRef(altura);
  alturaRef.current = altura;

  // Se a janela diminuir, a planilha não passa da tela
  useEffect(() => {
    const ajustar = () => setAltura(h => (h ? Math.min(h, alturaMaxima()) : h));
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, []);

  const alternar = num => setAbertos(prev => {
    const s = new Set(prev);
    const k = String(num);
    if (s.has(k)) s.delete(k); else s.add(k);
    return s;
  });

  const conteudo = () => scrollRef.current?.closest('.conteudo');

  // Arrastar o puxador para cima aumenta a planilha e sobe a página junto
  function iniciarArraste(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const y0 = e.clientY;
    const h0 = scrollRef.current.getBoundingClientRect().height;
    const cont = conteudo();
    const st0 = cont ? cont.scrollTop : 0;
    setArrastando(true);
    document.body.classList.add('arrastando');

    const mover = ev => {
      const h = Math.max(ALTURA_MIN, Math.min(alturaMaxima(), h0 + (y0 - ev.clientY)));
      setAltura(h);
      if (cont) cont.scrollTop = st0 + (h - h0);
    };
    const soltar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      document.body.classList.remove('arrastando');
      setArrastando(false);
      gravarAltura(alturaRef.current);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  }

  function definirAltura(h) {
    setAltura(h);
    gravarAltura(h);
  }

  const maximizada = altura && altura >= alturaMaxima() - 4;

  function alternarTelaCheia() {
    if (maximizada) {
      definirAltura(null);
    } else {
      definirAltura(alturaMaxima());
      requestAnimationFrame(() => wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }

  function teclaPuxador(e) {
    const passo = e.shiftKey ? 120 : 40;
    const atual = scrollRef.current.getBoundingClientRect().height;
    if (e.key === 'ArrowUp') { e.preventDefault(); definirAltura(Math.min(alturaMaxima(), atual + passo)); }
    if (e.key === 'ArrowDown') { e.preventDefault(); definirAltura(Math.max(ALTURA_MIN, atual - passo)); }
  }

  const colunas = comData ? 9 : 8;
  const th = { ordenacao, aoOrdenar };

  return (
    <div className="grade-wrap" ref={wrapRef}>
      <div
        className={`puxador ${arrastando ? 'ativo' : ''}`}
        onPointerDown={iniciarArraste}
        onDoubleClick={alternarTelaCheia}
        onKeyDown={teclaPuxador}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Altura da planilha"
        tabIndex={0}
        title="Arraste para cima para aumentar a planilha. Duplo clique alterna tela cheia."
      >
        <span />
      </div>

      <div className="grade-topo">
        <span>{ordens.length} {ordens.length === 1 ? 'ordem' : 'ordens'}</span>
        <button className="link" onClick={() => setAbertos(new Set(ordens.map(o => String(o.numero))))}>Abrir todas</button>
        <button className="link" onClick={() => setAbertos(new Set())}>Fechar todas</button>
        {ordenacao && <button className="link" onClick={() => aoOrdenar(null)}>Ordem original</button>}
        <span className="legenda">
          <i className="c1" /><i className="c2" /><i className="c3" /><i className="c4" /><i className="c5" /> maiores insumos
          <i className="sc" /> sem custo
        </span>
        <button className="icone-btn" onClick={alternarTelaCheia} title={maximizada ? 'Voltar ao tamanho normal' : 'Planilha em tela cheia'}>
          <Icone nome={maximizada ? 'restaurar' : 'expandir'} tamanho={16} />
        </button>
      </div>

      <div
        className={`tabela-scroll ${altura ? 'altura-livre' : ''}`}
        ref={scrollRef}
        style={altura ? { height: altura } : undefined}
      >
        <table className="grade">
          <thead>
            <tr>
              <th className="col-seta" aria-label="Abrir" />
              <Th chave="ordem" {...th}>Ordem</Th>
              {comData && <Th chave="data" {...th}>Data</Th>}
              <Th chave="produto" {...th}>Produto</Th>
              <Th chave="quant" num {...th}>Quant</Th>
              <Th chave="kg" num {...th}>Qtd (kg)</Th>
              <Th chave="unit" num title="No acabado: custo por kg produzido" {...th}>Custo unit.</Th>
              <Th chave="total" num {...th}>Custo total</Th>
              <Th chave="comp" className="col-comp" title="Ordena pelos insumos sem custo; nos insumos, pela participação" {...th}>Composição do custo</Th>
            </tr>
          </thead>
          <tbody>
            {!ordens.length && (
              <tr><td colSpan={colunas} className="vazio">Nenhuma ordem para estes filtros.</td></tr>
            )}
            {ordens.map(o => {
              const aberto = abertos.has(String(o.numero));
              return (
                <Fragment key={o.numero}>
                  <tr
                    className={`acabado ${aberto ? 'aberto' : ''}`}
                    onClick={() => alternar(o.numero)}
                    tabIndex={0}
                    onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), alternar(o.numero))}
                    aria-expanded={aberto}
                  >
                    <td className="col-seta"><Icone nome="seta" tamanho={14} className="chevron" /></td>
                    <td className="ordem">{o.numero}</td>
                    {comData && <td className="fraco">{data(o.data)}</td>}
                    <td className="produto">
                      <span className="cod">{o.codigo}</span>
                      <span className="desc">{o.descricao || 'Sem descrição'}</span>
                    </td>
                    <td className="num fraco">{o.quant}</td>
                    <td className="num">{numero(o.quantKg, 3)}</td>
                    <td className="num" title="Custo por kg produzido">{numero(o.custoKg, casas)}</td>
                    <td className="num valor">{moeda(o.custoTotal)}</td>
                    <td className="col-comp"><Composicao ordem={o} /></td>
                  </tr>
                  {aberto && o.insumos.map(i => {
                    const p = o.custoTotal > 0 ? i.custoTotal / o.custoTotal : 0;
                    return (
                      <tr key={`${o.numero}-${i.item}`} className={`insumo ${i.semCusto ? 'sem-custo' : ''}`}>
                        <td />
                        <td className="fraco item">{i.item}</td>
                        {comData && <td />}
                        <td className="produto">
                          <span className="cod">{i.codigo}</span>
                          <span className="desc">{i.descricao}</span>
                          {i.semCusto && <span className="selo-sc">sem movimentação com custo</span>}
                        </td>
                        <td className="num fraco">{i.quant}</td>
                        <td className="num">{numero(i.quantKg, 3)}</td>
                        <td className="num">{numero(i.custoUnit, casas)}</td>
                        <td className="num">{moeda(i.custoTotal)}</td>
                        <td className="col-comp">
                          <div className="parcela"><i style={{ width: `${Math.min(100, p * 100)}%` }} /></div>
                          <span className="parcela-num">{pct(p)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
          {total && ordens.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={comData ? 5 : 4}>Total de {total.ordens} {total.ordens === 1 ? 'ordem' : 'ordens'}</td>
                <td className="num">{numero(total.kg, 3)}</td>
                <td className="num">{numero(total.custoKg, casas)}</td>
                <td className="num valor">{moeda(total.custo)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
