import React, { useMemo, useState } from 'react';
import { useCobranca, autoria } from '../contexto.js';
import { codigoCliente, dataBR, moeda } from '../logica/formato.js';
import { rotulosFaixas } from '../logica/calculos.js';
import { Botao, Campo, Info, Modal, useAviso } from './ui.jsx';

// Grava o registro no ERP e marca na nuvem (usado também nas pendências)
export async function gravarNoErp(ctx, reg) {
  try {
    const r = await ctx.erp.gravarHistorico({
      cliente: codigoCliente(reg.cliente_codigo),
      usuario: reg.operador_nome || ctx.usuario || '',
      observacao: reg.observacao,
      valor: reg.valor,
      situacao: reg.situacao_codigo,
      dataPrevista: reg.proxima ? reg.data_prevista : '',
      horaPrevista: reg.proxima ? (reg.hora_prevista || '') : '',
      hoje: reg.dia,
    });
    await ctx.nuvem.atualizarRegistro(reg.id, { erp_gravado: true, erp_numero: r?.numero || null, erp_erro: null });
    return { ok: true, numero: r?.numero };
  } catch (e) {
    try { await ctx.nuvem.atualizarRegistro(reg.id, { erp_gravado: false, erp_erro: e.message }); } catch (_) { /* ignora */ }
    return { ok: false, erro: e.message };
  }
}

