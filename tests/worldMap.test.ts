/**
 * WLD-01: the world map's words (design/ux/screens-campaign.md C-4, UI WLD-6). The scene draws with
 * Phaser; what is tested here is pure: every region, terrain, band, threat, structure and camp
 * refusal reads in both languages (the ru World header said "ROAD"), the encounter's doctrine and
 * captain come from the band as the battle builds it, and the threat glyphs differ in shape.
 */
import { describe, expect, it, vi } from 'vitest';
import { Campaign } from '../src/game/campaign';
import { setLang, LANGS, t, type TKey } from '../src/i18n';
import { WORLD_V5_EN } from '../src/i18n/world.v5.en';
import { WORLD_V5_RU } from '../src/i18n/world.v5.ru';
import { TERRAIN_NAMES, regionName } from '../src/world/map';
import { STRUCTURES, campBlocker } from '../src/world/camp';
import { hasCaptain, partyArmy } from '../src/world/world';
import { isCaptain } from '../src/sim/stats';
import { renderThreatGlyph } from '../src/art/worldArt';

vi.mock('phaser', () => {
  class C {}
  return { default: { GameObjects: { Container: C, Image: C, Text: C, Graphics: C, Rectangle: C, Zone: C, Sprite: C, Layer: C }, Scene: C, Loader: { Events: {} } } };
});
const { regionLabel, campWhy } = await import('../src/scenes/WorldScene');
const { bandName } = await import('../src/i18n/names');

describe('the world map reads in both languages (WLD-6)', () => {
  it('ru has every key of en', () => {
    expect(Object.keys(WORLD_V5_RU).sort()).toEqual(Object.keys(WORLD_V5_EN).sort());
  });

  it('the region is the same place as world/map.ts regionName says, in English', () => {
    setLang('en');
    const m = Campaign.fresh(5).world.map;
    for (let y = 0; y < m.h; y += 3) for (let x = 0; x < m.w; x += 3) expect(regionLabel(m, x, y)).toBe(regionName(m, x, y));
  });

  it('ru translates every region and terrain (no "Road")', () => {
    setLang('ru');
    const m = Campaign.fresh(5).world.map;
    const english = new Set([...TERRAIN_NAMES, 'Road', 'River ford']);
    for (let y = 0; y < m.h; y += 2) for (let x = 0; x < m.w; x += 2) expect(english.has(regionLabel(m, x, y))).toBe(false);
    setLang('en');
  });

  for (const lang of LANGS) {
    it(`bands, threats, structures and camp refusals have words (${lang})`, () => {
      setLang(lang);
      for (const n of ['Bandits', 'Galatae raiders', 'Mercenaries', 'Pirates', "The Tyrant's host"]) expect(bandName(n)).not.toMatch(/^wld\./);
      expect(bandName('Wolf Den')).toBe('Wolf Den');
      for (let i = 0; i < 5; i++) expect(t(`wld.threat.${i}` as TKey)).not.toMatch(/^wld\./);
      for (const id of Object.keys(STRUCTURES)) {
        expect(t(`wld.struct.${id}.name` as TKey)).not.toMatch(/^wld\./);
        expect(t(`wld.struct.${id}.desc` as TKey)).not.toMatch(/^wld\./);
      }
      const m = Campaign.fresh(5).world.map;
      const reasons = new Set<string>(['Already camped', 'Not inside a settlement']);
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) reasons.add(campBlocker(m, x, y) ?? '');
      reasons.delete('');
      for (const r of reasons) {
        const w = campWhy(r);
        if (lang === 'ru') expect(w).not.toBe(r);
        expect(w).not.toMatch(/^wld\./);
      }
    });
  }
  setLang('en');
});

describe('the encounter shows the band as the battle builds it (ai-doctrines.md)', () => {
  it('a band with a captain has him in its army, with a doctrine', () => {
    const c = Campaign.fresh(20261006);
    const bands = c.world.s.parties.filter((p) => hasCaptain(p));
    expect(bands.length).toBeGreaterThan(0);
    for (const p of bands) {
      const before = c.data.nextId;
      const army = partyArmy(p, { nextId: 1 }, c.armyClasses());
      expect(c.data.nextId).toBe(before); // a throwaway id source: showing the sheet moves nothing in the save
      expect(army.heroes.filter((h) => isCaptain(h))).toHaveLength(1);
      expect(army.heroes.length).toBe(p.size);
    }
  });
});

describe('threat glyphs (G13: a shape beside the colour)', () => {
  it('each level has its own shape', () => {
    const shapes = [0, 1, 2, 3, 4].map((l) => {
      const px = renderThreatGlyph(l);
      let s = '';
      for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) s += px.get(x, y) ? '#' : '.';
      return s;
    });
    expect(new Set(shapes).size).toBe(5);
  });
});
