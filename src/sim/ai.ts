/**
 * Simple deterministic battle bot. Thinks every few ticks and issues the same
 * Orders a human would. Tactics: keep the line, skirmishers screen then
 * retire behind the line, flankers swing wide and hit the side, the reserve is
 * committed when the main line wavers or the enemy breaks.
 */
import type { Battle } from './battle';
import { Rng } from './rng';
import { presetFrontage, rightOf, type FormationType } from './formation';
import type { DoctrineId, Side, SimGroup, SimUnit, WorkType } from './types';
import { rallyRadius } from './stats';
import { clamp } from '../util/math';
import { DOCTRINES, RETREAT_SHARE, SKIRMISH_RIDER_EXTRA, battleTimers, doctrineOf, type Doctrine, type DoctrineTimers } from '../data/doctrines';

/**
 * The steady defaults. Every doctrine timer and threshold is read from the
 * army's doctrine (src/data/doctrines.ts, ai-doctrines.md R1); these names
 * stay exported as the steady values, today's AI.
 */
/** Seconds without any combat before the bot commits everything to an attack. */
export const PRESS_IDLE_S = DOCTRINES.steady.pressIdleS;
/** A line holding a hill under missiles gives it up after this long. */
const HILL_SHOT_S = 22;
/** Riders wait this long for the lines to meet (or less when the enemy shoots). */
const CAV_WAIT_S = 10;
const CAV_SHOOTER_WAIT_S = 3;
/** Animals leave their lair by this time at the latest. */
const BEAST_WAIT_S = 45;

interface GroupMemo {
  stage: number;
  flankSign: number;
  /** Main line: tick until which it waits on its own bank rather than ford under fire. */
  fordWait: number;
  /** Riders: tick the current stage began (charge, regroup). */
  since?: number;
  /** Riders: id of the enemy group they are working round. */
  target?: number;
}

/** What a group is made of, for the tactics the bot uses with it. */
type GroupKind = 'foot' | 'cavalry' | 'horse_archers' | 'beasts';

function groupKind(mem: SimUnit[]): GroupKind {
  let riders = 0;
  let shooters = 0;
  let beasts = 0;
  for (const u of mem) {
    if (u.stats.kind === 'animal') beasts++;
    else if (u.stats.mount) {
      riders++;
      if (u.stats.role === 'ranged' && u.ammo > 0) shooters++;
    }
  }
  if (beasts * 2 > mem.length) return 'beasts';
  if (riders * 2 > mem.length) return shooters * 2 > riders ? 'horse_archers' : 'cavalry';
  return 'foot';
}

/** Riders stop and pull back after this long locked in a melee they are not winning. */
const CAV_MELEE_S = 4;
/** ... and regroup this long before the next charge. */
const CAV_REGROUP_S = 3;

/** Seconds a bot line will hold a hill (or wait at a contested ford) before it gives up and attacks. */
export const HOLD_HILL_S = DOCTRINES.steady.holdHillS;
export const FORD_WAIT_S = DOCTRINES.steady.fordWaitS;

/** The doctrines that answer a turtle with a stand-off (ai-doctrines.md R5). */
const STAND_OFF_DOCTRINES: readonly DoctrineId[] = ['swarm', 'hammer'];
/** Seconds the enemy must have held still, behind works or in an orb, before a stand-off (R5). */
export const STAND_OFF_S = 20;
/** A stand-off ends once our missile-men have loosed nothing for this long (out of reach, or out of ammo). */
const STAND_OFF_QUIET_S = 10;
/** Paces in front of the line (or out from a palisade gate) that a bot lays its works (field-works.md R6). */
export const WORKS_OUT = 2;
/** EC-05: a garrison behind its palisade stays at its posts until an enemy comes within this many paces of the wall. */
export const WALL_REACH = 2;
/** EC-05 focus fire: a missile group focuses an enemy group whose centre is within its longest range plus this. */
const FOCUS_SLACK = 2;
/** EC-05 orb: riders this close off a foot group's facing close it into an orb (FO-02's answer row: 8)... */
const ORB_HORSE_NEAR = 8;
/** ...it opens again once no rider is this close, or enemy foot comes this close. */
const ORB_HORSE_LEAVE = 12;
const ORB_FOOT_NEAR = 6;
/** EC-05 orb: a group closes into an orb only with no enemy foot this close (riders alone, no line coming on). */
const ORB_FOOT_CLEAR = 12;
/** ...nor with its own stakes this close: they already cover the flank. */
const ORB_STAKES_NEAR = 6;
/** ...nor with another group of ours this close: the orb is for a group left on its own. */
const ORB_ALONE = 8;

export class BotAI {
  readonly side: Side;
  private rng: Rng;
  private memo = new Map<number, GroupMemo>();
  /** The army's doctrine (ai-doctrines.md); missing = steady. */
  readonly doctrine: Doctrine;
  /** This battle's timers: jittered (F2) and, for the press, capped for small armies (F1). Set by deploy. */
  timers!: DoctrineTimers;

  /** Never retreats whatever the doctrine says (ArmySpec.holdField, V5-052). */
  readonly holdField: boolean;

  constructor(side: Side, seed: number, doctrine?: DoctrineId, holdField = false) {
    this.side = side;
    this.rng = new Rng(seed);
    this.doctrine = doctrineOf(doctrine);
    this.holdField = holdField;
  }

  private mem(g: SimGroup): GroupMemo {
    let m = this.memo.get(g.id);
    if (!m) {
      m = { stage: 0, flankSign: this.rng.chance(0.5) ? 1 : -1, fordWait: 0 };
      this.memo.set(g.id, m);
    }
    return m;
  }

  deploy(b: Battle): void {
    // F1, F2: drawn once, before any other draw of the bot's RNG.
    const men = b.units.filter((u) => u.side === this.side && u.state === 'ready').length;
    this.timers = battleTimers(this.doctrine, men, () => this.rng.next());
    const shape = this.doctrine.preferShape;
    for (const g of b.sideGroups(this.side)) {
      const n = b.activeMembers(g.id).length;
      if (n === 0) continue;
      if (b.special) {
        const kind = groupKind(b.activeMembers(g.id));
        if (kind === 'cavalry') {
          b.issue(this.side, { kind: 'preset', group: g.id, type: n >= 5 && this.rng.chance(0.5) ? 'wedge' : 'line' });
          continue;
        }
        if (kind === 'horse_archers' || kind === 'beasts') {
          b.issue(this.side, { kind: 'preset', group: g.id, type: 'skirmish' });
          continue;
        }
      }
      const shields = b.activeMembers(g.id).filter((u) => u.stats.canShieldWall).length;
      if (g.role === 'main' && shape !== 'line') {
        // R2 "Shape per group": shielded spearmen keep a line rather than open into skirmish order.
        b.issue(this.side, { kind: 'preset', group: g.id, type: shape === 'skirmish' && shields >= n * 0.5 ? 'line' : shape });
      } else if (g.role === 'main' && shields >= n * 0.7 && this.rng.chance(0.5)) {
        b.issue(this.side, { kind: 'preset', group: g.id, type: 'shieldwall' });
      } else if (g.role === 'skirmish') {
        b.issue(this.side, { kind: 'preset', group: g.id, type: 'skirmish' });
      } else if (g.role === 'flank') {
        b.issue(this.side, { kind: 'preset', group: g.id, type: shape === 'wedge' || this.rng.chance(0.5) ? 'wedge' : 'column' });
      } else if (g.role === 'reserve') {
        b.issue(this.side, { kind: 'preset', group: g.id, type: 'line' });
      }
    }
    if (b.terrain) this.deployOnTerrain(b);
    // field-works.md R6: at the end of the deploy step. A side without an allowance issues nothing.
    placeWorks(b, this.side);
    this.manWalls(b);
  }

  /**
   * EC-05 (AR-02 finding 1): a side behind its own palisade (a lair garrison)
   * mans it. Every group keeps a post inside the wall: the skirmishers form
   * up behind the main line instead of out in front of the palisade, and the
   * posts are where think() sends the groups back to while no enemy is inside.
   */
  private manWalls(b: Battle): void {
    const gaps = gateGaps(b, this.side);
    if (gaps.length === 0) return;
    this.wallY = gaps[0].y;
    const groups = b.sideGroups(this.side).filter((g) => b.activeMembers(g.id).length > 0);
    const main = groups.find((g) => g.role === 'main');
    for (const g of groups) {
      if (g.role === 'skirmish' && main && this.outside(g.formation.cy, 0)) {
        const mf = main.formation;
        const n = b.activeMembers(g.id).length;
        const depth = Math.ceil(b.activeMembers(main.id).length / Math.max(1, mf.frontage));
        b.issue(this.side, { kind: 'form', group: g.id, cx: mf.cx, cy: mf.cy - mf.fy * (depth + 1), fx: mf.fx, fy: mf.fy, frontage: presetFrontage('skirmish', n), type: 'skirmish' });
      }
      const f = g.formation;
      this.posts.set(g.id, { cx: f.cx, cy: f.cy, fx: f.fx, fy: f.fy, frontage: f.frontage });
    }
  }

