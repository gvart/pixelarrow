import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceLimiter } from '../src/audio/voices';
import { AudioEngine, volGain } from '../src/audio/engine';
import { MusicPlayer, TRACKS } from '../src/audio/music';
import { RECIPES, PRIORITY, type SfxId } from '../src/audio/sfx';
import { AudioRng } from '../src/audio/rng';
import { spot } from '../src/audio/hooks';

// ---------------------------------------------------------------- a minimal Web Audio mock

class MockParam {
  value = 0;
  calls = 0;
  setValueAtTime(v: number) {
    this.value = v;
    this.calls++;
    return this;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
    this.calls++;
    return this;
  }
  exponentialRampToValueAtTime(v: number) {
    if (!(v > 0)) throw new RangeError('exponential ramp to non-positive value');
    this.value = v;
    this.calls++;
    return this;
  }
  setTargetAtTime(v: number) {
    this.value = v;
    this.calls++;
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

class MockNode {
  static created = 0;
  static started = 0;
  outputs: unknown[] = [];
  gain = new MockParam();
  frequency = new MockParam();
  detune = new MockParam();
  Q = new MockParam();
  pan = new MockParam();
  playbackRate = new MockParam();
  threshold = new MockParam();
  knee = new MockParam();
  ratio = new MockParam();
  attack = new MockParam();
  release = new MockParam();
  type = '';
  buffer: unknown = null;
  curve: unknown = null;
  constructor() {
    MockNode.created++;
  }
  connect<T>(n: T): T {
    this.outputs.push(n);
    return n;
  }
  disconnect() {
    this.outputs = [];
  }
  start() {
    MockNode.started++;
  }
  stop() {}
}

class MockContext {
  static instances = 0;
  currentTime = 0;
  sampleRate = 8000;
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  destination = new MockNode();
  onstatechange: (() => void) | null = null;
  resumes = 0;
  suspends = 0;
  constructor() {
    MockContext.instances++;
  }
  resume() {
    this.resumes++;
    this.state = 'running';
    this.onstatechange?.();
    return Promise.resolve();
  }
  suspend() {
    this.suspends++;
    this.state = 'suspended';
    this.onstatechange?.();
    return Promise.resolve();
  }
  createGain() {
    return new MockNode();
  }
  createBiquadFilter() {
    return new MockNode();
  }
  createOscillator() {
    return new MockNode();
  }
  createBufferSource() {
    return new MockNode();
  }
  createWaveShaper() {
    return new MockNode();
  }
  createStereoPanner() {
    return new MockNode();
  }
  createDynamicsCompressor() {
    return new MockNode();
  }
  createBuffer(_ch: number, len: number, sr: number) {
    const d = new Float32Array(len);
    return { duration: len / sr, sampleRate: sr, length: len, getChannelData: () => d };
  }
}

const mockFactory = () => new MockContext() as unknown as AudioContext;

// ---------------------------------------------------------------- voice limiter

describe('VoiceLimiter', () => {
  it('caps the total number of voices and steals the weakest for a more important sound', () => {
    const l = new VoiceLimiter({ max: 4, perSound: 10, minGap: 0 });
    for (let i = 0; i < 4; i++) expect(l.admit(`s${i}`, 3, 0, 1).ok).toBe(true);
    // equal priority: dropped
    expect(l.admit('x', 3, 0, 1).ok).toBe(false);
    // higher priority: steals the oldest of the weakest
    const r = l.admit('horn', 9, 0.01, 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.stolen?.id).toBe('s0');
    expect(l.count(0.01)).toBe(4);
  });

  it('limits copies of one sound and dedupes starts within minGap', () => {
    const l = new VoiceLimiter({ max: 20, perSound: 3, minGap: 0.05, urgent: 8 });
    expect(l.admit('clash', 3, 0, 1).ok).toBe(true);
    expect(l.admit('clash', 3, 0.01, 1).ok).toBe(false); // same tick
    expect(l.admit('clash', 3, 0.1, 1).ok).toBe(true);
    expect(l.admit('clash', 3, 0.2, 1).ok).toBe(true);
    // 4th copy at equal priority replaces the oldest copy
    const r = l.admit('clash', 3, 0.3, 1);
    expect(r.ok && r.stolen?.start).toBe(0);
    expect(l.active.filter((v) => v.id === 'clash').length).toBe(3);
    // a lower-priority copy does not displace louder ones
    expect(l.admit('clash', 1, 0.4, 1).ok).toBe(false);
    // urgent sounds ignore minGap
    expect(l.admit('click', 10, 0.5, 0.05).ok).toBe(true);
    expect(l.admit('click', 10, 0.5, 0.05).ok).toBe(true);
  });

  it('frees voices when they end', () => {
    const l = new VoiceLimiter({ max: 2, minGap: 0 });
    l.admit('a', 1, 0, 0.2);
    l.admit('b', 1, 0, 0.2);
    expect(l.admit('c', 1, 0.1, 0.2).ok).toBe(false);
    expect(l.admit('c', 1, 0.25, 0.2).ok).toBe(true);
    expect(l.count(0.25)).toBe(1);
  });

  it('a 40-soldier melee never exceeds the cap', () => {
    const l = new VoiceLimiter({ max: 12 });
    const r = new AudioRng(5);
    let t = 0;
    for (let i = 0; i < 2000; i++) {
      t += r.range(0, 0.02);
      const id = r.pick(['clash', 'block', 'hit', 'death', 'arrow']);
      l.admit(id, r.range(0, 10), t, r.range(0.1, 0.8));
      expect(l.count(t)).toBeLessThanOrEqual(12);
      expect(l.active.filter((v) => v.id === id).length).toBeLessThanOrEqual(3);
    }
  });
});

// ---------------------------------------------------------------- engine

describe('AudioEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockContext.instances = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('is a silent no-op without Web Audio', () => {
    const e = new AudioEngine(() => null);
    e.configure(() => ({ sound: true, musicVol: 5, sfxVol: 5 }));
    expect(() => {
      e.unlock();
      e.unlock();
      e.music('battle');
      e.heat(1);
      e.stinger('victory');
      e.setHidden(true);
      e.setHidden(false);
    }).not.toThrow();
    expect(e.play('clash')).toBe(false);
    expect(e.debug().available).toBe(false);
  });

