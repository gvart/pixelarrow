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

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;
export const UNIT_RADIUS = 0.3;

export const RULES = {
  meleeHit: 0.68,
  dirDamage: { front: 1, side: 1.3, rear: 1.6 } as Record<HitDir, number>,
  dirMorale: { front: 1, side: 1.8, rear: 2.8 } as Record<HitDir, number>,
  sideBlockFactor: 0.35,
  shieldWallBlock: 0.15,
  shieldWallSpeed: 0.5,
  missileBlockFactor: 1.25,
  armorK: 12,
  moraleFromDamage: 0.7,
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
};

export type Phase = 'deploy' | 'battle' | 'ended';

export class Battle {
  readonly width: number;
  readonly height: number;
  readonly timeLimitTicks: number;
  readonly seed: number;
  rng: Rng;
  tick = 0;
  phase: Phase = 'deploy';
  units: SimUnit[] = [];
  groups: SimGroup[] = [];
  projectiles: Projectile[] = [];
  events: SimEvent[] = [];
  orderLog: LoggedOrder[] = [];
  winner: Side | -1 | null = null;
  private queue: { side: Side; order: Order }[] = [];
  private nextProjId = 1;
  private bots: BotAI[] = [];
  private firstContact: [boolean, boolean] = [false, false];

  constructor(setup: BattleSetup) {
    this.seed = setup.seed >>> 0;
    this.rng = new Rng(this.seed);
    this.width = setup.width ?? 24;
    this.height = setup.height ?? 36;
    this.timeLimitTicks = (setup.timeLimit ?? 300) * TICK_RATE;

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
        const s = spec.stats;
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

  deployZone(side: Side): { y0: number; y1: number } {
    return side === 0 ? { y0: this.height * 0.62, y1: this.height - 0.8 } : { y0: 0.8, y1: this.height * 0.38 };
  }

  slotPos(u: SimUnit): { x: number; y: number } {
    const f = this.groups[u.group].formation;
    const r = rightOf(f.fx, f.fy);
    return { x: f.cx + r.x * u.slotLat - f.fx * u.slotDep, y: f.cy + r.y * u.slotLat - f.fy * u.slotDep };
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
        g.formation = {
          type,
          cx: clamp(o.cx, 0.5, this.width - 0.5),
          cy: clamp(o.cy, 0.5, this.height - 0.5),
          fx,
          fy,
          frontage: Math.max(1, Math.min(n, Math.round(o.frontage))),
        };
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
    const front = side === 0 ? z.y0 + 2 : z.y1 - 2; // main line anchor
    const cx = this.width / 2;
    const roleOffset: Record<GroupRole, { dx: number; dy: number }> = {
      skirmish: { dx: 0, dy: 1.6 },
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
      g.formation = {
        type,
        cx: cx + dx,
        cy: clamp(front + off.dy * dir, z.y0, z.y1),
        fx: 0,
        fy: dir,
        frontage: presetFrontage(type, mem.length),
      };
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
    return s;
  }

  private updateUnit(u: SimUnit): void {
    u.vx = 0;
    u.vy = 0;
    if (!this.isAlive(u)) return;
    const g = this.groups[u.group];
    if (u.cooldown > 0) u.cooldown--;
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
    const reach = u.stats.reach + UNIT_RADIUS * 2;
    for (const e of this.units) {
      if (e.side === u.side || !this.isAlive(e)) continue;
      const dx = e.x - u.x;
      const dy = e.y - u.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (e.state === 'ready' && d < nearestD) {
        nearestD = d;
        nearest = e;
      }
      if (d <= reach) {
        // Prefer enemies in front of us, then the closest; ready over routing.
        const front = d > 1e-6 ? (dx * u.fx + dy * u.fy) / d : 1;
        const score = front * 2 - d + (e.state === 'ready' ? 1 : 0) + (e.id === u.targetId ? 0.5 : 0);
        if (score > meleeScore) {
          meleeScore = score;
          melee = e;
        }
      }
    }
    const shielded = g.shieldWall && u.stats.canShieldWall;
    u.engaged = !!melee;

    const slot = this.slotPos(u);
    let moveX = 0;
    let moveY = 0;
    let speed = this.walkSpeed(u, g);
    let faceX = g.formation.fx;
    let faceY = g.formation.fy;
    let running = false;

    if (melee && g.order !== 'fallback') {
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
      if (u.cooldown <= 0 && this.facingDot(u, melee) > 0.3) this.meleeAttack(u, melee);
      u.stamina = Math.max(0, u.stamina + 0.5 * DT);
    } else {
      const canShoot = u.ammo > 0 && u.stats.range > 0 && g.fireAtWill;
      const slotDx = slot.x - u.x;
      const slotDy = slot.y - u.y;
      const slotD = Math.sqrt(slotDx * slotDx + slotDy * slotDy);
      let shootTarget: SimUnit | null = null;
      if (canShoot && nearest && g.order !== 'fallback' && (slotD < 0.8 || g.role === 'skirmish' || g.order === 'charge')) {
        const range = u.stats.range;
        if (nearestD <= range && nearestD > 1.4) shootTarget = nearest;
      }
      if (shootTarget) {
        faceX = shootTarget.x - u.x;
        faceY = shootTarget.y - u.y;
        if (u.cooldown <= 0 && this.facingDot(u, shootTarget) > 0.7) this.shoot(u, shootTarget);
        u.stamina = Math.min(u.stats.stamina, u.stamina + 2 * DT);
      } else if (g.order === 'charge' && nearest && nearestD < 9) {
        moveX = nearest.x - u.x;
        moveY = nearest.y - u.y;
        faceX = moveX;
        faceY = moveY;
        speed = u.stats.speed * this.fatigue(u) * 1.75;
        running = true;
        u.targetId = nearest.id;
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

    // ---- movement
    const ml = Math.sqrt(moveX * moveX + moveY * moveY);
    if (ml > 1e-6) {
      const step = Math.min(speed * DT, ml);
      u.vx = (moveX / ml) * step;
      u.vy = (moveY / ml) * step;
      u.x += u.vx;
      u.y += u.vy;
      u.stamina = Math.max(0, u.stamina - (running ? 5 : shielded ? 1.2 : 0.4) * DT);
    }
    if (running && ml > 0.3) u.momentum++;
    else if (!u.engaged) u.momentum = Math.max(0, u.momentum - 2);
    u.x = clamp(u.x, UNIT_RADIUS, this.width - UNIT_RADIUS);
    u.y = clamp(u.y, UNIT_RADIUS, this.height - UNIT_RADIUS);

    this.turnToward(u, faceX, faceY, shielded ? 2.5 : 5);
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
    const speed = u.stats.speed * 1.6 * (u.stamina > 10 ? 1 : 0.7);
    u.vx = (mx / l) * speed * DT;
    u.vy = (my / l) * speed * DT;
    u.x = clamp(u.x + u.vx, UNIT_RADIUS, this.width - UNIT_RADIUS);
    u.y += u.vy;
    u.stamina = Math.max(0, u.stamina - 3 * DT);
    this.turnToward(u, mx, my, 8);
    if (nearD > 6) u.morale = Math.min(u.stats.morale, u.morale + 3.5 * DT);
    if (u.y < -0.5 || u.y > this.height + 0.5) {
      u.state = 'fled';
      u.engaged = false;
      return;
    }
    if (u.morale >= u.stats.morale * RULES.rallyFraction && nearD > 5) {
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
    if (u.engaged && this.tick % 10 === 0) {
      let allies = 0;
      let enemies = 0;
      for (const o of this.units) {
        if (o.state !== 'ready') continue;
        const d2 = (o.x - u.x) ** 2 + (o.y - u.y) ** 2;
        if (d2 > 9) continue;
        if (o.side === u.side) allies++;
        else enemies++;
      }
      if (enemies > allies + 1) u.morale -= 0.5 * (enemies - allies) * u.stats.moraleLoss;
    }
    if (u.stamina <= 0 && u.engaged && this.tick % 20 === 0) u.morale -= 1 * u.stats.moraleLoss;
    if (u.morale < u.stats.morale * RULES.routFraction && u.state === 'ready') this.rout(u);
  }

  private rout(u: SimUnit): void {
    u.state = 'routing';
    u.engaged = false;
    u.momentum = 0;
    this.events.push({ type: 'unitRout', tick: this.tick, unit: u.id });
    for (const a of this.units) {
      if (a.side !== u.side || a.state !== 'ready' || a === u) continue;
      if ((a.x - u.x) ** 2 + (a.y - u.y) ** 2 <= RULES.cascadeRadius ** 2) {
        a.morale -= RULES.allyRoutMorale * a.stats.moraleLoss;
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
    if (t.stats.shield === 'none' || t.state !== 'ready' || dir === 'rear') return 0;
    const g = this.groups[t.group];
    let b = t.stats.block;
    if (dir === 'side') b *= RULES.sideBlockFactor;
    const wall = g.shieldWall && t.stats.canShieldWall && dir === 'front';
    if (wall) b += RULES.shieldWallBlock;
    if (missile) b *= RULES.missileBlockFactor;
    b *= this.fatigue(t);
    b -= pierce;
    return clamp(b, 0, 0.85);
  }

  private meleeAttack(u: SimUnit, t: SimUnit): void {
    const g = this.groups[u.group];
    const tg = this.groups[t.group];
    const wall = g.shieldWall && u.stats.canShieldWall;
    u.cooldown = Math.round(u.stats.atkTime * TICK_RATE * (wall ? 1.2 : 1) / this.fatigue(u));
    u.lastAttackTick = this.tick;
    u.stamina = Math.max(0, u.stamina - 3);
    u.wear.weapon += 0.12;
    const dir = this.hitDirection(t, u.x, u.y);
    this.contactEvent(g);
    this.contactEvent(tg);

    const impact = u.momentum >= RULES.chargeMomentumTicks;
    if (!this.rng.chance(RULES.meleeHit + (t.stamina < RULES.lowStamina ? 0.08 : 0))) {
      u.momentum = 0;
      return;
    }
    if (this.rng.chance(this.blockChance(t, dir, u.stats.blockPierce, false))) {
      t.stamina = Math.max(0, t.stamina - (impact ? 10 : 3));
      t.lastBlockTick = this.tick;
      t.wear.shield += impact ? 1.5 : 0.6;
      t.morale -= (impact ? 4 : 0.4) * t.stats.moraleLoss;
      if (impact) {
        u.momentum = 0;
        this.events.push({ type: 'impact', tick: this.tick, unit: t.id, by: u.id });
      }
      this.events.push({ type: 'block', tick: this.tick, unit: t.id, by: u.id });
      return;
    }
    let dmg = u.stats.dmg * this.rng.range(0.8, 1.2) * RULES.dirDamage[dir];
    let moraleMult = 1 + u.stats.moraleShock;
    if (impact) {
      const braced = tg.shieldWall && t.stats.canShieldWall && dir === 'front';
      dmg *= RULES.chargeImpact + u.stats.chargeBonus * 0.5;
      moraleMult += 0.8;
      if (braced) dmg *= 0.7;
      else t.stun = 8;
      u.momentum = 0;
      this.events.push({ type: 'impact', tick: this.tick, unit: t.id, by: u.id });
    }
    // Spearmen standing their ground punish an enemy charging onto their points.
    if (u.stats.weapon === 'spear' && t.momentum >= RULES.chargeMomentumTicks && g.order !== 'charge') {
      dmg *= 1 + u.stats.chargeBonus * 1.5;
      t.momentum = 0;
    }
    if (t.state === 'routing') dmg *= RULES.routingDamage;
    this.applyDamage(t, u, dmg, dir, false, moraleMult);
  }

  private contactEvent(g: SimGroup): void {
    g.contact = true;
    if (!this.firstContact[g.side]) {
      this.firstContact[g.side] = true;
      this.events.push({ type: 'contact', tick: this.tick, side: g.side, group: g.id });
    }
  }

  private applyDamage(t: SimUnit, by: SimUnit, raw: number, dir: HitDir, ranged: boolean, moraleMult: number): void {
    const dmg = Math.max(0.5, (raw * RULES.armorK) / (RULES.armorK + t.stats.armor));
    t.hp -= dmg;
    t.lastHitTick = this.tick;
    t.wear.armor += 0.5;
    t.wear.helmet += 0.3;
    by.dmgDealt += dmg;
    t.morale -= dmg * RULES.moraleFromDamage * RULES.dirMorale[dir] * t.stats.moraleLoss * moraleMult * (ranged ? 0.8 : 1);
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
    by.kills++;
    this.events.push({ type: 'death', tick: this.tick, unit: t.id, by: by.id });
    const r2 = RULES.cascadeRadius ** 2;
    for (const o of this.units) {
      if (o.state !== 'ready') continue;
      if ((o.x - t.x) ** 2 + (o.y - t.y) ** 2 > r2) continue;
      if (o.side === t.side) o.morale -= RULES.allyDeathMorale * o.stats.moraleLoss;
      else o.morale = Math.min(o.stats.morale + 10, o.morale + RULES.enemyDeathMorale);
    }
  }

  private shoot(u: SimUnit, t: SimUnit): void {
    const kind: ProjectileKind = u.stats.weapon === 'bow' ? 'arrow' : u.stats.weapon === 'sling' ? 'stone' : 'javelin';
    const speed = kind === 'arrow' ? 20 : kind === 'stone' ? 18 : 13;
    const dx = t.x - u.x;
    const dy = t.y - u.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const dur = Math.max(6, Math.round((d / speed) * TICK_RATE));
    // Lead the target a little, then scatter by inaccuracy.
    const lead = dur * 0.6;
    const spread = (1 - u.stats.accuracy) * (0.35 + d * 0.09);
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
      dmg: u.stats.rangedDmg,
      done: false,
      hitId: -1,
    };
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
        const d = Math.sqrt((e.x - p.tx) ** 2 + (e.y - p.ty) ** 2);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      if (!best) {
        this.events.push({ type: 'land', tick: this.tick, proj: p.id, hit: false });
        continue;
      }
      p.hitId = best.id;
      const dir = this.hitDirection(best, p.sx, p.sy);
      const pierce = p.kind === 'javelin' ? shooter.stats.blockPierce + 0.05 : 0;
      if (this.rng.chance(this.blockChance(best, dir, pierce, true))) {
        best.lastBlockTick = this.tick;
        best.wear.shield += 0.5;
        best.morale -= 0.6 * best.stats.moraleLoss;
        this.events.push({ type: 'block', tick: this.tick, unit: best.id, by: shooter.id });
        this.events.push({ type: 'land', tick: this.tick, proj: p.id, hit: true });
        continue;
      }
      const dirMult = dir === 'front' ? 1 : dir === 'side' ? 1.15 : 1.3;
      const dmg = p.dmg * this.rng.range(0.8, 1.2) * dirMult;
      this.events.push({ type: 'land', tick: this.tick, proj: p.id, hit: true });
      this.applyDamage(best, shooter, dmg, dir, true, 1);
    }
    // Keep finished projectiles briefly for rendering (stuck javelins), then drop.
    if (this.tick % 20 === 0) {
      this.projectiles = this.projectiles.filter((p) => !p.done || this.tick - (p.t0 + p.dur) < 60);
    }
  }

  private separate(): void {
    const n = this.units.length;
    const min = UNIT_RADIUS * 2;
    for (let i = 0; i < n; i++) {
      const a = this.units[i];
      if (a.state !== 'ready' && a.state !== 'routing') continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.units[j];
        if (b.state !== 'ready' && b.state !== 'routing') continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
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
        const wa = this.groups[a.group].shieldWall && a.stats.canShieldWall ? 0.4 : 1;
        const wb = this.groups[b.group].shieldWall && b.stats.canShieldWall ? 0.4 : 1;
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
      ticks: this.tick,
      units: this.units.map((u) => ({
        heroId: u.heroId,
        side: u.side,
        state: u.state,
        kills: u.kills,
        killedBy: u.killedBy,
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
    }
    for (const p of this.projectiles) {
      mix(p.tx);
      mix(p.ty);
    }
    return (h >>> 0).toString(16);
  }
}

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
