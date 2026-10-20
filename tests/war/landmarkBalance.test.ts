/** M7h landmark balance (src/dev/landmarkBalance.ts, docs/WAR.md "Living regions" -> "Balance"): the caps and the raids. */
import { describe, expect, it } from 'vitest';
import { mixed, raidFight, rareRows, scoreRows } from '../../src/dev/landmarkBalance';

describe('M7h landmark balance', () => {
  it('no single landmark region gives more than 4 an hour; restore bills are met by the kills', () => {
    expect(scoreRows().join('\n')).toContain('at most 4/h (≤ 4: ok)');
    expect(rareRows().join('\n')).toContain('longest wait on a source: 0 h');
  });

  it("Drakon's Citadel: one squad stalls at the roof, a 4-squad raid kills him", () => {
    const one = raidFight('krios', 'drakon', mixed(1), 1);
    expect(one.won).toBe(false);
    expect(one.bossHp).toBeGreaterThanOrEqual(0.55);
    const four = raidFight('krios', 'drakon', mixed(4), 1);
    expect(four.won).toBe(true);
    expect(four.lost).toBeGreaterThan(4);
  }, 60_000);

  it('a depth-3 guardian: one squad loses, four win', () => {
    expect(raidFight('gorge', 'gyges', mixed(1), 1).won).toBe(false);
    expect(raidFight('gorge', 'gyges', mixed(4), 1).won).toBe(true);
  }, 60_000);
});
