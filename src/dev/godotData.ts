/**
 * Data for the Godot port (docs/impl/godot-port.md P3), so no table is ever copied by hand:
 *  - tables: every JSON-safe value each module of src/data, src/war/sim, src/war/world and src/war/region exports, with exact floats
 *    (./godotJson.ts; functions are code to port and are listed in the manifest as `dropped`);
 *  - regions: each parsed region (../war/region/schema.ts parseRegion) as JSON without its three layers, plus the layers
 *    as one little-endian u16 per tile, `height | terrain << 4 | water << 7` (../war/region/compact.ts, terrain index into
 *    TERRAIN; water 0..2 needs bit 8, so a byte is too small).
 * Run through scripts/godot/data.mjs.
 */
import { exactJson } from './godotJson';
import { parseRegion } from '../war/region/schema';
import { TERRAIN } from '../war/region/compact';
import type { RegionData } from '../war/types';
import { CIV_CLASSES, CLASSES } from '../data/classes';
import { MOBS, mobClass } from '../war/sim/mobs';
import type { MobKind } from '../war/types';
import { warStats } from '../war/sim/classes';
import { CRESTED_ART, CULTURE_EMBLEMS, FIELD_INK } from '../game/heroes';

const modules = import.meta.glob(['../data/*.ts', '../war/sim/*.ts', '../war/world/*.ts', '../war/region/*.ts', '!**/*.d.ts'], { eager: true }) as Record<string, Record<string, unknown>>;
const regionFiles = import.meta.glob('../war/regions/*.json', { eager: true, import: 'default' });

/** `src/war/sim/economy` for '../war/sim/economy.ts'. */
const tableName = (path: string) => 'src/' + path.replace(/^\.\.\//, '').replace(/\.ts$/, '');

export interface Table { name: string; json: string; exports: Record<string, string>; dropped: string[] }

const bits = new DataView(new ArrayBuffer(8));
/** The big-endian hex bits of every non-integer number in the tables: the Godot test checks each float it reads is one. */
export function tableFloats(ts: Table[]): string[] {
  const out = new Set<string>();
  for (const t of ts) JSON.parse(t.json, (_k, v) => {
    if (typeof v === 'number' && !Number.isInteger(v)) { bits.setFloat64(0, v); out.add(bits.getUint32(0).toString(16).padStart(8, '0') + bits.getUint32(4).toString(16).padStart(8, '0')); }
    if (v && typeof v === 'object' && typeof v.f64 === 'string' && Object.keys(v).length === 1) out.add(v.f64);
    return v;
  });
  return [...out].sort();
}

export function tables(): Table[] {
  return Object.entries(modules).map(([path, mod]) => {
    const name = tableName(path), out: Record<string, unknown> = {}, exports: Record<string, string> = {}, dropped: string[] = [];
    for (const [k, v] of Object.entries(mod)) {
      if (typeof v === 'function') continue;
      out[k] = v;
      exports[k] = v instanceof Map ? 'Map' : v instanceof Set ? 'Set' : Array.isArray(v) ? 'Array' : v === null ? 'null' : typeof v;
    }
    const json = exactJson(out, (key) => dropped.push(key));
    return { name, json, exports, dropped };
  }).filter((t) => Object.keys(t.exports).length > 0).concat(derived());
}

/**
 * Tables the TS computes from code once (`derived/<name>`): WAR_STATS, warStats(cls) of every soldier, civilian and mob
 * class, so the C++ sim reads a fresh class's numbers instead of porting computeStats (docs/impl/godot-port.md G-10;
 * an unknown class is militia); and the paint tables of makeItem (src/game/heroes.ts, outside the exported folders).
 */
function derived(): Table[] {
  const ids = [...Object.keys(CLASSES), ...Object.keys(CIV_CLASSES), ...(Object.keys(MOBS) as MobKind[]).map(mobClass)];
  const WAR_STATS = Object.fromEntries(ids.map((id) => [id, warStats(id)]));
  return [
    { name: 'derived/war_stats', json: exactJson({ WAR_STATS }), exports: { WAR_STATS: 'object' }, dropped: [] },
    { name: 'derived/item_paint', json: exactJson({ FIELD_INK, CULTURE_EMBLEMS, CRESTED_ART }), exports: { FIELD_INK: 'Array', CULTURE_EMBLEMS: 'object', CRESTED_ART: 'Array' }, dropped: [] },
  ];
}

/** `sample`: the middle tile decoded by the TS side, [index, height, terrain, water], so the Godot side checks its unpacking. */
export interface RegionOut { id: string; json: string; cells: Uint8Array; w: number; h: number; sample: [number, number, string, number] }

export function regions(): RegionOut[] {
  return Object.values(regionFiles).map((raw) => {
    const r: RegionData = parseRegion(raw), n = r.w * r.h, cells = new Uint8Array(n * 2), view = new DataView(cells.buffer);
    for (let i = 0; i < n; i++) view.setUint16(i * 2, r.height[i] | (TERRAIN.indexOf(r.terrain[i] as (typeof TERRAIN)[number]) << 4) | (r.water[i] << 7), true);
    const { height: _h, terrain: _t, water: _w, ...rest } = r;
    const mid = (r.h >> 1) * r.w + (r.w >> 1);
    return { id: r.id, json: exactJson(rest), cells, w: r.w, h: r.h, sample: [mid, r.height[mid], r.terrain[mid], r.water[mid]] };
  });
}

export { TERRAIN };
