/**
 * W-93, W-140..W-149 the solo game of a builder and a trader: seeded runs on the real sim and the real D1 rules, from the
 * start API to a mid-game goal, nobody else in the world. A small bot gives the orders a player would; the clock is game
 * time (ticks, the border's travel time). Lists come from the data, so a retune moves the numbers, not the script.
 *
 *   Trader: walks to the town, gathers a first load, works his chain, then runs the best goods between home and the best
 *           neighbour, buying carts and workers from the profit.
 *   Builder: gathers, raises his chain's buildings, sells what he gathers, hires up to his cap, and goes on building.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, devLogin } from '../helpers';
import { good } from './goods';
import { NPC_CARTS, NPC_HIRE } from '../../../src/data/warNpcTowns';
import { storyOf } from '../../../src/data/warStories';
import { NET_VERSION } from '../../../src/war/net/protocol';
import { costOf, npcGoods, npcSpot, payFor, type NpcView } from '../../../src/war/net/npcMarket';
import { perLoad } from '../../../src/war/sim/holders';
import type { BuildingType, GoodKind, WarPerson } from '../../../src/war/types';
import { WAR_SEASON } from '../../../src/war/world/alliances';
import { edge, worldRegion } from '../../../src/war/world/graph';
import { cartCap, workerCap, type PathId } from '../../../src/war/world/start';
import { room as freeLoads } from '../../src/war/cargo';
import { addFavour, builtFavour, getFavour, storyFavour } from '../../src/war/favour';
import { batch, ensureHolder, goodsOf, putStmt, strongroom } from '../../src/war/holders';
import { npcDeal, npcView } from '../../src/war/npcMarket';
import { claimForJoin } from '../../src/war/persons';
import { warRegion } from '../../src/war/regions';
import { WarRoom } from '../../src/war/room';
import { pathOf } from '../../src/war/start';
import { cargoFactor } from '../../src/war/world/world';

const DB = () => env.DB!;
const post = (token: string, path: string, json: unknown) => api(`/api/war/start${path}`, { method: 'POST', token, json });
const START = Date.UTC(2031, 0, 6, 8);
const FOE_R = WAR_SEASON.foeRadius;
/** Print each note as it happens (a long run's progress while tuning). */
const WATCH = true;

/** A squad and its cart stand this far around the point they were sent to. */
const FORMATION = 5;

/** A player's whole run: his clock, rooms and what happened. */
class Run {
  now = START;
  log: string[] = [];
  room!: WarRoom;
  rooms = new Map<string, WarRoom>();
  persons: WarPerson[] = [];
  /** Men who stopped answering a move order here: the road clears them on the next crossing. */
  stuck = new Set<number>();
  constructor(readonly pid: number, readonly token: string, readonly path: PathId, readonly home: string) {}

  roomOf(id: string): WarRoom {
    let r = this.rooms.get(id);
    if (!r) this.rooms.set(id, (r = new WarRoom({ region: warRegion(id)!, seed: 7, cap: 600, ...(id === this.home ? { home: 0 } : {}) })));
    return r;
  }

  mins = () => (this.now - START) / 60_000;
  async note(what: string) {
    const f = await getFavour(env, this.pid);
    const line = `${this.mins().toFixed(1)} min L${f.level} xp${Math.floor(f.xp)} sr ${Math.floor(await good(this.pid, 'coin'))}: ${what}`;
    this.log.push(line);
    if (WATCH) console.log(line);
  }

  /** One tick, booked as the region DO books it: story pay and level, build labour's level. */
  async tick(): Promise<void> {
    this.now += 100;
    const r = this.room.tick(() => this.now);
    for (const g of r.storied) {
      if (g.notes) await addFavour(env, this.pid, storyFavour(g.notes), 'story', this.now);
      const pay = Object.entries(g.goods).filter(([, n]) => n > 0);
      if (pay.length) await batch(DB(), [ensureHolder(DB(), strongroom(this.pid), 'strongroom', { pid: this.pid }, this.now), ...pay.map(([k, n]) => putStmt(DB(), strongroom(this.pid), k, n, 'story'))]);
    }
    const pz = (r as unknown as { peace?: { labour: { pid: number; secs: number }[] } | null }).peace;
    if (pz) for (const [pid, n] of builtFavour(this.room, pz.labour.map((l) => [l.pid, l.secs] as const))) await addFavour(env, pid, n, 'built', this.now);
  }

