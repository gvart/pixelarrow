/**
 * M7d landmark guardians (docs/WAR.md "Landmarks", "Region lore and depth"; W-45, W-47): the boss AI with its phases,
 * the boss gate on the region's claim points, the kill (event, killers, loot by the room), the 24 h respawn while the
 * region is unheld, the Bandit King's escape by the postern, raid scaling, and the Rim Warden's strikes on a depth-4 rim.
 *
 * A guardian is one or more squads of the mob team (MOB_TEAM) spawned from `RegionData.guardians` with spawnMobs: its body
 * (the unit its bar shows), its linked targets (Scylla's six heads, the Chimera's three heads), its guard (the Bandit
 * King's, the Maenad Queen's thiasos) and the packs it calls. It fights with the sim's own orders and blows while on the
 * ground; its special moves (breath, sweeps, thrown rocks, snatches, stomps, charges) are dealt here, on a clock, to the
 * foe men they reach. A guardian `pin`ned stands where this module puts it (a roof, a gate top, its chains, the cave);
 * one `aloft` cannot be reached by melee (1: on a roof or in the air; 2: in the channels, only from a ford): archers,
 * slingers and engines bring it down.
 *
 * Phases (src/data/warBosses.ts `phases`): the share of its bar's hp each starts below; a phase only ever goes forward.
 *  - Drakon the White: P1 in the yard, claw (his blows) and a tail sweep (knock 2); P2 (< 60%) flies to the keep roof and
 *    between the towers, out of melee reach, breathing a cone of fire (5% max hp, sets wood alight); P3 (< 56.5%) crashes
 *    down into the yard (knock 3), enraged, and calls 2 drake packs from the bone pit.
 *  - Scylla: six heads strike from the cave along the cliff, one snatching a man within 4 tiles of the water every 6 s
 *    (he falls; a physician near may save him); her body is open only while 2 heads or fewer live; at 50% she drags
 *    herself onto the flats.
 *  - Brontes: P1 hurls rocks from the gate top (range 25, breaks wood); P2 (< 85%) comes down and smashes (knock 2),
 *    his blows hitting buildings x3, his own walls too.
 *  - Gyges: P1 chained, three blows at once at three men in reach 6; P2 (< 50%) breaks his chains (knock 2).
 *  - The Chimera: lion (melee), goat (fire breath, ignites) and serpent (venom), each head a linked target; the goat dead,
 *    no more fire; the serpent dead, no more venom; she falls when all three do.
 *  - The Bandit King: holds the palace street with his guard; P2 (< 60%) the palace gate; P3 (< 30%) runs for the
 *    postern: there 60 s alive, he escapes and comes back in an hour with half his guard.
 *  - The Maenad Queen (the Oracle Grove, Bacchae): the thiasos dances fast through the trees; P2 (< 40%, the Grove)
 *    frenzied, she calls two maenad packs.
 *  - The Titan of the Navel: P1 boulders from the arena (range 30, area 3, breaks wood); P2 (< 50%) stomps (knock 4) and
 *    tears the ramp gates. Achelous the River-God: a giant, a serpent in the channels (venom, aloft but from the
 *    fords), a bull that charges through the ranks (knock 3). The Minotaur and the pocket bosses fight as brutes.
 *
 * The kill: a `bossSlain` event (killers: owners of the squads that hurt it, the last blow first) at the body; the region
 * room drops its loot (src/data/warBosses.ts bossLoot, bossGoods) as a pile there; the sandbox does the same. Respawn:
 * never while a claim point of the region is held; 24 h after the kill otherwise (full hp, the landmark back to its start
 * state). Raid scaling: a guardian facing more foe squads than its tier's raid grows (max hp x1.1 a squad over, at most
 * x1.6), so a crowd does not trivialise it.
 */
import type { BossSnap, GuardianEntry, MobKind, Order, RegionData, SquadId, WardenSnap, WarEvent } from '../types';
import type { WarStats } from './classes';
import { warBoss, type WarBoss } from '../../data/warBosses';
import { depthOf } from './depth';

/** A guardian's unit as this module sees it (the sim's own Unit). */
export interface BUnit {
  id: number; x: number; y: number; hp: number; maxHp: number; alive: boolean; cls: string; st: WarStats; facing: number;
  pin: boolean; aloft: 0 | 1 | 2; immune: boolean; venom: boolean; boss: number; squad: BSquad;
}
export interface BSquad { id: SquadId; team: number; owner: string; alive: number; cx: number; cy: number; units: BUnit[]; order: Order['kind']; target: SquadId }

export interface BossHost {
  units: readonly BUnit[];
  squads: readonly BSquad[];
  /** A squad of the mob team of `count` men of sheet `cls` with these stats over a bear's (boss: the run they belong to, -1 a called pack). */
  spawn(cls: string, count: number, x: number, y: number, st: Partial<WarStats>, boss: number): SquadId;
  order(o: Order): void;
  /** Raw damage (no armour, no blow) to a man; venom: a venomous bite. */
  hurt(u: BUnit, dmg: number, venom?: boolean): void;
  knock(u: BUnit, fx: number, fy: number, tiles: number): void;
  /** Put a man at (x,y) (a flight, a perch). */
  place(u: BUnit, x: number, y: number): void;
  /** The man leaves the field, unreported (an escape). */
  vanish(u: BUnit): void;
  /** Set burnable buildings within r of (x,y) alight. */
  burn(x: number, y: number, r: number): void;
  /** Damage buildings within r of (x,y): wood only, all, or gates only. */
  smash(x: number, y: number, r: number, dmg: number, what: 'wood' | 'all' | 'gate'): void;
  /** Water under (x,y): 0 none, 1 shallow (a ford), 2 deep. */
  water(x: number, y: number): number;
  /** A man of a squad can stand at (x,y). */
  open(x: number, y: number): boolean;
  /** Ground level at (x,y) (a wall walk or tower platform: its deck's); two levels apart is a cliff no blow crosses. */
  level(x: number, y: number): number;
  /** Some claim point of the region is held. */
  claimed(): boolean;
  /** The boss gate on the claim points (./mobs.ts): this guardian lives (true) or fell. */
  gate(id: string, alive: boolean): void;
  /** Its landmark back to its start state (60% hp, gates shut). */
  resetLandmark(): void;
  note(e: WarEvent): void;
  range(lo: number, hi: number): number;
  w: number; h: number;
  mobTeam: number; neutralTeam: number;
}

