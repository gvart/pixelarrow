/**
 * The UI typeface: Inter (text) and Cormorant SC (headings), bundled with
 * @fontsource (main.ts imports the CSS) and drawn into Phaser bitmap-font
 * atlases at the device's resolution, so every existing `addText` /
 * BitmapText call renders smooth vector type instead of the old pixel font
 * (src/art/font.ts, still used by the store-image generator).
 *
 * Units: the atlas holds K atlas px per UI px (K = the UI scale, rounded up),
 * and the font data's `size` is BASE_SIZE * K, so a BitmapText at font size
 * 7 (the kit's base size) draws glyphs in UI px. Text is FONT_PX UI px tall
 * (the em) with the baseline at BASELINE inside a LINE_H line: the same box
 * the pixel font used, so existing layouts keep their rhythm.
 */
import { BODY_METRICS, HEAD_METRICS } from './fontMetrics';

export type Face = 'body' | 'head';

/** The kit's base font size (BitmapText fontSize); other sizes scale from it. */
export const BASE_SIZE = 7;
/** Em size in UI px of body text at the base size. */
export const FONT_PX = 8;
/** Em size in UI px of heading text at the base size (Cormorant runs small). */
const HEAD_PX = 10;
/** Line box in UI px (the pixel font's: 7 px caps + 2 px descenders). */
export const LINE_H = 9;
/** Baseline from the top of the line box, UI px. */
const BASELINE = 7;

const FACES: Record<Face, { css: string; px: number; m: { cap: number; adv: Record<string, number> } }> = {
  body: { css: "500 {px}px Inter, 'Helvetica Neue', Arial, sans-serif", px: FONT_PX, m: BODY_METRICS },
  head: { css: "700 {px}px 'Cormorant SC', Georgia, serif", px: HEAD_PX, m: HEAD_METRICS },
};

/** CSS font shorthand for a face at `px` CSS/canvas px. */
export function cssFont(face: Face, px: number): string {
  return FACES[face].css.replace('{px}', String(px));
}

/** Advance of one character in UI px at the base size, or -1 if the face has no metrics for it. */
export function advance(ch: string, face: Face = 'body'): number {
  const f = FACES[face];
  const a = f.m.adv[ch];
  return a === undefined ? -1 : (a * f.px) / 1000;
}

/** Every character with metrics (the set the UI may use). */
export const UI_CHARS: readonly string[] = Object.keys(BODY_METRICS.adv);

/** Load the bundled faces before any atlas is drawn (canvas text does not wait for fonts). */
export async function loadUiFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const sample = 'AaЖж09';
  await Promise.all((Object.keys(FACES) as Face[]).map((f) => document.fonts.load(cssFont(f, 20), sample).catch(() => [])));
}

export interface VectorGlyph {
  ch: string;
  /** Cell in the atlas (atlas px). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Pen offset of the cell's left and top edges and the advance (atlas px). */
  xOffset: number;
  yOffset: number;
  xAdvance: number;
}

/**
 * Draw the atlas of one face in one colour (plus an optional drop shadow
 * 0.5 UI px down-right) at K atlas px per UI px.
 */
export function renderVectorAtlas(color: number, shadow: number | undefined, K: number, face: Face = 'body'): { canvas: HTMLCanvasElement; glyphs: VectorGlyph[]; lineH: number; size: number } {
  const f = FACES[face];
  const pad = Math.ceil(K * 1.5);
  // room above the line box for accents and tall capitals (the heading's em is larger than the
  // line), so no glyph reaches into the cell above; the quad starts that much higher (yOffset)
  const above = Math.ceil(Math.max(0, f.px * 1.05 - BASELINE) * K) + pad;
  const below = Math.ceil(Math.max(LINE_H - BASELINE, f.px * 0.35) * K) + pad;
  const cellH = above + Math.ceil(BASELINE * K) + below;
  const chars = UI_CHARS;
  const cells = chars.map((ch) => Math.ceil(Math.max(0, advance(ch, face)) * K) + pad * 2);
  const maxW = 1024;
  let x = 0;
  let y = 0;
  const pos: { x: number; y: number }[] = [];
  for (const w of cells) {
    if (x + w > maxW) {
      x = 0;
      y += cellH;
    }
    pos.push({ x, y });
    x += w;
  }
  const canvas = document.createElement('canvas');
  canvas.width = maxW;
  canvas.height = y + cellH;
  const ctx = canvas.getContext('2d')!;
  ctx.font = cssFont(face, f.px * K);
  ctx.textBaseline = 'alphabetic';
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
  const glyphs: VectorGlyph[] = [];
  chars.forEach((ch, i) => {
    const p = pos[i];
    const bx = p.x + pad;
    const by = p.y + above + BASELINE * K;
    if (shadow !== undefined) {
      ctx.fillStyle = hex(shadow);
      ctx.fillText(ch, bx + K * 0.5, by + K * 0.5);
    }
    ctx.fillStyle = hex(color);
    ctx.fillText(ch, bx, by);
    glyphs.push({ ch, x: p.x, y: p.y, w: cells[i], h: cellH, xOffset: -pad, yOffset: -above, xAdvance: advance(ch, face) * K });
  });
  return { canvas, glyphs, lineH: (LINE_H + 1) * K, size: BASE_SIZE * K };
}
