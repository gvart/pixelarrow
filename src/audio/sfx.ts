/**
 * Procedural sound effects. Each recipe writes Web Audio nodes into `out`
 * starting at time `t` and returns its length in seconds. Variation comes
 * from the seeded `r` (pitch, filter and timing jitter), so ten clashes in a
 * row never sound identical. The palette is gritty and physical — bronze,
 * wood, leather, earth, breath — not chiptune bleeps.
 */
import type { AudioRng } from './rng';
import { grit, metal, midiHz, noise, osc, pluck, type Ctx } from './synth';

export type Recipe = (c: Ctx, out: AudioNode, t: number, r: AudioRng) => number;

const BRONZE = [1, 1.47, 2.09, 2.76, 3.41] as const;
const SHIELD = [1, 1.58, 2.31, 3.1] as const;
const COIN = [1, 1.34, 2.25, 3.1] as const;

function clatter(c: Ctx, out: AudioNode, t: number, r: AudioRng, n: number, span: number, gain: number): void {
  for (let i = 0; i < n; i++) {
    const at = t + r.range(0, span);
    metal(c, out, at, r.range(1800, 4200), [1, 1.71, 2.6], r.range(0.03, 0.08), gain * r.range(0.5, 1));
  }
}

/** Breath through two formant filters: a grunt without a voice. */
function grunt(c: Ctx, out: AudioNode, t: number, r: AudioRng, dur: number, gain: number, fall = 0.75): void {
  const f1 = r.jit(620, 0.2);
  const f2 = r.jit(1150, 0.15);
  noise(c, out, t, { dur, gain, f: f1, f1: f1 * fall, q: 4, a: 0.015, rate: 0.7 });
  noise(c, out, t, { dur: dur * 0.85, gain: gain * 0.55, f: f2, f1: f2 * fall, q: 5, a: 0.02, rate: 0.7 });
  osc(c, out, t, { type: 'sawtooth', f: r.jit(120, 0.15), f1: r.jit(85, 0.1), dur: dur * 0.8, gain: gain * 0.12, a: 0.02 });
}

export function frameDrum(c: Ctx, out: AudioNode, t: number, r: AudioRng, gain: number): void {
  osc(c, out, t, { f: r.jit(92, 0.04), f1: 52, dur: 0.38, gain });
  noise(c, out, t, { dur: 0.08, gain: gain * 0.5, f: 300, type: 'lowpass', brown: true });
  noise(c, out, t, { dur: 0.02, gain: gain * 0.25, f: 2200, q: 1.2 });
}

/** War horn (cornu / salpinx): buzzy brass with an opening filter and a lip slide. */
export function horn(c: Ctx, out: AudioNode, t: number, r: AudioRng, f: number, notes: readonly [number, number][], gain: number): number {
  const total = notes.reduce((s, [, d]) => s + d, 0);
  const end = t + total + 0.35;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 2;
  lp.frequency.setValueAtTime(250, t);
  lp.frequency.linearRampToValueAtTime(f * 14, t + 0.18);
  lp.frequency.linearRampToValueAtTime(f * 8, t + total);
  lp.frequency.linearRampToValueAtTime(200, end);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.12);
  g.gain.setValueAtTime(gain * 0.85, t + total);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  lp.connect(g).connect(grit(c, out, 2.2));
  const vib = c.createOscillator();
  vib.frequency.value = r.jit(5.2, 0.1);
  const vg = c.createGain();
  vg.gain.setValueAtTime(0, t);
  vg.gain.linearRampToValueAtTime(9, t + 0.5);
  vib.connect(vg);
  for (const [mul, det, type] of [
    [1, 0, 'sawtooth'],
    [1, 7, 'sawtooth'],
    [0.5, 0, 'square'],
  ] as const) {
    const o = c.createOscillator();
    o.type = type;
    o.detune.value = det;
    vg.connect(o.detune);
    let at = t;
    let prev = f * notes[0][0] * mul * 0.93;
    notes.forEach(([n, d], i) => {
      const hz = f * n * mul;
      o.frequency.setValueAtTime(prev, i === 0 ? at : at - 0.06);
      o.frequency.exponentialRampToValueAtTime(hz, at + (i === 0 ? 0.14 : 0.04));
      prev = hz;
      at += d;
    });
    const og = c.createGain();
    og.gain.value = type === 'square' ? 0.25 : 0.5;
    o.connect(og).connect(lp);
    o.start(t);
    o.stop(end + 0.05);
  }
  vib.start(t);
  vib.stop(end + 0.05);
  noise(c, lp, t, { dur: 0.1, gain: 0.3, f: f * 6, q: 1 });
  return end - t;
}

