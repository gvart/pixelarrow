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
 *  - Packed sheets (v3, what the build ships; scripts/art/pack/) are pages of
 *    trimmed, deduplicated frames: a frame is read and recoloured from its
 *    rect only. The class is ready once its `core` pages are; an `extra` page
 *    (ambient idles, victory) loads the first time one of its clips is asked
 *    for, and that clip shows its fallback (sheetIndex) until it arrives.
 *  - Memory is bounded (sweepSheets, from the atlas sweep in src/ui/sprites.ts):
 *    an extra page nobody read for PAGE_TTL_MS (the atlas frame TTL) is
 *    dropped; core pages of classes unused for CLASS_IDLE_MS go, oldest first,
 *    while all core pages together exceed CORE_BUDGET; the colour maps are an
 *    LRU of PALETTE_CAP. sheetMemoryStats() counts the decoded bytes.
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
  CORE_ANIMS, METAL_SLOTS, SHEET_ANIMS, TIER_RULE, anchorOf, animPages, decodeSheetFrame, facingRows, frameCell, gearTier, hexColor, imageSize, metalSwap, packedCell, parseManifest, recolorMap, resolveAnim, sheetFrameId, sheetVariant,
  type MetalGroup, type SheetAnim, type SheetManifest, type SheetTier, type SheetVariant,
} from './sheetManifest';
import type { AnimTable } from './sheetAnim';

/** Pixels of a sheet image: RGBA of a region. */
export interface SheetPixels {
  w: number;
  h: number;
  read(x: number, y: number, w: number, h: number): Uint8ClampedArray;
}

/** An image of a sheet: v2's one image, or a page of a packed sheet. */
interface PageState {
  file: string;
  /** Core pages make the class ready; extra pages load when one of their clips is first asked for. */
  group: 'core' | 'extra';
  /** The size the manifest needs. */
  need: [number, number];
  status: 'idle' | 'loading' | 'ready' | 'error';
  px?: SheetPixels;
  /** When a frame was last read from it (performance.now()). */
  last: number;
}

interface Entry {
  m: SheetManifest;
  /** URL of an image file named in the manifest (null: none, e.g. a test sheet given its pixels). */
  url: (file: string) => string | null;
  rows: number[];
  anims: AnimTable;
  /** The pages each animation's frames are on. */
  animPages: Partial<Record<SheetAnim, number[]>>;
  metal: { kind: MetalGroup['kind']; colors: number[]; slots: readonly string[] }[];
  pages: PageState[];
  /** When a figure of the class was last resolved or a battle row of it was alive (performance.now()). */
  used: number;
}

/** An extra page nobody read for this long is dropped (as a battle atlas frame nobody showed). */
export const PAGE_TTL_MS = 6000;
/** A class unused for this long may lose its core pages... */
export const CLASS_IDLE_MS = 60_000;
/** ...while the core pages of all classes together decode to more than this. */
export const CORE_BUDGET = 48 * 1024 * 1024;
/** Colour maps kept (least recently used dropped first). */
export const PALETTE_CAP = 256;

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let enabled = true;
let loader: ((url: string, m: SheetManifest) => Promise<SheetPixels>) | null = null;
/** Frames drawn as a fallback because the clip's page was still loading (src/ui/sprites.ts redraws those UI rows). */
let pendingDraws = 0;
const now = () => performance.now();

/** Register a class's sheet (manifest checked); `url` resolves its image files. */
export function registerSheet(raw: unknown, url: (file: string) => string | null = () => null): SheetManifest {
  const m = parseManifest(raw);
  const anims: AnimTable = {};
  for (const [k, a] of Object.entries(m.anims)) if (a) anims[k as SheetAnim] = { frames: a.frames, fps: a.fps, strike: a.strike, hold: a.hold };
  const pages: PageState[] = m.packed
    ? m.packed.pages.map((p) => ({ file: p.file, group: p.group, need: [p.w, p.h], status: 'idle', last: 0 }))
    : [{ file: m.image!, group: 'core', need: imageSize(m), status: 'idle', last: 0 }];
  const ap: Entry['animPages'] = {};
  for (const a of SHEET_ANIMS) if (m.anims[a]) ap[a] = animPages(m, a);
  entries.set(m.class, {
    m,
    url,
    rows: facingRows(m),
    anims,
    animPages: ap,
    metal: (m.metal ?? []).map((g) => ({ kind: g.kind, colors: g.colors.map(hexColor), slots: g.slots ?? METAL_SLOTS })),
    pages,
    used: 0,
  });
  for (const k of [...palettes.keys()]) if (k.startsWith(`${m.class}|`)) palettes.delete(k);
  return m;
}

/** Give a registered sheet its pixels directly (tests, dev tools): its one image, or its pages in order (null: leave a page unloaded). */
export function setSheetPixels(cls: string, px: SheetPixels | Pix | (SheetPixels | Pix | null)[]): void {
  const e = entries.get(cls);
  if (!e) throw new Error(`setSheetPixels: no sheet for ${cls}`);
  (Array.isArray(px) ? px : [px]).forEach((p, i) => {
    const pg = e.pages[i];
    if (!pg || !p) return;
    pg.px = p instanceof Pix ? pixSource(p) : p;
    pg.status = 'ready';
    pg.last = now();
  });
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
}

