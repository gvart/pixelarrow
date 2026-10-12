/**
 * The audio engine: one lazily created AudioContext, the mixer of ./mixer.ts
 * (master with a limiter; music, SFX and UI buses in dB; ducking under horns;
 * the pause gate), the voice limiter and the music player.
 *
 * Browser rules this follows:
 *  - The AudioContext is only created (and resumed) inside a user gesture —
 *    iOS Safari / Telegram's WebView keep it silent otherwise. `unlock()` is
 *    called from global pointer/touch/key listeners and is cheap when running.
 *  - Backgrounded (page hidden, Telegram 'deactivated') or muted: the context
 *    is suspended, which stops all processing (CPU/battery) and the music
 *    clock with it; it resumes on return (or on the next tap, where iOS insists).
 *  - No Web Audio at all (old WebView, some headless browsers): every call is a no-op.
 *
 *  - A paused battle (`setPaused`) fades music and field sounds out and refuses
 *    new field sounds; UI sounds still play. Audio never feeds the sim.
 *
 * Whether the phone's hardware silent switch is on cannot be detected from a
 * web page. On iOS, Web Audio plays even in silent mode (unlike <audio> with
 * the "ambient" session), so players use the in-game Sound toggle.
 */
import { MusicPlayer, type StingerId, type TrackId } from './music';
import { AudioRng } from './rng';
import { busDb, busOf, dbToGain, DUCK, DUCK_ATTACK, DUCK_RELEASE, Ducker, GATE_TC, stepDb, type Bus } from './mixer';
import { LEVEL, PRIORITY, RECIPES, type SfxId } from './sfx';
import { VoiceLimiter, type LimiterOpts } from './voices';

export interface AudioSettings {
  /** Sound on (false = muted). */
  sound: boolean;
  /** 0..10 */
  musicVol: number;
  /** 0..10 */
  sfxVol: number;
}

export const DEFAULT_AUDIO: AudioSettings = { sound: true, musicVol: 6, sfxVol: 7 };

export interface PlayOpts {
  /** Stereo position -1 (left) .. 1 (right). */
  pan?: number;
  /** Loudness multiplier (distance / zoom attenuation), 1 = normal. */
  vol?: number;
  /** Added to the sound's base priority (e.g. off-screen: negative). */
  pri?: number;
  /** Play on this bus instead of the sound's own (the Effects volume preview is UI: it must sound in a paused battle). */
  bus?: Bus;
}

type CtxFactory = () => AudioContext | null;

function defaultFactory(): AudioContext | null {
  try {
    const w = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const C = w.AudioContext ?? w.webkitAudioContext;
    return C ? new C({ latencyHint: 'interactive' }) : null;
  } catch {
    return null;
  }
}

