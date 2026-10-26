/// <reference lib="webworker" />
/**
 * Bakes the region's terrain off the main thread (./bakeClient.ts): the page's region (sent as soon as it loads; not
 * imported here, which would bundle every region into the worker), its own PixelLab art (loadArt with ImageBitmaps,
 * loading from the worker's start), iso map and ArtBaker (./art.ts, the procedural peaks over the mountains as the scene draws them), painting each asked
 * world rect into an OffscreenCanvas and posting it back as an ImageBitmap. Jobs run in the order they come; a view
 * mode's tint and the dev grid / zones (`opts`) apply to the jobs after them.
 */
import type { RegionData } from '../types';
import { ArtBaker, loadArt, type WarArt } from './art';
import { IsoMap } from './iso';
import { Massifs } from './massifs';
import { MapData, type Tint } from './mapModes';
import type { BakeOpts } from './terrain';

/** A world rect (x0, y0, w, h) baked at `scale` into a cw x ch bitmap; `cut`: the peaks cut to stubs; `objects`: the map objects baked in. */
export interface BakeJob { id: number; x0: number; y0: number; w: number; h: number; scale: number; cw: number; ch: number; cut: boolean; objects: boolean }
export type ToBake =
  | { t: 'art'; base: string }
  | { t: 'region'; region: RegionData }
  | { t: 'opts'; tint: Tint | null; grid: boolean; zones: boolean }
  | ({ t: 'job' } & BakeJob);
/** ready: the baker is built (ms since the worker started: its art loaded, the region in, the baker built); done: a job's bitmap and its paint time (ms). */
export type FromBake = { t: 'ready'; ms: { art: number; region: number; ready: number } } | { t: 'done'; id: number; bmp: ImageBitmap; ms: number } | { t: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const t0 = performance.now();
let art: Promise<WarArt> | null = null;
let artMs = 0;
let chain: Promise<unknown> = Promise.resolve();
let iso: IsoMap | null = null;
let baker: ArtBaker | null = null;
let map: MapData | null = null;
let region: RegionData | null = null;
const opts: BakeOpts = { tint: null, map: null, grid: false, zones: false };
const canvases = new Map<string, OffscreenCanvas>();

const post = (m: FromBake, transfer: Transferable[] = []) => ctx.postMessage(m, transfer);
const fail = (e: unknown) => post({ t: 'error', message: e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e) });

ctx.onmessage = (e: MessageEvent<ToBake>) => {
  const m = e.data;
  if (m.t === 'art') { art = loadArt(m.base); art.then(() => (artMs = performance.now() - t0), fail); return; }
  // everything else in order, after the baker is built
  chain = chain.then(() => run(m)).catch(fail);
};

async function run(m: ToBake): Promise<void> {
  if (m.t === 'region') {
    const r0 = performance.now() - t0, a = await art!;
    region = m.region;
    const mask = Massifs.maskOf(region);
    iso = new IsoMap(region, mask, mask && Massifs.screeOf(region, mask), true);
    baker = new ArtBaker(region, iso, a, null);
    post({ t: 'ready', ms: { art: artMs, region: r0, ready: performance.now() - t0 } });
    return;
  }
  if (m.t === 'opts') {
    if (m.tint) map ??= new MapData(region!);
    opts.tint = m.tint; opts.map = map; opts.grid = m.grid; opts.zones = m.zones;
    return;
  }
  if (m.t !== 'job' || !baker || !iso) return;
  const s = performance.now(), key = `${m.cw}x${m.ch}`;
  let c = canvases.get(key);
  if (!c) canvases.set(key, (c = new OffscreenCanvas(m.cw, m.ch)));
  const g = c.getContext('2d')! as unknown as CanvasRenderingContext2D;
  iso.cut = m.cut;
  baker.bake(g, m.x0, m.y0, m.w, m.h, m.scale, opts, 0, 0, m.objects);
  const bmp = c.transferToImageBitmap();
  post({ t: 'done', id: m.id, bmp, ms: performance.now() - s }, [bmp]);
}
