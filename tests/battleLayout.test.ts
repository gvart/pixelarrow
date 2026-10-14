import { describe, expect, it } from 'vitest';
import { HUD_TAP, MEDAL_W, MEDIUM, NARRATOR_MAX, centredRow, fieldCoverage, hudMode, keycapSlot, narratorBox, sheetCardW, sideHud, type Rect } from '../src/ui/battleLayout';

const inside = (r: Rect, VW: number, VH: number) => r.x >= 0 && r.y >= 0 && r.x + r.w <= VW && r.y + r.h <= VH;
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// the matrix's landscape canvases in UI px (landscape-v6 §1.1), plus 844x390 inside Telegram's insets
const LAND = [
  [422, 195],
  [363, 161],
] as const;
const WIDE = [
  [512, 384],
  [640, 400],
  [720, 450],
  [640, 360],
] as const;

describe('hudMode (landscape-v6 §7.2)', () => {
  it('keeps phones in portrait on the v5 HUD and moves the rest to side layouts', () => {
    expect(hudMode({ cls: 'compact', land: false })).toBe('portrait');
    expect(hudMode({ cls: 'compact', land: true })).toBe('land');
    expect(hudMode({ cls: 'medium', land: false })).toBe('medium');
    expect(hudMode({ cls: 'medium', land: true })).toBe('wide');
    expect(hudMode({ cls: 'expanded', land: true })).toBe('wide');
  });
});

describe('compact landscape: cards left, the orders in a right thumb rail (§7.2, §16.5)', () => {
  for (const [VW, VH] of LAND) {
    it(`${VW}x${VH}: five order keys of at least 22 UI px in the rail, inside the screen`, () => {
      const h = sideHud('land', VW, VH, { cards: 4 });
      const o = h.orders;
      expect(o.vertical).toBe(true);
      expect(o.keyH).toBeGreaterThanOrEqual(HUD_TAP);
      expect(o.keyH).toBeLessThanOrEqual(24);
      expect(inside(h.rail!, VW, VH)).toBe(true);
      // the keys, the badge and the Formation chip sit inside the rail without touching
      const rail = h.rail!;
      for (const r of [o.keys, o.badge!, ...(o.formation ? [o.formation] : [])]) {
        expect(r.x).toBeGreaterThanOrEqual(rail.x);
        expect(r.y).toBeGreaterThanOrEqual(rail.y);
        expect(r.y + r.h).toBeLessThanOrEqual(rail.y + rail.h);
      }
      if (o.formation) expect(o.formation.y).toBeGreaterThanOrEqual(o.keys.y + o.keys.h + 2);
      // the rail is on the right edge, the cards on the left, the medallions between rail and field
      expect(rail.x + rail.w).toBeGreaterThan(VW - 8);
      expect(h.cards.x).toBeLessThan(8);
      expect(h.medals.x + MEDAL_W).toBeLessThanOrEqual(rail.x);
    });

    it(`${VW}x${VH}: the field covers at least 50% and the framing rect clears every cluster`, () => {
      const h = sideHud('land', VW, VH, { cards: 4 });
      const opaque = [h.top, h.cards, h.rail!];
      expect(fieldCoverage(VW, VH, opaque)).toBeGreaterThanOrEqual(0.5);
      for (const r of opaque) expect(overlap(h.framing, r)).toBe(false);
      expect(h.framing.w).toBeGreaterThan(100);
    });

    it(`${VW}x${VH}: deployment holds Formation, Groups, Works, Undo and a Fight key of at least 22 in the rail`, () => {
      const h = sideHud('land', VW, VH, { cards: 2 });
      expect(h.deployChips).toHaveLength(4);
      expect(h.fight.h).toBeGreaterThanOrEqual(HUD_TAP);
      expect(h.fight.y).toBeGreaterThanOrEqual(h.deployChips[3].y + h.deployChips[3].h + 2);
      expect(h.fight.y + h.fight.h).toBeLessThanOrEqual(h.rail!.y + h.rail!.h);
    });
  }

  it('keeps the Formation chip in the rail at 844x390 (Telegram moves it into the chip row only if needed)', () => {
    expect(sideHud('land', 422, 195, { cards: 4 }).orders.formation).not.toBeNull();
  });
});

describe('expanded: cards left, the orders in one bottom-centre bar, medallions right (§7.2, §16.5)', () => {
  for (const [VW, VH] of WIDE) {
    it(`${VW}x${VH}: five 56 × 30 keys in one bar between the card column and the medallions`, () => {
      const h = sideHud('wide', VW, VH, { cards: 4 });
      const k = h.orders.keys;
      expect(h.orders.vertical).toBe(false);
      expect(k.w).toBe(5 * 56 + 4 * 3);
      expect(k.h).toBe(30);
      expect(k.x).toBeGreaterThanOrEqual(h.cards.x + h.cards.w);
      expect(k.x + k.w).toBeLessThanOrEqual(h.medals.x);
      expect(k.x + k.w).toBeLessThanOrEqual(h.follow.x);
      expect(inside(h.plate!, VW, VH)).toBe(true);
      // the head line sits right above the bar, the chips above the head
      expect(h.head!.y + h.head!.h).toBeLessThanOrEqual(k.y);
      expect(h.chips.bottom).toBeLessThanOrEqual(h.plate!.y);
    });

    it(`${VW}x${VH}: the field covers at least 60%, the framing rect clears the clusters`, () => {
      const h = sideHud('wide', VW, VH, { cards: 4 });
      const medals: Rect = { x: h.medals.x, y: h.medals.top, w: MEDAL_W, h: h.medals.bottom - h.medals.top };
      const opaque = [h.top, h.cards, h.plate!];
      expect(fieldCoverage(VW, VH, [...opaque, medals])).toBeGreaterThanOrEqual(0.6);
      for (const r of [...opaque, medals]) expect(overlap(h.framing, r)).toBe(false);
    });
  }

  it('frames about 450 × 310 UI px at 1280x800 (§7.3)', () => {
    const f = sideHud('wide', 640, 400, { cards: 4 }).framing;
    expect(f.w).toBeGreaterThan(420);
    expect(f.h).toBeGreaterThan(290);
  });
});

