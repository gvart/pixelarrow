/**
 * RES-01: the rules of the Results screen (src/ui/results/model.ts), honest
 * losses (PLAY B4) and the captain's bounty reaching the report of a campaign
 * battle (settleBattle).
 */
import { describe, expect, it } from 'vitest';
import { arcPiece, backAction, companyRoll, isArcVictory, noteChips, pagesFor, spoilSections, vsName } from '../src/ui/results/model';
import { buildReport, type HeroLine, type UnitStat } from '../src/game/report';
import { Campaign, captainBounty } from '../src/game/campaign';
import { campaignSetup, settleBattle } from '../src/game/campaignBattle';
import { setBotLevel, standardArmy } from '../src/game/heroes';
import { partyArmy, type PartyState } from '../src/world/world';
import { isCaptain } from '../src/sim/stats';
import { Battle } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import { setLang, t } from '../src/i18n';

const line = (name: string, o: Partial<HeroLine> = {}): HeroLine => ({ heroId: name, name, hero: null, kills: 0, dmg: 0, died: false, wounded: false, xp: 0, levelBefore: 1, xpBefore: 0, levelsGained: 0, ...o });
const stat = (heroId: string, side: 0 | 1, o: Partial<UnitStat> = {}): UnitStat => ({ heroId, side, kills: 0, dmg: 0, dead: false, ko: false, killedBy: -1, ...o });

describe('Results pages and Back (C-10, audit RES-6)', () => {
  it('a practice fight has no Spoils tab', () => {
    expect(pagesFor(true)).toEqual(['summary', 'heroes']);
    expect(pagesFor(false)).toEqual(['summary', 'heroes', 'spoils']);
  });

  it('Back opens unseen spoils first, and only leaves once they were seen or there are none', () => {
    expect(backAction({ page: 'summary', loot: 3, seenSpoils: false })).toBe('spoils');
    expect(backAction({ page: 'heroes', loot: 3, seenSpoils: false })).toBe('spoils');
    expect(backAction({ page: 'summary', loot: 3, seenSpoils: true })).toBe('leave');
    expect(backAction({ page: 'spoils', loot: 3, seenSpoils: true })).toBe('leave');
    expect(backAction({ page: 'summary', loot: 0, seenSpoils: false })).toBe('leave');
  });
});

describe('the Victory variant (campaign-arc.md R5.4)', () => {
  it('shows while the arc stands at won, for a victory only', () => {
    expect(isArcVictory('won', 'victory')).toBe(true);
    expect(isArcVictory('post', 'victory')).toBe(false);
    expect(isArcVictory('host', 'victory')).toBe(false);
    expect(isArcVictory('won', 'defeat')).toBe(false);
  });

  it('rolls every survivor by name, then the fallen', () => {
    const r = { heroes: [line('Nikias'), line('Damon', { died: true }), line('Kleon')] };
    expect(companyRoll(r)).toEqual({ survivors: ['Nikias', 'Kleon'], fallen: ['Damon'] });
  });

  it('the set piece is the legendary set item first in the loot', () => {
    expect(arcPiece([{ uid: 'a', def: 'achilles_helm', rarity: 'legendary', cond: 100 }])?.uid).toBe('a');
    expect(arcPiece([{ uid: 'b', def: 'corinthian', rarity: 'legendary', cond: 100 }])).toBeNull();
    expect(arcPiece([])).toBeNull();
  });
});

describe('spoils sections (campaign-arc.md R6)', () => {
  it('a lair hoard leads under its own header, the field after it', () => {
    expect(spoilSections(5, 0)).toEqual([{ title: null, from: 0, to: 5 }]);
    expect(spoilSections(5, 3)).toEqual([
      { title: 'results.hoard', from: 0, to: 3 },
      { title: 'results.field', from: 3, to: 5 },
    ]);
    expect(spoilSections(3, 3)).toEqual([{ title: 'results.hoard', from: 0, to: 3 }]);
  });
});

