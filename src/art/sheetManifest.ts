/**
 * Sprite-sheet manifests: the format a pre-made (PixelLab) soldier sheet ships
 * with, and the pure rules around it (no DOM, no Phaser): the animation set and
 * its fallbacks, frame ids, the gear-tier rule, the tier recolour and the
 * rarity palette swap. The format is documented in docs/v5/art/SHEET_FORMAT.md.
 *
 * A class has one manifest and ONE animated image (rows are facings, columns
 * are animation frames). Its veteran and elite tiers are recolours of named
 * colour groups (cloak, crest, trim...) of that image, done at runtime.
 */
import { CLASSES, type ClassId } from '../data/classes';
import { CLASS_GEAR, classGearBlocker } from '../data/gearRules';
import { ITEMS } from '../data/items';

// ================================================================ animations

/**
 * Every animation a sheet may carry. The first ten are the procedural
 * renderer's states (paperdoll ANIM); the rest are new and fall back to them
 * (ANIM_FALLBACK) when a sheet lacks them.
 */
export const SHEET_ANIMS = [
  // the procedural states
  'idle', 'walk', 'run', 'attack', 'block', 'hit', 'die', 'dieB', 'rout', 'win',
  // per-weapon attacks
  'thrust', 'slash', 'throw', 'shoot', 'sling',
  // formation stances
  'brace', 'charge', 'ready',
  // richer hit and death
  'stagger', 'fallFwd', 'fallBack', 'kneel',
  // ambient idles
  'look', 'adjust', 'cheer',
  // a missile man's short melee jab; riders' gallop; the chariot's drive and wreck
  'stab', 'gallop', 'drive', 'wreck',
] as const;
export type SheetAnim = (typeof SHEET_ANIMS)[number];

/** The procedural states (they have paperdoll columns). */
export const CORE_ANIMS = ['idle', 'walk', 'run', 'attack', 'block', 'hit', 'die', 'dieB', 'rout', 'win'] as const;
export type CoreAnim = (typeof CORE_ANIMS)[number];

/**
 * What to show when a sheet lacks an animation: the candidates in order, each
 * followed through its own fallbacks (depth first, no animation twice), and
 * `idle` (required) at the end. Pairs like hit / stagger and block / brace
 * stand in for each other, so a sheet with either serves both.
 */
export const ANIM_FALLBACK: Record<SheetAnim, readonly SheetAnim[]> = {
  idle: [],
  walk: ['run'],
  run: ['walk', 'charge'],
  attack: ['thrust', 'slash'],
  block: ['brace'],
  hit: ['stagger'],
  die: ['fallFwd', 'fallBack', 'hit'],
  dieB: ['fallBack', 'die'],
  rout: ['gallop', 'run'],
  win: ['cheer'],
  thrust: ['attack'],
  slash: ['thrust', 'attack'],
  throw: ['shoot', 'attack'],
  shoot: ['attack'],
  sling: ['throw'],
  brace: ['block'],
  charge: ['gallop', 'run'],
  ready: [],
  stagger: ['hit'],
  fallFwd: ['die'],
  fallBack: ['dieB'],
  kneel: ['die'],
  look: [],
  adjust: [],
  cheer: ['win'],
  stab: ['thrust'],
  gallop: ['run'],
  drive: ['gallop', 'run'],
  wreck: ['die'],
};

/** The first animation found from `a` through its fallbacks that satisfies `ok` (null: none). */
function searchAnim(a: SheetAnim, ok: (a: SheetAnim) => boolean, seen = new Set<SheetAnim>()): SheetAnim | null {
  if (seen.has(a)) return null;
  seen.add(a);
  if (ok(a)) return a;
  for (const b of ANIM_FALLBACK[a]) {
    const r = searchAnim(b, ok, seen);
    if (r) return r;
  }
  return null;
}

/** The animation `a` shows as on a sheet that has `has`. */
export function resolveAnim(a: SheetAnim, has: (a: SheetAnim) => boolean): SheetAnim {
  return searchAnim(a, has) ?? 'idle';
}

/** The procedural state an animation falls back to (for a figure drawn without a sheet). */
export function coreAnimOf(a: SheetAnim): CoreAnim {
  return (searchAnim(a, (x) => (CORE_ANIMS as readonly string[]).includes(x)) ?? 'idle') as CoreAnim;
}

