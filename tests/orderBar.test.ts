/**
 * CT-01: the order bar wears the selected group's colour and numeral (PLAY C3,
 * controls.md R1.3), and only groups with men get a card (R1.4).
 */
import { describe, expect, it, vi } from 'vitest';
import { armySpec } from '../src/game/armySpec';
import { classSquad } from '../src/dev/classBalance';
import { Battle } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import { GROUP_COLOR } from '../src/art/sheetArt';

// the HUD modules draw with Phaser; the rules tested here are pure. Phaser itself needs a browser.
vi.mock('phaser', () => {
  class C {}
  return { default: { GameObjects: { Container: C, Image: C, Text: C, Graphics: C, Rectangle: C }, Scene: C } };
});
const { cardGroups, groupNumeral } = await import('../src/ui/battleHud');
const { NO_GROUP_COLOR, numeralColour } = await import('../src/ui/battlePanel');

/** Side 0 has men in groups 0 and 1 only; groups 2 and 3 are empty. */
function battle(): Battle {
  const rng = new Rng(3);
  const ids = { nextId: 1 };
  const a = armySpec([...classSquad(rng, ids, 'hoplite', 3, 3, 0), ...classSquad(rng, ids, 'slinger', 3, 3, 1)], false);
  const b = armySpec(classSquad(rng, ids, 'hoplite', 4, 3, 0), true);
  return new Battle({ seed: 3, armies: [a, b] });
}

describe('order bar colour (controls.md R1.3)', () => {
  it("each group's numeral has its battle colour, the same as on the army sheet", () => {
    expect(['I', 'II', 'III', 'IV'].map(numeralColour)).toEqual(GROUP_COLOR);
  });

  it('a man fighting alone (*) has no group colour: a neutral stone', () => {
    expect(numeralColour('*')).toBe(NO_GROUP_COLOR);
    expect(numeralColour('IX')).toBe(NO_GROUP_COLOR);
  });

  it("the bar's colour follows the group's numeral, which is stable for the battle", () => {
    const b = battle();
    expect(numeralColour(groupNumeral(b.groups, 1))).toBe(GROUP_COLOR[1]);
    b.startBattle();
    expect(numeralColour(groupNumeral(b.groups, 1))).toBe(GROUP_COLOR[1]);
  });
});

describe('cards (controls.md R1.4)', () => {
  it('empty groups get no card, in deployment as in battle', () => {
    const b = battle();
    expect(b.phase).toBe('deploy');
    expect(cardGroups(b, 0, false)).toEqual([
      { gid: 0, numeral: 'I' },
      { gid: 1, numeral: 'II' },
    ]);
  });
});
