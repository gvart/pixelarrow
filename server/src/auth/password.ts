/**
 * Password hashing and policy (ADR-0008 §2, M-PW-1..4, N-PW-1).
 *
 * Hash: PBKDF2-HMAC-SHA256 over HMAC-SHA256(pepper, NFKC(password)), a 16-byte
 * salt and a 32-byte output, stored as
 * `pbkdf2-sha256$<iter>$<pepperId>$<salt b64url>$<dk b64url>`. Verification
 * uses the stored parameters; a hash with an old count or pepper id verifies
 * and reports `needsRehash`. A missing or unusable hash still costs one PBKDF2
 * at the current count (dummy-hash timing), and the compare is constant-time.
 * Nothing here logs; callers must never log a password or a hash.
 */
import type { Env } from '../env';
import { b64urlDecode, b64urlEncode, hmacKey, utf8 } from '../crypto';
import { notConfigured } from '../errors';
import { COMMON_PASSWORDS } from './common-passwords';

/** The V6-ACCT-01 spike value (docs/v6/qa/PBKDF2_SPIKE.md); server/test/pbkdf2-spike.test.ts pins it. */
export const PBKDF2_ITERATIONS = 310_000;
const TAG = 'pbkdf2-sha256';
const SALT_BYTES = 16;
const DK_BITS = 256;
/** Stored counts outside this range are treated as malformed (never run a stored count of a billion). */
const MIN_STORED_ITER = 1_000;
const MAX_STORED_ITER = 2_000_000;

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export interface Pepper {
  id: string;
  /** The secret bytes; HMAC key material only, never logged or stored. */
  bytes: Uint8Array<ArrayBuffer>;
}
export interface PepperSet {
  current: Pepper;
  /** Old peppers still accepted for verification (rotation); their hashes get rehashed on log-in. */
  previous: Pepper[];
}

const ID = /^[A-Za-z0-9_-]{1,16}$/;

function decodePepper(b64: string, what: string): Uint8Array<ArrayBuffer> {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = Uint8Array.from(atob(b64.trim()), (ch) => ch.charCodeAt(0));
  } catch {
    throw notConfigured(what);
  }
  if (bytes.length < 16) throw notConfigured(what);
  return bytes;
}

/** The configured peppers, or 503 `not_configured` when the secrets are missing or malformed. */
export function peppersFromEnv(env: Env): PepperSet {
  const raw = env.PASSWORD_PEPPER;
  const id = env.PASSWORD_PEPPER_ID?.trim();
  if (!raw || !id || !ID.test(id)) throw notConfigured('PASSWORD_PEPPER');
  const previous: Pepper[] = [];
  if (env.PASSWORD_PEPPER_PREVIOUS) {
    const [pid, b64] = env.PASSWORD_PEPPER_PREVIOUS.split(':', 2);
    if (!pid || !b64 || !ID.test(pid) || pid === id) throw notConfigured('PASSWORD_PEPPER_PREVIOUS');
    previous.push({ id: pid, bytes: decodePepper(b64, 'PASSWORD_PEPPER_PREVIOUS') });
  }
  return { current: { id, bytes: decodePepper(raw, 'PASSWORD_PEPPER') }, previous };
}

async function derive(pw: string, pepper: Pepper, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array<ArrayBuffer>> {
  const peppered = await crypto.subtle.sign('HMAC', await hmacKey(pepper.bytes, ['sign']), utf8(pw.normalize('NFKC')));
  const base = await crypto.subtle.importKey('raw', peppered, 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, DK_BITS));
}

/** A fresh hash string for `pw` under `pepper` (a new random salt each time). `iterations` is for tests of old hashes. */
export async function hashPassword(pw: string, pepper: Pepper, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const dk = await derive(pw, pepper, salt, iterations);
  return [TAG, iterations, pepper.id, b64urlEncode(salt), b64urlEncode(dk)].join('$');
}

interface Parsed {
  iterations: number;
  pepper: Pepper;
  salt: Uint8Array<ArrayBuffer>;
  dk: Uint8Array<ArrayBuffer>;
}

function parse(stored: string | null, peppers: PepperSet): Parsed | null {
  if (!stored) return null;
  const parts = stored.split('$');
  if (parts.length !== 5 || parts[0] !== TAG || !/^\d{1,9}$/.test(parts[1])) return null;
  const iterations = Number(parts[1]);
  if (iterations < MIN_STORED_ITER || iterations > MAX_STORED_ITER) return null;
  const pepper = [peppers.current, ...peppers.previous].find((p) => p.id === parts[2]);
  const salt = b64urlDecode(parts[3]);
  const dk = b64urlDecode(parts[4]);
  if (!pepper || !salt || salt.length === 0 || !dk || dk.length !== DK_BITS / 8) return null;
  return { iterations, pepper, salt, dk };
}

/**
 * Checks `pw` against a stored hash. `stored` is null for an unknown email:
 * the same PBKDF2 work is done against a dummy, so timing does not reveal
 * whether the account exists.
 */
export async function verifyPassword(pw: string, stored: string | null, peppers: PepperSet): Promise<{ ok: boolean; needsRehash: boolean }> {
  const p = parse(stored, peppers);
  if (!p) {
    await derive(pw, peppers.current, crypto.getRandomValues(new Uint8Array(SALT_BYTES)), PBKDF2_ITERATIONS);
    return { ok: false, needsRehash: false };
  }
  const dk = await derive(pw, p.pepper, p.salt, p.iterations);
  const ok = crypto.subtle.timingSafeEqual(dk, p.dk);
  return { ok, needsRehash: ok && (p.iterations !== PBKDF2_ITERATIONS || p.pepper.id !== peppers.current.id) };
}

export type PolicyResult = 'ok' | 'too_short' | 'too_long' | 'common' | 'matches_email';

/** One character repeated, a short unit repeated (abcabcabc), or a plain ascending/descending run (abcdef, 98765). */
function trivial(pw: string): boolean {
  const cps = [...pw].map((ch) => ch.codePointAt(0)!);
  for (let unit = 1; unit <= 4; unit++) {
    if (cps.length >= unit * 2 && cps.every((cp, i) => cp === cps[i % unit])) return true;
  }
  const step = cps[1] - cps[0];
  return (step === 1 || step === -1) && cps.every((cp, i) => i === 0 || cp - cps[i - 1] === step);
}

/**
 * NIST SP 800-63B policy: 10–128 characters after NFKC (counted in code
 * points), no composition rules, not a common password, not the email or its
 * local part. Never truncates.
 */
export function checkPasswordPolicy(pw: string, email: string): PolicyResult {
  const norm = pw.normalize('NFKC');
  const length = [...norm].length;
  if (length < PASSWORD_MIN) return 'too_short';
  if (length > PASSWORD_MAX) return 'too_long';
  const lower = norm.toLowerCase();
  const e = email.trim().normalize('NFKC').toLowerCase();
  const at = e.lastIndexOf('@');
  const local = at > 0 ? e.slice(0, at) : '';
  if (lower === e || (local.length > 0 && lower === local)) return 'matches_email';
  if (COMMON_PASSWORDS.has(lower) || trivial(lower)) return 'common';
  return 'ok';
}
