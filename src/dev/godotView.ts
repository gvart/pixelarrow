/**
 * View data for the Godot region view (docs/impl/godot-port.md P9), computed by the Phaser client's own art code so the
 * Godot painter (godot/src/region/ground.gd) draws the same ground: the iso map's visual cells (levels, ramp corners,
 * kinds), the art baker's per-cell picks (autotile frame, baked light, tint, foam, wall cuts, wall stone), the water light
 * field, the tree shadows, and one atlas of every 32 x 32 frame the region's cells draw (fine frames, smoothed
 * transition frames, cliff strips) plus the shadow, foam and white sprites. Pure data and pixels: the rules that need a
 * canvas (frame cutting, smoothed edges, relit trees, stone textures) run here, the drawing runs in Godot.
 * Runs in a browser page (it needs canvases): scripts/godot/view.mjs.
 */
import { loadArt, type WarArt } from '../war/view/art';
import { ArtBaker } from '../war/view/art';
import { IsoMap, LH, SIDE, ZBASE } from '../war/view/iso';
import { Massifs } from '../war/view/massifs';
import { KINDS } from '../war/regions/visual';
import { loadRegion } from '../war/region/loader';
import { FOAM_H, FOAM_W, PEAT_SHORE, RELIEF_FILL, SHADOW_H, SHADOW_W, SHORE_WET, TINT_FILL, foamSprite, treeShadow } from '../war/view/relief';
import { STONES, WALL_H, WALL_W, wallTexture, type Stone } from '../war/view/rockFace';
import { VARIANT } from '../war/view/autotile';
import { canvas } from '../war/view/canvas';
import { ANIM_FALLBACK } from '../art/sheetManifest';

