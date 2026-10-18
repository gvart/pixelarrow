/**
 * The rules behind AU-19 Delete account (V6-LINK-07; design/ux/accounts-v6.md §10; ADR-0009 §7, M-DL-1),
 * with no DOM and no Phaser: what step 1 lists, which unlink it offers instead, the typed word, and the
 * server's answers as the step-3 result.
 */
import { t, type TKey } from '../../i18n';
import { isApiError, type AccountSummary } from '../../platform/api';
import type { MethodKind } from './methods';

/**
 * How long purchase records are kept after deletion (ADR-0009 §7: proposed 5 years). The owner confirms
 * it with the privacy notice (docs/v6/OWNER_ACTIONS.md, V6-LINK-07); change it here and in the notice.
 */
export const PURCHASE_RETENTION_YEARS = 5;

/** Step 1's lists (§10.1): every group that goes, and what stays without the name. */
export const GONE: readonly TKey[] = ['delete.gone1', 'delete.gone2', 'delete.gone3', 'delete.gone4', 'delete.gone5', 'delete.gone6', 'delete.gone7'];
export const KEPT: readonly TKey[] = ['delete.kept1', 'delete.kept2'];

/**
 * The method an unlink would remove instead (§10.1 alternative card), only with two sign-in methods:
 * on the web (a cookie session) the email goes and Telegram stays; in Telegram, Telegram goes and the
 * web stays. Null with one method (deleting is the only way).
 */
export function alternativeTo(a: Pick<AccountSummary, 'identities'>, transport: 'bearer' | 'cookie'): MethodKind | null {
  const kinds = new Set(a.identities.map((i) => i.kind));
  if (!kinds.has('telegram') || !kinds.has('password')) return null;
  return transport === 'cookie' ? 'password' : 'telegram';
}

/** The typed confirmation (§10.1 step 2): the word in the game's language, or the English DELETE; any case, spaces around. */
export function deleteWordMatches(typed: string): boolean {
  const fold = (s: string) => s.normalize('NFKC').trim().toLocaleUpperCase();
  const v = fold(typed);
  return v !== '' && (v === fold(t('delete.word')) || v === 'DELETE');
}

/** Step 3 for a failure: busy (nothing changed, Close) or failed (nothing changed, Try again: the server is idempotent). */
export function deleteFail(e: unknown): { key: TKey; retry: boolean } {
  if (isApiError(e) && e.status === 409 && e.code === 'busy_try_later') return { key: 'delete.busy', retry: false };
  if (isApiError(e) && e.status === 403 && e.code === 'banned') return { key: 'auth.banned.body', retry: false };
  return { key: 'delete.failed', retry: true };
}
