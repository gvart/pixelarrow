/**
 * The sample player: loads the bank's files (./bank.ts) lazily and plays them through the engine's buses.
 *
 *  - Lazy: nothing is fetched at startup. The first request for an id fetches and decodes its variants in the
 *    background; until then `ready()` is false and the engine plays the procedural recipe instead.
 *  - Format: Ogg Opus where the browser says it decodes it, else AAC in m4a (Safari); a failed Opus decode switches
 *    to m4a for good and retries.
 *  - One-shots: a variant (never the same twice running) at a jittered rate.
 *  - Loops: crossfaded by ./loops.ts `Crossfade`; only loaded loops take part, so a loop fades in once it has arrived.
 */
import { pickVariant, pitchRate, sampleDef, sampleUrl, SampleThrottle, type LoopId, type SampleId } from './bank';
import { Crossfade, type LoopLevels } from './loops';
import type { AudioRng } from './rng';

type Ext = 'ogg' | 'm4a';
type Fetcher = (url: string) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>;

function defaultExt(): Ext {
  try {
    const a = typeof Audio === 'function' ? new Audio() : null;
    return a && a.canPlayType('audio/ogg; codecs="opus"') ? 'ogg' : 'm4a';
  } catch {
    return 'm4a';
  }
}

interface LoopVoice { src: AudioBufferSourceNode; gain: GainNode }

export class SamplePlayer {
  private bufs = new Map<SampleId, AudioBuffer[]>();
  private loading = new Map<SampleId, Promise<void>>();
  private failed = new Set<SampleId>();
  private last = new Map<SampleId, number>();
  readonly throttle = new SampleThrottle();
  private readonly fade = new Crossfade(4);
  private wantLoops: LoopLevels = {};
  private voices = new Map<LoopId, LoopVoice>();
  readonly stats = { loaded: 0, bytes: 0, errors: 0 };

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly ambBus: AudioNode,
    private readonly rng: AudioRng,
    private ext: Ext = defaultExt(),
    private readonly fetcher: Fetcher = (u) => fetch(u),
    private readonly base = 'war/sfx/',
  ) {}

  /** Has `id` shipped files at all? */
  has(id: SampleId): boolean {
    return sampleDef(id).v > 0 && !this.failed.has(id);
  }

  /** Loaded and playable now. */
  ready(id: SampleId): boolean {
    return this.bufs.has(id);
  }

  /** Start loading `id` (once; no-op for ids without files). */
  request(id: SampleId): Promise<void> {
    if (!this.has(id) || this.bufs.has(id)) return Promise.resolve();
    let p = this.loading.get(id);
    if (!p) {
      p = this.load(id).finally(() => this.loading.delete(id));
      this.loading.set(id, p);
    }
    return p;
  }

  private async load(id: SampleId): Promise<void> {
    const n = sampleDef(id).v;
    try {
      const out: AudioBuffer[] = [];
      for (let k = 1; k <= n; k++) out.push(await this.fetchOne(id, k));
      this.bufs.set(id, out);
      this.stats.loaded++;
    } catch {
      this.stats.errors++;
      this.failed.add(id);
    }
  }

  private async fetchOne(id: SampleId, k: number): Promise<AudioBuffer> {
    for (;;) {
      const ext = this.ext;
      const res = await this.fetcher(sampleUrl(id, k, ext, this.base));
      if (!res.ok) throw new Error(`sample ${id}-${k}.${ext}: not found`);
      const data = await res.arrayBuffer();
      this.stats.bytes += data.byteLength;
      try {
        return await this.ctx.decodeAudioData(data);
      } catch (e) {
        if (ext === 'ogg') {
          this.ext = 'm4a'; // says it plays Opus, cannot decode it: AAC from now on
          continue;
        }
        throw e;
      }
    }
  }

  /** Play a loaded one-shot into `out` at `t`; its length in seconds (0: not loaded). */
  start(id: SampleId, out: AudioNode, t: number): number {
    const b = this.bufs.get(id);
    if (!b?.length) return 0;
    const k = pickVariant(b.length, this.last.get(id), this.rng);
    this.last.set(id, k);
    const src = this.ctx.createBufferSource();
    src.buffer = b[k];
    const rate = pitchRate(sampleDef(id).cents, this.rng);
    src.playbackRate.value = rate;
    src.connect(out);
    src.start(t);
    return b[k].duration / rate;
  }

  /** The loops wanted now (0..1 each); unloaded ones are fetched and join the crossfade when they arrive. */
  setLoops(levels: LoopLevels): void {
    this.wantLoops = levels;
    this.retarget();
  }

  private retarget(): void {
    const t: LoopLevels = {};
    for (const [id, v] of Object.entries(this.wantLoops) as [LoopId, number][]) {
      if (this.ready(id)) t[id] = v;
      else if (this.has(id)) void this.request(id).then(() => this.retarget());
    }
    this.fade.set(t);
  }

  /** Is a loop loaded (the procedural bed it stands in for steps back)? */
  loopReady(id: LoopId): boolean {
    return this.ready(id);
  }

  /** Advance the crossfade `dt` seconds and set the loop voices' gains. */
  pump(dt: number): void {
    this.fade.step(dt);
    const g = this.fade.gains(), now = this.ctx.currentTime;
    for (const [id, v] of this.voices) {
      if (g[id] === undefined) {
        try { v.src.stop(); } catch { /* stopped */ }
        v.gain.disconnect();
        this.voices.delete(id);
      }
    }
    for (const [id, gain] of Object.entries(g) as [LoopId, number][]) {
      let v = this.voices.get(id);
      const b = this.bufs.get(id);
      if (!v && b?.length) {
        const node = this.ctx.createGain();
        node.gain.value = 0;
        node.connect(this.ambBus);
        const src = this.ctx.createBufferSource();
        src.buffer = b[0];
        src.loop = true;
        src.connect(node);
        // start at a random place, so two visits to one region do not open on the same gust
        src.start(now, this.rng.range(0, b[0].duration));
        this.voices.set(id, (v = { src, gain: node }));
      }
      v?.gain.gain.setTargetAtTime(gain * sampleDef(id).level, now, 0.08);
    }
  }

  /** Loops sounding now (tests, the debug handle). */
  get loops(): LoopId[] {
    return [...this.voices.keys()];
  }
}
