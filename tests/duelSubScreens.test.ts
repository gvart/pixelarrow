/**
 * DUE-02: the duel sub-screens (design/ux/screens-modes.md M-5 .. M-7). The scene draws with Phaser; tested here:
 * the third medal is bronze, not terracotta (DUE-3); the leaderboard's title never names a board the switch could
 * contradict (DUE-2); Search and Found show no back arrow (E326, N5); the expired ladder note speaks of real time,
 * not of the battle's length (Director 2); the new strings read in both languages.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import duelSrc from '../src/scenes/duel/DuelScene.ts?raw';
import { setLang } from '../src/i18n';
import { DUELS_V5_EN } from '../src/i18n/duels.v5.en';
import { DUELS_V5_RU } from '../src/i18n/duels.v5.ru';
import { MOSAIC } from '../src/ui/tokens';
import { ladderArrival, ladderNotes } from '../src/scenes/duel/hubLayout';

// Phaser needs a browser; the medal table is plain data
vi.mock('phaser', () => {
  class C {}
  return {
    default: {
      GameObjects: { Container: C, Image: C, Text: C, Graphics: C, Rectangle: C, Zone: C, BitmapText: C, Sprite: C, Layer: C, TileSprite: C },
      Scene: C,
      Loader: { Events: {} },
      Geom: { Rectangle: C },
      Math: { Clamp: (v: number) => v, Distance: { Between: () => 0 } },
      Cameras: { Scene2D: { Camera: C } },
      Textures: { FilterMode: { LINEAR: 0 } },
    },
  };
});
const { RANK_MEDALS } = await import('../src/scenes/duel/duelParts');

const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

afterEach(() => setLang('en'));

describe('leaderboard medals (DUE-3)', () => {
  it('gold, silver, then bronze: never terracotta or red for third place', () => {
    expect(RANK_MEDALS.map((m) => m.fill)).toEqual([MOSAIC.segDone, MOSAIC.offText, MOSAIC.bronze]);
    for (const m of RANK_MEDALS) expect([MOSAIC.terra, MOSAIC.terraHi, MOSAIC.terraLo]).not.toContain(m.fill);
  });

  it('the number on the dark bronze is cream (art bible 4.3: cream on bronze 5.59:1)', () => {
    expect(RANK_MEDALS[2].font).toBe('rCream');
  });
});

describe('the leaderboard title (DUE-2)', () => {
  it('Live and Legend share "Leaderboard": the switch is the only state', () => {
    const src = code(duelSrc);
    expect(src).toContain("this.board === 'async' ? t('duels.view.board.async') : t('d5.board')");
    expect(src).not.toContain('duels.view.board.legend');
    expect(DUELS_V5_EN['d5.board']).toBe('Leaderboard');
  });
});

describe('Search and Found (M-7)', () => {
  it('show no back arrow: Cancel is the only exit (E326)', () => {
    expect(code(duelSrc)).toContain('back: this.search || this.found ? undefined : () => this.up()');
  });
});

describe('the expired ladder note (Director 2)', () => {
  const run = { firstClear: false, won: true, stars: 3, newBest: false, capped: 0, accountXp: 0, floor: 5, expired: true };

  it('says the real-time minutes ran out, not that the battle lasted that long', () => {
    for (const l of ['en', 'ru'] as const) {
      setLang(l);
      const note = ladderNotes(run)[0];
      expect(note).toMatch(l === 'en' ? /real-time minutes/ : /реального времени/);
      expect(note).not.toMatch(/Finished after|Бой дольше/);
      expect(ladderArrival({ floor: 5, won: true, glory: 0, expired: true })).toMatch(l === 'en' ? /real-time/ : /реального времени/);
    }
  });
});

describe('strings (DUE-02)', () => {
  it('the new keys exist in both languages', () => {
    for (const k of ['d5.board', 'd5.boardEmpty', 'd5.boardError', 'd5.board.notLegend', 'd5.raidError', 'd5.seasonOver', 'd5.pickShort', 'd5.pickSet'] as const) {
      expect(DUELS_V5_EN[k], k).toBeTruthy();
      expect(DUELS_V5_RU[k], k).toBeTruthy();
    }
  });
});
