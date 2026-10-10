import { describe, expect, it } from 'vitest';
import { DOCTRINES, DOCTRINE_TIMERS, PRESS_BASE_S, PRESS_PER_MAN_S, battleTimers, doctrineOf } from '../src/data/doctrines';
import { BotAI, FORD_WAIT_S, HOLD_HILL_S, PRESS_IDLE_S } from '../src/sim/ai';
import { Battle } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import { DOCTRINE_IDS, type BattleSetup, type DoctrineId } from '../src/sim/types';
import { buildArmy, doctrineFor, generateEnemyArmy } from '../src/game/enemy';
import { armySpec } from '../src/game/armySpec';
import { standardArmy } from '../src/game/heroes';
import { standardSetup } from './helpers';
import { doctrineRows } from '../src/dev/doctrineBalance';
import aiSource from '../src/sim/ai.ts?raw';

function withDoctrine(seed: number, doctrine?: DoctrineId): BattleSetup {
  const { setup } = standardSetup(seed, true);
  return { ...setup, armies: [setup.armies[0], { ...setup.armies[1], doctrine }] };
}

function run(setup: BattleSetup, ticks = 20 * 300): Battle {
  const b = new Battle(setup);
  b.startBattle();
  for (let i = 0; i < ticks && b.phase !== 'ended'; i++) b.step();
  return b;
}

describe('the steady doctrine is today\'s AI', () => {
  it('reproduces the shipped timers 5, 14, 25, 8, 70, 50, 55', () => {
    const s = DOCTRINES.steady;
    expect([s.lineWaitS, s.flankAtS, s.pressAfterS, s.pressIdleS, s.reserveAtS, s.holdHillS, s.fordWaitS]).toEqual([5, 14, 25, 8, 70, 50, 55]);
    expect([PRESS_IDLE_S, HOLD_HILL_S, FORD_WAIT_S]).toEqual([s.pressIdleS, s.holdHillS, s.fordWaitS]);
    expect(s.jitter).toBe(0);
    expect(s.retreatAt).toBe(0);
    expect(s.hillFlank).toBe(false);
  });

  it('a missing or unknown doctrine plays steady', () => {
    expect(doctrineOf(undefined)).toBe(DOCTRINES.steady);
    expect(doctrineOf('berserker')).toBe(DOCTRINES.steady);
    expect(doctrineOf('rush')).toBe(DOCTRINES.rush);
  });

  it('a setup without a doctrine and one with steady replay to the same hash', () => {
    const a = run(withDoctrine(31));
    const b = run(withDoctrine(31, 'steady'));
    expect(b.hash()).toBe(a.hash());
    expect(b.winner).toBe(a.winner);
  });

  it('ai.ts keeps no doctrine timer literal outside the steady defaults', () => {
    const src = aiSource;
    // every comparison of battle time `t` reads a named timer, never a number
    expect(src.match(/\bt\s*[<>]=?\s*\d/g) ?? []).toEqual([]);
    expect(src).not.toMatch(/PRESS_IDLE_S\s*\)/); // the press reads the doctrine timer
  });
});

describe('doctrine timers (F1, F2)', () => {
  it('small armies press sooner, capped by the doctrine', () => {
    const t = (men: number) => battleTimers(DOCTRINES.steady, men, () => 0.5).pressAfterS;
    expect(t(5)).toBeCloseTo(PRESS_BASE_S + PRESS_PER_MAN_S * 5); // 11.5 s, against 25 s before
    expect(t(5)).toBeCloseTo(11.5);
    expect(t(10)).toBeCloseTo(19);
    expect(t(20)).toBe(25);
  });

  it('jitter keeps every timer within ± J and is drawn in a fixed order', () => {
    const d = DOCTRINES.swarm;
    const lo = battleTimers(d, 64, () => 0);
    const hi = battleTimers(d, 64, () => 0.999999);
    for (const k of DOCTRINE_TIMERS) {
      expect(lo[k]).toBeCloseTo(d[k] * (1 - d.jitter));
      if (k !== 'pressAfterS') expect(hi[k]).toBeCloseTo(d[k] * (1 + d.jitter), 3);
    }
    const draws: number[] = [];
    battleTimers(d, 64, () => (draws.push(draws.length), 0.5));
    expect(draws.length).toBe(DOCTRINE_TIMERS.length);
    let calls = 0;
    battleTimers(DOCTRINES.steady, 64, () => (calls++, 0.5));
    expect(calls).toBe(0);
  });

  it('rush flankAtS lands in 5.1-6.9 s (F2 example)', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 50; i++) {
      const f = battleTimers(DOCTRINES.rush, 20, () => rng.next()).flankAtS;
      expect(f).toBeGreaterThanOrEqual(5.1 - 1e-9);
      expect(f).toBeLessThanOrEqual(6.9 + 1e-9);
    }
  });

  it('the bot reads its own army\'s doctrine and draws the same timers every run', () => {
    const a = new BotAI(1, 99, 'swarm');
    const b = new BotAI(1, 99, 'swarm');
    const s = new BotAI(1, 99);
    expect(a.doctrine.id).toBe('swarm');
    expect(s.doctrine.id).toBe('steady');
    const battle = new Battle(withDoctrine(5, 'swarm'));
    a.deploy(battle);
    b.deploy(battle);
    expect(a.timers).toEqual(b.timers);
  });
});

