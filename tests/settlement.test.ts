/**
 * SET-01: the Settlement's pure parts (design/ux/screens-campaign.md C-6). The page draws with Phaser;
 * tested here: the hire Undo (controls.md R4.3) gives back the man, the gold and the offer; the
 * Drillmaster has work only when a man has a perk tier to switch (abilities.md R7); the oracle, whose
 * free retrain the Drillmaster now spends, is back in the deck; every Settlement string reads in both
 * languages.
 */
import { describe, expect, it, vi } from 'vitest';
import { Campaign } from '../src/game/campaign';
import { STARTER_DECK } from '../src/data/eventDeck';
import { SETTLEMENT_EN } from '../src/i18n/settlement.en';
import { LANGS, setLang, t, type TKey } from '../src/i18n';
import type { Hero } from '../src/data/units';
import type { PerkId } from '../src/data/perks';

vi.mock('phaser', () => {
  class C {}
  return { default: { GameObjects: { Container: C, Image: C, Text: C, Graphics: C, Rectangle: C, Zone: C, Sprite: C, BitmapText: C }, Scene: C, Loader: { Events: {} }, Textures: { FilterMode: {} } } };
});
const { HIRE_UNDO_S, canRetrainAny, undoHire } = await import('../src/ui/sheets/recruit');

/** A fresh campaign with gold to hire at its starting town, and that town's first offer. */
function atStart(): { c: Campaign; sid: number } {
  const c = Campaign.fresh(11);
  c.data.gold = 5000;
  return { c, sid: c.world.map.start };
}

describe('hire Undo (controls.md R4.3)', () => {
  it('lasts 4 s', () => {
    expect(HIRE_UNDO_S).toBe(4);
  });

  it('takes the man back: army, gold and the offer as they were', () => {
    const { c, sid } = atStart();
    const offers = c.world.recruits(sid, c.data.heroes);
    expect(offers.length).toBeGreaterThan(0);
    const offer = offers[0];
    const men = c.data.heroes.length;
    const gold = c.data.gold;
    const h = c.hire(sid, offer.index)!;
    expect(h).toBeTruthy();
    expect(c.data.heroes.length).toBe(men + 1);
    expect(c.data.gold).toBe(gold - offer.price);
    expect(c.world.recruits(sid, c.data.heroes).some((r) => r.index === offer.index)).toBe(false);

    expect(undoHire(c, { sid, index: offer.index, heroId: h.id, price: offer.price })).toBe(true);
    expect(c.data.heroes.length).toBe(men);
    expect(c.data.heroes.some((x) => x.id === h.id)).toBe(false);
    expect(c.data.gold).toBe(gold);
    const back = c.world.recruits(sid, c.data.heroes).find((r) => r.index === offer.index);
    expect(back?.price).toBe(offer.price);
    expect(back?.hero.name).toBe(offer.hero.name);
  });

  it('does nothing twice (the man is already gone)', () => {
    const { c, sid } = atStart();
    const offer = c.world.recruits(sid, c.data.heroes)[0];
    const h = c.hire(sid, offer.index)!;
    const r = { sid, index: offer.index, heroId: h.id, price: offer.price };
    expect(undoHire(c, r)).toBe(true);
    const gold = c.data.gold;
    expect(undoHire(c, r)).toBe(false);
    expect(c.data.gold).toBe(gold);
  });
});

describe('the Drillmaster (abilities.md R7)', () => {
  const man = (perks: PerkId[], cls = 'hoplite') => ({ perks, cls }) as unknown as Hero;

  it('has work only when a man has chosen a perk tier of his class paths', () => {
    expect(canRetrainAny([])).toBe(false);
    expect(canRetrainAny([man([])])).toBe(false);
    expect(canRetrainAny([man([]), man(['shield_drill'])])).toBe(true);
  });

  it('a fresh army has nothing to retrain', () => {
    expect(canRetrainAny(Campaign.fresh(3).data.heroes)).toBe(false);
  });

  it('the oracle (a free retrain) is in the deck again, now that the Drillmaster spends it', () => {
    expect(STARTER_DECK.find((d) => d.id === 'oracle')!.weight).toBeGreaterThan(0);
  });
});

describe('Settlement strings', () => {
  for (const lang of LANGS) {
    it(`read in ${lang} (no key shows)`, () => {
      setLang(lang);
      for (const k of Object.keys(SETTLEMENT_EN) as TKey[]) expect(t(k, { n: 2, name: 'Doros', gold: 9 })).not.toBe(k);
      expect(t('set.reopens', { n: 1 })).toMatch(/1/);
    });
  }
  setLang('en');
});