  /** y of our palisade (null: no walls to hold). */
  private wallY: number | null = null;
  /** Each group's post behind the palisade. */
  private posts = new Map<number, { cx: number; cy: number; fx: number; fy: number; frontage: number }>();

  /** A y outside our palisade (on the attacker's side of it), `margin` paces past it. */
  private outside(y: number, margin: number): boolean {
    if (this.wallY === null) return false;
    return this.side === 1 ? y > this.wallY + margin : y < this.wallY - margin;
  }

  /**
   * Behind the palisade with every enemy still outside it: each group goes
   * back to its post and holds, the missile-men loose at will. Once an enemy
   * is at a gate or inside, the usual tactics take over. True = handled.
   */
  private holdWalls(b: Battle, enemies: SimUnit[]): boolean {
    if (this.wallY === null || enemies.some((e) => !this.outside(e.y, WALL_REACH))) return false;
    for (const g of b.sideGroups(this.side)) {
      const mem = b.activeMembers(g.id);
      const post = this.posts.get(g.id);
      if (mem.length === 0 || g.routed || g.individual || !post) continue;
      const f = g.formation;
      if ((f.cx - post.cx) ** 2 + (f.cy - post.cy) ** 2 > 1) b.issue(this.side, { kind: 'form', group: g.id, ...post, frontage: Math.min(post.frontage, mem.length) });
      if (g.order !== 'hold') b.issue(this.side, { kind: 'order', group: g.id, order: 'hold' });
      if (!g.fireAtWill && mem.some((u) => u.stats.role !== 'melee' && u.ammo > 0)) b.issue(this.side, { kind: 'loose', group: g.id, on: true });
    }
    return true;
  }

  /**
   * Use the ground: the main line takes the highest ground in the deployment
   * zone (if it is clearly higher than where it stands), skirmishers form up
   * in the nearest wood toward the enemy.
   */
  private deployOnTerrain(b: Battle): void {
    const t = b.terrain!;
    const z = b.deployZone(this.side);
    const groups = b.sideGroups(this.side);
    const main = groups.find((g) => g.role === 'main' && b.activeMembers(g.id).length > 0);
    if (main) {
      const f = main.formation;
      const half = Math.max(1, (f.frontage - 1) / 2);
      const lineHeight = (cx: number, cy: number): number => {
        let sum = 0;
        let k = 0;
        for (let dx = -half; dx <= half + 1e-9; dx += 1) {
          const x = cx + dx;
          if (x < 0.5 || x > b.width - 0.5 || t.blocked(x, cy) || t.isWater(x, cy)) return -1;
          sum += t.heightAt(x, cy);
          k++;
        }
        return k ? sum / k : 0;
      };
      const here = lineHeight(f.cx, f.cy);
      let best = { x: f.cx, y: f.cy, s: here };
      for (let cy = Math.ceil(z.y0) + 0.5; cy < z.y1 - 1; cy += 1) {
        for (let cx = half + 1; cx < b.width - half - 1; cx += 1) {
          const hgt = lineHeight(cx, cy);
          if (hgt < 0) continue;
          // prefer the high ground, then staying near the centre and the front
          const s = hgt - Math.abs(cx - b.width / 2) * 0.03 - Math.abs(cy - f.cy) * 0.02;
          if (s > best.s + 0.01) best = { x: cx, y: cy, s };
        }
      }
      if (best.s >= 0.9 && best.s > here + 0.6) {
        b.issue(this.side, { kind: 'form', group: main.id, cx: best.x, cy: best.y, fx: f.fx, fy: f.fy, frontage: f.frontage });
      }
    }
    for (const g of groups) {
      if (g.role !== 'skirmish' || b.activeMembers(g.id).length === 0) continue;
      const f = g.formation;
      const spot = this.forestSpot(b, f.cx, f.cy, 7, (_x, y) => y >= z.y0 && y <= z.y1);
      if (spot) b.issue(this.side, { kind: 'form', group: g.id, cx: spot.x, cy: spot.y, fx: f.fx, fy: f.fy, frontage: f.frontage });
    }
  }

