/**
 * Online battles (pure, shared by client and server): building the BattleSetup
 * of an attack or a duel, and applying a verified result to both sides with
 * the campaign's own rules (src/game/loot.ts).
 *
 * The setup is built by the server only; clients receive it verbatim. Anything
 * the sim later adds to BattleSetup (terrain, weather...) goes in here once.
 */
import { armySpec } from '../game/armySpec';
import { resolveBattle, type Outcome } from '../game/loot';
import type { Hero } from '../data/units';
import { Rng } from '../sim/rng';
import type { FormationType } from '../sim/formation';
import type { Battle } from '../sim/battle';
import type { BattleResult, BattleSetup, LoggedOrder, Side } from '../sim/types';
import { generateBattlefield, siteName, type BattleSite } from '../world/battlefield';
import { ONLINE_RULES } from './rules';

export interface SideArmy {
  heroes: Hero[];
  formations: FormationType[];
  bot: boolean;
}

/** Side 0 attacks (or challenged), side 1 defends (or accepted). */
export function onlineBattleSetup(seed: number, a: SideArmy, b: SideArmy, site: BattleSite | null): BattleSetup {
  const setup: BattleSetup = {
    seed: seed >>> 0,
    armies: [armySpec(a.heroes, a.bot, a.formations), armySpec(b.heroes, b.bot, b.formations)],
    timeLimit: ONLINE_RULES.battleTimeLimit,
  };
  if (site) {
    const grid = generateBattlefield(seed >>> 0, site);
    grid.name = grid.name ?? siteName(site);
    setup.terrain = grid;
  }
  return setup;
}

/** What an attack's client submits for the server's replay (POST /api/online/attack/submit). */
export interface AttackSubmission {
  orders: LoggedOrder[];
  /** How many of `orders` were issued during deployment (before startBattle). */
  deployOrders: number;
  claim: { winner: Side | -1; ticks: number; hash: string };
}

/**
 * The order log and claim of a finished attack. Only the player's (side 0)
 * orders are sent: the bot's come back from the seed. `deployOrders` is the
 * length of the sim's whole order log when the battle started.
 */
export function attackSubmission(sim: Battle, deployOrders: number): AttackSubmission {
  const orders = sim.orderLog.filter((o) => o.side === 0).map((o) => ({ tick: o.tick, side: o.side, order: o.order }));
  const deployed = sim.orderLog.slice(0, deployOrders).filter((o) => o.side === 0).length;
  return { orders, deployOrders: deployed, claim: { winner: sim.winner ?? -1, ticks: sim.tick, hash: sim.hash() } };
}

/** The same battle seen from side 1 (resolveBattle always treats side 0 as "the player"). */
export function flipResult(r: BattleResult): BattleResult {
  const flip = (s: number) => (s === 0 ? 1 : s === 1 ? 0 : s);
  return {
    winner: flip(r.winner) as Side | -1,
    retreated: r.retreated === null || r.retreated === undefined ? r.retreated : (flip(r.retreated) as Side),
    ticks: r.ticks,
    units: r.units.map((u) => ({ ...u, side: flip(u.side) as Side, killedBy: u.killedBy < 0 ? u.killedBy : flip(u.killedBy) })),
  };
}

export interface SideOutcome {
  outcome: Outcome;
  /** Heroes still alive (XP and wear applied, wounds marked by `wounded`). */
  survivors: Hero[];
  /** Ids of heroes who died for good. */
  dead: string[];
  /** Ids of heroes knocked out (rest for ONLINE_RULES.woundMs). */
  wounded: string[];
}

function side(result: BattleResult, mine: Hero[], theirs: Hero[], rng: Rng): SideOutcome {
  const before = new Set(mine.map((h) => h.id));
  const { outcome, survivors } = resolveBattle(result, mine, theirs, rng);
  const alive = new Set(survivors.map((h) => h.id));
  const wounded = outcome.heroes.filter((o) => o.wounded).map((o) => o.heroId);
  for (const h of survivors) h.wound = 0; // online wounds are wall-clock (heroes.wounded_until)
  return { outcome, survivors, dead: [...before].filter((id) => !alive.has(id)), wounded };
}

export interface AttackResolution {
  attacker: SideOutcome;
  defender: SideOutcome;
  /** Items the attacker takes: the best `picks` of the pool from enemies they killed. */
  loot: ReturnType<typeof resolveBattle>['outcome']['loot'];
  captured: boolean;
}

/** Applies a verified attack result to copies of both armies. */
export function resolveAttack(result: BattleResult, attackers: Hero[], defenders: Hero[], seed: number): AttackResolution {
  const rng = new Rng((seed ^ 0x51ed270b) >>> 0 || 1);
  const a = side(result, clone(attackers), clone(defenders), rng);
  const d = side(flipResult(result), clone(defenders), clone(attackers), rng);
  const loot = a.outcome.loot.slice(0, a.outcome.picks);
  return { attacker: a, defender: d, loot, captured: result.winner === 0 };
}

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
