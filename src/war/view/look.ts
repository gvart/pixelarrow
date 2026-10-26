/**
 * A man's appearance on the war map (cheap uniqueness, before true layers): seeded from his person id, so the same
 * man looks the same on the map, on his roster card and in the codex. Pure (no Phaser, no DOM): ./lookShader.ts draws
 * it on the GPU from the palette table built here; paintLook() does the same on CPU pixels (portraits, icons).
 *
 *  - Skin: one of SKIN_TONES, a natural Mediterranean / Celtic / Thracian ramp (weights by the class's folk).
 *  - Hair and beard: one of HAIR_COLOURS, on sheets whose manifest names a `hair` or `beard` colour group.
 *  - Cloak, crest and trim: a small hue / saturation / value step (CLOAK_STEPS, CREST_STEPS, TRIM_STEPS) after the
 *    team's colour, so a cloak stays in its team's family (blue reads as the player's side at a glance).
 *  - Tier: the manifest's `tiers` recolour (basic, veteran, elite) from his worn gear (gearTier) or else his level.
 *
 * Colours follow docs/v5/art/STYLE_LOCK.md: dark, desaturated, warm; no step brightens a cloth past the art's range.
 */
import { CLASSES, type ClassId } from '../../data/classes';
import { ITEMS } from '../../data/items';
import type { Hero } from '../../data/units';
import { SHEET_TIERS, gearTier, hexColor, mixColor, shadeColor, type SheetManifest } from '../../art/sheetManifest';

/** A man's look: indices into the tables below (tier 0 basic, 1 veteran, 2 elite). */
export interface Look { tier: number; skin: number; cloak: number; crest: number; trim: number; hair: number }

/**
 * Skin tones as a change of the sheet's skin ramp (drawn as tone 1, a light olive): fair and rosy, as drawn, olive,
 * tanned, sun-bronzed, deep brown.
 */
export const SKIN_TONES: readonly ((c: number) => number)[] = [
  (c) => mixColor(shadeColor(c, 1.06), 0xf2d8c8, 0.2),
  (c) => c,
  (c) => mixColor(shadeColor(c, 0.95), 0x9a7a4e, 0.12),
  (c) => mixColor(shadeColor(c, 0.86), 0x8a5030, 0.12),
  (c) => mixColor(shadeColor(c, 0.75), 0x6a3c24, 0.14),
  (c) => mixColor(shadeColor(c, 0.62), 0x4a2a1c, 0.16),
];
const SKIN_AS_DRAWN = 1;

/** Hair colours, each a dark-to-light ramp: black, dark brown, brown, auburn, dark blond. */
export const HAIR_COLOURS: readonly (readonly number[])[] = [
  [0x0e0b0b, 0x1e1816, 0x342a26],
  [0x1c120c, 0x3a2618, 0x5a3e28],
  [0x2a1a10, 0x5a3a22, 0x86603c],
  [0x2c120a, 0x6a2e16, 0x9a5028],
  [0x3a2a14, 0x7a5e34, 0xa88a56],
];

/** Per-man steps [hue degrees, saturation x, value x]; the first is the art as drawn. Faded, deeper dye, a warmer or cooler batch. */
export const CLOAK_STEPS: readonly (readonly [number, number, number])[] = [
  [0, 1, 1], [0, 0.85, 0.9], [-6, 1.05, 1.06], [6, 0.95, 0.94], [0, 0.75, 1.08], [-4, 1.1, 0.86], [4, 0.9, 1.12], [-8, 0.95, 1],
];
export const CREST_STEPS: readonly (readonly [number, number, number])[] = [[0, 1, 1], [0, 1, 0.88], [-5, 1.05, 1.1], [5, 0.9, 0.95]];
export const TRIM_STEPS: readonly (readonly [number, number, number])[] = [[0, 1, 1], [0, 0.9, 0.9], [4, 1, 1.08], [-4, 0.85, 0.95]];

/** The colour groups a look recolours (`wood` and metal stay as drawn), and their id in the palette table. */
export const GROUP_ID: Readonly<Record<string, number>> = { cloak: 0, crest: 1, trim: 2, skin: 3, emblem: 4, hair: 5, beard: 5 };

