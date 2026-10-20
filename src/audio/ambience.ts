/**
 * Procedural ambience beds (the war's biomes, src/war/view/sound): every layer is synthesised here, no samples.
 *
 *   wind     light wind over open country (filtered brown noise, slow gusts)
 *   gale     mountain wind: lower, stronger gusts and a whistling band
 *   desert   dry wind with blown sand (high hiss, slow swells)
 *   birds    forest birds: sporadic chirps and short trills
 *   river    running water (band-limited noise with fast flutter)
 *   sea      surf: slow swells of noise
 *   murmur   a town: babble of distant voices and the odd knock
 *   fire     a blaze nearby: roar and crackles
 *
 * A layer's nodes are built the first time its level rises above silence and dropped again after a while silent,
 * so a region only runs the beds it has (the "lazy load" of procedural audio). Levels glide (time constant FADE).
 * `pump(until)` schedules the sporadic events (chirps, voices, crackles) ahead, like the music sequencer.
 */
import type { AudioRng } from './rng';
import { brownNoise, noise, osc, whiteNoise, type Ctx } from './synth';

export const AMB_LAYERS = ['wind', 'gale', 'desert', 'birds', 'river', 'sea', 'murmur', 'fire'] as const;
export type AmbLayer = (typeof AMB_LAYERS)[number];
export type AmbLevels = Partial<Record<AmbLayer, number>>;

/** Level glide time constant (s). */
const FADE = 1.2;
/** A layer silent this long (s) is torn down. */
const IDLE = 8;
const SILENT = 0.01;

interface Bed {
  gain: GainNode;
  stop: () => void;
  level: number;
  quietSince: number;
  /** Next sporadic event (audio clock). */
  next: number;
}

/** Peak gain per layer at level 1 (balanced by ear against the SFX bus). */
const PEAK: Record<AmbLayer, number> = { wind: 0.35, gale: 0.45, desert: 0.3, birds: 0.5, river: 0.3, sea: 0.4, murmur: 0.4, fire: 0.45 };

export class AmbiencePlayer {
  private beds = new Map<AmbLayer, Bed>();
  private want: AmbLevels = {};

  constructor(
    private readonly c: Ctx,
    private readonly bus: AudioNode,
    private readonly r: AudioRng,
  ) {}

  /** Target levels 0..1 per layer (missing: 0). */
  set(levels: AmbLevels): void {
    this.want = levels;
    const now = this.c.currentTime;
    for (const id of AMB_LAYERS) {
      const v = Math.max(0, Math.min(1, levels[id] ?? 0));
      let b = this.beds.get(id);
      if (!b && v > SILENT) this.beds.set(id, (b = this.build(id, now)));
      if (!b || Math.abs(b.level - v) < 0.005) continue;
      b.level = v;
      b.gain.gain.setTargetAtTime(v * PEAK[id], now, FADE);
      if (v > SILENT) b.quietSince = Infinity;
      else if (b.quietSince === Infinity) b.quietSince = now;
    }
  }

  /** Layers running now (tests, the debug handle). */
  get running(): AmbLayer[] {
    return [...this.beds.keys()];
  }

  get levels(): AmbLevels {
    return { ...this.want };
  }

  /** Schedule sporadic events up to `until`; drop beds silent for IDLE s. */
  pump(until: number): void {
    const now = this.c.currentTime;
    for (const [id, b] of this.beds) {
      if (b.quietSince !== Infinity && now - b.quietSince > IDLE) {
        b.stop();
        this.beds.delete(id);
        continue;
      }
      if (b.level <= SILENT) continue;
      if (b.next < now - 0.5) b.next = now + 0.05;
      while (b.next < until) {
        b.next += this.event(id, b, b.next);
      }
    }
  }

  stopAll(): void {
    for (const b of this.beds.values()) b.stop();
    this.beds.clear();
  }

  /** One sporadic event of a layer at t; returns the gap to the next (s). */
  private event(id: AmbLayer, b: Bed, t: number): number {
    const c = this.c, r = this.r, out = b.gain;
    switch (id) {
      case 'birds': {
        // a chirp or a short trill of a few notes
        const n = r.chance(0.35) ? r.int(4) + 3 : r.int(2) + 1, f = r.range(2400, 4600);
        for (let i = 0; i < n; i++) osc(c, out, t + i * r.range(0.06, 0.1), { f: f * r.jit(1, 0.08), f1: f * r.range(0.75, 1.3), dur: r.range(0.04, 0.09), gain: r.range(0.04, 0.09), a: 0.008 });
        return r.range(0.4, 2.2) / (0.4 + b.level);
      }
      case 'murmur': {
        // a distant voice: a formant-filtered buzz
        osc(c, out, t, { type: 'sawtooth', f: r.range(110, 240), f1: r.range(100, 220), dur: r.range(0.25, 0.7), gain: 0.012, a: 0.08, vib: [r.range(4, 7), 25] });
        if (r.chance(0.15)) noise(c, out, t, { dur: 0.03, gain: 0.06, f: r.jit(900, 0.3), q: 3 });
        return r.range(0.15, 0.6);
      }
      case 'fire':
        noise(c, out, t, { dur: r.range(0.008, 0.02), gain: r.range(0.08, 0.25), f: r.jit(3000, 0.4), q: 2 });
        return r.range(0.03, 0.25) / (0.4 + b.level);
      default:
        return 5;
    }
  }

