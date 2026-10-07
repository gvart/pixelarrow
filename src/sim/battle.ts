/**
 * Deterministic real-time battle simulation.
 *
 * - Fixed timestep (TICK_RATE ticks per second), seeded RNG, no Math.random,
 *   no trigonometry (facings are unit vectors), arrays iterated in id order.
 * - Same setup + same orders at the same ticks => identical outcome.
 * - Knows nothing about rendering; the renderer reads state and drains events.
 */
import { Rng } from './rng';
import {
  assignSlots,
  formationSlots,
  presetFrontage,
  rightOf,
  type Formation,
  type FormationType,
} from './formation';
import type {
  BattleResult,
  BattleSetup,
  GroupRole,
  HitDir,
  LoggedOrder,
  Order,
  Projectile,
  ProjectileKind,
  Side,
  SimEvent,
  SimGroup,
  SimUnit,
} from './types';
import { BotAI } from './ai';
import { ABILITIES, ABILITY_RULES, AURAS, AURA_IDS, AURA_RULES, type AbilityId } from '../data/perks';
import { rallyRadius, willRadius, type CombatStats } from './stats';
import { Terrain, cellHash } from './terrain';
import { HEIGHT_RULES, TERRAIN, type TerrainDef } from '../data/terrain';
import { MOUNTS, type MountDef } from '../data/classes';

export const TICK_RATE = 20;
/** Running speed of a man (charging), as a multiple of his walk. */
const BASE_RUN = 1.75;
export const DT = 1 / TICK_RATE;
export const UNIT_RADIUS = 0.3;

export const RULES = {
  meleeHit: 0.55,
  dirDamage: { front: 1, side: 1.3, rear: 1.6 } as Record<HitDir, number>,
  dirMorale: { front: 1, side: 1.8, rear: 2.8 } as Record<HitDir, number>,
  sideBlockFactor: 0.35,
  shieldWallBlock: 0.15,
  shieldWallSpeed: 0.5,
  missileBlockFactor: 1.25,
  armorK: 12,
  moraleFromDamage: 0.5,
  /** Rout below this fraction of max morale; rally above rallyFraction. */
  routFraction: 0.25,
  rallyFraction: 0.55,
  allyDeathMorale: 6,
  allyRoutMorale: 5,
  enemyDeathMorale: 3,
  cascadeRadius: 5,
  chargeMomentumTicks: 16,
  chargeImpact: 1.4,
  routingDamage: 1.4,
  lowStamina: 30,
  /** Global damage multiplier (melee and missiles): sets the pace of battles. */
  damageScale: 0.34,
  /** A charge that lands on a braced, frontal shield wall: damage factor, attacker stun (ticks). */
  bracedImpact: 0.35,
  bracedBounceStun: 10,
  /** Extra damage factor for braced spearmen hitting a man who is still charging. */
  braceSpearBonus: 6,
  /**
   * Retreat: chance that a man is cut down while the army leaves the field,
   * multiplied by the enemy's pursuit (0..1). Routing men and men locked in
   * melee are the ones caught; the rest get away.
   */
  retreatRoutDeath: 0.6,
  retreatContactDeath: 0.35,
  retreatWoundedExtra: 0.15,
};

/**
 * Riders, chariots and animals (unit classes). Only units with a `mount` or
 * `kind: 'animal'` in their stats use these, so battles without them play
 * exactly as before.
 */
export const MOUNTED_RULES = {
  /** A rider delivers a charge impact at or above this fraction of his gallop. */
  chargeSpeed: 0.55,
  /** Speed kept after a charge impact (the rest is spent on the man struck). */
  impactKeep: 0.4,
  /** Extra damage and morale shock of a mounted charge on a flank / the rear. */
  flankImpact: 1.3,
  flankShock: 1.0,
  /** Stun and shove of a man struck by a charging horse. */
  impactStun: 14,
  impactShove: 0.5,
  /** A charge into braced spears: the horse balks and the rider takes the spear. */
  balkStun: 32,
  balkMorale: 10,
  balkCounter: 2.2,
  bracedImpact: 0.25,
  /** Morale lost by a man ridden into (and 40% of it by those around him). */
  terror: 8,
  /** Morale per half second lost by a man on foot with each horse within 2.5 paces (x2 for missile-men; spear walls are immune). */
  horseDread: 0.5,
  /** Charge impact on a man with no shield. */
  unshielded: 1.4,
  /** Melee damage from the saddle against men on foot. */
  saddle: 1.2,
  /** Spearmen thrusting at a horse (a big target) do this much more. */
  spearVsHorse: 1.35,
  /** A rider striking at a braced spear wall from the front: hit chance lost (the horse shies). */
  shyHit: 0.2,
  /** Riders cut down routing men: damage multiplier (plus the Ride Down perk). */
  rideDown: 1.5,
  /** Horse archers: scatter multiplier when shooting at speed. */
  movingScatter: 1.3,
  /** Animals: hunt anything within this range (or once the pack is fighting). */
  aggro: 9,
  /** Wounds shake an animal less than a man (pain makes it fight harder, until it bolts). */
  beastPain: 0.6,
  /** Bears knock men down. */
  bearStun: 10,
  /** Shove weights: how much a rider / chariot gives way to a man on foot. */
  riderWeight: 0.3,
  chariotWeight: 0.15,
};

export type Phase = 'deploy' | 'battle' | 'ended';

export class Battle {
  readonly width: number;
  readonly height: number;
  readonly timeLimitTicks: number;
  readonly seed: number;
  /** Battlefield terrain; null = an open, flat plain (setups from before terrain existed). */
  readonly terrain: Terrain | null;
  rng: Rng;
  tick = 0;
  phase: Phase = 'deploy';
  units: SimUnit[] = [];
  groups: SimGroup[] = [];
  projectiles: Projectile[] = [];
  events: SimEvent[] = [];
  orderLog: LoggedOrder[] = [];
  winner: Side | -1 | null = null;
  retreated: Side | null = null;
  private queue: { side: Side; order: Order }[] = [];
  private nextProjId = 1;
  private bots: BotAI[] = [];
  private firstContact: [boolean, boolean] = [false, false];
  /** Some unit is not a man-sized disc (riders, chariots, bears): per-unit radii apply. */
  readonly big: boolean;
  /** Riders or animals take part (the bot then uses its cavalry / beast tactics). */
  readonly special: boolean;

  constructor(setup: BattleSetup) {
    this.seed = setup.seed >>> 0;
    this.rng = new Rng(this.seed);
    this.width = setup.width ?? 24;
    this.height = setup.height ?? 36;
    this.timeLimitTicks = (setup.timeLimit ?? 300) * TICK_RATE;
    this.terrain = setup.terrain && typeof setup.terrain.cells === 'string' ? new Terrain(setup.terrain, this.width, this.height) : null;
    const allStats = setup.armies.flatMap((a) => a.units.map((u) => u.stats));
    this.special = allStats.some((st) => (st.mount !== undefined && st.mount in MOUNTS) || st.kind === 'animal');
    this.big = allStats.some((st) => typeof st.radius === 'number' && st.radius !== UNIT_RADIUS && st.radius > 0.05 && st.radius < 2);

    setup.armies.forEach((army, sideIdx) => {
      const side = sideIdx as Side;
      const base = this.groups.length;
      army.groups.forEach((gs) => {
        const fy = side === 0 ? -1 : 1;
        this.groups.push({
          id: this.groups.length,
          side,
          name: gs.name,
          role: gs.role,
          order: 'hold',
          formation: { type: gs.formation, cx: this.width / 2, cy: this.height / 2, fx: 0, fy, frontage: 4 },
          shieldWall: gs.formation === 'shieldwall',
          fireAtWill: true,
          fallbackLeft: 0,
          contact: false,
          lastFlankEvent: -10000,
          routed: false,
          individual: false,
          disbanded: false,
        });
      });
      army.units.forEach((spec) => {
        const g = base + Math.max(0, Math.min(army.groups.length - 1, spec.group));
        // Setups from older clients (or the server) may lack the progression fields.
        const s: CombatStats = {
          ...spec.stats,
          abilities: spec.stats.abilities ?? [],
          auras: spec.stats.auras ?? [],
          koChance: spec.stats.koChance ?? 0,
          will: spec.stats.will ?? 5,
          cdMult: spec.stats.cdMult ?? 1,
          bloodlust: spec.stats.bloodlust ?? false,
        };
        // Unknown mounts or animal kinds (newer clients) fall back to a man on foot.
        if (s.mount !== undefined && !(s.mount in MOUNTS)) delete s.mount;
        if (s.kind !== undefined && s.kind !== 'animal') delete s.kind;
        this.units.push({
          id: this.units.length,
          heroId: spec.heroId,
          name: spec.name,
          level: spec.level,
          side,
          group: g,
          homeGroup: g,
          stats: s,
          x: this.width / 2,
          y: this.height / 2,
          vx: 0,
          vy: 0,
          fx: 0,
          fy: side === 0 ? -1 : 1,
          hp: s.maxHp,
          morale: s.morale,
          stamina: s.stamina,
          ammo: s.ammo,
          state: 'ready',
          slotLat: 0,
          slotDep: 0,
          cooldown: 0,
          targetId: -1,
          engaged: false,
          momentum: 0,
          stun: 0,
          lastAttackTick: -1000,
          lastHitTick: -1000,
          lastBlockTick: -1000,
          lastShotTick: -1000,
          kills: 0,
          dmgDealt: 0,
          killedBy: -1,
          wear: { weapon: 0, shield: 0, helmet: 0, armor: 0 },
          ko: false,
          abil: [...s.abilities],
          abilCd: s.abilities.map(() => 0),
          berserk: 0,
          daze: 0,
          aura: 0,
          rad: typeof s.radius === 'number' && s.radius > 0.05 && s.radius < 2 ? s.radius : UNIT_RADIUS,
          spd: 0,
          lastScytheTick: -1000,
        });
      });
      // Javelin groups keep their throws until ordered; pure missile groups loose at will.
      for (const g of this.groups) {
        if (g.side !== side) continue;
        const mem = this.members(g.id);
        const hybrids = mem.filter((u) => u.stats.role === 'hybrid').length;
        const ranged = mem.filter((u) => u.stats.role === 'ranged').length;
        g.fireAtWill = g.role === 'skirmish' || ranged >= hybrids;
      }
      if (this.units.some((u) => u.side === side && (u.stats.mount || u.stats.kind))) {
        for (const g of this.groups) if (g.side === side) this.spaceFor(g);
      }
      this.autoDeploy(side);
      if (army.bot) {
        const bot = new BotAI(side, this.seed ^ (0x5bd1e995 * (side + 1)));
        this.bots.push(bot);
        bot.deploy(this);
      }
    });
  }

  // ------------------------------------------------------------------ queries

  members(groupId: number): SimUnit[] {
    return this.units.filter((u) => u.group === groupId);
  }

  activeMembers(groupId: number): SimUnit[] {
    return this.units.filter((u) => u.group === groupId && u.state === 'ready');
  }

  sideGroups(side: Side): SimGroup[] {
    return this.groups.filter((g) => g.side === side && !g.disbanded);
  }

