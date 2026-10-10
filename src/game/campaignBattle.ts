/**
 * An offline campaign battle (not online duels or war, which the server
 * verifies): its setup, how its result changes the campaign, and the
 * battle-in-progress marker that keeps a killed app from voiding it
 * (V5-011, docs/GAMEPLAY.md "Abandoned battles"). No Phaser here.
 */
import type { Campaign } from './campaign';
import type { LastBattle, PendingBattle } from '../state';
import type { Hero } from '../data/units';
import type { BattleSetup, LoggedOrder } from '../sim/types';
import { Battle } from '../sim/battle';
import { Rng } from '../sim/rng';
import { armySpec } from './armySpec';
import { resolveBattle } from './loot';
import { unitStats } from './report';
import { makeHero } from './heroes';
import { generateBattlefield, randomSite } from '../world/battlefield';

/** Saved when a campaign battle starts; cleared when its result is applied. */
export interface BattleMarker {
  pending: PendingBattle;
  /** The heroes who marched in, in army order. */
  heroIds: string[];
  /** The orders given before Fight (deployment). */
  deploy: LoggedOrder[];
}

/** The battle a pending campaign fight is played on: the same field and armies every time. */
export function campaignSetup(pending: PendingBattle, heroes: Hero[]): BattleSetup {
  // The battlefield comes from the place on the map where the armies met.
  const site = pending.site ?? randomSite(new Rng(pending.seed ^ 0x51735c1));
  const terrain = generateBattlefield(pending.seed, site);
  return { seed: pending.seed, armies: [armySpec(heroes, false), { ...armySpec(pending.enemy.heroes, true), doctrine: pending.enemy.doctrine }], terrain };
}

/** Record that the battle has begun (save afterwards): from now on its outcome stands. */
export function markBattle(camp: Campaign, pending: PendingBattle, heroes: Hero[], deploy: LoggedOrder[]): void {
  camp.data.battle = JSON.parse(JSON.stringify({ pending, heroIds: heroes.map((h) => h.id), deploy })) as BattleMarker;
}

/** A finished campaign battle changes the campaign: deaths, wounds, XP, gold, the band; clears the marker. */
export function settleBattle(camp: Campaign, pending: PendingBattle, sim: Battle, enemyHeroes: Hero[], before?: Hero[]): LastBattle {
  const heroes = camp.data.heroes;
  const { outcome, survivors } = resolveBattle(sim.result(), heroes, enemyHeroes, camp.random());
  camp.beastPity(outcome, enemyHeroes);
  const alive = new Set(survivors.map((h) => h.id));
  const fallen = heroes.filter((h) => !alive.has(h.id));
  camp.data.heroes = survivors;
  camp.data.gold += outcome.gold;
  camp.data.fought++;
  if (outcome.victory) camp.data.won++;
  if (pending.partyId !== undefined) camp.afterPartyBattle(pending.partyId, outcome);
  else if (survivors.length === 0) {
    for (let i = 0; i < 3; i++) camp.data.heroes.push(makeHero(camp.random(), camp.data, 'greek', 'raw', 1, 1, i < 2 ? 0 : 1, camp.data.heroes));
  }
  delete camp.data.battle;
  return { outcome, enemy: pending.enemy, fallen, partyId: pending.partyId, label: pending.label, ticks: sim.tick, stats: unitStats(sim), before };
}

/**
 * The app was closed during this battle: it is fought out with the orders
 * given before it began, and its result applied like any other.
 */
export function resolveAbandoned(camp: Campaign): LastBattle | null {
  const m = camp.data.battle;
  if (!m) return null;
  const byId = new Map(camp.data.heroes.map((h) => [h.id, h]));
  const heroes = m.heroIds.map((id) => byId.get(id)).filter((h): h is Hero => !!h);
  if (heroes.length === 0) {
    delete camp.data.battle;
    return null;
  }
  const before = heroes.map((h) => JSON.parse(JSON.stringify(h)) as Hero);
  const sim = new Battle(campaignSetup(m.pending, heroes));
  for (const o of m.deploy) sim.issue(o.side, o.order);
  sim.startBattle();
  for (let i = 0; i < 20 * 400 && sim.phase !== 'ended'; i++) sim.step();
  return settleBattle(camp, m.pending, sim, m.pending.enemy.heroes, before);
}

/** Load-time check of a saved marker: a malformed one is dropped (the save is kept). */
export function validMarker(m: unknown): m is BattleMarker {
  const b = m as BattleMarker | null;
  return (
    !!b &&
    typeof b === 'object' &&
    !!b.pending &&
    typeof b.pending.seed === 'number' &&
    Array.isArray(b.pending.enemy?.heroes) &&
    Array.isArray(b.heroIds) &&
    Array.isArray(b.deploy)
  );
}
