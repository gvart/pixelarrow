/**
 * ST-04: the sim train 2 replay fixtures (tests/fixtures/replay-v2*.json).
 *
 * Each fixture battle is a client playing a scripted battle with today's sim
 * (SIM_VERSION 2): the setup the server would build, the human's order log
 * as the client submits it (attackSubmission: side 0 only, the bots' orders
 * come back from the seed), the outcome, Battle.hash() and a hash every 100
 * ticks. The same files are replayed in Node (here), in workerd
 * (server/test/trainReplay.test.ts) and in Chromium and WebKit
 * (scripts/replay-hash.mjs), so the three engines are held to one hash.
 *
 * Coverage: face, focus, orb, feint, every signature active, the Standard
 * (raised and lost), cohesion and army break, every doctrine on the ladder
 * (holdField) and on the war map (may retreat), and, offline only, field
 * works with a band captain (replay-v2-offline.json).
 *
 * The fixtures are regenerated only on purpose (ADR-0001), and the diff is
 * reviewed:  RECORD_REPLAY_V2=1 npx vitest run tests/trainReplay.test.ts
 * Without the variable this test plays every script again and fails on any
 * change, so a rule change cannot slip past them.
 */
import { describe, expect, it } from 'vitest';
import { Battle, RAISE_STANDARD } from '../src/sim/battle';
import { SIM_VERSION } from '../src/sim/version';
import { armySpec } from '../src/game/armySpec';
import { classSquad } from '../src/dev/classBalance';
import { ladderFloor, ladderSetup } from '../src/duel/ladder';
import { attackSubmission, onlineBattleSetup } from '../src/online/battle';
import { DEFAULT_FORMATIONS } from '../src/online/rules';
import { generateBattlefield } from '../src/world/battlefield';
import { Rng } from '../src/sim/rng';
import type { ClassId } from '../src/data/classes';
import type { AbilityId, PerkId } from '../src/data/perks';
import type { Hero } from '../src/data/units';
import { DOCTRINE_IDS, type BattleSetup, type DoctrineId, type LoggedOrder, type Order, type SimEvent } from '../src/sim/types';
import online from './fixtures/replay-v2.json';
import offline from './fixtures/replay-v2-offline.json';

// The client tsconfig has no Node types: reach process and node:fs untyped.
const RECORD = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.RECORD_REPLAY_V2 === '1';
/** A hash every CHECKPOINT ticks: when engines disagree, the first differing checkpoint brackets the cause. */
export const CHECKPOINT = 100;
const SIGNATURE: AbilityId[] = ['push', 'bond', 'warcry', 'sunder', 'aimed', 'recharge', 'scythe'];

export interface Coverage {
  /** Order kinds in the submitted log, plus `feint` and `orb` when used. */
  orders: string[];
  /** Ability ids the human side used (event `ability`), plus `standard` when raised. */
  abilities: string[];
  /** Event types seen (sim train 2 ones and retreat). */
  events: string[];
  doctrine: DoctrineId;
  holdField: boolean;
  captain: boolean;
  works: number;
}

export interface RecordedBattle {
  name: string;
  /** Where such a battle is fought: a ladder floor, a war-map attack (both server-verified), or the offline campaign. */
  kind: 'ladder' | 'war' | 'offline';
  setup: BattleSetup;
  orders: LoggedOrder[];
  deployOrders: number;
  winner: 0 | 1 | -1;
  retreated: 0 | 1 | null;
  ticks: number;
  hash: string;
  checkpoints: [number, string][];
  coverage: Coverage;
}

export interface Fixture {
  simVersion: number;
  note: string;
  battles: RecordedBattle[];
}

// ------------------------------------------------------------------ armies

function men(rng: Rng, ids: { nextId: number }, cls: ClassId, n: number, level: number, perks: PerkId[], group: number): Hero[] {
  const out = classSquad(rng, ids, cls, n, level, group);
  for (const h of out) h.perks = [...perks];
  return out;
}

/**
 * The human army of every scripted battle: one group per family's active
 * (abilities.md R3). Group 0 (hoplites, sacred band) carries the Standard and
 * deploys in an orb; group 1 (archers) focuses; group 3 (riders) feints.
 */