/** A crowd shout: detuned buzzing voices through vowel formants ("Aaah"). */
function crowd(c: Ctx, out: AudioNode, t: number, r: AudioRng, dur: number, gain: number, voices: number, glide = 1): number {
  const bus = c.createGain();
  bus.gain.setValueAtTime(0.0001, t);
  bus.gain.exponentialRampToValueAtTime(gain, t + dur * 0.45);
  bus.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const formants = [
    [r.jit(760, 0.08), 7, 1],
    [r.jit(1180, 0.08), 8, 0.6],
    [r.jit(2550, 0.06), 9, 0.25],
  ] as const;
  const mix = c.createGain();
  for (const [f, q, g] of formants) {
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = q;
    const fg = c.createGain();
    fg.gain.value = g * 2.2;
    mix.connect(bp).connect(fg).connect(bus);
  }
  bus.connect(out);
  for (let i = 0; i < voices; i++) {
    const at = t + r.range(0, 0.15);
    const f0 = r.range(130, 250);
    osc(c, mix, at, { type: 'sawtooth', f: f0, f1: f0 * glide * r.jit(1, 0.05), dur: dur - (at - t), gain: 0.22, a: dur * 0.3, vib: [r.range(4, 7), r.range(10, 30)] });
  }
  noise(c, mix, t, { dur, gain: 0.5, f: 900, q: 0.6, a: dur * 0.4, rate: 0.8 });
  return dur;
}