// ================================================================ frame ids

/**
 * Sheet frame ids, above every procedural column (0..39): base + anim * 64 +
 * frame. A sheet figure is asked for these by the battle; a procedural figure
 * given one shows the fallback state's column (see coreAnimOf).
 */
export const SHEET_FRAME_BASE = 1024;
const PER_ANIM = 64;

export function sheetFrameId(a: SheetAnim, i: number): number {
  return SHEET_FRAME_BASE + SHEET_ANIMS.indexOf(a) * PER_ANIM + Math.max(0, Math.min(PER_ANIM - 1, Math.floor(i)));
}

export function isSheetFrame(id: number): boolean {
  return id >= SHEET_FRAME_BASE;
}

export function decodeSheetFrame(id: number): { anim: SheetAnim; i: number } | null {
  if (id < SHEET_FRAME_BASE) return null;
  const k = id - SHEET_FRAME_BASE;
  const anim = SHEET_ANIMS[Math.floor(k / PER_ANIM)];
  return anim ? { anim, i: k % PER_ANIM } : null;
}

// ================================================================ the manifest

export const SHEET_TIERS = ['basic', 'veteran', 'elite'] as const;
export type SheetTier = (typeof SHEET_TIERS)[number];

/** PixelLab's eight directions (row names); the game uses four of them. */
export const SHEET_DIRECTIONS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'] as const;
export type SheetDirection = (typeof SHEET_DIRECTIONS)[number];
/**
 * The default facing of each game row (paperdoll DIRS): 0 faces field +x
 * (screen down-right), 1 field -y (up-right, from behind), 2 field +y
 * (down-left, from the front), 3 field -x (up-left).
 */
export const DEFAULT_FACINGS: readonly SheetDirection[] = ['south-east', 'north-east', 'south-west', 'north-west'];

/** Gear slots a metal group can follow for its rarity. */
export type MetalSlot = 'weapon' | 'shield' | 'helmet' | 'armor';
export const METAL_SLOTS: readonly MetalSlot[] = ['weapon', 'shield', 'helmet', 'armor'];
/** The finishes the rarity swap knows (src/art/materials.ts bronzeOf / ironOf). */
export type MetalKind = 'bronze' | 'iron';

export interface SheetAnimDef {
  /** First column of the animation in the image. */
  col: number;
  frames: number;
  fps: number;
  /**
   * Attacks: the frame the blow lands or the missile leaves on, shown at the
   * sim's attack; the frames before it are the windup / draw / whirl, played
   * just before. Default frames / 2.
   */
  strike?: number;
  /**
   * Loops with an entry (brace, kneel, cheer, ready): the first frame of the
   * looping part; the frames before it play once on entering the state.
   * Default 0 (the whole clip loops).
   */
  hold?: number;
}

export interface MetalGroup {
  kind: MetalKind;
  /** The exact colours of this metal in the art, light to dark ('#rrggbb'). */
  colors: string[];
  /** The gear whose rarity sets the finish (highest wins). Default: all four. */
  slots?: MetalSlot[];
}

/** A tier's recolour: per colour group, the colours that replace the group's (same length, dark to light). */
export type TierRecolor = Record<string, string[]>;

/** A page of a packed sheet (v3): one PNG of trimmed frames. */
export interface PackedPage {
  file: string;
  w: number;
  h: number;
  /** `core` pages load with the class; `extra` ones (ambient idles, victory) the first time one of their clips shows. */
  group: 'core' | 'extra';
}

/**
 * The frame table of a packed sheet (v3, written by scripts/art/pack/): frames
 * trimmed to their opaque box, identical ones stored once, on pages.
 */
export interface PackedSheet {
  pages: PackedPage[];
  /** Stored frames, 5 numbers each: page, x, y, w, h. */
  rects: number[];
  /** Per frame (index col * rows.length + row), 3 numbers: stored frame (-1: empty), and its offset dx, dy in the frame. */
  cells: number[];
  /** The image it was packed from (provenance). */
  source?: { image: string; w: number; h: number; sha1: string };
}

