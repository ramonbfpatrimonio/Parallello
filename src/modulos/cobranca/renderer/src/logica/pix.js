// PIX copia e cola (BR Code estático), igual ao GerarPixCopiaCola da planilha.
import { semAcento, soNumeros } from './formato.js';

function campo(id, valor) {
  const v = String(valor);
  return `${id}${String(v.length).padStart(2, '0')}${v}`;
}

export function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function normalizarChavePix(chave, tipo) {
  const c = String(chave || '').trim();
  const t = semAcento(tipo).toUpperCase();
  if (!c) return '';
  if (t.includes('CELULAR') || t.includes('TELEFONE') || t.includes('FONE')) {
    let so = soNumeros(c);
    if (so.startsWith('55') && so.length >= 12) so = so.slice(2);
    return `+55${so}`;
  }
  if (t.includes('CNPJ') || t.includes('CPF')) return soNumeros(c);
  if (t.includes('MAIL')) return c.toLowerCase();
  return c; // aleatória
}

/**
 * Gera o PIX copia e cola. valor = 0 deixa o cliente digitar o valor no banco.
 * txid opcional (até 25 caracteres alfanuméricos), padrão '***'.
 */
export function gerarPixCopiaCola(fin, valor = 0, txid = '***') {
  const chave = normalizarChavePix(fin?.chavePix, fin?.tipoChavePix);
  if (!chave) return '';
  let nome = semAcento(fin.titular || fin.setor || 'RECEBEDOR').toUpperCase().trim();
  if (!nome) nome = 'RECEBEDOR';
  nome = nome.slice(0, 25);
  let cidade = semAcento(fin.cidadePix || 'MANAUS').toUpperCase().trim() || 'MANAUS';
  cidade = cidade.slice(0, 15);
  const id = String(txid || '***').replace(/[^A-Za-z0-9*]/g, '').slice(0, 25) || '***';

  let p = campo('00', '01');
  p += campo('01', '11');
  p += campo('26', campo('00', 'br.gov.bcb.pix') + campo('01', chave));
  p += campo('52', '0000');
  p += campo('53', '986');
  const v = Number(valor) || 0;
  if (v > 0) p += campo('54', v.toFixed(2));
  p += campo('58', 'BR');
  p += campo('59', nome);
  p += campo('60', cidade);
  p += campo('62', campo('05', id));
  p += '6304';
  return p + crc16(p);
}

export function pixConfigurado(fin) {
  return Boolean(String(fin?.chavePix || '').trim());
}
