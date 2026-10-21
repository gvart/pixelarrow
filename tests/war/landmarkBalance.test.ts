/** M7h landmark balance (src/dev/landmarkBalance.ts, docs/WAR.md "Living regions" -> "Balance"): the caps and the raids. */
import { describe, expect, it } from 'vitest';
import { mixed, raidFight, rareRows, scoreRows } from '../../src/dev/landmarkBalance';

describe('M7h landmark balance', () => {
  it('no single landmark region gives more than 4 an hour; restore bills are met by the kills', () => {
    expect(scoreRows().join('\n')).toContain('at most 4/h (≤ 4: ok)');
    expect(rareRows().join('\n')).toContain('longest wait on a source: 0 h');
  });

  // docs/WAR.md "Living regions" -> "Balance": the raid each landmark is tuned for wins, one squad loses (seed 1 of the
  // 8 the report fights)
  it("Drakon's Citadel: one squad stalls at the roof, a 6-squad raid kills him with losses", () => {
    const one = raidFight('krios', 'drakon', mixed(1), 1);
    expect(one.won).toBe(false);
    expect(one.bossHp).toBeGreaterThanOrEqual(0.55);
    const six = raidFight('krios', 'drakon', mixed(6), 1);
    expect(six.won).toBe(true);
    expect(six.lost).toBeGreaterThan(4);
  }, 120_000);

  it('Dead City of Ammon: one squad falls to the King and his guard, three kill him', () => {
    expect(raidFight('ammon', 'bandit_king', mixed(1), 1).won).toBe(false);
    expect(raidFight('ammon', 'bandit_king', mixed(3), 1).won).toBe(true);
  }, 120_000);

  it("Rim Watchtower: one squad is torn apart by Scylla's heads, six split along the cliff and kill her", () => {
    const one = raidFight('siren', 'scylla', mixed(1), 1);
    expect(one.won).toBe(false);
    expect(one.bossHp).toBe(1); // her body never opened
    expect(raidFight('siren', 'scylla', mixed(4), 1).won).toBe(false);
    expect(raidFight('siren', 'scylla', mixed(6), 1).won).toBe(true);
  }, 120_000);

  it('Sunken Temple: one squad dies to Achelous, six wade into the fords at his serpent and kill him', () => {
    expect(raidFight('delta', 'river_god', mixed(1), 1).won).toBe(false);
    expect(raidFight('delta', 'river_god', mixed(4), 1).won).toBe(false);
    expect(raidFight('delta', 'river_god', mixed(6), 1).won).toBe(true);
  }, 120_000);

  for (const [region, boss] of [['saddle', 'brontes'], ['gorge', 'gyges'], ['canyons', 'chimera'], ['erymanthos', 'grove_queen']] as const)
    it(`${boss} (depth 3): one squad loses, four win`, () => {
      expect(raidFight(region, boss, mixed(1), 1).won).toBe(false);
      expect(raidFight(region, boss, mixed(4), 1).won).toBe(true);
    }, 120_000);

  it('is deterministic: the same seed fights the same raid', () => {
    expect(raidFight('canyons', 'chimera', mixed(4), 3)).toEqual(raidFight('canyons', 'chimera', mixed(4), 3));
  }, 120_000);
});
