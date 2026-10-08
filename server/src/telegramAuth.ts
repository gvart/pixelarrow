/**
 * Telegram Mini App initData validation
 * (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
 *
 *   data_check_string = every field except `hash`, as key=value, sorted by key, joined by "\n"
 *   secret_key        = HMAC_SHA256(key = "WebAppData", message = bot_token)
 *   valid             = hex(HMAC_SHA256(key = secret_key, message = data_check_string)) == hash
 *
 * The comparison is constant-time (crypto.subtle.verify) and initData older
 * than `maxAgeSec` (24 h by default) is rejected.
 */
import { hexToBytes, hmac, hmacKey, hmacVerify, bytesToHex, utf8 } from './crypto';

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export type InitDataResult =
  | { ok: true; user: TelegramUser; authDate: number; fields: Record<string, string> }
  | { ok: false; reason: 'malformed' | 'missing_hash' | 'bad_hash' | 'expired' | 'future' | 'no_user' };

export const INIT_DATA_MAX_AGE_SEC = 24 * 60 * 60;
/** Tolerated clock skew for auth_date in the future. */
const FUTURE_SKEW_SEC = 5 * 60;

async function secretKey(botToken: string): Promise<CryptoKey> {
  const webAppKey = await hmacKey('WebAppData', ['sign']);
  const secret = await crypto.subtle.sign('HMAC', webAppKey, utf8(botToken));
  return hmacKey(secret);
}

function dataCheckString(params: URLSearchParams): string {
  const pairs: string[] = [];
  for (const [k, v] of params) if (k !== 'hash') pairs.push(`${k}=${v}`);
  return pairs.sort().join('\n');
}

export async function validateInitData(
  initData: string,
  botToken: string,
  nowSec = Math.floor(Date.now() / 1000),
  maxAgeSec = INIT_DATA_MAX_AGE_SEC,
): Promise<InitDataResult> {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'missing_hash' };
  const mac = hexToBytes(hash);
  if (!mac || mac.length !== 32) return { ok: false, reason: 'bad_hash' };

  const key = await secretKey(botToken);
  if (!(await hmacVerify(key, mac, dataCheckString(params)))) return { ok: false, reason: 'bad_hash' };

  const authDate = Number(params.get('auth_date'));
  if (!Number.isInteger(authDate) || authDate <= 0) return { ok: false, reason: 'malformed' };
  if (nowSec - authDate > maxAgeSec) return { ok: false, reason: 'expired' };
  if (authDate - nowSec > FUTURE_SKEW_SEC) return { ok: false, reason: 'future' };

  const rawUser = params.get('user');
  if (!rawUser) return { ok: false, reason: 'no_user' };
  let user: TelegramUser;
  try {
    user = JSON.parse(rawUser) as TelegramUser;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof user !== 'object' || user === null || !Number.isSafeInteger(user.id)) return { ok: false, reason: 'no_user' };

  const fields: Record<string, string> = {};
  for (const [k, v] of params) fields[k] = v;
  return { ok: true, user, authDate, fields };
}

/** Builds a correctly signed initData string (used by tests and local tooling). */
export async function signInitData(fields: Record<string, string>, botToken: string): Promise<string> {
  const params = new URLSearchParams(fields);
  const key = await secretKey(botToken);
  params.set('hash', bytesToHex(await hmac(key, dataCheckString(params))));
  return params.toString();
}
