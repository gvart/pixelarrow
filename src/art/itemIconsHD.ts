/**
 * Smooth item icons for the "Bronze & Stone" UI (docs/UI_D2.md): painted
 * inventory icons drawn with Canvas 2D paths and gradients at the screen's
 * density (K atlas px per UI px, shown scaled by 1 / K with LINEAR filtering).
 *
 * Every icon is drawn in a 64 x 64 unit box (16 UI px -> 4 units per UI px)
 * lit from the top left, with a dark rim, a soft drop shadow and a rarity
 * finish: common plain, uncommon a brighter sheen, rare a glint, epic gilded
 * fittings and metal, legendary orichalcum with a warm glow and sparkles.
 *
 * The renderer is data driven: an ItemDef's art key picks the shape, its
 * `material` (or the art's usual one) the main ramp, its tier the amount of
 * ornament and its id a few flourishes, so items added to src/data/items.ts
 * later get a sensible icon without code here (unknown art keys fall back on
 * the slot / weapon kind / shield kind).
 */
import { itemDef, rarityRank, type Item, type ItemDef, type ItemMaterial, type ItemPaint } from '../data/items';
import { EMBLEM_BITMAPS } from './emblems';
import { P, hex, mix } from './palette';

/** Drawing space edge: 16 UI px of icon = 64 units. */
export const ICON_UNITS = 64;

// ------------------------------------------------------------------ materials

export interface Ramp {
  hi: string;
  base: string;
  lo: string;
  dk: string;
  /** Specular colour (metals). */
  spec: string;
  metal: boolean;
}

const ramp = (hi: number, base: number, lo: number, dk: number, metal = false, spec = 0xffffff): Ramp => ({ hi: hex(hi), base: hex(base), lo: hex(lo), dk: hex(dk), spec: hex(spec), metal });

/** A matte ramp around one flat colour (painted shield fields, crests). */
function flatRamp(c: number, metal = false): Ramp {
  return ramp(mix(c, 0xffffff, 0.32), c, mix(c, 0x000000, 0.3), mix(c, 0x000000, 0.55), metal, mix(c, 0xffffff, 0.75));
}

type MatKey = ItemMaterial | 'orichalcum' | 'blued' | 'lead' | 'olive' | 'darkwood' | 'cord' | 'cream';

export const RAMPS: Record<MatKey, Ramp> = {
  bronze: ramp(0xf4d690, 0xc48f3e, 0x80561f, 0x4a3012, true, 0xfff6d0),
  iron: ramp(0xdde1e1, 0x9da3a5, 0x5e6467, 0x34393c, true),
  steel: ramp(0xf0f4f7, 0xb2bcc4, 0x6a7680, 0x3b454d, true),
  silver: ramp(0xffffff, 0xd6dadf, 0x8d939a, 0x4f555b, true),
  gold: ramp(0xfff4b8, 0xe8c25c, 0xa47c28, 0x694b14, true, 0xffffe0),
  orichalcum: ramp(0xfffbe4, 0xffd372, 0xe28c32, 0x8e4c18, true, 0xffffff),
  blued: ramp(0xb9c6d6, 0x5f6f84, 0x33404f, 0x1b232c, true, 0xe8f0ff),
  lead: ramp(0xb8bcc0, 0x7e8488, 0x52585c, 0x30353a, true, 0xdcdfe2),
  wood: ramp(0xb98c5e, 0x8c5f38, 0x5b3a1e, 0x382310),
  olive: ramp(0xc4a070, 0x967047, 0x634526, 0x3c2a14),
  darkwood: ramp(0x8a6240, 0x5e3f26, 0x3c2716, 0x241509),
  leather: ramp(0xbb8a60, 0x87593b, 0x5a3824, 0x372113),
  cord: ramp(0xd8c8a8, 0xa89470, 0x6e604a, 0x3e3628),
  linen: ramp(0xfcf7ea, 0xe6dcc2, 0xb9ab8c, 0x7b6f59),
  cream: ramp(0xf8f0dc, 0xe6d8b8, 0xb8a784, 0x7a6d52),
  bone: ramp(0xfefaf0, 0xeee4cc, 0xbdab8a, 0x7e6e52),
  horn: ramp(0xeadcb4, 0xa6844e, 0x5e4727, 0x33240f),
  stone: ramp(0xcdc5b4, 0x938b7d, 0x5e584e, 0x383430),
  faience: ramp(0xaaf0e4, 0x3f9e97, 0x226462, 0x143a39, false, 0xe0fffa),
  felt: ramp(0xad957c, 0x7d6753, 0x4f3f31, 0x2e251b),
  wicker: ramp(0xe0c080, 0xb48e4c, 0x7d5e2b, 0x4c3718),
};

const EMBLEM_MASKS = new Map<string, HTMLCanvasElement>();

const OUTLINE = 'rgba(22, 13, 8, 0.88)';
const OUTLINE_W = 2.1;

// ------------------------------------------------------------------ helpers

type G = CanvasRenderingContext2D;

interface Ctx {
  g: G;
  def: ItemDef;
  id: string;
  r: number;
  tier: number;
  mat: ItemMaterial | undefined;
  paint: ItemPaint | undefined;
  /** Small per-id hash for flourishes that tell unknown siblings apart. */
  v: number;
  /** Main material ramp (blade, bowl, face) after the rarity finish. */
  main: Ramp;
  /** Fittings: bands, rivets, guards, bosses. */
  trim: Ramp;
  /** Where glints go (screen units), filled by the drawers. */
  glints: [number, number][];
}

/** Does the item id mention any of these words (per-id flourishes, keyword families)? */
function has(c: Ctx, ...words: string[]): boolean {
  return words.some((w) => c.id.includes(w));
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const isMetal = (m: ItemMaterial | undefined) => m === 'bronze' || m === 'iron' || m === 'steel' || m === 'silver' || m === 'gold';

/** The rarity finish of a metal: epic gilds it, legendary makes it orichalcum. */
function finish(base: Ramp, r: number): Ramp {
  if (r >= 4) return RAMPS.orichalcum;
  if (r >= 3) return base.metal ? RAMPS.gold : base;
  return base;
}

/** Fittings ramp: bronze (or iron for iron things), gilt from epic. */
function trimOf(main: Ramp, r: number): Ramp {
  if (r >= 4) return RAMPS.orichalcum;
  if (r >= 3) return RAMPS.gold;
  return main === RAMPS.iron || main === RAMPS.steel || main === RAMPS.blued ? RAMPS.iron : RAMPS.bronze;
}

/** Linear gradient along (x0,y0)-(x1,y1) through the ramp (metal: a double band). */
function grad(g: G, rp: Ramp, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  if (rp.metal) {
    gr.addColorStop(0, rp.hi);
    gr.addColorStop(0.2, rp.base);
    gr.addColorStop(0.46, rp.lo);
    gr.addColorStop(0.64, rp.base);
    gr.addColorStop(0.82, rp.lo);
    gr.addColorStop(1, rp.dk);
  } else {
    gr.addColorStop(0, rp.hi);
    gr.addColorStop(0.32, rp.base);
    gr.addColorStop(0.74, rp.lo);
    gr.addColorStop(1, rp.dk);
  }
  return gr;
}

/** Radial shading: lit at (cx - r*0.35, cy - r*0.35), dark at the far rim. */
function dome(g: G, rp: Ramp, cx: number, cy: number, rad: number, concave = false): CanvasGradient {
  const ox = concave ? 0.3 : -0.35;
  const gr = g.createRadialGradient(cx + rad * ox, cy + rad * ox, rad * 0.05, cx, cy, rad * 1.05);
  if (concave) {
    gr.addColorStop(0, rp.lo);
    gr.addColorStop(0.55, rp.base);
    gr.addColorStop(0.92, rp.hi);
    gr.addColorStop(1, rp.base);
  } else {
    gr.addColorStop(0, rp.hi);
    gr.addColorStop(0.3, rp.base);
    gr.addColorStop(0.72, rp.lo);
    gr.addColorStop(1, rp.dk);
  }
  return gr;
}

function outline(g: G, p: Path2D, w = OUTLINE_W): void {
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.lineWidth = w;
  g.strokeStyle = OUTLINE;
  g.stroke(p);
}

/** Fill a path with a gradient and rim it. */
function shape(g: G, p: Path2D, fill: string | CanvasGradient, rim = true): void {
  g.fillStyle = fill;
  g.fill(p);
  if (rim) outline(g, p);
}

/** A thin highlight line (specular) in the ramp's spec colour. */
function spec(g: G, rp: Ramp, pts: [number, number][], w = 1.2, alpha = 0.75): void {
  g.save();
  g.globalAlpha = alpha;
  g.strokeStyle = rp.spec;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
  g.restore();
}

function rrect(x: number, y: number, w: number, h: number, r: number): Path2D {
  const p = new Path2D();
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  p.moveTo(x + rr, y);
  p.arcTo(x + w, y, x + w, y + h, rr);
  p.arcTo(x + w, y + h, x, y + h, rr);
  p.arcTo(x, y + h, x, y, rr);
  p.arcTo(x, y, x + w, y, rr);
  p.closePath();
  return p;
}

function ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0): Path2D {
  const p = new Path2D();
  p.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
  return p;
}

function poly(pts: [number, number][]): Path2D {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
}

/** Smooth closed curve through points (Catmull-Rom as cubic Beziers). */
function smooth(pts: [number, number][], tension = 0.5): Path2D {
  const p = new Path2D();
  const n = pts.length;
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension * 2, c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension * 2;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension * 2, c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension * 2;
    p.bezierCurveTo(c1x, c1y, c2x, c2y, p2[0], p2[1]);
  }
  p.closePath();
  return p;
}

/** Wood grain inside a path: faint long lines along `dir` (radians). */
function grain(g: G, p: Path2D, rp: Ramp, x: number, y: number, len: number, dir: number, spread: number, v: number): void {
  g.save();
  g.clip(p);
  g.translate(x, y);
  g.rotate(dir);
  g.lineWidth = 0.7;
  for (let i = 0; i < 5; i++) {
    const t = (i / 4 - 0.5) * spread;
    const ph = ((v >> (i * 3)) & 7) / 7;
    g.strokeStyle = i % 2 ? rp.dk : rp.hi;
    g.globalAlpha = i % 2 ? 0.35 : 0.22;
    g.beginPath();
    for (let s = -len / 2; s <= len / 2; s += 2) g.lineTo(s, t + Math.sin((s / len) * 6 + ph * 6) * 0.6);
    g.stroke();
  }
  g.restore();
}

/** Soft dark shadow of a region (used under overlapping parts). */
function shade(g: G, p: Path2D, alpha = 0.35): void {
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = '#0d0805';
  g.fill(p);
  g.restore();
}

/** A rivet / stud. */
function stud(g: G, rp: Ramp, x: number, y: number, rad: number): void {
  const p = ellipse(x, y, rad, rad);
  g.fillStyle = dome(g, rp, x, y, rad);
  g.fill(p);
  g.strokeStyle = 'rgba(22,13,8,0.6)';
  g.lineWidth = 0.6;
  g.stroke(p);
}

/** A band across a rod in the local frame (rod along x). */
function band(g: G, rp: Ramp, x: number, w: number, r: number): void {
  const p = rrect(x - w / 2, -r - 0.4, w, r * 2 + 0.8, 0.8);
  shape(g, p, grad(g, rp, 0, -r, 0, r));
}

/** A rod along x from x0 to x1 of radius r (rounded ends), lit from -y. */
function rod(g: G, rp: Ramp, x0: number, x1: number, r: number, opts: { grain?: number; taper?: number; rim?: boolean } = {}): Path2D {
  const r1 = opts.taper !== undefined ? opts.taper : r;
  const p = new Path2D();
  p.moveTo(x0, -r);
  p.lineTo(x1, -r1);
  p.arc(x1, 0, r1, -Math.PI / 2, Math.PI / 2);
  p.lineTo(x0, r);
  p.arc(x0, 0, r, Math.PI / 2, -Math.PI / 2);
  p.closePath();
  shape(g, p, grad(g, rp, 0, -Math.max(r, r1), 0, Math.max(r, r1)), opts.rim !== false);
  if (opts.grain !== undefined) grain(g, p, rp, (x0 + x1) / 2, 0, x1 - x0, 0, Math.max(r, r1) * 1.4, opts.grain);
  return p;
}

/** Leaf-shaped spear / sword blade from x0 (socket) to x1 (point), half width w at its widest. */
function leaf(g: G, rp: Ramp, x0: number, x1: number, w: number, c: Ctx, opts: { waist?: number; rib?: boolean } = {}): void {
  const L = x1 - x0;
  const wx = x0 + L * (opts.waist ?? 0.35);
  const p = new Path2D();
  p.moveTo(x0, -w * 0.45);
  p.quadraticCurveTo(wx, -w * 1.15, x1, 0);
  p.quadraticCurveTo(wx, w * 1.15, x0, w * 0.45);
  p.closePath();
  shape(g, p, grad(g, rp, 0, -w, 0, w));
  if (opts.rib !== false) {
    // the midrib: a highlight above, a shadow below
    spec(g, rp, [[x0 + 1, -0.2], [x1 - 1.5, 0]], 0.9, 0.85);
    g.save();
    g.globalAlpha = 0.35;
    g.strokeStyle = rp.dk;
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(x0 + 1, 0.9);
    g.lineTo(x1 - 2, 0.3);
    g.stroke();
    g.restore();
  }
  c.glints.push([x1, 0]);
}

/** Transform a local point (current transform of the weapon frame) to screen units. */
function toScreen(g: G, x: number, y: number): [number, number] {
  const m = g.getTransform();
  const u = ICON_UNITS / (g.canvas.width || ICON_UNITS);
  return [(m.a * x + m.c * y + m.e) * u, (m.b * x + m.d * y + m.f) * u];
}

// ------------------------------------------------------------------ weapons

/** Weapons lie along the diagonal, point to the top right; local x = length, light from local -y. */
function weaponFrame(g: G, fn: () => void): void {
  g.save();
  g.translate(ICON_UNITS / 2, ICON_UNITS / 2);
  g.rotate(-Math.PI / 4);
  fn();
  g.restore();
}

function spearIcon(c: Ctx, kind: 'spear' | 'spear_short' | 'lance'): void {
  const { g, id, r, tier } = c;
  const lance = kind === 'lance';
  const short = kind === 'spear_short';
  const sarissa = has(c, 'sarissa');
  const shaft = lance ? RAMPS.darkwood : c.mat === 'wood' || !c.mat || isMetal(c.mat) ? RAMPS.wood : RAMPS[c.mat];
  const head = isMetal(c.mat) ? c.main : lance ? finish(RAMPS.iron, r) : finish(RAMPS.bronze, r);
  const trim = c.trim;
  const x0 = lance || sarissa ? -38 : short ? -26 : -34;
  const x1 = lance || sarissa ? 24 : short ? 12 : 16;
  const tip = lance || sarissa ? 37 : short ? 28 : 33;
  const rr = lance || sarissa ? 2.1 : 2.7;
  let tipPt: [number, number] = [0, 0];
  weaponFrame(g, () => {
    rod(g, shaft, x0, x1 + 2, rr, { grain: c.v });
    // butt spike (sauroter) on the long spears
    if (!short) {
      const sp = poly([[x0 + 1, -rr * 0.8], [x0 - 6, 0], [x0 + 1, rr * 0.8]]);
      shape(g, sp, grad(g, trim, 0, -2, 0, 2));
      band(g, trim, x0 + 1, 2.6, rr);
    }
    // socket and bands: more on the finer spears; the sarissa's iron sleeve joins two halves
    band(g, trim, x1 + 0.5, 3, rr);
    if (sarissa) band(g, RAMPS.iron, -6, 5, rr + 0.2);
    else {
      if (tier >= 2 || id === 'bronze_dory') band(g, trim, x1 - 7, 1.8, rr);
      if (tier >= 3) band(g, trim, x1 - 12, 1.8, rr);
    }
    if (lance) {
      // leather grip in the middle
      const gp = rod(g, RAMPS.leather, -9, 1, rr + 0.5, { rim: true });
      g.save();
      g.clip(gp);
      g.strokeStyle = 'rgba(22,13,8,0.45)';
      g.lineWidth = 0.7;
      for (let x = -8; x < 1; x += 1.8) {
        g.beginPath();
        g.moveTo(x, -3);
        g.lineTo(x + 1, 3);
        g.stroke();
      }
      g.restore();
    }
    // the head: leaf shapes of different widths and waists tell siblings apart
    const vv = c.v % 3;
    const wide = id === 'bronze_dory' || tier >= 3 ? 5 : lance || sarissa ? 2.8 : 3.8 + vv * 0.5;
    leaf(g, head, x1 + 1.5, tip, wide, c, { waist: lance ? 0.3 : 0.32 + vv * 0.1 });
    tipPt = toScreen(g, tip, 0);
  });
  c.glints = [tipPt];
}

