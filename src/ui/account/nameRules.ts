/**
 * The rules behind the nickname screens (V6-LINK-07; design/ux/accounts-v6.md §9; ADR-0009 §6, M-DN-3/4),
 * with no DOM and no Phaser: the shared validator's reasons and the server's codes as messages, the
 * cooldown line, and whether Rename is off on the Account page (and why).
 *
 * The client checks with the server's own validator (server/src/names/validate.ts) for instant feedback;
 * the server decides. One message covers reserved and blocked names, so the blocklist is never revealed.
 */
import { lang, type TKey } from '../../i18n';
import { isApiError, type NameStatus } from '../../platform/api';
import { validateDisplayName, type NameReason } from '../../../server/src/names/validate';

/** The longest name (M-DN-3), the field's maxlength and the counter's total. */
export const NAME_MAX = 16;

export interface NameMessage {
  key: TKey;
  params?: Record<string, string | number>;
  /** Under the field (else the form's banner). */
  field?: true;
}

const REASON: Record<NameReason, TKey> = {
  length: 'name.err.length',
  chars: 'name.err.chars',
  mixed_script: 'name.err.mixed',
  reserved: 'name.err.notAllowed',
  blocked: 'name.err.notAllowed',
};

/** A date the player reads (the cooldown's end): "12 Nov 2026" in the game's language. */
export function nameDate(ms: number): string {
  try {
    return new Intl.DateTimeFormat(lang(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/** The typed name checked here (blur and submit): null when the validator allows it. */
export function localNameError(raw: string): NameMessage | null {
  const v = validateDisplayName(raw);
  return v.ok ? null : { key: REASON[v.reason], field: true };
}

/** The typed name, as the server will store it (NFKC, trimmed, single spaces), or null when it isn't allowed. */
export function cleanName(raw: string): string | null {
  const v = validateDisplayName(raw);
  return v.ok ? v.name : null;
}

/** Nothing to send: the typed name is the current one (the button stays off, §9.4). */
export const sameName = (raw: string, current: string): boolean => cleanName(raw) === current;

/** The server's answer to PUT /api/account/name as a message (§9.4 table). Unknown codes and 5xx read "unavailable". */
export function renameError(e: unknown): NameMessage {
  if (!isApiError(e)) return { key: 'auth.err.unavailable' };
  const at = (k: string) => (typeof e.extra[k] === 'number' ? nameDate(e.extra[k] as number) : '');
  if (e.status === 0) return { key: 'auth.err.offline' };
  if (e.status === 400 && e.code === 'invalid_name') return { key: REASON[e.extra.reason as NameReason] ?? 'name.err.notAllowed', field: true };
  if (e.status === 409 && e.code === 'taken') return { key: 'name.err.taken', field: true };
  if (e.status === 429 && e.code === 'cooldown') return { key: 'name.err.cooldown', params: { date: at('nextChangeAt') } };
  if (e.status === 429) return { key: 'reauth.err.rate' };
  if (e.status === 423) return { key: 'name.err.locked', params: { date: at('lockedUntil') } };
  return { key: 'auth.err.unavailable' };
}

/** Rename on AU-09: off during a moderator's lock or the 30-day cooldown, with the reason a tap shows. */
export function renameOff(s: NameStatus, now: number): NameMessage | null {
  if (s.lockedUntil !== null && s.lockedUntil > now) return { key: 'name.err.locked', params: { date: nameDate(s.lockedUntil) } };
  if (s.nextChangeAt !== null && s.nextChangeAt > now) return { key: 'name.err.cooldown', params: { date: nameDate(s.nextChangeAt) } };
  return null;
}

/** The cooldown line above Save (§9.4): what this change costs, before pressing. */
export function costLine(s: NameStatus, now: number): NameMessage {
  if (s.freeChange) return { key: 'name.freeFirst' };
  return { key: 'name.nextOn', params: { date: nameDate(now + RENAME_COOLDOWN_MS) } };
}

/** As server/src/players.ts RENAME_COOLDOWN_MS: one change every 30 days after the free one. */
export const RENAME_COOLDOWN_MS = 30 * 86_400_000;

/** A moderator's reset the player hasn't been told about yet (§9.5): `seen` is the last one shown here. */
export const moderationUnseen = (s: NameStatus, seen: number | null): boolean => s.moderatedAt !== null && (seen === null || s.moderatedAt > seen);
