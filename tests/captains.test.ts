/**
 * AI-02: band captains, the bounty, the enemy-retreat outcome and the
 * weakenParty identity fix (design/gdd/ai-doctrines.md R6, R8, F3; MECH C4).
 */
import { describe, expect, it } from 'vitest';
import { BOUNTY, Campaign, WIN_GOLD, captainBounty } from '../src/game/campaign';
import { campaignSetup, settleBattle } from '../src/game/campaignBattle';
import { armySpec } from '../src/game/armySpec';
import { setBotLevel, standardArmy } from '../src/game/heroes';
import { bandBeast } from '../src/game/beasts';
import { buildReport, enemyRetreated } from '../src/game/report';
import type { Outcome } from '../src/game/loot';
import type { Hero } from '../src/data/units';
import { rarityRank } from '../src/data/items';
import { CAPTAIN_RULES, bandCaptain, partyArmy, type PartyState } from '../src/world/world';
import { CAPTAIN_STATS, computeStats, isCaptain } from '../src/sim/stats';
import { Battle } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import type { BattleResult, UnitResult } from '../src/sim/types';

/** A band of men (seed % 14 !== 3 is never a beast). */
function band(over: Partial<PartyState> = {}): PartyState {
  return {
    id: 900, kind: 'mercs', name: 'Mercenaries', culture: 'greek', x: 1.5, y: 1.5, size: 8, power: 0, level: 3, tier: 2,
    seed: 7920, home: 0, mode: 'wander', tx: 1, ty: 1, idle: 0, ...over,
  };
}

/** A campaign with `p` on its map. */
function withBand(p: PartyState): Campaign {
  const c = Campaign.fresh(11);
  c.world.s.parties.push(p);
  p.power = partyArmy(p, { nextId: 1 }).power;
  return c;
}

const outcome = (over: Partial<Outcome> = {}): Outcome => ({ victory: true, draw: false, gold: 0, picks: 3, loot: [], heroes: [], enemyKilled: 0, enemyTotal: 8, lost: 0, ...over });

function unit(h: Hero, state: UnitResult['state'], ko = false): UnitResult {
  return { heroId: h.id, side: 1, state, kills: 0, killedBy: state === 'dead' ? 0 : -1, ko, hp: 0, maxHp: 50, wear: { weapon: 0, shield: 0, helmet: 0, armor: 0 } };
}

/** A result where the band's `dead` men fell (the captain first when `captain` says so). */
function result(enemies: Hero[], captain: 'ready' | 'dead' | 'ko', dead: number, retreated: 0 | 1 | null = null, winner: 0 | 1 = 0): BattleResult {
  const units = enemies.map((h, i) => {
    if (isCaptain(h)) return captain === 'ready' ? unit(h, 'ready') : unit(h, 'dead', captain === 'ko');
    return unit(h, i <= dead ? 'dead' : 'ready');
  });
  return { winner, retreated, ticks: 1000, units };
}

describe('captains (ai-doctrines.md R6)', () => {
  it('a band of tier 2 or more has one captain: in the main line, band level + levelBonus, no item below uncommon', () => {
    const p = band();
    const army = partyArmy(p, { nextId: 1 });
    expect(army.heroes).toHaveLength(p.size);
    const caps = army.heroes.filter((h) => isCaptain(h));
    expect(caps).toHaveLength(1);
    const cap = caps[0];
    expect(cap.level).toBe(p.level + CAPTAIN_RULES.levelBonus);
    expect(cap.group).toBe(0);
    for (const it of Object.values(cap.equip)) if (it) expect(rarityRank(it.rarity)).toBeGreaterThanOrEqual(1);
    // rare from tier 3, and the level cap holds
    const t3 = bandCaptain(band({ tier: 3, level: 9 }), { nextId: 1 })!;
    expect(t3.level).toBe(Math.min(10, 9 + CAPTAIN_RULES.levelBonus));
    for (const it of Object.values(t3.equip)) if (it) expect(rarityRank(it.rarity)).toBeGreaterThanOrEqual(2);
    // names stay unique in the band
    expect(new Set(army.heroes.map((h) => h.name)).size).toBe(army.heroes.length);
  });

  it('tier-1 bands, beasts and bands whose captain is gone have none', () => {
    expect(bandCaptain(band({ tier: 1 }), { nextId: 1 })).toBeNull();
    expect(bandCaptain(band({ captainDead: true }), { nextId: 1 })).toBeNull();
    const beastSeed = 3 + 14 * 5;
    expect(bandBeast(beastSeed)).not.toBeNull();
    expect(bandCaptain(band({ kind: 'bandits', seed: beastSeed }), { nextId: 1 })).toBeNull();
    expect(partyArmy(band({ captainDead: true }), { nextId: 1 }).heroes.some((h) => isCaptain(h))).toBe(false);
  });

  it('is the same man however many of his band are left (deterministic from the seed)', () => {
    const a = bandCaptain(band(), { nextId: 1 })!;
    const b = bandCaptain(band({ size: 3 }), { nextId: 50 })!;
    const same = (h: Hero) => ({ name: h.name, cls: h.cls, level: h.level, attrs: h.attrs, traits: h.traits, perks: h.perks, gear: Object.values(h.equip).map((it) => it && `${it.def}:${it.rarity}`) });
    expect(same(b)).toEqual(same(a));
  });

  it('his stats carry the captain\'s nerve, the same on every derivation', () => {
    const cap = bandCaptain(band(), { nextId: 1 })!;
    const plain = { ...cap } as Hero & { captain?: boolean };
    delete plain.captain;
    expect(computeStats(cap).morale).toBeCloseTo(computeStats(plain).morale + CAPTAIN_STATS.morale, 6);
    expect(computeStats(cap)).toEqual(computeStats(JSON.parse(JSON.stringify(cap)) as Hero));
  });

  it('a battle with a captain replays to the same hash (the stats travel in the setup)', () => {
    const ids = { nextId: 1 };
    const mine = standardArmy(new Rng(5), ids);
    const foe = partyArmy(band(), ids);
    const setup = () => ({ seed: 5, armies: [armySpec(mine, true), { ...armySpec(foe.heroes, true), doctrine: foe.doctrine }] as [ReturnType<typeof armySpec>, ReturnType<typeof armySpec>] });
    const run = () => {
      const b = new Battle(JSON.parse(JSON.stringify(setup())));
      b.startBattle();
      while (b.phase !== 'ended' && b.tick < 20 * 300) b.step();
      return b.hash();
    };
    expect(run()).toBe(run());
  });
});

