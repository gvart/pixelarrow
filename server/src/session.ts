/**
 * Stateless session tokens: `pa1.<base64url(JSON payload)>.<base64url(HMAC-SHA256)>`,
 * signed with SESSION_SECRET. Nothing is stored server-side; rotating
 * SESSION_SECRET logs everyone out.
 */
import { b64urlDecode, b64urlEncode, hmac, hmacKey, hmacVerify, utf8 } from './crypto';

export interface Session {
  /** players.id */
  pid: number;
  /** Telegram user id. */
  tg: number;
  /** Display name (for presence). */
  name: string;
  /** Issued at / expires at, unix seconds. */
  iat: number;
  exp: number;
}

export const SESSION_TTL_SEC = 7 * 24 * 60 * 60;
const PREFIX = 'pa1';

export async function signSession(
  data: Omit<Session, 'iat' | 'exp'>,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
  ttlSec = SESSION_TTL_SEC,
): Promise<{ token: string; session: Session }> {
  const session: Session = { ...data, iat: nowSec, exp: nowSec + ttlSec };
  const body = `${PREFIX}.${b64urlEncode(utf8(JSON.stringify(session)))}`;
  const sig = b64urlEncode(await hmac(await hmacKey(secret), body));
  return { token: `${body}.${sig}`, session };
}

export async function verifySession(token: string, secret: string, nowSec = Math.floor(Date.now() / 1000)): Promise<Session | null> {
  if (token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const sig = b64urlDecode(parts[2]);
  if (!sig || sig.length !== 32) return null;
  if (!(await hmacVerify(await hmacKey(secret), sig, `${parts[0]}.${parts[1]}`))) return null;
  const raw = b64urlDecode(parts[1]);
  if (!raw) return null;
  let s: Session;
  try {
    s = JSON.parse(new TextDecoder().decode(raw)) as Session;
  } catch {
    return null;
  }
  if (!Number.isSafeInteger(s.pid) || !Number.isSafeInteger(s.tg) || typeof s.exp !== 'number') return null;
  if (s.exp <= nowSec) return null;
  return s;
}
