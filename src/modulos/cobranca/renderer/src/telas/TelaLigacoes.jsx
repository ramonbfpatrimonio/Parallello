import React, { useEffect, useMemo, useState } from 'react';
import { useCobranca } from '../contexto.js';
import { resumoLigacoes } from '../logica/calculos.js';
import { dataBR, dataHoraBR, inteiro, moeda, percentual } from '../logica/formato.js';
import { Botao, Campo, Selo, Vazio, useAviso } from './ui.jsx';

export function TelaLigacoes() {
  const { nuvem, config, hoje, erp } = useCobranca();
  const avisar = useAviso();
  const [de, setDe] = useState(hoje);
  const [ate, setAte] = useState(hoje);
  const [regs, setRegs] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [detalhe, setDetalhe] = useState(false);

  const buscar = async () => {
    if (ate < de) { avisar('A data final é antes da inicial.', 'erro'); return; }
    setCarregando(true);
    try { setRegs(await nuvem.registrosDoPeriodo(de, ate)); }
    catch (e) { avisar(e.message, 'erro'); }
    finally { setCarregando(false); }
  };
  useEffect(() => { buscar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tipos = useMemo(() => new Map(config.resultados.map((r) => [r.codigo, r.ligacao])), [config.resultados]);
  const resumo = useMemo(() => (regs ? resumoLigacoes(regs, config.resultados) : null), [regs, config.resultados]);
  const ligacoes = useMemo(() => (regs || []).filter((r) => ['atendida', 'nao_atendida'].includes(tipos.get(r.resultado_codigo))), [regs, tipos]);
  const periodo = de === ate ? dataBR(de) : `${dataBR(de)} a ${dataBR(ate)}`;

  const exportar = (formato) => erp.exportar({
    formato, arquivo: `ligacoes-${de}${de !== ate ? `-a-${ate}` : ''}`, titulo: `Resumo de ligações - ${periodo}`,
    colunas: [{ chave: 'operador', titulo: 'Operador', largura: 30 }, { chave: 'at', titulo: 'Atendidas', largura: 12, alinhar: 'right' }, { chave: 'na', titulo: 'Não atendidas', largura: 14, alinhar: 'right' }, { chave: 'tot', titulo: 'Total', largura: 10, alinhar: 'right' }, { chave: 'taxa', titulo: 'Taxa de atendimento', largura: 18, alinhar: 'right' }],
    linhas: [...resumo.linhas.map((l) => ({ operador: l.operador, at: l.atendidas, na: l.naoAtendidas, tot: l.total, taxa: percentual(l.taxa) })),
      { _grupo: true, operador: 'TOTAL GERAL', at: resumo.total.atendidas, na: resumo.total.naoAtendidas, tot: resumo.total.total, taxa: percentual(resumo.total.taxa) }],
  }).catch((e) => avisar(e.message, 'erro'));

  return (
    <div className="cob-pagina">
      <header className="cob-cabecalho">
        <div>
          <h1>Resumo de ligações</h1>
          <p>Ligações atendidas e não atendidas por operador, a partir do resultado de contato de cada registro</p>
        </div>
      </header>
      <section className="cob-barra">
        <div className="cob-form cob-form-linha">
          <Campo rotulo="De"><input type="date" value={de} max={hoje} onChange={(e) => setDe(e.target.value)} /></Campo>
          <Campo rotulo="Até"><input type="date" value={ate} max={hoje} onChange={(e) => setAte(e.target.value)} /></Campo>
          <Botao variante="primario" carregando={carregando} onClick={buscar}>Ver resumo</Botao>
        </div>
        {resumo && resumo.linhas.length > 0 && (
          <div className="cob-barra-acoes">
            <Botao pequeno onClick={() => setDetalhe((d) => !d)}>{detalhe ? 'Ocultar ligações' : 'Ver cada ligação'}</Botao>
            <Botao pequeno onClick={() => exportar('xlsx')}>Excel</Botao>
            <Botao pequeno onClick={() => exportar('pdf')}>PDF</Botao>
            <Botao pequeno onClick={() => exportar('imprimir')}>Imprimir</Botao>
          </div>
        )}
      </section>

      {!resumo ? <div className="cob-centro-p"><span className="cob-spin cob-spin-g" /></div>
        : !resumo.linhas.length ? <Vazio titulo={`Nenhuma ligação registrada em ${periodo}`} />
          : (
            <>
              <div className="cob-tabela-caixa cob-tabela-estreita">
                <table className="cob-tabela cob-tabela-simples">
                  <thead><tr><th>Operador</th><th className="dir">Atendidas</th><th className="dir">Não atendidas</th><th className="dir">Total</th><th className="dir">Taxa de atendimento</th></tr></thead>
                  <tbody>
                    {resumo.linhas.map((l) => (
                      <tr key={l.operador}>
                        <td><strong>{l.operador}</strong></td>
                        <td className="dir cob-txt-verde">{inteiro(l.atendidas)}</td>
                        <td className="dir cob-txt-vermelho">{inteiro(l.naoAtendidas)}</td>
                        <td className="dir">{inteiro(l.total)}</td>
                        <td className="dir"><div className="cob-taxa"><div style={{ width: `${l.taxa}%` }} /></div> {percentual(l.taxa)}</td>
                      </tr>
                    ))}
                    <tr className="cob-linha-total">
                      <td>TOTAL GERAL</td>
                      <td className="dir">{inteiro(resumo.total.atendidas)}</td>
                      <td className="dir">{inteiro(resumo.total.naoAtendidas)}</td>
                      <td className="dir">{inteiro(resumo.total.total)}</td>
                      <td className="dir">{percentual(resumo.total.taxa)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {detalhe && (
                <div className="cob-tabela-caixa">
                  <table className="cob-tabela cob-tabela-simples">
                    <thead><tr><th>Data / hora</th><th>Operador</th><th>Cliente</th><th>Documento</th><th className="dir">Valor</th><th>Resultado</th><th>Status</th></tr></thead>
                    <tbody>
                      {ligacoes.map((r) => (
                        <tr key={r.id}>
                          <td className="cob-nowrap">{dataHoraBR(r.criado_em)}</td><td>{r.operador_nome}</td>
                          <td><span className="cob-cod">{r.cliente_codigo}</span> {r.cliente_nome}</td><td className="cob-doc">{r.documento}</td>
                          <td className="dir">{moeda(r.valor)}</td><td>{r.resultado_codigo} - {r.resultado_descricao}</td>
                          <td>{tipos.get(r.resultado_codigo) === 'atendida' ? <Selo tipo="verde">ATENDIDA</Selo> : <Selo tipo="vermelho">NÃO ATENDIDA</Selo>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
    </div>
  );
}
