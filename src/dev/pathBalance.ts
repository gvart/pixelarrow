/**
 * W-203 each path played (`npm run balance:war`, after the crafting and landmark reports): a warrior hunts lairs, a builder
 * gathers and raises a town, a trader carries goods between two towns, each from his real start and with his real caps and
 * perks, at the start and grown. Deterministic: fixed seeds. Lists and numbers come from the data, so a retune moves the rows.
 *
 *  - Warrior and builder play the real sim on real regions, for PLAY_MIN minutes of game time.
 *  - A trader's first load is played on the sim; his road (W-87: a whole group over one border) has no sim here, so the
 *    trips run on the real market rules and road times for ROAD_HOURS.
 *  - Level points and coin are what the rules pay for that work. A warrior's fight is paid as one even Kill off the board, a
 *    trader's trip as one near Trade, a builder's board row as raises, all at one town under the real repeat penalty (W-189).
 *    A rate counts the whole window: a warrior wiped at 10 minutes has earned nothing for the other 20.
 *  - Left out: tasks, stories, encounters and hurt men's levels (they pay every path alike, or need D1). The eight-hour runs
 *    in server/test/war/townBoardRuns.test.ts stay the proof of a whole game.
 */
import { BOARD } from '../data/warTownBoard';
import { NPC, NPC_CARTS } from '../data/warNpcTowns';
import { perkFx } from '../data/warPerks';
import { FAVOUR_EARN, FAVOUR_XP, favourLevel, HOUR_CAP } from '../war/net/favour';
import { costOf, npcGoods, npcSpot, npcSwings, offerRule, payFor, purseAfter, stockAfter, type NpcGoodRule } from '../war/net/npcMarket';
import { armyStrength, bandStrength, heatAfter, quotePay, ratingOf } from '../war/net/townBoard';
import { createSim } from '../war/sim';
import { warStats } from '../war/sim/classes';
import { depthOf } from '../war/sim/depth';
import { BUILDINGS, CARRY } from '../war/sim/economy';
import { makePerson } from '../war/sim/roster';
import { CART_LOADS } from '../war/sim/trade';
import { SIEGE } from '../war/sim/siege';
import type { BuildingType, LairSnap, MobKind, WarBuildSim, WarPerson } from '../war/types';
import { WAR_SEASON } from '../war/world/alliances';
import { edge, worldRegion } from '../war/world/graph';
import { cartCap, FAMILIES, FAMILY_IDS, PATHS, pathStart, soldierCap, workerCap, type PathId, type StartFamily } from '../war/world/start';
import { regionOf } from './landmarkBalance';

const HOUR = 3_600_000;
const TICKS_PER_SEC = 10;
const PLAY_MIN = 30;
const ROAD_HOURS = 8;
const SEED = 41;
/** A warrior's hunting ground: an entry region's lairs, a builder's and a trader's ground: his home. */
const HUNT = 'dodona-s', HOME = 'dodona';
/** A grown player: at the cap, at this demigod level, his soldiers at this level. */
const GROWN = { demigod: 5, men: 3 };
const OWNER = 'p:1';

export interface PathRow { path: PathId; setup: string; level: number; pts: number; coin: number; line: string }

/** The favour he has earned, his level and perks following it as they do in play. */
function books(sim: WarBuildSim, path: PathId, family: StartFamily | null, level0: number) {
  let xp = FAVOUR_XP[level0], level = level0;
  sim.setPaths(() => ({ path, family, level }));
  return {
    add(n: number) {
      xp += n;
      if (favourLevel(xp) !== level) {
        level = favourLevel(xp);
        sim.refreshPerks(OWNER);
      }
    },
    get earned() { return xp - FAVOUR_XP[level0]; },
    get level() { return level; },
  };
}

/** Board pay under the real repeat penalty: each hand-in weighs on the next, the weight fading (W-189). */
function board(kind: 'kill' | 'build' | 'trade', job: { coin: number; points: number }, path: PathId) {
  let heat = 0, at = 0, coin = 0, points = 0;
  return {
    handIn(now: number, share = 1) {
      heat = heatAfter(heat, now - at);
      at = now;
      const p = quotePay({ kind, coin: job.coin * share, points: job.points * share }, path, heat, NPC.purse.start);
      coin += p.coin;
      points += p.points;
      heat += share;
      return p;
    },
    get coin() { return coin; },
    get points() { return points; },
  };
}

