/**
 * Icons for consumables (src/data/consumables.ts) and resources / currencies
 * (src/online/rules.ts RESOURCE_KEYS, plus Drachmae).
 *
 * `renderGoodsIconHD` is the "Bronze & Stone" icon (docs/UI_KIT.md "Icons"): painted
 * with Canvas 2D at the screen's density (K atlas px per UI px, shown scaled
 * by 1 / K with LINEAR filtering, see goodsTexture in src/ui/econ/widgets.ts).
 * Each icon is drawn in a 64 x 64 unit box (16 UI px), lit from the top left,
 * with a dark ink outline and a soft drop shadow, in the material it stands
 * for: terracotta, golden grain, timber, bronze, silver, linen.
 *
 * The renderer is data driven: a known id gets its own drawing, any other id
 * picks a family by the words in it ("wine" -> amphora, "ingot" -> ingot,
 * "herb" -> jar...) and a colour from its hash, so goods added later still get
 * a sensible icon.
 *
 * `renderGoodsIcon` is the old 16 x 16 pixel icon, kept for where there is no
 * DOM (tests) and as the fallback.
 */
import { ellipsePath, poly, roundRect } from './path2d';
import { hashString } from '../sim/rng';
import { P, hex, mix } from './palette';
import { Pix } from './pixels';
import { drawIconBitmap } from './iconBitmaps';

export type GoodsKind = 'consumable' | 'resource';
export const CONSUMABLE_ICON_IDS = ['healing_salve', 'morale_wine', 'war_horn', 'sharpening_stone', 'march_rations'] as const;
export const RESOURCE_ICON_IDS = ['gold', 'food', 'wood', 'bronze', 'recruits', 'drachmae'] as const;

/** Drawing space edge of a goods icon: 16 UI px = 64 units. */
export const GOODS_UNITS = 64;

// ================================================================== painting helpers (shared with cosmeticArt.ts)

export type G = CanvasRenderingContext2D;

/** A material ramp: highlight, body, shade, deep shade. */
export interface Tone {
  hi: string;
  base: string;
  lo: string;
  dk: string;
}

export const tone = (hi: number, base: number, lo: number, dk: number): Tone => ({ hi: hex(hi), base: hex(base), lo: hex(lo), dk: hex(dk) });

/** A matte ramp around one flat colour. */
export function flatTone(c: number, spread = 0.3): Tone {
  return tone(mix(c, 0xffffff, spread + 0.05), c, mix(c, 0x000000, spread), mix(c, 0x000000, spread + 0.25));
}

export const TONES = {
  bronze: tone(0xf6e0a8, 0xc9933f, 0x82561f, 0x47300f),
  gold: tone(0xfff6c4, 0xeac25a, 0xa87a24, 0x6b4a12),
  silver: tone(0xffffff, 0xd8dde3, 0x8f979f, 0x4f565c),
  clay: tone(0xf0a97c, 0xc2663b, 0x7d3a21, 0x4a2012),
  wine: tone(0x9a3d3d, 0x5a1520, 0x3a0b14, 0x22060b),
  wheat: tone(0xfff0a8, 0xe3b64c, 0x9d7320, 0x5f4410),
  straw: tone(0xd9c07a, 0xa88a3c, 0x6e5720, 0x3e3010),
  wood: tone(0xc9976a, 0x8f5f36, 0x5b3a1c, 0x33200d),
  woodEnd: tone(0xf1d6a8, 0xd2ad76, 0x9d7a48, 0x5e4625),
  linen: tone(0xfffaf0, 0xe9dfc6, 0xb7a98a, 0x776a53),
  leather: tone(0xc4916a, 0x8a5a3a, 0x5a3823, 0x332014),
  stone: tone(0xd6d0c2, 0x968f80, 0x5d574d, 0x35312b),
  steel: tone(0xf2f5f8, 0xb4bec6, 0x6b7680, 0x3a434b),
  bread: tone(0xf3cd8c, 0xcf9345, 0x8f5a22, 0x55330f),
  balm: tone(0xcdf0a0, 0x7fb84e, 0x3f6a22, 0x244213),
  horn: tone(0xf0dfb8, 0xb08a52, 0x6b4a26, 0x3a260f),
  skin: tone(0xf4cfa8, 0xd8a070, 0x9c6a42, 0x5c3c22),
  crest: tone(0xff8e70, 0xd0402e, 0x8a1e14, 0x4e0f09),
  purple: tone(0xc693e0, 0x7a3a9a, 0x4a2260, 0x2a1238),
  faience: tone(0xb8f4ea, 0x3f9e97, 0x226462, 0x133a39),
  salt: tone(0xffffff, 0xeef2f4, 0xb9c4ca, 0x7c8a92),
  olive: tone(0xe4d27a, 0xa5962c, 0x6b6118, 0x3d3808),
  papyrus: tone(0xfdf3d0, 0xe9cf92, 0xb0944e, 0x6b5726),
} as const satisfies Record<string, Tone>;

export const INK = 'rgba(22, 13, 8, 0.9)';

export interface ShapeOpts {
  /** Gradient direction: 'v' top -> bottom (default), 'd' top-left -> bottom-right, 'h' left -> right. */
  dir?: 'v' | 'd' | 'h';
  /** Bounding box of the gradient (defaults to the whole box). */
  box?: [number, number, number, number];
  /** No ink outline (inner parts). */
  noInk?: boolean;
  /** Outline width in units. */
  ink?: number;
  /** No drop shadow (inner parts). */
  noShadow?: boolean;
  /** Gloss strength 0..1 on the upper part (default 0.35). */
  gloss?: number;
  /** Inner shade along the lower edge 0..1 (default 0.3). */
  shade?: number;
  /** Fill the whole body with this colour instead of the ramp (flat paint). */
  flat?: string;
}

/** The lit gradient of a tone over a box. */
export function litFill(g: G, t: Tone, box: [number, number, number, number], dir: 'v' | 'd' | 'h' = 'v'): CanvasGradient {
  const [x0, y0, x1, y1] = box;
  const gr = dir === 'v' ? g.createLinearGradient(0, y0, 0, y1) : dir === 'h' ? g.createLinearGradient(x0, 0, x1, 0) : g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, t.hi);
  gr.addColorStop(0.42, t.base);
  gr.addColorStop(0.85, t.lo);
  gr.addColorStop(1, t.dk);
  return gr;
}