describe('left-hand mode mirrors the side layouts (A11Y-16, §7.2)', () => {
  it('puts the order rail on the left and the cards on the right', () => {
    const r = sideHud('land', 422, 195, { cards: 3 });
    const l = sideHud('land', 422, 195, { cards: 3, leftHand: true });
    expect(l.rail!.x).toBe(422 - r.rail!.x - r.rail!.w);
    expect(l.cards.x).toBe(422 - r.cards.x - r.cards.w);
    expect(l.framing.x).toBe(422 - r.framing.x - r.framing.w);
    expect(l.chips.x0).toBe(422 - r.chips.x1);
    // the keys keep their top-to-bottom order (Q to T)
    expect(l.orders.keys.y).toBe(r.orders.keys.y);
  });
});

describe('medium portrait: three cards a row, centred orders, a sheet under 36% (§7.2)', () => {
  it('fits three cards a row in 384 UI px', () => {
    const w = sheetCardW(384, MEDIUM.cols, 3);
    expect(3 * w + 2 * 3).toBeLessThanOrEqual(384 - 8);
    expect(w).toBeGreaterThanOrEqual(56);
  });

  it('caps the orders at 360 and Fight at 300, centred', () => {
    expect(centredRow(384, MEDIUM.ordersMax)).toEqual({ x: 12, w: 360 });
    expect(centredRow(410, MEDIUM.fightMax)).toEqual({ x: 55, w: 300 });
    // a narrow screen keeps its v5 4 px margins
    expect(centredRow(195, 360)).toEqual({ x: 4, w: 187 });
  });

  it('keeps the bottom sheet (four cards, the head and the orders) under 36% of the height', () => {
    const rows = Math.ceil(4 / MEDIUM.cols);
    const sheet = 5 + rows * (28 + 3) - 3 + 4 + 22 + 28 + 5;
    for (const VH of [512, 590]) expect(sheet).toBeLessThanOrEqual(MEDIUM.sheetShare * VH);
  });
});

describe('keycap slots (input-v6 §6.1)', () => {
  it('sit on the top-right corner of a control, overlapping its rim, never widening it', () => {
    const key = { x: 100, y: 50, w: 56, h: 30 };
    const k = keycapSlot(key);
    expect(k.x + k.w).toBeGreaterThan(key.x + key.w - 1);
    expect(k.x).toBeGreaterThan(key.x);
    expect(k.y).toBeLessThan(key.y + 1);
    expect(k.x + k.w - (key.x + key.w)).toBeLessThanOrEqual(3);
  });

  it('stay on screen for every rail and bar key at every landscape size', () => {
    for (const [VW, VH] of [...LAND, ...WIDE]) {
      const h = sideHud(VW < 480 ? 'land' : 'wide', VW, VH, { cards: 4 });
      const k = h.orders.keys;
      const slots = h.orders.vertical ? [0, 1, 2, 3, 4].map((i) => keycapSlot({ x: k.x, y: k.y + i * (h.orders.keyH + 2), w: k.w, h: h.orders.keyH })) : [keycapSlot({ ...k, x: k.x + k.w - 56, w: 56 })];
      for (const s of slots) expect(inside(s, VW, VH)).toBe(true);
    }
  });
});

describe('the tutorial narrator\'s box (landscape-v6 §13.1: a dialog, at most 320 wide)', () => {
  it('keeps the v5 full-width panel on a phone upright', () => {
    for (const VW of [195, 180, 160]) expect(narratorBox('portrait', VW, null)).toEqual({ x: 4, w: VW - 8 });
  });

  it('centres a 320 panel on a tablet upright (as v5, no wider than a dialog)', () => {
    const b = narratorBox('medium', 384, null);
    expect(b.w).toBe(NARRATOR_MAX);
    expect(b.x).toBe(32);
  });

  it('sits top-left in the framing rect in landscape, clear of the card column and the rails', () => {
    for (const [VW, VH] of [...LAND, ...WIDE]) {
      for (const leftHand of [false, true]) {
        const mode = VW < 480 ? 'land' : 'wide';
        const h = sideHud(mode, VW, VH, { cards: 4, leftHand });
        const b = narratorBox(mode, VW, h.framing);
        expect(b.w).toBeLessThanOrEqual(NARRATOR_MAX);
        expect(b.x).toBeGreaterThanOrEqual(h.framing.x);
        expect(b.x + b.w).toBeLessThanOrEqual(h.framing.x + h.framing.w);
        expect(overlap({ ...b, y: h.framing.y, h: 40 }, { ...h.cards, h: 4 * h.cardH })).toBe(false);
      }
    }
  });
});
