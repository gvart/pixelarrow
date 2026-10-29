/**
 * W-67 beasts (src/war/sim/mobs.ts): lions (a pride that pounces), river serpents (slow, venomous, a lunge), the boar's
 * charge run-up, and the mob FX events (mobDash, mobCry, mobScatter) the view plays.
 */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { warStats } from '../../src/war/sim/classes';
import { MOB_KINDS, MOBS } from '../../src/war/sim/mobs';
import type { RegionData, WarBuildSim, WarEvent } from '../../src/war/types';
import kyreneN from '../../src/war/regions/kyrene-n.json';
import kyreneW from '../../src/war/regions/kyrene-w.json';
import savanna from '../../src/war/regions/savanna.json';
import elaiaN from '../../src/war/regions/elaia-n.json';
import { mobSfx } from '../../src/war/view/sound/mix';
import { RECIPES } from '../../src/audio/sfx';

function flat(lairs: RegionData['lairs'] = [], n = 96): RegionData {
  return { id: 't', name: 't', w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0), entries: [], noBuild: [], objects: [], lairs, claimPoints: [] };
}

/** Steps the sim, collecting its events. */
function run(sim: WarBuildSim, ticks: number, log: WarEvent[], until?: () => boolean): number {
  for (let t = 0; t < ticks; t++) {
    sim.step();
    log.push(...sim.events());
    if (until?.()) return t + 1;
  }
  return ticks;
}

const dashes = (log: WarEvent[], mob: string) => log.filter((e): e is Extract<WarEvent, { kind: 'mobDash' }> => e.kind === 'mobDash' && e.mob === mob);
const alive = (sim: WarBuildSim, squad: number) => {
  const s = sim.snapshot();
  return s.units.filter((u) => s.squads[squad].units.includes(u.id) && u.state !== 'dead');
};