function humanTeam(rng: Rng, ids: { nextId: number }, level: number): Hero[] {
  return [
    ...men(rng, ids, 'hoplite', 4, level, ['shield_drill', 'push'], 0), ...men(rng, ids, 'sacred_band', 2, level, ['shield_drill', 'bond'], 0),
    ...men(rng, ids, 'archer', 3, level, ['longshot', 'aimed'], 1),
    ...men(rng, ids, 'gallic', 2, level, ['brawler', 'warcry'], 2), ...men(rng, ids, 'falx', 2, level, ['brawler', 'sunder'], 2),
    ...men(rng, ids, 'companion', 2, level, ['horsemanship', 'recharge'], 3), ...men(rng, ids, 'chariot', 1, level, ['horsemanship', 'scythe'], 3),
  ];
}

function bearer(setup: BattleSetup): BattleSetup {
  setup.armies[0].units[0].stats.standard = true;
  return setup;
}

/** A ladder floor's battle, built as the server builds it (ladderSetup: the floor's doctrine, holdField). */
function ladderBattle(floor: number, seed: number): BattleSetup {
  const f = ladderFloor(floor);
  const level = Math.max(3, Math.min(10, Math.round(f.heroes.reduce((n, h) => n + h.level, 0) / f.heroes.length)));
  const team = humanTeam(new Rng(seed), { nextId: 1 }, level).map((h) => ({ ...h, id: `p${h.id}` }));
  return bearer(ladderSetup(seed, team, [...DEFAULT_FORMATIONS], f));
}

/** An online attack on bot neutrals fighting under `doctrine` (onlineBattleSetup, the bot side's doctrine set: how the old war map built it). */
function warBattle(doctrine: DoctrineId, seed: number): BattleSetup {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const team = humanTeam(rng, ids, 4);
  const neutrals = [...classSquad(rng, ids, 'hoplite', 6, 4, 0), ...classSquad(rng, ids, 'slinger', 4, 4, 1), ...classSquad(rng, ids, 'celt_sword', 4, 4, 2), ...classSquad(rng, ids, 'peltast', 3, 4, 3)];
  const site = { base: 'hills' as const, river: false, coast: false, rocky: true, woods: 0.2 };
  const setup = onlineBattleSetup(seed, { heroes: team, formations: [...DEFAULT_FORMATIONS], bot: false }, { heroes: neutrals, formations: [...DEFAULT_FORMATIONS], bot: true }, site);
  setup.armies[1].doctrine = doctrine;
  return bearer(setup);
}

/** Offline: a lair assault on a garrison (holdField, its own stakes) led by a band captain, the player with works of his own. */
function offlineBattle(seed: number): BattleSetup {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const mine = { ...armySpec(humanTeam(rng, ids, 4), false), works: { stakes: 2, ditch: 1, laager: 1 } };
  const garrison = armySpec([...classSquad(rng, ids, 'hoplite', 8, 4, 0), ...classSquad(rng, ids, 'slinger', 4, 4, 1), ...classSquad(rng, ids, 'gallic', 3, 4, 2)], true);
  garrison.units[0].captain = true;
  return bearer({
    seed,
    armies: [mine, { ...garrison, doctrine: 'fury', holdField: true, works: { stakes: 2, ditch: 0, laager: 0 } }],
    terrain: generateBattlefield(seed, { base: 'plain', river: false, coast: false, rocky: false, woods: 0.1, assault: true }),
  });
}

// ------------------------------------------------------------------ the player

const DEPLOY: Order[] = [
  { kind: 'preset', group: 0, type: 'orb' },
  { kind: 'face', group: 2, fx: 0.6, fy: -0.8 },
];
const WORKS: Order[] = [
  { kind: 'work', type: 'stakes', x: 10.5, y: 23.5, fx: 0, fy: -1 },
  { kind: 'work', type: 'ditch', x: 14.5, y: 23.5, fx: 0, fy: -1 },
  { kind: 'work', type: 'stakes', x: 18.5, y: 23.5, fx: 0, fy: -1 },
  { kind: 'unwork', x: 18.5, y: 23.5 },
];

/**
 * The scripted player: an orb and a face in deployment; focus on the enemy's
 * missile group; out of the orb into a line; face mid-battle; the riders
 * feint whenever they may; every ready active twice a second; the Standard
 * raised once own men run.
 */
