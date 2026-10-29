import React, { useMemo, useState, useEffect } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { brl, int, dec, pct } from '../format.js';

// cor da barra: verde no ritmo, laranja atenção, vermelho abaixo (esperado = fração do período já decorrida)
function classeBarra(p, esperado = 1) {
  if (p >= 0.9 * esperado) return 'bom';
  if (p >= 0.6 * esperado) return 'medio';
  return '';
}

export function Celula({ col, v }) {
  if (v === null || v === undefined || v === '') return null;
  switch (col.tipo) {
    case 'moeda': return brl(v);
    case 'inteiro': return int(v);
    case 'numero': return dec(v);
    case 'numero0': return int(v);
    case 'pct': return pct(v);
    case 'pct0': return pct(v, 0);
    case 'pctbarra':
      return (
        <div className="pctbarra">
          <div className="barra"><i className={classeBarra(v)} style={{ width: `${Math.min(v, 1) * 100}%` }} /></div>
          <b>{pct(v, 1)}</b>
        </div>
      );
    case 'vv':
    case 'vq': {
      const zero = !v.valor && !v.vol;
      return (
        <span className={'vv' + (zero ? ' zero' : '')}>
          {brl(v.valor)}<small>vol <b>{int(v.vol)}</b></small>
        </span>
      );
    }
    case 'pvq':
      return <span className="vv">{int(v.qtd)}<small>vol <b>{int(v.vol)}</b></small></span>;
    case 'rupt': {
      const zero = !v.valor && !v.cx && !v.frac;
      return (
        <span className={'vv' + (zero ? ' zero' : '')}>
          {brl(v.valor)}<small>{int(v.cx)} cx / {int(v.frac)} un</small>
        </span>
      );
    }
    case 'cxfrac': return `${int(v.cx)} cx / ${int(v.frac)} un`;
    case 'mr': {
      const p = v.meta > 0 ? v.real / v.meta : v.real > 0 ? 1 : 0;
      return (
        <div className="mr">
          <div className="mr-num"><b>{int(v.real)}</b><span>de {int(v.meta)}</span></div>
          <div className="barra"><i className={classeBarra(p, col.esperado || 1)} style={{ width: `${Math.min(p, 1) * 100}%` }} /></div>
        </div>
      );
    }
    default:
      if (col.abc) return <span className={'abc abc-' + v}>{v}</span>;
      return String(v);
  }
}

const NUMERICOS = new Set(['moeda', 'inteiro', 'numero', 'numero0', 'pct', 'pct0', 'vv', 'vq', 'pvq', 'rupt', 'cxfrac']);

function idsComFilhos(linhas, out = []) {
  linhas.forEach((l) => {
    if (l.filhos && l.filhos.length) {
      out.push(l.id);
      idsComFilhos(l.filhos, out);
    }
  });
  return out;
}

export default function DataTable({ colunas, linhas, vazio, abrirPrimeiroNivel = false, barra }) {
  const [abertos, setAbertos] = useState(() => new Set());

  useEffect(() => {
    // ao trocar os dados: abre o 1º nível (setores) se pedido, filhos de clientes começam fechados
    setAbertos(abrirPrimeiroNivel ? new Set(linhas.filter((l) => l.filhos && l.filhos.length).map((l) => l.id)) : new Set());
  }, [linhas, abrirPrimeiroNivel]);

  const visiveis = useMemo(() => {
    const out = [];
    const percorrer = (ls, nivel) => {
      ls.forEach((l) => {
        out.push({ ...l, nivel });
        if (l.filhos && l.filhos.length && abertos.has(l.id)) percorrer(l.filhos, nivel + 1);
      });
    };
    percorrer(linhas, 0);
    return out;
  }, [linhas, abertos]);

  const todos = useMemo(() => idsComFilhos(linhas), [linhas]);
  const alternar = (id) => {
    const n = new Set(abertos);
    if (n.has(id)) n.delete(id); else n.add(id);
    setAbertos(n);
  };

  // coluna onde aparece o botão de abrir (primeira coluna "larga" ou a primeira)
  const idxArvore = Math.max(0, colunas.findIndex((c) => c.larga));
  const temArvore = todos.length > 0;

  return (
    <div className="card tabela-card">
      <div className="tabela-barra">
        <span className="info">{linhas.filter((l) => l.tipo !== 'total').length} linhas{temArvore ? ' • clique na seta para abrir os detalhes' : ''}</span>
        <div className="acoes nao-imprimir">
          {temArvore && (
            <>
              <button className="btn mini fantasma" onClick={() => setAbertos(new Set(todos))}>Expandir tudo</button>
              <button className="btn mini fantasma" onClick={() => setAbertos(new Set())}>Recolher tudo</button>
            </>
          )}
          {barra}
        </div>
      </div>
      <div className="tabela-rolagem">
        {!linhas.length ? (
          <div className="vazio"><b>Nada para mostrar</b>{vazio || 'Nenhum registro no período.'}</div>
        ) : (
          <table className="dados">
            <thead>
              <tr>{colunas.map((c) => <th key={c.chave}>{c.rotulo}</th>)}</tr>
            </thead>
            <tbody>
              {visiveis.map((l) => {
                const cls = [l.tipo, l.cor ? 'cor-' + l.cor : '', l.negrito ? 'negrito' : ''].join(' ');
                return (
                  <tr key={l.id} className={cls}>
                    {colunas.map((c, i) => {
                      const v = l.celulas[c.chave];
                      const tdCls = [
                        NUMERICOS.has(c.tipo) ? 'num' : '',
                        c.alinhamento === 'centro' ? 'centro' : '',
                        c.larga ? 'larga' : '',
                        c.destaque ? 'col-destaque' : ''
                      ].join(' ');
                      const arvore = i === idxArvore && temArvore;
                      return (
                        <td key={c.chave} className={tdCls} title={typeof v === 'string' ? v : undefined}>
                          {arvore && <span className="recuo" style={{ width: l.nivel * 18 }} />}
                          {arvore && (l.filhos && l.filhos.length ? (
                            <button className="abre" onClick={() => alternar(l.id)} title="Abrir / fechar">
                              {abertos.has(l.id) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                            </button>
                          ) : <span className="recuo" style={{ width: 22 }} />)}
                          <Celula col={c} v={v} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