type Ai = 'drakon' | 'scylla' | 'brontes' | 'gyges' | 'chimera' | 'king' | 'maenads' | 'titan' | 'river' | 'brute';
/**
 * Per guardian: its AI, sheet, body (hp, damage a blow, armour, reach, seconds a blow, speed), aggro and leash radii, its
 * guard or thiasos, and its parts (linked targets: Scylla's heads, the Chimera's heads).
 */
interface GDef {
  ai: Ai; cls: string; hp: number; dmg: number; armor: number; reach: number; atk: number; speed: number; aggro: number; leash: number;
  guard?: { cls: string; n: number; hp: number; dmg: number; armor: number };
  parts?: { n: number; hp: number; dmg: number };
}
export const GUARDIANS: Readonly<Record<string, GDef>> = {
  drakon: { ai: 'drakon', cls: 'mob_drakon', hp: 30000, dmg: 8, armor: 2, reach: 2.6, atk: 2, speed: 1.1, aggro: 18, leash: 30 },
  scylla: { ai: 'scylla', cls: 'mob_scylla_head', hp: 18000, dmg: 45, armor: 4, reach: 3, atk: 2.5, speed: 0.8, aggro: 14, leash: 40, parts: { n: 6, hp: 3000, dmg: 40 } },
  bandit_king: { ai: 'king', cls: 'mob_bandit_king', hp: 6000, dmg: 22, armor: 6, reach: 1.6, atk: 1.1, speed: 1.05, aggro: 10, leash: 14, guard: { cls: 'mob_bandit_guard', n: 11, hp: 150, dmg: 14, armor: 4 } },
  river_god: { ai: 'river', cls: 'mob_brontes', hp: 30000, dmg: 60, armor: 4, reach: 2.4, atk: 1.8, speed: 0.9, aggro: 16, leash: 26 },
  titan: { ai: 'titan', cls: 'mob_brontes', hp: 36000, dmg: 80, armor: 4, reach: 2.6, atk: 2, speed: 0.8, aggro: 30, leash: 30 },
  minotaur: { ai: 'brute', cls: 'mob_bandit_captain', hp: 12000, dmg: 50, armor: 4, reach: 1.8, atk: 1.2, speed: 1.1, aggro: 10, leash: 16 },
  brontes: { ai: 'brontes', cls: 'mob_brontes', hp: 8000, dmg: 30, armor: 4, reach: 2.2, atk: 1.8, speed: 0.85, aggro: 25, leash: 22 },
  grove_queen: { ai: 'maenads', cls: 'mob_maenad_queen', hp: 4000, dmg: 30, armor: 4, reach: 1.6, atk: 1, speed: 1.3, aggro: 14, leash: 24, guard: { cls: 'mob_maenad', n: 8, hp: 90, dmg: 14, armor: 2 } },
  gyges: { ai: 'gyges', cls: 'mob_gyges', hp: 10000, dmg: 12, armor: 4, reach: 2.4, atk: 1.6, speed: 0.9, aggro: 20, leash: 30 },
  chimera: { ai: 'chimera', cls: 'mob_chimera', hp: 2200, dmg: 16, armor: 6, reach: 1.8, atk: 1.3, speed: 1.15, aggro: 14, leash: 22, parts: { n: 3, hp: 2200, dmg: 16 } },
  maenad_queen: { ai: 'maenads', cls: 'mob_maenad_queen', hp: 2500, dmg: 26, armor: 3, reach: 1.6, atk: 1, speed: 1.3, aggro: 14, leash: 24, guard: { cls: 'mob_maenad', n: 6, hp: 80, dmg: 12, armor: 2 } },
  moor_bear: { ai: 'brute', cls: 'mob_bear', hp: 5000, dmg: 40, armor: 6, reach: 1.6, atk: 1.5, speed: 1.05, aggro: 12, leash: 20 },
  griffin: { ai: 'brute', cls: 'mob_bear', hp: 4500, dmg: 40, armor: 5, reach: 1.6, atk: 1.3, speed: 1.3, aggro: 14, leash: 22 },
  savanna_lion: { ai: 'brute', cls: 'mob_bear', hp: 4500, dmg: 45, armor: 9, reach: 1.6, atk: 1.2, speed: 1.3, aggro: 14, leash: 22 },
};

/** Timings (ticks) and reach of the special moves. */
export const MOVES = {
  sweep: { every: 100, r: 3, share: 0.015, knock: 2 },
  breath: { every: 100, len: 14, half: 0.32, share: 0.05, reach: 18 },
  perchFor: 300, flight: 20,
  crash: { r: 4, share: 0.1, knock: 3, packs: 2, pack: 4, packHp: 1.2, packDmg: 1 },
  enrage: { dmg: 1.1, atk: 0.75 },
  snatch: { every: 60, water: 4, head: 8 },
  headStrike: { every: 30, r: 4 },
  rock: { every: 60, range: 25, r: 1.8, share: 0.06, wood: 300 },
  smash: { every: 30, r: 2.5, mult: 3 },
  triple: { every: 25, r: 6, n: 3 },
  goatBreath: { every: 60, len: 7, half: 0.5, share: 0.2 },
  postern: { at: 2.5, hold: 600, away: 36000 },
  calls: { packs: 2, n: 6 },
  boulder: { every: 50, range: 30, r: 3, share: 0.3, wood: 400 },
  stomp: { every: 60, r: 4, share: 0.2, knock: 4, gates: 6, gateDmg: 600 },
  bite: { every: 30, r: 3 },
  charge: { every: 60, range: 10, w: 1.5, share: 0.25, knock: 3 },
  fx: 20,
  /** Ticks without a blow either way, away from home, before a guardian on the ground walks back to its post. */
  stall: 200,
};
/** 24 h unheld before a slain guardian is back (ticks); retried every 10 min while the region is held. */
export const BOSS = { respawn: 864000, retry: 6000 };
/** Raid scaling: the raid a guardian of each tier expects (foe squads near), max hp per squad over it, the cap. */
export const RAID = { squads: { 1: 3, 2: 5, 3: 8 } as Record<number, number>, per: 0.1, max: 1.6, r: 30, every: 50 };
/** Rim Warden (docs/WAR.md "Warden strikes"): every 15 min an 8 x 8 patch of the outer 12 tiles, 10 s telegraph, 60% max hp. */
export const WARDEN = { every: 9000, band: 12, size: 8, telegraph: 100, share: 0.6 };