/** The class is drawn from its sheet once every core page is loaded. */
const coreReady = (e: Entry) => e.pages.every((p) => p.group !== 'core' || p.status === 'ready');

function resolve(d: DollSpec): Resolved | null {
  if (!enabled || d.beast || !d.cls) return null;
  const e = entries.get(d.cls);
  if (!e) return null;
  e.used = now();
  if (coreReady(e)) return { e, tier: tierOfDoll(d), v: sheetVariant(d.look?.skin, d.seed, e.m) };
  e.pages.forEach((p, i) => p.group === 'core' && loadPage(e, i));
  return null;
}

function loadPage(e: Entry, i: number): void {
  const pg = e.pages[i];
  if (pg.status !== 'idle') return;
  const url = e.url(pg.file);
  if (!url || !loader) return;
  pg.status = 'loading';
  loader(url, e.m).then(
    (px) => {
      if (entries.get(e.m.class) !== e) return; // the class was registered again meanwhile
      if (px.w < pg.need[0] || px.h < pg.need[1]) throw new Error(`${url}: ${px.w} x ${px.h}, the manifest needs ${pg.need[0]} x ${pg.need[1]}`);
      pg.px = px;
      pg.status = 'ready';
      pg.last = now();
      notify();
    },
  ).catch((err) => {
    pg.status = 'error';
    console.warn(pg.group === 'core' ? `sprite sheet ${e.m.class} failed, drawn procedurally:` : `sprite sheet ${e.m.class}: ${pg.file} failed, its clips show their fallbacks:`, err);
  });
}

