/**
 * W-184..W-193 the owner's goal as a test: "low player activity doesn't stop you from playing". Seeded solo runs on all three
 * paths, nobody else in the world, 8 game hours: the bot plays only what the town boards offer, as a player would, on the real
 * sim and D1 rules. Every sample of the run: at least 3 contracts on offer within 2 hops; never a moment with nothing to do; the
 * same work at the same town never runs over an hour. The lists come from the data; a retune moves the numbers, not the script.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { NPC_CARTS, NPC_HIRE } from '../../../src/data/warNpcTowns';
import { storyOf } from '../../../src/data/warStories';
import { BOARD } from '../../../src/data/warTownBoard';
import { ENCOUNTERS, ROBBERS } from '../../../src/data/warEncounters';
import { encStepOf } from '../../../src/war/sim/encounters';
import { armyStrength, bandStrength, PATH_KIND, ratingOf, type BoardJob, type BoardLine, type BoardView } from '../../../src/war/net/townBoard';
import { WORK_R } from '../../../src/war/net/works';
import { depthOf } from '../../../src/war/sim/depth';
import { perLoad } from '../../../src/war/sim/holders';
import type { GoodKind } from '../../../src/war/types';
import { hops, WORLD_IDS, worldRegion } from '../../../src/war/world/graph';
import { cartCap, soldierCap, workerCap, type PathId } from '../../../src/war/world/start';
import { room as freeLoads } from '../../src/war/cargo';
import { FAVOUR_EARN, getFavour } from '../../src/war/favour';
import { npcView } from '../../src/war/npcMarket';
import { warRegion } from '../../src/war/regions';
import { boardOrder, boardView } from '../../src/war/townBoard';
import { begin, cargoFor, DB, ROAD_ONLY, type Run } from './soloRun';

const HOURS = 8;
const MINS = HOURS * 60;
/**
 * Own-kind pay under this share of the rested pay: he takes the road to the next town instead. A warrior weighs it: a Kill here
 * takes minutes and the road a quarter of an hour, so a tired board still beats a fresh one a road away (W-195).
 */
const WALK_AT: Record<PathId, number> = { warrior: 0.28, builder: 0.45, trader: 0.45 };
/** He leaves a place after this much of one work there, and takes no work that would hold him longer. */
const STAY = 40;
/** Minutes a road takes him, near enough, in choosing what to do. */
const ROAD = 14;
/** A run on word of a shortage must clear this much coin to be worth going out of his way. */
const MARKET_NET = 15;
/** A haul this long already (minutes) and he breaks it at the town between, if its board has a small job. */
const BREAK_AT = 25;

interface Tally {
  /** Fewest lines on offer within two hops at any sample. */
  minOffers: number; minOwn: number; samples: number;
  /** When he reached each level (game minutes). */
  levelAt: Record<number, number>;
  /** Longest stretch of one work at one town, of one kind anywhere (minutes). */
  longestSame: number; longestSameWhat: string; longestKind: number;
  /** Minutes in the stretch from L3 to L4, what he did in it. */
  mix: Record<string, number>; l3l4: Record<string, number>;
  jobs: number; coin: number; idle: number; towns: Set<string>;
  /** Robbers he fought; robbers he paid. */
  ambushes: number; tolls: number;
}

function fresh(): Tally {
  return { minOffers: Infinity, minOwn: Infinity, samples: 0, levelAt: {}, longestSame: 0, longestSameWhat: '', longestKind: 0, mix: {}, l3l4: {}, jobs: 0, coin: 0, idle: 0, towns: new Set(), ambushes: 0, tolls: 0 };
}

/** A player, the boards his only guide. */
class Bot {
  t = fresh();
  lastSample = -99;
  same = { what: '', from: 0 };
  /** The kind of work he is at now, since when he has been at it (no border ends it), and since the last tally. */
  kind = { now: '', from: 0, since: 0, depth: 0, level: 1 };
  seen = new Map<string, number>();
  trips = 0;
  constructor(readonly r: Run, readonly path: PathId) {}

  chainOver = () => !storyOf(this.r.room.region.id, this.path);
  view = async (): Promise<BoardView> => (await boardOrder(env, this.r.room, this.r.pid, { op: 'view' }, this.r.now, this.chainOver())).view;
  army = () => this.r.room.armyOf(this.r.pid);