export function ModalRegistrar({ grupo, titulo: t, onFechar }) {
  const ctx = useCobranca();
  const { config, situacoes, operador, hoje, nuvem } = ctx;
  const avisar = useAviso();
  const rot = rotulosFaixas(config.faixas);
  const minimo = config.faixas.minimoObservacao || 20;

  const [obs, setObs] = useState('');
  const [filtroRes, setFiltroRes] = useState('');
  const [resultado, setResultado] = useState('');
  const [proxima, setProxima] = useState(true);
  const [data, setData] = useState('');
  const [hora, setHora] = useState('');
  const [situacao, setSituacao] = useState('');
  const [erros, setErros] = useState({});
  const [salvando, setSalvando] = useState(false);

  const grupos = useMemo(() => {
    const termo = filtroRes.trim().toUpperCase();
    const lista = config.resultados.filter((r) => !termo || `${r.codigo} - ${r.descricao}`.toUpperCase().includes(termo));
    const m = new Map();
    for (const r of lista) { if (!m.has(r.grupo)) m.set(r.grupo, []); m.get(r.grupo).push(r); }
    return [...m.entries()];
  }, [config.resultados, filtroRes]);

  const obsLimpa = obs.replace(/\s+/g, ' ').trim();

  const validar = () => {
    const e = {};
    if (obsLimpa.length < minimo) e.obs = `Mínimo de ${minimo} caracteres. Digitados: ${obsLimpa.length} · faltam ${minimo - obsLimpa.length}.`;
    if (!resultado) e.resultado = 'Escolha o resultado do contato.';
    if (!situacao) e.situacao = 'Selecione a situação.';
    if (proxima && !data) e.data = 'Informe a data do próximo contato.';
    if (proxima && data && data < hoje) e.data = 'A data não pode ser antes de hoje.';
    setErros(e);
    return !Object.keys(e).length;
  };

  const salvar = async () => {
    if (!validar()) return;
    setSalvando(true);
    try {
      if (await nuvem.jaRegistradoHoje(t.docPag, hoje)) {
        avisar(`O documento ${t.docPag} já foi registrado hoje (${dataBR(hoje)}). Não é permitido duplicar no mesmo dia.`, 'erro', 7000);
        return;
      }
      const res = config.resultados.find((r) => r.codigo === resultado);
      const sit = situacoes.find((s) => s.codigo === situacao);
      let reg;
      try {
        reg = await nuvem.inserirRegistro({
          dia: hoje,
          ...autoria(ctx),
          cliente_codigo: t.codigo,
          cliente_nome: t.nome,
          documento: t.docPag,
          valor: t.valorAtual,
          vendedor: t.vendedor,
          parcela: t.parcela,
          observacao: obsLimpa.toUpperCase(),
          resultado_codigo: res?.codigo || null,
          resultado_descricao: res?.descricao || null,
          proxima,
          data_prevista: proxima ? data : null,
          hora_prevista: proxima && hora ? hora : null,
          situacao_codigo: sit?.codigo || situacao,
          situacao_descricao: sit?.descricao || null,
        });
      } catch (e) {
        if (/duplicate|unique|cob_registros_um_por_dia/i.test(e.message)) {
          avisar(`O documento ${t.docPag} já foi registrado hoje. Não é permitido duplicar no mesmo dia.`, 'erro', 7000);
          return;
        }
        throw e;
      }
      const g = await gravarNoErp(ctx, reg);
      ctx.aplicarRegistroLocal({ ...reg, erp_gravado: g.ok, erp_numero: g.numero || null });
      if (g.ok) avisar(`Registro salvo na nuvem e no ERP (nº ${g.numero}).`);
      else avisar(`Salvo na nuvem, mas o ERP recusou: ${g.erro}. Fica em "Pendentes no ERP" para tentar de novo.`, 'aviso', 9000);
      onFechar();
    } catch (e) {
      avisar(`Não foi possível salvar: ${e.message}`, 'erro', 8000);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal titulo="Registrar cobrança" subtitulo={`${grupo.codigo} · ${grupo.nome}`} onFechar={onFechar} largura={760}
      rodape={(<><Botao onClick={onFechar}>Cancelar</Botao><Botao variante="sucesso" carregando={salvando} onClick={salvar}>Salvar registro</Botao></>)}>
      <div className="cob-grade-info">
        <Info rotulo="Documento" valor={t.docPag} />
        <Info rotulo="Vencimento" valor={dataBR(t.vencimento)} />
        <Info rotulo="Valor atual" valor={moeda(t.valorAtual)} />
        <Info rotulo="Dias / faixa" valor={`${t.dias} · ${rot[t.faixa]}`} />
        <Info rotulo="Vendedor" valor={t.vendedor || '-'} />
        <Info rotulo="Parcela" valor={t.parcela} />
        <Info rotulo="Telefone" valor={grupo.telefone || '-'} />
        <Info rotulo="Operador" valor={operador?.nome} />
      </div>

      <div className="cob-form">
        <Campo rotulo="Resultado do contato" erro={erros.resultado} largo>
          <input type="search" placeholder="Filtrar (ex.: 25, whatsapp, protesto)…" value={filtroRes} onChange={(e) => setFiltroRes(e.target.value)} />
          <select size={7} value={resultado} onChange={(e) => {
            setResultado(e.target.value);
            if (e.target.value === '12') setProxima(true);
          }}>
            {grupos.map(([nome, itens]) => (
              <optgroup key={nome} label={nome}>
                {itens.map((r) => <option key={r.codigo} value={r.codigo}>{r.codigo} - {r.descricao}</option>)}
              </optgroup>
            ))}
          </select>
        </Campo>

        <Campo rotulo={`Descrição da ocorrência (mínimo ${minimo} caracteres)`} erro={erros.obs}
          dica={`${obsLimpa.length} caractere(s)`} largo>
          <textarea rows={4} value={obs} onChange={(e) => setObs(e.target.value)} onBlur={() => setObs((o) => o.toUpperCase())} />
        </Campo>

        <Campo rotulo="Situação (ERP)" erro={erros.situacao}>
          <select value={situacao} onChange={(e) => setSituacao(e.target.value)}>
            <option value="">Selecione…</option>
            {situacoes.map((s) => <option key={s.codigo} value={s.codigo}>{s.descricao} ({s.codigo})</option>)}
          </select>
        </Campo>

        <Campo rotulo="Próximo contato?">
          <div className="cob-alternar">
            <button type="button" className={proxima ? 'ativo' : ''} onClick={() => setProxima(true)}>Sim</button>
            <button type="button" className={!proxima ? 'ativo' : ''} onClick={() => { setProxima(false); setData(''); setHora(''); }}>Não</button>
          </div>
        </Campo>

        <Campo rotulo="Data prevista" erro={erros.data}>
          <input type="date" value={data} min={hoje} disabled={!proxima} onChange={(e) => setData(e.target.value)} />
        </Campo>
        <Campo rotulo="Hora prevista" dica="opcional">
          <input type="time" value={hora} disabled={!proxima} onChange={(e) => setHora(e.target.value)} />
        </Campo>
      </div>
      <p className="cob-nota">O registro vai para a nuvem e para o histórico de cobranças do ERP. Com retorno marcado para depois de hoje, o título sai do painel até a data.</p>
    </Modal>
  );
}
