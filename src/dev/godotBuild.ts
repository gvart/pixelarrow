/**
 * Building art for the Godot region view (godot/src/region/buildings.gd), as src/war/view/build/buildArt.ts reads it:
 * the ART-B sprites by `<art id>/<state>` (public/war/buildings/objects.json), the M7b town art of the biome libraries
 * the pre-built pieces use (PRE_ART), the construction stages, and which art a sim type draws with. Pure data and file
 * names (no canvas): scripts/godot/view.mjs runs it under node (`read`: a repo file's text) and copies the PNGs it names.
 */
import { ART_ID, PRE_ART } from '../war/view/build/buildArt';
import { HH, HW } from '../war/view/iso';

/** [file (under buildings/), tileOrigin x, y, footprint w, h]. */
type Spr = [string, number, number, number, number];
interface ArtJson { buildOrder?: string[]; progress?: Record<string, number>; objects: { building: string; state: string; file: string; tileOrigin: { x: number; y: number }; footprint: [number, number] }[] }
interface LibObj { id: string; file: string; anchor: { x: number; y: number }; footprint?: [number, number] }

export function buildingArt(read: (path: string) => string): { json: unknown; files: [string, string][] } {
  const j = JSON.parse(read('public/war/buildings/objects.json')) as ArtJson;
  const files: [string, string][] = [];
  const sprites: Record<string, Spr> = {};
  for (const o of j.objects) {
    sprites[`${o.building}/${o.state}`] = [o.file, o.tileOrigin.x, o.tileOrigin.y, o.footprint[0], o.footprint[1]];
    files.push([`public/war/buildings/${o.file}`, o.file]);
  }
  // the town art (buildArt.ts load): with the damaged and ruined looks; anchored at the footprint's south vertex
  const town: Record<string, Spr> = {};
  const want = new Set(Object.values(PRE_ART).flat().flatMap((id) => [id, `${id}-damaged`, `${id}-ruined`]));
  for (const lib of new Set([...want].map((id) => id.split('/')[0]))) {
    const objs = (JSON.parse(read(`public/war/biomes/${lib}/objects.json`)) as { objects: LibObj[] }).objects;
    for (const o of objs) {
      if (!want.has(`${lib}/${o.id}`)) continue;
      const [fw, fh] = o.footprint ?? [1, 1];
      town[`${lib}/${o.id}`] = [`${lib}/${o.file}`, o.anchor.x - (fw - fh) * HW, o.anchor.y + 1 - (fw + fh) * HH, fw, fh];
      files.push([`public/war/biomes/${lib}/${o.file}`, `${lib}/${o.file}`]);
    }
  }
  const p = j.progress ?? {};
  const stages = j.buildOrder?.length && j.progress
    ? j.buildOrder.filter((s) => typeof p[s] === 'number').map((s): [string, number] => [s, p[s]]).sort((a, b) => a[1] - b[1])
    : [['foundation', 0], ['scaffold', 0.5], ['done', 1]];
  return { json: { stages, art: ART_ID, pre: PRE_ART, sprites, town }, files };
}