  async levels(): Promise<number> {
    const f = await getFavour(env, this.r.pid), m = this.r.mins();
    for (let l = 2; l <= f.level; l++) this.t.levelAt[l] ??= Math.round(m);
    this.kind.level = f.level;
    return f.level;
  }

  /** At every sample: what is on offer within two hops of where he stands, he reading each board as himself. */
  async sample() {
    const m = this.r.mins();
    if (m - this.lastSample < 10) return;
    this.lastSample = m;
    // his men as they will stand once rested: a fight he can't take this minute is still his to take
    const here = this.r.room.region.id, men = this.army().map((m) => ({ ...m, hp: 1 }));
    let offers = 0, own = 0;
    for (const town of WORLD_IDS.filter((t) => hops(here, t) <= 2)) {
      const v = await boardView(env, this.r.pid, town, men, this.r.now);
      const open = v.lines.filter((l) => !l.held && (l.pay > 0 || l.gain > 0));
      offers += open.length;
      own += open.filter((l) => l.kind === PATH_KIND[this.path] && l.rating !== 'deadly').length;
    }
    this.t.samples++;
    this.t.minOffers = Math.min(this.t.minOffers, offers);
    this.t.minOwn = Math.min(this.t.minOwn, own);
  }

  /** He turns to this kind of work: the minutes so far go to the last, and a stretch of one kind ends only when the kind changes. */
  private turnTo(kind: string) {
    const k = this.kind, m = this.r.mins();
    if (k.now) {
      this.t.mix[k.now] = (this.t.mix[k.now] ?? 0) + (m - k.since);
      if (k.level === 3) this.t.l3l4[k.now] = (this.t.l3l4[k.now] ?? 0) + (m - k.since);
      this.t.longestKind = Math.max(this.t.longestKind, m - k.from);
    }
    if (kind !== k.now) k.from = m;
    k.now = kind;
    k.since = m;
  }

  /** One stretch of work, for the log. Work inside work (robbers on the road under a load) is its own kind while it lasts. */
  async doing(kind: string, go: () => Promise<void>) {
    const what = `${kind}@${this.r.room.region.id}`, from = this.r.mins(), outer = this.kind.now;
    await this.levels();
    if (what !== this.same.what) this.same = { what, from };
    this.turnTo(kind);
    this.kind.depth++;
    await go();
    this.kind.depth--;
    this.turnTo(this.kind.depth ? outer : kind);
    const m = this.r.mins();
    if (m - this.same.from > this.t.longestSame) (this.t.longestSame = m - this.same.from), (this.t.longestSameWhat = what);
    await this.levels();
    await this.sample();
  }

  /** He buys food when the packs run low: men fight and walk better fed (W-60). */
  async feed() {
    const fed = this.r.carried('food') + this.r.carried('ration');
    if (fed >= this.r.men().length * 2) return;
    await this.r.deal({ op: 'buy', res: 'food', n: Math.min(30, this.r.roomFor('food')) }).catch(() => null);
  }

  /** What the road ahead pays to carry, bought before he sets off (a trader's own margin on top of the board's). */
  async carryOwn(to: string) {
    if (this.path !== 'trader') return;
    const here = this.r.room.region.id, v = await npcView(DB(), here, this.r.now), w = await npcView(DB(), to, this.r.now);
    const plan = cargoFor(v, w, Math.floor(await this.r.coin()) - 100, Math.max(0, freeLoads(this.r.room.npcSlots(this.r.pid)) - 1));
    for (const p of plan) await this.r.deal({ op: 'buy', res: p.res as GoodKind, n: p.n }).catch(() => null);
  }

  /** Over a border, waiting out any beast in the way (W-87: nobody leaves with a foe on him). */
  async go(to: string): Promise<void> {
    // a far load goes by the town between
    const here = this.r.room.region.id, next = hops(here, to) <= 1 ? to : [...worldRegion(here)!.adj].filter((t) => hops(t, to) === hops(here, to) - 1).sort()[0];
    await this.carryOwn(next);
    let why = '';
    for (let i = 0; i < 40; i++) {
      try {
        await this.r.cross(next);
        this.trips++;
        this.seen.set(next, this.r.mins());
        this.same = { what: '', from: this.r.mins() }; // a road walked: the work at one town ends here; the kind of work goes on
        this.t.towns.add(next);
        await this.sample();
        await this.road();
        await this.r.toTown();
        if (this.path === 'trader') await this.r.sellAll();
      } catch (e) {
        if (!String(e).includes('depart')) throw e;
        why = String(e);
        await this.home();
        await this.r.until(() => false, 100);
        continue;
      }
      if (next !== to) {
        await this.smallJob();
        await this.go(to);
      }
      return;
    }
    throw new Error(`stuck leaving ${this.r.room.region.id} for ${to}: ${why}; men ${JSON.stringify(this.r.men().map((u) => [u.cls, Math.round(u.x), Math.round(u.y), u.state, u.down ?? false, u.wounded ?? false]))}`);
  }