describe('every doctrine fights a deterministic battle', () => {
  for (const id of DOCTRINE_IDS) {
    it(`${id}: same seed, same hash`, () => {
      const a = run(withDoctrine(77, id), 20 * 200);
      const b = run(withDoctrine(77, id), 20 * 200);
      expect(b.hash()).toBe(a.hash());
    });
  }

  it('doctrines change how the bot fights', () => {
    const hashes = new Set(DOCTRINE_IDS.map((id) => run(withDoctrine(77, id), 20 * 60).hash()));
    expect(hashes.size).toBe(DOCTRINE_IDS.length);
  });

  it('rush deploys its main line in a wedge, swarm in skirmish order', () => {
    const rush = new Battle(withDoctrine(12, 'rush'));
    const main = rush.sideGroups(1).find((g) => g.role === 'main')!;
    expect(main.formation.type).toBe('wedge');
    // the generated line army is hoplites: shielded spearmen keep a line under swarm
    const swarm = new Battle(withDoctrine(12, 'swarm'));
    expect(swarm.sideGroups(1).find((g) => g.role === 'main')!.formation.type).toBe('line');
  });
});

describe('retreat (R5)', () => {
  it('a losing swarm army retreats; steady and fury never do', () => {
    let swarmRetreats = 0;
    for (let s = 0; s < 12; s++) {
      for (const id of ['steady', 'fury'] as const) expect(run(withDoctrine(400 + s, id)).retreated).not.toBe(1);
      const b = run(withDoctrine(400 + s, 'swarm'));
      if (b.retreated === 1) {
        swarmRetreats++;
        expect(b.winner).toBe(0);
      }
    }
    expect(swarmRetreats).toBeGreaterThan(0);
  });
});

describe('assignment by band kind and culture (R4)', () => {
  it('maps mixes and cultures to doctrines', () => {
    expect(doctrineFor('bandits', 'greek')).toBe('swarm');
    expect(doctrineFor('hill_tribe', 'celtic')).toBe('swarm');
    expect(doctrineFor('pirates', 'phoenician')).toBe('swarm');
    expect(doctrineFor('raiders', 'celtic')).toBe('rush');
    expect(doctrineFor('mercs', 'greek')).toBe('steady');
    expect(doctrineFor('mercs', 'phoenician')).toBe('hammer');
    expect(doctrineFor('mercs', 'celtic')).toBe('rush');
    expect(doctrineFor('cultists', 'greek')).toBe('fury');
    expect(doctrineFor('outlaws', 'greek')).toBe('steady');
    expect(doctrineFor('deserters', 'greek')).toBe('steady');
    expect(doctrineFor('line', 'celtic')).toBe('steady');
  });

  it('buildArmy carries the doctrine; an explicit one wins', () => {
    const ids = { nextId: 1 };
    const req = { culture: 'celtic' as const, count: 6, level: 2, tier: 1, targetPower: 0, tune: false };
    expect(buildArmy(new Rng(3), ids, { ...req, mix: 'raiders' }).doctrine).toBe('rush');
    expect(buildArmy(new Rng(3), ids, { ...req, mix: 'bandits' }).doctrine).toBe('swarm');
    expect(buildArmy(new Rng(3), ids, { ...req, mix: 'bandits', doctrine: 'fury' }).doctrine).toBe('fury');
    expect(buildArmy(new Rng(3), ids, { ...req }).doctrine).toBe('steady');
    // the doctrine changes nothing about who is in the army
    const a = buildArmy(new Rng(3), { nextId: 1 }, { ...req, mix: 'bandits' });
    const b = buildArmy(new Rng(3), { nextId: 1 }, { ...req, mix: 'bandits', doctrine: 'rush' });
    expect(b.heroes.map((h) => h.name)).toEqual(a.heroes.map((h) => h.name));
  });

  it('the skirmish opponent stays steady', () => {
    const ids = { nextId: 1 };
    expect(generateEnemyArmy(new Rng(1), ids, standardArmy(new Rng(2), ids), 0).doctrine).toBe('steady');
  });
});

describe('first contact (AC 3)', () => {
  it('5v5 level-1 armies meet within 15 s on average', () => {
    const n = 16;
    let sum = 0;
    for (let s = 0; s < n; s++) {
      const ids = { nextId: 1 };
      const mine = standardArmy(new Rng(s), ids).slice(0, 5);
      const foe = generateEnemyArmy(new Rng(s ^ 0xa5a5a5a5), ids, mine, 0).heroes.slice(0, 5);
      const b = new Battle({ seed: 600 + s, armies: [armySpec(mine, true), armySpec(foe, true)] });
      b.startBattle();
      let contact = -1;
      for (let i = 0; i < 20 * 120 && contact < 0 && b.phase !== 'ended'; i++) {
        b.step();
        for (const e of b.drainEvents()) if (e.type === 'contact' && contact < 0) contact = e.tick / 20;
      }
      sum += contact < 0 ? 120 : contact;
    }
    expect(sum / n).toBeLessThanOrEqual(15);
  });
});

describe('the doctrine balance rows', () => {
  it('prints a row per doctrine target', () => {
    const rows = doctrineRows(2);
    for (const id of DOCTRINE_IDS) expect(rows.some((r) => r.label.includes(`vs ${id}`))).toBe(true);
    expect(rows.some((r) => r.label.includes('first contact'))).toBe(true);
    expect(rows.some((r) => r.label.startsWith('Ridge defender'))).toBe(true);
  });
});
