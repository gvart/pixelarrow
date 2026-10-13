import { beforeAll, describe, expect, it } from 'vitest';
import { createDeployClock, DEPLOY_MS, foeIsReady, markStarted, pressReady, secondsLeft, tickDeploy, urgent } from '../src/online/deployClock';
import { fmtClock } from '../src/util/format';
import { buildReport, drainLogged, emptyLog, lastBattle, pickMvp, resultFor, unitStats, whyLine, WHY_MAX_LINES, type BattleLog, type HeroLine, type LogEvent, type UnitStat, type WhyPart } from '../src/game/report';
import { resolveBattle } from '../src/game/loot';
import { Battle, TICK_RATE } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import { runToEnd, standardSetup } from './helpers';
import { allStrings, setLang, t, table, type TKey } from '../src/i18n';
import { WHY_EN } from '../src/i18n/why.en';
import { BATTLE_EN } from '../src/i18n/battle.en';
import { missingGlyphs, wrapText } from '../src/ui/textfit';

/** The why-line's width on the narrowest Results (320x568: 160 UI px, less the frame and the page insets). */
const WHY_MIN_W = 160 - 2 * 7 - 12;

describe('online deployment clock (15 s, Ready, no pause)', () => {
  it('counts 15 seconds down and starts an attack when the time is up', () => {
    const c = createDeployClock('attack');
    expect(c.total).toBe(DEPLOY_MS);
    expect(DEPLOY_MS).toBe(15_000);
    expect(secondsLeft(c)).toBe(15);
    expect(tickDeploy(c, 4_200)).toEqual([]);
    expect(secondsLeft(c)).toBe(11);
    expect(urgent(c)).toBe(false);
    expect(tickDeploy(c, 6_000)).toEqual([]);
    expect(urgent(c)).toBe(true);
    expect(tickDeploy(c, 10_000)).toEqual(['start']);
    expect(c.left).toBe(0);
    expect(c.started).toBe(true);
    // nothing more once started
    expect(tickDeploy(c, 1000)).toEqual([]);
    expect(pressReady(c)).toEqual([]);
  });

  it('Ready starts an attack against the AI at once', () => {
    const c = createDeployClock('attack');
    tickDeploy(c, 2000);
    expect(pressReady(c)).toEqual(['start']);
    expect(c.started).toBe(true);
    expect(pressReady(c)).toEqual([]);
    expect(tickDeploy(c, 20_000)).toEqual([]);
  });

  it('a duel: Ready is sent once (by the button or the clock); the battle waits for the server', () => {
    const c = createDeployClock('duel');
    expect(pressReady(c)).toEqual(['sendReady']);
    expect(pressReady(c)).toEqual([]);
    // the clock running out does not send again, and never starts by itself
    expect(tickDeploy(c, 20_000)).toEqual([]);
    expect(c.started).toBe(false);
    markStarted(c);
    expect(c.started).toBe(true);

    const d = createDeployClock('duel');
    foeIsReady(d);
    expect(d.foeReady).toBe(true);
    expect(tickDeploy(d, 14_999)).toEqual([]);
    expect(tickDeploy(d, 1)).toEqual(['sendReady']);
    expect(d.ready).toBe(true);
    expect(tickDeploy(d, 1000)).toEqual([]);
  });

  it('ignores negative time steps', () => {
    const c = createDeployClock('attack');
    tickDeploy(c, -5000);
    expect(c.left).toBe(DEPLOY_MS);
  });
});

function line(name: string, kills: number, dmg: number, died = false): HeroLine {
  return { heroId: name, name, hero: null, kills, dmg, died, wounded: false, xp: 0, levelBefore: 1, xpBefore: 0, levelsGained: 0 };
}

