/**
 * The war's sound decisions as pure logic (no Web Audio, no Phaser), unit-tested in tests/war/warAudio.test.ts:
 * where a sound sits (pan and loudness by its place on screen and the zoom), what plays when a unit strikes, the
 * music's state with hysteresis, the biome beds round the camera, and the persisted volume settings.
 */
import type { AmbLevels } from '../../../audio/ambience';
import type { TrackId } from '../../../audio/music';
import type { SfxId } from '../../../audio/sfx';

// ---------------------------------------------------------------- spatial

/**
 * Loudness and pan of a sound `dx, dy` screen px from the view's centre (half sizes `hw, hh`) at camera `zoom`: full
 * inside the middle of the screen, fading to nothing a half screen past its edge; panned by x; quieter zoomed out (the
 * camera is "further away"). vol 0: not worth a voice.
 */
export function spatial(dx: number, dy: number, hw: number, hh: number, zoom: number): { vol: number; pan: number } {
  const d = Math.hypot(dx / Math.max(1, hw), dy / Math.max(1, hh));
  const near = d <= 0.6 ? 1 : d >= 1.6 ? 0 : 1 - (d - 0.6);
  const z = Math.max(0, Math.min(1, (zoom - 0.25) / 0.75));
  const vol = near * near * (0.45 + 0.55 * z);
  const pan = Math.max(-0.85, Math.min(0.85, (dx / Math.max(1, hw)) * 0.75));
  return { vol, pan };
}

// ---------------------------------------------------------------- combat

const RANGED = new Set(['archer', 'slinger', 'javelineer']);
const SPEAR = new Set(['hoplite', 'militia']);
const BEAST = /^mob_(wolf|jackal|boar|bear|ibex|lion|griffin|moor_bear|savanna_lion)/;
const SWORD = /^(celt_sword|mob_bandit|mob_maenad$)/;

/** A melee blow's sound by the striker's class; null: a ranged class (its missile sounds instead). */
export function strikeSfx(cls: string, roll: number): SfxId | null {
  if (RANGED.has(cls)) return null;
  if (SPEAR.has(cls)) return roll < 0.3 ? 'block' : 'clashSpear';
  if (BEAST.test(cls)) return 'hit';
  if (SWORD.test(cls)) return roll < 0.2 ? 'block' : 'clash';
  return cls.startsWith('mob_') ? 'clashHeavy' : 'clash';
}

/** A missile's release and landing. */
export function shotSfx(kind: 'arrow' | 'stone' | 'javelin' | 'bolt', siege: boolean): { release: SfxId; land: SfxId } {
  if (siege) return { release: 'throwRelease', land: 'boulder' };
  if (kind === 'stone') return { release: 'sling', land: 'stoneHit' };
  if (kind === 'javelin') return { release: 'javelin', land: 'thunk' };
  if (kind === 'bolt') return { release: 'throwRelease', land: 'thunk' };
  return { release: 'arrow', land: 'land' };
}

/** What a gatherer at a node of this resource sounds like (null: quiet work, as picking olives). */
export function gatherSfx(res: string | undefined): SfxId | null {
  if (res === 'wood') return 'chop';
  if (res && ['stone', 'marble', 'copper', 'tin', 'iron', 'silver', 'salt'].includes(res)) return 'mine';
  return null;
}

// ---------------------------------------------------------------- guardians

/** A guardian's beat (../bossFx.ts CUES) as a sound, by guardian (src/data/warBosses.ts ids). */
export function cueSfx(cue: string, boss: string): SfxId | null {
  const roar: Record<string, SfxId> = {
    drakon: 'dragonRoar', scylla: 'scyllaShriek', chimera: 'chimeraRoar', gyges: 'gygesBellow', brontes: 'thunder',
    bandit_king: 'battlecry', maenad_queen: 'maenadFrenzy', griffin: 'screech',
  };
  switch (cue) {
    case 'boss.breath': return 'fire';
    case 'boss.breath.charge': return 'breathCharge';
    case 'boss.sweep': return 'sweep';
    case 'boss.smash': return boss === 'brontes' ? 'anvil' : 'bossCrash';
    case 'boss.stomp': return 'stomp';
    case 'boss.throw': return 'hurl';
    case 'boss.impact': return 'boulder';
    case 'boss.crash': return 'bossCrash';
    case 'boss.snatch': return 'splash';
    case 'boss.takeoff': return 'wingBeats';
    case 'boss.land': return boss === 'drakon' || boss === 'griffin' ? 'wingBeats' : 'stomp';
    case 'boss.roar': return roar[boss] ?? 'roar';
    case 'boss.phase': return 'groan';
    case 'boss.chains': return 'chains';
    case 'boss.splash': return 'splash';
    case 'boss.horn': return 'banditHorn';
    case 'boss.frenzy': return 'maenadFrenzy';
    case 'boss.enrage': return roar[boss] ?? 'roar';
    case 'boss.slain': return 'bossSlain';
    case 'boss.loot': return 'chime';
    default: return null;
  }
}

