/**
 * The browser adapter (play.pixelarrow.app outside Telegram): no SDK, no
 * sign-in method until ADR-0008 lands, payments "coming soon", saves in
 * localStorage. Safe-area insets come from the CSS env(safe-area-inset-*)
 * that index.html already applies, so the reported insets are zero.
 */
import type { PlatformEnv } from '../core/env';
import type { Platform } from '../core/platform';
import type { Insets } from '../core/safeArea';
import { createWebBack } from './back';
import { webPayments } from './payments';
import { browserInputHints, copyText, localKV, openTab, PLAY_URL, queryLaunchParam } from './dom';

const ZERO: Insets = { top: 0, bottom: 0, left: 0, right: 0 };

export function createWebPlatform(env: PlatformEnv): Platform {
  const input = browserInputHints(env, () => false);
  const kv = localKV(env);
  return {
    id: 'web',
    async init() {
      input.listen();
    },
    auth: { transport: 'cookie', methods: () => [], silentProof: () => null },
    payments: webPayments,
    storage: { save: () => kv, device: () => kv, roams: false },
    haptics: { impact() {}, notify() {}, select() {}, setEnabled() {} },
    back: createWebBack(env),
    share: {
      inviteUrl: (param) => `${PLAY_URL}?startapp=${encodeURIComponent(param)}`,
      async invite(url, text) {
        const share = env.navigator?.share;
        if (share) {
          try {
            await share.call(env.navigator, { url, text });
            return 'shared';
          } catch {
            /* dismissed or refused: copy instead */
          }
        }
        return (await copyText(env, url)) ? 'copied' : 'failed';
      },
      openExternal: (url) => openTab(env, url, 'noopener'),
    },
    safeArea: {
      current: () => ({ device: { ...ZERO }, content: { ...ZERO } }),
      onChange: () => () => {},
    },
    input,
    notifications: { channels: () => [] },
    onActive(cb) {
      const doc = env.document;
      if (!doc) return () => {};
      const vis = (): void => cb(doc.visibilityState !== 'hidden');
      doc.addEventListener('visibilitychange', vis);
      return () => doc.removeEventListener('visibilitychange', vis);
    },
    launchParam: () => queryLaunchParam(env),
    client: () => ({ platform: 'web' }),
  };
}
