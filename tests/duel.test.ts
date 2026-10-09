import { describe, expect, it } from 'vitest';
import { Battle } from '../src/sim/battle';
import { runToEnd } from './helpers';
import {
  DUEL_CLASSES, DUEL_RULES, accountLevel, catalogue, classPoints, dailyOffers, developHero, duelRecruit, findOffer, gearPrice, heroPoints,
  deltaParts, levelProgress, offerSummary, recruitPrice, respecHero, starterDuelRoster, teamPoints, teamProblem, xpForLevel,
} from '../src/duel/rules';
import {
  CHAPTERS, CHEST_TIERS, LADDER, canFight, chapterFloors, chapterMaxStars, chapterOf, chapterStars, chestItem, chestReward, chestState, floorBudget, isBoss,
  ladderFloor, ladderPayout, ladderSetup, ladderStars, lostShare, starsByFloor, validChest,
} from '../src/duel/ladder';
import { heroNeedsAttention, heroUses } from '../src/game/gear';
import { itemDef, itemMods, itemValue } from '../src/data/items';
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

  it('the duel level has one source: the profile level always matches its XP', async () => {
    const { DemoDuelSource } = await import('../src/duel/client');
    const { levelProgress, accountLevel } = await import('../src/duel/rules');
    const src = new DemoDuelSource();
    for (const xp of [0, 49, 50, 149, 150, 560, 5000]) {
      src.setXp(xp);
      const p = await src.profile();
      expect(p.level, `xp ${xp}`).toBe(levelProgress(p.xp).level);
      expect(p.level).toBe(accountLevel(xp));
    }
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

describe('ladder stars and chapters', () => {
  const team = starterDuelRoster(42, { nextId: 1 }, 'd1_');
  const unit = (id: string, state: 'ready' | 'dead' | 'fled') => ({ heroId: id, side: 0 as const, state, kills: 0, killedBy: -1, ko: false, hp: 1, maxHp: 1, wear: {} as never });

  it('stars by the share of team points lost; none for a loss', () => {
    expect(ladderStars(false, 0)).toBe(0);
    expect(ladderStars(true, 0)).toBe(3);
    expect(ladderStars(true, LADDER.stars3)).toBe(3);
    expect(ladderStars(true, 0.21)).toBe(2);
    expect(ladderStars(true, LADDER.stars2)).toBe(2);
    expect(ladderStars(true, 0.51)).toBe(1);
    expect(ladderStars(true, 1)).toBe(1);
    // the starter's 42 points: an archer (5) is under 20%, a hoplite (10) over, both hoplites under 50%
    const total = teamPoints(team);
    const one = lostShare({ units: team.map((h, i) => unit(h.id, i === 2 ? 'dead' : 'ready')) }, team);
    expect(one).toBeCloseTo(heroPoints(team[2]) / total);
    expect(ladderStars(true, lostShare({ units: team.map((h, i) => unit(h.id, i === 0 ? 'dead' : 'ready')) }, team))).toBe(2);
    expect(ladderStars(true, one)).toBe(3);
    const fled = lostShare({ units: team.map((h, i) => unit(h.id, i < 2 ? 'fled' : 'ready')) }, team);
    expect(ladderStars(true, fled)).toBe(2);
    expect(lostShare({ units: team.map((h) => unit(h.id, 'dead')) }, team)).toBe(1);
    // ladderPayout carries them
    const floor = ladderFloor(1);
    const pay = ladderPayout(floor, { winner: 0, ticks: 10, units: team.map((h) => unit(h.id, 'ready')) }, team, 0, 0, 1, { nextId: 1 }, 'x_');
    expect(pay).toMatchObject({ stars: 3, lost: 0 });
    const lostPay = ladderPayout(floor, { winner: 1, ticks: 10, units: team.map((h) => unit(h.id, 'dead')) }, team, 0, 0, 1, { nextId: 1 }, 'x_');
    expect(lostPay.stars).toBe(0);
  });

  it('5 chapters of 10 floors, the boss last; legacy cleared floors count 1 star', () => {
    expect(CHAPTERS).toBe(5);
    expect(chapterOf(1)).toBe(1);
    expect(chapterOf(10)).toBe(1);
    expect(chapterOf(11)).toBe(2);
    expect(chapterOf(50)).toBe(5);
    for (let c = 1; c <= CHAPTERS; c++) {
      const [a, b] = chapterFloors(c);
      expect(b - a + 1).toBe(10);
      expect(isBoss(b)).toBe(true);
      expect(chapterMaxStars(c)).toBe(30);
    }
    const stars = starsByFloor(12, new Map([[1, 3], [2, 2], [13, 2]]));
    expect(stars).toHaveLength(LADDER.floors);
    expect(stars.slice(0, 14)).toEqual([3, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 0]);
    expect(chapterStars(stars, 1)).toBe(13);
    expect(chapterStars(stars, 2)).toBe(4);
  });

  it('chests at 10/20/30 chapter stars, Glory scaling with the chapter, an item in the top tier', () => {
    expect(LADDER.chestStars).toEqual([10, 20, 30]);
    expect(chestReward(1, 1)).toEqual({ glory: 60, item: null });
    expect(chestReward(3, 1).glory).toBe(140);
    expect(chestReward(1, 3).item).toBe('rare');
    for (let t = 1; t <= CHEST_TIERS; t++) expect(chestReward(5, t).glory).toBeGreaterThan(chestReward(4, t).glory);
    const stars = starsByFloor(0, { 1: 3, 2: 3, 3: 1, 4: 3 });
    expect(chestState(stars, [], 1, 1)).toBe('ready');
    expect(chestState(stars, [], 1, 2)).toBe('locked');
    expect(chestState(stars, [{ chapter: 1, tier: 1 }], 1, 1)).toBe('claimed');
    expect(validChest(6, 1)).toBe(false);
    expect(validChest(1, 4)).toBe(false);
    for (let seed = 1; seed < 40; seed++) {
      const it = chestItem(seed, { nextId: 1 }, 'd1_', 1);
      expect(['rare', 'epic', 'legendary']).toContain(it.rarity);
      expect(it.uid.startsWith('d1_')).toBe(true);
    }
  });
});

describe('hero attention badge', () => {
  it('unspent points or a free perk slot', () => {
    const h = duelRecruit(7, { nextId: 1 }, 'd1_', 'hoplite', []);
    expect(heroNeedsAttention(h)).toBe(false);
    expect(heroNeedsAttention({ ...h, points: 1 })).toBe(true);
    expect(heroNeedsAttention({ ...h, level: 2 })).toBe(true);
    expect(heroNeedsAttention({ ...h, level: 2, perks: ['shield_drill'] })).toBe(false);
  });
});

describe('shop offer summary', () => {
  it('main stats and the delta against the best item the team wears in that slot', () => {
    const team = starterDuelRoster(42, { nextId: 1 }, 'd1_');
    const offer = catalogue().find((o) => o.def === 'cuirass' && o.rarity === 'rare')!;
    const s = offerSummary(offer, team);
    expect(s.slot).toBe('armor');
    expect(s.lines.length).toBeGreaterThan(0);
    expect(s.lines.length).toBeLessThanOrEqual(3);
    const best = team.map((h) => h.equip.armor).filter((x) => !!x).sort((a, b) => itemValue(b!) - itemValue(a!))[0] ?? null;
    expect(s.vs?.uid ?? null).toBe(best?.uid ?? null);
    const armor = s.lines.find((l) => l.key === 'armor')!;
    expect(armor.value).toBe(itemMods({ uid: 'o', def: 'cuirass', rarity: 'rare', cond: 100 }).armor);
    expect(armor.delta).toBeCloseTo(armor.value - (best ? itemMods(best).armor ?? 0 : 0), 2);
    // against nothing: the delta is the value, always better
    const bare = offerSummary(offer, []);
    expect(bare.vs).toBeNull();
    for (const l of bare.lines) {
      expect(l.delta).toBeCloseTo(l.value, 2);
      if (l.deltaText) expect(l.deltaText.startsWith(l.value > 0 ? '+' : '-')).toBe(true);
    }
    // the same item equipped: no change
    const same = offerSummary(offer, [{ ...team[0], equip: { ...team[0].equip, armor: { uid: 'z', def: 'cuirass', rarity: 'rare', cond: 100 } } }]);
    expect(same.lines.every((l) => l.better === null && l.deltaText === '')).toBe(true);
  });
});

describe('shop delta display', () => {
  it('the arrow follows the number, the colour the verdict; times carry seconds and a word', () => {
    // a slower blow: the number goes up (arrow up) and that is worse (red), "+0.2 s, slower"
    expect(deltaParts({ key: 'atkTime', delta: 0.2, deltaText: '+0.2', better: false })).toEqual({ up: true, better: false, text: '+0.2 s', note: 'slower' });
    expect(deltaParts({ key: 'atkTime', delta: -0.1, deltaText: '-0.1', better: true })).toEqual({ up: false, better: true, text: '-0.1 s', note: 'faster' });
    expect(deltaParts({ key: 'dmg', delta: 4.5, deltaText: '+4.5', better: true })).toEqual({ up: true, better: true, text: '+4.5', note: null });
    expect(deltaParts({ key: 'dmg', delta: 0, deltaText: '', better: null })).toBeNull();
    // every real summary agrees: up exactly when the delta is positive
    const team = starterDuelRoster(42, { nextId: 1 }, 'd1_');
    for (const o of catalogue()) for (const l of offerSummary(o, team).lines) {
      const d = deltaParts(l);
      if (d) expect(d.up).toBe(l.delta > 0);
    }
  });

  it('compares against one picked hero (his item in that slot, or nothing)', () => {
    const team = starterDuelRoster(42, { nextId: 1 }, 'd1_');
    const offer = catalogue().find((o) => o.def === 'cuirass' && o.rarity === 'rare')!;
    for (const h of team) {
      const s = offerSummary(offer, team, 3, h.id);
      expect(s.vsHeroId).toBe(h.id);
      expect(s.vs?.uid ?? null).toBe(h.equip.armor?.uid ?? null);
    }
    // nothing worn there: every line is new, shown once (not "value ▲ value")
    const bare = offerSummary(offer, [{ ...team[0], equip: { ...team[0].equip, armor: undefined } }], 3, team[0].id);
    expect(bare.lines.every((l) => l.isNew)).toBe(true);
  });
});

describe('shop compare: same slot and weapon class, on a hero who would use it (P0: a spear was compared with a bow)', () => {
  const team = starterDuelRoster(42, { nextId: 1 }, 'd1_'); // hoplite x2, archer x2, peltast, slinger
  const kindOf = (it: { def: string } | null | undefined) => (it ? itemDef(it.def).weaponKind : undefined);

  it('a spear is compared with a spearman\'s spear, never with a bow, a sling or javelins', () => {
    const offer = catalogue().find((o) => o.def === 'dory')!;
    const s = offerSummary(offer, team);
    expect(s.vsHeroId).not.toBeNull();
    expect(kindOf(s.vs)).toBe('spear');
    const vsHero = team.find((h) => h.id === s.vsHeroId)!;
    expect(heroUses(vsHero, itemDef('dory'))).toBe(true);
    // the users are the spearmen only
    for (const id of s.users) expect(kindOf(team.find((h) => h.id === id)!.equip.weapon)).toBe('spear');
  });

  it('every weapon offer is compared within its weapon class when anyone holds one', () => {
    for (const o of catalogue().filter((x) => itemDef(x.def).slot === 'weapon')) {
      const s = offerSummary(o, team);
      const kind = itemDef(o.def).weaponKind;
      if (team.some((h) => kindOf(h.equip.weapon) === kind)) expect(kindOf(s.vs)).toBe(kind);
      if (s.vsHeroId) expect(heroUses(team.find((h) => h.id === s.vsHeroId)!, itemDef(o.def))).toBe(true);
    }
  });

  it('a picked hero who would not use the item falls back to the best user, and says so', () => {
    const archer = team.find((h) => h.cls === 'archer')!;
    const s = offerSummary(catalogue().find((o) => o.def === 'dory')!, team, 3, archer.id);
    expect(s.pickedCannot).toBe(true);
    expect(s.vsHeroId).not.toBe(archer.id);
    expect(kindOf(s.vs)).toBe('spear');
    // a bow for the archer is compared with his own bow
    const bow = offerSummary(catalogue().find((o) => itemDef(o.def).weaponKind === 'bow')!, team, 3, archer.id);
    expect(bow.pickedCannot).toBe(false);
    expect(bow.vsHeroId).toBe(archer.id);
  });

  it('nobody uses it: no hero, no item, the full values', () => {
    const archers = team.filter((h) => h.cls === 'archer');
    const s = offerSummary(catalogue().find((o) => o.def === 'dory')!, archers);
    expect(s.vsHeroId).toBeNull();
    expect(s.vs).toBeNull();
    expect(s.users).toEqual([]);
  });

  it('shields: not for two-handed archers; helmets fit everyone', () => {
    const archer = team.find((h) => h.cls === 'archer')!;
    const hoplite = team.find((h) => h.cls === 'hoplite')!;
    expect(heroUses(archer, { slot: 'shield' })).toBe(false);
    expect(heroUses(hoplite, { slot: 'shield' })).toBe(true);
    expect(team.every((h) => heroUses(h, { slot: 'helmet' }))).toBe(true);
  });
});

describe('demo presets, stars and chests', () => {
  it('creates, duplicates, renames and deletes presets; claims a chest once', async () => {
    const { DemoDuelSource } = await import('../src/duel/client');
    const src = new DemoDuelSource({ now: () => 20000 * 86_400_000 + 5 });
    const p = await src.profile();
    expect(p.loadouts.map((l) => l.slot)).toEqual([1, 2]);
    expect(p.heroes.some((h) => h.points > 0)).toBe(true);
    expect(p.heroes.some((h) => h.points === 0 && heroNeedsAttention(h))).toBe(true);
    expect(chapterStars(p.ladder.stars, 1)).toBeGreaterThanOrEqual(10);
    const c = await src.createLoadout();
    expect(c.slot).toBe(3);
    expect(c.profile.loadout).toBe(3);
    expect(c.profile.team).toEqual(p.team);
    const d = await src.createLoadout({ from: 2, name: '  Copy  ' });
    expect(d.profile.loadouts.find((l) => l.slot === 4)).toMatchObject({ name: 'Copy', team: p.loadouts[1].team });
    const e = await src.createLoadout({ from: null });
    expect(e.profile.loadouts.find((l) => l.slot === 5)!.team).toEqual([]);
    await expect(src.createLoadout()).rejects.toMatchObject({ code: 'presets_full' });
    await expect(src.loadout({ slot: 3, name: 'x'.repeat(17) })).rejects.toMatchObject({ status: 400 });
    expect((await src.loadout({ slot: 3, name: 'Archers' })).profile.loadouts.find((l) => l.slot === 3)!.name).toBe('Archers');
    // deleting the defence preset moves the defence to the first one
    const del = await src.deleteLoadout(2);
    expect(del.profile.loadouts.map((l) => l.slot)).toEqual([1, 3, 4, 5]);
    expect(del.profile.use.defence).toBe(1);
    for (const s of [3, 4, 5]) await src.deleteLoadout(s);
    await expect(src.deleteLoadout(1)).rejects.toMatchObject({ code: 'last_preset' });
    // chests
    await expect(src.ladderChest(1, 2)).rejects.toMatchObject({ code: 'chest_locked' });
    const ch = await src.ladderChest(1, 1);
    expect(ch).toMatchObject({ glory: chestReward(1, 1).glory, item: null, replayed: false });
    expect(ch.profile.glory).toBe(p.glory + ch.glory);
    const again = await src.ladderChest(1, 1);
    expect(again.replayed).toBe(true);
    expect(again.profile.glory).toBe(ch.profile.glory);
    expect(again.profile.ladder.chests).toEqual([{ chapter: 1, tier: 1 }]);
  });
});
