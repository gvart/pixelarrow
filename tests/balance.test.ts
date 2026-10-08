import { describe, expect, it } from 'vitest';
import { Battle } from '../src/sim/battle';
import { resolveBattle } from '../src/game/loot';
import { Rng } from '../src/sim/rng';
import { runFlank, runFrontal, runMatched } from '../src/dev/balance';
import { standardSetup } from './helpers';

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** Run a bot battle for `secs` seconds (both sides bot-driven) so the lines are in contact. */
function engaged(seed: number, secs = 25): { b: Battle; setup: ReturnType<typeof standardSetup> } {
  const setup = standardSetup(seed);
  const b = new Battle(setup.setup);
  b.startBattle();
  for (let i = 0; i < secs * 20 && b.phase === 'battle'; i++) b.step();
  return { b, setup };
}

describe('retreat', () => {
  it('ends the battle at once as a defeat, saves the rest and gives no loot', () => {
    const { b, setup } = engaged(31);
    expect(b.phase).toBe('battle');
    const alive = b.units.filter((u) => u.side === 0 && b.isAlive(u)).length;
    b.issue(0, { kind: 'retreat' });
    expect(b.phase).toBe('ended');
    expect(b.winner).toBe(1);
    const res = b.result();
    expect(res.retreated).toBe(0);
    const mine = b.units.filter((u) => u.side === 0);
    expect(mine.every((u) => u.state === 'dead' || u.state === 'fled')).toBe(true);
    const caught = b.drainEvents().find((e) => e.type === 'retreat');
    expect(caught && caught.type === 'retreat' && caught.caught).toBeLessThanOrEqual(alive);
    const { outcome, survivors } = resolveBattle(res, setup.player, setup.enemy, new Rng(1));
    expect(outcome.retreated).toBe(true);
    expect(outcome.victory).toBe(false);
    expect(outcome.picks).toBe(0);
    expect(outcome.loot.length).toBe(0);
    // Survivors: everyone who got away plus the knocked-out (wounded, not killed).
    expect(survivors.length).toBe(mine.filter((u) => u.state === 'fled' || u.ko).length);
  });

  it('nobody is caught when retreating before contact', () => {
    for (const seed of [1, 2, 3, 4]) {
      const b = new Battle(standardSetup(seed).setup);
      b.startBattle();
      b.step();
      b.issue(0, { kind: 'retreat' });
      expect(b.units.filter((u) => u.side === 0 && u.state === 'dead').length).toBe(0);
    }
  });

  it('routing men are caught more often the stronger the pursuit', () => {
    const deaths = (tiredEnemy: boolean) => {
      let dead = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const b = new Battle(standardSetup(seed).setup);
        b.startBattle();
        b.step();
        for (const u of b.units) {
          if (u.side === 0) u.state = 'routing';
          else if (tiredEnemy) {
            // only one exhausted pursuer left
            if (u.id !== b.units.find((x) => x.side === 1)!.id) u.state = 'fled';
            u.stamina = 0;
          }
        }
        b.issue(0, { kind: 'retreat' });
        dead += b.units.filter((u) => u.side === 0 && u.state === 'dead').length;
      }
      return dead;
    };
    const strong = deaths(false);
    const weak = deaths(true);
    expect(strong).toBeGreaterThan(0);
    expect(strong).toBeGreaterThan(weak * 2);
  });

  it('is an ordinary logged order, so replays reproduce it', () => {
    const run = () => {
      const { b } = engaged(44, 30);
      b.issue(0, { kind: 'retreat' });
      return { hash: b.hash(), log: JSON.stringify(b.orderLog.filter((o) => o.side === 0)) };
    };
    expect(run()).toEqual(run());
  });
});

describe('balance targets', () => {
  it('matched starting armies fight for roughly one to two and a half minutes', () => {
    const r = Array.from({ length: 24 }, (_, i) => runMatched(1000 + i));
    const d = r.map((x) => x.seconds);
    expect(median(d)).toBeGreaterThan(55);
    expect(median(d)).toBeLessThan(150);
    expect(r.filter((x) => x.timeLimit).length).toBeLessThanOrEqual(1);
    const wins = r.filter((x) => x.winner === 0).length;
    expect(wins).toBeGreaterThanOrEqual(7); // ~30%+ on a small sample (target 50-60% over 200)
    expect(wins).toBeLessThanOrEqual(19);
  });

  it('the bot presses the attack instead of waiting out the clock', () => {
    const r = Array.from({ length: 16 }, (_, i) => runMatched(5000 + i, true));
    expect(r.filter((x) => x.timeLimit).length).toBeLessThanOrEqual(1);
  });

  it('a frontal charge into braced spears is costly but does not rout the attacker in 15 s', () => {
    const r = Array.from({ length: 16 }, (_, i) => runFrontal(2000 + i));
    expect(r.filter((x) => x.attackerRout >= 0 && x.attackerRout < 15).length).toBeLessThanOrEqual(2);
    const att = r.reduce((a, x) => a + x.attackerHp5, 0);
    const def = r.reduce((a, x) => a + x.defenderHp5, 0);
    expect(att).toBeGreaterThan(def * 1.15);
    expect(r.filter((x) => x.attackerWon).length).toBeLessThan(8);
  });

  it('a rear attack is far more decisive than the same men added to the front', () => {
    const front = Array.from({ length: 12 }, (_, i) => runFlank(3000 + i, 'front'));
    const rear = Array.from({ length: 12 }, (_, i) => runFlank(3000 + i, 'rear'));
    const t = (xs: typeof front) => median(xs.map((x) => (x.defenderRout >= 0 ? x.defenderRout : 999)));
    expect(rear.every((x) => x.attackerWon)).toBe(true);
    expect(t(rear)).toBeLessThan(t(front) * 0.4);
  });
});
