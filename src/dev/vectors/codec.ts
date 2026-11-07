/**
 * The binary frame decoder (src/war/net/codec.ts DeltaDecoder) for the Godot client layer (docs/impl/godot-port.md P10,
 * godot/src/client/delta_decoder.gd): seeded streams of frames, written by the TS DeltaEncoder from made-up worlds that
 * touch every field of the frame (units coming, moving, leaving; squads with fire arrows, meals, carts and actives;
 * shots; buildings, engines, souls, guardians and the Warden's mark), with keyframes among the deltas. Each frame goes
 * out as base64 with the snapshot the TS DeltaDecoder hands out after it, which the GDScript decoder must match.
 */
import { Rng } from '../../sim/rng';
import { DeltaDecoder, DeltaEncoder, type FrameInput } from '../../war/net/codec';
import type { BossSnap, ShotSnap, SquadSnap, UnitSnap } from '../../war/types';

const b64 = (b: Uint8Array) => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};

const STATES: UnitSnap['state'][] = ['idle', 'move', 'attack', 'dead', 'gather', 'build'];
const CLS = ['hoplite', 'archer', 'militia', 'celt_sword', 'boar'];
const CARRY = ['food', 'wood', 'stone', 'iron'] as const;
const ORDERS = ['idle', 'move', 'attack', 'hold', 'attackMove'] as const;