describe('post-battle report', () => {
  it('MVP: most kills, then most damage; nobody without a kill (ANSWERS A-36)', () => {
    expect(pickMvp([line('a', 1, 50), line('b', 3, 10), line('c', 3, 12)])!.name).toBe('c');
    expect(pickMvp([line('a', 0, 0)])).toBeNull();
    // damage alone does not make a "Hero of the battle" (PLAY B4: one with 0 kills in a defeat)
    expect(pickMvp([line('a', 0, 4), line('b', 0, 9)])).toBeNull();
    expect(pickMvp([line('a', 0, 90), line('b', 1, 2)])!.name).toBe('b');
  });

  it('formats the duration and maps winners to results', () => {
    expect(fmtClock(0)).toBe('0:00');
    expect(fmtClock(65)).toBe('1:05');
    expect(fmtClock(600)).toBe('10:00');
    expect(resultFor(0, 0)).toBe('victory');
    expect(resultFor(1, 0)).toBe('defeat');
    expect(resultFor(0, 1)).toBe('defeat');
    expect(resultFor(-1, 1)).toBe('draw');
    expect(resultFor(1, 0, 0)).toBe('retreat');
  });

  it('Losses counts every man struck down, in a duel too (B4)', () => {
    const hero = (id: string) => ({ id, name: id, level: 1, xp: 0 }) as never;
    const stat = (heroId: string, side: 0 | 1, dead: boolean, ko = false): UnitStat => ({ heroId, side, kills: 0, dmg: 0, dead, ko, killedBy: dead ? 1 - side : -1 }) as UnitStat;
    // a duel (no permadeath, no outcomes): all six of mine fell
    const mine = ['a', 'b', 'c', 'd', 'e', 'f'];
    const duel = buildReport({ result: 'defeat', vs: 'vs Bot', ticks: 600, side: 0, stats: [...mine.map((id) => stat(id, 0, true)), stat('x', 1, false)], heroes: mine.map(hero) });
    expect(duel.losses).toBe(6);
    // a campaign defeat: one knocked out (wounded, lives), two fled, one dead for good
    const camp = buildReport({
      result: 'defeat',
      vs: 'vs Bandits',
      ticks: 600,
      side: 0,
      stats: [stat('a', 0, true, true), stat('b', 0, false), stat('c', 0, false), stat('d', 0, true), stat('x', 1, false)],
      heroes: ['a', 'b', 'c', 'd'].map(hero),
      outcomes: [
        { heroId: 'a', name: 'a', died: false, wounded: true, fled: false, kills: 0, xp: 6, levelsGained: 0 },
        { heroId: 'b', name: 'b', died: false, fled: true, kills: 0, xp: 6, levelsGained: 0 },
        { heroId: 'c', name: 'c', died: false, fled: true, kills: 0, xp: 6, levelsGained: 0 },
        { heroId: 'd', name: 'd', died: true, fled: false, kills: 0, xp: 0, levelsGained: 0 },
      ] as never,
    });
    expect(camp.losses).toBe(2);
    expect(camp.heroes.filter((h) => h.died)).toHaveLength(1);
  });

  it('numbers of a real battle: kills, losses, gold, XP and the per-hero rows', () => {
    const { setup, player, enemy } = standardSetup(77, true);
    const b = new Battle(setup);
    runToEnd(b);
    const stats = unitStats(b);
    const before = JSON.parse(JSON.stringify(player));
    const { outcome } = resolveBattle(b.result(), player, enemy, new Rng(5));
    const r = buildReport({ result: resultFor(b.winner ?? -1, 0), vs: 'vs Test', ticks: b.tick, side: 0, stats, heroes: before, outcomes: outcome.heroes, gold: outcome.gold, loot: outcome.loot, picks: outcome.picks });
    expect(r.duration).toBe(Math.round(b.tick / TICK_RATE));
    expect(r.kills).toBe(outcome.enemyKilled);
    expect(r.enemyTotal).toBe(outcome.enemyTotal);
    expect(r.losses).toBe(stats.filter((s) => s.side === 0 && (s.dead || s.fled)).length);
    expect(r.gold).toBe(outcome.gold);
    expect(r.xp).toBe(outcome.heroes.reduce((a, h) => a + h.xp, 0));
    expect(r.heroes).toHaveLength(player.length);
    expect(r.picks).toBe(Math.min(outcome.picks, outcome.loot.length));
    // per hero: kills and damage from the sim, level before from the outcome
    for (const h of r.heroes) {
      const s = stats.find((x) => x.heroId === h.heroId)!;
      expect(h.kills).toBe(s.kills);
      expect(h.dmg).toBe(s.dmg);
      const o = outcome.heroes.find((x) => x.heroId === h.heroId)!;
      expect(h.died).toBe(o.died);
      if (!o.died) expect(h.levelBefore).toBe(o.levelBefore);
    }
    // the fallen come last
    const firstDead = r.heroes.findIndex((h) => h.died);
    if (firstDead >= 0) expect(r.heroes.slice(firstDead).every((h) => h.died)).toBe(true);
    if (r.mvp) expect(r.heroes.every((h) => h.kills <= r.mvp!.kills)).toBe(true);
  });

  it('a friendly duel: no outcomes, so nobody died and nobody gains XP; side 1 sees its own men', () => {
    const stats: UnitStat[] = [
      { heroId: 'a1', side: 0, kills: 2, dmg: 40, dead: true, ko: false, killedBy: 1 },
      { heroId: 'b1', side: 1, kills: 1, dmg: 30, dead: false, ko: false, killedBy: -1 },
      { heroId: 'b2', side: 1, kills: 0, dmg: 5, dead: true, ko: false, killedBy: 0 },
    ];
    const r = buildReport({ result: resultFor(1, 1), vs: 'vs A', ticks: 400, side: 1, stats, heroes: [], online: 'duel', verified: true });
    expect(r.result).toBe('victory');
    expect(r.heroes.map((h) => h.heroId)).toEqual(['b1', 'b2']);
    expect(r.heroes.every((h) => !h.died && h.xp === 0)).toBe(true);
    expect(r.kills).toBe(1);
    expect(r.enemyTotal).toBe(1);
    expect(r.mvp!.heroId).toBe('b1');
    expect(r.verified).toBe(true);
  });

  it('online outcomes without ids match heroes by name', () => {
    const stats: UnitStat[] = [{ heroId: 'h1', side: 0, kills: 0, dmg: 0, dead: true, ko: true, killedBy: 1 }];
    const hero = { id: 'h1', name: 'Leonidas', level: 3, xp: 20 } as unknown as Parameters<typeof buildReport>[0]['heroes'][number];
    const r = buildReport({ result: 'defeat', vs: 'x', ticks: 0, side: 0, stats, heroes: [hero], outcomes: [{ name: 'Leonidas', died: false, wounded: true, xp: 9, levelsGained: 0 }] });
    expect(r.heroes[0]).toMatchObject({ name: 'Leonidas', wounded: true, died: false, xp: 9, levelBefore: 3, xpBefore: 20 });
  });
});

