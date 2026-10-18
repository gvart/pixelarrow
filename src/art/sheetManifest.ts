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
  rout: ['run'],
  win: ['cheer'],
  thrust: ['attack'],
  slash: ['attack'],
  throw: ['attack'],
  shoot: ['attack'],
  sling: ['attack'],
  brace: ['block'],
  charge: ['run'],
  ready: [],
  stagger: ['hit'],
  fallFwd: ['die'],
  fallBack: ['dieB'],
  kneel: ['die'],
  look: [],
  adjust: [],
  cheer: ['win'],
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

export interface SheetManifest {
  version: 2;
  /** Class id (src/data/classes.ts). */
  class: string;
  /** The image (relative to the manifest): every animation of the class, in basic tier colours. */
  image: string;
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
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const GROUP_NAME = /^[a-z][a-zA-Z0-9]*$/;

/** Check a manifest (from JSON); throws with every problem listed. */
export function parseManifest(raw: unknown): SheetManifest {
  const m = raw as SheetManifest;
  const errs: string[] = [];
  const num = (v: unknown, min = 0) => typeof v === 'number' && Number.isFinite(v) && v >= min;
  if (!m || typeof m !== 'object') throw new Error('sheet manifest: not an object');
  if (m.version !== 2) errs.push('version must be 2 (one image, tiers by recolour)');
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
  if (typeof m.image !== 'string' || !m.image) errs.push('image missing');
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
  if (errs.length) throw new Error(`sheet manifest ${m.class ?? '?'}: ${errs.join('; ')}`);
  return m;
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
 * Which of the three tiers (recolours) a man shows, from what he wears: the mean
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

export function sheetVariant(lookSkin: number | undefined, seed: number | undefined): SheetVariant {
  const skin = Math.max(0, Math.min(SKIN_TONES.length - 1, Math.round(lookSkin ?? 1)));
  const shade = (Math.imul((seed ?? 0) + 11, 0x9e3779b1) >>> 16) % SHADE_STEPS.length;
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
    const tone = name === 'skin' ? SKIN_TONES[v.skin] : null;
    const k = SHADED_GROUPS.includes(name) ? SHADE_STEPS[v.shade] : 1;
    src.forEach((c, i) => {
      let t = to[i];
      if (tone) t = tone(t);
      if (k !== 1) t = shadeColor(t, k);
      out.set(hexColor(c), t);
    });
  }
  return out;
}
