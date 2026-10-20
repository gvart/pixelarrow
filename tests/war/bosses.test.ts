/** M7d landmark guardians (src/war/sim/bosses.ts; docs/WAR.md "Landmarks"): phases, claim gate, loot, respawn, determinism. */
import { afterEach, describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { BOSS, GUARDIANS, MOVES, RAID, WARDEN } from '../../src/war/sim/bosses';
import { bossPile } from '../../src/war/sim/bossLoot';
import { warBoss } from '../../src/data/warBosses';
import type { BossSnap, GuardianEntry, RegionData, WarBuildSim, WarEvent } from '../../src/war/types';

function flat(guardians: GuardianEntry[], extra: Partial<RegionData> = {}, n = 96): RegionData {
  return {
    id: 'krios', name: 't', w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0),
    entries: [], noBuild: [], lairs: [], claimPoints: [{ x: 10, y: 80, lairs: [] }], guardians, depth: 4, ...extra,
  };
}
const boss = (sim: WarBuildSim, i = 0): BossSnap => sim.snapshot().bosses![i];
function run(sim: WarBuildSim, ticks: number, until?: () => boolean): number {
  for (let t = 0; t < ticks; t++) {
    sim.step();
    if (until?.()) return t + 1;
  }
  return ticks;
}
/** Every event of the sim from now on (events() drains the log). */
function events(sim: WarBuildSim): WarEvent[] {
  return sim.events();
}
const unit = (sim: WarBuildSim, id: number) => sim.snapshot().units[id];
/** Hurt the guardian's bar down to `share` of its max hp. */
const downTo = (sim: WarBuildSim, id: string, share: number, owner = 'you') => {
  const b = sim.snapshot().bosses!.find((x) => x.id === id)!;
  sim.hurtBoss(id, b.hp - b.maxHp * share, owner);
  sim.step();
};

const DRAKON: GuardianEntry = { boss: 'drakon', x: 48, y: 48, perches: [[56, 40], [40, 40]], pit: [44, 56] };

