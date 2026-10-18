/**
 * The nickname and deletion sheets on stand-in answers (V6-LINK-07), for the layout check, the Kit and
 * screenshots: nothing is sent and nothing on the device changes.
 */
import type { AccountSummary } from '../../platform/api';
import type { UiScene } from '../mosaic/subShell';
import { accountDeps, type AccountDeps } from './deps';
import { openDeleteAccount, openDeleteResult } from './deleteAccount';
import { openModerationNotice, openNameOffer } from './nameSheet';

export const PRIVACY_DEMOS = ['delete', 'delete-paid', 'delete-tg', 'delete-done', 'delete-done-tg', 'name-offer', 'name-mod'] as const;
export type PrivacyDemo = (typeof PRIVACY_DEMOS)[number];

const DAY = 864e5;

function sample(o: Partial<AccountSummary> = {}): AccountSummary {
  return {
    displayName: 'SwiftArcher4821',
    identities: [
      { kind: 'telegram', telegramUsername: 'nikias_k' },
      { kind: 'password', emailMasked: 'j***@g***.com' },
    ],
    publicBoards: true,
    sessions: 2,
    hasPurchases: false,
    name: { freeChange: true, nextChangeAt: null, lockedUntil: null, moderatedAt: null },
    ...o,
  };
}

/** Never settles: the demo stays on the step it shows. */
const forever = <T>() => new Promise<T>(() => undefined);

export function openPrivacyDemo(scene: UiScene, kind: PrivacyDemo): void {
  const now = Date.now();
  const real = accountDeps();
  const d = (transport: 'bearer' | 'cookie'): AccountDeps => ({ ...real, transport: () => transport });
  const stand = { api: { deleteAccount: forever }, forget: async () => undefined, onReload: () => undefined };
  if (kind === 'delete') return openDeleteAccount(scene, d('cookie'), { ...stand, account: sample() });
  if (kind === 'delete-paid') return openDeleteAccount(scene, d('cookie'), { ...stand, account: sample({ hasPurchases: true }) });
  // a Telegram-only account: no unlink alternative
  if (kind === 'delete-tg') return openDeleteAccount(scene, d('bearer'), { ...stand, account: sample({ identities: [{ kind: 'telegram', telegramUsername: 'nikias_k' }] }) });
  if (kind === 'delete-done') return openDeleteResult(scene, { hadEmail: true, telegram: false, onDone: () => undefined });
  if (kind === 'delete-done-tg') return openDeleteResult(scene, { hadEmail: false, telegram: true, onDone: () => undefined });
  if (kind === 'name-offer') return openNameOffer(scene, sample(), { api: { rename: forever } });
  openModerationNotice(scene, sample({ displayName: 'BraveSlinger0417', name: { freeChange: false, nextChangeAt: null, lockedUntil: now + 7 * DAY, moderatedAt: now - 3_600_000 } }));
}
