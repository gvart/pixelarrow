import { describe, expect, it } from 'vitest';
// @ts-ignore -- node built-ins; the browser tsconfig has no @types/node
import { readFileSync } from 'node:fs';
// @ts-ignore -- the packer is a node script (no types)
import { EXTRA_ANIMS, MAX_PAGE, frameCell, manifestColumns, packSheet, unpackFrame, verifyPack } from '../scripts/art/pack/pack.mjs';
// @ts-ignore
import { encodePngSmall } from '../scripts/art/pack/png.mjs';
// @ts-ignore
import { decodePng } from '../scripts/art/lib/png.mjs';
import { anchorOf, parseManifest, type SheetManifest } from '../src/art/sheetManifest';

type Img = { w: number; h: number; data: Uint8Array };
const dir = 'src/dev/sheets/hoplite/';
const source = (): { m: SheetManifest; img: Img } => {
  const m = JSON.parse(readFileSync(`${dir}manifest.json`, 'utf8'));
  return { m, img: decodePng(readFileSync(dir + m.image)) };
};

/** The frame at (col, row) of a v2 sheet, transparent pixels as 0,0,0,0. */
function sourceFrame(m: SheetManifest, img: Img, col: number, row: number): Uint8Array {
  const [x0, y0] = frameCell(m, col, row);
  const out = new Uint8Array(m.frame.w * m.frame.h * 4);
  for (let y = 0; y < m.frame.h; y++)
    for (let x = 0; x < m.frame.w; x++) {
      const si = ((y0 + y) * img.w + x0 + x) * 4;
      if (y0 + y < img.h && x0 + x < img.w && img.data[si + 3]) out.set(img.data.subarray(si, si + 4), (y * m.frame.w + x) * 4);
    }
  return out;
}

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Pack, encode the pages as shipped and decode them again (what the browser reads). */
function roundTrip(m: SheetManifest, img: Img, opts = {}) {
  const { manifest, pages } = packSheet(m, img, opts);
  const decoded = pages.map((p: { img: Img }) => decodePng(encodePngSmall(p.img).png));
  return { manifest, pages, decoded };
}

