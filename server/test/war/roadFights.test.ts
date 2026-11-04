/**
 * W-197, W-208 what a road fight is to a trader, played on the real sim and rules: his start's two guards, a laden cart, the
 * band a road encounter raises, at depth 1 and depth 2. Numbers from the data. docs/WAR.md "Random encounters".
 */
import { describe, expect, it } from 'vitest';
import { ENCOUNTERS, ROBBERS, SEEN_FAR } from '../../../src/data/warEncounters';
import { good } from './goods';
import { begin, DB, type Run } from './soloRun';

const IRON = 30, COIN = 200;

/** A trader at the town of the last of `way`, a laden cart behind him, his encounters running, nothing rolling. */
async function laden(pid: number, way: string[]) {
  await DB().batch(['war_npc_towns', 'war_npc_stock'].map((t) => DB().prepare(`DELETE FROM ${t}`)));
  const r = await begin(pid, 'trader', 0, 'dodona');
  r.room.giveCart(r.pid, 'handcart');
  r.crewCarts();
  await r.tick();
  for (const to of way) await r.cross(to);
  await r.toTown();
  r.room.giveCargo(r.pid, { squad: r.pull()! }, { lots: [{ r: 'coin', n: COIN, o: 'dodona' }], items: [] });
  r.room.sim.cargo({ cart: r.room.cartsOf(r.pid)[0] })!.slots[0].hold.lots.push({ r: 'iron', n: IRON, o: 'dodona' });
  r.room.startEncounters(r.pid, { v: 1, n: 0, travel: 0, next: Number.MAX_SAFE_INTEGER, open: null });
  await r.tick();
  return r;
}

/** Encounter `id` open at step `step`, `off` tiles from his men. A fresh run: `startEncounters` keeps one it has, so it goes in by the room's own start. */
async function meet(r: Run, id: string, step: string, off = 8) {
  const s = r.room.sim.snapshot(), far = Math.max(...r.men().map((u) => u.x)), m = r.men()[0], x = far + off, y = m.y;
  const live = (r.room.encounters as unknown as { runs: Map<number, { run: { save: unknown } }> }).runs.get(r.pid)!.run;
  live.save = { v: 1, n: 1, travel: 0, next: Number.MAX_SAFE_INTEGER, open: { id, step, x, y, tx: x, ty: y, since: s.tick } };
  await r.tick();
  return { x, y };
}

/** The run itself: its messages do not reach `r.encounter` while nobody is connected. */
const openNow = (r: Run) => (r.room.encounters as unknown as { runs: Map<number, { run: { save: { open: unknown } } }> }).runs.get(r.pid)!.run.save.open;
const guards = (r: Run) => r.men().filter((u) => !u.cls.startsWith('civ_'));
const inCart = (r: Run) => r.room.sim.cargo({ cart: r.room.cartsOf(r.pid)[0] })!.slots[0].hold.lots.filter((l) => l.r === 'iron').reduce((a, l) => a + l.n, 0);
const band = (r: Run, at: { x: number; y: number }) => r.room.sim.snapshot().lairs?.find((l) => Math.hypot(l.x - at.x, l.y - at.y) < 1);

/** He said to fight: his guards at the band, until it falls or they are down. */
async function fight(r: Run, at: { x: number; y: number }) {
  await r.until(() => !!band(r, at), 50);
  r.room.sim.order({ kind: 'attack', squad: r.pull()!, target: band(r, at)!.squad });
  await r.until(() => band(r, at)?.state === 'cleared' || !guards(r).some((u) => !u.down && !u.wounded), 1800);
}