export interface SheetManifest {
  /** 2: one image (`image`); 3: packed pages (`packed`), as the build ships it. */
  version: 2 | 3;
  /** Class id (src/data/classes.ts). */
  class: string;
  /** v2: the image (relative to the manifest): every animation of the class, in basic tier colours. */
  image?: string;
  /** v3: the packed pages and frame table (replaces `image` and `wrap`). */
  packed?: PackedSheet;
  /** Frame size in art pixels; every frame has it. */
  frame: { w: number; h: number };
  /**
   * Columns per band (default: all in one band). A wide sheet wraps: column c
   * sits at x (c % wrap) * frame.w in band floor(c / wrap), and each band
   * holds every row, so its y is (band * rows.length + row) * frame.h.
   */
  wrap?: number;
  /** The art pixel the figure stands on (feet centre for men, between the hooves / wheels otherwise). */
  anchor: { x: number; y: number };
  /** Per image row (by its name): its own anchor, e.g. feet off centre so a spear reaching ahead fits a narrower frame. Default `anchor`. */
  anchors?: Partial<Record<SheetDirection, { x: number; y: number }>>;
  /**
   * Game px per art px on the battlefield (a DollSpec at BATTLE_SCALE, res 1).
   * The battle draws at BATTLE_RES 2, so 0.5 and 1 map art pixels to whole
   * rendered pixels; other screens snap the factor to a whole number.
   */
  scale: number;
  /** Row names of the image, top to bottom (any of SHEET_DIRECTIONS). */
  rows: SheetDirection[];
  /** The row each game facing shows (default DEFAULT_FACINGS); never mirrored. */
  facings?: SheetDirection[];
  /**
   * Recolourable groups: the exact colours of each in the image, dark to
   * light ('#rrggbb'). `skin` takes each man's skin tone, `cloak` and `crest`
   * a slight per-man shade (SKIN_TONES, SHADE_STEPS); any group can be
   * recoloured per tier. A colour belongs to one group at most, never to metal.
   */
  colorGroups?: Record<string, string[]>;
  /** Per tier, the groups it recolours (basic is usually {}: the image as drawn). */
  tiers?: Partial<Record<SheetTier, TierRecolor>>;
  anims: Partial<Record<SheetAnim, SheetAnimDef>>;
  metal?: MetalGroup[];
  /** Bust crop for portraits (art px, a square at x, y): default from the idle frame's bounds. */
  portrait?: { x: number; y: number; size: number };
  /**
   * Per-man variation (default: both on). `skin: false` keeps the skin group as
   * drawn (no Look.skin tone), `shade: false` the cloak and crest (no shade
   * step): e.g. a horse whose coat shares the rider's skin colours.
   */
  variation?: { skin?: boolean; shade?: boolean };
  /**
   * Rarity (default on). `metal: false` keeps the metal colours as drawn (no
   * ramp swap); the glint mask (rank 2+) and the outline glow stay.
   */
  rarity?: { metal?: boolean };
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const GROUP_NAME = /^[a-z][a-zA-Z0-9]*$/;

/** Check a manifest (from JSON); throws with every problem listed. */
export function parseManifest(raw: unknown): SheetManifest {
  const m = raw as SheetManifest;
  const errs: string[] = [];
  const num = (v: unknown, min = 0) => typeof v === 'number' && Number.isFinite(v) && v >= min;
  if (!m || typeof m !== 'object') throw new Error('sheet manifest: not an object');
  if (m.version !== 2 && m.version !== 3) errs.push('version must be 2 (one image, tiers by recolour) or 3 (packed)');
  if (typeof m.class !== 'string' || !m.class) errs.push('class missing');
  if (!m.frame || !num(m.frame.w, 1) || !num(m.frame.h, 1)) errs.push('frame.w / frame.h must be positive');
  if (!m.anchor || !num(m.anchor.x) || !num(m.anchor.y)) errs.push('anchor.x / anchor.y missing');
  for (const [r, a] of Object.entries(m.anchors ?? {})) {
    if (!m.rows?.includes(r as SheetDirection)) errs.push(`anchors.${r}: not a row of the image`);
    if (!a || !num(a.x) || !num(a.y) || (m.frame && (a.x > m.frame.w || a.y > m.frame.h))) errs.push(`anchors.${r}: x / y inside the frame`);
  }
  if (!num(m.scale) || m.scale <= 0) errs.push('scale must be positive');
  if (!Array.isArray(m.rows) || !m.rows.length || m.rows.some((r) => !SHEET_DIRECTIONS.includes(r))) errs.push('rows must name directions');
  const facings = m.facings ?? DEFAULT_FACINGS;
  if (facings.length !== 4 || facings.some((f) => !m.rows?.includes(f))) errs.push('facings must name four rows of the image');
  if (m.version === 2 && (typeof m.image !== 'string' || !m.image)) errs.push('image missing');
  if (m.version === 3) errs.push(...packedErrors(m));
  if (m.wrap !== undefined && (!num(m.wrap, 1) || !Number.isInteger(m.wrap))) errs.push('wrap must be a whole number of columns');
  const owner = new Map<string, string>();
  for (const g of m.metal ?? []) for (const c of g.colors ?? []) owner.set(String(c).toLowerCase(), 'metal');
  for (const [name, cs] of Object.entries(m.colorGroups ?? {})) {
    if (!GROUP_NAME.test(name)) errs.push(`colorGroups.${name}: bad name`);
    if (!Array.isArray(cs) || !cs.length || cs.some((c) => !HEX.test(c))) {
      errs.push(`colorGroups.${name} must be #rrggbb colours`);
      continue;
    }
    for (const c of cs) {
      const o = owner.get(c.toLowerCase());
      if (o) errs.push(`colorGroups.${name}: ${c} is also in ${o}`);
      owner.set(c.toLowerCase(), name);
    }
  }
  for (const [t, rc] of Object.entries(m.tiers ?? {})) {
    if (!(SHEET_TIERS as readonly string[]).includes(t)) errs.push(`unknown tier ${t}`);
    for (const [name, cs] of Object.entries(rc ?? {})) {
      const src = m.colorGroups?.[name];
      if (!src) errs.push(`tiers.${t}.${name}: no such colour group`);
      else if (!Array.isArray(cs) || cs.length !== src.length || cs.some((c) => !HEX.test(c))) errs.push(`tiers.${t}.${name} must be ${src.length} #rrggbb colours`);
    }
  }
  if (!m.anims?.idle) errs.push('anims.idle is required');
  const used: [number, number, string][] = [];
  for (const [name, a] of Object.entries(m.anims ?? {})) {
    if (!(SHEET_ANIMS as readonly string[]).includes(name)) errs.push(`unknown animation ${name}`);
    if (!a || !num(a.col) || !num(a.frames, 1) || a.frames > 64 || !num(a.fps) || a.fps <= 0) {
      errs.push(`anims.${name}: col, frames (1..64) and fps are required`);
      continue;
    }
    if (a.strike !== undefined && (!num(a.strike) || a.strike >= a.frames)) errs.push(`anims.${name}.strike out of range`);
    if (a.hold !== undefined && (!num(a.hold) || a.hold >= a.frames)) errs.push(`anims.${name}.hold out of range`);
    for (const [c0, c1, other] of used) if (a.col < c1 && a.col + a.frames > c0) errs.push(`anims.${name} overlaps ${other}`);
    used.push([a.col, a.col + a.frames, name]);
  }
  for (const g of m.metal ?? []) {
    if (g.kind !== 'bronze' && g.kind !== 'iron') errs.push(`metal kind ${g.kind} unknown`);
    if (!Array.isArray(g.colors) || !g.colors.length || g.colors.some((c) => !HEX.test(c))) errs.push('metal colors must be #rrggbb');
    if (g.slots && g.slots.some((s) => !METAL_SLOTS.includes(s))) errs.push(`metal slots ${g.slots.join(',')} unknown`);
  }
  for (const [f, keys] of [['variation', ['skin', 'shade']], ['rarity', ['metal']]] as const) {
    const o = (m as unknown as Record<string, unknown>)[f];
    if (o === undefined) continue;
    if (!o || typeof o !== 'object') errs.push(`${f} must be an object`);
    else for (const [k, v] of Object.entries(o)) if (!(keys as readonly string[]).includes(k) || typeof v !== 'boolean') errs.push(`${f}.${k}: unknown or not true / false`);
  }
  if (errs.length) throw new Error(`sheet manifest ${m.class ?? '?'}: ${errs.join('; ')}`);
  return m;
}

/** What is wrong with a v3 manifest's frame table (frame size and anims already read). */
function packedErrors(m: SheetManifest): string[] {
  const p = m.packed;
  if (!p || !Array.isArray(p.pages) || !p.pages.length || !Array.isArray(p.rects) || !Array.isArray(p.cells)) return ['packed: pages, rects and cells are required'];
  const errs: string[] = [];
  const whole = (v: unknown, min = 0) => Number.isInteger(v) && (v as number) >= min;
  p.pages.forEach((pg, i) => {
    if (typeof pg.file !== 'string' || !pg.file || !whole(pg.w, 1) || !whole(pg.h, 1) || pg.w > MAX_PAGE || pg.h > MAX_PAGE) errs.push(`packed.pages[${i}]: file and w / h (1..${MAX_PAGE})`);
    if (pg.group !== 'core' && pg.group !== 'extra') errs.push(`packed.pages[${i}].group must be core or extra`);
  });
  if (p.rects.length % 5) errs.push('packed.rects: 5 numbers per frame');
  for (let i = 0; i + 4 < p.rects.length; i += 5) {
    const [pg, x, y, w, h] = p.rects.slice(i, i + 5);
    const page = p.pages[pg];
    if (!page || !whole(x) || !whole(y) || !whole(w, 1) || !whole(h, 1) || x + w > page.w || y + h > page.h) {
      errs.push(`packed.rects[${i / 5}] is not inside its page`);
      break;
    }
  }
  if (!m.rows?.length || !m.frame || !m.anims) return errs;
  if (p.cells.length !== manifestColumns(m) * m.rows.length * 3) errs.push(`packed.cells: 3 numbers for each of the ${manifestColumns(m) * m.rows.length} frames`);
  const n = p.rects.length / 5;
  for (let i = 0; i + 2 < p.cells.length; i += 3) {
    const [r, dx, dy] = p.cells.slice(i, i + 3);
    if (r === -1) continue;
    if (!whole(r) || r >= n || !whole(dx) || !whole(dy) || dx + p.rects[r * 5 + 3] > m.frame.w || dy + p.rects[r * 5 + 4] > m.frame.h) {
      errs.push(`packed.cells[${i / 3}] is not a stored frame inside the frame`);
      break;
    }
  }
  if (!errs.length && m.anims.idle && animPages(m, 'idle').some((i) => p.pages[i].group !== 'core')) errs.push('packed: idle must be on core pages');
  return errs;
}

/** Widest / tallest page of a packed sheet. */
export const MAX_PAGE = 2048;

/** A frame of a packed sheet: its stored rect (page, x, y, w, h) and offset in the frame (null: empty). */
export function packedCell(m: SheetManifest, col: number, row: number): { page: number; x: number; y: number; w: number; h: number; dx: number; dy: number } | null {
  const p = m.packed!;
  const i = (col * m.rows.length + row) * 3;
  const r = p.cells[i];
  if (r === undefined || r < 0) return null;
  const k = r * 5;
  return { page: p.rects[k], x: p.rects[k + 1], y: p.rects[k + 2], w: p.rects[k + 3], h: p.rects[k + 4], dx: p.cells[i + 1], dy: p.cells[i + 2] };
}

/** The pages an animation's frames are on (v2: the one image, page 0). */
export function animPages(m: SheetManifest, a: SheetAnim): number[] {
  const def = m.anims[a];
  if (!def) return [];
  if (!m.packed) return [0];
  const out = new Set<number>();
  for (let c = def.col; c < def.col + def.frames; c++)
    for (let r = 0; r < m.rows.length; r++) {
      const cell = packedCell(m, c, r);
      if (cell) out.add(cell.page);
    }
  return [...out];
}

/** Columns of the layout (frames of every animation, end to end). */
export function manifestColumns(m: SheetManifest): number {
  let n = 0;
  for (const a of Object.values(m.anims)) if (a) n = Math.max(n, a.col + a.frames);
  return n;
}

/** Top-left art pixel of a column's frame in an image row (wrapped sheets: its band). */
export function frameCell(m: SheetManifest, col: number, row: number): [number, number] {
  const wrap = m.wrap ?? Infinity;
  const band = Math.floor(col / wrap);
  return [(col - band * (m.wrap ?? 0)) * m.frame.w, (band * m.rows.length + row) * m.frame.h];
}

/** The image size the layout needs (art px). */
export function imageSize(m: SheetManifest): [number, number] {
  const cols = manifestColumns(m);
  const per = Math.min(cols, m.wrap ?? cols);
  return [per * m.frame.w, Math.ceil(cols / per) * m.rows.length * m.frame.h];
}

/** The anchor of an image row (its own, else the manifest's). */
export function anchorOf(m: SheetManifest, row: number): { x: number; y: number } {
  return m.anchors?.[m.rows[row]] ?? m.anchor;
}

/** The image row of each game facing. */
export function facingRows(m: SheetManifest): number[] {
  return (m.facings ?? DEFAULT_FACINGS).map((f) => m.rows.indexOf(f));
}

// ================================================================ gear tier

/**
 * Which of the three tiers (recolours) a man shows, from what he wears, judged
 * against his own class. His gear score is the summed item tier
 * (src/data/items.ts ItemDef.tier, 1..3) of his weapon, shield, helmet and
 * armour over the slots his class may fill (src/data/gearRules.ts CLASS_GEAR),
 * an empty slot counting 0, so more or better gear never lowers the look.
 * The class's band is the score range of its kit (src/data/classes.ts, all
 * three kit tiers): basic is its bottom third, veteran the middle, elite the
 * top. A kit that never varies (royal guard) takes the range of everything
 * the class may equip instead. Rarity does not move the tier: it is the
 * metal's palette swap.
 */
export const TIER_RULE = { slots: ['weapon', 'shield', 'helmet', 'armor'] as const };

export interface TierBand {
  /** Slots the class may fill: the score's divisor. */
  slots: number;
  /** Score range the thirds split. */
  lo: number;
  hi: number;
  veteranFrom: number;
  eliteFrom: number;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

function tierBand(cls: string): TierBand | null {
  const c = CLASSES[cls as ClassId];
  if (!c || !CLASS_GEAR[cls]) return null;
  const defs = Object.values(ITEMS);
  const slots = TIER_RULE.slots.filter((s) => defs.some((d) => d.slot === s && classGearBlocker(cls, d) === null));
  const n = slots.length;
  const tierOf = (id: string) => (id && ITEMS[id] ? ITEMS[id].tier : 0);
  const kitSums = [0, 1, 2].flatMap((t) => {
    const opts = slots.map((s) => (c.kit[s]?.[t]?.length ? c.kit[s]![t].map(tierOf) : [0]));
    return [sum(opts.map((o) => Math.min(...o))), sum(opts.map((o) => Math.max(...o)))];
  });
  let lo = Math.min(...kitSums) / n;
  let hi = Math.max(...kitSums) / n;
  if (hi - lo < 1 / n) {
    const equip = slots.map((s) => defs.filter((d) => d.slot === s && classGearBlocker(cls, d) === null).map((d) => d.tier));
    lo = sum(equip.map((e) => Math.min(...e))) / n;
    hi = sum(equip.map((e) => Math.max(...e))) / n;
  }
  return { slots: n, lo, hi, veteranFrom: lo + (hi - lo) / 3, eliteFrom: lo + (2 * (hi - lo)) / 3 };
}

/** Per class (every class with gear), its tier band, worked out once from the data. */
export const TIER_BANDS: Readonly<Record<string, TierBand>> = Object.fromEntries(
  Object.keys(CLASS_GEAR).flatMap((c) => {
    const b = tierBand(c);
    return b ? [[c, b]] : [];
  }),
);

/** The tier of a man of class `cls` wearing items of these tiers (one per filled TIER_RULE slot). A class without gear is basic. */
export function gearTier(cls: string, itemTiers: readonly number[]): SheetTier {
  const b = TIER_BANDS[cls];
  if (!b) return 'basic';
  const score = sum(itemTiers) / b.slots + 1e-9;
  return score >= b.eliteFrom ? 'elite' : score >= b.veteranFrom ? 'veteran' : 'basic';
}

// ================================================================ rarity palette swap

/**
 * Colour map of a metal group for a rarity rank: the art's colours (light to
 * dark) spread over the target ramp (light to dark) by position.
 */
export function metalSwap(colors: readonly number[], target: readonly number[]): Map<number, number> {
  const out = new Map<number, number>();
  const n = colors.length;
  for (let j = 0; j < n; j++) out.set(colors[j], target[n === 1 ? 0 : Math.round((j * (target.length - 1)) / (n - 1))]);
  return out;
}

export const hexColor = (s: string): number => parseInt(s.slice(1), 16);

// ================================================================ tier recolour and per-man variation

/** A colour's channels scaled by k (clamped), 0xrrggbb. */
export function shadeColor(c: number, k: number): number {
  const ch = (sh: number) => Math.max(0, Math.min(255, Math.round(((c >> sh) & 255) * k)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** `c` moved towards `to` by t (0..1). */
export function mixColor(c: number, to: number, t: number): number {
  const ch = (sh: number) => Math.round(((c >> sh) & 255) * (1 - t) + ((to >> sh) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/**
 * Skin tones by Look.skin (0 fair, 1 olive, 2 tanned, 3 dark) as a change of
 * the sheet's own skin ramp, which is drawn as tone 1: paler and rosier, as
 * drawn, browner, deep brown. Four, so a class shows at most four skins.
 */
export const SKIN_TONES: readonly ((c: number) => number)[] = [
  (c) => mixColor(shadeColor(c, 1.1), 0xf6d8c8, 0.18),
  (c) => c,
  (c) => mixColor(shadeColor(c, 0.88), 0x8a5030, 0.12),
  (c) => mixColor(shadeColor(c, 0.66), 0x4a2a1c, 0.15),
];

/** Per-man shade of the cloak and crest: a step a little darker, none, a little lighter. */
export const SHADE_STEPS: readonly number[] = [0.9, 1, 1.1];
/** The groups the per-man shade moves. */
export const SHADED_GROUPS: readonly string[] = ['cloak', 'crest'];

/** A man's variant: his skin tone (Look.skin) and a seeded shade step; SKIN_TONES x SHADE_STEPS (12) per tier. */
export interface SheetVariant {
  skin: number;
  shade: number;
}

/** Neutral variant: the skin as drawn (tone 1), no shade step (x1). */
const SKIN_AS_DRAWN = 1;
const SHADE_NONE = 1;

/** A man's variant; a manifest that turns a part off (`variation`) gets the neutral one there, so its looks collapse to one key. */
export function sheetVariant(lookSkin: number | undefined, seed: number | undefined, m?: Pick<SheetManifest, 'variation'>): SheetVariant {
  const skin = m?.variation?.skin === false ? SKIN_AS_DRAWN : Math.max(0, Math.min(SKIN_TONES.length - 1, Math.round(lookSkin ?? 1)));
  const shade = m?.variation?.shade === false ? SHADE_NONE : (Math.imul((seed ?? 0) + 11, 0x9e3779b1) >>> 16) % SHADE_STEPS.length;
  return { skin, shade };
}

/**
 * The colour map of a sheet figure before the metal's rarity swap: each
 * colour group to its tier recolour (or its own colours), then the man's skin
 * tone on `skin` and his shade step on `cloak` / `crest`.
 */
export function recolorMap(m: SheetManifest, tier: SheetTier, v: SheetVariant): Map<number, number> {
  const out = new Map<number, number>();
  const rc = m.tiers?.[tier] ?? {};
  for (const [name, src] of Object.entries(m.colorGroups ?? {})) {
    const to = (rc[name] ?? src).map(hexColor);
    const tone = name === 'skin' && m.variation?.skin !== false ? SKIN_TONES[v.skin] : null;
    const k = SHADED_GROUPS.includes(name) && m.variation?.shade !== false ? SHADE_STEPS[v.shade] : 1;
    src.forEach((c, i) => {
      let t = to[i];
      if (tone) t = tone(t);
      if (k !== 1) t = shadeColor(t, k);
      out.set(hexColor(c), t);
    });
  }
  return out;
}
