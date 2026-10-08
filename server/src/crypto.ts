/** Small WebCrypto helpers (HMAC-SHA256, base64url, hex). */

const enc = new TextEncoder();

export function utf8(s: string): Uint8Array<ArrayBuffer> {
  return enc.encode(s) as Uint8Array<ArrayBuffer>;
}

export async function hmacKey(secret: BufferSource | string, usages: Array<'sign' | 'verify'> = ['sign', 'verify']): Promise<CryptoKey> {
  const raw = typeof secret === 'string' ? utf8(secret) : secret;
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, usages);
}

export async function hmac(key: CryptoKey, data: string): Promise<ArrayBuffer> {
  return crypto.subtle.sign('HMAC', key, utf8(data));
}

/** Constant-time HMAC check (crypto.subtle.verify compares in constant time). */
export async function hmacVerify(key: CryptoKey, mac: Uint8Array<ArrayBuffer>, data: string): Promise<boolean> {
  return crypto.subtle.verify('HMAC', key, mac, utf8(data));
}

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^(?:[0-9a-fA-F]{2})*$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

export function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function randomNonce(bytes = 9): string {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Constant-time string comparison (length is not secret). */
export function safeEqual(a: string, b: string): boolean {
  const x = utf8(a);
  const y = utf8(b);
  if (x.length !== y.length) return false;
  return crypto.subtle.timingSafeEqual(x, y);
}
