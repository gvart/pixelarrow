/**
 * W-73 region mastery and the wild's solo deeds (src/war/net/mastery.ts): a player's men clearing a lair, slaying a
 * chief or finishing a hidden quest are deeds of the wild; every lair, chief and hidden quest a region was built with,
 * each counted once (a respawned lair does not count twice), masters it.
 */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { makePerson } from '../../src/war/sim/roster';
import { ARMY_MAX } from '../../src/war/sim/soldiers';
import { masteryDeed } from '../../src/war/sim/deeds';
import { hiddenStories } from '../../src/data/warStories';
import { countsFor, masteryNeed, masteryView, wildDeeds, type WildDeed } from '../../src/war/net/mastery';
import { WORLD_REGIONS } from '../../src/war/world/regions';
import type { RegionData, WarBuildSim } from '../../src/war/types';

const REGIONS = import.meta.glob<{ default: RegionData }>('../../src/war/regions/*.json', { eager: true });
const regionJson = (id: string) => Object.entries(REGIONS).find(([k]) => k.endsWith(`/${id}.json`))?.[1].default;

function flat(lairs: RegionData['lairs'], n = 96): RegionData {
  return { id: 't', name: 't', w: n, h: n, depth: 1, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0), entries: [], noBuild: [], objects: [], lairs, claimPoints: [] };
}

describe('region mastery (W-73)', () => {
  it('needs every lair, chief and hidden quest the region was built with', () => {
    const r = WORLD_REGIONS.map((w) => regionJson(w.id)).find((x) => x && (x.lairs ?? []).some((l) => l.chief) && (x.secrets ?? []).length)!;
    expect(r).toBeDefined();
    const need = masteryNeed(r);
    expect(need.lairs).toHaveLength(r.lairs!.length);
    expect(need.chiefs).toEqual(r.lairs!.filter((l) => l.chief).map((l) => l.chief));
    expect(need.secrets).toEqual(hiddenStories(r).map((s) => s.id));
    const v0 = masteryView(r.id, need, []);
    expect(v0.done).toBe(false);
    const all = [...need.lairs.map((key) => ({ kind: 'lair' as const, key })), ...need.chiefs.map((key) => ({ kind: 'chief' as const, key })), ...need.secrets.map((key) => ({ kind: 'secret' as const, key }))];
    expect(masteryView(r.id, need, all.slice(1)).done).toBe(false);
    expect(masteryView(r.id, need, [...all, ...all]).done).toBe(true);
    expect(countsFor(need, { kind: 'chief', key: 'no-such-chief' })).toBe(false);
    expect(masteryDeed(r.id, r.name)).toEqual({ id: `banner:${r.id}`, name: `Banner of ${r.name}` });
  });

  it('a solo army clears a plain lair and a chief\'s: lair and chief deeds for him; a respawned lair counts once', () => {
    const sim: WarBuildSim = createSim(flat([{ kind: 'wolf', x: 40.5, y: 40.5 }, { kind: 'boar', x: 56.5, y: 40.5, chief: 'tuskmother' }]), 3);
    sim.spawnMobs();
    const need = masteryNeed(flat([{ kind: 'wolf', x: 40.5, y: 40.5 }, { kind: 'boar', x: 56.5, y: 40.5, chief: 'tuskmother' }]));
    const men = Array.from({ length: ARMY_MAX }, (_, k) => makePerson(`p${k}`, 'hoplite', { level: 3 }));
    const me = sim.spawnSquad('p:7', 0, 'hoplite', ARMY_MAX, 48, 46, men);
    const seen = new Map<number, string>(), deeds: WildDeed[] = [];
    const step = () => (sim.step(), deeds.push(...wildDeeds(sim.snapshot(), sim.events(), seen)));
    for (const l of sim.snapshot().lairs!) {
      sim.order({ kind: 'attack', squad: me, target: l.squad });
      for (let t = 0; t < 3000 && sim.snapshot().lairs![l.id].state !== 'cleared'; t++) step();
      step();
    }
    expect(deeds.filter((d) => d.pid === 7).map((d) => `${d.kind}:${d.key}`).sort()).toEqual(['chief:tuskmother', 'lair:0', 'lair:1']);
    expect(masteryView('t', need, deeds).done).toBe(true);
    // the same deeds again (a respawned lair cleared again) change nothing
    expect(masteryView('t', need, [...deeds, { pid: 7, kind: 'lair', key: '0' }])).toEqual(masteryView('t', need, deeds));
  });

  it('a hidden quest done is its owner\'s deed; offline the local player\'s squads (`you`) map to his pid', () => {
    const snap = createSim(flat([]), 1).snapshot();
    const ev = { t: 1, kind: 'secret', what: 'done', quest: 'hidden:t:0', owner: 'you', team: 0, title: '', text: '', x: 0, y: 0 } as const;
    expect(wildDeeds(snap, [ev], new Map(), 3)).toEqual([{ pid: 3, kind: 'secret', key: 'hidden:t:0' }]);
    expect(wildDeeds(snap, [{ ...ev, owner: 'p:9' }], new Map())).toEqual([{ pid: 9, kind: 'secret', key: 'hidden:t:0' }]);
    expect(wildDeeds(snap, [{ ...ev, what: 'step' }], new Map())).toEqual([]);
  });
});

describe('the mastery chip (W-73)', () => {
  it('shows have/need chips for what the region holds, and the badge once mastered', async () => {
    const { masteryHtml } = await import('../../src/war/view/hud/mastery');
    const v = { region: 'r', lairs: [2, 6] as [number, number], chiefs: [0, 0] as [number, number], secrets: [1, 3] as [number, number], done: false };
    const html = masteryHtml(v, 'Grey Moors');
    expect(html).toContain('2/6');
    expect(html).toContain('1/3');
    expect(html).not.toContain('0/0');
    expect(html).not.toContain('Mastered');
    expect(masteryHtml({ ...v, lairs: [6, 6], secrets: [3, 3], done: true }, 'Grey Moors')).toContain('Mastered');
  });
});