function swordIcon(c: Ctx, kind: 'sword' | 'kopis' | 'longsword'): void {
  const { g, id, r, tier } = c;
  const falcata = id === 'falcata';
  const sica = has(c, 'sica');
  const gladius = has(c, 'gladius');
  const dagger = has(c, 'akinakes', 'dagger', 'pugio');
  const blade = falcata && !isMetal(c.mat) ? finish(RAMPS.blued, r) : isMetal(c.mat) ? c.main : finish(RAMPS.iron, r);
  const trim = c.trim;
  const grip = c.v & 1 ? RAMPS.leather : RAMPS.darkwood;
  let tipPt: [number, number] = [0, 0];
  weaponFrame(g, () => {
    const long = kind === 'longsword';
    const hx = long ? -20 : dagger ? -12 : -16; // guard position
    const tip = long ? 33 : dagger ? 20 : 27;
    // grip and pommel
    rod(g, grip, hx - 11, hx, 2.6);
    if (long) {
      // Celtic anthropoid pommel: two curled arms
      const pm = new Path2D();
      pm.moveTo(hx - 10, -1.4);
      pm.quadraticCurveTo(hx - 16, -5, hx - 13, -5.8);
      pm.quadraticCurveTo(hx - 10.5, -6, hx - 11.5, -2.8);
      pm.lineTo(hx - 11.5, 2.8);
      pm.quadraticCurveTo(hx - 10.5, 6, hx - 13, 5.8);
      pm.quadraticCurveTo(hx - 16, 5, hx - 10, 1.4);
      pm.closePath();
      shape(g, pm, grad(g, trim, 0, -5, 0, 5));
      stud(g, trim, hx - 12.8, 0, 1.5);
    } else if (falcata || sica) {
      // hooked bird's-head pommel
      const pm = new Path2D();
      pm.moveTo(hx - 10, -2.8);
      pm.quadraticCurveTo(hx - 19, -4, hx - 17, 3.6);
      pm.quadraticCurveTo(hx - 14, 6.2, hx - 12, 3.4);
      pm.lineTo(hx - 10, 2.8);
      pm.closePath();
      shape(g, pm, grad(g, trim, 0, -3, 0, 5));
      stud(g, RAMPS.gold, hx - 15, 0.5, 1);
    } else if (dagger) {
      // the akinakes' bar pommel
      shape(g, rrect(hx - 13.5, -4.5, 3, 9, 1.2), grad(g, trim, 0, -4.5, 0, 4.5));
    } else {
      const pm = ellipse(hx - 12, 0, 3, 3.4);
      shape(g, pm, grad(g, trim, 0, -3, 0, 3));
    }
    // grip binding
    g.save();
    g.strokeStyle = 'rgba(22,13,8,0.45)';
    g.lineWidth = 0.7;
    for (let x = hx - 9.5; x < hx - 1; x += 1.9) {
      g.beginPath();
      g.moveTo(x, -3);
      g.lineTo(x + 0.9, 3);
      g.stroke();
    }
    g.restore();
    // guard: a bar on the straight swords, a stub on the choppers, a heart on the dagger
    if (dagger) shape(g, poly([[hx - 1.5, -5.5], [hx + 2.5, -1.5], [hx + 2.5, 1.5], [hx - 1.5, 5.5]]), grad(g, trim, 0, -5, 0, 5));
    else {
      const guard = kind === 'sword' ? rrect(hx - 1.6, -5.8, 3.2, 11.6, 1.3) : rrect(hx - 1.4, -4, 2.8, 8, 1);
      shape(g, guard, grad(g, trim, 0, -5, 0, 5));
    }
    // blade
    if (kind === 'kopis') {
      const belly = sica ? 2.6 : has(c, 'makhaira') ? 4.2 : 5.4;
      const curve = sica ? 11 : 8.5;
      const p = new Path2D();
      p.moveTo(hx + 1, -2.6);
      p.quadraticCurveTo(hx + 18, -4, tip, -curve); // spine curving forward
      p.quadraticCurveTo(tip - 3, -2, tip - 9, belly); // the belly
      p.quadraticCurveTo(hx + 10, belly + 0.5, hx + 1, 2.6);
      p.closePath();
      shape(g, p, grad(g, blade, 0, -8, 0, 5));
      spec(g, blade, [[hx + 2, -2.1], [tip - 2, -curve + 1]], 1, 0.8);
      if (falcata || tier >= 3) {
        // gold inlay along the spine
        g.save();
        g.strokeStyle = RAMPS.gold.base;
        g.lineWidth = 0.9;
        g.setLineDash([1.6, 1.7]);
        g.globalAlpha = 0.9;
        g.beginPath();
        g.moveTo(hx + 4, 0.2);
        g.quadraticCurveTo(hx + 16, -0.8, tip - 6, -4);
        g.stroke();
        g.restore();
      }
      tipPt = toScreen(g, tip, -curve);
    } else {
      const w = long ? 4.2 : dagger ? 4.2 : 5.2;
      const p = new Path2D();
      if (long || gladius) {
        // parallel edges, a long point on the gladius, a rounded one on the Celtic sword
        const pt = gladius ? 9 : 6;
        p.moveTo(hx + 1, -w);
        p.lineTo(tip - pt, -w * 0.92);
        p.quadraticCurveTo(tip - pt * 0.3, -w * 0.5, tip + 1, 0);
        p.quadraticCurveTo(tip - pt * 0.3, w * 0.5, tip - pt, w * 0.92);
        p.lineTo(hx + 1, w);
      } else {
        // leaf blade (the xiphos), a straight taper on the dagger
        const wx = dagger ? hx + 3 : hx + 14;
        p.moveTo(hx + 1, -w * 0.62);
        p.quadraticCurveTo(wx, -w * 1.25, tip, 0);
        p.quadraticCurveTo(wx, w * 1.25, hx + 1, w * 0.62);
      }
      p.closePath();
      shape(g, p, grad(g, blade, 0, -w, 0, w));
      // fuller / midrib
      spec(g, blade, [[hx + 3, -0.4], [tip - 3, -0.1]], 1.1, 0.85);
      g.save();
      g.globalAlpha = 0.4;
      g.strokeStyle = blade.dk;
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(hx + 3, 1.1);
      g.lineTo(tip - 4, 0.7);
      g.stroke();
      g.restore();
      tipPt = toScreen(g, tip, 0);
    }
  });
  c.glints = [tipPt];
}

function axeIcon(c: Ctx): void {
  const { g, r, tier } = c;
  const head = isMetal(c.mat) ? c.main : finish(RAMPS.iron, r);
  const double = has(c, 'labrys', 'double');
  const pick = has(c, 'sagaris', 'dolabra', 'pick');
  let tipPt: [number, number] = [0, 0];
  weaponFrame(g, () => {
    rod(g, RAMPS.wood, -28, double ? 24 : 20, 2.6, { grain: c.v });
    // the blade toward -y (the top left on screen)
    const bit = (sx: number): Path2D => {
      const p = new Path2D();
      if (pick && has(c, 'sagaris')) {
        // a narrow, long blade
        p.moveTo(10, -2);
        p.lineTo(8, -11);
        p.quadraticCurveTo(13, -21, 20, -19);
        p.lineTo(19, -2);
      } else {
        p.moveTo(10, -2);
        p.lineTo(9, -13);
        p.quadraticCurveTo(16, -21, 26, -17);
        p.lineTo(24, -2);
      }
      p.quadraticCurveTo(24, 3, 20, 3);
      p.lineTo(14, 3);
      p.quadraticCurveTo(10, 3, 10, -2);
      p.closePath();
      const m = new DOMMatrix().scaleSelf(1, sx);
      const q = new Path2D();
      q.addPath(p, m);
      return q;
    };
    if (double) {
      // the labrys: a second bit mirrored below the haft
      shape(g, bit(-1), grad(g, head, 6, 2, 24, 18));
      spec(g, head, [[9.6, 12.5], [16, 19.6], [24.5, 15.5]], 1.1, 0.5);
    }
    shape(g, bit(1), grad(g, head, 6, -18, 24, 2));
    spec(g, head, [[9.6, -12.5], [16, -19.6], [25.5, -16]], 1.1, 0.9);
    if (pick && !has(c, 'sagaris')) {
      // the dolabra's pick spike behind the blade
      const sp = poly([[14, 2], [19, 2], [10, 16], [12, 4]]);
      shape(g, sp, grad(g, head, 10, 2, 16, 16));
    } else if (has(c, 'sagaris')) {
      // the sagaris' hammer poll
      shape(g, rrect(12, 2.5, 7, 5, 1), grad(g, head, 0, 2, 0, 8));
    }
    // socket wedge and a band
    band(g, c.trim, 7.5, 2, 2.7);
    if (tier >= 2) band(g, c.trim, 2, 1.6, 2.7);
    tipPt = toScreen(g, 17, -18);
  });
  c.glints = [tipPt];
}

function clubIcon(c: Ctx): void {
  const { g, r, tier } = c;
  const mace = has(c, 'mace') || isMetal(c.mat);
  const wood = c.mat && !isMetal(c.mat) && c.mat !== 'wood' ? RAMPS[c.mat] : RAMPS.olive;
  let tipPt: [number, number] = [0, 0];
  weaponFrame(g, () => {
    if (mace) {
      // a wooden haft and a flanged metal head
      rod(g, RAMPS.darkwood, -28, 16, 2.6, { grain: c.v });
      const head = isMetal(c.mat) ? c.main : finish(RAMPS.bronze, r);
      const hp = new Path2D();
      hp.moveTo(14, -4);
      hp.quadraticCurveTo(18, -9, 24, -8);
      hp.quadraticCurveTo(30, -4, 30, 0);
      hp.quadraticCurveTo(30, 4, 24, 8);
      hp.quadraticCurveTo(18, 9, 14, 4);
      hp.closePath();
      shape(g, hp, grad(g, head, 0, -9, 0, 9));
      // flanges
      g.save();
      g.clip(hp);
      g.strokeStyle = 'rgba(22,13,8,0.55)';
      g.lineWidth = 1;
      for (const y of [-5, -1.5, 2, 5.5]) {
        g.beginPath();
        g.moveTo(15, y);
        g.lineTo(29, y * 0.6);
        g.stroke();
      }
      g.restore();
      spec(g, head, [[16, -3.5], [26, -6]], 1, 0.8);
      band(g, c.trim, 13, 2.4, 2.8);
      band(g, c.trim, -26, 2, 2.6);
      tipPt = toScreen(g, 27, -4);
      return;
    }
    const p = new Path2D();
    p.moveTo(-28, -2.2);
    p.quadraticCurveTo(0, -4, 14, -7);
    p.quadraticCurveTo(27, -7.6, 28, 0);
    p.quadraticCurveTo(27, 7.6, 14, 7);
    p.quadraticCurveTo(0, 4, -28, 2.2);
    p.closePath();
    shape(g, p, grad(g, wood, 0, -7, 0, 7));
    grain(g, p, wood, 0, 0, 56, 0, 8, c.v);
    // knots on the head
    for (const [x, y, s] of [[17, -3.5, 1.7], [22, 2.5, 1.5], [12, 3, 1.3]] as [number, number, number][]) {
      const k = ellipse(x, y, s, s * 0.8);
      g.fillStyle = dome(g, wood, x, y, s);
      g.fill(k);
      g.strokeStyle = 'rgba(22,13,8,0.5)';
      g.lineWidth = 0.6;
      g.stroke(k);
    }
    // a bronze (gilt) ferrule on better clubs
    if (tier >= 2 || r >= 3) band(g, c.trim, -24, 2.2, 2.4);
    if (r >= 3) for (const x of [10, 16, 22]) stud(g, c.trim, x, -5.8 + (x - 10) * 0.05, 1);
    tipPt = toScreen(g, 27, -2);
  });
  c.glints = [tipPt];
}

function slingIcon(c: Ctx): void {
  const { g, id, r } = c;
  const balearic = id === 'balearic_sling' || c.mat === 'felt';
  const rhodian = id === 'rhodian_sling';
  const staff = has(c, 'staff');
  const cordR = balearic ? ramp(0x5a4a44, 0x3b2e2a, 0x24191a, 0x120c0c) : c.mat === 'leather' ? RAMPS.leather : RAMPS.cord;
  const pouch = rhodian ? RAMPS.darkwood : RAMPS.leather;
  let top = 8;
  let ax = 16, bx = 48;
  if (staff) {
    // a sling on the end of a staff: the staff rises from the bottom left
    weaponFrame(g, () => {
      rod(g, RAMPS.wood, -34, 6, 2.6, { grain: c.v });
      band(g, c.trim, 5, 2.4, 2.7);
    });
    ax = 36;
    bx = 56;
    top = 10;
  }
  // two cords from the top to the pouch
  const px = staff ? 44 : 32;
  g.save();
  g.lineCap = 'round';
  for (const [x0, x1] of [[ax, px - 5], [bx, px + 5]]) {
    g.beginPath();
    g.moveTo(x0, top);
    g.quadraticCurveTo(x0 + (x1 - x0) * 0.25, 26, x1, 44);
    g.lineWidth = 4;
    g.strokeStyle = OUTLINE;
    g.stroke();
    g.lineWidth = 2.4;
    g.strokeStyle = cordR.base;
    g.stroke();
    g.lineWidth = 0.8;
    g.strokeStyle = cordR.hi;
    g.globalAlpha = 0.7;
    g.stroke();
    g.globalAlpha = 1;
  }
  if (!staff) {
    // finger loop and release knot
    const loop = ellipse(16, 6, 3, 2.4);
    g.lineWidth = 1.8;
    g.strokeStyle = OUTLINE;
    g.stroke(loop);
    g.lineWidth = 1;
    g.strokeStyle = cordR.hi;
    g.stroke(loop);
    stud(g, cordR, 48, 7, 2.2);
  }
  g.restore();
  // the pouch
  const pp = smooth([[px - 11, 44], [px, 40], [px + 11, 44], [px + 9, 53], [px, 56], [px - 9, 53]]);
  shape(g, pp, grad(g, pouch, px - 8, 40, px + 8, 56));
  g.save();
  g.strokeStyle = 'rgba(22,13,8,0.5)';
  g.lineWidth = 0.7;
  g.setLineDash([1.3, 1.3]);
  g.beginPath();
  g.moveTo(px - 8, 46);
  g.quadraticCurveTo(px, 43.5, px + 8, 46);
  g.stroke();
  g.restore();
  // the shot: a stone, a cast lead bullet, or two stones
  if (rhodian || c.tier >= 3) {
    const b = ellipse(px, 45.5, 5.4, 2.8, -0.2);
    shape(g, b, grad(g, finish(RAMPS.lead, r), px - 4, 42, px + 4, 48));
    spec(g, RAMPS.lead, [[px - 3, 44.2], [px + 2, 44.2]], 0.9, 0.8);
  } else {
    const st = smooth([[px - 4.5, 44], [px + 1, 42.4], [px + 5, 45], [px + 2, 48.5], [px - 3, 48]]);
    shape(g, st, dome(g, RAMPS.stone, px, 45, 4.5));
    if (balearic) shape(g, ellipse(px + 12, 54, 3.4, 2.8, 0.4), dome(g, RAMPS.stone, px + 12, 54, 3));
  }
  c.glints = [[px - 1, 43.5]];
}

