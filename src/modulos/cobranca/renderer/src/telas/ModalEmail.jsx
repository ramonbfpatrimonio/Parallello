import React, { useMemo, useState } from 'react';
import { useCobranca, autoria } from '../contexto.js';
import { montarEmailTitulo, montarEmailTodos, pixDaMensagem } from '../logica/mensagens.js';
import { Botao, Campo, Modal, useAviso } from './ui.jsx';
import { PixBox, qrDataUrl } from './PixBox.jsx';

const MODELOS_TITULO = ['notificacao', 'vence_hoje', 'prox7', 'vencido_1', 'vencido_2', 'vencido_3', 'vencido_4'];
const NOTIFICACAO = new Set(['notificacao', 'vence_hoje', 'prox7']);

export function ModalEmail({ grupo, titulo: t, todos, onFechar }) {
  const ctx = useCobranca();
  const { config, erp, nuvem, hoje } = ctx;
  const avisar = useAviso();
  const base = { config, empresaErp: ctx.empresaErp, hoje };

  const inicial = useMemo(() => (todos ? montarEmailTodos(grupo, base) : montarEmailTitulo(t, base)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [modelo, setModelo] = useState(inicial?.chaveModelo || 'notificacao');
  const [para, setPara] = useState(grupo.email || '');
  const [assunto, setAssunto] = useState(inicial?.assunto || '');
  const [corpo, setCorpo] = useState(inicial?.corpo || '');
  const [valorPix, setValorPix] = useState(inicial?.valorPix || 0);
  const [anexarQr, setAnexarQr] = useState(config.financeiro.qrCodeNoEmail);
  const [enviando, setEnviando] = useState(false);

  const pix = pixDaMensagem(base, valorPix);

  if (todos && !inicial) {
    return (
      <Modal titulo="E-mail de cobrança" onFechar={onFechar} largura={440} rodape={<Botao onClick={onFechar}>Fechar</Botao>}>
        <p className="cob-texto">Este cliente não tem títulos vencidos para cobrança no momento.</p>
      </Modal>
    );
  }

  const trocarModelo = (m) => {
    setModelo(m);
    const e = montarEmailTitulo(t, base, m);
    setAssunto(e.assunto); setCorpo(e.corpo); setValorPix(e.valorPix);
  };

  const enviar = async () => {
    const destinos = para.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    if (!destinos.length || destinos.some((d) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d))) {
      avisar('Informe um e-mail válido (vários: separe com ponto e vírgula).', 'erro'); return;
    }
    setEnviando(true);
    const subtipo = todos ? 'todos' : (NOTIFICACAO.has(modelo) ? 'notificacao' : 'cobranca');
    const evento = {
      dia: hoje, ...autoria(ctx), tipo: 'email', subtipo,
      cliente_codigo: grupo.codigo, cliente_nome: grupo.nome,
      documentos: todos ? inicial.documentos : [t.docPag], destino: destinos.join('; '), assunto,
    };
    try {
      const qr = anexarQr && pix ? (await qrDataUrl(pix)).split(',')[1] : null;
      await erp.enviarEmail({ para: destinos.join(', '), assunto, corpo, qrPngBase64: qr });
      await nuvem.inserirEventos([{ ...evento, status: 'enviado' }]).catch(() => {});
      ctx.aplicarEnvioLocal('email', grupo.codigo, subtipo);
      avisar(`E-mail enviado para ${destinos.join(', ')}.`);
      onFechar();
    } catch (e) {
      await nuvem.inserirEventos([{ ...evento, status: 'falha', erro: e.message }]).catch(() => {});
      avisar(`Erro ao enviar e-mail: ${e.message}. Veja se a senha do SMTP no ERP não expirou.`, 'erro', 9000);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal titulo={todos ? 'E-mail com todos os vencidos' : 'Enviar e-mail'} subtitulo={`${grupo.codigo} · ${grupo.nome}${t ? ` · ${t.docPag}` : ''}`}
      onFechar={onFechar} largura={820}
      rodape={(<><Botao onClick={onFechar}>Cancelar</Botao><Botao variante="sucesso" carregando={enviando} onClick={enviar}>Enviar e-mail</Botao></>)}>
      <div className="cob-form">
        <Campo rotulo="Para" dica="Vários e-mails: separe com ponto e vírgula" largo>
          <input type="text" value={para} onChange={(e) => setPara(e.target.value)} placeholder="email@cliente.com.br" />
        </Campo>
        {!todos && (
          <Campo rotulo="Modelo" largo>
            <div className="cob-chips">
              {MODELOS_TITULO.map((m) => (
                <button key={m} type="button" className={`cob-chip${modelo === m ? ' ativo' : ''}`} onClick={() => trocarModelo(m)}>{config.modelos[m].nome}</button>
              ))}
            </div>
          </Campo>
        )}
        <Campo rotulo="Assunto" largo>
          <input type="text" value={assunto} onChange={(e) => setAssunto(e.target.value)} />
        </Campo>
        <Campo rotulo="Mensagem" largo>
          <textarea rows={14} value={corpo} onChange={(e) => setCorpo(e.target.value)} className="cob-mono" />
        </Campo>
      </div>
      {pix && (
        <>
          <PixBox payload={pix} valor={config.financeiro.pixComValorDoTitulo ? valorPix : 0} erp={erp} compacto />
          <label className="cob-check"><input type="checkbox" checked={anexarQr} onChange={(e) => setAnexarQr(e.target.checked)} /> Colocar o QR code do PIX no e-mail</label>
        </>
      )}
    </Modal>
  );
}