describe('battle strings', () => {
  it('every battle and report key exists in Russian, with the same parameters, drawable by the pixel font', () => {
    const ru = table('ru') as Record<string, unknown>;
    const params = (v: unknown) => [...new Set(JSON.stringify(v).match(/\{\w+\}/g) ?? [])].sort().join();
    for (const [k, v] of Object.entries(BATTLE_EN)) {
      expect(ru[k], k).toBeDefined();
      expect(params(ru[k]), k).toBe(params(v));
    }
    for (const { key, text } of [...allStrings('en'), ...allStrings('ru')].filter((s) => s.key.startsWith('battle.') || s.key.startsWith('results.'))) {
      expect(missingGlyphs(text.replace(/\{\w+\}/g, '')), key).toEqual([]);
    }
  });
});

// ---- the why-line (RD-03, design/gdd/battle-readability.md R5)

/**
 * A recorded-event fixture: side 0 has groups I and II, side 1 groups 2 and 3;
 * units 0-7 are ours, 8-15 theirs; unit 8 is their captain (hero 'cap'),
 * unit 0 ours ('ourCap').
 */
function fixture(events: LogEvent[], extra: Partial<BattleLog> = {}): BattleLog {
  const log = emptyLog();
  for (let i = 0; i < 16; i++) log.units.push({ side: i < 8 ? 0 : 1, heroId: i === 8 ? 'cap' : i === 0 ? 'ourCap' : `h${i}` });
  log.groups = [
    { side: 0, numeral: 'I' },
    { side: 0, numeral: 'II' },
    { side: 1, numeral: 'I' },
    { side: 1, numeral: '*' },
  ];
  log.events = [...events].sort((a, b) => a.tick - b.tick);
  log.ticks = Math.max(0, ...events.map((e) => e.tick));
  return Object.assign(log, extra);
}
const s = (sec: number) => sec * TICK_RATE;
const keys = (parts: WhyPart[]) => parts.map((p) => p.key);
const say = (parts: WhyPart[]) => parts.map((p) => t(p.key as TKey, p.params)).join(' ');
const contact = (sec: number): LogEvent => ({ type: 'contact', tick: s(sec), side: 0, group: 0 });
const rout = (sec: number, side: 0 | 1, group: number): LogEvent => ({ type: 'rout', tick: s(sec), side, group });
const flanked = (sec: number, side: 0 | 1, group: number): LogEvent => ({ type: 'flanked', tick: s(sec), side, group });
const death = (sec: number, unit: number): LogEvent => ({ type: 'death', tick: s(sec), unit, by: -1 });
const cohesion = (sec: number, side: 0 | 1, group: number): LogEvent => ({ type: 'cohesion', tick: s(sec), side, group, targets: [] });
const armyBreak = (sec: number, side: 0 | 1): LogEvent => ({ type: 'armyBreak', tick: s(sec), side });
const standardLost = (sec: number, side: 0 | 1, unit: number): LogEvent => ({ type: 'standardLost', tick: s(sec), side, unit });
const retreat = (sec: number, side: 0 | 1): LogEvent => ({ type: 'retreat', tick: s(sec), side, caught: 0, pursuit: 0 });

