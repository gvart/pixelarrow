/**
 * W-66 shades: the dead who walk the Tunnel of Shades' line (public/war/shades/, PixelLab art). Each is one sheet,
 * a row per facing (manifest `rows`, south-west first: the way the line walks), `frames` walk frames per row.
 * loadShades(scene) adds the textures (`shade-<id>`) and the looping walk anims (`shade-<id>-walk-<sw|se>`); the
 * sprites are pale and partly see-through already, draw them at `scale` with origin (`originX`, `originY`) on the feet.
 * Not wired into play here: the tunnel layer consumes it. previewShades lines them all up for a look (dev only).
 */
import Phaser from 'phaser';

export interface ShadeDef {
  id: string;
  /** File in public/war/shades/. */
  sheet: string;
  frameW: number; frameH: number;
  /** Walk frames per row. */
  frames: number;
  fps: number;
  /** Facing per sheet row, top to bottom ('south-west', 'south-east'). */
  rows: string[];
  /** The feet in the frame, as a share of its size. */
  originX: number; originY: number;
  /** Draw scale (1: a soldier's height at zoom 1). */
  scale: number;
}

/** Every shade, in manifest order. */
export const SHADE_IDS = [
  'hoplite', 'archer', 'elder', 'woman', 'boy', 'priest', 'sailor', 'peltast', 'king', 'miner', 'shepherd', 'smith', 'bard', 'mourner', 'philosopher',
] as const;
export type ShadeId = (typeof SHADE_IDS)[number];

const BASE = 'war/shades/';
const DIR: Record<string, string> = { 'south-west': 'sw', 'south-east': 'se', 'north-west': 'nw', 'north-east': 'ne' };
let defs: Map<string, ShadeDef> | null = null;

/** The walk anim key of a shade facing `dir` ('sw' or 'se'). */
export const shadeAnim = (id: string, dir: 'sw' | 'se' = 'sw'): string => `shade-${id}-walk-${dir}`;
/** A loaded shade's manifest entry (origin, scale), undefined before loadShades. */
export const shadeDef = (id: string): ShadeDef | undefined => defs?.get(id);

/** Load the manifest and every sheet, then make the walk anims. Safe to call again (loads once per scene). */
export async function loadShades(scene: Phaser.Scene): Promise<void> {
  const list = (await (await fetch(BASE + 'manifest.json')).json()) as ShadeDef[];
  defs = new Map(list.map((d) => [d.id, d]));
  const want = list.filter((d) => !scene.textures.exists(`shade-${d.id}`));
  if (want.length) {
    for (const d of want) scene.load.spritesheet(`shade-${d.id}`, BASE + d.sheet, { frameWidth: d.frameW, frameHeight: d.frameH });
    await new Promise<void>((ok) => {
      scene.load.once(Phaser.Loader.Events.COMPLETE, () => ok());
      scene.load.start();
    });
  }
  for (const d of list) {
    scene.textures.get(`shade-${d.id}`).setFilter(Phaser.Textures.FilterMode.NEAREST);
    d.rows.forEach((row, r) => {
      const key = `shade-${d.id}-walk-${DIR[row] ?? row}`;
      if (scene.anims.exists(key)) return;
      scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(`shade-${d.id}`, { start: r * d.frames, end: r * d.frames + d.frames - 1 }), frameRate: d.fps, repeat: -1 });
    });
  }
}

/** What previewShades needs of the sandbox scene (./SandboxScene.ts). */
interface PreviewScene extends Phaser.Scene {
  iso: { sx(x: number, y: number): number; sy(x: number, y: number, z: number): number; zAt(x: number, y: number): number };
  focus(x: number, y: number, zoom: number): void;
}

/**
 * Dev look (scripts, the console): the tunnel art on a 3 x 3 footprint whose north tile is (tx, ty), and every shade
 * walking its line out of the mouth (+y, south-west on screen), one behind the other, looping.
 */
export async function previewShades(scene: PreviewScene, tx: number, ty: number): Promise<void> {
  await loadShades(scene);
  const iso = scene.iso, at = (x: number, y: number) => ({ x: iso.sx(x, y), y: iso.sy(x, y, iso.zAt(x, y)) });
  if (!scene.textures.exists('bld-tunnel-of-shades-done')) {
    scene.load.image('bld-tunnel-of-shades-done', 'war/buildings/tunnel-of-shades.png');
    await new Promise<void>((ok) => { scene.load.once(Phaser.Loader.Events.COMPLETE, () => ok()); scene.load.start(); });
  }
  // objects.json: tileOrigin (96, 92) is the top vertex of the north tile
  const top = at(tx, ty), tun = scene.add.image(top.x, top.y, 'bld-tunnel-of-shades-done').setOrigin(96 / 192, 92 / 200);
  tun.setDepth(10 + (tx + ty + 4) / 4096);
  // the line: from the mouth (middle of the +y face) outward along +y
  const mx = tx + 1.5, my = ty + 3;
  SHADE_IDS.forEach((id, i) => {
    const d = defs!.get(id);
    if (!d) return;
    const p = at(mx, my + 0.9 * i);
    const s = scene.add.sprite(p.x, p.y, `shade-${id}`).setOrigin(d.originX, d.originY).setScale(d.scale).setDepth(10 + (mx + my + 0.9 * i) / 4096 + 0.24);
    s.play({ key: shadeAnim(id, 'sw'), startFrame: i % d.frames });
  });
  scene.focus(mx, my + 5, 1);
}
