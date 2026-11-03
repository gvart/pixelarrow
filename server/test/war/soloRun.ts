/**
 * The seeded solo run's kit (W-93, W-184): a player's whole run on the real sim and the real D1 rules, from the start API on,
 * nobody else in the world. A small bot gives the orders a player would; the clock is game time (ticks, the border's travel
 * time). Used by soloRuns.test.ts (no boards) and townBoardRuns.test.ts (the owner's goal).
 */
import { env } from 'cloudflare:test';
import { expect } from 'vitest';
import { api, devLogin } from '../helpers';
import { good } from './goods';
import { storyOf } from '../../../src/data/warStories';
import { NET_VERSION } from '../../../src/war/net/protocol';
import { costOf, npcGoods, npcSpot, payFor, type NpcView } from '../../../src/war/net/npcMarket';
import { perLoad } from '../../../src/war/sim/holders';
import type { GoodKind, WarPerson } from '../../../src/war/types';
import { WAR_SEASON } from '../../../src/war/world/alliances';
import { edge } from '../../../src/war/world/graph';
import type { PathId, StartFamily } from '../../../src/war/world/start';
import { room as freeLoads } from '../../src/war/cargo';
import { addFavour, builtFavour, favourTick, getFavour, storyFavour } from '../../src/war/favour';
import { boardDeeds, boardLabour } from '../../src/war/townBoard';
import { batch, ensureHolder, goodsOf, putStmt, strongroom } from '../../src/war/holders';
import { npcDeal } from '../../src/war/npcMarket';
import { applyFight, claimForJoin } from '../../src/war/persons';
import { warRegion } from '../../src/war/regions';
import { WarRoom } from '../../src/war/room';
import { pathOf } from '../../src/war/start';
import { cargoFactor } from '../../src/war/world/world';

export const DB = () => env.DB!;
export const post = (token: string, path: string, json: unknown) => api(`/api/war/start${path}`, { method: 'POST', token, json });
export const START = Date.UTC(2031, 0, 6, 8);
const FOE_R = WAR_SEASON.foeRadius;
/** Print each note as it happens (a long run's progress while tuning). */
const WATCH = false;

/** A squad and its cart stand this far around the point they were sent to. */
const FORMATION = 5;

/** A player's whole run: his clock, rooms and what happened. */
export class Run {
  now = START;
  log: string[] = [];
  room!: WarRoom;
  rooms = new Map<string, WarRoom>();
  persons: WarPerson[] = [];
  /** Men who stopped answering a move order here: the road clears them on the next crossing. */
  stuck = new Set<number>();
  /** Every man ever counted in `stuck`: the runs expect none (the sim's crew fix: tests/war/crewWalk.test.ts). */
  stuckEver: string[] = [];
  pending: Promise<unknown> = Promise.resolve();
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
    const pz = r.peace;
    if (pz) for (const [pid, n] of builtFavour(this.room, [...pz.labour.map((l) => [l.pid, l.secs] as const), ...pz.works.flatMap((w) => Object.entries(w.by).map(([p, secs]) => [Number(p), secs] as const)), ...(pz.townJobs ?? []).map((j) => [j.pid, j.secs] as const)])) await addFavour(env, pid, n, 'built', this.now);
    if (pz?.townJobs) await boardLabour(env, pz.townJobs);
    // W-185: the region DO's books for a fighting run: his fights in D1 (men lost, the level), the lairs cleared, what his Kills asked
    for (const f of r.fights) await applyFight(DB(), f.id, this.room.region.id, f.report, this.now);
    favourTick(env, this.room, (_w, go) => void (this.pending = this.pending.then(go)));
    if (r.wild.length) await boardDeeds(env, this.pid, this.room.region.id, r.wild);
    await this.pending;
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
        if (p && Math.hypot(u.x - p[0], u.y - p[1]) < 0.5 && Math.hypot(u.x - x, u.y - y) > r + FORMATION) {
          this.stuck.add(u.id);
          this.stuckEver.push(`${this.room.region.id} ${u.cls} at ${Math.round(u.x)},${Math.round(u.y)}, going to ${Math.round(x)},${Math.round(y)}`);
        }
      }
      if (this.far(x, y) > r + FORMATION) for (const q of this.squads()) this.room.sim.order({ kind: 'move', squad: q, x: Math.round(x), y: Math.round(y) });
    }
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
    this.room.join(this.pid, { t: 'join', v: NET_VERSION, region: to, playerId: this.pid, team: 0, squads: [] }, []);
    this.room.setPath(this.pid, await pathOf(DB(), this.pid));
    await this.tick();
    this.crewCarts();
    await this.tick();
  }
}

