import { describe, expect, it } from 'vitest';
import { tutorialExit } from '../../src/game/tutorial';
import type { Item } from '../../src/data/items';

// QA02-B1 (screen-flow §3 S09): skip and finish of a replay started from Settings return to the screen
// Settings was opened from; a first-run tutorial goes on to FirstRun.

describe('tutorial exit (QA02-B1)', () => {
  const menu = { scene: 'Menu', data: {} };
  const item = { uid: 'r1', def: 'chalcidian', rarity: 'common', cond: 100 } as Item;

  it('a replay returns to the screen it came from', () => {
    expect(tutorialExit(menu)).toEqual(menu);
    expect(tutorialExit({ scene: 'Settlement', data: { id: 3 } })).toEqual({ scene: 'Settlement', data: { id: 3 } });
  });

  it('the first run goes on to the mode cards', () => {
    expect(tutorialExit(undefined)).toEqual({ scene: 'FirstRun', data: { mode: 'modes' } });
  });

  it('a first item earned shows its reward screen, replay or not', () => {
    expect(tutorialExit(undefined, item)).toEqual({ scene: 'FirstRun', data: { mode: 'reward', item } });
    expect(tutorialExit(menu, item)).toEqual({ scene: 'FirstRun', data: { mode: 'reward', item } });
  });
});
