/**
 * Procedural music in an ancient-Mediterranean style: a Karplus-Strong lyre,
 * frame drums (dum / tek), a low drone and a reedy aulos, on modal scales.
 *
 * A small look-ahead sequencer: `pump(until)` schedules every sixteenth-note
 * step that starts before `until`. Live, the engine calls it from a timer a
 * quarter second ahead of the audio clock; offline renders call it once.
 * Tracks loop (bars repeat with seeded variation per pass). Switching tracks
 * crossfades: the old track's gain fades out and it stops being scheduled.
 */
import { AudioRng } from './rng';
import { frameDrum, horn } from './sfx';
import { midiHz, noise, osc, pluck, type Ctx } from './synth';

export type TrackId = 'menu' | 'deploy' | 'battle';
export type StingerId = 'victory' | 'defeat';

const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];

interface Step {
  c: Ctx;
  out: AudioNode;
  t: number;
  /** Sixteenth duration in seconds. */
  dt: number;
  bar: number;
  /** Step within the bar, 0..15. */
  s: number;
  r: AudioRng;
  /** 0..1, battle only. */
  heat: number;
  /** MIDI note of scale degree `d` (may exceed 7 / be negative). */
  n(d: number): number;
}

interface Drone {
  heat(h: number, now: number): void;
  stop(at: number): void;
}

interface TrackDef {
  bpm: number;
  bars: number;
  root: number;
  mode: number[];
  gain: number;
  step(x: Step): void;
  /** Sustained drone under the whole track. */
  drone(c: Ctx, out: AudioNode, t: number, root: number): Drone;
}

function tek(c: Ctx, out: AudioNode, t: number, r: AudioRng, gain: number): void {
  noise(c, out, t, { dur: 0.04, gain, f: r.jit(2600, 0.1), q: 1.5 });
  osc(c, out, t, { f: r.jit(420, 0.05), f1: 300, dur: 0.03, gain: gain * 0.4 });
}

function dum(c: Ctx, out: AudioNode, t: number, r: AudioRng, gain: number): void {
  frameDrum(c, out, t, r, gain);
}

/** Aulos (double reed): buzzy, nasal, with slow vibrato. */
function reed(c: Ctx, out: AudioNode, t: number, hz: number, dur: number, gain: number): void {
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1300;
  bp.Q.value = 0.9;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3200;
  bp.connect(lp).connect(out);
  osc(c, bp, t, { type: 'sawtooth', f: hz, dur, gain, a: Math.min(0.08, dur * 0.3), vib: [5.5, 14] });
  osc(c, bp, t, { type: 'square', f: hz * 1.004, dur, gain: gain * 0.5, a: Math.min(0.1, dur * 0.3), vib: [5.1, 10] });
}

function droneOf(gain: number, cutoff: number, fifth = 7): TrackDef['drone'] {
  return (c, out, t, root) => {
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    lp.Q.value = 1.5;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 2);
    lp.connect(g).connect(out);
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.09;
    const lg = c.createGain();
    lg.gain.value = cutoff * 0.35;
    lfo.connect(lg).connect(lp.frequency);
    const oscs = [root - 12, root - 12 + fifth, root - 24].map((m, i) => {
      const o = c.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sawtooth';
      o.frequency.value = midiHz(m);
      o.detune.value = (i - 1) * 4;
      const og = c.createGain();
      og.gain.value = i === 2 ? 0.8 : 0.35;
      o.connect(og).connect(lp);
      o.start(t);
      return o;
    });
    lfo.start(t);
    return {
      // heat opens the filter a little (battle)
      heat: (h, now) => lp.frequency.setTargetAtTime(cutoff * (1 + h * 1.2), now, 0.5),
      stop: (at) => {
        for (const o of oscs) o.stop(at + 0.1);
        lfo.stop(at + 0.1);
      },
    };
  };
}

const ARPS = [
  [0, 2, 4, 7, 4, 2, 4, 2],
  [0, 4, 7, 9, 7, 4, 2, 4],
  [7, 4, 2, 0, 2, 4, 2, -1],
  [0, -1, 0, 2, 4, 2, 0, -3],
];