  /**
   * A spot in a wood near (x, y) within r that passes the filter: close by,
   * and deep enough in the trees that the whole group (its ranks extend
   * backwards, away from the enemy) stands in cover.
   */
  private forestSpot(b: Battle, x: number, y: number, r: number, ok: (x: number, y: number) => boolean): { x: number; y: number } | null {
    const t = b.terrain;
    if (!t) return null;
    const back = this.side === 0 ? 1 : -1;
    const wood = (px: number, py: number) => (px > 0 && py > 0 && px < b.width && py < b.height && t.at(px, py).kind === 'forest' ? 1 : 0);
    let best: { x: number; y: number } | null = null;
    let bs = Infinity;
    for (let i = 0; i < t.cells; i++) {
      if (t.cellDef(i).kind !== 'forest') continue;
      const c = t.cellCenter(i);
      const d = Math.sqrt((c.x - x) ** 2 + (c.y - y) ** 2);
      if (d > r || !ok(c.x, c.y)) continue;
      let dense = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, back], [-1, back], [1, back], [0, back * 2]]) dense += wood(c.x + dx, c.y + dy);
      const score = d * 0.5 - dense;
      if (score < bs) {
        bs = score;
        best = c;
      }
    }
    return best;
  }

  /** Average height level under a group's men. */
  private groupHeight(b: Battle, mem: SimUnit[]): number {
    let s = 0;
    for (const u of mem) s += b.heightAt(u.x, u.y);
    return mem.length ? s / mem.length : 0;
  }

  /** The line stands on high ground the enemy would have to climb. */
  private holdsHill(b: Battle, mem: SimUnit[], ec: { x: number; y: number }): boolean {
    if (!b.terrain) return false;
    const mine = this.groupHeight(b, mem);
    return mine >= 0.75 && mine >= b.heightAt(ec.x, ec.y) + 0.75;
  }

  think(b: Battle): void {
    if ((b.tick + this.side * 5) % 10 !== 0) return;
    const enemies = b.units.filter((u) => u.side !== this.side && u.state === 'ready');
    if (enemies.length === 0) return;
    if (this.shouldRetreat(b)) {
      b.issue(this.side, { kind: 'retreat' });
      return;
    }
    this.thinkAbilities(b);
    // A mythical beast across the field: fight it as a hunt, not a battle line (src/sim/myth.ts).
    if (b.myth && enemies.some((e) => e.stats.boss !== undefined)) {
      this.thinkHunt(b, enemies);
      return;
    }
    if (this.holdWalls(b, enemies)) return;
    const t = b.tick / 20;
    const myGroups = b.sideGroups(this.side);
    const main = myGroups.find((g) => g.role === 'main' && b.activeMembers(g.id).length > 0);
    const enemyRouted = b.groups.some((g) => g.side !== this.side && g.routed);
    const ec = centroid(enemies);

    // Nothing happening (no blow, block or missile on either side for a while)?
    // Press the attack with everything that can still fight, so battles do not
    // drift into a stand-off until the time limit.
    let lastAction = 0;
    for (const u of b.units) lastAction = Math.max(lastAction, u.lastAttackTick, u.lastShotTick, u.lastHitTick, u.lastBlockTick);
    const idle = (b.tick - lastAction) / 20;
    const T = this.timers;
    // ai-doctrines.md R5 stand-off: against a turtle the press waits and the missile-men work.
    const standOff = STAND_OFF_DOCTRINES.includes(this.doctrine.id) ? this.standOff(b, enemies) : -1;
    if (standOff < 0 && t > T.pressAfterS && idle > T.pressIdleS) {
      for (const g of myGroups) {
        const mem = b.activeMembers(g.id);
        if (mem.length === 0 || g.routed) continue;
        // Horse archers never close in: they keep shooting or keep away.
        if (b.special && groupKind(mem) === 'horse_archers') continue;
        const c = centroid(mem);
        const near = nearest(enemies, c.x, c.y);
        if (g.role === 'main' && g.order === 'hold' && t < T.holdHillS && near.d < 12 && this.holdsHill(b, mem, ec)) continue;
        this.mem(g).stage = 9; // committed: the role logic below just keeps charging
        if (g.order !== 'charge') {
          this.face(b, g, near.u.x, near.u.y);
          b.issue(this.side, { kind: 'order', group: g.id, order: near.d < 9 ? 'charge' : 'advance' });
        }
      }
      return;
    }

    for (const g of myGroups) {
      const mem = b.activeMembers(g.id);
      if (mem.length === 0 || g.individual) continue;
      const c = centroid(mem);
      const near = nearest(enemies, c.x, c.y);
      const m = this.mem(g);
      if (standOff >= 0 && this.holdOff(b, g, mem, standOff)) continue;
      if (standOff < 0) this.focusFire(b, g, mem, c, main);
      if (this.ringAgainstHorse(b, g, mem, enemies)) continue;
      if (b.special) {
        const kind = groupKind(mem);
        if (kind === 'cavalry') {
          this.thinkCavalry(b, g, mem, near, enemies, main, m, t);
          continue;
        }
        if (kind === 'horse_archers') {
          this.thinkHorseArchers(b, g, mem, enemies, m, t);
          continue;
        }
        if (kind === 'beasts') {
          this.thinkBeasts(b, g, mem, near, t);
          continue;
        }
        if (g.role === 'main' || g.role === 'reserve') this.braceForHorse(b, g, mem, c, enemies);
      }
      switch (g.role) {
        case 'main':
          this.thinkMain(b, g, mem, near, ec, t, m);
          break;
        case 'skirmish':
          this.thinkSkirmish(b, g, mem, near, main, m);
          break;
        case 'flank':
          this.thinkFlank(b, g, near, ec, main, m, t, enemies);
          break;
        case 'reserve':
          this.thinkReserve(b, g, mem, near, main, m, t, enemyRouted);
          break;
      }
    }
  }

  /**
   * Heroes use their abilities through the same logged orders a player issues:
   * bash the man in front, fury when the fight is on, a shout when friends
   * waver, a volley when several missile-men have targets. The signature
   * actives follow abilities.md R6 (Wheel and Re-charge is the cavalry
   * logic's, in thinkCavalry).
   */
  private thinkAbilities(b: Battle): void {
    if (b.horns[this.side] > 0) {
      // The war horn: sounded once, when the army is breaking (several men running or nerve failing all round).
      let routing = 0;
      let alive = 0;
      let nerve = 0;
      for (const u of b.units) {
        if (u.side !== this.side || !b.isAlive(u)) continue;
        alive++;
        if (u.state === 'routing') routing++;
        else nerve += u.morale / Math.max(1, u.stats.morale);
      }
      if (alive > 0 && (routing >= Math.max(2, alive * 0.25) || nerve / Math.max(1, alive - routing) < 0.42)) b.issue(this.side, { kind: 'horn' });
    }
    const aimed = new Set<number>(); // one Aimed Volley per group per think (groupMode 'one')
    for (const u of b.units) {
      if (u.side !== this.side || u.state !== 'ready' || u.abil.length === 0) continue;
      for (const id of u.abil) {
        if (id === 'aimed') {
          if (!aimed.has(u.group) && this.thinkAimed(b, u)) aimed.add(u.group);
          continue;
        }
        if (!b.abilityReady(u, id)) continue;
        let use = false;
        switch (id) {
          case 'bash':
            use = u.engaged && this.rng.chance(0.5);
            break;
          case 'berserk': {
            // Fury when locked in a frontal fight (not while being flanked).
            const t = b.units[u.targetId];
            const front = !!t && t.state === 'ready' && b.hitDirection(u, t.x, t.y) === 'front';
            use = u.engaged && front && (u.morale < u.stats.morale * 0.8 || this.rng.chance(0.35));
            break;
          }
          case 'volley':
            use = b.volleyShooters(u).length >= 2 || this.rng.chance(0.1);
            break;
          case 'rally': {
            const r2 = rallyRadius(u.stats) ** 2;
            let shaken = 0;
            for (const a of b.units) {
              if (a.side !== u.side || !b.isAlive(a)) continue;
              if ((a.x - u.x) ** 2 + (a.y - u.y) ** 2 > r2) continue;
              if (a.state === 'routing' || a.morale < a.stats.morale * 0.5) shaken += 2;
              else if (a.morale < a.stats.morale * 0.7) shaken++;
            }
            use = shaken >= 3;
            break;
          }
          case 'push':
            // in frontal melee with a foe who is not braced (abilityReady checks both)
            use = true;
            break;
          case 'sunder':
            use = u.engaged && this.rng.chance(0.5); // as the bash
            break;
          case 'bond': {
            // the group is in melee and its nerve is going: morale share below 0.6
            const g = b.groups[u.group];
            const mem = b.activeMembers(u.group);
            const share = mem.reduce((a, m) => a + m.morale / Math.max(1, m.stats.morale), 0) / Math.max(1, mem.length);
            use = g.contact && share < 0.6;
            break;
          }
          case 'warcry':
            // at first contact, or when the enemy within 5 is wavering
            use = b.groups[u.group].contact || b.warcryTargets(u).some((e) => e.morale < e.stats.morale * 0.5);
            break;
          case 'scythe':
            use = b.scytheVictims(u) >= 3;
            break;
          case 'recharge':
            break; // thinkCavalry: riders locked in melee too long
        }
        if (use) b.issue(this.side, { kind: 'ability', unit: u.id, ability: id });
      }
    }
  }

  /**
   * Aimed Volley (abilities.md R6): with at least 2 shooters of the group in
   * range of one enemy group. It needs a focus: a group with one uses it; a
   * group without one focuses that enemy group for the volley and clears the
   * focus again (doctrines with focusMissiles prefer enemy missile-men).
   */
  private thinkAimed(b: Battle, u: SimUnit): boolean {
    if (b.phase !== 'battle' || u.stun > 0 || b.abilityCooldown(u, 'aimed') !== 0) return false;
    const g = b.groups[u.group];
    const focus = g.focus ?? -1;
    if (focus >= 0) {
      if (b.aimedShooters(u).length < 2) return false;
      b.issue(this.side, { kind: 'ability', unit: u.id, ability: 'aimed' });
      return true;
    }
    let best = -1;
    let bestScore = 0;
    for (const eg of b.groups) {
      if (eg.side === this.side || eg.disbanded) continue;
      const n = b.aimedShooters(u, eg.id).length;
      if (n < 2) continue;
      const mem = b.activeMembers(eg.id);
      const missile = mem.length > 0 && mem.filter((e) => e.stats.role !== 'melee').length * 2 >= mem.length;
      const score = n + (this.doctrine.focusMissiles && missile ? 100 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = eg.id;
      }
    }
    if (best < 0) return false;
    b.issue(this.side, { kind: 'focus', group: g.id, target: best });
    b.issue(this.side, { kind: 'ability', unit: u.id, ability: 'aimed' });
    b.issue(this.side, { kind: 'focus', group: g.id, target: -1 });
    return true;
  }

  /**
   * Against a beast: missile-men keep their distance and shoot, the main line
   * closes in (spearmen facing a charger stand braced and let it come), the
   * flank and reserve work round to the beast's side and rear.
   */
  private thinkHunt(b: Battle, enemies: SimUnit[]): void {
    const myth = b.myth!;
    const bodies = enemies.filter((e) => myth.isBody(e) && b.isAlive(e));
    const target = bodies[0] ?? enemies[0];
    const flyers = target.stats.boss === 'harpy';
    const charger = target.stats.boss === 'minotaur';
    const ranged = b.sideGroups(this.side).filter((g) => {
      const mem = b.activeMembers(g.id);
      return mem.length > 0 && mem.filter((u) => u.stats.role !== 'melee' && u.ammo > 0).length * 2 > mem.length;
    });
    const rc = ranged.length ? centroid(ranged.flatMap((g) => b.activeMembers(g.id))) : null;
    for (const g of b.sideGroups(this.side)) {
      const mem = b.activeMembers(g.id);
      if (mem.length === 0 || g.routed || g.individual) continue;
      const c = centroid(mem);
      const m = this.mem(g);
      const tx = target.x;
      const ty = target.y;
      const d = Math.sqrt((tx - c.x) ** 2 + (ty - c.y) ** 2) - target.rad;
      if (ranged.includes(g)) {
        if (!g.fireAtWill) b.issue(this.side, { kind: 'loose', group: g.id, on: true });
        const range = Math.max(...mem.map((u) => u.stats.range));
        // keep out of reach of anything that walks; shoot from range
        if (!flyers && b.tick % 20 === 0) {
          let dx = c.x - tx;
          let dy = c.y - ty;
          const l = Math.sqrt(dx * dx + dy * dy) || 1;
          dx /= l;
          dy /= l;
          const want = Math.max(3.5, range - 1.5);
          if (Math.abs(d - want) > 1.5) {
            const nx = clamp(tx + dx * (want + target.rad), 1, b.width - 1);
            const ny = clamp(ty + dy * (want + target.rad), 1, b.height - 1);
            b.issue(this.side, { kind: 'form', group: g.id, cx: nx, cy: ny, fx: -dx, fy: -dy, frontage: g.formation.frontage });
          }
        }
        continue;
      }
      if (flyers) {
        // stand by the archers: the harpies come to us, and are cut down when they land
        if (rc && b.tick % 40 === 0) {
          const f = g.formation;
          if ((f.cx - rc.x) ** 2 + (f.cy - rc.y) ** 2 > 9) b.issue(this.side, { kind: 'form', group: g.id, cx: rc.x, cy: rc.y + (this.side === 0 ? -1.5 : 1.5), fx: 0, fy: this.side === 0 ? -1 : 1, frontage: f.frontage });
        }
        continue;
      }
      if (g.role === 'main' || bodies.length === 0) {
        const braced = charger && g.shieldWall && mem.filter((u) => u.stats.weapon === 'spear').length * 2 >= mem.length;
        if (braced) {
          // a hedge of spears turned to the bull: let it come
          // keep facing it and step towards it slowly (the wall moves with the bull)
          const f = g.formation;
          if (b.tick % 40 === 0 && d > 3) {
            let dx = tx - f.cx;
            let dy = ty - f.cy;
            const l = Math.sqrt(dx * dx + dy * dy) || 1;
            dx /= l;
            dy /= l;
            b.issue(this.side, { kind: 'form', group: g.id, cx: f.cx + dx * Math.min(2, d - 2.5), cy: f.cy + dy * Math.min(2, d - 2.5), fx: dx, fy: dy, frontage: f.frontage });
          } else this.face(b, g, tx, ty);
          if (g.order !== 'hold') b.issue(this.side, { kind: 'order', group: g.id, order: 'hold' });
          continue;
        }
        if (g.order !== 'charge' && d < 5) {
          this.face(b, g, tx, ty);
          b.issue(this.side, { kind: 'order', group: g.id, order: 'charge' });
        } else if (g.order === 'hold' && d >= 5) {
          this.face(b, g, tx, ty, 'advance');
          if (g.order === 'hold') b.issue(this.side, { kind: 'order', group: g.id, order: 'advance' });
        }
        continue;
      }
      // flank and reserve: round to the beast's side, then in
      if (m.stage < 2) {
        const side = (m.flankSign || 1) * (g.role === 'reserve' ? -1 : 1);
        const ax = clamp(tx - target.fy * side * (target.rad + 2) - target.fx * (target.rad + 0.5), 1, b.width - 1);
        const ay = clamp(ty + target.fx * side * (target.rad + 2) - target.fy * (target.rad + 0.5), 1, b.height - 1);
        const da = Math.sqrt((ax - c.x) ** 2 + (ay - c.y) ** 2);
        if (da < 2.2 || d < 2) {
          m.stage = 2;
        } else if (b.tick % 20 === 0) {
          let fx = ax - c.x;
          let fy = ay - c.y;
          const l = Math.sqrt(fx * fx + fy * fy) || 1;
          fx /= l;
          fy /= l;
          const step = Math.min(l, 5);
          b.issue(this.side, { kind: 'form', group: g.id, cx: c.x + fx * step, cy: c.y + fy * step, fx, fy, frontage: g.formation.frontage });
          continue;
        } else continue;
      }
      if (g.order !== 'charge') {
        this.face(b, g, tx, ty);
        b.issue(this.side, { kind: 'order', group: g.id, order: 'charge' });
      }
    }
  }

  /**
   * R5 retreatAt: the bot quits the field once its losses (dead, routing or
   * fled) reach the doctrine's share and it is not winning (its share of the
   * men still fighting is below RETREAT_SHARE). 0 = never.
   */
  private shouldRetreat(b: Battle): boolean {
    const at = this.holdField ? 0 : this.doctrine.retreatAt;
    if (at <= 0) return false;
    let mine = 0;
    let lost = 0;
    let ready = 0;
    let foes = 0;
    for (const u of b.units) {
      if (u.side !== this.side) {
        if (u.state === 'ready') foes++;
        continue;
      }
      mine++;
      if (u.state === 'ready') ready++;
      else lost++;
    }
    return mine > 0 && lost >= mine * at && ready < (ready + foes) * RETREAT_SHARE;
  }

  /** hillFlank (R5): the main line will not climb into a held hill yet. */
  private refusesHill(b: Battle, mem: SimUnit[], ec: { x: number; y: number }, t: number): boolean {
    return this.doctrine.hillFlank && t < this.timers.holdHillS && this.enemyHoldsHill(b, mem, ec) && !this.flankIn(b);
  }

  /** The enemy stands on high ground above our line (the ridge case). */
  private enemyHoldsHill(b: Battle, mem: SimUnit[], ec: { x: number; y: number }): boolean {
    if (!b.terrain) return false;
    const theirs = b.heightAt(ec.x, ec.y);
    return theirs >= 0.75 && theirs >= this.groupHeight(b, mem) + 0.75;
  }

  /** A flank group of ours has swung in. With none, the line waits out its patience (holdHillS). */
  private flankIn(b: Battle): boolean {
    return b.sideGroups(this.side).some((g) => g.role === 'flank' && !g.routed && (g.contact || (this.memo.get(g.id)?.stage ?? 0) >= 2));
  }

  /**
   * R5 stand-off: the id of the enemy group to shoot at, or -1 when there is
   * no stand-off. It holds while every enemy group still on its feet has
   * stood on a hold order, out of contact and in the same place, for
   * STAND_OFF_S or more, at least one of them behind works (its side placed
   * any) or in an orb, and our missile-men still have something to throw.
   * Called only for the stand-off doctrines; it issues no order and draws
   * nothing, so it changes nothing until it fires.
   */
  private standOff(b: Battle, enemies: SimUnit[]): number {
    const worked = b.works().some((s) => s.side !== this.side);
    let target = -1;
    let td = Infinity;
    let all = true;
    const mine = b.units.filter((u) => u.side === this.side && u.state === 'ready');
    const mc = mine.length ? centroid(mine) : { x: b.width / 2, y: b.height / 2 };
    for (const g of b.groups) {
      if (g.side === this.side || g.disbanded || g.routed) continue;
      const mem = enemies.filter((u) => u.group === g.id);
      if (mem.length === 0) continue;
      const f = g.formation;
      const s = this.still.get(g.id);
      if (g.order !== 'hold' || g.contact || !s || Math.abs(s.cx - f.cx) > 0.3 || Math.abs(s.cy - f.cy) > 0.3) {
        this.still.set(g.id, { cx: f.cx, cy: f.cy, since: b.tick });
        all = false;
        continue;
      }
      if ((b.tick - s.since) / 20 < STAND_OFF_S) all = false;
      if (!worked && f.type !== 'orb') continue;
      const c = centroid(mem);
      const d = (c.x - mc.x) ** 2 + (c.y - mc.y) ** 2;
      if (d < td) {
        td = d;
        target = g.id;
      }
    }
    if (this.standDone || !all || target < 0) {
      this.standSince = -1;
      return -1;
    }
    // it ends for good when the missiles are spent, or nobody has loosed for STAND_OFF_QUIET_S
    // (the shooters can't reach the holders): only then does the bot press
    if (this.standSince < 0) this.standSince = b.tick;
    const shot = mine.reduce((a, u) => Math.max(a, u.lastShotTick), this.standSince);
    if (!mine.some((u) => u.stats.role !== 'melee' && u.ammo > 0) || (b.tick - shot) / 20 > STAND_OFF_QUIET_S) {
      this.standDone = true;
      return -1;
    }
    return target;
  }

  /** Tick the current stand-off began (-1 = none), and whether it has ended for good (R5: then the bot presses). */
  private standSince = -1;
  private standDone = false;

  /**
   * One of our groups in a stand-off: missile groups focus the holders and go
   * on with their own logic (true = handled here); everyone else out of
   * contact stops where he is.
   */
  private holdOff(b: Battle, g: SimGroup, mem: SimUnit[], target: number): boolean {
    if (g.routed || g.contact) return false;
    const shooters = mem.filter((u) => u.stats.role !== 'melee' && u.ammo > 0).length;
    if (shooters * 2 >= mem.length) {
      if (g.focus !== target) b.issue(this.side, { kind: 'focus', group: g.id, target });
      if (!g.fireAtWill) b.issue(this.side, { kind: 'loose', group: g.id, on: true });
      return false;
    }
    if (g.order !== 'hold') b.issue(this.side, { kind: 'order', group: g.id, order: 'hold' });
    return true;
  }

  /**
   * EC-05 focus fire (formations-orders.md R4): a missile group shoots at one
   * enemy group instead of whoever is nearest. Doctrines with focusMissiles
   * pick the nearest enemy missile group within reach; otherwise, once our
   * main line is fighting, the enemy group it fights. With neither, the focus
   * is cleared (nearest fire).
   */
  private focusFire(b: Battle, g: SimGroup, mem: SimUnit[], c: { x: number; y: number }, main: SimGroup | undefined): void {
    if (g.routed || g.individual) return;
    let range = 0;
    let shooters = 0;
    for (const u of mem) {
      if (u.stats.role === 'melee' || u.ammo <= 0) continue;
      shooters++;
      range = Math.max(range, u.stats.range);
    }
    if (shooters * 2 < mem.length) return;
    const reach2 = (range + FOCUS_SLACK) ** 2;
    const mc = main && main.contact ? centroid(b.activeMembers(main.id)) : null;
    let target = -1;
    let best = Infinity;
    for (const eg of b.groups) {
      if (eg.side === this.side || eg.disbanded || eg.routed) continue;
      const em = b.activeMembers(eg.id);
      if (em.length === 0) continue;
      const ec = centroid(em);
      if ((ec.x - c.x) ** 2 + (ec.y - c.y) ** 2 > reach2) continue;
      let score = Infinity;
      if (this.doctrine.focusMissiles && em.filter((e) => e.stats.role !== 'melee').length * 2 >= em.length) score = (ec.x - c.x) ** 2 + (ec.y - c.y) ** 2 - 1e6;
      else if (mc && eg.contact) score = (ec.x - mc.x) ** 2 + (ec.y - mc.y) ** 2;
      if (score < best) {
        best = score;
        target = eg.id;
      }
    }
    if ((g.focus ?? -1) !== target) b.issue(this.side, { kind: 'focus', group: g.id, target });
  }

  /**
   * EC-05 orb (V5-041): a foot group out of contact, with enemy riders coming
   * at its flank or rear and no enemy on foot near its front, closes into an
   * orb; it opens back into a line once the riders are gone or foot comes at
   * it. Never against a frontal line. True = the group is in its orb and
   * holds (the role logic is skipped).
   */
  private ringAgainstHorse(b: Battle, g: SimGroup, mem: SimUnit[], enemies: SimUnit[]): boolean {
    const f = g.formation;
    const missiles = mem.filter((u) => u.stats.role === 'ranged').length * 2 >= mem.length;
    if (g.routed || g.individual || missiles || !b.canOrb(g.id)) return this.leaveOrb(b, g);
    const ours = f.type === 'orb' && this.orbFrom.has(g.id);
    // a group already fighting does not change shape, nor does an orb chosen at setup
    if (!ours && (g.contact || f.type === 'orb')) return false;
    const c = centroid(mem);
    let flankHorse = false;
    let nearHorse = false;
    let foot = false;
    let footInSight = false;
    for (const e of enemies) {
      const dx = e.x - c.x;
      const dy = e.y - c.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (e.stats.mount && e.stats.role !== 'ranged') {
        if (d < ORB_HORSE_LEAVE) nearHorse = true;
        if (d < ORB_HORSE_NEAR && (dx * f.fx + dy * f.fy) / d < Math.SQRT1_2) flankHorse = true;
      } else if (!e.stats.mount && e.stats.kind !== 'animal') {
        if (d < ORB_FOOT_NEAR) foot = true;
        if (d < ORB_FOOT_CLEAR) footInSight = true;
      }
    }
    if (ours) {
      if (foot || !nearHorse) return this.leaveOrb(b, g);
      if (g.order !== 'hold') b.issue(this.side, { kind: 'order', group: g.id, order: 'hold' });
      return true;
    }
    if (!flankHorse || footInSight || this.stakesNear(b, c) || this.supported(b, g, c)) return false;
    this.orbFrom.set(g.id, f.type);
    b.issue(this.side, { kind: 'preset', group: g.id, type: 'orb' });
    b.issue(this.side, { kind: 'order', group: g.id, order: 'hold' });
    return true;
  }

  /** Another group of ours stands within ORB_ALONE of a point: it covers the flank. */
  private supported(b: Battle, g: SimGroup, c: { x: number; y: number }): boolean {
    for (const og of b.sideGroups(this.side)) {
      if (og.id === g.id || og.routed) continue;
      const om = b.activeMembers(og.id);
      if (om.length === 0) continue;
      const oc = centroid(om);
      if ((oc.x - c.x) ** 2 + (oc.y - c.y) ** 2 < ORB_ALONE ** 2) return true;
    }
    return false;
  }

  /** Our own stakes stand within ORB_STAKES_NEAR of a point: the flank is already covered. */
  private stakesNear(b: Battle, c: { x: number; y: number }): boolean {
    const t = b.terrain;
    if (!t) return false;
    for (const w of b.works()) {
      if (w.side !== this.side || w.type !== 'stakes') continue;
      for (const i of w.cells) {
        const p = t.cellCenter(i);
        if ((p.x - c.x) ** 2 + (p.y - c.y) ** 2 < ORB_STAKES_NEAR ** 2) return true;
      }
    }
    return false;
  }

  /** Open an orb back into the shape it had (false: the role logic goes on). */
  private leaveOrb(b: Battle, g: SimGroup): boolean {
    const back = this.orbFrom.get(g.id);
    // only an orb the bot closed: one chosen at setup is not the bot's to open
    if (g.formation.type !== 'orb' || back === undefined) return false;
    this.orbFrom.delete(g.id);
    b.issue(this.side, { kind: 'preset', group: g.id, type: back });
    return false;
  }

  /** The shape each group had before the bot closed it into an orb. */
  private orbFrom = new Map<number, FormationType>();

  /** By enemy group id: where it stood and since when (the stand-off's stillness clock). */
  private still = new Map<number, { cx: number; cy: number; since: number }>();

  private face(b: Battle, g: SimGroup, tx: number, ty: number, then?: 'advance' | 'charge'): void {
    const f = g.formation;
    let dx = tx - f.cx;
    let dy = ty - f.cy;
    const l = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= l;
    dy /= l;
    if (dx * f.fx + dy * f.fy < 0.92) {
      b.issue(this.side, { kind: 'form', group: g.id, cx: f.cx, cy: f.cy, fx: dx, fy: dy, frontage: f.frontage });
      if (then) b.issue(this.side, { kind: 'order', group: g.id, order: then });
    }
  }

  private thinkMain(b: Battle, g: SimGroup, mem: SimUnit[], near: Near, ec: { x: number; y: number }, t: number, m: GroupMemo): void {
    if (g.routed) return;
    const T = this.timers;
    const recentMissiles = mem.some((u) => b.tick - u.lastHitTick < 40 || b.tick - u.lastBlockTick < 40);
    const wall = () => {
      if (this.doctrine.shieldwallWhenShot && recentMissiles && !g.shieldWall && mem.some((u) => u.stats.canShieldWall)) b.issue(this.side, { kind: 'shieldwall', group: g.id, on: true });
    };
    if (g.order === 'hold' && !g.contact) {
      // Hold the high ground and let the enemy climb, unless he will not come
      // (shooting at us from below) or it has gone on too long.
      const hill = this.holdsHill(b, mem, ec) || (near.d < 4 && this.groupHeight(b, mem) >= 0.75 && b.heightAt(near.u.x, near.u.y) < this.groupHeight(b, mem));
      if (t >= T.lineWaitS && hill && t < T.holdHillS && !(recentMissiles && t > HILL_SHOT_S && near.d > 6)) {
        wall();
        return;
      }
      // Waiting on our bank: the crossing is held or under fire.
      if (b.tick < m.fordWait) {
        wall();
        return;
      }
      // hillFlank (R5): do not climb into a held hill; let the missiles and the
      // flank work first, until a flank group is in, or the doctrine's patience ends.
      if (this.refusesHill(b, mem, ec, t)) {
        wall();
        return;
      }
      if (t >= T.lineWaitS) {
        this.face(b, g, ec.x, ec.y);
        b.issue(this.side, { kind: 'order', group: g.id, order: 'advance' });
      } else wall();
      return;
    }
    if (g.order === 'advance') {
      const terr = b.terrain;
      const f = g.formation;
      if (!g.contact && terr && terr.ford && terr.riverBetween(f.cy, near.u.y) && !terr.isWater(f.cx, f.cy)) {
        // A river in the way: do not wade into the enemy's missiles or onto his
        // spears at the far bank; otherwise make for the ford.
        const ford = terr.ford;
        const bankDist = Math.abs(f.cy - ford.y);
        let held = recentMissiles;
        for (const e of b.units) {
          if (e.side === this.side || e.state !== 'ready') continue;
          if ((e.y - ford.y) * (f.cy - ford.y) < 0 && Math.abs(e.y - ford.y) < 6 && Math.abs(e.x - ford.x) < 8) held = true;
        }
        if (held && bankDist < 6 && t < T.fordWaitS && m.fordWait >= 0) {
          m.fordWait = b.tick + 20 * 6;
          b.issue(this.side, { kind: 'order', group: g.id, order: 'hold' });
          return;
        }
        if (Math.abs(f.cx - ford.x) > 1) {
          this.face(b, g, ford.x, ford.y, 'advance');
          return;
        }
      }
      if (!g.contact) this.face(b, g, near.u.x, near.u.y, 'advance');
      if (near.d < 3.2 && !g.shieldWall) b.issue(this.side, { kind: 'order', group: g.id, order: 'charge' });
      else if (near.d < 3.2 && g.shieldWall && near.d < 2.2) b.issue(this.side, { kind: 'order', group: g.id, order: 'hold' });
    }
    if (g.order === 'charge' && !g.contact && near.d > 10) {
      b.issue(this.side, { kind: 'order', group: g.id, order: 'advance' });
    }
  }

  private thinkSkirmish(b: Battle, g: SimGroup, mem: SimUnit[], near: Near, main: SimGroup | undefined, m: GroupMemo): void {
    const ammo = mem.reduce((a, u) => a + u.ammo, 0);
    const retire = this.doctrine.skirmishRetire + (b.special && near.u.stats.mount ? SKIRMISH_RIDER_EXTRA : 0);
    const meleeThreat = near.u.stats.role !== 'ranged' && near.d < retire;
    if (m.stage === 0 && (ammo === 0 || meleeThreat)) {
      m.stage = 1;
      if (main) {
        const mf = main.formation;
        const depth = Math.ceil(b.activeMembers(main.id).length / Math.max(1, mf.frontage));
        b.issue(this.side, {
          kind: 'form',
          group: g.id,
          cx: mf.cx - mf.fx * (depth + 1.5),
          cy: mf.cy - mf.fy * (depth + 1.5),
          fx: mf.fx,
          fy: mf.fy,
          frontage: presetFrontage('skirmish', mem.length),
          type: 'skirmish',
        });
      } else {
        b.issue(this.side, { kind: 'order', group: g.id, order: 'fallback' });
      }
      return;
    }
    if (m.stage === 0) {
      const range = Math.max(...mem.map((u) => u.stats.range));
      if (near.d > range - 0.5) {
        const f = g.formation;
        let dx = near.u.x - f.cx;
        let dy = near.u.y - f.cy;
        const l = Math.sqrt(dx * dx + dy * dy) || 1;
        dx /= l;
        dy /= l;
        const stepLen = Math.min(3, near.d - (range - 1.5));
        let tx = f.cx + dx * stepLen;
        let ty = f.cy + dy * stepLen;
        // Shoot from the trees when there is a wood within range.
        const wood = this.forestSpot(b, tx, ty, 3, (x, y) => Math.sqrt((near.u.x - x) ** 2 + (near.u.y - y) ** 2) <= range - 0.5);
        if (wood) {
          tx = wood.x;
          ty = wood.y;
        }
        b.issue(this.side, { kind: 'form', group: g.id, cx: tx, cy: ty, fx: dx, fy: dy, frontage: f.frontage });
      }
      if (!g.fireAtWill) b.issue(this.side, { kind: 'loose', group: g.id, on: true });
      return;
    }
    // Retired skirmishers: keep loosing from behind the line, and if out of ammo shadow the main group.
    if (m.stage === 1 && main && b.tick % 60 === 0 && ammo === 0 && main.contact) {
      m.stage = 2;
      b.issue(this.side, { kind: 'order', group: g.id, order: 'charge' });
    }
  }

  /**
   * Spearmen see horsemen coming: the line closes up into a braced shield
   * wall and stops to receive them (riders balk at a hedge of spears).
   */
  private braceForHorse(b: Battle, g: SimGroup, mem: SimUnit[], c: { x: number; y: number }, enemies: SimUnit[]): void {
    if (g.routed || g.order === 'charge' && g.contact) return;
    let spears = 0;
    for (const u of mem) if (u.stats.weapon === 'spear' && u.stats.canShieldWall) spears++;
    if (spears * 2 < mem.length) return;
    let threat: SimUnit | null = null;
    let td = Infinity;
    for (const e of enemies) {
      if (!e.stats.mount || e.stats.role === 'ranged') continue;
      const d = Math.sqrt((e.x - c.x) ** 2 + (e.y - c.y) ** 2);
      if (d < td) {
        td = d;
        threat = e;
      }
    }
    if (!threat || td > 9) return;
    // Only if they come at the front: a wall cannot turn to face a flank charge in time.
    const f = g.formation;
    const dx = threat.x - c.x;
    const dy = threat.y - c.y;
    if ((dx * f.fx + dy * f.fy) / (td || 1) < 0.2) return;
    if (!g.shieldWall) b.issue(this.side, { kind: 'shieldwall', group: g.id, on: true });
    if (g.order === 'advance' && !g.contact) b.issue(this.side, { kind: 'order', group: g.id, order: 'hold' });
  }

  /**
   * Cavalry: wait for the lines to meet, then ride wide round the enemy and
   * charge a flank or the rear (or his missile-men, or anyone running away),
   * never braced spears head on. Locked in a melee they are not winning, they
   * pull out, regroup and charge again.
   */
  private thinkCavalry(b: Battle, g: SimGroup, mem: SimUnit[], near: Near, enemies: SimUnit[], main: SimGroup | undefined, m: GroupMemo, t: number): void {
    if (g.routed) return;
    if (m.stage === 9) m.stage = 2; // committed by the idle press
    const c = centroid(mem);
    const routers = b.units.filter((u) => u.side !== this.side && u.state === 'routing');
    if (m.stage === 0) {
      const enemyEngaged = b.groups.some((eg) => eg.side !== this.side && eg.contact);
      const shotAt = mem.some((u) => b.tick - u.lastHitTick < 40);
      const shooters = enemies.some((e) => e.stats.role !== 'melee');
      if (t > CAV_WAIT_S || (main && main.contact) || enemyEngaged || near.d < 7 || shotAt || (shooters && t > CAV_SHOOTER_WAIT_S)) {
        m.stage = 1;
        m.since = b.tick;
      } else return;
    }
    if (m.stage === 3) {
      // Regrouping after pulling out of a melee.
      if ((b.tick - (m.since ?? 0)) / 20 < CAV_REGROUP_S) return;
      m.stage = 1;
      m.since = b.tick;
    }
    if (m.stage === 2) {
      const engaged = mem.filter((u) => u.engaged).length;
      const morale = mem.reduce((a, u) => a + u.morale / u.stats.morale, 0) / mem.length;
      const stuck = (b.tick - (m.since ?? 0)) / 20 > CAV_MELEE_S && engaged * 2 >= mem.length;
      // The foe in front is not breaking: pull out and charge again (a horse standing still is just a big target).
      const foes = enemies.filter((e) => (e.x - c.x) ** 2 + (e.y - c.y) ** 2 < 9);
      const breaking = foes.length > 0 && foes.reduce((a, e) => a + e.morale / e.stats.morale, 0) / foes.length < 0.4;
      // Locked in melee too long (abilities.md R6): a Wheel and Re-charge if a rider has it ready,
      // on the same terms as the plain pull-out below (not while the foe breaks, nor with the riders' nerve gone).
      const wheel = stuck && !breaking && morale > 0.3 ? mem.find((u) => b.abilityReady(u, 'recharge')) : undefined;
      if (wheel) {
        b.issue(this.side, { kind: 'ability', unit: wheel.id, ability: 'recharge' });
        // then regroup as after a pull-out (CAV_REGROUP_S: the bot gives the riders time to turn and form) and pick the next charge
        m.stage = 3;
        m.since = b.tick;
        return;
      }
      if (stuck && !breaking && morale > 0.3) {
        // Pull out the way we came and regroup for another charge.
        const ex = near.u.x;
        const ey = near.u.y;
        let dx = c.x - ex;
        let dy = c.y - ey;
        const l = Math.sqrt(dx * dx + dy * dy) || 1;
        dx /= l;
        dy /= l;
        const cx = clamp(c.x + dx * 7, 1, b.width - 1);
        const cy = clamp(c.y + dy * 7, 1, b.height - 1);
        b.issue(this.side, { kind: 'form', group: g.id, cx, cy, fx: -dx, fy: -dy, frontage: g.formation.frontage });
        b.issue(this.side, { kind: 'order', group: g.id, order: 'fallback' });
        m.stage = 3;
        m.since = b.tick;
        return;
      }
      if (!g.contact && g.order !== 'charge') b.issue(this.side, { kind: 'order', group: g.id, order: 'charge' });
      // The charge went through and nothing is close: pick the next target.
      if (!g.contact && near.d > 6 && (b.tick - (m.since ?? 0)) / 20 > 3) {
        m.stage = 1;
        m.since = b.tick;
      }
      return;
    }
    // Chariots do not manoeuvre: they are pointed at the enemy and driven through him.
    if (mem.some((u) => u.stats.mount === 'chariot')) {
      if (g.order !== 'charge') {
        this.face(b, g, near.u.x, near.u.y);
        b.issue(this.side, { kind: 'order', group: g.id, order: 'charge' });
      }
      return;
    }
    // Stage 1: choose a victim and ride round to its flank or rear.
    if (routers.length > 0 && (routers.length >= 2 || !b.groups.some((eg) => eg.side !== this.side && eg.contact && !eg.routed))) {
      this.face(b, g, routers[0].x, routers[0].y);
      b.issue(this.side, { kind: 'order', group: g.id, order: 'charge' });
      m.stage = 2;
      m.since = b.tick;
      return;
    }
    const target = this.cavalryTarget(b, enemies, c);
    if (!target) return;
    const tf = target.formation;
    const tm = b.activeMembers(target.id);
    const tc = centroid(tm);
    const r = rightOf(tf.fx, tf.fy);
    const depth = Math.ceil(tm.length / Math.max(1, tf.frontage)) * 1.3;
    const half = (Math.min(tm.length, tf.frontage) * 0.9) / 2 + 2.5;
    // Which side to come round: the one we are already on.
    const side = (c.x - tc.x) * r.x + (c.y - tc.y) * r.y >= 0 ? 1 : -1;
    const braced = target.shieldWall || tm.filter((u) => u.stats.weapon === 'spear').length * 2 > tm.length;
    // Missile-men and loose groups can be hit from anywhere; spearmen only from behind.
    const behind = braced ? depth + 2.5 : depth * 0.5;
    const ax = clamp(tc.x + r.x * side * half - tf.fx * behind, 1, b.width - 1);
    const ay = clamp(tc.y + r.y * side * half - tf.fy * behind, 1, b.height - 1);
    const da = Math.sqrt((ax - c.x) ** 2 + (ay - c.y) ** 2);
    // Already off his front (to the side or behind him)?
    const rel = ((c.x - tc.x) * tf.fx + (c.y - tc.y) * tf.fy) / (Math.sqrt((c.x - tc.x) ** 2 + (c.y - tc.y) ** 2) || 1);
    const offFront = braced ? rel < -0.2 : rel < 0.55;
    const f0 = g.formation;
    const arrived = (f0.cx - c.x) ** 2 + (f0.cy - c.y) ** 2 < 2.5 && mem.every((u) => u.spd < 0.8);
    if (da < 3 || offFront || (arrived && (b.tick - (m.since ?? 0)) / 20 > 3) || (!braced && Math.sqrt((tc.x - c.x) ** 2 + (tc.y - c.y) ** 2) < 7) || (b.tick - (m.since ?? 0)) / 20 > 25) {
      m.stage = 2;
      m.since = b.tick;
      m.target = target.id;
      this.face(b, g, tc.x, tc.y);
      b.issue(this.side, { kind: 'order', group: g.id, order: 'charge' });
      return;
    }
    // Ride wide: never through the front of a spear wall.
    let wx = ax;
    let wy = ay;
    if (braced) {
      const front = ((c.x - tc.x) * tf.fx + (c.y - tc.y) * tf.fy) > 0;
      if (front) {
        wx = clamp(tc.x + r.x * side * (half + 3) + tf.fx * 2, 1, b.width - 1);
        wy = clamp(tc.y + r.y * side * (half + 3) + tf.fy * 2, 1, b.height - 1);
      }
    }
    let fx = wx - c.x;
    let fy = wy - c.y;
    const l = Math.sqrt(fx * fx + fy * fy) || 1;
    fx /= l;
    fy /= l;
    const step = Math.min(l, 6);
    const f = g.formation;
    if ((f.cx - (c.x + fx * step)) ** 2 + (f.cy - (c.y + fy * step)) ** 2 > 2 || g.order !== 'hold') {
      b.issue(this.side, { kind: 'form', group: g.id, cx: c.x + fx * step, cy: c.y + fy * step, fx, fy, frontage: f.frontage });
    }
  }

  /** The enemy group most worth a cavalry charge: archers, the engaged line's flank, the weakest. */
  private cavalryTarget(b: Battle, enemies: SimUnit[], c: { x: number; y: number }): SimGroup | null {
    let best: SimGroup | null = null;
    let bs = -Infinity;
    for (const eg of b.groups) {
      if (eg.side === this.side || eg.disbanded || eg.routed) continue;
      const mem = enemies.filter((u) => u.group === eg.id);
      if (mem.length === 0) continue;
      const ec = centroid(mem);
      const d = Math.sqrt((ec.x - c.x) ** 2 + (ec.y - c.y) ** 2);
      const ranged = mem.filter((u) => u.stats.role !== 'melee').length / mem.length;
      const spears = mem.filter((u) => u.stats.weapon === 'spear').length / mem.length;
      const riders = mem.filter((u) => u.stats.mount).length / mem.length;
      let score = -d * 0.25 + ranged * 4 + (eg.contact ? 3 : 0) - (eg.shieldWall && !eg.contact ? 3 : 0) - spears * (eg.contact ? 0.5 : 2) - riders * 1.5 + mem.length * 0.2;
      if (mem.some((u) => u.stats.kind === 'animal')) score += 1;
      if (score > bs) {
        bs = score;
        best = eg;
      }
    }
    return best;
  }

  /**
   * Horse archers skirmish: ride to just inside bow range and shoot on the
   * move; anyone who comes for them is kept at arm's length (they ride away
   * and keep shooting). Out of arrows they become light cavalry.
   */
  private thinkHorseArchers(b: Battle, g: SimGroup, mem: SimUnit[], enemies: SimUnit[], m: GroupMemo, t: number): void {
    if (g.routed) return;
    if (!g.fireAtWill) b.issue(this.side, { kind: 'loose', group: g.id, on: true });
    if (b.tick % 20 !== 0) return;
    const c = centroid(mem);
    const range = Math.max(...mem.map((u) => u.stats.range));
    // The nearest man who could hurt us in melee, and the nearest target at all.
    let threat: Near | null = null;
    for (const e of enemies) {
      if (e.stats.role === 'ranged' && !e.stats.mount) continue;
      const d = Math.sqrt((e.x - c.x) ** 2 + (e.y - c.y) ** 2);
      if (!threat || d < threat.d) threat = { u: e, d };
    }
    const near = nearest(enemies, c.x, c.y);
    // Circle the enemy at bow range (the Cantabrian circle), working round to
    // his flank where shields do not cover; turn about at the field's edge.
    const ec = centroid(enemies);
    let rx = c.x - ec.x;
    let ry = c.y - ec.y;
    const rl = Math.sqrt(rx * rx + ry * ry) || 1;
    rx /= rl;
    ry /= rl;
    const out = mem.every((u) => u.ammo === 0);
    // Out of arrows: keep out of reach (they are no match for men on foot in a melee).
    let R = Math.max(4, out ? 9 : range - 1.5);
    const orbit = (sgn: number) => {
      const tx = -ry * sgn;
      const ty = rx * sgn;
      let px = rx + tx * 0.7;
      let py = ry + ty * 0.7;
      const pl = Math.sqrt(px * px + py * py) || 1;
      px /= pl;
      py /= pl;
      return { x: ec.x + px * R, y: ec.y + py * R };
    };
    const margin = 2.5 + (g.formation.frontage - 1) * 1.4;
    const inside = (p: { x: number; y: number }) => p.x > margin && p.x < b.width - margin && p.y > 2.5 && p.y < b.height - 2.5;
    let p = orbit(m.flankSign);
    // Tighten the circle where the field is narrow before turning about.
    for (let k = 0; k < 3 && !inside(p); k++) {
      R *= 0.8;
      p = orbit(m.flankSign);
    }
    if (!inside(p)) {
      m.flankSign = -m.flankSign;
      p = orbit(m.flankSign);
    }
    let ax = p.x;
    let ay = p.y;
    if (threat && threat.d < 3.5) {
      // Someone is about to catch us: break away from him first.
      let dx = c.x - threat.u.x;
      let dy = c.y - threat.u.y;
      const l = Math.sqrt(dx * dx + dy * dy) || 1;
      ax = (ax + c.x + (dx / l) * 5) / 2;
      ay = (ay + c.y + (dy / l) * 5) / 2;
    }
    ax = clamp(ax, Math.min(margin, b.width / 2), Math.max(b.width - margin, b.width / 2));
    ay = clamp(ay, 2.5, b.height - 2.5);
    let fx = near.u.x - ax;
    let fy = near.u.y - ay;
    const fl = Math.sqrt(fx * fx + fy * fy) || 1;
    fx /= fl;
    fy /= fl;
    b.issue(this.side, { kind: 'form', group: g.id, cx: ax, cy: ay, fx, fy, frontage: Math.min(2, mem.length) });
    // Out of arrows, they still ride down anyone running away.
    if (out && b.units.some((u) => u.side !== this.side && u.state === 'routing')) b.issue(this.side, { kind: 'order', group: g.id, order: 'charge' });
    void t;
  }

  /**
   * Animals hold their lair until something comes close, the pack is hurt,
   * or they are shot at; then they all go for it.
   */
  private thinkBeasts(b: Battle, g: SimGroup, mem: SimUnit[], near: Near, t: number): void {
    if (g.order === 'charge') return;
    const hurt = mem.some((u) => b.tick - u.lastHitTick < 40);
    if (hurt || near.d < 11 || t > BEAST_WAIT_S) b.issue(this.side, { kind: 'order', group: g.id, order: 'charge' });
  }

  private thinkFlank(b: Battle, g: SimGroup, near: Near, ec: { x: number; y: number }, main: SimGroup | undefined, m: GroupMemo, t: number, enemies: SimUnit[]): void {
    if (m.stage === 0) {
      if (t > this.timers.flankAtS || (main && main.contact) || near.d < 4) m.stage = 1;
      else return;
    }
    if (m.stage === 1) {
      // Swing wide to the side of the enemy's largest group.
      const eg = largestGroup(b, enemies);
      const ef = eg ? eg.formation : { cx: ec.x, cy: ec.y, fx: this.side === 0 ? 0 : 0, fy: this.side === 0 ? 1 : -1, frontage: 4 };
      const r = rightOf(ef.fx, ef.fy);
      const half = (ef.frontage * 0.9) / 2 + 2.5;
      const tx = clamp(ef.cx + r.x * half * m.flankSign - ef.fx * 1, 1, b.width - 1);
      const ty = clamp(ef.cy + r.y * half * m.flankSign - ef.fy * 1, 1, b.height - 1);
      const f = g.formation;
      const d = Math.sqrt((tx - f.cx) ** 2 + (ty - f.cy) ** 2);
      if (d < 2 || near.d < 2.5) {
        m.stage = 2;
        this.face(b, g, near.u.x, near.u.y);
        b.issue(this.side, { kind: 'order', group: g.id, order: 'charge' });
        return;
      }
      let fx = tx - f.cx;
      let fy = ty - f.cy;
      const l = Math.sqrt(fx * fx + fy * fy) || 1;
      fx /= l;
      fy /= l;
      const stepLen = Math.min(d, 4);
      b.issue(this.side, { kind: 'form', group: g.id, cx: f.cx + fx * stepLen, cy: f.cy + fy * stepLen, fx, fy, frontage: f.frontage });
      return;
    }
    if (g.order !== 'charge' && !g.contact) b.issue(this.side, { kind: 'order', group: g.id, order: 'charge' });
  }

  private thinkReserve(b: Battle, g: SimGroup, mem: SimUnit[], near: Near, main: SimGroup | undefined, m: GroupMemo, t: number, enemyRouted: boolean): void {
    if (m.stage === 0) {
      let wavering = false;
      if (main) {
        const all = b.members(main.id);
        const act = b.activeMembers(main.id);
        const avgMorale = act.reduce((a, u) => a + u.morale / u.stats.morale, 0) / Math.max(1, act.length);
        wavering = main.contact && (avgMorale < this.doctrine.reserveWaver || act.length < all.length * 0.75);
      } else wavering = true;
      if (wavering || enemyRouted || t > this.timers.reserveAtS || near.d < 3) {
        m.stage = 1;
        this.face(b, g, near.u.x, near.u.y);
        b.issue(this.side, { kind: 'order', group: g.id, order: 'charge' });
        return;
      }
      // Follow the main line at a distance.
      if (main && b.tick % 40 === 0) {
        const mf = main.formation;
        const depth = Math.ceil(b.activeMembers(main.id).length / Math.max(1, mf.frontage));
        const tx = mf.cx - mf.fx * (depth + 3);
        const ty = mf.cy - mf.fy * (depth + 3);
        const f = g.formation;
        if ((tx - f.cx) ** 2 + (ty - f.cy) ** 2 > 4) {
          b.issue(this.side, { kind: 'form', group: g.id, cx: tx, cy: ty, fx: mf.fx, fy: mf.fy, frontage: presetFrontage(g.formation.type, mem.length) });
        }
      }
      return;
    }
    if (g.order !== 'charge' && !g.contact) b.issue(this.side, { kind: 'order', group: g.id, order: 'charge' });
  }
}

