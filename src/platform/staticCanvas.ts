/**
 * `textures.addCanvas` without the pixel readback (QA-05, docs/v5/qa/PERF.md).
 *
 * Phaser 3's addCanvas wraps the canvas in a CanvasTexture, whose constructor reads the whole
 * canvas back (`getImageData`) and keeps typed views of it for getPixel/putData. Every
 * procedural texture of the game goes through addCanvas (fonts, every icon in three looks,
 * panels, sprites: about 1,000 at boot) and none of them is ever read or redrawn through the
 * CanvasTexture API: live atlases are made with `createCanvas` (src/ui/sprites.ts), which keeps
 * the CanvasTexture. The readback was the largest single cost of the boot (about 0.7 s of
 * registerUiAssets at 4x CPU throttle).
 *
 * installStaticCanvases() makes addCanvas register a plain Texture over the same canvas, with
 * the same `__BASE` frame, the same events, the same skipCache behaviour; WebGL uploads it the
 * same way (a canvas source), and a lost context restores it from the canvas as before.
 * Canvases from Phaser's CanvasPool keep the CanvasTexture: `createCanvas` (our live atlases),
 * Text and TileSprite make theirs there and use the CanvasTexture API on them.
 */
import type Phaser from 'phaser';

let installed = false;

interface Deps {
  TextureManager: { prototype: Phaser.Textures.TextureManager };
  /** Phaser.Display.Canvas.CanvasPool: its `pool` lists the canvases Phaser made itself. */
  CanvasPool: { pool: { canvas: HTMLCanvasElement }[] };
  Texture: new (manager: Phaser.Textures.TextureManager, key: string, source: HTMLCanvasElement, width: number, height: number) => Phaser.Textures.Texture;
  Events: { ADD: string; ADD_KEY: string };
}

/** Patch TextureManager#addCanvas (Phaser's classes passed in, so the module loads without Phaser), once. */
export function installStaticCanvases({ TextureManager, CanvasPool, Texture, Events }: Deps): void {
  if (installed) return;
  installed = true;
  const proto = TextureManager.prototype as Phaser.Textures.TextureManager & { checkKey(key: string): boolean; list: Record<string, Phaser.Textures.Texture> };
  const original = proto.addCanvas;
  proto.addCanvas = function (this: typeof proto, key: string, source: HTMLCanvasElement, skipCache = false) {
    if (CanvasPool.pool.some((p) => p.canvas === source)) return original.call(this, key, source, skipCache);
    let texture: Phaser.Textures.Texture | null = null;
    if (skipCache) texture = new Texture(this, key, source, source.width, source.height);
    else if (this.checkKey(key)) {
      texture = new Texture(this, key, source, source.width, source.height);
      this.list[key] = texture;
    }
    if (!texture) return null;
    texture.add('__BASE', 0, 0, 0, source.width, source.height);
    if (!skipCache) {
      this.emit(Events.ADD, key, texture);
      this.emit(Events.ADD_KEY + key, texture);
    }
    // callers only use the Texture API (setFilter, frames); the type stays Phaser's
    return texture as Phaser.Textures.CanvasTexture;
  };
}
