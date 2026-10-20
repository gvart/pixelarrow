/**
 * Siege art (W-29, public/war/siege/objects.json) for the view, loaded on demand; absent art leaves the engines as
 * placeholders (./siegeLayer.ts). Charring overlays (char[]) by kit, level and layer. Single sprites by id (`sg-<id>`, drawn at a footprint's north tile top vertex minus
 * tileOrigin), horizontal strips (ram swing, thrower throw, oxybeles shoot, tower bridge, ladder push-off, fx loops) as sprite sheets;
 * the bolt projectile as an 8-direction sheet (`sg-proj-bolt`).
 */
import type Phaser from 'phaser';
import type { SiegeType } from '../../types';

/** Art engine id per sim siege type. */
const ENGINE_ART: Record<SiegeType, string> = { ram: 'ram', stoneThrower: 'thrower', siegeLadder: '', mantlet: 'mantlet', coveredRam: 'covered-ram', oxybeles: 'oxybeles', siegeTower: 'siege-tower' };

export interface SiegeSprite { key: string; tileOrigin: { x: number; y: number }; footprint: [number, number]; w: number; h: number }
export interface Strip { key: string; frames: number; fps: number; tileOrigin: { x: number; y: number }; w: number; h: number; hitFrame?: number; releaseFrame?: number }
type Level = 'low' | 'medium' | 'high';
export interface Fx {
  key: string; frames: number; fps: number; anchor: { x: number; y: number }; w: number; h: number;
  /** 'add': blended additively (glow, embers). */
  blend?: 'normal' | 'add';
  /** Alpha per fire intensity. */
  alpha?: Partial<Record<Level, number>>;
  /** Count per burning wall tile per intensity (tongues: per shape). */
  density?: { perTile: Partial<Record<Level | 'dying', number>> };
}
type Facing = 'e' | 's' | 'w' | 'n';
interface EngineJson {
  id: string; layered: boolean; footprint: Record<Facing, [number, number]>; crew?: Record<Facing, [number, number][]>;
  states: Record<Facing, Record<string, string>>; front?: Record<Facing, Record<string, string>>;
  anims: Record<Facing, Record<string, { file: string; frames: number; fps: number; frame: { w: number; h: number }; tileOrigin: { x: number; y: number }; hitFrame?: number; releaseFrame?: number }>>;
  release?: Record<Facing, { x: number; y: number; zM: number }>;
  /** Height of the frame (m; fire reaches up it). M5h3 siege tower: the drawbridge's hinge height (m). */
  heightM?: number; bridgeM?: number;
}
interface Json {
  pxPerMetre: number; engines: EngineJson[];
  ladders: {
    targets: Record<string, { walkPx: number; topM: number; footM: number }>; pieces: Record<string, string>;
    carry: Record<string, { sprite: string; footprint: [number, number]; carryPx: number; bearers: [number, number][] }>;
    pushOff: Record<string, { file: string; frames: number; fps: number; frame: { w: number; h: number }; tileOrigin: { x: number; y: number } }>;
  };
  rubble: { id: string; wall?: string; tower?: string; axis?: string; variant?: string; footprint: [number, number]; sprite: string }[];
  fx: { id: string; file: string; frames: number; fps: number; frame: { w: number; h: number }; anchor: { x: number; y: number }; blend?: 'normal' | 'add'; alpha?: Fx['alpha']; density?: Fx['density'] }[];
  char?: { kit: string; layer: 'back' | 'front'; level: string; file: string; frame: { w: number; h: number } }[];
  objects: { id: string; file: string; w: number; h: number; tileOrigin: { x: number; y: number }; footprint: [number, number] }[];
  /** M5h3: projectile sheets (the oxybeles bolt: 8 world directions, 45 deg apart from +x towards +y). */
  projectiles?: { id: string; file?: string; frames?: number; frame?: { w: number; h: number } }[];
}

