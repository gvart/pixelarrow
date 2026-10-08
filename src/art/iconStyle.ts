/**
 * How the smooth UI icons (src/art/vectorIcons.ts) are painted. An icon is a
 * list of parts: body parts are filled shapes, each in its own material (a
 * steel blade, a bronze guard, a leather grip...), lit from the top left with
 * a gloss and an inner shade; detail parts are ink lines or flat fills drawn
 * on top of them (muscle lines, a coin's relief, a pupil). The whole
 * silhouette gets one dark ink outline and a soft drop shadow, and every part
 * a thin ink seam where it meets its neighbours. Three looks per icon:
 *  - 'full': the coloured, lit icon (on stone and bronze);
 *  - 'light': the same design in cream tones (on terracotta and lit-bronze
 *    buttons, where a red heart or a gold coin would clash); its parts are
 *    told apart by tone, so the design still reads;
 *  - 'dim': a flat muted grey silhouette, its parts in three greys (disabled).
 */

/** Gradient stops top-left -> bottom-right: highlight, body, shade. */
type Tone = [string, string, string];

export const TONES = {
  bronze: ['#f8e4b8', '#d2a564', '#86592a'],
  gold: ['#fff4c0', '#f0c24a', '#9c6c18'],
  steel: ['#f6f8fa', '#bcc5ce', '#636d78'],
  silver: ['#ffffff', '#d8dee4', '#8591a0'],
  iron: ['#d4d0c8', '#8c877f', '#423e39'],
  stone: ['#c6bfb2', '#8a8276', '#4a453e'],
  red: ['#ffa48e', '#d6473a', '#7c1810'],
  crimson: ['#d85a48', '#962a1c', '#4a0e08'],
  ember: ['#ffe892', '#f28a2c', '#a4381a'],
  blue: ['#c2dcf6', '#6094ca', '#294c7a'],
  green: ['#d8f2aa', '#7fb84e', '#3a6620'],
  ivory: ['#fffaf0', '#eadfc4', '#a6957a'],
  linen: ['#fffaf0', '#e9ddc6', '#a4947a'],
  cream: ['#fffaf0', '#f1e8d8', '#c4b494'],
  wheat: ['#fff2aa', '#e4ba4c', '#96701e'],
  wood: ['#e0b27c', '#9c6a3a', '#523216'],
  leather: ['#b2804f', '#6e4628', '#331d0f'],
  clay: ['#f4a47e', '#c6623c', '#6e2c1a'],
  dark: ['#5a4e44', '#2d241e', '#100c09'],
  dim: ['#9d917c', '#8f826d', '#7a6e5c'],
} satisfies Record<string, Tone>;

/** A material a part is drawn in. 'ink' and 'gleam' are for details only. */
export type IconTone = keyof typeof TONES | 'ink' | 'gleam';

export interface IconPart {
  /** SVG path data in the 24 x 24 box. */
  d: string;
  tone: IconTone;
  /** A detail drawn on top: a stroked line (default) or a flat fill. Not part of the silhouette. */
  detail?: boolean;
  /** Detail only: fill the shape instead of stroking it. */
  fill?: boolean;
  /** Detail only: stroke width in box units (default 1.2). */
  w?: number;
}

export type IconLook = 'full' | 'light' | 'dim';

/** The cream levels of the 'light' look, brightest first. */
const LIGHT: Tone[] = [
  ['#fffdf6', '#f7efe0', '#cdbc9c'],
  ['#f8e6c6', '#e4caa0', '#b4966a'],
  ['#e2c6a0', '#c4a376', '#8a6a3c'],
];
const LIGHT_LEVEL: Record<keyof typeof TONES, number> = {
  steel: 0, silver: 0, ivory: 0, linen: 0, cream: 0, gold: 0,
  bronze: 1, wheat: 1, stone: 1, green: 1, blue: 1, ember: 1,
  iron: 2, wood: 2, leather: 2, clay: 2, red: 2, crimson: 2, dark: 2, dim: 2,
};

/** Bounding box of a path (absolute and relative commands; control points count). */
function bbox(d: string): { x0: number; y0: number; x1: number; y1: number } {
  const toks = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+)(?:e-?\d+)?/g) ?? [];
  const argc: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let cx = 0, cy = 0, sx = 0, sy = 0, cmd = 'M';
  const add = (x: number, y: number) => {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  };
  let i = 0;
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) {
      cmd = toks[i++];
      if (cmd.toUpperCase() === 'Z') { cx = sx; cy = sy; }
      continue;
    }
    const U = cmd.toUpperCase();
    const rel = cmd !== U;
    const n = argc[U] ?? 2;
    const a = toks.slice(i, i + n).map(Number);
    i += n;
    if (U === 'H') { cx = rel ? cx + a[0] : a[0]; add(cx, cy); }
    else if (U === 'V') { cy = rel ? cy + a[0] : a[0]; add(cx, cy); }
    else if (U === 'A') { cx = rel ? cx + a[5] : a[5]; cy = rel ? cy + a[6] : a[6]; add(cx - a[0], cy - a[1]); add(cx + a[0], cy + a[1]); }
    else {
      for (let k = 0; k + 1 < a.length; k += 2) {
        const px = rel ? cx + a[k] : a[k];
        const py = rel ? cy + a[k + 1] : a[k + 1];
        add(px, py);
        if (k + 2 >= a.length) { cx = px; cy = py; }
      }
    }
    if (U === 'M') { sx = cx; sy = cy; cmd = rel ? 'l' : 'L'; }
  }
  if (!isFinite(x0)) return { x0: 0, y0: 0, x1: 24, y1: 24 };
  return { x0, y0, x1, y1 };
}