const persons = (classes: readonly string[], level: number, tag: string): WarPerson[] => classes.map((cls, i) => makePerson(`${tag}${i}`, cls, { level }));
const grownMen = (start: readonly string[], cap: number) => Array.from({ length: cap }, (_, i) => start[i % start.length]);

/** A warrior hunts: the nearest lair the board's words call fair or easy, his missiles behind his line; hurt, he rests at the town. */
export function warriorRun(family: StartFamily, grown: boolean): PathRow {
  const r = regionOf(HUNT), sim = createSim(r, SEED), book = books(sim, 'warrior', family, grown ? GROWN.demigod : 1);
  sim.spawnMobs();
  const town = npcSpot(r), depth = depthOf(r), start = pathStart('warrior', family);
  const men = persons(grown ? grownMen(start, soldierCap('warrior')) : start, grown ? GROWN.men : 1, 'w');
  const line = men.filter((p) => warStats(p.hero.cls!).range === 0), back = men.filter((p) => warStats(p.hero.cls!).range > 0);
  const squads = [sim.spawnSquad(OWNER, 0, line[0].hero.cls!, line.length, town.x, town.y, line), ...(back.length ? [sim.spawnSquad(OWNER, 0, back[0].hero.cls!, back.length, town.x + 4, town.y, back)] : [])];
  const kills = board('kill', BOARD.kill[1], 'warrior');
  const limit = PLAY_MIN * 60 * TICKS_PER_SEC;
  let lair = -1, resting = false, cleared = 0, kind = '', t = 0, ended = limit;
  for (; t < limit; t++) {
    sim.step();
    if (t % TICKS_PER_SEC) continue;
    const s = sim.snapshot(), mine = s.units.filter((u) => squads.includes(u.squad) && u.state !== 'dead');
    if (!mine.length) { ended = t; break; }
    const hurt = mine.reduce((a, u) => a + u.hp, 0) / mine.reduce((a, u) => a + u.maxHp, 0);
    const lairs = s.lairs ?? [];
    if (lair >= 0 && lairs[lair]?.state === 'cleared') {
      cleared++;
      const k = sim.endFight().persons.reduce((a, p) => a + p.kills, 0);
      book.add(FAVOUR_EARN.win + Math.min(k, FAVOUR_EARN.killCap) * FAVOUR_EARN.kill + kills.handIn((t / TICKS_PER_SEC) * 1000).points);
      lair = -1;
    }
    if (resting) {
      const near = mine.every((u) => Math.hypot(u.x - town.x, u.y - town.y) < 14);
      if (near) sim.tend(mine.map((u) => u.id), BOARD.rest.perSec);
      if (hurt >= 0.95) resting = false;
      continue;
    }
    if (lair < 0) {
      const army = armyStrength(mine.map((u) => ({ cls: u.cls, level: grown ? GROWN.men : 1, hp: u.hp / u.maxHp })), book.level);
      const c = mine[0];
      const dares = (l: LairSnap) => ['easy', 'fair'].includes(ratingOf(army, bandStrength({ kind: l.kind as MobKind, count: l.alive, ...(l.chief ? { chief: l.chief.id } : {}) }, depth)));
      const next = lairs.map((l, i) => ({ l, i })).filter(({ l }) => l.state !== 'cleared' && dares(l))
        .sort((a, b) => Math.hypot(a.l.x - c.x, a.l.y - c.y) - Math.hypot(b.l.x - c.x, b.l.y - c.y))[0];
      if (!next || hurt < 0.7) {
        if (hurt >= 0.95) { ended = t; break; }
        resting = true;
        for (const q of squads) sim.order({ kind: 'move', squad: q, x: Math.round(town.x), y: Math.round(town.y) });
        continue;
      }
      lair = next.i;
      kind = next.l.kind;
    }
    for (const q of squads) if (s.squads[q]?.order !== 'attack') sim.order({ kind: 'attack', squad: q, target: lairs[lair].squad });
  }
  const s = sim.snapshot(), left = s.units.filter((u) => squads.includes(u.squad) && u.state !== 'dead').length, h = PLAY_MIN / 60;
  return {
    path: 'warrior', setup: `${FAMILIES[family].name}, ${grown ? `grown, ${men.length} men, L${GROWN.demigod}` : `start, ${men.length} men`}`, level: book.level,
    pts: book.earned / h, coin: kills.coin / h,
    line: `${cleared}/${(s.lairs ?? []).length} lairs${cleared ? `, last ${kind}` : ''}, ${men.length - left} men down${ended < limit ? `, ${left ? 'nothing fair left' : 'wiped'} at ${Math.round(ended / TICKS_PER_SEC / 60)} min` : ''}`,
  };
}

