/**
 * FW-03: the works tray and placement in deployment (design/gdd/field-works.md
 * "Touch UI needs", R3-R5; controls.md R4, R7, R10b), the works sprites, and
 * the campaign wiring of works and lair assaults (src/game/campaignBattle.ts;
 * AR-02's and AR-04's handoffs).
 */
import { describe, expect, it } from 'vitest';
import { armySpec } from '../src/game/armySpec';
import { classSquad } from '../src/dev/classBalance';
import { Battle } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import { flatGrid } from '../src/sim/terrain';
import { WORKS } from '../src/data/terrain';
import { Campaign } from '../src/game/campaign';
import { generateEnemyArmy } from '../src/game/enemy';
import { campaignSetup, lairOf, markBattle, playerWorks, resolveAbandoned, settleBattle, startLairAssault, trialBattle } from '../src/game/campaignBattle';
import { battleUnlocks } from '../src/ui/input/attention';
import { inverseOf } from '../src/ui/input/undo';
import { cellAt, cellCentre, firstGhost, ghostWhy, layAgain, segmentAt, snapFacing, trayRows, turnFacing, workCells, type WorkGrid } from '../src/ui/input/works';
import { WORK_ART, workSprites } from '../src/art/terrainArt';
import { isoToScreen } from '../src/art/iso';
import { EN } from '../src/i18n/en';
import { RU } from '../src/i18n/ru';
import type { PendingBattle } from '../src/state';
import type { BattleSetup, WorksAllowance } from '../src/sim/types';

const ALL: WorksAllowance = { stakes: 3, ditch: 3, laager: 3 };
const GRID: WorkGrid = { w: 24, h: 36, width: 24, height: 36 };

/** Two small human sides on a flat 24 x 36 grid; side 0 may lay `works`. */
function battle(works: WorksAllowance = ALL): Battle {
  const rng = new Rng(7);
  const ids = { nextId: 1 };
  const side = () => armySpec(classSquad(rng, ids, 'hoplite', 4, 3, 0), false);
  const s: BattleSetup = { seed: 7, armies: [{ ...side(), works }, side()], terrain: flatGrid(24, 36) };
  return new Battle(s);
}

describe('the ghost lays exactly the sim segment (field-works.md R3)', () => {
  it('workCells matches Battle.works() for every type, all 8 facings', () => {
    let f = { x: 0, y: -1 };
    for (let k = 0; k < 8; k++) {
      for (const type of ['stakes', 'ditch', 'laager'] as const) {
        const b = battle();
        const z = b.deployZone(0);
        const g = { type, x: 11.5, y: Math.floor((z.y0 + z.y1) / 2) + 0.5, fx: f.x, fy: f.y };
        expect(b.workRefusal(0, g)).toBeNull();
        b.issue(0, { kind: 'work', ...g });
        expect(b.works()[0].cells).toEqual(workCells(type, g.x, g.y, g.fx, g.fy, GRID));
        expect(workCells(type, g.x, g.y, g.fx, g.fy, GRID)).toHaveLength(WORKS.length[type]);
      }
      f = turnFacing(f.x, f.y);
    }
    // back where it started after 8 turns
    expect(f.x).toBeCloseTo(0);
    expect(f.y).toBeCloseTo(-1);
  });

  it('off the field or without a facing there is no segment', () => {
    expect(workCells('stakes', -1, 4, 0, -1, GRID)).toBeNull();
    expect(workCells('stakes', 0.2, 4, 0, -1, GRID)).toBeNull(); // the left cell would be off the grid
    expect(workCells('stakes', 5, 5, 0, 0, GRID)).toBeNull();
  });

  it('snaps and turns through the 8 grid directions', () => {
    expect(snapFacing(0.1, -1)).toEqual({ x: 0, y: -1 });
    const d = snapFacing(1, -0.9);
    expect(d.x).toBeCloseTo(Math.SQRT1_2);
    expect(d.y).toBeCloseTo(-Math.SQRT1_2);
    const t = turnFacing(0, -1);
    expect(t.x).toBeCloseTo(Math.SQRT1_2);
    expect(t.y).toBeCloseTo(-Math.SQRT1_2);
  });

  it('cells and field points round-trip', () => {
    for (const i of [0, 23, 24, 500, 863]) expect(cellAt(cellCentre(i, GRID).x, cellCentre(i, GRID).y, GRID)).toBe(i);
    expect(cellAt(-0.1, 3, GRID)).toBe(-1);
    expect(cellAt(3, 36, GRID)).toBe(-1);
  });

  it('the first ghost stands in the zone, faces the enemy and is valid on open ground', () => {
    const b = battle();
    for (const type of ['stakes', 'ditch', 'laager'] as const) {
      const g = firstGhost(type, b.deployZone(0), b.deployZone(1), b.width);
      expect(g.fy).toBe(-1);
      expect(b.workRefusal(0, g)).toBeNull();
    }
    expect(firstGhost('stakes', b.deployZone(1), b.deployZone(0), b.width).fy).toBe(1);
  });
});

