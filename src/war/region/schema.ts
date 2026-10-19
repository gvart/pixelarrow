import { z } from 'zod';
import type { RegionData } from '../types';

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
    objects: z.array(z.object({ id: z.string().min(1), x: z.number().min(0), y: z.number().min(0) })).optional(),
    visual: z.object({ scale: z.literal(2), rle: z.array(z.number().int().min(0)) }).optional(),
  })
  .superRefine((r, ctx) => {
    const n = r.w * r.h;
    for (const k of ['height', 'terrain', 'water'] as const) {
      if (r[k].length !== n) ctx.addIssue({ code: 'custom', path: [k], message: `${k} has ${r[k].length} cells, expected w*h = ${n}` });
    }
    for (const [k, list] of [['entries', r.entries], ['noBuild', r.noBuild]] as const) {
      list.forEach((b, i) => {
        if (b.x + b.w > r.w || b.y + b.h > r.h) ctx.addIssue({ code: 'custom', path: [k, i], message: 'rect outside the map' });
      });
    }
  });

/** Validate parsed region JSON; throws a ZodError naming the bad field. */
export function parseRegion(json: unknown): RegionData {
  return regionSchema.parse(json);
}