describe('W-197 robbers as play: a trader and his two guards', () => {
  for (const pid of [9921, 9922, 9923]) {
    it(`he refuses the toll at depth 1, two robbers: his two guards beat them, the load whole, their purse his (${pid})`, async () => {
      const r = await laden(pid, ['dodona-e']), coin0 = await good(r.pid, 'coin');
      const at = await meet(r, ROBBERS.id, 'demand');
      r.room.encounterChoose(r.pid, 'fight');
      await r.tick();
      await fight(r, at);
      expect(band(r, at)?.state).toBe('cleared');
      await r.until(() => !r.encounter?.open, 50);
      expect(await good(r.pid, 'coin')).toBeGreaterThan(coin0);
      expect(inCart(r)).toBe(IRON);
      await r.until(() => guards(r).length === 2 && guards(r).every((u) => !u.down), 1200); // W-79: a man knocked down gets up
      expect(guards(r).length, 'knocked down at worst').toBe(2);
    }, 120_000);
  }

  it('W-219 he refuses at depth 2, three robbers: both guards fall for good; they take what three men carry and go, the rest and his hands are left', async () => {
    const r = await laden(9931, ['dodona-e', 'kleisoura']), HEAVY = 200;
    r.room.sim.cargo({ cart: r.room.cartsOf(r.pid)[0] })!.slots[0].hold.lots.push({ r: 'iron', n: HEAVY, o: 'dodona' }); // more than three can carry
    const at = await meet(r, ROBBERS.id, 'demand');
    r.room.encounterChoose(r.pid, 'fight');
    await r.tick();
    await fight(r, at);
    await r.until(() => !openNow(r), 600);
    expect(openNow(r), 'over').toBeNull();
    expect(guards(r).length).toBe(0);
    expect(r.men().filter((u) => u.cls.startsWith('civ_')).length, 'robbers want the load, not the hands').toBe(2);
    expect(band(r, at)?.alive ?? 0, 'they are gone with it').toBe(0);
    const left = r.room.sim.cargo({ cart: r.room.cartsOf(r.pid)[0] })!.slots[0].hold.lots.reduce((a, l) => a + l.n, 0);
    expect(left, 'something was taken').toBeLessThan(IRON + HEAVY);
    expect(left, 'only what they can carry').toBeGreaterThan(0);
  }, 120_000);

  it('W-219 he was not there: they stopped him, nobody answered, they won: told once when he is back', async () => {
    const r = await laden(9933, ['dodona-e', 'kleisoura']);
    await meet(r, ROBBERS.id, 'demand');
    const enc = r.room.encounters as unknown as { tick(s: unknown, e: unknown, online: unknown): unknown; start(pid: number, team: number, save: null): { save: { away?: string[] } } };
    const tick = enc.tick.bind(enc);
    enc.tick = (a, b) => tick(a, b, () => false);
    await r.until(() => !openNow(r), 4000);
    const first = enc.start(r.pid, 0, null), again = enc.start(r.pid, 0, null);
    expect(first.save.away?.join(' ')).toMatch(/nobody answered/);
    expect(again.save.away).toBeUndefined();
  }, 120_000);

  it('or he pays at depth 2: the same band is never raised, his guards whole, a share of the load gone', async () => {
    const r = await laden(9932, ['dodona-e', 'kleisoura']);
    const at = await meet(r, ROBBERS.id, 'demand');
    r.room.encounterChoose(r.pid, 'pay');
    await r.until(() => false, 100);
    expect(band(r, at)).toBeUndefined();
    expect(guards(r).length).toBe(2);
    expect(inCart(r)).toBeCloseTo(IRON * (1 - ROBBERS.toll), 6);
  }, 120_000);
});

describe('W-208 a rolled fight is his choice', () => {
  it('an ambush asks first: he throws down a share, no band is raised, his guards unhurt', async () => {
    const r = await laden(9924, ['dodona-e']);
    const at = await meet(r, ENCOUNTERS.ambush.id, 'spring', 7), hp = guards(r).map((u) => u.hp);
    await r.until(() => false, 50);
    expect(band(r, at), 'no blade before his answer').toBeUndefined();
    r.room.encounterChoose(r.pid, 'drop');
    await r.until(() => false, 100);
    expect(band(r, at)).toBeUndefined();
    expect(guards(r).map((u) => u.hp)).toEqual(hp);
    expect(inCart(r)).toBeCloseTo(IRON * (1 - ROBBERS.toll), 6);
  }, 120_000);

  it('he stands against three with two guards and loses: what the toll would have spared him, by his own word', async () => {
    const r = await laden(9925, ['dodona-e']);
    const at = await meet(r, ENCOUNTERS.ambush.id, 'spring', 7);
    r.room.encounterChoose(r.pid, 'fight');
    await r.tick();
    await fight(r, at);
    await r.until(() => !openNow(r), 300);
    expect(openNow(r)).toBeNull();
    const left = r.room.sim.cargo({ cart: r.room.cartsOf(r.pid)[0] })!.slots[0].hold.lots.reduce((a, l) => a + l.n, 0);
    expect(left, 'W-219: they took what they could carry').toBeLessThan(COIN + IRON);
  }, 120_000);

  it('a camp seen across the land stays there: nobody comes for a man who keeps his distance', async () => {
    const r = await laden(9926, ['dodona-e']);
    const at = await meet(r, 'slavers', 'camp', SEEN_FAR[0]), hp = guards(r).map((u) => u.hp);
    await r.until(() => !!band(r, at), 50);
    await r.until(() => false, 300);
    expect(band(r, at)?.state).toBe('home');
    expect(guards(r).map((u) => u.hp)).toEqual(hp);
  }, 120_000);
});

describe('W-217 a cart over a border', () => {
  it('there and back: one cart each time, nothing left where it was', async () => {
    const r = await begin(9941, 'trader', 0, 'dodona');
    r.room.giveCart(r.pid, 'handcart');
    r.crewCarts();
    await r.tick();
    const before = r.room.cartsOf(r.pid).length;
    await r.cross('dodona-n');
    await r.tick();
    const seen = () => (r.room.sim.snapshot().sieges ?? []).filter((c) => c.owner === `p:${r.pid}`);
    expect(seen().length).toBe(before);
    expect(new Set(seen().map((c) => c.state)).has('destroyed')).toBe(false);
  }, 120_000);
});
