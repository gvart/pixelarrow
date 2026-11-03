/**
 * W-184..W-193 a town's board on the server (docs/WAR.md "Town boards"): taken and handed in standing at the town, the work
 * physical (a band set down, men on a site, a sealed load down a road), paid from the town's purse, coin bounded.
 */
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { good } from './goods';
import { begin, DB, type Run } from './soloRun';
import { BOARD } from '../../../src/data/warTownBoard';
import { NPC } from '../../../src/data/warNpcTowns';
import { npcDay, npcSpot, NPC_MINT, purseAfter } from '../../../src/war/net/npcMarket';
import { PATH_KIND, type BoardLine, type JobKind } from '../../../src/war/net/townBoard';
import { WORK_R } from '../../../src/war/net/works';
import { room as freeLoads } from '../../src/war/cargo';
import { getFavour } from '../../src/war/favour';
import { npcBooks, npcDeal, npcView } from '../../src/war/npcMarket';
import { boardOrder, boardView, jobsOf } from '../../src/war/townBoard';
import type { PathId } from '../../../src/war/world/start';

const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? String(e));
const order = (r: Run, m: Parameters<typeof boardOrder>[3], chainOver = false) => boardOrder(env, r.room, r.pid, m, r.now, chainOver);
const lineOf = (lines: readonly BoardLine[], kind: JobKind, size?: string) => lines.find((l) => l.kind === kind && (!size || l.size === size))!;
const points = async (r: Run) => (await getFavour(env, r.pid)).xp;

async function atTown(id: number, path: PathId): Promise<Run> {
  const r = await begin(id, path, 0, 'dodona');
  await r.toTown();
  return r;
}

beforeEach(async () => {
  await DB().batch(['war_npc_towns', 'war_npc_stock', 'war_town_jobs', 'war_town_heat'].map((t) => DB().prepare(`DELETE FROM ${t}`)));
});

describe('W-187 standing at the town', () => {
  it('a line is taken only with his men at it; he reads the board from anywhere in the region', async () => {
    const r = await begin(9701, 'builder', 0, 'dodona');
    const at = npcSpot(r.room.region);
    r.walk(at.x + 60, at.y); // away, whichever way he stands
    await r.walk(at.x + 60, at.y, 3, 2000);
    const v = (await order(r, { op: 'view' })).view;
    expect(v.lines.length).toBeGreaterThan(0);
    expect(v.purse).toBe(NPC.purse.start);
    expect(await code(order(r, { op: 'take', entry: v.lines[0].id }))).toBe('not_present');
  });

  it('holds three at most; a line he holds cannot be taken twice; another town\'s window is gone', async () => {
    const r = await atTown(9702, 'warrior');
    const v = (await order(r, { op: 'view' })).view, ids = v.lines.filter((l) => l.kind !== 'trade').map((l) => l.id);
    await order(r, { op: 'take', entry: ids[0] });
    expect(await code(order(r, { op: 'take', entry: ids[0] }))).toBe('held');
    await order(r, { op: 'take', entry: ids[1] });
    await order(r, { op: 'take', entry: ids[2] });
    expect((await jobsOf(DB(), r.pid)).length).toBe(BOARD.hold);
    expect(await code(order(r, { op: 'take', entry: ids[3] }))).toBe('board_full');
    await order(r, { op: 'drop', job: (await jobsOf(DB(), r.pid))[0].id });
    expect(await code(order(r, { op: 'take', entry: 'k9.1' }))).toBe('gone');
  });

  it('what he holds survives him going offline, and the listing moving on', async () => {
    const r = await atTown(9703, 'builder');
    const v = (await order(r, { op: 'view' })).view;
    await order(r, { op: 'take', entry: lineOf(v.lines, 'build').id });
    const later = r.now + (BOARD.windowHours + 1) * 3_600_000;
    const seen = await boardView(env, r.pid, 'dodona', [], later);
    expect(seen.jobs.map((j) => j.goal)).toEqual([lineOf(v.lines, 'build').goal]);
    expect(seen.lines[0].id).not.toBe(v.lines[0].id);
  });
});

