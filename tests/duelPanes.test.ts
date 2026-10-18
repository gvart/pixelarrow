import { describe, expect, it } from 'vitest';
import { duelPanes, floorsPerRow, offerColumns, SIDE_W } from '../src/scenes/duel/duelLayout';

// the region a page gets inside the frame at each matrix size (UI px)
const CL = { cls: 'compact', land: true } as const;
const MED = { cls: 'medium', land: false } as const;
const EXP = { cls: 'expanded', land: true } as const;
const PORT = { cls: 'compact', land: false } as const;
const box = (w: number, h = 300) => ({ x: 10, y: 20, w, h });

describe('duelPanes (landscape-v6 §9.2)', () => {
  it('keeps the v5 page in compact portrait', () => {
    expect(duelPanes(PORT, box(180), 'hub')).toBeNull();
    expect(duelPanes(PORT, box(180), 'team')).toBeNull();
  });

  it('gives the hub a 130-wide profile column beside the mode content at 844x390', () => {
    const p = duelPanes(CL, box(322), 'hub')!;
    expect(p.side).toEqual({ x: 10, y: 20, w: SIDE_W.compactLandscape, h: 300 });
    expect(p.main.x).toBe(10 + 130 + 8);
    expect(p.main.x + p.main.w).toBe(10 + 322);
  });

  it('gives the hub a 180-wide profile column at expanded, within CONTENT_MAX, centred', () => {
    const p = duelPanes(EXP, box(700), 'hub')!;
    expect(p.side!.w).toBe(180);
    // 640 wide at most, centred in the region
    expect(p.side!.x).toBe(10 + 30);
    expect(p.main.x + p.main.w).toBe(10 + 30 + 640);
  });

  it('stacks the hub on a tablet across the pane (the v5 page, wider)', () => {
    const p = duelPanes(MED, box(368), 'hub')!;
    expect(p.side).toBeNull();
    expect(p.main).toEqual({ x: 10, y: 20, w: 368, h: 300 });
  });

  it('splits Team on a tablet (master and detail) and everywhere outside portrait', () => {
    expect(duelPanes(MED, box(368), 'team')!.side!.w).toBe(180);
    expect(duelPanes(CL, box(410), 'team')!.side).not.toBeNull();
  });

  it('keeps the Armoury one column of controls over a two-card grid at 844x390 (no side pane)', () => {
    const p = duelPanes(CL, box(410), 'shop')!;
    expect(p.side).toBeNull();
    expect(offerColumns(CL, p.main.w)).toBe(2);
  });

  it('never leaves a pane narrower than a five-tile row (Telegram at 844x390)', () => {
    const p = duelPanes(CL, box(267), 'hub')!;
    expect(p.main.w).toBeGreaterThanOrEqual(5 * 22 + 4 * 2);
  });

  it('lays a chapter on one row of ten at expanded, five elsewhere, four on the narrowest phones', () => {
    expect(floorsPerRow(EXP, 380)).toBe(10);
    expect(floorsPerRow(CL, 180)).toBe(5);
    expect(floorsPerRow(MED, 360)).toBe(5);
    expect(floorsPerRow(PORT, 158)).toBe(5);
    expect(floorsPerRow(PORT, 112)).toBe(4);
  });

  it('gives the shop 2 columns in portrait from 2 x 176, 2 at 844x390 and on laptops, 3 where three cards read whole', () => {
    expect(offerColumns(PORT, 2 * 176 + 3)).toBe(2);
    expect(offerColumns(PORT, 2 * 176 + 2)).toBe(1);
    expect(offerColumns(CL, 322)).toBe(2);
    expect(offerColumns(EXP, 436)).toBe(2);
    expect(offerColumns(EXP, 3 * 150 + 6)).toBe(3);
  });
});
