/**
 * P7 alliance AI (docs/impl/godot-port.md P7; new, no earlier TS design): one AI alliance in a region, played through the
 * public API only, as ./bots.ts and ./warlords.ts are (the snapshot in; spawns, orders and bot behaviours out), so a
 * region room or a headless season (./aiSeason.ts) runs it beside the bots and the warlords.
 *
 *   const ai = createAllianceAi(sim, bots, team);
 *   each tick, after sim.step(), bots.tick() and the warlords: ai.tick(sim.snapshot());
 *
 * The alliance is ALLY_AI.players commanders (owner `ai:<team>:<k>`); every ALLY_AI.think ticks:
 *  - raising: its home strongroom gets ALLY_AI.stock, and each commander enters with TUNNEL.floor men of his class at the alliance's entry; then the Tunnel of
 *    Shades (W-66, ./tunnel.ts settleTunnel; a tick is TICK_MS) raises him a man every TUNNEL.everyMs while he has
 *    fewer than its floor standing here, at the entry, as a squad of his own.
 *  - economy and building: commander 0 is the builder. Once the alliance holds a claim point, his squads lay a camp by
 *    it (free, a store), build it, gather the nearest wood node into it, and lay and build a storehouse once the
 *    alliance has its wood. While it holds none, they march with the band.
 *  - sending squads: the rest (and the builder's, as said) are one band on one target: a held point of the alliance
 *    being taken (defend it), else the claim point nearest its entry not its own: a free one first, then one a foe
 *    holds, then a locked one (through its zone's lairs still standing, nearest the entry first). With fewer than
 *    ALLY_AI.muster men it musters at the entry instead (a point of its own it still holds). Far from it the band
 *    attack-moves there; there, its biggest squad channels the claim and the rest hold round the banner.
 *  - sieges: a target point with foe alliance walls standing within SIEGE_R of it is stormed: the band's first squad on
 *    the bots' siegeRam, the rest on assault.
 * Deterministic: no clock but the snapshot's tick, no rng; the snapshot read in id order.
 */
import { TUNNEL, settleTunnel } from './tunnel';
import { BUILDINGS, rotated } from './economy';
import { ALLIANCES } from '../world/alliances';
import type { Behaviour, Bots } from './bots';
import type { BuildingType, ClaimSnap, RegionData, ResourceKind, Snapshot, SquadId, WarBuildSim } from '../types';

export const ALLY_AI = {
  /** Ticks between decisions. */
  think: 50,
  /** Commanders per alliance and the class each enters with (by index, wrapping). */
  players: 3,
  classes: ['militia', 'hoplite', 'archer'],
  /** A tick in ms (the tunnel's clock). */
  tickMs: 100,
  /** The band goes out with at least this many men (else it musters at the entry). */
  muster: 8,
  /** The band holds round its point this far; foe walls this near a target point make it a siege. */
  holdR: 12,
  siegeR: 24,
  /** Where the builder looks for a spot round a point (tiles out, in rings). */
  spot: 14,
  /** What its home strongroom holds when it enters (the room's economy feed: sim.addStock). */
  stock: { wood: 200, stone: 100 } as Partial<Record<ResourceKind, number>>,
  camp: 'camp' as BuildingType,
  store: 'storehouse' as BuildingType,
} as const;

export interface AllianceAiStats {
  /** Men raised by the tunnel; squads spawned; orders and behaviours given. */
  raised: number; squads: number; orders: number; bots: number;
  /** The band's target: a claim point (-1 none), and what it does there. */
  target: number; doing: 'none' | 'muster' | 'lair' | 'march' | 'claim' | 'siege' | 'hold';
  /** Buildings it laid. */
  laid: number;
}

export interface AllianceAi {
  readonly team: number;
  tick(snap: Snapshot): void;
  /** Its living fighting men here (all commanders). */
  men(): number;
  /** Its commanders with men here (the warlords' pressure counts them as players). */
  present(): number;
  stats(): AllianceAiStats;
}

/** The point (x, y) of the alliance's entry: the region's entry sides in their order, one per team (wrapping). */
export function entryOf(region: RegionData, team: number): [number, number] {
  const sides: RegionData['entries'] = [];
  for (const e of region.entries) if (!sides.some((x) => x.side === e.side)) sides.push(e);
  const e = sides[team % sides.length];
  return e ? [e.x + e.w / 2, e.y + e.h / 2] : [region.w / 2, region.h / 2];
}

