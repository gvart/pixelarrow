import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceLimiter } from '../src/audio/voices';
import { AudioEngine, volGain } from '../src/audio/engine';
import { MusicPlayer, TRACKS } from '../src/audio/music';
import { RECIPES, PRIORITY, type SfxId } from '../src/audio/sfx';
import { AudioRng } from '../src/audio/rng';
import { ABILITY_SFX, battleAudio, JUICE_SFX, spot, WORKS_SFX } from '../src/audio/hooks';
import { busDb, busOf, dbToGain, DUCK, Ducker, gainToDb, STEP_DB, stepDb, TRIM_DB } from '../src/audio/mixer';
import { HAPTICS, hapticCue } from '../src/audio/haptics';
import { audio } from '../src/audio';
import { ABILITY_IDS } from '../src/data/perks';
import { WORK_TYPES, type SimEvent } from '../src/sim/types';
import { Battle } from '../src/sim/battle';
import { drainLogged } from '../src/game/report';
import { standardSetup } from './helpers';

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

// ---------------------------------------------------------------- FL-03: mixer, ducking, pause, juice tiers

describe('mixer (dB)', () => {
  it('volume steps are 2 dB apart, 10 is 0 dB and 0 is off', () => {
    expect(stepDb(10)).toBe(-0);
    expect(stepDb(9)).toBe(-STEP_DB);
    expect(stepDb(1)).toBe(-18);
    expect(stepDb(0)).toBe(-Infinity);
    expect(stepDb(NaN)).toBe(-Infinity);
    expect(stepDb(99)).toBe(-0);
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 2);
    expect(dbToGain(-Infinity)).toBe(0);
    expect(gainToDb(dbToGain(-12))).toBeCloseTo(-12);
  });

  it('Effects drives the SFX and UI buses; each bus has its trim', () => {
    const b = busDb({ sound: true, musicVol: 10, sfxVol: 5 });
    expect(b.music).toBe(TRIM_DB.music);
    expect(b.sfx).toBe(-10 + TRIM_DB.sfx);
    expect(b.ui).toBe(-10 + TRIM_DB.ui);
    expect(busDb({ sound: true, musicVol: 0, sfxVol: 0 }).ui).toBe(-Infinity);
  });

  it('clicks, coins and the narrator are UI; battle sounds are SFX', () => {
    for (const id of ['click', 'tap', 'back', 'error', 'coin', 'narrate', 'quill', 'chime', 'levelUp', 'warning'] as const) expect(busOf(id), id).toBe('ui');
    for (const id of ['clash', 'horn', 'thud', 'hornChord', 'worksStakes'] as const) expect(busOf(id), id).toBe('sfx');
  });

  it('the deepest duck wins and each ends with its sound', () => {
    const d = new Ducker();
    d.add({ music: -7 }, 0, 1);
    expect(d.depth('music', 0.2)).toBe(-7);
    expect(d.depth('sfx', 0.2)).toBe(0);
    d.add({ music: -10, sfx: -4 }, 0.5, 1);
    expect(d.depth('music', 0.7)).toBe(-10);
    expect(d.depth('sfx', 0.7)).toBe(-4);
    expect(d.depth('music', 1.2)).toBe(-10);
    expect(d.depth('music', 1.6)).toBe(0);
    expect(d.depth('sfx', 1.6)).toBe(0);
  });

  it('horns duck the music', () => {
    for (const id of ['horn', 'hornLow', 'hornChord'] as const) expect(DUCK[id]!.music, id).toBeLessThan(-5);
  });
});