  isAlive(u: SimUnit): boolean {
    return u.state === 'ready' || u.state === 'routing';
  }

  // ------------------------------------------------------------------ terrain

  /** Terrain under a field position (open ground without a terrain grid). */
  ground(x: number, y: number): TerrainDef {
    return this.terrain ? this.terrain.at(x, y) : TERRAIN.open;
  }

  /** Height level under a field position (0 without a terrain grid). */
  heightAt(x: number, y: number): number {
    return this.terrain ? this.terrain.heightAt(x, y) : 0;
  }

  /** Height advantage of a over b in levels, capped at HEIGHT_RULES.maxDiff either way. */
  heightDiff(ax: number, ay: number, bx: number, by: number): number {
    if (!this.terrain) return 0;
    const d = this.terrain.heightAt(ax, ay) - this.terrain.heightAt(bx, by);
    return clamp(d, -HEIGHT_RULES.maxDiff, HEIGHT_RULES.maxDiff);
  }

  /** Movement multiplier of the ground a unit stands on (horses and chariots suffer more in rough ground). */
  private groundSpeed(u: SimUnit): number {
    if (!this.terrain) return 1;
    const d = this.terrain.at(u.x, u.y);
    if (d.blocked) return 1;
    if (u.stats.mount) return u.stats.mount === 'chariot' ? d.chariotSpeed : d.cavSpeed;
    return d.speed;
  }

  /** Riders and animals need more room between files and ranks than men on foot. */
  spaceFor(g: SimGroup): void {
    const mem = this.units.filter((u) => u.group === g.id);
    let fs = 1;
    let rs = 1;
    for (const u of mem) {
      if (u.stats.mount === 'chariot') {
        fs = Math.max(fs, 2.1);
        rs = Math.max(rs, 3.0);
      } else if (u.stats.mount) {
        fs = Math.max(fs, 1.45);
        rs = Math.max(rs, 2.0);
      } else if (u.stats.kind === 'animal') {
        fs = Math.max(fs, u.rad > 0.45 ? 1.8 : 1.2);
        rs = Math.max(rs, u.rad > 0.45 ? 1.8 : 1.3);
      }
    }
    if (fs === 1 && rs === 1) return;
    g.formation.fs = fs;
    g.formation.rs = rs;
  }

  /** Whether a unit rides (horse or chariot). */
  mountOf(u: SimUnit): MountDef | null {
    return u.stats.mount ? MOUNTS[u.stats.mount] : null;
  }

  /** A rider's top speed (galloping) on the ground he is on. */
  gallopSpeed(u: SimUnit): number {
    const m = this.mountOf(u);
    return m ? u.stats.speed * m.gallop : u.stats.speed * BASE_RUN;
  }

  /** Whether a shield wall holds together where this unit stands. */
  private wallGround(u: SimUnit): boolean {
    return !this.terrain || !this.terrain.at(u.x, u.y).noWall;
  }

  /** Extra missile range against a target below the shooter ("better sight"). */
  rangeBonus(s: SimUnit, t: SimUnit): number {
    if (!this.terrain) return 0;
    const d = this.heightDiff(s.x, s.y, t.x, t.y);
    return d > 0 ? d * HEIGHT_RULES.rangeDown : 0;
  }

  /** Nearest free point to (x, y) outside blocked cells (deterministic search). */
  freePoint(x: number, y: number): { x: number; y: number } {
    const t = this.terrain;
    if (!t || !t.blocked(x, y)) return { x, y };
    for (let r = 0.5; r <= 4; r += 0.5) {
      for (const [dx, dy] of DIRS8) {
        const nx = clamp(x + dx * r, UNIT_RADIUS, this.width - UNIT_RADIUS);
        const ny = clamp(y + dy * r, UNIT_RADIUS, this.height - UNIT_RADIUS);
        if (!t.blocked(nx, ny)) return { x: nx, y: ny };
      }
    }
    return { x, y };
  }

  /**
   * Move a unit by (dx, dy), sliding along rocks and the shoreline: if the
   * step would end in a blocked cell, try each axis alone, then the step
   * turned 60 degrees either way (preferring a side by unit id).
   */
  private moveUnit(u: SimUnit, dx: number, dy: number): void {
    const t = this.terrain;
    if (!t) {
      u.x += dx;
      u.y += dy;
      return;
    }
    const tryAt = (mx: number, my: number): boolean => {
      if (mx === 0 && my === 0) return false;
      if (t.blocked(u.x + mx, u.y + my)) return false;
      u.x += mx;
      u.y += my;
      u.vx = mx;
      u.vy = my;
      return true;
    };
    if (tryAt(dx, dy)) return;
    const l = Math.sqrt(dx * dx + dy * dy);
    if (Math.abs(dx) > Math.abs(dy)) {
      if (tryAt(dx >= 0 ? l : -l, 0) || tryAt(0, dy >= 0 ? l * 0.5 : -l * 0.5)) return;
    } else if (tryAt(0, dy >= 0 ? l : -l) || tryAt(dx >= 0 ? l * 0.5 : -l * 0.5, 0)) return;
    const s = u.id % 2 === 0 ? 1 : -1;
    for (const k of [s, -s]) {
      // rotate by +-60 degrees (cos 0.5, sin 0.866) without trigonometry
      const rx = dx * 0.5 - dy * SIN60 * k;
      const ry = dx * SIN60 * k + dy * 0.5;
      if (tryAt(rx, ry)) return;
    }
    u.vx = 0;
    u.vy = 0;
  }

  deployZone(side: Side): { y0: number; y1: number } {
    return side === 0 ? { y0: this.height * 0.62, y1: this.height - 0.8 } : { y0: 0.8, y1: this.height * 0.38 };
  }

  slotPos(u: SimUnit): { x: number; y: number } {
    const f = this.groups[u.group].formation;
    const r = rightOf(f.fx, f.fy);
    let x = f.cx + r.x * u.slotLat - f.fx * u.slotDep;
    let y = f.cy + r.y * u.slotLat - f.fy * u.slotDep;
    const t = this.terrain;
    if (t) {
      // Trees, water and stones break up the ranks: each man finds his own footing.
      const i = t.index(x, y);
      const d = t.cellDef(i);
      if (d.scatter > 0) {
        x += (cellHash(u.id, i) - 0.5) * 2 * d.scatter;
        y += (cellHash(i, u.id + 7919) - 0.5) * 2 * d.scatter;
      }
      if (t.blocked(x, y)) return this.freePoint(x, y);
    }
    return { x, y };
  }

  /** Slot positions of a group, for drawing placement boxes. */
  groupSlots(groupId: number): { x: number; y: number }[] {
    return this.activeMembers(groupId).map((u) => this.slotPos(u));
  }

  sideStrength(side: Side): number {
    let s = 0;
    for (const u of this.units) if (u.side === side && u.state === 'ready') s += u.hp;
    return s;
  }

  // ------------------------------------------------------------------- orders

  /**
   * Apply an order now, between steps (or during a bot's think inside a step).
   * Orders are logged with the current tick; replaying the same orders at the
   * same ticks reproduces the battle exactly. A networked (lockstep) version
   * would use `schedule()` to apply both players' orders at an agreed future tick.
   */
  issue(side: Side, order: Order): void {
    if (this.phase === 'ended') return;
    this.orderLog.push({ tick: this.tick, side, order });
    this.applyOrder(side, order);
  }

  /** Schedule an order for the start of a future step (lockstep-friendly). */
  schedule(side: Side, order: Order): void {
    if (this.phase === 'ended') return;
    this.queue.push({ side, order });
  }

  startBattle(): void {
    if (this.phase !== 'deploy') return;
    this.phase = 'battle';
    for (const g of this.groups) this.reassign(g.id);
  }

  private applyOrder(side: Side, o: Order): void {
    const groupOk = (id: number) => id >= 0 && id < this.groups.length && this.groups[id].side === side && !this.groups[id].disbanded;
    switch (o.kind) {
      case 'form': {
        if (!groupOk(o.group)) return;
        const g = this.groups[o.group];
        let fx = o.fx;
        let fy = o.fy;
        const len = Math.sqrt(fx * fx + fy * fy);
        if (len < 1e-6) {
          fx = g.formation.fx;
          fy = g.formation.fy;
        } else {
          fx /= len;
          fy /= len;
        }
        const type = o.type ?? g.formation.type;
        const n = Math.max(1, this.activeMembers(g.id).length);
        const prevF = g.formation;
        g.formation = {
          type,
          cx: clamp(o.cx, 0.5, this.width - 0.5),
          cy: clamp(o.cy, 0.5, this.height - 0.5),
          fx,
          fy,
          frontage: Math.max(1, Math.min(n, Math.round(o.frontage))),
        };
        if (prevF.fs !== undefined) {
          g.formation.fs = prevF.fs;
          g.formation.rs = prevF.rs;
        }
        if (o.type) g.shieldWall = o.type === 'shieldwall';
        if (this.phase === 'deploy') {
          const z = this.deployZone(side);
          g.formation.cy = clamp(g.formation.cy, z.y0, z.y1);
        }
        if (g.order !== 'hold') g.order = 'hold';
        g.fallbackLeft = 0;
        this.reassign(g.id);
        if (this.phase === 'deploy') this.snapToSlots(g.id);
        return;
      }
      case 'preset': {
        if (!groupOk(o.group)) return;
        const g = this.groups[o.group];
        const n = Math.max(1, this.activeMembers(g.id).length);
        g.formation = { ...g.formation, type: o.type, frontage: presetFrontage(o.type, n) };
        g.shieldWall = o.type === 'shieldwall';
        this.reassign(g.id);
        if (this.phase === 'deploy') {
          this.clampFormationToDeploy(g);
          this.snapToSlots(g.id);
        }
        return;
      }
      case 'order': {
        if (!groupOk(o.group)) return;
        const g = this.groups[o.group];
        g.order = o.order;
        if (o.order === 'fallback') g.fallbackLeft = 5;
        if (o.order === 'charge' || o.order === 'fallback') g.shieldWall = false;
        if (o.order === 'charge') {
          // Charging javelin-men throw on the way in.
          for (const u of this.activeMembers(g.id)) if (u.stats.role === 'hybrid' && u.ammo > 0) g.fireAtWill = true;
        }
        return;
      }
      case 'shieldwall': {
        if (!groupOk(o.group)) return;
        const g = this.groups[o.group];
        g.shieldWall = o.on ?? !g.shieldWall;
        if (g.shieldWall && g.order === 'charge') g.order = 'hold';
        return;
      }
      case 'loose': {
        if (!groupOk(o.group)) return;
        const g = this.groups[o.group];
        g.fireAtWill = o.on ?? !g.fireAtWill;
        return;
      }
      case 'detach': {
        const u = this.units[o.unit];
        if (!u || u.side !== side || u.state !== 'ready') return;
        if (this.groups[u.group].individual) return;
        const id = this.groups.length;
        const src = this.groups[u.group];
        this.groups.push({
          id,
          side,
          name: u.name,
          role: src.role,
          order: 'hold',
          formation: { type: 'line', cx: u.x, cy: u.y, fx: u.fx, fy: u.fy, frontage: 1 },
          shieldWall: false,
          fireAtWill: src.fireAtWill || u.stats.role !== 'melee',
          fallbackLeft: 0,
          contact: src.contact,
          lastFlankEvent: -10000,
          routed: false,
          individual: true,
          disbanded: false,
        });
        u.homeGroup = u.group;
        u.group = id;
        u.slotLat = 0;
        u.slotDep = 0;
        this.reassign(u.homeGroup);
        return;
      }
      case 'rejoin': {
        const u = this.units[o.unit];
        if (!u || u.side !== side) return;
        const g = this.groups[u.group];
        if (!g.individual) return;
        g.disbanded = true;
        u.group = u.homeGroup;
        this.reassign(u.group);
        return;
      }
      case 'retreat':
        this.retreat(side);
        return;
      case 'ability': {
        const u = this.units[o.unit];
        if (!u || u.side !== side) return;
        const i = u.abil.indexOf(o.ability);
        if (i < 0 || !this.abilityReady(u, o.ability)) return;
        if (!this.useAbility(u, o.ability)) return;
        u.abilCd[i] = Math.round(ABILITIES[o.ability].cooldown * TICK_RATE * u.stats.cdMult);
        return;
      }
      case 'assign': {
        if (this.phase !== 'deploy') return;
        const u = this.units[o.unit];
        if (!u || u.side !== side || !groupOk(o.group)) return;
        const old = u.group;
        u.group = o.group;
        u.homeGroup = o.group;
        for (const gid of [old, o.group]) {
          const g = this.groups[gid];
          const n = Math.max(1, this.activeMembers(gid).length);
          g.formation.frontage = presetFrontage(g.formation.type, n);
          this.reassign(gid);
          this.snapToSlots(gid);
        }
        return;
      }
    }
  }

