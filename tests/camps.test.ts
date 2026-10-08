import { describe, expect, it } from 'vitest';
import { CAMP_BUILDINGS, CAMP_BUILDING_IDS, CAMP_RULES, ONLINE_RULES, type Resources } from '../src/online/rules';
import { campAccrued, campPlotMarkers, campRate, campView, checkBuild, checkClaim, effectiveLevel, garrisonCap, militiaBonus, statesOf, towerSight, type CampBuildingState } from '../src/online/camps';
import { demoShard } from '../src/online/demoShard';
import { getMap } from '../src/online/world';
import { CAMP_ICONS, CAMP_SPRITE, renderCampBuilding, renderCampGhost, renderDottedBorder, renderDustPuff } from '../src/art/campArt';

const RICH: Resources = { gold: 9999, food: 9999, wood: 9999, bronze: 9999, recruits: 99 };
const NONE: Resources = { gold: 0, food: 0, wood: 0, bronze: 0, recruits: 0 };
const H = 3_600_000;

describe('camp rules', () => {
  it('every building has three levels that cost and take more each time', () => {
    for (const id of CAMP_BUILDING_IDS) {
      const l = CAMP_BUILDINGS[id].levels;
      expect(l).toHaveLength(CAMP_RULES.maxLevel);
      for (let i = 1; i < l.length; i++) {
        expect(l[i].minutes).toBeGreaterThan(l[i - 1].minutes);
        expect(l[i].cost.gold).toBeGreaterThan(l[i - 1].cost.gold);
      }
    }
  });

  it('construction finishes lazily; effects follow the working level', () => {
    const now = 10 * H;
    const b: CampBuildingState[] = [
      { slot: 0, kind: 'palisade', level: 2, doneAt: now - 1 },
      { slot: 1, kind: 'watchtower', level: 1, doneAt: now + 60_000 },
      { slot: 2, kind: 'granary', level: 1, doneAt: 0 },
    ];
    expect(effectiveLevel(b[1], now)).toBe(0);
    expect(towerSight(b, now)).toBe(0);
    expect(towerSight(b, now + 60_000)).toBe(1);
    expect(garrisonCap(b, now)).toBe(ONLINE_RULES.maxGarrison + 4);
    expect(militiaBonus(b, now)).toBe(2);
    expect(campRate(b, now).food).toBe(CAMP_BUILDINGS.granary.income![0].food);
  });

  it('accrual splits at the end of a construction and is capped', () => {
    const now = 100 * H;
    // granary 1 -> 2 finished an hour ago, accrued for 3 hours: 2h at level 1, 1h at level 2
    const g = [{ slot: 0, kind: 'granary' as const, level: 2, doneAt: now - H }];
    const inc = CAMP_BUILDINGS.granary.income!;
    expect(campAccrued(g, now - 3 * H, now).food).toBe(inc[0].food * 2 + inc[1].food);
    // the cap
    expect(campAccrued(g, 0, now).food).toBe(inc[0].food * (ONLINE_RULES.incomeCapHours - 1) + inc[1].food);
    expect(campAccrued([{ slot: 0, kind: 'barracks', level: 1, doneAt: 0 }], now - 2 * H, now).recruits).toBeCloseTo(0.4, 5);
  });

  it('build checks: slots, one kind per camp, one construction at a time, funds, max level', () => {
    const now = 5 * H;
    const camp = { home: false, buildings: [{ slot: 0, kind: 'forge' as const, level: 3, doneAt: 0 }] as CampBuildingState[] };
    expect(checkBuild(camp, 'granary', 1, RICH, now)).toMatchObject({ ok: true, level: 1, minutes: CAMP_BUILDINGS.granary.levels[0].minutes });
    expect(checkBuild(camp, 'granary', 0, RICH, now)).toEqual({ ok: false, reason: 'slotTaken' });
    expect(checkBuild(camp, 'granary', CAMP_RULES.forwardSlots, RICH, now)).toEqual({ ok: false, reason: 'badSlot' });
    expect(checkBuild({ ...camp, home: true }, 'granary', CAMP_RULES.forwardSlots, RICH, now).ok).toBe(true);
    expect(checkBuild(camp, 'granary', null, RICH, now)).toEqual({ ok: false, reason: 'badSlot' });
    expect(checkBuild(camp, 'forge', null, RICH, now)).toEqual({ ok: false, reason: 'maxLevel' });
    expect(checkBuild(camp, 'forge', 2, RICH, now)).toEqual({ ok: false, reason: 'built' });
    expect(checkBuild(camp, 'granary', 1, NONE, now)).toEqual({ ok: false, reason: 'funds' });
    const busy = { home: true, buildings: [{ slot: 0, kind: 'granary' as const, level: 1, doneAt: now + 1 }] as CampBuildingState[] };
    expect(checkBuild(busy, 'forge', 1, RICH, now)).toEqual({ ok: false, reason: 'busy' });
    expect(checkBuild(busy, 'forge', 1, RICH, now + 1).ok).toBe(true);
  });

  it('claim checks', () => {
    const base = { campPlot: true, mine: true, isCamp: false, forward: 0, armyHere: true, have: RICH };
    expect(checkClaim(base)).toEqual({ ok: true });
    expect(checkClaim({ ...base, isCamp: true })).toEqual({ ok: false, reason: 'isCamp' });
    expect(checkClaim({ ...base, campPlot: false })).toEqual({ ok: false, reason: 'notPlot' });
    expect(checkClaim({ ...base, mine: false })).toEqual({ ok: false, reason: 'notYours' });
    expect(checkClaim({ ...base, forward: CAMP_RULES.maxForward })).toEqual({ ok: false, reason: 'limit' });
    expect(checkClaim({ ...base, armyHere: false })).toEqual({ ok: false, reason: 'notHere' });
    expect(checkClaim({ ...base, have: NONE })).toEqual({ ok: false, reason: 'funds' });
  });

  it('views round-trip to states; markers list camps and your claimable plots', () => {
    const now = 7 * H;
    const states: CampBuildingState[] = [{ slot: 3, kind: 'granary', level: 2, doneAt: now + 5 }];
    const v = campView({ loc: 4, home: true, restedAt: now - 1, buildings: states }, now);
    expect(v.buildings[0]).toMatchObject({ level: 1, building: 2, doneAt: now + 5 });
    expect(v.restAt).toBe(now - 1 + CAMP_RULES.restCooldownMs);
    expect(statesOf(v)).toEqual(states);
    const w = getMap('test30');
    const plots = w.all().filter((r) => r.campPlot).map((r) => r.id);
    const m = campPlotMarkers(w, [{ loc: plots[0], owner: 1 }, { loc: plots[1], owner: 2 }, { loc: 3, owner: 1 }], [{ loc: plots[1], owner: 2, home: true, buildings: 1 }], 1, 0);
    expect(m).toEqual([
      { loc: plots[0], camp: false, owner: 1, mine: true, home: false, claimable: true },
      { loc: plots[1], camp: true, owner: 2, mine: false, home: true, claimable: false },
    ]);
  });
});

