/**
 * The email-link pages' rules (V6-ACCT-06; design/ux/accounts-v6.md §5.4, §7.2, §8.3, §8.4), with no
 * DOM: where the token comes from, which state each server reply shows, and two device hints read from
 * the game's own localStorage (the language setting, and whether this browser holds a guest save).
 *
 * It imports nothing from the game, so the page stays a few KB (no Phaser, no platform layer). The
 * token is never logged, never put in a query string, and never sent anywhere but the POST body.
 */

/** Mirrors src/ui/account/flows.ts PASSWORD_MIN / PASSWORD_MAX (a test keeps them equal). */
export const PW_MIN = 10;
export const PW_MAX = 128;

export type Variant = 'signup' | 'add_email' | 'change_email' | 'reset';
export type Purpose = 'signup' | 'add_email' | 'change_email';
export type Lang = 'en' | 'ru';

/** Email tokens are 32 random bytes in base64url (server/src/auth/flows.ts newToken); the server caps them at 128. */
const TOKEN_RE = /^#t=([A-Za-z0-9_-]{16,128})$/;
/** Conflict ids, as the game's #account/conflict/<id> route accepts them (src/online/deeplink.ts). */
const CONFLICT_RE = /^[A-Za-z0-9_-]{22}$/;

/** The token from the address fragment (`#t=…`), or null when the link is incomplete or malformed. */
export function readToken(hash: string): string | null {
  return TOKEN_RE.exec(hash)?.[1] ?? null;
}

export function variantOf(pathname: string): Variant | null {
  const m = /\/auth\/(signup|add_email|change_email|reset)(?:\.html)?\/?$/.exec(pathname);
  return (m?.[1] as Variant | undefined) ?? null;
}

/** A server reply: the status and the parsed JSON body; null when the network or the body failed. */
export type Reply = { status: number; body: unknown } | null;

/** Message keys of auth/strings.*.ts the views name. */
export type PageKey = 'auth.err.pwShort' | 'auth.err.pwLong' | 'auth.err.pwCommon' | 'auth.err.pwEmail' | 'auth.err.creds' | 'auth.page.rate' | 'auth.page.offline' | 'auth.err.unavailable';

export type View =
  | { kind: 'success'; purpose: Purpose; name: string; campaign?: 'comes' | 'otherDevice'; removedEmpty?: true }
  | { kind: 'resetDone' }
  | { kind: 'expired'; variant: Variant }
  | { kind: 'taken' }
  | { kind: 'conflict' }
  | { kind: 'banned' }
  | { kind: 'rate' }
  | { kind: 'offline' }
  | { kind: 'unavailable' }
  | { kind: 'handover'; to: string }
  /** A form stays open: a message under its password field, or in its banner. */
  | { kind: 'field'; key: PageKey }
  | { kind: 'banner'; key: PageKey };

const codeOf = (r: Reply): string => {
  const e = (r?.body as { error?: { code?: unknown } } | null)?.error;
  return typeof e?.code === 'string' ? e.code : '';
};
const nameOf = (r: Reply): string => {
  const n = (r?.body as { player?: { displayName?: unknown } } | null)?.player?.displayName;
  return typeof n === 'string' ? n : '';
};
const PURPOSES: readonly Purpose[] = ['signup', 'add_email', 'change_email'];

/** The errors every call shares; undefined when the caller decides. */
function common(r: Reply): View | undefined {
  if (!r || r.status >= 500) return { kind: 'offline' };
  if (r.status === 429) return { kind: 'rate' };
  if (r.status === 403) return codeOf(r) === 'banned' ? { kind: 'banned' } : { kind: 'unavailable' };
  return undefined;
}

/** POST /api/auth/verify (V6-042, V6-049): the purpose comes from the server, which knows the token. */
export function verifyView(variant: Variant, r: Reply, hasGuestSave: boolean): View {
  if (r && r.status === 200) {
    const p = (r.body as { purpose?: Purpose }).purpose;
    const purpose = p && PURPOSES.includes(p) ? p : variant === 'reset' ? 'signup' : variant;
    const v: View = { kind: 'success', purpose, name: nameOf(r) };
    if (purpose === 'signup') v.campaign = hasGuestSave ? 'comes' : 'otherDevice';
    return v;
  }
  const c = common(r);
  if (c) return c;
  const code = codeOf(r);
  if (code === 'email_taken') return { kind: 'taken' };
  if (code === 'email_conflict') return { kind: 'conflict' };
  // invalid_token, and already_has_email (the Add row isn't offered then; the link is of no use).
  if (r!.status === 400 || r!.status === 409) return { kind: 'expired', variant };
  return { kind: 'unavailable' };
}

