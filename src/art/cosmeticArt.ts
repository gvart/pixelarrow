/**
 * Previews of the shop's cosmetics (server/src/economy/catalog.ts): shield
 * emblems on a shield, banners, cloaks, clan flags, army skins, war-table
 * themes, crests, auras and victory poses, each a 28 x 28 UI px picture.
 * Unknown ids fall back to a look by their slot (and their colour words:
 * "crest_purple"), so new catalogue entries still get a preview.
 *
 * `renderCosmeticHD` is the "Bronze & Stone" preview (docs/UI_KIT.md "Surfaces"), painted
 * with Canvas 2D at the screen's density (K atlas px per UI px, shown scaled
 * by 1 / K, see cosmeticTexture in src/ui/econ/widgets.ts) in a 112 x 112
 * unit box. `renderCosmetic` is the old pixel picture, kept for where there is
 * no DOM (tests) and as the fallback.
 */
import { Pix } from './pixels';
import { P, hex, mix } from './palette';
import { EMBLEM_BITMAPS } from './emblems';
import { ANIM, applyCosmetics, renderFrame, renderGearIcon, type DollSpec } from './paperdoll';
import { AURA_COLORS } from '../game/cosmetics';
import { INK, TONES, flatTone, glint, iconCanvas, line, shape, stroke, tone, type G, type Tone } from './goodsIcons';
import { ellipsePath, poly, roundRect } from './path2d';

export const COSMETIC_PREVIEW = 28;
/** Drawing space edge of a smooth preview: 28 UI px = 112 units. */
export const COSMETIC_UNITS = 112;

interface Look {
  main: number;
  dark: number;
  light: number;
  motif?: string;
  ink?: number;
}

const LOOKS: Record<string, Look> = {
  emblem_owl: { main: 0xc89a48, dark: 0x8a6128, light: 0xe8c26a, motif: 'owl', ink: 0x2e2220 },
  emblem_lambda: { main: 0x9e3426, dark: 0x6e2219, light: 0xc85a45, motif: 'lambda', ink: 0xeee4cc },
  emblem_pegasus: { main: 0x46607a, dark: 0x2c4060, light: 0x6d8fae, motif: 'horse', ink: 0xeee4cc },
  emblem_gorgon: { main: 0x2e2220, dark: 0x1d140f, light: 0x4a3a30, motif: 'eye', ink: 0xe0b040 },
  emblem_pass_s: { main: 0xe0b040, dark: 0x8a6a28, light: 0xfff0a0, motif: 'star', ink: 0x6e2219 },
  banner_crimson: { main: 0xa83224, dark: 0x6e2219, light: 0xd06048, motif: 'lambda', ink: 0xf6ecd8 },
  banner_laurel: { main: 0x5f8a45, dark: 0x3e5a2c, light: 0x9ad87a, motif: 'sunwheel', ink: 0xe0b040 },
  supporter_banner: { main: 0xe0b040, dark: 0x8a6a28, light: 0xfff0a0, motif: 'star', ink: 0x8c2f25 },
  banner_pass_s: { main: 0x9a58c0, dark: 0x5e3478, light: 0xd09aff, motif: 'star', ink: 0xe0b040 },
  // duel season rewards by peak league (src/duel/season.ts SEASON.rewards)
  duel_emblem_bronze: { main: 0x8a5a2b, dark: 0x5a3a1b, light: 0xb8834a, motif: 'lambda', ink: 0xeee4cc },
  duel_emblem_silver: { main: 0x8f9aa3, dark: 0x5e6870, light: 0xc8d0d8, motif: 'lambda', ink: 0x2e2220 },
  duel_emblem_gold: { main: 0xc89a30, dark: 0x8a6a28, light: 0xf0d070, motif: 'star', ink: 0x6e2219 },
  duel_banner_hoplite: { main: 0x8c2f25, dark: 0x5e1e17, light: 0xc0503f, motif: 'lambda', ink: 0xe0b040 },
  duel_banner_strategos: { main: 0x4a3a8c, dark: 0x2e2460, light: 0x7a68c0, motif: 'star', ink: 0xe0b040 },
  duel_banner_legend: { main: 0x2a7a6a, dark: 0x1a5046, light: 0x5ab0a0, motif: 'sunwheel', ink: 0xfff0a0 },
  cloak_crimson: { main: 0xa83224, dark: 0x6e2219, light: 0xd06048 },
  cloak_purple: { main: 0x7a3a9a, dark: 0x4a2260, light: 0xa868c8 },
  cloak_pass_s: { main: 0xe0b040, dark: 0x8a6a28, light: 0xfff0a0 },
  flag_trireme: { main: 0x3e6b94, dark: 0x274a6a, light: 0x6d9ac0, motif: 'trident', ink: 0xf6ecd8 },
  flag_lion: { main: 0xb8863b, dark: 0x6e4f22, light: 0xe8c26a, motif: 'lion', ink: 0x6e2219 },
  skin_bronze: { main: 0xe8c26a, dark: 0x8a6128, light: 0xfff0b0 },
  skin_macedon: { main: 0x7a3a9a, dark: 0x4a2260, light: 0xc8a050 },
  table_marble: { main: 0xe4e0d8, dark: 0xa8a49c, light: 0xffffff },
  table_tent: { main: 0xc8a878, dark: 0x8a6a48, light: 0xe8d0a0 },
};