describe('the tray (field-works.md R4, "Touch UI needs")', () => {
  it('shows cost and how many more; the purse, the cap and the allowance say why not', () => {
    const rows = trayRows({ supplies: 40, placed: [], allow: { stakes: 3, ditch: 3, laager: 2 }, caught: false });
    expect(rows.map((r) => [r.type, r.cost, r.left, r.why])).toEqual([
      ['stakes', 6, 3, null],
      ['ditch', 8, 3, null],
      ['laager', 15, 2, null],
    ]);
    // 40 - 15 - 15 = 10 left: one more stakes or ditch (the cap leaves 1), no laager
    const two = trayRows({ supplies: 40, placed: [{ type: 'laager' }, { type: 'laager' }], allow: { stakes: 3, ditch: 3, laager: 2 }, caught: false });
    expect(two.map((r) => [r.left, r.why])).toEqual([
      [1, null],
      [1, null],
      [0, 'supplies'],
    ]);
    const full = trayRows({ supplies: 99, placed: [{ type: 'stakes' }, { type: 'stakes' }, { type: 'ditch' }], allow: ALL, caught: false });
    expect(full.every((r) => r.why === 'cap' && r.left === 0)).toBe(true);
    // the allowance the battle was set up with is the sim's limit per type
    expect(trayRows({ supplies: 99, placed: [{ type: 'stakes' }], allow: { stakes: 1, ditch: 3, laager: 3 }, caught: false })[0].why).toBe('allowance');
  });

  it('a band that caught the army: one segment at most (R4.2)', () => {
    expect(trayRows({ supplies: 99, placed: [], allow: { stakes: 1, ditch: 1, laager: 1 }, caught: true }).map((r) => r.left)).toEqual([1, 1, 1]);
    expect(trayRows({ supplies: 99, placed: [{ type: 'ditch' }], allow: { stakes: 1, ditch: 1, laager: 1 }, caught: true }).every((r) => r.why === 'cap')).toBe(true);
  });

  it("the ghost's reason: the purse first, then the sim's", () => {
    const b = battle();
    const row = trayRows({ supplies: 40, placed: [], allow: ALL, caught: false })[0];
    expect(ghostWhy(row, b.workRefusal(0, { type: 'stakes', x: 11.5, y: 3.5, fx: 0, fy: -1 }))).toBe('zone');
    expect(ghostWhy({ ...row, why: 'supplies' }, 'zone')).toBe('supplies');
    expect(ghostWhy(row, null)).toBeNull();
  });
});

describe('undo and remove (controls.md R4.2; field-works.md R4.3)', () => {
  it('undo of a work is unwork; undo of a remove lays the same cells again', () => {
    for (const f of [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: Math.SQRT1_2, y: -Math.SQRT1_2 }]) {
      for (const type of ['stakes', 'ditch', 'laager'] as const) {
        const b = battle();
        const o = { kind: 'work' as const, type, x: 11.5, y: 29.5, fx: f.x, fy: f.y };
        const inv = inverseOf(o, b)!;
        b.issue(0, o);
        const cells = [...b.works()[0].cells];
        for (const u of inv) b.issue(0, u);
        expect(b.works()).toHaveLength(0);
        b.issue(0, o);
        const seg = b.works()[0];
        const again = layAgain(seg, GRID);
        const c = cellCentre(seg.cells[seg.cells.length - 1], GRID);
        b.issue(0, { kind: 'unwork', x: c.x, y: c.y });
        expect(b.works()).toHaveLength(0);
        b.issue(0, again);
        expect(b.works()[0].cells).toEqual(cells);
        expect(b.worksLog).toEqual([]);
      }
    }
  });

  it('a tap finds the own segment under a cell, never the enemy one', () => {
    const works = [
      { side: 1 as const, cells: [5, 6, 7] },
      { side: 0 as const, cells: [700, 701] },
    ];
    expect(segmentAt(works, 0, 701)).toBe(1);
    expect(segmentAt(works, 0, 6)).toBe(-1);
    expect(segmentAt(works, 0, -1)).toBe(-1);
  });
});