describe('AudioEngine buses (FL-03)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const make = () => {
    const e = new AudioEngine(mockFactory);
    e.configure(() => undefined);
    e.unlock();
    return { e, ctx: e.ctx as unknown as MockContext };
  };

  it('a horn ducks the music at once and the music comes back after it', () => {
    const { e, ctx } = make();
    expect(e.mix().liveMusicDuck).toBe(1);
    expect(e.play('horn')).toBe(true);
    expect(e.mix().duckMusicDb).toBe(DUCK.horn!.music);
    expect(e.mix().liveMusicDuck as number).toBeCloseTo(dbToGain(DUCK.horn!.music));
    ctx.currentTime += 5;
    vi.advanceTimersByTime(100);
    expect(e.mix().duckMusicDb).toBe(0);
    expect(e.mix().liveMusicDuck).toBe(1);
  });

  it('a clash does not duck anything', () => {
    const { e } = make();
    e.play('clash');
    expect(e.mix().duckMusicDb).toBe(0);
    expect(e.mix().duckSfxDb).toBe(0);
  });

  it('paused: field sounds are refused and the world gate closes; UI sounds still play', () => {
    const { e } = make();
    e.setPaused(true);
    expect(e.mix().paused).toBe(true);
    expect(e.mix().liveWorld).toBe(0);
    expect(e.play('clash')).toBe(false);
    expect(e.play('horn')).toBe(false);
    expect(e.stats.gated).toBe(2);
    expect(e.play('click')).toBe(true);
    // the Effects preview in Settings sounds on the UI bus even over a paused battle
    expect(e.play('block', { bus: 'ui' })).toBe(true);
    e.setPaused(false);
    expect(e.mix().liveWorld).toBe(1);
    expect(e.play('clash')).toBe(true);
  });

  it('a pause set before the context exists holds once it is built', () => {
    const e = new AudioEngine(mockFactory);
    e.configure(() => undefined);
    e.setPaused(true);
    e.unlock();
    expect(e.mix().liveWorld).toBe(0);
    expect(e.play('clash')).toBe(false);
  });

  it('counts what played, per id', () => {
    const { e, ctx } = make();
    e.play('thud');
    ctx.currentTime += 1;
    e.play('thud');
    e.play('click');
    expect(e.byId.thud).toBe(2);
    expect(e.debug().byId).toEqual({ thud: 2, click: 1 });
  });
});

describe('juice tiers and abilities have their sounds (FL-03)', () => {
  it('every tier from the impact up lands with its own sound, higher in priority as the tier grows', () => {
    const order = ['impact', 'stakes', 'standard', 'rout', 'armyBreak'] as const;
    let prev = -1;
    for (const k of order) {
      const id = JUICE_SFX[k];
      expect(id, k).toBeTruthy();
      expect(RECIPES[id!], k).toBeTypeOf('function');
      expect(PRIORITY[id!], k).toBeGreaterThanOrEqual(prev);
      prev = PRIORITY[id!];
    }
    // a kill and an ability are their per-man sounds (death, ABILITY_SFX)
    expect(JUICE_SFX.kill).toBeNull();
    expect(JUICE_SFX.ability).toBeNull();
  });

  it('every ability has a sound, and the signature actives no longer borrow', () => {
    for (const a of ABILITY_IDS) expect(RECIPES[ABILITY_SFX[a]], a).toBeTypeOf('function');
    expect(ABILITY_SFX.push).toBe('shove');
    expect(ABILITY_SFX.sunder).toBe('sunder');
    expect(ABILITY_SFX.aimed).toBe('aimed');
    expect(ABILITY_SFX.scythe).toBe('scythe');
    expect(ABILITY_SFX.bond).toBe('bond');
  });

  it('every field work has a sound', () => {
    for (const w of WORK_TYPES) expect(RECIPES[WORKS_SFX[w]], w).toBeTypeOf('function');
  });

  it('the haptics map: a row buzzes from the scene or from audio, never both', () => {
    expect(hapticCue('impact', true)).toEqual({ kind: 'impact', style: 'medium' });
    expect(hapticCue('impact', false)).toBeNull();
    expect(hapticCue('armyBreak', false)).toEqual({ kind: 'notify', style: 'success' });
    // scene rows (BattleScene fires them) are not fired again by audio
    for (const k of ['kill', 'ability', 'rout'] as const) {
      expect(HAPTICS[k].by).toBe('scene');
      expect(hapticCue(k, true)).toBeNull();
    }
  });
});

