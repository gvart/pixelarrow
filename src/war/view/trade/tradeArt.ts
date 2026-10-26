/**
 * Trade art (ART-T, public/war/trade/objects.json) for the view, loaded on demand: carts per facing (halted, the moving
 * wheel strip, burning, wrecked, burnt) with cargo overlays by kind and fill, the wagon's mule team, chests, strongboxes
 * and loot piles. Single sprites by id (`tr-<id>`, drawn at a footprint's north tile top vertex minus tileOrigin), strips
 * as sprite sheets; the safe-zone badge from the UI kit (`tr-badge-safe`). Absent art: ./tradeLayer.ts draws greybox marks.
 */
import type Phaser from 'phaser';

export type Facing = 'e' | 's' | 'w' | 'n';
export interface TradeSprite { key: string; tileOrigin: { x: number; y: number }; w: number; h: number }
export interface TradeStrip extends TradeSprite { frames: number; fps: number }
export interface CartJson {
  id: 'handcart' | 'wagon'; footprint: Record<Facing, [number, number]>;
  states: Record<Facing, Record<string, string>>; cargo: Record<Facing, Record<string, string>>;
  moving: Record<Facing, { file: string; frames: number; fps: number; frame: { w: number; h: number }; tileOrigin: { x: number; y: number } }>;
  team?: Record<Facing, [number, number][]>;
  /** Where its crew walk (tile offsets from the footprint NW corner): a handcart's two pullers at the shafts, a wagon's driver. */
  crew?: Record<Facing, [number, number][]>;
  fx?: Record<Facing, Record<string, { id: string; at: { x: number; y: number }; alpha?: number }[]>>;
}
interface MuleJson { file: string; frame: { w: number; h: number }; rows: string[]; anims: Record<string, { col: number; frames: number; fps?: number }>; anchors: Record<string, { x: number; y: number }>; facingRow: Record<Facing, string>; scale?: number }
interface Json {
  objects: { id: string; file: string; w: number; h: number; tileOrigin: { x: number; y: number } }[];
  carts: CartJson[];
  mules: MuleJson;
}

export class TradeArt {
  readonly sprites = new Map<string, TradeSprite>();
  readonly strips = new Map<string, TradeStrip>();
  readonly carts = new Map<string, CartJson>();
  mules!: MuleJson;
  badge = false;

  static async load(scene: Phaser.Scene, base = 'war/trade/'): Promise<TradeArt | null> {
    try {
      const r = await fetch(base + 'objects.json');
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null;
      const j = (await r.json()) as Json, a = new TradeArt();
      const img = (src: string) => new Promise<HTMLImageElement>((ok, fail) => {
        const im = new Image();
        im.onload = () => ok(im);
        im.onerror = () => fail(new Error(`${src} failed to load`));
        im.src = src;
      });
      const jobs: Promise<unknown>[] = [];
      for (const o of j.objects) {
        const key = `tr-${o.id}`;
        a.sprites.set(o.id, { key, tileOrigin: o.tileOrigin, w: o.w, h: o.h });
        jobs.push((async () => { if (!scene.textures.exists(key)) scene.textures.addImage(key, await img(base + o.file)); })());
      }
      for (const c of j.carts) {
        a.carts.set(c.id, c);
        for (const [f, s] of Object.entries(c.moving)) {
          const key = `tr-${c.id}-${f}-moving`;
          a.strips.set(key, { key, frames: s.frames, fps: s.fps, tileOrigin: s.tileOrigin, w: s.frame.w, h: s.frame.h });
          jobs.push((async () => { if (!scene.textures.exists(key)) scene.textures.addSpriteSheet(key, await img(base + s.file), { frameWidth: s.frame.w, frameHeight: s.frame.h }); })());
        }
      }
      a.mules = j.mules;
      jobs.push((async () => { if (!scene.textures.exists('tr-mule')) scene.textures.addSpriteSheet('tr-mule', await img(base + j.mules.file), { frameWidth: j.mules.frame.w, frameHeight: j.mules.frame.h }); })());
      jobs.push((async () => {
        if (!scene.textures.exists('tr-badge-safe')) scene.textures.addImage('tr-badge-safe', await img('war/ui/icons/32/badge-safe-zone.png'));
        a.badge = true;
      })().catch(() => undefined));
      await Promise.all(jobs);
      return a;
    } catch (e) {
      console.warn('[trade art]', e);
      return null;
    }
  }
}
