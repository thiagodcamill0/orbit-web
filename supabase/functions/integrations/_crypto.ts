/**
 * _crypto.ts — AES-256-GCM helpers
 *
 * Usa a Web Crypto API nativa do Deno. Zero dependências externas.
 *
 * Formato do ciphertext armazenado: "<iv_base64>:<ciphertext_base64>"
 * IV: 12 bytes aleatórios por operação de escrita (GCM recomenda 96 bits).
 * Key: derivada do ENCRYPTION_SECRET (base64 de 32 bytes → AES-256).
 */

const ALGORITHM = 'AES-GCM';
const IV_BYTES   = 12;

function bytesToBase64(bytes: Uint8Array): string {
  let str = '';
  for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str);
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

async function importKey(secret: string): Promise<CryptoKey> {
  const raw = base64ToBytes(secret);
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Criptografa plaintext com AES-256-GCM.
 * Retorna string no formato "<iv_base64>:<ciphertext_base64>".
 */
export async function encryptApiKey(plaintext: string, secret: string): Promise<string> {
  const key = await importKey(secret);
  const iv  = crypto.getRandomValues(new Uint8Array(IV_BYTES));

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  return `${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ciphertext))}`;
}

/**
 * Decripta um valor produzido por encryptApiKey.
 * Lançará erro se o formato for inválido ou a key incorreta.
 */
export async function decryptApiKey(stored: string, secret: string): Promise<string> {
  const sep = stored.indexOf(':');
  if (sep === -1) throw new Error('Invalid ciphertext format');

  const iv         = base64ToBytes(stored.slice(0, sep));
  const ciphertext = base64ToBytes(stored.slice(sep + 1));
  const key        = await importKey(secret);

  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(plaintext);
}