/** A soft drop shadow of a path, down and to the right. */
export function dropShadow(g: G, p: Path2D, units: number, alpha = 0.5): void {
  g.save();
  g.translate(units * 0.02, units * 0.035);
  g.fillStyle = `rgba(0,0,0,${alpha})`;
  g.filter = `blur(${units * 0.02}px)`;
  g.fill(p);
  g.restore();
}

/** Paint a shape: shadow, ink outline, lit body, gloss and inner shade. */
export function shape(g: G, p: Path2D, t: Tone, box: [number, number, number, number], o: ShapeOpts = {}): void {
  const units = GOODS_UNITS;
  if (!o.noShadow) dropShadow(g, p, units);
  if (!o.noInk) {
    g.save();
    g.lineJoin = 'round';
    g.lineWidth = o.ink ?? 2.2;
    g.strokeStyle = INK;
    g.stroke(p);
    g.restore();
  }
  g.fillStyle = o.flat ?? litFill(g, t, o.box ?? box, o.dir ?? 'v');
  g.fill(p);
  const [x0, y0, x1, y1] = o.box ?? box;
  const gloss = o.gloss ?? 0.35;
  if (gloss > 0) {
    g.save();
    g.clip(p);
    const gl = g.createLinearGradient(x0, y0, x0 + (x1 - x0) * 0.35, y0 + (y1 - y0) * 0.6);
    gl.addColorStop(0, `rgba(255,255,255,${gloss})`);
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.restore();
  }
  const shade = o.shade ?? 0.3;
  if (shade > 0) {
    g.save();
    g.clip(p);
    g.translate(-0.6, -1.2);
    g.lineWidth = 2.4;
    g.strokeStyle = `rgba(0,0,0,${shade})`;
    g.stroke(p);
    g.restore();
  }
}