  /** A turn at a town's small works, its coin and hands glad of his men's backs: what a long haul is broken with. */
  async smallJob(): Promise<boolean> {
    const r = this.r;
    if (this.path !== 'trader' || this.kind.now !== 'trade' || r.mins() - this.kind.from < BREAK_AT) return false;
    const lines = (await this.view()).lines.filter((l) => !l.held), hands = Math.max(1, r.men().length);
    // a repair; failing that, once the hauls have run long, the smallest building his men can finish, or a band they can beat
    const line = lines.find((l) => l.kind === 'build' && l.size === 'repair')
      ?? (r.mins() - this.kind.from < STAY ? undefined : lines.filter((l) => l.kind === 'build' && (l.labour ?? 0) / hands <= STAY * 60).sort((a, b) => (a.labour ?? 0) - (b.labour ?? 0))[0] ?? lines.find((l) => l.kind === 'kill' && l.rating === 'easy'));
    if (!line) return false;
    const held = await boardOrder(env, r.room, r.pid, { op: 'take', entry: line.id }, r.now, this.chainOver()).catch(() => null);
    if (!held) return false;
    await this.fulfil(held.view.jobs.at(-1)!);
    return true;
  }

  /** W-197: a fight the road sprang on him: his guards turn and clear it. It is its own work while it lasts. */
  async road() {
    const r = this.r;
    let step = encStepOf(ENCOUNTERS, r.encounter);
    // W-197: robbers name their price: he fights only what his guards can take, or he pays them off
    if (step?.id === 'demand') {
      const fighters = this.army().filter((m) => !m.cls.startsWith('civ_')), depth = depthOf(r.room.region);
      const word = ratingOf(armyStrength(fighters, this.kind.level), bandStrength({ kind: 'bandit', count: ROBBERS.count + Math.floor(depth / 2) }, depth));
      const fight = word === 'easy'; // a fair fight is a coin toss with all he owns on it
      r.room.encounterChoose(r.pid, fight ? 'fight' : 'pay');
      this.t[fight ? 'ambushes' : 'tolls']++;
      await r.tick();
      step = encStepOf(ENCOUNTERS, r.encounter);
    }
    if (!step || step.trigger.kind !== 'clear') return;
    const o = r.encounter!.open!, band = () => r.room.sim.snapshot().lairs?.find((l) => Math.hypot(l.x - o.tx, l.y - o.ty) < 1 && l.state !== 'cleared');
    await this.doing('ambush', async () => {
      await r.until(() => !!band(), 50);
      await this.beat(band);
    });
  }

  /** His guards at a band until it falls or they are down; then everyone on his feet. */
  async beat(band: () => { squad: number } | undefined) {
    const r = this.r, b = band(), q = r.pull();
    if (b && q !== undefined) {
      r.room.sim.order({ kind: 'attack', squad: q, target: b.squad });
      await r.until(() => !band() || !r.men().some((u) => !u.cls.startsWith('civ_') && !u.wounded), 1800);
    }
    await r.until(() => !r.men().some((u) => u.wounded), 600);
  }

