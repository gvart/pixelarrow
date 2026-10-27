/**
 * W-63 shared settlements, the region room's side (docs/impl/global-war-rebuild.md W-63). D1 holds the settlements
 * (./settlements.ts); the DO loads the region's (loadRegionSettlements) and hands them to its WarRoom, which reads them
 * on the field with these rules:
 *
 *  - Banner by ground: a player who is the lord, a citizen or the garrison of a settlement in this region fights here
 *    under its banner (its lord's alliance); elsewhere under his own (bannerOf).
 *  - Building inside a settlement's ground: its lord anywhere but on another's plot, a citizen only on his own plot,
 *    anyone else not at all (buildRefusal).
 *  - Founding: a finished camp or fort outside every settlement is reported to found(); the spot must clear the claim
 *    points, landmarks and pre-built towns by the settlement radius, and never in a home (foundRefusal).
 *  - What persists of a settlement (season end, an emptied region): its plain pieces (no walls, bridges, stairs,
 *    braziers or chests) with their hp share and their store goods (piecesOf), laid down again on a fresh field.
 */
import { BUILDINGS } from '../../../src/war/sim/economy';
import type { BuildingSnap, BuildingType, Snapshot } from '../../../src/war/types';
import type { SettlementNet } from '../../../src/war/net/protocol';
import { allianceOf } from './world/members';
import { type Plot, type Role, SETTLE } from './settlements';

export interface TieMember { pid: number; role: Role; plot: Plot | null }

/** A settlement as the room knows it (the DO reloads it from D1 every few seconds). */
export interface RoomSettlement {
  id: number; centre: number; x: number; y: number; r: number; name: string;
  lord: number; lordName: string;
  /** Its banner: the lord's alliance (null: he serves none this season). */
  team: number | null;
  level: number; overlord: number | null; tribute: number; leviedAt: number;
  /** Lords of its overlords, nearest first (an attack on it is one on them; their men may come in). */
  overlordLords: number[];
  members: TieMember[];
}

/** One persisted piece: its type, centre and rotation, hp share left and its store goods. */
export interface Piece { type: BuildingType; x: number; y: number; rot: 0 | 1; hp: number; goods?: Record<string, number> }
export interface Persist { pieces?: Piece[] }

const ROLE_RANK: Record<Role, number> = { lord: 0, citizen: 1, garrison: 2 };

/** The settlement whose banner the player's men fly here (null: none, his own alliance). */
export function bannerOf(list: readonly RoomSettlement[], pid: number): RoomSettlement | null {
  let best: RoomSettlement | null = null, rank = 9;
  for (const s of list) {
    const m = s.members.find((x) => x.pid === pid);
    if (m && s.team !== null && ROLE_RANK[m.role] < rank) (best = s), (rank = ROLE_RANK[m.role]);
  }
  return best;
}

/** Is the player tied to a settlement here (a member, or the lord of an overlord of one)? */
export const tiedTo = (list: readonly RoomSettlement[], pid: number): boolean =>
  list.some((s) => s.members.some((m) => m.pid === pid) || s.overlordLords.includes(pid));

const inCircle = (s: { x: number; y: number; r: number }, x: number, y: number) => (x - s.x) ** 2 + (y - s.y) ** 2 <= s.r * s.r;
const inPlot = (p: Plot, x: number, y: number) => x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1;

/**
 * Why the player may not build on these tiles (flat x,y; null: he may). Only tiles on a settlement's ground count:
 * its lord builds anywhere off another's plot, a citizen only on his own plot, anyone else nowhere on it.
 */
export function buildRefusal(list: readonly RoomSettlement[], pid: number, tiles: readonly number[]): string | null {
  for (let i = 0; i + 1 < tiles.length; i += 2) {
    const x = tiles[i], y = tiles[i + 1];
    for (const s of list) {
      if (!inCircle(s, x + 0.5, y + 0.5)) continue;
      const me = s.members.find((m) => m.pid === pid && m.role !== 'garrison');
      const other = s.members.find((m) => m.pid !== pid && m.plot && inPlot(m.plot, x, y));
      if (me?.role === 'lord') {
        if (other) return `That is a citizen's plot in ${s.name}`;
        continue;
      }
      if (me?.plot && inPlot(me.plot, x, y)) continue;
      return me ? `Build on your own plot in ${s.name}` : `${s.name} is ${s.lordName}'s ground: ask its lord for a plot`;
    }
  }
  return null;
}

/** Why a settlement may not be founded round (x,y) here (null: it may): homes, claim points, landmarks, towns. */
export function foundRefusal(snap: Snapshot, home: boolean, c: { x: number; y: number; r: number }): string | null {
  if (home) return 'Not in a home region';
  if ((snap.claims ?? []).some((p) => inCircle(c, p.x, p.y))) return 'Too near a claim point';
  for (const b of snap.buildings ?? []) if (b.pre && inCircle(c, b.x, b.y)) return b.landmark ? 'Too near a landmark' : 'Too near a town';
  return null;
}

