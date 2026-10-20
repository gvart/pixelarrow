/**
 * Neutral-region fauna and region claiming (docs/impl/global-war-rebuild.md W-12, W-23, W-31; docs/WAR.md fauna).
 *
 * Mobs are ordinary squads of team MOB_TEAM (owner MOB_OWNER), one squad per lair (`RegionData.lairs`), spawned by
 * `spawnMobs()`. This controller drives them with the sim's own orders: at home they wander round the lair; a foe within
 * `aggro` of the pack (or one that hurt it) gets the whole pack on it (attack), and lairs of the same kind within ASSIST
 * join in; past `leash` from the lair they turn back (a move: marching, they do not fight) and regenerate until home.
 * Passive herds (ibex) run from foes instead; skittish packs (jackals) break off once they lose half their strength.
 *
 * A living guard lair locks the resource nodes within GUARD_R (no gathering there); clearing it (every mob dead) frees
 * them. A claim point (`RegionData.claimPoints`) opens once every lair of its zone is cleared: a squad sent there with
 * `claimRegion` channels for CLAIM.ticks with CLAIM.men of its men beside the banner; any foe (mobs included) within
 * CLAIM.contest resets it. Done, the team owns the point and gets its first influence anchor (works.claim). A cleared
 * lair comes back after RESPAWN ticks, but only while its area is unclaimed (its zone's point unowned, no influence on it).
 */
import type { ClaimSnap, LairSnap, MobKind, NodeSnap, Order, RegionData, SquadId } from '../types';
import type { ClassId } from '../../data/classes';

export const MOB_TEAM = 7;
export const MOB_OWNER = 'mob';
export const MOB_KINDS: readonly MobKind[] = ['wolf', 'boar', 'bear', 'bandit', 'jackal', 'ibex'];

/**
 * Per kind: stats over a base class (multipliers on hp and damage, absolute speed and attack time), pack size, and the
 * behaviour radii (tiles). knock: tiles a landed blow throws the target back (boar charge).
 */
export interface MobDef {
  base: ClassId;
  hp: number; dmg: number; speed: number; atk?: number; armor?: number; block?: number; reach?: number; knock?: number;
  count: number; aggro: number; leash: number;
  /** passive: runs from foes, never guards nodes or a claim zone; skittish: breaks off below this share of the pack's hp. */
  passive?: boolean; skittish?: number;
}

export const MOBS: Record<MobKind, MobDef> = {
  // fast, weak, many: the pack swarms
  wolf: { base: 'militia', hp: 0.55, dmg: 0.6, speed: 1.6, atk: 0.8, armor: 0, block: 0, count: 6, aggro: 12, leash: 26 },
  // a charge that throws men back
  boar: { base: 'militia', hp: 1.3, dmg: 1.1, speed: 1.35, atk: 1.2, armor: 2, block: 0, knock: 1.2, count: 3, aggro: 8, leash: 18 },
  // slow, tanky, hits hard
  bear: { base: 'militia', hp: 4, dmg: 2.4, speed: 1.05, atk: 1.5, armor: 4, block: 0, reach: 1.2, count: 2, aggro: 10, leash: 20 },
  // men with weapons (the base class's kit)
  bandit: { base: 'celt_sword', hp: 0.9, dmg: 1, speed: 1, count: 8, aggro: 14, leash: 30 },
  // harass, then run
  jackal: { base: 'militia', hp: 0.4, dmg: 0.45, speed: 1.55, atk: 0.8, armor: 0, block: 0, count: 6, aggro: 9, leash: 18, skittish: 0.5 },
  // a herd that flees
  ibex: { base: 'militia', hp: 0.6, dmg: 0.3, speed: 1.7, armor: 0, block: 0, count: 5, aggro: 10, leash: 30, passive: true },
};

/** Unit class of a mob kind: the renderer's sheet id (src/assets/sheets/mob_<kind>/), and back (null: not a mob). */
export const mobClass = (k: MobKind): string => `mob_${k}`;
export const mobKindOf = (cls: string): MobKind | null => (cls.startsWith('mob_') && cls.slice(4) in MOBS ? (cls.slice(4) as MobKind) : null);

