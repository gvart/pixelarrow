/**
 * The sample bank: recorded (generated) sounds that replace or join the procedural recipes of ./sfx.ts and the beds of
 * ./ambience.ts. Pure data and logic (no Web Audio): the loader and player are ./samples.ts.
 *
 *  - `SAMPLE_BANK` lists every sample id with its bus, how many variants ship (`v`; 0 = none yet: the recipe plays),
 *    its level, pitch jitter, priority and a rate cap. The prompts, durations and target loudness live in
 *    docs/playbook/SOUND.md (the generator reads them there); a test keeps the two in step.
 *  - Files: public/war/sfx/<id>-<k>.<ext> (k = 1..v), `ext` by what the browser decodes (opus in ogg, else AAC in m4a).
 *  - `SFX_SAMPLE` maps the procedural ids to the sample that replaces them once it is loaded; callers can also name a
 *    sample per play (a beast's own bite, the war's world stingers), with a recipe as the fallback.
 *  - Nothing loads at startup: the first play of an id fetches its variants (./samples.ts), the recipe covers the gap.
 */
import type { AudioRng } from './rng';
import type { SfxId } from './sfx';

export type SampleBus = 'sfx' | 'ui' | 'amb';

export interface SampleDef {
  bus: SampleBus;
  /** Variants shipped in public/war/sfx (0: not generated yet). */
  v: number;
  /** Gain at vol 1 (the files are normalised to their SOUND.md loudness; this trims the mix). */
  level: number;
  /** Pitch jitter, cents either way (0: none; loops and stingers keep their pitch). */
  cents: number;
  /** Base priority for the voice limiter (./voices.ts). */
  pri: number;
  /** At most this many starts per second of this id (crowded fights); 0: no cap. */
  rate: number;
  /** A looping bed. */
  loop?: boolean;
}

/** Beasts with their own bites, cries and deaths (the mob kinds that are not men: src/war/types.ts MobKind). */
export const BEASTS = ['wolf', 'boar', 'bear', 'lion', 'jackal', 'ibex', 'serpent', 'scorpion', 'harpy', 'cyclops', 'drake'] as const;
export type Beast = (typeof BEASTS)[number];
export type BeastSample = `beast.${Beast}.${'attack' | 'cry' | 'death'}`;

/** The biome loops (crossfaded by ./loops.ts). */
export const LOOPS = ['amb.moors', 'amb.surf', 'amb.glacier', 'amb.forest', 'amb.steppe', 'amb.town'] as const;
export type LoopId = (typeof LOOPS)[number];

const fx = (v: number, pri: number, rate: number, cents = 80, level = 1): SampleDef => ({ bus: 'sfx', v, level, cents, pri, rate });
const ui = (v: number, level = 1, cents = 0): SampleDef => ({ bus: 'ui', v, level, cents, pri: 10, rate: 12 });
const loop = (level = 1): SampleDef => ({ bus: 'amb', v: 1, level, cents: 0, pri: 0, rate: 0, loop: true });

const beasts = {} as Record<BeastSample, SampleDef>;
for (const b of BEASTS) {
  beasts[`beast.${b}.attack`] = fx(3, 4, 6, 100);
  beasts[`beast.${b}.cry`] = fx(2, 8, 0.6, 60);
  beasts[`beast.${b}.death`] = fx(2, 6, 3, 80);
}