const SLOT_DEFAULT: Record<string, Look> = {
  emblem: { main: 0xc89a48, dark: 0x8a6128, light: 0xe8c26a, motif: 'star', ink: 0x2e2220 },
  banner: { main: 0xa83224, dark: 0x6e2219, light: 0xd06048, motif: 'star', ink: 0xf6ecd8 },
  cloak: { main: 0x4a6b9a, dark: 0x2c4060, light: 0x6d8fae },
  clan_flag: { main: 0x5f8a45, dark: 0x3e5a2c, light: 0x9ad87a, motif: 'boar', ink: 0xf6ecd8 },
  army_skin: { main: 0xb8863b, dark: 0x6e4f22, light: 0xe8c26a },
  table_theme: { main: 0x9a7048, dark: 0x57391f, light: 0xc89a68 },
  crest: { main: 0xa83224, dark: 0x6e2219, light: 0xd06048 },
  aura: { main: 0xe0b040, dark: 0x8a6a28, light: 0xfff0a0 },
  pose: { main: 0xb8863b, dark: 0x6e4f22, light: 0xe8c26a },
};

/** A hoplite in the cosmetic, small enough for the 28 px tile (crests, auras, victory poses). */
const MODEL: DollSpec = {
  look: { skin: 1, hair: 1, hairStyle: 0, beard: 1, tunic: 'tunicWhite' },
  weapon: 'spear',
  shield: { art: 'hoplon', paint: { emblem: 'lambda', field: 'red', ink: 'cream' } },
  helmet: { art: 'attic', paint: { field: 'red' } },
  armor: 'linothorax',
  seed: 2,
  scale: 0.5,
};

function soldier(px: Pix, id: string, slot: string): void {
  const spec = applyCosmetics(MODEL, { [slot]: id });
  const fr = renderFrame(spec, slot === 'pose' ? ANIM.win[1] : 0, 0);
  // the figure's feet on the tile's bottom edge
  px.blit(fr, Math.round((px.w - fr.w) / 2), px.h - 2 - Math.round(fr.h * (64 / 72)));
  if (slot === 'aura') {
    const cols = AURA_COLORS[id] ?? [0xfff0a0];
    const spots = [[5, 20], [22, 8], [7, 9], [21, 18], [12, 4], [18, 24], [4, 14], [24, 13]];
    spots.forEach(([x, y], i) => px.set(x, y, cols[i % cols.length]));
  }
}

function motif(px: Pix, x: number, y: number, name: string | undefined, ink: number, scale = 1): void {
  const rows = EMBLEM_BITMAPS[name ?? ''] ?? EMBLEM_BITMAPS.star;
  for (let r = 0; r < rows.length; r++)
    for (let c = 0; c < rows[r].length; c++) if (rows[r][c] === '#') px.rect(x + c * scale, y + r * scale, scale, scale, ink);
}

function banner(px: Pix, l: Look): void {
  // pole with a gold finial, a swallow-tailed cloth
  px.vline(6, 2, 26, P.wood[1]);
  px.vline(7, 3, 26, P.wood[2]);
  px.rect(5, 1, 3, 2, 0xe0b040);
  px.rect(8, 4, 16, 14, l.main);
  px.hline(8, 23, 4, l.light);
  px.hline(8, 23, 17, l.dark);
  for (let i = 0; i < 5; i++) {
    px.clear(23 - i, 13 + i);
    px.clear(23 - i + 1, 13 + i);
  }
  px.rect(8, 18, 16, 2, l.dark);
  for (let i = 0; i < 4; i++) px.clear(14 + i, 19 - (i % 2));
  motif(px, 12, 7, l.motif, l.ink ?? 0xffffff);
}

function flag(px: Pix, l: Look): void {
  px.vline(4, 2, 26, P.wood[1]);
  px.vline(5, 2, 26, P.wood[2]);
  px.rect(3, 1, 4, 2, 0xb8863b);
  // waving cloth
  for (let x = 0; x < 19; x++) {
    const dy = Math.round(Math.sin(x / 3) * 1.2);
    for (let y = 0; y < 15; y++) px.set(6 + x, 4 + y + dy, y === 0 ? l.light : y === 14 ? l.dark : l.main);
  }
  motif(px, 12, 7, l.motif, l.ink ?? 0xffffff);
}

function cloak(px: Pix, l: Look): void {
  // shoulders, a pin and folds falling to the hem
  for (let y = 0; y < 22; y++) {
    const half = 6 + Math.floor(y / 3);
    for (let x = -half; x <= half; x++) {
      const fold = (x + 40) % 4 === 0;
      const edge = Math.abs(x) === half;
      px.set(14 + x, 4 + y, edge ? l.dark : fold ? l.dark : y < 2 ? l.light : l.main);
    }
  }
  px.rect(10, 3, 9, 2, l.light);
  px.rect(13, 4, 3, 3, 0xe0b040);
  px.set(14, 5, 0xfff0a0);
  px.outline(P.outline);
}

