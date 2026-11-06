/**
 * Data for the Godot port (docs/impl/godot-port.md P3), so no table is ever copied by hand:
 *  - tables: every JSON-safe value each module of src/data, src/war/sim and src/war/world exports (Sets as arrays, Maps
 *    as objects; functions are code to port and are listed in the manifest as `dropped`);
 *  - regions: each parsed region (../war/region/schema.ts parseRegion) as JSON without its three layers, plus the layers
 *    as one little-endian u16 per tile, `height | terrain << 4 | water << 7` (../war/region/compact.ts, terrain index into
 *    TERRAIN; water 0..2 needs bit 8, so a byte is too small).
 * Run through scripts/godot/data.mjs.
 */
import { parseRegion } from '../war/region/schema';
import { TERRAIN } from '../war/region/compact';
import type { RegionData } from '../war/types';

const modules = import.meta.glob(['../data/*.ts', '../war/sim/*.ts', '../war/world/*.ts', '!**/*.d.ts'], { eager: true }) as Record<string, Record<string, unknown>>;
const regionFiles = import.meta.glob('../war/regions/*.json', { eager: true, import: 'default' });

/** `src/war/sim/economy` for '../war/sim/economy.ts'. */
const tableName = (path: string) => 'src/' + path.replace(/^\.\.\//, '').replace(/\.ts$/, '');

export interface Table { name: string; json: string; exports: Record<string, string>; dropped: string[] }

export function tables(): Table[] {
  return Object.entries(modules).map(([path, mod]) => {
    const name = tableName(path), out: Record<string, unknown> = {}, exports: Record<string, string> = {}, dropped: string[] = [];
    for (const [k, v] of Object.entries(mod)) {
      if (typeof v === 'function') continue;
      out[k] = v;
      exports[k] = v instanceof Map ? 'Map' : v instanceof Set ? 'Set' : Array.isArray(v) ? 'Array' : v === null ? 'null' : typeof v;
    }
    const json = JSON.stringify(out, function (key, v) {
      if (v instanceof Set) return [...v];
      if (v instanceof Map) return Object.fromEntries(v);
      if (typeof v === 'function') { dropped.push(key); return undefined; }
      return v;
    });
    return { name, json, exports, dropped };
  }).filter((t) => Object.keys(t.exports).length > 0);
}

/** `sample`: the middle tile decoded by the TS side, [index, height, terrain, water], so the Godot side checks its unpacking. */
export interface RegionOut { id: string; json: string; cells: Uint8Array; w: number; h: number; sample: [number, number, string, number] }

export function regions(): RegionOut[] {
  return Object.values(regionFiles).map((raw) => {
    const r: RegionData = parseRegion(raw), n = r.w * r.h, cells = new Uint8Array(n * 2), view = new DataView(cells.buffer);
    for (let i = 0; i < n; i++) view.setUint16(i * 2, r.height[i] | (TERRAIN.indexOf(r.terrain[i] as (typeof TERRAIN)[number]) << 4) | (r.water[i] << 7), true);
    const { height: _h, terrain: _t, water: _w, ...rest } = r;
    const mid = (r.h >> 1) * r.w + (r.w >> 1);
    return { id: r.id, json: JSON.stringify(rest), cells, w: r.w, h: r.h, sample: [mid, r.height[mid], r.terrain[mid], r.water[mid]] };
  });
}

export { TERRAIN };
