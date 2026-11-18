import React from 'react';
import { useCobranca, autoria } from '../contexto.js';
import { dataBR, moeda } from '../logica/formato.js';
import { Botao, Confirmar, Modal, useAviso } from './ui.jsx';

export function ModalProtesto({ grupo, titulo: t, onFechar }) {
  const ctx = useCobranca();
  const avisar = useAviso();

  if (!ctx.operador?.pode_protestar) {
    return (
      <Modal titulo="Protestar título" onFechar={onFechar} largura={460} rodape={<Botao onClick={onFechar}>Fechar</Botao>}>
        <p className="cob-texto">O operador <strong>{ctx.operador?.nome}</strong> não tem permissão para protestar. O administrador libera em Área do sistema → Operadores.</p>
      </Modal>
    );
  }

  const protestar = async () => {
    try {
      const r = await ctx.erp.protestar(t.docPag);
      if (!r.linhas) throw new Error('O documento não foi encontrado no Contas a Receber.');
      await ctx.nuvem.inserirEventos([{
        dia: ctx.hoje, ...autoria(ctx), tipo: 'protesto', subtipo: 'marcado',
        cliente_codigo: grupo.codigo, cliente_nome: grupo.nome, documentos: [t.docPag], status: 'feito',
      }]).catch(() => {});
      ctx.aplicarProtestoLocal(t.docPag);
      avisar(`Título ${t.docPag} marcado como protestado no ERP.`);
      onFechar();
    } catch (e) {
      avisar(`Erro ao protestar: ${e.message}`, 'erro', 8000);
    }
  };

  return (
    <Confirmar titulo="Protestar título" perigo rotuloOk="Sim, protestar" onFechar={onFechar} onOk={protestar}
      texto={(
        <>
          <p>Deseja realmente enviar o título <strong>{t.docPag}</strong> de <strong>{grupo.nome}</strong> para protesto?</p>
          <p>Vencimento {dataBR(t.vencimento)} · {t.dias} dias de atraso · {moeda(t.valorAtual)}</p>
          <p className="cob-nota">Isso marca o título como protestado no ERP (Contas a Receber → Protestado).</p>
        </>
      )} />
  );
}