/** Parts of an icon given as a bare path (a single bronze shape). */
export function iconParts(parts: IconPart[] | string): IconPart[] {
  return typeof parts === 'string' ? [{ d: parts, tone: 'bronze' }] : parts;
}

/**
 * Paint an icon (`parts`, 24 x 24 box) into a new n x n canvas.
 */
export function paintIcon(_name: string, parts: IconPart[] | string, look: IconLook, n: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext('2d')!;
  const k = n / 24;
  // a little inset so the outline and shadow stay inside the canvas
  ctx.translate(n * 0.04, n * 0.02);
  ctx.scale(k * 0.92, k * 0.92);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const list = iconParts(parts).map((p) => ({ ...p, path: new Path2D(p.d) }));
  const body = list.filter((p) => !p.detail);

  if (look === 'dim') {
    // flat greys, one per cream level, so the parts still tell apart
    const greys = ['#9d917c', '#8a7e6a', '#746858'];
    for (const p of body) {
      ctx.fillStyle = greys[p.tone === 'ink' || p.tone === 'gleam' ? 2 : LIGHT_LEVEL[p.tone]];
      ctx.fill(p.path, 'evenodd');
    }
    for (const p of list) {
      if (!p.detail) continue;
      const c = p.tone === 'gleam' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.24)';
      if (p.fill) { ctx.fillStyle = c; ctx.fill(p.path, 'evenodd'); }
      else { ctx.strokeStyle = c; ctx.lineWidth = p.w ?? 1.2; ctx.stroke(p.path); }
    }
    return canvas;
  }

  const light = look === 'light';
  const ink = light ? 'rgba(46,16,8,0.78)' : '#1a120c';
  const seam = light ? 'rgba(46,16,8,0.55)' : 'rgba(22,14,9,0.85)';
  const toneOf = (t: IconTone): Tone => {
    if (t === 'ink' || t === 'gleam') return TONES.dark;
    return light ? LIGHT[LIGHT_LEVEL[t]] : TONES[t];
  };

  // drop shadow under the whole silhouette
  ctx.save();
  ctx.translate(0.5, 1.3);
  ctx.fillStyle = light ? 'rgba(30,8,4,0.45)' : 'rgba(0,0,0,0.55)';
  for (const p of body) ctx.fill(p.path, 'evenodd');
  ctx.restore();
  // ink outline (stroked under the fills, so only its outer half shows)
  ctx.lineWidth = 2.3;
  ctx.strokeStyle = ink;
  for (const p of body) ctx.stroke(p.path);

  for (const p of list) {
    if (p.detail) {
      // a line or a flat stamp on top of the parts before it
      const c = p.tone === 'gleam' ? (light ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.55)')
        : p.tone === 'ink' ? (light ? 'rgba(46,16,8,0.6)' : 'rgba(26,18,12,0.72)')
          : toneOf(p.tone)[2];
      if (p.fill) { ctx.fillStyle = c; ctx.fill(p.path, 'evenodd'); }
      else { ctx.strokeStyle = c; ctx.lineWidth = p.w ?? 1.2; ctx.stroke(p.path); }
      continue;
    }
    const tone = toneOf(p.tone);
    const b = bbox(p.d);
    const w = Math.max(1, b.x1 - b.x0);
    const h = Math.max(1, b.y1 - b.y0);
    const cx = (b.x0 + b.x1) / 2;
    // seam: a thin ink line along the part's edge, over whatever lies under it
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = seam;
    ctx.stroke(p.path);
    // body: lit from the top left
    const g = ctx.createLinearGradient(cx - w * 0.3, b.y0, cx + w * 0.3, b.y1);
    g.addColorStop(0, tone[0]);
    g.addColorStop(0.5, tone[1]);
    g.addColorStop(1, tone[2]);
    ctx.fillStyle = g;
    ctx.fill(p.path, 'evenodd');
    ctx.save();
    ctx.clip(p.path, 'evenodd');
    // gloss on the upper part
    const gl = ctx.createLinearGradient(0, b.y0, 0, b.y0 + h * 0.55);
    gl.addColorStop(0, light ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.42)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(b.x0 - 1, b.y0 - 1, w + 2, h * 0.55 + 1);
    // an inner shade along the lower edges gives the part some thickness
    ctx.translate(-0.4, 1.0);
    ctx.lineWidth = Math.min(1.2, 0.4 + h * 0.12);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.stroke(p.path);
    ctx.restore();
  }
  return canvas;
}