  async until(done: () => boolean, max: number): Promise<number> {
    // a whole second between looks: snapshots are the slow part of a long walk
    let t = 0;
    while (t < max && !done()) for (let i = 0; i < 10; i++, t++) await this.tick();
    return t;
  }

  squads = () => this.room.squadsOf(this.pid);
  men = () => this.room.sim.snapshot().units.filter((u) => this.squads().includes(u.squad) && u.state !== 'dead');
  civ = () => this.squads().find((q) => this.room.sim.snapshot().units.some((u) => u.squad === q && u.cls.startsWith('civ_')));
  pull = () => this.squads().find((q) => this.room.sim.snapshot().units.some((u) => u.squad === q && !u.cls.startsWith('civ_')));
  /** How far the furthest of his men and carts stands from a point. */
  far(x: number, y: number) {
    const at = [...this.men().filter((u) => !this.stuck.has(u.id)), ...(this.room.sim.snapshot().sieges ?? []).filter((e) => this.room.cartsOf(this.pid).includes(e.id))];
    return Math.max(0, ...at.map((u) => Math.hypot(u.x - x, u.y - y)));
  }
  /** Everyone walks to a point (within r): ticks taken. */
  async walk(x: number, y: number, r = 3, max = 6000): Promise<number> {
    for (const q of this.squads()) this.room.sim.order({ kind: 'move', squad: q, x: Math.round(x), y: Math.round(y) });
    // as a player would: a man left behind is told again, and one who still does not budge is left (counted in `stuck`)
    let tk = 0;
    while (tk < max && this.far(x, y) > r + FORMATION) {
      const was = new Map(this.men().map((u) => [u.id, [u.x, u.y]]));
      tk += await this.until(() => this.far(x, y) <= r + FORMATION, 600);
      for (const u of this.men()) {
        const p = was.get(u.id);
        if (p && Math.hypot(u.x - p[0], u.y - p[1]) < 0.5 && Math.hypot(u.x - x, u.y - y) > r + FORMATION) this.stuck.add(u.id);
      }
      if (this.far(x, y) > r + FORMATION) for (const q of this.squads()) this.room.sim.order({ kind: 'move', squad: q, x: Math.round(x), y: Math.round(y) });
    }
    if (WATCH && tk >= max) console.log('STUCK', this.room.region.id, Math.round(x), Math.round(y), JSON.stringify(this.squads()), JSON.stringify(this.men().map((u) => [u.cls, Math.round(u.x), Math.round(u.y), u.state, u.squad])), JSON.stringify(this.squads().map((q) => this.room.sim.snapshot().squads[q]?.order)), JSON.stringify((this.room.sim.snapshot().sieges ?? []).filter((e) => this.room.cartsOf(this.pid).includes(e.id)).map((e) => [e.id, e.type, Math.round(e.x), Math.round(e.y), e.state, e.crew])));
    return tk;
  }
  async toTown() {
    const at = npcSpot(this.room.region);
    return this.walk(at.x, at.y, 8);
  }

  /** Every cart crewed by a squad of his (arriving, only the first is). */
  crewCarts() {
    const carts = this.room.cartsOf(this.pid), snap = this.room.sim.snapshot(), free = this.squads().filter((q) => !(snap.sieges ?? []).some((e) => e.crew === q));
    for (const c of carts) {
      const e = (snap.sieges ?? []).find((x) => x.id === c)!;
      if (e.crew === undefined || e.crew === null || e.crew < 0) {
        const q = free.shift();
        if (q !== undefined) this.room.sim.order({ kind: 'crew', squad: q, siege: c });
      }
    }
  }

  /** The room his deals fit in, in units of a good. */
  roomFor = (res: string) => freeLoads(this.room.npcSlots(this.pid)) * perLoad(res as GoodKind);
  carried(res: string) {
    return this.room.npcSlots(this.pid).reduce((a, s) => a + s.hold.lots.filter((l) => l.r === res).reduce((b, l) => b + l.n, 0), 0);
  }
  /** His coin in reach of a deal: packs, and at home the strongroom. */
  async coin(): Promise<number> {
    const bank = this.room.region.id === this.home ? ((await goodsOf(DB(), strongroom(this.pid))).coin ?? 0) : 0;
    return this.carried('coin') + bank;
  }
  async deal(m: Parameters<typeof npcDeal>[3]) {
    const r = await npcDeal(env, this.room, this.pid, m, this.now);
    return r.done;
  }