describe('why-line rules (R5), one recorded fixture per rule', () => {
  beforeAll(() => setLang('en'));

  it('flanked: our first routed group was flanked within 10 s before it broke', () => {
    const log = fixture([contact(10), flanked(30, 0, 1), rout(38, 0, 1), rout(50, 0, 0), armyBreak(51, 0)]);
    const why = whyLine(log, 0, 'defeat');
    expect(keys(why)).toEqual(['why.lost.flanked']);
    expect(say(why)).toBe('Group II was flanked and broke.');
    // a flank more than 10 s before the rout does not explain it: the army break is left
    const early = fixture([contact(10), flanked(20, 0, 1), rout(38, 0, 1), rout(50, 0, 0), armyBreak(51, 0)]);
    expect(keys(whyLine(early, 0, 'defeat'))).toEqual(['why.lost.armyBreak']);
    // the mirror: we flanked the first of their groups to break
    expect(say(whyLine(fixture([contact(10), flanked(40, 1, 2), rout(42, 1, 2)]), 0, 'victory'))).toBe('We broke their flank at 0:42.');
  });

  it('cohesion cascade: the first rout shook its neighbours and more groups broke soon after', () => {
    const log = fixture([contact(10), rout(40, 0, 0), cohesion(40, 0, 0), rout(46, 0, 1)]);
    expect(say(whyLine(log, 0, 'defeat'))).toBe('Group I broke, and the rout spread down the line.');
    // no second rout within 10 s: not a cascade, so the fallback
    const slow = fixture([contact(10), rout(40, 0, 0), cohesion(40, 0, 0), rout(70, 0, 1)]);
    expect(keys(whyLine(slow, 0, 'defeat'))).toEqual(['why.lost.held']);
    expect(keys(whyLine(fixture([contact(10), rout(40, 1, 2), cohesion(40, 1, 2), rout(45, 1, 3)]), 0, 'victory'))).toEqual(['why.won.cascade']);
  });

  it('army break is the last real rule: only when nothing earlier explains the defeat', () => {
    const log = fixture([contact(10), rout(40, 0, 0), rout(70, 0, 1), armyBreak(71, 0)]);
    expect(say(whyLine(log, 0, 'defeat'))).toBe('Our army broke after 2 groups routed.');
    // a flank (an earlier rule) wins over the army break that followed it
    const flank = fixture([contact(10), flanked(38, 0, 0), rout(40, 0, 0), rout(70, 0, 1), armyBreak(71, 0)]);
    expect(keys(whyLine(flank, 0, 'defeat'))).toEqual(['why.lost.flanked']);
    expect(say(whyLine(fixture([contact(10), rout(40, 1, 2), rout(61, 1, 3), armyBreak(62, 1)]), 0, 'victory'))).toBe('Their army broke after 2 groups routed.');
    // men fell faster than any group routed: no "after 0 groups"
    expect(say(whyLine(fixture([contact(10), armyBreak(11, 0)]), 0, 'defeat'))).toBe('Our army broke as its men fell.');
  });

  it('focus fire won: our missiles were focused on the enemy group that broke first', () => {
    const log = fixture([contact(10), rout(55, 1, 3)], { focus: [{ tick: s(20), side: 0, group: 1, target: 3 }] });
    expect(say(whyLine(log, 0, 'victory'))).toBe('Our focused volleys broke their line at 0:55.');
    // focus cleared before the rout: no credit
    const cleared = fixture([contact(10), rout(55, 1, 3)], { focus: [{ tick: s(20), side: 0, group: 1, target: 3 }, { tick: s(30), side: 0, group: 1, target: -1 }] });
    expect(keys(whyLine(cleared, 0, 'victory'))).toEqual(['why.won.held']);
    // the enemy's focus is not one of our defeat lines
    const theirs = fixture([contact(10), rout(55, 0, 0)], { focus: [{ tick: s(20), side: 1, group: 2, target: 0 }] });
    expect(keys(whyLine(theirs, 0, 'defeat'))).toEqual(['why.lost.held']);
  });

  it('standard lost: our standard fell before our first rout', () => {
    const log = fixture([contact(10), standardLost(30, 0, 3), flanked(39, 0, 0), rout(40, 0, 0), armyBreak(60, 0)]);
    expect(say(whyLine(log, 0, 'defeat'))).toBe('We lost the standard, and the line wavered.');
    // after the first rout it is not the cause
    const after = fixture([contact(10), rout(40, 0, 0), standardLost(45, 0, 3), rout(70, 0, 1), armyBreak(71, 0)]);
    expect(keys(whyLine(after, 0, 'defeat'))).toEqual(['why.lost.armyBreak']);
    expect(keys(whyLine(fixture([contact(10), standardLost(30, 1, 9), rout(40, 1, 2)]), 0, 'victory'))).toEqual(['why.won.standard']);
  });

  it('captain killed: a band captain fell before his side broke (checked first: he also carries the standard)', () => {
    const log = fixture([contact(10), death(25, 8), standardLost(25, 1, 8), rout(40, 1, 2)]);
    expect(say(whyLine(log, 0, 'victory', { captains: ['cap'] }))).toBe('We cut down their captain at 0:25.');
    // without knowing who the captain was, the standard rule explains it
    expect(keys(whyLine(log, 0, 'victory'))).toEqual(['why.won.standard']);
    const ours = fixture([contact(10), death(25, 0), rout(40, 0, 0)]);
    expect(say(whyLine(ours, 0, 'defeat', { captains: ['ourCap'] }))).toBe('Our captain fell at 0:25, and the line wavered.');
  });

  it('outnumbered: fewer active men at first contact, ratio 0.75 or less', () => {
    // 3 of ours died before contact: 5 vs 8 = 0.625
    const log = fixture([death(5, 1), death(6, 2), death(7, 3), contact(10), rout(40, 0, 0)]);
    expect(say(whyLine(log, 0, 'defeat'))).toBe('Outnumbered 5 to 8 at the clash.');
    // 6 vs 8 = 0.75 counts; 7 vs 8 does not
    expect(keys(whyLine(fixture([death(5, 1), death(6, 2), contact(10)]), 0, 'defeat'))).toEqual(['why.lost.outnumbered']);
    expect(keys(whyLine(fixture([death(5, 1), contact(10)]), 0, 'defeat'))).toEqual(['why.lost.held']);
    // routing men are not active, rallied ones are
    const fled = fixture([{ type: 'unitRout', tick: s(4), unit: 1 }, { type: 'unitRout', tick: s(4), unit: 2 }, { type: 'rally', tick: s(6), unit: 2 }, death(7, 3), contact(10)]);
    expect(say(whyLine(fled, 0, 'defeat'))).toBe('Outnumbered 6 to 8 at the clash.');
    expect(say(whyLine(fixture([death(5, 9), death(5, 10), death(5, 11), contact(10)]), 0, 'victory'))).toBe('We outnumbered them 8 to 5 at the clash.');
  });

  it('out of range: our missile groups spent over 30% of their time out of range (a defeat only)', () => {
    const log = fixture([contact(10), rout(40, 0, 0)], { shootTicks: [s(100), s(100)], outTicks: [s(40), 0] });
    expect(keys(whyLine(log, 0, 'defeat'))).toEqual(['why.lost.range']);
    expect(keys(whyLine(fixture([contact(10), rout(40, 0, 0)], { shootTicks: [s(100), 0], outTicks: [s(30), 0] }), 0, 'defeat'))).toEqual(['why.lost.held']);
  });

  it("a win by enemy retreat says 'They withdrew at {t}'; our retreat keeps the cause before it", () => {
    const log = fixture([contact(10), retreat(83, 1)]);
    expect(say(whyLine(log, 0, 'victory', { enemyRetreated: true }))).toBe('They withdrew at 1:23.');
    // the log alone tells it (an offline report has no `retreated`)
    expect(say(whyLine(log, 0, 'victory'))).toBe('They withdrew at 1:23.');
    const ours = fixture([contact(10), flanked(30, 0, 1), rout(35, 0, 1), retreat(50, 0), armyBreak(60, 0)]);
    expect(say(whyLine(ours, 0, 'retreat'))).toBe('Group II was flanked and broke. We withdrew at 0:50.');
    // what came after the retreat order is not its cause
    const plain = fixture([contact(10), retreat(20, 0), rout(30, 0, 0), armyBreak(31, 0)]);
    expect(keys(whyLine(plain, 0, 'retreat'))).toEqual(['why.withdrew']);
  });

  it('every defeat carries a line: with no rule matched, and with no log at all', () => {
    expect(keys(whyLine(fixture([]), 0, 'defeat'))).toEqual(['why.lost.held']);
    expect(keys(whyLine(null, 0, 'defeat'))).toEqual(['why.lost.held']);
    expect(keys(whyLine(null, 1, 'retreat'))).toEqual(['why.withdrew']);
    expect(keys(whyLine(null, 0, 'draw'))).toEqual(['why.draw']);
    expect(whyLine(null, 0, 'victory')).toEqual([]);
  });

  it('side 1 reads the same events from its own side; men fighting alone get the line wording', () => {
    const log = fixture([contact(10), flanked(30, 1, 3), rout(32, 1, 3)]);
    expect(keys(whyLine(log, 1, 'defeat'))).toEqual(['why.lost.flankedLine']);
    expect(keys(whyLine(log, 0, 'victory'))).toEqual(['why.won.flanked']);
  });
});

