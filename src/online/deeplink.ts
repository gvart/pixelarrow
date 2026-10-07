/**
 * Launch deep links: the `startapp` parameter of a bot notification button
 * (`https://pixelarrow.app/?startapp=hex_3_-2`) or of a t.me link
 * (`https://t.me/<bot>/<app>?startapp=duel`). Shared by the Worker (which
 * builds them, server/src/notify) and the client (BootScene routes them).
 *
 * Telegram allows [A-Za-z0-9_-] and at most 64 characters.
 *
 *   clan_<code>   a clan invite (src/online/rules.ts inviteCodeFrom)
 *   hex_<q>_<r>   the war table centred on a hex, the hex selected
 *   boss_<q>_<r>  the same for a world boss site
 *   duel          the war table with the duel lobby open
 *   market        the town marketplace
 *   myclan        your clan
 *   income        the war table (collect the treasury)
 *   season        the war table (season standings)
 *   settings      the menu with the notification settings open
 *   wallet        the shop, Drachmae wallet tab
 */
import { inviteCodeFrom } from './rules';

export type StartRoute =
  | { kind: 'invite'; code: string }
  | { kind: 'hex'; q: number; r: number }
  | { kind: 'boss'; q: number; r: number }
  | { kind: 'duel' }
  | { kind: 'market' }
  | { kind: 'clan' }
  | { kind: 'income' }
  | { kind: 'season' }
  | { kind: 'settings' }
  | { kind: 'wallet' };

const SIMPLE = { duel: 'duel', market: 'market', myclan: 'clan', income: 'income', season: 'season', settings: 'settings', wallet: 'wallet' } as const;
const SIMPLE_PARAM: Record<string, string> = Object.fromEntries(Object.entries(SIMPLE).map(([k, v]) => [v, k]));

const int = (s: string) => (/^-?\d{1,4}$/.test(s) ? Number(s) : null);

/** The startapp parameter for a route (always within Telegram's alphabet and length). */
export function startParamOf(route: StartRoute): string {
  switch (route.kind) {
    case 'invite':
      return `clan_${route.code}`;
    case 'hex':
    case 'boss':
      return `${route.kind}_${route.q | 0}_${route.r | 0}`;
    default:
      return SIMPLE_PARAM[route.kind];
  }
}

/** The route of a startapp parameter, or null for anything unknown or malformed. */
export function parseStartParam(param: string | null | undefined): StartRoute | null {
  if (!param) return null;
  const p = param.trim();
  if (!p || p.length > 64 || !/^[A-Za-z0-9_-]+$/.test(p)) return null;
  const code = inviteCodeFrom(p);
  if (code) return { kind: 'invite', code };
  const m = /^(hex|boss)_(-?\d+)_(-?\d+)$/.exec(p);
  if (m) {
    const q = int(m[2]);
    const r = int(m[3]);
    return q === null || r === null ? null : { kind: m[1] as 'hex' | 'boss', q, r };
  }
  const kind = (SIMPLE as Record<string, StartRoute['kind']>)[p];
  return kind ? ({ kind } as StartRoute) : null;
}

/** The scene a route opens and its data (client side; scene keys of src/scenes). */
export function sceneForRoute(route: StartRoute | null): { scene: string; data: Record<string, unknown> } | null {
  if (!route) return null;
  switch (route.kind) {
    case 'invite':
      return { scene: 'Online', data: {} };
    case 'hex':
    case 'boss':
      return { scene: 'Online', data: { focus: { q: route.q, r: route.r }, select: true } };
    case 'duel':
      return { scene: 'Online', data: { lobby: true } };
    case 'market':
      return { scene: 'Market', data: { back: { scene: 'Menu' } } };
    case 'clan':
      return { scene: 'OnlineClan', data: {} };
    case 'income':
    case 'season':
      return { scene: 'Online', data: {} };
    case 'settings':
      return { scene: 'Menu', data: { settings: 'notify' } };
    case 'wallet':
      return { scene: 'Shop', data: { tab: 'wallet', back: { scene: 'Menu' } } };
  }
}