export function createAllianceAi(sim: WarBuildSim, bots: Bots, team: number): AllianceAi {
  const region = sim.region, A = ALLY_AI;
  const [ex, ey] = entryOf(region, team);
  const owners = Array.from({ length: A.players }, (_, k) => `ai:${team}:${k}`);
  /** Each commander's tunnel clock (ms; null: none running). */
  const nextAt: (number | null)[] = owners.map(() => null);
  let started = false;
  /** The behaviour last set on each squad, so a bot is not reset each pass. */
  const set = new Map<SquadId, Behaviour>();
  const st: AllianceAiStats = { raised: 0, squads: 0, orders: 0, bots: 0, target: -1, doing: 'none', laid: 0 };
  let snap: Snapshot | null = null;
  let alive = new Map<number, number>(); // squad -> living fighting men
  let byId = new Map<number, Snapshot['units'][number]>();

  const d2 = (x0: number, y0: number, x1: number, y1: number) => (x0 - x1) ** 2 + (y0 - y1) ** 2;
  const spawn = (k: number, n: number) => {
    const id = sim.spawnSquad(owners[k], team, A.classes[k % A.classes.length], n, ex, ey);
    if (id >= 0) st.squads++;
    return id;
  };
  const order = (o: Parameters<WarBuildSim['order']>[0]) => {
    st.orders++;
    sim.order(o);
  };
  const same = (a: Behaviour | undefined, b: Behaviour) =>
    !!a && a.kind === b.kind && 'x' in a && 'x' in b && a.x === b.x && a.y === b.y && ('radius' in a ? a.radius : -1) === ('radius' in b ? b.radius : -1);
  const behave = (id: SquadId, b: Behaviour) => {
    if (same(set.get(id), b)) return;
    set.set(id, b);
    st.bots++;
    bots.set(id, b);
  };
  const unbot = (id: SquadId) => {
    if (!set.has(id)) return;
    set.delete(id);
    bots.clear(id);
  };
  /** A squad's centre (its living men's mean), null when none lives. */
  const centre = (id: SquadId): [number, number] | null => {
    const s = snap!, q = s.squads[id];
    let x = 0, y = 0, n = 0;
    for (const u of q?.units ?? []) {
      const m = byId.get(u);
      if (!m || m.state === 'dead') continue;
      x += m.x;
      y += m.y;
      n++;
    }
    return n ? [x / n, y / n] : null;
  };
  /** Commander k's squads with men standing, in id order. */
  const squadsOf = (k: number) => snap!.squads.filter((q) => q.owner === owners[k] && (alive.get(q.id) ?? 0) > 0).map((q) => q.id);
  const menOf = (k: number) => squadsOf(k).reduce((a, id) => a + alive.get(id)!, 0);

  /** Raising: the first men of each commander, then his tunnel. */
  const raise = (now: number) => {
    if (!started) {
      started = true;
      for (const [r, n] of Object.entries(A.stock)) sim.addStock(team, r as ResourceKind, n!);
      for (let k = 0; k < A.players; k++) spawn(k, TUNNEL.floor);
      return;
    }
    for (let k = 0; k < A.players; k++) {
      const s = settleTunnel({ alive: menOf(k), nextAt: nextAt[k] }, now);
      nextAt[k] = s.nextAt;
      if (s.raise > 0 && spawn(k, s.raise) >= 0) st.raised += s.raise;
    }
  };

  const claims = () => snap!.claims ?? [];
  const mine = (c: ClaimSnap) => c.state === 'claimed' && c.team === team;
  /** Foe alliance walls standing within SIEGE_R of (x, y). */
  const walled = (x: number, y: number) =>
    (snap!.buildings ?? []).some((b) => b.team !== team && b.team >= 0 && b.team < ALLIANCES.length && !!BUILDINGS[b.type]?.wall && (b.state === 'done' || b.state === 'damaged') && !b.ruin && d2(b.x, b.y, x, y) <= A.siegeR ** 2);

  /** The band's target point (-1: none) and, for a locked one, the lair it goes for first (-1: the point itself). */
  const pickTarget = (): [number, number] => {
    const cs = claims();
    for (const c of cs) if (mine(c) && c.taking) return [c.id, -1];
    // the nearest free point first, then the nearest a foe holds, then the nearest locked one
    let best = -1, bd = Infinity, br = 3;
    for (const c of cs) {
      if (mine(c)) continue;
      const r = c.state === 'locked' ? 2 : c.state === 'claimed' ? 1 : 0, d = d2(c.x, c.y, ex, ey);
      if (r < br || (r === br && d < bd)) (br = r), (bd = d), (best = c.id);
    }
    if (best < 0) return [cs.find(mine)?.id ?? -1, -1];
    const c = cs[best];
    if (c.state !== 'locked') return [best, -1];
    let lair = -1, ld = Infinity;
    for (const l of snap!.lairs ?? []) {
      if (!c.lairs.includes(l.id) || l.state === 'cleared' || l.alive <= 0) continue;
      const d = d2(l.x, l.y, ex, ey);
      if (d < ld) (ld = d), (lair = l.id);
    }
    return [best, lair];
  };

  /** The band (squad ids) on its target. */
  const band = (ids: SquadId[]) => {
    const [t, lair] = pickTarget();
    st.target = t;
    if (t < 0 || !ids.length) return void (st.doing = 'none');
    const c = claims()[t];
    // too few to go out: they muster at the entry (a point of its own is still held)
    if (!mine(c) && ids.reduce((a, id) => a + alive.get(id)!, 0) < A.muster) {
      st.doing = 'muster';
      for (const id of ids) behave(id, { kind: 'hold', x: ex, y: ey, radius: A.holdR });
      return;
    }
    if (lair >= 0) {
      const l = snap!.lairs!.find((x) => x.id === lair)!;
      st.doing = 'lair';
      for (const id of ids) behave(id, { kind: 'attackMove', x: l.x, y: l.y });
      return;
    }
    if (!mine(c) && walled(c.x, c.y)) {
      st.doing = 'siege';
      ids.forEach((id, i) => behave(id, { kind: i === 0 ? 'siegeRam' : 'assault', x: c.x, y: c.y }));
      return;
    }
    if (mine(c)) {
      // held (or being taken: its holders fight off the takers round the banner)
      st.doing = 'hold';
      for (const id of ids) behave(id, { kind: 'hold', x: c.x, y: c.y, radius: A.holdR });
      return;
    }
    // there: the biggest squad near the banner channels, the rest hold round it; else the band marches on it
    let lead = -1;
    for (const id of ids) {
      const p = centre(id);
      if (p && d2(p[0], p[1], c.x, c.y) <= A.holdR ** 2 && (lead < 0 || alive.get(id)! > alive.get(lead)!)) lead = id;
    }
    st.doing = lead >= 0 ? 'claim' : 'march';
    for (const id of ids) {
      if (id !== lead) behave(id, lead >= 0 ? { kind: 'hold', x: c.x, y: c.y, radius: A.holdR } : { kind: 'attackMove', x: c.x, y: c.y });
      else if (snap!.squads[id].order !== 'claimRegion') {
        unbot(id);
        order({ kind: 'claimRegion', squad: id, point: t });
      }
    }
  };

  /** A spot for a building of `type` by (x, y): the first the works take, ring by ring outward ([-1, -1]: none). */
  const spot = (type: BuildingType, x: number, y: number): [number, number] => {
    const [w, h] = rotated(type, 0), x0 = Math.floor(x - w / 2), y0 = Math.floor(y - h / 2);
    for (let r = 2; r <= A.spot; r += 2) {
      for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (sim.checkPlacement(team, type, x0 + dx, y0 + dy).ok) return [x0 + dx, y0 + dy];
      }
    }
    return [-1, -1];
  };

  /** The builder's squads at a point the alliance holds: camp, wood, storehouse. False: nothing held (they march). */
  const build = (ids: SquadId[]): boolean => {
    const held = claims().find((c) => mine(c) && !c.taking);
    if (!held || !ids.length) return false;
    for (const id of ids) unbot(id);
    const blds = (snap!.buildings ?? []).filter((b) => b.team === team && d2(b.x, b.y, held.x, held.y) <= (A.spot + 6) ** 2);
    const camp = blds.find((b) => b.type === A.camp), store = blds.find((b) => b.type === A.store);
    const open = [camp, store].find((b) => b && b.state !== 'done' && b.state !== 'damaged');
    const lay = (type: BuildingType, x: number, y: number) => {
      const [sx, sy] = spot(type, x, y);
      if (sx < 0) return;
      st.laid++;
      order({ kind: 'placeBuilding', squad: ids[0], type, x: sx, y: sy });
      for (const id of ids.slice(1)) order({ kind: 'move', squad: id, x: sx, y: sy });
    };
    if (!camp) return lay(A.camp, held.x, held.y), true;
    if (open) {
      for (const id of ids) if (snap!.squads[id].order !== 'build') order({ kind: 'build', squad: id, site: open.id });
      return true;
    }
    const wood = snap!.stock?.[team]?.wood ?? 0, cost = BUILDINGS[A.store].cost.wood ?? 0;
    if (!store && wood >= cost) return lay(A.store, camp.x, camp.y), true;
    let node = -1, nd = Infinity;
    for (const n of sim.resourceNodes()) {
      if (n.res !== 'wood' || n.amount <= 0 || n.guarded) continue;
      const d = d2(n.x, n.y, camp.x, camp.y);
      if (d < nd) (nd = d), (node = n.id);
    }
    if (node >= 0) for (const id of ids) if (snap!.squads[id].order !== 'gather') order({ kind: 'gather', squad: id, node });
    return true;
  };

  return {
    team,
    tick(s) {
      if (s.tick % A.think !== 0) return;
      snap = s;
      alive = new Map();
      byId = new Map(s.units.map((u) => [u.id, u]));
      for (const u of s.units) if (u.state !== 'dead' && !u.cls.startsWith('civ_')) alive.set(u.squad, (alive.get(u.squad) ?? 0) + 1);
      for (const [id] of set) if (!(alive.get(id) ?? 0)) set.delete(id); // the dead squad's bot runs on idle
      raise(s.tick * A.tickMs);
      const builder = squadsOf(0), fighters: SquadId[] = [];
      for (let k = 1; k < A.players; k++) fighters.push(...squadsOf(k));
      if (!build(builder)) fighters.push(...builder);
      band(fighters.sort((a, b) => a - b));
    },
    men: () => owners.reduce((a, _, k) => a + (snap ? menOf(k) : 0), 0),
    present: () => owners.filter((_, k) => snap && menOf(k) > 0).length,
    stats: () => ({ ...st }),
  };
}