  /** Sell all he carries of what the town deals in, but coin. */
  async sellAll(): Promise<number> {
    let got = 0;
    const goods = new Set(npcGoods(this.room.region.id).map((g) => g.res as string));
    for (const s of this.room.npcSlots(this.pid)) for (const l of s.hold.lots) if (l.n > 0 && goods.has(l.r)) {
      const r = await this.deal({ op: 'sell', res: l.r as never }).catch(() => null);
      if (r) got += r.coin;
    }
    return got;
  }

  /** Over the border, on the world's time, into the next room with all he has. */
  async cross(to: string) {
    const from = this.room.region.id, e = edge(from, to)!, side = e.a === from ? e.sideA : e.sideB, back = e.a === from ? e.sideB : e.sideA;
    const out = this.room.depart(this.pid, side, FOE_R);
    if ('error' in out) throw new Error(`depart: ${out.error} ${out.detail}`);
    this.now += Math.round((e.ms + out.off * WAR_SEASON.offExitMsPerTile) * cargoFactor(out.cargo));
    if (out.cargo) await addFavour(env, this.pid, Object.values(out.cargo.packs).reduce((a, p) => a + p.lots.reduce((b, l) => b + l.n / perLoad(l.r), 0), 0) * 2 + (out.cargo.carts ?? []).reduce((a, c) => a + c.lots.reduce((b, l) => b + l.n / perLoad(l.r), 0), 0) * 2, 'carried', this.now);
    this.room = this.roomOf(to);
    const stay = this.persons.filter((p) => out.ids.includes(p.id));
    const inn = this.room.arrive(this.pid, 0, stay, back, out.lost, out.cargo);
    if ('error' in inn) throw new Error(`arrive: ${inn.error}`);
    this.stuck.clear();
    // he is online: he takes them over at once, as the client's rejoin does
    this.room.join(this.pid, { t: 'join', v: NET_VERSION, region: to, playerId: this.pid, team: 0 });
    this.room.setPath(this.pid, await pathOf(DB(), this.pid));
    await this.tick();
    this.crewCarts();
    await this.tick();
  }
}

/** A player through the real start API, on the field at home, his story begun. */
async function begin(id: number, path: PathId, alliance: number, home: string): Promise<Run> {
  const me = await devLogin(id);
  expect((await post(me.token, '/alliance', { alliance })).status).toBe(200);
  expect((await post(me.token, '/home', { region: home })).status).toBe(200);
  expect((await post(me.token, '/path', { path })).status).toBe(200);
  const run = new Run(me.playerId, me.token, path, home);
  const all = (await (await api('/api/war/roster', { token: me.token })).json<{ persons: { id: string; cls: string; state: string }[] }>()).persons.filter((p) => p.state === 'active');
  const groups = [all.filter((p) => !p.cls.startsWith('civ_')), all.filter((p) => p.cls.startsWith('civ_'))].map((g) => g.map((p) => p.id));
  run.room = run.roomOf(home);
  const got = await claimForJoin(DB(), run.pid, home, groups, run.room.personsHere(), run.now);
  if (typeof got === 'string') throw new Error(got);
  run.persons = got.flat();
  const w = run.room.join(run.pid, { t: 'join', v: NET_VERSION, region: home, playerId: run.pid, team: 0, squads: groups }, got).msg;
  if (w.t !== 'welcome') throw new Error(`refused: ${JSON.stringify(w)}`);
  run.room.setPath(run.pid, await pathOf(DB(), run.pid));
  run.room.startStory(run.pid, null);
  await run.tick();
  return run;
}

/** To the giver, then the place his chain's first step names. */
async function walkIn(run: Run) {
  const story = storyOf(run.home, run.path)!, first = story.steps[0].trigger;
  await run.walk(story.giver.at[0], story.giver.at[1]);
  if (first.kind === 'reach') await run.walk(first.at[0], first.at[1]);
}

