/**
 * The biome loops (./bank.ts LOOPS) as pure logic: which loops a place wants and how loud, and the crossfade between
 * them. The player (./samples.ts) only turns `Crossfade.gains()` into Web Audio gains.
 *
 *  - `loopTargets`: the region's biome (src/war/world/regions.ts `biome`) picks its ground loop, the moors' heath
 *    tiles and a town nearby add theirs; water near the camera brings the surf in on any coast.
 *  - `Crossfade`: every loop's level glides to its target at 1/`fade` per second, and the gain is equal-power
 *    (sin of the level), so one loop fading out while another fades in holds the bed's loudness steady.
 *  - `procCover`: the procedural beds (./ambience.ts) a loaded loop stands in for, so the two never double up.
 */
import type { AmbLayer } from './ambience';
import { LOOPS, type LoopId } from './bank';

export type LoopLevels = Partial<Record<LoopId, number>>;

/** The ground loop of a region biome (src/war/world/regions.ts). */
const GROUND: Record<string, LoopId> = {
  mountains: 'amb.glacier', coast: 'amb.surf', dodona: 'amb.forest', elaia: 'amb.forest', marsh: 'amb.forest',
  skythia: 'amb.steppe', plateau: 'amb.steppe', kyrene: 'amb.steppe',
};

/** What lies round the camera, as shares 0..1 (the war's ambience sample). */
export interface LoopPlace {
  /** The region's biome (WORLD_REGIONS). */
  biome?: string;
  /** Share of the moors' heath tiles. */
  moors: number;
  /** Deep and shallow water shares. */
  water: number;
  /** Built-up share (0..1, as the war's sample: buildings / 40). */
  built: number;
  /** Zoomed out (0..1): high up, the ground loop thins. */
  high: number;
}

/** The loops this place wants, 0..1 each (missing: silent). */
export function loopTargets(p: LoopPlace): LoopLevels {
  const out: LoopLevels = {};
  const add = (id: LoopId, v: number) => {
    v = Math.max(0, Math.min(1, v));
    if (v >= 0.03) out[id] = Math.max(out[id] ?? 0, v);
  };
  const moors = Math.min(1, p.moors * 1.4);
  const ground = p.biome ? GROUND[p.biome] : undefined;
  if (ground) add(ground, (1 - moors) * (ground === 'amb.surf' ? 0.6 + 0.4 * Math.min(1, p.water * 3) : 0.8));
  add('amb.moors', moors * 0.9);
  if (ground !== 'amb.surf' && p.water > 0.25) add('amb.surf', Math.min(1, p.water));
  add('amb.town', Math.min(1, p.built * 3) * (1 - p.high * 0.5));
  return out;
}

/** The procedural layers a loaded loop replaces. */
export const PROC_COVER: Record<LoopId, AmbLayer[]> = {
  'amb.moors': ['wind', 'gale'],
  'amb.surf': ['sea'],
  'amb.glacier': ['gale', 'wind'],
  'amb.forest': ['birds'],
  'amb.steppe': ['wind', 'desert'],
  'amb.town': ['murmur'],
};

/** The procedural levels with what the loaded loops stand in for taken out (scaled by how loud the loop is). */
export function procCover<T extends Partial<Record<AmbLayer, number>>>(proc: T, loops: LoopLevels, loaded: (id: LoopId) => boolean): T {
  const out = { ...proc };
  for (const id of LOOPS) {
    const v = loops[id] ?? 0;
    if (v <= 0 || !loaded(id)) continue;
    for (const l of PROC_COVER[id]) if (out[l] !== undefined) (out as Record<string, number>)[l] = (out[l] as number) * (1 - v);
  }
  for (const k of Object.keys(out)) if (((out as Record<string, number>)[k] ?? 0) < 0.03) delete (out as Record<string, number>)[k];
  return out;
}

/** Levels gliding to targets, equal-power gains. */
export class Crossfade {
  private level = new Map<LoopId, number>();
  private target: LoopLevels = {};

  /** `fade`: seconds for a full 0 -> 1 (or 1 -> 0) swing. */
  constructor(private readonly fade = 4) {}

  set(t: LoopLevels): void {
    this.target = t;
  }

  /** Advance `dt` seconds. */
  step(dt: number): void {
    const d = dt / Math.max(0.001, this.fade);
    const ids = new Set<LoopId>([...this.level.keys(), ...(Object.keys(this.target) as LoopId[])]);
    for (const id of ids) {
      const cur = this.level.get(id) ?? 0, want = this.target[id] ?? 0;
      const next = cur < want ? Math.min(want, cur + d) : Math.max(want, cur - d);
      if (next <= 0 && want <= 0) this.level.delete(id);
      else this.level.set(id, next);
    }
  }

  /** The level 0..1 of a loop now. */
  levelOf(id: LoopId): number {
    return this.level.get(id) ?? 0;
  }

  /** Gains now (equal power), for every loop still sounding. */
  gains(): LoopLevels {
    const g: LoopLevels = {};
    for (const [id, v] of this.level) g[id] = Math.sin((v * Math.PI) / 2);
    return g;
  }
}
