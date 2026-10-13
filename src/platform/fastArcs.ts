/**
 * Cheaper arcs for Phaser 3 Graphics (QA-05, docs/v5/qa/PERF.md).
 *
 * Phaser's WebGL Graphics renderer turns every `arc` command into 101 points, whatever its
 * radius (GraphicsWebGLRenderer, iterStep 0.01), and re-triangulates every filled path with
 * earcut on every frame. A rounded rectangle is four arcs, so a 1 UI px corner costs 400+
 * points; the battle's group cards (two bars of three rounded rects each, redrawn per frame)
 * and plates spent about 4 ms a frame in earcut at 1x CPU (24 ms at 6x), the battle FPS
 * regression against the P4 baseline.
 *
 * installFastArcs() makes `Graphics.arc` record the arc as line segments instead, as many as
 * its radius needs: the chord's sagitta stays under a quarter device px at the largest scale a
 * UI px is drawn at (12 device px), and never more than Phaser's own 100. The path's points are
 * the ones Phaser would draw, fewer of them: the same start (a new path starts there, as an arc
 * opening a path does), the same end, the same overshoot. Canvas renders the same polygon.
 */
import type Phaser from 'phaser';

/** Device px per local unit assumed for the error bound (a UI px at S = 4 x RS = 3). */
const MAX_SCALE = 12;
/** Largest gap between the true arc and its chord, in device px. */
const MAX_SAGITTA = 0.25;
/** Phaser's own count (iterStep 0.01): never more points than the stock arc. */
const MAX_SEGMENTS = 100;

/** Segments for an arc of `radius` sweeping `sweep` radians (both >= 0). */
export function arcSegments(radius: number, sweep: number): number {
  const r = radius * MAX_SCALE;
  if (!(r > 0) || !(sweep > 0)) return 1;
  // sagitta = r (1 - cos(step / 2)) <= MAX_SAGITTA
  const step = 2 * Math.acos(Math.max(-1, 1 - MAX_SAGITTA / r));
  return Math.max(1, Math.min(MAX_SEGMENTS, Math.ceil(sweep / step)));
}

/** The sweep Phaser's renderer draws for (start, end, anticlockwise): GraphicsWebGLRenderer's normalisation. */
export function arcSweep(startAngle: number, endAngle: number, anticlockwise: boolean): number {
  const PI2 = Math.PI * 2;
  let e = endAngle - startAngle;
  if (anticlockwise) {
    if (e < -PI2) e = -PI2;
    else if (e > 0) e = -PI2 + (e % PI2);
  } else if (e > PI2) e = PI2;
  else if (e < 0) e = PI2 + (e % PI2);
  return e;
}

/** The points of an arc, in order: start, the segment ends, then the end point (Phaser's last point). */
export function arcPoints(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise = false, overshoot = 0): [number, number][] {
  const sweep = arcSweep(startAngle, endAngle, anticlockwise);
  const n = arcSegments(radius, Math.abs(sweep) * (1 + overshoot));
  const at = (t: number): [number, number] => [x + Math.cos(sweep * t + startAngle) * radius, y + Math.sin(sweep * t + startAngle) * radius];
  const out: [number, number][] = [];
  const last = 1 + overshoot;
  for (let k = 0; k < n; k++) out.push(at((k / n) * last));
  if (overshoot > 0) out.push(at(last));
  out.push(at(1));
  return out;
}

let installed = false;

/** Patch `Graphics#arc` (Phaser.GameObjects.Graphics; passed in, so tests run without Phaser), once. */
export function installFastArcs(Graphics: { prototype: Phaser.GameObjects.Graphics }): void {
  if (installed) return;
  installed = true;
  const proto = Graphics.prototype;
  proto.arc = function (this: Phaser.GameObjects.Graphics, x, y, radius, startAngle, endAngle, anticlockwise = false, overshoot = 0) {
    // lineTo opens a path at its point when none is open, as an arc does in the renderer
    for (const [px, py] of arcPoints(x, y, radius, startAngle, endAngle, anticlockwise, overshoot)) this.lineTo(px, py);
    return this;
  };
}