describe('sheet packer', () => {
  it('packs the placeholder hoplite: every frame pixel-identical, anchors kept, smaller', () => {
    const { m, img } = source();
    const { manifest, pages, decoded } = roundTrip(m, img);
    expect(() => verifyPack(m, img, manifest, decoded)).not.toThrow();
    for (let c = 0; c < manifestColumns(m); c++)
      for (let r = 0; r < m.rows.length; r++) expect(same(unpackFrame(manifest, decoded, c, r), sourceFrame(m, img, c, r)), `col ${c} row ${r}`).toBe(true);
    // a valid v3 manifest: the same frame, anchors, rows, colours and clips
    const p = parseManifest(manifest);
    expect(p.version).toBe(3);
    expect(p.image).toBeUndefined();
    for (const k of ['frame', 'anchor', 'anchors', 'rows', 'colorGroups', 'tiers', 'anims', 'metal', 'scale'] as const) expect(p[k]).toEqual(m[k]);
    for (let r = 0; r < m.rows.length; r++) expect(anchorOf(p, r)).toEqual(anchorOf(m, r));
    // trimmed and deduped: fewer stored frames than cells, far fewer pixels than the source
    const n = p.packed!.cells.length / 3;
    expect(n).toBe(manifestColumns(m) * m.rows.length);
    expect(p.packed!.rects.length / 5).toBeLessThan(n);
    const area = pages.reduce((s: number, q: { img: Img }) => s + q.img.w * q.img.h, 0);
    expect(area).toBeLessThan((img.w * img.h) / 2);
    // core and extra pages; the extra clips' own frames only on extra pages, idle on core
    const groups = p.packed!.pages.map((q) => q.group);
    expect(groups).toContain('core');
    expect(groups).toContain('extra');
    const pageOf = (col: number, row: number) => p.packed!.rects[p.packed!.cells[(col * m.rows.length + row) * 3] * 5];
    expect(groups[pageOf(m.anims.idle!.col, 0)]).toBe('core');
    expect(groups[pageOf(m.anims.look!.col + 1, 0)]).toBe('extra');
    expect(EXTRA_ANIMS).toContain('look');
  });

  it('keeps a wrapped sheet with per-row anchors exact, and splits pages at the size cap', () => {
    // 3 rows, 12 columns wrapped at 5; every frame a different blob at a different place
    const fw = 12;
    const fh = 14;
    const rows = ['south-east', 'north-east', 'south-west'] as const;
    const m: SheetManifest = {
      version: 2, class: 'test', image: 't.png', frame: { w: fw, h: fh }, wrap: 5, anchor: { x: 6, y: 12 },
      anchors: { 'south-east': { x: 3, y: 12 } }, scale: 1, rows: [...rows], facings: ['south-east', 'north-east', 'south-west', 'south-west'],
      anims: { idle: { col: 0, frames: 4, fps: 4 }, walk: { col: 4, frames: 6, fps: 8 }, cheer: { col: 10, frames: 2, fps: 3 } },
    };
    const w = 5 * fw;
    const h = 3 * rows.length * fh;
    const data = new Uint8Array(w * h * 4);
    for (let c = 0; c < 12; c++)
      for (let r = 0; r < rows.length; r++) {
        const [x0, y0] = frameCell(m, c, r);
        for (let k = 0; k < 6 + c; k++) {
          const x = x0 + ((c * 3 + k * 5 + r) % fw);
          const y = y0 + ((c + k * 7 + r * 2) % fh);
          data.set([c * 20, r * 60, k * 9, k % 3 ? 255 : 128], (y * w + x) * 4);
        }
      }
    const img = { w, h, data };
    for (const maxPage of [MAX_PAGE, 30]) {
      const { manifest, decoded } = roundTrip(m, img, { maxPage });
      expect(() => verifyPack(m, img, manifest, decoded)).not.toThrow();
      expect(manifest.anchors).toEqual(m.anchors);
      expect(manifest.wrap).toBeUndefined();
      for (const q of manifest.packed.pages) expect(Math.max(q.w, q.h)).toBeLessThanOrEqual(maxPage);
      if (maxPage === 30) expect(manifest.packed.pages.filter((q: { group: string }) => q.group === 'core').length).toBeGreaterThan(1);
      expect(() => parseManifest(manifest)).not.toThrow();
    }
    // no split: one group
    const { manifest } = roundTrip(m, img, { split: false });
    expect(new Set(manifest.packed.pages.map((q: { group: string }) => q.group))).toEqual(new Set(['core']));
  });

  it('encodes pages losslessly, indexed when 256 colours or fewer', () => {
    const many = { w: 40, h: 20, data: new Uint8Array(40 * 20 * 4).map((_, i) => [(i >> 2) & 255, (i >> 10) * 50, ((i >> 2) * 7) & 255, 255][i & 3]) };
    const few = { w: 33, h: 7, data: new Uint8Array(33 * 7 * 4).map((_, i) => (i % 4 === 3 ? ((i >> 2) % 3 ? 255 : 0) : ((i >> 2) % 5) * 40)) };
    for (const img of [many, few]) {
      const e = encodePngSmall(img);
      const back = decodePng(e.png);
      expect([back.w, back.h]).toEqual([img.w, img.h]);
      for (let i = 0; i < img.data.length; i += 4) {
        if (!img.data[i + 3]) expect(back.data[i + 3]).toBe(0);
        else expect(Array.from(back.data.subarray(i, i + 4))).toEqual(Array.from(img.data.subarray(i, i + 4)));
      }
    }
    expect(encodePngSmall(few).indexed).toBe(true);
    expect(encodePngSmall(many).indexed).toBe(false);
  });
});