describe('W-185 the three kinds', () => {
  it('Kill: a named band is set down in the region; only its fall readies the contract; handed in at the town, from its purse', async () => {
    const r = await atTown(9710, 'warrior');
    const v = (await order(r, { op: 'view' })).view, e = lineOf(v.lines, 'kill', 'skirmish');
    expect(v.lines[0].kind).toBe(PATH_KIND.warrior);
    const lairs = (r.room.sim.snapshot().lairs ?? []).length;
    const j = (await order(r, { op: 'take', entry: e.id })).view.jobs[0];
    const snap = r.room.sim.snapshot(), band = snap.lairs!.find((l) => Math.hypot(l.x - j.x!, l.y - j.y!) < 1)!;
    expect(snap.lairs!.length).toBe(lairs + 1);
    const town = npcSpot(r.room.region);
    expect(r.room.sim.walkable(town.x, town.y, band.x, band.y)).toBe(true);
    expect(await code(order(r, { op: 'handin', job: j.id }))).toBe('not_done');

    // his men fight it, as a player's would, and the deed readies it
    await r.walk(band.x + 12, band.y, 4);
    for (const q of r.squads()) r.room.sim.order({ kind: 'attack', squad: q, target: band.squad });
    await r.until(() => r.room.sim.snapshot().lairs!.find((l) => l.id === band.id)!.state === 'cleared', 3000);
    await r.tick();
    expect((await jobsOf(DB(), r.pid))[0].state).toBe('ready');

    await r.walk(band.x + 200, band.y); // not at the town: he cannot hand in out here
    const away = Math.hypot(r.men()[0].x - town.x, r.men()[0].y - town.y) > NPC.reach;
    if (away) expect(await code(order(r, { op: 'handin', job: j.id }))).toBe('not_present');
    await r.toTown();
    const before = (await npcBooks(DB(), 'dodona', r.now)).purse, xp = await points(r), coin = await good(r.pid, 'coin');
    const { paid } = await order(r, { op: 'handin', job: j.id });
    expect(paid!.coin).toBeGreaterThan(0);
    expect(paid!.points).toBeGreaterThan(0);
    expect((await npcBooks(DB(), 'dodona', r.now)).purse).toBeCloseTo(before - paid!.coin);
    expect(await good(r.pid, 'coin')).toBeCloseTo(coin + paid!.coin);
    expect(await points(r)).toBe(xp + paid!.points);
    expect(await jobsOf(DB(), r.pid)).toEqual([]);
  }, 180_000);

  it('Build: his men on the site work it; men elsewhere do not; a builder\'s level follows the labour', async () => {
    const r = await atTown(9711, 'builder');
    const e = lineOf((await order(r, { op: 'view' })).view.lines, 'build', 'repair');
    const j = (await order(r, { op: 'take', entry: e.id })).view.jobs[0];
    expect(j.need).toBe(e.labour);
    const site = e.site!;
    await r.walk(site.x + (site.x > 256 ? -70 : 70), site.y, 4); // away
    const was = (await jobsOf(DB(), r.pid))[0].done;
    await r.until(() => false, 300);
    expect((await jobsOf(DB(), r.pid))[0].done).toBe(was);
    await r.walk(site.x, site.y, WORK_R - 6);
    const xp = await points(r);
    await r.until(() => false, 1500);
    const at = (await jobsOf(DB(), r.pid))[0];
    expect(at.done).toBeGreaterThan(0);
    expect(await points(r), 'W-111 labour').toBeGreaterThan(xp);
    await DB().prepare('UPDATE war_town_jobs SET done = need - 1 WHERE id = ?1').bind(j.id).run();
    await r.until(() => false, 150);
    expect((await jobsOf(DB(), r.pid))[0].state).toBe('ready');
    await r.toTown();
    const { paid } = await order(r, { op: 'handin', job: j.id });
    expect(paid!.points).toBe(e.gain);
  }, 180_000);

  it('Trade: a sealed load leaves the stock, cannot be sold, reaches the named town\'s stock, and is paid back at the board', async () => {
    const r = await atTown(9712, 'trader');
    expect(r.room.giveCart(r.pid, 'handcart')).not.toBeNull();
    r.crewCarts();
    await r.toTown();
    const v = (await order(r, { op: 'view' })).view, e = lineOf(v.lines, 'trade', 'near');
    expect(v.lines[0].kind).toBe('trade');
    const stockA = (await npcView(DB(), 'dodona', r.now)).goods.find((g) => g.res === e.res)!.stock;
    const free = freeLoads(r.room.npcSlots(r.pid));
    const j = (await order(r, { op: 'take', entry: e.id })).view.jobs[0];
    expect((await npcView(DB(), 'dodona', r.now)).goods.find((g) => g.res === e.res)!.stock).toBeCloseTo(stockA - e.n!);
    expect(freeLoads(r.room.npcSlots(r.pid))).toBeCloseTo(free - e.loads!);
    expect(await code(npcDeal(env, r.room, r.pid, { op: 'sell', res: e.res as never, n: e.n }, r.now)), 'sealed: not his to sell').toBe('no_goods');
    expect(await code(order(r, { op: 'deliver', job: j.id }))).toBe('wrong_town');
    expect(await code(order(r, { op: 'handin', job: j.id }))).toBe('not_done');
    expect(await code(order(r, { op: 'take', entry: 'k0.0' }))).toBe('gone');

    await r.cross(e.toTown!);
    await r.toTown();
    expect(await code(order(r, { op: 'handin', job: j.id }))).toBe('wrong_town');
    const stockB = (await npcView(DB(), e.toTown!, r.now)).goods.find((g) => g.res === e.res)!.stock;
    await order(r, { op: 'deliver', job: j.id });
    expect((await npcView(DB(), e.toTown!, r.now)).goods.find((g) => g.res === e.res)!.stock).toBeCloseTo(stockB + e.n!);
    expect((await jobsOf(DB(), r.pid))[0].state).toBe('ready');

    await r.cross('dodona');
    await r.toTown();
    const xp = await points(r);
    const { paid } = await order(r, { op: 'handin', job: j.id });
    expect(paid!.coin).toBeGreaterThan(0);
    expect(await points(r)).toBe(xp + paid!.points);
    expect(paid!.points).toBe(e.gain);
  }, 240_000);

  it('a dropped load goes back: he cannot walk off with it, and cannot drop it away from the board', async () => {
    const r = await atTown(9713, 'trader');
    expect(r.room.giveCart(r.pid, 'handcart')).not.toBeNull();
    r.crewCarts();
    await r.toTown();
    const e = lineOf((await order(r, { op: 'view' })).view.lines, 'trade', 'near');
    const stock = (await npcView(DB(), 'dodona', r.now)).goods.find((g) => g.res === e.res)!.stock;
    const j = (await order(r, { op: 'take', entry: e.id })).view.jobs[0];
    await r.cross(e.toTown!);
    expect(await code(order(r, { op: 'drop', job: j.id }))).toBe('wrong_town');
    await r.cross('dodona');
    await r.toTown();
    await order(r, { op: 'drop', job: j.id });
    expect(r.carried(e.res!)).toBe(0);
    expect((await npcView(DB(), 'dodona', r.now)).goods.find((g) => g.res === e.res)!.stock).toBeCloseTo(stock, -1); // it drifted back a little on the way
    expect(await jobsOf(DB(), r.pid)).toEqual([]);
  }, 240_000);
});

