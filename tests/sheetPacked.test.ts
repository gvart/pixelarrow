import { afterEach, beforeAll, describe, expect, it } from 'vitest';
// @ts-ignore -- node built-ins; the browser tsconfig has no @types/node
import { readFileSync } from 'node:fs';
// @ts-ignore -- the packer is a node script (no types)
import { packSheet } from '../scripts/art/pack/pack.mjs';
// @ts-ignore
import { encodePngSmall } from '../scripts/art/pack/png.mjs';
// @ts-ignore
import { decodePng } from '../scripts/art/lib/png.mjs';
import { BATTLE_RES, BATTLE_SCALE, dollKey, renderFrame, renderFrameFx, renderPortrait, type DollSpec } from '../src/art/paperdoll';
import { Pix } from '../src/art/pixels';
import { animPages, packedCell, parseManifest, sheetFrameId, type SheetAnim, type SheetManifest } from '../src/art/sheetManifest';
import {
  PAGE_TTL_MS, PALETTE_CAP, clearSheets, installSheetDolls, isSheetDoll, pixSource, registerSheet, setSheetLoader, setSheetPixels, sheetDrawFrame, sheetMemoryStats, sweepSheets,
} from '../src/art/sheetDoll';

type Img = { w: number; h: number; data: Uint8Array };
const toPix = (img: Img) => {
  const p = new Pix(img.w, img.h);
  p.data.set(img.data);
  return p;
};

const dir = 'src/dev/sheets/hoplite/';
const v2: SheetManifest = JSON.parse(readFileSync(`${dir}manifest.json`, 'utf8'));
const src: Img = decodePng(readFileSync(dir + v2.image));
const packed = packSheet(v2, src);
const v3: SheetManifest = packed.manifest;
// the pages as the browser decodes them
const pages: Pix[] = packed.pages.map((p: { img: Img }) => toPix(decodePng(encodePngSmall(p.img).png)));

const LOOK = { skin: 1, hair: 1, hairStyle: 0, beard: 1, tunic: 'tunicRed' };
const man = (o: Partial<DollSpec> = {}): DollSpec => ({
  look: LOOK, weapon: 'spear', shield: { art: 'hoplon' }, helmet: { art: 'corinthian' }, armor: 'cuirass', cls: 'hoplite', scale: BATTLE_SCALE, res: BATTLE_RES,
  gear: { weapon: { def: 'dory', r: 0 }, shield: { def: 'hoplon', r: 0 }, helmet: { def: 'pilos', r: 0 }, armor: { def: 'linothorax', r: 0 } }, ...o,
});
/** Tiers, skins, shades and rarities: basic, an elite epic, a veteran with rare metal, a deep-skinned man. */
const LOOKS: DollSpec[] = [
  man(),
  man({ seed: 7, gear: { weapon: { def: 'dory', r: 4 }, shield: { def: 'aspis', r: 4 }, helmet: { def: 'attic', r: 3 }, armor: { def: 'muscle', r: 4 } } }),
  man({ seed: 2, gear: { weapon: { def: 'dory', r: 2 }, shield: { def: 'hoplon', r: 2 }, helmet: { def: 'pilos', r: 1 }, armor: { def: 'linothorax', r: 2 } } }),
  man({ look: { ...LOOK, skin: 3 }, seed: 5 }),
];

/** Everything a figure draws: every frame of every clip (other looks: the first), 4 facings, with ring and glint; and portraits. */
function drawAll(): string[] {
  const out: string[] = [];
  for (const d of LOOKS) {
    out.push(dollKey(d));
    for (const [a, def] of Object.entries(v2.anims) as [SheetAnim, { frames: number }][])
      for (let i = 0; i < (d === LOOKS[0] ? def.frames : 1); i++)
        for (let f = 0; f < 4; f++) {
          const r = renderFrameFx(d, sheetFrameId(a, i), f);
          out.push(`${a}${i}.${f}:${Array.from(r.px.data).join()}|${Array.from(r.ring.data).join()}|${Array.from(r.glint.data).join()}`);
        }
    for (let p = 0; p < 3; p++) out.push(Array.from(renderPortrait(d, p).data).join());
  }
  return out;
}

