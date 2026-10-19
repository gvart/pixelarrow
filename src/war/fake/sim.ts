/**
 * A stand-in WarSim for the sandbox until src/war/sim lands: straight-line movement to formation
 * slots (no terrain, no pathfinding), attack = close on the target squad and trade blows.
 * Positions are in tiles. Same export as src/war/sim/index.ts, so the worker swaps one import.
 */
import type { Order, RegionData, Snapshot, SquadId, UnitSnap, WarSim } from '../types';

type Shape = 'line' | 'column' | 'wedge' | 'loose';
interface Squad { id: SquadId; owner: string; team: number; units: UnitSnap[]; order: Order; shape: Shape; ax: number; ay: number; dir: number }

const SPEED = 0.25; // tiles per tick
const REACH = 0.9;

/** Slot offsets (right, back) in tiles for unit i of n. */
function slot(shape: Shape, i: number, n: number): [number, number] {
  if (shape === 'column') { const c = 3; return [(i % c) - (c - 1) / 2, Math.floor(i / c)]; }
  if (shape === 'wedge') { const r = Math.floor((Math.sqrt(8 * i + 1) - 1) / 2), k = i - (r * (r + 1)) / 2; return [k - r / 2, r]; }
  const c = Math.ceil(n / 2), sp = shape === 'loose' ? 1.8 : 1;
  return [((i % c) - (c - 1) / 2) * sp, Math.floor(i / c) * sp];
}

export function createSim(region: RegionData, _seed: number): WarSim {
  const squads = new Map<SquadId, Squad>();
  let tick = 0, nextSquad = 1, nextUnit = 1, stepMs = 0;

  const centre = (s: Squad) => {
    let x = 0, y = 0, n = 0;
    for (const u of s.units) if (u.state !== 'dead') { x += u.x; y += u.y; n++; }
    return n ? { x: x / n, y: y / n } : null;
  };

  return {
    region,
    spawnSquad(owner, team, cls, count, x, y) {
      const id = nextSquad++;
      const s: Squad = { id, owner, team, units: [], order: { kind: 'hold', squad: id }, shape: 'line', ax: x, ay: y, dir: team ? Math.PI : 0 };
      for (let i = 0; i < count; i++) {
        const [r, b] = slot('line', i, count);
        s.units.push({ id: nextUnit++, squad: id, x: x - b * Math.cos(s.dir) - r * Math.sin(s.dir), y: y - b * Math.sin(s.dir) + r * Math.cos(s.dir), facing: s.dir, hp: 30, maxHp: 30, cls, state: 'idle' });
      }
      squads.set(id, s);
      return id;
    },
    order(o) {
      const s = squads.get(o.squad ?? -1);
      if (!s) return;
      if (o.kind === 'formation') { s.shape = o.shape; return; }
      s.order = o;
      if (o.kind === 'move') {
        const c = centre(s);
        if (c && Math.hypot(o.x - c.x, o.y - c.y) > 0.5) s.dir = Math.atan2(o.y - c.y, o.x - c.x);
        s.ax = o.x; s.ay = o.y;
      }
      if (o.kind === 'hold') { const c = centre(s); if (c) { s.ax = c.x; s.ay = c.y; } }
    },
    step() {
      const t0 = performance.now();
      tick++;
      const enemies = (team: number) => [...squads.values()].filter((q) => q.team !== team).flatMap((q) => q.units).filter((u) => u.state !== 'dead');
      for (const s of squads.values()) {
        if (s.order.kind === 'attack') {
          const tgt = squads.get(s.order.target), c = tgt && centre(tgt);
          if (c) { const me = centre(s); if (me) s.dir = Math.atan2(c.y - me.y, c.x - me.x); s.ax = c.x; s.ay = c.y; }
          else s.order = { kind: 'hold', squad: s.id };
        }
        const alive = s.units.filter((u) => u.state !== 'dead');
        const foes = s.order.kind === 'move' ? [] : enemies(s.team);
        alive.forEach((u, i) => {
          // strike the nearest enemy in reach, else walk to the slot
          let best: UnitSnap | null = null, bd = REACH;
          for (const e of foes) { const d = Math.hypot(e.x - u.x, e.y - u.y); if (d < bd) { bd = d; best = e; } }
          if (best) {
            u.facing = Math.atan2(best.y - u.y, best.x - u.x);
            u.state = 'attack';
            if ((tick + u.id) % 5 === 0) best.hp = Math.max(0, best.hp - 4);
            return;
          }
          const [r, b] = slot(s.shape, i, alive.length);
          const tx = s.ax - b * Math.cos(s.dir) - r * Math.sin(s.dir), ty = s.ay - b * Math.sin(s.dir) + r * Math.cos(s.dir);
          const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
          if (d < 0.05) { u.state = 'idle'; u.facing = s.dir; return; }
          const k = Math.min(1, SPEED / d);
          u.x += dx * k; u.y += dy * k; u.facing = Math.atan2(dy, dx); u.state = 'move';
        });
      }
      for (const s of squads.values()) {
        for (const u of s.units) if (u.hp <= 0 && u.state !== 'dead') u.state = 'dead';
        s.units = s.units.filter((u) => u.state !== 'dead' || u.hp > -30);
        for (const u of s.units) if (u.state === 'dead') u.hp--; // dead linger 3 s, then vanish
        if (!s.units.length) squads.delete(s.id);
      }
      stepMs = performance.now() - t0;
    },
    snapshot(): Snapshot {
      const sq = [...squads.values()];
      return {
        tick,
        units: sq.flatMap((s) => s.units.map((u) => ({ ...u, hp: Math.max(0, u.hp) }))),
        squads: sq.map((s) => ({ id: s.id, owner: s.owner, team: s.team, units: s.units.map((u) => u.id), order: s.order.kind })),
      };
    },
    stats: () => ({ stepMs, units: [...squads.values()].reduce((n, s) => n + s.units.length, 0) }),
  };
}