/** Volume step 0..10 -> gain, through dB (mixer.ts stepDb): `max` at 10, 0 at 0. */
export function volGain(step: number, max: number): number {
  return max * dbToGain(stepDb(step));
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  readonly limiter: VoiceLimiter;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private uiBus: GainNode | null = null;
  /** The pause gate over music and SFX. */
  private world: GainNode | null = null;
  private musicDuck: GainNode | null = null;
  private sfxDuck: GainNode | null = null;
  private readonly ducker = new Ducker();
  private duckNow = { music: 0, sfx: 0 };
  private paused = false;
  private player: MusicPlayer | null = null;
  private failed = false;
  private hidden = false;
  private settings: AudioSettings = { ...DEFAULT_AUDIO };
  private source: (() => Partial<AudioSettings> | undefined) | null = null;
  private wantTrack: TrackId | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private rng = new AudioRng((Date.now() ^ 0x5bd1e995) >>> 0);
  private durs = new Map<SfxId, number>();
  /** Counters for tests and the debug handle. */
  readonly stats = { played: 0, dropped: 0, stolen: 0, gated: 0 };
  /** Sounds started, per id (tests and the audio smoke). */
  readonly byId: Partial<Record<SfxId, number>> = {};

  constructor(
    private readonly factory: CtxFactory = defaultFactory,
    limits: Partial<LimiterOpts> = {},
  ) {
    this.limiter = new VoiceLimiter(limits);
  }

  /** Where the persisted settings live (read on unlock and on `refresh()`). */
  configure(source: () => Partial<AudioSettings> | undefined): void {
    this.source = source;
    this.refresh();
  }

  /** Re-read the settings (after the settings modal or a save change). */
  refresh(): void {
    let s: Partial<AudioSettings> | undefined;
    try {
      s = this.source?.();
    } catch {
      s = undefined;
    }
    this.settings = {
      sound: typeof s?.sound === 'boolean' ? s.sound : DEFAULT_AUDIO.sound,
      musicVol: typeof s?.musicVol === 'number' ? s.musicVol : DEFAULT_AUDIO.musicVol,
      sfxVol: typeof s?.sfxVol === 'number' ? s.sfxVol : DEFAULT_AUDIO.sfxVol,
    };
    this.applyGains();
    this.applyRunning();
  }

  get current(): AudioSettings {
    return { ...this.settings };
  }

  /** Called from user gestures: create the context on first use and resume it. */
  unlock(): void {
    if (this.failed) return;
    if (!this.ctx) {
      if (!this.settings.sound) return; // muted: don't even create it
      const ctx = this.factory();
      if (!ctx) {
        this.failed = true;
        return;
      }
      this.build(ctx);
    }
    this.applyRunning();
  }

  /** Page / Telegram went to the background (true) or came back (false). */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.applyRunning();
  }

  /** Is the context producing sound right now? */
  running(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && this.settings.sound && !this.hidden;
  }

  /**
   * A battle paused (true) or running again (false). Paused: music and field
   * sounds fade out and new field sounds are refused; UI sounds still play.
   */
  setPaused(p: boolean): void {
    if (this.paused === p) return;
    this.paused = p;
    const c = this.ctx;
    if (c && this.world) this.world.gain.setTargetAtTime(p ? 0 : 1, c.currentTime, GATE_TC);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Play a sound effect. Returns false if it was not started (no audio, muted, paused field sound, voice limit). */
  play(id: SfxId, o: PlayOpts = {}): boolean {
    const c = this.ctx;
    if (!c || !this.running() || !this.sfxDuck || !this.sfxBus || !this.uiBus || this.settings.sfxVol <= 0) return false;
    const recipe = RECIPES[id];
    if (!recipe) return false;
    const bus = o.bus ?? busOf(id);
    if (bus !== 'ui' && this.paused) {
      this.stats.gated++;
      return false;
    }
    const vol = (LEVEL[id] ?? 1) * (o.vol ?? 1);
    if (vol < 0.03) {
      this.stats.dropped++;
      return false;
    }
    const now = c.currentTime;
    const res = this.limiter.admit(id, PRIORITY[id] + (o.pri ?? 0) + vol, now, this.durs.get(id) ?? 0.5);
    if (!res.ok) {
      this.stats.dropped++;
      return false;
    }
    if (res.stolen) {
      this.stats.stolen++;
      res.stolen.stop?.();
    }
    try {
      const g = c.createGain();
      g.gain.value = Math.min(1.5, vol);
      let head: AudioNode = g;
      if (o.pan && typeof c.createStereoPanner === 'function') {
        const p = c.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, o.pan));
        g.connect(p);
        head = p;
      }
      const duck = bus === 'ui' ? undefined : DUCK[id];
      // a ducking sound keys the duck: it goes past the SFX duck, so it never ducks itself
      head.connect(bus === 'ui' ? this.uiBus : duck ? this.sfxBus : this.sfxDuck);
      const t = now + 0.005;
      const dur = recipe(c, g, t, this.rng);
      if (duck) {
        this.ducker.add(duck, now, dur);
        this.applyDuck();
      }
      this.byId[id] = (this.byId[id] ?? 0) + 1;
      this.durs.set(id, dur);
      res.voice.end = t + dur;
      res.voice.stop = () => {
        try {
          g.gain.setTargetAtTime(0, c.currentTime, 0.015);
        } catch {
          /* gone */
        }
      };
      // let the graph go once the sound is over
      setTimeout(() => head.disconnect(), (dur + 0.6) * 1000);
      this.stats.played++;
      return true;
    } catch {
      return false;
    }
  }

  /** Switch music (crossfade). Remembered until the context exists. */
  music(id: TrackId | null, fade = 1.5): void {
    this.wantTrack = id;
    if (this.player && this.running()) this.player.set(id, fade);
  }

  get track(): TrackId | null {
    return this.wantTrack;
  }

  /** Battle intensity 0..1. */
  heat(v: number): void {
    this.player?.setHeat(v);
  }

  stinger(id: StingerId): void {
    this.wantTrack = null;
    if (this.player && this.running()) this.player.stinger(id);
  }

  debug(): Record<string, unknown> {
    return {
      available: !this.failed,
      state: this.ctx?.state ?? 'none',
      track: this.player?.track ?? null,
      want: this.wantTrack,
      voices: this.ctx ? this.limiter.count(this.ctx.currentTime) : 0,
      ...this.stats,
      settings: this.current,
      mix: this.mix(),
      byId: { ...this.byId },
    };
  }

  /** The mix now, dB: the bus levels from the settings, the ducks, the pause gate; `live` reads the duck gains themselves. */
  mix(): Record<string, number | boolean> {
    const b = busDb(this.settings);
    const now = this.ctx?.currentTime ?? 0;
    return {
      musicDb: b.music,
      sfxDb: b.sfx,
      uiDb: b.ui,
      duckMusicDb: this.ducker.depth('music', now),
      duckSfxDb: this.ducker.depth('sfx', now),
      liveMusicDuck: this.musicDuck?.gain.value ?? 1,
      liveWorld: this.world?.gain.value ?? 1,
      paused: this.paused,
    };
  }

  private build(ctx: AudioContext): void {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 6;
    comp.ratio.value = 12;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);
    this.world = ctx.createGain();
    this.world.gain.value = this.paused ? 0 : 1;
    this.world.connect(this.master);
    this.uiBus = ctx.createGain();
    this.uiBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.world);
    this.sfxDuck = ctx.createGain();
    this.sfxDuck.connect(this.sfxBus);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.world);
    this.musicDuck = ctx.createGain();
    this.musicDuck.connect(this.musicBus);
    this.musicDuck.gain.value = 1;
    this.sfxDuck.gain.value = 1;
    this.player = new MusicPlayer(ctx, this.musicDuck);
    this.applyGains();
    // iOS: playing a buffer inside the gesture unlocks output for good
    try {
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    } catch {
      /* ignore */
    }
    ctx.onstatechange = () => this.onState();
  }

  private applyGains(): void {
    const c = this.ctx;
    if (!c || !this.master || !this.sfxBus || !this.musicBus || !this.uiBus) return;
    const t = c.currentTime;
    const b = busDb(this.settings);
    this.master.gain.setTargetAtTime(this.settings.sound ? 1 : 0, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(dbToGain(b.sfx), t, 0.02);
    this.uiBus.gain.setTargetAtTime(dbToGain(b.ui), t, 0.02);
    this.musicBus.gain.setTargetAtTime(dbToGain(b.music), t, 0.05);
  }

  /** Move the duck gains to the ducker's depth: fast down, slow back up. */
  private applyDuck(): void {
    const c = this.ctx;
    if (!c) return;
    const now = c.currentTime;
    for (const bus of ['music', 'sfx'] as const) {
      const node = bus === 'music' ? this.musicDuck : this.sfxDuck;
      const d = this.ducker.depth(bus, now);
      if (!node || d === this.duckNow[bus]) continue;
      node.gain.setTargetAtTime(dbToGain(d), now, d < this.duckNow[bus] ? DUCK_ATTACK : DUCK_RELEASE);
      this.duckNow[bus] = d;
    }
  }

  private applyRunning(): void {
    const c = this.ctx;
    if (!c) return;
    const want = this.settings.sound && !this.hidden;
    try {
      if (want && c.state !== 'running') void c.resume().catch(() => {});
      else if (!want && c.state === 'running') void c.suspend().catch(() => {});
    } catch {
      /* ignore */
    }
    this.onState();
  }

  /** Start/stop the music timer with the context; (re)start the wanted track. */
  private onState(): void {
    const on = this.running();
    if (on && !this.timer) {
      this.timer = setInterval(() => this.tick(), 60);
      this.tick();
    } else if (!on && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    const c = this.ctx;
    const p = this.player;
    if (!c || !p || c.state !== 'running') return;
    this.applyDuck();
    if (p.track !== this.wantTrack) p.set(this.wantTrack, p.track ? 1.5 : 2.5);
    try {
      p.pump(c.currentTime + 0.25);
    } catch {
      /* ignore */
    }
  }
}
