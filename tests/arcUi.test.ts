/**
 * WLD-02: the campaign arc on the world map (design/gdd/campaign-arc.md, design/ux/screens-campaign.md C-4).
 * The scene and sheets draw with Phaser; what is tested here is pure: the arc's words exist in both
 * languages, every lair on a map has a translated name, the Assault sheet offers the right primary choice,
 * and the map's lair assault is a battle that settles as the lair's (and comes back to the map).
 */
import { describe, expect, it, vi } from 'vitest';
import { Campaign } from '../src/game/campaign';
import { setLang, LANGS } from '../src/i18n';
import { ARC_EN } from '../src/i18n/arc.en';
import { ARC_RU } from '../src/i18n/arc.ru';
import { lairOf, startLairAssault } from '../src/game/campaignBattle';

vi.mock('phaser', () => {
  class C {}
  return { default: { GameObjects: { Container: C, Image: C, Text: C, Graphics: C, Rectangle: C, Zone: C, Sprite: C, Layer: C }, Scene: C, Loader: { Events: {} } } };
});
const { lairName } = await import('../src/scenes/WorldScene');
const { assaultPrimary } = await import('../src/ui/sheets/assault');

describe('the arc reads in both languages', () => {
  it('ru has every key of en', () => {
    expect(Object.keys(ARC_RU).sort()).toEqual(Object.keys(ARC_EN).sort());
  });

  it('every lair of a map has its name in both languages', () => {
    for (const seed of [1, 7, 42, 1234]) {
      const camp = Campaign.fresh(seed);
      const lairs = camp.world.map.settlements.filter((s) => s.kind === 'lair');
      expect(lairs.length).toBe(6);
      for (const lang of LANGS) {
        setLang(lang);
        for (const l of lairs) {
          const name = lairName(l.name);
          expect(name).not.toMatch(/^arc\./);
          if (lang === 'ru') expect(name).not.toBe(l.name);
        }
      }
    }
    setLang('en');
  });
});

describe('the Assault sheet', () => {
  it('burns an empty lair, strikes one in reach, else marches there first', () => {
    expect(assaultPrimary({ men: 0, inReach: false })).toBe('burn');
    expect(assaultPrimary({ men: 0, inReach: true })).toBe('burn');
    expect(assaultPrimary({ men: 12, inReach: true })).toBe('assault');
    expect(assaultPrimary({ men: 12, inReach: false })).toBe('march');
  });

  it('the map starts an assault as the lair battle, with the garrison as its band', () => {
    const camp = Campaign.fresh(5);
    const lair = camp.world.map.settlements.find((s) => s.kind === 'lair')!;
    const pending = startLairAssault(camp, lair.id, 99)!;
    // as WorldScene.assaultChoice sets it: the garrison's id, so Results and a left deployment come back to the map
    const onMap = { ...pending, partyId: -1 - lair.id };
    expect(lairOf(onMap)).toBe(lair.id);
    expect(camp.world.party(onMap.partyId)).toBeUndefined();
    expect(onMap.site?.assault).toBe(true);
  });
});