export const TRACKS: Record<TrackId, TrackDef> = {
  /** Map and menus: unhurried D Dorian lyre over a soft drone. */
  menu: {
    bpm: 72,
    bars: 8,
    root: 62,
    mode: DORIAN,
    gain: 0.9,
    drone: droneOf(0.05, 380),
    step(x) {
      const chord = [0, 3, 0, 6, 0, 3, 4, 0][x.bar];
      const arp = ARPS[(x.bar + (x.bar >= 4 ? 1 : 0)) % ARPS.length];
      if (x.s % 2 === 0) {
        const i = x.s / 2;
        if (!(i > 0 && x.r.chance(0.18))) pluck(x.c, x.out, x.t + x.r.range(0, 0.012), midiHz(x.n(chord + arp[i]) - 12), i === 0 ? 0.32 : 0.22, 1.8, 0.45);
      }
      if (x.s === 0 && x.r.chance(0.5)) pluck(x.c, x.out, x.t + 0.02, midiHz(x.n(chord + x.r.pick([4, 7, 9]))), 0.16, 2, 0.7);
      if (x.s === 0) dum(x.c, x.out, x.t, x.r, 0.22);
      if (x.s === 8) dum(x.c, x.out, x.t, x.r, 0.12);
      if ((x.s === 6 || x.s === 14) && x.r.chance(0.6)) tek(x.c, x.out, x.t, x.r, 0.05);
    },
  },
  /** Deployment: E Phrygian, a low ostinato, heartbeat drum and a held aulos note. */
  deploy: {
    bpm: 84,
    bars: 4,
    root: 52,
    mode: PHRYGIAN,
    gain: 0.9,
    drone: droneOf(0.06, 300),
    step(x) {
      const ost = [
        [0, 0, 1, 0, 0, 0, 2, 1],
        [0, 0, 1, 0, -1, 0, 1, 0],
      ][x.bar % 2];
      if (x.s % 2 === 0) pluck(x.c, x.out, x.t, midiHz(x.n(ost[x.s / 2])), x.s % 8 === 0 ? 0.3 : 0.2, 1.2, 0.35);
      if (x.s === 0 || x.s === 3) dum(x.c, x.out, x.t, x.r, x.s === 0 ? 0.32 : 0.2);
      if (x.s === 8 || x.s === 11) dum(x.c, x.out, x.t, x.r, x.s === 8 ? 0.2 : 0.12);
      if (x.s === 12 && x.r.chance(0.5)) tek(x.c, x.out, x.t, x.r, 0.06);
      if (x.bar % 2 === 1 && x.s === 0 && x.r.chance(0.75)) reed(x.c, x.out, x.t, midiHz(x.n(x.r.pick([1, 4, 3])) + 12), x.dt * 14, 0.06);
    },
  },
  /** Battle: A Phrygian, driving drums; layers come in as the fighting heats up. */
  battle: {
    bpm: 120,
    bars: 4,
    root: 57,
    mode: PHRYGIAN,
    gain: 0.85,
    drone: droneOf(0.065, 320),
    step(x) {
      const h = x.heat;
      // drums
      if (x.s === 0) dum(x.c, x.out, x.t, x.r, 0.42);
      if (x.s === 6 || x.s === 8) dum(x.c, x.out, x.t, x.r, 0.28);
      if (x.s === 11 && h > 0.3) dum(x.c, x.out, x.t, x.r, 0.22);
      if (x.s === 14 && h > 0.55) dum(x.c, x.out, x.t, x.r, 0.24);
      if (x.s === 4 || x.s === 12) tek(x.c, x.out, x.t, x.r, 0.09);
      if ((x.s === 2 || x.s === 10) && h > 0.45) tek(x.c, x.out, x.t, x.r, 0.06);
      if (h > 0.8 && x.s % 2 === 1 && x.r.chance(0.35)) tek(x.c, x.out, x.t, x.r, 0.035);
      // lyre ostinato: eighths, sixteenths when hot
      const ost = [0, 0, 1, 0, 3, 1, 0, -2];
      const fast = h > 0.6;
      if (x.s % 2 === 0 || fast) {
        const i = Math.floor(x.s / 2);
        const d = ost[i] + (x.bar === 3 && i >= 6 ? 1 : 0);
        pluck(x.c, x.out, x.t, midiHz(x.n(d) - 12), (x.s % 2 === 0 ? 0.24 : 0.12) * (0.7 + 0.5 * h), 0.9, 0.35 + 0.3 * h);
      }
      // aulos phrases once the lines are engaged
      if (h > 0.4 && x.s % 4 === 0 && x.r.chance(0.55 + 0.3 * h)) {
        const deg = x.r.pick([0, 1, 2, 3, 4, 3, 1]);
        const len = x.r.pick([2, 4, 4, 6]);
        reed(x.c, x.out, x.t, midiHz(x.n(deg) + 12), x.dt * len * 0.95, 0.045 + 0.03 * h);
      }
    },
  },
};

interface Playing {
  id: TrackId;
  def: TrackDef;
  gain: GainNode;
  step: number;
  next: number;
  drone: Drone;
  heatSent: number;
}

export class MusicPlayer {
  private cur: Playing | null = null;
  private heatTarget = 0;
  private heat = 0;
  private lastPump = 0;
  private seed = 1;

