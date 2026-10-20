import { z } from 'zod';
import type { RegionData } from '../types';
import { expandRegion } from './compact';
import { TRADE_ZONES } from './zones';
import { BUILDINGS } from '../sim/economy';

const TERRAIN = ['grass', 'forest', 'sand', 'marsh', 'rock', 'road', 'snow', 'dirt'] as const;
const rect = { x: z.number().int().min(0), y: z.number().int().min(0), w: z.number().int().positive(), h: z.number().int().positive() };

/** Region JSON (src/war/regions/<id>.json): the RegionData contract of src/war/types.ts. */
export const regionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    w: z.number().int().positive(),
    h: z.number().int().positive(),
    height: z.array(z.number().int().min(0).max(7)),
    terrain: z.array(z.enum(TERRAIN)),
    water: z.array(z.union([z.literal(0), z.literal(1), z.literal(2)])),
    entries: z.array(z.object({ side: z.enum(['N', 'E', 'S', 'W']), ...rect })),
    noBuild: z.array(z.object(rect)),
    objects: z.array(z.object({ id: z.string().min(1), x: z.number().min(0), y: z.number().min(0), shade: z.number().min(0).max(1).optional() })).optional(),
    blocked: z.array(z.number().int().min(0)).optional(),
    visual: z.object({ scale: z.literal(2), rle: z.array(z.number().int().min(0)) }).optional(),
    biomes: z.object({ names: z.array(z.string().min(1)).min(1), rle: z.array(z.number().int().min(0)) }).optional(),
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
      tiles: z.array(z.number().int().min(0)).optional(), hp: z.number().gt(0).max(1).optional(), state: z.enum(['done', 'ruined']).optional(),
      claim: z.number().int().min(0).optional(), landmark: z.boolean().optional(),
    })).optional(),
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