/** A made-up world stepped `ticks` times, a frame each tick (a keyframe every `keyEvery`). */
function stream(seed: number, ticks: number, keyEvery: number) {
  const r = new Rng(seed);
  const units = new Map<number, UnitSnap>();
  let next = 1;
  const add = (squad: number) => {
    const u: UnitSnap = { id: next++, squad, x: r.range(0, 200), y: r.range(0, 200), facing: r.range(-Math.PI, Math.PI), hp: r.int(1, 120), maxHp: 120, cls: CLS[squad % CLS.length], state: 'idle' };
    if (r.chance(0.3)) (u.pid = `p${r.int(1, 999)}`), (u.level = r.int(1, 9));
    units.set(u.id, u);
  };
  for (let q = 1; q <= 4; q++) for (let k = 0; k < 6; k++) add(q);
  const squads: SquadSnap[] = [1, 2, 3, 4].map((id) => ({ id, team: id % 3, owner: id === 4 ? 'mobs' : `p${id}`, order: 'idle', units: [] }));
  const buildings = [{ id: 1, type: 'camp', team: 0, x: 10, y: 12, state: 'building', progress: 0 }, { id: 2, type: 'storehouse', team: 1, x: 40.5, y: 30.5, state: 'done', progress: 1 }];
  const sieges = [{ id: 7, type: 'ram', team: 0, x: 22, y: 23, facing: 0.5, hp: 300, maxHp: 300, state: 'idle', progress: 1, crew: -1, crewNeed: 4, crewHere: 0 }];
  const souls = [{ id: 3, x: 50, y: 51, cls: 'hoplite', level: 2, left: 300 }];
  const bosses: BossSnap[] = [{ id: 'cyclops', x: 120.25, y: 80.5, hp: 4000, maxHp: 4000, phase: 0, respawnIn: 0, fx: { kind: 'stomp', t: 0 }, tele: { kind: 'slam', in: 5, x: 1, y: 2 } } as unknown as BossSnap];
  let warden: FrameInput['warden'] = undefined;
  const enc = new DeltaEncoder(), dec = new DeltaDecoder();
  const frames: string[] = [], snaps: unknown[] = [];
  for (let t = 1; t <= ticks; t++) {
    const tick = 1000 + t;
    for (const u of units.values()) {
      if (r.chance(0.6)) (u.x = Math.max(0, u.x + r.range(-0.7, 0.7))), (u.y = Math.max(0, u.y + r.range(-0.7, 0.7)));
      if (r.chance(0.2)) u.facing = r.range(-7, 7);
      if (r.chance(0.15)) u.hp = Math.max(0, u.hp - r.range(0, 9));
      if (r.chance(0.1)) u.state = r.pick(STATES);
      if (r.chance(0.05)) u.wounded = r.chance(0.5); else if (r.chance(0.03)) delete u.wounded;
      if (r.chance(0.04)) u.down = true; else if (r.chance(0.05)) delete u.down;
      if (r.chance(0.1)) u.z = r.int(0, 300);
      if (r.chance(0.1)) u.swing = r.int(0, 12); else if (r.chance(0.1)) delete u.swing;
      if (r.chance(0.1)) u.ready = r.int(0, 300); else if (r.chance(0.1)) delete u.ready;
      if (r.chance(0.05)) u.on = r.int(0, 40); else if (r.chance(0.05)) delete u.on;
      if (r.chance(0.05)) u.task = r.pick(['ignite', 'extinguish', 'push', 'crew'] as const); else if (r.chance(0.05)) delete u.task;
      if (r.chance(0.05)) (u.carry = r.pick(CARRY)), (u.load = r.int(1, 20)); else if (r.chance(0.05)) (delete u.carry, delete u.load);
      if (r.chance(0.1)) u.tag = r.int(1, 50); else if (r.chance(0.05)) delete u.tag;
      if (r.chance(0.05)) u.sat = r.int(0, 100); else if (r.chance(0.05)) delete u.sat;
    }
    if (r.chance(0.2)) add(r.int(1, 4));
    if (r.chance(0.15) && units.size > 3) units.delete([...units.keys()][r.int(0, units.size - 1)]);
    for (const s of squads) {
      if (r.chance(0.1)) s.order = r.pick(ORDERS);
      if (r.chance(0.08)) s.fireArrows = { on: r.chance(0.5), available: r.chance(0.5), ...(r.chance(0.5) ? { reason: r.pick(['noBrazier', 'noPitch'] as const) } : {}) };
      if (r.chance(0.08)) s.meals = r.int(0, 300); else if (r.chance(0.04)) delete s.meals;
      if (r.chance(0.05)) s.cartDrop = r.int(0, 9); else if (r.chance(0.04)) delete s.cartDrop;
      if (r.chance(0.06)) s.active = { skill: 'shieldWall', ready: r.int(0, 80), on: r.int(0, 30) } as SquadSnap['active']; else if (r.chance(0.04)) delete s.active;
    }
    const shots: ShotSnap[] = [];
    for (let k = r.int(0, 3); k > 0; k--) {
      const s: ShotSnap = { x0: r.range(0, 200), y0: r.range(0, 200), x1: r.range(0, 200), y1: r.range(0, 200), t0: tick - r.int(0, 3), t1: tick + r.int(1, 12), z0: r.int(0, 40), z1: r.int(0, 40), by: r.int(-3, 400), kind: r.pick(['arrow', 'stone', 'javelin'] as const) };
      if (r.chance(0.3)) s.fire = true;
      if (r.chance(0.2)) s.siege = r.int(0, 9);
      shots.push(s);
    }
    if (r.chance(0.2)) buildings[0].progress = Math.min(1, buildings[0].progress + 0.125);
    if (r.chance(0.05) && buildings.length < 5) buildings.push({ id: 10 + buildings.length, type: 'farm', team: 2, x: r.int(0, 99), y: r.int(0, 99), state: 'building', progress: 0 });
    if (r.chance(0.04) && buildings.length > 2) buildings.pop();
    if (r.chance(0.1)) sieges[0].x += 0.5;
    souls[0].left = Math.max(0, souls[0].left - 1);
    if (r.chance(0.2)) (bosses[0].x += r.range(-1, 1)), (bosses[0].hp = Math.max(0, bosses[0].hp - r.range(0, 30)));
    if (r.chance(0.1)) (bosses[0] as unknown as { phase: number }).phase = r.int(0, 2);
    if (r.chance(0.1)) bosses[0].respawnIn = r.int(0, 40);
    if (r.chance(0.08)) warden = r.chance(0.7) ? { x: r.int(0, 300), y: r.int(0, 300), w: r.int(2, 8), h: r.int(2, 8), in: r.int(0, 30) } : undefined;
    const f: FrameInput = {
      tick, units: [...units.values()], squads: squads.map((s) => ({ ...s, units: [] })), shots, buildings: buildings.map((b) => ({ ...b })) as never,
      sieges: (t % 17 < 12 ? sieges.map((s) => ({ ...s })) : []) as never, souls: (t % 23 < 15 ? souls.map((s) => ({ ...s })) : []) as never,
      bosses: t % 31 < 25 ? bosses.map((b) => ({ ...b })) : [], ...(warden ? { warden } : {}),
    };
    const bytes = enc.encode(f, t === 1 || t % keyEvery === 0);
    frames.push(b64(bytes));
    snaps.push(dec.apply(bytes));
  }
  return { seed, frames, snaps };
}

export const vectors = () => ({ runs: [stream(1, 60, 25), stream(42, 80, 50), stream(7, 30, 7)] });