  /**
   * W-196 his own money on the road: the best load for a town a road away, where word of a shortage or a glut makes it worth
   * going. Level for his time, as he reads it: what it sells for, what it carries. null: nothing's up that beats the board.
   */
  async marketRun(against: number): Promise<string | null> {
    if (this.path !== 'trader' || (this.kind.now === 'market' && this.r.mins() - this.kind.from >= STAY)) return null; // enough of his own money: the board again
    const r = this.r, here = r.room.region.id, v = await npcView(DB(), here, r.now), coin = Math.floor(await r.coin()) - 20, loads = Math.max(0, freeLoads(r.room.npcSlots(r.pid)) - 1);
    let best: string | null = null, bestRate = against;
    for (const to of [...worldRegion(here)!.adj].sort()) {
      if (!warRegion(to) || depthOf(warRegion(to)!) > this.deepest()) continue;
      const w = await npcView(DB(), to, r.now), plan = cargoFor(v, w, coin, loads);
      if (plan.reduce((a, p) => a + p.net, 0) < MARKET_NET) continue;
      const swung = plan.some((p) => v.goods.find((g) => g.res === p.res)?.swing === 'glut' || w.goods.find((g) => g.res === p.res)?.swing === 'short');
      if (!swung) continue;
      const rate = (plan.reduce((a, p) => a + p.pay, 0) * FAVOUR_EARN.sold + plan.reduce((a, p) => a + p.n / perLoad(p.res as GoodKind), 0) * FAVOUR_EARN.carried) / ROAD;
      if (rate > bestRate) (bestRate = rate), (best = to);
    }
    return best;
  }

  /** The next town: the one he saw longest ago, up to a depth his men can stand. */
  nextTown(): string {
    const here = this.r.room.region.id, adj = [...worldRegion(here)!.adj].filter((t) => warRegion(t) && depthOf(warRegion(t)!) <= this.deepest());
    return adj.sort((a, b) => (this.seen.get(a) ?? -1) - (this.seen.get(b) ?? -1) || a.localeCompare(b))[0] ?? this.r.home;
  }
  deepest = () => (this.path === 'warrior' && this.army().length >= 10 ? 2 : 1);

  async spend() {
    // a builder's hands and a trader's carts and hands from what the boards pay; a warrior's two workers carry his food
    const coin = await this.r.coin(), workers = this.r.men().filter((u) => u.cls.startsWith('civ_')).length;
    if (this.path === 'trader' && this.r.room.cartsOf(this.r.pid).length < Math.min(2, cartCap('trader')) && coin >= NPC_CARTS.handcart + 100) {
      await this.r.deal({ op: 'cart', cart: 'handcart' }).catch(() => null);
      this.r.crewCarts();
    } else if (workers < workerCap(this.path) && this.path !== 'warrior' && coin >= NPC_HIRE.civ_forager + 80) await this.r.deal({ op: 'hire', cls: 'civ_forager' }).catch(() => null);
  }

  /** A warrior's army grows only by the souls he claims (W-60). */
  claimed = new Set<number>();
  async souls() {
    if (this.path === 'builder' || this.army().filter((m) => !m.cls.startsWith('civ_')).length >= soldierCap(this.path)) return;
    const r = this.r, soul = (r.room.sim.snapshot().souls ?? []).find((s) => !this.claimed.has(s.id) && !s.team && !s.claim);
    const q = r.pull();
    if (!soul || q === undefined) return;
    this.claimed.add(soul.id);
    r.room.sim.order({ kind: 'claimSoul', squad: q, soul: soul.id });
    const before = r.men().length;
    await this.doing('souls', async () => {
      await r.until(() => r.men().length > before || !(r.room.sim.snapshot().souls ?? []).some((s) => s.id === soul.id), 900);
      await this.home();
    });
  }

  async fight(job: BoardJob) {
    const r = this.r, snap = () => r.room.sim.snapshot(), lair = () => snap().lairs?.find((l) => Math.hypot(l.x - job.x!, l.y - job.y!) < 1 && l.state !== 'cleared');
    for (let tries = 0; tries < 3; tries++) {
      const b = lair();
      if (!b) break;
      // the order walks them there and fights: men on a plain move don't strike back. His workers stay at the town.
      for (const q of r.squads()) if (q === r.pull()) r.room.sim.order({ kind: 'attack', squad: q, target: b.squad });
      const fit = () => r.men().filter((u) => !u.cls.startsWith('civ_') && !u.wounded);
      await r.until(() => !lair() || !fit().length, 3000);
      if (!lair()) return true;
      await this.home(); // beaten back: he breathes at the town, then goes again
      await r.until(() => false, 600);
    }
    return !lair();
  }

  async work(job: BoardJob) {
    const r = this.r;
    await r.walk(job.x!, job.y!, WORK_R - 6, 2500);
    const left = Math.max(0, job.need - job.done), men = Math.max(1, r.men().length);
    await r.until(() => false, Math.ceil(((left / men) * 10) / 1) + 150);
  }

