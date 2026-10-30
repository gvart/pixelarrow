/**
 * world-fill hidden quests (src/war/sim/secrets.ts, src/data/warStories.ts HIDDEN): no marker; men walking onto the
 * spot begin the player's run with a `secret` found event; each template plays to its end (a cache reached, a camp or
 * a chief cleared) and pays a loot pile at his men, his alone; another player's run is his own; a passer-by far off
 * starts nothing; every generated region's hidden spots make playable stories.
 */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { HIDDEN, hiddenStories, landOf, type Land } from '../../src/data/warStories';
import { HIDDEN_IDS } from '../../src/data/warWild';
import { WORLD_REGIONS } from '../../src/war/regions/index';
import { parseRegion } from '../../src/war/region/schema';
import { depthOf } from '../../src/war/sim/depth';
import type { RegionData, WarBuildSim, WarEvent } from '../../src/war/types';

function flat(quest: string, lairs: RegionData['lairs'] = [{ kind: 'wolf', x: 10.5, y: 10.5 }], n = 128): RegionData {
  return {
    id: 'hid', name: 'hid', w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0),
    entries: [], noBuild: [], objects: [], lairs, claimPoints: [], depth: 1,
    secrets: [{ x: 70.5, y: 70.5, quest, then: [82.5, 70.5] }],
  };
}
function play(sim: WarBuildSim, ticks: number, evs: WarEvent[], until?: () => boolean) {
  for (let t = 0; t < ticks; t++) {
    sim.step();
    evs.push(...sim.events());
    if (until?.()) return;
  }
}
const files = import.meta.glob('../../src/war/regions/*.json', { eager: true, import: 'default' });
const secrets = (evs: WarEvent[]) => evs.filter((e): e is Extract<WarEvent, { kind: 'secret' }> => e.kind === 'secret');

