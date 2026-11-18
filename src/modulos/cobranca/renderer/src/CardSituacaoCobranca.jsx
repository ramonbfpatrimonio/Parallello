// ============================================================
// Card "Situação de cobrança" para a ficha do cliente na Análise de Crédito.
// Lê os títulos em aberto do ERP e os registros de cobrança da nuvem.
//
// No Parallello a Análise de Crédito passa nuvem={...} e erp={...} (pela ponte dela),
// e só mostra o card para quem tem o módulo Cobrança liberado.
// ============================================================
import React, { useEffect, useState } from 'react';
import { criarNuvemSupabase } from './nuvem.js';
import { mesclarConfig } from './logica/padroes.js';
import { calcularTitulo, ehVencido, marcaDoRegistro } from './logica/calculos.js';
import { dataBR, hojeISO, moeda, inteiro } from './logica/formato.js';
import './cobranca.css';

export default function CardSituacaoCobranca({ supabase, empresaId, codigoCliente, nuvem: nuvemExterna, erp: erpExterno }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!codigoCliente) return undefined;
    let vivo = true;
    setDados(null); setErro('');
    (async () => {
      try {
        const nuvem = nuvemExterna || criarNuvemSupabase(supabase, empresaId);
        const erp = erpExterno || window.parallelloCobranca;
        const codigo = String(codigoCliente).trim();
        const [cfgSalva, linhas, regs, eventos] = await Promise.all([
          nuvem.carregarConfig(), erp.carteiraCliente(codigo), nuvem.registrosDoCliente(codigo), nuvem.eventosDoCliente(codigo),
        ]);
        const config = mesclarConfig(cfgSalva);
        const hoje = hojeISO();
        const titulos = linhas.map((l) => calcularTitulo(l, hoje, config.faixas));
        const vencidos = titulos.filter((t) => ehVencido(t.faixa));
        const ultimoPorDoc = new Map();
        for (const r of regs) { const d = r.documento.toUpperCase(); if (!ultimoPorDoc.has(d)) ultimoPorDoc.set(d, r); }
        const abertos = new Set(titulos.map((t) => t.docPag.toUpperCase()));
        const marcas = [...ultimoPorDoc.entries()].filter(([d]) => abertos.has(d)).map(([, r]) => marcaDoRegistro(r, config.resultados));
        if (vivo) {
          setDados({
            emAberto: titulos.reduce((s, t) => s + t.valorAtual, 0),
            qtdAberto: titulos.length,
            vencido: vencidos.reduce((s, t) => s + t.valorAtual, 0),
            qtdVencido: vencidos.length,
            maiorAtraso: titulos.reduce((m, t) => Math.max(m, t.dias), 0),
            protestados: titulos.filter((t) => t.protestado).length,
            ultimo: regs[0] || null,
            acordo: marcas.includes('acordo'),
            negociacao: marcas.includes('negociacao'),
            contatos: regs.length,
            envios: eventos.filter((e) => e.tipo === 'email' || e.tipo === 'whatsapp').length,
          });
        }
      } catch (e) { if (vivo) setErro(e.message || String(e)); }
    })();
    return () => { vivo = false; };
  }, [codigoCliente, empresaId, supabase, nuvemExterna, erpExterno]);

  return (
    <div className="cob cob-card-ac">
      <div className="cob-card-ac-topo">
        <strong>Situação de cobrança</strong>
        {dados?.protestados > 0 && <span className="cob-selo cob-selo-vinho">{dados.protestados} protestado(s)</span>}
        {dados?.acordo && <span className="cob-selo cob-selo-verde">Acordo</span>}
        {dados?.negociacao && <span className="cob-selo cob-selo-amarelo">Negociação</span>}
      </div>
      {erro && <div className="cob-campo-erro">{erro}</div>}
      {!dados && !erro && <span className="cob-spin cob-spin-g" />}
      {dados && (
        <>
          <div className="cob-card-ac-grade">
            <div><span>Em aberto</span><strong>{moeda(dados.emAberto)}</strong><small>{inteiro(dados.qtdAberto)} título(s)</small></div>
            <div><span>Vencido</span><strong className={dados.vencido > 0 ? 'cob-txt-vermelho' : ''}>{moeda(dados.vencido)}</strong><small>{inteiro(dados.qtdVencido)} título(s)</small></div>
            <div><span>Maior atraso</span><strong>{inteiro(dados.maiorAtraso)} dias</strong></div>
            <div><span>Contatos de cobrança</span><strong>{inteiro(dados.contatos)}</strong><small>{inteiro(dados.envios)} e-mail/WhatsApp</small></div>
          </div>
          {dados.ultimo ? (
            <div className="cob-card-ac-ultimo">
              <span>Último contato: <strong>{dataBR(String(dados.ultimo.criado_em).slice(0, 10))}</strong> por {dados.ultimo.operador_nome}</span>
              <span>{dados.ultimo.resultado_codigo} - {dados.ultimo.resultado_descricao}{dados.ultimo.situacao_descricao ? ` · ${dados.ultimo.situacao_descricao}` : ''}</span>
              {dados.ultimo.proxima && dados.ultimo.data_prevista && <span>Próximo contato: <strong>{dataBR(dados.ultimo.data_prevista)}</strong> {dados.ultimo.hora_prevista || ''}</span>}
              {dados.ultimo.observacao && <em>{dados.ultimo.observacao}</em>}
            </div>
          ) : <div className="cob-pequeno">Nenhum contato de cobrança registrado.</div>}
        </>
      )}
    </div>
  );
}
