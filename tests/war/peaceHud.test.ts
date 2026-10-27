import { describe, expect, it } from 'vitest';
// W-61 the peace HUD's views (src/war/view/hud/peaceCards.ts): the town card's checklist and ring, the works' cards, the title emblems.
import { titlesStrip, townBadge, townCard, townProgress, townReqs, workProgress, worksHtml } from '../../src/war/view/hud/peaceCards';
import type { TownLevelSnap } from '../../src/war/types';
import type { WorkView } from '../../src/war/net/works';

const village: TownLevelSnap = { id: 0, team: 0, level: 3, name: 'Village', x: 0, y: 0, r: 24, variety: 6, stone: 0.42, closed: false, stoneWalls: false, next: [] };

describe('W-61 peace HUD', () => {
  it('the town card lists only what the next level needs, met or not, and fills the ring by them', () => {
    const r = townReqs(village);
    expect(r.map((x) => [x.id, x.ok])).toEqual([['variety', false], ['stone', true], ['closed', false]]);
    expect(townProgress(village)).toBeCloseTo((6 / 8 + 1 + 0) / 3, 5);
    expect(townReqs({ ...village, level: 5 })).toEqual([]);
    expect(townProgress({ ...village, level: 5 })).toBe(1);
  });

  it('the card shows the perks as chips and the next level greyed, no paragraphs', () => {
    const html = townCard(village);
    expect(html).toContain('To Town');
    expect(html).toContain('rf-ichip good');
    expect(html).toContain('rf-ichip dim');
    expect(townBadge(village)).toContain('--p:0.583');
  });

  it('a work fills by its goods and labour; the picked one has the contribute row', () => {
    const w: WorkView = { id: 'road', name: 'Road and bridge', text: 'Transfers 15% faster', region: 'dodona', x: 0, y: 0, goods: { stone: 200, wood: 500 }, need: { stone: 400, wood: 500 }, labour: 0, needLabour: 20, done: false, by: [{ pid: 1, name: 'Iktinos', goods: 700, labour: 0 }] };
    expect(workProgress(w)).toBeCloseTo((0.5 + 1 + 0) / 3, 5);
    const html = worksHtml([w], true, { work: 'road', res: 'stone', n: 50 }, { stone: 30 });
    expect(html).toContain('data-act="give"');
    expect(html).toContain('data-n="30"'); // Max: what you have, under what is still needed
    expect(html).toContain('+15% speed');
  });

  it('the roster strip is emblems with the words in the tooltip', () => {
    const html = titlesStrip([{ id: 'warden', name: 'Warden', pid: 2, player: 'Phylax', alliance: 1, home: 'skythia', value: 38 }], 2);
    expect(html).toContain('rf-medal me');
    expect(html).toContain('data-tip=');
    expect(titlesStrip([], null)).toBe('');
  });
});
