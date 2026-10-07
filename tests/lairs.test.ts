import { describe, expect, it } from 'vitest';
import { getMap } from '../src/online/world';
import { applyBossState, beastLoc, bossDefenders, bossMaxHp, lairAt, lairBeasts, segmentOutcome, worldBossSites, bossLoot } from '../src/online/lairs';
import { onlineBattleSetup } from '../src/online/battle';
import { starterOnlineArmy, DEFAULT_FORMATIONS } from '../src/online/rules';
import { Battle } from '../src/sim/battle';
import { encounterOf } from '../src/data/beasts';

const W = getMap('test30');

describe('beast lairs on the map', () => {
  it("every region of kind 'lair' holds a beast picked from the seed; nothing else does", () => {
    const kinds = new Set<string>();
    for (const seed of [12345, 777, 1, 2, 3, 4, 5, 6]) {
      for (const r of W.all()) {
        const l = lairAt(W, seed, r.id);
        expect(lairAt(W, seed, r.id)).toEqual(l);
        expect(!!l).toBe(r.kind === 'lair');
        if (!l) continue;
        kinds.add(l.enc);
        expect(l.tier).toBeGreaterThanOrEqual(r.tier);
        expect(beastLoc(W, seed, r.id)).toBe(true);
      }
    }
    expect(kinds.size).toBeGreaterThanOrEqual(3);
  });

  it("a lair's beast carries its hoard; the same epoch gives the same beast", () => {
    const seed = 4242;
    const r = W.all().find((x) => x.kind === 'lair')!;
    const l = lairAt(W, seed, r.id)!;
    const a = lairBeasts(seed, r, l, 0);
    expect(lairBeasts(seed, r, l, 0)).toEqual(a);
    expect(encounterOf(a)).toBe(l.enc);
    expect(a.flatMap((x) => Object.values(x.equip)).length).toBeGreaterThan(0);
  });
});

describe('world bosses', () => {
  it('a Kraken on a coastal plot and a Titan in the hills, away from the spawns', () => {
    const spawns = new Set(W.spawns());
    for (const seed of [12345, 777, 4242]) {
      const sites = worldBossSites(W, seed);
      expect(worldBossSites(W, seed)).toEqual(sites);
      const kr = sites.find((s) => s.boss === 'kraken')!;
      const ti = sites.find((s) => s.boss === 'titan')!;
      expect(kr && ti).toBeTruthy();
      expect(kr.loc).not.toBe(ti.loc);
      expect(W.info(kr.loc).coast).toBe(true);
      expect(W.info(ti.loc).site.base).toBe('hills');
      for (const s of sites) {
        expect(W.info(s.loc).kind).toBe('plot');
        expect(spawns.has(s.loc)).toBe(false);
        expect(beastLoc(W, seed, s.loc)).toBe(true);
      }
    }
  });

  it('a raid segment starts from the stored wounds and replays to the same damage', () => {
    const max = bossMaxHp('kraken', 8);
    const parts = Array.from({ length: max.parts }, (_, i) => (i === 1 ? 0 : max.part));
    const { heroes, hp0 } = bossDefenders('kraken', 8, max.body - 1000, parts, '3:1:9');
    const army = starterOnlineArmy(5, { nextId: 1 }, 'p_');
    const setup = applyBossState(onlineBattleSetup(99, { heroes: army, formations: [...DEFAULT_FORMATIONS], bot: true }, { heroes, formations: [...DEFAULT_FORMATIONS], bot: true }, null), hp0, 120);
    const run = () => {
      const b = new Battle(JSON.parse(JSON.stringify(setup)));
      b.startBattle();
      while (b.phase !== 'ended') {
        b.step();
        b.drainEvents();
      }
      return { hash: b.hash(), result: b.result() };
    };
    const x = run();
    const y = run();
    expect(y.hash).toBe(x.hash);
    const seg = segmentOutcome(setup, x.result);
    expect(seg.body).toBeLessThanOrEqual(max.body - 1000);
    expect(seg.parts[1]).toBe(0);
    expect(seg.dealt).toBeGreaterThanOrEqual(0);
    expect(x.result.ticks).toBeLessThanOrEqual(120 * 20 + 1);
  });

  it('the hoard split is by damage share and the same every time', () => {
    const a = bossLoot('titan', 'k', 7, 0.5, 'x_');
    expect(bossLoot('titan', 'k', 7, 0.5, 'x_')).toEqual(a);
    expect(a.length).toBe(12);
    expect(bossLoot('titan', 'k', 8, 0.01, 'y_')).toEqual([]);
    for (const it of a) expect(['rare', 'epic', 'legendary']).toContain(it.rarity);
  });
});
