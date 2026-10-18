/**
 * The rules behind the linking sheets (V6-LINK-06; design/ux/accounts-v6.md §8.5–§8.7, V6-053/054),
 * with no DOM and no Phaser: the web's link status as a step, the server's codes as a message and the
 * way on, and the conflict cards (facts, the forced survivor, the typed name, waiting for the other side).
 *
 * Both sides of a conflict choose (V6-053): the web posts its choice (re-authed, the loser's name typed)
 * and waits; the Telegram owner chooses in the Mini App from a newer launch; only the same choice on both
 * sides changes anything.
 */
import { lang, t, type TKey } from '../../i18n';
import { isApiError, type ConflictSide, type LinkStatus } from '../../platform/api';

/** The web polls the link status this often while the sheet is open and the tab visible (§8.5). */
export const POLL_MS = 3000;

export type WebView =
  | { step: 'waiting'; expiresAt: number }
  | { step: 'ask'; expiresAt: number; tg: string }
  | { step: 'conflict'; id: string }
  | { step: 'linked' | 'expired' | 'cancelled' };

/** The Telegram account that asked, as the web owner sees it: @username, else the first name. */
export function telegramLabel(tg: { username: string | null; firstName: string | null }): string {
  return tg.username ? `@${tg.username}` : tg.firstName || t('link.someone');
}

/** AU-13's step for a status reply. A code that is gone without a trace reads as expired. */
export function webView(s: LinkStatus): WebView {
  switch (s.status) {
    case 'pending':
      return { step: 'waiting', expiresAt: s.expiresAt };
    case 'awaiting_web':
      return { step: 'ask', expiresAt: s.expiresAt, tg: telegramLabel(s.telegram) };
    case 'conflict':
      return { step: 'conflict', id: s.conflict };
    case 'linked':
      return { step: 'linked' };
    case 'cancelled':
      return { step: 'cancelled' };
    default:
      return { step: 'expired' };
  }
}

/**
 * A failure: the message, and the way on. newCode: offer a new code · close: the sheet ends with the
 * message · retry: the same action can be tried again · reopen: the Mini App must relaunch for fresh
 * initData · support: Contact support · field: under the typed name.
 */
export interface LinkFail {
  key: TKey;
  next: 'newCode' | 'close' | 'retry' | 'reopen' | 'support' | 'field';
}

/** `ctx`: the web sheets, the Mini App's link request (tg), or the Mini App's choice in a conflict (choose). */
export function linkFail(e: unknown, ctx: 'web' | 'tg' | 'choose'): LinkFail {
  const un: LinkFail = { key: 'auth.err.unavailable', next: 'retry' };
  if (!isApiError(e)) return un;
  const tg = ctx !== 'web';
  switch (e.code) {
    case 'link_expired':
    case 'bad_start_param':
      return tg ? { key: 'link.tg.expired', next: 'close' } : { key: 'link.expired', next: 'newCode' };
    case 'already_linked':
      return { key: 'link.already', next: 'close' };
    case 'init_data_expired':
      return ctx === 'choose' ? { key: 'conflict.tg.reopen', next: 'reopen' } : { key: 'link.tg.stale', next: 'close' };
    case 'init_data_reused':
      return { key: 'conflict.tg.reopen', next: 'reopen' };
    case 'invalid_init_data':
      return { key: 'reauth.err.telegram', next: 'close' };
    case 'wrong_account':
      return { key: 'reauth.err.wrongAccount', next: 'close' };
    case 'banned':
      return { key: 'auth.banned.body', next: 'close' };
    case 'link_cancelled':
      return { key: 'conflict.cancelled', next: 'close' };
    case 'conflict_expired':
    case 'not_found':
      return { key: 'conflict.expired', next: 'close' };
    case 'choices_differ':
      return { key: 'conflict.differ', next: 'close' };
    case 'already_chosen':
      return { key: 'conflict.chosen', next: 'close' };
    case 'forced_survivor':
      return { key: 'conflict.forcedOff', next: 'close' };
    case 'busy_try_later':
      return { key: 'conflict.busy', next: 'close' };
    case 'contact_support':
      return { key: 'conflict.support', next: 'support' };
    case 'confirm_mismatch':
      return { key: 'conflict.typeMismatch', next: 'field' };
    case 'retry':
      return { key: 'link.err.retry', next: 'retry' };
    case 'rate_limited':
      return tg ? { key: 'reauth.err.rate', next: 'retry' } : { key: 'link.err.rate', next: 'close' };
  }
  if (e.status === 0) return { key: 'auth.err.offline', next: 'retry' };
  return un;
}

// ------------------------------------------------------------------ AU-16 cards

export type Side = 'this' | 'other';

export interface Fact {
  key: TKey;
  params?: Record<string, string | number>;
}

/** One card's facts in words (§8.7): sign-in, campaign, heroes, duels, war, purchases, created. */
export function factLines(s: ConflictSide): Fact[] {
  const both = s.signIn.includes('password') && s.signIn.includes('telegram');
  const via: TKey = both ? 'conflict.via.both' : s.signIn.includes('password') ? 'conflict.via.password' : 'conflict.via.telegram';
  let date: string;
  try {
    date = new Intl.DateTimeFormat(lang(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(s.createdAt));
  } catch {
    date = new Date(s.createdAt).toISOString().slice(0, 10);
  }
  return [
    { key: via },
    s.campaignDay === null ? { key: 'conflict.noCampaign' } : { key: 'conflict.stage', params: { n: s.campaignDay } },
    { key: 'conflict.heroes', params: { n: s.heroes } },
    s.duelRating === null ? { key: 'conflict.noDuels' } : { key: 'conflict.rating', params: { n: s.duelRating } },
    s.war === null ? { key: 'conflict.noWar' } : { key: 'conflict.war', params: { n: s.war.regions } },
    { key: s.purchases ? 'conflict.paid' : 'conflict.unpaid' },
    { key: 'conflict.since', params: { date } },
  ];
}

/** What starts picked: the forced survivor (purchases), else nothing (the danger button waits for a pick). */
export function conflictCards<S extends string>(forced: S | undefined): { picked: S | null } {
  return { picked: forced ?? null };
}

export type CardState = 'unpicked' | 'picked' | 'forcedKept' | 'forcedOff';

export function cardState<S extends string>(side: S, picked: S | null, forced: S | undefined): CardState {
  if (forced) return side === forced ? 'forcedKept' : 'forcedOff';
  return side === picked ? 'picked' : 'unpicked';
}

/** Typed confirmations accept any case and surrounding spaces (§13.5; the server folds the same way). */
export function typedMatches(typed: string, name: string): boolean {
  const fold = (s: string) => s.normalize('NFKC').trim().toLocaleLowerCase();
  return fold(typed) !== '' && fold(typed) === fold(name);
}

/** The web chose `mine` and waits: the Mini App's choice is still open, the same (resolve now), or different. */
export function waitingStep(v: { choices: { telegram: Side | null } }, mine: Side): 'wait' | 'resolve' | 'differ' {
  const tg = v.choices.telegram;
  return tg === null ? 'wait' : tg === mine ? 'resolve' : 'differ';
}