describe('beasts (W-67)', () => {
  it('lion and serpent are mob kinds with their own stats', () => {
    expect(MOB_KINDS).toContain('lion');
    expect(MOB_KINDS).toContain('serpent');
    const militia = warStats('militia'), lion = warStats('mob_lion'), serpent = warStats('mob_serpent');
    expect(lion.speed).toBeGreaterThan(militia.speed);
    expect(lion.dmg).toBeGreaterThan(militia.dmg);
    expect(lion.range).toBe(0);
    expect(MOBS.lion.count).toBeGreaterThanOrEqual(2);
    expect(MOBS.lion.count).toBeLessThanOrEqual(4);
    expect(MOBS.lion.dash?.once).toBe(true);
    expect(serpent.speed).toBeLessThan(militia.speed);
    expect(serpent.maxHp).toBeGreaterThan(militia.maxHp * 2);
    expect(serpent.reach).toBeGreaterThan(militia.reach);
    expect(MOBS.serpent.venom).toBe(true);
    expect(MOBS.serpent.count).toBeLessThanOrEqual(3);
  });

  it('a lion pounces on a man once: a burst from a few tiles off, then plain blows', () => {
    const sim = createSim(flat(), 11);
    const lions = sim.spawnSquad('wild', 1, 'mob_lion', 1, 30.5, 40.5);
    const men = sim.spawnSquad('you', 0, 'militia', 1, 40.5, 40.5);
    sim.order({ kind: 'hold', squad: men });
    sim.order({ kind: 'attack', squad: lions, target: men });
    const log: WarEvent[] = [];
    run(sim, 60, log, () => dashes(log, 'lion').length > 0);
    const [p] = dashes(log, 'lion');
    expect(p).toBeDefined();
    const gap = Math.hypot(p.tx - p.x, p.ty - p.y);
    expect(gap).toBeGreaterThan(MOBS.lion.dash!.min);
    expect(gap).toBeLessThan(MOBS.lion.dash!.max + 3);
    // the leap closes the gap faster than its run would
    const x0 = alive(sim, lions)[0].x;
    run(sim, 4, log);
    const leap = alive(sim, lions)[0].x - x0;
    const sim2 = createSim(flat(), 11), l2 = sim2.spawnSquad('wild', 1, 'mob_lion', 1, 10.5, 40.5);
    sim2.order({ kind: 'move', squad: l2, x: 80, y: 40.5 });
    for (let t = 0; t < 40; t++) sim2.step();
    const xa = alive(sim2, l2)[0].x;
    for (let t = 0; t < 4; t++) sim2.step();
    expect(leap).toBeGreaterThan((alive(sim2, l2)[0].x - xa) * 1.5);
    // no second pounce on the same man while it fights him
    run(sim, 300, log, () => alive(sim, men).length === 0);
    expect(dashes(log, 'lion')).toHaveLength(1);
  });

  it('the pounce blow hits harder than the lion\'s plain blows', () => {
    const blow = (pounce: boolean) => {
      const sim = createSim(flat(), 12);
      const lions = sim.spawnSquad('wild', 1, 'mob_lion', 1, pounce ? 30.5 : 39.2, 40.5);
      const men = sim.spawnSquad('you', 0, 'hoplite', 1, 40.5, 40.5);
      sim.order({ kind: 'hold', squad: men });
      sim.order({ kind: 'attack', squad: lions, target: men });
      const hp0 = alive(sim, men)[0].hp, log: WarEvent[] = [];
      run(sim, 120, log, () => alive(sim, men)[0].hp < hp0);
      return [hp0 - alive(sim, men)[0].hp, dashes(log, 'lion').length] as const;
    };
    const [plain, n0] = blow(false), [leap, n1] = blow(true);
    expect(n0).toBe(0);
    expect(n1).toBe(1);
    expect(leap).toBeGreaterThan(plain * 1.3);
  });

  it('a boar charges with a run-up before its blow, again only after its cooldown', () => {
    const sim = createSim(flat(), 13);
    const boars = sim.spawnSquad('wild', 1, 'mob_boar', 1, 30.5, 40.5);
    const men = sim.spawnSquad('you', 0, 'hoplite', 4, 40.5, 40.5);
    sim.order({ kind: 'hold', squad: men });
    sim.order({ kind: 'attack', squad: boars, target: men });
    const log: WarEvent[] = [];
    run(sim, 400, log);
    const d = dashes(log, 'boar');
    expect(d.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < d.length; i++) expect(d[i].t - d[i - 1].t).toBeGreaterThanOrEqual(MOBS.boar.dash!.cd);
  });

  it('a river serpent crawls slowly, lunges the last tiles and bites', () => {
    const sim = createSim(flat(), 14);
    const sn = sim.spawnSquad('wild', 1, 'mob_serpent', 1, 30.5, 40.5);
    const men = sim.spawnSquad('you', 0, 'militia', 3, 40.5, 40.5);
    sim.order({ kind: 'hold', squad: men });
    sim.order({ kind: 'attack', squad: sn, target: men });
    const log: WarEvent[] = [];
    run(sim, 20, log);
    expect(dashes(log, 'serpent')).toHaveLength(0); // still crawling
    run(sim, 300, log, () => dashes(log, 'serpent').length > 0);
    expect(dashes(log, 'serpent').length).toBe(1);
    const hp = () => alive(sim, men).reduce((a, u) => a + u.hp, 0), h0 = hp();
    run(sim, 200, log, () => hp() < h0);
    expect(hp()).toBeLessThan(h0);
  });

  it('a lair roused cries out (lion roar), a mauled pride breaks off and scatters, a herd bolts', () => {
    const sim = createSim(flat([{ kind: 'lion', x: 30.5, y: 30.5 }, { kind: 'ibex', x: 70.5, y: 70.5 }, { kind: 'boar', x: 70.5, y: 20.5 }]), 15);
    sim.spawnMobs();
    sim.spawnSquad('you', 0, 'hoplite', 24, 38.5, 30.5);
    const log: WarEvent[] = [];
    run(sim, 600, log, () => log.some((e) => e.kind === 'mobScatter' && e.mob === 'lion'));
    const cry = log.find((e) => e.kind === 'mobCry');
    expect(cry).toMatchObject({ kind: 'mobCry', lair: 0, mob: 'lion' });
    expect(log.some((e) => e.kind === 'mobScatter' && e.mob === 'lion')).toBe(true);
    // the boar lair, never roused, makes no cry (boars have none)
    sim.spawnSquad('you', 0, 'militia', 6, 78.5, 20.5);
    sim.spawnSquad('you', 0, 'militia', 6, 76.5, 70.5);
    run(sim, 120, log);
    expect(log.some((e) => e.kind === 'mobScatter' && e.mob === 'ibex')).toBe(true);
    expect(log.some((e) => e.kind === 'mobCry' && e.mob === 'boar')).toBe(false);
  });

  it('is deterministic with lions and serpents', () => {
    const go = () => {
      const sim = createSim(flat([{ kind: 'lion', x: 30.5, y: 30.5 }, { kind: 'serpent', x: 50.5, y: 50.5 }]), 16);
      sim.spawnMobs();
      const s = sim.spawnSquad('you', 0, 'hoplite', 20, 40.5, 40.5);
      sim.order({ kind: 'move', squad: s, x: 30, y: 30 });
      for (let t = 0; t < 400; t++) sim.step();
      return JSON.stringify(sim.snapshot());
    };
    expect(go()).toBe(go());
  });

  it('the regions whose lore names them hold lion and serpent lairs', () => {
    const kinds = (r: { lairs?: { kind: string }[] }) => (r.lairs ?? []).map((l) => l.kind);
    expect(kinds(kyreneN)).toContain('lion');
    expect(kinds(savanna)).toContain('lion');
    expect(kinds(kyreneW)).toContain('serpent');
    expect(kinds(elaiaN)).toContain('serpent');
  });

  it('mob FX events have sounds: a howl, roars, the charge, the pounce, the hiss, a herd bolting', () => {
    expect(mobSfx('mobCry', 'wolf')).toBe('howl');
    expect(mobSfx('mobCry', 'lion')).toBe('roar');
    expect(mobSfx('mobCry', 'bear')).toBe('roar');
    expect(mobSfx('mobDash', 'boar')).toBe('thud');
    expect(mobSfx('mobDash', 'serpent')).toBe('hiss');
    expect(mobSfx('mobScatter', 'ibex')).toBe('hooves');
    for (const k of MOB_KINDS) for (const e of ['mobCry', 'mobDash', 'mobScatter'] as const) {
      const id = mobSfx(e, k);
      if (id) expect(RECIPES[id]).toBeTypeOf('function');
    }
  });
});