/** A builder: his hands gather what the next building lacks, then raise it, on through the list. */
const BUILD_LIST: readonly BuildingType[] = ['storehouse', 'workshop', 'farm', 'forge', 'cookhouse', 'infirmary'];
export function builderRun(grown: boolean): PathRow {
  const r = regionOf(HOME), sim = createSim(r, SEED), book = books(sim, 'builder', null, grown ? GROWN.demigod : 1);
  sim.spawnMobs();
  const town = npcSpot(r);
  sim.claim(0, town.x, town.y, 60);
  const start = pathStart('builder');
  const sold = grown ? grownMen(start.filter((c) => !c.startsWith('civ_')), soldierCap('builder')) : start.filter((c) => !c.startsWith('civ_'));
  const civ = grown ? grownMen(start.filter((c) => c.startsWith('civ_')), workerCap('builder')) : start.filter((c) => c.startsWith('civ_'));
  const squads = [sim.spawnSquad(OWNER, 0, sold[0], sold.length, town.x, town.y, persons(sold, grown ? GROWN.men : 1, 's')), sim.spawnSquad(OWNER, 0, civ[0], civ.length, town.x + 4, town.y, persons(civ, 1, 'c'))];
  const all = (o: (q: number) => Parameters<WarBuildSim['order']>[0]) => { for (const q of squads) sim.order(o(q)); };
  const spot = (type: BuildingType): [number, number] | null => {
    for (let d = 10; d < 60; d += 2) for (let a = 0; a < 16; a++) {
      const x = Math.round(town.x + Math.cos((a / 8) * Math.PI) * d), y = Math.round(town.y + Math.sin((a / 8) * Math.PI) * d);
      if (sim.checkPlacement(0, type, x, y).ok) return [x, y];
    }
    return null;
  };
  const limit = PLAY_MIN * 60 * TICKS_PER_SEC;
  let site = -1, next = 0, raised = 0, labour = 0, doing = '', sent = 0;
  const stockOf = (res: string) => (sim.goodsAt(0, town.x, town.y) as Record<string, number | undefined>)[res] ?? 0;
  for (let t = 0; t < limit && next < BUILD_LIST.length; t++) {
    sim.step();
    if (t % TICKS_PER_SEC) continue;
    for (const l of sim.takeLabour()) if (l.owner === OWNER) labour += l.secs;
    const type = BUILD_LIST[next];
    if (site >= 0) {
      const b = (sim.snapshot().buildings ?? []).find((x) => x.id === site);
      if (b?.state === 'done') { raised++; next++; site = -1; doing = ''; }
      else if (t - sent > 20 * TICKS_PER_SEC) { sent = t; all((squad) => ({ kind: 'build', squad, site })); }
      continue;
    }
    const k = 1 - (perkFx('builder', book.level).siteCost ?? 0);
    const lack = Object.entries(BUILDINGS[type].cost).find(([res, n]) => stockOf(res) < (n ?? 0) * k);
    if (lack) {
      if (doing !== lack[0]) {
        const node = sim.resourceNodes().filter((n) => n.res === lack[0] && n.amount > 5 && !n.guarded).sort((a, b) => Math.hypot(a.x - town.x, a.y - town.y) - Math.hypot(b.x - town.x, b.y - town.y))[0];
        if (!node) { next++; continue; }
        doing = lack[0];
        all((squad) => ({ kind: 'gather', squad, node: node.id }));
      }
      continue;
    }
    const at = spot(type);
    if (!at) { next++; continue; }
    sim.order({ kind: 'placeBuilding', squad: squads[1], type, x: at[0], y: at[1] });
    sim.step();
    t++;
    const mine = (sim.snapshot().buildings ?? []).filter((b) => b.owner === OWNER && b.type === type && b.state !== 'done').at(-1);
    if (!mine) { next++; continue; }
    site = mine.id;
    sent = t;
    all((squad) => ({ kind: 'build', squad, site }));
  }
  const h = PLAY_MIN / 60;
  book.add(labour * FAVOUR_EARN.built.labour);
  return {
    path: 'builder', setup: `${grown ? `grown, ${sold.length + civ.length} hands, L${GROWN.demigod}` : `start, ${sold.length + civ.length} hands`}, own town`, level: book.level,
    pts: book.earned / h, coin: 0,
    line: `raised ${raised}/${BUILD_LIST.length}, gathering it all himself, ${Math.round(labour / h)} labour-secs/h`,
  };
}

