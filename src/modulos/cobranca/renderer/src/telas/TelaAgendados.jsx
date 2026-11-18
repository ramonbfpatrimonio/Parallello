import React, { useMemo, useState } from 'react';
import { useCobranca } from '../contexto.js';
import { agendadosHoje, agruparPorCliente, rotulosFaixas } from '../logica/calculos.js';
import { dataBR, moeda } from '../logica/formato.js';
import { Botao, Selo, Vazio } from './ui.jsx';
import { ModaisDoPainel, corFaixa } from './Painel.jsx';

export function TelaAgendados() {
  const { carteira, config, hoje, recarregar, carregando } = useCobranca();
  const [modal, setModal] = useState(null);
  const rot = rotulosFaixas(config.faixas);
  const lista = useMemo(() => (carteira ? agendadosHoje(carteira.titulos, hoje) : []), [carteira, hoje]);
  const grupos = useMemo(() => new Map((carteira ? agruparPorCliente(carteira.titulos) : []).map((g) => [g.codigo, g])), [carteira]);

  if (!carteira) return <div className="cob-pagina cob-centro"><span className="cob-spin cob-spin-g" /></div>;
  const abrir = (tipo, t) => setModal({ tipo, grupo: grupos.get(t.codigo), titulo: t });

  return (
    <div className="cob-pagina">
      <header className="cob-cabecalho">
        <div>
          <h1>Agendados para hoje</h1>
          <p>{dataBR(hoje)} · {lista.length} cobrança(s) com retorno marcado para hoje, em ordem de horário</p>
        </div>
        <Botao variante="primario" carregando={carregando} onClick={recarregar}>Atualizar</Botao>
      </header>
      {!lista.length ? <Vazio titulo="Nenhuma cobrança agendada para hoje" texto="Os retornos marcados no registro de cobrança aparecem aqui no dia." /> : (
        <div className="cob-tabela-caixa">
          <table className="cob-tabela cob-tabela-simples">
            <thead><tr><th>Hora</th><th>Cliente</th><th>Documento</th><th>Vencimento</th><th className="dir">Valor atual</th><th>Faixa</th><th>Último registro</th><th className="cob-col-acoes">Ações</th></tr></thead>
            <tbody>
              {lista.map((t) => (
                <tr key={t.docPag}>
                  <td><strong>{t.ultimoRegistro.hora_prevista || '—'}</strong></td>
                  <td><span className="cob-cod">{t.codigo}</span> {t.nome}<br /><span className="cob-pequeno">{t.telefone}</span></td>
                  <td className="cob-doc">{t.docPag}</td>
                  <td>{dataBR(t.vencimento)}</td>
                  <td className="dir"><strong>{moeda(t.valorAtual)}</strong></td>
                  <td><Selo tipo={corFaixa(t.faixa)}>{rot[t.faixa]}</Selo></td>
                  <td className="cob-pequeno">{t.ultimoRegistro.operador_nome}: {t.ultimoRegistro.resultado_descricao}<br />{t.ultimoRegistro.observacao}</td>
                  <td className="cob-col-acoes">
                    <div className="cob-acoes">
                      <button type="button" className="cob-acao cob-acao-principal" onClick={() => abrir('registrar', t)}>Registrar</button>
                      <button type="button" className="cob-acao cob-acao-whats" onClick={() => abrir('whatsapp', t)}>WhatsApp</button>
                      <button type="button" className="cob-acao" onClick={() => abrir('email', t)}>E-mail</button>
                      <button type="button" className="cob-acao" onClick={() => abrir('historico', t)}>Histórico</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ModaisDoPainel modal={modal} fechar={() => setModal(null)} />
    </div>
  );
}
