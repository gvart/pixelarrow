/**
 * AU-18 Your name (design/ux/accounts-v6.md §9.3) and the moderation notice (§9.5), V6-LINK-07.
 *
 * - The first visit to Duels or War while signed in shows the generated name once: Keep this name, or
 *   Change (the rename form). The seen flag is `settings.seenHints` 'nameOffer', set when it shows.
 * - After a moderator reset the name, the next of those visits (or the Account page) says so once:
 *   the reset's time is kept on this device (`account.modSeen`).
 *
 * Staged runs (seenHints '*', window.__noFirstRun) never see either. The hub that was opening stays
 * under the sheet, so either answer lands the player where they were going.
 */
import { lang, t } from '../../i18n';
import type { AccountSummary, ApiClient } from '../../platform/api';
import { platform } from '../../platform';
import { online } from '../../platform/cloud';
import { deviceKV } from '../../platform/storage';
import type { KV } from '../../game/save';
import { legalUrl } from '../legal';
import type { UiScene } from '../mosaic/subShell';
import { hintStore } from '../widgets';
import { openLinkSheet } from './linkSheet';
import { moderationUnseen, nameDate } from './nameRules';
import { openRename } from './rename';

export const NAME_OFFER_HINT = 'nameOffer';
export const MOD_SEEN_KEY = 'account.modSeen';

const staged = (): boolean => hintStore.seen().includes('*') || !!(window as { __noFirstRun?: boolean }).__noFirstRun;

/** AU-18 first time: the name others see, Keep or Change. */
export function openNameOffer(scene: UiScene, a: Pick<AccountSummary, 'displayName' | 'name'>, o: { api?: Pick<ApiClient, 'rename'> } = {}): void {
  const sheet = openLinkSheet(scene, { title: t('name.title'), id: 'name.offer', h: 170 });
  sheet.show((b) => {
    b.text(t('name.firstBody', { name: a.displayName }));
    b.gap(4);
    b.pair(
      { label: t('name.change'), id: 'name.change', variant: 'secondary', onClick: () => (sheet.close(), openRename(scene, { current: a.displayName, status: a.name, api: o.api })) },
      { label: t('name.keep'), id: 'name.keep', variant: 'primary', onClick: () => sheet.close() },
    );
  });
}

/** AU-18 moderation notice: the name was reset, and when a new one can be picked. */
export function openModerationNotice(scene: UiScene, a: Pick<AccountSummary, 'displayName' | 'name'>): void {
  // the sheet's title stays short (a long one shrinks below the text floor on a 320 phone); the notice leads the body
  const sheet = openLinkSheet(scene, { title: t('name.title'), id: 'name.mod', h: 190 });
  const until = a.name.lockedUntil ?? a.name.nextChangeAt ?? Date.now();
  sheet.show((b) => {
    b.text(t('name.mod.title'), 'pBad', 8);
    b.text(t('name.mod.body', { name: a.displayName, date: nameDate(until) }));
    b.gap(4);
    b.button({ label: t('common.ok'), id: 'name.mod.ok', variant: 'primary', onClick: () => sheet.close() });
    b.button({ label: t('name.mod.rules'), id: 'name.mod.rules', variant: 'neutral', onClick: () => platform.share.openExternal(`${legalUrl('privacy', lang())}#public`) });
  });
}

/** The time of the last moderation notice shown on this device. */
async function modSeen(kv: KV): Promise<number | null> {
  try {
    const v = Number(await kv.get(MOD_SEEN_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** On the Account page, with the summary it already has: the moderation notice, once. True when it showed. */
export async function noticeModeration(scene: UiScene, a: AccountSummary, kv: KV = deviceKV): Promise<boolean> {
  if (staged() || !moderationUnseen(a.name, await modSeen(kv))) return false;
  await kv.set(MOD_SEEN_KEY, String(a.name.moderatedAt)).catch(() => undefined);
  if (!scene.sys.isActive()) return false;
  openModerationNotice(scene, a);
  return true;
}

let modCheckedThisLaunch = false;

/**
 * A Duels or War hub opened (hook lines in DuelScene and OnlineScene): signed in, the moderation notice
 * when one is unseen, else the first-time name sheet once. Never blocks the hub; a failure shows nothing.
 */
export async function offerNameOnHub(scene: UiScene, o: { kv?: KV; api?: Pick<ApiClient, 'account' | 'rename'> } = {}): Promise<void> {
  if (staged() || !online.signedIn) return;
  const kv = o.kv ?? deviceKV;
  const offered = hintStore.seen().includes(NAME_OFFER_HINT);
  // once the offer was seen, only the moderation check is left: once per launch (§9.5 "on the next launch")
  if (offered && modCheckedThisLaunch) return;
  modCheckedThisLaunch = true;
  let a: AccountSummary;
  try {
    a = await (o.api ?? online.api).account();
  } catch {
    return;
  }
  if (!scene.sys.isActive()) return;
  if (await noticeModeration(scene, a, kv)) return;
  if (offered) return;
  hintStore.mark(NAME_OFFER_HINT);
  openNameOffer(scene, a, { api: o.api });
}
