/**
 * Building art (ART-B, public/war/buildings/objects.json) for the build view, loaded on demand: absent or broken
 * art leaves the placeholders of ./buildingLayer.ts. Sprites are matched by sim building type + art stage; wall
 * pieces use the wall kits (one sheet per state, 16 frames by neighbour mask).
 * Placement (art note): `tileOrigin` is the PNG pixel of the top vertex of the footprint's north tile.
 * Construction stages: `buildOrder` (e.g. foundation, rising, scaffold, done) with `progress` thresholds (share of
 * labour done from which a stage shows); without them foundation / scaffold / done at 0 / 0.5 / 1.
 */
import type Phaser from 'phaser';
import type { BuildingType, BuildState } from '../../types';

interface ArtObj { id: string; building: string; state: string; file: string; w: number; h: number; tileOrigin: { x: number; y: number }; footprint: [number, number] }
interface ArtKit { id: string; kind: string; frames: number; frame: { w: number; h: number }; tileOrigin: { x: number; y: number }; states: Record<string, string> }
interface ArtJson { buildings: { id: string; states: Record<string, string> }[]; objects: ArtObj[]; kits: ArtKit[]; buildOrder?: string[]; progress?: Record<string, number> }

/** A sprite ready to draw: texture key, and the footprint it was drawn for. */
export interface BuildSprite { key: string; tileOrigin: { x: number; y: number }; fw: number; fh: number }
export interface KitSprite { key: string; tileOrigin: { x: number; y: number } }

/** Art ids per sim type (gates pick their axis: -x when the line runs along x). */
const ART_ID: Partial<Record<BuildingType, string>> = {
  camp: 'camp', storehouse: 'storehouse', outpost: 'outpost', fort: 'fort', barracks: 'barracks', farm: 'farm', olivePress: 'olive-press',
  woodTower: 'wood-tower', stoneTower: 'stone-tower', woodGate: 'wood-gate', stoneGate: 'stone-gate',
};
const KIT_ID: Partial<Record<BuildingType, string>> = { palisade: 'palisade', stoneWall: 'stone-wall' };
const FALLBACK_STAGES: [string, number][] = [['foundation', 0], ['scaffold', 0.5], ['done', 1]];

export class BuildArt {
  private sprites = new Map<string, BuildSprite>(); // `${artId}/${state}`
  private kits = new Map<string, KitSprite>(); // `${kitId}/${state}`
  /** Construction stages, by rising threshold. */
  private stages: [string, number][] = FALLBACK_STAGES;

  /** Fetch the art and add its textures; null if there is none. */
  static async load(scene: Phaser.Scene, base = 'war/buildings/'): Promise<BuildArt | null> {
    try {
      const r = await fetch(base + 'objects.json');
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null;
      const j = (await r.json()) as ArtJson;
      const img = (file: string) => { const im = new Image(); im.src = base + file; return im.decode().then(() => im); };
      const art = new BuildArt();
      if (j.buildOrder?.length && j.progress) {
        const p = j.progress;
        art.stages = j.buildOrder.filter((s) => typeof p[s] === 'number').map((s): [string, number] => [s, p[s]]).sort((a, b) => a[1] - b[1]);
      }
      await Promise.all([
        ...j.objects.map(async (o) => {
          const key = `bld-${o.id}`;
          if (!scene.textures.exists(key)) scene.textures.addImage(key, await img(o.file));
          art.sprites.set(`${o.building}/${o.state}`, { key, tileOrigin: o.tileOrigin, fw: o.footprint[0], fh: o.footprint[1] });
        }),
        ...j.kits.filter((k) => k.kind === 'wall').flatMap((k) => Object.entries(k.states).map(async ([state, file]) => {
          const key = `kit-${k.id}-${state}`;
          if (!scene.textures.exists(key)) {
            const t = scene.textures.addSpriteSheet(key, await img(file), { frameWidth: k.frame.w, frameHeight: k.frame.h });
            if (!t) return;
          }
          art.kits.set(`${k.id}/${state}`, { key, tileOrigin: k.tileOrigin });
        })),
      ]);
      return art;
    } catch {
      return null;
    }
  }

  /**
   * The art stage for a sim state: under construction (foundation / scaffold) the last stage whose threshold the
   * labour reached (never done before it is done); otherwise the state itself.
   */
  stage(state: BuildState, progress: number): string {
    if (state !== 'foundation' && state !== 'scaffold') return state;
    let s = this.stages[0]?.[0] ?? 'foundation';
    for (const [name, at] of this.stages) if (name !== 'done' && progress >= at) s = name;
    return s;
  }

  /** The sprite for a building at an art stage ('destroyed' has none), gates by line axis; falls back to earlier stages. */
  sprite(type: BuildingType, stage: string, axis: 'x' | 'y'): BuildSprite | undefined {
    let id = ART_ID[type];
    if (!id || stage === 'destroyed') return undefined;
    if (type === 'woodGate' || type === 'stoneGate') id += '-' + axis;
    return this.sprites.get(`${id}/${stage}`) ?? this.earlier(stage, (s) => this.sprites.get(`${id}/${s}`)) ?? this.sprites.get(`${id}/done`);
  }

  /** The wall kit sheet for a wall segment type at an art stage. */
  kit(type: BuildingType, stage: string): KitSprite | undefined {
    const id = KIT_ID[type];
    if (!id || stage === 'destroyed') return undefined;
    return this.kits.get(`${id}/${stage}`) ?? this.earlier(stage, (s) => this.kits.get(`${id}/${s}`));
  }

  /** The nearest earlier construction stage that has art. */
  private earlier<T>(stage: string, get: (s: string) => T | undefined): T | undefined {
    const i = this.stages.findIndex(([s]) => s === stage);
    for (let k = i - 1; k >= 0; k--) {
      const v = get(this.stages[k][0]);
      if (v) return v;
    }
    return undefined;
  }
}