describe('why-line from real battles', () => {
  beforeAll(() => setLang('en'));

  it('100% of defeats carry a line, every key translated', () => {
    let defeats = 0;
    const seen = new Set<string>();
    for (let seed = 1; seed <= 16; seed++) {
      const b = new Battle(standardSetup(seed * 7 + 3, true).setup);
      b.startBattle();
      for (let i = 0; i < 20 * 400 && b.phase !== 'ended'; i++) {
        b.step();
        drainLogged(b);
      }
      const stats = unitStats(b);
      const log = lastBattle.log!;
      expect(log.ticks).toBe(b.tick);
      for (const side of [0, 1] as const) {
        const result = resultFor(b.winner ?? -1, side, b.retreated);
        const why = buildReport({ result, vs: '', ticks: b.tick, side, stats, heroes: [], log, retreated: b.retreated }).why;
        if (result === 'defeat' || result === 'retreat') {
          defeats++;
          expect(why.length, `seed ${seed} side ${side}`).toBeGreaterThan(0);
        }
        for (const p of why) {
          seen.add(p.key);
          expect(say([p])).not.toMatch(/\{\w+\}|^why\./);
        }
      }
    }
    expect(defeats).toBeGreaterThanOrEqual(10);
    // real battles reach real causes, not only the fallback
    expect([...seen].some((k) => !k.endsWith('.held'))).toBe(true);
  }, 60_000);

  it('an abandoned battle fought out without draining logs the same events as a drained one', () => {
    const run = (drain: boolean) => {
      const b = new Battle(standardSetup(41, true).setup);
      b.startBattle();
      for (let i = 0; i < 20 * 400 && b.phase !== 'ended'; i++) {
        b.step();
        if (drain) drainLogged(b);
      }
      unitStats(b);
      return lastBattle.log!;
    };
    const drained = run(true);
    const fought = run(false);
    expect(fought.events).toEqual(drained.events);
    expect(whyLine(fought, 0, 'defeat')).toEqual(whyLine({ ...drained, shootTicks: [0, 0], outTicks: [0, 0] }, 0, 'defeat'));
  }, 30_000);

  it('only drainLogged logs: the sim\'s own drainEvents is not patched (BTL-01)', () => {
    const b = new Battle(standardSetup(41, true).setup);
    b.startBattle();
    for (let i = 0; i < 20 * 60 && b.phase !== 'ended'; i++) {
      b.step();
      b.drainEvents();
    }
    unitStats(b);
    expect(lastBattle.log!.events.length).toBe(0);
    const c = new Battle(standardSetup(41, true).setup);
    c.startBattle();
    for (let i = 0; i < 20 * 60 && c.phase !== 'ended'; i++) {
      c.step();
      drainLogged(c);
    }
    unitStats(c);
    expect(lastBattle.log!.events.length).toBeGreaterThan(0);
  }, 30_000);

  it('a drain after the battle closed its log does not count the same events twice', () => {
    const b = new Battle(standardSetup(9, true).setup);
    runToEnd(b);
    unitStats(b);
    const n = lastBattle.log!.events.length;
    drainLogged(b);
    expect(lastBattle.log!.events.length).toBe(n);
  }, 30_000);
});