/** A small specular dot. */
export function glint(g: G, x: number, y: number, r: number, a = 0.9): void {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(255,255,255,${a})`);
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

/** A stroked line in a colour. */
export function stroke(g: G, p: Path2D, color: string, w: number, cap: CanvasLineCap = 'round'): void {
  g.save();
  g.lineCap = cap;
  g.lineJoin = 'round';
  g.lineWidth = w;
  g.strokeStyle = color;
  g.stroke(p);
  g.restore();
}

export function line(pts: [number, number][]): Path2D {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  return p;
}

/** A canvas of n x n px set up so the icon draws in a units x units box. */
export function iconCanvas(n: number, units: number): [HTMLCanvasElement, G] {
  const canvas = document.createElement('canvas');
  canvas.width = n;
  canvas.height = n;
  const g = canvas.getContext('2d')!;
  g.scale(n / units, n / units);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  return [canvas, g];
}

// ================================================================== the drawings (64 x 64)

/** A coin seen flat-on, with a rim and a relief mark. */
function coin(g: G, cx: number, cy: number, r: number, t: Tone, mark: (g: G) => void, tilt = 0.55): void {
  const face = ellipsePath(cx, cy, r, r * tilt);
  // the edge below the face
  const edge = new Path2D();
  edge.ellipse(cx, cy + 2.6, r, r * tilt, 0, 0, Math.PI * 2);
  shape(g, edge, t, [cx - r, cy - r, cx + r, cy + r], { gloss: 0, shade: 0.5 });
  shape(g, face, t, [cx - r, cy - r * tilt, cx + r, cy + r * tilt], { dir: 'd', gloss: 0.45 });
  g.save();
  g.clip(face);
  // an inner ring
  g.lineWidth = 1.4;
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(cx, cy, r * 0.74, r * tilt * 0.74, 0, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.ellipse(cx, cy - 0.8, r * 0.74, r * tilt * 0.74, 0, 0, Math.PI * 2);
  g.stroke();
  mark(g);
  g.restore();
}

function gold(g: G): void {
  const mark = (cx: number, cy: number) => (g2: G) => {
    // a small sun of rays
    g2.fillStyle = 'rgba(80,45,5,0.55)';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g2.beginPath();
      g2.moveTo(cx + Math.cos(a) * 2, cy + Math.sin(a) * 1.3);
      g2.lineTo(cx + Math.cos(a) * 5.5, cy + Math.sin(a) * 3.4);
      g2.lineTo(cx + Math.cos(a + 0.5) * 2, cy + Math.sin(a + 0.5) * 1.3);
      g2.fill();
    }
    g2.fillStyle = 'rgba(255,250,220,0.8)';
    g2.beginPath();
    g2.ellipse(cx, cy, 2.2, 1.5, 0, 0, Math.PI * 2);
    g2.fill();
  };
  coin(g, 19, 44, 15, TONES.gold, mark(19, 44));
  coin(g, 45, 44, 15, TONES.gold, mark(45, 44));
  coin(g, 32, 24, 16, TONES.gold, mark(32, 24));
  glint(g, 24, 15, 5, 0.7);
}

function drachmae(g: G): void {
  const cx = 32, cy = 33, r = 26;
  const face = ellipsePath(cx, cy, r, r);
  const edge = ellipsePath(cx, cy + 2.2, r, r);
  shape(g, edge, TONES.silver, [cx - r, cy - r, cx + r, cy + r], { gloss: 0, shade: 0.55 });
  shape(g, face, TONES.silver, [cx - r, cy - r, cx + r, cy + r], { dir: 'd', gloss: 0.5 });
  g.save();
  g.clip(face);
  // the beaded rim
  g.lineWidth = 1.6;
  g.strokeStyle = 'rgba(40,45,55,0.45)';
  g.setLineDash([1.6, 2.2]);
  g.beginPath();
  g.arc(cx, cy, r - 4, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  // Athena's owl in relief: body, ear tufts, two big eyes, a beak and feet
  const ink = 'rgba(38,42,52,0.85)';
  const body = new Path2D();
  body.moveTo(21, 23);
  body.lineTo(25, 30);
  body.quadraticCurveTo(19, 38, 24, 48);
  body.lineTo(40, 48);
  body.quadraticCurveTo(45, 38, 39, 30);
  body.lineTo(43, 23);
  body.lineTo(37, 27);
  body.quadraticCurveTo(32, 25, 27, 27);
  body.closePath();
  g.fillStyle = ink;
  g.fill(body);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.beginPath();
  g.moveTo(23, 26);
  g.lineTo(27, 30);
  g.lineTo(37, 30);
  g.lineTo(41, 26);
  g.lineTo(37, 28);
  g.lineTo(27, 28);
  g.closePath();
  g.fill();
  g.fillStyle = TONES.silver.hi;
  g.beginPath();
  g.arc(27.5, 33.5, 3.4, 0, Math.PI * 2);
  g.arc(36.5, 33.5, 3.4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = ink;
  g.beginPath();
  g.arc(27.8, 33.8, 1.5, 0, Math.PI * 2);
  g.arc(36.8, 33.8, 1.5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.beginPath();
  g.moveTo(30.5, 37);
  g.lineTo(33.5, 37);
  g.lineTo(32, 40.5);
  g.closePath();
  g.fill();
  // wing lines
  g.strokeStyle = 'rgba(255,255,255,0.22)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.moveTo(24 + i * 1.2, 38 + i * 3);
    g.lineTo(27 + i, 46);
    g.moveTo(40 - i * 1.2, 38 + i * 3);
    g.lineTo(37 - i, 46);
    g.stroke();
  }
  // the olive sprig and the ΑΘΕ on the right, suggested
  g.fillStyle = ink;
  g.beginPath();
  g.ellipse(47, 24, 2.4, 1.4, -0.8, 0, Math.PI * 2);
  g.ellipse(50, 29, 2.4, 1.4, -0.4, 0, Math.PI * 2);
  g.fill();
  g.restore();
  glint(g, 16, 18, 7, 0.55);
}

function food(g: G): void {
  // a sheaf: three bound stalks with heavy golden ears
  const stalks: [number, number, number][] = [[22, 8, -8], [32, 4, 0], [42, 8, 8]];
  for (const [ex, ey, lean] of stalks) {
    const stem = line([[32, 58], [32 + lean * 0.6, 40], [ex, ey + 18]]);
    stroke(g, stem, INK, 4.2);
  }
  for (const [ex, ey, lean] of stalks) {
    const stem = line([[32, 58], [32 + lean * 0.6, 40], [ex, ey + 18]]);
    stroke(g, stem, TONES.straw.base, 2);
    stroke(g, line([[32, 58], [32 + lean * 0.6, 40]]), TONES.straw.hi, 0.8);
  }
  for (const [ex, ey, lean] of stalks) {
    // the ear: a column of grains both sides of the awn
    const dx = lean / 8;
    const ear = new Path2D();
    for (let i = 0; i < 5; i++) {
      const y = ey + 4 + i * 3.6;
      const x = ex + dx * i;
      ear.ellipse(x - 2.6, y, 2.8, 2.1, -0.5 + dx * 0.2, 0, Math.PI * 2);
      ear.ellipse(x + 2.6, y, 2.8, 2.1, 0.5 + dx * 0.2, 0, Math.PI * 2);
    }
    ear.ellipse(ex, ey + 1.2, 2.4, 3, dx * 0.2, 0, Math.PI * 2);
    shape(g, ear, TONES.wheat, [ex - 6, ey - 2, ex + 6, ey + 22], { dir: 'd', gloss: 0.4, shade: 0.25 });
    // awns
    for (let i = 0; i < 3; i++) stroke(g, line([[ex + (i - 1) * 3, ey + 2], [ex + (i - 1) * 6 + dx * 2, ey - 6]]), TONES.wheat.lo, 1);
  }
  // the binding
  const band = poly([[24, 42], [40, 42], [41, 48], [23, 48]]);
  shape(g, band, TONES.leather, [23, 42, 41, 48], { gloss: 0.25 });
  stroke(g, line([[28, 43], [27, 47]]), 'rgba(0,0,0,0.3)', 1);
  stroke(g, line([[36, 43], [37, 47]]), 'rgba(0,0,0,0.3)', 1);
}

function logEnd(g: G, cx: number, cy: number, rx: number, ry: number): void {
  const end = ellipsePath(cx, cy, rx, ry);
  shape(g, end, TONES.woodEnd, [cx - rx, cy - ry, cx + rx, cy + ry], { noShadow: true, gloss: 0.2, shade: 0.2 });
  g.save();
  g.clip(end);
  g.strokeStyle = 'rgba(90,55,25,0.55)';
  g.lineWidth = 1.1;
  for (let i = 1; i <= 3; i++) {
    g.beginPath();
    g.ellipse(cx, cy, (rx * i) / 4, (ry * i) / 4, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

function logShape(g: G, x: number, y: number, len: number, r: number): void {
  // a log lying across the box: bark body with a bright end on the right
  const body = roundRect(x, y - r, len, r * 2, 1.5);
  shape(g, body, TONES.wood, [x, y - r, x + len, y + r], { gloss: 0.3, shade: 0.35 });
  g.save();
  g.clip(body);
  g.strokeStyle = 'rgba(40,22,8,0.45)';
  g.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.moveTo(x + 4 + i * 7, y - r + 2 + (i % 2) * 2);
    g.quadraticCurveTo(x + 8 + i * 7, y + (i % 2) * 3, x + 6 + i * 7, y + r - 2);
    g.stroke();
  }
  g.restore();
  logEnd(g, x + len, y, r * 0.52, r);
  stroke(g, ellipsePath(x + len, y, r * 0.52, r), INK, 1.8);
}

function wood(g: G): void {
  logShape(g, 8, 45, 44, 9.5);
  logShape(g, 12, 25, 40, 9.5);
}

function bronze(g: G): void {
  // an oxhide ingot: the slab with its four drawn-out corners
  const p = new Path2D();
  p.moveTo(6, 10);
  p.lineTo(16, 18);
  p.quadraticCurveTo(32, 14, 48, 18);
  p.lineTo(58, 10);
  p.lineTo(58, 16);
  p.quadraticCurveTo(50, 26, 52, 36);
  p.quadraticCurveTo(50, 46, 58, 56);
  p.lineTo(58, 60);
  p.lineTo(48, 52);
  p.quadraticCurveTo(32, 56, 16, 52);
  p.lineTo(6, 60);
  p.lineTo(6, 56);
  p.quadraticCurveTo(14, 46, 12, 36);
  p.quadraticCurveTo(14, 26, 6, 16);
  p.closePath();
  shape(g, p, TONES.bronze, [6, 10, 58, 60], { dir: 'd', gloss: 0.5, shade: 0.4 });
  // the rough cast surface: a few pits, and a bright band
  g.save();
  g.clip(p);
  g.fillStyle = 'rgba(60,35,10,0.35)';
  for (const [x, y, r] of [[24, 30, 1.6], [38, 40, 1.3], [30, 44, 1.1], [42, 27, 1.2], [20, 42, 0.9]]) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(255,245,210,0.28)';
  g.beginPath();
  g.moveTo(14, 20);
  g.lineTo(44, 18);
  g.lineTo(40, 24);
  g.lineTo(16, 26);
  g.closePath();
  g.fill();
  g.restore();
  glint(g, 20, 22, 5, 0.6);
}

function recruits(g: G): void {
  // a Corinthian helmet front-on, crest up, a face in the eye slits
  const crest = new Path2D();
  crest.moveTo(26, 22);
  crest.quadraticCurveTo(22, 4, 32, 2);
  crest.quadraticCurveTo(42, 4, 38, 22);
  crest.closePath();
  shape(g, crest, TONES.crest, [22, 2, 42, 22], { gloss: 0.3 });
  g.save();
  g.clip(crest);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 1;
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    g.moveTo(32 + i * 2.4, 4);
    g.lineTo(32 + i * 3.2, 22);
    g.stroke();
  }
  g.restore();
  // the bowl with cheek pieces and a nose guard
  const helm = new Path2D();
  helm.moveTo(14, 30);
  helm.quadraticCurveTo(14, 12, 32, 12);
  helm.quadraticCurveTo(50, 12, 50, 30);
  helm.lineTo(50, 50);
  helm.lineTo(42, 58);
  helm.lineTo(36, 52);
  helm.lineTo(28, 52);
  helm.lineTo(22, 58);
  helm.lineTo(14, 50);
  helm.closePath();
  shape(g, helm, TONES.bronze, [14, 12, 50, 58], { dir: 'd', gloss: 0.45, shade: 0.4 });
  // the T opening: eyes and nose
  const open = new Path2D();
  open.moveTo(19, 33);
  open.lineTo(29, 33);
  open.lineTo(29, 50);
  open.lineTo(35, 50);
  open.lineTo(35, 33);
  open.lineTo(45, 33);
  open.lineTo(45, 39);
  open.lineTo(37, 40);
  open.lineTo(37, 56);
  open.lineTo(27, 56);
  open.lineTo(27, 40);
  open.lineTo(19, 39);
  open.closePath();
  g.save();
  g.clip(helm);
  g.fillStyle = '#1b120c';
  g.fill(open);
  // the eyes glint in the dark
  g.fillStyle = 'rgba(240,220,190,0.9)';
  g.beginPath();
  g.ellipse(24, 36, 2.2, 1.4, 0, 0, Math.PI * 2);
  g.ellipse(40, 36, 2.2, 1.4, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // the nose guard stands proud
  const nose = poly([[29, 33], [35, 33], [36, 49], [28, 49]]);
  shape(g, nose, TONES.bronze, [28, 33, 36, 49], { noShadow: true, ink: 1.4, gloss: 0.4 });
  glint(g, 22, 18, 5, 0.6);
}

function jar(g: G): void {
  // a squat terracotta pot, linen cover tied with cord, a green balm leaf
  const body = new Path2D();
  body.moveTo(18, 26);
  body.quadraticCurveTo(6, 30, 10, 48);
  body.quadraticCurveTo(12, 58, 32, 58);
  body.quadraticCurveTo(52, 58, 54, 48);
  body.quadraticCurveTo(58, 30, 46, 26);
  body.closePath();
  shape(g, body, TONES.clay, [8, 26, 56, 58], { dir: 'd', gloss: 0.4, shade: 0.35 });
  g.save();
  g.clip(body);
  // a painted band
  g.fillStyle = 'rgba(60,25,12,0.55)';
  g.fillRect(6, 40, 52, 3);
  g.fillStyle = 'rgba(60,25,12,0.35)';
  g.fillRect(6, 45, 52, 1.2);
  g.restore();
  // the linen cover, pleated, over the mouth
  const cover = new Path2D();
  cover.moveTo(16, 22);
  cover.quadraticCurveTo(32, 14, 48, 22);
  cover.lineTo(50, 30);
  cover.quadraticCurveTo(32, 36, 14, 30);
  cover.closePath();
  shape(g, cover, TONES.linen, [14, 14, 50, 36], { gloss: 0.3, shade: 0.3 });
  g.save();
  g.clip(cover);
  g.strokeStyle = 'rgba(90,70,40,0.4)';
  g.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.moveTo(20 + i * 6, 16 + Math.abs(i - 2) * 1.5);
    g.lineTo(18 + i * 7, 34);
    g.stroke();
  }
  g.restore();
  // the cord
  stroke(g, line([[13, 29], [32, 33.5], [51, 29]]), INK, 4.2);
  stroke(g, line([[13, 29], [32, 33.5], [51, 29]]), TONES.leather.base, 2.2);
  stroke(g, line([[20, 31], [23, 36]]), TONES.leather.lo, 1.6);
  // the sprig of herbs tucked in
  const leaf = new Path2D();
  leaf.moveTo(44, 24);
  leaf.quadraticCurveTo(52, 8, 60, 12);
  leaf.quadraticCurveTo(58, 24, 44, 24);
  leaf.closePath();
  shape(g, leaf, TONES.balm, [44, 8, 60, 24], { dir: 'd', gloss: 0.4 });
  stroke(g, line([[46, 23], [56, 13]]), 'rgba(20,50,10,0.5)', 1);
  const leaf2 = new Path2D();
  leaf2.moveTo(42, 22);
  leaf2.quadraticCurveTo(38, 10, 46, 6);
  leaf2.quadraticCurveTo(50, 16, 42, 22);
  leaf2.closePath();
  shape(g, leaf2, TONES.balm, [38, 6, 50, 22], { dir: 'd', gloss: 0.4 });
}

function amphora(g: G, t: Tone = TONES.clay, figure = true): void {
  // a two-handled transport amphora with a pointed foot
  const body = new Path2D();
  body.moveTo(24, 10);
  body.lineTo(40, 10);
  body.lineTo(41, 16);
  body.quadraticCurveTo(54, 22, 50, 40);
  body.quadraticCurveTo(46, 54, 36, 60);
  body.lineTo(28, 60);
  body.quadraticCurveTo(18, 54, 14, 40);
  body.quadraticCurveTo(10, 22, 23, 16);
  body.closePath();
  // handles first, under the body
  for (const s of [-1, 1]) {
    const h = new Path2D();
    h.moveTo(32 + s * 8, 14);
    h.quadraticCurveTo(32 + s * 22, 14, 32 + s * 18, 32);
    stroke(g, h, INK, 7);
    stroke(g, h, t.base, 4);
    stroke(g, h, t.hi, 1.2);
  }
  shape(g, body, t, [12, 10, 52, 60], { dir: 'd', gloss: 0.45, shade: 0.35 });
  g.save();
  g.clip(body);
  // the rim band
  g.fillStyle = 'rgba(40,18,8,0.5)';
  g.fillRect(20, 15.5, 24, 2.2);
  if (figure) {
    // black-figure band: a meander and a dark zone with a red figure
    g.fillStyle = '#2a1a12';
    g.fillRect(8, 24, 48, 20);
    g.fillStyle = t.base;
    g.beginPath();
    g.moveTo(31, 29);
    g.lineTo(35, 29);
    g.lineTo(36, 34);
    g.lineTo(39, 40);
    g.lineTo(36, 40);
    g.lineTo(34, 36);
    g.lineTo(33, 41);
    g.lineTo(30, 41);
    g.lineTo(31, 35);
    g.lineTo(28, 38);
    g.lineTo(26, 36);
    g.lineTo(30, 32);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(230,180,120,0.75)';
    for (let i = 0; i < 7; i++) g.fillRect(12 + i * 6, 25.5, 3, 1.6);
    g.fillStyle = 'rgba(0,0,0,0.0)';
  }
  g.restore();
  glint(g, 24, 24, 4.5, 0.5);
}

function horn(g: G): void {
  // a curved bronze war horn: the mouthpiece low left, the bell flaring high right, a leather strap
  const outer = new Path2D();
  outer.moveTo(5, 50);
  outer.quadraticCurveTo(2, 20, 28, 13);
  outer.quadraticCurveTo(44, 9, 54, 4);
  outer.lineTo(61, 16);
  outer.quadraticCurveTo(48, 20, 36, 24);
  outer.quadraticCurveTo(16, 30, 13, 54);
  outer.closePath();
  // the strap behind, sagging inside the curve
  const strap = new Path2D();
  strap.moveTo(10, 52);
  strap.quadraticCurveTo(40, 48, 56, 14);
  stroke(g, strap, INK, 5);
  stroke(g, strap, TONES.leather.base, 3);
  stroke(g, strap, 'rgba(255,230,200,0.3)', 0.9);
  shape(g, outer, TONES.bronze, [2, 4, 62, 56], { dir: 'd', gloss: 0.5, shade: 0.4 });
  // bands along the tube
  g.save();
  g.clip(outer);
  g.fillStyle = 'rgba(40,22,6,0.42)';
  g.beginPath();
  g.moveTo(10, 30);
  g.lineTo(24, 34);
  g.lineTo(23, 36.6);
  g.lineTo(9, 32.6);
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(38, 10);
  g.lineTo(44, 20);
  g.lineTo(41.4, 21.2);
  g.lineTo(35.4, 11.2);
  g.closePath();
  g.fill();
  g.restore();
  // the bell's dark mouth
  const mouth = ellipsePath(58, 10, 3, 7.2, 0.5);
  shape(g, mouth, tone(0x8a6a38, 0x3a2412, 0x22150a, 0x120b04), [54, 3, 62, 17], { noShadow: true, ink: 1.8, gloss: 0.15, dir: 'h' });
  // the mouthpiece cap
  const cap = ellipsePath(9, 53, 4.6, 3.2, 0.3);
  shape(g, cap, TONES.silver, [4, 49, 14, 57], { ink: 1.8, gloss: 0.5 });
  glint(g, 22, 20, 4, 0.6);
}

function whetstone(g: G): void {
  // a grey whetstone bar laid at an angle, a leather loop and a bright spark
  const bar = new Path2D();
  bar.moveTo(8, 42);
  bar.lineTo(48, 18);
  bar.quadraticCurveTo(58, 14, 60, 26);
  bar.lineTo(20, 52);
  bar.quadraticCurveTo(8, 54, 8, 42);
  bar.closePath();
  shape(g, bar, TONES.stone, [10, 20, 58, 52], { dir: 'd', gloss: 0.3, shade: 0.4 });
  g.save();
  g.clip(bar);
  // the grit: fine speckle, and a worn bright face along the upper edge
  g.fillStyle = 'rgba(0,0,0,0.28)';
  const h = hashString('stone');
  for (let i = 0; i < 26; i++) {
    const x = 10 + ((h * (i + 1) * 2654435761) >>> 0) % 48;
    const y = 20 + ((h * (i + 7) * 40503) >>> 0) % 32;
    g.fillRect(x, y, 1, 1);
  }
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.beginPath();
  g.moveTo(10, 40);
  g.lineTo(48, 18);
  g.lineTo(52, 23);
  g.lineTo(14, 45);
  g.closePath();
  g.fill();
  g.restore();
  // leather loop through the end
  const loop = new Path2D();
  loop.ellipse(12, 52, 5, 4, 0.4, 0, Math.PI * 2);
  stroke(g, loop, INK, 4.4);
  stroke(g, loop, TONES.leather.base, 2.4);
  // the spark
  const sp = new Path2D();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI;
    sp.moveTo(52 + Math.cos(a) * 9, 14 + Math.sin(a) * 9);
    sp.lineTo(52 - Math.cos(a) * 9, 14 - Math.sin(a) * 9);
  }
  g.save();
  g.filter = 'blur(1.5px)';
  stroke(g, sp, 'rgba(255,200,80,0.9)', 3);
  g.restore();
  stroke(g, sp, '#fff4c0', 1.4);
  glint(g, 52, 14, 4, 1);
}

function rations(g: G): void {
  // a round loaf scored with a cross, resting in a folded linen cloth
  const cloth = new Path2D();
  cloth.moveTo(4, 44);
  cloth.quadraticCurveTo(14, 36, 32, 38);
  cloth.quadraticCurveTo(50, 36, 60, 44);
  cloth.lineTo(58, 58);
  cloth.quadraticCurveTo(32, 62, 6, 58);
  cloth.closePath();
  shape(g, cloth, TONES.linen, [4, 36, 60, 62], { gloss: 0.3, shade: 0.35 });
  g.save();
  g.clip(cloth);
  g.strokeStyle = 'rgba(90,70,40,0.35)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.moveTo(8 + i * 14, 40);
    g.quadraticCurveTo(12 + i * 14, 50, 6 + i * 14, 60);
    g.stroke();
  }
  // a red stripe in the weave
  g.fillStyle = 'rgba(160,50,40,0.55)';
  g.fillRect(0, 52, 64, 1.6);
  g.restore();
  const loaf = new Path2D();
  loaf.moveTo(12, 40);
  loaf.quadraticCurveTo(12, 10, 32, 10);
  loaf.quadraticCurveTo(52, 10, 52, 40);
  loaf.quadraticCurveTo(32, 48, 12, 40);
  loaf.closePath();
  shape(g, loaf, TONES.bread, [12, 10, 52, 48], { dir: 'd', gloss: 0.4, shade: 0.35 });
  g.save();
  g.clip(loaf);
  // the scoring: pale crumb showing through a cross
  g.lineWidth = 3.2;
  g.strokeStyle = 'rgba(70,40,10,0.6)';
  g.beginPath();
  g.moveTo(20, 26);
  g.quadraticCurveTo(32, 23, 44, 26);
  g.moveTo(32, 14);
  g.lineTo(32, 38);
  g.stroke();
  g.lineWidth = 1.6;
  g.strokeStyle = 'rgba(255,240,200,0.85)';
  g.beginPath();
  g.moveTo(20, 25.5);
  g.quadraticCurveTo(32, 22.5, 44, 25.5);
  g.moveTo(31.5, 14);
  g.lineTo(31.5, 38);
  g.stroke();
  g.restore();
  glint(g, 24, 17, 5, 0.5);
}

/** A tied sack in a colour, for unknown goods. */
function sack(g: G, t: Tone, tag?: Tone): void {
  const body = new Path2D();
  body.moveTo(24, 20);
  body.quadraticCurveTo(8, 28, 10, 50);
  body.quadraticCurveTo(12, 60, 32, 60);
  body.quadraticCurveTo(52, 60, 54, 50);
  body.quadraticCurveTo(56, 28, 40, 20);
  body.closePath();
  shape(g, body, t, [8, 20, 56, 60], { dir: 'd', gloss: 0.3, shade: 0.35 });
  const neck = new Path2D();
  neck.moveTo(24, 8);
  neck.lineTo(40, 8);
  neck.lineTo(42, 22);
  neck.lineTo(22, 22);
  neck.closePath();
  shape(g, neck, t, [22, 8, 42, 22], { gloss: 0.25 });
  stroke(g, line([[21, 20], [43, 20]]), INK, 4.4);
  stroke(g, line([[21, 20], [43, 20]]), TONES.leather.base, 2.4);
  if (tag) {
    const tg = poly([[40, 30], [56, 34], [54, 46], [38, 42]]);
    shape(g, tg, tag, [38, 30, 56, 46], { ink: 1.8, gloss: 0.3 });
  }
}

/** A vial / flask of glass with a liquid. */
function flask(g: G, liquid: Tone): void {
  const glass = tone(0xf4fbff, 0xc8dfea, 0x7f9aa8, 0x485a66);
  const body = new Path2D();
  body.moveTo(26, 10);
  body.lineTo(38, 10);
  body.lineTo(38, 24);
  body.quadraticCurveTo(54, 30, 50, 50);
  body.quadraticCurveTo(48, 60, 32, 60);
  body.quadraticCurveTo(16, 60, 14, 50);
  body.quadraticCurveTo(10, 30, 26, 24);
  body.closePath();
  shape(g, body, glass, [12, 10, 52, 60], { dir: 'd', gloss: 0.25, shade: 0.2 });
  g.save();
  g.clip(body);
  const liq = new Path2D();
  liq.moveTo(10, 36);
  liq.quadraticCurveTo(32, 30, 56, 36);
  liq.lineTo(56, 62);
  liq.lineTo(10, 62);
  liq.closePath();
  g.fillStyle = litFill(g, liquid, [10, 30, 56, 62], 'd');
  g.fill(liq);
  g.restore();
  // the stopper
  const cork = roundRect(25, 6, 14, 7, 1.5);
  shape(g, cork, TONES.leather, [25, 6, 39, 13], { ink: 1.8, gloss: 0.3 });
  glint(g, 22, 34, 6, 0.6);
  stroke(g, line([[20, 40], [19, 52]]), 'rgba(255,255,255,0.55)', 2);
}

function scroll(g: G): void {
  // a papyrus roll, partly unrolled, with lines of writing
  const sheet = poly([[14, 16], [50, 16], [52, 50], [12, 50]]);
  shape(g, sheet, TONES.papyrus, [12, 16, 52, 50], { gloss: 0.3, shade: 0.25 });
  g.save();
  g.clip(sheet);
  g.strokeStyle = 'rgba(60,40,20,0.5)';
  g.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.moveTo(20, 24 + i * 6);
    g.lineTo(44 - (i % 2) * 8, 24 + i * 6);
    g.stroke();
  }
  g.restore();
  for (const y of [12, 54]) {
    const roll = roundRect(8, y - 5, 48, 10, 5);
    shape(g, roll, TONES.papyrus, [8, y - 5, 56, y + 5], { gloss: 0.4, shade: 0.4 });
    g.save();
    g.clip(roll);
    g.fillStyle = 'rgba(80,55,25,0.45)';
    g.beginPath();
    g.ellipse(56, y, 3.5, 4, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

function crystals(g: G, t: Tone): void {
  // a heap of crystals (salt, gems) on a dark base
  const heap = poly([[8, 54], [14, 40], [22, 44], [30, 26], [40, 42], [48, 34], [58, 54]]);
  shape(g, heap, t, [8, 26, 58, 54], { dir: 'd', gloss: 0.5, shade: 0.3 });
  g.save();
  g.clip(heap);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(22, 44);
  g.lineTo(26, 54);
  g.moveTo(40, 42);
  g.lineTo(38, 54);
  g.moveTo(30, 26);
  g.lineTo(32, 54);
  g.stroke();
  g.restore();
  const base = ellipsePath(33, 54, 27, 5);
  shape(g, base, TONES.wood, [6, 49, 60, 59], { gloss: 0.2, shade: 0.4 });
  shape(g, heap, t, [8, 26, 58, 54], { dir: 'd', gloss: 0.5, shade: 0.3, noShadow: true });
}

function cloth(g: G, t: Tone): void {
  // a folded bolt of dyed cloth
  for (let i = 0; i < 3; i++) {
    const y = 20 + i * 12;
    const fold = new Path2D();
    fold.moveTo(10, y);
    fold.quadraticCurveTo(32, y - 6, 54, y);
    fold.lineTo(54, y + 12);
    fold.quadraticCurveTo(32, y + 6, 10, y + 12);
    fold.closePath();
    shape(g, fold, t, [10, y - 6, 54, y + 12], { gloss: 0.3, shade: 0.4 });
  }
}

/** Which drawing fits an unknown id, by the words in it. */
function family(id: string): (g: G) => void {
  const w = id.toLowerCase();
  const any = (...ws: string[]) => ws.some((s) => w.includes(s));
  const hue = hashString(id);
  const col = flatTone(hsl((hue % 360) / 360, 0.42, 0.42));
  if (any('wine')) return (g) => amphora(g, TONES.clay, true);
  if (any('oil', 'olive')) return (g) => amphora(g, TONES.olive, false);
  if (any('potion', 'elixir', 'tonic', 'vial', 'draught', 'flask')) return (g) => flask(g, col);
  if (any('bandage')) return (g) => cloth(g, TONES.linen);
  if (any('salve', 'balm', 'herb', 'heal', 'medic', 'poultice', 'ointment')) return jar;
  if (any('amphora', 'jar', 'pot', 'vase')) return (g) => amphora(g, TONES.clay, false);
  if (any('horn', 'trumpet', 'salpinx')) return horn;
  if (any('stone', 'whet', 'sharp')) return whetstone;
  if (any('ration', 'bread', 'loaf', 'meal')) return rations;
  if (any('grain', 'wheat', 'barley', 'food', 'harvest', 'crop')) return food;
  if (any('timber', 'wood', 'log', 'lumber', 'plank')) return wood;
  if (any('bronze', 'ingot', 'copper', 'tin', 'iron', 'metal', 'ore')) return bronze;
  if (any('drachm', 'silver', 'obol', 'coin_s')) return drachmae;
  if (any('gold', 'coin', 'talent', 'stater', 'money')) return gold;
  if (any('recruit', 'men', 'soldier', 'levy', 'hoplite')) return recruits;
  if (any('papyrus', 'scroll', 'letter', 'map', 'chart')) return scroll;
  if (any('salt')) return (g) => crystals(g, TONES.salt);
  if (any('gem', 'crystal', 'amber', 'jewel', 'glass', 'faience')) return (g) => crystals(g, any('glass', 'faience') ? TONES.faience : col);
  if (any('dye', 'purple', 'cloth', 'linen', 'wool', 'silk', 'tyrian')) return (g) => cloth(g, any('purple', 'tyrian', 'dye') ? TONES.purple : any('linen') ? TONES.linen : col);
  return (g) => sack(g, flatTone(mix(0xc2a070, hsl((hue % 360) / 360, 0.3, 0.5), 0.5)), col);
}

function hsl(h: number, s: number, l: number): number {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

const DRAW: Record<string, (g: G) => void> = {
  gold,
  drachmae,
  food,
  wood,
  bronze,
  recruits,
  healing_salve: jar,
  morale_wine: (g) => amphora(g, TONES.clay, true),
  war_horn: horn,
  sharpening_stone: whetstone,
  march_rations: rations,
};

/**
 * The smooth icon of a good at `px` atlas px on a side (16 UI px of icon:
 * px = 16 * K). Needs a DOM; callers fall back on `renderGoodsIcon` without one.
 */
export function renderGoodsIconHD(kind: GoodsKind, id: string, px: number): HTMLCanvasElement {
  void kind;
  // the drawn icon (docs/icons/README.md) when the atlas has it
  const bmp = drawIconBitmap(`goods:${id}`, px, { fill: 0.9 });
  if (bmp) return bmp;
  const [canvas, g] = iconCanvas(px, GOODS_UNITS);
  // a little inset so outline and shadow stay inside the box
  g.translate(2, 1);
  g.scale(0.93, 0.93);
  (DRAW[id] ?? family(id))(g);
  return canvas;
}

// ================================================================== the pixel icons (no DOM)

const SZ = 16;

function pxCoin(px: Pix, x: number, y: number, face: number, rim: number, mark: number): void {
  px.ellipse(x, y, 7, 7, (_x, _y, e) => (e ? rim : face));
  px.set(x + 3, y + 3, mark);
  px.set(x + 2, y + 2, 0xffffff, 120);
}

function consumable(id: string): Pix {
  const px = new Pix(SZ, SZ);
  switch (id) {
    case 'healing_salve':
      px.ellipse(3, 6, 10, 9, (_x, _y, e, u) => (e ? P.leather[2] : u < -0.2 ? P.leather[0] : P.leather[1]));
      px.rect(5, 3, 6, 3, P.linen[1]);
      px.hline(5, 10, 5, P.linen[2]);
      px.rect(6, 4, 4, 1, 0x6fae5a);
      px.set(7, 9, 0x8fce6a);
      px.set(8, 10, 0x6fae5a);
      break;
    case 'morale_wine':
      px.ellipse(4, 4, 8, 10, (_x, _y, e, u) => (e ? 0x6e2a18 : u < -0.3 ? 0xc0603a : 0xa04a2c));
      px.rect(7, 1, 2, 3, 0xa04a2c);
      px.hline(6, 9, 1, 0x6e2a18);
      px.vline(3, 4, 7, 0x6e2a18);
      px.vline(12, 4, 7, 0x6e2a18);
      px.hline(5, 10, 8, P.outline);
      px.set(7, 14, 0x6e2a18);
      px.set(8, 14, 0x6e2a18);
      break;
    case 'war_horn':
      for (let i = 0; i < 11; i++) {
        const x = 2 + i;
        const y = 12 - Math.round(Math.sin((i / 10) * Math.PI * 0.8) * 7);
        const r = Math.round(i / 4);
        for (let k = -r; k <= r; k++) px.set(x, y + k, k < 0 ? P.bronze[0] : P.bronze[1]);
      }
      px.vline(13, 2, 9, P.bronze[2]);
      px.line(4, 12, 11, 8, P.leather[2]);
      break;
    case 'sharpening_stone':
      px.rect(2, 8, 11, 4, P.iron[2]);
      px.hline(2, 12, 8, P.iron[1]);
      px.hline(3, 11, 9, P.iron[1]);
      px.hline(2, 12, 11, P.iron[3]);
      px.set(12, 5, P.gold);
      px.set(13, 4, 0xfff0a0);
      px.set(11, 4, P.gold);
      px.set(13, 6, P.gold);
      break;
    case 'march_rations':
      px.rect(2, 7, 12, 7, P.linen[2]);
      px.hline(2, 13, 7, P.linen[1]);
      px.ellipse(4, 3, 9, 6, (_x, _y, e, _u, v) => (e ? 0x7a4a22 : v < -0.2 ? 0xd8a060 : 0xb8803e));
      px.set(6, 5, 0x7a4a22);
      px.set(8, 4, 0x7a4a22);
      px.set(10, 5, 0x7a4a22);
      break;
    default:
      px.ellipse(4, 4, 8, 8, () => P.parchDark);
  }
  px.outline(P.outline);
  return px;
}

function resource(id: string): Pix {
  const px = new Pix(SZ, SZ);
  switch (id) {
    case 'gold':
      pxCoin(px, 1, 7, P.gold, P.goldDark, P.goldDark);
      pxCoin(px, 7, 7, P.gold, P.goldDark, P.goldDark);
      pxCoin(px, 4, 2, 0xf0d070, P.goldDark, P.goldDark);
      break;
    case 'drachmae':
      px.ellipse(2, 2, 12, 12, (_x, _y, e, u, v) => (e ? 0x6a7076 : u + v < -0.6 ? 0xe8ecee : 0xc4c8cc));
      px.rect(6, 5, 4, 5, 0x7a8086);
      px.set(6, 6, 0xffffff);
      px.set(9, 6, 0xffffff);
      px.set(7, 10, 0x6a7076);
      px.set(8, 10, 0x6a7076);
      break;
    case 'food':
      for (const dx of [-3, 0, 3]) {
        px.line(8 + dx / 3, 14, 8 + dx, 5, 0x9a8a3e);
        for (let k = 0; k < 4; k++) {
          px.set(8 + dx - 1, 2 + k * 1.5, P.gold);
          px.set(8 + dx + 1, 2.5 + k * 1.5, 0xc8a048);
        }
      }
      px.hline(6, 10, 10, P.leather[1]);
      break;
    case 'wood':
      for (const [y, x] of [[8, 1], [3, 4]]) {
        px.rect(x, y, 10, 5, P.wood[1]);
        px.hline(x, x + 9, y, P.wood[0]);
        px.hline(x, x + 9, y + 4, P.wood[2]);
        px.ellipse(x + 8, y, 4, 5, (_x, _y, e) => (e ? P.wood[2] : 0xc8a070));
      }
      break;
    case 'bronze':
      for (let y = 0; y < 6; y++) px.hline(3 - Math.floor(y / 2), 12 + Math.floor(y / 2), 6 + y, y === 0 ? P.bronze[0] : y < 3 ? P.bronze[1] : P.bronze[2]);
      px.hline(4, 11, 5, P.bronze[0]);
      px.set(6, 7, 0xffffff, 140);
      break;
    case 'recruits':
      px.ellipse(4, 4, 8, 9, (_x, _y, e, u) => (e ? P.bronze[2] : u < -0.2 ? P.bronze[0] : P.bronze[1]));
      px.rect(6, 8, 4, 4, P.skin[1][1]);
      px.vline(7, 8, 12, P.bronze[2]);
      px.rect(5, 1, 6, 3, P.crest.red);
      px.hline(5, 10, 1, 0xc84a34);
      px.rect(5, 13, 6, 2, P.tunicRed[1]);
      break;
    default:
      px.ellipse(4, 4, 8, 8, () => P.parchDark);
  }
  px.outline(P.outline);
  return px;
}

/** The 16 x 16 pixel icon (no DOM needed). */
export function renderGoodsIcon(kind: GoodsKind, id: string): Pix {
  return kind === 'consumable' ? consumable(id) : resource(id);
}

/** Texture key of a good's icon; `px` is the smooth icon's edge in atlas px (none: the pixel icon). */
export function goodsIconKey(kind: GoodsKind, id: string, px?: number): string {
  return px ? `goods_${kind}_${id}@${px}` : `goods_${kind}_${id}`;
}