describe('W-186..W-189 pay', () => {
  async function work(r: Run, kind: 'build', size = 'repair') {
    const e = lineOf((await order(r, { op: 'view' })).view.lines, kind, size);
    const j = (await order(r, { op: 'take', entry: e.id })).view.jobs.at(-1)!;
    await DB().prepare("UPDATE war_town_jobs SET state = 'ready', done = need WHERE id = ?1").bind(j.id).run();
    return { e, paid: (await order(r, { op: 'handin', job: j.id })).paid! };
  }

  it('any path may take any kind: off its path it pays coin and a small share of the points', async () => {
    const b = await atTown(9720, 'builder'), w = await atTown(9721, 'warrior');
    await DB().prepare('DELETE FROM war_npc_towns').run();
    const on = await work(b, 'build');
    await DB().prepare('DELETE FROM war_npc_towns').run();
    const off = await work(w, 'build');
    expect(on.paid.coin).toBeGreaterThan(off.paid.coin);
    expect(off.paid.coin).toBeGreaterThan(0);
    expect(off.paid.points).toBe(Math.round(on.paid.points * BOARD.offPathPoints));
  }, 120_000);

  it('repeating a kind at a town pays less each time, and recovers with time', async () => {
    const r = await atTown(9722, 'builder');
    const a = await work(r, 'build'), b = await work(r, 'build'), c = await work(r, 'build');
    expect(b.paid.points).toBeLessThan(a.paid.points);
    expect(c.paid.points).toBeLessThan(b.paid.points);
    expect(c.paid.coin).toBeLessThan(a.paid.coin);
    r.now += 48 * 3_600_000;
    const d = await work(r, 'build');
    expect(d.paid.points).toBe(a.paid.points);
  }, 120_000);

  it('W-187: a poor town pays less; coin stays bounded: all it paid plus its purse is what it started with and minted', async () => {
    const r = await atTown(9723, 'builder');
    const a = await work(r, 'build', 'raise');
    await DB().prepare('UPDATE war_npc_towns SET purse = 50 WHERE town = ?1').bind('dodona').run();
    await DB().prepare('DELETE FROM war_town_heat').run();
    const b = await work(r, 'build', 'raise');
    expect(b.paid.coin).toBeLessThan(a.paid.coin / 2);
    expect(b.paid.coin).toBeLessThanOrEqual(50);
    expect(b.paid.points, 'his level does not hang on the purse').toBe(a.paid.points);

    await DB().prepare('DELETE FROM war_town_heat').run();
    await DB().prepare('DELETE FROM war_npc_towns').run();
    let paid = 0, first = r.now;
    for (let day = 0; day < 6; day++) {
      for (let k = 0; k < 40; k++) paid += (await work(r, 'build', 'raise')).paid.coin;
      r.now += 86_400_000;
    }
    const days = npcDay(r.now) - npcDay(first), books = await npcBooks(DB(), 'dodona', r.now);
    expect(books.purse).toBeGreaterThanOrEqual(0);
    expect(paid + books.purse).toBeCloseTo(NPC.purse.start + books.minted, 3);
    expect(books.minted).toBeLessThanOrEqual(days * NPC_MINT + 1e-6);
    expect(purseAfter(0, 1)).toBe(NPC_MINT);
  }, 300_000);
});

