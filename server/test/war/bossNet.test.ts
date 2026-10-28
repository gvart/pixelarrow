/**
 * W-67 boss-net: the live room sends each player the guardians his team sees (bar, phase, move telegraphs and FX ride on
 * the binary frame) and the guardian events where his team sees them (`bossEv`); a guardian under his fog stays off his wire.
 */
import { describe, expect, it } from 'vitest';
import { DeltaDecoder } from '../../../src/war/net/codec';
import { NET_VERSION, type JoinMsg, type ServerMsg } from '../../../src/war/net/protocol';
import type { BossSnap } from '../../../src/war/types';
import { WarRoom } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';

const region = warRegion('omphalos')!;
const join = (pid: number, team: number): JoinMsg => ({ t: 'join', v: NET_VERSION, region: 'omphalos', playerId: pid, team, army: [{ cls: 'hoplite', count: 4 }] });

/** Two players: 1 (team 0) with men beside the Minotaur, 2 (team 1) with men beside the Titan, 84 tiles apart. */
function setup() {
  const r = new WarRoom({ region, seed: 1, cap: 600, wild: true });
  r.join(1, join(1, 0));
  r.join(2, join(2, 1));
  const at = (id: string) => region.guardians!.find((g) => g.boss === id)!;
  const mino = at('minotaur'), titan = at('titan');
  r.sim.spawnSquad('p:1', 0, 'hoplite', 12, mino.x + 5, mino.y);
  r.sim.spawnSquad('p:2', 1, 'hoplite', 12, titan.x, titan.y + 9);
  const decs = new Map([[1, new DeltaDecoder()], [2, new DeltaDecoder()]]);
  const msgs = new Map<number, ServerMsg[]>([[1, []], [2, []]]);
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      const t = r.tick();
      for (const [pid, f] of t.frames) decs.get(pid)!.apply(f);
      for (const [pid, ms] of t.msgs) msgs.get(pid)?.push(...ms);
    }
  };
  const bosses = (pid: number): BossSnap[] => decs.get(pid)!.snapshot().bosses ?? [];
  const evs = (pid: number) => msgs.get(pid)!.flatMap((m) => (m.t === 'bossEv' ? m.ev : []));
  return { r, step, bosses, evs };
}

describe('W-67 guardians on the wire', () => {
  it('each player gets the guardian his team sees, with every field as the sim has it, and not the one under his fog', () => {
    const { r, step, bosses } = setup();
    step(3);
    expect(bosses(1).map((b) => b.id)).toEqual(['minotaur']);
    expect(bosses(2).map((b) => b.id)).toEqual(['titan']);
    const sim = r.snapshot().bosses!.find((b) => b.id === 'minotaur')!, got = bosses(1)[0];
    expect({ ...got, x: 0, y: 0, hp: 0 }).toEqual({ ...sim, x: 0, y: 0, hp: 0 });
    expect(got.x).toBeCloseTo(sim.x, 0);
    expect(got.hp).toBe(Math.round(sim.hp));
  });

  it('a phase reaches the player who sees it, as the frame\'s phase and a bossPhase event; the other hears nothing', () => {
    const { r, step, bosses, evs } = setup();
    step(3);
    const t = r.snapshot().bosses!.find((b) => b.id === 'titan')!;
    r.sim.hurtBoss('titan', t.maxHp * 0.55, 'p:2');
    step(3);
    expect(bosses(2)[0]).toMatchObject({ id: 'titan', phase: 1 });
    expect(bosses(2)[0].hp).toBeLessThan(t.maxHp * 0.5);
    expect(evs(2)).toContainEqual(expect.objectContaining({ kind: 'bossPhase', boss: 'titan', phase: 1 }));
    expect(evs(1).filter((e) => e.kind !== 'wardenStrike' && e.boss === 'titan')).toEqual([]);
    expect(bosses(1).some((b) => b.id === 'titan')).toBe(false);
  });

  it('the Bear\'s maul mark and its blow reach the player whose men it goes for, ticking down as in the sim; not the one far off', () => {
    const moors = warRegion('moors')!, bear = moors.guardians![0];
    const r = new WarRoom({ region: moors, seed: 1, cap: 600, wild: true });
    r.join(1, { ...join(1, 0), region: 'moors' });
    r.join(2, { ...join(2, 1), region: 'moors' });
    r.tick();
    const a = r.sim.spawnSquad('p:1', 0, 'hoplite', 12, bear.x, bear.y + 30);
    const decs = [new DeltaDecoder(), new DeltaDecoder()];
    for (let i = 0; i < 3; i++) for (const [pid, f] of r.tick().frames) decs[pid - 1].apply(f);
    // seen before it wakes (past its aggro, beyond his men's sight): the wake banner can play
    expect(decs[0].snapshot().bosses?.[0]).toMatchObject({ id: 'moor_bear', state: 'idle' });
    r.sim.order({ kind: 'attack', squad: a, target: r.snapshot().bosses![0].squad });
    let tele: BossSnap['tele'], fx: BossSnap['fx'];
    for (let i = 0; i < 800 && !(tele && fx); i++) {
      for (const [pid, f] of r.tick().frames) decs[pid - 1].apply(f);
      const sim = r.snapshot().bosses![0], got = decs[0].snapshot().bosses![0];
      // the countdowns go out as absolute ticks: the client's match the sim's every tick
      expect(got.tele).toEqual(sim.tele);
      expect(got.fx).toEqual(sim.fx);
      expect([got.state, got.phase]).toEqual([sim.state, sim.phase]);
      tele ??= got.tele;
      fx ??= got.fx;
    }
    expect(tele?.kind).toBe('maul');
    expect(fx).toBeDefined();
    expect(decs[1].snapshot().bosses).toBeUndefined();
  });

  it('a guardian slain: its epitaph state and the bossSlain event reach the one who sees it', () => {
    const { r, step, bosses, evs } = setup();
    step(2);
    r.sim.hurtBoss('titan', 1e9, 'p:2');
    step(3);
    expect(bosses(2)[0]).toMatchObject({ id: 'titan', state: 'slain' });
    expect(bosses(2)[0].respawnIn).toBe(r.snapshot().bosses!.find((b) => b.id === 'titan')!.respawnIn);
    expect(evs(2)).toContainEqual(expect.objectContaining({ kind: 'bossSlain', boss: 'titan' }));
    expect(evs(1).some((e) => e.kind === 'bossSlain')).toBe(false);
  });
});