type Folk = 'greek' | 'phoenician' | 'celtic' | 'thracian';
const THRACIAN = new Set(['peltast', 'rhomphaia', 'falx']);
/** Skin tone weights per folk (SKIN_TONES order). */
const SKIN_W: Record<Folk, readonly number[]> = {
  greek: [0.04, 0.18, 0.32, 0.26, 0.14, 0.06],
  phoenician: [0, 0.08, 0.26, 0.32, 0.22, 0.12],
  celtic: [0.38, 0.34, 0.14, 0.1, 0.04, 0],
  thracian: [0.22, 0.34, 0.24, 0.14, 0.06, 0],
};
/** Hair colour weights per folk (HAIR_COLOURS order). */
const HAIR_W: Record<Folk, readonly number[]> = {
  greek: [0.45, 0.35, 0.14, 0.03, 0.03],
  phoenician: [0.7, 0.25, 0.05, 0, 0],
  celtic: [0.1, 0.25, 0.25, 0.2, 0.2],
  thracian: [0.2, 0.3, 0.25, 0.12, 0.13],
};

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
/** The k-th uniform number in [0, 1) of a seed. */
function draw(h: number, k: number): number {
  let x = Math.imul(h ^ Math.imul(k + 1, 0x9e3779b9), 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
function pick(w: readonly number[], u: number): number {
  const sum = w.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < w.length; i++) if (u * sum < (acc += w[i])) return i;
  return w.length - 1;
}

/** The tier a man shows: his worn gear's (gearTier over weapon, shield, helmet, armour) when known, else his level (1-3, 4-7, 8+). */
export function tierOf(cls: string, level?: number, hero?: Pick<Hero, 'equip'>): number {
  if (hero?.equip) {
    const tiers: number[] = [];
    for (const s of ['weapon', 'shield', 'helmet', 'armor'] as const) {
      const d = hero.equip[s]?.def;
      if (d && ITEMS[d]) tiers.push(ITEMS[d].tier);
    }
    if (tiers.length) return SHEET_TIERS.indexOf(gearTier(cls, tiers));
  }
  const l = level ?? 1;
  return l >= 8 ? 2 : l >= 4 ? 1 : 0;
}

/**
 * A man's look, the same wherever it is asked: `seed` is his person id (a class-spawned man without one: anything
 * stable, e.g. `unit:<id>`), `cls` his class; his tier from `hero`'s gear when given, else `level`.
 */
export function lookOf(seed: string, cls: string, o: { level?: number; hero?: Pick<Hero, 'equip'> } = {}): Look {
  const h = hash32(seed);
  const cultures = CLASSES[cls as ClassId]?.cultures ?? [];
  const folk: Folk = THRACIAN.has(cls) ? 'thracian' : cultures.length ? cultures[Math.floor(draw(h, 0) * cultures.length)] : 'greek';
  return {
    tier: tierOf(cls, o.level, o.hero),
    skin: pick(SKIN_W[folk], draw(h, 1)),
    cloak: Math.floor(draw(h, 2) * CLOAK_STEPS.length),
    crest: Math.floor(draw(h, 3) * CREST_STEPS.length),
    trim: Math.floor(draw(h, 4) * TRIM_STEPS.length),
    hair: pick(HAIR_W[folk], draw(h, 5)),
  };
}

let heroes: ((pid: string) => Pick<Hero, 'equip'> | undefined) | null = null;
let heroesVersion = 0;
/**
 * Where the map finds a person's worn gear (his tier): e.g. the roster's persons. Call again after gear changes: men
 * on the map take their new tier.
 */
export function setLookHeroes(fn: ((pid: string) => Pick<Hero, 'equip'> | undefined) | null): void {
  heroes = fn;
  heroesVersion++;
}
/** The person's gear source (setLookHeroes) and its version. */
export const lookHero = (pid: string | undefined): Pick<Hero, 'equip'> | undefined => (pid ? heroes?.(pid) : undefined);
export const lookHeroesVersion = (): number => heroesVersion;

// ================================================================ colours

const rgb = (c: number): [number, number, number] => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
const pack = (r: number, g: number, b: number): number => {
  const q = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (q(r) << 16) | (q(g) << 8) | q(b);
};

/** Hue (degrees), saturation, value. */
export function toHsv(c: number): [number, number, number] {
  const [r, g, b] = rgb(c), v = Math.max(r, g, b), d = v - Math.min(r, g, b);
  let hue = 0;
  if (d > 0) hue = v === r ? ((g - b) / d) % 6 : v === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(hue * 60 + 360) % 360, v ? d / v : 0, v];
}
function fromHsv(h: number, s: number, v: number): number {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return pack(f(5), f(3), f(1));
}
function step(c: number, [dh, ks, kv]: readonly [number, number, number]): number {
  if (!dh && ks === 1 && kv === 1) return c;
  const [h, s, v] = toHsv(c);
  return fromHsv((h + dh + 360) % 360, Math.min(1, s * ks), Math.min(1, v * kv));
}