/** Pieces that persist: built (not pre-built), standing, no wall, bridge, stairs, brazier or chest. */
const plain = (b: BuildingSnap) => {
  const d = BUILDINGS[b.type];
  return !!d && !b.pre && !d.wall && !d.bridge && !d.access && !d.brazier && !d.chest && !d.prebuilt && (b.state === 'done' || b.state === 'damaged');
};

/** The settlement's own buildings (its banner's, on its ground). */
export const ownBuildings = (snap: Snapshot, s: RoomSettlement): BuildingSnap[] =>
  s.team === null ? [] : (snap.buildings ?? []).filter((b) => b.team === s.team && !b.pre && b.state !== 'destroyed' && inCircle(s, b.x, b.y));

/** The settlement's stores (buildings with goods, chests aside). */
export const storesOf = (snap: Snapshot, s: RoomSettlement): BuildingSnap[] => ownBuildings(snap, s).filter((b) => b.goods !== undefined && b.type !== 'chest');

/** What persists of the settlement: its plain pieces, the centre first. */
export function piecesOf(snap: Snapshot, s: RoomSettlement): Piece[] {
  const own = ownBuildings(snap, s).filter(plain).sort((a, b) => (a.id === s.centre ? -1 : b.id === s.centre ? 1 : a.id - b.id));
  return own.map((b) => {
    const goods = Object.fromEntries(Object.entries(b.goods ?? {}).filter(([, n]) => (n ?? 0) > 1e-6).map(([k, n]) => [k, Math.round(n! * 1000) / 1000]));
    return { type: b.type, x: b.x, y: b.y, rot: b.rot, hp: Math.round((b.hp / Math.max(1, b.maxHp)) * 1000) / 1000, ...(Object.keys(goods).length ? { goods } : {}) };
  });
}

/** The region's settlements as one player sees them (protocol `settlements`). */
export const netOf = (list: readonly RoomSettlement[], pid: number): SettlementNet[] =>
  list.map((s) => ({
    id: s.id, centre: s.centre, x: s.x, y: s.y, r: s.r, name: s.name, lord: s.lord, lordName: s.lordName, team: s.team, level: s.level,
    overlord: s.overlord, tribute: s.tribute,
    plots: s.members.flatMap((m) => (m.plot ? [{ pid: m.pid, ...m.plot }] : [])),
    role: s.members.find((m) => m.pid === pid)?.role ?? null,
  }));

/** The region's settlements from D1: members, plots, the lord's alliance and the lords of its overlords. */
export async function loadRegionSettlements(db: D1Database, region: string): Promise<RoomSettlement[]> {
  const rows = (await db
    .prepare('SELECT s.*, p.display_name AS lord_name FROM war_settlements s LEFT JOIN players p ON p.id = s.lord_pid WHERE s.region = ?1 ORDER BY s.id')
    .bind(region)
    .all<{ id: number; centre_piece: number; x: number; y: number; r: number; name: string; lord_pid: number; lord_name: string | null; level: number; overlord_id: number | null; tribute_pct: number; levied_at: number }>()).results;
  if (!rows.length) return [];
  const ms = (await db
    .prepare('SELECT m.* FROM war_settlement_members m JOIN war_settlements s ON s.id = m.settlement_id WHERE s.region = ?1 ORDER BY m.since, m.player_id')
    .bind(region)
    .all<{ settlement_id: number; player_id: number; role: Role; x0: number | null; y0: number | null; x1: number | null; y1: number | null }>()).results;
  const out: RoomSettlement[] = [];
  for (const r of rows) {
    const lords: number[] = [];
    for (let cur = r.overlord_id, n = 0; cur !== null && n < 16; n++) {
      const o = await db.prepare('SELECT lord_pid, overlord_id FROM war_settlements WHERE id = ?1').bind(cur).first<{ lord_pid: number; overlord_id: number | null }>();
      if (!o || lords.includes(o.lord_pid)) break;
      lords.push(o.lord_pid);
      cur = o.overlord_id;
    }
    out.push({
      id: r.id, centre: r.centre_piece, x: r.x, y: r.y, r: r.r || SETTLE.r, name: r.name, lord: r.lord_pid, lordName: r.lord_name ?? `Player ${r.lord_pid}`,
      team: await allianceOf(db, r.lord_pid), level: r.level, overlord: r.overlord_id, tribute: r.tribute_pct, leviedAt: r.levied_at, overlordLords: lords,
      members: ms.filter((m) => m.settlement_id === r.id).map((m) => ({ pid: m.player_id, role: m.role, plot: m.x0 === null ? null : { x0: m.x0, y0: m.y0!, x1: m.x1!, y1: m.y1! } })),
    });
  }
  return out;
}
