/**
 * Sheet-backed soldiers: a class with a sprite sheet (manifest + one animated
 * image, src/art/sheetManifest.ts) is drawn from it behind paperdoll's own
 * API (renderFrame / renderFrameFx / dollKey / renderPortrait, through
 * setSheetHook), so every consumer of those (the battle's atlases, ensureDoll
 * screens, portraits, the camp) shows the sheet once it is loaded. A class
 * without one, or whose image has not loaded yet, is drawn procedurally
 * exactly as before.
 *
 *  - Frames keep the procedural geometry (dollGeom: the box, the feet line), so
 *    plates, rings, the atlases' trim and the effect overlays line up as they
 *    did. The sheet frame is placed with its anchor on the feet point and
 *    scaled by manifest.scale x (spec scale / BATTLE_SCALE) x res, snapped to a
 *    whole factor (or 1 / n) so art pixels stay square.
 *  - The image loads on demand, the first time a figure of that class is asked
 *    for (never all classes up front), and is kept as a decoded image element;
 *    frames are cut from it as the atlases ask (onSheetReady tells the battle
 *    to re-key its men once one arrives).
 *  - Tiers are recolours: the gear tier (TIER_RULE) picks the manifest's
 *    recolour of its colour groups (an elite's black cloak, gilded crest); on
 *    top, each man's skin tone (Look.skin) and a seeded shade step of cloak
 *    and crest. Both are in the figure's key, so a class shows at most
 *    3 tiers x 12 variants per rarity mix.
 *  - Rarity swaps the manifest's metal colours to the rank's ramp (bronzeOf /
 *    ironOf); metal of rank 2+ (or an army skin's polish) is the glint mask the
 *    battle's highlight sweeps across, as on procedural gear.
 */
import { ANIM, BATTLE_SCALE, NDIRS, PORTRAIT_FRAMES, dollFx, dollGeom, setSheetHook, type DollSpec, type SheetGeom } from './paperdoll';
import { Pix } from './pixels';
import { bronzeOf, ironOf } from './materials';
import { itemDef, ITEMS } from '../data/items';
import {
  CORE_ANIMS, METAL_SLOTS, TIER_RULE, anchorOf, decodeSheetFrame, facingRows, frameCell, gearTier, hexColor, imageSize, metalSwap, parseManifest, recolorMap, resolveAnim, sheetVariant,
  type MetalGroup, type SheetAnim, type SheetManifest, type SheetTier, type SheetVariant,
} from './sheetManifest';
import type { AnimTable } from './sheetAnim';

/** Pixels of a sheet image: RGBA of a region. */
export interface SheetPixels {
  w: number;
  h: number;
  read(x: number, y: number, w: number, h: number): Uint8ClampedArray;
}

interface ImageState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  px?: SheetPixels;
}

interface Entry {
  m: SheetManifest;
  /** URL of an image file named in the manifest (null: none, e.g. a test sheet given its pixels). */
  url: (file: string) => string | null;
  rows: number[];
  anims: AnimTable;
  metal: { kind: MetalGroup['kind']; colors: number[]; slots: readonly string[] }[];
  img: ImageState;
}

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let enabled = true;
let loader: ((url: string, m: SheetManifest) => Promise<SheetPixels>) | null = null;

/** Register a class's sheet (manifest checked); `url` resolves its image files. */
export function registerSheet(raw: unknown, url: (file: string) => string | null = () => null): SheetManifest {
  const m = parseManifest(raw);
  const anims: AnimTable = {};
  for (const [k, a] of Object.entries(m.anims)) if (a) anims[k as SheetAnim] = { frames: a.frames, fps: a.fps, strike: a.strike, hold: a.hold };
  entries.set(m.class, {
    m,
    url,
    rows: facingRows(m),
    anims,
    metal: (m.metal ?? []).map((g) => ({ kind: g.kind, colors: g.colors.map(hexColor), slots: g.slots ?? METAL_SLOTS })),
    img: { status: 'idle' },
  });
  for (const k of [...palettes.keys()]) if (k.startsWith(`${m.class}|`)) palettes.delete(k);
  return m;
}

/** Give a registered sheet its pixels directly (tests, dev tools). */
export function setSheetPixels(cls: string, px: SheetPixels | Pix): void {
  const e = entries.get(cls);
  if (!e) throw new Error(`setSheetPixels: no sheet for ${cls}`);
  e.img = { status: 'ready', px: px instanceof Pix ? pixSource(px) : px };
  notify();
}