const smooth = (a: number, z: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (z - a)));
  return t * t * (3 - 2 * t);
};
/**
 * The player's side (colour slot 0): saturated red cloth turned blue, skin, bronze and leather kept (the TEAM_SWAP
 * formula of ./units.ts and ./lookShader.ts, which apply it to every pixel no colour group claims).
 */
export function swapRed(c: number): number {
  const [r, g, b] = rgb(c), rr = Math.max(r, 0.001);
  const w = smooth(0.3, 0.55, (r - Math.max(g, b)) / rr) * (1 - smooth(0.1, 0.25, (g - b) / rr));
  if (w <= 0) return c;
  return pack(r + (b * 0.6 - r) * w, g + (g * 0.8 + r * 0.3 - g) * w, b + (r * 1.2 + 0.06 - b) * w);
}
/** A dyed colour in team slot `team`'s family: slot 0 blue (swapRed); the others keep the art's red (tinted by the view). */
export const teamColor = (c: number, team: number): number => (team === 0 ? swapRed(c) : c);

/** The variant index of a colour group for a look. */
export function variantOf(group: string, look: Look): number {
  switch (group) {
    case 'cloak': return look.cloak;
    case 'crest': return look.crest;
    case 'trim': return look.trim;
    case 'skin': return look.skin;
    case 'hair': case 'beard': return look.hair;
    default: return 0;
  }
}

/**
 * Final colour (0xrrggbb) of colour `i` (dark to light) of group `group` of a sheet, for a man of team slot `team`
 * with look `look`: his tier's recolour, then his team's dye and his own step (skin tone, hair colour).
 */
export function groupColor(m: SheetManifest, group: string, i: number, team: number, look: Look): number {
  const src = m.colorGroups?.[group] ?? [];
  const tiered = m.tiers?.[SHEET_TIERS[look.tier] ?? 'basic']?.[group] ?? src;
  const c = hexColor(tiered[i] ?? src[i]);
  const shade = m.variation?.shade !== false;
  switch (group) {
    case 'skin': return SKIN_TONES[m.variation?.skin === false ? SKIN_AS_DRAWN : look.skin](c);
    case 'hair': case 'beard': {
      const ramp = HAIR_COLOURS[look.hair], t = src.length > 1 ? (i / (src.length - 1)) * (ramp.length - 1) : 1, j = Math.min(ramp.length - 2, Math.floor(t));
      return mixColor(ramp[j], ramp[j + 1], t - j);
    }
    case 'cloak': return shade ? step(teamColor(c, team), CLOAK_STEPS[look.cloak]) : teamColor(c, team);
    case 'crest': return shade ? step(teamColor(c, team), CREST_STEPS[look.crest]) : teamColor(c, team);
    case 'trim': return shade ? step(teamColor(c, team), TRIM_STEPS[look.trim]) : teamColor(c, team);
    default: return teamColor(c, team);
  }
}

/** Source colour -> drawn colour for every colour a look recolours (GROUP_ID groups). */
export function lookMap(m: SheetManifest, team: number, look: Look): Map<number, number> {
  const out = new Map<number, number>();
  for (const [g, cols] of Object.entries(m.colorGroups ?? {})) {
    if (!(g in GROUP_ID)) continue;
    cols.forEach((c, i) => out.set(hexColor(c), groupColor(m, g, i, team, look)));
  }
  return out;
}

const maps = new Map<string, Map<number, number>>();
/**
 * Paint a man's look over RGBA pixels of his class's sheet (a frame cut from it, e.g. the roster portrait or a codex
 * icon), in place: colour-group pixels to his colours, any other red cloth to the team's (as the map shader does).
 */
export function paintLook(px: Uint8ClampedArray, m: SheetManifest, team: number, look: Look): void {
  const key = `${m.class}|${team}|${look.tier}${look.skin}${look.cloak}${look.crest}${look.trim}${look.hair}`;
  let map = maps.get(key);
  if (!map) {
    if (maps.size > 256) maps.clear();
    maps.set(key, (map = lookMap(m, team, look)));
  }
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 8) continue;
    const c = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2], to = px[i + 3] >= 250 ? map.get(c) : undefined;
    const d = to ?? teamColor(c, team);
    if (d === c) continue;
    px[i] = d >> 16; px[i + 1] = (d >> 8) & 255; px[i + 2] = d & 255;
  }
}

// ================================================================ the palette table (./lookShader.ts)

