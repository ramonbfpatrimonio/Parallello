import React, { useState } from 'react';
import { useCobranca } from '../contexto.js';
import { gerarPixCopiaCola, pixConfigurado } from '../logica/pix.js';
import { arred2, dataBR, moeda } from '../logica/formato.js';
import { Botao, Campo, Modal } from './ui.jsx';
import { PixBox } from './PixBox.jsx';

function txidDe(doc) {
  return String(doc || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
}

export function ModalPix({ grupo, titulo: t, onFechar }) {
  const { config, erp } = useCobranca();
  const fin = config.financeiro;
  const [valorTxt, setValorTxt] = useState(String(t?.valorAtual ?? 0).replace('.', ','));
  const [comValor, setComValor] = useState(true);
  const valor = arred2(Number(String(valorTxt).replace(/\./g, '').replace(',', '.')) || 0);
  const payload = pixConfigurado(fin) ? gerarPixCopiaCola(fin, comValor ? valor : 0, txidDe(t?.docPag)) : '';

  return (
    <Modal titulo="Gerar PIX" subtitulo={`${grupo.codigo} · ${grupo.nome}${t ? ` · ${t.docPag} · venc. ${dataBR(t.vencimento)}` : ''}`}
      onFechar={onFechar} largura={640} rodape={<Botao onClick={onFechar}>Fechar</Botao>}>
      <div className="cob-form">
        <Campo rotulo="Valor do PIX" dica={t ? `Valor atualizado do título: ${moeda(t.valorAtual)}` : ''}>
          <input type="text" inputMode="decimal" value={valorTxt} disabled={!comValor} onChange={(e) => setValorTxt(e.target.value.replace(/[^\d,.]/g, ''))} />
        </Campo>
        <Campo rotulo="Tipo">
          <div className="cob-alternar">
            <button type="button" className={comValor ? 'ativo' : ''} onClick={() => setComValor(true)}>Com valor</button>
            <button type="button" className={!comValor ? 'ativo' : ''} onClick={() => setComValor(false)}>Cliente digita o valor</button>
          </div>
        </Campo>
      </div>
      <PixBox payload={payload} valor={comValor ? valor : 0} erp={erp} />
      {payload && <p className="cob-nota">Recebedor: {fin.titular || fin.setor} · chave {fin.tipoChavePix}: {fin.chavePix} · identificador {txidDe(t?.docPag)}</p>}
    </Modal>
  );
}