function bowIcon(c: Ctx, short: boolean): void {
  const { g, id, r, tier } = c;
  const horn = id === 'cretan_bow' || c.mat === 'horn';
  const self = has(c, 'self', 'hunting') || (c.mat === 'wood' && tier <= 1);
  const stave = c.mat && !isMetal(c.mat) && c.mat !== 'horn' ? RAMPS[c.mat] : RAMPS.wood;
  const x = 20;
  const top = short ? 11 : 5;
  const bot = short ? 53 : 59;
  const bulge = short ? 37 : 41;
  // stave
  const p = new Path2D();
  if (short) {
    // recurve: tips bent forward
    p.moveTo(x - 1, top);
    p.quadraticCurveTo(x + 6, top + 6, bulge - 6, 24);
    p.quadraticCurveTo(bulge + 4, 32, bulge - 6, 40);
    p.quadraticCurveTo(x + 6, bot - 6, x - 1, bot);
    p.quadraticCurveTo(x + 2, bot - 5, bulge - 10, 40);
    p.quadraticCurveTo(bulge - 1, 32, bulge - 10, 24);
    p.quadraticCurveTo(x + 2, top + 5, x - 1, top);
  } else {
    p.moveTo(x, top);
    p.quadraticCurveTo(bulge + 10, 32, x, bot);
    p.quadraticCurveTo(bulge + 1, 32, x, top);
  }
  p.closePath();
  shape(g, p, grad(g, stave, x, 0, bulge + 8, 0));
  if (self) grain(g, p, stave, 30, 32, 54, Math.PI / 2, 4, c.v);
  // horn tips and a grip (a plain self bow has neither)
  const tipR = horn ? RAMPS.horn : c.trim;
  if (!self)
    for (const y of [top, bot]) {
      const t = ellipse(x, y, 2.6, 2, 0.3);
      shape(g, t, grad(g, tipR, x - 2, y - 2, x + 2, y + 2));
    }
  const gripR = short ? flatRamp(0xa83224) : horn ? RAMPS.horn : RAMPS.leather;
  const gy = 32;
  if (!self) {
    const gripP = rrect(bulge - 10, gy - 5.5, 6, 11, 1.8);
    shape(g, gripP, grad(g, gripR, bulge - 10, gy - 5, bulge - 4, gy + 5));
  }
  // string
  g.save();
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x - 1, top);
  g.lineTo(x - 1, bot);
  g.lineWidth = 2.2;
  g.strokeStyle = OUTLINE;
  g.stroke();
  g.lineWidth = 1;
  g.strokeStyle = RAMPS.linen.base;
  g.stroke();
  g.restore();
  // arrow nocked across, pointing right
  const ax0 = x - 1, ax1 = 60;
  g.save();
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(ax0, gy);
  g.lineTo(ax1 - 6, gy);
  g.lineWidth = 3.8;
  g.strokeStyle = OUTLINE;
  g.stroke();
  g.lineWidth = 2.2;
  g.strokeStyle = RAMPS.wood.base;
  g.stroke();
  g.lineWidth = 0.7;
  g.strokeStyle = RAMPS.wood.hi;
  g.globalAlpha = 0.6;
  g.beginPath();
  g.moveTo(ax0, gy - 0.5);
  g.lineTo(ax1 - 6, gy - 0.5);
  g.stroke();
  g.restore();
  const headR = isMetal(c.mat) ? c.main : finish(RAMPS.iron, r);
  shape(g, poly([[ax1 - 8.5, gy - 3], [ax1, gy], [ax1 - 8.5, gy + 3]]), grad(g, headR, ax1 - 8, gy - 3, ax1 - 4, gy + 3));
  // fletching
  const fl = flatRamp(tier >= 3 ? 0xe6dcc4 : (c.v & 4) ? 0x8a6a4a : 0x9a8a78);
  shape(g, poly([[ax0 + 1, gy - 0.8], [ax0 + 10, gy - 3.8], [ax0 + 10, gy - 0.8]]), grad(g, fl, ax0, gy - 4, ax0 + 9, gy));
  shape(g, poly([[ax0 + 1, gy + 0.8], [ax0 + 10, gy + 3.8], [ax0 + 10, gy + 0.8]]), grad(g, fl, ax0, gy, ax0 + 9, gy + 4));
  c.glints = [[ax1 - 1, gy]];
}

function polearmIcon(c: Ctx, kind: 'falx' | 'rhomphaia'): void {
  const { g, r } = c;
  const blade = isMetal(c.mat) ? c.main : finish(RAMPS.iron, r);
  let tipPt: [number, number] = [0, 0];
  weaponFrame(g, () => {
    rod(g, RAMPS.darkwood, -34, 2, 2.6, { grain: c.v });
    band(g, c.trim, 1.5, 2.8, 2.8);
    if (c.tier >= 3) band(g, c.trim, -7, 1.8, 2.7);
    const p = new Path2D();
    if (kind === 'falx') {
      // sickle blade: the spine runs on, the edge hooks up toward -y
      p.moveTo(2, -2.8);
      p.quadraticCurveTo(18, -3.2, 26, -7);
      p.quadraticCurveTo(32, -10, 31, -18);
      p.quadraticCurveTo(29, -12, 24, -9);
      p.quadraticCurveTo(14, -2.5, 2, 2.8);
      p.closePath();
      shape(g, p, grad(g, blade, 10, -14, 26, 2));
      spec(g, blade, [[4, -2.3], [20, -4.2], [30.5, -15]], 1, 0.85);
      tipPt = toScreen(g, 31, -18);
    } else {
      // long, gently curved single edge
      p.moveTo(2, -3);
      p.quadraticCurveTo(20, -3.4, 34, -7.5);
      p.quadraticCurveTo(24, 1.6, 2, 2.4);
      p.closePath();
      shape(g, p, grad(g, blade, 0, -6, 0, 3));
      spec(g, blade, [[4, -2.3], [32, -6.4]], 1, 0.85);
      tipPt = toScreen(g, 34, -7.5);
    }
  });
  c.glints = [tipPt];
}

function javelinIcon(c: Ctx): void {
  const { g, id, r } = c;
  const pilum = has(c, 'pilum');
  const allIron = id === 'saunion' || has(c, 'soliferrum') || (c.mat === 'iron' && !pilum && !has(c, 'gaesum'));
  const barbed = has(c, 'gaesum', 'saunion') || (allIron && c.tier >= 2);
  const ironR = isMetal(c.mat) ? c.main : finish(RAMPS.iron, r);
  const shaft = allIron ? ironR : c.mat && !isMetal(c.mat) ? RAMPS[c.mat] : RAMPS.wood;
  const head = ironR;
  const pts: [number, number][] = [];
  weaponFrame(g, () => {
    for (const off of [5, -5]) {
      g.save();
      g.translate(0, off);
      if (pilum) {
        // a wooden shaft, a long thin iron shank and a small pyramidal head
        rod(g, shaft, -28, 4, 1.9, { grain: c.v });
        shape(g, rrect(2, -2.6, 6, 5.2, 1), grad(g, head, 0, -2.6, 0, 2.6));
        rod(g, head, 6, 24, 0.9);
        shape(g, poly([[23, -1.6], [30, 0], [23, 1.6]]), grad(g, head, 0, -2, 0, 2));
      } else {
        rod(g, shaft, -28, 20, allIron ? 1.5 : 1.9, allIron ? {} : { grain: c.v });
        if (barbed) shape(g, poly([[18, -1.3], [23, -3.6], [30, 0], [23, 3.6], [18, 1.3]]), grad(g, head, 0, -3, 0, 3));
        else {
          if (!allIron) band(g, c.trim, 19.5, 1.8, 1.9);
          leaf(g, head, 20, 30, 2.4, c, { waist: 0.35 });
        }
      }
      pts.push(toScreen(g, 30, 0));
      g.restore();
    }
    // the throwing thong (amentum) wound round the near shaft of the wooden darts
    if (!allIron && !pilum) {
      g.save();
      g.lineCap = 'round';
      g.strokeStyle = RAMPS.leather.lo;
      g.lineWidth = 1.2;
      for (let x = -4; x <= 2; x += 2) {
        g.beginPath();
        g.moveTo(x, 3);
        g.lineTo(x + 1, 7);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(-1, 3);
      g.quadraticCurveTo(-3, -1.5, 1, -2.8);
      g.stroke();
      g.restore();
    }
  });
  c.glints = [pts[0]];
}

function fallbackWeapon(c: Ctx): void {
  switch (c.def.weaponKind) {
    case 'spear': return spearIcon(c, 'spear');
    case 'lance': return spearIcon(c, 'lance');
    case 'sword': return swordIcon(c, 'sword');
    case 'axe': return axeIcon(c);
    case 'club': return clubIcon(c);
    case 'sling': return slingIcon(c);
    case 'bow': return bowIcon(c, false);
    case 'javelins': return javelinIcon(c);
    case 'polearm': return polearmIcon(c, 'rhomphaia');
    default: return swordIcon(c, 'sword');
  }
}

function weaponIcon(c: Ctx): void {
  switch (c.def.art) {
    case 'spear': return spearIcon(c, 'spear');
    case 'spear_short': return spearIcon(c, 'spear_short');
    case 'lance': return spearIcon(c, 'lance');
    case 'sword': return swordIcon(c, 'sword');
    case 'kopis': return swordIcon(c, 'kopis');
    case 'longsword': return swordIcon(c, 'longsword');
    case 'axe': return axeIcon(c);
    case 'club': return clubIcon(c);
    case 'sling': return slingIcon(c);
    case 'bow': return bowIcon(c, false);
    case 'bow_short': return bowIcon(c, true);
    case 'falx': return polearmIcon(c, 'falx');
    case 'rhomphaia': return polearmIcon(c, 'rhomphaia');
    case 'javelins': return javelinIcon(c);
    default: return fallbackWeapon(c);
  }
}

// ------------------------------------------------------------------ shields


function fieldRamp(c: Ctx, dflt: string): Ramp {
  const key = c.paint?.field ?? dflt;
  if (c.id === 'argyraspis' || c.mat === 'silver' || key === 'silver') return finish(RAMPS.silver, c.r);
  if (c.mat === 'gold' || key === 'gold') return finish(RAMPS.gold, c.r);
  if (key === 'bronze' || c.mat === 'bronze' || c.mat === 'iron' || c.mat === 'steel') return finish(c.mat && isMetal(c.mat) ? RAMPS[c.mat] : RAMPS.bronze, c.r);
  if (c.mat === 'wood' || c.mat === 'leather' || c.mat === 'wicker' || c.mat === 'linen') return RAMPS[c.mat];
  const col = P.shieldField[key] ?? P.shieldField.cream;
  return flatRamp(col);
}

function inkColor(c: Ctx, field: string): string {
  const key = c.paint?.ink;
  if (key && P.shieldInk[key] !== undefined) return hex(P.shieldInk[key]);
  // no ink: contrast with the field
  return field === 'cream' || field === 'bronze' ? hex(P.shieldInk.ink) : hex(P.shieldInk.cream);
}

function paintEmblem(c: Ctx, cx: number, cy: number, size: number, clip?: Path2D): void {
  const name = c.paint?.emblem;
  if (!name) return;
  const mask = emblemMask(name);
  if (!mask) return;
  const { g } = c;
  const ink = inkColor(c, c.paint?.field ?? 'cream');
  const inkN = parseInt(ink.slice(1), 16);
  // tint the mask on a scratch canvas the size of the icon, then lay it on the field
  const u = g.canvas.width / ICON_UNITS;
  const tmp = document.createElement('canvas');
  tmp.width = g.canvas.width;
  tmp.height = g.canvas.height;
  const t = tmp.getContext('2d')!;
  t.scale(u, u);
  t.imageSmoothingEnabled = true;
  t.imageSmoothingQuality = 'high';
  t.drawImage(mask, cx - size / 2, cy - size / 2, size, size);
  t.globalCompositeOperation = 'source-in';
  const gr = t.createLinearGradient(cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2);
  gr.addColorStop(0, hex(mix(inkN, 0xffffff, 0.18)));
  gr.addColorStop(1, hex(mix(inkN, 0x000000, 0.28)));
  t.fillStyle = gr;
  t.fillRect(0, 0, ICON_UNITS, ICON_UNITS);
  g.save();
  if (clip) g.clip(clip);
  // a faint shadow under the paint, as if slightly raised
  g.globalAlpha = 0.35;
  g.drawImage(tmp, 0.6, 0.8, ICON_UNITS, ICON_UNITS);
  g.globalAlpha = 1;
  g.drawImage(tmp, 0, 0, ICON_UNITS, ICON_UNITS);
  g.restore();
}

function hoplonIcon(c: Ctx): void {
  const { g, r, tier, id } = c;
  const cx = 32, cy = 32;
  const boeot = has(c, 'boeotian');
  const R = has(c, 'macedonian') ? 25 : 27;
  const field = fieldRamp(c, 'bronze');
  const spartan = has(c, 'spartan', 'lakedaimon');
  const argive = id === 'aspis' || tier >= 3;
  const rim = argive ? (r >= 4 ? RAMPS.orichalcum : RAMPS.gold) : c.trim;
  // the Boeotian shield: an oval with a notch cut from each side
  const face = (rad: number): Path2D => {
    if (!boeot) return ellipse(cx, cy, rad, rad);
    const p = new Path2D();
    const ry = rad * 1.08, rx = rad * 0.92;
    p.moveTo(cx, cy - ry);
    p.quadraticCurveTo(cx + rx, cy - ry, cx + rx, cy - ry * 0.3);
    p.quadraticCurveTo(cx + rx * 0.72, cy - ry * 0.15, cx + rx * 0.72, cy);
    p.quadraticCurveTo(cx + rx * 0.72, cy + ry * 0.15, cx + rx, cy + ry * 0.3);
    p.quadraticCurveTo(cx + rx, cy + ry, cx, cy + ry);
    p.quadraticCurveTo(cx - rx, cy + ry, cx - rx, cy + ry * 0.3);
    p.quadraticCurveTo(cx - rx * 0.72, cy + ry * 0.15, cx - rx * 0.72, cy);
    p.quadraticCurveTo(cx - rx * 0.72, cy - ry * 0.15, cx - rx, cy - ry * 0.3);
    p.quadraticCurveTo(cx - rx, cy - ry, cx, cy - ry);
    p.closePath();
    return p;
  };
  // the rim (a bronze ring, lit top left)
  const outer = face(R);
  shape(g, outer, dome(g, rim, cx, cy, R));
  // the face: concave, so the far (top left) side is darker and the near rim catches light
  const rw = spartan ? 6 : 3.6;
  const inner = face(R - rw);
  shade(g, face(R - rw + 0.4), 0.5);
  g.fillStyle = dome(g, field, cx, cy, R - rw, true);
  g.fill(inner);
  if (field.metal) {
    // a broad soft reflection band
    g.save();
    g.clip(inner);
    const gr = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.22)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fill(inner);
    g.restore();
  }
  g.strokeStyle = 'rgba(22,13,8,0.6)';
  g.lineWidth = 1;
  g.stroke(inner);
  // the Argive inner ring; the Macedonian shield's concentric rings
  if ((argive && !spartan) || has(c, 'macedonian')) {
    const rings = has(c, 'macedonian') ? [R - 7, R - 11] : [R - 7];
    for (const rr of rings) {
      const ring = face(rr);
      g.strokeStyle = rim.base;
      g.lineWidth = 1.2;
      g.stroke(ring);
      g.strokeStyle = 'rgba(255,240,200,0.35)';
      g.lineWidth = 0.5;
      g.stroke(ring);
    }
  }
  // legendary: sun rays round the field (the Macedonian star has them always)
  if (r >= 4 || has(c, 'macedonian')) {
    g.save();
    g.clip(inner);
    g.fillStyle = r >= 4 ? 'rgba(255,220,120,0.28)' : 'rgba(255,230,160,0.16)';
    const n = has(c, 'macedonian') ? 8 : 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = poly([[cx + Math.cos(a - 0.12) * 12, cy + Math.sin(a - 0.12) * 12], [cx + Math.cos(a) * 30, cy + Math.sin(a) * 30], [cx + Math.cos(a + 0.12) * 12, cy + Math.sin(a + 0.12) * 12]]);
      g.fill(p);
    }
    g.restore();
  }
  paintEmblem(c, cx, cy, boeot ? 20 : 25, inner);
  // gilded rivets round the rim on epic+
  if (r >= 3)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.4;
      stud(g, rim, cx + Math.cos(a) * (R - 1.8), cy + Math.sin(a) * (R - 1.8), 1);
    }
  outline(g, outer);
  c.glints = [[cx - R * 0.55, cy - R * 0.55]];
}

