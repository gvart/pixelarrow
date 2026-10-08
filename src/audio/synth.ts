/**
 * Web Audio building blocks shared by the sound effects and the music:
 * filtered noise bursts, swept oscillators, inharmonic "bronze" partials,
 * Karplus-Strong plucked strings and a soft-clip waveshaper for grit.
 * Everything takes a BaseAudioContext, so the same code renders live and
 * offline (OfflineAudioContext, see scripts/audio-samples.mjs).
 */
export type Ctx = BaseAudioContext;

interface Cache {
  white?: AudioBuffer;
  brown?: AudioBuffer;
  plucks: Map<string, { buf: AudioBuffer; rate: number }>;
}
const caches = new WeakMap<Ctx, Cache>();
function cache(c: Ctx): Cache {
  let k = caches.get(c);
  if (!k) caches.set(c, (k = { plucks: new Map() }));
  return k;
}

/** Fixed-seed noise so offline renders are reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}

/** Start offsets into the noise buffers (deterministic, so offline renders repeat). */
const offRand = lcg(4242);

export function whiteNoise(c: Ctx): AudioBuffer {
  const k = cache(c);
  if (!k.white) {
    const n = Math.floor(c.sampleRate * 2);
    k.white = c.createBuffer(1, n, c.sampleRate);
    const d = k.white.getChannelData(0);
    const r = lcg(12345);
    for (let i = 0; i < n; i++) d[i] = r();
  }
  return k.white;
}

/** Brown (integrated) noise: deep rumbles, crowds, hooves on earth. */
export function brownNoise(c: Ctx): AudioBuffer {
  const k = cache(c);
  if (!k.brown) {
    const n = Math.floor(c.sampleRate * 2);
    k.brown = c.createBuffer(1, n, c.sampleRate);
    const d = k.brown.getChannelData(0);
    const r = lcg(777);
    let last = 0;
    for (let i = 0; i < n; i++) {
      last = (last + 0.02 * r()) / 1.02;
      d[i] = last * 3.5;
    }
  }
  return k.brown;
}

const curves = new Map<number, Float32Array<ArrayBuffer>>();
/** tanh soft clip; `amount` ~1 (warm) .. 8 (crunchy). */
export function shaperCurve(amount: number): Float32Array<ArrayBuffer> {
  let cv = curves.get(amount);
  if (!cv) {
    cv = new Float32Array(1024);
    const norm = Math.tanh(amount);
    for (let i = 0; i < cv.length; i++) {
      const x = (i / (cv.length - 1)) * 2 - 1;
      cv[i] = Math.tanh(x * amount) / norm;
    }
    curves.set(amount, cv);
  }
  return cv;
}

/** A soft-clip stage feeding `out`; connect sources to the returned node. */
export function grit(c: Ctx, out: AudioNode, amount = 3): AudioNode {
  const ws = c.createWaveShaper();
  ws.curve = shaperCurve(amount);
  ws.connect(out);
  return ws;
}

/** Percussive envelope: linear attack to `peak`, exponential decay to silence. */
export function perc(p: AudioParam, t: number, a: number, peak: number, d: number): void {
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(Math.max(0.0001, peak), t + Math.max(0.001, a));
  p.exponentialRampToValueAtTime(0.0001, t + Math.max(0.001, a) + Math.max(0.005, d));
}

export interface NoiseOpts {
  dur: number;
  gain: number;
  /** Filter frequency (and sweep target). */
  f: number;
  f1?: number;
  q?: number;
  type?: BiquadFilterType;
  a?: number;
  brown?: boolean;
  /** Playback rate of the noise buffer (coloration). */
  rate?: number;
}

/** A filtered noise burst. Returns its end time. */
export function noise(c: Ctx, out: AudioNode, t: number, o: NoiseOpts): number {
  const src = c.createBufferSource();
  src.buffer = o.brown ? brownNoise(c) : whiteNoise(c);
  src.playbackRate.value = o.rate ?? 1;
  const f = c.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.frequency.setValueAtTime(o.f, t);
  if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
  f.Q.value = o.q ?? 1;
  const g = c.createGain();
  perc(g.gain, t, o.a ?? 0.002, o.gain, o.dur);
  src.connect(f).connect(g).connect(out);
  const off = (src.buffer.duration - o.dur - 0.1) * (offRand() * 0.5 + 0.5);
  src.start(t, Math.max(0, off));
  src.stop(t + (o.a ?? 0.002) + o.dur + 0.05);
  return t + (o.a ?? 0.002) + o.dur;
}

