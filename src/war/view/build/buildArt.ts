/**
 * Building art (ART-B, public/war/buildings/objects.json) for the build view, loaded on demand: absent or broken
 * art leaves the placeholders of ./buildingLayer.ts. Sprites are matched by sim building type + state; wall pieces
 * use the wall kits (one sheet per state, 16 frames by neighbour mask).
 * Placement (art note): `tileOrigin` is the PNG pixel of the top vertex of the footprint's north tile.
 */
import type Phaser from 'phaser';
import type { BuildingType, BuildState } from '../../types';

interface ArtObj { id: string; building: string; state: string; file: string; w: number; h: number; tileOrigin: { x: number; y: number }; footprint: [number, number] }
interface ArtKit { id: string; kind: string; frames: number; frame: { w: number; h: number }; tileOrigin: { x: number; y: number }; states: Record<string, string> }
interface ArtJson { buildings: { id: string; states: Record<string, string> }[]; objects: ArtObj[]; kits: ArtKit[] }

/** A sprite ready to draw: texture key, and the footprint it was drawn for. */
export interface BuildSprite { key: string; tileOrigin: { x: number; y: number }; fw: number; fh: number }
export interface KitSprite { key: string; tileOrigin: { x: number; y: number } }

/** Art ids per sim type (gates pick their axis: -x when the line runs along x). */
const ART_ID: Partial<Record<BuildingType, string>> = {
  camp: 'camp', storehouse: 'storehouse', outpost: 'outpost', fort: 'fort', barracks: 'barracks', farm: 'farm', olivePress: 'olive-press',
  woodTower: 'wood-tower', stoneTower: 'stone-tower', woodGate: 'wood-gate', stoneGate: 'stone-gate',
};
const KIT_ID: Partial<Record<BuildingType, string>> = { palisade: 'palisade', stoneWall: 'stone-wall' };

export class BuildArt {
  private sprites = new Map<string, BuildSprite>(); // `${artId}/${state}`
  private kits = new Map<string, KitSprite>(); // `${kitId}/${state}`

  /** Fetch the art and add its textures; null if there is none. */
  static async load(scene: Phaser.Scene, base = 'war/buildings/'): Promise<BuildArt | null> {
    try {
      const r = await fetch(base + 'objects.json');
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null;
      const j = (await r.json()) as ArtJson;
      const img = (file: string) => { const im = new Image(); im.src = base + file; return im.decode().then(() => im); };
      const art = new BuildArt();
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

  /** The sprite for a building in a state ('destroyed' has none), gates by line axis. */
  sprite(type: BuildingType, state: BuildState, axis: 'x' | 'y'): BuildSprite | undefined {
    let id = ART_ID[type];
    if (!id || state === 'destroyed') return undefined;
    if (type === 'woodGate' || type === 'stoneGate') id += '-' + axis;
    return this.sprites.get(`${id}/${state}`) ?? this.sprites.get(`${id}/done`);
  }

  /** The wall kit sheet for a wall segment type in a state. */
  kit(type: BuildingType, state: BuildState): KitSprite | undefined {
    const id = KIT_ID[type];
    return id && state !== 'destroyed' ? this.kits.get(`${id}/${state}`) : undefined;
  }
}