/** A player through the real start API, on the field at home, his story begun. */
export async function begin(id: number, path: PathId, alliance: number, home: string, family: StartFamily = 'line'): Promise<Run> {
  const me = await devLogin(id);
  expect((await post(me.token, '/alliance', { alliance })).status).toBe(200);
  expect((await post(me.token, '/home', { region: home })).status).toBe(200);
  expect((await post(me.token, '/path', path === 'warrior' ? { path, family } : { path })).status).toBe(200);
  const run = new Run(me.playerId, me.token, path, home);
  const all = (await (await api('/api/war/roster', { token: me.token })).json<{ persons: { id: string; cls: string; state: string }[] }>()).persons.filter((p) => p.state === 'active');
  const groups = [all.filter((p) => !p.cls.startsWith('civ_')), all.filter((p) => p.cls.startsWith('civ_'))].map((g) => g.map((p) => p.id)).filter((g) => g.length);
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
export async function walkIn(run: Run) {
  const story = storyOf(run.home, run.path)!, first = story.steps[0].trigger;
  await run.walk(story.giver.at[0], story.giver.at[1]);
  if (first.kind === 'reach') await run.walk(first.at[0], first.at[1]);
}

/** The wood node nearest a point that nobody guards. */
export function nodeNear(run: Run, res: string, x: number, y: number) {
  return run.room.sim.resourceNodes().filter((n) => n.res === res && n.amount > 5 && !n.guarded).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
}
/** What his team's stores near the town hold. */
export const stored = (run: Run, res: string) => (run.room.sim.snapshot().buildings ?? []).filter((b) => b.team === 0 && b.goods).reduce((a, b) => a + (b.goods?.[res as GoodKind] ?? 0), 0);
export const storeWith = (run: Run, res: string) => (run.room.sim.snapshot().buildings ?? []).filter((b) => b.team === 0 && (b.goods?.[res as GoodKind] ?? 0) >= 5).sort((a, b) => (b.goods?.[res as GoodKind] ?? 0) - (a.goods?.[res as GoodKind] ?? 0))[0];

/** What to carry from `v` to `w` for this coin and these free loads: the goods with most profit first; [] when none pays. */
export function cargoFor(v: NpcView, w: NpcView, coin: number, loads: number): { res: string; n: number; net: number; pay: number }[] {
  const out: { res: string; n: number; net: number; pay: number }[] = [];
  for (;;) {
    let best: { res: string; n: number; net: number; cost: number; pay: number } | null = null;
    for (const g of npcGoods(v.town)) {
      const h = npcGoods(w.town).find((x) => x.res === g.res);
      const sv = v.goods.find((x) => x.res === g.res), sw = w.goods.find((x) => x.res === g.res);
      if (!h || !sv || !sw || out.some((o) => o.res === g.res)) continue;
      for (let n = 10; n <= Math.floor(loads * perLoad(g.res)) && n <= sv.stock; n += 10) {
        const cost = costOf(g, sv.stock, n), spent = out.reduce((a, o) => a + o.pay, 0), pay = Math.min(payFor(h, sw.stock, n, w.purse - spent), w.purse - spent), net = pay - cost;
        if (cost > coin) break;
        if (net > 0 && (!best || net > best.net)) best = { res: g.res, n, net, cost, pay };
      }
    }
    if (!best) return out;
    out.push(best);
    coin -= best.cost;
    loads -= best.n / perLoad(best.res as GoodKind);
  }
}

export async function chooseStep(run: Run, option: string) {
  run.room.storyChoose(run.pid, option);
  await run.tick();
}
