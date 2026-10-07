/**
 * Simple deterministic battle bot. Thinks every few ticks and issues the same
 * Orders a human would. Tactics: keep the line, skirmishers screen then
 * retire behind the line, flankers swing wide and hit the side, the reserve is
 * committed when the main line wavers or the enemy breaks.
 */
import type { Battle } from './battle';
import { Rng } from './rng';
import { presetFrontage, rightOf } from './formation';
import type { Side, SimGroup, SimUnit } from './types';
import { rallyRadius } from './stats';

/** Seconds without any combat before the bot commits everything to an attack. */
export const PRESS_IDLE_S = 8;

interface GroupMemo {
  stage: number;
  flankSign: number;
  /** Main line: tick until which it waits on its own bank rather than ford under fire. */
  fordWait: number;
}

/** Seconds a bot line will hold a hill (or wait at a contested ford) before it gives up and attacks. */
export const HOLD_HILL_S = 50;
export const FORD_WAIT_S = 55;

export class BotAI {
  readonly side: Side;
  private rng: Rng;
  private memo = new Map<number, GroupMemo>();

  constructor(side: Side, seed: number) {
    this.side = side;
    this.rng = new Rng(seed);
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
    for (const g of b.sideGroups(this.side)) {
      const n = b.activeMembers(g.id).length;
      if (n === 0) continue;
      const shields = b.activeMembers(g.id).filter((u) => u.stats.canShieldWall).length;
      if (g.role === 'main' && shields >= n * 0.7 && this.rng.chance(0.5)) {
        b.issue(this.side, { kind: 'preset', group: g.id, type: 'shieldwall' });
      } else if (g.role === 'skirmish') {
        b.issue(this.side, { kind: 'preset', group: g.id, type: 'skirmish' });
      } else if (g.role === 'flank') {
        b.issue(this.side, { kind: 'preset', group: g.id, type: this.rng.chance(0.5) ? 'wedge' : 'column' });
      } else if (g.role === 'reserve') {
        b.issue(this.side, { kind: 'preset', group: g.id, type: 'line' });
      }
    }
    if (b.terrain) this.deployOnTerrain(b);
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
    this.thinkAbilities(b);
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
    if (t > 25 && idle > PRESS_IDLE_S) {
      for (const g of myGroups) {
        const mem = b.activeMembers(g.id);
        if (mem.length === 0 || g.routed) continue;
        const c = centroid(mem);
        const near = nearest(enemies, c.x, c.y);
        if (g.role === 'main' && g.order === 'hold' && t < HOLD_HILL_S && near.d < 12 && this.holdsHill(b, mem, ec)) continue;
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
   * waver, a volley when several missile-men have targets.
   */
  private thinkAbilities(b: Battle): void {
    for (const u of b.units) {
      if (u.side !== this.side || u.state !== 'ready' || u.abil.length === 0) continue;
      for (const id of u.abil) {
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
        }
        if (use) b.issue(this.side, { kind: 'ability', unit: u.id, ability: id });
      }
    }
  }

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
    const recentMissiles = mem.some((u) => b.tick - u.lastHitTick < 40 || b.tick - u.lastBlockTick < 40);
    const wall = () => {
      if (recentMissiles && !g.shieldWall && mem.some((u) => u.stats.canShieldWall)) b.issue(this.side, { kind: 'shieldwall', group: g.id, on: true });
    };
    if (g.order === 'hold' && !g.contact) {
      // Hold the high ground and let the enemy climb, unless he will not come
      // (shooting at us from below) or it has gone on too long.
      const hill = this.holdsHill(b, mem, ec) || (near.d < 4 && this.groupHeight(b, mem) >= 0.75 && b.heightAt(near.u.x, near.u.y) < this.groupHeight(b, mem));
      if (t >= 5 && hill && t < HOLD_HILL_S && !(recentMissiles && t > 22 && near.d > 6)) {
        wall();
        return;
      }
      // Waiting on our bank: the crossing is held or under fire.
      if (b.tick < m.fordWait) {
        wall();
        return;
      }
      if (t >= 5) {
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
        if (held && bankDist < 6 && t < FORD_WAIT_S && m.fordWait >= 0) {
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
    const meleeThreat = near.u.stats.role !== 'ranged' && near.d < 5;
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

  private thinkFlank(b: Battle, g: SimGroup, near: Near, ec: { x: number; y: number }, main: SimGroup | undefined, m: GroupMemo, t: number, enemies: SimUnit[]): void {
    if (m.stage === 0) {
      if (t > 14 || (main && main.contact) || near.d < 4) m.stage = 1;
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
        wavering = main.contact && (avgMorale < 0.65 || act.length < all.length * 0.75);
      } else wavering = true;
      if (wavering || enemyRouted || t > 70 || near.d < 3) {
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

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
