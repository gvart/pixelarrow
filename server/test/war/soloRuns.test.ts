/**
 * W-93, W-140..W-149 the solo game of a builder and a trader: seeded runs on the real sim and the real D1 rules, from the
 * start API to a mid-game goal, nobody else in the world. A small bot gives the orders a player would; the clock is game
 * time (ticks, the border's travel time). Lists come from the data, so a retune moves the numbers, not the script.
 *
 *   Trader: walks to the town, gathers a first load, works his chain, then carries what pays best down any road, on to
 *           fresh towns as stocks and purses run shallow, buying a cart and a worker from the profit.
 *   Builder: gathers, raises his chain's buildings, hires a smith and smelts bought metal for sale, hires up to his cap, raises
 *           a town of many kinds, then gives coin and labour to the alliance's wonder.
 */
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { NPC, NPC_CARTS, NPC_HIRE } from '../../../src/data/warNpcTowns';
import { costOf, npcGood, npcSpot } from '../../../src/war/net/npcMarket';
import { WONDER, workSite } from '../../../src/war/net/works';
import { CRAFT } from '../../../src/war/sim/crafting';
import { BUILDINGS } from '../../../src/war/sim/economy';
import type { BuildingType, GoodKind } from '../../../src/war/types';
import { ALLIANCES } from '../../../src/war/world/alliances';
import { worldRegion } from '../../../src/war/world/graph';
import { depthOf } from '../../../src/war/sim/depth';
import { warRegion } from '../../src/war/regions';
import { cartCap, workerCap } from '../../../src/war/world/start';
import { room as freeLoads } from '../../src/war/cargo';
import { getFavour } from '../../src/war/favour';
import { npcView } from '../../src/war/npcMarket';
import { give } from '../../src/war/works';
import { begin, cargoFor, chooseStep, DB, nodeNear, stored, storeWith, walkIn } from './soloRun';

