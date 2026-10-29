import React, { useEffect, useRef, useState } from 'react';
import { Search, FileSpreadsheet, FileDown, Database } from 'lucide-react';
import DataTable from '../components/DataTable.jsx';
import { Toggle, Aviso, Resumo, Periodo } from '../components/Comuns.jsx';
import { dataBR } from '../format.js';

const LEGENDAS = {
  'setor-com-sem-compra': [
    { cor: 'var(--ok)', txt: 'Comprou no período' },
    { cor: 'var(--bad)', txt: 'Não comprou' },
    { cor: 'var(--warn)', txt: 'Cliente não cadastrado em todas as bases' }
  ],
  ranking: [
    { cor: 'var(--gold)', txt: '1º lugar' },
    { cor: 'var(--silver)', txt: '2º lugar' },
    { cor: 'var(--bronze)', txt: '3º lugar' }
  ]
};

export default function ReportPage({ rel, periodo, setPeriodo, prefs, estado, setEstado, empresa, carregar }) {
  const { resultado, filtros = {}, erro } = estado || {};
  const [locais, setLocais] = useState(() => {
    const base = {};
    (rel.opcoes || []).forEach((o) => { base[o.chave] = o.padrao; });
    (rel.filtrosLista || []).forEach((f) => { if (!f.dinamica && f.opcoes) base[f.chave] = f.opcoes[0]; });
    base.deduzirRetorno = !!prefs.deduzirRetorno;
    return { ...base, ...filtros };
  });
  const deduzir = !!locais.deduzirRetorno;
  const tempo = useRef(null);

  const consultar = async () => {
    const f = { ...locais, ini: periodo.ini, fim: periodo.fim };
    await carregar(async () => {
      try {
        const r = await window.api.executarRelatorio({ id: rel.id, filtros: f });
        setEstado({ resultado: r, filtros: locais, erro: null });
      } catch (err) {
        setEstado({ resultado, filtros: locais, erro: limparErro(err) });
      }
    });
  };

  // filtros locais: refaz a montagem sem ir ao banco
  const mudarLocal = (chave, valor, atraso = 0) => {
    const novos = { ...locais, [chave]: valor };
    setLocais(novos);
    if (!resultado) return;
    clearTimeout(tempo.current);
    tempo.current = setTimeout(async () => {
      const r = await window.api.remontarRelatorio({ id: rel.id, filtros: novos });
      if (r) setEstado({ resultado: r, filtros: novos, erro: null });
    }, atraso);
  };

  const exportarExcel = async () => {
    if (!resultado) return;
    await window.api.exportarExcel({
      titulo: resultado.titulo,
      planilhas: [{ nome: rel.nome, tabela: { colunas: resultado.colunas, linhas: resultado.linhas }, titulo: resultado.titulo, subtitulo: resultado.subtitulo, resumo: resultado.resumo }]
    });
  };

  const semBases = !empresa || !(empresa.bases || []).some((b) => b.ativa !== false);

  return (
    <>
      <div className="card filtros">
        <Periodo ini={periodo.ini} fim={periodo.fim} onChange={(i, f) => setPeriodo({ ini: i, fim: f })} />
        {rel.usaDeduzir && (
          <>
            <div className="separador" />
            <div className="campo">
              <span>Retornos</span>
              <Toggle checked={deduzir} onChange={(v) => mudarLocal('deduzirRetorno', v)}>Deduzir retorno</Toggle>
            </div>
          </>
        )}
        {(rel.opcoes || []).map((o) => (
          <div className="campo" key={o.chave}>
            <span>Exibição</span>
            <Toggle checked={locais[o.chave]} onChange={(v) => mudarLocal(o.chave, v)}>{o.rotulo}</Toggle>
          </div>
        ))}
        <div className="acoes">
          <button className="btn primario" onClick={consultar} disabled={semBases}>
            <Search size={16} /> Consultar
          </button>
        </div>
      </div>

      {(rel.filtrosLista?.length > 0 || rel.filtrosTexto?.length > 0) && resultado && (
        <div className="card filtros nao-imprimir">
          {(rel.filtrosLista || []).map((f) => {
            const opcoes = f.dinamica ? ['', ...((resultado.listas || {})[f.chave] || [])] : f.opcoes;
            if (f.multipla) {
              return (
                <label className="campo" key={f.chave}>
                  <span>{f.rotulo} (vários: 101,102)</span>
                  <input className="input" list={'lst-' + f.chave} value={locais[f.chave] || ''} placeholder="Todos" onChange={(e) => mudarLocal(f.chave, e.target.value, 400)} />
                  <datalist id={'lst-' + f.chave}>{opcoes.filter(Boolean).map((o) => <option key={o} value={o} />)}</datalist>
                </label>
              );
            }
            return (
              <label className="campo" key={f.chave}>
                <span>{f.rotulo}</span>
                <select className="input" value={locais[f.chave] || ''} onChange={(e) => mudarLocal(f.chave, e.target.value)}>
                  {opcoes.map((o) => <option key={o} value={o}>{o === '' ? 'Todos' : o}</option>)}
                </select>
              </label>
            );
          })}
          {(rel.filtrosTexto || []).map((f) => (
            <label className="campo" key={f.chave}>
              <span>{f.rotulo}</span>
              <input className="input" value={locais[f.chave] || ''} placeholder={f.chave === 'cliente' ? 'Ex.: 1537' : 'Digite para filtrar'} onChange={(e) => mudarLocal(f.chave, e.target.value, 350)} />
            </label>
          ))}
          {LEGENDAS[rel.id] && (
            <div className="acoes legenda">
              {LEGENDAS[rel.id].map((l) => <span key={l.txt}><i style={{ background: l.cor }} />{l.txt}</span>)}
            </div>
          )}
        </div>
      )}

      {semBases && (
        <Aviso tipo="alerta">
          Nenhuma conexão com o banco de dados foi configurada. Fale com o administrador do sistema.
        </Aviso>
      )}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {resultado ? (
        <>
          <div className="so-impressao">
            <h2 style={{ margin: '0 0 2px' }}>{resultado.titulo}</h2>
            <div style={{ color: '#555', marginBottom: 8 }}>{resultado.subtitulo}</div>
          </div>
          <Resumo itens={resultado.resumo} />
          <DataTable
            colunas={resultado.colunas}
            linhas={resultado.linhas}
            vazio={resultado.vazio}
            abrirPrimeiroNivel={resultado.linhas.some((l) => l.tipo === 'grupo')}
            barra={
              <>
                <span className="info" title={'Bases: ' + (resultado.bases || []).join(', ')}>
                  <Database size={13} style={{ verticalAlign: -2 }} /> {(resultado.bases || []).length} base(s)
                  {resultado.segundos ? ` • ${resultado.segundos.toFixed(1)}s` : ''}
                </span>
                <button className="btn mini" onClick={exportarExcel}><FileSpreadsheet size={14} /> Excel</button>
                <button className="btn mini" onClick={() => window.api.exportarPdf({ titulo: resultado.titulo })}><FileDown size={14} /> PDF</button>
              </>
            }
          />
          <p className="ajuda nao-imprimir">{resultado.subtitulo}</p>
        </>
      ) : (
        !semBases && (
          <div className="card vazio">
            <Search size={30} />
            <b>Escolha o período e clique em Consultar</b>
            Período selecionado: {dataBR(periodo.ini)} a {dataBR(periodo.fim)}
          </div>
        )
      )}
    </>
  );
}

export function limparErro(err) {
  const m = String((err && err.message) || err || 'Erro desconhecido');
  return m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
