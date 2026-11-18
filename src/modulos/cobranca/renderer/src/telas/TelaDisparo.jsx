import React, { useMemo, useRef, useState } from 'react';
import { useCobranca, autoria } from '../contexto.js';
import { agruparPorCliente, titulosDisparoLote } from '../logica/calculos.js';
import { montarEmailLote, pixDaMensagem } from '../logica/mensagens.js';
import { dataBR, inteiro, moeda, somarDias } from '../logica/formato.js';
import { Botao, Confirmar, Selo, Vazio, useAviso } from './ui.jsx';
import { qrDataUrl } from './PixBox.jsx';

const emailValido = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || '').split(/[;,]/)[0].trim());
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export function TelaDisparo() {
  const ctx = useCobranca();
  const { carteira, config, hoje, operador, erp, nuvem } = ctx;
  const avisar = useAviso();
  const dias = config.faixas.proximosDias;
  const grupos = useMemo(() => (carteira ? agruparPorCliente(titulosDisparoLote(carteira.titulos, hoje, dias)) : []), [carteira, hoje, dias]);
  const [desmarcados, setDesmarcados] = useState(() => new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [progresso, setProgresso] = useState(null);
  const [resultado, setResultado] = useState(null);
  const cancelar = useRef(false);

  if (!carteira) return <div className="cob-pagina cob-centro"><span className="cob-spin cob-spin-g" /></div>;

  const comEmail = grupos.filter((g) => emailValido(g.email));
  const semEmail = grupos.filter((g) => !emailValido(g.email));
  const aEnviar = comEmail.filter((g) => !desmarcados.has(g.codigo));
  const podeDisparar = Boolean(operador?.pode_disparar_lote);

  const disparar = async () => {
    setConfirmando(false);
    cancelar.current = false;
    const lote = crypto.randomUUID();
    const base = { config, empresaErp: ctx.empresaErp, hoje };
    const linhas = [];
    setProgresso({ feito: 0, total: aEnviar.length });
    const quem = autoria(ctx);

    // Sem e-mail: só registra no relatório
    const semEv = semEmail.map((g) => ({ dia: hoje, ...quem, tipo: 'email', subtipo: 'lote', cliente_codigo: g.codigo, cliente_nome: g.nome, documentos: g.titulos.map((t) => t.docPag), status: 'sem_email', lote_id: lote }));
    await nuvem.inserirEventos(semEv).catch(() => {});
    semEmail.forEach((g) => linhas.push({ status: 'sem_email', g, obs: 'Cliente sem e-mail cadastrado.' }));

    for (let i = 0; i < aEnviar.length; i += 1) {
      if (cancelar.current) break;
      const g = aEnviar[i];
      const m = montarEmailLote(g, g.titulos, base);
      const destino = g.email.split(/[;,]/).map((s) => s.trim()).filter(Boolean).join(', ');
      const ev = { dia: hoje, ...quem, tipo: 'email', subtipo: 'lote', cliente_codigo: g.codigo, cliente_nome: g.nome, documentos: g.titulos.map((t) => t.docPag), destino, assunto: m.assunto, lote_id: lote };
      try {
        const pix = config.financeiro.qrCodeNoEmail ? pixDaMensagem(base, m.valorPix) : '';
        const qr = pix ? (await qrDataUrl(pix)).split(',')[1] : null;
        await erp.enviarEmail({ para: destino, assunto: m.assunto, corpo: m.corpo, qrPngBase64: qr });
        await nuvem.inserirEventos([{ ...ev, status: 'enviado' }]).catch(() => {});
        ctx.aplicarEnvioLocal('email', g.codigo, 'lote');
        linhas.push({ status: 'enviado', g, obs: 'E-mail enviado.' });
      } catch (e) {
        await nuvem.inserirEventos([{ ...ev, status: 'falha', erro: e.message }]).catch(() => {});
        linhas.push({ status: 'falha', g, obs: e.message });
      }
      setProgresso({ feito: i + 1, total: aEnviar.length });
      if (i < aEnviar.length - 1 && !cancelar.current) await esperar(2000); // pausa para o servidor não bloquear por spam
    }
    setProgresso(null);
    const ordem = { enviado: 0, falha: 1, sem_email: 2 };
    linhas.sort((a, b) => ordem[a.status] - ordem[b.status]);
    setResultado({ linhas, cancelado: cancelar.current });
    const env = linhas.filter((l) => l.status === 'enviado').length;
    avisar(`Disparo concluído: ${env} enviado(s), ${linhas.filter((l) => l.status === 'falha').length} falha(s), ${semEmail.length} sem e-mail.`);
  };

  const exportarResultado = (formato) => erp.exportar({
    formato, arquivo: `disparo-${hoje}`, titulo: `Relatório do disparo de e-mails (${dias} dias)`, subtitulo: `${dataBR(hoje)} · ${operador?.nome || ''}`,
    colunas: [{ chave: 'status', titulo: 'Status', largura: 12 }, { chave: 'codigo', titulo: 'Código', largura: 10 }, { chave: 'cliente', titulo: 'Cliente', largura: 40 }, { chave: 'email', titulo: 'E-mail', largura: 30 }, { chave: 'obs', titulo: 'Observação', largura: 45 }],
    linhas: resultado.linhas.map((l) => ({ status: { enviado: 'ENVIADO', falha: 'FALHA', sem_email: 'SEM E-MAIL' }[l.status], codigo: l.g.codigo, cliente: l.g.nome, email: l.g.email, obs: l.obs })),
  }).catch((e) => avisar(e.message, 'erro'));

  return (
    <div className="cob-pagina">
      <header className="cob-cabecalho">
        <div>
          <h1>Disparo de lembretes por e-mail</h1>
          <p>Títulos que vencem de {dataBR(somarDias(hoje, 1))} até {dataBR(somarDias(hoje, dias))} · e-mail pelo SMTP de cobrança do ERP</p>
        </div>
      </header>

      {resultado ? (
        <>
          <div className="cob-resumo-disparo">
            <div className="cob-kpi cob-kpi-verde"><span className="cob-kpi-rotulo">Enviados</span><strong className="cob-kpi-valor">{resultado.linhas.filter((l) => l.status === 'enviado').length}</strong></div>
            <div className="cob-kpi cob-kpi-amarelo"><span className="cob-kpi-rotulo">Falhas</span><strong className="cob-kpi-valor">{resultado.linhas.filter((l) => l.status === 'falha').length}</strong></div>
            <div className="cob-kpi cob-kpi-vermelho"><span className="cob-kpi-rotulo">Sem e-mail</span><strong className="cob-kpi-valor">{resultado.linhas.filter((l) => l.status === 'sem_email').length}</strong></div>
            <div className="cob-barra-acoes">
              <Botao pequeno onClick={() => exportarResultado('xlsx')}>Excel</Botao>
              <Botao pequeno onClick={() => exportarResultado('pdf')}>PDF</Botao>
              <Botao pequeno variante="primario" onClick={() => setResultado(null)}>Novo disparo</Botao>
            </div>
          </div>
          {resultado.cancelado && <div className="cob-aviso-linha">Disparo interrompido pelo operador.</div>}
          <div className="cob-tabela-caixa">
            <table className="cob-tabela cob-tabela-simples">
              <thead><tr><th>Status</th><th>Código</th><th>Cliente</th><th>E-mail</th><th>Observação</th></tr></thead>
              <tbody>
                {resultado.linhas.map((l) => (
                  <tr key={l.g.codigo}>
                    <td><Selo tipo={{ enviado: 'verde', falha: 'amarelo', sem_email: 'vermelho' }[l.status]}>{{ enviado: 'ENVIADO', falha: 'FALHA', sem_email: 'SEM E-MAIL' }[l.status]}</Selo></td>
                    <td className="cob-cod">{l.g.codigo}</td><td>{l.g.nome}</td><td>{l.g.email || '-'}</td><td className="cob-pequeno">{l.obs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : !grupos.length ? (
        <Vazio titulo="Nenhum título para os próximos dias" texto={`Não há títulos vencendo entre amanhã e os próximos ${dias} dias.`} />
      ) : (
        <>
          <div className="cob-resumo-disparo">
            <div className="cob-kpi cob-kpi-azul"><span className="cob-kpi-rotulo">Clientes a receber o e-mail</span><strong className="cob-kpi-valor">{inteiro(aEnviar.length)}</strong></div>
            <div className="cob-kpi cob-kpi-vermelho"><span className="cob-kpi-rotulo">Sem e-mail cadastrado</span><strong className="cob-kpi-valor">{inteiro(semEmail.length)}</strong></div>
            <div className="cob-kpi cob-kpi-verde"><span className="cob-kpi-rotulo">Valor a vencer</span><strong className="cob-kpi-valor">{moeda(grupos.reduce((s, g) => s + g.valor, 0))}</strong></div>
            <div className="cob-barra-acoes">
              {progresso ? (
                <>
                  <div className="cob-progresso"><div style={{ width: `${(progresso.feito / Math.max(1, progresso.total)) * 100}%` }} /></div>
                  <span>{progresso.feito} de {progresso.total}</span>
                  <Botao pequeno variante="perigo" onClick={() => { cancelar.current = true; }}>Parar</Botao>
                </>
              ) : (
                <Botao variante="primario" disabled={!podeDisparar || !aEnviar.length} onClick={() => setConfirmando(true)}
                  title={podeDisparar ? '' : 'Operador sem permissão para disparo em lote'}>
                  Disparar {inteiro(aEnviar.length)} e-mail(s)
                </Botao>
              )}
            </div>
          </div>
          {!podeDisparar && <div className="cob-aviso-linha">O operador {operador?.nome} não tem permissão para o disparo em lote. O administrador libera em Área do sistema → Operadores.</div>}
          <div className="cob-tabela-caixa">
            <table className="cob-tabela cob-tabela-simples">
              <thead><tr><th style={{ width: 36 }} /><th>Código</th><th>Cliente</th><th>E-mail</th><th>Títulos</th><th className="dir">Valor</th></tr></thead>
              <tbody>
                {grupos.map((g) => {
                  const ok = emailValido(g.email);
                  return (
                    <tr key={g.codigo} className={ok ? '' : 'cob-linha-apagada'}>
                      <td>{ok && <input type="checkbox" checked={!desmarcados.has(g.codigo)} disabled={Boolean(progresso)}
                        onChange={() => setDesmarcados((d) => { const n = new Set(d); if (n.has(g.codigo)) n.delete(g.codigo); else n.add(g.codigo); return n; })} />}</td>
                      <td className="cob-cod">{g.codigo}</td>
                      <td>{g.nome}</td>
                      <td>{ok ? g.email : <Selo tipo="vermelho">sem e-mail</Selo>}</td>
                      <td className="cob-pequeno">{g.titulos.map((t) => `${t.docPag} (${dataBR(t.vencimento)})`).join(' · ')}</td>
                      <td className="dir">{moeda(g.valor)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {confirmando && (
        <Confirmar titulo="Disparo em lote" rotuloOk="Disparar agora" onFechar={() => setConfirmando(false)} onOk={disparar}
          texto={<p>Enviar o lembrete de vencimento para <strong>{aEnviar.length}</strong> cliente(s)? Há uma pausa de 2 segundos entre cada e-mail; deixe esta tela aberta até terminar.</p>} />
      )}
    </div>
  );
}