describe('hidden quests', () => {
  it('every template id the fill pass may name has a template', () => {
    expect(HIDDEN.map((h) => h.id).sort()).toEqual([...HIDDEN_IDS].sort());
  });

  it('a passer-by far off starts nothing; walking onto the spot finds it (the found notice, then what to do)', () => {
    const sim = createSim(flat('cache'), 5), evs: WarEvent[] = [];
    sim.spawnMobs();
    const me = sim.spawnSquad('p:1', 0, 'hoplite', 6, 40.5, 100.5);
    play(sim, 100, evs);
    expect(secrets(evs)).toHaveLength(0);
    sim.order({ kind: 'move', squad: me, x: 70.5, y: 70.5 });
    play(sim, 1200, evs, () => secrets(evs).some((e) => e.what === 'found'));
    const found = secrets(evs).find((e) => e.what === 'found')!;
    expect(found).toMatchObject({ owner: 'p:1', team: 0, title: 'The Smuggler\'s Cache' });
    expect(found.text).toContain('cairn');
    play(sim, 20, evs);
    expect(secrets(evs).some((e) => e.what === 'step' && e.text.startsWith('Dig up the cache'))).toBe(true);
  });

  it('cache: reaching the next place pays a pile his alone, and the quest is done', () => {
    const sim = createSim(flat('cache'), 5), evs: WarEvent[] = [];
    const me = sim.spawnSquad('p:1', 0, 'hoplite', 6, 70.5, 72.5);
    play(sim, 40, evs);
    sim.order({ kind: 'move', squad: me, x: 82.5, y: 70.5 });
    play(sim, 1500, evs, () => secrets(evs).some((e) => e.what === 'done'));
    expect(secrets(evs).some((e) => e.what === 'done')).toBe(true);
    const piles = sim.snapshot().piles ?? [];
    expect(piles.length).toBeGreaterThan(0);
    // and found once only
    play(sim, 200, evs);
    expect(secrets(evs).filter((e) => e.what === 'found')).toHaveLength(1);
  });

  it('corpse: the killers spawn at the next place; clearing them ends it with loot', () => {
    const sim = createSim(flat('corpse'), 5), evs: WarEvent[] = [];
    const me = sim.spawnSquad('p:1', 0, 'hoplite', 14, 70.5, 72.5);
    play(sim, 60, evs);
    const camp = (sim.snapshot().lairs ?? []).find((l) => Math.hypot(l.x - 82.5, l.y - 70.5) < 1);
    expect(camp?.kind).toBe('wolf');
    sim.order({ kind: 'attack', squad: me, target: camp!.squad });
    play(sim, 3000, evs, () => secrets(evs).some((e) => e.what === 'done'));
    expect(secrets(evs).find((e) => e.what === 'done')?.goods?.coin).toBeGreaterThan(0);
  });

  it('shrine: the last step is a named chief\'s fight', () => {
    const sim = createSim(flat('shrine'), 5), evs: WarEvent[] = [];
    sim.spawnSquad('p:1', 0, 'hoplite', 4, 70.5, 72.5);
    play(sim, 60, evs);
    const camp = (sim.snapshot().lairs ?? []).find((l) => Math.hypot(l.x - 82.5, l.y - 70.5) < 1);
    expect(camp?.chief?.alive).toBe(true);
    expect(camp?.chief?.name).toBeTruthy();
  });

  it('each player has his own run of a spot', () => {
    const sim = createSim(flat('cache'), 5), evs: WarEvent[] = [];
    sim.spawnSquad('p:1', 0, 'hoplite', 3, 70.5, 72.5);
    sim.spawnSquad('p:2', 1, 'hoplite', 3, 72.5, 70.5);
    play(sim, 60, evs);
    expect(new Set(secrets(evs).filter((e) => e.what === 'found').map((e) => e.owner))).toEqual(new Set(['p:1', 'p:2']));
  });

  it('survives a save and restore mid-quest', () => {
    const sim = createSim(flat('cache'), 5), evs: WarEvent[] = [];
    const me = sim.spawnSquad('p:1', 0, 'hoplite', 3, 70.5, 72.5);
    play(sim, 60, evs);
    const back = createSim(flat('cache'), 5);
    back.importState(sim.exportState());
    const evs2: WarEvent[] = [];
    back.order({ kind: 'move', squad: me, x: 82.5, y: 70.5 });
    play(back, 1500, evs2, () => secrets(evs2).some((e) => e.what === 'done'));
    expect(secrets(evs2).some((e) => e.what === 'found')).toBe(false);
    expect(secrets(evs2).some((e) => e.what === 'done')).toBe(true);
  });

  it('every region past the homes has 2-3 hidden spots whose stories build, 26+ tiles from its lairs', () => {
    for (const r of WORLD_REGIONS) {
      const region = parseRegion(files[`../../src/war/regions/${r.id}.json`]);
      const st = hiddenStories(region);
      if (r.role === 'home') {
        expect(st, r.id).toHaveLength(0);
        continue;
      }
      expect(st.length, r.id).toBeGreaterThanOrEqual(depthOf(region) <= 1 ? 2 : 3);
      for (const s of region.secrets ?? []) {
        for (const l of region.lairs ?? []) expect(Math.hypot(l.x - s.then[0], l.y - s.then[1]), `${r.id} ${s.quest}`).toBeGreaterThanOrEqual(26);
      }
    }
  });

  it('tells each template in the flavour of its ground: every land of the world has its own words, goals of 7 words at most', () => {
    const lands = new Set(WORLD_REGIONS.map((r) => landOf(r.id)).filter((l): l is Land => !!l));
    expect(lands.size).toBeGreaterThanOrEqual(4);
    const c = { at: [0, 0] as [number, number], then: [5, 0] as [number, number], beast: 'wolf' as const, chief: 'greymaw', depth: 1 };
    for (const h of HIDDEN) {
      const plain = h.make(c);
      for (const land of lands) {
        const m = h.make({ ...c, land });
        expect(m.title, `${h.id} ${land}`).not.toBe(plain.title);
        for (const t of [m.hook, m.backstory, m.end]) expect(t.trim(), `${h.id} ${land}`).not.toBe('');
        for (const st of m.steps) expect(st.goal.split(' ').length, st.goal).toBeLessThanOrEqual(7);
      }
    }
  });
});