export class SiegeArt {
  ppm = 33;
  readonly sprites = new Map<string, SiegeSprite>();
  readonly strips = new Map<string, Strip>();
  readonly fx = new Map<string, Fx>();
  engines = new Map<string, EngineJson>();
  ladders!: Json['ladders'];
  rubble: Json['rubble'] = [];
  /** Charring overlays over a kit's frames: texture key by `<kit>-<scorch|charred|smoulder>-<back|front>`. */
  readonly char = new Map<string, string>();

  static async load(scene: Phaser.Scene, base = 'war/siege/'): Promise<SiegeArt | null> {
    try {
      const r = await fetch(base + 'objects.json');
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null;
      const j = (await r.json()) as Json, a = new SiegeArt();
      a.ppm = j.pxPerMetre ?? 33;
      a.ladders = j.ladders;
      a.rubble = j.rubble;
      for (const e of j.engines) a.engines.set(e.id, e);
      const img = (file: string) => new Promise<HTMLImageElement>((ok, fail) => {
        const im = new Image();
        im.onload = () => ok(im);
        im.onerror = () => fail(new Error(`${file} failed to load`));
        im.src = base + file;
      });
      const sheet = async (key: string, file: string, w: number, h: number) => {
        if (!scene.textures.exists(key)) scene.textures.addSpriteSheet(key, await img(file), { frameWidth: w, frameHeight: h });
      };
      const jobs: Promise<unknown>[] = [];
      for (const o of j.objects) {
        const key = `sg-${o.id}`;
        a.sprites.set(o.id, { key, tileOrigin: o.tileOrigin, footprint: o.footprint, w: o.w, h: o.h });
        jobs.push((async () => { if (!scene.textures.exists(key)) scene.textures.addImage(key, await img(o.file)); })());
      }
      for (const e of j.engines) for (const [f, anims] of Object.entries(e.anims)) for (const [name, s] of Object.entries(anims)) {
        const key = `sg-${e.id}-${f}-${name}`;
        a.strips.set(key, { key, frames: s.frames, fps: s.fps, tileOrigin: s.tileOrigin, w: s.frame.w, h: s.frame.h, hitFrame: s.hitFrame, releaseFrame: s.releaseFrame });
        jobs.push(sheet(key, s.file, s.frame.w, s.frame.h));
      }
      for (const [piece, s] of Object.entries(j.ladders.pushOff)) {
        const key = `sg-pushoff-${piece}`;
        a.strips.set(key, { key, frames: s.frames, fps: s.fps, tileOrigin: s.tileOrigin, w: s.frame.w, h: s.frame.h });
        jobs.push(sheet(key, s.file, s.frame.w, s.frame.h));
      }
      for (const f of j.fx) {
        const key = `sg-fx-${f.id}`;
        a.fx.set(f.id, { key, frames: f.frames, fps: f.fps, anchor: f.anchor, w: f.frame.w, h: f.frame.h, blend: f.blend, alpha: f.alpha, density: f.density });
        jobs.push(sheet(key, f.file, f.frame.w, f.frame.h));
      }
      for (const p of j.projectiles ?? []) if (p.file && p.frame) jobs.push(sheet(`sg-proj-${p.id}`, p.file, p.frame.w, p.frame.h));
      for (const c of j.char ?? []) {
        const key = `sg-char-${c.kit}-${c.level}-${c.layer}`;
        a.char.set(`${c.kit}-${c.level}-${c.layer}`, key);
        jobs.push(sheet(key, c.file, c.frame.w, c.frame.h));
      }
      await Promise.all(jobs);
      return a;
    } catch (e) {
      console.warn('[siege art]', e);
      return null;
    }
  }

  /** The engine art of a sim siege type (the siege ladder has none: ladders). */
  engine(type: SiegeType): EngineJson | undefined {
    return this.engines.get(ENGINE_ART[type]);
  }

  strip(engine: string, facing: string, name: string): Strip | undefined {
    return this.strips.get(`sg-${engine}-${facing}-${name}`);
  }
}

/** The art facing (e +x, s +y, w -x, n -y) nearest a heading in radians (tile space). */
export function facingOf(a: number): Facing {
  const k = ((Math.round(a / (Math.PI / 2)) % 4) + 4) % 4;
  return (['e', 's', 'w', 'n'] as const)[k];
}