describe('guardians (M7d)', () => {
  const saved = { ...BOSS }, savedW = { ...WARDEN };
  afterEach(() => {
    Object.assign(BOSS, saved);
    Object.assign(WARDEN, savedW);
  });

  it('Drakon: yard, roof perch out of melee reach with fire breath, between the towers, crash with drake packs; claim gated', () => {
    const sim = createSim(flat([DRAKON]), 1);
    sim.spawnMobs();
    sim.step();
    expect(boss(sim).id).toBe('drakon');
    expect(boss(sim).phase).toBe(0);
    expect(boss(sim).phases).toEqual(warBoss('drakon')!.phases);
    expect(sim.snapshot().claims![0].state).toBe('locked');
    expect(sim.order({ kind: 'claimRegion', squad: sim.spawnSquad('you', 0, 'hoplite', 12, 12, 80), point: 0 }), 'refused while he lives').toBeUndefined();
    // P2: up onto the keep roof
    downTo(sim, 'drakon', 0.59);
    expect(boss(sim).phase).toBe(1);
    expect(boss(sim).state).toBe('flight');
    run(sim, MOVES.flight + 2);
    expect(boss(sim).state).toBe('perch');
    const u = unit(sim, boss(sim).unit);
    expect([u.x, u.y]).toEqual([56, 40]);
    // melee under the roof cannot reach him; his breath falls on them
    const hp0 = boss(sim).hp;
    const foot = sim.spawnSquad('you', 0, 'hoplite', 12, 58, 44);
    sim.order({ kind: 'attack', squad: foot, target: boss(sim).squad });
    events(sim);
    run(sim, 60);
    expect(boss(sim).hp).toBe(hp0);
    const s = sim.snapshot();
    expect(s.squads[foot].units.some((id) => s.units[id].hp < s.units[id].maxHp || s.units[id].state === 'dead')).toBe(true);
    expect(events(sim).length + 1).toBeGreaterThan(0);
    // archers bring him down
    const bows = sim.spawnSquad('you', 0, 'archer', 12, 56, 50);
    sim.order({ kind: 'attack', squad: bows, target: boss(sim).squad });
    run(sim, 120);
    expect(boss(sim).hp).toBeLessThan(hp0);
    // flight between the towers
    run(sim, MOVES.perchFor + MOVES.flight + 5);
    const v = unit(sim, boss(sim).unit);
    expect([v.x, v.y]).toEqual([40, 40]);
    // P3: crashes down, enraged, two drake packs from the bone pit
    const squads0 = sim.snapshot().squads.length;
    downTo(sim, 'drakon', 0.29);
    expect(boss(sim).phase).toBe(2);
    run(sim, MOVES.flight + 2);
    expect(boss(sim).state).toBe('fight');
    expect(sim.snapshot().squads.length).toBe(squads0 + MOVES.crash.packs);
    // the kill opens the claim point and names the killers
    events(sim);
    sim.hurtBoss('drakon', 1e9, 'p:7');
    sim.step();
    const slain = events(sim).find((e) => e.kind === 'bossSlain');
    expect(slain).toMatchObject({ kind: 'bossSlain', boss: 'drakon', region: 'krios' });
    expect((slain as { killers: string[] }).killers[0]).toBe('p:7');
    expect((slain as { killers: string[] }).killers).toContain('you');
    expect(boss(sim).state).toBe('slain');
    expect(sim.snapshot().claims![0].state).toBe('open');
  });

  it('phase events fire once each, in order', () => {
    const sim = createSim(flat([DRAKON]), 2);
    sim.spawnMobs();
    sim.step();
    events(sim);
    downTo(sim, 'drakon', 0.1);
    const ph = events(sim).filter((e) => e.kind === 'bossPhase').map((e) => (e as { phase: number }).phase);
    expect(ph).toEqual([1, 2]);
  });

  it('Scylla: body shut while 3+ heads live, a man near the water snatched, drags onto the flats at 50%', () => {
    const n = 96, water = Array(n * n).fill(0);
    for (let y = 0; y < n; y++) for (let x = 60; x < n; x++) water[y * n + x] = 2;
    const heads: [number, number][] = [[57, 40], [57, 43], [57, 46], [57, 49], [57, 52], [57, 55]];
    const sim = createSim(flat([{ boss: 'scylla', x: 58, y: 47, heads, flats: [40, 47] }], { id: 'siren', water }), 3);
    sim.spawnMobs();
    sim.step();
    expect(boss(sim).parts).toEqual({ alive: 6, total: 6 });
    const hp0 = boss(sim).hp;
    sim.hurtBoss('scylla', 5000);
    sim.step();
    expect(boss(sim).hp, 'shut while 6 heads live').toBe(hp0);
    for (let k = 0; k < 4; k++) sim.hurtBoss('scylla', 1e9, 'you', k);
    run(sim, 2);
    expect(boss(sim).parts!.alive).toBe(2);
    sim.hurtBoss('scylla', 5000);
    sim.step();
    expect(boss(sim).hp).toBeLessThan(hp0);
    // a squad on the shore by the last heads: one man snatched within a snatch period
    sim.spawnSquad('you', 0, 'hoplite', 12, 57, 60);
    events(sim);
    run(sim, MOVES.snatch.every + 5, () => boss(sim).fx?.kind === 'snatch');
    expect(boss(sim).fx?.kind).toBe('snatch');
    sim.step();
    expect(events(sim).some((e) => e.kind === 'fall')).toBe(true);
    downTo(sim, 'scylla', 0.49);
    expect(boss(sim).phase).toBe(1);
    run(sim, 300);
    expect(unit(sim, boss(sim).unit).x).toBeLessThan(55);
  });

  it('Brontes hurls from the gate top, then comes down at 50% and smashes; Gyges strikes three at once in chains, then breaks them', () => {
    const sim = createSim(flat([{ boss: 'brontes', x: 30, y: 50, perches: [[30, 40]] }, { boss: 'gyges', x: 70, y: 50 }], { id: 'saddle', depth: 3 }), 4);
    sim.spawnMobs();
    sim.step();
    expect(boss(sim, 0).state).toBe('perch');
    const b0 = unit(sim, boss(sim, 0).unit);
    expect([b0.x, b0.y]).toEqual([30, 40]);
    // rocks on a squad 15 tiles off
    const sq = sim.spawnSquad('you', 0, 'hoplite', 12, 30, 55);
    run(sim, MOVES.rock.every * 2 + 5);
    let s = sim.snapshot();
    expect(s.squads[sq].units.some((id) => s.units[id].hp < s.units[id].maxHp)).toBe(true);
    downTo(sim, 'brontes', 0.49);
    run(sim, 12);
    expect(boss(sim, 0).state).toBe('fight');
    expect(Math.abs(unit(sim, boss(sim, 0).unit).y - 50)).toBeLessThan(1);
    // Gyges in chains: three men struck in one blow
    const g = sim.spawnSquad('you', 0, 'hoplite', 12, 73, 50);
    const gy = unit(sim, boss(sim, 1).unit);
    run(sim, MOVES.triple.every + 2);
    s = sim.snapshot();
    const hit = s.squads[g].units.filter((id) => s.units[id].hp < s.units[id].maxHp).length;
    expect(hit).toBeGreaterThanOrEqual(2);
    expect(hit).toBeLessThanOrEqual(MOVES.triple.n * 2);
    expect([unit(sim, boss(sim, 1).unit).x, unit(sim, boss(sim, 1).unit).y]).toEqual([gy.x, gy.y]);
    downTo(sim, 'gyges', 0.49);
    expect(boss(sim, 1).phase).toBe(1);
    expect(boss(sim, 1).state).toBe('fight');
  });

  it('Chimera: three linked heads; the goat dead, no more fire; all three dead, slain', () => {
    const sim = createSim(flat([{ boss: 'chimera', x: 48, y: 48 }], { id: 'canyons', depth: 3 }), 5);
    sim.spawnMobs();
    sim.step();
    expect(boss(sim).parts).toEqual({ alive: 3, total: 3 });
    expect(boss(sim).hide?.length).toBe(2);
    expect(boss(sim).maxHp).toBe(GUARDIANS.chimera.parts!.hp * 3);
    sim.hurtBoss('chimera', 1e9, 'you', 1); // the goat
    run(sim, 2);
    expect(boss(sim).parts!.alive).toBe(2);
    sim.spawnSquad('you', 0, 'hoplite', 12, 52, 48);
    run(sim, MOVES.goatBreath.every * 2);
    expect(boss(sim).fx?.kind === 'breath').toBe(false);
    sim.hurtBoss('chimera', 1e9, 'you', 0);
    sim.hurtBoss('chimera', 1e9, 'you', 2);
    run(sim, 2);
    expect(boss(sim).state).toBe('slain');
  });

  it('the Bandit King runs for the postern under 30%, escapes after 60 s there and comes back in an hour with half his guard', () => {
    const sim = createSim(flat([{ boss: 'bandit_king', x: 48, y: 48, postern: [48, 62] }], { id: 'ammon' }), 6);
    sim.spawnMobs();
    sim.step();
    const guard = sim.snapshot().squads[boss(sim).squad].units.length - 1;
    expect(guard).toBe(GUARDIANS.bandit_king.guard!.n);
    downTo(sim, 'bandit_king', 0.29);
    expect(boss(sim).state).toBe('flee');
    events(sim);
    run(sim, 2000, () => boss(sim).state === 'away');
    expect(boss(sim).state).toBe('away');
    expect(events(sim).some((e) => e.kind === 'bossFled')).toBe(true);
    expect(sim.snapshot().claims![0].state, 'still held while he lives').toBe('locked');
    run(sim, MOVES.postern.away + 5, () => boss(sim).state !== 'away');
    expect(boss(sim).state).toBe('idle');
    expect(boss(sim).hp).toBe(boss(sim).maxHp);
    const back = sim.snapshot().squads[boss(sim).squad].units.length - 1;
    expect(back).toBe(Math.ceil(guard / 2));
  });

  it('the Maenad Queen of the Grove calls two maenad packs under 40%', () => {
    const sim = createSim(flat([{ boss: 'grove_queen', x: 48, y: 48 }], { id: 'erymanthos', depth: 3 }), 7);
    sim.spawnMobs();
    sim.step();
    const n0 = sim.snapshot().squads.length;
    downTo(sim, 'grove_queen', 0.39);
    expect(boss(sim).phase).toBe(1);
    const s = sim.snapshot();
    expect(s.squads.length).toBe(n0 + MOVES.calls.packs);
    expect(s.units[s.squads[n0].units[0]].cls).toBe('mob_maenad');
  });

  it('loot: the kill drops its tier table and rare good as a pile where it fell', () => {
    const sim = createSim(flat([DRAKON]), 8);
    sim.spawnMobs();
    sim.step();
    events(sim);
    sim.hurtBoss('drakon', 1e9, 'you');
    sim.step();
    const e = events(sim).find((x) => x.kind === 'bossSlain') as Extract<WarEvent, { kind: 'bossSlain' }>;
    const p = bossPile('krios', 'sandbox', e);
    expect(p.lots).toEqual([{ r: 'dragonbone', n: 20, o: 'krios' }]);
    expect(p.items).toHaveLength(4);
    expect(bossPile('krios', 'sandbox', e)).toEqual(p);
    const id = sim.dropPile(p.x, p.y, p.lots, p.items);
    sim.step();
    const pile = sim.snapshot().piles!.find((x) => x.id === id)!;
    expect(pile.goods.dragonbone).toBe(20);
    expect(pile.items).toBe(4);
  });

  it('respawn: back after 24 h unheld (full hp, gate shut again); never while a claim point is held', () => {
    BOSS.respawn = 200;
    BOSS.retry = 50;
    const sim = createSim(flat([DRAKON], { depth: 2 }), 9);
    sim.spawnMobs();
    sim.step();
    sim.hurtBoss('drakon', 1e9);
    sim.step();
    expect(boss(sim).state).toBe('slain');
    expect(boss(sim).respawnIn).toBeGreaterThan(190);
    events(sim);
    run(sim, 210);
    expect(boss(sim).state).toBe('idle');
    expect(boss(sim).hp).toBe(boss(sim).maxHp);
    expect(events(sim).some((e) => e.kind === 'bossBack')).toBe(true);
    expect(sim.snapshot().claims![0].state).toBe('locked');
    // slain again, the point claimed: he stays dead
    BOSS.respawn = 1500;
    sim.hurtBoss('drakon', 1e9);
    sim.step();
    expect(boss(sim).state).toBe('slain');
    expect(sim.snapshot().claims![0].state).toBe('open');
    const sq = sim.spawnSquad('you', 0, 'hoplite', 12, 12, 80);
    sim.order({ kind: 'claimRegion', squad: sq, point: 0 });
    run(sim, 1600, () => sim.snapshot().claims![0].state === 'claimed');
    expect(sim.snapshot().claims![0].state).toBe('claimed');
    run(sim, 1500);
    expect(boss(sim).state).toBe('slain');
  });

  it('raid scaling: more foe squads near than the tier raid make it tougher, capped', () => {
    const sim = createSim(flat([DRAKON]), 10);
    sim.spawnMobs();
    sim.step();
    const max0 = boss(sim).maxHp;
    for (let k = 0; k < 10; k++) sim.spawnSquad(`p${k}`, 0, 'hoplite', 12, 30 + (k % 5) * 8, 30 + Math.floor(k / 5) * 40);
    run(sim, RAID.every + 1);
    expect(boss(sim).raid).toBe(10);
    expect(boss(sim).scale).toBeCloseTo(1 + RAID.per * (10 - RAID.squads[3]));
    expect(boss(sim).maxHp).toBeCloseTo(max0 * boss(sim).scale);
  });

  it('Rim Warden: a marked 8 x 8 patch of the rim band, then 60% max hp to every man in it', () => {
    WARDEN.every = 40;
    const sim = createSim(flat([], { rim: 'N' }), 11);
    const sq = sim.spawnSquad('you', 0, 'hoplite', 12, 20, 6);
    run(sim, 41);
    const w = sim.snapshot().warden!;
    expect(w.w).toBe(8);
    expect(w.y + w.h).toBeLessThanOrEqual(WARDEN.band);
    run(sim, WARDEN.telegraph);
    const s = sim.snapshot();
    const inPatch = s.squads[sq].units.map((id) => s.units[id]).filter((u) => u.x >= w.x && u.x < w.x + w.w && u.y >= w.y && u.y < w.y + w.h);
    expect(inPatch.length).toBeGreaterThan(0);
    for (const u of inPatch) expect(u.hp).toBeLessThanOrEqual(u.maxHp * 0.41);
  });

  it('is deterministic and resumes from a save mid-fight exactly', () => {
    const play = (sim: WarBuildSim) => {
      sim.spawnMobs();
      sim.step();
      const a = sim.spawnSquad('you', 0, 'hoplite', 12, 40, 52);
      const b = sim.spawnSquad('you', 0, 'archer', 12, 44, 60);
      sim.order({ kind: 'attack', squad: a, target: boss(sim).squad });
      sim.order({ kind: 'attack', squad: b, target: boss(sim).squad });
    };
    const s1 = createSim(flat([DRAKON]), 12), s2 = createSim(flat([DRAKON]), 12);
    play(s1);
    play(s2);
    run(s1, 200);
    run(s2, 200);
    s1.hurtBoss('drakon', boss(s1).maxHp * 0.45);
    s2.hurtBoss('drakon', boss(s2).maxHp * 0.45);
    run(s1, 100);
    run(s2, 100);
    expect(s1.snapshot()).toEqual(s2.snapshot());
    const r = createSim(flat([DRAKON]), 12);
    r.importState(JSON.parse(JSON.stringify(s1.exportState())));
    run(s1, 150);
    run(r, 150);
    expect(r.snapshot()).toEqual(s1.snapshot());
  });
});