/** Whether an animation's pages are loaded; starts loading them if not. */
function animReady(e: Entry, a: SheetAnim): boolean {
  const ps = e.animPages[a];
  if (!ps) return false;
  let ok = true;
  for (const i of ps)
    if (e.pages[i].status !== 'ready') {
      ok = false;
      loadPage(e, i);
    }
  return ok;
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

/**
 * Sheet animation and frame of a frame id: a sheet id as it is, a procedural
 * column by the state it belongs to. `has` narrows the animations that can
 * show (default: those the sheet has), e.g. to those whose page is loaded.
 */
export function sheetIndex(frame: number, anims: AnimTable, has: (a: SheetAnim) => boolean = (a) => !!anims[a]): { anim: SheetAnim; i: number } {
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

/**
 * The frame id a figure can be drawn with right now: its own, or, while the
 * page of its clip is loading (which this starts), the frame of the clip's
 * fallback, so a battle atlas caches what it drew under the id it drew and
 * draws the clip itself once its page is in. Null: not a sheet figure.
 */
export function sheetDrawFrame(d: DollSpec, frame: number): number | null {
  const e = d.cls ? entries.get(d.cls) : undefined;
  if (!e) return null;
  const s = sheetIndex(frame, e.anims, (a) => !!e.anims[a] && animReady(e, a));
  return sheetFrameId(s.anim, s.i);
}

/** Count of frames drawn as a fallback while a page loads (callers compare it before and after a draw). */
export function sheetPendingDraws(): number {
  return pendingDraws;
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
  if (p) {
    // most recently used last
    palettes.delete(key);
    palettes.set(key, p);
  } else {
    p = { swap: recolorMap(e.m, s.tier, s.v), glint: new Set() };
    const swapMetal = e.m.rarity?.metal !== false;
    e.metal.forEach((g, i) => {
      const target = (g.kind === 'iron' ? ironOf(ranks[i]) : bronzeOf(ranks[i])).ramp;
      // rarity.metal false: the metal stays as drawn, but still glints (and the outline glows) by rank
      if (swapMetal) for (const [a, b] of metalSwap(g.colors, target)) p!.swap.set(a, b);
      if (ranks[i] >= 2) for (const c of g.colors) p!.glint.add(c);
    });
    palettes.set(key, p);
    while (palettes.size > PALETTE_CAP) palettes.delete(palettes.keys().next().value!);
  }
  return p;
}

/** An art frame, palette swapped: the part of the frame at (dx, dy) that has pixels, and which of them are glinting metal. */
interface ArtFrame {
  px: Pix;
  metal: Uint8Array;
  dx: number;
  dy: number;
}

/** One art frame: a packed sheet's stored rect (only it is read and recoloured), or v2's whole frame cell. */
function artFrame(s: Resolved, col: number, row: number, pal: Palette): ArtFrame {
  const m = s.e.m;
  let src: Uint8ClampedArray;
  let w = 0;
  let h = 0;
  let dx = 0;
  let dy = 0;
  if (m.packed) {
    const c = packedCell(m, col, row);
    const pg = c ? s.e.pages[c.page] : null;
    if (c && pg?.px) {
      pg.last = now();
      src = pg.px.read(c.x, c.y, c.w, c.h);
      ({ w, h, dx, dy } = c);
    } else src = new Uint8ClampedArray(0);
  } else {
    ({ w, h } = m.frame);
    const [x0, y0] = frameCell(m, col, row);
    const pg = s.e.pages[0];
    pg.last = now();
    src = pg.px!.read(x0, y0, w, h);
  }
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
  return { px, metal, dx, dy };
}

/** An art frame at full frame size (portraits). */
function wholeFrame(m: SheetManifest, a: ArtFrame): Pix {
  if (a.dx === 0 && a.dy === 0 && a.px.w === m.frame.w && a.px.h === m.frame.h) return a.px;
  const out = new Pix(m.frame.w, m.frame.h);
  for (let y = 0; y < a.px.h; y++) out.data.set(a.px.data.subarray(y * a.px.w * 4, (y + 1) * a.px.w * 4), ((a.dy + y) * m.frame.w + a.dx) * 4);
  return out;
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
  const e = s.e;
  // a clip whose page is still loading shows its fallback (the page is on its way)
  const want = sheetIndex(frame, e.anims);
  const { anim, i } = sheetIndex(frame, e.anims, (a) => !!e.anims[a] && animReady(e, a));
  if (anim !== want.anim) pendingDraws++;
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
  const aw = art.px.w;
  const ah = art.px.h;
  for (let by = 0; by < g.fh; by++) {
    const sy = an.y + Math.floor((by - cy) / k) - art.dy;
    if (sy < 0 || sy >= ah) continue;
    for (let bx = 0; bx < g.fw; bx++) {
      const sx = an.x + Math.floor((bx - cx) / k) - art.dx;
      if (sx < 0 || sx >= aw) continue;
      const si = sy * aw + sx;
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
  const art = wholeFrame(m, artFrame(s, idle.col + i, s.e.rows[2], paletteOf(s, d)));
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

// ================================================================ memory

/**
 * Bound the decoded sheet memory (called about once a second by the battle
 * atlas sweep, src/ui/sprites.ts; `inUse`: classes with live battle rows).
 * An extra page nobody read for PAGE_TTL_MS is dropped (reloaded, from the
 * browser cache, the next time one of its clips shows; its fallback shows
 * meanwhile). While the core pages of every class decode to more than
 * CORE_BUDGET, the class unused longest (and at least CLASS_IDLE_MS) loses
 * them and is drawn procedurally until a figure of it asks again.
 */
export function sweepSheets(t: number, inUse: ReadonlySet<string> = new Set()): void {
  let core = 0;
  for (const e of entries.values()) {
    if (inUse.has(e.m.class)) e.used = t;
    for (const p of e.pages) {
      if (p.status !== 'ready') continue;
      if (p.group === 'extra' && e.url(p.file) && t - p.last > PAGE_TTL_MS) dropPage(p);
      else if (p.group === 'core') core += p.need[0] * p.need[1] * 4;
    }
  }
  if (core <= CORE_BUDGET) return;
  const idle = [...entries.values()].filter((e) => !inUse.has(e.m.class) && t - e.used > CLASS_IDLE_MS && e.pages.some((p) => p.status === 'ready' && e.url(p.file)));
  idle.sort((a, b) => a.used - b.used);
  for (const e of idle) {
    if (core <= CORE_BUDGET) break;
    for (const p of e.pages)
      if (p.status === 'ready') {
        if (p.group === 'core') core -= p.need[0] * p.need[1] * 4;
        dropPage(p);
      }
    for (const k of [...palettes.keys()]) if (k.startsWith(`${e.m.class}|`)) palettes.delete(k);
  }
}

function dropPage(p: PageState): void {
  p.px = undefined;
  p.status = 'idle';
}

/** Decoded bytes the sheet caches hold (dev counter: window.__sheetMem in dev builds, the perf overlay). */
export function sheetMemoryStats(): { classes: number; pages: number; coreBytes: number; extraBytes: number; palettes: number; paletteBytes: number; bytes: number } {
  let classes = 0;
  let pages = 0;
  let coreBytes = 0;
  let extraBytes = 0;
  for (const e of entries.values()) {
    let any = false;
    for (const p of e.pages) {
      if (p.status !== 'ready' || !p.px) continue;
      any = true;
      pages++;
      const b = p.px.w * p.px.h * 4;
      if (p.group === 'core') coreBytes += b;
      else extraBytes += b;
    }
    if (any) classes++;
  }
  // a colour map: about 40 bytes per Map / Set entry plus the objects
  let paletteBytes = 0;
  for (const p of palettes.values()) paletteBytes += 200 + 40 * (p.swap.size + p.glint.size);
  return { classes, pages, coreBytes, extraBytes, palettes: palettes.size, paletteBytes, bytes: coreBytes + extraBytes + paletteBytes };
}

/** Route paperdoll's rendering through the sheets (once, from src/ui/sprites.ts). */
export function installSheetDolls(): void {
  setSheetHook({ key: sheetKey, frame: sheetFrame, portrait: sheetPortrait, geom: sheetGeom });
}