describe('demo shard camps', () => {
  it('has a home camp with buildings, and builds / claims locally with the same checks', () => {
    const d = demoShard();
    const now = d.now;
    const v = d.camp.view(now);
    const home = v.camps.find((c) => c.home)!;
    expect(home.loc).toBe(d.profile.home);
    expect(home.buildings.length).toBeGreaterThan(0);
    expect(d.map.camps?.some((c) => c.loc === home.loc)).toBe(true);
    // the forge is going up: builders busy
    expect(() => d.camp.build(home.loc, 'barracks', 2, now)).toThrow();
    const later = now + 26 * 60_000;
    const gold = d.profile.resources.gold;
    const r = d.camp.build(home.loc, 'barracks', 2, later);
    expect(r.built).toMatchObject({ kind: 'barracks', level: 1, slot: 2 });
    expect(d.profile.resources.gold).toBe(gold - CAMP_BUILDINGS.barracks.levels[0].cost.gold);
    if (d.camp.spots.plot !== null) {
      const c = d.camp.claim(d.camp.spots.plot, later);
      expect(c.camps.some((x) => x.loc === d.camp.spots.plot && !x.home)).toBe(true);
    }
  });
});

describe('camp art', () => {
  it('draws every building at every level, its ghost, the puff frames and the icons', () => {
    for (const k of CAMP_BUILDING_IDS) {
      for (let l = 0; l <= 3; l++) {
        const px = renderCampBuilding(k, l);
        expect(px.w).toBe(CAMP_SPRITE);
        let opaque = 0;
        for (let i = 3; i < px.data.length; i += 4) if (px.data[i] > 0) opaque++;
        expect(opaque).toBeGreaterThan(l === 0 ? 10 : 60);
      }
      const g = renderCampGhost(k);
      const alphas = new Set<number>();
      for (let i = 3; i < g.data.length; i += 4) if (g.data[i] > 0) alphas.add(g.data[i]);
      expect([...alphas]).toEqual([128]);
      expect(CAMP_ICONS[k]).toHaveLength(12);
      for (const row of CAMP_ICONS[k]) expect(row).toHaveLength(12);
    }
    // the puff spreads
    const spread = (f: number) => {
      const p = renderDustPuff(f);
      let minX = p.w;
      let maxX = 0;
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.alpha(x, y) > 0) (minX = Math.min(minX, x)), (maxX = Math.max(maxX, x));
      return maxX - minX;
    };
    expect(spread(2)).toBeGreaterThan(spread(0));
    // marching ants: the two phases are complementary dots
    const a = renderDottedBorder(10, 8, 0xb06030, 0);
    const b = renderDottedBorder(10, 8, 0xb06030, 1);
    for (let x = 0; x < 10; x++) expect(a.alpha(x, 0) > 0).toBe(!(b.alpha(x, 0) > 0));
  });
});
