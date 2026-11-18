import React, { useEffect, useState } from 'react';
import { useCobranca } from '../contexto.js';
import { dataHoraBR, moeda } from '../logica/formato.js';
import { Botao, Vazio, useAviso } from './ui.jsx';
import { gravarNoErp } from './ModalRegistrar.jsx';

// Registros salvos na nuvem que o ERP não aceitou (ex.: banco fora do ar)
export function TelaPendencias() {
  const ctx = useCobranca();
  const avisar = useAviso();
  const [lista, setLista] = useState(null);
  const [rodando, setRodando] = useState(false);

  const carregar = async () => {
    try { const l = await ctx.nuvem.registrosPendentesErp(); setLista(l); ctx.setPendentes(l.length); }
    catch (e) { avisar(e.message, 'erro'); setLista([]); }
  };
  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tentarTodos = async () => {
    setRodando(true);
    let ok = 0; let falha = 0;
    for (const r of lista) { const g = await gravarNoErp(ctx, r); if (g.ok) ok += 1; else falha += 1; }
    setRodando(false);
    avisar(`${ok} gravado(s) no ERP${falha ? `, ${falha} ainda com erro` : ''}.`, falha ? 'aviso' : 'ok');
    carregar();
  };

  return (
    <div className="cob-pagina">
      <header className="cob-cabecalho">
        <div>
          <h1>Pendentes no ERP</h1>
          <p>Registros salvos na nuvem que ainda não entraram no histórico de cobranças do ERP</p>
        </div>
        {lista?.length > 0 && <Botao variante="primario" carregando={rodando} onClick={tentarTodos}>Gravar todos no ERP</Botao>}
      </header>
      {!lista ? <div className="cob-centro-p"><span className="cob-spin cob-spin-g" /></div>
        : !lista.length ? <Vazio titulo="Nada pendente" texto="Todos os registros já estão no ERP." />
          : (
            <div className="cob-tabela-caixa">
              <table className="cob-tabela cob-tabela-simples">
                <thead><tr><th>Data / hora</th><th>Operador</th><th>Cliente</th><th>Documento</th><th className="dir">Valor</th><th>Erro do ERP</th></tr></thead>
                <tbody>
                  {lista.map((r) => (
                    <tr key={r.id}>
                      <td className="cob-nowrap">{dataHoraBR(r.criado_em)}</td><td>{r.operador_nome}</td>
                      <td><span className="cob-cod">{r.cliente_codigo}</span> {r.cliente_nome}</td><td className="cob-doc">{r.documento}</td>
                      <td className="dir">{moeda(r.valor)}</td><td className="cob-pequeno cob-txt-vermelho">{r.erp_erro || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
    </div>
  );
}