describe('W-190 neutral errands', () => {
  it('his chain at the town over, its giver has a short errand of his own kind, repeatable', async () => {
    const r = await atTown(9730, 'builder');
    const closed = (await order(r, { op: 'view' }, false)).view.lines;
    expect(closed.some((l) => l.size === 'errand')).toBe(false);
    const open = (await order(r, { op: 'view' }, true)).view.lines, e = open[0];
    expect(e.size).toBe('errand');
    expect(e.kind).toBe('build');
    expect(e.giver).toBeTruthy();
    expect(e.story).toBeTruthy();
    const j = (await order(r, { op: 'take', entry: e.id }, true)).view.jobs[0];
    expect(j.errand).toBe(true);
    expect(j.giver).toBe(e.giver);
    await DB().prepare("UPDATE war_town_jobs SET state = 'ready', done = need WHERE id = ?1").bind(j.id).run();
    const { paid } = await order(r, { op: 'handin', job: j.id }, true);
    expect(paid!.points).toBe(BOARD.errand.points);
    expect((await order(r, { op: 'view' }, true)).view.lines[0].size).toBe('errand');
  }, 120_000);
});

describe('a load needs room', () => {
  it('too big for what stands at the town: refused, and says so', async () => {
    const r = await atTown(9740, 'trader');
    const far = lineOf((await order(r, { op: 'view' })).view.lines, 'trade', 'far');
    for (const s of r.room.npcSlots(r.pid)) s.hold.lots.push({ r: 'stone' as never, n: s.cap * 10, o: 'x' }); // packs full
    expect(await code(order(r, { op: 'take', entry: far.id }))).toBe('no_room');
  }, 60_000);
});
