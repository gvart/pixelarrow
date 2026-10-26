// The HUD's contextual cost hints (src/war/view/hud/goods.ts): what is short, in plain words, and where a good goes.
import { describe, expect, it } from 'vitest';
import { GOOD_INFO, goodName, needChips, shortText, usesOf } from '../../src/war/view/hud/goods';
import { GOODS } from '../../src/war/net/protocol';

describe('hud goods', () => {
  it('names every traded good', () => {
    for (const g of GOODS) expect(GOOD_INFO[g], g).toBeDefined();
    expect(goodName('p:bandage')).toBe('Bandages');
  });
  it('says what is short against what you have', () => {
    expect(shortText({ wood: 6, stone: 4 }, { wood: 2, stone: 9 })).toBe('needs 6 wood (you have 2)');
    expect(shortText({ wood: 6 }, { wood: 6 })).toBe('');
    expect(needChips({ wood: 6 }, { wood: 2 })).toContain('short');
    expect(needChips({ wood: 6 }, { wood: 8 })).not.toContain('short');
  });
  it('derives what a good is for from the costs and recipes', () => {
    expect(usesOf('wood')).toContain('buildings');
    expect(usesOf('copper')).toContain('bronze');
  });
});
