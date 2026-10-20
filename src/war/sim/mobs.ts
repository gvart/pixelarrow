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
 *
 * M7c depth (./depth.ts, docs/WAR.md "Region lore and depth"): the region's depth scales its mobs' hp and damage, the
 * respawn time and the claim channel: its ticks, the men of the claiming team beside the banner (any of its squads)
 * and how many players they belong to. A bandit host: a lair marked `captain` is led by its captain (the squad's first
 * man, HOST.captain over a bandit) with an elite guard (HOST.guard); while he lives the region is held (its pre-built
 * pieces are the mobs', gates shut), the host's other lairs in his zone stand on the town's towers, and every
 * HOST.raid.every ticks one goes for the nearest foe cart; his zone's claim point opens once he falls. A region boss
 * (M7d, setBoss) holds the region and keeps every claim point shut while it lives.
 */
import type { ClaimSnap, LairSnap, MobKind, NodeSnap, Order, RegionData, SquadId } from '../types';
import type { ClassId } from '../../data/classes';
import { depthRule, HOST } from './depth';

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
  /** M5h: its bite is venomous (scorpion, river serpent, hydra, chimera when they come): ../civilians.ts VENOM. */
  venom?: boolean;
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
export interface MobSquad { id: SquadId; owner: string; team: number; alive: number; cx: number; cy: number; units: MobUnit[]; order: Order['kind']; target: SquadId; claimPt: number }
/** M7c: stat multipliers of a spawned pack (depth, elite guard) and of its first man (a captain). */
export interface SpawnScale { hp: number; dmg: number; lead?: { hp: number; dmg: number } }
/** M7d stub: a region boss as the claim gate sees it (alive: it holds the region and keeps its claim points shut). */
export interface BossGate { id: string; alive: boolean }

/** What the controller needs of the sim. */
export interface MobHost {
  squads: readonly MobSquad[];
  spawn(kind: MobKind, count: number, x: number, y: number, k: SpawnScale): SquadId;
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
  /** M7c: the region is held by its host or boss (true) or not (its pre-built pieces go neutral). */
  held?(on: boolean): void;
  /** M7c: a host's captain fell (by: the team of the squad it fought last, -1 unknown). */
  captainDown?(lair: number, by: number): void;
  /** M7c: towers (pre-built, the mobs') a host lair may stand on: id and centre. */
  towers?(): { id: number; x: number; y: number }[];
  /** M7c: foe carts in the region (raid targets). */
  carts?(): { id: number; x: number; y: number; team: number }[];
}

type LairState = 'home' | 'chase' | 'return' | 'flee' | 'raid';

interface Lair {
  id: number; kind: MobKind; def: MobDef; x: number; y: number; count: number;
  squad: SquadId; state: LairState; cleared: boolean; respawnAt: number; nodes: number[];
  wanderAt: number; fleeUntil: number; hpSeen: number; foe: SquadId;
  /** M7c: a host's captain lair (his man alive), a host lair posted on tower `post` (-1 none), raiding until tick. */
  captain: boolean; capAlive: boolean; post: number; raidUntil: number;
}

interface Claim { id: number; x: number; y: number; r: number; lairs: number[]; team: number; squad: SquadId; progress: number; contested: boolean }

export function createMobs(region: RegionData, host: MobHost) {
  const rule = depthRule(region);
  const lairs: Lair[] = [];
  let boss: BossGate | null = null;
  let held = false;
  let raidAt = HOST.raid.every;
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
    const g = l.captain ? HOST.guard : { hp: 1, dmg: 1 };
    l.squad = host.spawn(l.kind, l.count, l.x, l.y, { hp: rule.mob * g.hp, dmg: rule.mob * g.dmg, ...(l.captain ? { lead: HOST.captain } : {}) });
    l.capAlive = l.captain;
    l.raidUntil = 0;
    if (l.def.base === 'militia') host.order({ kind: 'formation', squad: l.squad, shape: 'loose' });
    l.state = 'home';
    l.cleared = false;
    l.wanderAt = tick + 20 + (l.id * 7) % WANDER_TICKS;
    l.hpSeen = Infinity;
    l.foe = -1;
    if (l.nodes.length) host.lockNodes(l.nodes, true);
    if (l.post >= 0) host.order({ kind: 'move', squad: l.squad, x: l.x, y: l.y }); // up onto its tower
    holding();
  };

  /** The region is held while a host captain or the boss lives. */
  const holding = () => {
    const on = (!!boss && boss.alive) || lairs.some((l) => l.captain && !l.cleared && l.capAlive);
    if (on !== held) {
      held = on;
      host.held?.(on);
    }
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
    if (l.capAlive && !s.units[0]?.alive) {
      l.capAlive = false;
      host.captainDown?.(l.id, l.foe >= 0 ? sq(l.foe).team : -1);
      holding();
    }
    if (s.alive === 0) {
      l.cleared = true;
      l.capAlive = false;
      l.respawnAt = tick + rule.respawn;
      holding();
      l.state = 'home';
      if (l.nodes.length) host.lockNodes(l.nodes, false);
      return;
    }
    const dHome = Math.hypot(s.cx - l.x, s.cy - l.y);
    const [hp, max] = packHp(s);
    const hurt = hp < l.hpSeen - 1e-6;
    l.hpSeen = hp;
    if (l.state === 'raid') {
      // M7c: a host's raid party at a cart: home once it is gone or the raid has run its time
      if (tick >= l.raidUntil || s.order !== 'attackBuilding') goHome(l);
      return;
    }
    if (l.state === 'home') {
      let [foe] = nearestFoe(MOB_TEAM, s.cx, s.cy, l.def.aggro);
      if (foe < 0 && hurt) [foe] = nearestFoe(MOB_TEAM, s.cx, s.cy, l.def.leash * 1.5); // shot at from further off
      if (foe >= 0) {
        aggro(l, foe);
        if (!l.def.passive) for (const o of lairs) if (o !== l && !o.cleared && o.kind === l.kind && o.state === 'home' && Math.hypot(o.x - l.x, o.y - l.y) < ASSIST) aggro(o, foe);
        return;
      }
      if (hp < max) heal(s);
      if (l.post < 0 && tick >= l.wanderAt) {
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
        host.order(l.post >= 0 ? { kind: 'move', squad: l.squad, x: l.x, y: l.y } : { kind: 'hold', squad: l.squad });
      }
    }
  };

  const respawn = (l: Lair) => {
    if (tick < l.respawnAt) return;
    const z = zoneOf(l);
    if ((z && z.team >= 0) || host.influenced(l.x, l.y)) {
      l.respawnAt = tick + rule.respawn; // claimed ground: it stays clear (checked again later)
      return;
    }
    if (nearestFoe(MOB_TEAM, l.x, l.y, RESPAWN_CLEAR)[0] >= 0) {
      l.respawnAt = tick + RESPAWN_RETRY;
      return;
    }
    spawnLair(l);
  };

  /**
   * The zone is open: no boss lives, and its guard lairs are cleared (herds never hold a zone); a zone with a host captain
   * opens once every captain of it has fallen, his guard and the other lairs notwithstanding.
   */
  const zoneOpen = (c: Claim) => {
    if (boss?.alive) return false;
    const caps = c.lairs.filter((i) => lairs[i]?.captain);
    if (caps.length) return caps.every((i) => lairs[i].cleared || !lairs[i].capAlive);
    return c.lairs.every((i) => !lairs[i] || lairs[i].cleared || lairs[i].def.passive);
  };
  /** A squad channelling (or on its way to) claim point c. */
  const claiming = (s: MobSquad | undefined, c: Claim) => !!s && s.alive > 0 && s.claimPt === c.id && s.order === 'claimRegion';

  const channel = (c: Claim) => {
    let s = c.squad >= 0 ? sq(c.squad) : undefined;
    if (c.team < 0 && !claiming(s, c) && s) {
      // the lead fell or went: another squad of its team on the point carries on
      const team = s.team;
      s = host.squads.find((q) => q.team === team && claiming(q, c));
      if (s) c.squad = s.id;
    }
    if (!s || !claiming(s, c) || c.team >= 0) {
      c.squad = -1;
      c.progress = 0;
      c.contested = false;
      return;
    }
    // M7c: the team's men beside the banner (any of its squads), of enough players
    let men = 0, coming = 0;
    const players = new Set<string>();
    for (const q of host.squads) {
      if (q.team !== s.team || q.alive === 0) continue;
      if (claiming(q, c)) coming += q.alive;
      if ((q.cx - c.x) ** 2 + (q.cy - c.y) ** 2 > (CLAIM.at + 12) ** 2) continue;
      let here = 0;
      for (const u of q.units) if (u.alive && (u.x - c.x) ** 2 + (u.y - c.y) ** 2 <= CLAIM.at * CLAIM.at) here++;
      if (here) (men += here), players.add(q.owner);
    }
    if (men < Math.min(rule.claim.men, coming) || players.size < rule.claim.players) return; // on the way, or too few
    c.contested = nearestFoe(s.team, c.x, c.y, CLAIM.contest)[0] >= 0 || !zoneOpen(c);
    if (c.contested) {
      c.progress = 0;
      return;
    }
    if (++c.progress < rule.claim.ticks) return;
    c.team = s.team;
    c.squad = -1;
    host.claim(s.team, c.x, c.y, c.r);
    for (const q of host.squads) if (q.team === s.team && claiming(q, c)) host.order({ kind: 'hold', squad: q.id });
  };

  /** M7c: every HOST.raid.every ticks a host lair (not the captain's) goes for the nearest foe cart in reach. */
  const raid = () => {
    raidAt = tick + HOST.raid.every;
    if (!held || !host.carts) return;
    const carts = host.carts();
    let best: [Lair, number] | null = null, bd = HOST.raid.r ** 2;
    for (const l of lairs) {
      if (l.captain || l.cleared || l.kind !== 'bandit' || l.state !== 'home') continue;
      for (const e of carts) {
        const d = (e.x - l.x) ** 2 + (e.y - l.y) ** 2;
        if (d < bd) (bd = d), (best = [l, e.id]);
      }
    }
    if (!best) return;
    const [l, cart] = best;
    l.state = 'raid';
    l.raidUntil = tick + HOST.raid.every / 3;
    host.order({ kind: 'attackBuilding', squad: l.squad, siege: cart });
  };

  return {
    /** Save and restore (./state.ts). */
    saveRoot: () => ({ lairs, claims, spawned, tick, boss, held, raidAt }),
    loadRoot: (o: { spawned: boolean; tick: number; boss: BossGate | null; held: boolean; raidAt: number }) => void ((spawned = o.spawned), (tick = o.tick), (boss = o.boss), (held = o.held), (raidAt = o.raidAt)),
    /** M7d stub: the region boss (null: none); while it lives the region is held and its claim points stay shut. */
    setBoss(id: string | null) {
      boss = id ? { id, alive: true } : null;
      holding();
    },
    /** M7d stub: the boss fell; the claim points may open. */
    bossDown() {
      if (boss) boss.alive = false;
      holding();
    },
    boss: () => boss,
    /** The region is held by its host or boss. */
    held: () => held,
    rule,
    /** Spawn every lair of the region (once). */
    spawn() {
      if (spawned) return;
      spawned = true;
      const nodes = host.nodes();
      (region.lairs ?? []).forEach((d, id) => {
        const def = MOBS[d.kind];
        const guard = def.passive ? [] : nodes.filter((n) => n.obj !== undefined && (n.x - d.x) ** 2 + (n.y - d.y) ** 2 <= GUARD_R * GUARD_R).map((n) => n.id);
        const captain = !!d.captain && d.kind === 'bandit';
        const l: Lair = { id, kind: d.kind, def, x: d.x, y: d.y, count: d.count ?? (captain ? 12 : def.count), squad: -1, state: 'home', cleared: false, respawnAt: 0, nodes: guard, wanderAt: 0, fleeUntil: 0, hpSeen: Infinity, foe: -1, captain, capAlive: false, post: -1, raidUntil: 0 };
        lairs.push(l);
      });
      // M7c: the host's other bandit lairs of a captain's zone stand on its towers, nearest first
      const towers = lairs.some((l) => l.captain) ? (host.towers?.() ?? []) : [];
      const taken = new Set<number>();
      for (const c of claims) {
        if (!c.lairs.some((i) => lairs[i]?.captain)) continue;
        for (const i of c.lairs) {
          const l = lairs[i];
          if (!l || l.captain || l.kind !== 'bandit') continue;
          let best = -1, bd = Infinity;
          for (const [k, t] of towers.entries()) {
            const d = (t.x - l.x) ** 2 + (t.y - l.y) ** 2;
            if (!taken.has(k) && d < bd) (bd = d), (best = k);
          }
          if (best < 0) continue;
          taken.add(best);
          l.post = towers[best].id;
          l.x = towers[best].x;
          l.y = towers[best].y;
        }
      }
      for (const l of lairs) spawnLair(l);
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
      if (t >= raidAt) raid();
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
          state: l.cleared ? 'cleared' : l.state === 'raid' ? 'chase' : l.state, aggro: l.def.aggro, leash: l.def.leash, guard: l.def.passive ? 0 : GUARD_R, nodes: l.nodes.length,
          ...(l.captain ? { captain: l.capAlive } : {}),
          ...(l.cleared ? { respawnIn: Math.max(0, l.respawnAt - tick) } : {}),
        };
      }),
    claimSnaps: (): ClaimSnap[] =>
      claims.map((c) => ({
        id: c.id, x: c.x, y: c.y, team: c.team, squad: c.squad, progress: c.progress / rule.claim.ticks, lairs: c.lairs, men: rule.claim.men, players: rule.claim.players,
        state: c.team >= 0 ? 'claimed' : !zoneOpen(c) ? 'locked' : c.squad < 0 ? 'open' : c.contested ? 'contested' : 'channel',
      })),
  };
}