/** The wood node nearest a point that nobody guards. */
function nodeNear(run: Run, res: string, x: number, y: number) {
  return run.room.sim.resourceNodes().filter((n) => n.res === res && n.amount > 5 && !n.guarded).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
}
/** What his team's stores near the town hold. */
const stored = (run: Run, res: string) => (run.room.sim.snapshot().buildings ?? []).filter((b) => b.team === 0 && b.goods).reduce((a, b) => a + (b.goods?.[res as GoodKind] ?? 0), 0);
const storeWith = (run: Run, res: string) => (run.room.sim.snapshot().buildings ?? []).filter((b) => b.team === 0 && (b.goods?.[res as GoodKind] ?? 0) >= 5).sort((a, b) => (b.goods?.[res as GoodKind] ?? 0) - (a.goods?.[res as GoodKind] ?? 0))[0];

/** The good worth carrying from `v` to `w` for this coin and room: most profit; null: none pays. */
function cargoFor(v: NpcView, w: NpcView, coin: number, room: number): { res: string; n: number; net: number } | null {
  let best: { res: string; n: number; net: number } | null = null;
  for (const g of npcGoods(v.town)) {
    const h = npcGoods(w.town).find((x) => x.res === g.res);
    const sv = v.goods.find((x) => x.res === g.res), sw = w.goods.find((x) => x.res === g.res);
    if (!h || !sv || !sw) continue;
    for (let n = 10; n <= room; n += 10) {
      const cost = costOf(g, sv.stock, n), pay = Math.min(payFor(h, sw.stock, n), w.purse), net = pay - cost;
      if (cost > coin) break;
      if (net > 0 && (!best || net > best.net)) best = { res: g.res, n, net };
    }
  }
  return best;
}

async function chooseStep(run: Run, option: string) {
  run.room.storyChoose(run.pid, option);
  await run.tick();
}

