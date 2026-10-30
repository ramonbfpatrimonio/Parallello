// Criptografia das senhas das conexões e hash das senhas dos usuários
const crypto = require('crypto');
const os = require('os');

function safe() {
  try {
    const { safeStorage } = require('electron');
    return safeStorage && safeStorage.isEncryptionAvailable() ? safeStorage : null;
  } catch {
    return null;
  }
}

function chaveLocal() {
  return crypto.createHash('sha256')
    .update('indicador-logistico|' + os.hostname() + '|' + os.userInfo().username)
    .digest();
}

function criptografar(texto) {
  if (!texto) return '';
  const ss = safe();
  if (ss) return 'ss:' + ss.encryptString(texto).toString('base64');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chaveLocal(), iv);
  const enc = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return 'gcm:' + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}

function descriptografar(valor) {
  if (!valor) return '';
  try {
    if (valor.startsWith('ss:')) {
      const ss = safe();
      if (!ss) return '';
      return ss.decryptString(Buffer.from(valor.slice(3), 'base64'));
    }
    if (valor.startsWith('gcm:')) {
      const b = Buffer.from(valor.slice(4), 'base64');
      const d = crypto.createDecipheriv('aes-256-gcm', chaveLocal(), b.subarray(0, 12));
      d.setAuthTag(b.subarray(12, 28));
      return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
    }
  } catch {
    return '';
  }
  return '';
}

function hashSenha(senha, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(senha), salt, 64).toString('hex');
  return { salt, hash };
}

function conferirSenha(senha, salt, hash) {
  const h = crypto.scryptSync(String(senha), salt, 64);
  const esperado = Buffer.from(hash, 'hex');
  return esperado.length === h.length && crypto.timingSafeEqual(h, esperado);
}

module.exports = { criptografar, descriptografar, hashSenha, conferirSenha };
