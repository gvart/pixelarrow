/**
 * W-66 raising men: the Tunnel of Shades (rules: src/war/sim/tunnel.ts).
 *
 *  - The tunnel: while the player has fewer than min(TUNNEL.floor, his path's cap) men who can fight (W-102; W-68 fitCount:
 *    fit; the wounded do not count here but still fill the army under the cap; captives are not his), one man rises at
 *    home every TUNNEL.everyMs, level 1 in starter gear, of the class of one of his latest fallen his path may hold
 *    (W-101; else src/war/world/start.ts raiseClass). Settled lazily from war_tunnel.next_at (migration 0048) on
 *    GET /api/war/tunnel, on the roster read and on a region join, so it needs no live room. The clock moves by a
 *    compare-and-set on next_at and each man's insert checks the floor itself, so two racing reads never pass it.
 *    A player who never had a man (before his path's first men) has no tunnel.
 */
import { makePerson } from '../../../src/war/sim/roster';
import { settleTunnel, TUNNEL, type WipeState } from '../../../src/war/sim/tunnel';
import { mayHold, raiseClass, soldierCap, START_CLASSES, type PlayerPath } from '../../../src/war/world/start';
import { pathOf } from './start';
import { armyCount, fitCount, insertCapped, nameFor, newId } from './persons';

/**
 * alive: what the floor counts (fitCount, = fit); wounded (with the first back): the wipe card's WipeState
 * (src/war/sim/tunnel.ts wiped: no man he can field).
 */
export interface TunnelView extends WipeState { alive: number; floor: number; nextAt: number | null; pending: number; every: number; raised: number }

/** Settle the player's tunnel at `now`: raise every man due, move the clock; his tunnel as GET /api/war/tunnel shows it. */
export async function settleTunnelFor(db: D1Database, pid: number, now: number, retry = true): Promise<TunnelView> {
  const [way, alive, army, ever, row, w] = await Promise.all([
    pathOf(db, pid),
    fitCount(db, pid),
    armyCount(db, pid),
    db.prepare('SELECT 1 AS x FROM war_persons WHERE player_id = ?1 LIMIT 1').bind(pid).first(),
    db.prepare('SELECT next_at FROM war_tunnel WHERE player_id = ?1').bind(pid).first<{ next_at: number | null }>(),
    db.prepare(`SELECT COUNT(*) AS n, MIN(until_at) AS at FROM war_persons WHERE player_id = ?1 AND state = 'wounded' AND cls NOT LIKE 'civ\\_%' ESCAPE '\\'`).bind(pid).first<{ n: number; at: number | null }>(),
  ]);
  const away = { wounded: w?.n ?? 0, woundedAt: w?.at ?? null };
  const cap = soldierCap(way.path), floor = Math.min(TUNNEL.floor, cap), room = cap - army;
  const view = (a: number, nextAt: number | null, raised: number): TunnelView => ({ alive: a, floor, nextAt, pending: Math.max(0, Math.min(floor - a, room - raised)), every: TUNNEL.everyMs, raised, fit: a, ...away });
  if (!ever) return { ...view(alive, null, 0), pending: 0 };
  const stored = row?.next_at ?? null;
  const s = settleTunnel({ alive, nextAt: stored, room, floor }, now);
  if (s.nextAt === stored && !s.raise) return view(alive, stored, 0);
  // claim the clock (compare-and-set): a racing read that moved it first wins, this one reads again
  const cas = row
    ? await db.prepare('UPDATE war_tunnel SET next_at = ?2 WHERE player_id = ?1 AND next_at IS ?3').bind(pid, s.nextAt, stored).run()
    : await db.prepare('INSERT INTO war_tunnel (player_id, next_at) VALUES (?1, ?2) ON CONFLICT (player_id) DO NOTHING').bind(pid, s.nextAt).run();
  if (!cas.meta.changes) return retry ? settleTunnelFor(db, pid, now, false) : view(alive, stored, 0);
  if (!s.raise) return view(alive, s.nextAt, 0);
  const men = await raiseMen(db, pid, way, floor, s.raise, now);
  const after = await fitCount(db, pid);
  return view(after, after >= floor ? null : s.nextAt, men);
}

/** n men rise at home: level 1, starter gear, the classes of his latest fallen his path may hold; each insert checks the floor and his cap. */
async function raiseMen(db: D1Database, pid: number, way: PlayerPath, floor: number, n: number, now: number): Promise<number> {
  const [fallen, names] = await Promise.all([
    db.prepare("SELECT cls FROM war_persons WHERE player_id = ?1 AND state = 'dead' ORDER BY updated_at DESC, id LIMIT ?2").bind(pid, TUNNEL.floor).all<{ cls: string }>(),
    db.prepare("SELECT name FROM war_persons WHERE player_id = ?1 AND state IN ('active', 'wounded', 'training')").bind(pid).all<{ name: string }>(),
  ]);
  const start = START_CLASSES as readonly string[];
  const classes = fallen.results.map((r) => r.cls).filter((c) => start.includes(c) && mayHold(way, c));
  const taken = new Set(names.results.map((r) => r.name));
  const stmts = Array.from({ length: n }, (_, k) => {
    const cls = classes[k % Math.max(1, classes.length)] ?? raiseClass(way);
    const p = makePerson(newId(pid), cls);
    const man = { ...p, hero: { ...p.hero, name: nameFor(cls, taken, k) } };
    return insertCapped(db, pid, man, null, soldierCap(way.path), now, floor);
  });
  const res = await db.batch(stmts);
  return res.reduce((a, r) => a + (r.meta?.changes ?? 0), 0);
}