function skin(px: Pix, l: Look, id: string): void {
  // a helmet and a shield in the army's finish
  const helm = renderGearIcon('helmet', id === 'skin_macedon' ? 'thracian' : 'corinthian', { field: 'bronze' }, 20, 20);
  const sh = renderGearIcon('shield', 'hoplon', { emblem: id === 'skin_macedon' ? 'sunwheel' : 'lambda', field: id === 'skin_macedon' ? 'blue' : 'bronze' }, 22, 22);
  px.blit(sh, 0, 6);
  px.blit(helm, 9, 0);
  // tint towards the skin colour
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      if (px.alpha(x, y) === 0) continue;
      const c = px.get(x, y);
      const r = (c >> 16) & 255;
      const g = (c >> 8) & 255;
      const b = c & 255;
      const lum = (r * 3 + g * 5 + b * 2) / 2550;
      const t = lum > 0.6 ? l.light : lum > 0.3 ? l.main : l.dark;
      const mix = (a: number, bb: number) => Math.round(a * 0.45 + bb * 0.55);
      px.set(x, y, (mix(r, (t >> 16) & 255) << 16) | (mix(g, (t >> 8) & 255) << 8) | mix(b, t & 255));
    }
}

function table(px: Pix, l: Look): void {
  // a board in perspective with a hex grid and two tiny armies
  for (let y = 0; y < 16; y++) {
    const inset = Math.floor((15 - y) / 3);
    for (let x = 2 + inset; x < 26 - inset; x++) px.set(x, 6 + y, ((x + y) % 7 === 0 ? l.dark : l.main));
  }
  px.hline(2, 25, 22, l.dark);
  px.rect(2, 23, 24, 2, P.wood[1]);
  px.rect(4, 25, 2, 3, P.wood[2]);
  px.rect(22, 25, 2, 3, P.wood[2]);
  for (let i = 0; i < 4; i++) px.set(8 + i * 4, 12 + (i % 2) * 3, l.light);
  px.rect(9, 10, 2, 3, 0xa83224);
  px.rect(17, 15, 2, 3, 0x46607a);
  px.set(9, 9, 0xe0b040);
  px.set(17, 14, 0xe0b040);
}

/** A 28 x 28 pixel preview of a cosmetic by id and slot (no DOM needed). */
export function renderCosmetic(id: string, slot: string): Pix {
  const px = new Pix(COSMETIC_PREVIEW, COSMETIC_PREVIEW);
  const l = LOOKS[id] ?? SLOT_DEFAULT[slot] ?? SLOT_DEFAULT.banner;
  if (slot === 'emblem') {
    const sh = renderGearIcon('shield', 'hoplon', { field: 'bronze' }, 28, 28);
    px.blit(sh, 0, 0);
    // repaint the face in the emblem's colours, then the motif, doubled
    for (let y = 0; y < 28; y++)
      for (let x = 0; x < 28; x++) {
        if (px.alpha(x, y) === 0) continue;
        const d = Math.hypot(x - 13.5, y - 13.5);
        if (d < 9) px.set(x, y, d > 8 ? l.dark : y < 9 ? l.light : l.main);
      }
    motif(px, 7, 7, l.motif, l.ink ?? 0x2e2220, 2);
  } else if (slot === 'banner') banner(px, l);
  else if (slot === 'cloak') cloak(px, l);
  else if (slot === 'clan_flag') flag(px, l);
  else if (slot === 'army_skin') skin(px, l, id);
  else if (slot === 'crest' || slot === 'aura' || slot === 'pose') soldier(px, id, slot);
  else table(px, l);
  return px;
}

/** Texture key of a cosmetic's preview; `px` is the smooth preview's edge in atlas px (none: the pixel one). */
export function cosmeticKey(id: string, px?: number): string {
  return px ? `cosm_${id}@${px}` : `cosm_${id}`;
}


// ================================================================== the smooth previews (112 x 112)

const MASKS = new Map<string, HTMLCanvasElement>();