describe('W-93 a solo run on each path', () => {
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
    const goalLevel = 4, goalCarts = 2;
    const level = async () => (await getFavour(env, run.pid)).level;
    while (trips < 40 && !((await level()) >= goalLevel && carts >= goalCarts && hired >= workerCap('trader') - 2)) {
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
      const left = await run.coin(), room = run.roomFor('iron');
      let there = run.home, plan: ReturnType<typeof cargoFor> = null;
      for (const to of atHome ? worldRegion(run.home)!.adj : [run.home]) {
        const p = cargoFor(v, await npcView(DB(), to, run.now), left, room);
        if (atHome && !plan) there = to;
        if (p && (!plan || p.net > plan.net)) { plan = p; there = to; }
      }
      if (plan) await run.deal({ op: 'buy', res: plan.res as GoodKind, n: plan.n });
      await run.cross(there);
      await run.toTown();
      const got = await run.sellAll();
      sold += got;
      trips++;
      await chooseStep(run, 'self'); // his chain's last choice, when it is open
      await run.note(`trip ${trips}: carried ${plan ? `${plan.n} ${plan.res}` : 'nothing'}, sold ${got}`);
    }
    const f = await getFavour(env, run.pid);
    console.log(`TRADER ${run.mins().toFixed(0)} min, L${f.level}, xp ${Math.floor(f.xp)}, ${trips} trips, ${sold} coin sold, ${carts} carts, ${hired} hired\n${run.log.join('\n')}`);
    expect(f.level).toBeGreaterThanOrEqual(goalLevel);
    expect(carts).toBeLessThanOrEqual(cartCap('trader'));
    expect(carts).toBeGreaterThanOrEqual(goalCarts);
  }, 900_000);

  it('a builder, alone, from his start to his workers, his buildings and a level by building', async () => {
    const run = await begin(9852, 'builder', 0, 'dodona');
    const town = npcSpot(run.room.region);
    await run.note(`start, ${run.men().length} men`);
    await walkIn(run);
    await run.note('walked in; first step');

    const civ = () => run.civ()!;
    const gather = (res: string) => {
      const n = nodeNear(run, res, town.x, town.y);
      if (n) run.room.sim.order({ kind: 'gather', squad: civ(), node: n.id });
      return !!n;
    };
    /** A spot near the town for this type. */
    const spot = (type: BuildingType): [number, number] | null => {
      for (let d = 12; d < 60; d += 2) for (let a = 0; a < 16; a++) {
        const x = Math.round(town.x + Math.cos((a / 8) * Math.PI) * d), y = Math.round(town.y + Math.sin((a / 8) * Math.PI) * d);
        if (run.room.sim.checkPlacement(0, type, x, y).ok) return [x, y];
      }
      return null;
    };
    const built = (type: string) => (run.room.sim.snapshot().buildings ?? []).filter((b) => b.type === type && b.owner === `p:${run.pid}` && b.state === 'done').length;
    /** Lays it out and his workers raise it. */
    const raise = async (type: BuildingType) => {
      const at = spot(type);
      if (!at) return false;
      run.room.sim.order({ kind: 'placeBuilding', squad: civ(), type, x: at[0], y: at[1] });
      await run.tick();
      const site = (run.room.sim.snapshot().buildings ?? []).filter((b) => b.type === type && b.owner === `p:${run.pid}` && b.state !== 'done').at(-1);
      if (!site) return false;
      run.room.sim.order({ kind: 'build', squad: civ(), site: site.id });
      const n = built(type);
      await run.until(() => built(type) > n, 12_000);
      return built(type) > n;
    };

    /** Gather until the stores hold `n` more `res`. */
    const stock = async (res: string, n: number) => {
      const need = n - stored(run, res);
      if (need <= 0) return;
      gather(res);
      const goal = stored(run, res) + need;
      await run.until(() => stored(run, res) >= goal, 18_000);
    };
    /** Goods out of the stores into packs and sold at the town. */
    const sellStored = async (res: string, keep: number) => {
      const st = storeWith(run, res);
      if (!st || stored(run, res) <= keep + 5) return 0;
      run.room.sim.order({ kind: 'load', squad: civ(), from: { building: st.id }, res: res as GoodKind });
      await run.until(() => run.room.sim.snapshot().squads[civ()].order === 'hold', 3000);
      const at = npcSpot(run.room.region);
      run.room.sim.order({ kind: 'move', squad: civ(), x: Math.round(at.x), y: Math.round(at.y) });
      await run.until(() => run.room.npcSlots(run.pid).some((s) => s.hold.lots.some((l) => l.r === res)), 3000);
      return run.sellAll();
    };

    await stock('wood', 60);
    await run.note(`wood ${Math.floor(stored(run, 'wood'))}`);
    expect(await raise('storehouse')).toBe(true);
    await run.note('raised a storehouse');
    await run.tick();

    const goalLevel = 3;
    const workers = () => run.men().filter((u) => u.cls.startsWith('civ_')).length;
    const level = async () => (await getFavour(env, run.pid)).level;
    for (let round = 0; round < 60 && !((await level()) >= goalLevel && workers() >= workerCap('builder')); round++) {
      if (workers() < workerCap('builder')) {
        await stock('wood', 80);
        const got = await sellStored('wood', 0);
        if (await run.coin() >= NPC_HIRE.civ_forager) {
          const d = await run.deal({ op: 'hire', cls: 'civ_forager' }).catch((e: Error) => e.message);
          await run.tick();
          await run.note(`sold ${got}; hire: ${JSON.stringify(d)}, ${workers()} workers`);
        } else await run.note(`sold ${got}: coin ${Math.floor(await run.coin())}`);
      }
      await stock('wood', 60);
      if (!built('privateHouse')) {
        await stock('stone', 10);
        await stock('wood', 40);
        await raise('privateHouse');
        await run.note('raised his house');
      } else if (await raise('storehouse')) await run.note('raised a storehouse');
      else break;
      await chooseStep(run, 'own'); // his chain's last choice, when it is open
    }
    const f = await getFavour(env, run.pid);
    console.log(`BUILDER ${run.mins().toFixed(0)} min, L${f.level}, xp ${Math.floor(f.xp)}, ${workers()} workers, ${built('storehouse')} storehouses, ${built('privateHouse')} houses\n${run.log.join('\n')}`);
    expect(f.level).toBeGreaterThanOrEqual(goalLevel);
    expect(workers()).toBe(workerCap('builder'));
    expect(built('privateHouse')).toBeGreaterThanOrEqual(1);
  }, 900_000);
});