type Fx = NonNullable<BossSnap['fx']>;
interface Run {
  i: number; id: string; ai: Ai; x: number; y: number;
  /** Its squads: the body's (and guard's), the parts (Scylla's heads), the called packs. */
  sq: SquadId; parts: SquadId; called: SquadId[];
  main: number; phase: number; state: BossSnap['state'];
  scale: number; raid: number;
  next: number; next2: number; perch: number; perchAt: number;
  fly: { x0: number; y0: number; x1: number; y1: number; t0: number; t1: number; then: 'perch' | 'land' | 'crash' | 'charge' } | null;
  fleeAt: number; respawnAt: number; guardN: number;
  /** Last tick a blow landed on it or one of its men, or one of theirs on a foe (or it went home for want of one). */
  hitAt?: number;
  dmg: Record<string, number>; last: string;
  fx: (Omit<Fx, 't'> & { at: number }) | null;
}

export function createBosses(region: RegionData, host: BossHost) {
  const entries: readonly GuardianEntry[] = region.guardians ?? [];
  const runs: Run[] = [];
  let warden: { x: number; y: number; w: number; h: number; at: number } | null = null;
  let wardenAt = WARDEN.every;
  let spawned = false;
  let tick = 0;
  const rim = region.rim && depthOf(region) === 4 && region.id !== 'omphalos' ? region.rim : null;

  const foe = (s: BSquad) => s.team !== host.mobTeam && s.team !== host.neutralTeam && s.team >= 0;
  /** Living foe men within r of (x,y). */
  const foesIn = (x: number, y: number, r: number): BUnit[] => {
    const out: BUnit[] = [];
    for (const s of host.squads) {
      if (!foe(s) || s.alive === 0 || (s.cx - x) ** 2 + (s.cy - y) ** 2 > (r + 20) ** 2) continue;
      for (const u of s.units) if (u.alive && (u.x - x) ** 2 + (u.y - y) ** 2 <= r * r) out.push(u);
    }
    return out;
  };
  const nearestFoe = (x: number, y: number, r: number): BUnit | null => {
    let best: BUnit | null = null, bd = r * r;
    for (const u of foesIn(x, y, r)) {
      const d = (u.x - x) ** 2 + (u.y - y) ** 2;
      if (d < bd) (bd = d), (best = u);
    }
    return best;
  };
  /** The foe man within r with the most of his side round him (a breath or a boulder goes where it hurts most). */
  const densest = (x: number, y: number, r: number): BUnit | null => {
    const fs = foesIn(x, y, r);
    let best: BUnit | null = null, bn = -1;
    for (const u of fs) {
      let n = 0;
      for (const o of fs) if ((o.x - u.x) ** 2 + (o.y - u.y) ** 2 <= 9) n++;
      if (n > bn) (bn = n), (best = u);
    }
    return best;
  };
  const fx = (r: Run, kind: Fx['kind'], x: number, y: number, tx: number, ty: number, rad: number) => void (r.fx = { kind, x, y, tx, ty, r: rad, at: tick });
  const body = (r: Run): BUnit | undefined => host.units[r.main];
  const sqOf = (id: SquadId): BSquad | undefined => (id >= 0 ? host.squads[id] : undefined);
  const def = (r: Run): GDef => GUARDIANS[r.id] ?? GUARDIANS.moor_bear;
  const boss = (r: Run): WarBoss | undefined => warBoss(r.id);
  const units = (r: Run): BUnit[] => [...(sqOf(r.sq)?.units ?? []), ...(sqOf(r.parts)?.units ?? [])];
  /** The pool its bar shows: the body (Scylla too), or every head (the Chimera). */
  const pool = (r: Run): BUnit[] => (r.ai === 'chimera' ? (sqOf(r.sq)?.units ?? []) : [body(r)!].filter(Boolean));
  const hpOf = (r: Run) => {
    let hp = 0, max = 0;
    for (const u of pool(r)) (hp += u.alive ? u.hp : 0), (max += u.maxHp);
    return [hp, max] as const;
  };
  const partsAlive = (r: Run) => sqOf(r.parts)?.alive ?? 0;

  /** Strike every foe man in a set: a share of his max hp (min `min`), thrown back from (fx,fy). */
  const blast = (us: readonly BUnit[], share: number, fx0: number, fy0: number, knock = 0, venom = false) => {
    for (const u of us) {
      if (!u.alive) continue;
      host.hurt(u, Math.max(1, u.maxHp * share), venom);
      if (knock && u.alive) host.knock(u, fx0, fy0, knock);
    }
  };
  /** Foe men in the cone from (x,y) towards (tx,ty), len long, half-angle `half`. */
  const cone = (x: number, y: number, tx: number, ty: number, len: number, half: number): BUnit[] => {
    const a = Math.atan2(ty - y, tx - x);
    return foesIn(x, y, len).filter((u) => {
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < 0.5) return true;
      let da = Math.abs(Math.atan2(u.y - y, u.x - x) - a);
      if (da > Math.PI) da = 2 * Math.PI - da;
      return da <= half;
    });
  };
  const breathe = (r: Run, u: BUnit, t: BUnit, len: number, half: number, share: number) => {
    const d = Math.hypot(t.x - u.x, t.y - u.y) || 1, ex = u.x + ((t.x - u.x) / d) * len, ey = u.y + ((t.y - u.y) / d) * len;
    u.facing = Math.atan2(t.y - u.y, t.x - u.x);
    blast(cone(u.x, u.y, t.x, t.y, len, half), share, u.x, u.y);
    for (let k = 1; k <= 3; k++) host.burn(u.x + ((ex - u.x) * k) / 3, u.y + ((ey - u.y) * k) / 3, 1 + k * half * (len / 3) * 0.5);
    fx(r, 'breath', u.x, u.y, ex, ey, len * Math.tan(half));
  };

  /**
   * A foe squad the guardian can come to blows with on the tiers: some living man of it within one level of the
   * guardian's own ground (two levels apart is a cliff; it would stand at the edge over men it cannot strike).
   */
  const onTier = (s: BSquad, o: BSquad) => {
    const me = s.units.find((u) => u.alive);
    if (!me) return false;
    const z = host.level(me.x, me.y);
    return o.units.some((u) => u.alive && Math.abs(host.level(u.x, u.y) - z) <= 1);
  };
  /**
   * Hold home ground: take on the nearest foe squad within aggro on its own tier, back home past the leash or when no
   * foe there can be reached (and called packs alike).
   */
  const engage = (s: BSquad | undefined, hx: number, hy: number, aggro: number, leash: number, r?: Run) => {
    if (!s || s.alive === 0) return;
    const d = Math.hypot(s.cx - hx, s.cy - hy);
    if (r && d > 3 && tick - (r.hitAt ?? 0) > MOVES.stall) {
      // out there and no blow struck either way for a while (men across a ledge, or none that can reach it): home
      r.hitAt = tick;
      host.order({ kind: 'move', squad: s.id, x: hx, y: hy });
      return;
    }
    if (d > leash) {
      if (s.order !== 'move') host.order({ kind: 'move', squad: s.id, x: hx, y: hy });
      return;
    }
    if (s.order === 'move' && d > 3) return; // on its way home
    const tgt = host.squads[s.target];
    if (s.order === 'attack' && tgt && tgt.alive > 0 && (tick % 50 !== 0 || onTier(s, tgt))) return;
    let best = -1, bd = aggro * aggro;
    for (const o of host.squads) {
      if (!foe(o) || o.alive === 0) continue;
      const e = (o.cx - s.cx) ** 2 + (o.cy - s.cy) ** 2;
      if (e < bd && onTier(s, o)) (bd = e), (best = o.id);
    }
    if (best >= 0) host.order({ kind: 'attack', squad: s.id, target: best });
    else if (s.order === 'attack' || d > 3) host.order({ kind: 'move', squad: s.id, x: hx, y: hy });
  };

  const setSt = (u: BUnit, st: Partial<WarStats>) => void (u.st = { ...u.st, ...st });
  const pin = (u: BUnit, on: boolean, aloft: 0 | 1 | 2 = 0) => {
    u.pin = on;
    u.aloft = aloft;
  };
  const flyTo = (r: Run, x1: number, y1: number, ticks: number, then: NonNullable<Run['fly']>['then']) => {
    const u = body(r)!;
    r.fly = { x0: u.x, y0: u.y, x1, y1, t0: tick, t1: tick + ticks, then };
    r.state = 'flight';
    pin(u, true, 1);
    u.facing = Math.atan2(y1 - u.y, x1 - u.x);
  };
  /** Called packs come from (x,y): `n` squads of `count`, hp and damage x over the sheet's base. */
  const call = (r: Run, cls: string, kind: MobKind | null, n: number, count: number, x: number, y: number, hpk: number, dmgk: number) => {
    for (let k = 0; k < n; k++) {
      const a = (2 * Math.PI * k) / n + 0.6, px = x + Math.cos(a) * 3, py = y + Math.sin(a) * 3;
      const base = kind === 'wolf' ? { maxHp: 22 * hpk, dmg: 5.4 * dmgk, speed: 1.6, reach: 1.9, atkTicks: 8, armor: 2 } : { maxHp: 90 * hpk, dmg: 14 * dmgk, speed: 1.3, reach: 1.4, atkTicks: 10, armor: 2 };
      const id = host.spawn(cls, count, px, py, base, -1);
      if (id >= 0) r.called.push(id);
    }
  };

  // --- spawning ---
  const spawnRun = (r: Run, guardN = -1) => {
    const e = entries[r.i], g = def(r);
    const st: Partial<WarStats> = { maxHp: g.hp, dmg: g.dmg, armor: g.armor, reach: g.reach, atkTicks: Math.round(g.atk * 10), speed: g.speed, block: 0, range: 0, ammo: 0, rangedDmg: 0, knock: 0 };
    r.called = [];
    r.parts = -1;
    r.phase = 0;
    r.state = 'idle';
    r.scale = 1;
    r.raid = 0;
    r.fly = null;
    r.fleeAt = -1;
    r.dmg = {};
    r.last = '';
    r.fx = null;
    r.hitAt = tick;
    r.next = tick + 30;
    r.next2 = tick + 45;
    r.perch = 0;
    r.perchAt = 0;
    if (r.ai === 'chimera') {
      r.sq = host.spawn(g.cls, g.parts!.n, e.x, e.y, { ...st, maxHp: g.parts!.hp, dmg: g.parts!.dmg }, r.i);
      const s = sqOf(r.sq)!;
      s.units[2] && (s.units[2].venom = true); // the serpent's bite
      r.main = s.units[0].id;
    } else {
      const n = g.guard ? (guardN >= 0 ? guardN : g.guard.n) : 0;
      r.guardN = n;
      r.sq = host.spawn(g.cls, 1 + n, e.x, e.y, st, r.i);
      const s = sqOf(r.sq)!;
      r.main = s.units[0].id;
      if (g.guard) for (const u of s.units.slice(1)) (u.cls = g.guard.cls), setSt(u, { maxHp: g.guard.hp, dmg: g.guard.dmg, armor: g.guard.armor, reach: 1.4, atkTicks: 12, speed: g.speed }), (u.maxHp = u.hp = g.guard.hp);
    }
    const u = body(r)!;
    if (r.ai === 'scylla') {
      // the heads along the cliff, the body in the cave mouth (shut while 3+ heads live)
      const hs = e.heads?.length ? e.heads : [...Array(g.parts!.n)].map((_, k): [number, number] => [e.x + Math.cos((k / g.parts!.n) * Math.PI) * 4, e.y + Math.sin((k / g.parts!.n) * Math.PI) * 4]);
      r.parts = host.spawn(g.cls, hs.length, e.x, e.y, { ...st, maxHp: g.parts!.hp, dmg: g.parts!.dmg, reach: MOVES.headStrike.r }, r.i);
      sqOf(r.parts)!.units.forEach((h, k) => (host.place(h, hs[k][0], hs[k][1]), pin(h, true)));
      pin(u, true);
      u.immune = true;
    }
    // where it starts: Drakon in the yard, Brontes and the Titan on their perch, Gyges in chains, Scylla in her cave
    if ((r.ai === 'brontes' || r.ai === 'titan') && e.perches?.length) (host.place(u, e.perches[0][0], e.perches[0][1]), pin(u, true, 1), (r.state = 'perch'));
    else if (r.ai === 'brontes' || r.ai === 'titan' || r.ai === 'gyges') pin(u, true);
    host.gate(r.id, true);
  };

  // --- per AI ---
  const enter = (r: Run, p: number) => {
    const e = entries[r.i], u = body(r)!, g = def(r);
    host.note({ t: tick, kind: 'bossPhase', region: region.id, boss: r.id, phase: p });
    switch (r.ai) {
      case 'drakon':
        if (p === 1) {
          // up onto the keep roof
          const [px, py] = e.perches?.[0] ?? [e.x, e.y];
          r.perch = 0;
          flyTo(r, px, py, MOVES.flight, 'perch');
        } else if (p === 2) flyTo(r, e.x, e.y, Math.round(MOVES.flight * 0.6), 'crash');
        break;
      case 'scylla':
        if (p === 1) {
          // she drags herself onto the flats, open to every blade
          pin(u, false);
          u.immune = false;
          const [fx0, fy0] = e.flats ?? [e.x, e.y];
          host.order({ kind: 'move', squad: r.sq, x: fx0, y: fy0 });
          r.state = 'fight';
        }
        break;
      case 'brontes':
        if (p === 1) flyTo(r, e.x, e.y, 10, 'land');
        setSt(u, { knock: 2 });
        break;
      case 'gyges':
        if (p === 1) {
          pin(u, false);
          setSt(u, { knock: 2 });
          r.state = 'fight';
        }
        break;
      case 'king':
        if (p === 2 && e.postern) {
          r.state = 'flee';
          host.order({ kind: 'move', squad: r.sq, x: e.postern[0], y: e.postern[1] });
        }
        break;
      case 'maenads':
        if (p === 1) {
          setSt(u, { dmg: g.dmg * MOVES.enrage.dmg });
          call(r, 'mob_maenad', null, MOVES.calls.packs, MOVES.calls.n, e.x, e.y, 1, 1);
        }
        break;
      case 'titan':
        if (p === 1) {
          pin(u, false);
          if (e.perches?.length) host.place(u, e.x, e.y);
          r.state = 'fight';
        }
        break;
      case 'river':
        if (p === 1) {
          // a serpent in the channels: only a man on a ford reaches it
          u.cls = 'mob_scylla_head';
          u.venom = true;
          const [cx, cy] = e.flats ?? [e.x, e.y];
          host.place(u, cx, cy);
          pin(u, true, 2);
          r.state = 'perch';
        } else if (p === 2) {
          u.cls = 'mob_boar';
          u.venom = false;
          pin(u, false);
          host.place(u, e.x, e.y);
          setSt(u, { knock: 3 });
          r.state = 'fight';
        }
        break;
      default:
    }
  };

  const think = (r: Run) => {
    const e = entries[r.i], u = body(r)!, g = def(r), s = sqOf(r.sq);
    // a flight in the air: the body glides; where it lands, the move it makes
    if (r.fly) {
      const f = r.fly, k = Math.min(1, (tick - f.t0) / Math.max(1, f.t1 - f.t0));
      host.place(u, f.x0 + (f.x1 - f.x0) * k, f.y0 + (f.y1 - f.y0) * k);
      if (k < 1) return;
      r.fly = null;
      if (f.then === 'perch') (pin(u, true, 1), (r.state = 'perch'), (r.perchAt = tick), (r.next = tick + 10));
      else {
        pin(u, false);
        r.state = 'fight';
        if (f.then === 'crash') {
          // crashes down into the yard, enraged; the drakes come from the bone pit
          blast(foesIn(u.x, u.y, MOVES.crash.r), MOVES.crash.share, u.x, u.y, MOVES.crash.knock);
          fx(r, 'crash', u.x, u.y, u.x, u.y, MOVES.crash.r);
          setSt(u, { dmg: g.dmg * MOVES.enrage.dmg, atkTicks: Math.max(1, Math.round(g.atk * 10 * MOVES.enrage.atk)), knock: 1 });
          const [px, py] = e.pit ?? [e.x, e.y];
          call(r, 'mob_wolf', 'wolf', MOVES.crash.packs, MOVES.crash.pack, px, py, MOVES.crash.packHp, MOVES.crash.packDmg);
        } else if (f.then === 'charge') {
          blast(foesIn(u.x, u.y, MOVES.charge.w * 2), MOVES.charge.share, f.x0, f.y0, MOVES.charge.knock);
        }
      }
      return;
    }
    switch (r.ai) {
      case 'drakon':
        if (r.state === 'perch') {
          if (tick >= r.next) {
            const t = densest(u.x, u.y, MOVES.breath.reach);
            if (t) breathe(r, u, t, MOVES.breath.len, MOVES.breath.half, MOVES.breath.share);
            r.next = tick + MOVES.breath.every;
          }
          // from tower to tower
          const ps = e.perches ?? [];
          if (ps.length > 1 && tick - r.perchAt >= MOVES.perchFor) {
            r.perch = (r.perch + 1) % ps.length;
            flyTo(r, ps[r.perch][0], ps[r.perch][1], MOVES.flight, 'perch');
          }
          return;
        }
        engage(s, e.x, e.y, g.aggro, g.leash, r);
        if (tick >= r.next) {
          r.next = tick + (r.phase === 2 ? 60 : MOVES.sweep.every);
          const near = foesIn(u.x, u.y, MOVES.sweep.r);
          if (near.length) (blast(near, MOVES.sweep.share, u.x, u.y, MOVES.sweep.knock), fx(r, 'sweep', u.x, u.y, u.x, u.y, MOVES.sweep.r));
        }
        break;
      case 'scylla': {
        const heads = sqOf(r.parts);
        u.immune = partsAlive(r) > 2;
        if (r.phase === 0 && tick >= r.next2) {
          // the body strikes from the cave mouth
          r.next2 = tick + Math.round(g.atk * 10);
          const t = nearestFoe(u.x, u.y, g.reach + 0.5);
          if (t) host.hurt(t, g.dmg);
        } else if (r.phase === 1) engage(s, e.flats?.[0] ?? e.x, e.flats?.[1] ?? e.y, g.aggro, g.leash, r);
        if (heads && tick % MOVES.headStrike.every === r.i % MOVES.headStrike.every)
          for (const h of heads.units) {
            if (!h.alive) continue;
            const t = nearestFoe(h.x, h.y, MOVES.headStrike.r);
            if (t) (host.hurt(t, h.st.dmg), (h.facing = Math.atan2(t.y - h.y, t.x - h.x)), fx(r, 'smash', h.x, h.y, t.x, t.y, 1));
          }
        if (heads && heads.alive > 0 && tick >= r.next) {
          // a man near the water is snatched
          r.next = tick + MOVES.snatch.every;
          let best: BUnit | null = null, bd = Infinity;
          for (const h of heads.units) {
            if (!h.alive) continue;
            for (const t of foesIn(h.x, h.y, MOVES.snatch.head)) {
              const d = (t.x - h.x) ** 2 + (t.y - h.y) ** 2;
              if (d < bd && nearWater(t.x, t.y, MOVES.snatch.water)) (bd = d), (best = t);
            }
          }
          if (best) (fx(r, 'snatch', u.x, u.y, best.x, best.y, 1), host.hurt(best, best.hp + 1));
        }
        break;
      }
      case 'brontes':
        if (r.state === 'perch') {
          if (tick >= r.next) {
            r.next = tick + MOVES.rock.every;
            const t = densest(u.x, u.y, MOVES.rock.range);
            if (t) {
              u.facing = Math.atan2(t.y - u.y, t.x - u.x);
              blast(foesIn(t.x, t.y, MOVES.rock.r), MOVES.rock.share, t.x, t.y);
              host.smash(t.x, t.y, MOVES.rock.r + 0.5, MOVES.rock.wood, 'wood');
              fx(r, 'rock', u.x, u.y, t.x, t.y, MOVES.rock.r);
            }
          }
          return;
        }
        engage(s, e.x, e.y, g.aggro, g.leash, r);
        if (r.phase === 1 && tick >= r.next && nearestFoe(u.x, u.y, u.st.reach + 0.5)) {
          // his blows hit buildings too, his own walls not spared
          r.next = tick + MOVES.smash.every;
          host.smash(u.x, u.y, MOVES.smash.r, u.st.dmg * MOVES.smash.mult, 'all');
          fx(r, 'smash', u.x, u.y, u.x, u.y, MOVES.smash.r);
        }
        break;
      case 'gyges':
        if (r.phase === 0) {
          // in chains: three blows at once at three men in reach
          if (tick >= r.next) {
            r.next = tick + MOVES.triple.every;
            const near = foesIn(u.x, u.y, MOVES.triple.r).sort((a, b) => (a.x - u.x) ** 2 + (a.y - u.y) ** 2 - ((b.x - u.x) ** 2 + (b.y - u.y) ** 2) || a.id - b.id).slice(0, MOVES.triple.n);
            for (const t of near) host.hurt(t, g.dmg);
            if (near.length) (fx(r, 'sweep', u.x, u.y, near[0].x, near[0].y, MOVES.triple.r), (u.facing = Math.atan2(near[0].y - u.y, near[0].x - u.x)), (r.state = 'fight'));
            else r.state = 'idle';
          }
          return;
        }
        engage(s, e.x, e.y, g.aggro, g.leash, r);
        break;
      case 'chimera': {
        engage(s, e.x, e.y, g.aggro, g.leash, r);
        const goat = s?.units[1];
        if (goat?.alive && tick >= r.next) {
          r.next = tick + MOVES.goatBreath.every;
          const t = nearestFoe(goat.x, goat.y, MOVES.goatBreath.len);
          if (t) breathe(r, goat, t, MOVES.goatBreath.len, MOVES.goatBreath.half, MOVES.goatBreath.share);
        }
        break;
      }
      case 'king': {
        if (r.state === 'flee') {
          const [px, py] = e.postern!;
          if (Math.hypot(u.x - px, u.y - py) <= MOVES.postern.at || (s && Math.hypot(s.cx - px, s.cy - py) <= MOVES.postern.at)) {
            if (r.fleeAt < 0) r.fleeAt = tick;
            if (tick - r.fleeAt >= MOVES.postern.hold) escape(r);
          } else if (s && s.order !== 'move') host.order({ kind: 'move', squad: r.sq, x: px, y: py });
          return;
        }
        const k = r.phase === 0 ? 1 : 1.5;
        engage(s, e.x, e.y, g.aggro * k, g.leash * k, r);
        break;
      }
      case 'maenads':
        engage(s, e.x, e.y, g.aggro, g.leash, r);
        break;
      case 'titan':
        if (r.phase === 0) {
          if (tick >= r.next) {
            r.next = tick + MOVES.boulder.every;
            const t = densest(u.x, u.y, MOVES.boulder.range);
            if (t) {
              u.facing = Math.atan2(t.y - u.y, t.x - u.x);
              blast(foesIn(t.x, t.y, MOVES.boulder.r), MOVES.boulder.share, t.x, t.y);
              host.smash(t.x, t.y, MOVES.boulder.r, MOVES.boulder.wood, 'wood');
              fx(r, 'boulder', u.x, u.y, t.x, t.y, MOVES.boulder.r);
              r.state = 'fight';
            }
          }
          return;
        }
        engage(s, e.x, e.y, g.aggro, g.leash, r);
        if (tick >= r.next) {
          r.next = tick + MOVES.stomp.every;
          const near = foesIn(u.x, u.y, MOVES.stomp.r);
          if (near.length) (blast(near, MOVES.stomp.share, u.x, u.y, MOVES.stomp.knock), fx(r, 'stomp', u.x, u.y, u.x, u.y, MOVES.stomp.r));
          host.smash(u.x, u.y, MOVES.stomp.gates, MOVES.stomp.gateDmg, 'gate');
        }
        break;
      case 'river':
        if (r.phase === 1) {
          if (tick >= r.next) {
            r.next = tick + MOVES.bite.every;
            const t = nearestFoe(u.x, u.y, MOVES.bite.r);
            if (t) (host.hurt(t, g.dmg, true), (u.facing = Math.atan2(t.y - u.y, t.x - u.x)), (r.state = 'perch'));
          }
          return;
        }
        engage(s, e.x, e.y, g.aggro, g.leash, r);
        if (r.phase === 2 && tick >= r.next) {
          // the bull charges through the ranks
          r.next = tick + MOVES.charge.every;
          const t = densest(u.x, u.y, MOVES.charge.range);
          if (t && host.open(t.x, t.y)) {
            const d = Math.hypot(t.x - u.x, t.y - u.y) || 1;
            const line = foesIn(u.x, u.y, d + 1).filter((m) => {
              const k = ((m.x - u.x) * (t.x - u.x) + (m.y - u.y) * (t.y - u.y)) / (d * d);
              return k >= 0 && k <= 1 && Math.hypot(u.x + (t.x - u.x) * k - m.x, u.y + (t.y - u.y) * k - m.y) <= MOVES.charge.w;
            });
            blast(line, MOVES.charge.share, u.x, u.y, MOVES.charge.knock);
            fx(r, 'charge', u.x, u.y, t.x, t.y, MOVES.charge.w);
            flyTo(r, t.x, t.y, 6, 'land');
            u.aloft = 0;
          }
        }
        break;
      default:
        engage(s, e.x, e.y, g.aggro, g.leash, r);
    }
    if (s && s.order === 'attack' && r.state === 'idle') r.state = 'fight';
  };

  const nearWater = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy += 1) for (let dx = -r; dx <= r; dx += 1) if (dx * dx + dy * dy <= r * r && host.water(x + dx, y + dy) > 0) return true;
    return false;
  };

  const escape = (r: Run) => {
    // the King slips out by the postern with what is left of his guard: back in an hour with half of it
    const s = sqOf(r.sq);
    const left = s ? s.units.filter((u) => u.alive).length - 1 : 0;
    if (s) for (const u of s.units) if (u.alive) host.vanish(u);
    r.state = 'away';
    r.respawnAt = tick + MOVES.postern.away;
    r.guardN = Math.max(0, Math.ceil(Math.max(left, def(r).guard?.n ?? 0) / 2));
    host.note({ t: tick, kind: 'bossFled', region: region.id, boss: r.id });
  };

  const slay = (r: Run) => {
    const u = body(r)!;
    r.state = 'slain';
    r.respawnAt = tick + BOSS.respawn;
    r.fly = null;
    const by = Object.entries(r.dmg).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([o]) => o).filter((o) => o !== r.last);
    const killers = r.last ? [r.last, ...by] : by;
    host.note({ t: tick, kind: 'bossSlain', region: region.id, boss: r.id, killers, x: u.x, y: u.y });
    // the linked heads go down with the body
    const p = sqOf(r.parts);
    if (p) for (const h of p.units) if (h.alive) host.vanish(h);
    host.gate(r.id, false);
  };

  const scaleFor = (r: Run) => {
    // raid scaling: more foe squads near than the tier's raid make it tougher (never weaker again)
    const u = body(r)!, seen = new Set<number>();
    for (const t of foesIn(u.x, u.y, RAID.r)) seen.add(t.squad.id);
    r.raid = seen.size;
    const tier = boss(r)?.tier ?? 1;
    const k = Math.min(RAID.max, 1 + RAID.per * Math.max(0, r.raid - (RAID.squads[tier] ?? 3)));
    if (k <= r.scale + 1e-9) return;
    const f = k / r.scale;
    for (const m of units(r)) {
      if (m.cls === def(r).guard?.cls) continue;
      m.maxHp *= f;
      m.hp *= f;
      m.st = { ...m.st, maxHp: m.maxHp };
    }
    r.scale = k;
  };

  const shareOf = (r: Run) => {
    const [hp, max] = hpOf(r);
    return max > 0 ? hp / max : 0;
  };
  const dead = (r: Run) => (r.ai === 'chimera' ? (sqOf(r.sq)?.alive ?? 0) === 0 : !body(r)?.alive);

  // --- the Rim Warden ---
  const wardenTick = () => {
    if (!rim) return;
    if (!warden && tick >= wardenAt) {
      const { band, size } = WARDEN, along = rim === 'N' || rim === 'S' ? host.w : host.h;
      let best = -1, bn = -1;
      const rect = (k: number) => {
        const a = k * size, o = Math.floor((band - size) / 2);
        return rim === 'N' ? { x: a, y: o, w: size, h: size } : rim === 'S' ? { x: a, y: host.h - band + o, w: size, h: size } : rim === 'W' ? { x: o, y: a, w: size, h: size } : { x: host.w - band + o, y: a, w: size, h: size };
      };
      const n = Math.floor(along / size);
      for (let k = 0; k < n; k++) {
        const q = rect(k);
        const c = foesIn(q.x + size / 2, q.y + size / 2, size * 0.71).length;
        if (c > bn) (bn = c), (best = k);
      }
      if (bn === 0) best = Math.min(n - 1, Math.floor(host.range(0, n)));
      warden = { ...rect(best), at: tick + WARDEN.telegraph };
    }
    if (warden && tick >= warden.at) {
      const q = warden, hit = foesIn(q.x + q.w / 2, q.y + q.h / 2, q.w).filter((u) => u.x >= q.x && u.x < q.x + q.w && u.y >= q.y && u.y < q.y + q.h);
      blast(hit, WARDEN.share, 0, 0);
      host.note({ t: tick, kind: 'wardenStrike', x: q.x, y: q.y, w: q.w, h: q.h, hit: hit.length });
      warden = null;
      wardenAt = tick + WARDEN.every - WARDEN.telegraph;
    }
  };

  /** A blow of `owner` dealt d to a unit of guardian run `i` (the killers' list). */
  const hit = (i: number, owner: string, d: number) => {
    const r = runs[i];
    if (!r || r.state === 'slain' || r.state === 'away') return;
    r.dmg[owner] = (r.dmg[owner] ?? 0) + d;
    r.last = owner;
    r.hitAt = tick;
  };

  return {
    /** Save and restore (./state.ts). */
    saveRoot: () => ({ runs, spawned, tick, warden, wardenAt }),
    loadRoot: (o: { spawned: boolean; tick: number; warden: typeof warden; wardenAt: number }) => void ((spawned = o.spawned), (tick = o.tick), (warden = o.warden), (wardenAt = o.wardenAt)),
    /** Wake the region's guardians (once): each holds the region's claim points shut while it lives. */
    spawn() {
      if (spawned) return;
      spawned = true;
      entries.forEach((e, i) => {
        if (!warBoss(e.boss)) return;
        const g = GUARDIANS[e.boss] ?? GUARDIANS.moor_bear;
        const r: Run = {
          i, id: e.boss, ai: g.ai, x: e.x, y: e.y, sq: -1, parts: -1, called: [], main: -1, phase: 0, state: 'idle', scale: 1, raid: 0,
          next: 0, next2: 0, perch: 0, perchAt: 0, fly: null, fleeAt: -1, respawnAt: 0, guardN: -1, dmg: {}, last: '', fx: null,
        };
        runs.push(r);
        spawnRun(r);
      });
    },
    hit,
    /** A blow by a man of guardian run `i` landed on a foe. */
    struck: (i: number) => void (runs[i] && (runs[i].hitAt = tick)),
    /**
     * M7f memory: guardian `id` lies slain (a fresh room of a region that remembers the kill): its men leave the field
     * unreported, no event, no loot; back in `left` ticks (while the region is unheld). Escaped: away likewise.
     */
    down(id: string, left: number, away = false) {
      const r = runs.find((x) => x.id === id && x.state !== 'slain' && x.state !== 'away');
      if (!r) return;
      for (const s of [r.sq, r.parts, ...r.called]) for (const u of sqOf(s)?.units ?? []) if (u.alive) host.vanish(u);
      r.called = [];
      r.fly = null;
      r.state = away ? 'away' : 'slain';
      r.respawnAt = tick + Math.max(0, Math.round(left));
      if (away) r.guardN = Math.ceil((def(r).guard?.n ?? 0) / 2);
      else host.gate(r.id, false);
    },
    /** M7f memory: each guardian's state and ticks until it is back (slain or away). */
    memo: (): { id: string; state: BossSnap['state']; left: number }[] =>
      runs.map((r) => ({ id: r.id, state: r.state, left: r.state === 'slain' || r.state === 'away' ? Math.max(0, r.respawnAt - tick) : 0 })),
    /**
     * Dev and tests: `dmg` straight to guardian `id`'s bar (its first living head for the Chimera; Scylla's body only once
     * open), or to its part `part` (Scylla's heads, the Chimera's lion, goat, serpent).
     */
    hurtBoss(id: string, dmg: number, owner = 'dev', part?: number) {
      const r = runs.find((x) => x.id === id && x.state !== 'slain' && x.state !== 'away');
      if (!r) return;
      const u = part === undefined ? pool(r).find((m) => m.alive) : (r.ai === 'scylla' ? sqOf(r.parts) : sqOf(r.sq))?.units[part];
      if (!u || !u.alive || u.immune) return;
      const d = Math.min(dmg, u.hp);
      hit(r.i, owner, d);
      host.hurt(u, dmg);
    },
    tick(t: number) {
      tick = t;
      wardenTick();
      for (const r of runs) {
        if (r.state === 'slain' || r.state === 'away') {
          if (tick < r.respawnAt) continue;
          if (r.state === 'slain' && host.claimed()) {
            r.respawnAt = tick + BOSS.retry; // held: never back while it is
            continue;
          }
          const back = r.state === 'slain';
          spawnRun(r, back ? -1 : r.guardN);
          if (back) host.resetLandmark();
          host.note({ t: tick, kind: 'bossBack', region: region.id, boss: r.id });
          continue;
        }
        if (dead(r)) {
          slay(r);
          continue;
        }
        const ph = boss(r)?.phases ?? [1];
        const sh = shareOf(r);
        let p = r.phase;
        while (p + 1 < ph.length && sh < ph[p + 1]) p++;
        while (r.phase < p) enter(r, ++r.phase);
        if ((tick + r.i) % RAID.every === 0) scaleFor(r);
        think(r);
        if (r.ai === 'drakon' || r.ai === 'maenads') for (const c of r.called) engage(sqOf(c), r.x, r.y, 20, 40);
      }
    },
    /** The view's guardians. */
    snaps(): BossSnap[] {
      return runs.map((r) => {
        const u = body(r), [hp, max] = hpOf(r), b = boss(r), s = sqOf(r.sq);
        const parts = r.ai === 'scylla' ? { alive: partsAlive(r), total: sqOf(r.parts)?.units.length ?? 0 } : r.ai === 'chimera' ? { alive: s?.alive ?? 0, total: s?.units.length ?? 0 } : undefined;
        const gone = r.state === 'slain' || r.state === 'away';
        const hide = r.ai === 'chimera' && s ? s.units.filter((m) => m.alive).slice(1).map((m) => m.id) : undefined;
        return {
          id: r.id, name: b?.name ?? r.id, squad: r.sq, unit: r.main, x: u?.x ?? r.x, y: u?.y ?? r.y, hp: gone ? 0 : hp, maxHp: max, phase: r.phase, phases: b?.phases ?? [1],
          state: r.state, raid: r.raid, scale: r.scale,
          ...(parts ? { parts } : {}), ...(gone ? { respawnIn: Math.max(0, r.respawnAt - tick) } : {}),
          ...(r.fx && tick - r.fx.at < MOVES.fx ? { fx: { kind: r.fx.kind, x: r.fx.x, y: r.fx.y, tx: r.fx.tx, ty: r.fx.ty, r: r.fx.r, t: tick - r.fx.at } } : {}),
          ...(hide?.length ? { hide } : {}),
        };
      });
    },
    warden: (): WardenSnap | undefined => (warden ? { x: warden.x, y: warden.y, w: warden.w, h: warden.h, in: Math.max(0, warden.at - tick) } : undefined),
    any: () => entries.length > 0 || !!rim,
  };
}
