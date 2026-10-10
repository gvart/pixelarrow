/**
 * LF-01: the battle's live bugs from docs/v5/audit/PLAY.md, reproduced on a
 * real sim. B3 card and badge numerals, B5 the stale "Contact soon" hint,
 * B6 Shoot on with nothing in range.
 */
import { describe, expect, it, vi } from 'vitest';
import { armySpec } from '../src/game/armySpec';
import { generateEnemyArmy } from '../src/game/enemy';
import { standardArmy } from '../src/game/heroes';
import { Battle } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';

// battleHud.ts draws with Phaser; its HUD rules are pure. Phaser itself needs a browser.
vi.mock('phaser', () => {
  class C {}
  return { default: { GameObjects: { Container: C, Image: C, Text: C, Graphics: C, Rectangle: C }, Scene: C } };
});
const { cardGroups, groupNumeral } = await import('../src/ui/battleHud');

/** The player's army with nobody in group III (Reserve) and someone in IV (Flank): PLAY B3's case. */
function emptyReserve(): Battle {
  const ids = { nextId: 1 };
  const player = standardArmy(new Rng(1234), ids);
  for (const h of player) if (h.group === 2) h.group = 0;
  player[player.length - 1].group = 3;
  const enemy = generateEnemyArmy(new Rng(7), ids, player, 0).heroes;
  return new Battle({ seed: 7, armies: [armySpec(player, false), armySpec(enemy, true)] });
}

describe('B3: a group keeps its numeral from deployment to the end', () => {
  it('the card and the field badge agree with an empty Reserve, in deployment and in battle', () => {
    const b = emptyReserve();
    const flank = b.groups.find((g) => g.side === 0 && g.name === 'Flank')!;
    expect(b.members(flank.id).length).toBeGreaterThan(0);
    const deployCard = cardGroups(b, 0, true).find((c) => c.gid === flank.id)!;
    expect(deployCard.numeral).toBe('IV');
    expect(groupNumeral(b.groups, flank.id)).toBe('IV');
    b.startBattle();
    for (let i = 0; i < 40; i++) b.step();
    const battleCard = cardGroups(b, 0, false).find((c) => c.gid === flank.id)!;
    expect(battleCard.numeral).toBe('IV');
    expect(groupNumeral(b.groups, flank.id)).toBe(battleCard.numeral);
  });

  it('a wiped-out group never renumbers the others', () => {
    const b = emptyReserve();
    b.startBattle();
    const phalanx = b.groups.find((g) => g.side === 0 && g.name === 'Phalanx')!;
    for (const u of b.members(phalanx.id)) u.state = 'dead';
    const cards = cardGroups(b, 0, false);
    for (const c of cards) expect(c.numeral).toBe(groupNumeral(b.groups, c.gid));
  });

  it('men fighting alone show a star', () => {
    const b = emptyReserve();
    b.startBattle();
    const u = b.units.find((x) => x.side === 0 && x.state === 'ready')!;
    b.issue(0, { kind: 'detach', unit: u.id });
    b.step();
    const solo = b.groups.find((g) => g.individual && g.side === 0)!;
    expect(groupNumeral(b.groups, solo.id)).toBe('*');
    expect(cardGroups(b, 0, false).find((c) => c.gid === solo.id)?.numeral).toBe('*');
  });
});
