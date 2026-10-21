import { z } from 'zod';
import type { RegionData } from '../types';
import { expandRegion, MAX_HEIGHT } from './compact';
import { TRADE_ZONES } from './zones';
import { BUILDINGS } from '../sim/economy';

const TERRAIN = ['grass', 'forest', 'sand', 'marsh', 'rock', 'road', 'snow', 'dirt'] as const;
export { MAX_HEIGHT };
const TERRAIN_SET = new Set<string>(TERRAIN);
/**
 * A w*h layer, checked by a plain loop and passed through as is: zod's per-element array check copies the array and
 * allocates per cell (about 60 MB of garbage and 60 ms for a 512 x 512 region).
 */
const layer = <T>(ok: (v: unknown) => boolean, what: string) =>
  z.custom<T[]>((v) => Array.isArray(v), `expected an array of ${what}`).superRefine((a, ctx) => {
    for (let i = 0; i < a.length; i++) if (!ok(a[i])) { ctx.addIssue({ code: 'custom', path: [i], message: `expected ${what}, got ${String(a[i])}` }); return; }
  });
const isInt = (lo: number, hi: number) => (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const isObject = (v: unknown) => {
  const o = v as { id?: unknown; x?: unknown; y?: unknown; shade?: unknown } | null;
  return !!o && typeof o.id === 'string' && o.id.length > 0 && typeof o.x === 'number' && o.x >= 0 && typeof o.y === 'number' && o.y >= 0
    && (o.shade === undefined || (typeof o.shade === 'number' && o.shade >= 0 && o.shade <= 1));
};
/** A list of non-negative integers (runs, tile pairs), checked the same way. */
const ints = () => layer<number>(isInt(0, Number.MAX_SAFE_INTEGER), 'a non-negative integer');
const rect = { x: z.number().int().min(0), y: z.number().int().min(0), w: z.number().int().positive(), h: z.number().int().positive() };

/** Region JSON (src/war/regions/<id>.json): the RegionData contract of src/war/types.ts. */
export const regionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    w: z.number().int().positive(),
    h: z.number().int().positive(),
    height: layer<number>(isInt(0, MAX_HEIGHT), `a height 0..${MAX_HEIGHT}`),
    terrain: layer<(typeof TERRAIN)[number]>((v) => TERRAIN_SET.has(v as string), 'a terrain kind'),
    water: layer<0 | 1 | 2>(isInt(0, 2), 'water 0, 1 or 2'),
    entries: z.array(z.object({ side: z.enum(['N', 'E', 'S', 'W']), ...rect })),
    noBuild: z.array(z.object(rect)),
    objects: layer<{ id: string; x: number; y: number; shade?: number }>(isObject, 'an object { id, x >= 0, y >= 0, shade 0..1? }').optional(),
    blocked: ints().optional(),
    visual: z.object({ scale: z.literal(2), rle: ints() }).optional(),
    biomes: z.object({ names: z.array(z.string().min(1)).min(1), rle: ints() }).optional(),
    lairs: z.array(z.object({ kind: z.enum(['wolf', 'boar', 'bear', 'bandit', 'jackal', 'ibex']), x: z.number().min(0), y: z.number().min(0), count: z.number().int().positive().optional(), as: z.string().optional(), captain: z.boolean().optional() })).optional(),
    claimPoints: z.array(z.object({ x: z.number().min(0), y: z.number().min(0), lairs: z.array(z.number().int().min(0)), r: z.number().positive().optional() })).optional(),
    /** M6d (additive): safe zones with their gates, caravan yards, ambush spots (src/war/sim/trade.ts; ./zones.ts). */
    safe: z.array(z.object({ ...rect, gates: z.array(z.object(rect)).optional() })).optional(),
    yard: z.array(z.object(rect)).optional(),
    ambush: z.array(z.object(rect)).optional(),
    /** M7a (additive): pre-built structures (src/war/types.ts PrebuiltEntry). */
    prebuilt: z.array(z.object({
      type: z.string().refine((t) => t in BUILDINGS, 'unknown building type') as unknown as z.ZodType<keyof typeof BUILDINGS>,
      x: z.number().min(0), y: z.number().min(0), rot: z.union([z.literal(0), z.literal(1)]).optional(),
      tiles: ints().optional(), hp: z.number().gt(0).max(1).optional(), state: z.enum(['done', 'ruined']).optional(),
      claim: z.number().int().min(0).optional(), landmark: z.boolean().optional(),
      art: z.string().optional(), maxHp: z.number().positive().optional(),
    })).optional(),
    /** M7d (additive): landmark guardians (src/war/types.ts GuardianEntry), and the rim side Warden strikes fall on. */
    guardians: z.array(z.object({
      boss: z.string().min(1), x: z.number().min(0), y: z.number().min(0),
      perches: z.array(z.tuple([z.number(), z.number()])).optional(), heads: z.array(z.tuple([z.number(), z.number()])).optional(),
      postern: z.tuple([z.number(), z.number()]).optional(), pit: z.tuple([z.number(), z.number()]).optional(), flats: z.tuple([z.number(), z.number()]).optional(),
    })).optional(),
    rim: z.enum(['N', 'E', 'S', 'W']).optional(),
    /** M7c: danger depth (src/war/sim/depth.ts). */
    depth: z.number().int().min(0).max(4).optional(),
    /** World data of a generated region (scripts/war/regions/world.ts): role, biome family, draft flag, neighbours by side, WAR.md fauna and resources. */
    meta: z.object({
      role: z.enum(['home', 'entry', 'neutral', 'center']),
      family: z.string(),
      draft: z.boolean().optional(),
      adjacent: z.array(z.object({ id: z.string(), side: z.enum(['N', 'E', 'S', 'W']) })),
      fauna: z.array(z.string()),
      resources: z.record(z.string(), z.number()),
    }).optional(),
  })
  .superRefine((r, ctx) => {
    const n = r.w * r.h;
    for (const k of ['height', 'terrain', 'water'] as const) {
      if (r[k].length !== n) ctx.addIssue({ code: 'custom', path: [k], message: `${k} has ${r[k].length} cells, expected w*h = ${n}` });
    }
    for (const [k, list] of [['entries', r.entries], ['noBuild', r.noBuild], ['safe', r.safe ?? []], ['yard', r.yard ?? []], ['ambush', r.ambush ?? []]] as const) {
      list.forEach((b, i) => {
        if (b.x + b.w > r.w || b.y + b.h > r.h) ctx.addIssue({ code: 'custom', path: [k, i], message: 'rect outside the map' });
      });
    }
  });

/** Validate parsed region JSON (plain, or compact: src/war/region/compact.ts); throws a ZodError naming the bad field. */
export function parseRegion(json: unknown): RegionData {
  const r: RegionData = regionSchema.parse(expandRegion(json));
  // M6d: the trade towns' zones (./zones.ts) when the JSON has none of its own
  const z = TRADE_ZONES[r.id];
  if (z && !r.safe && !r.yard && !r.ambush) return { ...r, safe: z.safe, yard: z.yard, ambush: z.ambush };
  return r;
}