  /** Back to the town with everyone on his feet: a man down gets up when the fighting stops (W-79); nobody is left lying. */
  async home() {
    const r = this.r;
    await r.until(() => !r.men().some((u) => u.wounded), 2400);
    r.stuck.clear();
    await r.toTown();
    if (!r.room.npcSlots(r.pid).length && r.men().length) {
      r.stuck.clear();
      await r.toTown();
    }
  }

  /** A contract he holds, carried through to the money. */
  async fulfil(job: BoardJob) {
    const r = this.r, town = job.town, order = (m: Parameters<typeof boardOrder>[3]) => boardOrder(env, r.room, r.pid, m, r.now, this.chainOver());
    await this.doing(job.kind, async () => {
      if (job.kind === 'kill') {
        if (!(await this.fight(job))) {
          await this.home();
          await order({ op: 'drop', job: job.id });
        }
      } else if (job.kind === 'build') await this.work(job);
      else {
        await this.go(job.toTown!);
        await order({ op: 'deliver', job: job.id }).catch(() => null);
        await this.feed();
        await this.smallJob();
        await this.go(town);
      }
      await this.home();
      await r.tick();
      const held = (await this.view()).jobs.find((j) => j.id === job.id);
      if (held?.state === 'ready') {
        const got = await order({ op: 'handin', job: job.id });
        this.t.jobs++;
        this.t.coin += got.paid?.coin ?? 0;
      } else if (held && job.kind !== 'build') await order({ op: 'drop', job: job.id }).catch(() => null);
    });
  }

  /** The best line for him here: his own kind's first, a fight he can win, the most level for the time. */
  choose(lines: readonly BoardLine[]): BoardLine | null {
    const hands = Math.max(1, this.r.men().length), can = lines.filter((l) => !l.held && (l.kind !== 'build' || (l.labour ?? 0) / hands <= STAY * 60) && (l.kind !== 'kill' || l.rating === 'easy' || (l.rating === 'fair' && this.path !== 'trader')) && (l.kind !== 'trade' || ((l.loads ?? 0) <= freeLoads(this.r.room.npcSlots(this.r.pid)))));
    const mine = can.filter((l) => l.kind === PATH_KIND[this.path]);
    const rated = (l: BoardLine) => l.gain / (l.kind === 'build' ? (l.labour ?? 1) : l.kind === 'trade' ? (l.loads === BOARD.trade[0].loads ? 1 : 2) * 900 : 600);
    return [...mine].sort((a, b) => rated(b) - rated(a))[0] ?? can.sort((a, b) => b.gain - a.gain)[0] ?? null;
  }

  /** Hurt men stay at the town until they are well enough to go on (W-194); a whole group down comes back when its wound heals. */
  async rest() {
    const r = this.r, well = () => r.men().filter((u) => !u.cls.startsWith('civ_')).every((u) => u.hp >= u.maxHp * 0.8);
    if (well()) return;
    await this.doing('rest', async () => void (await r.until(well, 3000)));
  }

  async run() {
    const r = this.r;
    await r.toTown();
    while (r.mins() < MINS) {
      await this.rest();
      await this.souls();
      // an hour's the most he stays at one work in one place: he walks on (the road is open, the next board fresh)
      if (r.mins() - this.same.from > STAY && this.same.what.endsWith(`@${r.room.region.id}`)) {
        await this.doing('road', () => this.go(this.nextTown()));
        continue;
      }
      const v = await this.view();
      await this.spend();
      await this.feed();
      const line = this.choose(v.lines);
      // a contract just done, he looks to his own money if word of a shortage or a glut is good; else the better of the two
      const toMarket = await this.marketRun(this.kind.now === 'trade' || !line || line.kind !== 'trade' ? 0 : line.gain / (hops(r.room.region.id, line.toTown!) * 2 * ROAD));
      if (toMarket) {
        await this.doing('market', () => this.go(toMarket));
        continue;
      }
      // no word worth following after a long haul: a small job before the next
      if (await this.smallJob()) continue;
      if (!line) {
        this.t.idle++;
        await this.doing('road', () => this.go(this.nextTown()));
        continue;
      }
      // a tired board: its pay has fallen off with his repeats, so he walks on and works where he is new (W-189)
      const best = line.points > 0 ? line.gain / (line.points * (line.kind === PATH_KIND[this.path] ? 1 : BOARD.offPathPoints)) : 1;
      if (best < WALK_AT[this.path] && line.size !== 'errand') {
        await this.doing('road', () => this.go(this.nextTown()));
        continue;
      }
      const after = await boardOrder(env, r.room, r.pid, { op: 'take', entry: line.id }, r.now, this.chainOver()).catch((e: { code?: string }) => {
        if (['no_room', 'sold_out'].includes(e.code ?? '')) return null;
        throw e;
      });
      if (!after) {
        await this.doing('road', () => this.go(this.nextTown()));
        continue;
      }
      await this.fulfil(after.view.jobs.at(-1)!);
    }
    await this.levels();
  }
}

