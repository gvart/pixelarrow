/**
 * The audio engine: one lazily created AudioContext, a mixer (master with a
 * limiter, SFX and music buses), the voice limiter and the music player.
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
 * Whether the phone's hardware silent switch is on cannot be detected from a
 * web page. On iOS, Web Audio plays even in silent mode (unlike <audio> with
 * the "ambient" session), so players use the in-game Sound toggle.
 */
import { MusicPlayer, type StingerId, type TrackId } from './music';
import { AudioRng } from './rng';
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

/** Volume step 0..10 -> gain (perceptual-ish curve). */
export function volGain(step: number, max: number): number {
  const v = Math.max(0, Math.min(10, Number.isFinite(step) ? step : 0)) / 10;
  return max * Math.pow(v, 1.6);
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  readonly limiter: VoiceLimiter;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
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
  readonly stats = { played: 0, dropped: 0, stolen: 0 };

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

  /** Play a sound effect. Returns false if it was not started (no audio, muted, voice limit). */
  play(id: SfxId, o: PlayOpts = {}): boolean {
    const c = this.ctx;
    if (!c || !this.running() || !this.sfxBus || this.settings.sfxVol <= 0) return false;
    const recipe = RECIPES[id];
    if (!recipe) return false;
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
      head.connect(this.sfxBus);
      const t = now + 0.005;
      const dur = recipe(c, g, t, this.rng);
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
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.player = new MusicPlayer(ctx, this.musicBus);
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
    if (!c || !this.master || !this.sfxBus || !this.musicBus) return;
    const t = c.currentTime;
    this.master.gain.setTargetAtTime(this.settings.sound ? 1 : 0, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(volGain(this.settings.sfxVol, 0.9), t, 0.02);
    this.musicBus.gain.setTargetAtTime(volGain(this.settings.musicVol, 1.2), t, 0.05);
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
    if (p.track !== this.wantTrack) p.set(this.wantTrack, p.track ? 1.5 : 2.5);
    try {
      p.pump(c.currentTime + 0.25);
    } catch {
      /* ignore */
    }
  }
}
