import React, { useEffect, useState } from 'react';
import { useCobranca } from '../contexto.js';
import { codigoCliente, dataBR, dataHoraBR, moeda } from '../logica/formato.js';
import { Abas, Botao, Modal, Selo, Vazio } from './ui.jsx';

const NOME_EVENTO = { email: 'E-mail', whatsapp: 'WhatsApp', protesto: 'Protesto', pix: 'PIX' };

function horaErp(h) {
  const s = String(h || '').padStart(6, '0');
  return /^\d{6}/.test(s) ? `${s.slice(0, 2)}:${s.slice(2, 4)}` : '';
}

export function ModalHistorico({ grupo, onFechar }) {
  const { nuvem, erp } = useCobranca();
  const [aba, setAba] = useState('nuvem');
  const [regs, setRegs] = useState(null);
  const [eventos, setEventos] = useState(null);
  const [erpH, setErpH] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    Promise.all([nuvem.registrosDoCliente(grupo.codigo), nuvem.eventosDoCliente(grupo.codigo)])
      .then(([r, e]) => { if (vivo) { setRegs(r); setEventos(e); } })
      .catch((e) => vivo && setErro(e.message));
    erp.historicoErp(codigoCliente(grupo.codigo)).then((h) => vivo && setErpH(h)).catch((e) => vivo && setErpH({ erro: e.message }));
    return () => { vivo = false; };
  }, [grupo.codigo]); // eslint-disable-line react-hooks/exhaustive-deps

  const linhaTempo = [
    ...(regs || []).map((r) => ({ quando: r.criado_em, tipo: 'registro', r })),
    ...(eventos || []).map((e) => ({ quando: e.criado_em, tipo: 'evento', e })),
  ].sort((a, b) => String(b.quando).localeCompare(String(a.quando)));

  return (
    <Modal titulo="Histórico do cliente" subtitulo={`${grupo.codigo} · ${grupo.nome}`} onFechar={onFechar} largura={1000}
      rodape={<Botao onClick={onFechar}>Fechar</Botao>}>
      <Abas ativa={aba} onTrocar={setAba} abas={[
        { id: 'nuvem', rotulo: 'Cobrança (Parallello)', contador: linhaTempo.length },
        { id: 'erp', rotulo: 'Histórico do ERP', contador: Array.isArray(erpH) ? erpH.length : null },
      ]} />
      {aba === 'nuvem' && (
        erro ? <div className="cob-campo-erro">{erro}</div>
          : !regs ? <div className="cob-centro-p"><span className="cob-spin cob-spin-g" /></div>
            : !linhaTempo.length ? <Vazio titulo="Nenhum registro ainda" texto="Os registros, e-mails e WhatsApp enviados por aqui aparecem nesta lista." />
              : (
                <div className="cob-tabela-caixa cob-tabela-modal">
                  <table className="cob-tabela cob-tabela-simples">
                    <thead><tr><th>Data / hora</th><th>Operador</th><th>Tipo</th><th>Documento</th><th className="dir">Valor</th><th>Detalhe</th><th>Situação</th><th>Próximo</th><th>ERP</th></tr></thead>
                    <tbody>
                      {linhaTempo.map((x) => (x.tipo === 'registro' ? (
                        <tr key={`r${x.r.id}`}>
                          <td className="cob-nowrap">{dataHoraBR(x.r.criado_em)}</td>
                          <td>{x.r.operador_nome}</td>
                          <td><Selo tipo="azul">Registro</Selo></td>
                          <td className="cob-doc">{x.r.documento}</td>
                          <td className="dir">{moeda(x.r.valor)}</td>
                          <td><strong>{x.r.resultado_codigo} - {x.r.resultado_descricao}</strong><br /><span className="cob-pequeno">{x.r.observacao}</span></td>
                          <td>{x.r.titulo_pago ? <Selo tipo="verde">TÍTULO PAGO</Selo> : x.r.situacao_descricao}</td>
                          <td className="cob-nowrap">{x.r.proxima && x.r.data_prevista ? `${dataBR(x.r.data_prevista)} ${x.r.hora_prevista || ''}` : '-'}</td>
                          <td>{x.r.erp_gravado ? <Selo tipo="verde">nº {x.r.erp_numero}</Selo> : <Selo tipo="vermelho" title={x.r.erp_erro || ''}>pendente</Selo>}</td>
                        </tr>
                      ) : (
                        <tr key={`e${x.e.id}`}>
                          <td className="cob-nowrap">{dataHoraBR(x.e.criado_em)}</td>
                          <td>{x.e.operador_nome}</td>
                          <td><Selo tipo={x.e.tipo === 'whatsapp' ? 'verde' : x.e.tipo === 'protesto' ? 'vinho' : 'azul-claro'}>{NOME_EVENTO[x.e.tipo]}</Selo></td>
                          <td className="cob-doc">{(x.e.documentos || []).join(', ')}</td>
                          <td />
                          <td>{x.e.assunto || x.e.subtipo}<br /><span className="cob-pequeno">{x.e.destino}{x.e.erro ? ` · ${x.e.erro}` : ''}</span></td>
                          <td>{x.e.status}</td>
                          <td />
                          <td />
                        </tr>
                      )))}
                    </tbody>
                  </table>
                </div>
              )
      )}
      {aba === 'erp' && (
        !erpH ? <div className="cob-centro-p"><span className="cob-spin cob-spin-g" /></div>
          : erpH.erro ? <div className="cob-campo-erro">{erpH.erro}</div>
            : !erpH.length ? <Vazio titulo="Sem histórico no ERP" />
              : (
                <div className="cob-tabela-caixa cob-tabela-modal">
                  <table className="cob-tabela cob-tabela-simples">
                    <thead><tr><th>Nº</th><th>Data</th><th>Usuário</th><th>Observação</th><th className="dir">Valor pend.</th><th>Situação</th><th>Próx. cobrança</th></tr></thead>
                    <tbody>
                      {erpH.map((h) => (
                        <tr key={`${h.Numero}-${h.Data}`}>
                          <td>{h.Numero}</td>
                          <td className="cob-nowrap">{dataBR(h.Data)} {horaErp(h.Hora)}</td>
                          <td>{h.Usuario}</td>
                          <td className="cob-pequeno">{h.Observacao}</td>
                          <td className="dir">{moeda(h.ValPend)}</td>
                          <td>{h.SituacaoDescricao || h.Situacao}</td>
                          <td className="cob-nowrap">{dataBR(h.DatProCob)} {horaErp(h.HorProCob)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
      )}
    </Modal>
  );
}