describe('summary notes and the hero of the battle (plan ANSWERS A-36, audit RES-5)', () => {
  it('no hero of the battle without a kill; nobody named in a defeat with 0 kills', () => {
    const heroes = [line('Nikias', { dmg: 30 }), line('Damon', { died: true })];
    const r = buildReport({ result: 'defeat', vs: 'x', ticks: 100, side: 0, stats: [stat('Nikias', 0, { dmg: 30 }), stat('Damon', 0, { dead: true })], heroes: [] });
    expect(r.mvp).toBeNull();
    const chips = noteChips({ heroes, bounty: 0, notes: [], mvp: null }, { practice: false });
    expect(chips.map((c) => c.text)).toEqual([t('results.noMvp')]);
  });

  it('promotions come first as a badge, then the bounty, the practice rule and the report notes', () => {
    const heroes = [line('Nikias', { kills: 2, levelsGained: 1 })];
    const chips = noteChips({ heroes, bounty: 45, notes: ['Hex taken!'], mvp: heroes[0] }, { practice: true });
    expect(chips.map((c) => c.tone)).toEqual(['badge', 'good', 'plain', 'plain']);
    expect(chips[1]).toMatchObject({ icon: 'coin', text: t('why.bounty', { n: 45 }) });
    expect(chips[3].text).toBe('Hex taken!');
  });
});

describe('losses count the dead, the knocked out and the fled (PLAY B4)', () => {
  it('counts all three, not the men still standing', () => {
    const stats = [stat('a', 0, { dead: true }), stat('b', 0, { dead: true, ko: true }), stat('c', 0, { fled: true }), stat('d', 0), stat('e', 1, { dead: true, killedBy: 0 })];
    const r = buildReport({ result: 'defeat', vs: 'x', ticks: 100, side: 0, stats, heroes: [] });
    expect(r.losses).toBe(3);
    expect(r.kills).toBe(1);
  });
});

describe('who the battle was against, in Russian too', () => {
  it('a band by its translated name, an unnamed army by its people', () => {
    const band = (n: string) => (n === 'Mercenaries' ? 'Наёмники' : n);
    setLang('ru');
    expect(vsName({ enemy: { culture: 'phoenician' } }, band)).toBe('карфагеняне');
    expect(vsName({ label: 'Mercenaries', enemy: { culture: 'greek' } }, band)).toBe('Наёмники');
    setLang('en');
    expect(vsName({ enemy: { culture: 'phoenician' } }, band)).toBe('Carthaginians');
  });
});

describe("the captain's bounty reaches Results (settleBattle, V5-042)", () => {
  it('a won battle that killed the captain carries his bounty on the last battle', () => {
    const p: PartyState = { id: 900, kind: 'mercs', name: 'Mercenaries', culture: 'greek', x: 1.5, y: 1.5, size: 6, power: 0, level: 2, tier: 2, seed: 7920, home: 0, mode: 'wander', tx: 1, ty: 1, idle: 0 };
    const c = Campaign.fresh(11);
    c.world.s.parties.push(p);
    p.power = partyArmy(p, { nextId: 1 }).power;
    const army = c.partyEnemy(p.id)!;
    const cap = army.heroes.find((h) => isCaptain(h))!;
    const mine = standardArmy(new Rng(1), c.data);
    for (const h of mine) setBotLevel(h, 8);
    c.data.heroes = mine;
    const pending = { enemy: army, seed: 1, partyId: p.id };
    const sim = new Battle(campaignSetup(pending, mine));
    sim.startBattle();
    // the band falls at once, its captain first
    for (const u of sim.units) if (u.side === 1) u.hp = 0.01;
    while (sim.phase !== 'ended' && sim.tick < 20 * 400) sim.step();
    const capUnit = sim.result().units.find((u) => u.heroId === cap.id)!;
    const last = settleBattle(c, pending, sim, army.heroes);
    expect(last.outcome.victory).toBe(true);
    expect(capUnit.state).toBe('dead');
    expect(last.bounty).toBe(captainBounty(cap.level));
    expect(last.bounty).toBeGreaterThan(0);
    expect(last.hoard).toBe(0);
  });
});
