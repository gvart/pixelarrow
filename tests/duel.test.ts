import { describe, expect, it } from 'vitest';
import { Battle } from '../src/sim/battle';
import { runToEnd } from './helpers';
import {
  DUEL_CLASSES, DUEL_RULES, accountLevel, catalogue, classPoints, dailyOffers, developHero, duelRecruit, findOffer, gearPrice, heroPoints,
  levelProgress, recruitPrice, respecHero, starterDuelRoster, teamPoints, teamProblem, xpForLevel,
} from '../src/duel/rules';
import { LADDER, canFight, floorBudget, isBoss, ladderFloor, ladderPayout, ladderSetup } from '../src/duel/ladder';
import { setBotLevel } from '../src/game/heroes';
import { CLASSES } from '../src/data/classes';

describe('duel point budget', () => {
  it('prices classes from their recruitment cost and doubles at level 10', () => {
    expect(classPoints('hoplite')).toBe(10);
    expect(classPoints('archer')).toBe(5);
    const h = duelRecruit(7, { nextId: 1 }, 'd1_', 'hoplite', []);
    expect(heroPoints(h)).toBe(10); // common gear is free
    setBotLevel(h, 10);
    expect(heroPoints(h)).toBe(20);
    h.equip.armor = { uid: 'x', def: 'cuirass', rarity: 'epic', cond: 100 };
    expect(heroPoints(h)).toBe(24);
  });

  it('the starter roster fits the first ladder floor and the ranked budget', () => {
    const team = starterDuelRoster(42, { nextId: 1 }, 'd1_');
    expect(team.map((h) => h.cls)).toEqual(['hoplite', 'hoplite', 'archer', 'archer', 'peltast', 'slinger']);
    expect(new Set(team.map((h) => h.id)).size).toBe(team.length);
    expect(team.every((h) => h.id.startsWith('d1_'))).toBe(true);
    expect(teamProblem(team, floorBudget(1))).toBeNull();
    expect(teamPoints(team)).toBeLessThan(DUEL_RULES.budget);
  });

  it('flags empty, oversized and over-budget teams', () => {
    const one = duelRecruit(1, { nextId: 1 }, 'p_', 'companion', []);
    expect(teamProblem([], 100)).toBe('empty');
    expect(teamProblem([one], 5)).toBe('over_budget');
    expect(teamProblem(Array.from({ length: 11 }, () => one), 9999)).toBe('too_many');
  });

  it('recruits with common, perfect gear and no trinket', () => {
    for (const { cls } of DUEL_CLASSES) {
      const h = duelRecruit(3, { nextId: 1 }, 'p_', cls, []);
      expect(h.cls).toBe(cls);
      expect(h.level).toBe(1);
      expect(h.equip.trinket).toBeUndefined();
      for (const it of Object.values(h.equip)) expect(it && it.rarity === 'common' && it.cond === 100).toBe(true);
      expect(recruitPrice(cls)).toBe(CLASSES[cls].cost);
      expect(CLASSES[cls].kind).not.toBe('animal');
    }
  });
});

describe('duel account level', () => {
  it('follows 25·n·(n-1) XP', () => {
    expect(xpForLevel(2)).toBe(50);
    expect(xpForLevel(5)).toBe(500);
    expect(accountLevel(0)).toBe(1);
    expect(accountLevel(499)).toBe(4);
    expect(accountLevel(500)).toBe(DUEL_RULES.rankedLevel);
    expect(levelProgress(60)).toEqual({ level: 2, into: 10, need: 100 });
    expect(accountLevel(1e9)).toBe(DUEL_RULES.maxAccountLevel);
  });
});

describe('hero development', () => {
  it('spends points within the cap and takes perks in tree order', () => {
    const h = duelRecruit(5, { nextId: 1 }, 'p_', 'hoplite', []);
    h.level = 2;
    h.points = 2;
    expect(developHero(h, { str: 3 }, [])).toBe('no_points');
    expect(developHero(h, { str: 20 }, [])).toBe('attr_max');
    expect(developHero(h, {}, ['unbreakable'])).toBe('bad_perk');
    const d = developHero(h, { str: 1, end: 1 }, ['shield_drill']);
    expect(typeof d).toBe('object');
    if (typeof d === 'object') {
      expect(d.points).toBe(0);
      expect(d.attrs.str).toBe(h.attrs.str + 1);
      expect(d.perks).toEqual(['shield_drill']);
      const r = respecHero(d, h.attrs);
      expect(r.attrs).toEqual(h.attrs);
      expect(r.points).toBe(2);
      expect(r.perks).toEqual([]);
    }
  });
});

describe('duel shop', () => {
  it('sells every item at common, uncommon and rare', () => {
    const c = catalogue();
    expect(c.every((o) => DUEL_RULES.shopRarities.includes(o.rarity))).toBe(true);
    expect(findOffer('dory:rare', 0)?.price).toBe(gearPrice('dory', 'rare'));
    expect(findOffer('dory:epic', 0)).toBeNull();
  });

  it('daily offers are stable per UTC day: three rares and an epic, at a discount', () => {
    const a = dailyOffers(20000);
    expect(a).toEqual(dailyOffers(20000));
    expect(a.map((o) => o.rarity)).toEqual(['rare', 'rare', 'rare', 'epic']);
    expect(new Set(a.map((o) => o.def)).size).toBe(4);
    expect(a[0].price).toBeLessThan(gearPrice(a[0].def, a[0].rarity));
    expect(findOffer(a[3].id, 20000)).toEqual(a[3]);
    expect(findOffer(a[3].id, 20001)).toBeNull();
  });
});