const AI_EVERY = 3; // ticks between a lair's decisions (staggered by lair id)
const WANDER = 4; // tiles round the lair the pack mills about
const WANDER_TICKS = 80; // ticks between wander moves (jittered)
const HOME_R = 3; // the pack is home this near the lair
const ASSIST = 20; // lairs of the same kind this near join a fight
const REGEN = 0.04; // share of max hp regained per second, returning or idle at home
const FLEE_TICKS = 60; // a fleeing herd runs this long before it heads home
export const GUARD_R = 10; // a guard lair locks the nodes this near
export const RESPAWN = 6000; // ticks (10 min) before a cleared lair may come back
const RESPAWN_RETRY = 100; // ... and between tries while foes stand near it
const RESPAWN_CLEAR = 20; // no foe this near the lair when it comes back
/** Claim channel: ticks (30 s), men of the squad within `at` of the banner, foes within `contest` interrupt; influence radius. */
export const CLAIM = { ticks: 300, men: 3, at: 5, contest: 14, r: 20 };

export interface MobUnit { x: number; y: number; hp: number; maxHp: number; alive: boolean }
export interface MobSquad { id: SquadId; team: number; alive: number; cx: number; cy: number; units: MobUnit[]; order: Order['kind']; target: SquadId; claimPt: number }

/** What the controller needs of the sim. */
export interface MobHost {
  squads: readonly MobSquad[];
  spawn(kind: MobKind, count: number, x: number, y: number): SquadId;
  /** Applied at once (this tick). */
  order(o: Order): void;
  /** The squad has reached the end of its path. */
  arrived(id: SquadId): boolean;
  nodes(): NodeSnap[];
  lockNodes(ids: number[], on: boolean): void;
  claim(team: number, x: number, y: number, r: number): void;
  /** Some team has influence on the tile under (x,y). */
  influenced(x: number, y: number): boolean;
  range(lo: number, hi: number): number;
  w: number; h: number;
}

type LairState = 'home' | 'chase' | 'return' | 'flee';

interface Lair {
  id: number; kind: MobKind; def: MobDef; x: number; y: number; count: number;
  squad: SquadId; state: LairState; cleared: boolean; respawnAt: number; nodes: number[];
  wanderAt: number; fleeUntil: number; hpSeen: number; foe: SquadId;
}

interface Claim { id: number; x: number; y: number; r: number; lairs: number[]; team: number; squad: SquadId; progress: number; contested: boolean }

