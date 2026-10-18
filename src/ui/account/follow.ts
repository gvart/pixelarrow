/**
 * The Mini App follows a link the web confirmed (V6-LINK-07, carried over from LINK-06 / V6-092).
 *
 * After "Link" (or a conflict choice that keeps the web account), this Telegram account's own player is
 * deleted once the web confirms, and its session with it. While the sheet is open, the Mini App asks the
 * server every POLL_MS on the wall clock (paused while the app is in the background): the call that finds
 * the session gone signs in again silently with this launch's initData, which now belongs to the web
 * account. Then the campaign syncs with that account (state.syncAfterSignIn: the more-played copy wins,
 * as Telegram always does), the sheet closes and a toast names the account (`account.link.switched`).
 */
import { t } from '../../i18n';
import { platform } from '../../platform';
import { online } from '../../platform/cloud';
import type { UiScene } from '../mosaic/subShell';
import { toast } from '../widgets';
import { POLL_MS } from './linking';
import type { LinkSheet } from './linkSheet';
import { afterSignIn } from './twoCampaigns';

export interface FollowDeps {
  /** The player this device is signed in as now (after a silent re-sign-in if the session ended), with its display name. */
  whoAmI: () => Promise<{ id: number | null; displayName: string }>;
  /** The first sync with the new account, then `done`. */
  sync: (scene: UiScene, done: () => void) => void;
  onActive: (cb: (on: boolean) => void) => () => void;
}

const live: FollowDeps = {
  whoAmI: async () => {
    const a = await online.api.account();
    return { id: online.playerId, displayName: a.displayName };
  },
  sync: (scene, done) => void afterSignIn(scene, done),
  onActive: (cb) => platform.onActive(cb),
};

/** Starts following; returns the stop function (also called when the sheet goes away). */
export function followLinkedAccount(scene: UiScene, sheet: LinkSheet, deps: FollowDeps = live): () => void {
  const before = online.playerId;
  let active = true;
  let inflight = false;
  let stopped = false;
  const timer = setInterval(() => void check(), POLL_MS);
  const offActive = deps.onActive((on) => {
    active = on;
    if (on) void check();
  });
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    offActive();
  };
  sheet.m.c.once('destroy', stop);
  async function check(): Promise<void> {
    if (stopped || !active || inflight) return;
    inflight = true;
    try {
      const me = await deps.whoAmI();
      if (stopped || me.id === null || me.id === before) return;
      stop();
      sheet.close();
      deps.sync(scene, () => {
        // a campaign taken from the account restarts the menu: say it on the scene that is up then
        setTimeout(() => scene.sys.isActive() && toast(scene, t('account.link.switched', { name: me.displayName }), 'good', 4000), 300);
      });
    } catch {
      /* offline for a moment, or not linked yet: the next tick asks again */
    } finally {
      inflight = false;
    }
  }
  return stop;
}