// ------------------------------------------------------------- field works (R6)

/** Segments of a type this side may still place (the sim refuses 'allowance' first, wherever the segment would go). */
function worksLeft(b: Battle, side: Side, type: WorkType): boolean {
  return b.workRefusal(side, { type, x: b.width / 2, y: b.height / 2, fx: 0, fy: 1 }) !== 'allowance';
}

/** Place one segment at the first candidate the sim accepts; false if none is. */
function tryWork(b: Battle, side: Side, type: WorkType, spots: { x: number; y: number; fx: number; fy: number }[]): boolean {
  for (const p of spots) {
    const o = { type, x: p.x, y: p.y, fx: p.fx, fy: p.fy };
    if (b.workRefusal(side, o) !== null) continue;
    b.issue(side, { kind: 'work', ...o });
    return true;
  }
  return false;
}

/** A point `out` paces in front of a group's front rank, `lat` paces to its right, laid across its facing. */
function before(g: SimGroup, lat: number, out: number): { x: number; y: number; fx: number; fy: number } {
  const f = g.formation; // the anchor is the front rank's centre
  return { x: f.cx - f.fy * lat + f.fx * out, y: f.cy + f.fx * lat + f.fy * out, fx: f.fx, fy: f.fy };
}

/** The same spot `out` paces out, then nearer the line (WORKS_OUT, 1.5, 1): the first one the zone and the ground allow. */
function nearer(g: SimGroup, lat: number, out = WORKS_OUT): { x: number; y: number; fx: number; fy: number }[] {
  return [out, out - 0.5, out - 1].map((o) => before(g, lat, o));
}

