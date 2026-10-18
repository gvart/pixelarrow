/**
 * The rules behind the sign-in forms (V6-ACCT-05, design/ux/accounts-v6.md §5–§7), with no DOM and no
 * Phaser: client checks that mirror the server's, one submit per form (check the fields, get a
 * human-check token, call the API), the server's codes as field or banner messages, the client's own
 * count of failed log-ins (UXA-09), the resend wait and cap, and the pending sign-up email.
 *
 * Nothing here ever says whether an account exists (N-AF-2): the server answers sign-up, reset and
 * resend with the same 202 and every failed log-in with the same 401, and the messages follow it.
 * Emails, passwords and tokens are never logged.
 */
import type { TKey } from '../../i18n';
import { isApiError, type ApiClient } from '../../platform/api';
import type { KV } from '../../game/save';

/** Mirrors server/src/auth/flows.ts EMAIL_MAX and password.ts PASSWORD_MIN / PASSWORD_MAX. */
export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/** server/src/auth/flows.ts normalizeEmail: one @, a local part, a dotted domain, no spaces. */
export function validEmail(raw: string): boolean {
  const s = raw.trim().normalize('NFKC').toLowerCase();
  if (!s || s.length > EMAIL_MAX || /\s/.test(s)) return false;
  const parts = s.split('@');
  return parts.length === 2 && !!parts[0] && /^[^.]+(\.[^.]+)+$/.test(parts[1]);
}

/** Length in code points, as the server counts it. */
export const passwordLength = (pw: string): number => [...pw].length;

/** What the client can tell about a new password before the server (which also checks the common list). */
export function newPasswordProblem(pw: string, email: string): TKey | null {
  const n = passwordLength(pw);
  if (n < PASSWORD_MIN) return 'auth.err.pwShort';
  if (n > PASSWORD_MAX) return 'auth.err.pwLong';
  if (pw.normalize('NFKC').toLowerCase() === email.trim().normalize('NFKC').toLowerCase()) return 'auth.err.pwEmail';
  return null;
}

/** A message for the form: under a field, or in the banner above Submit (no field). */
export interface FormError {
  field?: 'email' | 'password';
  key: TKey;
  params?: Record<string, number | string>;
  /** Log in: empty the password field and focus it (accounts-v6.md §1.2). */
  clearPassword?: boolean;
  /** Log in: after 5 failures "Forgot password?" becomes a button. */
  offerReset?: boolean;
  /** The server refused the human-check token, or the check failed: reset the widget. */
  resetCheck?: boolean;
  /** The check's script did not load: the banner offers Retry. */
  retryCheck?: boolean;
}

const POLICY: Record<string, TKey> = { too_short: 'auth.err.pwShort', too_long: 'auth.err.pwLong', common: 'auth.err.pwCommon', matches_email: 'auth.err.pwEmail' };

/**
 * The server's code (V6-042, V6-045) or a human-check failure as a form message. Codes the forms
 * can't act on (403 bad_origin, 5xx, the 503s when email or Turnstile is down) read "unavailable".
 */
export function formError(e: unknown): FormError {
  if (!isApiError(e)) {
    const why = e instanceof Error ? e.message : '';
    return why === 'load_failed' ? { key: 'auth.err.turnstileLoad', retryCheck: true } : { key: 'auth.err.turnstile', resetCheck: true };
  }
  if (e.status === 0) return { key: 'auth.err.offline' };
  if (e.status === 401) return { key: 'auth.err.creds' };
  if (e.status === 429) return { key: 'auth.err.rate', params: { min: 1 } }; // the per-IP window is 60 s (ADR-0008 §5.1)
  if (e.status === 403 && e.code === 'banned') return { key: 'auth.banned.body' };
  if (e.status === 400) {
    if (e.code === 'turnstile_failed') return { key: 'auth.err.turnstile', resetCheck: true };
    if (POLICY[e.code]) return { field: 'password', key: POLICY[e.code] };
    if (e.code === 'invalid_email' || e.code === 'bad_request') return { field: 'email', key: 'auth.err.email' };
  }
  return { key: 'auth.err.unavailable' };
}

/**
 * The client's count of failed log-ins in a row (UXA-09). The server locks an address after 5 and
 * still answers `401 invalid_credentials`, so from the 5th failure the form says "too many attempts"
 * without ever claiming the account is locked. A success, or 15 minutes since the last failure, resets it.
 */
export class LoginGuard {
  count = 0;
  private last = 0;
  static readonly LIMIT = 5;
  static readonly FORGET_MS = 15 * 60_000;

  fail(now: number): number {
    if (now - this.last >= LoginGuard.FORGET_MS) this.count = 0;
    this.last = now;
    return ++this.count;
  }

  success(): void {
    this.count = 0;
  }

  tooMany(now: number): boolean {
    return this.count >= LoginGuard.LIMIT && now - this.last < LoginGuard.FORGET_MS;
  }
}

