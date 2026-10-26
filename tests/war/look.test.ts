import { describe, expect, it } from 'vitest';
import {
  CLOAK_STEPS, GROUP_ID, PAL_ROWS, PAL_W, SKIN_TONES, buildPalette, groupColor, hashSlot, lookCode, lookMap, lookOf, paintLook, swapRed, teamColor, tierOf, toHsv, type Look,
} from '../../src/war/view/look';
import { hexColor, type SheetManifest } from '../../src/art/sheetManifest';
import { kitItem } from '../../src/war/sim/classes';
import type { Item } from '../../src/data/items';

const manifests = import.meta.glob<SheetManifest>('../../src/assets/sheets/*/manifest.json', { eager: true, import: 'default' });
const sheets: [string, SheetManifest][] = Object.entries(manifests).map(([p, m]) => [p.split('/').at(-2)!, m]);
const grouped = sheets.filter(([, m]) => Object.keys(m.colorGroups ?? {}).some((g) => g in GROUP_ID));
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const luma = (c: number) => 0.299 * (c >> 16) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255);
const allLooks = (n: number): Look[] => Array.from({ length: n }, (_, i) => ({ tier: i % 3, skin: i % 6, cloak: i % 8, crest: i % 4, trim: (i >> 1) % 4, hair: i % 5 }));

describe('war per-man look', () => {
  it('is the same for the same person and varies between persons', () => {
    for (const cls of ['hoplite', 'celt_sword', 'peltast', 'militia']) {
      expect(lookOf('p-123', cls, { level: 5 })).toEqual(lookOf('p-123', cls, { level: 5 }));
      const looks = Array.from({ length: 300 }, (_, i) => lookOf(`person-${i}`, cls));
      expect(new Set(looks.map((l) => l.skin)).size).toBeGreaterThanOrEqual(4);
      expect(new Set(looks.map((l) => l.cloak)).size).toBe(CLOAK_STEPS.length);
      expect(new Set(looks.map((l) => JSON.stringify(l))).size).toBeGreaterThan(100);
    }
    // the shader's inputs too: the palette and a man's code
    expect(buildPalette(grouped).data).toEqual(buildPalette(grouped).data);
    expect(lookCode(2, 1, lookOf('p-9', 'hoplite'))).toEqual(lookCode(2, 1, lookOf('p-9', 'hoplite')));
  });

  it('skews skin by folk: Celts fairer than Phoenicians', () => {
    const mean = (cls: string) => Array.from({ length: 400 }, (_, i) => lookOf(`m${i}`, cls).skin).reduce((a, b) => a + b, 0) / 400;
    expect(mean('celt_sword')).toBeLessThan(mean('falx') + 0.6);
    expect(mean('celt_sword') + 1).toBeLessThan(mean('chariot')); // phoenician
  });

  it('keeps every skin tone a dark-to-light ramp', () => {
    for (const [, m] of grouped) {
      const skin = (m.colorGroups?.skin ?? []).map(hexColor);
      for (const tone of SKIN_TONES) for (let i = 1; i < skin.length; i++) expect(luma(tone(skin[i]))).toBeGreaterThan(luma(tone(skin[i - 1])));
    }
  });

  it('keeps dyed cloth in its team family', () => {
    for (const [cls, m] of grouped)
      for (const g of ['cloak', 'crest', 'emblem', 'trim'])
        (m.colorGroups?.[g] ?? []).forEach((_, i) => {
          for (const look of allLooks(24))
            for (const team of [0, 1]) {
              const tiered = hexColor((m.tiers?.[(['basic', 'veteran', 'elite'] as const)[look.tier]]?.[g] ?? m.colorGroups![g])[i]);
              const base = teamColor(tiered, team), out = groupColor(m, g, i, team, look);
              const [bh, bs, bv] = toHsv(base), [oh, os] = toHsv(out);
              if (bs > 0.2 && bv > 0.08) expect(hueGap(oh, bh), `${cls} ${g}[${i}] team ${team}`).toBeLessThanOrEqual(10);
              // red cloth: blue for the player's side, red for the foe
              if (swapRed(tiered) !== tiered && os > 0.25 && bv > 0.2) { // near-black shadow steps carry no readable hue
                if (team === 0) expect(oh > 190 && oh < 265, `${cls} ${g}[${i}] blue: hue ${oh}`).toBe(true);
                else expect(hueGap(oh, 0), `${cls} ${g}[${i}] red`).toBeLessThan(30);
              }
            }
        });
  });

  it('finds every recoloured colour in its own palette slot', () => {
    const pal = buildPalette(grouped);
    expect(pal.index.size).toBe(grouped.length);
    for (const [cls, m] of grouped) {
      const y0 = pal.index.get(cls)! * PAL_ROWS, at = (x: number, y: number) => { const o = (y * PAL_W + x) * 4; return (pal.data[o] << 16) | (pal.data[o + 1] << 8) | pal.data[o + 2]; };
      const k = at(0, y0), mult: [number, number, number] = [k >> 16, (k >> 8) & 255, k & 255];
      const look = lookOf('slot-check', cls, { level: 9 }), code = lookCode(0, 0, look);
      expect(code.fx).toBe(8 + 2); // elite, team 0, block 0
      for (const [g, cs] of Object.entries(m.colorGroups ?? {})) {
        if (!(g in GROUP_ID)) continue;
        cs.forEach((c, i) => {
          const x = hashSlot(hexColor(c), mult);
          expect(at(x, y0 + 1)).toBe(hexColor(c));
          expect(at(x, y0 + 2) >> 16).toBe(GROUP_ID[g] * 16);
          const v = g === 'cloak' ? look.cloak : g === 'crest' ? look.crest : g === 'trim' ? look.trim : g === 'skin' ? look.skin : g === 'emblem' ? 0 : look.hair;
          expect(at(x, y0 + 3 + (0 * 3 + look.tier) * 8 + v)).toBe(groupColor(m, g, i, 0, look));
        });
      }
    }
  });

  it('takes the tier from worn gear, else from level', () => {
    expect([1, 3, 4, 7, 8, 10].map((l) => tierOf('hoplite', l))).toEqual([0, 0, 1, 1, 2, 2]);
    const equip = (t: number) => Object.fromEntries((['weapon', 'shield', 'helmet', 'armor'] as const).flatMap((s) => {
      const def = kitItem('hoplite', s, t);
      return def ? [[s, { uid: s, def, rarity: 'common', cond: 100 } as Item]] : [];
    }));
    expect(tierOf('hoplite', 10, { equip: equip(0) })).toBe(0);
    expect(tierOf('hoplite', 1, { equip: equip(2) })).toBeGreaterThan(0); // the band's thirds (gearTier) decide veteran or elite
  });

  it('paints CPU pixels as the shader draws them', () => {
    const m = grouped.find(([c]) => c === 'hoplite')![1], look = lookOf('p-1', 'hoplite');
    const skin = hexColor(m.colorGroups!.skin[2]), red = 0x902020;
    const px = new Uint8ClampedArray([skin >> 16, (skin >> 8) & 255, skin & 255, 255, 0x90, 0x20, 0x20, 255, 9, 9, 9, 0]);
    paintLook(px, m, 0, look);
    const at = (i: number) => (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
    expect(at(0)).toBe(lookMap(m, 0, look).get(skin));
    expect(at(4)).toBe(swapRed(red));
    expect(at(8)).toBe(0x090909);
  });
});