const POLICY: Record<string, PageKey> = { too_short: 'auth.err.pwShort', too_long: 'auth.err.pwLong', common: 'auth.err.pwCommon', matches_email: 'auth.err.pwEmail' };

/** Errors of a form that should keep what the player typed: the rate limit and the network go in its banner. */
function formCommon(r: Reply): View | undefined {
  const c = common(r);
  if (c?.kind === 'offline') return { kind: 'banner', key: 'auth.page.offline' };
  if (c?.kind === 'rate') return { kind: 'banner', key: 'auth.page.rate' };
  return c;
}

/** POST /api/auth/reset/confirm (V6-042). */
export function resetView(r: Reply): View {
  if (r && r.status === 200) return { kind: 'resetDone' };
  const c = formCommon(r);
  if (c) return c;
  const code = codeOf(r);
  if (POLICY[code]) return { kind: 'field', key: POLICY[code] };
  if (code === 'invalid_token') return { kind: 'expired', variant: 'reset' };
  return { kind: 'banner', key: 'auth.err.unavailable' };
}

/** POST /api/auth/verify/conflict (V6-LINK-03): the add_email token plus the password of the address's own account. */
export function conflictView(r: Reply): View {
  if (r && r.status === 200) {
    const b = r.body as { conflict?: unknown; removedEmpty?: unknown };
    if (typeof b.conflict === 'string' && CONFLICT_RE.test(b.conflict)) return { kind: 'handover', to: `/#account/conflict/${b.conflict}` };
    const v: View = { kind: 'success', purpose: 'add_email', name: nameOf(r) };
    if (b.removedEmpty === true) v.removedEmpty = true;
    return v;
  }
  const c = formCommon(r);
  if (c) return c;
  const code = codeOf(r);
  if (code === 'invalid_credentials') return { kind: 'field', key: 'auth.err.creds' };
  if (code === 'invalid_token') return { kind: 'expired', variant: 'add_email' };
  return { kind: 'banner', key: 'auth.err.unavailable' };
}

// ---- device hints (read only; the page never writes the game's storage) ----

/** The part of localStorage the hints read. */
export interface Store {
  getItem(k: string): string | null;
}

/** src/platform/web/dom.ts prefix; src/game/save.ts and src/platform/saveSync.ts keys. */
const K = (k: string) => `pixelarrow:${k}`;
const get = (s: Store | null, k: string): string | null => {
  try {
    return s?.getItem(K(k)) ?? null;
  } catch {
    return null;
  }
};

/** A campaign save that never synced with a server: a guest's, which comes along when they sign up. */
export function guestSave(s: Store | null): boolean {
  return get(s, 'px_meta') !== null && get(s, 'px_sync') === null;
}

/** The game's language setting ('en' | 'ru' | 'auto') from the current save slot, or null. */
export function savedLangSetting(s: Store | null): 'en' | 'ru' | 'auto' | null {
  try {
    const meta = JSON.parse(get(s, 'px_meta') ?? 'null') as { n?: number; s?: number } | null;
    if (!meta || typeof meta.n !== 'number' || meta.n < 1 || meta.n > 64) return null;
    let text = '';
    for (let i = 0; i < meta.n; i++) text += get(s, meta.s ? `px_part1_${i}` : `px_part_${i}`) ?? '';
    const lang = (JSON.parse(text) as { settings?: { lang?: unknown } }).settings?.lang;
    return lang === 'en' || lang === 'ru' || lang === 'auto' ? lang : null;
  } catch {
    return null;
  }
}

/** src/i18n/index.ts langFromTag, for the browser's languages. */
function fromTag(tag: string): Lang | null {
  const base = tag.toLowerCase().split(/[-_]/)[0];
  if (base === 'ru' || base === 'be' || base === 'kk' || base === 'ky') return 'ru';
  return base === 'en' ? 'en' : null;
}

/** The game's language setting if set, else the browser's first supported language, else English. */
export function pageLang(setting: string | null, browser: readonly string[]): Lang {
  if (setting === 'en' || setting === 'ru') return setting;
  for (const b of browser) {
    const l = fromTag(b);
    if (l) return l;
  }
  return 'en';
}

/** `{name}` placeholders of the shared tables. */
export function fmt(s: string, params: Record<string, string | number> = {}): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}