function ovalIcon(c: Ctx): void {
  const { g, r, id, tier } = c;
  const scutum = has(c, 'scutum');
  const celt = id === 'celtic_shield' || (c.mat === 'wood' && tier >= 2 && !scutum);
  const hide = c.mat === 'leather';
  const wicker = c.mat === 'wicker';
  const metalFace = c.mat && isMetal(c.mat);
  const cx = 32, cy = 32;
  const rx = celt ? 19 : scutum ? 20 : 21, ry = celt ? 30 : scutum ? 29 : 27;
  const field = metalFace ? c.main : fieldRamp(c, hide ? 'leather' : wicker ? 'wicker' : 'cream');
  // the scutum is a curved rectangle, the rest ovals
  const body = scutum ? rrect(cx - rx, cy - ry, rx * 2, ry * 2, 9) : ellipse(cx, cy, rx, ry);
  shape(g, body, scutum || metalFace ? dome(g, field, cx, cy, ry * 1.1) : grad(g, field, cx - rx, cy - ry, cx + rx, cy + ry));
  g.save();
  g.clip(body);
  if (wicker) {
    // woven withies
    g.lineWidth = 0.9;
    for (let y = -30; y <= 30; y += 3) {
      g.strokeStyle = y % 2 ? field.dk : field.hi;
      g.globalAlpha = y % 2 ? 0.3 : 0.2;
      g.beginPath();
      g.moveTo(cx - 24, cy + y);
      g.quadraticCurveTo(cx, cy + y - 1.5, cx + 24, cy + y);
      g.stroke();
    }
    g.globalAlpha = 0.14;
    g.strokeStyle = field.dk;
    for (let x = -20; x <= 20; x += 4) {
      g.beginPath();
      g.moveTo(cx + x, cy - 30);
      g.lineTo(cx + x, cy + 30);
      g.stroke();
    }
  } else if (hide) {
    // stitched hide panels
    g.strokeStyle = 'rgba(22,13,8,0.45)';
    g.lineWidth = 0.8;
    g.setLineDash([1.4, 1.3]);
    for (const dx of [-8, 8]) {
      g.beginPath();
      g.moveTo(cx + dx, cy - ry);
      g.quadraticCurveTo(cx + dx * 0.6, cy, cx + dx, cy + ry);
      g.stroke();
    }
  } else if (!metalFace) {
    // plank seams
    g.strokeStyle = 'rgba(22,13,8,0.18)';
    g.lineWidth = 0.7;
    for (const x of [cx - 9, cx + 9]) {
      g.beginPath();
      g.moveTo(x, cy - ry);
      g.lineTo(x, cy + ry);
      g.stroke();
    }
  }
  g.restore();
  // rim binding: leather, iron on the legionary scutum, gilt from epic
  const rimR = r >= 3 ? c.trim : metalFace || has(c, 'legion') ? RAMPS.iron : RAMPS.leather;
  const rimP = scutum ? rrect(cx - rx + 1.2, cy - ry + 1.2, rx * 2 - 2.4, ry * 2 - 2.4, 8) : ellipse(cx, cy, rx - 1.2, ry - 1.2);
  g.strokeStyle = rimR.base;
  g.lineWidth = scutum ? 2 : 1.6;
  g.stroke(rimP);
  g.strokeStyle = rimR.hi;
  g.lineWidth = 0.5;
  g.globalAlpha = 0.6;
  g.stroke(scutum ? rrect(cx - rx + 2, cy - ry + 2, rx * 2 - 4, ry * 2 - 4, 7.5) : ellipse(cx, cy, rx - 1.9, ry - 1.9));
  g.globalAlpha = 1;
  // emblem on the upper field (the scutum's wings go either side of the boss)
  paintEmblem(c, cx, cy - ry * 0.47, scutum ? 15 : 13, body);
  const boss = metalFace ? c.trim : isMetal(c.mat) ? c.main : finish(RAMPS.iron, r);
  if (hide || wicker) {
    // no spine: a small boss on a hide shield, a bare face on wicker
    if (hide) shape(g, ellipse(cx, cy, 5, 5), dome(g, boss, cx, cy, 5));
  } else {
    // the spina: a vertical rib
    const sp = rrect(cx - 2.6, cy - ry + 3, 5.2, ry * 2 - 6, 2.6);
    shape(g, sp, grad(g, celt ? RAMPS.darkwood : metalFace ? boss : RAMPS.wood, cx - 3, 0, cx + 3, 0));
    // the boss: round on the Celtic shield and the scutum, a strip on the thureos
    if (celt || scutum || has(c, 'boss')) {
      const bR = has(c, 'bossed') ? 8 : 6.5;
      const b = ellipse(cx, cy, bR, bR);
      shape(g, b, dome(g, boss, cx, cy, bR));
      const b2 = ellipse(cx, cy, bR * 0.45, bR * 0.45);
      g.fillStyle = dome(g, boss, cx, cy, 3);
      g.fill(b2);
      g.strokeStyle = 'rgba(22,13,8,0.5)';
      g.lineWidth = 0.6;
      g.stroke(b2);
    } else {
      const b = rrect(cx - 10, cy - 3.2, 20, 6.4, 3.2);
      shape(g, b, grad(g, boss, 0, cy - 3.2, 0, cy + 3.2));
      const b2 = ellipse(cx, cy, 3.4, 3.4);
      shape(g, b2, dome(g, boss, cx, cy, 3.4));
    }
  }
  c.glints = [[cx - 2.5, cy - 2.5]];
}

function pelteIcon(c: Ctx): void {
  const { g, r } = c;
  const cx = 32, cy = 34;
  const rx = 22, ry = 20;
  const metalFace = c.mat && isMetal(c.mat);
  const field = metalFace ? c.main : c.mat === 'wicker' || !c.paint?.field ? RAMPS.wicker : fieldRamp(c, 'cream');
  // crescent: an ellipse with a notch cut from the top
  const p = new Path2D();
  p.moveTo(cx - 14, cy - 15);
  p.quadraticCurveTo(cx - 28, cy - 14, cx - rx, cy + 2);
  p.quadraticCurveTo(cx - 20, cy + ry, cx, cy + ry);
  p.quadraticCurveTo(cx + 20, cy + ry, cx + rx, cy + 2);
  p.quadraticCurveTo(cx + 28, cy - 14, cx + 14, cy - 15);
  p.quadraticCurveTo(cx, cy - 2, cx - 14, cy - 15);
  p.closePath();
  shape(g, p, metalFace ? dome(g, field, cx, cy + 2, 24) : grad(g, field, cx - rx, cy - ry, cx + rx, cy + ry));
  if (!metalFace) {
    // wicker weave
    g.save();
    g.clip(p);
    g.lineWidth = 0.8;
    for (let i = -6; i <= 6; i++) {
      g.strokeStyle = i % 2 ? field.dk : field.hi;
      g.globalAlpha = i % 2 ? 0.28 : 0.2;
      g.beginPath();
      g.moveTo(cx - 30, cy + i * 3.6);
      g.quadraticCurveTo(cx, cy + i * 3.6 - 2, cx + 30, cy + i * 3.6);
      g.stroke();
    }
    g.globalAlpha = 0.14;
    g.strokeStyle = field.dk;
    for (let x = -24; x <= 24; x += 4) {
      g.beginPath();
      g.moveTo(cx + x, cy - 20);
      g.lineTo(cx + x, cy + 22);
      g.stroke();
    }
    g.restore();
  } else {
    // a bronze face: embossed concentric arcs
    g.save();
    g.clip(p);
    g.strokeStyle = 'rgba(22,13,8,0.3)';
    g.lineWidth = 0.9;
    for (const rr of [8, 14]) g.stroke(ellipse(cx, cy + 4, rr * 1.3, rr));
    g.strokeStyle = 'rgba(255,245,215,0.3)';
    for (const rr of [8, 14]) g.stroke(ellipse(cx, cy + 3.2, rr * 1.3, rr));
    g.restore();
  }
  // leather (gilt) binding
  const rimR = r >= 3 ? c.trim : RAMPS.leather;
  g.strokeStyle = rimR.base;
  g.lineWidth = 1.8;
  g.stroke(p);
  outline(g, p);
  paintEmblem(c, cx, cy + 4, 13, p);
  // a central grip boss on better peltai
  if (c.tier >= 2) stud(g, c.trim, cx, cy + 5, 2.6);
  c.glints = [[cx - 12, cy - 4]];
}

function bucklerIcon(c: Ctx): void {
  const { g, r } = c;
  const cx = 32, cy = 32, R = 17;
  const hide = c.mat === 'leather' || c.mat === 'wood' || c.mat === 'wicker';
  const face = c.mat && isMetal(c.mat) ? c.main : hide ? RAMPS[c.mat!] : c.paint?.field ? fieldRamp(c, 'bronze') : finish(RAMPS.bronze, r);
  const outer = ellipse(cx, cy, R, R);
  shape(g, outer, dome(g, hide ? RAMPS.darkwood : RAMPS.leather, cx, cy, R));
  const inner = ellipse(cx, cy, R - 2.8, R - 2.8);
  shape(g, inner, dome(g, face, cx, cy, R - 2.8));
  if (hide) {
    // the caetra: a leather face with crossed straps
    g.save();
    g.clip(inner);
    g.strokeStyle = RAMPS.darkwood.base;
    g.lineWidth = 2.2;
    for (const a of [0.8, -0.8]) {
      g.beginPath();
      g.moveTo(cx - Math.cos(a) * 16, cy - Math.sin(a) * 16);
      g.lineTo(cx + Math.cos(a) * 16, cy + Math.sin(a) * 16);
      g.stroke();
    }
    g.restore();
  } else {
    // concentric ridges
    g.strokeStyle = 'rgba(22,13,8,0.35)';
    g.lineWidth = 0.7;
    g.stroke(ellipse(cx, cy, R - 7.5, R - 7.5));
    g.strokeStyle = 'rgba(255,245,220,0.35)';
    g.stroke(ellipse(cx, cy, R - 8.3, R - 8.3));
  }
  paintEmblem(c, cx, cy, 11, inner);
  const boss = ellipse(cx, cy, 4.4, 4.4);
  shape(g, boss, dome(g, c.trim, cx, cy, 4.4));
  if (r >= 3 || hide) for (let i = 0; i < 6; i++) stud(g, c.trim, cx + Math.cos((i / 6) * 6.283) * (R - 4.5), cy + Math.sin((i / 6) * 6.283) * (R - 4.5), 1);
  c.glints = [[cx - 7, cy - 7]];
}

function shieldIcon(c: Ctx): void {
  switch (c.def.art) {
    case 'hoplon': return hoplonIcon(c);
    case 'oval': return ovalIcon(c);
    case 'pelte': return pelteIcon(c);
    case 'buckler': return bucklerIcon(c);
    default:
      if (c.def.shieldKind === 'oval') return ovalIcon(c);
      if (c.def.shieldKind === 'buckler') return bucklerIcon(c);
      return hoplonIcon(c);
  }
}

// ------------------------------------------------------------------ helmets

function crestRamp(c: Ctx): Ramp {
  const key = c.paint?.field ?? (c.v & 2 ? 'red' : 'ink');
  const col = (P.crest as Record<string, number>)[key] ?? P.crest.red;
  return flatRamp(col);
}

/** A horsehair crest (front view): a tall tapered fan over the bowl at (cx, top). */
function crest(c: Ctx, cx: number, top: number, h: number, w: number, lean = 0): void {
  const { g } = c;
  const cr = crestRamp(c);
  const p = new Path2D();
  p.moveTo(cx - w, top + 2);
  p.quadraticCurveTo(cx - w * 0.9 + lean, top - h * 0.7, cx + lean * 1.5, top - h);
  p.quadraticCurveTo(cx + w * 0.9 + lean, top - h * 0.7, cx + w, top + 2);
  p.closePath();
  shape(g, p, grad(g, cr, cx - w, top - h, cx + w, top));
  g.save();
  g.clip(p);
  g.strokeStyle = cr.dk;
  g.globalAlpha = 0.35;
  g.lineWidth = 0.6;
  for (let i = -3; i <= 3; i++) {
    g.beginPath();
    g.moveTo(cx + i * (w / 3.5), top + 2);
    g.lineTo(cx + i * (w / 5) + lean, top - h + 2);
    g.stroke();
  }
  g.restore();
  // the holder
  const hold = rrect(cx - w - 0.5, top - 0.5, w * 2 + 1, 2.6, 1);
  shape(g, hold, grad(g, c.trim, 0, top, 0, top + 3));
}

/** The bowl of a helmet: a dome from the brow line `by` up to `top`, half width `hw`. */
function bowl(c: Ctx, rp: Ramp, cx: number, by: number, top: number, hw: number, opts: { flat?: number; point?: boolean } = {}): Path2D {
  const { g } = c;
  const p = new Path2D();
  p.moveTo(cx - hw, by);
  if (opts.point) {
    p.quadraticCurveTo(cx - hw * 0.9, top + (by - top) * 0.45, cx - 1.5, top);
    p.quadraticCurveTo(cx, top - 1.5, cx + 1.5, top);
    p.quadraticCurveTo(cx + hw * 0.9, top + (by - top) * 0.45, cx + hw, by);
  } else {
    p.bezierCurveTo(cx - hw, top + (by - top) * 0.25, cx - hw * 0.55, top, cx, top);
    p.bezierCurveTo(cx + hw * 0.55, top, cx + hw, top + (by - top) * 0.25, cx + hw, by);
  }
  if (opts.flat) p.lineTo(cx + hw, by + opts.flat);
  p.lineTo(cx - hw, by + (opts.flat ?? 0));
  p.closePath();
  shape(g, p, dome(g, rp, cx, (top + by) / 2 + 2, hw * 1.15));
  // a soft specular on the upper left of the dome
  g.save();
  g.clip(p);
  const s = ellipse(cx - hw * 0.4, top + (by - top) * 0.32, hw * 0.3, (by - top) * 0.18, -0.5);
  g.fillStyle = rp.spec;
  g.globalAlpha = rp.metal ? 0.5 : 0.18;
  g.fill(s);
  g.restore();
  return p;
}

function cheekGuards(c: Ctx, rp: Ramp, cx: number, y: number, hw: number, h: number, gap = 8): void {
  for (const s of [-1, 1]) {
    const x = cx + s * (hw - 1);
    const p = new Path2D();
    p.moveTo(x - s * 1, y - 1);
    p.lineTo(x - s * 6.5, y - 1);
    p.quadraticCurveTo(x - s * 7, y + h * 0.6, x - s * gap * 0.55, y + h);
    p.quadraticCurveTo(x - s * 0.5, y + h, x - s * 0.5, y + h * 0.5);
    p.closePath();
    shape(c.g, p, grad(c.g, rp, x - s * 7, y, x, y + h));
  }
}