function halfFront(b: Battle, g: SimGroup): number {
  const n = Math.min(g.formation.frontage, b.activeMembers(g.id).length);
  return ((n - 1) * (g.formation.fs ?? 1)) / 2;
}

/**
 * The gate gaps of this side's palisade (campaign-arc.md R2): the runs of
 * open cells between palisade cells on the row holding most of them, in its
 * own half of the field. Field coordinates of each gap's centre, widest first.
 */
function gateGaps(b: Battle, side: Side): { x: number; y: number; w: number }[] {
  const t = b.terrain;
  if (!t) return [];
  const cw = b.width / t.w;
  const ch = b.height / t.h;
  let row = -1;
  let most = 0;
  for (let iy = 0; iy < t.h; iy++) {
    const y = (iy + 0.5) * ch;
    if (side === 1 ? y > b.height / 2 : y < b.height / 2) continue;
    let n = 0;
    for (let ix = 0; ix < t.w; ix++) if (t.cellDef(iy * t.w + ix).kind === 'palisade') n++;
    if (n > most) {
      most = n;
      row = iy;
    }
  }
  if (row < 0) return [];
  const gaps: { x: number; y: number; w: number }[] = [];
  let last = -1;
  for (let ix = 0; ix < t.w; ix++) {
    if (t.cellDef(row * t.w + ix).kind !== 'palisade') continue;
    if (last >= 0 && ix - last > 1) gaps.push({ x: ((last + 1 + ix) / 2) * cw, y: (row + 0.5) * ch, w: ix - last - 1 });
    last = ix;
  }
  return gaps.sort((p, q) => q.w - p.w || p.x - q.x);
}

