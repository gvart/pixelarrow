/**
 * Building art (ART-B, public/war/buildings/objects.json) for the build view, loaded on demand: absent or broken
 * art leaves the placeholders of ./buildingLayer.ts. Sprites are matched by sim building type + art stage; wall
 * pieces, towers, stairs and ladders use the kits (one sheet per state, frames by neighbour mask or piece).
 * Placement (art note): `tileOrigin` is the PNG pixel of the top vertex of the footprint's north tile (a kit: of the
 * frame's NW tile). Layered kits (rampart, stone wall, towers, W-28) have a back sheet and a front sheet per state:
 * draw back, then the units on the walk (walkwayPx / platformPx above the ground), then front.
 * Construction stages: `buildOrder` (e.g. foundation, rising, scaffold, done) with `progress` thresholds (share of
 * labour done from which a stage shows); without them foundation / scaffold / done at 0 / 0.5 / 1.
 */
import type Phaser from 'phaser';
import type { BuildingType, BuildState } from '../../types';

interface ArtObj { id: string; building: string; state: string; file: string; w: number; h: number; tileOrigin: { x: number; y: number }; footprint: [number, number] }
interface ArtKit {
  id: string; kind: string; frames: number; columns?: number; frame: { w: number; h: number }; tileOrigin: { x: number; y: number };
  states: Record<string, string>; front?: Record<string, string>; layered?: boolean; frameOf?: number[] | string; post?: string;
  heightM?: number; walkwayPx?: number; platformPx?: number; topPx?: number; topM?: number | Record<string, number>; pieces?: string[];
}
interface ArtJson { buildings: { id: string; states: Record<string, string> }[]; objects: ArtObj[]; kits: ArtKit[]; buildOrder?: string[]; progress?: Record<string, number>; pxPerMetre?: number }

/** A sprite ready to draw: texture key, and the footprint it was drawn for. */
export interface BuildSprite { key: string; tileOrigin: { x: number; y: number }; fw: number; fh: number }
/** A kit sheet at one stage: back (and front, layered) texture keys with frames. */
export interface KitSprite { key: string; front?: string; tileOrigin: { x: number; y: number } }
/** Per kit, stage free: layering and heights (px above the ground at zoom 1). */
export interface KitMeta {
  id: string; kind: string; layered: boolean; frameOf: number[] | null; pieces: string[];
  /** Walkway (wall), platform (tower) or top (stair) height in px; 0 none. */
  walkPx: number;
  /** Whole height in px (silhouettes behind it). */
  heightPx: number;
  /** Layered walls: the inner-corner parapet post (one frame, as the kit's), texture key. */
  post?: string;
}

/** Art ids per sim type (gates pick their axis: -x when the line runs along x). */
const ART_ID: Partial<Record<BuildingType, string>> = {
  camp: 'camp', storehouse: 'storehouse', outpost: 'outpost', fort: 'fort', barracks: 'barracks', farm: 'farm', olivePress: 'olive-press',
  woodTower: 'wood-tower', stoneTower: 'stone-tower', woodGate: 'wood-gate', stoneGate: 'stone-gate',
};
/** Kit ids per sim type. */
export const KIT_ID: Partial<Record<BuildingType, string>> = {
  palisade: 'palisade', rampart: 'rampart', stoneWall: 'stone-wall', woodTower: 'tower-wood', stoneTower: 'tower-stone',
  woodStairs: 'stair-wood', stoneStairs: 'stair-stone', ladder: 'ladder',
};
const FALLBACK_STAGES: [string, number][] = [['foundation', 0], ['scaffold', 0.5], ['done', 1]];

export class BuildArt {
  private sprites = new Map<string, BuildSprite>(); // `${artId}/${state}`
  private kits = new Map<string, KitSprite>(); // `${kitId}/${state}`
  private metas = new Map<string, KitMeta>();
  /** Ladder top (px above the ground) by target kit id. */
  ladderTop: Record<string, number> = {};
  /** Construction stages, by rising threshold. */
  private stages: [string, number][] = FALLBACK_STAGES;