function helmetIcon(c: Ctx): void {
  const { g, r, tier } = c;
  const art = c.def.art;
  const cx = 32;
  const metal = c.mat && isMetal(c.mat) ? c.main : finish(RAMPS.bronze, r);
  const cloth = c.mat && !isMetal(c.mat) ? RAMPS[c.mat] : undefined;
  switch (art) {
    case 'cap': {
      const lr = cloth ?? RAMPS.leather;
      const wolf = has(c, 'wolf', 'fur', 'skin');
      const rp = c.mat && isMetal(c.mat) ? metal : wolf ? ramp(0x8a7f70, 0x5b5248, 0x3a342d, 0x221e19) : lr;
      const p = bowl(c, rp, cx, 40, 14, 19, { flat: 4 });
      if (wolf) {
        fur(g, p, rp, c.v);
        // the pelt's ears
        for (const s of [-1, 1]) shape(g, poly([[cx + s * 10, 18], [cx + s * 17, 8], [cx + s * 18, 20]]), grad(g, rp, cx + s * 10, 8, cx + s * 18, 20));
      } else if (!rp.metal) {
        // seams
        g.save();
        g.clip(p);
        g.strokeStyle = 'rgba(22,13,8,0.45)';
        g.lineWidth = 0.7;
        g.setLineDash([1.4, 1.2]);
        for (const dx of [-9, 0, 9]) {
          g.beginPath();
          g.moveTo(cx + dx, 44);
          g.quadraticCurveTo(cx + dx * 0.6, 24, cx, 15);
          g.stroke();
        }
        g.restore();
      } else {
        // a bronze skullcap: a central ridge and a small knob
        stud(g, c.trim, cx, 13.5, 2);
      }
      // the brow band
      const bb = rrect(cx - 19.5, 39, 39, 5.5, 1.5);
      shape(g, bb, grad(g, rp.metal ? c.trim : RAMPS.darkwood, 0, 39, 0, 45));
      if (tier >= 2 || r >= 3 || rp.metal) for (const dx of [-13, -6.5, 0, 6.5, 13]) stud(g, c.trim, cx + dx, 41.8, 1.1);
      c.glints = [[cx - 8, 20]];
      break;
    }
    case 'hood': {
      const fr = cloth ?? RAMPS.felt;
      const tiara = has(c, 'tiara');
      // a tall soft cap whose point falls to the right, with flaps over the ears
      const p = new Path2D();
      p.moveTo(cx - 18, 48);
      p.quadraticCurveTo(cx - 20, 24, cx - 8, 12);
      if (tiara) {
        // the tiara's point folds forward and down
        p.quadraticCurveTo(cx + 2, 2, cx + 12, 8);
        p.quadraticCurveTo(cx + 2, 10, cx - 2, 18);
        p.quadraticCurveTo(cx + 10, 14, cx + 16, 24);
      } else {
        p.quadraticCurveTo(cx + 4, 2, cx + 14, 6);
        p.quadraticCurveTo(cx + 26, 10, cx + 22, 16);
        p.quadraticCurveTo(cx + 20, 10, cx + 12, 10);
        p.quadraticCurveTo(cx + 20, 22, cx + 18, 48);
      }
      if (tiara) p.quadraticCurveTo(cx + 20, 34, cx + 18, 48);
      p.quadraticCurveTo(cx + 14, 58, cx + 10, 48);
      p.lineTo(cx + 10, 40);
      p.quadraticCurveTo(cx, 44, cx - 10, 40);
      p.lineTo(cx - 10, 48);
      p.quadraticCurveTo(cx - 14, 58, cx - 18, 48);
      p.closePath();
      shape(g, p, grad(g, fr, cx - 20, 4, cx + 24, 58));
      // folds
      g.save();
      g.clip(p);
      g.strokeStyle = fr.dk;
      g.globalAlpha = 0.35;
      g.lineWidth = 0.8;
      for (const [x0, y0, x1, y1] of [[cx - 10, 40, cx - 4, 16], [cx + 8, 40, cx + 12, 18], [cx, 42, cx + 4, 22]]) {
        g.beginPath();
        g.moveTo(x0, y0);
        g.quadraticCurveTo((x0 + x1) / 2 - 3, (y0 + y1) / 2, x1, y1);
        g.stroke();
      }
      if (tiara) {
        // a coloured band round the brow
        g.globalAlpha = 1;
        shape(g, rrect(cx - 20, 36, 40, 4, 1), grad(g, flatRamp(0x8a3a7a), 0, 36, 0, 40));
      }
      g.restore();
      if (r >= 3) stud(g, c.trim, tiara ? cx + 12 : cx + 23, tiara ? 8 : 14, 1.6);
      c.glints = [[cx + 22, 13]];
      break;
    }
    case 'pilos': {
      const rp = cloth ?? metal;
      const konos = has(c, 'konos');
      const p = bowl(c, rp, cx, 44, konos ? 10 : 8, konos ? 16 : 17, { point: true });
      if (cloth) {
        // felt: a soft seam and a turned-up brim
        g.save();
        g.clip(p);
        g.strokeStyle = rp.dk;
        g.globalAlpha = 0.35;
        g.lineWidth = 0.9;
        g.beginPath();
        g.moveTo(cx - 2, 44);
        g.quadraticCurveTo(cx - 4, 26, cx, 10);
        g.stroke();
        g.restore();
        shape(g, rrect(cx - 18, 40, 36, 6, 2.5), grad(g, rp, 0, 40, 0, 46));
      } else {
        // a raised ridge up the middle
        g.save();
        g.clip(p);
        g.strokeStyle = rp.dk;
        g.globalAlpha = 0.25;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(cx + 1, 44);
        g.lineTo(cx + 0.5, 10);
        g.stroke();
        g.restore();
        if (konos) {
          // the konos: a knob on top and a flared brim
          stud(g, c.trim, cx, 9.5, 2.4);
          const brim = new Path2D();
          brim.moveTo(cx - 22, 43);
          brim.quadraticCurveTo(cx, 39, cx + 22, 43);
          brim.quadraticCurveTo(cx, 48, cx - 22, 43);
          brim.closePath();
          shape(g, brim, grad(g, rp, cx - 20, 39, cx + 20, 48));
        } else {
          const rim = rrect(cx - 18, 42.5, 36, 4, 1.5);
          shape(g, rim, grad(g, c.trim, 0, 42, 0, 47));
        }
        if (tier >= 2 && !konos) crest(c, cx, 9, 10, 4);
      }
      c.glints = [[cx - 1, 9]];
      break;
    }
    case 'montefortino': {
      const coolus = has(c, 'coolus');
      const negau = has(c, 'negau');
      const horned = has(c, 'horn');
      const p = bowl(c, metal, cx, 40, negau ? 10 : 12, 18, { flat: 3 });
      if (negau) {
        // the Negau bell: a ridge round the crown
        g.save();
        g.clip(p);
        g.strokeStyle = metal.dk;
        g.globalAlpha = 0.5;
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(cx - 18, 24);
        g.quadraticCurveTo(cx, 19, cx + 18, 24);
        g.stroke();
        g.restore();
        spec(g, metal, [[cx - 14, 22.5], [cx, 19.6]], 1, 0.6);
      }
      if (horned) {
        for (const s of [-1, 1]) {
          const h = new Path2D();
          h.moveTo(cx + s * 11, 18);
          h.quadraticCurveTo(cx + s * 24, 14, cx + s * 24, 2);
          h.quadraticCurveTo(cx + s * 19, 12, cx + s * 14, 22);
          h.closePath();
          shape(g, h, grad(g, RAMPS.horn, cx + s * 11, 2, cx + s * 24, 22));
        }
        stud(g, c.trim, cx, 11.5, 2.4);
      } else if (!coolus) {
        // the knob and a plume from it
        const plume = crestRamp(c);
        const pl = new Path2D();
        pl.moveTo(cx - 1.5, 11);
        pl.quadraticCurveTo(cx - 8, 2, cx - 11, 5);
        pl.quadraticCurveTo(cx - 6, 5, cx + 1.5, 11);
        pl.closePath();
        shape(g, pl, grad(g, plume, cx - 11, 2, cx, 11));
        stud(g, c.trim, cx, 11.5, 2.4);
      } else stud(g, c.trim, cx, 12.5, 1.6);
      cheekGuards(c, metal, cx, 43, 18, 12);
      // neck guard: wide on the Coolus
      const ng = coolus ? rrect(cx - 19, 42, 38, 4, 1.5) : rrect(cx - 15, 42, 30, 3.5, 1.5);
      shape(g, ng, grad(g, metal, 0, 42, 0, 46));
      if (r >= 3) stud(g, c.trim, cx, 44, 1.2);
      c.glints = [[cx - 7, 18]];
      break;
    }
    case 'celtic': {
      bowl(c, metal, cx, 40, 12, 18, { flat: 3 });
      const bandR = r >= 3 ? c.trim : RAMPS.iron;
      shape(g, rrect(cx - 19, 36, 38, 4, 1.5), grad(g, bandR, 0, 36, 0, 40));
      shape(g, rrect(cx - 15, 42, 30, 4, 1.5), grad(g, metal, 0, 42, 0, 46));
      stud(g, bandR, cx, 11.5, 2);
      if (r >= 2) for (const s of [-1, 1]) {
        const h = poly([[cx + s * 14, 22], [cx + s * 26, 8], [cx + s * 20, 24]]);
        shape(g, h, grad(g, RAMPS.horn, cx + s * 14, 8, cx + s * 26, 24));
      }
      c.glints = [[cx - 7, 18]];
      break;
    }
    case 'thracian': {
      // Phrygian cap: a tall bowl whose peak curls forward (left)
      const p = new Path2D();
      p.moveTo(cx - 17, 44);
      p.quadraticCurveTo(cx - 20, 24, cx - 8, 13);
      p.quadraticCurveTo(cx - 2, 8, cx - 10, 4);
      p.quadraticCurveTo(cx - 24, -1, cx - 20, 11);
      p.quadraticCurveTo(cx - 16, 4, cx - 6, 6);
      p.quadraticCurveTo(cx + 10, 7, cx + 15, 22);
      p.quadraticCurveTo(cx + 18, 30, cx + 17, 44);
      p.closePath();
      shape(g, p, dome(g, metal, cx, 28, 24));
      g.save();
      g.clip(p);
      g.fillStyle = metal.spec;
      g.globalAlpha = 0.45;
      g.fill(ellipse(cx - 6, 22, 5, 8, -0.4));
      g.restore();
      // the crest ridge along the top (the Phrygian helm has a plain ridge)
      const cr = has(c, 'phrygian') ? c.trim : crestRamp(c);
      const ridge = new Path2D();
      ridge.moveTo(cx - 5, 7);
      ridge.quadraticCurveTo(cx + 10, 6, cx + 15, 22);
      ridge.quadraticCurveTo(cx + 9, 11, cx - 4, 10.5);
      ridge.closePath();
      shape(g, ridge, grad(g, cr, cx, 6, cx + 15, 22));
      // cheek pieces: the Phrygian's are shaped like a beard
      if (has(c, 'phrygian')) {
        const bd = new Path2D();
        bd.moveTo(cx - 15, 43);
        bd.quadraticCurveTo(cx - 14, 54, cx - 3, 56);
        bd.lineTo(cx - 3, 44);
        bd.closePath();
        bd.moveTo(cx + 15, 43);
        bd.quadraticCurveTo(cx + 14, 54, cx + 3, 56);
        bd.lineTo(cx + 3, 44);
        bd.closePath();
        shape(g, bd, grad(g, metal, cx - 15, 43, cx + 15, 56));
      } else cheekGuards(c, metal, cx, 44, 17, 11);
      shape(g, rrect(cx - 14, 43, 28, 3.5, 1.5), grad(g, metal, 0, 43, 0, 47));
      if (tier >= 3 || r >= 3) stud(g, c.trim, cx - 14, 6, 1.6);
      c.glints = [[cx - 14, 5]];
      break;
    }
    case 'boeotian': {
      bowl(c, metal, cx, 36, 10, 16);
      // the wide folded brim, dipping at the sides
      const brim = new Path2D();
      brim.moveTo(cx - 28, 36);
      brim.quadraticCurveTo(cx - 20, 32, cx, 33);
      brim.quadraticCurveTo(cx + 20, 32, cx + 28, 36);
      brim.quadraticCurveTo(cx + 22, 46, cx + 8, 42);
      brim.quadraticCurveTo(cx, 41, cx - 8, 42);
      brim.quadraticCurveTo(cx - 22, 46, cx - 28, 36);
      brim.closePath();
      shape(g, brim, grad(g, metal, cx - 20, 30, cx + 20, 46));
      spec(g, metal, [[cx - 24, 35.5], [cx - 8, 33.5], [cx + 6, 33.6]], 1, 0.7);
      if (r >= 3) {
        g.strokeStyle = c.trim.hi;
        g.lineWidth = 0.9;
        g.beginPath();
        g.moveTo(cx - 26, 37);
        g.quadraticCurveTo(cx, 34.5, cx + 26, 37);
        g.stroke();
      }
      if (tier >= 3) crest(c, cx, 10, 9, 4);
      c.glints = [[cx - 7, 18]];
      break;
    }
    case 'chalcidian':
    case 'attic':
    case 'corinthian':
    default: {
      const full = art === 'corinthian';
      const attic = art === 'attic';
      const illyrian = has(c, 'illyrian');
      const apulo = has(c, 'apulo');
      const top = 14, by = full ? 34 : 38;
      const p = bowl(c, metal, cx, by, top, 17, { flat: full ? 20 : 0 });
      if (full) {
        // the face: eye slots and the nasal between the cheek plates
        g.save();
        g.clip(p);
        const faceDk = 'rgba(14,8,5,0.92)';
        g.fillStyle = faceDk;
        const ey = apulo ? 33 : 36;
        for (const s of [-1, 1]) {
          const e = new Path2D();
          e.moveTo(cx + s * 3.5, ey);
          e.quadraticCurveTo(cx + s * 9, ey - 3, cx + s * 13, ey + 0.5);
          e.quadraticCurveTo(cx + s * 9, ey + 3.5, cx + s * 3.5, ey + 2.5);
          e.closePath();
          g.fill(e);
        }
        // the gap between the cheek pieces (closed on the Apulo-Corinthian, worn on the crown)
        if (!apulo) {
          const gap = new Path2D();
          gap.moveTo(cx - 1.6, 40);
          gap.lineTo(cx + 1.6, 40);
          gap.lineTo(cx + 2.6, 54);
          gap.lineTo(cx - 2.6, 54);
          gap.closePath();
          g.fill(gap);
        }
        g.restore();
        // nasal highlight, engraved brows on the Apulo-Corinthian
        spec(g, metal, [[cx - 0.4, 33], [cx - 0.4, 40]], 1.2, 0.5);
        if (apulo) {
          g.strokeStyle = metal.dk;
          g.lineWidth = 0.9;
          g.globalAlpha = 0.7;
          g.beginPath();
          g.moveTo(cx - 14, 31);
          g.quadraticCurveTo(cx - 8, 27, cx - 2, 30);
          g.moveTo(cx + 14, 31);
          g.quadraticCurveTo(cx + 8, 27, cx + 2, 30);
          g.stroke();
          g.globalAlpha = 1;
        }
        // cheek plate lower edges
        g.strokeStyle = 'rgba(22,13,8,0.5)';
        g.lineWidth = 0.7;
        g.beginPath();
        g.moveTo(cx - 17, 46);
        g.quadraticCurveTo(cx - 8, 44, cx - 2.6, 48);
        g.moveTo(cx + 17, 46);
        g.quadraticCurveTo(cx + 8, 44, cx + 2.6, 48);
        g.stroke();
      } else {
        // open face: a brow ridge, cheek pieces hanging either side, a short nasal on the Chalcidian
        cheekGuards(c, metal, cx, by + 1, 17, attic ? 12 : 13, attic ? 10 : 9);
        g.strokeStyle = metal.dk;
        g.globalAlpha = 0.5;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(cx - 15, by - 1);
        g.quadraticCurveTo(cx, by - 5, cx + 15, by - 1);
        g.stroke();
        g.globalAlpha = 1;
        if (!attic && !illyrian) shape(g, rrect(cx - 1.4, by - 1, 2.8, 8, 1.2), grad(g, metal, cx - 2, 0, cx + 2, 0));
        if (attic) {
          // a decorated frontlet
          g.strokeStyle = c.trim.hi;
          g.lineWidth = 0.8;
          g.beginPath();
          g.moveTo(cx - 12, by - 2.5);
          g.quadraticCurveTo(cx, by - 6.5, cx + 12, by - 2.5);
          g.stroke();
        }
        if (!illyrian && !attic) {
          // the Chalcidian's ear cut-outs
          g.fillStyle = 'rgba(14,8,5,0.6)';
          for (const s of [-1, 1]) g.fill(ellipse(cx + s * 16.5, by - 2, 1.6, 3.2));
        }
      }
      // crest: Corinthian tall, Attic a nodding plume, Chalcidian short, Illyrian two parallel ridges
      if (illyrian) {
        for (const dx of [-4, 4]) shape(g, rrect(cx + dx - 1.2, 11, 2.4, 10, 1.2), grad(g, c.trim, cx + dx - 1, 0, cx + dx + 1, 0));
      } else crest(c, cx, top - 1, full ? 14 : attic ? 15 : has(c, 'crested', 'plumed') ? 14 : 10, full ? 6 : attic ? 5 : has(c, 'crested', 'plumed') ? 7 : 5, attic ? -3 : 0);
      if (r >= 4) {
        // legendary: two white wings from the temples
        for (const s of [-1, 1]) {
          const w = new Path2D();
          w.moveTo(cx + s * 14, 22);
          w.quadraticCurveTo(cx + s * 26, 14, cx + s * 25, 4);
          w.quadraticCurveTo(cx + s * 20, 12, cx + s * 15, 17);
          w.closePath();
          shape(g, w, grad(g, RAMPS.linen, cx + s * 14, 4, cx + s * 26, 22));
        }
      }
      c.glints = [[cx - 7, 20]];
      break;
    }
  }
}

// ------------------------------------------------------------------ armour

/** Torso silhouette (front view): shoulders at `sy`, waist at `wy`, hem at `hy`. */
function torso(cx: number, sy: number, wy: number, hy: number, hw: number, ww: number, opts: { neck?: number; flare?: number } = {}): Path2D {
  const p = new Path2D();
  const neck = opts.neck ?? 7;
  const fl = opts.flare ?? ww;
  p.moveTo(cx - neck, sy + 1.5);
  p.quadraticCurveTo(cx - hw * 0.7, sy - 1, cx - hw, sy + 4);
  p.quadraticCurveTo(cx - hw - 0.5, sy + 10, cx - hw + 2, sy + 14);
  p.quadraticCurveTo(cx - ww - 1, wy - 6, cx - ww, wy);
  p.quadraticCurveTo(cx - ww - 0.5, hy - 4, cx - fl, hy);
  p.lineTo(cx + fl, hy);
  p.quadraticCurveTo(cx + ww + 0.5, hy - 4, cx + ww, wy);
  p.quadraticCurveTo(cx + ww + 1, wy - 6, cx + hw - 2, sy + 14);
  p.quadraticCurveTo(cx + hw + 0.5, sy + 10, cx + hw, sy + 4);
  p.quadraticCurveTo(cx + hw * 0.7, sy - 1, cx + neck, sy + 1.5);
  p.quadraticCurveTo(cx, sy + 7, cx - neck, sy + 1.5);
  p.closePath();
  return p;
}

function pteruges(c: Ctx, rp: Ramp, cx: number, y: number, w: number, h: number, n: number): void {
  const { g } = c;
  const sw = (w * 2) / n;
  for (let i = 0; i < n; i++) {
    const x = cx - w + i * sw;
    const p = rrect(x + 0.4, y - 1, sw - 0.8, h, 1.2);
    shape(g, p, grad(g, rp, x, y, x + sw, y + h));
  }
}

