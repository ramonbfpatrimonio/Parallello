import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Botao, useAviso } from './ui.jsx';
import { moeda } from '../logica/formato.js';

export async function qrDataUrl(payload) {
  if (!payload) return '';
  return QRCode.toDataURL(payload, { width: 300, margin: 1, errorCorrectionLevel: 'M' });
}

export async function copiarTexto(erp, texto) {
  try {
    if (erp?.copiar) { await erp.copiar(texto); return true; }
  } catch (_) { /* tenta o navegador */ }
  try { await navigator.clipboard.writeText(texto); return true; } catch (_) { return false; }
}

// Caixa do PIX: QR code + copia e cola + botão Copiar
export function PixBox({ payload, valor, erp, compacto }) {
  const avisar = useAviso();
  const [img, setImg] = useState('');
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCopiado(false);
    qrDataUrl(payload).then((u) => { if (vivo) setImg(u); }).catch(() => setImg(''));
    return () => { vivo = false; };
  }, [payload]);

  if (!payload) {
    return <div className="cob-pix cob-pix-vazio">PIX não configurado. O administrador cadastra a chave na Área do sistema (Ctrl+Shift+B) → Financeiro e PIX.</div>;
  }

  const copiar = async () => {
    const ok = await copiarTexto(erp, payload);
    if (ok) {
      setCopiado(true);
      avisar('PIX copia e cola copiado.');
      setTimeout(() => setCopiado(false), 2500);
    } else avisar('Não foi possível copiar. Selecione o texto e use Ctrl+C.', 'erro');
  };

  return (
    <div className={`cob-pix${compacto ? ' cob-pix-compacto' : ''}`}>
      {img && <img src={img} alt="QR Code PIX" className="cob-pix-qr" />}
      <div className="cob-pix-dados">
        <div className="cob-pix-topo">
          <strong>PIX copia e cola</strong>
          {valor > 0 && <span className="cob-pix-valor">{moeda(valor)}</span>}
        </div>
        <textarea readOnly value={payload} rows={compacto ? 3 : 4} onFocus={(e) => e.target.select()} />
        <Botao variante={copiado ? 'sucesso' : 'primario'} onClick={copiar}>
          {copiado ? '✓ Copiado!' : 'Copiar PIX copia e cola'}
        </Botao>
      </div>
    </div>
  );
}
