/**
 * Game audio: the engine singleton and its wiring to the page, Telegram and
 * Phaser scenes. What plays when is decided in ./hooks.ts (the one file that
 * maps game events to sounds); scenes and widgets only call one-liners:
 *
 *   sfx.play('coin')                 // a sound effect (optional { pan, vol, pri })
 *   music.set('battle')              // crossfade to a track (scene changes do this automatically)
 *   battleAudio(scene, sim, events)  // battle events -> sounds (BattleScene.handleEvents)
 */
import type Phaser from 'phaser';
import { onAppActive } from '../platform/telegram';
import { AudioEngine, type AudioSettings, type PlayOpts } from './engine';
import type { StingerId, TrackId } from './music';
import type { SfxId } from './sfx';
import { sceneTrack } from './hooks';

export const audio = new AudioEngine();

export const sfx = {
  play: (id: SfxId, o?: PlayOpts): boolean => audio.play(id, o),
};

export const music = {
  set: (id: TrackId | null, fade?: number): void => audio.music(id, fade),
  heat: (v: number): void => audio.heat(v),
  stinger: (id: StingerId): void => audio.stinger(id),
};

let installed = false;

/**
 * Once at startup: settings source, gesture unlock, background suspend and
 * per-scene music. Safe without Web Audio (everything stays a no-op).
 */
export function installAudio(game: Phaser.Game, settings: () => Partial<AudioSettings> | undefined): void {
  if (installed) return;
  installed = true;
  audio.configure(settings);
  const unlock = (): void => {
    // only inside a real user activation, else browsers log "AudioContext was not allowed to start"
    const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
    if (ua && !ua.isActive) return;
    audio.unlock();
  };
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
  const vis = (): void => audio.setHidden(document.visibilityState === 'hidden');
  document.addEventListener('visibilitychange', vis);
  window.addEventListener('pagehide', () => audio.setHidden(true));
  window.addEventListener('pageshow', vis);
  onAppActive((active) => audio.setHidden(!active || document.visibilityState === 'hidden'));
  // Music follows the running scene.
  const hook = (): void => {
    for (const s of game.scene.scenes) {
      const key = s.sys.settings.key;
      s.sys.events.on('start', () => {
        audio.refresh();
        const t = sceneTrack(key);
        if (t !== undefined) music.set(t, key === 'Results' ? 3 : 1.5);
      });
    }
  };
  if (game.scene.isBooted) hook();
  else game.events.once('ready', hook);
  Object.assign(window, { __audio: audio });
}

export type { SfxId, TrackId, StingerId, PlayOpts, AudioSettings };
