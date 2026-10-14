/**
 * The rules behind the sign-in method actions (V6-LINK-05, design/ux/accounts-v6.md §1.4, §8.2–§8.4,
 * §8.8), with no DOM and no Phaser:
 *
 * - the Sign-in methods rows of AU-09, from GET /api/account and this device's add-email hint;
 * - re-auth (M-LK-1): the client never asks up front. It calls the action and, on `401 reauth_required`,
 *   proves it is the player (Telegram's initData silently, else AU-10 Confirm it's you), then retries once;
 * - the server's codes (V6-049) as a field or banner message that says what to do next;
 * - the add-email link waiting on this device: a hint for the row, kept masked.
 *
 * Passwords and initData are only ever passed to the API; nothing here logs or stores them.
 */
import type { TKey } from '../../i18n';
import { isApiError, type AccountSummary, type ApiClient } from '../../platform/api';
import type { KV } from '../../game/save';
import type { LoginGuard } from './flows';

export type MethodKind = 'telegram' | 'password';

/** One row of Sign-in methods (§8.2 "Sign-in method rows, by state"). */
export interface MethodRow {
  kind: MethodKind;
  state: 'linked' | 'notLinked' | 'pending';
  /** The quieter line: the player's own handle or masked address, or a status. */
  sub: { text: string } | { key: TKey; params?: Record<string, string> };
  /** remove: AU-15 · menu: Change email, Change password, Remove · add: AU-11 · link: AU-13 (LINK-06) · pendingMenu: Resend, Cancel. */
  action: 'remove' | 'menu' | 'add' | 'link' | 'pendingMenu';
  /** The only sign-in method: Remove is off with `account.remove.last` (N-LK-2). */
  last: boolean;
}

/** The two rows, Telegram then email; `pending` is the masked address of an add-email link sent from this device. */
export function methodRows(a: Pick<AccountSummary, 'identities'>, pending: string | null): MethodRow[] {
  let tg: string | null | undefined;
  let email: string | undefined;
  for (const i of a.identities) {
    if (i.kind === 'telegram') tg = i.telegramUsername;
    else email = i.emailMasked;
  }
  const last = a.identities.length < 2;
  const telegram: MethodRow =
    tg === undefined
      ? { kind: 'telegram', state: 'notLinked', sub: { key: 'account.notLinked' }, action: 'link', last: false }
      : { kind: 'telegram', state: 'linked', sub: tg ? { text: `@${tg}` } : { key: 'account.linked' }, action: 'remove', last };
  const mail: MethodRow =
    email !== undefined
      ? { kind: 'password', state: 'linked', sub: { text: email }, action: 'menu', last }
      : pending
        ? { kind: 'password', state: 'pending', sub: { key: 'account.emailPending', params: { email: pending } }, action: 'pendingMenu', last: false }
        : { kind: 'password', state: 'notLinked', sub: { key: 'account.emailNone' }, action: 'add', last: false };
  return [telegram, mail];
}

// ------------------------------------------------------------------ re-auth (§1.4)

/** The player closed Confirm it's you: the action stops, with no message. */
export class ReauthCancelled extends Error {
  constructor() {
    super('reauth_cancelled');
  }
}

export const needsReauth = (e: unknown): boolean => isApiError(e) && e.status === 401 && e.code === 'reauth_required';

/**
 * Runs `call`; on `401 reauth_required` asks `confirm` (true once proved) and retries once. A second
 * reauth_required reaches the caller (never a loop); a cancelled confirm throws ReauthCancelled.
 */
export async function withReauth<T>(call: () => Promise<T>, confirm: () => Promise<boolean>): Promise<T> {
  try {
    return await call();
  } catch (e) {
    if (!needsReauth(e)) throw e;
  }
  if (!(await confirm())) throw new ReauthCancelled();
  return call();
}

export type SilentProof = { ok: true } | { ok: false; why: 'none' | 'expired' | 'error'; error?: unknown };

/** Re-sends Telegram's initData (no screen). `none` where the platform has no signed proof (the web). */
export async function proveSilently(api: Pick<ApiClient, 'reauthWith'>, initData: string | null): Promise<SilentProof> {
  if (!initData) return { ok: false, why: 'none' };
  try {
    await api.reauthWith({ initData });
    return { ok: true };
  } catch (e) {
    return { ok: false, why: isApiError(e) && e.code === 'init_data_expired' ? 'expired' : 'error', error: e };
  }
}

/**
 * What AU-10 shows after the silent try: nothing (`done`), the password, the password with the Reopen
 * line (Telegram's initData is too old, §8.6), Reopen alone (no password on the account), or the error.
 */
export function reauthStep(r: SilentProof, o: { hasPassword: boolean; canReopen: boolean }): 'done' | 'password' | 'passwordReopen' | 'reopen' | 'error' {
  if (r.ok) return 'done';
  const reopen = r.why === 'expired' && o.canReopen;
  if (o.hasPassword) return reopen ? 'passwordReopen' : 'password';
  return reopen ? 'reopen' : 'error';
}