function armorIcon(c: Ctx): void {
  const { g, r, tier } = c;
  const art = c.def.art;
  const cx = 32;
  const metal = c.mat && isMetal(c.mat) ? c.main : finish(RAMPS.bronze, r);
  switch (art) {
    case 'leather': {
      const felt = c.mat === 'felt';
      const quilt = c.mat === 'linen' || has(c, 'quilt');
      const lr = c.mat && !isMetal(c.mat) ? RAMPS[c.mat] : RAMPS.leather;
      const p = torso(cx, 10, 40, felt ? 58 : 56, 22, 16, { neck: 6, flare: felt ? 19 : 16 });
      shape(g, p, grad(g, lr, cx - 22, 8, cx + 22, 56));
      g.save();
      g.clip(p);
      g.strokeStyle = 'rgba(22,13,8,0.5)';
      g.lineWidth = 0.8;
      if (quilt) {
        // quilted diamonds
        g.globalAlpha = 0.5;
        for (let k = -8; k <= 8; k++) {
          g.beginPath();
          g.moveTo(cx - 24, 10 + k * 6);
          g.lineTo(cx + 24, 34 + k * 6);
          g.moveTo(cx + 24, 10 + k * 6);
          g.lineTo(cx - 24, 34 + k * 6);
          g.stroke();
        }
        g.globalAlpha = 1;
      } else if (felt) {
        // the kaftan: a lapel crossing left over right, trimmed
        g.setLineDash([]);
        g.lineWidth = 1.6;
        g.strokeStyle = lr.dk;
        g.beginPath();
        g.moveTo(cx - 6, 11);
        g.quadraticCurveTo(cx + 2, 24, cx + 8, 56);
        g.stroke();
        g.lineWidth = 0.7;
        g.strokeStyle = flatRamp(0xa83224).base;
        g.beginPath();
        g.moveTo(cx - 5, 11);
        g.quadraticCurveTo(cx + 3, 24, cx + 9, 56);
        g.stroke();
      } else if (has(c, 'hide', 'fur', 'pelt')) {
        // a hide: the hair side turned out along the neck and hem
        g.lineCap = 'round';
        g.lineWidth = 0.8;
        g.strokeStyle = lr.hi;
        g.globalAlpha = 0.6;
        for (let x = cx - 20; x <= cx + 20; x += 2.2) {
          g.beginPath();
          g.moveTo(x, 12 + Math.abs(x - cx) * 0.15);
          g.lineTo(x + 0.8, 17 + Math.abs(x - cx) * 0.15);
          g.moveTo(x, 50);
          g.lineTo(x - 0.8, 55);
          g.stroke();
        }
        g.globalAlpha = 1;
      } else {
        // the V neck and stitched seams
        g.setLineDash([1.5, 1.3]);
        g.beginPath();
        g.moveTo(cx - 6, 11);
        g.lineTo(cx, 22);
        g.lineTo(cx + 6, 11);
        g.moveTo(cx - 20, 24);
        g.lineTo(cx - 14, 54);
        g.moveTo(cx + 20, 24);
        g.lineTo(cx + 14, 54);
        g.stroke();
        g.setLineDash([]);
      }
      // the belt
      const belt = rrect(cx - 18, 40, 36, 5, 1.2);
      shape(g, belt, grad(g, felt ? RAMPS.leather : RAMPS.darkwood, 0, 40, 0, 45));
      g.restore();
      stud(g, c.trim, cx, 42.5, 1.8);
      // the spolas' pteruges
      if (has(c, 'spolas')) pteruges(c, lr, cx, 50, 16, 8, 6);
      if (tier >= 2 || r >= 3 || has(c, 'spolas')) for (const [dx, dy] of [[-12, 28], [12, 28], [-10, 36], [10, 36], [0, 30]]) stud(g, c.trim, cx + dx, dy, 1.1);
      c.glints = [[cx - 12, 16]];
      break;
    }
    case 'linothorax': {
      const plated = c.mat && isMetal(c.mat);
      const lr = c.mat && !isMetal(c.mat) ? RAMPS[c.mat] : RAMPS.linen;
      const p = torso(cx, 10, 40, 44, 22, 16, { neck: 7 });
      shape(g, p, grad(g, lr, cx - 22, 8, cx + 22, 48));
      g.save();
      g.clip(p);
      if (has(c, 'scaled')) scales(g, p, metal, cx, 24, 40, 2.4, 2.8);
      else if (plated) {
        // bronze plates sewn over the chest
        for (const [x, y, w, h] of [[cx - 16, 22, 14, 10], [cx + 2, 22, 14, 10], [cx - 16, 33, 32, 6]]) shape(g, rrect(x, y, w, h, 1.5), grad(g, metal, x, y, x + w, y + h));
      } else if (has(c, 'painted')) {
        // a painted meander band and coloured edging
        const red = flatRamp(0x9e3426);
        shape(g, rrect(cx - 22, 28, 44, 5, 0), grad(g, red, 0, 28, 0, 33), false);
        g.strokeStyle = lr.hi;
        g.lineWidth = 0.8;
        for (let x = cx - 22; x < cx + 22; x += 5) {
          g.beginPath();
          g.moveTo(x, 29);
          g.lineTo(x + 3, 29);
          g.lineTo(x + 3, 32);
          g.lineTo(x + 1.5, 32);
          g.lineTo(x + 1.5, 30.5);
          g.stroke();
        }
        g.strokeStyle = flatRamp(0x46607a).base;
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(cx - 22, 22);
        g.lineTo(cx + 22, 22);
        g.stroke();
      } else {
        // the layered look: faint horizontal quilting
        g.strokeStyle = lr.lo;
        g.globalAlpha = 0.35;
        g.lineWidth = 0.6;
        for (let y = 26; y < 42; y += 3.2) {
          g.beginPath();
          g.moveTo(cx - 22, y);
          g.lineTo(cx + 22, y);
          g.stroke();
        }
      }
      g.restore();
      // shoulder flaps (epomides) tied down to the chest
      for (const s of [-1, 1]) {
        const f = new Path2D();
        f.moveTo(cx + s * 20, 10);
        f.quadraticCurveTo(cx + s * 12, 6, cx + s * 6, 12);
        f.lineTo(cx + s * 6, 24);
        f.quadraticCurveTo(cx + s * 10, 26, cx + s * 14, 24);
        f.lineTo(cx + s * 20, 14);
        f.closePath();
        shape(g, f, grad(g, plated ? metal : lr, cx + s * 6, 6, cx + s * 20, 26));
        stud(g, c.trim, cx + s * 10, 23, 1.2);
      }
      // the belt and the pteruges
      shape(g, rrect(cx - 17, 38, 34, 4.5, 1.2), grad(g, tier >= 2 ? c.trim : RAMPS.leather, 0, 38, 0, 43));
      pteruges(c, lr, cx, 43, 17, 13, 7);
      if (r >= 3 && !has(c, 'painted')) {
        g.strokeStyle = c.trim.base;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(cx - 14, 30);
        g.lineTo(cx + 14, 30);
        g.stroke();
      }
      c.glints = [[cx - 12, 16]];
      break;
    }
    case 'scale': {
      const long = has(c, 'persian', 'coat');
      const p = torso(cx, 10, 40, long ? 58 : 52, 22, 16, { neck: 7, flare: long ? 19 : 16 });
      const back = c.mat === 'horn' ? RAMPS.leather : RAMPS.linen;
      const sc = c.mat === 'horn' ? RAMPS.horn : metal;
      shape(g, p, grad(g, back, cx - 22, 8, cx + 22, 52));
      scales(g, p, sc, cx, 12, long ? 58 : 52);
      outline(g, p);
      // leather edging at the neck and shoulders
      g.strokeStyle = RAMPS.leather.base;
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(cx - 7, 11.5);
      g.quadraticCurveTo(cx, 17, cx + 7, 11.5);
      g.stroke();
      if (long) {
        // sleeves
        for (const s of [-1, 1]) {
          const sl = rrect(cx + s * 22 - 4, 14, 8, 12, 2);
          shape(g, sl, grad(g, back, cx + s * 22 - 4, 14, cx + s * 22 + 4, 26));
          scales(g, sl, sc, cx, 14, 26, 2, 2.6);
        }
      }
      shape(g, rrect(cx - 17, 39, 34, 4, 1.2), grad(g, RAMPS.leather, 0, 39, 0, 43));
      c.glints = [[cx - 12, 16]];
      break;
    }
    case 'mail': {
      const ir = c.mat && isMetal(c.mat) ? c.main : finish(RAMPS.iron, r);
      const p = torso(cx, 9, 40, 54, 24, 18, { neck: 7, flare: 19 });
      shape(g, p, grad(g, ir, cx - 24, 6, cx + 24, 56));
      g.save();
      g.clip(p);
      // the rings: a fine lattice of little arcs
      g.lineWidth = 0.55;
      for (let row = 0; row < 20; row++) {
        const y = 10 + row * 2.3;
        const off = row % 2 ? 1.3 : 0;
        for (let x = cx - 26 + off; x <= cx + 26; x += 2.6) {
          g.strokeStyle = row % 2 ? 'rgba(255,255,255,0.28)' : 'rgba(10,6,4,0.4)';
          g.beginPath();
          g.arc(x, y, 1, Math.PI * 0.9, Math.PI * 2.1);
          g.stroke();
        }
      }
      // a sheen across the chest
      const gr = g.createLinearGradient(cx - 24, 6, cx + 24, 56);
      gr.addColorStop(0, 'rgba(255,255,255,0.12)');
      gr.addColorStop(0.4, 'rgba(255,255,255,0)');
      gr.addColorStop(1, 'rgba(0,0,0,0.25)');
      g.fillStyle = gr;
      g.fill(p);
      g.restore();
      outline(g, p);
      // shoulder doubling (the Celtic cape; the Roman hamata's is squarer, hooked with a bronze fastener)
      const roman = has(c, 'hamata', 'lorica');
      for (const s of [-1, 1]) {
        const d = new Path2D();
        d.moveTo(cx + s * 24, 13);
        d.quadraticCurveTo(cx + s * 14, roman ? 10 : 8, cx + s * 7, 11);
        d.lineTo(cx + s * 7, roman ? 22 : 20);
        d.quadraticCurveTo(cx + s * 16, roman ? 23 : 22, cx + s * 23, 19);
        d.closePath();
        shape(g, d, grad(g, ir, cx + s * 7, 8, cx + s * 24, 22));
      }
      if (roman) shape(g, rrect(cx - 5, 17, 10, 3, 1.2), grad(g, c.trim, 0, 17, 0, 20));
      if (has(c, 'noble', 'chief', 'king')) {
        // a chieftain's mail: bronze-edged hem and collar
        shape(g, rrect(cx - 19, 51, 38, 3.5, 1), grad(g, c.trim, 0, 51, 0, 55));
        shape(g, rrect(cx - 8, 10, 16, 3, 1.2), grad(g, c.trim, 0, 10, 0, 13));
      }
      shape(g, rrect(cx - 19, 39, 38, 4.5, 1.2), grad(g, RAMPS.leather, 0, 39, 0, 44));
      stud(g, c.trim, cx, 41.2, 1.8);
      c.glints = [[cx - 12, 16]];
      break;
    }
    case 'cuirass':
    default: {
      const discs = has(c, 'disc');
      const bell = has(c, 'bell');
      if (discs) {
        // three bronze discs on a leather harness
        const p = torso(cx, 10, 40, 50, 21, 16, { neck: 7, flare: 17 });
        shape(g, p, grad(g, RAMPS.leather, cx - 22, 8, cx + 22, 52));
        g.save();
        g.clip(p);
        g.strokeStyle = RAMPS.darkwood.base;
        g.lineWidth = 2.4;
        g.beginPath();
        g.moveTo(cx - 14, 10);
        g.lineTo(cx - 10, 40);
        g.moveTo(cx + 14, 10);
        g.lineTo(cx + 10, 40);
        g.moveTo(cx - 22, 30);
        g.lineTo(cx + 22, 30);
        g.stroke();
        g.restore();
        for (const [x, y, rad] of [[cx - 9, 23, 7], [cx + 9, 23, 7], [cx, 38, 7.5]] as [number, number, number][]) {
          const d = ellipse(x, y, rad, rad);
          shape(g, d, dome(g, metal, x, y, rad));
          g.strokeStyle = 'rgba(22,13,8,0.4)';
          g.lineWidth = 0.6;
          g.stroke(ellipse(x, y, rad * 0.6, rad * 0.6));
        }
        shape(g, rrect(cx - 17, 44, 34, 4, 1.2), grad(g, RAMPS.leather, 0, 44, 0, 48));
        c.glints = [[cx - 12, 19]];
        break;
      }
      const p = bell ? torso(cx, 9, 36, 48, 22, 18, { neck: 7, flare: 23 }) : torso(cx, 9, 40, 50, 23, 16, { neck: 7, flare: 18 });
      shape(g, p, dome(g, metal, cx - 2, 26, 30));
      g.save();
      g.clip(p);
      // the sculpted muscles: pectorals, the abdomen, highlights on the lit side (the bell cuirass is plainer)
      g.strokeStyle = metal.dk;
      g.globalAlpha = 0.55;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(cx - 18, 24);
      g.quadraticCurveTo(cx - 8, 30, cx - 1, 25);
      g.moveTo(cx + 18, 24);
      g.quadraticCurveTo(cx + 8, 30, cx + 1, 25);
      if (!bell) {
        g.moveTo(cx, 26);
        g.lineTo(cx, 44);
        g.moveTo(cx - 8, 33);
        g.quadraticCurveTo(cx, 36, cx + 8, 33);
        g.moveTo(cx - 7, 39);
        g.quadraticCurveTo(cx, 42, cx + 7, 39);
      }
      g.moveTo(cx - 16, 46);
      g.quadraticCurveTo(cx, 42, cx + 16, 46);
      g.stroke();
      if (bell) {
        // the flared bell's rolled rim
        g.beginPath();
        g.moveTo(cx - 24, 44);
        g.quadraticCurveTo(cx, 40, cx + 24, 44);
        g.stroke();
      }
      g.globalAlpha = 0.7;
      g.strokeStyle = metal.spec;
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(cx - 17, 22);
      g.quadraticCurveTo(cx - 9, 27, cx - 2, 23);
      if (!bell) {
        g.moveTo(cx - 7, 31.5);
        g.quadraticCurveTo(cx - 1, 34, cx + 6, 31.5);
      }
      g.stroke();
      g.restore();
      // shoulder straps
      for (const s of [-1, 1]) shape(g, rrect(cx + s * 12 - 3, 8, 6, 8, 1.5), grad(g, c.trim, cx + s * 12 - 3, 8, cx + s * 12 + 3, 16));
      if (!bell) pteruges(c, RAMPS.leather, cx, 50, 17, 8, 7);
      c.glints = [[cx - 12, 18]];
      break;
    }
  }
}

// ------------------------------------------------------------------ trinkets

/** A cord loop over the top of a pendant hanging at (cx, top). */
function cord(c: Ctx, cx: number, top: number, rp = RAMPS.leather, spread = 14): void {
  const { g } = c;
  g.save();
  g.lineCap = 'round';
  for (const [w, col, a] of [[3.4, OUTLINE, 1], [1.9, rp.base, 1], [0.7, rp.hi, 0.6]] as [number, string, number][]) {
    g.lineWidth = w;
    g.strokeStyle = col;
    g.globalAlpha = a;
    g.beginPath();
    g.moveTo(cx - spread, 2);
    g.quadraticCurveTo(cx - spread * 0.7, top * 0.5, cx - 2, top);
    g.moveTo(cx + spread, 2);
    g.quadraticCurveTo(cx + spread * 0.7, top * 0.5, cx + 2, top);
    g.stroke();
  }
  g.restore();
}