describe('the works sprites (field-works.md R5; AS-06)', () => {
  it('one sprite per cell, one wagon per laager segment, feet on the lowest vertex', () => {
    const s = workSprites(
      [
        { type: 'stakes', cells: [100, 101, 102] },
        { type: 'laager', cells: [300, 301] },
        { type: 'ditch', cells: [200, 224, 248] },
      ],
      [],
      GRID,
    );
    expect(s.map((x) => x.kind)).toEqual(['stakes', 'stakes', 'stakes', 'laager', 'ditch', 'ditch', 'ditch']);
    // cell 100 = (4, 4): its lowest vertex is (5, 5)
    expect(s[0]).toMatchObject({ key: WORK_ART.stakes.key, x: isoToScreen(4.5, 4.5).x, y: isoToScreen(5, 5).y, flip: false, decal: false });
    // the wagon stands between its two cells
    expect(s[3].x).toBe(Math.round(isoToScreen(13, 12.5).x));
    // a line down a column is mirrored; the ditch lies under the men
    expect(s[4]).toMatchObject({ flip: true, decal: true });
  });

  it("an assault field's palisade and rampart rows run along x, unflipped", () => {
    const walls = [0, 1, 2].map((x) => ({ i: 11 * 24 + x, kind: 'palisade' as const }));
    const s = workSprites([], [...walls, { i: 10 * 24, kind: 'rampart' }], GRID);
    expect(s.filter((x) => x.kind === 'palisade').every((x) => !x.flip)).toBe(true);
    expect(s.map((x) => x.key)).toContain(WORK_ART.rampart.key);
  });
});

describe('the Works chip unlocks after the first camp (controls.md R10b)', () => {
  it('campaign only once a camp was pitched; never in the tutorial', () => {
    const c = { fought: 0, realtimeLocked: false };
    expect(battleUnlocks({ ...c, kind: 'campaign', campPitched: false }).works).toBe(false);
    expect(battleUnlocks({ ...c, kind: 'campaign', campPitched: true }).works).toBe(true);
    expect(battleUnlocks({ ...c, kind: 'tutorial', campPitched: true }).works).toBe(false);
  });

  it('every works string exists in en and ru', () => {
    const keys = Object.keys(EN).filter((k) => k.startsWith('works.'));
    expect(keys.length).toBeGreaterThan(30);
    for (const k of keys) expect((RU as Record<string, unknown>)[k], k).toBeTruthy();
  });
});