export const RECIPES = {
  /** Sword on bronze: bright scrape, ringing partials, a body knock. */
  clash: (c, out, t, r) => {
    const g = grit(c, out, 2.5);
    noise(c, g, t, { dur: 0.06, gain: 0.5, f: r.jit(3200, 0.2), q: 0.8, type: 'highpass' });
    metal(c, out, t, r.jit(1650, 0.12), BRONZE, r.jit(0.28, 0.25), 0.15);
    noise(c, out, t, { dur: 0.05, gain: 0.35, f: r.jit(420, 0.2), type: 'lowpass' });
    return 0.32;
  },
  /** Spear shafts: dry wooden clacks and a short point scrape. */
  clashSpear: (c, out, t, r) => {
    const g = grit(c, out, 2);
    noise(c, g, t, { dur: 0.04, gain: 0.55, f: r.jit(1100, 0.15), q: 4 });
    noise(c, g, t + r.range(0.025, 0.045), { dur: 0.035, gain: 0.35, f: r.jit(850, 0.15), q: 4 });
    metal(c, out, t, r.jit(2400, 0.1), [1, 1.6, 2.4], 0.08, 0.06);
    return 0.16;
  },
  /** Axe or club: heavy thud and splintering wood. */
  clashHeavy: (c, out, t, r) => {
    const g = grit(c, out, 3);
    noise(c, g, t, { dur: 0.12, gain: 0.6, f: r.jit(260, 0.2), type: 'lowpass', brown: true });
    osc(c, g, t, { f: r.jit(120, 0.15), f1: 48, dur: 0.12, gain: 0.45 });
    noise(c, g, t, { dur: 0.03, gain: 0.35, f: r.jit(1800, 0.15), q: 1.5 });
    noise(c, out, t + 0.01, { dur: 0.09, gain: 0.12, f: 3200, type: 'highpass' });
    return 0.2;
  },
  /** Shield block: wooden board thud plus a dull bronze rim ring. */
  block: (c, out, t, r) => {
    const g = grit(c, out, 2);
    osc(c, g, t, { f: r.jit(95, 0.12), f1: 50, dur: 0.14, gain: 0.55 });
    noise(c, g, t, { dur: 0.09, gain: 0.55, f: r.jit(520, 0.15), q: 2.2 });
    noise(c, g, t, { dur: 0.03, gain: 0.25, f: 1500, type: 'lowpass' });
    metal(c, out, t, r.jit(640, 0.1), SHIELD, r.jit(0.35, 0.2), 0.08);
    return 0.38;
  },
  /** Charge impact: bodies and shields colliding, gear rattling. */
  impact: (c, out, t, r) => {
    const g = grit(c, out, 3);
    osc(c, g, t, { f: r.jit(72, 0.1), f1: 34, dur: 0.25, gain: 0.7 });
    noise(c, g, t, { dur: 0.2, gain: 0.6, f: 320, type: 'lowpass', brown: true });
    noise(c, g, t, { dur: 0.08, gain: 0.4, f: r.jit(560, 0.15), q: 2 });
    metal(c, out, t, r.jit(600, 0.1), SHIELD, 0.3, 0.07);
    clatter(c, out, t + 0.02, r, 3, 0.15, 0.04);
    return 0.42;
  },
  /** A blow landing: flesh thump plus a breathy grunt (noise formants, no voice). */
  hit: (c, out, t, r) => {
    noise(c, out, t, { dur: 0.05, gain: 0.5, f: r.jit(700, 0.2), type: 'lowpass' });
    osc(c, out, t, { f: r.jit(150, 0.15), f1: 70, dur: 0.07, gain: 0.3 });
    grunt(c, out, t + 0.01, r, r.range(0.12, 0.18), 0.35);
    return 0.22;
  },
  /** A man falls: long falling groan, body and armour hitting the ground. */
  death: (c, out, t, r) => {
    grunt(c, out, t, r, r.range(0.35, 0.5), 0.4, 0.55);
    const fall = t + r.range(0.22, 0.34);
    const g = grit(c, out, 2.5);
    osc(c, g, fall, { f: r.jit(80, 0.1), f1: 38, dur: 0.2, gain: 0.5 });
    noise(c, g, fall, { dur: 0.25, gain: 0.55, f: 260, type: 'lowpass', brown: true });
    clatter(c, out, fall, r, 4, 0.2, 0.05);
    return 0.8;
  },
  /** Bow string twang and the arrow's thin whistle. */
  arrow: (c, out, t, r) => {
    pluck(c, out, t, r.jit(98, 0.06), 0.35, 0.35, 0.95);
    noise(c, out, t + 0.02, { dur: 0.22, gain: 0.4, f: r.jit(3000, 0.15), f1: 900, q: 4, a: 0.06 });
    return 0.32;
  },
  /** Javelin: a heavier, lower whoosh. */
  javelin: (c, out, t, r) => {
    noise(c, out, t, { dur: 0.1, gain: 0.35, f: 400, type: 'lowpass', brown: true });
    noise(c, out, t, { dur: 0.38, gain: 0.9, f: r.jit(1500, 0.15), f1: 420, q: 2, a: 0.08 });
    return 0.48;
  },
  /** Sling: whirring cord (amplitude-modulated noise) then the release snap. */
  sling: (c, out, t, r) => {
    const am = c.createGain();
    am.gain.value = 0.5;
    const lfo = c.createOscillator();
    lfo.type = 'square';
    lfo.frequency.setValueAtTime(r.jit(14, 0.15), t);
    lfo.frequency.linearRampToValueAtTime(r.jit(26, 0.1), t + 0.25);
    const lg = c.createGain();
    lg.gain.value = 0.5;
    lfo.connect(lg).connect(am.gain);
    am.connect(out);
    noise(c, am, t, { dur: 0.25, gain: 0.5, f: r.jit(900, 0.15), q: 5, a: 0.08 });
    lfo.start(t);
    lfo.stop(t + 0.4);
    noise(c, out, t + 0.27, { dur: 0.02, gain: 0.35, f: 2600, type: 'highpass' });
    return 0.36;
  },
  /** Arrow or javelin striking wood/hide. */
  thunk: (c, out, t, r) => {
    noise(c, out, t, { dur: 0.035, gain: 0.55, f: r.jit(1300, 0.2), q: 3 });
    osc(c, out, t, { f: r.jit(220, 0.15), f1: 110, dur: 0.06, gain: 0.3 });
    return 0.1;
  },
  /** Sling stone: a sharp crack. */
  stoneHit: (c, out, t, r) => {
    noise(c, out, t, { dur: 0.02, gain: 0.55, f: r.jit(2500, 0.2), type: 'highpass' });
    osc(c, out, t, { f: r.jit(300, 0.15), f1: 120, dur: 0.04, gain: 0.3 });
    noise(c, out, t, { dur: 0.05, gain: 0.35, f: 400, type: 'lowpass' });
    return 0.1;
  },
  /** A missile thudding into earth. */
  land: (c, out, t, r) => {
    noise(c, out, t, { dur: 0.08, gain: 0.45, f: r.jit(500, 0.25), type: 'lowpass', brown: true });
    noise(c, out, t, { dur: 0.02, gain: 0.08, f: 2000, q: 1 });
    return 0.12;
  },
  /** Cavalry: galloping hooves (three-beat) over a ground rumble, growing louder. */
  hooves: (c, out, t, r) => {
    const dur = 1.6;
    noise(c, out, t, { dur, gain: 0.35, f: 150, type: 'lowpass', brown: true, a: 0.6 });
    for (let at = 0, k = 0; at < dur; at += 0.42 * r.jit(1, 0.05), k++) {
      const v = 0.25 + 0.75 * (at / dur);
      for (const off of [0, 0.085, 0.17]) {
        const tt = t + at + off + r.range(0, 0.012);
        osc(c, out, tt, { f: r.jit(95, 0.1), f1: 55, dur: 0.06, gain: 0.4 * v });
        noise(c, out, tt, { dur: 0.04, gain: 0.3 * v, f: r.jit(700, 0.2), type: 'lowpass' });
      }
    }
    return dur + 0.1;
  },
  /** Infantry charge: a rumble of running feet and rattling kit. */
  march: (c, out, t, r) => {
    const dur = 1.4;
    noise(c, out, t, { dur, gain: 0.5, f: 200, type: 'lowpass', brown: true, a: 0.5 });
    for (let i = 0; i < 14; i++) {
      const at = t + r.range(0, dur);
      noise(c, out, at, { dur: 0.04, gain: r.range(0.12, 0.28), f: r.jit(320, 0.3), type: 'lowpass' });
    }
    clatter(c, out, t + 0.2, r, 4, dur - 0.3, 0.03);
    return dur + 0.1;
  },
  /** Charge horn: a rising two-note call. */
  horn: (c, out, t, r) => horn(c, out, t, r, r.jit(110, 0.02), [[1, 0.55], [1.5, 0.85]], 0.42),
  /** Retreat / fall-back horn: falling and lower. */
  hornLow: (c, out, t, r) => horn(c, out, t, r, r.jit(98, 0.02), [[1.5, 0.45], [1, 0.9]], 0.38),
  /** The battle cry at first contact. */
  battlecry: (c, out, t, r) => {
    crowd(c, out, t, r, 1.7, 0.55, 7, 1.08);
    clatter(c, out, t + 0.6, r, 3, 0.8, 0.03);
    return 1.75;
  },
  /** A line breaks: falling cries and dropped gear. */
  rout: (c, out, t, r) => {
    crowd(c, out, t, r, 1.2, 0.45, 5, 0.6);
    noise(c, out, t, { dur: 1.0, gain: 0.25, f: 900, f1: 380, q: 3, a: 0.1 });
    clatter(c, out, t + 0.1, r, 6, 1.0, 0.06);
    return 1.3;
  },
  /** Ability: Shield Bash — a booming shove. */
  bash: (c, out, t, r) => {
    const g = grit(c, out, 3.5);
    osc(c, g, t, { f: r.jit(58, 0.05), f1: 30, dur: 0.4, gain: 0.75 });
    noise(c, g, t, { dur: 0.3, gain: 0.55, f: 420, type: 'lowpass', brown: true });
    RECIPES.block(c, out, t + 0.005, r);
    grunt(c, out, t, r, 0.2, 0.3, 0.9);
    return 0.55;
  },
  /** Ability: Volley — a ragged rank of bowstrings and a swarm of shafts. */
  volley: (c, out, t, r) => {
    for (let i = 0; i < 6; i++) pluck(c, out, t + r.range(0, 0.22), r.jit(100, 0.12), 0.18, 0.35, 0.95);
    noise(c, out, t + 0.05, { dur: 0.8, gain: 0.45, f: 1400, f1: 3000, q: 1.2, a: 0.2 });
    noise(c, out, t + 0.25, { dur: 0.6, gain: 0.3, f: 2600, f1: 900, q: 3, a: 0.05 });
    return 1.0;
  },
  /** Ability: Berserk — a distorted growl and a drum blow. */
  berserk: (c, out, t, r) => {
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(200, t);
    lp.frequency.exponentialRampToValueAtTime(1600, t + 0.5);
    lp.Q.value = 4;
    lp.connect(out);
    const g = grit(c, lp, 7);
    osc(c, g, t, { type: 'sawtooth', f: 55, f1: 62, dur: 0.8, gain: 0.35, a: 0.08, vib: [9, 40] });
    osc(c, g, t, { type: 'sawtooth', f: 82.4, f1: 92, dur: 0.75, gain: 0.25, a: 0.1 });
    frameDrum(c, out, t, r, 0.6);
    noise(c, out, t + 0.1, { dur: 0.6, gain: 0.3, f: 500, f1: 950, q: 5, a: 0.1 });
    return 1.0;
  },
  /** Ability: Rally Cry — horn blast, drum and a bright lyre strum. */
  rallyCry: (c, out, t, r) => {
    horn(c, out, t, r, 146.8, [[1, 0.55]], 0.35);
    frameDrum(c, out, t, r, 0.5);
    [62, 65, 69, 74].forEach((m, i) => pluck(c, out, t + 0.15 + i * 0.035, midiHz(m), 0.22, 1.3, 0.7));
    return 1.4;
  },
  /** Level up: a rising Dorian lyre arpeggio and a bronze bell. */
  levelUp: (c, out, t, r) => {
    [62, 65, 69, 74, 77].forEach((m, i) => pluck(c, out, t + i * 0.075, midiHz(m), 0.3, 1.2, 0.75));
    metal(c, out, t + 0.38, r.jit(1760, 0.01), [1, 2.76, 5.4], 0.9, 0.06);
    return 1.3;
  },
  /** Coins: two bright clinks. */
  coin: (c, out, t, r) => {
    const f = r.jit(2600, 0.05);
    metal(c, out, t, f, COIN, 0.25, 0.12);
    metal(c, out, t + r.range(0.06, 0.09), f * r.jit(1.12, 0.03), COIN, 0.3, 0.1);
    noise(c, out, t, { dur: 0.01, gain: 0.15, f: 5000, type: 'highpass' });
    return 0.42;
  },
  /** UI: a wooden tick. */
  click: (c, out, t, r) => {
    noise(c, out, t, { dur: 0.015, gain: 0.35, f: r.jit(2200, 0.1), q: 3 });
    osc(c, out, t, { f: r.jit(900, 0.05), f1: 600, dur: 0.025, gain: 0.22 });
    return 0.05;
  },
  /** UI: a lighter tap (selection, toggles). */
  tap: (c, out, t, r) => {
    noise(c, out, t, { dur: 0.01, gain: 0.25, f: r.jit(3000, 0.1), q: 3 });
    return 0.03;
  },
  /** UI: back — two falling ticks. */
  back: (c, out, t) => {
    osc(c, out, t, { f: 700, f1: 500, dur: 0.03, gain: 0.25 });
    noise(c, out, t, { dur: 0.012, gain: 0.2, f: 2000, q: 3 });
    osc(c, out, t + 0.06, { f: 500, f1: 340, dur: 0.035, gain: 0.22 });
    return 0.12;
  },
  /** Tutorial narrator: a murmured syllable (a breathy voice through two formants), one per few letters. */
  narrate: (c, out, t, r) => {
    const f0 = r.range(118, 168);
    const lp = c.createBiquadFilter();
    lp.type = 'bandpass';
    lp.Q.value = 3;
    lp.frequency.value = r.pick([520, 640, 760, 900]);
    lp.connect(out);
    osc(c, lp, t, { type: 'sawtooth', f: f0, f1: f0 * r.range(0.9, 1.08), dur: 0.055, gain: 0.32, a: 0.008 });
    noise(c, out, t, { dur: 0.03, gain: 0.05, f: r.jit(1500, 0.2), q: 2 });
    return 0.07;
  },
  /** Tutorial: a quill tick of the typewriter text. */
  quill: (c, out, t, r) => {
    noise(c, out, t, { dur: 0.008, gain: 0.18, f: r.jit(4200, 0.15), q: 4 });
    return 0.02;
  },
  /** Tutorial: a step done — two rising lyre notes and a small bronze bell. */
  chime: (c, out, t, r) => {
    pluck(c, out, t, midiHz(69), 0.26, 1.0, 0.75);
    pluck(c, out, t + 0.09, midiHz(76), 0.26, 1.1, 0.75);
    metal(c, out, t + 0.16, r.jit(2093, 0.01), [1, 2.76, 5.4], 0.7, 0.05);
    return 1.1;
  },
  /** UI: refused — a dull double buzz. */
  error: (c, out, t) => {
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.connect(out);
    for (const at of [0, 0.15]) {
      osc(c, lp, t + at, { type: 'square', f: 110, dur: 0.1, gain: 0.12 });
      osc(c, lp, t + at, { type: 'square', f: 116.5, dur: 0.1, gain: 0.12 });
    }
    return 0.3;
  },
  /** UI: warning — a single low buzz with a knock. */
  warning: (c, out, t) => {
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    lp.connect(out);
    osc(c, lp, t, { type: 'square', f: 146.8, dur: 0.18, gain: 0.11 });
    osc(c, lp, t, { type: 'square', f: 155.6, dur: 0.18, gain: 0.08 });
    osc(c, out, t, { f: 120, f1: 60, dur: 0.08, gain: 0.3 });
    return 0.22;
  },
  // ---- mythical beasts (src/sim/myth.ts events, src/audio/hooks.ts beastAudio)
  /** A giant's roar: a deep distorted growl swelling and breaking off. */
  roar: (c, out, t, r) => {
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(260, t);
    lp.frequency.linearRampToValueAtTime(900, t + 0.35);
    lp.frequency.exponentialRampToValueAtTime(180, t + 1.3);
    lp.Q.value = 3;
    lp.connect(out);
    const g = grit(c, lp, 8);
    osc(c, g, t, { type: 'sawtooth', f: r.jit(46, 0.08), f1: r.jit(38, 0.08), dur: 1.25, gain: 0.45, a: 0.15, vib: [7, 60] });
    osc(c, g, t, { type: 'sawtooth', f: r.jit(69, 0.08), f1: 52, dur: 1.1, gain: 0.3, a: 0.2 });
    noise(c, out, t, { dur: 1.2, gain: 0.35, f: r.jit(420, 0.15), f1: 220, q: 3, a: 0.12, rate: 0.5 });
    return 1.4;
  },
  /** Harpies: shrill, wavering shrieks. */
  screech: (c, out, t, r) => {
    const g = grit(c, out, 3);
    osc(c, g, t, { type: 'sawtooth', f: r.jit(1250, 0.15), f1: r.jit(820, 0.1), dur: 0.55, gain: 0.14, a: 0.03, vib: [23, 140] });
    osc(c, g, t + 0.05, { type: 'square', f: r.jit(1700, 0.1), f1: r.jit(1150, 0.1), dur: 0.45, gain: 0.07, a: 0.04, vib: [17, 90] });
    noise(c, out, t, { dur: 0.5, gain: 0.25, f: r.jit(3100, 0.2), f1: 1800, q: 6, a: 0.03 });
    return 0.65;
  },
  /** A boulder lands: a huge earthy boom, cracking stone, gravel. */
  boulder: (c, out, t, r) => {
    const g = grit(c, out, 4);
    osc(c, g, t, { f: r.jit(48, 0.08), f1: 24, dur: 0.6, gain: 0.85 });
    noise(c, g, t, { dur: 0.55, gain: 0.7, f: 240, type: 'lowpass', brown: true });
    noise(c, out, t, { dur: 0.06, gain: 0.45, f: r.jit(1900, 0.2), q: 1.5 });
    for (let i = 0; i < 7; i++) noise(c, out, t + 0.05 + r.range(0, 0.45), { dur: 0.03, gain: 0.12, f: r.jit(2600, 0.3), q: 3 });
    return 0.9;
  },
  /** A boulder leaves the giant's hands: a grunt and a heavy whoosh. */
  hurl: (c, out, t, r) => {
    grunt(c, out, t, r, 0.3, 0.45, 0.6);
    noise(c, out, t + 0.1, { dur: 0.5, gain: 0.35, f: 300, f1: 900, q: 1.5, a: 0.15 });
    return 0.65;
  },
  /** Stomp / quake: a ground-shaking thud and rumble. */
  stomp: (c, out, t, r) => {
    const g = grit(c, out, 3);
    osc(c, g, t, { f: r.jit(40, 0.05), f1: 22, dur: 0.8, gain: 0.9 });
    noise(c, g, t, { dur: 0.9, gain: 0.6, f: 160, type: 'lowpass', brown: true, a: 0.01 });
    clatter(c, out, t + 0.05, r, 5, 0.5, 0.04);
    return 1.0;
  },
  /** Fire breath: a roaring whoosh of flame with crackle. */
  fire: (c, out, t, r) => {
    noise(c, out, t, { dur: 1.0, gain: 0.55, f: 380, f1: 1400, q: 0.8, a: 0.12, brown: true });
    noise(c, out, t + 0.05, { dur: 0.9, gain: 0.3, f: 2400, f1: 900, q: 1.2, a: 0.1 });
    for (let i = 0; i < 9; i++) noise(c, out, t + r.range(0.1, 1.0), { dur: 0.015, gain: 0.18, f: r.jit(3500, 0.3), q: 2 });
    return 1.15;
  },
  /** A serpent's hiss (the hydra, the chimera's tail). */
  hiss: (c, out, t, r) => {
    noise(c, out, t, { dur: r.range(0.45, 0.65), gain: 0.35, f: r.jit(5200, 0.15), f1: 3800, q: 1.5, a: 0.05, type: 'highpass' });
    return 0.7;
  },
  /** A severed head or arm: a wet chop and a shriek. */
  sever: (c, out, t, r) => {
    const g = grit(c, out, 3);
    noise(c, g, t, { dur: 0.1, gain: 0.6, f: r.jit(600, 0.2), type: 'lowpass' });
    osc(c, g, t, { f: r.jit(140, 0.1), f1: 60, dur: 0.12, gain: 0.4 });
    osc(c, out, t + 0.06, { type: 'sawtooth', f: r.jit(420, 0.1), f1: 180, dur: 0.5, gain: 0.08, vib: [12, 80] });
    return 0.6;
  },
  /** The goat head bleats: a cracked, distorted bleat. */
  bleat: (c, out, t, r) => {
    const g = grit(c, out, 4);
    osc(c, g, t, { type: 'sawtooth', f: r.jit(310, 0.08), f1: 260, dur: 0.6, gain: 0.12, vib: [9, 120], a: 0.03 });
    noise(c, out, t, { dur: 0.55, gain: 0.25, f: 900, q: 6, a: 0.03 });
    return 0.7;
  },
} satisfies Record<string, Recipe>;