/** A run's line for the desk's report. */
function report(path: PathId, b: Bot, ms: number) {
  const f = b.t, round = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v)]));
  console.log(`RUN ${path}: levels ${JSON.stringify(f.levelAt)}, ${f.jobs} contracts, ${f.coin} coin, ${f.towns.size} towns, ${b.trips} crossings, ${f.ambushes} fought, ${f.tolls} paid, offers min ${f.minOffers} (own ${f.minOwn}) over ${f.samples} samples, longest same ${Math.round(f.longestSame)} min (${f.longestSameWhat}), longest kind ${Math.round(f.longestKind)} min, idle ${f.idle}, men ${b.army().length}, stuck ${b.r.stuckEver.length}, mix ${JSON.stringify(round(f.mix))}, L3-L4 ${JSON.stringify(round(f.l3l4))}, wall ${Math.round(ms / 1000)} s`);
}

async function solo(id: number, path: PathId) {
  // nobody else in the world: not the last run's dealings at the town markets either, nor a clock that ran 8 hours past this start
  await DB().batch(['war_npc_towns', 'war_npc_stock', 'war_town_jobs', 'war_town_heat'].map((t) => DB().prepare(`DELETE FROM ${t}`)));
  const r = await begin(id, path, 0, 'dodona');
  if (path === 'trader') {
    r.room.giveCart(r.pid, 'handcart');
    r.meets = true; // W-197: what a laden train meets; the others carry nothing a robber wants
    r.room.startEncounters(r.pid, ROAD_ONLY);
  }
  const b = new Bot(r, path), t0 = Date.now();
  await b.run();
  report(path, b, Date.now() - t0);
  const f = b.t;
  expect(r.mins()).toBeGreaterThanOrEqual(MINS);
  expect(f.minOffers, 'at least 69 lines within 2 hops, always').toBeGreaterThanOrEqual(69);
  expect(f.minOwn, 'and work of his own path among them').toBeGreaterThanOrEqual(1);
  expect(f.idle, 'never with nothing to do').toBe(0);
  expect(f.longestSame, `no filler over an hour: ${f.longestSameWhat}`).toBeLessThanOrEqual(60);
  expect(f.longestKind, 'no stretch of one kind of work over an hour, borders or not').toBeLessThanOrEqual(60);
  expect(f.jobs).toBeGreaterThanOrEqual(6);
  expect(f.levelAt[2]).toBeDefined();
  return b;
}

describe('W-184 nobody else in the world: the boards keep every path playing for 8 game hours', () => {
  it('a warrior', async () => {
    const { t } = await solo(9901, 'warrior');
    expect(t.levelAt[4], 'W-195 L4 comes neither too fast nor too slow').toBeGreaterThanOrEqual(150);
    expect(t.levelAt[4]).toBeLessThanOrEqual(240);
    expect(t.mix.road, 'W-195 most of his time is the fighting, not the road').toBeLessThanOrEqual(MINS * 0.4);
  }, 3_600_000);
  it('a builder', async () => {
    const { t } = await solo(9902, 'builder');
    expect(t.levelAt[4], 'no slower than before W-195').toBeLessThanOrEqual(158);
    expect(t.levelAt[4] - t.levelAt[3]).toBeLessThanOrEqual(73);
  }, 3_600_000);
  it('a trader', async () => {
    const { t } = await solo(9903, 'trader');
    expect(t.levelAt[4], 'no slower than before W-196').toBeLessThanOrEqual(306);
  }, 3_600_000);
});