export interface OscOpts {
  type?: OscillatorType;
  f: number;
  f1?: number;
  dur: number;
  gain: number;
  a?: number;
  detune?: number;
  /** Vibrato [rate Hz, depth cents]. */
  vib?: [number, number];
}

/** A swept oscillator with a percussive envelope. Returns its end time. */
export function osc(c: Ctx, out: AudioNode, t: number, o: OscOpts): number {
  const s = c.createOscillator();
  s.type = o.type ?? 'sine';
  s.frequency.setValueAtTime(o.f, t);
  if (o.f1 !== undefined) s.frequency.exponentialRampToValueAtTime(Math.max(10, o.f1), t + o.dur);
  if (o.detune) s.detune.value = o.detune;
  const g = c.createGain();
  perc(g.gain, t, o.a ?? 0.002, o.gain, o.dur);
  s.connect(g).connect(out);
  const end = t + (o.a ?? 0.002) + o.dur;
  if (o.vib) {
    const l = c.createOscillator();
    l.frequency.value = o.vib[0];
    const lg = c.createGain();
    lg.gain.value = o.vib[1];
    l.connect(lg).connect(s.detune);
    l.start(t);
    l.stop(end + 0.05);
  }
  s.start(t);
  s.stop(end + 0.05);
  return end;
}

/** Inharmonic partials: struck bronze (shield boss, helmet, coins). */
export function metal(c: Ctx, out: AudioNode, t: number, f: number, ratios: readonly number[], dur: number, gain: number): number {
  let end = t;
  ratios.forEach((r, i) => {
    end = Math.max(end, osc(c, out, t, { f: f * r, dur: dur / (1 + i * 0.35), gain: gain / (1 + i * 0.6), type: 'sine' }));
  });
  return end;
}

/**
 * Karplus-Strong plucked string rendered into a buffer (cached per pitch):
 * the lyre / kithara of the music and the bow-string twang. The loop length
 * is rounded to whole samples; the playback rate corrects the pitch.
 */
export function pluckBuffer(c: Ctx, freq: number, dur: number, bright = 0.5): { buf: AudioBuffer; rate: number } {
  const key = `${freq.toFixed(2)}:${dur}:${bright}`;
  const k = cache(c);
  const hit = k.plucks.get(key);
  if (hit) return hit;
  const sr = c.sampleRate;
  const exact = sr / freq;
  const n = Math.max(2, Math.round(exact));
  const len = Math.floor(sr * dur);
  const buf = c.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const ring = new Float32Array(n);
  const r = lcg(Math.round(freq * 100));
  // excitation: noise, low-passed more for a darker pluck
  let lp = 0;
  const a = 0.15 + bright * 0.8;
  for (let i = 0; i < n; i++) {
    lp += a * (r() - lp);
    ring[i] = lp;
  }
  // per-sample decay so every pitch rings for about the same time
  const decay = Math.pow(0.001, 1 / (sr * dur * 0.9 * Math.min(1, 220 / freq + 0.5)));
  let idx = 0;
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const cur = ring[idx];
    d[i] = cur;
    ring[idx] = decay * (0.5 * (cur + prev)) * (0.996 + 0.004 * bright);
    prev = cur;
    idx = idx + 1 === n ? 0 : idx + 1;
  }
  const out = { buf, rate: n / exact };
  k.plucks.set(key, out);
  if (k.plucks.size > 96) k.plucks.delete(k.plucks.keys().next().value!);
  return out;
}

export function pluck(c: Ctx, out: AudioNode, t: number, freq: number, gain: number, dur = 1.6, bright = 0.5): number {
  const { buf, rate } = pluckBuffer(c, freq, dur, bright);
  const s = c.createBufferSource();
  s.buffer = buf;
  s.playbackRate.value = rate;
  const g = c.createGain();
  g.gain.value = gain;
  s.connect(g).connect(out);
  s.start(t);
  return t + buf.duration / rate;
}

export const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