export type SfxId = keyof typeof RECIPES;

/** Default priority per sound (0..10): what survives when voices run out. */
export const PRIORITY: Record<SfxId, number> = {
  clash: 3,
  clashSpear: 3,
  clashHeavy: 3,
  block: 3,
  impact: 6,
  hit: 2,
  death: 5,
  arrow: 2,
  javelin: 3,
  sling: 2,
  thunk: 2,
  stoneHit: 2,
  land: 1,
  hooves: 7,
  march: 7,
  horn: 9,
  hornLow: 9,
  battlecry: 8,
  rout: 8,
  bash: 9,
  volley: 9,
  berserk: 9,
  rallyCry: 9,
  levelUp: 10,
  coin: 9,
  click: 10,
  tap: 10,
  back: 10,
  error: 10,
  warning: 10,
  roar: 9,
  screech: 6,
  boulder: 8,
  hurl: 6,
  stomp: 8,
  fire: 8,
  hiss: 4,
  sever: 7,
  bleat: 6,
  narrate: 10,
  quill: 4,
  chime: 10,
};

/** Base loudness per sound before spatial attenuation and the SFX bus. */
export const LEVEL: Partial<Record<SfxId, number>> = { hit: 0.8, land: 0.6, arrow: 0.8, tap: 0.7, march: 0.8, quill: 0.6 };
