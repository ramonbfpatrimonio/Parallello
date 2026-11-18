import React, { useEffect, useMemo, useState } from 'react';
import { useCobranca, autoria } from '../contexto.js';
import { ehVencido, rotulosFaixas } from '../logica/calculos.js';
import { montarWhatsApp, linkWhatsApp, pixDaMensagem } from '../logica/mensagens.js';
import { dataBR, moeda, telefoneWhatsApp } from '../logica/formato.js';
import { Botao, Campo, Modal, useAviso } from './ui.jsx';
import { PixBox } from './PixBox.jsx';

export function ModalWhatsApp({ grupo, onFechar }) {
  const ctx = useCobranca();
  const { config, erp, nuvem, hoje } = ctx;
  const avisar = useAviso();
  const base = { config, empresaErp: ctx.empresaErp, hoje };
  const rot = rotulosFaixas(config.faixas);

  const temVencido = grupo.titulos.some((t) => ehVencido(t.faixa));
  const [marcados, setMarcados] = useState(() => new Set(grupo.titulos.filter((t) => !temVencido || ehVencido(t.faixa)).map((t) => t.docPag)));
  const [telefone, setTelefone] = useState(telefoneWhatsApp(grupo.telefone));
  const [modo, setModo] = useState(() => { try { return localStorage.getItem('cob-whats-modo') || 'app'; } catch (_) { return 'app'; } });
  const [texto, setTexto] = useState('');
  const [editado, setEditado] = useState(false);
  const [abrindo, setAbrindo] = useState(false);

  const selecionados = useMemo(() => grupo.titulos.filter((t) => marcados.has(t.docPag)), [grupo, marcados]);
  const msg = useMemo(() => montarWhatsApp(grupo, selecionados, base), [selecionados]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!editado) setTexto(msg.texto); }, [msg, editado]);
  const pix = pixDaMensagem(base, msg.valorPix);

  const alternar = (doc) => setMarcados((m) => { const n = new Set(m); if (n.has(doc)) n.delete(doc); else n.add(doc); return n; });

  const abrir = async () => {
    const tel = telefoneWhatsApp(telefone);
    if (!tel) { avisar('Telefone inválido para o WhatsApp. Use DDD + número.', 'erro'); return; }
    if (!selecionados.length) { avisar('Marque pelo menos um título.', 'erro'); return; }
    setAbrindo(true);
    try {
      try { localStorage.setItem('cob-whats-modo', modo); } catch (_) { /* ignora */ }
      await erp.abrirExterno(linkWhatsApp(tel, texto, modo));
      await nuvem.inserirEventos([{
        dia: hoje, ...autoria(ctx), tipo: 'whatsapp', subtipo: 'titulos', cliente_codigo: grupo.codigo, cliente_nome: grupo.nome,
        documentos: selecionados.map((t) => t.docPag), destino: tel, status: 'aberto',
      }]).catch(() => {});
      ctx.aplicarEnvioLocal('whatsapp', grupo.codigo);
      avisar(`WhatsApp aberto com ${selecionados.length} título(s). Depois de falar com o cliente, registre o resultado.`);
      onFechar();
    } catch (e) {
      avisar(`Não foi possível abrir o WhatsApp: ${e.message}`, 'erro');
    } finally { setAbrindo(false); }
  };

  return (
    <Modal titulo="Enviar WhatsApp" subtitulo={`${grupo.codigo} · ${grupo.nome}`} onFechar={onFechar} largura={860}
      rodape={(
        <>
          <div className="cob-alternar cob-alternar-p">
            <button type="button" className={modo === 'app' ? 'ativo' : ''} onClick={() => setModo('app')}>WhatsApp do computador</button>
            <button type="button" className={modo === 'web' ? 'ativo' : ''} onClick={() => setModo('web')}>WhatsApp Web</button>
          </div>
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao variante="whats" carregando={abrindo} onClick={abrir}>Abrir WhatsApp</Botao>
        </>
      )}>
      <div className="cob-duas">
        <div>
          <Campo rotulo="Telefone (com DDD)">
            <input type="text" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </Campo>
          <div className="cob-lista-check">
            <div className="cob-lista-check-topo">
              <strong>Títulos na mensagem</strong>
              <span>
                <button type="button" className="cob-link" onClick={() => setMarcados(new Set(grupo.titulos.map((t) => t.docPag)))}>todos</button> ·{' '}
                <button type="button" className="cob-link" onClick={() => setMarcados(new Set(grupo.titulos.filter((t) => ehVencido(t.faixa)).map((t) => t.docPag)))}>só vencidos</button> ·{' '}
                <button type="button" className="cob-link" onClick={() => setMarcados(new Set())}>nenhum</button>
              </span>
            </div>
            {grupo.titulos.map((t) => (
              <label key={t.docPag} className="cob-check-linha">
                <input type="checkbox" checked={marcados.has(t.docPag)} onChange={() => alternar(t.docPag)} />
                <span className="cob-doc">{t.docPag}</span>
                <span>{dataBR(t.vencimento)}</span>
                <span className="cob-pequeno">{rot[t.faixa]}</span>
                <strong className="dir">{moeda(t.valorAtual)}</strong>
              </label>
            ))}
          </div>
          {pix && <PixBox payload={pix} valor={config.financeiro.pixComValorDoTitulo ? msg.valorPix : 0} erp={erp} compacto />}
        </div>
        <Campo rotulo={editado ? 'Mensagem (editada)' : 'Mensagem'} dica={editado ? '' : 'Você pode editar antes de abrir.'} largo>
          <textarea rows={22} value={texto} className="cob-mono" onChange={(e) => { setTexto(e.target.value); setEditado(true); }} />
          {editado && <button type="button" className="cob-link" onClick={() => setEditado(false)}>Voltar ao texto automático</button>}
        </Campo>
      </div>
    </Modal>
  );
}
