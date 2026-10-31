/**
 * W-72 proposal, rival warlords (docs/WAR.md "Rival warlords"; data src/data/warWarlords.ts): a director over a region's
 * sim and bots, like ./bots.ts it works through the public API only (the room's snapshot in, spawns and orders out), so
 * the region room runs it beside its bots and a test or scenario runs it the same way.
 *
 *   const lords = createWarlords(region, sim, bots, seed);   // null: the region lies in no warlord's domain
 *   lords.setAge(days); lords.setPlayers(n);
 *   each tick: sim.step(); bots.tick(); const notes = lords.tick(sim.snapshot());
 *
 * Each warlord here holds places (claim points, lairs of his kind) with a garrison on the bots' `hold`, takes more as he
 * ages (a band on `attackMove` from his nearest holding, or over the border facing his seat), tops his garrisons up,
 * raids undefended alliance buildings and carts after a warning, and loses a place when its garrison is down (a loot
 * pile; the owners with men near earn favour on the server). In his seat his hall holds the lord himself; the lord down,
 * he is fallen for WARLORD.back days. Deterministic: no clock but `age` (days, advanced a tick at a time), no Rng but
 * its own; the snapshot read only in id order.
 */
import { makeItem } from '../../game/heroes';
import { Rng, hashString } from '../../sim/rng';
import { WARLORD, warlordLoot, warlordsOf, type WarlordDef } from '../../data/warWarlords';
import { edge } from '../world/graph';
import { depthOf, depthRule } from './depth';
import { MOB_TEAM } from './mobs';
import type { Bots } from './bots';
import type { MobKind, RegionData, Snapshot, SquadId, UnitId, UnitSnap, WarBuildSim, WarEvent, WarlordSnap } from '../types';
import { ALLIANCES } from '../world/alliances';

export type WarlordNote = Extract<WarEvent, { kind: 'warlord' }>;

/** Ticks in a day of age. */
export const DAY_TICKS = 864_000;

/** A place he may hold: claim point `c<i>` or lair `l<i>` of the region, where. */
interface Place { key: string; x: number; y: number; lair: boolean }

/** squad: its garrison; extra: men home from a raid with no room in it (they hold beside it); lt: the first man (the lord in his hall). */
interface Hold { place: string; x: number; y: number; squad: SquadId; extra: SquadId[]; state: 'marching' | 'held'; since: number; lt: UnitId; hall: boolean; at: number }
/** A party on the move: reinforcements for a holding, or a raid (warned, marching, at its target, going home). */
interface Party { squad: SquadId; to: string; at: number; raid?: { phase: 'march' | 'hit' | 'home'; x: number; y: number; building?: number; siege?: number; until: number; team: number } }
interface Warning { x: number; y: number; team: number; building?: number; siege?: number; from: string; at: number; what: string }

interface Lord {
  def: WarlordDef;
  seat: boolean;
  /** The border he comes over (march), as a point inside the map. */
  gate: [number, number];
  places: Place[];
  holds: Hold[];
  parties: Party[];
  /** Age (days) each place was freed. */
  freed: Record<string, number>;
  /** Age he fell at (null: standing), and the age his growth counts from (0, or his return). */
  fallen: number | null;
  born: number;
  lord: UnitId;
  laid: boolean;
  reinforceAt: number;
  raidAt: number;
  warn: Warning | null;
  /** His fall: bands walking to the border, gone there or at `until`. */
  gone: { squad: SquadId; until: number }[];
}

/** What the server keeps of a region's warlords between rooms (ages, days). */
export interface WarlordMemory { fallen: Record<string, number>; freed: Record<string, Record<string, number>> }

export interface Warlords {
  /** Days since the season began (the server's clock; it then runs on a tick at a time). */
  setAge(days: number): void;
  /** Players with men in the region now (pressure: growth, raids and garrisons; 0: he only holds). */
  setPlayers(n: number): void;
  /** After each sim step (and the bots'): his decisions every WARLORD.think ticks; the notes of this tick. */
  tick(snap: Snapshot): WarlordNote[];
  snaps(): WarlordSnap[];
  /** Dev and scenarios: each warlord picks a raid target `after` ticks from now (default his next pass). */
  raidNow(after?: number): void;
  /** His men here (all warlords). */
  men(): number;
  memory(): WarlordMemory;
  recall(m: WarlordMemory): void;
  /** Another region's room tells: he fell at this age (days); his bands here are recalled. */
  fell(id: string, at: number): void;
  exportState(): unknown;
  importState(s: unknown): void;
}