function player(b: Battle): void {
  const enemy = b.sideGroups(1);
  if (b.tick === 1) {
    b.issue(0, { kind: 'focus', group: 1, target: enemy[1].id });
    for (const g of [1, 2]) b.issue(0, { kind: 'order', group: g, order: 'advance' });
  }
  if (b.tick === 120) b.issue(0, { kind: 'preset', group: 0, type: 'line' });
  if (b.tick === 140) b.issue(0, { kind: 'order', group: 0, order: 'advance' });
  if (b.tick === 200) b.issue(0, { kind: 'face', group: 1, fx: -0.6, fy: -0.8 });
  if (b.tick === 300) for (const g of [0, 2]) b.issue(0, { kind: 'order', group: g, order: 'charge' });
  if (b.tick >= 60 && b.tick % 100 === 60 && b.feintReady(3)) b.issue(0, { kind: 'order', group: 3, order: 'feint' });
  if (b.tick === 700) b.issue(0, { kind: 'order', group: 3, order: 'charge' });
  if (b.tick % 10 === 0) {
    for (const u of b.units) if (u.side === 0) for (const id of u.abil) if (b.abilityReady(u, id)) b.issue(0, { kind: 'ability', unit: u.id, ability: id });
    if (b.canRaise(0) && b.units.some((u) => u.side === 0 && u.state === 'routing')) b.issue(0, { kind: 'ability', unit: 0, ability: RAISE_STANDARD as AbilityId });
  }
}

/** The client: deploy, fight to the end with the scripted player, and submit as attackSubmission does. */
export function playClient(name: string, kind: RecordedBattle['kind'], setup: BattleSetup): RecordedBattle {
  const pristine = JSON.parse(JSON.stringify(setup)) as BattleSetup;
  const b = new Battle(setup);
  for (const o of kind === 'offline' ? [...WORKS, ...DEPLOY] : DEPLOY) b.issue(0, o);
  const deployOrders = b.orderLog.length;
  b.startBattle();
  const events: SimEvent[] = [];
  const checkpoints: [number, string][] = [];
  while (b.phase !== 'ended' && b.tick <= b.timeLimitTicks + 1) {
    player(b);
    if ((b.phase as string) === 'ended') break;
    b.step();
    events.push(...b.drainEvents());
    if (b.tick % CHECKPOINT === 0) checkpoints.push([b.tick, b.hash()]);
  }
  const sub = attackSubmission(b, deployOrders);
  const r = b.result();
  const army = pristine.armies[1];
  const kinds = new Set(sub.orders.map((o) => o.order.kind as string));
  for (const o of sub.orders) {
    if (o.order.kind === 'order' && o.order.order === 'feint') kinds.add('feint');
    if (o.order.kind === 'preset' && o.order.type === 'orb') kinds.add('orb');
  }
  const abilities = new Set(events.flatMap((e) => (e.type === 'ability' && b.units[e.unit].side === 0 ? [e.ability as string] : [])));
  if (b.standardRaised(0)) abilities.add(RAISE_STANDARD);
  const TRAIN = ['cohesion', 'disordered', 'armyBreak', 'stakesBreak', 'standardLost', 'retreat', 'ability'];
  return {
    name,
    kind,
    setup: pristine,
    orders: sub.orders,
    deployOrders: sub.deployOrders,
    winner: r.winner,
    retreated: r.retreated ?? null,
    ticks: r.ticks,
    hash: sub.claim.hash,
    checkpoints,
    coverage: {
      orders: [...kinds].sort(),
      abilities: [...abilities].sort(),
      events: [...new Set(events.map((e) => e.type))].filter((t) => TRAIN.includes(t)).sort(),
      doctrine: army.doctrine ?? 'steady',
      holdField: army.holdField === true,
      captain: pristine.armies.some((a) => a.units.some((u) => u.captain === true)),
      works: b.works().length,
    },
  };
}

// ------------------------------------------------------------------ the scenarios

/** The ladder floor of each chapter doctrine (floorDoctrine): 5 steady, 13 swarm, 23 rush, 33 hammer, 43 fury. */
const LADDER_FLOORS: Record<DoctrineId, number> = { steady: 5, swarm: 13, rush: 23, hammer: 33, fury: 43 };

