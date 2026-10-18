/**
 * Sprite-sheet manifests: the format a pre-made (PixelLab) soldier sheet ships
 * with, and the pure rules around it (no DOM, no Phaser): the animation set and
 * its fallbacks, frame ids, the gear-tier rule and the rarity palette swap.
 * The format is documented in docs/v5/art/SHEET_FORMAT.md.
 *
 * A class has one manifest and up to three images (one per gear tier) that
 * share its layout: rows are facings, columns are animation frames.
 */

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
] as const;
export type SheetAnim = (typeof SHEET_ANIMS)[number];

/** The procedural states (they have paperdoll columns). */
export const CORE_ANIMS = ['idle', 'walk', 'run', 'attack', 'block', 'hit', 'die', 'dieB', 'rout', 'win'] as const;
export type CoreAnim = (typeof CORE_ANIMS)[number];

/** The nearest animation to show when a sheet lacks one; `idle` is required, so every chain ends. */
export const ANIM_FALLBACK: Record<SheetAnim, SheetAnim | null> = {
  idle: null,
  walk: 'idle',
  run: 'walk',
  attack: 'idle',
  block: 'idle',
  hit: 'idle',
  die: 'hit',
  dieB: 'die',
  rout: 'run',
  win: 'idle',
  thrust: 'attack',
  slash: 'attack',
  throw: 'attack',
  shoot: 'attack',
  sling: 'attack',
  brace: 'block',
  charge: 'run',
  ready: 'idle',
  stagger: 'hit',
  fallFwd: 'die',
  fallBack: 'dieB',
  kneel: 'die',
  look: 'idle',
  adjust: 'idle',
  cheer: 'win',
};

/** The animation `a` shows as on a sheet that has `has`. */
export function resolveAnim(a: SheetAnim, has: (a: SheetAnim) => boolean): SheetAnim {
  let cur: SheetAnim | null = a;
  while (cur && !has(cur)) cur = ANIM_FALLBACK[cur];
  return cur ?? 'idle';
}

/** The procedural state an animation falls back to (for a figure drawn without a sheet). */
export function coreAnimOf(a: SheetAnim): CoreAnim {
  let cur: SheetAnim = a;
  while (!(CORE_ANIMS as readonly string[]).includes(cur)) cur = ANIM_FALLBACK[cur]!;
  return cur as CoreAnim;
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
  /** Missile attacks: the frame the missile leaves on (frames before it are the draw / whirl / aim). Default frames / 2. */
  strike?: number;
}

export interface MetalGroup {
  kind: MetalKind;
  /** The exact colours of this metal in the art, light to dark ('#rrggbb'). */
  colors: string[];
  /** The gear whose rarity sets the finish (highest wins). Default: all four. */
  slots?: MetalSlot[];
}