/** Atlas page side and slot side (px). Rows 0-2 hold the specials (shadow 128 x 96 at 0,0; foam at 128,0; white at 160,0). */
const PAGE = 4096, SLOT = 32, COLS = PAGE / SLOT, FIRST = 3 * COLS;
const STONE_IDS: Stone[] = ['sandstone', 'limestone', 'granite', 'basalt'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

let art: Promise<WarArt> | null = null;

const png = (c: HTMLCanvasElement | OffscreenCanvas) => (c as HTMLCanvasElement).toDataURL('image/png');

/** A region's view data: meta (JSON), the cell layers (one buffer, base64) and the atlas pages (PNG data URLs). */
export async function exportRegion(id: string): Promise<{ meta: unknown; cells: string; pages: string[] }> {
  const a = await (art ??= loadArt('/war/'));
  const r = await loadRegion(id);
  // as the scene and the bake worker build them (src/war/view/SandboxScene.ts create, bakeWorker.ts)
  const mask = Massifs.maskOf(r);
  const iso = new IsoMap(r, mask, mask && Massifs.screeOf(r, mask), true);
  const baker = new ArtBaker(r, iso, a, null) as Any;
  const { fw, fh } = iso, n = fw * fh;

  // the atlas: every distinct frame the cells draw
  const pages: HTMLCanvasElement[] = [];
  const slotOf = new Map<string, number>(), srcId = new Map<CanvasImageSource, number>();
  let next = FIRST;
  const page = (k: number) => {
    while (pages.length <= k) pages.push(canvas(PAGE, PAGE));
    return pages[k].getContext('2d')!;
  };
  const put = (img: CanvasImageSource, sx: number, sy: number, w = SLOT, h = SLOT): number => {
    let s = srcId.get(img);
    if (s === undefined) srcId.set(img, (s = srcId.size));
    const key = `${s}:${sx}:${sy}:${w}:${h}`;
    let slot = slotOf.get(key);
    if (slot !== undefined) return slot;
    if (next % (COLS * COLS) === 0) next += FIRST; // a new page starts past its specials' rows
    slot = next++;
    const pg = Math.floor(slot / (COLS * COLS)), q = slot % (COLS * COLS);
    page(pg).drawImage(img, sx, sy, w, h, (q % COLS) * SLOT, Math.floor(q / COLS) * SLOT, w, h);
    slotOf.set(key, slot);
    return slot;
  };
  const g0 = page(0);
  g0.drawImage(treeShadow(), 0, 0);
  g0.drawImage(foamSprite(), 128, 0);
  g0.fillStyle = '#fff';
  g0.fillRect(160, 0, SLOT, SLOT);

  const slot = new Int32Array(n).fill(-1);
  const flags = new Uint8Array(n), stone = new Uint8Array(n);
  const wetK = (k: string) => k === 'shallow' || k === 'deep';
  for (let i = 0; i < n; i++) {
    const x = i % fw, y = (i / fw) | 0;
    if (baker.code[i] < 0) continue;
    if (baker.peaks?.covers(x >> 1, y >> 1)) { flags[i] |= 16; continue; }
    const [img, sx, sy] = baker.frameOf(i);
    slot[i] = put(img, sx, sy);
    if (baker.lit(i)) flags[i] |= 1;
    if (baker.peat(i)) flags[i] |= 2;
    const c = baker.code[i], g = baker.corners[i];
    if (g !== 0xffff && c >= 0 && c < VARIANT * 64) {
      const sh = a.tiles.sheets[c >> 6];
      if (wetK(sh.first) !== wetK(sh.second)) flags[i] |= wetK(sh.first) ? 4 : 8;
    }
    // the wall stone if the cell's drop is a rock wall (ArtBaker.stoneAt with drop > 1)
    const st = baker.stoneAt(i, 2) as Stone | null;
    stone[i] = st ? STONE_IDS.indexOf(st) + 1 : 0;
  }

  // cliff strips: every strip of every cliff (shade * n + k), 32 x 24 in a 32 x 32 slot
  const fine = baker.fine, cliffs: Record<string, { slot: number; n: number; roles?: unknown }> = {};
  for (const [cid, c] of Object.entries(fine.cliffs as Record<string, HTMLCanvasElement>)) {
    const info = fine.cliffInfo[cid], total = c.width / SLOT;
    let first = -1;
    for (let k = 0; k < total; k++) { const s = put(c, k * SLOT, 0, SLOT, 24); if (k === 0) first = s; else if (s !== first + k) throw new Error('cliff strips not contiguous'); }
    cliffs[cid] = { slot: first, n: info.n, roles: info.roles };
  }
  const cl = fine.cliffs, pick = (...ids: (string | undefined)[]) => ids.find((x) => x && cl[x]) ?? 'earth';
  const sets = a.sets.map((s) => { const crag = pick(s.crag, 'rock', 'earth'), snow = pick(s.snow, crag); return [crag, pick(s.earth), snow, pick(s.ice, snow)]; });

  // the cell layers, little endian, in this order (godot/src/region/view_data.gd)
  const W = r.w, H = r.h;
  const zm: Float32Array = (iso as Any).zmax();
  const parts: ArrayBufferView[] = [
    slot, Float32Array.from(iso.fz), Float32Array.from(iso.fc),
    iso.fk, iso.ramp, baker.shade, baker.tint, baker.foam, baker.cut, stone, flags,
    baker.corners,
    new Uint8Array(baker.waterLight.getContext('2d')!.getImageData(0, 0, fw, fh).data.buffer),
    baker.setOf, Float32Array.from(iso.z), Float32Array.from(iso.zu), Float32Array.from(iso.zh), Float32Array.from(zm),
  ];
  let bytes = 0;
  for (const p of parts) bytes += p.byteLength;
  const buf = new Uint8Array(bytes);
  let o = 0;
  for (const p of parts) { buf.set(new Uint8Array(p.buffer, p.byteOffset, p.byteLength), o); o += p.byteLength; }
  let bin = '';
  for (let k = 0; k < buf.length; k += 0x8000) bin += String.fromCharCode(...buf.subarray(k, k + 0x8000));

  const shadows: number[][] = [];
  (baker.shadows as { x: number; y: number; w: number; h: number }[][]).forEach((row, v) => { for (const t of row) shadows.push([v, t.x, t.y, t.w, t.h]); });
  // checks for the Godot projection (godot/tests/region/test_iso.gd): seeded tile points with the TS surface, unit level,
  // the pick of their world point and whether a point a body's height over them is hidden
  const samples: number[][] = [];
  let seed = 12345;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  for (let k = 0; k < 400; k++) {
    const x = rnd() * W, y = rnd() * H, z = iso.zAt(x, y), wx = iso.sx(x, y), wy = iso.sy(x, y, z), p = iso.pick(wx, wy);
    samples.push([x, y, z, iso.zDraw(x, y), wx, wy, p.x, p.y, iso.hidden(wx, wy - 28, x + y, z) ? 1 : 0]);
  }
  const meta = {
    id, w: W, h: H, fw, fh, OX: iso.OX, OY: iso.OY, W: iso.W, H: iso.H, top: iso.top, groundTop: iso.groundTop, LH, SIDE, ZBASE,
    bytes, pages: pages.length, page: PAGE, slot: SLOT, first: FIRST,
    specials: { shadow: [0, 0, SHADOW_W, SHADOW_H], foam: [128, 0, FOAM_W, FOAM_H], white: [160, 0, SLOT, SLOT] },
    kinds: KINDS, sets: a.sets.map((s) => s.name), setCliffs: sets, cliffs,
    stones: STONE_IDS, wall: [WALL_W, WALL_H],
    relief: RELIEF_FILL, tints: TINT_FILL, shoreWet: SHORE_WET, peatShore: PEAT_SHORE, shadows,
    peaks: !!iso.peaks, frames: next - FIRST, samples,
  };
  return { meta, cells: btoa(bin), pages: pages.map(png) };
}

/** The objects' art (trees relit for the NW light, as the scene draws them) for the def ids asked: PNG data URLs and defs. */
export async function exportObjects(ids: string[]): Promise<{ defs: unknown[]; images: Record<string, string> }> {
  const a = await (art ??= loadArt('/war/'));
  const want = new Set(ids), defs: unknown[] = [], images: Record<string, string> = {};
  for (const d of a.defs) {
    if (!want.has(d.id)) continue;
    const im = a.objImg.get(d.id)!, c = canvas(im.width, im.height);
    c.getContext('2d')!.drawImage(im, 0, 0);
    images[d.id] = png(c);
    defs.push(d);
  }
  return { defs, images };
}

/** The rock wall textures (./rockFace.ts wallTexture), PNG data URLs by stone. */
export function exportStones(): Record<string, string> {
  return Object.fromEntries(STONE_IDS.map((s) => [s, png(wallTexture(s))]));
}

/** Def ids the region's objects use. */
export async function objectIds(id: string): Promise<string[]> {
  const r = await loadRegion(id);
  return [...new Set((r.objects ?? []).map((o) => o.id))];
}

export { STONES };

/** The clips a sheet falls back to (src/art/sheetManifest.ts ANIM_FALLBACK), for the Godot animator. */
export const animFallback = () => ANIM_FALLBACK;