/**
 * field-works.md R6: a bot side lays the works its allowance (ArmySpec.works)
 * gives it, at the end of its deploy step. Nothing is placed, and no order
 * issued, without an allowance: in v5 only lair garrisons have one (R4.4),
 * and duels and war have none (V5-022). It draws no random numbers.
 *
 * - Stakes behind a palisade: one segment in front of each gate gap, WORKS_OUT
 *   paces out, facing the attacker.
 * - Stakes in the field: across the corner of the main line facing the
 *   enemy's horse (the FW-01 placement: half a pace beyond the line's end,
 *   one out, laid diagonally); with no horse in sight, WORKS_OUT paces in
 *   front of the skirmishers. More segments go on the line's wings, the
 *   horse's side first.
 * - Ditch: along the main line's front, WORKS_OUT paces ahead; more segments
 *   to either side of the first.
 * - Laager: never in v5.
 * Exported so a harness can lay a human side's works by the same rule.
 */
export function placeWorks(b: Battle, side: Side): void {
  if (b.phase !== 'deploy') return;
  const stakes = worksLeft(b, side, 'stakes');
  const ditch = worksLeft(b, side, 'ditch');
  if (!stakes && !ditch) return;
  const groups = b.sideGroups(side).filter((g) => b.activeMembers(g.id).length > 0);
  const main = groups.find((g) => g.role === 'main') ?? groups[0];
  const toward = side === 1 ? 1 : -1; // the attacker comes from this way along y
  const gaps = stakes ? gateGaps(b, side) : [];
  for (const gap of gaps) {
    if (!worksLeft(b, side, 'stakes')) break;
    tryWork(b, side, 'stakes', [WORKS_OUT, WORKS_OUT - 0.5, WORKS_OUT - 1, 0].map((o) => ({ x: gap.x, y: gap.y + toward * o, fx: 0, fy: toward })));
  }
  if (!main) return;
  const f = main.formation;
  const w = Math.max(3, halfFront(b, main) + 1);
  if (stakes && gaps.length === 0) {
    // the enemy's horse: the largest group of riders (none yet when this side deploys first)
    let horse: SimGroup | null = null;
    let hn = 0;
    for (const g of b.groups) {
      if (g.side === side || g.disbanded) continue;
      const mem = b.activeMembers(g.id);
      const k = groupKind(mem);
      if ((k === 'cavalry' || k === 'horse_archers') && mem.length > hn) {
        horse = g;
        hn = mem.length;
      }
    }
    // which end of the line faces them: the sign of their offset along the line's right
    const s = horse ? ((horse.formation.cx - f.cx) * -f.fy + (horse.formation.cy - f.cy) * f.fx >= 0 ? 1 : -1) : 1;
    if (horse) {
      const p = before(main, s * (halfFront(b, main) + 0.5), 1);
      tryWork(b, side, 'stakes', [{ ...p, fx: f.fx - f.fy * s, fy: f.fy + f.fx * s }, ...nearer(main, s * w)]);
    } else {
      const sk = groups.find((g) => g.role === 'skirmish');
      if (sk) tryWork(b, side, 'stakes', nearer(sk, 0));
    }
    for (const lat of [s * w, -s * w]) {
      if (!worksLeft(b, side, 'stakes')) break;
      tryWork(b, side, 'stakes', nearer(main, lat));
    }
  }
  for (const lat of [0, -3, 3]) {
    if (!worksLeft(b, side, 'ditch')) break;
    tryWork(b, side, 'ditch', nearer(main, lat));
  }
}

interface Near {
  u: SimUnit;
  d: number;
}

function centroid(us: SimUnit[]): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const u of us) {
    x += u.x;
    y += u.y;
  }
  return { x: x / us.length, y: y / us.length };
}

function nearest(us: SimUnit[], x: number, y: number): Near {
  let best = us[0];
  let bd = Infinity;
  for (const u of us) {
    const d = Math.sqrt((u.x - x) ** 2 + (u.y - y) ** 2);
    if (d < bd) {
      bd = d;
      best = u;
    }
  }
  return { u: best, d: bd };
}

function largestGroup(b: Battle, enemies: SimUnit[]): SimGroup | undefined {
  const counts = new Map<number, number>();
  for (const e of enemies) counts.set(e.group, (counts.get(e.group) ?? 0) + 1);
  let best: SimGroup | undefined;
  let bc = 0;
  for (const g of b.groups) {
    const c = counts.get(g.id) ?? 0;
    if (c > bc) {
      bc = c;
      best = g;
    }
  }
  return best;
}