function trinketIcon(c: Ctx): void {
  const { g, r, id } = c;
  const cx = 32;
  const metalR = c.mat && isMetal(c.mat) ? c.main : finish(RAMPS.bronze, r);
  switch (id) {
    case 'owl_amulet': {
      const br = metalR;
      const disc = medallion(c, br, cx, 36, 16, RAMPS.leather);
      // the owl: two big eyes, a beak, ear tufts in relief
      g.save();
      g.clip(disc);
      g.strokeStyle = 'rgba(22,13,8,0.65)';
      g.lineWidth = 1;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(cx + s * 6, 34, 4.6, 0, 6.283);
        g.stroke();
        g.fillStyle = br.hi;
        g.beginPath();
        g.arc(cx + s * 6, 34, 3, 0, 6.283);
        g.fill();
        g.fillStyle = '#1e130c';
        g.beginPath();
        g.arc(cx + s * 6, 34, 1.5, 0, 6.283);
        g.fill();
        g.beginPath();
        g.moveTo(cx + s * 10, 27);
        g.lineTo(cx + s * 13, 20);
        g.lineTo(cx + s * 6, 26);
        g.stroke();
      }
      g.fillStyle = br.dk;
      g.fill(poly([[cx - 2, 38], [cx + 2, 38], [cx, 43]]));
      g.strokeStyle = br.dk;
      g.globalAlpha = 0.4;
      for (let y = 44; y < 52; y += 3) {
        g.beginPath();
        g.moveTo(cx - 8, y);
        g.quadraticCurveTo(cx - 4, y + 2, cx, y);
        g.quadraticCurveTo(cx + 4, y + 2, cx + 8, y);
        g.stroke();
      }
      g.restore();
      c.glints = [[cx - 9, 26]];
      return;
    }
    case 'herakles_knot': {
      cord(c, cx, 20, RAMPS.cord);
      const gr = c.mat && isMetal(c.mat) ? c.main : finish(RAMPS.gold, r);
      const loops: Path2D[] = [];
      for (const s of [-1, 1]) {
        const p = new Path2D();
        p.ellipse(cx + s * 7, 36, 12, 8.5, s * 0.45, 0, 6.283);
        p.ellipse(cx + s * 7, 36, 7.5, 4.3, s * 0.45, 0, 6.283);
        loops.push(p);
      }
      for (const p of loops) {
        g.fillStyle = grad(g, gr, cx - 18, 24, cx + 18, 48);
        g.fill(p, 'evenodd');
        outline(g, p, 1.6);
      }
      const gem = ellipse(cx, 36, 3.4, 3.4);
      shape(g, gem, dome(g, flatRamp(0xa83224), cx, 36, 3.4));
      g.fillStyle = 'rgba(255,220,220,0.8)';
      g.fill(ellipse(cx - 1.2, 34.8, 1, 0.7, -0.6));
      c.glints = [[cx - 12, 30]];
      return;
    }
    case 'scarab': {
      cord(c, cx, 16, RAMPS.cord);
      const fr = c.mat && c.mat !== 'faience' ? RAMPS[c.mat] : RAMPS.faience;
      g.save();
      g.lineCap = 'round';
      g.lineWidth = 2.2;
      g.strokeStyle = fr.dk;
      for (const [x0, y0, x1, y1] of [[22, 30, 14, 26], [22, 38, 13, 40], [23, 46, 16, 52], [42, 30, 50, 26], [42, 38, 51, 40], [41, 46, 48, 52]]) {
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
      }
      g.restore();
      const body = ellipse(cx, 40, 11, 13);
      shape(g, body, dome(g, fr, cx, 40, 13));
      const head = ellipse(cx, 24, 7, 5);
      shape(g, head, dome(g, fr, cx, 24, 6));
      g.save();
      g.clip(body);
      g.strokeStyle = fr.dk;
      g.lineWidth = 1;
      g.globalAlpha = 0.7;
      g.beginPath();
      g.moveTo(cx, 30);
      g.lineTo(cx, 53);
      g.moveTo(cx - 11, 33);
      g.quadraticCurveTo(cx, 36, cx + 11, 33);
      g.stroke();
      g.restore();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fill(ellipse(cx - 4, 34, 3, 2, -0.6));
      c.glints = [[cx - 5, 33]];
      return;
    }
    case 'laurel':
      return wreath(c, ramp(0xa8c47a, 0x6f8c4c, 0x45602e, 0x273a18), ramp(0x90ac66, 0x5c7840, 0x3a5026, 0x1f2e12), RAMPS.olive, finish(RAMPS.gold, r));
    case 'tanit_eye':
      return eyeBead(c, 0x2e5a8a, 0x3a78b8);
    case 'boar_tusk': {
      cord(c, cx, 14);
      const bn = c.mat && c.mat !== 'bone' ? RAMPS[c.mat] : RAMPS.bone;
      const p = new Path2D();
      p.moveTo(cx - 4, 18);
      p.quadraticCurveTo(cx - 10, 34, cx - 2, 46);
      p.quadraticCurveTo(cx + 4, 54, cx + 14, 54);
      p.quadraticCurveTo(cx + 6, 50, cx + 4, 42);
      p.quadraticCurveTo(cx + 2, 30, cx + 5, 18);
      p.closePath();
      shape(g, p, grad(g, bn, cx - 10, 18, cx + 12, 54));
      spec(g, bn, [[cx - 2, 20], [cx - 4.5, 34], [cx + 1, 46]], 1.2, 0.6);
      const cap = rrect(cx - 6, 14, 12, 6, 2);
      shape(g, cap, grad(g, finish(RAMPS.bronze, r), cx - 6, 14, cx + 6, 20));
      c.glints = [[cx - 3, 22]];
      return;
    }
  }
  // ---- keyword families (new trinkets get a fitting shape from their id and material)
  if (has(c, 'ring')) {
    // a finger ring seen at a slant: a torus, a serpent coil or a signet bezel
    const rp = c.mat && !isMetal(c.mat) ? RAMPS[c.mat] : metalR;
    const p = new Path2D();
    p.ellipse(cx, 36, 17, 13, 0, 0, 6.283);
    p.ellipse(cx, 37.5, 12, 8.5, 0, 0, 6.283);
    g.fillStyle = grad(g, rp, cx - 17, 23, cx + 17, 49);
    g.fill(p, 'evenodd');
    outline(g, p, 1.8);
    // the inside of the band, seen through the hole
    g.save();
    g.clip(ellipse(cx, 37.5, 12, 8.5));
    g.fillStyle = rp.dk;
    g.globalAlpha = 0.6;
    g.fill(ellipse(cx, 41, 12, 8));
    g.restore();
    spec(g, rp, [[cx - 12, 27], [cx - 2, 23.6]], 1.4, 0.8);
    if (has(c, 'serpent')) {
      // the snake's head rising over the bezel
      const hd = smooth([[cx - 6, 22], [cx + 2, 16], [cx + 9, 19], [cx + 6, 25], [cx - 2, 26]]);
      shape(g, hd, grad(g, rp, cx - 6, 16, cx + 9, 26));
      g.fillStyle = '#1e130c';
      g.fill(ellipse(cx + 3, 20, 1.1, 1.1));
      g.strokeStyle = 'rgba(22,13,8,0.5)';
      g.lineWidth = 0.6;
      for (let x = cx - 14; x < cx + 14; x += 3) {
        g.beginPath();
        g.moveTo(x, 24 + Math.abs(x - cx) * 0.25);
        g.lineTo(x + 1.5, 27 + Math.abs(x - cx) * 0.25);
        g.stroke();
      }
    } else if (has(c, 'signet')) {
      const bz = ellipse(cx, 24, 8, 5.5);
      shape(g, bz, dome(g, rp, cx, 24, 8));
      g.save();
      g.clip(bz);
      g.strokeStyle = 'rgba(22,13,8,0.7)';
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(cx - 4, 26.5);
      g.lineTo(cx, 21);
      g.lineTo(cx + 4, 26.5);
      g.moveTo(cx - 2, 24.5);
      g.lineTo(cx + 2, 24.5);
      g.stroke();
      g.restore();
    }
    c.glints = [[cx - 10, 26]];
    return;
  }
  if (has(c, 'torc')) {
    // a neck ring, open at the bottom, with ball terminals; twisted strands
    const rp = metalR;
    const p = new Path2D();
    p.arc(cx, 34, 22, Math.PI * 0.68, Math.PI * 2.32);
    g.lineCap = 'round';
    g.lineWidth = 8.4;
    g.strokeStyle = OUTLINE;
    g.stroke(p);
    g.lineWidth = 6;
    g.strokeStyle = grad(g, rp, cx - 22, 12, cx + 22, 56);
    g.stroke(p);
    // the twist
    g.save();
    g.strokeStyle = 'rgba(22,13,8,0.45)';
    g.lineWidth = 0.9;
    for (let a = Math.PI * 0.72; a < Math.PI * 2.3; a += 0.17) {
      const x = cx + Math.cos(a) * 22, y = 34 + Math.sin(a) * 22;
      const tx = -Math.sin(a), ty = Math.cos(a);
      g.beginPath();
      g.moveTo(x - tx * 1.5 + Math.cos(a) * 2.6, y - ty * 1.5 + Math.sin(a) * 2.6);
      g.lineTo(x + tx * 1.5 - Math.cos(a) * 2.6, y + ty * 1.5 - Math.sin(a) * 2.6);
      g.stroke();
    }
    g.restore();
    spec(g, rp, [[cx - 18, 22], [cx - 6, 13.5], [cx + 6, 13.5]], 1.4, 0.75);
    for (const a of [Math.PI * 0.68, Math.PI * 2.32]) stud(g, rp, cx + Math.cos(a) * 22, 34 + Math.sin(a) * 22, 4.4);
    c.glints = [[cx - 10, 16]];
    return;
  }
  if (has(c, 'tooth', 'teeth', 'fang')) {
    // a string of teeth on a cord
    const bn = RAMPS.bone;
    g.save();
    g.lineCap = 'round';
    g.lineWidth = 3.4;
    g.strokeStyle = OUTLINE;
    g.beginPath();
    g.moveTo(6, 14);
    g.quadraticCurveTo(cx, 40, 58, 14);
    g.stroke();
    g.lineWidth = 1.9;
    g.strokeStyle = RAMPS.leather.base;
    g.stroke();
    g.restore();
    for (let i = 0; i < 5; i++) {
      const t = 0.2 + i * 0.15;
      const x = 6 + (58 - 6) * t;
      const y = (1 - t) * (1 - t) * 14 + 2 * (1 - t) * t * 40 + t * t * 14;
      const h = 12 + (i === 2 ? 5 : i === 1 || i === 3 ? 2 : 0);
      const tooth = new Path2D();
      tooth.moveTo(x - 3, y + 1);
      tooth.quadraticCurveTo(x - 1, y + h * 0.6, x + 1.2, y + h);
      tooth.quadraticCurveTo(x + 3, y + h * 0.5, x + 3, y + 1);
      tooth.closePath();
      shape(g, tooth, grad(g, bn, x - 3, y, x + 3, y + h));
      stud(g, RAMPS.leather, x, y + 1, 1.4);
    }
    c.glints = [[cx - 2, 44]];
    return;
  }
  if (has(c, 'claw', 'tusk', 'horn')) {
    cord(c, cx, 14);
    const dark = ramp(0x8c7a68, 0x5a4a3c, 0x362a20, 0x1c1410);
    const p = new Path2D();
    p.moveTo(cx - 5, 18);
    p.quadraticCurveTo(cx - 8, 34, cx + 2, 46);
    p.quadraticCurveTo(cx + 8, 52, cx + 16, 54);
    p.quadraticCurveTo(cx + 8, 48, cx + 6, 40);
    p.quadraticCurveTo(cx + 3, 30, cx + 5, 18);
    p.closePath();
    shape(g, p, grad(g, has(c, 'claw') ? dark : RAMPS.bone, cx - 8, 18, cx + 12, 54));
    spec(g, RAMPS.bone, [[cx - 3, 20], [cx - 4, 32], [cx + 2, 44]], 1.1, 0.5);
    shape(g, rrect(cx - 6.5, 14, 13, 6, 2), grad(g, metalR, cx - 6, 14, cx + 6, 20));
    c.glints = [[cx - 3, 22]];
    return;
  }
  if (has(c, 'bead', 'eye')) {
    const col = [[0x2e5a8a, 0x3a78b8], [0x3f9e97, 0x5ad0c6], [0x8a3a2a, 0xc86a40]][c.v % 3];
    return eyeBead(c, col[0], col[1]);
  }
  if (has(c, 'tablet', 'curse', 'lead')) {
    // a lead tablet scratched with a curse, a nail through it
    const rp = finish(RAMPS.lead, r);
    g.save();
    g.translate(cx, 32);
    g.rotate(-0.12);
    const p = rrect(-18, -20, 36, 40, 2);
    shape(g, p, grad(g, rp, -18, -20, 18, 20));
    g.clip(p);
    g.strokeStyle = 'rgba(22,13,8,0.55)';
    g.lineWidth = 0.8;
    for (let y = -13; y <= 14; y += 4.5) {
      g.beginPath();
      g.moveTo(-14, y);
      for (let x = -14; x <= 14; x += 2) g.lineTo(x, y + ((c.v >> ((x + 14) / 2)) & 1 ? 1 : -0.5));
      g.stroke();
    }
    g.restore();
    stud(g, RAMPS.iron, cx, 14, 2.2);
    g.strokeStyle = RAMPS.iron.dk;
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(cx, 16);
    g.lineTo(cx + 1, 24);
    g.stroke();
    c.glints = [[cx - 12, 18]];
    return;
  }
  if (has(c, 'shield')) {
    // a tiny votive hoplon
    cord(c, cx, 20, RAMPS.cord);
    const R = 15;
    shape(g, ellipse(cx, 37, R, R), dome(g, metalR, cx, 37, R));
    shade(g, ellipse(cx, 37, R - 3, R - 3), 0.5);
    g.fillStyle = dome(g, metalR, cx, 37, R - 3, true);
    g.fill(ellipse(cx, 37, R - 3, R - 3));
    g.strokeStyle = 'rgba(22,13,8,0.6)';
    g.lineWidth = 0.8;
    g.stroke(ellipse(cx, 37, R - 3, R - 3));
    stud(g, metalR, cx, 37, 3);
    stud(g, metalR, cx, 21, 2.2);
    c.glints = [[cx - 8, 29]];
    return;
  }
  if (has(c, 'plaque', 'stag')) {
    // a gold plaque with a stag in relief
    const rp = metalR;
    const p = rrect(8, 16, 48, 32, 3);
    shape(g, p, grad(g, rp, 8, 16, 56, 48));
    g.save();
    g.clip(p);
    g.fillStyle = rp.dk;
    g.strokeStyle = rp.dk;
    g.lineCap = 'round';
    g.lineWidth = 1.6;
    // body, neck and head
    g.fill(ellipse(34, 36, 10, 5.5));
    g.beginPath();
    g.moveTo(42, 34);
    g.lineTo(47, 26);
    g.stroke();
    g.fill(ellipse(48, 25, 4, 2.4, 0.3));
    // legs and antlers
    g.lineWidth = 1.3;
    for (const x of [27, 31, 37, 41]) {
      g.beginPath();
      g.moveTo(x, 39);
      g.lineTo(x - 1, 45);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(47, 24);
    g.lineTo(42, 18);
    g.moveTo(45, 21);
    g.lineTo(40, 20);
    g.moveTo(46, 23);
    g.lineTo(38, 24);
    g.moveTo(48, 24);
    g.lineTo(50, 17);
    g.stroke();
    g.restore();
    for (const [x, y] of [[11, 19], [53, 19], [11, 45], [53, 45]]) stud(g, rp, x, y, 1.2);
    c.glints = [[16, 22]];
    return;
  }
  if (has(c, 'crown', 'pythian', 'wreath')) {
    const rp = metalR;
    return wreath(c, rp, { ...rp, base: rp.lo }, rp, finish(RAMPS.gold, r));
  }
  if (has(c, 'knuckle', 'dice', 'bones')) {
    // four astragali
    const bn = RAMPS.bone;
    for (const [x, y, a] of [[20, 24, 0.3], [40, 22, -0.5], [26, 42, -0.2], [44, 42, 0.6]] as [number, number, number][]) {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      const p = smooth([[-7, -4], [0, -5.5], [7, -4], [6, 4], [0, 5.5], [-6, 4]]);
      shape(g, p, dome(g, bn, 0, 0, 8));
      g.fillStyle = 'rgba(22,13,8,0.45)';
      g.fill(ellipse(-2.5, 0, 2.2, 1.4));
      g.fill(ellipse(3, 0.5, 1.6, 1.2));
      g.restore();
    }
    c.glints = [[16, 20]];
    return;
  }
  if (has(c, 'bulla')) {
    // a round gold locket: a lens-shaped capsule with a tube loop
    const rp = metalR;
    cord(c, cx, 18, RAMPS.cord);
    const cap = ellipse(cx, 38, 15, 14);
    shape(g, cap, dome(g, rp, cx, 38, 15));
    g.strokeStyle = 'rgba(22,13,8,0.45)';
    g.lineWidth = 0.9;
    g.stroke(ellipse(cx, 38, 11, 10));
    spec(g, rp, [[cx - 9, 31], [cx - 3, 27.5]], 1.4, 0.8);
    shape(g, rrect(cx - 7, 19, 14, 6, 3), grad(g, rp, 0, 19, 0, 25));
    c.glints = [[cx - 8, 30]];
    return;
  }
  if (has(c, 'winged', 'faravahar')) {
    // a winged disc
    const rp = metalR;
    for (const s of [-1, 1]) {
      const w = new Path2D();
      w.moveTo(cx + s * 6, 30);
      w.quadraticCurveTo(cx + s * 20, 20, cx + s * 30, 22);
      w.quadraticCurveTo(cx + s * 28, 30, cx + s * 24, 36);
      w.quadraticCurveTo(cx + s * 14, 40, cx + s * 6, 38);
      w.closePath();
      shape(g, w, grad(g, rp, cx + s * 6, 20, cx + s * 30, 40));
      g.save();
      g.clip(w);
      g.strokeStyle = 'rgba(22,13,8,0.45)';
      g.lineWidth = 0.7;
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.moveTo(cx + s * 8, 28 + i * 2.2);
        g.lineTo(cx + s * 29, 22 + i * 3);
        g.stroke();
      }
      g.restore();
    }
    const tail = poly([[cx - 4, 38], [cx + 4, 38], [cx + 6, 50], [cx - 6, 50]]);
    shape(g, tail, grad(g, rp, cx - 6, 38, cx + 6, 50));
    const disc = ellipse(cx, 32, 8, 8);
    shape(g, disc, dome(g, rp, cx, 32, 8));
    g.strokeStyle = 'rgba(22,13,8,0.45)';
    g.lineWidth = 0.8;
    g.stroke(ellipse(cx, 32, 5, 5));
    c.glints = [[cx - 4, 26]];
    return;
  }
  if (has(c, 'gorgon', 'medusa')) {
    // the Gorgon's face on a disc, snakes for hair
    const rp = metalR;
    const disc = medallion(c, rp, cx, 37, 15);
    g.save();
    g.strokeStyle = rp.dk;
    g.lineWidth = 1.3;
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (1.05 + (i / 8) * 0.9);
      const x = cx + Math.cos(a) * 12, y = 37 + Math.sin(a) * 12;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a) * 4 + 2, y + Math.sin(a) * 4 - 2, x + Math.cos(a) * 7, y + Math.sin(a) * 7);
      g.stroke();
    }
    g.restore();
    g.save();
    g.clip(disc);
    g.fillStyle = '#1e130c';
    for (const s of [-1, 1]) g.fill(ellipse(cx + s * 5, 34, 3, 2.6));
    g.fillStyle = rp.hi;
    for (const s of [-1, 1]) g.fill(ellipse(cx + s * 5, 33.6, 1.1, 1.1));
    // the open mouth and tongue
    g.fillStyle = '#1e130c';
    g.fill(ellipse(cx, 43, 5, 3));
    g.fillStyle = flatRamp(0xa83224).base;
    g.fill(poly([[cx - 2, 43], [cx + 2, 43], [cx, 49]]));
    g.restore();
    c.glints = [[cx - 9, 29]];
    return;
  }
  if (has(c, 'hermes', 'caduceus')) {
    // a token with the herald's staff
    const rp = metalR;
    const disc = medallion(c, rp, cx, 37, 15);
    g.save();
    g.clip(disc);
    g.strokeStyle = rp.dk;
    g.lineCap = 'round';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(cx, 26);
    g.lineTo(cx, 50);
    g.stroke();
    g.lineWidth = 1.2;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx, 46);
      g.bezierCurveTo(cx + s * 9, 44, cx - s * 9, 36, cx, 33);
      g.bezierCurveTo(cx + s * 6, 31, cx + s * 6, 27, cx + s * 2, 26);
      g.stroke();
      g.beginPath();
      g.moveTo(cx + s * 1.5, 29);
      g.quadraticCurveTo(cx + s * 8, 24, cx + s * 7, 30);
      g.stroke();
    }
    g.restore();
    c.glints = [[cx - 9, 29]];
    return;
  }
  if (has(c, 'bes') || c.mat === 'faience') {
    // a squat faience Bes: feather crown, big face
    const fr = RAMPS.faience;
    cord(c, cx, 16, RAMPS.cord);
    for (let i = -2; i <= 2; i++) shape(g, rrect(cx + i * 4 - 1.5, 12, 3, 10, 1.5), grad(g, fr, cx + i * 4 - 1.5, 12, cx + i * 4 + 1.5, 22));
    const head = ellipse(cx, 32, 13, 11);
    shape(g, head, dome(g, fr, cx, 32, 13));
    const body = rrect(cx - 10, 41, 20, 12, 4);
    shape(g, body, grad(g, fr, cx - 10, 41, cx + 10, 53));
    g.save();
    g.clip(head);
    g.fillStyle = fr.dk;
    for (const s of [-1, 1]) g.fill(ellipse(cx + s * 5, 30, 2.6, 2.2));
    g.fillStyle = fr.hi;
    for (const s of [-1, 1]) g.fill(ellipse(cx + s * 5, 29.6, 1, 1));
    g.strokeStyle = fr.dk;
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(cx - 6, 37);
    g.quadraticCurveTo(cx, 42, cx + 6, 37);
    g.stroke();
    g.restore();
    c.glints = [[cx - 7, 25]];
    return;
  }
  // anything else: a medallion in its material, with an emblem the id names (a horse pendant) or a star relief
  const mr = c.mat ? (isMetal(c.mat) ? finish(RAMPS[c.mat], r) : RAMPS[c.mat]) : finish(RAMPS.bronze, r);
  const disc = medallion(c, mr, cx, 37, 15);
  const named = Object.keys(EMBLEM_BITMAPS).find((k) => has(c, k));
  if (named) {
    const saved = c.paint;
    c.paint = { emblem: named, field: 'bronze', ink: 'ink' };
    paintEmblem(c, cx, 37, 18, disc);
    c.paint = saved;
    c.glints = [[cx - 8, 28]];
    return;
  }
  const star = new Path2D();
  const pts = 5 + (c.v % 3);
  for (let i = 0; i < pts * 2; i++) {
    const a = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 ? 4 : 9;
    const x = cx + Math.cos(a) * rad, y = 37 + Math.sin(a) * rad;
    i ? star.lineTo(x, y) : star.moveTo(x, y);
  }
  star.closePath();
  g.fillStyle = 'rgba(22,13,8,0.45)';
  g.fill(star);
  g.strokeStyle = mr.hi;
  g.lineWidth = 0.6;
  g.stroke(star);
  c.glints = [[cx - 8, 28]];
}

