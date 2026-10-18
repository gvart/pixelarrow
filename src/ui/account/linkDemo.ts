/**
 * The linking sheets on stand-in answers (V6-LINK-06), for the layout check and screenshots: nothing is
 * sent, and the sample code and link are made up.
 */
import type { ConflictSide, ConflictView, LinkStatus, TelegramConflict } from '../../platform/api';
import type { UiScene } from '../mosaic/subShell';
import { openLinkTelegram } from './linkTelegram';
import { openLinkRequest } from './linkRequest';
import { openTelegramConflict, openWebConflict } from './conflict';

export const LINK_DEMOS = ['web-qr', 'web-touch', 'web-nobot', 'web-ask', 'web-conflict', 'web-forced', 'tg-request', 'tg-progress', 'tg-conflict'] as const;
export type LinkDemo = (typeof LINK_DEMOS)[number];

const CODE = 'q3Xh9ZkT2bLmN0pR4sVwAA';
const day = 864e5;
const side = (o: Partial<ConflictSide>): ConflictSide => ({ displayName: 'SwiftArcher4821', signIn: ['password'], campaignDay: 31, heroes: 14, duelRating: 1480, war: { regions: 12 }, purchases: false, createdAt: Date.now() - 220 * day, ...o });
const DOROS = side({ displayName: 'Doros', signIn: ['telegram'], campaignDay: 4, heroes: 3, duelRating: null, war: null, createdAt: Date.now() - 9 * day });

/** Never settles: the demo stays on the step it shows. */
const forever = <T>() => new Promise<T>(() => undefined);

export function openLinkingDemo(scene: UiScene, kind: LinkDemo): void {
  const now = Date.now();
  if (kind.startsWith('web-') && kind !== 'web-conflict' && kind !== 'web-forced') {
    const status: LinkStatus = kind === 'web-ask' ? { status: 'awaiting_web', expiresAt: now + 512_000, telegram: { username: 'nikias_k', firstName: 'Nikias' } } : { status: 'pending', expiresAt: now + 581_000 };
    openLinkTelegram(scene, {
      displayName: 'SwiftArcher4821',
      hasPassword: true,
      onDone: () => undefined,
      showQr: kind !== 'web-touch',
      api: {
        linkStart: async () => ({ code: CODE, expiresAt: now + 581_000, deepLink: kind === 'web-nobot' ? null : `https://t.me/pixelarrow_bot/play?startapp=link_${CODE}` }),
        linkAbandon: async () => ({ ok: true }),
        linkStatus: async () => status,
        linkConfirm: forever,
        conflict: forever,
        resolveConflict: forever,
      },
    });
    return;
  }
  if (kind === 'web-conflict' || kind === 'web-forced') {
    const demo: ConflictView = {
      kind: 'telegram',
      this: side(kind === 'web-forced' ? { purchases: true } : {}),
      other: DOROS,
      ...(kind === 'web-forced' ? { forced: 'this' as const, reason: 'purchases' as const } : {}),
      choices: { web: null, telegram: null },
      expiresAt: now + 14 * 60_000,
    };
    openWebConflict(scene, CODE, { hasPassword: true, onDone: () => undefined, demo, api: { conflict: async () => demo, resolveConflict: forever } });
    return;
  }
  if (kind === 'tg-conflict') {
    const c: TelegramConflict = {
      id: CODE,
      kind: 'telegram',
      telegram: DOROS,
      web: { ...side({}), emailMasked: 'j***@g***.com' },
      choices: { telegram: null, web: 'web' },
      expiresAt: now + 14 * 60_000,
    };
    openTelegramConflict(scene, c, { api: { telegramConflicts: forever, chooseFromTelegram: forever, linkNotMe: forever } });
    return;
  }
  openLinkRequest(scene, CODE, {
    api: { linkPeek: async () => ({ displayName: 'SwiftArcher4821', emailMasked: 'j***@g***.com', conflict: kind === 'tg-progress' }), linkComplete: forever, linkNotMe: forever },
  });
}