/** What a form submit needs: the API and a token from the form's human check. */
export interface FlowDeps {
  api: Pick<ApiClient, 'signup' | 'login' | 'resetRequest' | 'resendVerify'>;
  /** A human-check token for this form (rejects with the HumanCheckFailure). */
  token: () => Promise<string>;
  now?: () => number;
}

type Outcome = { ok: true; email?: string } | { ok: false; error: FormError };

const fieldErr = (field: 'email' | 'password', key: TKey): Outcome => ({ ok: false, error: { field, key } });

/** Runs one submit after the field checks: token, then the call; any failure becomes a form message. */
async function submit(d: FlowDeps, call: (token: string) => Promise<unknown>): Promise<Outcome> {
  let token: string;
  try {
    token = await d.token();
  } catch (e) {
    return { ok: false, error: formError(e) };
  }
  try {
    await call(token);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: formError(e) };
  }
}

/** AU-02 Log in. The password is sent as typed (never trimmed). */
export async function runLogin(d: FlowDeps, email: string, password: string, guard: LoginGuard): Promise<Outcome> {
  if (!validEmail(email)) return fieldErr('email', 'auth.err.email');
  const r = await submit(d, (tok) => d.api.login(email.trim(), password, tok));
  if (r.ok) {
    guard.success();
    return r;
  }
  if (r.error.key !== 'auth.err.creds') return r;
  const now = d.now?.() ?? Date.now();
  guard.fail(now);
  return guard.tooMany(now) ? { ok: false, error: { key: 'auth.err.tooMany', clearPassword: true, offerReset: true } } : { ok: false, error: { ...r.error, clearPassword: true } };
}

/** AU-03 Create account: `202 check_email` whether or not the address already has an account. */
export async function runSignup(d: FlowDeps, email: string, password: string): Promise<Outcome> {
  if (!validEmail(email)) return fieldErr('email', 'auth.err.email');
  const pw = newPasswordProblem(password, email);
  if (pw) return fieldErr('password', pw);
  const r = await submit(d, (tok) => d.api.signup(email.trim(), password, tok));
  return r.ok ? { ok: true, email: email.trim() } : r;
}

/** AU-05 Forgot password: always the same answer. */
export async function runForgot(d: FlowDeps, email: string): Promise<Outcome> {
  if (!validEmail(email)) return fieldErr('email', 'auth.err.email');
  const r = await submit(d, (tok) => d.api.resetRequest(email.trim(), tok));
  return r.ok ? { ok: true, email: email.trim() } : r;
}

/** AU-04 Resend link (sign-up): always the same answer. */
export async function runResend(d: FlowDeps, email: string): Promise<Outcome> {
  const r = await submit(d, (tok) => d.api.resendVerify(email.trim(), tok));
  return r.ok ? { ok: true, email: email.trim() } : r;
}

/**
 * Resend on the check-your-email card (§5.3): off for 60 s after each email, and off for good once
 * 4 emails (the first one and 3 resends) went out within an hour, matching the server's mail cap
 * (M-AF-5) without claiming the server skipped anything. Kept for this page's life.
 */
export class ResendGate {
  private sends: number[] = [];
  static readonly WAIT_MS = 60_000;
  static readonly HOUR_MS = 3_600_000;
  static readonly CAP = 4;

  sent(now: number): void {
    this.sends.push(now);
  }

  state(now: number): { kind: 'ok' } | { kind: 'wait'; ms: number } | { kind: 'capped' } {
    const recent = this.sends.filter((t) => now - t < ResendGate.HOUR_MS);
    if (recent.length >= ResendGate.CAP) return { kind: 'capped' };
    const last = this.sends[this.sends.length - 1];
    if (last !== undefined && now - last < ResendGate.WAIT_MS) return { kind: 'wait', ms: ResendGate.WAIT_MS - (now - last) };
    return { kind: 'ok' };
  }
}

/** The sign-up waiting for its link on this device (§5.5): a hint for the screens, never asked of the server. */
export interface Pending {
  email: string;
  purpose: 'signup';
  at: number;
}

export const PENDING_KEY = 'account.pending';
const PENDING_MS = 24 * 3_600_000;

export async function rememberPending(kv: KV, email: string, now: number): Promise<void> {
  try {
    await kv.set(PENDING_KEY, JSON.stringify({ email, purpose: 'signup', at: now } satisfies Pending));
  } catch {
    /* a hint only */
  }
}

export async function readPending(kv: KV, now: number): Promise<Pending | null> {
  try {
    const p = JSON.parse((await kv.get(PENDING_KEY)) ?? 'null') as Partial<Pending> | null;
    if (!p || typeof p.email !== 'string' || p.purpose !== 'signup' || typeof p.at !== 'number' || now - p.at >= PENDING_MS) return null;
    return { email: p.email, purpose: 'signup', at: p.at };
  } catch {
    return null;
  }
}

export async function forgetPending(kv: KV): Promise<void> {
  try {
    await kv.remove(PENDING_KEY);
  } catch {
    /* a hint only */
  }
}