  /** The continuous part of a layer (silent until its gain rises). */
  private build(id: AmbLayer, now: number): Bed {
    const c = this.c;
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.connect(this.bus);
    const nodes: (AudioScheduledSourceNode)[] = [];
    const loop = (brown: boolean, rate = 1): AudioBufferSourceNode => {
      const s = c.createBufferSource();
      s.buffer = brown ? brownNoise(c) : whiteNoise(c);
      s.loop = true;
      s.playbackRate.value = rate;
      s.start(now, this.r.range(0, 1.5));
      nodes.push(s);
      return s;
    };
    const filter = (type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode => {
      const b = c.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      return b;
    };
    /** A slow LFO into `p` (depth in p's units). */
    const lfo = (p: AudioParam, hz: number, depth: number): void => {
      const o = c.createOscillator();
      o.frequency.value = hz * this.r.jit(1, 0.2);
      const g = c.createGain();
      g.gain.value = depth;
      o.connect(g).connect(p);
      o.start(now);
      nodes.push(o);
    };
    const amp = (into: AudioNode, base: number): GainNode => {
      const g = c.createGain();
      g.gain.value = base;
      g.connect(into);
      return g;
    };
    switch (id) {
      case 'wind': {
        const f = filter('bandpass', 420, 0.6), g = amp(gain, 0.6);
        loop(true).connect(f).connect(g);
        lfo(f.frequency, 0.07, 180);
        lfo(g.gain, 0.11, 0.35);
        break;
      }
      case 'gale': {
        const f = filter('lowpass', 520, 1), g = amp(gain, 0.7);
        loop(true, 0.8).connect(f).connect(g);
        lfo(f.frequency, 0.05, 300);
        lfo(g.gain, 0.09, 0.4);
        // the whistle round the crags
        const w = filter('bandpass', 1150, 14), wg = amp(gain, 0.12);
        loop(false).connect(w).connect(wg);
        lfo(w.frequency, 0.06, 260);
        lfo(wg.gain, 0.13, 0.1);
        break;
      }
      case 'desert': {
        const f = filter('bandpass', 2600, 0.5), g = amp(gain, 0.35);
        loop(false).connect(f).connect(g);
        lfo(g.gain, 0.06, 0.25);
        const lo = filter('lowpass', 300), lg = amp(gain, 0.5);
        loop(true).connect(lo).connect(lg);
        lfo(lg.gain, 0.04, 0.3);
        break;
      }
      case 'river': {
        const f = filter('bandpass', 900, 0.9), g = amp(gain, 0.6);
        loop(false, 0.6).connect(f).connect(g);
        lfo(g.gain, 3.1, 0.12);
        lfo(f.frequency, 0.4, 250);
        const lo = filter('lowpass', 280), lg = amp(gain, 0.5);
        loop(true).connect(lo).connect(lg);
        break;
      }
      case 'sea': {
        const f = filter('lowpass', 700, 0.8), g = amp(gain, 0.5);
        loop(true).connect(f).connect(g);
        lfo(g.gain, 0.12, 0.45);
        lfo(f.frequency, 0.12, 400);
        const hi = filter('highpass', 2500), hg = amp(gain, 0.12);
        loop(false).connect(hi).connect(hg);
        lfo(hg.gain, 0.12, 0.1);
        break;
      }
      case 'murmur': {
        // the crowd's bed: noise through two vowel formants
        for (const [fq, q, v] of [[600, 3, 0.25], [1200, 4, 0.12]] as const) {
          const f = filter('bandpass', fq, q), g = amp(gain, v);
          loop(false, 0.5).connect(f).connect(g);
          lfo(g.gain, 0.2, v * 0.4);
        }
        break;
      }
      case 'fire': {
        const f = filter('lowpass', 500, 0.8), g = amp(gain, 0.6);
        loop(true).connect(f).connect(g);
        lfo(g.gain, 0.7, 0.2);
        break;
      }
      case 'birds':
        break; // events only
    }
    return {
      gain,
      level: 0,
      quietSince: Infinity,
      next: now + 0.2,
      stop: () => {
        const t = c.currentTime;
        for (const n of nodes) {
          try {
            n.stop(t + 0.05);
          } catch {
            /* already stopped */
          }
        }
        setTimeout(() => gain.disconnect(), 200);
      },
    };
  }
}
