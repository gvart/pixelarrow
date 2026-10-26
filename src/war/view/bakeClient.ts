/**
 * The main thread's end of the terrain bake worker (./bakeWorker.ts): started at page load so its art loads alongside
 * the page's, and given the region as soon as the page has it; the scene (./SandboxScene.ts) asks it for chunks, see-through windows and overview
 * bands and gets ImageBitmaps back. Only for the default look (PixelLab art, procedural peaks) and where OffscreenCanvas
 * exists; elsewhere the scene bakes on the main thread.
 */
import type { RegionData } from '../types';
import type { BakeJob, FromBake, ToBake } from './bakeWorker';
import type { BakeOpts } from './terrain';

export class BakeClient {
  private worker = new Worker(new URL('./bakeWorker.ts', import.meta.url), { type: 'module' });
  private next = 1;
  private wait = new Map<number, (bmp: ImageBitmap, ms: number) => void>();
  /** The worker's baker is built. */
  ready = false;
  /** It failed (the scene falls back to baking on the main thread). */
  failed = false;
  /** Ms from the worker's start to its art loaded, the region in and its baker built. */
  readyMs = { art: 0, region: 0, ready: 0 };

  constructor(base: string) {
    this.worker.onmessage = (e: MessageEvent<FromBake>) => {
      const m = e.data;
      if (m.t === 'ready') { this.ready = true; this.readyMs = m.ms; return; }
      if (m.t === 'error') { console.error('[bake worker]', m.message); this.failed = true; return; }
      const cb = this.wait.get(m.id);
      this.wait.delete(m.id);
      if (cb) cb(m.bmp, m.ms); else m.bmp.close();
    };
    this.worker.onerror = (e) => { console.error('[bake worker]', e.message); this.failed = true; };
    this.send({ t: 'art', base });
  }

  /** The worker for this page, or null where the scene bakes itself (?art=grey, ?mountains=..., no OffscreenCanvas). */
  static start(q: URLSearchParams): BakeClient | null {
    if (q.get('art') === 'grey' || q.has('mountains') || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return null;
    return new BakeClient(new URL('war/', location.href).href);
  }

  /** The region, as soon as the page has loaded it (the worker builds its baker once its art is in too). */
  region(r: RegionData): void {
    this.send({ t: 'region', region: r });
  }

  /** Jobs asked and not back yet. */
  get busy(): number {
    return this.wait.size;
  }

  /** The view mode's tint, the grid and the zones for the jobs that follow. */
  opts(o: BakeOpts): void {
    this.send({ t: 'opts', tint: o.tint, grid: o.grid, zones: o.zones });
  }

  /** Ask for a bake; `done` gets its bitmap (owned by the callee: close it when drawn) and the worker's paint ms. */
  bake(job: Omit<BakeJob, 'id'>, done: (bmp: ImageBitmap, ms: number) => void): void {
    const id = this.next++;
    this.wait.set(id, done);
    this.send({ t: 'job', id, ...job });
  }

  private send(m: ToBake): void {
    this.worker.postMessage(m);
  }
}