/** Forget every sheet (tests). */
export function clearSheets(): void {
  entries.clear();
  palettes.clear();
}

/** Sheets off: every figure is procedural (the regression gate; ?sheets=off). */
export function setSheetsEnabled(on: boolean): void {
  enabled = on;
}
export function sheetsEnabled(): boolean {
  return enabled;
}

/** How images load (the browser's is installed by src/art/sheetRegistry.ts). */
export function setSheetLoader(fn: typeof loader): void {
  loader = fn;
}

/** Called whenever a sheet image becomes ready; returns the unsubscribe. */
export function onSheetReady(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  for (const fn of [...listeners]) fn();
}

/** Classes with a registered sheet. */
export function sheetClasses(): string[] {
  return [...entries.keys()];
}

export function pixSource(p: Pix): SheetPixels {
  return {
    w: p.w,
    h: p.h,
    read(x, y, w, h) {
      const out = new Uint8ClampedArray(w * h * 4);
      for (let r = 0; r < h; r++) {
        const sy = y + r;
        if (sy < 0 || sy >= p.h) continue;
        for (let c = 0; c < w; c++) {
          const sx = x + c;
          if (sx < 0 || sx >= p.w) continue;
          const si = (sy * p.w + sx) * 4;
          out.set(p.data.subarray(si, si + 4), (r * w + c) * 4);
        }
      }
      return out;
    },
  };
}

// ================================================================ which sheet a figure shows

/** The tier (recolour) a figure's gear calls for (TIER_RULE over its item defs' tiers). */
export function tierOfDoll(d: DollSpec): SheetTier {
  const tiers: number[] = [];
  for (const s of TIER_RULE.slots) {
    const def = d.gear?.[s]?.def;
    if (def && ITEMS[def]) tiers.push(itemDef(def).tier);
  }
  return gearTier(tiers);
}

const rankOf = (r?: number) => Math.max(0, Math.min(4, r ?? 1));

/** Rarity rank of each metal group (the highest of its slots; an army skin's polish lifts bronze to 2). */
function metalRanks(e: Entry, d: DollSpec): number[] {
  return e.metal.map((g) => {
    let r = 0;
    for (const s of g.slots) r = Math.max(r, rankOf(d.gear?.[s as keyof NonNullable<DollSpec['gear']>]?.r));
    return d.polish && g.kind === 'bronze' ? Math.max(2, r) : r;
  });
}

interface Resolved {
  e: Entry;
  tier: SheetTier;
  v: SheetVariant;
  px: SheetPixels;
}

function resolve(d: DollSpec): Resolved | null {
  if (!enabled || d.beast || !d.cls) return null;
  const e = entries.get(d.cls);
  if (!e) return null;
  const st = e.img;
  if (st.status === 'ready' && st.px) return { e, tier: tierOfDoll(d), v: sheetVariant(d.look?.skin, d.seed), px: st.px };
  if (st.status === 'idle') load(e, st);
  return null;
}

function load(e: Entry, st: ImageState): void {
  const url = e.url(e.m.image);
  if (!url || !loader) return;
  st.status = 'loading';
  loader(url, e.m).then(
    (px) => {
      const need = imageSize(e.m);
      if (px.w < need[0] || px.h < need[1]) throw new Error(`${url}: ${px.w} x ${px.h}, the manifest needs ${need[0]} x ${need[1]}`);
      st.px = px;
      st.status = 'ready';
      notify();
    },
  ).catch((err) => {
    st.status = 'error';
    console.warn(`sprite sheet ${e.m.class} failed, drawn procedurally:`, err);
  });
}

/** The animations of a figure's sheet (null: no sheet loaded, the figure is procedural). */
export function sheetAnimsOf(d: DollSpec): AnimTable | null {
  return resolve(d)?.e.anims ?? null;
}

/** Whether a figure is drawn from a sheet right now. */
export function isSheetDoll(d: DollSpec): boolean {
  return !!resolve(d);
}

