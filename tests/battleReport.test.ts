import { describe, expect, it } from 'vitest';
import { createDeployClock, DEPLOY_MS, foeIsReady, markStarted, pressReady, secondsLeft, tickDeploy, urgent } from '../src/online/deployClock';
import { buildReport, formatDuration, pickMvp, resultFor, unitStats, type HeroLine, type UnitStat } from '../src/game/report';
import { resolveBattle } from '../src/game/loot';
import { Battle, TICK_RATE } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import { runToEnd, standardSetup } from './helpers';
import { allStrings, table } from '../src/i18n';
import { BATTLE_EN } from '../src/i18n/battle.en';
import { missingGlyphs } from '../src/ui/textfit';

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
  it('MVP: most kills, then most damage; nobody when no one struck', () => {
    expect(pickMvp([line('a', 1, 50), line('b', 3, 10), line('c', 3, 12)])!.name).toBe('c');
    expect(pickMvp([line('a', 0, 0)])).toBeNull();
    expect(pickMvp([line('a', 0, 4), line('b', 0, 9)])!.name).toBe('b');
  });

  it('formats the duration and maps winners to results', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(600)).toBe('10:00');
    expect(resultFor(0, 0)).toBe('victory');
    expect(resultFor(1, 0)).toBe('defeat');
    expect(resultFor(0, 1)).toBe('defeat');
    expect(resultFor(-1, 1)).toBe('draw');
    expect(resultFor(1, 0, 0)).toBe('retreat');
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
    expect(r.losses).toBe(outcome.lost);
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