describe('the bounty (R6.4, F3)', () => {
  it('is 15 + 5 x level, times the band\'s bountyMult', () => {
    expect(BOUNTY).toEqual({ base: 15, perLevel: 5 });
    expect(captainBounty(3)).toBe(30);
    expect(captainBounty(10)).toBe(65);
    expect(captainBounty(5, 2)).toBe(80);
  });

  it('a captain knocked out on a won field is captured: bounty once, his weapon offered first, and he leaves the band (H2)', () => {
    const p = band();
    const c = withBand(p);
    const enemies = partyArmy(p, c.data).heroes;
    const cap = enemies.find((h) => isCaptain(h))!;
    const gold = c.data.gold;
    const out = outcome({ gold: 100, loot: [], picks: 3 });
    // the band retreats: it survives, so a second fight against it could pay again if the rule were wrong
    const spoils = c.afterPartyBattle(p.id, out, result(enemies, 'ko', 2, 1), enemies);
    expect(spoils).toMatchObject({ captain: 'captured', bounty: captainBounty(cap.level), enemyRetreated: true });
    expect(out.loot[0].uid).toBe(cap.equip.weapon!.uid);
    expect(out.picks).toBe(1); // 3 picks, but only the weapon to pick from
    const left = c.world.party(p.id)!;
    expect(left.captainDead).toBe(true);
    expect(partyArmy(left, c.data).heroes.some((h) => isCaptain(h))).toBe(false);
    // the purse moves with the outcome (resolveBattle had already paid the 100)
    expect(c.data.gold - gold).toBe(out.gold - 100);
    // the next fight with that band has no captain, so no bounty
    const again = partyArmy(left, c.data).heroes;
    expect(c.afterPartyBattle(p.id, outcome({ gold: 100 }), result(again, 'ready', 1), again).bounty).toBe(0);
  });

  it('a captain killed in a won fight pays; one killed in a lost fight only leaves the band; a knocked-out one in a lost fight stays', () => {
    const p1 = band();
    const c1 = withBand(p1);
    const e1 = partyArmy(p1, c1.data).heroes;
    const won = outcome({ gold: 50 });
    expect(c1.afterPartyBattle(p1.id, won, result(e1, 'dead', 1), e1)).toMatchObject({ captain: 'killed', bounty: captainBounty(p1.level + CAPTAIN_RULES.levelBonus) });
    expect(won.gold).toBe(50 + captainBounty(p1.level + CAPTAIN_RULES.levelBonus));
    expect(c1.world.party(p1.id)).toBeUndefined();

    const p2 = band({ id: 901 });
    const c2 = withBand(p2);
    const e2 = partyArmy(p2, c2.data).heroes;
    const lost = outcome({ victory: false, enemyKilled: 1, picks: 0 });
    expect(c2.afterPartyBattle(p2.id, lost, result(e2, 'dead', 0, null, 1), e2)).toMatchObject({ captain: 'killed', bounty: 0 });
    expect(c2.world.party(p2.id)!.captainDead).toBe(true);

    const p3 = band({ id: 902 });
    const c3 = withBand(p3);
    const e3 = partyArmy(p3, c3.data).heroes;
    expect(c3.afterPartyBattle(p3.id, outcome({ victory: false, enemyKilled: 1 }), result(e3, 'ko', 0, null, 1), e3).captain).toBe('alive');
    expect(c3.world.party(p3.id)!.captainDead).toBeFalsy();
  });
});

