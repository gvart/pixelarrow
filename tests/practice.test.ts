/**
 * LF-02: the Beast Trial is Practice (design/gdd/practice-fight.md). A Trial
 * fight changes nothing in the campaign: no item, gold or pity progress (audit
 * I1, the free legendary farm), and no deaths, wounds or XP either.
 */
import { describe, expect, it } from 'vitest';
import trialSrc from '../src/scenes/CodexScene.ts?raw';
import { Campaign } from '../src/game/campaign';
import { beastEnemy } from '../src/game/beasts';
import { campaignSetup, markBattle, practiceOf, resolveAbandoned, settleBattle, trialBattle } from '../src/game/campaignBattle';
import { SLOTS } from '../src/data/items';
import type { Hero } from '../src/data/units';
import type { PendingBattle } from '../src/state';
import { Battle } from '../src/sim/battle';

/** Play a few seconds of the fight, then end it: the enemy all slain by us (or us all slain). */
function fought(pending: PendingBattle, heroes: Hero[], win: boolean): Battle {
  const sim = new Battle(campaignSetup(pending, heroes));
  sim.startBattle();
  for (let i = 0; i < 40; i++) sim.step();
  const loser = win ? 1 : 0;
  for (const u of sim.units) {
    if (u.side !== loser) continue;
    u.state = 'dead';
    u.ko = false;
    u.killedBy = 1 - loser;
  }
  // one of ours falls even in a win
  if (win) {
    const mine = sim.units.find((u) => u.side === 0)!;
    mine.state = 'dead';
    mine.ko = false;
    mine.killedBy = 1;
  }
  (sim as unknown as { winner: number }).winner = 1 - loser;
  sim.phase = 'ended';
  return sim;
}

/** Everything a battle could change in the campaign. */
function snapshot(camp: Campaign): string {
  const d = camp.data;
  return JSON.stringify({ heroes: d.heroes, stash: d.stash, gold: d.gold, pity: d.pity ?? 0, fought: d.fought, won: d.won, battle: d.battle ?? null });
}

const hoardItems = (heroes: Hero[]) => heroes.reduce((a, h) => a + SLOTS.filter((s) => h.equip[s]).length, 0);

describe('Practice: a Trial fight gives nothing and costs nothing (LF-02)', () => {
  it('control: the same beast as an ordinary fight carries a hoard that pays out, legendaries included', () => {
    // proves the checks below would see loot if a Trial still paid it
    const camp = Campaign.fresh(11);
    let legendary = 0;
    let items = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const heroes = camp.fitHeroes();
      const pending: PendingBattle = { enemy: beastEnemy('cyclops', 4, seed, camp.data), seed };
      const last = settleBattle(camp, pending, fought(pending, heroes, true), pending.enemy.heroes);
      items += last.outcome.loot.length;
      legendary += last.outcome.loot.filter((it) => it.rarity === 'legendary').length;
    }
    expect(items).toBeGreaterThan(0);
    expect(legendary).toBeGreaterThan(0);
  });

  it('a repeated Trial win can never yield loot, gold or pity progress (40 repeats, every beast)', () => {
    const camp = Campaign.fresh(11);
    const before = snapshot(camp);
    for (let seed = 1; seed <= 40; seed++) {
      const enc = (['cyclops', 'hydra', 'kraken', 'titan'] as const)[seed % 4];
      const pending = trialBattle(camp, enc, 'Codex', seed);
      expect(hoardItems(pending.enemy.heroes)).toBe(0);
      markBattle(camp, pending, camp.fitHeroes(), []);
      const last = settleBattle(camp, pending, fought(pending, camp.fitHeroes(), true), pending.enemy.heroes);
      expect(last.outcome.victory).toBe(true);
      expect(last.outcome.loot).toEqual([]);
      expect(last.outcome.picks).toBe(0);
      expect(last.outcome.gold).toBe(0);
      expect(last.fallen).toEqual([]);
      expect(last.outcome.heroes.every((h) => h.xp === 0 && h.levelsGained === 0)).toBe(true);
      expect(practiceOf(last)).toEqual({ enc, from: 'Codex' });
      expect(snapshot(camp)).toBe(before);
    }
  });

  it('a Trial defeat kills and wounds nobody', () => {
    const camp = Campaign.fresh(5);
    const before = snapshot(camp);
    const pending = trialBattle(camp, 'titan', 'Codex', 99);
    const last = settleBattle(camp, pending, fought(pending, camp.fitHeroes(), false), pending.enemy.heroes);
    expect(last.outcome.victory).toBe(false);
    // the report still says who fell
    expect(last.outcome.heroes.some((h) => h.died)).toBe(true);
    expect(last.fallen).toEqual([]);
    expect(snapshot(camp)).toBe(before);
  });

  it('a Trial is never saved as a battle in progress, and an old practice marker resolves to nothing', () => {
    const camp = Campaign.fresh(3);
    const pending = trialBattle(camp, 'hydra', 'Codex', 7);
    markBattle(camp, pending, camp.fitHeroes(), []);
    expect(camp.data.battle).toBeUndefined();
    const before = snapshot(camp);
    // a marker written by hand (as by an older build): dropped, not fought out
    camp.data.battle = { pending: JSON.parse(JSON.stringify(pending)) as PendingBattle, heroIds: camp.fitHeroes().map((h) => h.id), deploy: [] };
    expect(resolveAbandoned(camp)).toBeNull();
    expect(camp.data.battle).toBeUndefined();
    expect(snapshot(camp)).toBe(before);
  });

  it('a band battle still pays (no regression)', () => {
    const camp = Campaign.fresh(11);
    const gold = camp.data.gold;
    const pending: PendingBattle = { enemy: beastEnemy('cyclops', 4, 3, camp.data), seed: 3 };
    const last = settleBattle(camp, pending, fought(pending, camp.fitHeroes(), true), pending.enemy.heroes);
    expect(last.outcome.gold).toBeGreaterThan(0);
    expect(camp.data.gold).toBe(gold + last.outcome.gold);
    expect(camp.data.won).toBe(1);
    expect(practiceOf(last)).toBeUndefined();
  });
});

describe('The Codex Trial fight starts the battle with explicit scene data (PLAY B1 root cause)', () => {
  it('fight() builds a practice battle and starts Battle with {}', () => {
    const fight = trialSrc.slice(trialSrc.indexOf('fight(enc: EncounterId)'));
    expect(fight).toContain('trialBattle(');
    expect(fight).toMatch(/this\.scene\.start\('Battle', \{\}\)/);
    expect(trialSrc).not.toMatch(/scene\.start\('Battle'\)/);
  });
});