function sheetKey(d: DollSpec): string | null {
  const s = resolve(d);
  if (!s) return null;
  const fx = dollFx(d);
  const ranks = metalRanks(s.e, d).join('');
  let k = `sheet_${d.cls}.${s.tier}.${s.v.skin}${s.v.shade}_${ranks}${d.polish ? 'p' : ''}_${fx.rank}${fx.particles ?? ''}`;
  if (d.scale && d.scale !== 1) k += `@${d.scale}`;
  if (d.res && d.res !== 1) k += `#r${d.res}`;
  return k;
}

// ================================================================ frames

/** Sheet animation and frame of a frame id: a sheet id as it is, a procedural column by the state it belongs to. */
export function sheetIndex(frame: number, anims: AnimTable): { anim: SheetAnim; i: number } {
  const has = (a: SheetAnim) => !!anims[a];
  const sf = decodeSheetFrame(frame);
  if (sf) {
    const anim = resolveAnim(sf.anim, has);
    return { anim, i: Math.min(anims[anim]!.frames - 1, sf.i) };
  }
  for (const c of CORE_ANIMS) {
    const seq = ANIM[c] as readonly number[];
    const j = seq.indexOf(frame);
    if (j < 0) continue;
    const anim = resolveAnim(c, has);
    const n = anims[anim]!.frames;
    return { anim, i: Math.min(n - 1, Math.floor((j * n) / seq.length)) };
  }
  return { anim: 'idle', i: 0 };
}

interface Palette {
  swap: Map<number, number>;
  glint: Set<number>;
}
const palettes = new Map<string, Palette>();

/** The figure's colour map: tier recolour and variant on the colour groups, rarity on the metal (bounded: tiers x variants x rank mixes per class). */
function paletteOf(s: Resolved, d: DollSpec): Palette {
  const e = s.e;
  const ranks = metalRanks(e, d);
  const key = `${e.m.class}|${s.tier}|${s.v.skin}${s.v.shade}|${ranks.join('')}`;
  let p = palettes.get(key);
  if (!p) {
    p = { swap: recolorMap(e.m, s.tier, s.v), glint: new Set() };
    e.metal.forEach((g, i) => {
      const target = (g.kind === 'iron' ? ironOf(ranks[i]) : bronzeOf(ranks[i])).ramp;
      for (const [a, b] of metalSwap(g.colors, target)) p!.swap.set(a, b);
      if (ranks[i] >= 2) for (const c of g.colors) p!.glint.add(c);
    });
    palettes.set(key, p);
  }
  return p;
}

/** One art frame (art pixels, palette swapped), plus which pixels are glinting metal. */
function artFrame(s: Resolved, col: number, row: number, pal: Palette): { px: Pix; metal: Uint8Array } {
  const { w, h } = s.e.m.frame;
  const [x0, y0] = frameCell(s.e.m, col, row);
  const src = s.px.read(x0, y0, w, h);
  const px = new Pix(w, h);
  const metal = new Uint8Array(w * h);
  const o = px.data;
  for (let i = 0; i < w * h; i++) {
    const a = src[i * 4 + 3];
    if (!a) continue;
    const rgb = (src[i * 4] << 16) | (src[i * 4 + 1] << 8) | src[i * 4 + 2];
    const c = pal.swap.get(rgb) ?? rgb;
    o[i * 4] = (c >> 16) & 255;
    o[i * 4 + 1] = (c >> 8) & 255;
    o[i * 4 + 2] = c & 255;
    o[i * 4 + 3] = a;
    if (pal.glint.has(rgb)) metal[i] = 1;
  }
  return { px, metal };
}

/** Art px -> rendered px for a figure: manifest scale x model scale / BATTLE_SCALE x res, snapped to n or 1 / n. */
export function sheetFactor(m: SheetManifest, d: DollSpec): number {
  const raw = (m.scale * (d.scale ?? 1) * (d.res ?? 1)) / BATTLE_SCALE;
  return raw >= 1 ? Math.max(1, Math.round(raw)) : 1 / Math.max(1, Math.round(1 / raw));
}