  it('creates the context lazily on unlock, not before', () => {
    let made = 0;
    const e = new AudioEngine(() => (made++, mockFactory()));
    e.configure(() => undefined);
    expect(made).toBe(0);
    expect(e.play('click')).toBe(false);
    e.unlock();
    expect(made).toBe(1);
    expect(e.ctx?.state).toBe('running');
    e.unlock();
    expect(made).toBe(1);
    expect(e.play('click')).toBe(true);
  });

  it('respects mute: no context while muted, suspends when muted later', () => {
    const s = { sound: false, musicVol: 5, sfxVol: 5 };
    const e = new AudioEngine(mockFactory);
    e.configure(() => s);
    e.unlock();
    expect(e.ctx).toBeNull();
    s.sound = true;
    e.refresh();
    e.unlock();
    expect(e.running()).toBe(true);
    s.sound = false;
    e.refresh();
    expect(e.ctx?.state).toBe('suspended');
    expect(e.play('clash')).toBe(false);
  });

  it('suspends in the background and resumes on return', () => {
    const e = new AudioEngine(mockFactory);
    e.configure(() => undefined);
    e.unlock();
    const ctx = e.ctx as unknown as MockContext;
    e.setHidden(true);
    expect(ctx.state).toBe('suspended');
    expect(e.play('clash')).toBe(false);
    e.setHidden(false);
    expect(ctx.state).toBe('running');
    expect(ctx.suspends).toBe(1);
  });

  it('drops sounds when the SFX volume is 0 and clamps bad settings', () => {
    const e = new AudioEngine(mockFactory);
    e.configure(() => ({ sfxVol: 0, musicVol: 'loud' as unknown as number }));
    e.unlock();
    expect(e.play('clash')).toBe(false);
    expect(e.current.musicVol).toBe(6);
    expect(volGain(0, 1)).toBe(0);
    expect(volGain(10, 0.9)).toBeCloseTo(0.9);
    expect(volGain(99, 1)).toBe(1);
    expect(volGain(NaN, 1)).toBe(0);
    expect(volGain(5, 1)).toBeGreaterThan(0.2);
  });