describe('campaign wiring (campaignBattle.ts)', () => {
  const skirmish = (camp: Campaign, seed: number): PendingBattle => ({ enemy: generateEnemyArmy(new Rng(seed), camp.data, camp.fitHeroes(), 0), seed });

  it("the player's allowance comes from the supplies; practice has none", () => {
    const camp = Campaign.fresh(11);
    camp.world.s.supplies = 30;
    const pw = playerWorks(camp, skirmish(camp, 3))!;
    expect(pw).toEqual({ works: { stakes: 3, ditch: 3, laager: 2 }, caught: false });
    const setup = campaignSetup(skirmish(camp, 3), camp.fitHeroes(), pw.works);
    expect(setup.armies[0].works).toEqual(pw.works);
    expect(setup.armies[1].works).toBeUndefined();
    expect(playerWorks(camp, trialBattle(camp, 'hydra', 'Codex', 5))).toBeNull();
  });

  it('a chasing band that caught the army leaves time for one segment (R4.2)', () => {
    const camp = Campaign.fresh(12);
    camp.world.s.supplies = 99;
    const p = camp.world.s.parties[0];
    expect(p).toBeTruthy();
    p.mode = 'chase';
    const pending = { ...skirmish(camp, 4), partyId: p.id };
    expect(playerWorks(camp, pending)!.caught).toBe(true);
    expect(playerWorks(camp, pending)!.works).toEqual({ stakes: 1, ditch: 1, laager: 1 });
    expect(playerWorks(camp, { ...pending, byPlayer: true } as PendingBattle)!.caught).toBe(false);
  });

  it('startLairAssault: the garrison with its stakes and holdField, on its walled ground; settled through afterLairAssault', () => {
    const camp = Campaign.fresh(13);
    const lair = camp.world.map.settlements.find((s) => s.kind === 'lair')!;
    const pending = startLairAssault(camp, lair.id, 99)!;
    expect(lairOf(pending)).toBe(lair.id);
    expect(pending.site?.assault).toBe(true);
    const setup = campaignSetup(pending, camp.fitHeroes(), playerWorks(camp, pending)!.works);
    expect(setup.armies[1].works).toEqual({ stakes: WORKS.garrisonStakes, ditch: 0, laager: 0 });
    expect(setup.armies[1].holdField).toBe(true);
    expect(setup.terrain!.cells).toContain('P');
    // the garrison lays its stakes in deployment
    const sim = new Battle(setup);
    expect(sim.works().filter((w) => w.side === 1)).toHaveLength(WORKS.garrisonStakes);
    // a won assault razes the lair (the garrison all knocked down)
    sim.startBattle();
    const mine = sim.units.find((u) => u.side === 0)!;
    for (const u of sim.units) if (u.side === 1) sim.kill(u, mine);
    for (let i = 0; i < 20 * 60 && sim.phase !== 'ended'; i++) sim.step();
    expect(sim.phase).toBe('ended');
    const last = settleBattle(camp, pending, sim, pending.enemy.heroes);
    expect(last.outcome.victory).toBe(true);
    expect(camp.world.lairFallen(lair.id)).toBe(true);
    // a fallen lair has no assault to start
    expect(startLairAssault(camp, lair.id, 100)).toBeNull();
  });

  it('a lost assault leaves the lair standing, its dead lost', () => {
    const camp = Campaign.fresh(14);
    const lair = camp.world.map.settlements.find((s) => s.kind === 'lair')!;
    const full = camp.world.garrisonSize(lair.id);
    const pending = startLairAssault(camp, lair.id, 7)!;
    const sim = new Battle(campaignSetup(pending, camp.fitHeroes()));
    sim.startBattle();
    const foe = sim.units.find((u) => u.side === 1)!;
    const mine = sim.units.find((u) => u.side === 0)!;
    let n = 0;
    for (const u of sim.units) if (u.side === 1 && u !== foe && n++ < 2) sim.kill(u, mine);
    for (const u of sim.units) if (u.side === 0) sim.kill(u, foe);
    for (let i = 0; i < 20 * 60 && sim.phase !== 'ended'; i++) sim.step();
    settleBattle(camp, pending, sim, pending.enemy.heroes);
    expect(camp.world.lairFallen(lair.id)).toBe(false);
    expect(camp.world.garrisonSize(lair.id)).toBeLessThan(full);
  });

  it("an abandoned battle replays the player's works with the allowance it was set up with", () => {
    const camp = Campaign.fresh(15);
    camp.world.s.supplies = 30;
    const pending = skirmish(camp, 6);
    const heroes = camp.fitHeroes();
    const pw = playerWorks(camp, pending)!;
    const sim = new Battle(campaignSetup(pending, heroes, pw.works));
    const z = sim.deployZone(0);
    sim.issue(0, { kind: 'work', type: 'laager', x: 11.5, y: Math.floor(z.y0) + 1.5, fx: 0, fy: -1 });
    expect(sim.works()).toHaveLength(1);
    // Fight: the works are paid, then the battle is marked with its allowance
    expect(camp.payWorks(sim.works())).toBe(15);
    markBattle(camp, pending, heroes, sim.orderLog, pw.works);
    expect(camp.data.battle?.works).toEqual(pw.works);
    // the purse no longer buys a laager, yet the replay keeps it: the marker's allowance is used
    expect(camp.worksAllowance().laager).toBe(1);
    const fresh = new Battle(campaignSetup(pending, heroes, camp.data.battle!.works));
    for (const o of camp.data.battle!.deploy) fresh.issue(o.side, o.order);
    expect(fresh.works()).toHaveLength(1);
    expect(resolveAbandoned(camp)).not.toBeNull();
  });
});
