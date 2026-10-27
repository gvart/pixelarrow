/**
 * W-63 shared settlements, the client's side of the REST shapes (server/src/war/settlements.ts, routes under
 * /api/war/settlements) and the pure rules the UI checks before it asks: a plot inside the ring, overlapping no other,
 * a level's name and map icon. The region room's own view of a settlement is SettlementNet (./protocol.ts).
 */
import { TOWN_LEVELS } from '../sim/townLevel';

/** Mirrors the server's SETTLE (server/src/war/settlements.ts): offers live 48 h, tribute at most 30 %, 6 men to offer terms. */
export const SETTLE_UI = { offerMs: 48 * 3_600_000, tributeMax: 30, presence: 6, truceMs: 7 * 24 * 3_600_000, bondMax: 5000 } as const;

export type SettleRole = 'lord' | 'citizen' | 'garrison';
export type OfferKind = 'settle' | 'vassal' | 'join' | 'garrison' | 'truce';

/** GET /settlements?region= : a row of the world's (or a region's) settlements. */
export interface WorldSettlement {
  id: number; region: string; x: number; y: number; r: number; name: string; lord_pid: number; lord: string | null;
  level: number; overlord_id: number | null; tribute_pct: number; people: number;
}

/** GET /settlements/:id : one settlement and its members (plots as inclusive tile rects, null: none). */
export interface SettleMember { pid: number; name: string | null; role: SettleRole; x0: number | null; y0: number | null; x1: number | null; y1: number | null; since: number }
export interface SettleDetail {
  id: number; region: string; x: number; y: number; r: number; name: string; lord_pid: number; level: number;
  overlord_id: number | null; tribute_pct: number; members: SettleMember[];
}

/** GET /settlements/inbox : a request, offer or truce. */
export interface OfferRow {
  id: number; kind: OfferKind; from_pid: number; from_name: string | null; from_settlement: number | null; to_settlement: number;
  to_name: string; tribute_pct: number; bond: number; state: string; expires_at: number; ends_at: number | null;
}
export interface Inbox { incoming: OfferRow[]; outgoing: OfferRow[]; truces: OfferRow[] }

export interface Plot { x0: number; y0: number; x1: number; y1: number }
export interface Circle { x: number; y: number; r: number }

const dist = (ax: number, ay: number, b: Circle) => Math.hypot(ax - b.x, ay - b.y);

/** Every corner of the plot inside the circle (the server's plotInside). */
export const plotInside = (c: Circle, p: Plot) => p.x0 <= p.x1 && p.y0 <= p.y1 && [[p.x0, p.y0], [p.x0, p.y1], [p.x1, p.y0], [p.x1, p.y1]].every(([x, y]) => dist(x, y, c) <= c.r);

/** Do two plots share a tile? */
export const overlaps = (a: Plot, b: Plot) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

/** Why a plot may not be given (null: it may), as the server answers; `taken` the other plots with their holders' names. */
export function plotRefusal(c: Circle, p: Plot, taken: readonly (Plot & { name?: string })[]): string | null {
  if (![p.x0, p.y0, p.x1, p.y1].every(Number.isInteger)) return 'A plot is whole tiles';
  if (!plotInside(c, p)) return 'Keep the plot inside the ring';
  const o = taken.find((t) => overlaps(p, t));
  if (o) return `Overlaps ${o.name ? `${o.name}'s` : 'another'} plot`;
  return null;
}

/** The rect two dragged tiles span (inclusive, either order). */
export const spanOf = (a: { x: number; y: number }, b: { x: number; y: number }): Plot => ({
  x0: Math.min(Math.floor(a.x), Math.floor(b.x)), y0: Math.min(Math.floor(a.y), Math.floor(b.y)),
  x1: Math.max(Math.floor(a.x), Math.floor(b.x)), y1: Math.max(Math.floor(a.y), Math.floor(b.y)),
});

/** A settlement's level by name (W-61 town level; below 1 a camp). */
export const levelName = (lv: number) => TOWN_LEVELS[Math.max(1, Math.min(TOWN_LEVELS.length - 1, Math.round(lv)))].name;

/** The map marker's kind by level: camp 1, village 2-3 (hamlet and village), town 4, city 5. */
export type LevelKind = 'camp' | 'village' | 'town' | 'city';
export const levelKind = (lv: number): LevelKind => (lv >= 5 ? 'city' : lv >= 4 ? 'town' : lv >= 2 ? 'village' : 'camp');

/** Time left as "1d 4h", "3h 12m", "8m" or "now". */
export function left(ms: number): string {
  if (ms <= 0) return 'now';
  const m = Math.floor(ms / 60_000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  return d ? `${d}d ${h % 24}h` : h ? `${h}h ${m % 60}m` : `${Math.max(1, m)}m`;
}