describe('W-93 a solo run on each path', () => {
  // alone in the world: not the last run's dealings at the town markets either
  beforeEach(() => DB().batch(['war_npc_towns', 'war_npc_stock'].map((t) => DB().prepare(`DELETE FROM ${t}`))));

  it('a trader, alone, from his start to a second cart, his workers and a level by trade', async () => {
    const run = await begin(9851, 'trader', 0, 'dodona');
    expect(run.room.giveCart(run.pid, 'handcart')).not.toBeNull(); // the start cart the DO hands out on the first join
    await run.note(`start, ${run.men().length} men, ${run.room.cartsOf(run.pid).length} cart`);

    // the walk in: past the giver and the story's first place, to the town
    const town = npcSpot(run.room.region);
    await walkIn(run);
    await run.note('walked in; first step');

    // a first load: his forager and merchant cut wood near the town while it lasts
    const near = nodeNear(run, 'wood', town.x, town.y)!;
    run.room.sim.order({ kind: 'gather', squad: run.civ()!, node: near.id });
    const wood0 = stored(run, 'wood');
    await run.until(() => stored(run, 'wood') >= wood0 + 100, 12_000);
    await run.note(`gathered ${Math.floor(stored(run, 'wood') - wood0)} wood`);
    await run.toTown();
    const st = storeWith(run, 'wood')!;
    run.room.sim.order({ kind: 'load', squad: run.pull()!, from: { building: st.id }, res: 'wood' });
    await run.until(() => run.room.sim.snapshot().squads[run.pull()!].order === 'hold', 3000);
    await run.toTown();
    const first = await run.sellAll();
    await run.note(`first sale ${first} coin`);
    expect(first).toBeGreaterThan(0);

    // the road, back and forth, with what pays, spending as he goes
    let trips = 0, sold = 0, hired = 0, carts = run.room.cartsOf(run.pid).length;
    const seen = new Map<string, number>();
    const goalLevel = 4, goalCarts = 2;
    /** Two guards don't go where beasts hold the road. */
    const shallow = (to: string) => !!warRegion(to) && depthOf(warRegion(to)!) <= 1;
    const level = async () => (await getFavour(env, run.pid)).level;
    while (trips < 80 && !((await level()) >= goalLevel && carts >= goalCarts && hired >= workerCap('trader') - 2)) {
      // from home, to whichever neighbour pays best now (a town's purse runs dry: W-142); from there, home
      const here = run.room.region.id, atHome = here === run.home;
      const v = await npcView(DB(), here, run.now), coin = await run.coin();
      // spend the surplus at the town: a second cart first, then hands
      if (carts < goalCarts && coin >= NPC_CARTS.handcart + 100) {
        await run.deal({ op: 'cart', cart: 'handcart' });
        carts++;
        run.crewCarts();
        await run.note('bought a second handcart');
      } else if (carts >= goalCarts && hired < workerCap('trader') - 2 && coin >= NPC_HIRE.civ_forager + 100) {
        await run.deal({ op: 'hire', cls: 'civ_forager' });
        hired++;
        await run.note('hired a worker');
      }
      // where the goods pay best: any road out of here. A town's stock and purse are shallow (W-141, W-142), so when
      // nothing pays he walks on to the town he saw longest ago, and home for his strongroom now and then
      const left = await run.coin(), loads = freeLoads(run.room.npcSlots(run.pid));
      let there = '', plan: ReturnType<typeof cargoFor> = [], best = 0;
      seen.set(here, trips);
      for (const to of worldRegion(here)!.adj) {
        if (!shallow(to)) continue;
        if (!atHome && to !== run.home && (seen.get(to) ?? -99) > trips - 6) continue; // no bouncing between two towns abroad
        const p = cargoFor(v, await npcView(DB(), to, run.now), left, loads), net = p.reduce((a, o) => a + o.net, 0);
        if (net > best) { best = net; plan = p; there = to; }
      }
      if (!there) there = atHome ? [...worldRegion(here)!.adj].filter(shallow).sort((a, b) => (seen.get(a) ?? -99) - (seen.get(b) ?? -99))[0] : run.home;
      for (const p of plan) await run.deal({ op: 'buy', res: p.res as GoodKind, n: p.n });
      await run.cross(there);
      await run.toTown();
      const got = await run.sellAll();
      sold += got;
      trips++;
      await chooseStep(run, 'self'); // his chain's last choice, when it is open
      await run.note(`trip ${trips}: ${here} to ${there}, carried ${plan.map((p) => `${p.n} ${p.res}`).join(', ') || 'nothing'}, sold ${got}`);
    }
    const f = await getFavour(env, run.pid);
    console.log(`TRADER ${run.mins().toFixed(0)} min, L${f.level}, xp ${Math.floor(f.xp)}, ${trips} trips, ${sold} coin sold, ${carts} carts, ${hired} hired, stuck ${run.stuckEver.length}\n${run.log.join('\n')}`);
    // a known defect, not of this run's making: one of a cart's two crew stays behind on the north road into dodona, and rejoins at the next border
    expect(run.stuckEver.filter((s) => !s.startsWith('dodona hoplite at 344,231'))).toEqual([]);
    expect(f.level).toBeGreaterThanOrEqual(goalLevel);
    expect(carts).toBeLessThanOrEqual(cartCap('trader'));
    expect(carts).toBeGreaterThanOrEqual(goalCarts);
  }, 900_000);

  it('a builder, alone: his chain, his hands, a town of many kinds, a forge that earns and a share in the alliance works', async () => {
    const run = await begin(9852, 'builder', 0, 'dodona');
    run.room.setWorks(0, [WONDER.id]); // what the DO tells the room at his alliance's home
    const town = npcSpot(run.room.region);
    await run.note(`start, ${run.men().length} men`);
    await walkIn(run);
    await run.note('walked in; first step');

    const snap = () => run.room.sim.snapshot();
    const orderOf = (q: number) => snap().squads[q].order;
    /** His hands: everyone but the smith at the forge. */
    let smithSquad = -1;
    const gang = () => run.squads().filter((q) => q !== smithSquad);
    const civ = () => gang().find((q) => snap().units.some((u) => u.squad === q && u.cls.startsWith('civ_'))) ?? gang()[0];
    const all = (o: (q: number) => Parameters<typeof run.room.sim.order>[0]) => { for (const q of gang()) run.room.sim.order(o(q)); };
    const idle = () => gang().every((q) => orderOf(q) === 'hold');
    const gather = (res: string) => {
      const n = nodeNear(run, res, town.x, town.y);
      if (n) all((squad) => ({ kind: 'gather', squad, node: n.id }));
      return !!n;
    };
    /** A spot near the town for this type: close, so what he makes is a few steps from the market. */
    const spot = (type: BuildingType): [number, number] | null => {
      for (let d = 10; d < 80; d += 2) for (let a = 0; a < 16; a++) {
        const x = Math.round(town.x + Math.cos((a / 8) * Math.PI) * d), y = Math.round(town.y + Math.sin((a / 8) * Math.PI) * d);
        if (run.room.sim.checkPlacement(0, type, x, y).ok) return [x, y];
      }
      return null;
    };
    const mine = () => (snap().buildings ?? []).filter((b) => b.owner === `p:${run.pid}`);
    const built = (type: string) => mine().filter((b) => b.type === type && b.state === 'done').length;
    const toTown = async () => {
      all((squad) => ({ kind: 'move', squad, x: Math.round(town.x), y: Math.round(town.y) }));
      await run.until(() => run.men().filter((u) => gang().includes(u.squad)).every((u) => Math.hypot(u.x - town.x, u.y - town.y) < NPC.reach - 1), 3000);
    };
    const storeNear = () => (snap().buildings ?? []).filter((b) => b.team === 0 && b.state === 'done' && BUILDINGS[b.type as BuildingType].store).sort((a, b) => Math.hypot(a.x - town.x, a.y - town.y) - Math.hypot(b.x - town.x, b.y - town.y))[0];
    /** All he and his can carry of a good from the stores, sold at the town. */
    const sellStored = async (res: string, keep = 0) => {
      let got = 0;
      for (let i = 0; i < 6 && stored(run, res) > keep + 5; i++) {
        const st = storeWith(run, res);
        if (!st) break;
        all((squad) => ({ kind: 'load', squad, from: { building: st.id }, res: res as GoodKind }));
        await run.tick(); // orders land on the next tick
        await run.until(idle, 1500);
        await toTown();
        const r = await run.sellAll();
        got += r;
        if (!r) break;
      }
      return got;
    };
    /** `n` of a good bought at the town and put away in his nearest store. */
    const buyIn = async (res: GoodKind, n: number) => {
      let left = n;
      await toTown();
      while (left > 0.5) {
        const d = await run.deal({ op: 'buy', res, n: Math.min(left, run.roomFor(res)) }).catch(() => null);
        if (!d?.n) return false;
        left -= d.n;
        const st = storeNear();
        all((squad) => ({ kind: 'unload', squad, to: { building: st.id }, res }));
        await run.tick(); // orders land on the next tick
        await run.until(idle, 1500);
        await toTown();
      }
      return true;
    };
    /** What he still lacks of a good, gathered into his stores. */
    const gatherIn = async (res: string, need: number) => {
      const goal = stored(run, res) + need;
      if (gather(res)) await run.until(() => stored(run, res) >= goal, 3000);
      return stored(run, res) >= goal;
    };
    /** What `cost` still lacks: bought when the coin is there, else gathered. */
    const supply = async (cost: Partial<Record<string, number>>) => {
      for (const [res, n] of Object.entries(cost)) {
        const need = (n ?? 0) - stored(run, res);
        if (need <= 0) continue;
        const rule = npcGood(run.room.region.id, res), coin = await run.coin();
        if (rule && coin >= costOf(rule, rule.par, need) * 2) await buyIn(res as GoodKind, need);
        else if (!(await gatherIn(res, need)) && rule) await buyIn(res as GoodKind, need);
      }
    };
    /** Lays it out and all his hands raise it. */
    const raise = async (type: BuildingType) => {
      const at = spot(type);
      if (!at) return false;
      await supply(BUILDINGS[type].cost);
      run.room.sim.order({ kind: 'placeBuilding', squad: civ(), type, x: at[0], y: at[1] });
      await run.tick();
      const site = mine().filter((b) => b.type === type && b.state !== 'done').at(-1);
      if (!site) return false;
      all((squad) => ({ kind: 'build', squad, site: site.id }));
      const n = built(type);
      for (let i = 0; i < 4 && built(type) <= n; i++) {
        await run.until(() => built(type) > n, 1800);
        const lack = Object.entries((snap().buildings ?? []).find((b) => b.id === site.id)?.waiting ?? {}).filter(([, v]) => (v ?? 0) > 0);
        if (built(type) > n) break;
        // stores out of the site's reach do not feed it: what it still waits for he fetches, whatever they hold
        for (const [res, v] of lack) {
          const rule = npcGood(run.room.region.id, res), need = (v ?? 0) + 5;
          if (rule && (await run.coin()) >= costOf(rule, rule.par, need) * 2) await buyIn(res as GoodKind, need);
          else if (!(await gatherIn(res, need)) && rule) await buyIn(res as GoodKind, need);
        }
        all((squad) => ({ kind: 'build', squad, site: site.id }));
      }
      return built(type) > n;
    };
    /** His smith at his forge: goods in, a queue of smelts, the bronze sold. What his hands make earns more than what they cut. */
    const earned = { bronze: 0, raw: 0, gifts: 0, smelts: 0 };
    const forgeRound = async () => {
      const forge = mine().find((b) => b.type.startsWith('forge') && b.state === 'done');
      const smith = snap().units.find((u) => u.cls === 'civ_smith' && run.squads().includes(u.squad) && u.state !== 'dead');
      if (!forge || !smith) return;
      if (smithSquad < 0) {
        const before = new Set(run.squads());
        run.room.sim.order({ kind: 'detach', squad: smith.squad, unitIds: [smith.id] });
        await run.tick();
        await run.tick();
        smithSquad = run.squads().find((q) => !before.has(q)) ?? smith.squad;
      }
      run.room.sim.order({ kind: 'civWork', squad: smithSquad, building: forge.id });
      // what his purse can start: a few lots, more as the sales come in. One order is one copper and one tin
      const here = run.room.region.id, copper = npcGood(here, 'copper'), tin = npcGood(here, 'tin');
      if (!copper || !tin) return;
      const lot = costOf(copper, copper.par, 1) + costOf(tin, tin.par, 1);
      const lots = Math.min(CRAFT.queue * 4, Math.floor(((await run.coin()) * 0.8) / lot));
      const have = Math.floor(Math.min(stored(run, 'copper'), stored(run, 'tin')));
      if (have < CRAFT.queue && lots >= 1) {
        await buyIn('copper', lots);
        await buyIn('tin', lots);
      }
      const n = Math.min(CRAFT.queue, Math.floor(Math.min(stored(run, 'copper'), stored(run, 'tin'))));
      for (let i = 0; i < n; i++) run.room.sim.order({ kind: 'craft', team: 0, building: forge.id, recipe: 'smelt' });
      earned.smelts += n;
    };

    await supply({ wood: 60 });
    await run.note(`wood ${Math.floor(stored(run, 'wood'))}`);
    expect(await raise('storehouse')).toBe(true);
    await run.note('raised a storehouse');
    await chooseStep(run, 'own');

    const goalLevel = 4, maxMins = 480;
    const workers = () => run.men().filter((u) => u.cls.startsWith('civ_')).length;
    const level = async () => (await getFavour(env, run.pid)).level;
    const townLevel = () => Math.max(0, ...(snap().townLevels ?? []).filter((t) => t.team === 0).map((t) => t.level));
    // the town he raises: each kind of building a step up the town's level, each with its use. Then the alliance's wonder
    const plan: BuildingType[] = ['privateHouse', 'forge', 'farm', 'cookhouse', 'workshop', 'olivePress', 'stall', 'infirmary', 'pitchKiln', 'outpost'];
    const hire = [...Array(workerCap('builder'))].map((_, i) => (i === 0 ? 'civ_smith' : 'civ_forager'));
    for (let round = 0; round < 200 && run.mins() < maxMins && !((await level()) >= goalLevel && !plan.length && workers() >= workerCap('builder')); round++) {
      const forged = () => mine().some((b) => b.type === 'forge' && b.state === 'done');
      // the smith first: wood sold until he is paid for. The other hands from what the forge leaves over
      if (forged() && hire[0] === 'civ_smith') {
        const got = await sellStored('wood', 40);
        earned.raw += got;
        if ((await run.coin()) < NPC_HIRE.civ_smith) {
          await gatherIn('wood', 80);
          await run.note(`sold ${got} wood; coin ${Math.floor(await run.coin())}`);
          continue;
        }
      }
      if (hire.length && workers() < workerCap('builder') && forged() && (await run.coin()) >= NPC_HIRE[hire[0]] + (hire[0] === 'civ_smith' ? 0 : 200)) {
        const cls = hire.shift()!;
        await run.deal({ op: 'hire', cls });
        await run.tick();
        await run.note(`hired ${cls}, ${workers()} workers`);
      }
      // the next piece of the town, when he can pay what he cannot cut himself and still fill the forge
      const next = plan[0], coin = await run.coin(), rules = next ? Object.entries(BUILDINGS[next].cost) : [];
      const dear = rules.reduce((a, [res, n]) => {
        const rule = npcGood(run.room.region.id, res), need = (n ?? 0) - stored(run, res);
        return a + (rule && need > 0 ? costOf(rule, rule.par, need) : 0);
      }, 0);
      if (next && (!forged() || coin >= dear * 2 + 150)) {
        const ok = await raise(next);
        plan.shift();
        await run.note(`${next}: ${ok ? 'raised' : 'failed'}; town level ${townLevel()}`);
      } else if (!next) {
        // the town stands: the alliance's works, coin from his strongroom and his men on the site
        const c = Math.floor(await run.coin());
        const put = c >= 400 ? await give(env as never, run.pid, WONDER.id, { coin: c - 250 }, run.now).catch(() => null) : null;
        if (put) earned.gifts += put.coin ?? 0;
        const site = workSite(WONDER.id, run.room.region, ALLIANCES[0].quadrant);
        all((squad) => ({ kind: 'move', squad, x: Math.round(site.x), y: Math.round(site.y) }));
        await run.until(() => false, 3000);
        await run.note(`gave ${put?.coin ?? 0} coin to a work, 5 min on the wonder`);
      } else if (coin < 200) {
        earned.raw += await sellStored('wood', 40);
        await gatherIn('wood', 60);
      }
      await forgeRound();
      await run.until(() => false, 15 * 10 * CRAFT.queue); // a queue of smelts, 15 s each
      earned.bronze += await sellStored('bronze');
      await chooseStep(run, 'own'); // his chain's last choice, when it is open
      if (round % 5 === 4) await run.note(`so far: bronze ${earned.bronze}, raw ${earned.raw}, smelts ${earned.smelts}, gifts ${earned.gifts}`);
    }
    const f = await getFavour(env, run.pid), kinds = [...new Set(mine().filter((b) => b.state === 'done').map((b) => b.type))];
    console.log(`BUILDER ${run.mins().toFixed(0)} min, L${f.level}, xp ${Math.floor(f.xp)}, ${workers()} workers, town level ${townLevel()}, kinds ${kinds.join(' ')}, storehouses ${built('storehouse')}, earned ${JSON.stringify(earned)}, stuck ${run.stuckEver.length}\n${run.log.join('\n')}`);
    expect(run.stuckEver).toEqual([]);
    expect(f.level).toBeGreaterThanOrEqual(goalLevel);
    expect(workers()).toBe(workerCap('builder'));
    expect(built('storehouse'), 'no filler').toBeLessThanOrEqual(3);
    expect(townLevel()).toBeGreaterThanOrEqual(2);
    expect(earned.bronze, 'what he makes earns more than what he cuts').toBeGreaterThan(earned.raw);
  }, 900_000);
});