// ------------------------------------------------------------------ messages

export type ManageOp = 'reauth' | 'addEmail' | 'changeEmail' | 'changePassword' | 'remove';

/** A message for the form (under `field`, else the banner) or the page (a toast). */
export interface ManageError {
  field?: 'email' | 'password' | 'current' | 'next';
  key: TKey;
  params?: Record<string, number | string>;
  /** Empty the password field and focus it. */
  clear?: true;
  /** The page is out of date (or the session ended): close the form and reload the page. */
  reload?: true;
}

const POLICY: Record<string, TKey> = { too_short: 'auth.err.pwShort', too_long: 'auth.err.pwLong', common: 'auth.err.pwCommon', matches_email: 'auth.err.pwEmail' };

/** The server's code for `op` (V6-049) as a message. Unknown codes and 5xx read "unavailable". */
export function manageError(e: unknown, op: ManageOp): ManageError {
  const un: ManageError = { key: 'auth.err.unavailable' };
  if (!isApiError(e)) return un;
  const { status, code } = e;
  if (status === 0) return { key: 'auth.err.offline' };
  if (status === 401) {
    if (code === 'reauth_required') return { key: 'reauth.err.again' };
    if (code === 'invalid_credentials') return op === 'changePassword' ? { field: 'current', key: 'account.err.current', clear: true } : { field: 'password', key: 'reauth.err.password', clear: true };
    if (code === 'init_data_expired') return { key: 'reauth.reopen' };
    if (code === 'invalid_init_data') return { key: 'reauth.err.telegram' };
    return { key: 'auth.expired', reload: true };
  }
  if (status === 403) {
    if (code === 'wrong_account') return { key: 'reauth.err.wrongAccount' };
    if (code === 'banned') return { key: 'auth.banned.body', reload: true };
    return un;
  }
  if (status === 429) return op === 'addEmail' || op === 'changeEmail' ? { key: 'account.err.addLimit' } : { key: 'reauth.err.rate' };
  if (status === 400) {
    if (code === 'no_password') return { key: 'account.err.noPassword', reload: true };
    if (code === 'same_email') return { field: 'email', key: 'account.err.sameEmail' };
    if (code === 'invalid_email' || code === 'bad_request') return op === 'addEmail' || op === 'changeEmail' ? { field: 'email', key: 'auth.err.email' } : un;
    if (POLICY[code]) return { field: op === 'changePassword' ? 'next' : 'password', key: POLICY[code] };
    return un;
  }
  if (status === 409) {
    if (code === 'already_has_email') return { key: 'account.err.hasEmail', reload: true };
    if (code === 'email_taken') return { field: 'email', key: 'account.err.emailTaken' };
    if (code === 'last_login_method') return { key: 'account.remove.last', reload: true };
    return un;
  }
  // already gone (another device removed it): the page catches up
  if (status === 404 && op === 'remove') return { key: 'account.removed', reload: true };
  return un;
}

/**
 * A wrong password counts toward the address's lockout, which still answers 401 (UXA-09): from the 5th
 * failure in a row the form says "too many attempts" and never claims the account is locked.
 */
export function passwordFailed(m: ManageError, guard: LoginGuard, now: number): ManageError {
  if (!m.clear) return m;
  guard.fail(now);
  return guard.tooMany(now) ? { ...m, key: 'auth.err.tooMany' } : m;
}

// ------------------------------------------------------------------ the add-email link waiting on this device

/** As server/src/account/summary.ts maskEmail: `j***@g***.com`. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${local.slice(0, 1)}***@${domain.slice(0, 1)}***${tld}`;
}

export const ADD_PENDING_KEY = 'account.addPending';
const ADD_PENDING_MS = 24 * 3_600_000; // the link's life (SIGNUP_TOKEN_TTL_MS)

/** Remembers that an add-email link went out from here: the masked address only (another person may see the row). */
export async function rememberAddPending(kv: KV, email: string, now: number): Promise<void> {
  try {
    await kv.set(ADD_PENDING_KEY, JSON.stringify({ masked: maskEmail(email.trim()), at: now }));
  } catch {
    /* a hint only */
  }
}

export async function readAddPending(kv: KV, now: number): Promise<string | null> {
  try {
    const p = JSON.parse((await kv.get(ADD_PENDING_KEY)) ?? 'null') as { masked?: unknown; at?: unknown } | null;
    if (!p || typeof p.masked !== 'string' || typeof p.at !== 'number' || now - p.at >= ADD_PENDING_MS) return null;
    return p.masked;
  } catch {
    return null;
  }
}

export async function forgetAddPending(kv: KV): Promise<void> {
  try {
    await kv.remove(ADD_PENDING_KEY);
  } catch {
    /* a hint only */
  }
}