function sheetFrame(d: DollSpec, frame: number, dir: number, mask?: Uint8Array): Pix | null {
  const s = resolve(d);
  if (!s) return null;
  const g = dollGeom(d);
  const m = s.e.m;
  const { anim, i } = sheetIndex(frame, s.e.anims);
  const col = m.anims[anim]!.col + i;
  const row = s.e.rows[Math.max(0, Math.min(NDIRS - 1, dir))];
  const an = anchorOf(m, row);
  const art = artFrame(s, col, row, paletteOf(s, d));
  const k = sheetFactor(m, d);
  const out = new Pix(g.fw, g.fh);
  const cx = Math.floor(g.fw / 2);
  const cy = g.footY;
  const ad = art.px.data;
  const od = out.data;
  for (let by = 0; by < g.fh; by++) {
    const sy = an.y + Math.floor((by - cy) / k);
    if (sy < 0 || sy >= m.frame.h) continue;
    for (let bx = 0; bx < g.fw; bx++) {
      const sx = an.x + Math.floor((bx - cx) / k);
      if (sx < 0 || sx >= m.frame.w) continue;
      const si = sy * m.frame.w + sx;
      if (!ad[si * 4 + 3]) continue;
      const oi = by * g.fw + bx;
      od.set(ad.subarray(si * 4, si * 4 + 4), oi * 4);
      if (mask && art.metal[si]) mask[oi] = 1;
    }
  }
  return out;
}

// ================================================================ portraits

/** A bust cut from the front-facing idle frame, scaled into the box (breathing on the idle frames). */
function sheetPortrait(d: DollSpec, frame: number, res: number, box: number): Pix | null {
  const s = resolve(d);
  if (!s) return null;
  const m = s.e.m;
  const name = PORTRAIT_FRAMES[frame] ?? 'neutral';
  const idle = m.anims.idle!;
  const i = Math.min(idle.frames - 1, name === 'breath1' ? 1 : name === 'breath2' ? 2 : 0);
  // game row 2 faces the viewer
  const art = artFrame(s, idle.col + i, s.e.rows[2], paletteOf(s, d)).px;
  const crop = m.portrait ?? autoCrop(art, anchorOf(m, s.e.rows[2]));
  const size = box * res;
  const out = new Pix(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const sx = crop.x + Math.floor((x * crop.size) / size);
      const sy = crop.y + Math.floor((y * crop.size) / size);
      if (!art.inside(sx, sy)) continue;
      const si = (sy * art.w + sx) * 4;
      if (art.data[si + 3]) out.data.set(art.data.subarray(si, si + 4), (y * size + x) * 4);
    }
  return out;
}

/**
 * Head and shoulders: a square from just above the head, 40% of the figure's
 * height, centred on the anchor. The head is the highest pixel within 2 px of
 * the anchor's column, so a spear held at the side or a banner does not count.
 */
function autoCrop(art: Pix, an: { x: number; y: number }): { x: number; y: number; size: number } {
  let top = -1;
  for (let y = 0; y < art.h && top < 0; y++) for (let x = an.x - 2; x <= an.x + 2; x++) if (art.alpha(x, y) > 0) top = y;
  if (top < 0) return { x: 0, y: 0, size: Math.min(art.w, art.h) };
  const size = Math.max(4, Math.round((an.y - top) * 0.4));
  return { x: an.x - Math.floor(size / 2), y: Math.max(0, top - 1), size };
}

/**
 * The frame box of a sheet figure: the procedural box, widened (about the
 * feet, so plates, rings and overlays stay put) to hold the whole art frame
 * of every row, e.g. a spear reaching far ahead in a thrust.
 */
function sheetGeom(d: DollSpec, base: SheetGeom): SheetGeom | null {
  const s = resolve(d);
  if (!s) return null;
  const m = s.e.m;
  const k = sheetFactor(m, d);
  let half = Math.floor(base.fw / 2);
  let up = base.footY;
  let down = base.fh - base.footY;
  for (const row of new Set(s.e.rows)) {
    const an = anchorOf(m, row);
    half = Math.max(half, Math.ceil(Math.max(an.x, m.frame.w - an.x) * k));
    up = Math.max(up, Math.ceil(an.y * k));
    down = Math.max(down, Math.ceil((m.frame.h - an.y) * k));
  }
  if (half * 2 === base.fw && up === base.footY && down === base.fh - base.footY) return null;
  return { fw: half * 2, fh: up + down, footY: up };
}

/** Route paperdoll's rendering through the sheets (once, from src/ui/sprites.ts). */
export function installSheetDolls(): void {
  setSheetHook({ key: sheetKey, frame: sheetFrame, portrait: sheetPortrait, geom: sheetGeom });
}

