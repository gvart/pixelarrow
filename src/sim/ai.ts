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

interface GroupMemo {
  stage: number;
  flankSign: number;
}

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
      m = { stage: 0, flankSign: this.rng.chance(0.5) ? 1 : -1 };
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
  }

  think(b: Battle): void {
    if ((b.tick + this.side * 5) % 10 !== 0) return;
    const enemies = b.units.filter((u) => u.side !== this.side && u.state === 'ready');
    if (enemies.length === 0) return;
    const t = b.tick / 20;
    const myGroups = b.sideGroups(this.side);
    const main = myGroups.find((g) => g.role === 'main' && b.activeMembers(g.id).length > 0);
    const enemyRouted = b.groups.some((g) => g.side !== this.side && g.routed);
    const ec = centroid(enemies);

    for (const g of myGroups) {
      const mem = b.activeMembers(g.id);
      if (mem.length === 0 || g.individual) continue;
      const c = centroid(mem);
      const near = nearest(enemies, c.x, c.y);
      const m = this.mem(g);
      switch (g.role) {
        case 'main':
          this.thinkMain(b, g, mem, near, ec, t);
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

  private thinkMain(b: Battle, g: SimGroup, mem: SimUnit[], near: Near, ec: { x: number; y: number }, t: number): void {
    if (g.routed) return;
    const recentMissiles = mem.some((u) => b.tick - u.lastHitTick < 40 || b.tick - u.lastBlockTick < 40);
    if (g.order === 'hold' && !g.contact) {
      if (t >= 5) {
        this.face(b, g, ec.x, ec.y);
        b.issue(this.side, { kind: 'order', group: g.id, order: 'advance' });
      } else if (recentMissiles && !g.shieldWall && mem.some((u) => u.stats.canShieldWall)) {
        b.issue(this.side, { kind: 'shieldwall', group: g.id, on: true });
      }
      return;
    }
    if (g.order === 'advance') {
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
        b.issue(this.side, { kind: 'form', group: g.id, cx: f.cx + dx * stepLen, cy: f.cy + dy * stepLen, fx: dx, fy: dy, frontage: f.frontage });
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