  constructor(
    private readonly c: Ctx,
    private readonly bus: AudioNode,
  ) {}

  get track(): TrackId | null {
    return this.cur?.id ?? null;
  }

  /** Battle intensity 0..1 (smoothed). */
  setHeat(v: number, immediate = false): void {
    this.heatTarget = Math.max(0, Math.min(1, v));
    if (immediate) this.heat = this.heatTarget;
  }

  /** Crossfade to `id` (null = silence) over `fade` seconds. */
  set(id: TrackId | null, fade = 1.5): void {
    if (this.cur?.id === id) return;
    const now = this.c.currentTime;
    const old = this.cur;
    if (old) {
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(Math.max(0.0001, old.gain.gain.value), now);
      old.gain.gain.exponentialRampToValueAtTime(0.0001, now + fade);
      old.drone.stop(now + fade);
      const g = old.gain;
      setTimeout(() => g.disconnect(), (fade + 0.5) * 1000);
    }
    this.cur = null;
    if (!id) return;
    const def = TRACKS[id];
    const gain = this.c.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(def.gain, now + fade);
    gain.connect(this.bus);
    if (id !== 'battle') this.heat = this.heatTarget = 0;
    const start = now + 0.05;
    this.cur = { id, def, gain, step: 0, next: start, drone: def.drone(this.c, gain, start, def.root), heatSent: 0 };
  }

  /** Schedule every step that starts before `until` (audio-clock seconds). */
  pump(until: number): void {
    const p = this.cur;
    const now = this.c.currentTime;
    const dtReal = Math.max(0, now - this.lastPump);
    this.lastPump = now;
    this.heat += (this.heatTarget - this.heat) * Math.min(1, dtReal / 3);
    if (!p) return;
    if (Math.abs(this.heat - p.heatSent) > 0.05) {
      p.heatSent = this.heat;
      p.drone.heat(this.heat, now);
    }
    // fell behind (timer throttled): skip ahead rather than burst
    if (p.next < now - 0.1) p.next = now + 0.02;
    const dt = 60 / p.def.bpm / 4;
    while (p.next < until) {
      const bar = Math.floor(p.step / 16) % p.def.bars;
      const pass = Math.floor(p.step / (16 * p.def.bars));
      const s = p.step % 16;
      // per-step seed: the loop repeats, with small variation between odd and even passes
      const r = new AudioRng(hashStep(p.id, pass % 2, bar, s, this.seed));
      const root = p.def.root;
      const mode = p.def.mode;
      try {
        p.def.step({
          c: this.c,
          out: p.gain,
          t: p.next,
          dt,
          bar,
          s,
          r,
          heat: this.heat,
          n: (d) => root + mode[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7),
        });
      } catch {
        /* a closed context: drop the step */
      }
      p.step++;
      p.next += dt;
    }
  }

  /** Victory / defeat stinger, played over (and instead of) the current track. */
  stinger(id: StingerId): number {
    const c = this.c;
    const t = c.currentTime + 0.05;
    const r = new AudioRng(id === 'victory' ? 11 : 13);
    const out = c.createGain();
    out.gain.value = 0.9;
    out.connect(this.bus);
    this.set(null, 0.6);
    if (id === 'victory') {
      horn(c, out, t, r, 146.8, [[1, 0.4], [1.5, 0.35], [2, 1.1]], 0.3);
      for (let i = 0; i < 6; i++) frameDrum(c, out, t + i * 0.12, r, 0.15 + i * 0.05);
      // D major-ish (Mixolydian) lyre spread, then the high octave
      [62, 66, 69, 74, 78, 81].forEach((m, i) => pluck(c, out, t + 0.75 + i * 0.06, midiHz(m), 0.26, 2.2, 0.75));
      frameDrum(c, out, t + 0.75, r, 0.5);
      return 3;
    }
    // defeat: a falling Phrygian line on the aulos over slow drums
    [69, 67, 65, 64].forEach((m, i) => reed(c, out, t + i * 0.55, midiHz(m - 12), i === 3 ? 1.6 : 0.5, 0.07));
    for (let i = 0; i < 3; i++) frameDrum(c, out, t + i * 1.1, r, 0.4 - i * 0.1);
    pluck(c, out, t + 1.65, midiHz(40), 0.35, 2.5, 0.3);
    return 3.4;
  }
}

function hashStep(id: string, pass: number, bar: number, s: number, seed: number): number {
  let h = 2166136261 ^ seed;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h = Math.imul(h ^ pass, 16777619);
  h = Math.imul(h ^ bar, 16777619);
  h = Math.imul(h ^ s, 16777619);
  return h >>> 0;
}
