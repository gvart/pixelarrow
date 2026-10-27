/**
 * W-66 raising men: the Tunnel of Shades (rules: src/war/sim/tunnel.ts) and the bonus every raised or claimed man gets.
 *
 *  - raiseBonus: what a man raised by the tunnel or claimed as a soul (./persons.ts claimSoul) gets on top of his class
 *    and level. Zero for now; divine favour fills it in (the "favour" work). Keep the hook to this one function.
 *  - The tunnel: while the player has fewer than TUNNEL.floor living men (armyCount: every region, wounded and captive
 *    count, the dead and retired do not), one man rises at home every TUNNEL.everyMs, level 1 in starter gear, of the
 *    class of one of his latest fallen (else militia). Settled lazily from war_tunnel.next_at (migration 0048) on
 *    GET /api/war/tunnel, on the roster read and on a region join, so it needs no live room. The clock moves by a
 *    compare-and-set on next_at and each man's insert checks the floor itself, so two racing reads never pass it.
 *    A player who never had a man (before his start squad) has no tunnel.
 */
import type { WarPerson } from '../../../src/war/types';
import { makePerson } from '../../../src/war/sim/roster';
import { settleTunnel, TUNNEL } from '../../../src/war/sim/tunnel';
import { START_CLASSES } from '../../../src/war/world/start';
import { armyCount, insertCapped, nameFor, newId } from './persons';

export interface RaiseBonus { attr: number; gearTier: number }

/** The bonus a man raised or claimed by `pid` gets now (W-66 hook; the favour work fills it in). */
export async function raiseBonus(_db: D1Database, _pid: number): Promise<RaiseBonus> {
  return { attr: 0, gearTier: 0 };
}

/** The man with the bonus: `attr` unspent attribute points more; `gearTier` kit tiers up (his class kit remade at that tier). */
export function applyRaise(p: WarPerson, b: RaiseBonus): WarPerson {
  if (!b.attr && !b.gearTier) return p;
  const hero = { ...p.hero, points: p.hero.points + Math.max(0, b.attr) };
  if (b.gearTier > 0) hero.equip = { ...hero.equip, ...makePerson(p.id, hero.cls ?? 'militia', { tier: Math.min(2, b.gearTier) }).hero.equip };
  return { ...p, hero };
}

export interface TunnelView { alive: number; floor: number; nextAt: number | null; pending: number; every: number; raised: number }

/** Settle the player's tunnel at `now`: raise every man due, move the clock; his tunnel as GET /api/war/tunnel shows it. */
export async function settleTunnelFor(db: D1Database, pid: number, now: number, retry = true): Promise<TunnelView> {
  const [alive, ever, row] = await Promise.all([
    armyCount(db, pid),
    db.prepare('SELECT 1 AS x FROM war_persons WHERE player_id = ?1 LIMIT 1').bind(pid).first(),
    db.prepare('SELECT next_at FROM war_tunnel WHERE player_id = ?1').bind(pid).first<{ next_at: number | null }>(),
  ]);
  const view = (a: number, nextAt: number | null, raised: number): TunnelView => ({ alive: a, floor: TUNNEL.floor, nextAt, pending: Math.max(0, TUNNEL.floor - a), every: TUNNEL.everyMs, raised });
  if (!ever) return { ...view(alive, null, 0), pending: 0 };
  const stored = row?.next_at ?? null;
  const s = settleTunnel({ alive, nextAt: stored }, now);
  if (s.nextAt === stored && !s.raise) return view(alive, stored, 0);
  // claim the clock (compare-and-set): a racing read that moved it first wins, this one reads again
  const cas = row
    ? await db.prepare('UPDATE war_tunnel SET next_at = ?2 WHERE player_id = ?1 AND next_at IS ?3').bind(pid, s.nextAt, stored).run()
    : await db.prepare('INSERT INTO war_tunnel (player_id, next_at) VALUES (?1, ?2) ON CONFLICT (player_id) DO NOTHING').bind(pid, s.nextAt).run();
  if (!cas.meta.changes) return retry ? settleTunnelFor(db, pid, now, false) : view(alive, stored, 0);
  if (!s.raise) return view(alive, s.nextAt, 0);
  const men = await raiseMen(db, pid, s.raise, now);
  const after = await armyCount(db, pid);
  return view(after, after >= TUNNEL.floor ? null : s.nextAt, men);
}

/** n men rise at home: level 1, starter gear, the classes of his latest fallen; each insert checks the floor. */
async function raiseMen(db: D1Database, pid: number, n: number, now: number): Promise<number> {
  const [fallen, names, bonus] = await Promise.all([
    db.prepare("SELECT cls FROM war_persons WHERE player_id = ?1 AND state = 'dead' ORDER BY updated_at DESC, id LIMIT ?2").bind(pid, TUNNEL.floor).all<{ cls: string }>(),
    db.prepare("SELECT name FROM war_persons WHERE player_id = ?1 AND state NOT IN ('dead', 'retired')").bind(pid).all<{ name: string }>(),
    raiseBonus(db, pid),
  ]);
  const start = START_CLASSES as readonly string[];
  const classes = fallen.results.map((r) => r.cls).filter((c) => start.includes(c));
  const taken = new Set(names.results.map((r) => r.name));
  const stmts = Array.from({ length: n }, (_, k) => {
    const cls = classes[k % Math.max(1, classes.length)] ?? 'militia';
    const p = makePerson(newId(pid), cls);
    const man = applyRaise({ ...p, hero: { ...p.hero, name: nameFor(cls, taken, k) } }, bonus);
    return insertCapped(db, pid, man, null, TUNNEL.floor, now);
  });
  const res = await db.batch(stmts);
  return res.reduce((a, r) => a + (r.meta?.changes ?? 0), 0);
}