describe('the enemy retreats (R8)', () => {
  it('a retreat win pays no win bonus; the band gets away weakened, same seed and same captain, escaped counts to the cap', () => {
    const p = band({ kind: 'bandits', culture: 'greek', size: 8 });
    const c = withBand(p);
    const enemies = partyArmy(p, c.data).heroes;
    const cap = enemies.find((h) => isCaptain(h))!;
    const killed = 2;
    const full = 20 + killed * 12 + WIN_GOLD;
    const out = outcome({ gold: full, enemyKilled: killed });
    const before = c.data.gold;
    const spoils = c.afterPartyBattle(p.id, out, result(enemies, 'ready', killed, 1), enemies);
    expect(spoils).toEqual({ enemyRetreated: true, captain: 'alive', bounty: 0 });
    expect(out.gold).toBe(full - WIN_GOLD);
    expect(c.data.gold - before).toBe(-WIN_GOLD);
    const left = c.world.party(p.id)!;
    expect(left.size).toBe(8 - killed);
    expect(left.seed).toBe(7920);
    expect(left.idle).toBe(CAPTAIN_RULES.escapeIdleH);
    expect(left.escaped).toBe(1);
    const back = partyArmy(left, c.data).heroes.find((h) => isCaptain(h))!;
    expect(back.name).toBe(cap.name);
    expect(back.cls).toBe(cap.cls);
    for (let i = 0; i < 5; i++) {
      const e = partyArmy(left, c.data).heroes;
      c.afterPartyBattle(p.id, outcome({ gold: 80 }), result(e, 'ready', 0, 1), e);
    }
    expect(c.world.party(p.id)!.escaped).toBe(CAPTAIN_RULES.escapeCap);
  });

  it('a swarm band retreats in a real battle and reappears weakened with the same captain (campaign test)', () => {
    // a tier-2 bandit band fights swarm; seed 1 is one where it quits the field (found by search)
    const p = band({ kind: 'bandits', seed: 7920, size: 8 });
    const c = withBand(p);
    const army = c.partyEnemy(p.id)!;
    expect(army.doctrine).toBe('swarm');
    const cap = army.heroes.find((h) => isCaptain(h))!;
    const mine = standardArmy(new Rng(1), c.data);
    for (const h of mine) setBotLevel(h, 5);
    c.data.heroes = mine;
    const pending = { enemy: army, seed: 1, partyId: p.id };
    const sim = new Battle(campaignSetup(pending, mine));
    sim.startBattle();
    while (sim.phase !== 'ended' && sim.tick < 20 * 400) sim.step();
    expect(sim.retreated).toBe(1);
    expect(sim.winner).toBe(0);
    const last = settleBattle(c, pending, sim, army.heroes);
    expect(last.outcome.victory).toBe(true);
    const fallen = sim.result().units.filter((u) => u.side === 1 && u.state === 'dead').length;
    const left = c.world.party(p.id)!;
    expect(left).toBeDefined();
    expect(left.size).toBe(8 - fallen);
    expect(left.escaped).toBe(1);
    expect(left.seed).toBe(7920);
    const capUnit = sim.result().units.find((u) => u.heroId === cap.id)!;
    if (capUnit.state !== 'dead') expect(c.partyEnemy(p.id)!.heroes.find((h) => isCaptain(h))!.name).toBe(cap.name);
  });

  it('the report knows when the other side withdrew', () => {
    expect(enemyRetreated(0, 1)).toBe(true);
    expect(enemyRetreated(0, 0)).toBe(false);
    expect(enemyRetreated(0, null)).toBe(false);
    expect(enemyRetreated(1, undefined)).toBe(false);
    const r = buildReport({ result: 'victory', vs: 'Bandits', ticks: 100, side: 0, stats: [], heroes: [], retreated: 1, bounty: 30, gold: 90 });
    expect(r).toMatchObject({ enemyRetreated: true, bounty: 30, gold: 90 });
    expect(buildReport({ result: 'victory', vs: 'x', ticks: 1, side: 0, stats: [], heroes: [] })).toMatchObject({ enemyRetreated: false, bounty: 0 });
  });
});

describe('weakenParty keeps the band (MECH C4)', () => {
  it('never rerolls the seed: a beast stays a beast, a band keeps its men and its captain', () => {
    const beastSeed = 3 + 14 * 2;
    const pb = band({ kind: 'bandits', seed: beastSeed });
    const cb = withBand(pb);
    const kindBefore = partyArmy(pb, { nextId: 1 }).heroes[0].cls;
    cb.world.weakenParty(pb.id, 1, 3);
    expect(pb.seed).toBe(beastSeed);
    expect(partyArmy(pb, { nextId: 1 }).heroes[0].cls).toBe(kindBefore);

    const p = band();
    const c = withBand(p);
    const cap = bandCaptain(p, { nextId: 1 })!;
    c.world.weakenParty(p.id, 3, 3);
    expect(p.seed).toBe(7920);
    expect(p.size).toBe(5);
    expect(bandCaptain(p, { nextId: 1 })!.name).toBe(cap.name);
    expect(p.power).toBeCloseTo(partyArmy(p, { nextId: 1 }).power, 6);
  });
});