interface Scenario {
  name: string;
  kind: RecordedBattle['kind'];
  build: (seed: number) => BattleSetup;
  /** When recording: the first seed from here whose battle passes `wants`. */
  seed: number;
  wants: (c: RecordedBattle) => boolean;
}

const all = (c: RecordedBattle) =>
  ['face', 'focus', 'feint', 'orb'].every((k) => c.coverage.orders.includes(k)) && [...SIGNATURE, RAISE_STANDARD].every((a) => c.coverage.abilities.includes(a));
const broke = (c: RecordedBattle) => all(c) && ['cohesion', 'disordered', 'armyBreak'].every((e) => c.coverage.events.includes(e));

const ONLINE: Scenario[] = [
  // The all-features online log: every order, every active, the Standard raised, a feint that draws, cohesion and army break.
  { name: 'ladder-all-hammer', kind: 'ladder', build: (s) => ladderBattle(LADDER_FLOORS.hammer, s), seed: 1, wants: broke },
  ...DOCTRINE_IDS.filter((d) => d !== 'hammer').map((d): Scenario => ({ name: `ladder-${d}`, kind: 'ladder', build: (s) => ladderBattle(LADDER_FLOORS[d], s), seed: 11, wants: all })),
  ...DOCTRINE_IDS.map((d): Scenario => ({ name: `war-${d}`, kind: 'war', build: (s) => warBattle(d, s), seed: 21, wants: (c) => c.coverage.orders.includes('focus') })),
  // A war battle the neutrals end by retreating (war bots may retreat, ladder bots never do: V5-052).
  { name: 'war-retreat', kind: 'war', build: (s) => warBattle('swarm', s), seed: 31, wants: (c) => c.retreated === 1 },
  // A battle that loses the Standard.
  { name: 'ladder-standard-lost', kind: 'ladder', build: (s) => ladderBattle(LADDER_FLOORS.fury, s), seed: 41, wants: (c) => c.coverage.events.includes('standardLost') },
];

const OFFLINE: Scenario[] = [
  // The one log with everything at once (ST-04 AC1): works, a captain, a doctrine, holdField, every order and active.
  { name: 'offline-all-works', kind: 'offline', build: offlineBattle, seed: 51, wants: (c) => all(c) && c.coverage.works > 2 && c.coverage.captain && c.coverage.events.includes('cohesion') },
];

function record(list: Scenario[]): RecordedBattle[] {
  return list.map((s) => {
    let last: RecordedBattle | null = null;
    for (let seed = s.seed; seed < s.seed + 200; seed++) {
      last = playClient(s.name, s.kind, s.build(seed));
      if (s.wants(last)) return last;
    }
    throw new Error(`no seed from ${s.seed} gives ${s.name} its coverage (last: ${JSON.stringify(last?.coverage)})`);
  });
}

const NOTE = 'Recorded with src/sim at SIM_VERSION 2 by tests/trainReplay.test.ts (ST-04). Regenerate only on purpose (RECORD_REPLAY_V2=1) and review the diff (ADR-0001).';

if (RECORD) {
  const { writeFileSync } = (await import('node:fs' as string)) as { writeFileSync(path: URL, data: string): void };
  const at = (f: string) => new URL(`./fixtures/${f}`, import.meta.url);
  writeFileSync(at('replay-v2.json'), JSON.stringify({ simVersion: SIM_VERSION, note: NOTE, battles: record(ONLINE) } satisfies Fixture) + '\n');
  writeFileSync(at('replay-v2-offline.json'), JSON.stringify({ simVersion: SIM_VERSION, note: `${NOTE} Offline only: field works are not in online setups.`, battles: record(OFFLINE) } satisfies Fixture) + '\n');
}

// ------------------------------------------------------------------ the checks