  it('limits voices under a burst of battle sounds', () => {
    const e = new AudioEngine(mockFactory, { max: 8 });
    e.configure(() => undefined);
    e.unlock();
    const ctx = e.ctx as unknown as MockContext;
    let ok = 0;
    for (let i = 0; i < 200; i++) {
      ctx.currentTime += 0.004;
      if (e.play((['clash', 'block', 'hit', 'death'] as const)[i % 4], { pan: (i % 9) / 4 - 1, vol: 0.5 + (i % 3) * 0.3 })) ok++;
      expect(e.limiter.count(ctx.currentTime)).toBeLessThanOrEqual(8);
    }
    expect(ok).toBeGreaterThan(8);
    expect(ok).toBeLessThan(200);
    expect(e.stats.dropped + ok).toBe(200);
  });

  it('starts the wanted track once running and crossfades', () => {
    const e = new AudioEngine(mockFactory);
    e.configure(() => undefined);
    e.music('menu');
    expect(e.debug().track).toBeNull();
    e.unlock();
    vi.advanceTimersByTime(100);
    expect(e.debug().track).toBe('menu');
    e.music('battle');
    expect(e.debug().track).toBe('battle');
    e.stinger('victory');
    expect(e.debug().track).toBeNull();
  });
});

// ---------------------------------------------------------------- recipes and music

describe('sounds and music', () => {
  it('every recipe builds a graph and reports a sane length', () => {
    const c = new MockContext() as unknown as BaseAudioContext;
    const out = new MockNode() as unknown as AudioNode;
    const r = new AudioRng(1);
    for (const id of Object.keys(RECIPES) as SfxId[]) {
      const before = MockNode.started;
      const d = RECIPES[id](c, out, 0, r);
      expect(d, id).toBeGreaterThan(0.01);
      expect(d, id).toBeLessThan(4);
      expect(MockNode.started, id).toBeGreaterThan(before);
      expect(PRIORITY[id], id).toBeGreaterThanOrEqual(0);
    }
  });

  it('the sequencer schedules every track ahead of time and only once', () => {
    for (const id of Object.keys(TRACKS) as (keyof typeof TRACKS)[]) {
      const c = new MockContext();
      const p = new MusicPlayer(c as unknown as BaseAudioContext, new MockNode() as unknown as AudioNode);
      p.set(id, 0.5);
      p.setHeat(1);
      const before = MockNode.started;
      p.pump(2);
      const n = MockNode.started - before;
      expect(n, id).toBeGreaterThan(5);
      p.pump(2);
      expect(MockNode.started - before, id).toBe(n);
      // runs through a full loop and beyond without throwing
      for (let t = 2; t < 40; t += 0.25) {
        c.currentTime = t - 0.25;
        p.pump(t);
      }
    }
  });

  it('stingers play without a running track', () => {
    const c = new MockContext();
    const p = new MusicPlayer(c as unknown as BaseAudioContext, new MockNode() as unknown as AudioNode);
    expect(p.stinger('victory')).toBeGreaterThan(1);
    expect(p.stinger('defeat')).toBeGreaterThan(1);
  });
});

describe('spatial mapping', () => {
  const scene = (zoom: number, x: number) =>
    ({ cameras: { main: { zoom, worldView: { x, y: -100 } } }, scale: { width: 400, height: 800 } }) as never;

  it('pans by screen x and fades off-screen sounds', () => {
    const left = spot(scene(2, 0), 0, 0);
    const far = spot(scene(2, 5000), 0, 0);
    expect(left.pan!).toBeLessThan(0);
    expect(far.vol!).toBeLessThan(left.vol! * 0.5);
    expect(far.pri!).toBeLessThan(0);
  });

  it('is louder zoomed in', () => {
    expect(spot(scene(3, -100), 0, 0).vol!).toBeGreaterThan(spot(scene(1, -200), 0, 0).vol!);
  });
});