/** A builder on the board instead: every hand on a raise for an hour; its wood and stone come with it (W-188), so no gathering. */
export function builderBoard(grown: boolean): PathRow {
  const start = pathStart('builder'), hands = grown ? soldierCap('builder') + workerCap('builder') : start.length;
  const level = grown ? GROWN.demigod : 1, k = 1 + (perkFx('builder', level).work ?? 0), n = (hands * 3600 * k) / BOARD.build[1].labour;
  const jobs = board('build', BOARD.build[1], 'builder');
  const whole = Math.floor(n);
  for (let i = 0; i < whole; i++) jobs.handIn(((i + 1) * HOUR) / n);
  return {
    path: 'builder', setup: `${grown ? `grown, ${hands} hands, L${level}` : `start, ${hands} hands`}, board`, level,
    pts: jobs.points + hands * 3600 * k * FAVOUR_EARN.built.labour * BOARD.labourFavour, coin: jobs.coin,
    line: `${n.toFixed(1)} raises an hour, worked out, not played`,
  };
}

/** A town's market as it moves under him: stock and purse, drifting back with the hours. */
function market(town: string) {
  const goods = new Map(npcGoods(town).map((g) => [g.res as string, { g, stock: g.par }]));
  let purse: number = NPC.purse.start, at = 0;
  return {
    town, goods,
    go(now: number) {
      for (const v of goods.values()) v.stock = stockAfter(v.stock, v.g.par, now - at);
      purse = purseAfter(purse, Math.floor(now / (24 * HOUR)) - Math.floor(at / (24 * HOUR)));
      at = now;
    },
    get purse() { return purse; },
    pay(n: number) { purse -= n; },
  };
}

/** The most profitable cargo from `a` to `b` for this coin and these loads. */
function bestCargo(a: ReturnType<typeof market>, b: ReturnType<typeof market>, coin: number, loads: number): { g: NpcGoodRule; h: NpcGoodRule; n: number; cost: number; pay: number } | null {
  let best: { g: NpcGoodRule; h: NpcGoodRule; n: number; cost: number; pay: number } | null = null;
  for (const [res, s] of a.goods) {
    const o = b.goods.get(res);
    if (!o) continue;
    for (let n = CARRY; n <= loads * CARRY && n <= s.stock; n += CARRY) {
      const cost = costOf(s.g, s.stock, n), pay = payFor(o.g, o.stock, n, b.purse);
      if (cost > coin) break;
      if (pay - cost > (best ? best.pay - best.cost : 0)) best = { g: s.g, h: o.g, n, cost, pay };
    }
  }
  return best;
}

/** A loaded trip's time: out to the border, over the road with loaded packs (W-87: x1.2), and in to the next town. */
function crossing(from: string, to: string, faster: number): number {
  const e = edge(from, to)!, near = (id: string, side: string) => {
    const r = regionOf(id), a = r.entries.find((x) => x.side === side) ?? r.entries[0], t = npcSpot(r);
    return Math.hypot(a.x + a.w / 2 - t.x, a.y + a.h / 2 - t.y);
  };
  const [out, inn] = e.a === from ? [e.sideA, e.sideB] : [e.sideB, e.sideA];
  return (e.ms + near(from, out) * WAR_SEASON.offExitMsPerTile) * 1.2 + (near(to, inn) / (SIEGE.handcart.speed * (1 + faster))) * 1000;
}

