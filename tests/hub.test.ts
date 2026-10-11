// HUB-02: the Campaign hub's rules (src/ui/mosaic/campaignHub.ts, design/ux/screens-campaign.md C-3).
import { afterEach, describe, expect, it } from 'vitest';
import { setLang, t } from '../src/i18n';
import { FRESCO_BANNER_H, FRESCO_FLAT, FRESCO_TALL, frescoSlot, hubStatusLine, pendingMen, showLairs, type HubStatus } from '../src/ui/mosaic/campaignHub';
import { perkSlots } from '../src/data/perks';

const base: HubStatus = { hasSave: true, day: 14, hurt: 0, lairsDown: 0, lairs: 6, arc: 'lairs' };

afterEach(() => setLang('en'));

describe('status line (C-3)', () => {
  it('no save: the fresh line, never a day or the arc', () => {
    expect(hubStatusLine({ ...base, hasSave: false, lairsDown: 2 })).toBe(t('menu.status.fresh'));
  });

  it('the day, or the town the army is in', () => {
    expect(hubStatusLine(base)).toBe('Day 14 on the march');
    expect(hubStatusLine({ ...base, place: 'Rhegion' })).toBe('Day 14 · in Rhegion');
  });

  it('hurt men come before the day', () => {
    expect(hubStatusLine({ ...base, hurt: 2, place: 'Rhegion' })).toBe('2 men are hurt: rest in a town.');
  });

  it('"Lairs n/6" only once the arc has moved (no invented 0/6 before lair assaults exist)', () => {
    expect(showLairs(base)).toBe(false);
    expect(hubStatusLine(base)).not.toContain('Lairs');
    expect(hubStatusLine({ ...base, place: 'Rhegion', lairsDown: 2 })).toBe('Day 14 · in Rhegion · Lairs 2/6');
    expect(showLairs({ ...base, arc: 'host' })).toBe(true);
    expect(showLairs({ ...base, lairs: 0, lairsDown: 0, arc: 'host' })).toBe(false);
    expect(showLairs({ ...base, hasSave: false, lairsDown: 3 })).toBe(false);
  });

  it('the arc won replaces the day', () => {
    expect(hubStatusLine({ ...base, arc: 'won', lairsDown: 6 })).toBe('Day 14 · The Tyrant is beaten');
    expect(hubStatusLine({ ...base, arc: 'post', hurt: 1 })).toBe('Day 14 · The Tyrant is beaten');
  });

  it('Russian has every variant', () => {
    setLang('ru');
    expect(hubStatusLine({ ...base, place: 'Rhegion', lairsDown: 2 })).toBe('День 14 · в Rhegion · Логова 2/6');
    expect(hubStatusLine({ ...base, arc: 'won' })).toBe('День 14 · Тиран повержен');
  });
});

describe('Army badge (G11: a count, not "!")', () => {
  it('counts men with a point or a free perk slot', () => {
    const lvl = 5;
    const full = Array.from({ length: perkSlots(lvl) }, (_, i) => i);
    expect(pendingMen([{ points: 0, level: lvl, perks: full }])).toBe(0);
    expect(pendingMen([{ points: 1, level: lvl, perks: full }, { points: 0, level: lvl, perks: full.slice(1) }, { points: 0, level: lvl, perks: full }])).toBe(perkSlots(lvl) > 0 ? 2 : 1);
  });
});

describe('fresco slot (MENU-1)', () => {
  const w = 150;
  it('fills the room between 2.2:1 and 3.4:1', () => {
    expect(frescoSlot(w, 500)).toEqual({ h: Math.round(w / FRESCO_TALL), kind: 'full' });
    expect(frescoSlot(w, 50)).toEqual({ h: 50, kind: 'full' });
    expect(frescoSlot(w, Math.round(w / FRESCO_FLAT))).toEqual({ h: Math.round(w / FRESCO_FLAT), kind: 'full' });
  });

  it('a one-line banner when 3.4:1 does not fit, none when even that does not', () => {
    expect(frescoSlot(w, Math.round(w / FRESCO_FLAT) - 1)).toEqual({ h: FRESCO_BANNER_H, kind: 'banner' });
    expect(frescoSlot(w, FRESCO_BANNER_H - 1)).toEqual({ h: 0, kind: 'none' });
    // the banner is still a 44 pt target
    expect(FRESCO_BANNER_H).toBeGreaterThanOrEqual(22);
  });
});