// ---------------------------------------------------------------- music

export type MusicState = 'calm' | 'tension' | 'battle' | 'boss';
export const STATE_TRACK: Record<MusicState, TrackId> = { calm: 'explore', tension: 'deploy', battle: 'battle', boss: 'boss' };
const RANK: Record<MusicState, number> = { calm: 0, tension: 1, battle: 2, boss: 3 };
/** Seconds a state holds before the music may step down (no flapping on a lull). */
export const HOLD_S = 8;

/** What the camera sees now: foes near, men fighting near, a guardian fight near. */
export interface MusicInput { foes: number; fighting: number; boss: boolean }

export function wantState(i: MusicInput): MusicState {
  if (i.boss) return 'boss';
  if (i.fighting >= 3) return 'battle';
  if (i.foes > 0) return 'tension';
  return 'calm';
}

/** The music state with hysteresis: up at once, down only after HOLD_S of the lower want. */
export class MusicDirector {
  state: MusicState = 'calm';
  private since = 0;

  update(now: number, i: MusicInput): MusicState {
    const w = wantState(i);
    if (RANK[w] >= RANK[this.state]) {
      this.state = w;
      this.since = now;
    } else if (now - this.since >= HOLD_S) {
      this.state = w;
      this.since = now;
    }
    return this.state;
  }
}

// ---------------------------------------------------------------- ambience

/** Shares 0..1 of what lies round the camera (sampled tiles), and how much is burning or built. */
export interface AmbSample {
  biome: Record<string, number>; forest: number; deep: number; shallow: number; built: number; fire: number;
}

/** The beds for a sample: the biome's wind and life, water, a town's murmur, fire. */
export function ambienceFor(s: AmbSample, zoom: number): AmbLevels {
  const b = (n: string) => s.biome[n] ?? 0;
  const open = Math.max(0, 1 - s.forest - s.deep);
  // zoomed out the camera is high up: more wind, less of the small life
  const high = Math.max(0, Math.min(1, (0.6 - zoom) / 0.35));
  const lv: AmbLevels = {
    wind: Math.min(1, (b('global') + b('elaia') + b('dodona')) * (0.35 + 0.4 * open) + high * 0.3),
    gale: Math.min(1, b('mountains') * 0.9),
    desert: Math.min(1, b('kyrene') * 0.85),
    birds: Math.min(1, (s.forest * 1.2 + b('dodona') * 0.5 + b('elaia') * 0.2) * (1 - high * 0.7) * (1 - b('kyrene') * 0.8)),
    sea: s.deep > 0.25 ? Math.min(1, s.deep * 1.1) : 0,
    river: s.deep <= 0.25 ? Math.min(1, (s.deep + s.shallow) * 4) : Math.min(0.4, s.shallow * 2),
    murmur: Math.min(1, s.built * 3) * (1 - high * 0.5),
    fire: Math.min(1, s.fire),
  };
  for (const k of Object.keys(lv) as (keyof AmbLevels)[]) if ((lv[k] ?? 0) < 0.03) delete lv[k];
  return lv;
}

// ---------------------------------------------------------------- settings

export interface WarSoundSettings { sound: boolean; masterVol: number; musicVol: number; sfxVol: number; ambVol: number }
export const DEFAULT_SOUND: WarSoundSettings = { sound: true, masterVol: 8, musicVol: 5, sfxVol: 7, ambVol: 6 };
export const SOUND_KEY = 'pixelarrow.war.sound';

const step = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(10, Math.round(v))) : d);

/** Parse stored settings (any junk falls back to the defaults, field by field). */
export function parseSound(raw: string | null): WarSoundSettings {
  let o: Partial<WarSoundSettings> = {};
  try {
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (v && typeof v === 'object') o = v as Partial<WarSoundSettings>;
  } catch {
    /* junk: defaults */
  }
  const d = DEFAULT_SOUND;
  return {
    sound: typeof o.sound === 'boolean' ? o.sound : d.sound,
    masterVol: step(o.masterVol, d.masterVol), musicVol: step(o.musicVol, d.musicVol), sfxVol: step(o.sfxVol, d.sfxVol), ambVol: step(o.ambVol, d.ambVol),
  };
}

export function loadSound(): WarSoundSettings {
  try {
    return parseSound(localStorage.getItem(SOUND_KEY));
  } catch {
    return { ...DEFAULT_SOUND };
  }
}

export function saveSound(s: WarSoundSettings): void {
  try {
    localStorage.setItem(SOUND_KEY, JSON.stringify(s));
  } catch {
    /* private mode or blocked storage: this session only */
  }
}