/** A trader: first load gathered on the sim, then back and forth over one road, buying carts from the profit. */
export function traderRun(grown: boolean): PathRow {
  const home = HOME, to = worldRegion(home)!.adj[0];
  const level0 = grown ? GROWN.demigod : 1;
  // the first load: his forager and merchant cut wood by the town, as they do alone in the solo run
  const r = regionOf(home), sim = createSim(r, SEED), book = books(sim, 'trader', null, level0), town = npcSpot(r);
  sim.spawnMobs();
  sim.claim(0, town.x, town.y, 60);
  const civ = pathStart('trader').filter((c) => c.startsWith('civ_'));
  const q = sim.spawnSquad(OWNER, 0, civ[0], civ.length, town.x, town.y, persons(civ, 1, 't'));
  const node = sim.resourceNodes().filter((n) => n.res === 'wood' && n.amount > 5 && !n.guarded).sort((a, b) => Math.hypot(a.x - town.x, a.y - town.y) - Math.hypot(b.x - town.x, b.y - town.y))[0];
  sim.order({ kind: 'gather', squad: q, node: node.id });
  const wood0 = (sim.goodsAt(0, town.x, town.y).wood ?? 0) as number;
  let tick = 0;
  for (; tick < 12_000; tick++) {
    sim.step();
    if (tick % TICKS_PER_SEC === 0 && ((sim.goodsAt(0, town.x, town.y).wood ?? 0) as number) >= wood0 + 100) break;
  }
  const A = market(home), B = market(to);
  let now = (tick / TICKS_PER_SEC) * 1000, coin = 0, trips = 0, sold = 0, carts = grown ? cartCap('trader') : 1;
  const first = A.goods.get('wood')!;
  coin += payFor(first.g, first.stock, 100, A.purse);
  first.stock += 100;
  A.pay(coin);
  const hours = (ms: number) => Math.floor(ms / HOUR);
  const capSold = HOUR_CAP.sold!, capCarried = HOUR_CAP.carried!, earned = new Map<string, number>();
  const capped = (why: 'sold' | 'carried', n: number, cap: number) => {
    const k = `${why}:${hours(now)}`, had = earned.get(k) ?? 0, ok = Math.max(0, Math.min(n, cap - had));
    earned.set(k, had + ok);
    book.add(ok);
  };
  const jobs = board('trade', BOARD.trade[0], 'trader');
  let here = A, there = B;
  const end = ROAD_HOURS * HOUR;
  while (now < end) {
    const fx = perkFx('trader', book.level);
    const loads = carts * (CART_LOADS.handcart + (fx.cartLoads ?? 0));
    here.go(now);
    there.go(now);
    const c = bestCargo(here, there, coin, loads);
    const road = crossing(here.town, there.town, fx.cartSpeed ?? 0);
    if (c) {
      coin -= c.cost;
      here.goods.get(c.g.res)!.stock -= c.n;
      here.pay(-c.cost);
    }
    now += road;
    if (c) {
      there.go(now);
      const pay = payFor(c.h, there.goods.get(c.h.res)!.stock, c.n, there.purse);
      coin += pay;
      sold += pay;
      there.goods.get(c.h.res)!.stock += c.n;
      there.pay(pay);
      capped('sold', pay * FAVOUR_EARN.sold, capSold);
      capped('carried', (c.n / CARRY) * FAVOUR_EARN.carried, capCarried);
    }
    const j = jobs.handIn(now);
    book.add(j.points);
    coin += j.coin;
    trips++;
    if (carts < cartCap('trader') && coin >= NPC_CARTS.handcart * 3) { coin -= NPC_CARTS.handcart; there.pay(-NPC_CARTS.handcart); carts++; }
    [here, there] = [there, here];
  }
  const h = now / HOUR;
  return {
    path: 'trader', setup: grown ? `grown, ${carts} carts, L${GROWN.demigod}` : 'start, 1 cart', level: book.level,
    pts: book.earned / h, coin: (sold + jobs.coin) / h,
    line: `${home} to ${to}: ${trips} trips in ${ROAD_HOURS} h, first load ${Math.round(tick / TICKS_PER_SEC / 60)} min, ended with ${carts} carts`,
  };
}

/**
 * W-198 what a cart is worth: this many handcarts from the start, none bought, 8 h, going each time to whichever town a road away
 * pays best for what he can buy, by W-196's shortages and gluts. On one road a market takes about 3 loads a trip whatever he
 * brings (`traderRun`'s flat rows): more carts pay only for a trader who goes where the price is.
 */