export function createMobs(region: RegionData, host: MobHost) {
  const lairs: Lair[] = [];
  const claims: Claim[] = (region.claimPoints ?? []).map((c, id) => ({ id, x: c.x, y: c.y, r: c.r ?? CLAIM.r, lairs: [...c.lairs], team: -1, squad: -1, progress: 0, contested: false }));
  let spawned = false;
  let tick = 0;

  const sq = (id: SquadId) => host.squads[id];
  const packHp = (s: MobSquad) => {
    let hp = 0, max = 0;
    for (const u of s.units) if (u.alive) (hp += u.hp), (max += u.maxHp);
    return [hp, max];
  };

  /** Nearest foe (any team but `team`) unit within r of (x,y): [squad id, distance], [-1, Infinity] none. */
  const nearestFoe = (team: number, x: number, y: number, r: number): [SquadId, number] => {
    let best = -1, bd = r * r;
    for (const s of host.squads) {
      if (s.team === team || s.alive === 0 || (s.cx - x) ** 2 + (s.cy - y) ** 2 > (r + 30) ** 2) continue;
      for (const u of s.units) {
        if (!u.alive) continue;
        const d = (u.x - x) ** 2 + (u.y - y) ** 2;
        if (d < bd) (bd = d), (best = s.id);
      }
    }
    return [best, best < 0 ? Infinity : Math.sqrt(bd)];
  };

  const spawnLair = (l: Lair) => {
    l.squad = host.spawn(l.kind, l.count, l.x, l.y);
    if (l.def.base === 'militia') host.order({ kind: 'formation', squad: l.squad, shape: 'loose' });
    l.state = 'home';
    l.cleared = false;
    l.wanderAt = tick + 20 + (l.id * 7) % WANDER_TICKS;
    l.hpSeen = Infinity;
    l.foe = -1;
    if (l.nodes.length) host.lockNodes(l.nodes, true);
  };

  const zoneOf = (l: Lair) => claims.find((c) => c.lairs.includes(l.id));

  const goHome = (l: Lair) => {
    l.state = 'return';
    l.foe = -1;
    host.order({ kind: 'move', squad: l.squad, x: l.x, y: l.y });
  };

  const aggro = (l: Lair, foe: SquadId) => {
    l.foe = foe;
    if (l.def.passive) {
      // run off away from the foe, about half the leash from the lair
      const f = sq(foe), dx = l.x - f.cx, dy = l.y - f.cy, d = Math.hypot(dx, dy) || 1, k = l.def.leash * 0.5;
      const x = Math.min(host.w - 2, Math.max(1, l.x + (dx / d) * k)), y = Math.min(host.h - 2, Math.max(1, l.y + (dy / d) * k));
      l.state = 'flee';
      l.fleeUntil = tick + FLEE_TICKS;
      host.order({ kind: 'move', squad: l.squad, x, y });
      return;
    }
    l.state = 'chase';
    host.order({ kind: 'attack', squad: l.squad, target: foe });
  };

  const heal = (s: MobSquad) => {
    for (const u of s.units) if (u.alive) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * REGEN * 0.1 * AI_EVERY);
  };

  const think = (l: Lair) => {
    const s = sq(l.squad);
    if (s.alive === 0) {
      l.cleared = true;
      l.respawnAt = tick + RESPAWN;
      l.state = 'home';
      if (l.nodes.length) host.lockNodes(l.nodes, false);
      return;
    }
    const dHome = Math.hypot(s.cx - l.x, s.cy - l.y);
    const [hp, max] = packHp(s);
    const hurt = hp < l.hpSeen - 1e-6;
    l.hpSeen = hp;
    if (l.state === 'home') {
      let [foe] = nearestFoe(MOB_TEAM, s.cx, s.cy, l.def.aggro);
      if (foe < 0 && hurt) [foe] = nearestFoe(MOB_TEAM, s.cx, s.cy, l.def.leash * 1.5); // shot at from further off
      if (foe >= 0) {
        aggro(l, foe);
        if (!l.def.passive) for (const o of lairs) if (o !== l && !o.cleared && o.kind === l.kind && o.state === 'home' && Math.hypot(o.x - l.x, o.y - l.y) < ASSIST) aggro(o, foe);
        return;
      }
      if (hp < max) heal(s);
      if (tick >= l.wanderAt) {
        l.wanderAt = tick + Math.round(WANDER_TICKS * host.range(0.6, 1.4));
        host.order({ kind: 'move', squad: l.squad, x: l.x + host.range(-WANDER, WANDER), y: l.y + host.range(-WANDER, WANDER) });
      }
    } else if (l.state === 'chase') {
      const f = l.foe >= 0 ? sq(l.foe) : undefined;
      // past the leash, the foe gone, or a skittish pack bloodied: back to the lair
      if (dHome > l.def.leash || !f || f.alive === 0 || s.order !== 'attack' || (l.def.skittish && hp < max * l.def.skittish)) {
        const [next] = f && f.alive > 0 ? [-1] : nearestFoe(MOB_TEAM, s.cx, s.cy, l.def.aggro);
        if (next >= 0 && dHome <= l.def.leash) aggro(l, next);
        else goHome(l);
      } else if (s.target !== l.foe) l.foe = s.target; // the sim's attack moved on to the nearest foe
    } else if (l.state === 'flee') {
      if (tick >= l.fleeUntil || host.arrived(l.squad)) {
        const [foe] = nearestFoe(MOB_TEAM, s.cx, s.cy, l.def.aggro);
        if (foe >= 0 && tick < l.fleeUntil + FLEE_TICKS * 3) aggro(l, foe);
        else goHome(l);
      }
    } else {
      // return: marching home, no fight, healing
      heal(s);
      if (dHome < HOME_R || host.arrived(l.squad)) {
        l.state = 'home';
        l.hpSeen = Infinity;
        l.wanderAt = tick + WANDER_TICKS;
        host.order({ kind: 'hold', squad: l.squad });
      }
    }
  };

  const respawn = (l: Lair) => {
    if (tick < l.respawnAt) return;
    const z = zoneOf(l);
    if ((z && z.team >= 0) || host.influenced(l.x, l.y)) {
      l.respawnAt = tick + RESPAWN; // claimed ground: it stays clear (checked again later)
      return;
    }
    if (nearestFoe(MOB_TEAM, l.x, l.y, RESPAWN_CLEAR)[0] >= 0) {
      l.respawnAt = tick + RESPAWN_RETRY;
      return;
    }
    spawnLair(l);
  };

  /** Lairs of the zone that still stand (guards only: herds never hold a zone). */
  const zoneOpen = (c: Claim) => c.lairs.every((i) => !lairs[i] || lairs[i].cleared || lairs[i].def.passive);

  const channel = (c: Claim) => {
    const s = c.squad >= 0 ? sq(c.squad) : undefined;
    if (!s || s.alive === 0 || s.claimPt !== c.id || s.order !== 'claimRegion' || c.team >= 0) {
      c.squad = -1;
      c.progress = 0;
      c.contested = false;
      return;
    }
    let men = 0;
    for (const u of s.units) if (u.alive && (u.x - c.x) ** 2 + (u.y - c.y) ** 2 <= CLAIM.at * CLAIM.at) men++;
    if (men < Math.min(CLAIM.men, s.alive)) return; // on the way
    c.contested = nearestFoe(s.team, c.x, c.y, CLAIM.contest)[0] >= 0 || !zoneOpen(c);
    if (c.contested) {
      c.progress = 0;
      return;
    }
    if (++c.progress < CLAIM.ticks) return;
    c.team = s.team;
    c.squad = -1;
    host.claim(s.team, c.x, c.y, c.r);
    host.order({ kind: 'hold', squad: s.id });
  };

  return {
    /** Save and restore (./state.ts). */
    saveRoot: () => ({ lairs, claims, spawned, tick }),
    loadRoot: (o: { spawned: boolean; tick: number }) => void ((spawned = o.spawned), (tick = o.tick)),
    /** Spawn every lair of the region (once). */
    spawn() {
      if (spawned) return;
      spawned = true;
      const nodes = host.nodes();
      (region.lairs ?? []).forEach((d, id) => {
        const def = MOBS[d.kind];
        const guard = def.passive ? [] : nodes.filter((n) => n.obj !== undefined && (n.x - d.x) ** 2 + (n.y - d.y) ** 2 <= GUARD_R * GUARD_R).map((n) => n.id);
        const l: Lair = { id, kind: d.kind, def, x: d.x, y: d.y, count: d.count ?? def.count, squad: -1, state: 'home', cleared: false, respawnAt: 0, nodes: guard, wanderAt: 0, fleeUntil: 0, hpSeen: Infinity, foe: -1 };
        lairs.push(l);
        spawnLair(l);
      });
    },
    /**
     * claimRegion: false (the order is dropped) unless the point exists, is unowned and its zone's guard lairs are all
     * cleared. The sim walks the squad there; channelling starts when it arrives.
     */
    startClaim(squad: SquadId, point: number): boolean {
      const c = claims[point];
      if (!c || c.team >= 0 || !zoneOpen(c)) return false;
      c.squad = squad;
      c.progress = 0;
      c.contested = false;
      return true;
    },
    claimPoint: (i: number) => claims[i],
    tick(t: number) {
      tick = t;
      for (const l of lairs) {
        if (l.cleared) respawn(l);
        else if ((t + l.id) % AI_EVERY === 0) think(l);
      }
      for (const c of claims) channel(c);
    },
    lairSnaps: (): LairSnap[] =>
      lairs.map((l) => {
        const s = l.squad >= 0 ? sq(l.squad) : undefined;
        return {
          id: l.id, kind: l.kind, x: l.x, y: l.y, squad: l.squad, alive: l.cleared ? 0 : (s?.alive ?? 0), count: l.count,
          state: l.cleared ? 'cleared' : l.state, aggro: l.def.aggro, leash: l.def.leash, guard: l.def.passive ? 0 : GUARD_R, nodes: l.nodes.length,
          ...(l.cleared ? { respawnIn: Math.max(0, l.respawnAt - tick) } : {}),
        };
      }),
    claimSnaps: (): ClaimSnap[] =>
      claims.map((c) => ({
        id: c.id, x: c.x, y: c.y, team: c.team, squad: c.squad, progress: c.progress / CLAIM.ticks, lairs: c.lairs,
        state: c.team >= 0 ? 'claimed' : !zoneOpen(c) ? 'locked' : c.squad < 0 ? 'open' : c.contested ? 'contested' : 'channel',
      })),
  };
}