function emblemMask(name: string): HTMLCanvasElement | null {
  const bm = EMBLEM_BITMAPS[name];
  if (!bm) return null;
  const cached = EMBLEM_MASKS.get(name);
  if (cached) return cached;
  // the 7 x 7 bitmap sampled bilinearly at 24 px per cell and thresholded: straight
  // edges stay straight, outer corners round off, diagonal steps become smooth slopes
  const n = 7, S = 24, N = n * S;
  const cell = (i: number, j: number) => (i >= 0 && j >= 0 && i < n && j < n && bm[j][i] === '#' ? 1 : 0);
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(N, N);
  const d = img.data;
  for (let y = 0; y < N; y++) {
    const fy = (y + 0.5) / S - 0.5;
    const j0 = Math.floor(fy), ty = fy - j0;
    for (let x = 0; x < N; x++) {
      const fx = (x + 0.5) / S - 0.5;
      const i0 = Math.floor(fx), tx = fx - i0;
      const v = (cell(i0, j0) * (1 - tx) + cell(i0 + 1, j0) * tx) * (1 - ty) + (cell(i0, j0 + 1) * (1 - tx) + cell(i0 + 1, j0 + 1) * tx) * ty;
      // a soft 2 px edge so the mask is antialiased when scaled
      const a = Math.max(0, Math.min(1, (v - 0.5) * S * 0.5 + 0.5));
      const o = (y * N + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = 255;
      d[o + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  EMBLEM_MASKS.set(name, cv);
  return cv;
}

function fur(g: G, p: Path2D, rp: Ramp, v: number): void {
  g.save();
  g.clip(p);
  g.lineWidth = 0.7;
  g.lineCap = 'round';
  for (let i = 0; i < 60; i++) {
    const x = 10 + ((i * 37 + (v & 15)) % 44);
    const y = 12 + ((i * 53 + (v >> 4)) % 36);
    g.strokeStyle = i % 3 ? rp.dk : rp.hi;
    g.globalAlpha = i % 3 ? 0.45 : 0.35;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 1.2, y + 3.5);
    g.stroke();
  }
  g.restore();
}

function scales(g: G, p: Path2D, rp: Ramp, cx: number, y0: number, y1: number, sr = 2.6, step = 3.1): void {
  g.save();
  g.clip(p);
  for (let row = 0; y0 + row * step < y1; row++) {
    const y = y0 + row * step;
    const off = row % 2 ? sr : 0;
    for (let x = cx - 24 + off; x <= cx + 24; x += sr * 2) {
      const s = new Path2D();
      s.moveTo(x - sr, y);
      s.lineTo(x + sr, y);
      s.quadraticCurveTo(x + sr, y + step * 1.35, x, y + step * 1.5);
      s.quadraticCurveTo(x - sr, y + step * 1.35, x - sr, y);
      s.closePath();
      g.fillStyle = grad(g, rp, x - sr, y, x + sr, y + step * 1.5);
      g.fill(s);
      g.strokeStyle = 'rgba(22,13,8,0.55)';
      g.lineWidth = 0.5;
      g.stroke(s);
    }
  }
  g.restore();
}

function wreath(c: Ctx, leaf1: Ramp, leaf2: Ramp, branch: Ramp, tie: Ramp): void {
  const { g } = c;
  const cx = 32;
  for (const s of [-1, 1]) {
    // branch
    g.save();
    g.lineCap = 'round';
    g.lineWidth = 2.8;
    g.strokeStyle = OUTLINE;
    g.beginPath();
    g.moveTo(cx + s * 4, 54);
    g.quadraticCurveTo(cx + s * 26, 48, cx + s * 18, 12);
    g.stroke();
    g.lineWidth = 1.5;
    g.strokeStyle = branch.base;
    g.stroke();
    g.restore();
    // leaves along it
    for (let i = 0; i < 6; i++) {
      const t = 0.12 + i * 0.15;
      const x0 = cx + s * 4, y0 = 54, qx = cx + s * 26, qy = 48, x1 = cx + s * 18, y1 = 12;
      const bx = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * qx + t * t * x1;
      const by = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * qy + t * t * y1;
      const ang = -s * 0.9 + (t - 0.5) * 1.2 * s;
      const lf = ellipse(bx - s * 2, by - 2, 5.4, 2.4, ang);
      shape(g, lf, grad(g, i % 2 ? leaf1 : leaf2, bx - 5, by - 5, bx + 5, by + 3));
      g.strokeStyle = 'rgba(255,255,255,0.3)';
      g.lineWidth = 0.5;
      g.beginPath();
      g.moveTo(bx - s * 2 - Math.cos(ang) * 4, by - 2 - Math.sin(ang) * 4);
      g.lineTo(bx - s * 2 + Math.cos(ang) * 4, by - 2 + Math.sin(ang) * 4);
      g.stroke();
    }
  }
  // the tie
  shape(g, rrect(cx - 4, 50, 8, 6, 2), grad(g, tie, cx - 4, 50, cx + 4, 56));
  c.glints = [[cx - 14, 20]];
}

function medallion(c: Ctx, rp: Ramp, cx: number, cy: number, rad: number, cordR = RAMPS.cord): Path2D {
  cord(c, cx, cy - rad - 2, cordR);
  const disc = ellipse(cx, cy, rad, rad);
  shape(c.g, disc, dome(c.g, rp, cx, cy, rad));
  stud(c.g, rp, cx, cy - rad - 0.5, 2.4);
  return disc;
}

function eyeBead(c: Ctx, outer: number, iris: number): void {
  const { g, r } = c;
  const cx = 32;
  cord(c, cx, 18, RAMPS.cord);
  const bead = ellipse(cx, 36, 17, 13);
  shape(g, bead, dome(g, flatRamp(outer), cx, 36, 17));
  const white = ellipse(cx, 36, 12, 8.5);
  shape(g, white, dome(g, RAMPS.cream, cx, 36, 12), false);
  const ir = ellipse(cx, 36, 7, 7);
  shape(g, ir, dome(g, flatRamp(iris), cx, 36, 7), false);
  g.fillStyle = '#121a26';
  g.fill(ellipse(cx, 36, 3.4, 3.4));
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fill(ellipse(cx - 2, 33.5, 1.6, 1.1, -0.5));
  g.fillStyle = 'rgba(255,255,255,0.3)';
  g.fill(ellipse(cx - 7, 28, 6, 2.6, -0.3));
  stud(g, finish(RAMPS.bronze, r), cx, 21, 2.2);
  c.glints = [[cx - 8, 29]];
}

// ------------------------------------------------------------------ rarity sparkle

function star(g: G, x: number, y: number, s: number, alpha = 1): void {
  g.save();
  g.globalAlpha = alpha;
  const halo = g.createRadialGradient(x, y, 0, x, y, s * 1.6);
  halo.addColorStop(0, 'rgba(255,250,230,0.85)');
  halo.addColorStop(1, 'rgba(255,230,160,0)');
  g.fillStyle = halo;
  g.fillRect(x - s * 1.6, y - s * 1.6, s * 3.2, s * 3.2);
  const p = new Path2D();
  p.moveTo(x, y - s);
  p.quadraticCurveTo(x, y, x + s, y);
  p.quadraticCurveTo(x, y, x, y + s);
  p.quadraticCurveTo(x, y, x - s, y);
  p.quadraticCurveTo(x, y, x, y - s);
  p.closePath();
  g.fillStyle = '#ffffff';
  g.fill(p);
  g.restore();
}

// ------------------------------------------------------------------ entry points

/** The main material ramp of an item (before the rarity finish): its `material`, or the art's usual one. */
function mainRamp(def: ItemDef): Ramp {
  if (def.material) return RAMPS[def.material];
  switch (def.slot) {
    case 'weapon': {
      const a = def.art;
      if (a === 'club') return RAMPS.olive;
      if (a === 'sling') return RAMPS.leather;
      if (a === 'bow' || a === 'bow_short') return RAMPS.wood;
      if (a === 'spear' || a === 'spear_short') return RAMPS.bronze;
      return RAMPS.iron;
    }
    case 'shield':
      return def.art === 'pelte' ? RAMPS.wicker : def.art === 'oval' ? RAMPS.wood : RAMPS.bronze;
    case 'helmet':
      return def.art === 'cap' ? RAMPS.leather : def.art === 'hood' ? RAMPS.felt : RAMPS.bronze;
    case 'armor':
      return def.art === 'leather' ? RAMPS.leather : def.art === 'linothorax' ? RAMPS.linen : def.art === 'mail' ? RAMPS.iron : RAMPS.bronze;
    default:
      return RAMPS.bronze;
  }
}

/**
 * Draw an item's icon into a square canvas of `px` device pixels. `px` is
 * the UI size times the atlas density (16 UI px at K = 3 -> 48 px).
 */
export function renderItemIconHD(item: Item, px: number): HTMLCanvasElement {
  const def = itemDef(item.def);
  const r = rarityRank(item.rarity);
  const n = Math.max(8, Math.round(px));
  const u = n / ICON_UNITS;
  // the item is drawn on its own layer so the shadow and the glow come from its silhouette
  const layer = document.createElement('canvas');
  layer.width = n;
  layer.height = n;
  const g = layer.getContext('2d')!;
  g.scale(u, u);
  const base = mainRamp(def);
  const main = base.metal ? finish(base, r) : base;
  const c: Ctx = { g, def, id: def.id, r, tier: def.tier, mat: def.material, paint: item.paint, v: hash(def.id), main, trim: trimOf(base, r), glints: [] };
  g.lineJoin = 'round';
  g.lineCap = 'round';
  switch (def.slot) {
    case 'weapon':
      weaponIcon(c);
      break;
    case 'shield':
      shieldIcon(c);
      break;
    case 'helmet':
      helmetIcon(c);
      break;
    case 'armor':
      armorIcon(c);
      break;
    default:
      trinketIcon(c);
  }
  // uncommon and up: a soft sheen over the whole piece (brighter the rarer)
  if (r >= 1) {
    g.save();
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createLinearGradient(8, 8, 56, 56);
    gr.addColorStop(0, `rgba(255,245,220,${0.08 + r * 0.03})`);
    gr.addColorStop(0.45, 'rgba(255,245,220,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, ICON_UNITS, ICON_UNITS);
    g.restore();
  }

  const out = document.createElement('canvas');
  out.width = n;
  out.height = n;
  const o = out.getContext('2d')!;
  if (r >= 4) {
    // legendary: a warm glow round the silhouette
    o.save();
    o.shadowColor = 'rgba(255, 196, 90, 0.9)';
    o.shadowBlur = 7 * u;
    o.drawImage(layer, 0, 0);
    o.shadowBlur = 3 * u;
    o.drawImage(layer, 0, 0);
    o.restore();
  }
  // the drop shadow and the item
  o.save();
  o.shadowColor = 'rgba(0, 0, 0, 0.55)';
  o.shadowBlur = 2.2 * u;
  o.shadowOffsetX = 1.2 * u;
  o.shadowOffsetY = 1.8 * u;
  o.drawImage(layer, 0, 0);
  o.restore();
  // rare and up: a glint on the point; legendary sparkles besides
  if (r >= 2 && c.glints.length) {
    o.save();
    o.scale(u, u);
    const [gx, gy] = c.glints[0];
    star(o, gx, gy, r >= 4 ? 4.2 : r >= 3 ? 3.4 : 2.8);
    if (r >= 4) {
      star(o, gx + 9, gy - 7, 2, 0.85);
      star(o, 12 + (c.v % 7), 50 - (c.v % 5), 1.8, 0.8);
      star(o, 52 - ((c.v >> 3) % 7), 14 + ((c.v >> 5) % 6), 1.6, 0.8);
    }
    o.restore();
  }
  return out;
}