describe('why-line strings', () => {
  it('every why key is in Russian with the same parameters, drawable, and wraps without an ellipsis at 320 px', () => {
    const ru = table('ru') as Record<string, unknown>;
    const params = (v: unknown) => [...new Set(JSON.stringify(v).match(/\{\w+\}/g) ?? [])].sort().join();
    for (const [k, v] of Object.entries(WHY_EN)) {
      expect(ru[k], k).toBeDefined();
      expect(params(ru[k]), k).toBe(params(v));
    }
    const longest = { g: 'VIII', t: '10:00', a: 88, b: 88, n: 8 };
    for (const lang of ['en', 'ru'] as const) {
      setLang(lang);
      for (const k of Object.keys(WHY_EN)) {
        const text = t(k as TKey, longest);
        expect(missingGlyphs(text), k).toEqual([]);
        // the narrowest Results line (320x568): within WHY_MAX_LINES, never an ellipsis
        const wr = wrapText(text, WHY_MIN_W, WHY_MAX_LINES);
        expect(wr.truncated, `${lang} ${k}`).toBe(false);
        // a retreat: its cause, then "We withdrew at {t}."
        if (k.startsWith('why.lost.')) expect(wrapText(`${text} ${t('why.withdrew', longest)}`, WHY_MIN_W, WHY_MAX_LINES).truncated, `${lang} ${k} + withdrew`).toBe(false);
      }
    }
    setLang('en');
  });
});