export function traderRoads(carts: number): PathRow {
  const towns = new Map<string, ReturnType<typeof market>>(), of = (t: string) => towns.get(t) ?? (towns.set(t, market(t)), towns.get(t)!);
  const T0 = Date.UTC(2031, 0, 6, 8), road = 14 * 60_000, room = carts * CART_LOADS.handcart;
  let here = of(HOME), now = 0, coin = 300, sold = 0, trips = 0, loads = 0;
  const rule = (m: ReturnType<typeof market>, res: string) => offerRule(m.town, { res: res as NpcGoodRule['res'], swing: npcSwings(m.town, T0 + now).find((w) => w.res === res)?.kind })!;
  while (now < ROAD_HOURS * HOUR) {
    let best: { to: ReturnType<typeof market>; plan: { res: string; n: number; cost: number }[]; net: number } | null = null;
    here.go(now);
    for (const id of [...worldRegion(here.town)!.adj].sort()) {
      const to = of(id), plan: { res: string; n: number; cost: number }[] = [];
      to.go(now);
      let left = room, spent = 0, net = 0;
      for (;;) {
        let top: { res: string; n: number; cost: number; net: number } | null = null;
        for (const [res, s] of here.goods) {
          const o = to.goods.get(res);
          if (!o || plan.some((p) => p.res === res)) continue;
          for (let n = CARRY; n <= left * CARRY && n <= s.stock; n += CARRY) {
            const cost = costOf(rule(here, res), s.stock, n), gain = payFor(rule(to, res), o.stock, n, to.purse) - cost;
            if (cost > coin - spent) break;
            if (gain > (top?.net ?? 0)) top = { res, n, cost, net: gain };
          }
        }
        if (!top) break;
        plan.push(top);
        spent += top.cost;
        net += top.net;
        left -= top.n / CARRY;
      }
      if (net > (best?.net ?? 0)) best = { to, plan, net };
    }
    const to = best?.to ?? of([...worldRegion(here.town)!.adj].sort()[trips % worldRegion(here.town)!.adj.length]);
    for (const p of best?.plan ?? []) {
      coin -= p.cost;
      here.goods.get(p.res)!.stock -= p.n;
      here.pay(-p.cost);
    }
    now += road;
    to.go(now);
    for (const p of best?.plan ?? []) {
      const o = to.goods.get(p.res)!, pay = payFor(rule(to, p.res), o.stock, p.n, to.purse);
      coin += pay;
      sold += pay;
      o.stock += p.n;
      to.pay(pay);
      loads += p.n / CARRY;
    }
    trips++;
    here = to;
  }
  const h = now / HOUR;
  return { path: 'trader', setup: `${carts} cart${carts > 1 ? 's' : ''}, going where it pays`, level: 1, pts: ((sold * FAVOUR_EARN.sold) + loads * FAVOUR_EARN.carried) / h, coin: (coin - 300) / h, line: `${trips} trips, ${(loads / trips).toFixed(1)} loads a trip of ${room}; market alone, coin/h is profit` };
}

/** Every path, at the start and grown. */
export function pathRows(): PathRow[] {
  return [
    ...FAMILY_IDS.map((f) => warriorRun(f, false)),
    warriorRun('line', true),
    builderRun(false),
    builderRun(true),
    builderBoard(false),
    builderBoard(true),
    traderRun(false),
    traderRun(true),
    ...[1, 2, 4].map(traderRoads),
  ];
}

export function pathBalanceReport(): string {
  const rows = pathRows(), pad = (s: string | number, n: number) => String(s).padEnd(n);
  const out = [
    `== Paths played (W-203): warrior and builder ${PLAY_MIN} game min on the sim, trader ${ROAD_HOURS} game h on the market rules; an hour's pay, tasks and stories not counted ==`,
    `${pad('path', 8)} ${pad('setup', 34)} ${pad('level pts/h', 12)} ${pad('coin/h', 8)} ${pad('end level', 10)} what happened`,
  ];
  for (const r of rows) out.push(`${pad(PATHS[r.path].name, 8)} ${pad(r.setup, 34)} ${pad(Math.round(r.pts), 12)} ${pad(Math.round(r.coin), 8)} ${pad(`L${r.level}`, 10)} ${r.line}`);
  return out.join('\n');
}