export const SAMPLE_BANK = {
  // combat: men
  'hit.metal': fx(4, 3, 10),
  'hit.spear': fx(3, 3, 8),
  'hit.wood': fx(3, 3, 8),
  'hit.heavy': fx(3, 7, 5, 60),
  'death.man': fx(3, 5, 4),
  'cry.wounded': fx(3, 4, 3, 120),
  'sting.chief': fx(1, 9, 0.3, 0),
  'sting.boss': fx(1, 10, 0.3, 0),
  ...beasts,
  // UI
  'ui.click': ui(3, 1, 60),
  'ui.open': ui(2),
  'ui.close': ui(2),
  'ui.error': ui(1),
  'ui.coin': ui(2, 1, 80),
  'ui.reward': ui(1),
  // world
  'world.raidHorn': ui(1),
  'world.warlordFall': ui(1),
  'world.mastery': ui(1),
  'world.secret': ui(1),
  'world.soulWake': ui(1),
  // ambience loops
  'amb.moors': loop(),
  'amb.surf': loop(),
  'amb.glacier': loop(),
  'amb.forest': loop(),
  'amb.steppe': loop(),
  'amb.town': loop(0.8),
} satisfies Record<string, SampleDef>;

export type SampleId = keyof typeof SAMPLE_BANK;

export function sampleDef(id: SampleId): SampleDef {
  return SAMPLE_BANK[id];
}

/** The procedural sounds a sample takes over once loaded (the rest stay synthesised). */
export const SFX_SAMPLE: Partial<Record<SfxId, SampleId>> = {
  clash: 'hit.metal', clashHeavy: 'hit.metal', clashSpear: 'hit.spear', block: 'hit.wood', thud: 'hit.heavy',
  death: 'death.man', woundedCry: 'cry.wounded', bossSlain: 'sting.boss',
  click: 'ui.click', panelOpen: 'ui.open', radialOpen: 'ui.open', panelClose: 'ui.close', radialClose: 'ui.close',
  error: 'ui.error', nope: 'ui.error', coin: 'ui.coin', levelUp: 'ui.reward', warning: 'world.raidHorn',
};

const BEAST_RE = new RegExp(`^mob_(?:moor_|savanna_)?(${BEASTS.join('|')})(?:_|$)`);

/** The beast behind a unit class (`mob_wolf`, `mob_moor_bear`, a chief's `mob_lion_chief`), or null (men, bandits). */
export function beastOf(cls: string): Beast | null {
  const m = BEAST_RE.exec(cls);
  return m ? (m[1] as Beast) : null;
}

/** A beast kind (MobKind) string as a Beast, or null (bandits, unknown). */
export function asBeast(kind: string): Beast | null {
  return (BEASTS as readonly string[]).includes(kind) ? (kind as Beast) : null;
}

/** Published file of variant k (1-based). */
export function sampleUrl(id: SampleId, k: number, ext: 'ogg' | 'm4a', base = 'war/sfx/'): string {
  return `${base}${id}-${k}.${ext}`;
}

/** A variant 0..n-1, never the one just played when there is a choice. */
export function pickVariant(n: number, last: number | undefined, r: AudioRng): number {
  if (n <= 1) return 0;
  if (last === undefined || last < 0 || last >= n) return r.int(n);
  const k = r.int(n - 1);
  return k >= last ? k + 1 : k;
}

/** Playback rate for a pitch jitter of ±`cents` (1: none). */
export function pitchRate(cents: number, r: AudioRng): number {
  if (cents <= 0) return 1;
  return Math.pow(2, ((r.next() * 2 - 1) * cents) / 1200);
}

/**
 * Starts per id over a sliding second (crowded fights): a 300-man melee asks for dozens of `hit.metal` a second; past
 * `rate` of them the rest are dropped (the melee din bed carries the press). Pure: tests drive `now` themselves.
 */
export class SampleThrottle {
  private starts = new Map<string, number[]>();

  /** May `id` start at `now` (s) under `rate` per second (0: always)? Records the start when it may. */
  admit(id: string, rate: number, now: number): boolean {
    if (rate <= 0) return true;
    const win = Math.max(1, 1 / rate);
    const cap = Math.max(1, Math.round(rate * win));
    let a = this.starts.get(id);
    if (!a) this.starts.set(id, (a = []));
    while (a.length && a[0] <= now - win) a.shift();
    if (a.length >= cap) return false;
    a.push(now);
    return true;
  }
}
