/**
 * One zoom anchored at the cursor, for every map (ADR-0012 Decision 5,
 * design/ux/input-v6.md §2.3): the world point under the cursor stays under
 * it. Battle, World, the War map and Camp all zoom through here; the War
 * map's own `zoomAt` became this one.
 *
 * The maths is pure (`anchoredScroll`, `anchorOffset`); `zoomCamAt` is the thin
 * Phaser shell.
 */
import type Phaser from 'phaser';
import { WheelAccumulator } from './wheel';

/** The camera fields Phaser's mapping uses (Camera.preRender, BaseCamera.getWorldPoint). */
export interface CamView {
  x: number;
  y: number;
  width: number;
  height: number;
  originX: number;
  originY: number;
  zoom: number;
  scrollX: number;
  scrollY: number;
}

/**
 * The scroll that keeps the world point under screen (sx, sy) in place when
 * the camera's zoom goes to `z`. Phaser maps world = (s − x − w·ox) / zoom +
 * w·ox + scroll, so only the 1/zoom term moves.
 */
export function anchoredScroll(cam: CamView, z: number, sx: number, sy: number): { x: number; y: number } {
  return scrollToHold(cam, z, sx, sy, worldUnder(cam, sx, sy));
}

/** The world point under screen (sx, sy). */
function worldUnder(cam: CamView, sx: number, sy: number): { x: number; y: number } {
  const ox = cam.width * cam.originX;
  const oy = cam.height * cam.originY;
  return { x: (sx - cam.x - ox) / cam.zoom + ox + cam.scrollX, y: (sy - cam.y - oy) / cam.zoom + oy + cam.scrollY };
}

/** The scroll that puts world point `w` under screen (sx, sy) at zoom `z`. */
function scrollToHold(cam: CamView, z: number, sx: number, sy: number, w: { x: number; y: number }): { x: number; y: number } {
  const ox = cam.width * cam.originX;
  const oy = cam.height * cam.originY;
  return { x: w.x - (sx - cam.x - ox) / z - ox, y: w.y - (sy - cam.y - oy) / z - oy };
}

/** A scaled container (screen = offset + world·z): the offset that keeps the point under `s` in place from scale z0 to z1. */
export function anchorOffset(offset: number, s: number, z0: number, z1: number): number {
  return s - ((s - offset) * z1) / z0;
}

/**
 * Zoom `cam` to `z` about screen (sx, sy). With `ms` > 0 the zoom eases there
 * and the anchor holds on every frame. Bounds still clamp the scroll at the
 * map's edge (Phaser does that in preRender).
 */
export function zoomCamAt(scene: Phaser.Scene, cam: Phaser.Cameras.Scene2D.Camera, z: number, sx: number, sy: number, ms = 0): void {
  // the point is taken once, so the whole-pixel scroll Phaser keeps (roundPixels) never drifts it frame by frame
  const w = worldUnder(cam, sx, sy);
  const hold = () => {
    const s = scrollToHold(cam, cam.zoom, sx, sy, w);
    // whole world px, rounded (Phaser floors the scroll under roundPixels): the point stays within half a map px
    cam.setScroll(Math.round(s.x), Math.round(s.y));
  };
  // the tween is on the camera itself, so whatever stops the camera's tweens stops this one too
  scene.tweens.killTweensOf(cam);
  if (ms <= 0 || z === cam.zoom) {
    cam.setZoom(z);
    hold();
    return;
  }
  scene.tweens.add({ targets: cam, zoom: z, duration: ms, onUpdate: hold });
}

/** What a map does with the wheel: zoom one step about the cursor, pan sideways (canvas px), or ignore it over UI. */
interface MapWheel {
  /** The wheel is over a control, a sheet or a dialog: leave it to them. */
  blocked?(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): boolean;
  zoom(dir: 1 | -1, sx: number, sy: number): void;
  pan?(dx: number): void;
}

/**
 * Wire a map's wheel through one `WheelAccumulator`: whole zoom steps at the
 * cursor, shift or deltaX pans, a pinch (ctrl) never zooms the page.
 */
export function mapWheel(scene: Phaser.Scene, m: MapWheel): void {
  const acc = new WheelAccumulator();
  scene.input.on('wheel', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
    const e = p.event as WheelEvent;
    if (e.ctrlKey) e.preventDefault();
    if (m.blocked?.(p, over)) return;
    // wheel deltas are CSS px; the canvas has its own pixels (the render scale)
    const c = scene.game.canvas;
    const k = c.clientHeight > 0 ? c.height / c.clientHeight : 1;
    const r = acc.push(e, e.timeStamp, scene.scale.height / k);
    if (r.zoom) m.zoom(r.zoom, p.x, p.y);
    if (r.panX && m.pan) m.pan(r.panX * k);
  });
}