describe('battleAudio through the real hook (FL-03)', () => {
  const fakeScene = (now: number) => ({ time: { now }, cameras: { main: { zoom: 1, worldView: { x: 0, y: 0 } } }, scale: { width: 390, height: 844 } }) as never;

  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as { AudioContext?: unknown }).AudioContext = MockContext;
    audio.configure(() => ({ sound: true, musicVol: 6, sfxVol: 7 }));
    audio.unlock();
    audio.setPaused(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { AudioContext?: unknown }).AudioContext;
  });

  it('each juice event plays its tier sound, once per gap, and the army break ducks the music', () => {
    const b = new Battle(standardSetup(41, true).setup);
    b.startBattle();
    const ctx = audio.ctx as unknown as MockContext;
    const count = (id: SfxId) => audio.byId[id] ?? 0;
    const before = { thud: count('thud'), groan: count('groan'), hornChord: count('hornChord'), splinter: count('splinter'), standardFall: count('standardFall') };
    const g = b.groups[0];
    const u = b.units.find((x) => x.group === g.id)!;
    const foe = b.units.find((x) => x.side !== u.side)!;
    const ev = [
      { type: 'impact', tick: 1, unit: u.id, by: foe.id },
      { type: 'impact', tick: 1, unit: u.id, by: foe.id },
      { type: 'stakesBreak', tick: 1, unit: foe.id, x: u.x, y: u.y },
      { type: 'standardLost', tick: 1, side: u.side, unit: u.id },
      { type: 'rout', tick: 1, side: g.side, group: g.id },
      { type: 'armyBreak', tick: 1, side: g.side },
    ] as SimEvent[];
    const hash = b.hash();
    battleAudio(fakeScene(1000), b, ev, 0);
    expect(count('thud') - before.thud).toBe(1);
    expect(count('splinter') - before.splinter).toBe(1);
    expect(count('standardFall') - before.standardFall).toBe(1);
    expect(count('groan') - before.groan).toBe(1);
    expect(count('hornChord') - before.hornChord).toBe(1);
    expect(audio.mix().duckMusicDb).toBe(DUCK.hornChord!.music);
    // within the gap the tier sound does not repeat; after it, it does
    ctx.currentTime += 0.5;
    battleAudio(fakeScene(1100), b, [ev[0]], 0);
    expect(count('thud') - before.thud).toBe(1);
    ctx.currentTime += 0.5;
    battleAudio(fakeScene(1500), b, [ev[0]], 0);
    expect(count('thud') - before.thud).toBe(2);
    // audio only reads the sim
    expect(b.hash()).toBe(hash);
  });

  it('paused, the hook plays no field sound', () => {
    const b = new Battle(standardSetup(41, true).setup);
    b.startBattle();
    const ctx = audio.ctx as unknown as MockContext;
    ctx.currentTime += 10;
    const played = audio.stats.played;
    audio.setPaused(true);
    battleAudio(fakeScene(9000), b, [{ type: 'armyBreak', tick: 1, side: 1 }] as SimEvent[], 0);
    expect(audio.stats.played).toBe(played);
    audio.setPaused(false);
  });

  it('audio never moves the sim: a battle with the hook equals one without', () => {
    const run = (withAudio: boolean) => {
      const b = new Battle(standardSetup(41, true).setup);
      b.startBattle();
      let now = 0;
      for (let i = 0; i < 2400 && b.phase === 'battle'; i++) {
        b.step();
        const ev = drainLogged(b);
        now += 50;
        if (withAudio) battleAudio(fakeScene(now), b, ev, 0);
      }
      return { tick: b.tick, hash: b.hash() };
    };
    const played = audio.stats.played;
    const a = run(true);
    expect(audio.stats.played).toBeGreaterThan(played);
    expect(a).toEqual(run(false));
  }, 30_000);
});