/** Hash slots per class (the table's width): a colour sits at (r A + g B + b C) mod PAL_W. */
export const PAL_W = 512;
/** Variants per group in the table (the most any group has: CLOAK_STEPS). */
export const PAL_VARIANTS = 8;
/** Rows per class: the hash multipliers, the source colours, their group ids, then per team slot (4), tier (3) and variant. */
export const PAL_ROWS = 3 + 4 * 3 * PAL_VARIANTS;

export function hashSlot(c: number, k: readonly [number, number, number]): number {
  return (((c >> 16) & 255) * k[0] + ((c >> 8) & 255) * k[1] + (c & 255) * k[2]) % PAL_W;
}

/** Multipliers putting every colour in its own slot (searched deterministically), or null. */
export function findHash(colors: readonly number[]): [number, number, number] | null {
  let s = 12345;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) >>> 8) % 255 + 1;
  for (let n = 0; n < 20000; n++) {
    const k: [number, number, number] = [rnd(), rnd(), rnd()], seen = new Set<number>();
    if (colors.every((c) => !seen.has(hashSlot(c, k)) && seen.add(hashSlot(c, k)))) return k;
  }
  return null;
}

export interface LookPalette { w: number; h: number; data: Uint8ClampedArray<ArrayBuffer>; index: Map<string, number> }

/**
 * The palette texture of the given sheets (those with recolourable groups): per class a block of PAL_ROWS rows. Row 0
 * pixel 0 holds the hash multipliers; at a colour's slot, row 1 holds the colour, row 2 its group id (x 16, red),
 * row 3 + (team x 3 + tier) x PAL_VARIANTS + variant its drawn colour.
 */
export function buildPalette(sheets: Iterable<[string, SheetManifest]>): LookPalette {
  const blocks: [string, SheetManifest, [number, number, number], [string, number, number][]][] = [];
  for (const [cls, m] of sheets) {
    const cols: [string, number, number][] = [];
    for (const [g, cs] of Object.entries(m.colorGroups ?? {})) if (g in GROUP_ID) cs.forEach((c, i) => cols.push([g, i, hexColor(c)]));
    if (!cols.length || blocks.length >= 64) continue;
    const k = findHash(cols.map((c) => c[2]));
    if (k) blocks.push([cls, m, k, cols]);
  }
  const h = Math.max(1, blocks.length * PAL_ROWS), data = new Uint8ClampedArray(PAL_W * h * 4), index = new Map<string, number>();
  const put = (x: number, y: number, c: number) => {
    const o = (y * PAL_W + x) * 4;
    data[o] = c >> 16; data[o + 1] = (c >> 8) & 255; data[o + 2] = c & 255; data[o + 3] = 255;
  };
  const look: Look = { tier: 0, skin: 0, cloak: 0, crest: 0, trim: 0, hair: 0 };
  blocks.forEach(([cls, m, k, cols], ci) => {
    index.set(cls, ci);
    const y0 = ci * PAL_ROWS;
    put(0, y0, (k[0] << 16) | (k[1] << 8) | k[2]);
    for (const [g, i, c] of cols) {
      const x = hashSlot(c, k);
      put(x, y0 + 1, c);
      put(x, y0 + 2, GROUP_ID[g] * 16 << 16);
      const n = g === 'cloak' ? CLOAK_STEPS.length : g === 'crest' ? CREST_STEPS.length : g === 'trim' ? TRIM_STEPS.length : g === 'skin' ? SKIN_TONES.length : g === 'emblem' ? 1 : HAIR_COLOURS.length;
      for (let team = 0; team < 4; team++)
        for (let tier = 0; tier < 3; tier++)
          for (let v = 0; v < n; v++) {
            look.tier = tier; look.cloak = look.crest = look.trim = look.skin = look.hair = v;
            put(x, y0 + 3 + (team * 3 + tier) * PAL_VARIANTS + v, groupColor(m, g, i, team, look));
          }
    }
  });
  return { w: PAL_W, h, data, index };
}

/**
 * What a sprite carries to the shader: its tint effect (8 + (class block x 4 + team slot) x 3 + tier; Phaser's own
 * effects are 0-2) and its tint (0xRRGGBB: R = skin << 5 | cloak << 2 | crest, G = trim << 6 | hair << 3).
 */
export function lookCode(ci: number, team: number, look: Look): { fx: number; tint: number } {
  return {
    fx: 8 + ((ci * 4 + (team & 3)) * 3 + look.tier),
    tint: (((look.skin << 5) | (look.cloak << 2) | look.crest) << 16) | (((look.trim << 6) | (look.hair << 3)) << 8),
  };
}