describe('packed sheets at runtime', () => {
  beforeAll(() => installSheetDolls());
  afterEach(() => {
    clearSheets();
    setSheetLoader(null);
  });

  it('look up a frame by its rect and offset', () => {
    const m = parseManifest(v3);
    const c = packedCell(m, m.anims.idle!.col, 2)!;
    // the stored rect, put back at its offset, is the source frame
    const fw = m.frame.w;
    for (let y = 0; y < m.frame.h; y++)
      for (let x = 0; x < fw; x++) {
        const inside = x >= c.dx && x < c.dx + c.w && y >= c.dy && y < c.dy + c.h;
        const si = ((2 * m.frame.h + y) * src.w + m.anims.idle!.col * fw + x) * 4;
        const pi = inside ? ((c.y + y - c.dy) * pages[c.page].w + c.x + x - c.dx) * 4 : -1;
        expect(inside ? pages[c.page].data[pi + 3] : 0).toBe(src.data[si + 3]);
        if (src.data[si + 3]) expect(Array.from(pages[c.page].data.subarray(pi, pi + 4))).toEqual(Array.from(src.data.subarray(si, si + 4)));
      }
    // a held pose stored once: two cells, one rect
    const brace = m.anims.brace!;
    expect(m.packed!.cells[((brace.col + 1) * 4 + 0) * 3]).toBe(m.packed!.cells[((brace.col + 2) * 4 + 0) * 3]);
    expect(animPages(m, 'idle').every((p) => m.packed!.pages[p].group === 'core')).toBe(true);
    expect(animPages(m, 'look').some((p) => m.packed!.pages[p].group === 'extra')).toBe(true);
  });

  it('draw exactly as the unpacked sheet: every frame, facing, tier, variant, rarity and portrait', () => {
    registerSheet(v2);
    setSheetPixels('hoplite', toPix(src));
    const before = drawAll();
    clearSheets();
    registerSheet(v3);
    setSheetPixels('hoplite', pages);
    const after = drawAll();
    expect(after.length).toBe(before.length);
    for (let i = 0; i < before.length; i++) if (after[i] !== before[i]) expect(after[i].slice(0, 40), `entry ${i}`).toBe(before[i].slice(0, 40));
    expect(after).toEqual(before);
  });

  it('load an extra page on first use, showing the clip fallback meanwhile, and drop it when unread', async () => {
    const files = v3.packed!.pages.map((p) => p.file);
    const loads: string[] = [];
    setSheetLoader(async (url) => {
      loads.push(url);
      return pixSource(pages[files.indexOf(url)]);
    });
    registerSheet(v3, (f) => f);
    const d = man();
    expect(isSheetDoll(d)).toBe(false); // the core pages are asked for
    await new Promise((r) => setTimeout(r, 0));
    expect(isSheetDoll(d)).toBe(true);
    const core = files.filter((_, i) => v3.packed!.pages[i].group === 'core');
    expect(loads).toEqual(core);
    // look (extra) is drawn as idle while its page loads
    const look = sheetFrameId('look', 1);
    expect(sheetDrawFrame(d, look)).toBe(sheetFrameId('idle', 1));
    const asIdle = Array.from(renderFrame(d, look, 0).data);
    expect(asIdle).toEqual(Array.from(renderFrame(d, sheetFrameId('idle', 1), 0).data));
    await new Promise((r) => setTimeout(r, 0));
    expect(loads.length).toBe(files.length);
    expect(sheetDrawFrame(d, look)).toBe(look);
    expect(Array.from(renderFrame(d, look, 0).data)).not.toEqual(asIdle);
    const full = sheetMemoryStats();
    expect(full.extraBytes).toBeGreaterThan(0);
    expect(full.coreBytes).toBe(v3.packed!.pages.filter((p) => p.group === 'core').reduce((s, p) => s + p.w * p.h * 4, 0));
    // unread for PAGE_TTL_MS: the extra page goes, the core stays (the class is in use)
    sweepSheets(performance.now() + PAGE_TTL_MS + 1, new Set(['hoplite']));
    const swept = sheetMemoryStats();
    expect(swept.extraBytes).toBe(0);
    expect(swept.coreBytes).toBe(full.coreBytes);
    expect(sheetDrawFrame(d, look)).toBe(sheetFrameId('idle', 1)); // and is asked for again
  });

  it('bound the colour maps: an LRU of PALETTE_CAP', () => {
    registerSheet(v3);
    setSheetPixels('hoplite', pages);
    // more looks than the cap: tiers x skins x shades x rarity mixes
    const looks = new Set<string>();
    for (const defs of [['hoplon', 'pilos', 'linothorax'], ['aspis', 'attic', 'muscle']])
      for (let r = 0; r <= 4; r++)
        for (let r2 = 0; r2 <= 4; r2++)
          for (let skin = 0; skin < 4; skin++)
            for (let seed = 0; seed < 6; seed++) {
              const d = man({ look: { ...LOOK, skin }, seed, gear: { weapon: { def: 'dory', r }, shield: { def: defs[0], r: r2 }, helmet: { def: defs[1], r: r2 }, armor: { def: defs[2], r: r2 } } });
              looks.add(dollKey(d).replace(/_\d+$/, '')); // the colour-map part of the key
              renderFrame(d, sheetFrameId('idle', 0), 0);
            }
    const st = sheetMemoryStats();
    expect(looks.size).toBeGreaterThan(PALETTE_CAP);
    expect(st.palettes).toBe(PALETTE_CAP);
    expect(st.paletteBytes).toBeLessThan(2 * 1024 * 1024);
  });
});