/** A line with its blanks filled, each sentence capitalised. */
const fill = (line: string, k: string, v: string) => line.replace(`{${k}}`, v).replace(/(^|\. )([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
const placeName = (p: Place, kind: MobKind) => (!p.lair ? 'the claim banner' : kind === 'bandit' ? 'the bandit camp' : 'the den');
const thing = (type: string) => type.replace(/[0-9]+$/, '').replace(/([A-Z])/g, ' $1').toLowerCase();
/** Buildings a raid may go for: anything finished that is no wall, gate, tower, bridge, stair or field work. */
const RAIDABLE = (t: string) => !/(wall|Wall|palisade|rampart|Gate|Tower|Bridge|Stairs|ladder|stakes|ditch|brazier|towerBridge)/.test(t);

export function createWarlords(region: RegionData, sim: WarBuildSim, bots: Bots, seed: number): Warlords | null {
  const defs = warlordsOf(region.id);
  if (!defs.length) return null;
  const depth = depthOf(region), rule = depthRule(region);
  let age = 0, players = 0, tick = 0;
  const rng = new Rng(hashString(`${region.id}:${seed}:warlords`) || 1);
  const inside = (x: number, y: number): [number, number] => [Math.max(2, Math.min(region.w - 3, x)), Math.max(2, Math.min(region.h - 3, y))];

  const lords: Lord[] = defs.map((def) => {
    const seat = def.seat === region.id;
    const side = seat ? null : edge(region.id, def.seat)?.sideA;
    const e = (side && region.entries.find((x) => x.side === side)) || region.entries[0];
    const gate = inside(e ? e.x + e.w / 2 : region.w / 2, e ? e.y + e.h / 2 : region.h / 2);
    const cps: Place[] = (region.claimPoints ?? []).map((c, i) => ({ key: `c${i}`, x: c.x, y: c.y, lair: false }));
    const lairs: Place[] = (region.lairs ?? []).flatMap((l, i) => (l.kind === def.kind && !l.captain ? [{ key: `l${i}`, x: l.x, y: l.y, lair: true }] : []));
    // seat: his hall (claim point 0) first, the rest by distance from it; march: by distance from the border
    const from: [number, number] = seat && cps.length ? [cps[0].x, cps[0].y] : gate;
    const d = (p: Place) => (p.x - from[0]) ** 2 + (p.y - from[1]) ** 2;
    const places = [...cps, ...lairs].sort((a, b) => d(a) - d(b) || (a.key < b.key ? -1 : 1));
    return { def, seat, gate, places, holds: [], parties: [], freed: {}, fallen: null, born: 0, lord: -1, laid: false, reinforceAt: WARLORD.reinforce, raidAt: WARLORD.raid.every, warn: null, gone: [] };
  });

  // --- the snapshot as read this pass
  let units = new Map<UnitId, UnitSnap>();
  let snap: Snapshot;
  const alive = (u: UnitSnap | undefined) => !!u && u.state !== 'dead';
  const squadMen = (id: SquadId) => (snap.squads[id]?.units ?? []).filter((u) => alive(units.get(u)));
  const centre = (id: SquadId): [number, number] | null => {
    const men = squadMen(id);
    if (!men.length) return null;
    let x = 0, y = 0;
    for (const u of men) (x += units.get(u)!.x), (y += units.get(u)!.y);
    return [x / men.length, y / men.length];
  };
  const owner = (w: WarlordDef) => `warlord:${w.id}`;
  /** Living fighting men of other teams within r of (x,y) (team: only that team's). */
  const foesNear = (x: number, y: number, r: number, team?: number) => {
    for (const u of snap.units) {
      if (!alive(u) || u.cls.startsWith('civ_')) continue;
      const q = snap.squads[u.squad];
      if (!q || q.team === MOB_TEAM || (team !== undefined ? q.team !== team : q.team >= ALLIANCES.length)) continue;
      if ((u.x - x) ** 2 + (u.y - y) ** 2 <= r * r) return true;
    }
    return false;
  };
  const ownersNear = (x: number, y: number, r: number) => {
    const out = new Set<string>();
    for (const u of snap.units) {
      const q = alive(u) ? snap.squads[u.squad] : undefined;
      if (q && q.owner.startsWith('p:') && (u.x - x) ** 2 + (u.y - y) ** 2 <= r * r) out.add(q.owner);
    }
    return [...out].sort();
  };
  const menAll = () => {
    let n = 0;
    for (const q of snap.squads) if (q.team === MOB_TEAM && q.owner.startsWith('warlord:')) n += squadMen(q.id).length;
    return n;
  };

  const press = () => Math.max(1, players);
  /** Garrison size of a holding taken at age `since`. */
  const size = (w: WarlordDef, since: number) => {
    const G = WARLORD.garrison, d = Math.min(depth, G.base.length - 1);
    const base = Math.min(G.max[d], G.base[d] + Math.floor(Math.max(0, age - since) * G.perDay));
    return Math.max(1, Math.min(G.cap, Math.round(base * w.men * (1 + G.press * (press() - 1)))));
  };
  /** Holdings his age allows here (and the players present; seat at least his hall). */
  const target = (l: Lord) => {
    const a = Math.max(0, age - l.born);
    const byAge = l.seat ? 1 + Math.floor(a / WARLORD.grow.seat) : a < WARLORD.grow.marchDay ? 0 : 1 + Math.floor((a - WARLORD.grow.marchDay) / WARLORD.grow.march);
    return Math.min(WARLORD.maxHold, l.places.length, byAge, 1 + players);
  };
  const influenced = (x: number, y: number) => {
    const m = sim.influence(), t = Math.floor(y) * m.w + Math.floor(x);
    return (m.mask[t] ?? 0) & ((1 << ALLIANCES.length) - 1);
  };
  /** The next place he may take: free of him, of alliances and their ground, not freed lately. */
  const nextPlace = (l: Lord): Place | null => {
    for (const p of l.places) {
      if (l.holds.some((h) => h.place === p.key)) continue;
      if (lords.some((o) => o !== l && o.holds.some((h) => h.place === p.key))) continue;
      const f = l.freed[p.key];
      if (f !== undefined && age - f < WARLORD.retake / DAY_TICKS) continue;
      if (!p.lair) {
        const c = snap.claims?.[Number(p.key.slice(1))];
        if (c && c.team >= 0 && c.team !== MOB_TEAM) continue;
      }
      if (influenced(p.x, p.y)) continue;
      return p;
    }
    return null;
  };

  const notes: WarlordNote[] = [];
  const say = (l: Lord, what: WarlordNote['what'], text: string, x: number, y: number, extra: Partial<WarlordNote> = {}) =>
    notes.push({ t: tick, kind: 'warlord', what, warlord: l.def.id, name: l.def.name, text, x, y, ...extra });

  const spawn = (l: Lord, n: number, x: number, y: number, lead?: 'lt' | 'lord'): SquadId => {
    const k = lead === 'lord' ? WARLORD.lord : WARLORD.lieutenant;
    const id = sim.spawnWild(owner(l.def), l.def.kind, Math.min(12, n), x, y, { hp: rule.mob, dmg: rule.mob, ...(lead ? { lead: k } : {}) });
    return id;
  };
  /** Lay a garrison on place p at once (a fresh room catching up, his hall). */
  const garrison = (l: Lord, p: Place, since: number, march: boolean, from?: [number, number]) => {
    const hall = l.seat && p.key === l.places[0]?.key && !p.lair;
    const [sx, sy] = march && from ? from : [p.x, p.y];
    const sq = spawn(l, size(l.def, since), sx, sy, hall ? 'lord' : 'lt');
    if (sq < 0) return;
    const h: Hold = { place: p.key, x: p.x, y: p.y, squad: sq, extra: [], state: march ? 'marching' : 'held', since, lt: -1, hall, at: tick };
    l.holds.push(h);
    bots.set(sq, march ? { kind: 'attackMove', x: p.x, y: p.y } : { kind: 'hold', x: p.x, y: p.y, radius: WARLORD.holdR });
    if (!march) say(l, 'took', fill(l.def.lines.took, 'place', placeName(p, l.def.kind)), p.x, p.y, { place: p.key });
  };
  /** Where his men set out from: his nearest held holding to (x,y), else the border (march) or nothing. */
  const source = (l: Lord, x: number, y: number, not?: string): [number, number] | null => {
    let best: [number, number] | null = null, bd = Infinity;
    for (const h of l.holds) {
      if (h.state !== 'held' || h.place === not) continue;
      const c = centre(h.squad);
      if (!c) continue;
      const d = (c[0] - x) ** 2 + (c[1] - y) ** 2;
      if (d < bd) (bd = d), (best = c);
    }
    return best ?? (l.seat ? null : l.gate);
  };

  const free = (l: Lord, h: Hold) => {
    l.holds = l.holds.filter((x) => x !== h);
    l.freed[h.place] = age;
    for (const q of [h.squad, ...h.extra]) bots.clear(q);
    const p = l.places.find((x) => x.key === h.place)!;
    const drop = warlordLoot(l.def, 'holding', depth, `${region.id}:${seed}:${h.place}:${tick}`);
    sim.dropPile(h.x, h.y, Object.entries(drop.goods).map(([r, n]) => ({ r: r as never, n, o: region.id })), []);
    say(l, 'freed', fill(l.def.lines.freed, 'place', placeName(p, l.def.kind)), h.x, h.y, { place: h.place, near: ownersNear(h.x, h.y, WARLORD.favour.near) });
  };
  const fall = (l: Lord, x: number, y: number) => {
    l.fallen = age;
    l.lord = -1;
    l.warn = null;
    const drop = warlordLoot(l.def, 'lord', depth, `${region.id}:${seed}:${l.def.id}:${tick}`);
    const items = drop.item ? [{ ...makeItem(new Rng(hashString(`${region.id}:${seed}:${l.def.id}:${tick}:lord`) || 1), { nextId: 0 }, drop.item.def, drop.item.rarity), uid: `warlord:${region.id}:${seed}:${l.def.id}:${tick}` }] : [];
    sim.dropPile(x, y, Object.entries(drop.goods).map(([r, n]) => ({ r: r as never, n, o: region.id })), items);
    say(l, 'fallen', l.def.lines.fallen, x, y, { near: ownersNear(x, y, WARLORD.favour.near) });
  };

  /** Raid targets: the nearest undefended alliance building or cart within reach of a holding of his. */
  const raidTarget = (l: Lord): Warning | null => {
    const R = WARLORD.raid;
    let best: Warning | null = null, bd = R.reach * R.reach;
    const consider = (x: number, y: number, team: number, guard: number, w: Omit<Warning, 'x' | 'y' | 'team' | 'from' | 'at'>) => {
      for (const h of l.holds) {
        if (h.state !== 'held') continue;
        const d = (h.x - x) ** 2 + (h.y - y) ** 2;
        if (d >= bd || foesNear(x, y, guard, team)) continue;
        bd = d;
        best = { x, y, team, from: h.place, at: tick + R.warn, ...w };
      }
    };
    for (const b of snap.buildings ?? []) {
      if (b.team < 0 || b.team >= ALLIANCES.length || (b.state !== 'done' && b.state !== 'damaged') || b.ruin || !RAIDABLE(b.type)) continue;
      consider(b.x, b.y, b.team, R.guard, { building: b.id, what: thing(b.type) });
    }
    if (!best)
      for (const e of snap.sieges ?? []) {
        if ((e.type !== 'handcart' && e.type !== 'wagon') || e.state === 'destroyed' || e.team === MOB_TEAM) continue;
        consider(e.x, e.y, e.team, R.cartGuard, { siege: e.id, what: e.type === 'wagon' ? 'wagon' : 'cart' });
      }
    return best;
  };
  const standing = (w: Warning | NonNullable<Party['raid']>) => {
    if (w.building !== undefined) {
      const b = snap.buildings?.find((x) => x.id === w.building);
      return !!b && b.team === w.team && (b.state === 'done' || b.state === 'damaged') && !b.ruin;
    }
    const e = snap.sieges?.find((x) => x.id === w.siege);
    return !!e && e.state !== 'destroyed' && e.team === w.team;
  };

  const holdMen = (h: Hold) => squadMen(h.squad).length + h.extra.reduce((a, q) => a + squadMen(q).length, 0);
  const down = (l: Lord) => l.fallen !== null && age - l.fallen < WARLORD.back;

  /** His fall: every holding and party here walks off to the border, the places free and nothing dropped. */
  const withdraw = (l: Lord) => {
    const until = tick + WARLORD.recall.leave;
    for (const h of l.holds) {
      const p = l.places.find((x) => x.key === h.place)!;
      if (h.state === 'held') say(l, 'recall', fill(fill(WARLORD.recall.line, 'place', placeName(p, l.def.kind)), 'band', l.def.band), h.x, h.y, { place: h.place });
    }
    for (const q of [...l.holds.flatMap((h) => [h.squad, ...h.extra]), ...l.parties.map((x) => x.squad)]) {
      l.gone.push({ squad: q, until });
      bots.clear(q);
      sim.order({ kind: 'move', squad: q, x: l.gate[0], y: l.gate[1] });
    }
    l.holds = [];
    l.parties = [];
    l.warn = null;
  };

  const think = (l: Lord) => {
    // fallen: what still stands here walks off; the gone leave the field at the border
    if (down(l) && (l.holds.length || l.parties.length)) withdraw(l);
    for (const g of [...l.gone]) {
      const c = centre(g.squad);
      if (c && tick < g.until && (c[0] - l.gate[0]) ** 2 + (c[1] - l.gate[1]) ** 2 > WARLORD.arrive ** 2) continue;
      if (c) sim.dropSquad(g.squad);
      bots.clear(g.squad);
      l.gone = l.gone.filter((x) => x !== g);
    }
    // the fallen is back after WARLORD.back days, grown from nothing (his hall laid anew)
    if (l.fallen !== null && !down(l)) (l.born = l.fallen + WARLORD.back), (l.fallen = null), (l.laid = false);
    // a fresh room lays out what his age gives him (at least one player assumed: he was busy while nobody looked)
    if (!l.laid && !down(l)) {
      l.laid = true;
      const had = players;
      players = Math.max(players, 1);
      const n = target(l);
      for (let i = l.holds.length; i < n; i++) {
        const p = nextPlace(l);
        if (!p) break;
        garrison(l, p, l.born, false);
      }
      players = had;
      if (l.holds.length) say(l, 'rise', l.def.lines.rise, l.holds[0].x, l.holds[0].y);
    }

    // holdings: arrived, freed; his hall's lord
    for (const h of [...l.holds]) {
      if (h.at >= tick) continue; // laid this pass: the snapshot does not show it yet
      if (h.lt < 0) {
        const q = snap.squads[h.squad];
        if (q?.units.length) (h.lt = q.units[0]), h.hall && l.fallen === null && (l.lord = h.lt);
      }
      if (h.hall && l.lord >= 0 && !alive(units.get(l.lord))) {
        const u = units.get(l.lord);
        fall(l, u?.x ?? h.x, u?.y ?? h.y);
      }
      if (!holdMen(h)) {
        if (h.state === 'held') free(l, h);
        else (l.holds = l.holds.filter((x) => x !== h)), bots.clear(h.squad); // a band cut down on the way: nothing taken
        continue;
      }
      const c = centre(h.squad);
      if (c && h.state === 'marching' && (c[0] - h.x) ** 2 + (c[1] - h.y) ** 2 <= WARLORD.arrive ** 2) {
        h.state = 'held';
        bots.set(h.squad, { kind: 'hold', x: h.x, y: h.y, radius: WARLORD.holdR });
        const p = l.places.find((x) => x.key === h.place)!;
        say(l, 'took', fill(l.def.lines.took, 'place', placeName(p, l.def.kind)), h.x, h.y, { place: h.place });
      }
    }

    // parties: reinforcements join their holding; raids march, hit, go home
    for (const pt of [...l.parties]) {
      if (pt.at >= tick) continue;
      const c = centre(pt.squad);
      if (!c) {
        l.parties = l.parties.filter((x) => x !== pt);
        bots.clear(pt.squad);
        continue;
      }
      const h = l.holds.find((x) => x.place === pt.to);
      const r = pt.raid;
      if (r && r.phase === 'march' && (c[0] - r.x) ** 2 + (c[1] - r.y) ** 2 <= WARLORD.raid.at ** 2) {
        r.phase = 'hit';
        r.until = tick + WARLORD.raid.stay;
        bots.clear(pt.squad);
        sim.order({ kind: 'attackBuilding', squad: pt.squad, ...(r.building !== undefined ? { building: r.building } : { siege: r.siege }) });
      } else if (r && (r.phase === 'march' || r.phase === 'hit') && (tick >= r.until || !standing(r))) {
        r.phase = 'home';
        const home = h ?? l.holds.find((x) => x.state === 'held');
        if (home) (pt.to = home.place), bots.set(pt.squad, { kind: 'attackMove', x: home.x, y: home.y });
        else bots.set(pt.squad, { kind: 'hold', x: c[0], y: c[1], radius: WARLORD.holdR });
      } else if ((!r || r.phase === 'home') && h && h.state === 'held' && (c[0] - h.x) ** 2 + (c[1] - h.y) ** 2 <= WARLORD.arrive ** 2) {
        // home: into the garrison while it has room (a squad holds 12), else they hold beside it
        const g = squadMen(h.squad).length, n = squadMen(pt.squad).length;
        if (g > 0 && g + n <= 12) sim.order({ kind: 'merge', squad: pt.squad, into: h.squad }), bots.clear(pt.squad);
        else h.extra.push(pt.squad), bots.set(pt.squad, { kind: 'hold', x: h.x, y: h.y, radius: WARLORD.holdR });
        l.parties = l.parties.filter((x) => x !== pt);
      }
    }

    if (players < 1 || down(l)) return; // nobody here, or he is fallen: he holds, nothing more
    const room = WARLORD.cap - menAll();

    // growth: a band marches on the next place
    if (l.holds.length < target(l) && room > 0) {
      const p = nextPlace(l), src = p && source(l, p.x, p.y);
      if (p && src) garrison(l, p, age, true, src);
    }

    // reinforcements: a short holding gets men from his nearest other one (march: over the border)
    if (tick >= l.reinforceAt) {
      l.reinforceAt = tick + WARLORD.reinforce;
      for (const h of l.holds) {
        if (h.state !== 'held' || l.parties.some((x) => x.to === h.place && !x.raid)) continue;
        const want = size(l.def, h.since) - squadMen(h.squad).length, left = WARLORD.cap - menAll();
        if (want <= 0 || left <= 0) continue;
        const backed = h.hall && l.holds.some((x) => x !== h && x.state === 'held');
        if (!backed && foesNear(h.x, h.y, WARLORD.quiet)) continue;
        const src = source(l, h.x, h.y, h.place);
        if (!src) continue;
        const sq = spawn(l, Math.min(want, left), src[0], src[1]);
        if (sq < 0) continue;
        l.parties.push({ squad: sq, to: h.place, at: tick });
        bots.set(sq, { kind: 'attackMove', x: h.x, y: h.y });
      }
    }

    // raids: warn, then go
    const R = WARLORD.raid;
    if (l.warn && tick >= l.warn.at) {
      const w = l.warn, h = l.holds.find((x) => x.place === w.from && x.state === 'held');
      l.warn = null;
      if (h && standing(w)) {
        const n = Math.min(R.max, R.men[Math.min(depth, R.men.length - 1)] + R.perPlayer * (players - 1), WARLORD.cap - menAll());
        const sq = n > 0 ? spawn(l, n, h.x, h.y, 'lt') : -1; // W-79: a lieutenant leads it
        if (sq >= 0) {
          l.parties.push({ squad: sq, to: h.place, at: tick, raid: { phase: 'march', x: w.x, y: w.y, building: w.building, siege: w.siege, until: tick + R.stay * 4, team: w.team } });
          bots.set(sq, { kind: 'attackMove', x: w.x, y: w.y });
          say(l, 'raid', `${fill(l.def.lines.warn, 'what', w.what)}!`, w.x, w.y, { team: w.team });
        }
      }
    } else if (!l.warn && tick >= l.raidAt && l.holds.some((h) => h.state === 'held' && h.at < tick) && !l.parties.some((x) => x.raid && x.raid.phase !== 'home')) {
      l.raidAt = tick + Math.round(R.every / Math.min(players, R.maxDiv)) + rng.int(0, 600);
      const w = raidTarget(l);
      if (w) {
        l.warn = w;
        say(l, 'warn', `${fill(l.def.lines.warn, 'what', w.what)} in ${Math.round(R.warn / 10)} s`, w.x, w.y, { team: w.team, in: R.warn });
      }
    }
  };

  const api: Warlords = {
    setAge(days) {
      age = days;
    },
    setPlayers(n) {
      players = Math.max(0, Math.floor(n));
    },
    tick(s) {
      tick = s.tick;
      age += 1 / DAY_TICKS;
      notes.length = 0;
      if (tick % WARLORD.think !== 0) return [];
      snap = s;
      units = new Map(s.units.map((u) => [u.id, u]));
      for (const l of lords) think(l);
      return notes.slice();
    },
    snaps: () => lords.map((l): WarlordSnap => ({
      id: l.def.id, name: l.def.name, title: l.def.title, band: l.def.band, kind: l.def.kind, tint: l.def.tint, scale: l.def.scale, seat: l.seat,
      ...(down(l) ? { fallen: true as const } : {}),
      lord: l.lord >= 0 && alive(units.get(l.lord)) ? l.lord : -1,
      holds: l.holds.map((h) => ({ place: h.place, x: h.x, y: h.y, men: snap ? holdMen(h) : 0, unit: h.hall ? l.lord : h.lt, state: h.state })),
      ...(l.warn ? { raid: { x: l.warn.x, y: l.warn.y, team: l.warn.team, in: Math.max(0, l.warn.at - tick) } } : {}),
      ...(l.parties.some((p) => p.raid && p.raid.phase !== 'home') ? { raiding: true as const } : {}),
    })),
    men: () => (snap ? menAll() : 0),
    raidNow(after = 0) {
      for (const l of lords) l.raidAt = tick + after;
    },
    memory: () => ({
      fallen: Object.fromEntries(lords.flatMap((l) => (l.fallen !== null ? [[l.def.id, l.fallen]] : []))),
      freed: Object.fromEntries(lords.map((l) => [l.def.id, { ...l.freed }])),
    }),
    recall(m) {
      for (const l of lords) {
        const f = m.fallen[l.def.id];
        if (f !== undefined) l.fallen = f;
        Object.assign(l.freed, m.freed[l.def.id] ?? {});
      }
    },
    fell(id, at) {
      const l = lords.find((x) => x.def.id === id);
      // a fall already back from, or older than the one he is down for, changes nothing
      if (!l || age - at >= WARLORD.back || (l.fallen !== null && l.fallen >= at)) return;
      l.fallen = at;
      l.lord = -1;
    },
    exportState: () => ({ age, players, lords: lords.map((l) => ({ holds: l.holds, parties: l.parties, freed: l.freed, fallen: l.fallen, born: l.born, lord: l.lord, laid: l.laid, reinforceAt: l.reinforceAt, raidAt: l.raidAt, warn: l.warn, gone: l.gone })), rng: rng.state }),
    importState(s) {
      const o = s as { age: number; players: number; lords: Partial<Lord>[]; rng: number };
      age = o.age;
      players = o.players;
      o.lords.forEach((x, i) => lords[i] && Object.assign(lords[i], x));
      rng.state = o.rng;
    },
  };
  return api;
}
