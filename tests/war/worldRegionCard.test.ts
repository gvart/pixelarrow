import { describe, expect, it } from 'vitest';
import { BIOME_NAME, DANGER, pricesHtml, regionAction, regionCardHtml, regionKind, regionTags, type CardCtx } from '../../src/war/world-view/regionCard';
import { legendHtml } from '../../src/war/world-view/legend';
import { WORLD_IDS, worldRegion } from '../../src/war/world/graph';
import type { RegionState } from '../../src/war/net/world';

const region = (id: string, owner: number, extra: Partial<RegionState> = {}): RegionState => ({ id, owner: owner as RegionState['owner'], claims: [0, 0, 0, 0], live: [120, 0, 0, 0], contested: false, besieged: false, ...extra });
const ctx = (over: Partial<CardCtx> = {}): CardCtx => ({ you: 0, seen: true, mine: 0, quota: 150, mode: 'enter', color: () => '#336699', now: 1_000_000, ...over });
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('world map region card', () => {
  it('names every biome in plain words, never by its id', () => {
    for (const id of WORLD_IDS) {
      const w = worldRegion(id)!;
      expect(BIOME_NAME[w.biome], w.biome).toBeTruthy();
      const t = text(regionCardHtml(id, ctx({ region: region(id, 0) })));
      expect(t).toContain(BIOME_NAME[w.biome]);
      expect(t).not.toMatch(/Biome|resource heart|trade hub|Depth \d/);
    }
  });

  it('says what a region is: home, borderland, wild land, the heart', () => {
    expect(regionKind('kyrene')).toBe('Home of Kyrene');
    expect(regionKind('dodona-n')).toBe('Dodona borderland');
    expect(regionKind('omphalos')).toBe('Heart of the world');
    expect(regionKind('stymphalia')).toBe('Wild land');
  });

  it('tags a home market town under siege, each tag with its meaning', () => {
    const tags = regionTags('kyrene', region('kyrene', 2, { besieged: true }));
    expect(tags.map((t) => t.text)).toEqual(['Home', 'Market town', 'Under siege']);
    for (const t of tags) expect(t.tip.length).toBeGreaterThan(10);
  });

  it('shows danger on a scale with a word', () => {
    expect(DANGER).toEqual(['Safe', 'Low', 'Moderate', 'High', 'Deadly']);
    expect(text(regionCardHtml('dodona', ctx({ region: region('dodona', 0) })))).toContain('Safe');
  });

  it('hides troops in the fog and says why', () => {
    const t = text(regionCardHtml('kyrene-s', ctx({ region: region('kyrene-s', 2), seen: false })));
    expect(t).toContain('Hidden');
    expect(t).toContain('Troops show only in and next to your land');
    expect(t).not.toContain('men here');
  });

  it('shows goods as icons', () => {
    expect(regionCardHtml('kyrene', ctx({ region: region('kyrene', 2) }))).toContain('res-copper.png');
  });

  it('shows a price table, or how to see the prices', () => {
    expect(pricesHtml('krios', undefined, 0)).toBe(''); // not a market town
    expect(text(pricesHtml('kyrene', undefined, 0))).toContain('Visit with any of your men');
    const t = text(pricesHtml('kyrene', { at: 0, fills: 3, rows: [{ good: 'copper', ask: 9, bid: 7, depth: 40 }] }, 5 * 60_000));
    expect(t).toMatch(/Buy Sell/);
    expect(t).toContain('Copper 9 7');
    expect(t).toContain('5 min ago');
  });

  it('leads with the primary action and its key', () => {
    expect(regionAction('enter')).toMatchObject({ label: 'Enter region', key: '⏎' });
    expect(regionAction('march')).toMatchObject({ label: 'March here', key: 'Click' });
    expect(regionAction('haul').label).toBe('Haul here');
    const hover = regionCardHtml('dodona', ctx({ region: region('dodona', 0) })), docked = regionCardHtml('dodona', ctx({ region: region('dodona', 0), pinned: true }));
    expect(hover).not.toContain('<button');
    expect(docked).toContain('<button class="rf-tbtn pri big rc-go" data-act="enter">');
    expect(docked).toContain('data-act="close"');
  });

  it('the hover card is the glance: no lore, goods or prices, the same header, tiles and action', () => {
    const market = WORLD_IDS.find((id) => regionTags(id, undefined).some((t) => t.text === 'Market town'))!;
    const full = regionCardHtml(market, ctx({ region: region(market, 0) })), glance = regionCardHtml(market, ctx({ region: region(market, 0), compact: true }));
    for (const part of ['rc-lore', 'rc-goods', 'Market prices', 'rc-take']) {
      expect(full, part).toContain(part);
      expect(glance, part).not.toContain(part);
    }
    for (const part of ['rc-hd', 'rc-tiles', 'Enter region']) expect(glance, part).toContain(part);
  });
});

describe('world map key', () => {
  it('explains the colours, lines and markers', () => {
    const t = text(legendHtml(() => '#336699', 0));
    for (const w of ['Dodona', 'Skythia', 'Kyrene', 'Elaia', 'Unclaimed', 'Fighting', 'Trade road', 'Fealty', 'Pact', 'Truce', 'Your squad', 'Battle', 'Siege', 'Landmark', 'Monarch', 'Settlement', 'World event', 'More here']) expect(t, w).toContain(w);
  });
});
