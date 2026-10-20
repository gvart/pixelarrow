/**
 * War regions the server hosts: every authored region (src/war/regions/<id>.json), each room on its own map.
 *
 * Bundling: the region JSONs ship inside the Worker as Text modules (wrangler.jsonc `rules`), so an isolate holds them as
 * plain strings (about 16 MB raw for all 38, about 3 MB gzipped in the upload, well under the paid plan's 10 MB
 * compressed script limit) and parses only the region its room asks for, once (cache below). Inlined as JS objects they
 * would be built at every isolate's startup (the API Worker's too). Under Vite (vitest) a JSON import is the parsed
 * object; both forms are read here.
 *
 * Version: regionVersion(id) hashes the authored JSON. The room's saved state and its memory carry it with the season
 * (./regionDO.ts); a changed region or a new season starts the region over from its authored data.
 */
import { parseRegion } from '../../../src/war/region/schema';
import type { RegionData } from '../../../src/war/types';
import achelous from '../../../src/war/regions/achelous.json';
import ammon from '../../../src/war/regions/ammon.json';
import ammos from '../../../src/war/regions/ammos.json';
import bacchae from '../../../src/war/regions/bacchae.json';
import canyons from '../../../src/war/regions/canyons.json';
import delta from '../../../src/war/regions/delta.json';
import dodonaE from '../../../src/war/regions/dodona-e.json';
import dodonaN from '../../../src/war/regions/dodona-n.json';
import dodonaS from '../../../src/war/regions/dodona-s.json';
import dodonaW from '../../../src/war/regions/dodona-w.json';
import dodona from '../../../src/war/regions/dodona.json';
import elaiaE from '../../../src/war/regions/elaia-e.json';
import elaiaN from '../../../src/war/regions/elaia-n.json';
import elaiaS from '../../../src/war/regions/elaia-s.json';
import elaiaW from '../../../src/war/regions/elaia-w.json';
import elaia from '../../../src/war/regions/elaia.json';
import erymanthos from '../../../src/war/regions/erymanthos.json';
import gorge from '../../../src/war/regions/gorge.json';
import kimmeria from '../../../src/war/regions/kimmeria.json';
import kleisoura from '../../../src/war/regions/kleisoura.json';
import krios from '../../../src/war/regions/krios.json';
import kyreneE from '../../../src/war/regions/kyrene-e.json';
import kyreneN from '../../../src/war/regions/kyrene-n.json';
import kyreneS from '../../../src/war/regions/kyrene-s.json';
import kyreneW from '../../../src/war/regions/kyrene-w.json';
import kyrene from '../../../src/war/regions/kyrene.json';
import moors from '../../../src/war/regions/moors.json';
import omphalos from '../../../src/war/regions/omphalos.json';
import saddle from '../../../src/war/regions/saddle.json';
import savanna from '../../../src/war/regions/savanna.json';
import siren from '../../../src/war/regions/siren.json';
import skythiaE from '../../../src/war/regions/skythia-e.json';
import skythiaN from '../../../src/war/regions/skythia-n.json';
import skythiaS from '../../../src/war/regions/skythia-s.json';
import skythiaW from '../../../src/war/regions/skythia-w.json';
import skythia from '../../../src/war/regions/skythia.json';
import stymphalia from '../../../src/war/regions/stymphalia.json';
import testRidge from '../../../src/war/regions/test-ridge.json';

const SOURCES: Record<string, unknown> = {
  achelous, ammon, ammos, bacchae, canyons, delta,
  dodona, 'dodona-e': dodonaE, 'dodona-n': dodonaN, 'dodona-s': dodonaS, 'dodona-w': dodonaW,
  elaia, 'elaia-e': elaiaE, 'elaia-n': elaiaN, 'elaia-s': elaiaS, 'elaia-w': elaiaW,
  erymanthos, gorge, kimmeria, kleisoura, krios,
  kyrene, 'kyrene-e': kyreneE, 'kyrene-n': kyreneN, 'kyrene-s': kyreneS, 'kyrene-w': kyreneW,
  moors, omphalos, saddle, savanna, siren,
  skythia, 'skythia-e': skythiaE, 'skythia-n': skythiaN, 'skythia-s': skythiaS, 'skythia-w': skythiaW,
  stymphalia, 'test-ridge': testRidge,
};
const cache = new Map<string, { data: RegionData; ver: string }>();

export const WAR_REGIONS = Object.keys(SOURCES);

/** FNV-1a 32 of a text, base 36. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

function load(id: string): { data: RegionData; ver: string } | null {
  const hit = cache.get(id);
  if (hit) return hit;
  const src = Object.hasOwn(SOURCES, id) ? SOURCES[id] : undefined;
  if (src === undefined) return null;
  const text = typeof src === 'string' ? src : JSON.stringify(src);
  const { visual: _v, biomes: _b, ...data } = parseRegion(typeof src === 'string' ? JSON.parse(src) : src);
  data.id = id;
  const out = { data, ver: `${text.length.toString(36)}.${hash(text)}` };
  cache.set(id, out);
  return out;
}

/** The parsed region (sim layers only: the visual-only ones are dropped), or null for an unknown id. */
export function warRegion(id: string): RegionData | null {
  return load(id)?.data ?? null;
}

/** The authored region's version (length and hash of its JSON); '' for an unknown id. */
export function regionVersion(id: string): string {
  return load(id)?.ver ?? '';
}