/** Re-runs a recorded battle as the server does (server/src/battle.ts replayBattle), with a hash every CHECKPOINT ticks. */
export function replayWithCheckpoints(rec: RecordedBattle): { winner: number; ticks: number; hash: string; checkpoints: [number, string][] } {
  const b = new Battle(JSON.parse(JSON.stringify(rec.setup)) as BattleSetup);
  const orders = rec.orders.map((o, i) => ({ ...o, i }));
  for (const o of orders.slice(0, rec.deployOrders)) b.issue(o.side, o.order);
  const battle = orders.slice(rec.deployOrders).sort((x, y) => x.tick - y.tick || x.i - y.i);
  b.startBattle();
  const checkpoints: [number, string][] = [];
  let next = 0;
  while (b.phase !== 'ended' && b.tick <= b.timeLimitTicks + 1) {
    while (next < battle.length && battle[next].tick === b.tick) b.issue(battle[next].side, battle[next++].order);
    if ((b.phase as string) === 'ended') break;
    b.step();
    b.drainEvents();
    if (b.tick % CHECKPOINT === 0) checkpoints.push([b.tick, b.hash()]);
  }
  return { winner: b.winner ?? -1, ticks: b.tick, hash: b.hash(), checkpoints };
}

const fixtures = { 'replay-v2.json': [online as unknown as Fixture, ONLINE], 'replay-v2-offline.json': [offline as unknown as Fixture, OFFLINE] } as const;

describe.each(Object.entries(fixtures))('%s (ST-04)', (_file, [fx, scenarios]) => {
  it('is a SIM_VERSION 2 fixture with one battle per scenario', () => {
    expect(fx.simVersion).toBe(SIM_VERSION);
    expect(fx.battles.map((b) => b.name)).toEqual(scenarios.map((s) => s.name));
  });

  it.each(fx.battles.map((b) => [b.name, b] as const))('%s replays in Node to the recorded hash at every checkpoint', (_n, rec) => {
    const out = replayWithCheckpoints(rec);
    expect(out.checkpoints).toEqual(rec.checkpoints);
    expect({ winner: out.winner, ticks: out.ticks, hash: out.hash }).toEqual({ winner: rec.winner, ticks: rec.ticks, hash: rec.hash });
  });

  it.each(fx.battles.map((b, i) => [b.name, b, scenarios[i]] as const))('%s: the client script still plays exactly the recorded battle', (_n, rec, s) => {
    const again = playClient(s.name, s.kind, s.build(rec.setup.seed));
    expect(again).toEqual(rec);
    expect(s.wants(again)).toBe(true);
  });
});

describe('replay-v2 coverage (ST-04 AC1)', () => {
  const battles = [...(online as unknown as Fixture).battles, ...(offline as unknown as Fixture).battles];
  const union = (f: (b: RecordedBattle) => string[]) => new Set(battles.flatMap(f));

  it('covers face, focus, orb and feint, every active and the Standard', () => {
    for (const k of ['face', 'focus', 'feint', 'orb', 'preset', 'order', 'ability']) expect(union((b) => b.coverage.orders).has(k), k).toBe(true);
    for (const a of [...SIGNATURE, RAISE_STANDARD]) expect(union((b) => b.coverage.abilities).has(a), a).toBe(true);
  });

  it('covers cohesion, a drawn feint, army break, a lost Standard and a retreat', () => {
    for (const e of ['cohesion', 'disordered', 'armyBreak', 'standardLost', 'retreat']) expect(union((b) => b.coverage.events).has(e), e).toBe(true);
  });

  it('covers every doctrine on the ladder (holdField) and on the war map', () => {
    for (const d of DOCTRINE_IDS) {
      expect(battles.some((b) => b.kind === 'ladder' && b.coverage.doctrine === d && b.coverage.holdField), `ladder ${d}`).toBe(true);
      expect(battles.some((b) => b.kind === 'war' && b.coverage.doctrine === d && !b.coverage.holdField), `war ${d}`).toBe(true);
    }
  });

  it('has one log with everything at once, works and a captain included (offline)', () => {
    const one = (offline as unknown as Fixture).battles[0];
    expect(one.coverage.works).toBeGreaterThan(0);
    expect(one.coverage.captain).toBe(true);
    expect(one.coverage.holdField).toBe(true);
    for (const k of ['face', 'focus', 'feint', 'orb', 'work', 'unwork']) expect(one.coverage.orders).toContain(k);
    for (const a of [...SIGNATURE, RAISE_STANDARD]) expect(one.coverage.abilities).toContain(a);
  });

  it('the online all-features log has every order, active, the Standard, cohesion and army break', () => {
    const one = (online as unknown as Fixture).battles[0];
    expect(broke(one)).toBe(true);
    expect(one.kind).toBe('ladder');
  });
});