/** The 7 x 7 emblem bitmap sampled bilinearly and thresholded: straight edges stay straight, corners round off. */
function emblemMask(name: string | undefined): HTMLCanvasElement {
  const key = name && EMBLEM_BITMAPS[name] ? name : 'star';
  const cached = MASKS.get(key);
  if (cached) return cached;
  const bm = EMBLEM_BITMAPS[key];
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
      const a = Math.max(0, Math.min(1, (v - 0.5) * S * 0.5 + 0.5));
      const o = (y * N + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = 255;
      d[o + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  MASKS.set(key, cv);
  return cv;
}

/** Paint an emblem motif in `ink` centred at (cx, cy), `size` units wide, with a faint shadow into the field. */
function motifHD(g: G, cx: number, cy: number, size: number, name: string | undefined, ink: number, clip?: Path2D): void {
  const mask = emblemMask(name);
  const u = g.canvas.width / COSMETIC_UNITS;
  const tmp = document.createElement('canvas');
  tmp.width = g.canvas.width;
  tmp.height = g.canvas.height;
  const t = tmp.getContext('2d')!;
  t.setTransform(g.getTransform());
  t.imageSmoothingEnabled = true;
  t.imageSmoothingQuality = 'high';
  t.drawImage(mask, cx - size / 2, cy - size / 2, size, size);
  t.globalCompositeOperation = 'source-in';
  const gr = t.createLinearGradient(cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2);
  gr.addColorStop(0, hex(mix(ink, 0xffffff, 0.2)));
  gr.addColorStop(1, hex(mix(ink, 0x000000, 0.28)));
  t.fillStyle = gr;
  t.fillRect(-10, -10, COSMETIC_UNITS + 20, COSMETIC_UNITS + 20);
  g.save();
  if (clip) g.clip(clip);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 0.35;
  g.drawImage(tmp, 0.8 * u, 1.2 * u);
  g.globalAlpha = 1;
  g.drawImage(tmp, 0, 0);
  g.restore();
}

/** A round hoplon face-on: bronze rim, painted field, the motif, a boss-less gloss. */
function hoplon(g: G, cx: number, cy: number, r: number, field: Tone, rim: Tone, motif: string | undefined, ink: number, metalFace = false): void {
  const outer = ellipsePath(cx, cy, r, r);
  shape(g, outer, rim, [cx - r, cy - r, cx + r, cy + r], { dir: 'd', gloss: 0.5, shade: 0.45, ink: 2.6 });
  const ri = r * 0.8;
  const inner = ellipsePath(cx, cy, ri, ri);
  shape(g, inner, field, [cx - ri, cy - ri, cx + ri, cy + ri], { dir: 'd', gloss: metalFace ? 0.5 : 0.22, shade: 0.35, ink: 1.6, noShadow: true });
  motifHD(g, cx, cy + 1, ri * 1.4, motif, ink, inner);
  // the rim's inner shadow over the field, and a highlight arc on the rim
  g.save();
  g.clip(inner);
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(0,0,0,0.3)';
  g.beginPath();
  g.arc(cx, cy, ri + 1, 0, Math.PI * 2);
  g.stroke();
  g.restore();
  g.save();
  g.clip(outer);
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(255,245,210,0.55)';
  g.beginPath();
  g.arc(cx, cy, r * 0.9, Math.PI * 1.05, Math.PI * 1.65);
  g.stroke();
  g.restore();
  glint(g, cx - r * 0.45, cy - r * 0.5, r * 0.28, 0.55);
}

function emblemHD(g: G, l: Look, id: string): void {
  const metal = id.includes('duel_');
  const rim = metal ? (id.includes('silver') ? TONES.silver : id.includes('gold') ? TONES.gold : TONES.bronze) : TONES.bronze;
  const field = metal ? rim : flatTone(l.main, 0.28);
  hoplon(g, 56, 56, 48, field, rim, l.motif, l.ink ?? 0x2e2220, metal);
}

function pole(g: G, x: number, y0: number, y1: number, finial: Tone = TONES.gold): void {
  const p = roundRect(x - 2.6, y0, 5.2, y1 - y0, 1.5);
  shape(g, p, TONES.wood, [x - 3, y0, x + 3, y1], { dir: 'h', gloss: 0.3, shade: 0.3 });
  const f = new Path2D();
  f.moveTo(x, y0 - 10);
  f.quadraticCurveTo(x + 6, y0 - 4, x, y0 + 1);
  f.quadraticCurveTo(x - 6, y0 - 4, x, y0 - 10);
  f.closePath();
  shape(g, f, finial, [x - 6, y0 - 10, x + 6, y0 + 1], { dir: 'd', gloss: 0.5, ink: 1.8 });
}

function bannerHD(g: G, l: Look): void {
  // a hanging banner: pole on the left, a crossbar, swallow-tailed cloth with fringe
  const cloth = flatTone(l.main, 0.28);
  pole(g, 16, 14, 108);
  const bar = roundRect(12, 18, 86, 4.5, 2);
  shape(g, bar, TONES.wood, [12, 18, 98, 22], { gloss: 0.3, ink: 1.8 });
  const c = new Path2D();
  c.moveTo(26, 22);
  c.lineTo(92, 22);
  c.lineTo(92, 84);
  c.lineTo(76, 98);
  c.lineTo(59, 84);
  c.lineTo(42, 98);
  c.lineTo(26, 84);
  c.closePath();
  shape(g, c, cloth, [26, 22, 92, 98], { dir: 'd', gloss: 0.22, shade: 0.35 });
  g.save();
  g.clip(c);
  // folds
  g.fillStyle = 'rgba(0,0,0,0.16)';
  for (const x of [38, 58, 78]) {
    g.beginPath();
    g.moveTo(x, 22);
    g.quadraticCurveTo(x + 3, 60, x - 2, 98);
    g.lineTo(x + 5, 98);
    g.quadraticCurveTo(x + 9, 60, x + 6, 22);
    g.closePath();
    g.fill();
  }
  // a border stripe in the ink colour
  g.strokeStyle = hex(mix(l.ink ?? 0xffffff, l.main, 0.35));
  g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(31, 27);
  g.lineTo(87, 27);
  g.lineTo(87, 82);
  g.moveTo(31, 27);
  g.lineTo(31, 82);
  g.stroke();
  // fringe along the tails
  g.strokeStyle = hex(mix(l.ink ?? 0xffffff, 0xe0b040, 0.5));
  g.lineWidth = 1.6;
  for (let i = 0; i < 9; i++) {
    const x = 28 + i * 8;
    g.beginPath();
    g.moveTo(x, 84 + Math.abs(((i + 4) % 8) - 4) * 3.4);
    g.lineTo(x, 98);
    g.stroke();
  }
  g.restore();
  motifHD(g, 59, 52, 40, l.motif, l.ink ?? 0xffffff, c);
  // the ties to the bar
  for (const x of [32, 59, 86]) stroke(g, line([[x, 18], [x, 26]]), hex(mix(l.main, 0x000000, 0.4)), 2.4);
}

function flagHD(g: G, l: Look): void {
  // a waving clan flag flying to the right of its pole
  const cloth = flatTone(l.main, 0.28);
  pole(g, 14, 10, 110, TONES.bronze);
  const c = new Path2D();
  c.moveTo(18, 16);
  c.bezierCurveTo(44, 6, 70, 26, 104, 14);
  c.bezierCurveTo(100, 36, 108, 50, 102, 70);
  c.bezierCurveTo(70, 82, 44, 60, 18, 72);
  c.closePath();
  shape(g, c, cloth, [18, 6, 108, 82], { dir: 'd', gloss: 0.25, shade: 0.35 });
  g.save();
  g.clip(c);
  // the wave's light and shade
  const w = g.createLinearGradient(18, 0, 104, 0);
  w.addColorStop(0, 'rgba(0,0,0,0.0)');
  w.addColorStop(0.3, 'rgba(255,255,255,0.12)');
  w.addColorStop(0.55, 'rgba(0,0,0,0.22)');
  w.addColorStop(0.8, 'rgba(255,255,255,0.1)');
  w.addColorStop(1, 'rgba(0,0,0,0.15)');
  g.fillStyle = w;
  g.fillRect(0, 0, COSMETIC_UNITS, COSMETIC_UNITS);
  // hem stripe
  g.strokeStyle = hex(mix(l.ink ?? 0xffffff, l.main, 0.3));
  g.lineWidth = 2.4;
  g.beginPath();
  g.moveTo(18, 66);
  g.bezierCurveTo(44, 54, 70, 76, 102, 64);
  g.stroke();
  g.restore();
  motifHD(g, 58, 40, 40, l.motif, l.ink ?? 0xffffff, c);
  // tassel at the top, and a shadow line under the cloth on the pole
  stroke(g, line([[18, 16], [14, 10]]), hex(l.dark), 2);
}

function cloakHD(g: G, l: Look): void {
  // a cloak seen from behind, pinned at the shoulders with a gold fibula, falling in folds
  const cloth = flatTone(l.main, 0.28);
  const c = new Path2D();
  c.moveTo(34, 20);
  c.quadraticCurveTo(56, 12, 78, 20);
  c.quadraticCurveTo(96, 50, 100, 100);
  c.quadraticCurveTo(56, 108, 12, 100);
  c.quadraticCurveTo(16, 50, 34, 20);
  c.closePath();
  shape(g, c, cloth, [12, 12, 100, 108], { dir: 'd', gloss: 0.25, shade: 0.4 });
  g.save();
  g.clip(c);
  // folds: alternating light and dark pleats fanning from the shoulders
  for (let i = -3; i <= 3; i++) {
    const x0 = 56 + i * 6, x1 = 56 + i * 13;
    g.fillStyle = i % 2 ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.1)';
    g.beginPath();
    g.moveTo(x0, 22);
    g.quadraticCurveTo(x0 + (x1 - x0) * 0.4, 70, x1 - 3, 104);
    g.lineTo(x1 + 4, 104);
    g.quadraticCurveTo(x0 + 3 + (x1 - x0) * 0.4, 70, x0 + 3, 22);
    g.closePath();
    g.fill();
  }
  // the hem's border
  g.strokeStyle = hex(mix(l.light, 0xe0b040, 0.4));
  g.lineWidth = 2.4;
  g.beginPath();
  g.moveTo(14, 96);
  g.quadraticCurveTo(56, 103, 98, 96);
  g.stroke();
  g.restore();
  // the collar fold and the fibula
  const collar = new Path2D();
  collar.moveTo(32, 22);
  collar.quadraticCurveTo(56, 30, 80, 22);
  collar.quadraticCurveTo(56, 14, 32, 22);
  collar.closePath();
  shape(g, collar, tone(mix(l.light, 0xffffff, 0.2), l.light, l.main, l.dark), [32, 14, 80, 30], { noShadow: true, ink: 1.6, gloss: 0.3 });
  const pin = ellipsePath(56, 23, 6.5, 6.5);
  shape(g, pin, TONES.gold, [50, 16, 63, 30], { dir: 'd', ink: 1.8, gloss: 0.6 });
  g.fillStyle = 'rgba(120,40,30,0.9)';
  g.beginPath();
  g.arc(56, 23, 2.4, 0, Math.PI * 2);
  g.fill();
  glint(g, 54, 21, 2.5, 0.9);
}

function helmetSide(g: G, cx: number, cy: number, sc: number, metal: Tone, crest: Tone): void {
  // a Corinthian helmet in profile facing left, a tall horsehair crest arching from the brow down the back
  g.save();
  g.translate(cx, cy);
  g.scale(sc, sc);
  const cr = new Path2D();
  cr.moveTo(-24, -16);
  cr.quadraticCurveTo(-12, -54, 20, -52);
  cr.quadraticCurveTo(46, -50, 50, -12);
  cr.quadraticCurveTo(52, 10, 42, 28);
  cr.lineTo(34, 22);
  cr.quadraticCurveTo(40, 2, 32, -24);
  cr.quadraticCurveTo(18, -40, -6, -30);
  cr.lineTo(-16, -20);
  cr.closePath();
  shape(g, cr, crest, [-24, -54, 52, 28], { dir: 'd', gloss: 0.35, shade: 0.35 });
  g.save();
  g.clip(cr);
  g.strokeStyle = 'rgba(0,0,0,0.22)';
  g.lineWidth = 1.3;
  for (let i = 0; i < 10; i++) {
    g.beginPath();
    g.moveTo(-20 + i * 5, -20 - i * 1.2);
    g.quadraticCurveTo(0 + i * 4, -46 + i * 0.6, 36 + i * 1.2, -30 + i * 5.5);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.beginPath();
  g.moveTo(-14, -26);
  g.quadraticCurveTo(10, -48, 40, -30);
  g.stroke();
  g.restore();
  const h = new Path2D();
  h.moveTo(-30, 4);
  h.quadraticCurveTo(-30, -32, 2, -33);
  h.quadraticCurveTo(32, -32, 32, 0);
  h.quadraticCurveTo(33, 16, 24, 26);
  h.lineTo(12, 28);
  h.lineTo(6, 36);
  h.lineTo(-8, 34);
  h.lineTo(-12, 18);
  h.lineTo(-22, 18);
  h.lineTo(-24, 32);
  h.lineTo(-30, 30);
  h.closePath();
  shape(g, h, metal, [-30, -33, 33, 36], { dir: 'd', gloss: 0.45, shade: 0.4 });
  g.save();
  g.clip(h);
  // the eye opening between the nose guard and the cheek piece
  g.fillStyle = '#1b120c';
  g.beginPath();
  g.moveTo(-22, 2);
  g.quadraticCurveTo(-14, -4, -8, 4);
  g.lineTo(-10, 18);
  g.lineTo(-22, 18);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(240,220,190,0.9)';
  g.beginPath();
  g.ellipse(-16, 6, 3, 2, 0, 0, Math.PI * 2);
  g.fill();
  // the crest holder along the crown, and the cheek piece's edge
  g.strokeStyle = 'rgba(0,0,0,0.3)';
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(-14, -24);
  g.quadraticCurveTo(2, -30, 22, -22);
  g.moveTo(-10, 18);
  g.lineTo(-8, 34);
  g.stroke();
  g.restore();
  glint(g, -10, -18, 7, 0.55);
  g.restore();
}

const CREST_COLORS: Record<string, number> = { white: 0xf4ede0, black: 0x24201e, purple: 0x7a3a9a, gold: 0xe8c25c, red: 0xc43a2c, blue: 0x46607a };

/** A colour word in the id ("crest_purple") or the look's main colour. */
function colorWord(id: string, l: Look): number {
  for (const [w, c] of Object.entries(CREST_COLORS)) if (id.includes(w)) return c;
  return l.main;
}

function crestHD(g: G, l: Look, id: string): void {
  const c = colorWord(id, l);
  const crest = id.includes('gold') ? TONES.gold : flatTone(c, c === 0x24201e ? 0.45 : 0.3);
  helmetSide(g, 46, 66, 1.12, TONES.bronze, crest);
}

function auraHD(g: G, l: Look, id: string): void {
  const cols = AURA_COLORS[id] ?? [l.light, l.main];
  // a soft glow behind the helmet
  const glow = g.createRadialGradient(56, 60, 6, 56, 60, 52);
  glow.addColorStop(0, hex(cols[0]) + 'aa');
  glow.addColorStop(0.6, hex(cols[cols.length - 1]) + '33');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, COSMETIC_UNITS, COSMETIC_UNITS);
  helmetSide(g, 48, 66, 0.95, TONES.bronze, flatTone(0xc43a2c));
  // motes: a ring of glowing specks, larger ones with a bright core
  const spots: [number, number, number][] = [[18, 72, 3.2], [92, 34, 3.6], [26, 30, 2.6], [88, 78, 3], [50, 12, 2.8], [72, 100, 3.2], [12, 50, 2.2], [100, 56, 2.4], [34, 98, 2.4], [80, 18, 2]];
  spots.forEach(([x, y, r], i) => {
    const c = hex(cols[i % cols.length]);
    const gr = g.createRadialGradient(x, y, 0, x, y, r * 2.6);
    gr.addColorStop(0, c + 'cc');
    gr.addColorStop(1, c + '00');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r * 2.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(x, y, r * 0.55, 0, Math.PI * 2);
    g.fill();
  });
}

function poseHD(g: G, l: Look, id: string): void {
  // a hoplite in a victory pose: spear raised, or the shield held aloft
  const shieldUp = id.includes('shield');
  const skin = TONES.skin;
  const tunic = flatTone(l.main);
  // the shield (behind, on the left arm): raised overhead or at the side
  const sx = shieldUp ? 40 : 30, sy = shieldUp ? 22 : 64, sr = shieldUp ? 22 : 18;
  // legs
  for (const [x0, x1] of [[48, 42], [64, 70]]) {
    const leg = line([[x0, 78], [x1, 104]]);
    stroke(g, leg, INK, 11);
    stroke(g, leg, skin.base, 7.5);
    stroke(g, line([[x1, 104], [x1 + (x1 < 56 ? -4 : 4), 104]]), INK, 6);
    stroke(g, line([[x1, 104], [x1 + (x1 < 56 ? -4 : 4), 104]]), TONES.leather.base, 3.5);
  }
  // the tunic with a cuirass
  const body = new Path2D();
  body.moveTo(40, 44);
  body.lineTo(72, 44);
  body.lineTo(74, 70);
  body.quadraticCurveTo(56, 84, 38, 70);
  body.closePath();
  shape(g, body, tunic, [38, 44, 74, 84], { dir: 'd', gloss: 0.3, shade: 0.35 });
  const cuirass = poly([[41, 44], [71, 44], [72, 64], [56, 68], [40, 64]]);
  shape(g, cuirass, TONES.bronze, [40, 44, 72, 68], { dir: 'd', gloss: 0.45, shade: 0.35, noShadow: true, ink: 1.6 });
  g.save();
  g.clip(cuirass);
  g.strokeStyle = 'rgba(0,0,0,0.3)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(48, 50);
  g.quadraticCurveTo(56, 56, 64, 50);
  g.moveTo(56, 56);
  g.lineTo(56, 66);
  g.stroke();
  g.restore();
  // spear arm (right, on the viewer's right): raised with the spear, or holding it upright
  const spearTop = shieldUp ? [84, 10] : [96, 6];
  const hand = shieldUp ? [84, 42] : [86, 28];
  const arm = line([[70, 48], hand as [number, number]]);
  stroke(g, arm, INK, 10);
  stroke(g, arm, skin.base, 6.5);
  const spear = line([[hand[0] + (spearTop[0] - hand[0]) * -0.8, hand[1] + (spearTop[1] - hand[1]) * -0.8], spearTop as [number, number]]);
  stroke(g, spear, INK, 5);
  stroke(g, spear, TONES.wood.base, 2.6);
  const head = new Path2D();
  head.moveTo(spearTop[0], spearTop[1] - 2);
  head.lineTo(spearTop[0] + 4, spearTop[1] + 6);
  head.lineTo(spearTop[0] - 4, spearTop[1] + 6);
  head.closePath();
  shape(g, head, TONES.steel, [spearTop[0] - 4, spearTop[1] - 2, spearTop[0] + 4, spearTop[1] + 6], { ink: 1.6 });
  stroke(g, ellipsePath(hand[0], hand[1], 4.5, 4.5), INK, 2);
  g.fillStyle = skin.hi;
  g.fill(ellipsePath(hand[0], hand[1], 4.5, 4.5));
  // the shield arm and the shield
  const shArm = line([[42, 48], [sx + (shieldUp ? 6 : 10), sy + (shieldUp ? 14 : -6)]]);
  stroke(g, shArm, INK, 10);
  stroke(g, shArm, skin.base, 6.5);
  hoplon(g, sx, sy, sr, flatTone(l.main, 0.28), TONES.bronze, l.motif ?? 'lambda', l.ink ?? 0xeee4cc);
  // the head: a crested Corinthian helmet (front)
  const neck = line([[56, 36], [56, 46]]);
  stroke(g, neck, INK, 9);
  stroke(g, neck, skin.base, 6);
  const crest = new Path2D();
  crest.moveTo(50, 24);
  crest.quadraticCurveTo(48, 4, 56, 2);
  crest.quadraticCurveTo(64, 4, 62, 24);
  crest.closePath();
  shape(g, crest, flatTone(0xc43a2c), [48, 2, 64, 24], { gloss: 0.3 });
  const helm = new Path2D();
  helm.moveTo(44, 30);
  helm.quadraticCurveTo(44, 14, 56, 14);
  helm.quadraticCurveTo(68, 14, 68, 30);
  helm.lineTo(67, 40);
  helm.lineTo(62, 44);
  helm.lineTo(50, 44);
  helm.lineTo(45, 40);
  helm.closePath();
  shape(g, helm, TONES.bronze, [44, 14, 68, 44], { dir: 'd', gloss: 0.45, shade: 0.4 });
  g.save();
  g.clip(helm);
  g.fillStyle = '#1b120c';
  g.beginPath();
  g.moveTo(47, 30);
  g.lineTo(54, 30);
  g.lineTo(54, 42);
  g.lineTo(58, 42);
  g.lineTo(58, 30);
  g.lineTo(65, 30);
  g.lineTo(65, 34);
  g.lineTo(59, 35);
  g.lineTo(59, 46);
  g.lineTo(53, 46);
  g.lineTo(53, 35);
  g.lineTo(47, 34);
  g.closePath();
  g.fill();
  g.restore();
}

function skinHD(g: G, l: Look, id: string): void {
  void l;
  // the army's finish: a crested helmet in profile over a shield, in its colours
  const macedon = id.includes('macedon');
  const metal = macedon ? TONES.bronze : TONES.gold;
  const field = macedon ? flatTone(0x7a3a9a, 0.3) : TONES.bronze;
  hoplon(g, 42, 68, 38, field, metal, macedon ? 'sunwheel' : 'lambda', macedon ? 0xe8c25c : 0x3a2412, !macedon);
  helmetSide(g, 70, 44, 0.8, metal, macedon ? flatTone(0x7a3a9a) : flatTone(0xf4ede0));
  if (!macedon) glint(g, 30, 50, 10, 0.55);
}

function tableHD(g: G, l: Look, id: string): void {
  void l;
  // a war table in perspective: a map board with a hex grid and two token armies
  const marble = id.includes('marble');
  const board = poly([[22, 24], [90, 24], [106, 78], [6, 78]]);
  const top = marble ? tone(0xffffff, 0xeae6de, 0xb9b4a9, 0x7d786e) : flatTone(l.main, 0.3);
  shape(g, board, top, [6, 24, 106, 78], { dir: 'd', gloss: marble ? 0.45 : 0.25, shade: 0.35 });
  g.save();
  g.clip(board);
  if (marble) {
    g.strokeStyle = 'rgba(110,105,95,0.45)';
    g.lineWidth = 1.4;
    for (const [x0, y0, x1, y1] of [[14, 70, 60, 28], [40, 76, 92, 40], [70, 30, 100, 60]]) {
      g.beginPath();
      g.moveTo(x0, y0);
      g.bezierCurveTo(x0 + 10, y0 - 18, x1 - 14, y1 + 10, x1, y1);
      g.stroke();
    }
  } else {
    // tent canvas: weave and a few scorch marks
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      g.beginPath();
      g.moveTo(10 + i * 8, 24);
      g.lineTo(2 + i * 9, 78);
      g.stroke();
    }
  }
  // the hex grid in perspective
  g.strokeStyle = marble ? 'rgba(80,75,65,0.35)' : 'rgba(40,25,10,0.35)';
  g.lineWidth = 1.1;
  for (let row = 0; row < 4; row++) {
    const y = 30 + row * 12;
    const sc = 1 + row * 0.16;
    for (let col = 0; col < 7; col++) {
      const x = 56 + (col - 3 + (row % 2) * 0.5) * 12 * sc;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k + Math.PI / 6;
        const px = x + Math.cos(a) * 6 * sc, py = y + Math.sin(a) * 5;
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.stroke();
    }
  }
  g.restore();
  // token armies: red and blue blocks, flagged
  for (const [x, y, c] of [[38, 52, 0xa83224], [70, 44, 0x46607a], [30, 64, 0xa83224], [78, 58, 0x46607a]] as [number, number, number][]) {
    const tk = roundRect(x - 5, y - 4, 10, 8, 1.5);
    shape(g, tk, flatTone(c, 0.3), [x - 5, y - 4, x + 5, y + 4], { dir: 'd', ink: 1.6, gloss: 0.35 });
    stroke(g, line([[x + 3, y - 4], [x + 3, y - 12]]), INK, 2.2);
    stroke(g, line([[x + 3, y - 4], [x + 3, y - 12]]), TONES.gold.base, 1);
  }
  // the table's edge and legs
  const edge = poly([[6, 78], [106, 78], [108, 86], [4, 86]]);
  shape(g, edge, TONES.wood, [4, 78, 108, 86], { gloss: 0.3, shade: 0.4 });
  for (const x of [14, 98]) {
    const leg = poly([[x - 4, 86], [x + 4, 86], [x + 3, 104], [x - 3, 104]]);
    shape(g, leg, TONES.wood, [x - 4, 86, x + 4, 104], { dir: 'h', gloss: 0.25, ink: 1.8 });
  }
}

/**
 * The smooth preview of a cosmetic at `px` atlas px on a side (28 UI px of
 * preview: px = 28 * K). Needs a DOM; callers fall back on `renderCosmetic`.
 */
export function renderCosmeticHD(id: string, slot: string, px: number): HTMLCanvasElement {
  const [canvas, g] = iconCanvas(px, COSMETIC_UNITS);
  const l = LOOKS[id] ?? SLOT_DEFAULT[slot] ?? SLOT_DEFAULT.banner;
  g.translate(3, 2);
  g.scale(0.94, 0.94);
  if (slot === 'emblem') emblemHD(g, l, id);
  else if (slot === 'banner') bannerHD(g, l);
  else if (slot === 'cloak') cloakHD(g, l);
  else if (slot === 'clan_flag') flagHD(g, l);
  else if (slot === 'army_skin') skinHD(g, l, id);
  else if (slot === 'crest') crestHD(g, l, id);
  else if (slot === 'aura') auraHD(g, l, id);
  else if (slot === 'pose') poseHD(g, l, id);
  else tableHD(g, l, id);
  return canvas;
}
