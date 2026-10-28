/**
 * micro (./micro.ts) rules without Phaser (tests/war/microView.test.ts): who gets a health bar and in what tone, and the
 * block a click in its gaps selects.
 */
import type { UnitId } from '../types';
import type { DrawUnit } from './simClient';
import { NEUTRAL_TEAM } from '../sim/economy';

/** World px from the feet to a man's middle (./units.ts BODY: a soldier is two of it tall). */
const BODY = 28;

export const BAR = { w: 16, h: 2, above: BODY * 2 + 6, green: 0x52c447, red: 0xd8402f, yellow: 0xe8c33a, back: 0x120c0a, lost: 0x3b2a22 } as const;
export type BarTone = 'own' | 'foe' | 'ally';

/**
 * Allies' and pact partners' men, by team and squad owner (none offline; online the region's `allies` message sets it,
 * ./micro.ts). An ally wins over one's own team: another player under the same banner is an ally, not oneself.
 */
let allyOf: (team: number, owner?: string) => boolean = () => false;
export const setAllyOf = (f: (team: number, owner?: string) => boolean): void => void (allyOf = f);
/** The live region's test: men of players `ids` (protocol `allies`: his alliance's, and those at peace with it). */
export const alliesBy = (ids: Iterable<number>): ((team: number, owner?: string) => boolean) => {
  const set = new Set([...ids].map((n) => `p:${n}`));
  return (_team, owner) => owner !== undefined && set.has(owner);
};

/** The bar man d gets this frame (null: none): his tone by side, shown while hurt, his squad selected (own) or Alt held. */
export function barOf(d: DrawUnit, mine: number, selected: ReadonlySet<number>, alt: boolean, owner?: string): BarTone | null {
  const u = d.u;
  if (u.state === 'dead' || !(u.maxHp > 0)) return null;
  const tone: BarTone = allyOf(d.team, owner) ? 'ally' : d.team === mine ? 'own' : d.team === NEUTRAL_TEAM ? 'ally' : 'foe';
  return alt || u.hp < u.maxHp - 1e-6 || (tone === 'own' && selected.has(u.squad)) ? tone : null;
}

/** The living men of the block of yours whose gaps tile point t lies in (not on a man), or null. */
export function blockAt(drawn: readonly DrawUnit[], mine: number, t: { x: number; y: number }): UnitId[] | null {
  const by = new Map<number, DrawUnit[]>();
  for (const d of drawn) if (d.team === mine && d.u.state !== 'dead') by.set(d.u.squad, [...(by.get(d.u.squad) ?? []), d]);
  let best: UnitId[] | null = null, bd = Infinity;
  for (const men of by.values()) {
    if (men.length < 2) continue;
    const cx = men.reduce((a, d) => a + d.x, 0) / men.length, cy = men.reduce((a, d) => a + d.y, 0) / men.length;
    const r = Math.max(...men.map((d) => Math.hypot(d.x - cx, d.y - cy))), dc = Math.hypot(t.x - cx, t.y - cy);
    const near = Math.min(...men.map((d) => Math.hypot(d.x - t.x, d.y - t.y)));
    if (dc <= r + 0.3 && near <= 1.5 && dc < bd) (bd = dc), (best = men.map((d) => d.u.id));
  }
  return best;
}