describe('duel ladder', () => {
  it('floors are deterministic, grow, and fit their point target', () => {
    expect(ladderFloor(7)).toEqual(ladderFloor(7));
    const f1 = ladderFloor(1);
    const f40 = ladderFloor(40);
    expect(f1.points).toBeLessThanOrEqual(f1.budget);
    expect(f40.points).toBeGreaterThan(f1.points);
    expect(f40.heroes.length).toBeLessThanOrEqual(DUEL_RULES.teamMax);
    expect(isBoss(10) && ladderFloor(10).boss).toBe(true);
    expect(ladderFloor(10).reward.firstGlory).toBe(2 * (40 + 80));
    expect(floorBudget(LADDER.floors)).toBe(DUEL_RULES.budget);
    for (const h of f40.heroes) expect(h.id.startsWith('lad40_')).toBe(true);
  });

  it('only cleared floors and the next one can be fought', () => {
    expect(canFight(1, 0)).toBe(true);
    expect(canFight(2, 0)).toBe(false);
    expect(canFight(5, 7)).toBe(true);
    expect(canFight(0, 7)).toBe(false);
    expect(canFight(51, 50)).toBe(false);
  });

  it('a played floor pays XP without deaths, wounds or wear', () => {
    const team = starterDuelRoster(9, { nextId: 1 }, 'p_');
    const floor = ladderFloor(1);
    const setup = ladderSetup(1234, team, ['line', 'skirmish', 'line', 'column'], floor);
    setup.armies[0].bot = true; // let the bot play the player's side
    const sim = new Battle(setup);
    sim.startBattle();
    runToEnd(sim);
    const result = sim.result();
    const out = ladderPayout(floor, result, team, 0, 100, 1234, { nextId: 50 }, 'p_');
    expect(out.heroes.length).toBe(team.length);
    for (const h of out.heroes) for (const it of Object.values(h.equip)) expect(it?.cond).toBe(100);
    expect(out.xp.every((x) => x.xp > 0)).toBe(true);
    if (out.won) {
      expect(out.firstClear).toBe(true);
      expect(out.glory).toBe(floor.reward.firstGlory);
      expect(out.drop).not.toBeNull();
      expect(out.drop!.rarity).not.toBe('common');
    } else expect(out.glory).toBe(0);
  });

  it('farm Glory respects the daily cap', () => {
    const team = starterDuelRoster(9, { nextId: 1 }, 'p_');
    const floor = ladderFloor(3);
    const won = { winner: 0 as const, ticks: 10, units: team.map((h) => ({ heroId: h.id, side: 0 as const, state: 'idle' as never, kills: 1, killedBy: -1, ko: false, hp: 1, maxHp: 1, wear: {} as never })) };
    const a = ladderPayout(floor, won, team, 5, 5, 1, { nextId: 1 }, 'p_');
    expect(a.firstClear).toBe(false);
    expect(a.glory).toBe(5);
    expect(a.capped).toBe(floor.reward.farmGlory - 5);
  });
});

describe('demo duel source', () => {
  it('applies the shared rules locally: recruit, team, buy, sell, develop errors', async () => {
    const { DemoDuelSource } = await import('../src/duel/client');
    const src = new DemoDuelSource({ fresh: true, now: () => 20000 * 86_400_000 + 5 });
    const p = await src.profile();
    expect(p.glory).toBe(DUEL_RULES.startGlory);
    expect(p.team).toHaveLength(6);
    const r = await src.recruit('archer');
    expect(r.profile.heroes).toHaveLength(7);
    expect(r.profile.glory).toBe(DUEL_RULES.startGlory - 50);
    await expect(src.recruit('companion')).rejects.toMatchObject({ code: 'locked' });
    const t = await src.team({ heroIds: [...r.profile.team, r.hero.id] });
    expect(t.profile.team).toHaveLength(7);
    const day = dailyOffers(20000)[0];
    const b = await src.buy('dory:common');
    expect(b.profile.stash).toHaveLength(1);
    expect((await src.buy(day.id)).profile.bought).toEqual([day.id]);
    await expect(src.buy(day.id)).rejects.toMatchObject({ code: 'sold_out' });
    const s = await src.sell(b.item.uid);
    expect(s.profile.stash).toHaveLength(1);
    await expect(src.develop(p.heroes[0].id, { str: 1 }, [])).rejects.toMatchObject({ code: 'no_points' });
    await expect(src.ladderStart(2)).rejects.toMatchObject({ code: 'floor_locked' });
  });

  it('a ladder ticket pays out from the simulated result', async () => {
    const { DemoDuelSource } = await import('../src/duel/client');
    const src = new DemoDuelSource({ fresh: true });
    const tk = await src.ladderStart(1);
    expect(tk.enemies.map((h) => h.id)).toEqual(ladderFloor(1).heroes.map((h) => h.id));
    const won = { winner: 0 as const, ticks: 100, units: tk.team.map((h) => ({ heroId: h.id, side: 0 as const, state: 'idle' as never, kills: 1, killedBy: -1, ko: false, hp: 1, maxHp: 1, wear: {} as never })) };
    const r = await src.ladderSubmit(tk.ticket, { orders: [], deployOrders: 0, claim: { winner: 0, ticks: 100, hash: '' } }, won);
    expect(r.firstClear).toBe(true);
    expect(r.profile.ladder.cleared).toBe(1);
    expect(r.profile.glory).toBe(DUEL_RULES.startGlory + ladderFloor(1).reward.firstGlory);
    expect(r.profile.stash).toHaveLength(1);
    await expect(src.ladderSubmit(tk.ticket, { orders: [], deployOrders: 0, claim: { winner: 0, ticks: 100, hash: '' } }, won)).rejects.toMatchObject({ status: 404 });
  });
});