export interface SheetManifest {
  version: 1;
  /** Class id (src/data/classes.ts). */
  class: string;
  /** Frame size in art pixels; every frame of every image has it. */
  frame: { w: number; h: number };
  /** The art pixel the figure stands on (feet centre for men, between the hooves / wheels otherwise). */
  anchor: { x: number; y: number };
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
  /** Image file per gear tier (relative to the manifest); a missing tier shows the nearest one. */
  tiers: Partial<Record<SheetTier, string>>;
  anims: Partial<Record<SheetAnim, SheetAnimDef>>;
  metal?: MetalGroup[];
  /** Bust crop for portraits (art px, a square at x, y): default from the idle frame's bounds. */
  portrait?: { x: number; y: number; size: number };
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Check a manifest (from JSON); throws with every problem listed. */
export function parseManifest(raw: unknown): SheetManifest {
  const m = raw as SheetManifest;
  const errs: string[] = [];
  const num = (v: unknown, min = 0) => typeof v === 'number' && Number.isFinite(v) && v >= min;
  if (!m || typeof m !== 'object') throw new Error('sheet manifest: not an object');
  if (m.version !== 1) errs.push('version must be 1');
  if (typeof m.class !== 'string' || !m.class) errs.push('class missing');
  if (!m.frame || !num(m.frame.w, 1) || !num(m.frame.h, 1)) errs.push('frame.w / frame.h must be positive');
  if (!m.anchor || !num(m.anchor.x) || !num(m.anchor.y)) errs.push('anchor.x / anchor.y missing');
  if (!num(m.scale) || m.scale <= 0) errs.push('scale must be positive');
  if (!Array.isArray(m.rows) || !m.rows.length || m.rows.some((r) => !SHEET_DIRECTIONS.includes(r))) errs.push('rows must name directions');
  const facings = m.facings ?? DEFAULT_FACINGS;
  if (facings.length !== 4 || facings.some((f) => !m.rows?.includes(f))) errs.push('facings must name four rows of the image');
  if (!m.tiers || !SHEET_TIERS.some((t) => typeof m.tiers[t] === 'string')) errs.push('tiers needs at least one image');
  if (!m.anims?.idle) errs.push('anims.idle is required');
  const used: [number, number, string][] = [];
  for (const [name, a] of Object.entries(m.anims ?? {})) {
    if (!(SHEET_ANIMS as readonly string[]).includes(name)) errs.push(`unknown animation ${name}`);
    if (!a || !num(a.col) || !num(a.frames, 1) || a.frames > 64 || !num(a.fps) || a.fps <= 0) {
      errs.push(`anims.${name}: col, frames (1..64) and fps are required`);
      continue;
    }
    if (a.strike !== undefined && (!num(a.strike) || a.strike >= a.frames)) errs.push(`anims.${name}.strike out of range`);
    for (const [c0, c1, other] of used) if (a.col < c1 && a.col + a.frames > c0) errs.push(`anims.${name} overlaps ${other}`);
    used.push([a.col, a.col + a.frames, name]);
  }
  for (const g of m.metal ?? []) {
    if (g.kind !== 'bronze' && g.kind !== 'iron') errs.push(`metal kind ${g.kind} unknown`);
    if (!Array.isArray(g.colors) || !g.colors.length || g.colors.some((c) => !HEX.test(c))) errs.push('metal colors must be #rrggbb');
    if (g.slots && g.slots.some((s) => !METAL_SLOTS.includes(s))) errs.push(`metal slots ${g.slots.join(',')} unknown`);
  }
  if (errs.length) throw new Error(`sheet manifest ${m.class ?? '?'}: ${errs.join('; ')}`);
  return m;
}

/** Columns the image must have. */
export function manifestColumns(m: SheetManifest): number {
  let n = 0;
  for (const a of Object.values(m.anims)) if (a) n = Math.max(n, a.col + a.frames);
  return n;
}

/** The image row of each game facing. */
export function facingRows(m: SheetManifest): number[] {
  return (m.facings ?? DEFAULT_FACINGS).map((f) => m.rows.indexOf(f));
}

/** The tier image to show for `t` (the nearest one the manifest has, preferring lower). */
export function tierImage(m: SheetManifest, t: SheetTier): SheetTier {
  const i = SHEET_TIERS.indexOf(t);
  for (let d = 0; d < SHEET_TIERS.length; d++) {
    for (const j of [i - d, i + d]) {
      const tt = SHEET_TIERS[j];
      if (tt && m.tiers[tt]) return tt;
    }
  }
  return 'basic';
}

// ================================================================ gear tier

/**
 * Which of the three baked tiers a man shows, from what he wears: the mean
 * item tier (src/data/items.ts ItemDef.tier, 1..3) of his weapon, shield,
 * helmet and armour (empty slots are left out). Rarity does not move the
 * tier: it is the metal's palette swap.
 */
export const TIER_RULE = { slots: ['weapon', 'shield', 'helmet', 'armor'] as const, veteranFrom: 1.75, eliteFrom: 2.5 };

export function gearTier(itemTiers: readonly number[]): SheetTier {
  if (!itemTiers.length) return 'basic';
  const mean = itemTiers.reduce((a, b) => a + b, 0) / itemTiers.length;
  return mean >= TIER_RULE.eliteFrom ? 'elite' : mean >= TIER_RULE.veteranFrom ? 'veteran' : 'basic';
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