  // ---------------------------------------------------------------- abilities

  /** Remaining cooldown of an ability in ticks (-1 if the unit does not have it). */
  abilityCooldown(u: SimUnit, id: AbilityId): number {
    const i = u.abil.indexOf(id);
    return i < 0 ? -1 : u.abilCd[i];
  }

  /** Whether the ability can be used right now (off cooldown, able, and with a target if it needs one). */
  abilityReady(u: SimUnit, id: AbilityId): boolean {
    if (this.phase !== 'battle' || u.state !== 'ready' || u.stun > 0) return false;
    const i = u.abil.indexOf(id);
    if (i < 0 || u.abilCd[i] > 0) return false;
    switch (id) {
      case 'bash':
        return u.stats.shield !== 'none' && this.bashTarget(u) !== null;
      case 'volley':
        return this.volleyShooters(u).length > 0;
      case 'berserk':
        return u.berserk <= 0;
      case 'rally':
        return true;
    }
  }

  /** The enemy a shield bash would hit: a ready man close in front. */
  bashTarget(u: SimUnit): SimUnit | null {
    const range = ABILITY_RULES.bashRange + UNIT_RADIUS * 2;
    let best: SimUnit | null = null;
    let bestScore = -Infinity;
    for (const e of this.units) {
      if (e.side === u.side || e.state !== 'ready') continue;
      const d = Math.sqrt((e.x - u.x) ** 2 + (e.y - u.y) ** 2);
      if (d > range) continue;
      const front = this.facingDot(u, e);
      if (front < 0.3) continue;
      const score = front - d + (e.id === u.targetId ? 0.5 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  /** Missile-men who would loose in a volley called by u, each with a target in range. */
  volleyShooters(u: SimUnit): { s: SimUnit; t: SimUnit }[] {
    const out: { s: SimUnit; t: SimUnit }[] = [];
    const r2 = ABILITY_RULES.volleyRadius ** 2;
    for (const s of this.units) {
      if (s.side !== u.side || s.state !== 'ready' || s.ammo <= 0 || s.stats.range <= 0 || s.stun > 0) continue;
      if ((s.x - u.x) ** 2 + (s.y - u.y) ** 2 > r2) continue;
      let t: SimUnit | null = null;
      let td = Infinity;
      for (const e of this.units) {
        if (e.side === s.side || e.state !== 'ready') continue;
        const d = Math.sqrt((e.x - s.x) ** 2 + (e.y - s.y) ** 2);
        if (d <= s.stats.range + this.rangeBonus(s, e) && d > 1.4 && d < td) {
          td = d;
          t = e;
        }
      }
      if (t) out.push({ s, t });
    }
    return out;
  }

  private useAbility(u: SimUnit, id: AbilityId): boolean {
    const R = ABILITY_RULES;
    const targets: number[] = [];
    switch (id) {
      case 'bash': {
        const t = this.bashTarget(u);
        if (!t) return false;
        const dir = this.hitDirection(t, u.x, u.y);
        u.stamina = Math.max(0, u.stamina - 6);
        u.lastAttackTick = this.tick;
        u.cooldown = Math.max(u.cooldown, 10);
        t.stun = Math.max(t.stun, R.bashStun);
        t.daze = Math.max(t.daze, R.bashDaze);
        t.momentum = 0;
        t.morale -= R.bashMorale * this.ml(t);
        // shove him back half a pace
        const dx = t.x - u.x;
        const dy = t.y - u.y;
        const l = Math.sqrt(dx * dx + dy * dy) || 1;
        const sx = clamp(t.x + (dx / l) * 0.5, UNIT_RADIUS, this.width - UNIT_RADIUS);
        const sy = clamp(t.y + (dy / l) * 0.5, UNIT_RADIUS, this.height - UNIT_RADIUS);
        if (!this.terrain || !this.terrain.blocked(sx, sy)) {
          t.x = sx;
          t.y = sy;
        }
        targets.push(t.id);
        this.events.push({ type: 'ability', tick: this.tick, unit: u.id, ability: id, targets });
        this.contactEvent(this.groups[u.group]);
        this.applyDamage(t, u, R.bashDamage + u.stats.dmg * 0.4, dir, false, 1.5);
        return true;
      }
      case 'volley': {
        const shooters = this.volleyShooters(u);
        if (shooters.length === 0) return false;
        for (const { s, t } of shooters) {
          for (let k = 0; k < R.volleyShots; k++) {
            this.shoot(s, t, R.volleyDamage, R.volleyAccuracy);
            s.ammo++; // the volley comes from a reserve sheaf: no ammunition spent
          }
          targets.push(s.id);
        }
        break;
      }
      case 'berserk':
        if (u.berserk > 0) return false;
        u.berserk = R.berserkTicks;
        u.morale = Math.max(u.morale, u.stats.morale * 0.6);
        targets.push(u.id);
        break;
      case 'rally': {
        const r2 = rallyRadius(u.stats) ** 2;
        for (const a of this.units) {
          if (a.side !== u.side || !this.isAlive(a)) continue;
          if ((a.x - u.x) ** 2 + (a.y - u.y) ** 2 > r2) continue;
          if (a.state === 'routing') {
            a.state = 'ready';
            a.momentum = 0;
            a.morale = Math.max(a.morale, a.stats.morale * (RULES.rallyFraction + 0.1));
            this.events.push({ type: 'rally', tick: this.tick, unit: a.id });
            this.reassign(a.group);
          } else {
            a.morale = Math.min(a.stats.morale + 10, a.morale + a.stats.morale * R.rallyMorale);
          }
          a.stamina = Math.min(a.stats.stamina, a.stamina + 8);
          targets.push(a.id);
        }
        break;
      }
    }
    this.events.push({ type: 'ability', tick: this.tick, unit: u.id, ability: id, targets });
    return true;
  }

  /** Recompute which auras touch which units (every half second). */
  private updateAuras(): void {
    for (const u of this.units) u.aura = 0;
    for (const src of this.units) {
      if (src.state !== 'ready' || src.stats.auras.length === 0) continue;
      for (const id of AURA_IDS) {
        if (!src.stats.auras.includes(id)) continue;
        const def = AURAS[id];
        const r2 = (def.radius + willRadius(src.stats)) ** 2;
        for (const a of this.units) {
          if (a.side !== src.side || a.state !== 'ready') continue;
          if ((a.x - src.x) ** 2 + (a.y - src.y) ** 2 <= r2) a.aura |= def.bit;
        }
      }
    }
  }

  /** Morale damage multiplier for a unit (traits, perks, Will, Steady Presence). */
  private ml(u: SimUnit): number {
    return u.stats.moraleLoss * (u.aura & AURAS.steady.bit ? AURA_RULES.steadyMoraleLoss : 1);
  }

  /**
   * Enemy pursuit strength against a retreating side, 0..1: the enemy's men
   * still in the fight (weighted by stamina: tired men pursue badly) against
   * the size of the retreating army plus its men free to cover the withdrawal.
   * Equal fresh armies, nobody engaged: 0.5. A broken army before a fresh one: 1.
   */
  pursuit(side: Side): number {
    let chase = 0;
    let alive = 0;
    let cover = 0;
    for (const u of this.units) {
      if (u.side !== side) {
        if (u.state === 'ready') chase += 0.5 + 0.5 * (u.stamina / Math.max(1, u.stats.stamina));
        continue;
      }
      if (!this.isAlive(u)) continue;
      alive++;
      if (u.state === 'ready' && !u.engaged) cover++;
    }
    return alive === 0 ? 0 : clamp(chase / (alive + cover), 0, 1);
  }

  /** Whether a soldier is locked in melee: engaged, or a ready enemy within arm's reach. */
  private inContact(u: SimUnit): boolean {
    if (u.engaged) return true;
    for (const e of this.units) {
      if (e.side === u.side || e.state !== 'ready') continue;
      if ((e.x - u.x) ** 2 + (e.y - u.y) ** 2 <= (e.stats.reach + UNIT_RADIUS * 2) ** 2) return true;
    }
    return false;
  }

  /**
   * The whole side withdraws. The battle ends at once as that side's defeat.
   * Each routing or engaged man is cut down with a chance scaled by the enemy's
   * pursuit (wounded men more often); everyone else leaves the field alive.
   * Nobody is credited with these kills, so they drop no loot.
   */
  private retreat(side: Side): void {
    if (this.phase !== 'battle') return;
    const other: Side = side === 0 ? 1 : 0;
    const pursuit = this.pursuit(side);
    let caught = 0;
    for (const u of this.units) {
      if (u.side !== side || !this.isAlive(u)) continue;
      let p = 0;
      if (u.state === 'routing') p = RULES.retreatRoutDeath;
      else if (this.inContact(u)) p = RULES.retreatContactDeath;
      if (p > 0 && u.hp < u.stats.maxHp * 0.3) p += RULES.retreatWoundedExtra;
      p = clamp(p * pursuit, 0, 0.9);
      if (p > 0 && this.rng.chance(p)) {
        u.hp = 0;
        u.state = 'dead';
        u.killedBy = other;
        caught++;
        this.events.push({ type: 'death', tick: this.tick, unit: u.id, by: -1 });
      } else {
        u.state = 'fled';
      }
      u.engaged = false;
    }
    this.retreated = side;
    this.winner = other;
    this.phase = 'ended';
    this.events.push({ type: 'retreat', tick: this.tick, side, caught, pursuit });
    this.events.push({ type: 'end', tick: this.tick, winner: other });
  }

  private clampFormationToDeploy(g: SimGroup): void {
    const z = this.deployZone(g.side);
    g.formation.cy = clamp(g.formation.cy, z.y0, z.y1);
  }

  /** Re-assign slot offsets to the group's active members. */
  reassign(groupId: number): void {
    const g = this.groups[groupId];
    const mem = this.activeMembers(groupId);
    if (mem.length === 0) return;
    const f = g.formation;
    const slots = formationSlots(f, mem.length);
    const cands = mem.map((u) => ({ id: u.id, x: u.x, y: u.y, priority: slotPriority(u) }));
    const map = assignSlots(f, cands, slots);
    const r = rightOf(f.fx, f.fy);
    for (const u of mem) {
      const p = map.get(u.id);
      if (!p) continue;
      const dx = p.x - f.cx;
      const dy = p.y - f.cy;
      u.slotLat = dx * r.x + dy * r.y;
      u.slotDep = -(dx * f.fx + dy * f.fy);
    }
  }

  private snapToSlots(groupId: number): void {
    const g = this.groups[groupId];
    for (const u of this.activeMembers(groupId)) {
      const p = this.slotPos(u);
      u.x = clamp(p.x, 0.3, this.width - 0.3);
      u.y = clamp(p.y, 0.3, this.height - 0.3);
      u.fx = g.formation.fx;
      u.fy = g.formation.fy;
    }
  }

  /** Default placement by group role. Used for both sides; the bot then adjusts. */
  autoDeploy(side: Side): void {
    const groups = this.sideGroups(side);
    const dir = side === 0 ? -1 : 1; // forward along y
    const z = this.deployZone(side);
    const front = side === 0 ? z.y0 + 3.5 : z.y1 - 3.5; // main line anchor (skirmishers screen ahead)
    const cx = this.width / 2;
    const roleOffset: Record<GroupRole, { dx: number; dy: number }> = {
      skirmish: { dx: 0, dy: 3.5 },
      main: { dx: 0, dy: 0 },
      reserve: { dx: 0, dy: -4.2 },
      flank: { dx: 7.5, dy: -1.2 },
    };
    let flankCount = 0;
    for (const g of groups) {
      const mem = this.activeMembers(g.id);
      if (mem.length === 0) continue;
      const off = roleOffset[g.role];
      let dx = off.dx;
      if (g.role === 'flank') dx = flankCount++ % 2 === 0 ? off.dx : -off.dx;
      const type: FormationType = g.formation.type;
      const prevF = g.formation;
      g.formation = {
        type,
        cx: cx + dx,
        cy: clamp(front + off.dy * dir, z.y0, z.y1),
        fx: 0,
        fy: dir,
        frontage: presetFrontage(type, mem.length),
      };
      if (prevF.fs !== undefined) {
        g.formation.fs = prevF.fs;
        g.formation.rs = prevF.rs;
      }
      this.reassign(g.id);
      this.snapToSlots(g.id);
    }
  }

  // --------------------------------------------------------------------- step

  step(): void {
    if (this.phase !== 'battle') return;
    for (const q of this.queue) {
      this.orderLog.push({ tick: this.tick, side: q.side, order: q.order });
      this.applyOrder(q.side, q.order);
    }
    this.queue.length = 0;
    this.tick++;

    for (const bot of this.bots) bot.think(this);
    if (this.tick % 10 === 1) this.updateAuras();

    if (this.tick % 40 === 0) {
      for (const g of this.groups) if (!g.disbanded && !g.individual) this.reassign(g.id);
    }
    this.updateGroups();
    for (const u of this.units) this.updateUnit(u);
    this.separate();
    this.updateProjectiles();
    this.updateGroupStates();
    this.checkEnd();
  }

  private updateGroups(): void {
    for (const g of this.groups) {
      if (g.disbanded) continue;
      const mem = this.activeMembers(g.id);
      if (mem.length === 0) continue;
      const f = g.formation;
      let pace = Infinity;
      for (const u of mem) pace = Math.min(pace, this.walkSpeed(u, g));
      g.contact = mem.some((u) => u.engaged);
      if (g.order === 'advance' || g.order === 'charge') {
        if (!g.contact) {
          // Stop the formation anchor when the front is close to the enemy.
          const near = this.nearestEnemyDist(g.side, f.cx, f.cy);
          const speed = g.order === 'charge' ? pace * 1.6 : pace * 0.9;
          if (near > 1.2) {
            f.cx = clamp(f.cx + f.fx * speed * DT, 0.5, this.width - 0.5);
            f.cy = clamp(f.cy + f.fy * speed * DT, 0.5, this.height - 0.5);
          }
        }
      } else if (g.order === 'fallback') {
        const step = pace * 0.6 * DT;
        f.cx = clamp(f.cx - f.fx * step, 0.5, this.width - 0.5);
        f.cy = clamp(f.cy - f.fy * step, 0.5, this.height - 0.5);
        g.fallbackLeft -= step;
        if (g.fallbackLeft <= 0) g.order = 'hold';
      }
    }
  }

  private nearestEnemyDist(side: Side, x: number, y: number): number {
    let best = Infinity;
    for (const e of this.units) {
      if (e.side === side || e.state !== 'ready') continue;
      const d = Math.sqrt((e.x - x) ** 2 + (e.y - y) ** 2);
      if (d < best) best = d;
    }
    return best;
  }

  private fatigue(u: SimUnit): number {
    return u.stamina < RULES.lowStamina ? 0.75 : 1;
  }

  private walkSpeed(u: SimUnit, g: SimGroup): number {
    let s = u.stats.speed * this.fatigue(u);
    if (g.shieldWall && u.stats.canShieldWall) s *= RULES.shieldWallSpeed;
    if (u.berserk > 0) s *= 1.1;
    if (this.terrain) s *= this.groundSpeed(u);
    return s;
  }

  private updateUnit(u: SimUnit): void {
    u.vx = 0;
    u.vy = 0;
    if (!this.isAlive(u)) return;
    const g = this.groups[u.group];
    if (u.cooldown > 0) u.cooldown--;
    for (let i = 0; i < u.abilCd.length; i++) if (u.abilCd[i] > 0) u.abilCd[i]--;
    if (u.daze > 0) u.daze--;
    if (u.berserk > 0) {
      u.berserk--;
      if (u.berserk === 0) u.stamina = Math.max(0, u.stamina - ABILITY_RULES.berserkWinded);
    }
    if (u.stun > 0) {
      u.stun--;
      u.engaged = false;
      return;
    }
    if (u.state === 'routing') {
      this.updateRouting(u);
      return;
    }

    // ---- target acquisition
    let nearest: SimUnit | null = null;
    let nearestD = Infinity;
    let melee: SimUnit | null = null;
    let meleeScore = -Infinity;
    const reach0 = u.stats.reach + UNIT_RADIUS * 2;
    for (const e of this.units) {
      if (e.side === u.side || !this.isAlive(e)) continue;
      const dx = e.x - u.x;
      const dy = e.y - u.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (e.state === 'ready' && d < nearestD) {
        nearestD = d;
        nearest = e;
      }
      if (d <= (this.big ? u.stats.reach + u.rad + e.rad : reach0)) {
        // Prefer enemies in front of us, then the closest; ready over routing.
        const front = d > 1e-6 ? (dx * u.fx + dy * u.fy) / d : 1;
        const score = front * 2 - d + (e.state === 'ready' ? 1 : 0) + (e.id === u.targetId ? 0.5 : 0);
        if (score > meleeScore) {
          meleeScore = score;
          melee = e;
        }
      }
    }
    const shielded = g.shieldWall && u.stats.canShieldWall && this.wallGround(u);
    u.engaged = !!melee;
    const reach = this.big && melee ? u.stats.reach + u.rad + melee.rad : this.big && nearest ? u.stats.reach + u.rad + nearest.rad : reach0;
    if (u.stats.kind === 'animal') {
      this.updateBeast(u, g, melee, nearest, nearestD, reach);
      return;
    }
    const mount = this.mountOf(u);

    const slot = this.slotPos(u);
    let moveX = 0;
    let moveY = 0;
    let speed = this.walkSpeed(u, g);
    let faceX = g.formation.fx;
    let faceY = g.formation.fy;
    let running = false;

    // A chariot at speed does not stop to fight: it drives on through (scythes, a blow in passing).
    // So does a rider at the gallop among men with no shield wall to stop him: he rides them down and wheels back.
    const driveThrough =
      mount !== null && g.order === 'charge' && (mount.id === 'chariot' || u.spd > 1.5) && (mount.id === 'chariot' || (melee !== null && melee.stats.kind !== 'animal' && !melee.stats.mount && (melee.stats.shield === 'none' || melee.stats.role !== 'melee')));
    if (driveThrough && melee && u.cooldown <= 0 && this.facingDot(u, melee) > -0.2) this.meleeAttack(u, melee);
    if (melee && g.order !== 'fallback' && !driveThrough) {
      u.targetId = melee.id;
      faceX = melee.x - u.x;
      faceY = melee.y - u.y;
      // Close in slightly if beyond comfortable reach.
      const d = Math.sqrt(faceX * faceX + faceY * faceY);
      if (d > reach * 0.85) {
        moveX = faceX;
        moveY = faceY;
        speed *= 0.5;
      }
      // Braced spearmen get a free thrust at a man still running onto their points.
      const setSpear =
        shielded && u.stats.weapon === 'spear' && melee.momentum >= RULES.chargeMomentumTicks && this.tick - u.lastAttackTick > 10;
      if ((u.cooldown <= 0 || setSpear) && this.facingDot(u, melee) > 0.3) this.meleeAttack(u, melee);
      u.stamina = Math.max(0, u.stamina + 0.5 * DT);
    } else {
      const canShoot = u.ammo > 0 && u.stats.range > 0 && g.fireAtWill;
      const slotDx = slot.x - u.x;
      const slotDy = slot.y - u.y;
      const slotD = Math.sqrt(slotDx * slotDx + slotDy * slotDy);
      let shootTarget: SimUnit | null = null;
      // Riders shoot (or throw) on the move, and even while falling back.
      const mobile = mount !== null && u.stats.range > 0;
      if (canShoot && nearest && (g.order !== 'fallback' || mobile) && (slotD < 0.8 || g.role === 'skirmish' || g.order === 'charge' || mobile)) {
        const range = u.stats.range + (this.terrain ? this.rangeBonus(u, nearest) : 0);
        if (nearestD <= range && nearestD > 1.4) shootTarget = nearest;
      }
      if (shootTarget && mobile) {
        // A Parthian shot: no need to face the target or to stop.
        if (u.cooldown <= 0) this.shoot(u, shootTarget);
        shootTarget = null;
      }
      if (shootTarget) {
        faceX = shootTarget.x - u.x;
        faceY = shootTarget.y - u.y;
        if (u.cooldown <= 0 && this.facingDot(u, shootTarget) > 0.7) this.shoot(u, shootTarget);
        u.stamina = Math.min(u.stats.stamina, u.stamina + 2 * DT);
      } else if (g.order === 'charge' && nearest && nearestD < (mount ? 16 : 9)) {
        // Riders go for the routing men first: they cannot escape a horse.
        const prey = mount ? this.preyFor(u, nearest, nearestD) : nearest;
        moveX = prey.x - u.x;
        moveY = prey.y - u.y;
        faceX = moveX;
        faceY = moveY;
        speed = u.stats.speed * this.fatigue(u) * 1.75;
        if (this.terrain) speed *= this.groundSpeed(u);
        running = true;
        u.targetId = prey.id;
      } else if (g.order === 'advance' && nearest && nearestD < 2.4) {
        moveX = nearest.x - u.x;
        moveY = nearest.y - u.y;
        faceX = moveX;
        faceY = moveY;
      } else if (g.order === 'hold' && nearest && nearestD < reach + 0.9 && slotD < 1.2) {
        // Step into an enemy at the edge of reach without leaving the line.
        moveX = nearest.x - u.x;
        moveY = nearest.y - u.y;
        faceX = moveX;
        faceY = moveY;
        speed *= 0.5;
      } else if (slotD > 0.12) {
        moveX = slotDx;
        moveY = slotDy;
        if (g.order === 'fallback') {
          speed *= 0.6; // walk backwards, keep facing
        } else if (slotD > 2.5 && g.order !== 'hold') {
          speed = u.stats.speed * this.fatigue(u) * 1.4;
          if (this.terrain) speed *= this.groundSpeed(u);
          running = true;
        } else if (slotD > 1.5) {
          speed *= 1.25;
        }
        if (g.order !== 'fallback' && slotD > 1.2) {
          faceX = slotDx;
          faceY = slotDy;
        }
        // Wheel to face a close threat
        if (nearest && nearestD < 3 && g.order !== 'fallback') {
          faceX = nearest.x - u.x;
          faceY = nearest.y - u.y;
        }
      } else if (nearest && nearestD < 3.2) {
        faceX = nearest.x - u.x;
        faceY = nearest.y - u.y;
      }
      if (moveX === 0 && moveY === 0) {
        const rest = shielded ? 2.5 : 4;
        u.stamina = Math.min(u.stats.stamina, u.stamina + rest * DT);
      }
    }

    if (mount) {
      this.ride(u, mount, moveX, moveY, speed, running, faceX, faceY, !!melee);
      this.updateMorale(u, nearestD);
      return;
    }

    // ---- movement
    const ml = Math.sqrt(moveX * moveX + moveY * moveY);
    if (ml > 1e-6) {
      let climb = false;
      if (this.terrain) {
        // Climbing to higher ground is slow and tiring.
        const ax = u.x + moveX / ml;
        const ay = u.y + moveY / ml;
        if (this.terrain.heightAt(ax, ay) > this.terrain.heightAt(u.x, u.y)) {
          speed *= HEIGHT_RULES.uphillSpeed;
          climb = true;
        }
      }
      const step = Math.min(speed * DT, ml);
      u.vx = (moveX / ml) * step;
      u.vy = (moveY / ml) * step;
      this.moveUnit(u, u.vx, u.vy);
      u.stamina = Math.max(0, u.stamina - (running ? 5 : shielded ? 1.2 : 0.4) * DT);
      if (climb) u.stamina = Math.max(0, u.stamina - HEIGHT_RULES.climbStamina * DT);
    }
    if (running && ml > 0.3) u.momentum++;
    else if (!u.engaged) u.momentum = Math.max(0, u.momentum - 2);
    u.x = clamp(u.x, UNIT_RADIUS, this.width - UNIT_RADIUS);
    u.y = clamp(u.y, UNIT_RADIUS, this.height - UNIT_RADIUS);

    this.turnToward(u, faceX, faceY, shielded ? 2.5 : 5);
    this.updateMorale(u, nearestD);
  }

  // ------------------------------------------------------------ riders & beasts

  /**
   * A rider moves along his facing with momentum: he accelerates and brakes at
   * the horse's rate, turns slower the faster he goes, and so overruns, wheels
   * wide and cannot stop at once. Close to his spot he steps about slowly.
   */
  private ride(u: SimUnit, m: MountDef, moveX: number, moveY: number, speed: number, running: boolean, faceX: number, faceY: number, fighting: boolean): void {
    const ground = this.terrain ? this.groundSpeed(u) : 1;
    const topOpen = u.stats.speed * m.gallop;
    const top = topOpen * this.fatigue(u) * ground;
    const ml = Math.sqrt(moveX * moveX + moveY * moveY);
    let want = 0;
    if (ml > 1e-6) {
      want = running ? top : Math.min(speed, top);
      // Arrive: brake in time to stop on the spot. A charge does not brake.
      if (!running) want = Math.min(want, Math.sqrt(2 * m.brake * ml) * 0.9);
    }
    const sr = clamp(u.spd / Math.max(0.1, topOpen), 0, 1);
    if (ml > 1e-6 && ml < 1.6 && u.spd < 1.2 && !running) {
      // Shuffle into place: a horse can side-step and back up a little.
      const step = Math.min(0.9 * DT * Math.max(0.3, ground), ml);
      u.spd = Math.max(0, u.spd - m.brake * DT);
      this.moveUnit(u, (moveX / ml) * step, (moveY / ml) * step);
      u.vx = (moveX / ml) * step;
      u.vy = (moveY / ml) * step;
      this.turnToward(u, faceX, faceY, m.turnSlow);
    } else {
      if (ml > 1e-6) {
        const dx = moveX / ml;
        const dy = moveY / ml;
        this.turnToward(u, dx, dy, m.turnSlow + (m.turnFast - m.turnSlow) * sr);
        const align = dx * u.fx + dy * u.fy;
        if (align < 0.7) want *= Math.max(0.25, align); // swing round before speeding up again
      } else if (u.spd < 0.5 || fighting) this.turnToward(u, faceX, faceY, m.turnSlow);
      const dv = want - u.spd;
      u.spd += dv > 0 ? Math.min(dv, m.accel * DT) : Math.max(dv, -m.brake * DT);
      if (u.spd < 0.03) u.spd = 0;
      const step = u.spd * DT;
      u.vx = u.fx * step;
      u.vy = u.fy * step;
      if (step > 0) this.moveUnit(u, u.vx, u.vy);
    }
    // Fast enough to strike with the weight of the horse behind the blow.
    u.momentum = u.spd >= topOpen * MOUNTED_RULES.chargeSpeed ? RULES.chargeMomentumTicks : 0;
    if (u.spd > topOpen * 0.6) u.stamina = Math.max(0, u.stamina - 3 * DT);
    else if (u.spd < 0.3 && !fighting) u.stamina = Math.min(u.stats.stamina, u.stamina + 4 * DT);
    u.x = clamp(u.x, u.rad, this.width - u.rad);
    u.y = clamp(u.y, u.rad, this.height - u.rad);
    if (m.scythe > 0 && u.spd > 2) this.scythes(u, m, topOpen);
    if (m.id === 'chariot' && this.terrain && u.spd > 1) {
      // Woods, stones and water wreck wheels and axles.
      const dmg = this.terrain.at(u.x, u.y).chariotDamage;
      if (dmg > 0) {
        u.hp -= dmg * DT * (u.spd / topOpen);
        u.lastHitTick = this.tick;
        if (u.hp <= 0) this.crash(u);
      }
    }
  }

  /** Scythed wheels cut every enemy the chariot drives past. */
  private scythes(u: SimUnit, m: MountDef, topOpen: number): void {
    for (const e of this.units) {
      if (e.side === u.side || !this.isAlive(e) || this.tick - e.lastScytheTick < 12) continue;
      const r = u.rad + e.rad + 0.3;
      const dx = e.x - u.x;
      const dy = e.y - u.y;
      if (dx * dx + dy * dy > r * r) continue;
      e.lastScytheTick = this.tick;
      const dmg = m.scythe * (u.spd / topOpen) * (1 + (u.stats.scythe ?? 0)) * this.rng.range(0.8, 1.2);
      if (e.state === 'ready') e.stun = Math.max(e.stun, 6);
      this.contactEvent(this.groups[u.group]);
      this.applyDamage(e, u, dmg, this.hitDirection(e, u.x, u.y), false, 1.4);
    }
  }

  /** A wrecked chariot: crew and horses lost, nobody credited. */
  private crash(u: SimUnit): void {
    u.hp = 0;
    u.state = 'dead';
    u.engaged = false;
    u.spd = 0;
    u.killedBy = u.side === 0 ? 1 : 0;
    u.ko = this.rng.chance(u.stats.koChance);
    this.events.push({ type: 'death', tick: this.tick, unit: u.id, by: -1 });
    for (const o of this.units) {
      if (o.state !== 'ready' || o.side !== u.side) continue;
      if ((o.x - u.x) ** 2 + (o.y - u.y) ** 2 <= RULES.cascadeRadius ** 2) o.morale -= RULES.allyDeathMorale * this.ml(o);
    }
  }

  /** Push t away from u (a horse knocking a man aside), unless rocks are in the way. */
  private shove(t: SimUnit, u: SimUnit, dist: number): void {
    const dx = t.x - u.x;
    const dy = t.y - u.y;
    const l = Math.sqrt(dx * dx + dy * dy) || 1;
    const sx = clamp(t.x + (dx / l) * dist, t.rad, this.width - t.rad);
    const sy = clamp(t.y + (dy / l) * dist, t.rad, this.height - t.rad);
    if (!this.terrain || !this.terrain.blocked(sx, sy)) {
      t.x = sx;
      t.y = sy;
    }
  }

  /** Riders charging: a routing man close by is the easiest prey. */
  private preyFor(u: SimUnit, nearest: SimUnit, nearestD: number): SimUnit {
    let best = nearest;
    let bd = nearestD + 4;
    for (const e of this.units) {
      if (e.side === u.side || e.state !== 'routing') continue;
      const d = Math.sqrt((e.x - u.x) ** 2 + (e.y - u.y) ** 2);
      if (d < bd && d < 12) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** Whether any of a beast's pack nearby is fighting or was hurt lately. */
  private packAlert(u: SimUnit): boolean {
    for (const a of this.units) {
      if (a.side !== u.side || a.state !== 'ready' || a.stats.kind !== 'animal') continue;
      if ((a.x - u.x) ** 2 + (a.y - u.y) ** 2 > 144) continue;
      if (a.engaged || this.tick - a.lastHitTick < 60) return true;
    }
    return false;
  }

  /** Wolves pick the weak: men standing alone, the wounded, archers. */
  private huntTarget(u: SimUnit, nearest: SimUnit): SimUnit {
    let best = nearest;
    let bs = -Infinity;
    for (const e of this.units) {
      if (e.side === u.side || e.state !== 'ready') continue;
      const d = Math.sqrt((e.x - u.x) ** 2 + (e.y - u.y) ** 2);
      if (d > 12) continue;
      let friends = 0;
      for (const f of this.units) if (f !== e && f.side === e.side && f.state === 'ready' && (f.x - e.x) ** 2 + (f.y - e.y) ** 2 < 2.6) friends++;
      const score = -d + (friends === 0 ? 3 : friends === 1 ? 1 : 0) + 2 * (1 - e.hp / e.stats.maxHp) + (e.stats.role !== 'melee' ? 1.5 : 0) + (e.id === u.targetId ? 1 : 0);
      if (score > bs) {
        bs = score;
        best = e;
      }
    }
    return best;
  }

  /**
   * Animals: no formation and no shields. They keep to their lair until
   * something comes close (or the pack is fighting, or they are ordered in),
   * then hunt: wolves circle to a flank or the rear of the weakest man, boars
   * charge straight in, bears lumber up and swipe.
   */
  private updateBeast(u: SimUnit, g: SimGroup, melee: SimUnit | null, nearest: SimUnit | null, nearestD: number, reach: number): void {
    let moveX = 0;
    let moveY = 0;
    let faceX = g.formation.fx;
    let faceY = g.formation.fy;
    let speed = this.walkSpeed(u, g);
    let running = false;
    if (melee) {
      u.targetId = melee.id;
      faceX = melee.x - u.x;
      faceY = melee.y - u.y;
      const d = Math.sqrt(faceX * faceX + faceY * faceY);
      if (d > reach * 0.85) {
        moveX = faceX;
        moveY = faceY;
        speed *= 0.6;
      }
      if (u.cooldown <= 0 && this.facingDot(u, melee) > 0.3) {
        this.meleeAttack(u, melee);
        if (u.stats.beast === 'bear') {
          // A bear's swipe sweeps through two men.
          for (const e of this.units) {
            if (e === melee || e.side === u.side || e.state !== 'ready') continue;
            if ((e.x - u.x) ** 2 + (e.y - u.y) ** 2 <= reach * reach && this.facingDot(u, e) > 0) {
              this.meleeAttack(u, e);
              break;
            }
          }
        }
      }
    } else if (nearest && (nearestD < MOUNTED_RULES.aggro || g.order === 'charge' || g.order === 'advance' || this.packAlert(u))) {
      const pack = u.stats.beast === 'wolf';
      const prey = pack ? this.huntTarget(u, nearest) : nearest;
      let tx = prey.x;
      let ty = prey.y;
      const dPrey = Math.sqrt((prey.x - u.x) ** 2 + (prey.y - u.y) ** 2);
      if (pack && dPrey > 1.1) {
        // Circle to his flank or rear (alternate sides through the pack).
        const side = u.id % 2 === 0 ? 1 : -1;
        const r = rightOf(prey.fx, prey.fy);
        const ax = prey.x - prey.fx * 0.9 + r.x * side * 1.1;
        const ay = prey.y - prey.fy * 0.9 + r.y * side * 1.1;
        if ((ax - u.x) ** 2 + (ay - u.y) ** 2 > 0.4) {
          tx = ax;
          ty = ay;
        }
      }
      moveX = tx - u.x;
      moveY = ty - u.y;
      faceX = prey.x - u.x;
      faceY = prey.y - u.y;
      u.targetId = prey.id;
      running = u.stats.beast === 'bear' ? dPrey < 4 : dPrey < 9;
      speed = u.stats.speed * this.fatigue(u) * (running ? 1.6 : 1);
      if (this.terrain) speed *= this.groundSpeed(u);
    } else {
      const slot = this.slotPos(u);
      const sdx = slot.x - u.x;
      const sdy = slot.y - u.y;
      if (sdx * sdx + sdy * sdy > 0.04) {
        moveX = sdx;
        moveY = sdy;
        faceX = sdx;
        faceY = sdy;
      } else if (nearest) {
        faceX = nearest.x - u.x;
        faceY = nearest.y - u.y;
      }
      u.stamina = Math.min(u.stats.stamina, u.stamina + 4 * DT);
    }
    const ml = Math.sqrt(moveX * moveX + moveY * moveY);
    if (ml > 1e-6) {
      const step = Math.min(speed * DT, ml);
      u.vx = (moveX / ml) * step;
      u.vy = (moveY / ml) * step;
      this.moveUnit(u, u.vx, u.vy);
      u.stamina = Math.max(0, u.stamina - (running ? 3 : 0.3) * DT);
    }
    if (running && ml > 0.3) u.momentum++;
    else if (!u.engaged) u.momentum = Math.max(0, u.momentum - 2);
    u.x = clamp(u.x, u.rad, this.width - u.rad);
    u.y = clamp(u.y, u.rad, this.height - u.rad);
    this.turnToward(u, faceX, faceY, 7);
    this.updateMorale(u, nearestD);
  }

  private updateRouting(u: SimUnit): void {
    u.engaged = false;
    // Flee towards own edge, away from the nearest enemy.
    let ex = 0;
    let ey = 0;
    let nearD = Infinity;
    for (const e of this.units) {
      if (e.side === u.side || e.state !== 'ready') continue;
      const d = Math.sqrt((e.x - u.x) ** 2 + (e.y - u.y) ** 2);
      if (d < nearD) {
        nearD = d;
        ex = u.x - e.x;
        ey = u.y - e.y;
      }
    }
    const home = u.side === 0 ? 1 : -1;
    let mx = 0;
    let my = home * 1.5;
    if (nearD < 6) {
      const l = Math.sqrt(ex * ex + ey * ey) || 1;
      mx += ex / l;
      my += ey / l;
    }
    const l = Math.sqrt(mx * mx + my * my) || 1;
    let speed = u.stats.speed * 1.6 * (u.stamina > 10 ? 1 : 0.7);
    if (this.terrain) speed *= this.groundSpeed(u);
    if (u.stats.mount) {
      speed = this.gallopSpeed(u) * 0.85 * (u.stamina > 10 ? 1 : 0.7) * (this.terrain ? this.groundSpeed(u) : 1);
      u.spd = speed;
    }
    u.vx = (mx / l) * speed * DT;
    u.vy = (my / l) * speed * DT;
    if (this.terrain) {
      this.moveUnit(u, u.vx, u.vy);
      u.x = clamp(u.x, UNIT_RADIUS, this.width - UNIT_RADIUS);
    } else {
      u.x = clamp(u.x + u.vx, UNIT_RADIUS, this.width - UNIT_RADIUS);
      u.y += u.vy;
    }
    u.stamina = Math.max(0, u.stamina - 3 * DT);
    this.turnToward(u, mx, my, 8);
    if (nearD > 6) u.morale = Math.min(u.stats.morale, u.morale + 3.5 * DT);
    if (u.y < -0.5 || u.y > this.height + 0.5) {
      u.state = 'fled';
      u.engaged = false;
      return;
    }
    if (u.morale >= u.stats.morale * RULES.rallyFraction && nearD > 5 && u.stats.kind !== 'animal') {
      u.state = 'ready';
      u.momentum = 0;
      this.events.push({ type: 'rally', tick: this.tick, unit: u.id });
      this.reassign(u.group);
    }
  }

  private updateMorale(u: SimUnit, nearestEnemy: number): void {
    // Recover when out of danger; erode when locally outnumbered.
    if (!u.engaged && nearestEnemy > 4 && u.morale < u.stats.morale) {
      u.morale = Math.min(u.stats.morale, u.morale + 1.5 * DT);
    }
    if (u.aura & AURAS.steady.bit && u.morale < u.stats.morale) {
      u.morale = Math.min(u.stats.morale, u.morale + AURA_RULES.steadyRegen * DT);
    }
    if (u.engaged && this.tick % 10 === 0) {
      let allies = 0;
      let enemies = 0;
      for (const o of this.units) {
        if (o.state !== 'ready') continue;
        const d2 = (o.x - u.x) ** 2 + (o.y - u.y) ** 2;
        if (d2 > 9) continue;
        // Big bodies (horses, bears) count for more than one man.
        const w = this.big ? o.rad / UNIT_RADIUS : 1;
        if (o.side === u.side) allies += w;
        else enemies += w;
      }
      // Animals do not count heads the way men do.
      if (enemies > allies + 1) u.morale -= 0.5 * (enemies - allies) * this.ml(u) * (u.stats.kind === 'animal' ? 0.35 : u.stats.mount ? 0.5 : 1);
    }
    if (u.stamina <= 0 && u.engaged && this.tick % 20 === 0) u.morale -= 1 * this.ml(u);
    if (this.special && this.tick % 10 === 0 && u.stats.kind !== 'animal' && !u.stats.mount) {
      // Men on foot dread horses close by, unless they stand in a wall of spears.
      const g = this.groups[u.group];
      if (!(g.shieldWall && u.stats.weapon === 'spear' && u.stats.canShieldWall)) {
        let horses = 0;
        for (const e of this.units) {
          if (e.side === u.side || e.state !== 'ready' || !e.stats.mount) continue;
          if ((e.x - u.x) ** 2 + (e.y - u.y) ** 2 < 6.25) horses++;
        }
        if (horses > 0) u.morale -= MOUNTED_RULES.horseDread * Math.min(3, horses) * (u.stats.role === 'melee' ? 1 : 3) * this.ml(u);
      }
    }
    if (u.berserk > 0) {
      // Fury: he cannot break while it lasts.
      u.morale = Math.max(u.morale, u.stats.morale * (u.stats.routAt ?? RULES.routFraction) + 1);
      return;
    }
    if (u.morale < u.stats.morale * (u.stats.routAt ?? RULES.routFraction) && u.state === 'ready') this.rout(u);
  }

  private rout(u: SimUnit): void {
    u.state = 'routing';
    u.engaged = false;
    u.momentum = 0;
    if (u.stats.kind === 'animal' && this.special) {
      // A pack bolts together: the others lose heart.
      for (const a of this.units) if (a !== u && a.side === u.side && a.state === 'ready' && a.stats.kind === 'animal' && (a.x - u.x) ** 2 + (a.y - u.y) ** 2 < 64) a.morale -= 2;
    }
    this.events.push({ type: 'unitRout', tick: this.tick, unit: u.id });
    for (const a of this.units) {
      if (a.side !== u.side || a.state !== 'ready' || a === u) continue;
      if ((a.x - u.x) ** 2 + (a.y - u.y) ** 2 <= RULES.cascadeRadius ** 2) {
        a.morale -= RULES.allyRoutMorale * this.ml(a);
      }
    }
  }

  private turnToward(u: SimUnit, dx: number, dy: number, rate: number): void {
    const l = Math.sqrt(dx * dx + dy * dy);
    if (l < 1e-6) return;
    let tx = dx / l;
    let ty = dy / l;
    const dot = tx * u.fx + ty * u.fy;
    if (dot < -0.95) {
      // Avoid a degenerate 180 degree flip: swing through the right-hand side.
      tx = tx - u.fy * 0.6;
      ty = ty + u.fx * 0.6;
    }
    const k = Math.min(1, rate * DT);
    let nx = u.fx + (tx - u.fx) * k;
    let ny = u.fy + (ty - u.fy) * k;
    const nl = Math.sqrt(nx * nx + ny * ny) || 1;
    nx /= nl;
    ny /= nl;
    u.fx = nx;
    u.fy = ny;
  }

  private facingDot(u: SimUnit, t: SimUnit): number {
    const dx = t.x - u.x;
    const dy = t.y - u.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    return (dx * u.fx + dy * u.fy) / d;
  }

  /** Direction an attack from (ax, ay) lands on target t, judged by t's facing. */
  hitDirection(t: SimUnit, ax: number, ay: number): HitDir {
    const dx = ax - t.x;
    const dy = ay - t.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const dot = (dx * t.fx + dy * t.fy) / d;
    if (dot > 0.45) return 'front';
    if (dot < -0.35) return 'rear';
    return 'side';
  }

  /** Probability that target t blocks an attack from the given direction. */
  blockChance(t: SimUnit, dir: HitDir, pierce: number, missile: boolean): number {
    if (t.stats.shield === 'none' || t.state !== 'ready' || dir === 'rear' || t.daze > 0) return 0;
    const g = this.groups[t.group];
    let b = t.stats.block;
    if (dir === 'side') b *= RULES.sideBlockFactor;
    let wall = g.shieldWall && t.stats.canShieldWall && dir === 'front';
    if (this.terrain) {
      const d = this.terrain.at(t.x, t.y);
      b *= d.blockMult;
      if (d.noWall) wall = false;
    }
    if (wall) b += RULES.shieldWallBlock;
    if (missile) b *= RULES.missileBlockFactor;
    b *= this.fatigue(t);
    if (t.berserk > 0) b *= ABILITY_RULES.berserkBlock;
    b -= pierce;
    return clamp(b, 0, 0.85);
  }

  private meleeAttack(u: SimUnit, t: SimUnit): void {
    const g = this.groups[u.group];
    const tg = this.groups[t.group];
    const wall = g.shieldWall && u.stats.canShieldWall && this.wallGround(u);
    const fury = u.berserk > 0;
    u.cooldown = Math.round(u.stats.atkTime * TICK_RATE * (wall ? 1.2 : 1) * (fury ? ABILITY_RULES.berserkTempo : 1) / this.fatigue(u));
    u.lastAttackTick = this.tick;
    u.stamina = Math.max(0, u.stamina - 3);
    u.wear.weapon += 0.12;
    const dir = this.hitDirection(t, u.x, u.y);
    this.contactEvent(g);
    this.contactEvent(tg);

    const impact = u.momentum >= RULES.chargeMomentumTicks;
    const rider = u.stats.mount ? MOUNTS[u.stats.mount] : null;
    // A horse shies from the points of a braced spear wall in front of it.
    const shy = rider !== null && !impact && t.stats.weapon === 'spear' && tg.shieldWall && t.stats.canShieldWall && dir === 'front';
    if (!this.rng.chance(RULES.meleeHit + (t.stamina < RULES.lowStamina ? 0.08 : 0) + (rider && impact ? 0.15 : 0) - (shy ? MOUNTED_RULES.shyHit : 0))) {
      u.momentum = 0;
      if (rider) u.spd *= MOUNTED_RULES.impactKeep + 0.3;
      return;
    }
    // Trees and water break up a braced wall: its men cannot set their spears together.
    const tGround = this.terrain ? this.terrain.at(t.x, t.y) : TERRAIN.open;
    const braced = tg.shieldWall && t.stats.canShieldWall && dir === 'front' && this.facingDot(t, u) > 0.3 && !tGround.noWall && tGround.braceMult >= 0.5;    if (impact && braced) {
      // The charge breaks on a braced wall: the attacker is checked and winded.
      u.stun = RULES.bracedBounceStun;
      u.stamina = Math.max(0, u.stamina - 8);
      u.morale -= 3 * this.ml(u);
      if (rider && t.stats.weapon === 'spear') {
        // A horse will not run onto a hedge of spears: it balks, rears, and the
        // rider takes a spear point. Riders must never charge braced spears head on.
        u.stun = MOUNTED_RULES.balkStun;
        u.spd = 0;
        u.momentum = 0;
        u.morale -= MOUNTED_RULES.balkMorale * this.ml(u);
        u.stamina = Math.max(0, u.stamina - 10);
        const counter = t.stats.dmg * (1 + t.stats.chargeBonus * MOUNTED_RULES.balkCounter) * this.rng.range(0.8, 1.2);
        t.lastAttackTick = this.tick;
        this.events.push({ type: 'impact', tick: this.tick, unit: u.id, by: t.id });
        this.applyDamage(u, t, counter, 'front', false, 1.6);
        if (u.state !== 'ready') return;
      }
    }
    if (this.rng.chance(this.blockChance(t, dir, u.stats.blockPierce, false))) {
      t.stamina = Math.max(0, t.stamina - (impact ? 10 : 3));
      t.lastBlockTick = this.tick;
      t.wear.shield += impact ? 1.5 : 0.6;
      t.morale -= (impact ? 4 : 0.4) * this.ml(t);
      if (impact) {
        u.momentum = 0;
        this.events.push({ type: 'impact', tick: this.tick, unit: t.id, by: u.id });
      }
      this.events.push({ type: 'block', tick: this.tick, unit: t.id, by: u.id });
      return;
    }
    let dmg = u.stats.dmg * this.rng.range(0.8, 1.2) * RULES.dirDamage[dir];
    if (fury) dmg *= ABILITY_RULES.berserkDamage;
    if (u.aura & AURAS.warlord.bit) dmg *= AURA_RULES.warlordDamage;
    if (t.daze > 0) dmg *= ABILITY_RULES.dazeDamage;
    // High ground: blows from above land harder, blows from below weaker.
    const hd = this.terrain ? this.heightDiff(u.x, u.y, t.x, t.y) : 0;
    if (hd > 0) dmg *= 1 + hd * HEIGHT_RULES.meleeDown;
    else if (hd < 0) dmg *= 1 + hd * HEIGHT_RULES.meleeUp;
    let moraleMult = 1 + u.stats.moraleShock + (fury ? ABILITY_RULES.berserkShock : 0);
    if (impact && rider) {
      // A mounted charge: the faster the horse, the harder the blow.
      const sr = clamp(u.spd / Math.max(0.1, this.gallopSpeed(u)), 0.4, 1.15);
      dmg *= RULES.chargeImpact + u.stats.chargeBonus * 0.6 * sr;
      if (this.terrain) dmg *= this.terrain.at(u.x, u.y).cavCharge;
      if (hd > 0) dmg *= 1 + hd * HEIGHT_RULES.chargeDown;
      moraleMult += 0.8;
      if (dir !== 'front') {
        dmg *= MOUNTED_RULES.flankImpact;
        moraleMult += MOUNTED_RULES.flankShock;
      }
      // Men without a shield to set against the horse are simply ridden down.
      if (t.stats.shield === 'none' && !t.stats.mount) dmg *= MOUNTED_RULES.unshielded;
      if (braced) {
        dmg *= MOUNTED_RULES.bracedImpact;
        moraleMult -= 0.6;
      } else {
        t.stun = Math.max(t.stun, MOUNTED_RULES.impactStun);
        t.momentum = 0;
        this.shove(t, u, MOUNTED_RULES.impactShove * sr);
        // Terror of the horse: the man struck and those around him lose heart.
        t.morale -= MOUNTED_RULES.terror * this.ml(t);
        for (const o of this.units) {
          if (o === t || o.side !== t.side || o.state !== 'ready') continue;
          if ((o.x - t.x) ** 2 + (o.y - t.y) ** 2 < 3.2) o.morale -= MOUNTED_RULES.terror * 0.4 * this.ml(o);
        }
      }
      u.momentum = 0;
      u.spd *= MOUNTED_RULES.impactKeep;
      this.events.push({ type: 'impact', tick: this.tick, unit: t.id, by: u.id });
    } else if (impact) {
      dmg *= RULES.chargeImpact + u.stats.chargeBonus * 0.5;
      if (hd > 0) dmg *= 1 + hd * HEIGHT_RULES.chargeDown;
      moraleMult += 0.8;
      if (braced) {
        dmg *= RULES.bracedImpact;
        moraleMult -= 0.6;
      } else t.stun = 8;
      u.momentum = 0;
      this.events.push({ type: 'impact', tick: this.tick, unit: t.id, by: u.id });
    }
    // Spearmen standing their ground punish an enemy charging onto their points.
    if (u.stats.weapon === 'spear' && t.momentum >= RULES.chargeMomentumTicks && g.order !== 'charge') {
      if (this.terrain) dmg *= 1 + u.stats.chargeBonus * (wall ? RULES.braceSpearBonus : 1.5) * this.terrain.at(u.x, u.y).braceMult;
      else dmg *= 1 + u.stats.chargeBonus * (wall ? RULES.braceSpearBonus : 1.5);
      t.momentum = 0;
    }
    // Spear points reach a horse (a big target) before its rider reaches the spearman.
    if (t.stats.mount && (u.stats.weapon === 'spear' || u.stats.weapon === 'lance')) dmg *= MOUNTED_RULES.spearVsHorse;
    if (t.state === 'routing') {
      dmg *= RULES.routingDamage;
      if (rider) dmg *= MOUNTED_RULES.rideDown;
      if (u.stats.pursuit) dmg *= 1 + u.stats.pursuit;
    }
    if (u.stats.beast === 'bear' && t.state === 'ready') t.stun = Math.max(t.stun, MOUNTED_RULES.bearStun);
    // A rider strikes down from the saddle at men on foot.
    if (rider && !impact && !t.stats.mount && !shy) dmg *= MOUNTED_RULES.saddle;
    this.applyDamage(t, u, dmg, dir, false, moraleMult);
  }

  private contactEvent(g: SimGroup): void {
    g.contact = true;
    if (!this.firstContact[g.side]) {
      this.firstContact[g.side] = true;
      this.events.push({ type: 'contact', tick: this.tick, side: g.side, group: g.id });
    }
  }

  private applyDamage(t: SimUnit, by: SimUnit, raw: number, dir: HitDir, ranged: boolean, moraleMult: number, ap?: number): void {
    let armor = t.berserk > 0 ? Math.max(0, t.stats.armor - ABILITY_RULES.berserkArmor) : t.stats.armor;
    if (ap) armor *= 1 - ap;
    const dmg = Math.max(0.5, (raw * RULES.damageScale * RULES.armorK) / (RULES.armorK + armor));
    t.hp -= dmg;
    t.lastHitTick = this.tick;
    t.wear.armor += 0.5;
    t.wear.helmet += 0.3;
    by.dmgDealt += dmg;
    t.morale -= dmg * RULES.moraleFromDamage * RULES.dirMorale[dir] * this.ml(t) * moraleMult * (ranged ? 0.8 : 1) * (t.stats.kind === 'animal' ? MOUNTED_RULES.beastPain : 1);
    this.events.push({ type: 'hit', tick: this.tick, unit: t.id, by: by.id, dmg, dir, ranged });
    if (dir !== 'front' && t.state === 'ready') {
      const g = this.groups[t.group];
      if (this.tick - g.lastFlankEvent > TICK_RATE * 12) {
        g.lastFlankEvent = this.tick;
        this.events.push({ type: 'flanked', tick: this.tick, side: t.side, group: g.id });
      }
    }
    if (t.hp <= 0) this.kill(t, by);
  }

  private kill(t: SimUnit, by: SimUnit): void {
    t.hp = 0;
    t.state = 'dead';
    t.engaged = false;
    t.killedBy = by.side;
    // A mortal blow may only knock him senseless: he lives, wounded.
    t.ko = this.rng.chance(t.stats.koChance);
    by.kills++;
    if (by.stats.bloodlust && by.state === 'ready') {
      by.morale = Math.min(by.stats.morale + 10, by.morale + 8);
      by.stamina = Math.min(by.stats.stamina, by.stamina + 10);
    }
    this.events.push({ type: 'death', tick: this.tick, unit: t.id, by: by.id });
    const r2 = RULES.cascadeRadius ** 2;
    for (const o of this.units) {
      if (o.state !== 'ready') continue;
      if ((o.x - t.x) ** 2 + (o.y - t.y) ** 2 > r2) continue;
      if (o.side === t.side) o.morale -= RULES.allyDeathMorale * this.ml(o);
      else o.morale = Math.min(o.stats.morale + 10, o.morale + RULES.enemyDeathMorale);
    }
  }

  private shoot(u: SimUnit, t: SimUnit, dmgMult = 1, accBonus = 0): void {
    const kind: ProjectileKind = u.stats.weapon === 'bow' ? 'arrow' : u.stats.weapon === 'sling' ? 'stone' : 'javelin';
    const speed = kind === 'arrow' ? 20 : kind === 'stone' ? 18 : 13;
    const dx = t.x - u.x;
    const dy = t.y - u.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const dur = Math.max(6, Math.round((d / speed) * TICK_RATE));
    // Lead the target a little, then scatter by inaccuracy.
    const lead = dur * 0.6;
    const eagle = (u.aura & AURAS.eagle.bit) !== 0;
    const acc = Math.min(0.97, u.stats.accuracy + accBonus + (eagle ? AURA_RULES.eagleAccuracy : 0));
    let spread = (1 - acc) * (0.35 + d * 0.09);
    if (u.stats.mount && u.spd > 1) spread *= MOUNTED_RULES.movingScatter;
    if (t.stats.mount && t.spd > 2) spread *= MOUNTED_RULES.movingScatter;
    const tx = t.x + t.vx * lead + this.rng.range(-spread, spread);
    const ty = t.y + t.vy * lead + this.rng.range(-spread, spread);
    u.cooldown = Math.round(u.stats.shotTime * TICK_RATE / this.fatigue(u));
    u.ammo--;
    u.lastShotTick = this.tick;
    u.stamina = Math.max(0, u.stamina - 2);
    const p: Projectile = {
      id: this.nextProjId++,
      kind,
      side: u.side,
      shooterId: u.id,
      sx: u.x,
      sy: u.y,
      tx,
      ty,
      t0: this.tick,
      dur,
      dmg: u.stats.rangedDmg * dmgMult * (eagle ? AURA_RULES.eagleDamage : 1),
      done: false,
      hitId: -1,
    };
    if (u.stats.armorPierce) p.ap = u.stats.armorPierce;
    this.projectiles.push(p);
    this.events.push({ type: 'shot', tick: this.tick, unit: u.id, proj: p.id });
  }

  private updateProjectiles(): void {
    for (const p of this.projectiles) {
      if (p.done || this.tick < p.t0 + p.dur) continue;
      p.done = true;
      const shooter = this.units[p.shooterId];
      let best: SimUnit | null = null;
      let bestD = 0.5;
      for (const e of this.units) {
        if (e.side === p.side || !this.isAlive(e)) continue;
        let d = Math.sqrt((e.x - p.tx) ** 2 + (e.y - p.ty) ** 2);
        if (this.big) d -= e.rad - UNIT_RADIUS;
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      if (!best) {
        this.events.push({ type: 'land', tick: this.tick, proj: p.id, hit: false });
        continue;
      }
      // Trees (and scrub) catch some missiles meant for men standing among them.
      const cover = this.terrain ? this.terrain.at(best.x, best.y).cover : 0;
      if (cover > 0 && this.rng.chance(cover)) {
        this.events.push({ type: 'land', tick: this.tick, proj: p.id, hit: false });
        continue;
      }
      p.hitId = best.id;
      const dir = this.hitDirection(best, p.sx, p.sy);
      const pierce = p.kind === 'javelin' ? shooter.stats.blockPierce + 0.05 : 0;
      if (this.rng.chance(this.blockChance(best, dir, pierce, true))) {
        best.lastBlockTick = this.tick;
        best.wear.shield += 0.5;
        best.morale -= 0.6 * this.ml(best);
        this.events.push({ type: 'block', tick: this.tick, unit: best.id, by: shooter.id });
        this.events.push({ type: 'land', tick: this.tick, proj: p.id, hit: true });
        continue;
      }
      const dirMult = dir === 'front' ? 1 : dir === 'side' ? 1.15 : 1.3;
      let dmg = p.dmg * this.rng.range(0.8, 1.2) * dirMult;
      if (this.terrain) {
        const hd = this.heightDiff(p.sx, p.sy, best.x, best.y);
        if (hd > 0) dmg *= 1 + hd * HEIGHT_RULES.missileDown;
      }
      this.events.push({ type: 'land', tick: this.tick, proj: p.id, hit: true });
      this.applyDamage(best, shooter, dmg, dir, true, 1, p.ap);
    }
    // Keep finished projectiles briefly for rendering (stuck javelins), then drop.
    if (this.tick % 20 === 0) {
      this.projectiles = this.projectiles.filter((p) => !p.done || this.tick - (p.t0 + p.dur) < 60);
    }
  }

  private separate(): void {
    const n = this.units.length;
    const min0 = UNIT_RADIUS * 2;
    for (let i = 0; i < n; i++) {
      const a = this.units[i];
      if (a.state !== 'ready' && a.state !== 'routing') continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.units[j];
        if (b.state !== 'ready' && b.state !== 'routing') continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = this.big ? a.rad + b.rad : min0;
        if (dx > min || dx < -min || dy > min || dy < -min) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        let d = Math.sqrt(d2);
        let nx: number;
        let ny: number;
        if (d < 1e-6) {
          // Deterministic tie-break for exact overlap.
          nx = a.id < b.id ? 1 : -1;
          ny = 0;
          d = 0;
        } else {
          nx = dx / d;
          ny = dy / d;
        }
        const push = (min - d) * 0.5 * 0.8;
        // Braced shield walls are harder to shove.
        let wa = this.groups[a.group].shieldWall && a.stats.canShieldWall && this.wallGround(a) ? 0.4 : 1;
        let wb = this.groups[b.group].shieldWall && b.stats.canShieldWall && this.wallGround(b) ? 0.4 : 1;
        if (this.special) {
          // Horses and chariots shoulder men aside.
          if (a.stats.mount) wa = a.stats.mount === 'chariot' ? MOUNTED_RULES.chariotWeight : MOUNTED_RULES.riderWeight;
          if (b.stats.mount) wb = b.stats.mount === 'chariot' ? MOUNTED_RULES.chariotWeight : MOUNTED_RULES.riderWeight;
          if (a.stats.mount && b.stats.mount) wa = wb = 1;
        }
        const tot = wa + wb;
        a.x -= nx * push * (2 * wa) / tot;
        a.y -= ny * push * (2 * wa) / tot;
        b.x += nx * push * (2 * wb) / tot;
        b.y += ny * push * (2 * wb) / tot;
      }
    }
    for (const u of this.units) {
      if (u.state !== 'ready') continue;
      u.x = clamp(u.x, UNIT_RADIUS, this.width - UNIT_RADIUS);
      u.y = clamp(u.y, UNIT_RADIUS, this.height - UNIT_RADIUS);
    }
    if (this.terrain) {
      // Shoved into rocks or the sea: step back out onto open ground.
      for (const u of this.units) {
        if (!this.isAlive(u) || !this.terrain.blocked(u.x, u.y)) continue;
        const p = this.freePoint(u.x, u.y);
        u.x = p.x;
        u.y = p.y;
      }
    }
  }

  private updateGroupStates(): void {
    for (const g of this.groups) {
      if (g.disbanded) continue;
      const mem = this.members(g.id);
      if (mem.length === 0) continue;
      let gone = 0;
      let routing = 0;
      for (const u of mem) {
        if (u.state === 'routing') routing++;
        if (u.state !== 'ready') gone++;
      }
      if (!g.routed && routing > 0 && gone / mem.length >= 0.5) {
        g.routed = true;
        this.events.push({ type: 'rout', tick: this.tick, side: g.side, group: g.id });
      } else if (g.routed && gone / mem.length < 0.5) {
        g.routed = false;
      }
    }
  }

  private checkEnd(): void {
    const ready: [number, number] = [0, 0];
    for (const u of this.units) if (u.state === 'ready') ready[u.side]++;
    let winner: Side | -1 | null = null;
    if (ready[0] === 0 && ready[1] === 0) winner = -1;
    else if (ready[0] === 0) winner = 1;
    else if (ready[1] === 0) winner = 0;
    else if (this.tick >= this.timeLimitTicks) {
      const s0 = this.sideStrength(0);
      const s1 = this.sideStrength(1);
      winner = s0 > s1 * 1.1 ? 0 : s1 > s0 * 1.1 ? 1 : -1;
    }
    if (winner !== null) {
      this.winner = winner;
      this.phase = 'ended';
      this.events.push({ type: 'end', tick: this.tick, winner });
    }
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  result(): BattleResult {
    return {
      winner: this.winner ?? -1,
      retreated: this.retreated,
      ticks: this.tick,
      units: this.units.map((u) => ({
        heroId: u.heroId,
        side: u.side,
        state: u.state,
        kills: u.kills,
        killedBy: u.killedBy,
        ko: u.ko,
        hp: Math.max(0, u.hp),
        maxHp: u.stats.maxHp,
        wear: { ...u.wear },
      })),
    };
  }

  /** Stable fingerprint of the full simulation state (for determinism tests / desync checks). */
  hash(): string {
    let h = 0x811c9dc5;
    const mix = (v: number) => {
      const s = v.toString();
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
    };
    mix(this.tick);
    mix(this.rng.state);
    for (const u of this.units) {
      mix(u.x);
      mix(u.y);
      mix(u.fx);
      mix(u.fy);
      mix(u.hp);
      mix(u.morale);
      mix(u.stamina);
      mix(u.ammo);
      mix(u.state.length);
      mix(u.stun);
      mix(u.berserk);
      mix(u.daze);
      for (const c of u.abilCd) mix(c);
      if (u.stats.mount) mix(u.spd);
    }
    for (const p of this.projectiles) {
      mix(p.tx);
      mix(p.ty);
    }
    return (h >>> 0).toString(16);
  }
}

const SIN60 = 0.8660254037844386;
const DIAG = Math.SQRT1_2;
/** Search directions for freePoint, in a fixed order (deterministic). */
const DIRS8: [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0], [DIAG, DIAG], [-DIAG, DIAG], [DIAG, -DIAG], [-DIAG, -DIAG]];

export function slotPriority(u: SimUnit): number {
  if (u.stats.role === 'ranged') return 3;
  if (u.stats.shield !== 'none' && u.stats.role === 'melee') return u.stats.weapon === 'spear' ? 0 : 1;
  if (u.stats.role === 'hybrid') return 2;
  return 1.5;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export type { Formation };