  /** Fetch the art and add its textures; null if there is none. */
  static async load(scene: Phaser.Scene, base = 'war/buildings/'): Promise<BuildArt | null> {
    try {
      const r = await fetch(base + 'objects.json');
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null;
      const j = (await r.json()) as ArtJson;
      // load events, not decode(): decoding ~200 images at once can reject spuriously
      const img = (file: string) => new Promise<HTMLImageElement>((ok, fail) => {
        const im = new Image();
        im.onload = () => ok(im);
        im.onerror = () => fail(new Error(`${file} failed to load`));
        im.src = base + file;
      });
      const art = new BuildArt(), ppm = j.pxPerMetre ?? 33;
      if (j.buildOrder?.length && j.progress) {
        const p = j.progress;
        art.stages = j.buildOrder.filter((s) => typeof p[s] === 'number').map((s): [string, number] => [s, p[s]]).sort((a, b) => a[1] - b[1]);
      }
      const sheet = async (key: string, file: string, k: ArtKit) => {
        if (!scene.textures.exists(key)) scene.textures.addSpriteSheet(key, await img(file), { frameWidth: k.frame.w, frameHeight: k.frame.h });
      };
      const kits = j.kits.filter((k) => k.kind !== 'bridge');
      for (const k of kits) {
        art.metas.set(k.id, {
          id: k.id, kind: k.kind, layered: !!k.layered, frameOf: Array.isArray(k.frameOf) ? k.frameOf : null, pieces: k.pieces ?? [],
          walkPx: k.walkwayPx ?? k.platformPx ?? k.topPx ?? 0, heightPx: Math.round((k.heightM ?? 0) * ppm), post: k.post ? `kit-${k.id}-post` : undefined,
        });
        if (k.kind === 'ladder' && k.topM && typeof k.topM === 'object') for (const [t, m] of Object.entries(k.topM)) art.ladderTop[t] = Math.round(m * ppm);
      }
      await Promise.all([
        ...j.objects.map(async (o) => {
          const key = `bld-${o.id}`;
          if (!scene.textures.exists(key)) scene.textures.addImage(key, await img(o.file));
          art.sprites.set(`${o.building}/${o.state}`, { key, tileOrigin: o.tileOrigin, fw: o.footprint[0], fh: o.footprint[1] });
        }),
        ...kits.filter((k) => k.post).map((k) => sheet(`kit-${k.id}-post`, k.post!, k)),
        ...kits.flatMap((k) => Object.entries(k.states).map(async ([state, file]) => {
          const key = `kit-${k.id}-${state}`, fkey = k.front?.[state] ? `${key}-front` : undefined;
          await Promise.all([sheet(key, file, k), ...(fkey ? [sheet(fkey, k.front![state], k)] : [])]);
          art.kits.set(`${k.id}/${state}`, { key, front: fkey, tileOrigin: k.tileOrigin });
        })),
      ]);
      return art;
    } catch (e) {
      console.warn('[build art]', e);
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

  /** The labour share from which a construction stage shows (1 when unknown). */
  threshold(stage: string): number {
    return this.stages.find(([s]) => s === stage)?.[1] ?? 1;
  }

  /**
   * The sprite for a building at an art stage ('destroyed' has none), gates by line axis (deep: the 2-deep variant with
   * its passage on that side, n e s w); falls back to earlier stages.
   */
  sprite(type: BuildingType, stage: string, axis: 'x' | 'y', deep?: string): BuildSprite | undefined {
    let id = ART_ID[type];
    if (!id || stage === 'destroyed') return undefined;
    if (type === 'woodGate' || type === 'stoneGate') id += '-' + axis + (deep ? '-deep-' + deep : '');
    return this.sprites.get(`${id}/${stage}`) ?? this.earlier(stage, (s) => this.sprites.get(`${id}/${s}`)) ?? this.sprites.get(`${id}/done`);
  }

  /** The kit sheet for a sim type at an art stage. */
  kit(type: BuildingType, stage: string): KitSprite | undefined {
    const id = KIT_ID[type];
    if (!id || stage === 'destroyed') return undefined;
    return this.kits.get(`${id}/${stage}`) ?? this.earlier(stage, (s) => this.kits.get(`${id}/${s}`)) ?? this.kits.get(`${id}/done`);
  }

  /** Stage-free kit data for a sim type. */
  meta(type: BuildingType): KitMeta | undefined {
    const id = KIT_ID[type];
    return id ? this.metas.get(id) : undefined;
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
