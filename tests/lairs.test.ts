import { describe, expect, it } from 'vitest';
import { hexInfo, hexesWithin, hexDistance } from '../src/online/hex';
import { applyBossState, bossDefenders, bossMaxHp, lairAt, lairBeasts, segmentOutcome, worldBossSites, bossLoot } from '../src/online/lairs';
import { onlineBattleSetup } from '../src/online/battle';
import { starterOnlineArmy, DEFAULT_FORMATIONS } from '../src/online/rules';
import { Battle } from '../src/sim/battle';
import { encounterOf } from '../src/data/beasts';

const R = 34;

describe('beast lairs on the shard', () => {
  it('are placed deterministically from the seed: a few dozen, often near forts, never on towns or capitals', () => {
    for (const seed of [12345, 777]) {
      let n = 0;
      let nearFort = 0;
      const kinds = new Set<string>();
      for (const h of hexesWithin({ q: 0, r: 0 }, R, R)) {
        const info = hexInfo(seed, h.q, h.r, R);
        const l = lairAt(seed, info, R);
        expect(lairAt(seed, info, R)).toEqual(l);
        if (!l) continue;
        n++;
        kinds.add(l.enc);
        expect(info.passable && !info.fort && !info.capital && info.type !== 'town').toBe(true);
        expect(l.tier).toBeGreaterThanOrEqual(info.tier);
        if (hexesWithin(h, 2, R).some((x) => hexInfo(seed, x.q, x.r, R).fort)) nearFort++;
      }
      expect(n).toBeGreaterThan(20);
      expect(n).toBeLessThan(90);
      expect(nearFort / n).toBeGreaterThan(0.4);
      expect(kinds.size).toBeGreaterThanOrEqual(4);
    }
  });

  it("a lair's beast carries its hoard; the same epoch gives the same beast", () => {
    const seed = 4242;
    const h = hexesWithin({ q: 0, r: 0 }, R, R).map((x) => hexInfo(seed, x.q, x.r, R)).find((x) => lairAt(seed, x, R))!;
    const l = lairAt(seed, h, R)!;
    const a = lairBeasts(seed, h, l, 0);
    expect(lairBeasts(seed, h, l, 0)).toEqual(a);
    expect(encounterOf(a)).toBe(l.enc);
    expect(a.flatMap((x) => Object.values(x.equip)).length).toBeGreaterThan(0);
  });
});

describe('world bosses', () => {
  it('a Kraken on a coast hex and a Titan inland', () => {
    for (const seed of [12345, 777, 4242]) {
      const sites = worldBossSites(seed, R);
      const kr = sites.find((s) => s.boss === 'kraken');
      const ti = sites.find((s) => s.boss === 'titan')!;
      expect(ti).toBeTruthy();
      expect(hexDistance(ti, { q: 0, r: 0 })).toBeLessThan(R * 0.55);
      if (kr) expect(hexInfo(seed, kr.q, kr.r, R).coast).toBe(true);
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
