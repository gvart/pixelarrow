/**
 * Rarity balance (docs/ITEMS.md "Balance targets"): mirror battles of one
 * army, side 0 with every item at a rarity, side 1 all common. The win rate
 * per rarity is what the targets are written against.
 */
import { armySpec } from '../game/armySpec';
import { setBotLevel, standardArmy } from '../game/heroes';
import { RARITIES, type Rarity } from '../data/items';
import { Battle } from '../sim/battle';
import { Rng } from '../sim/rng';
import type { Hero } from '../data/units';

function army(seed: number, rarity: Rarity, level: number): Hero[] {
  const heroes = standardArmy(new Rng(seed), { nextId: 1 });
  for (const h of heroes) {
    // gear first, so the bot spends its points on what the gear asks for
    for (const it of Object.values(h.equip)) if (it) { it.rarity = rarity; it.cond = 100; }
    setBotLevel(h, level);
    h.perks = [];
  }
  return heroes;
}

/** Side 0 in `rarity` gear against the same army in common gear: 1 win, 0 loss, 0.5 draw. */
export function runRarity(seed: number, rarity: Rarity, level = 5): number {
  const a = army(seed, rarity, level);
  const b = army(seed, 'common', level);
  b.forEach((h, i) => (h.id = `m${i}`));
  const flip = seed % 2 === 1;
  const armies = flip ? [armySpec(b, true), armySpec(a, true)] : [armySpec(a, true), armySpec(b, true)];
  const battle = new Battle({ seed, armies: armies as [ReturnType<typeof armySpec>, ReturnType<typeof armySpec>] });
  battle.startBattle();
  for (let i = 0; i < battle.timeLimitTicks + 10 && battle.phase !== 'ended'; i++) battle.step();
  const w = battle.winner ?? -1;
  if (w === -1) return 0.5;
  return (flip ? w === 1 : w === 0) ? 1 : 0;
}

export function rarityReport(n = 60, levels = [5, 10]): string {
  const rows = RARITIES.slice(1).map((r) => {
    const cells = levels.map((lv) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += runRarity(7000 + i, r, lv);
      return `L${lv} ${(100 * s / n).toFixed(0).padStart(3)}%`;
    });
    return `  ${r.padEnd(10)} ${cells.join('  ')}`;
  });
  return ['Rarity mirror (full kit at a rarity vs the same army all common)', ...rows].join('\n');
}
