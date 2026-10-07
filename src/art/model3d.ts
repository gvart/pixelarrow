/**
 * A tiny software renderer that turns simple 3D primitives into pixel art
 * seen through the battle's isometric camera (the same 2:1 dimetric view as
 * src/art/iso.ts, 30 degree elevation). The sprite generators
 * (src/art/paperdoll.ts) build soldiers, horses, chariots and animals out of
 * spheres, tapered limbs, ellipsoids, boxes and lines posed in metres; this
 * module ray-casts them one pixel at a time, shades every hit against a
 * fixed light (upper left of the screen), quantises the result to a
 * material's colour ramp with ordered dithering, darkens creases where depth
 * jumps, and adds a soft outline (a darker shade of the edge colour, never
 * black). Pure: no Phaser, no DOM, deterministic.
 *
 * World axes: X = field x (down-right on screen), Y = field y (down-left),
 * Z = up. 1 unit = 1 metre; a man is about 1.75 m (~34 px).
 */
import { BAYER4, Pix, hash2 } from './pixels';

export type V3 = [number, number, number];

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3): number => Math.sqrt(dot(a, a));
export const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---------------------------------------------------------------- camera

/** Horizontal pixels per metre along a world axis (X maps to (+K, +K/2)). */
export const K = 16;
const S = K * Math.SQRT2; // pixels per metre in the view plane
const C30 = Math.cos(Math.PI / 6);
const S30 = 0.5;
/** View direction (into the scene), screen right and screen up as world vectors. */
export const VIEW: V3 = [-C30 / Math.SQRT2, -C30 / Math.SQRT2, -S30];
const RIGHT: V3 = [Math.SQRT1_2, -Math.SQRT1_2, 0];
const UP: V3 = [-S30 / Math.SQRT2, -S30 / Math.SQRT2, C30];
/** Towards the camera. */
export const CAM: V3 = [-VIEW[0], -VIEW[1], -VIEW[2]];
/** Light: from the upper left of the screen and a little towards the camera. */
export const LIGHT: V3 = norm(add(add(mul(RIGHT, -0.55), mul(UP, 0.75)), mul(CAM, 0.45)));
const HALF: V3 = norm(add(LIGHT, CAM));

/** Screen position (relative to the sprite origin) of a world point. */
export function project(p: V3): { x: number; y: number } {
  return { x: dot(p, RIGHT) * S, y: -dot(p, UP) * S };
}

// ---------------------------------------------------------------- materials

export interface Material {
  /** Colours light to dark. */
  ramp: number[];
  /** Metal: a hard highlight (the lightest tone) where the light glints. */
  metal?: boolean;
  /** Dirt / wear speckle (0..1): darker flecks fixed to the surface. */
  grit?: number;
  /** Shading contrast (default 1). Cloth is softer, metal harder. */
  contrast?: number;
}

export interface Hit {
  /** Ramp override for this point (painted emblems, bands, patterns). */
  ramp?: number[];
  /** Shift of the tone (+ darker, - lighter) for patterns. */
  shade?: number;
  /** Treat as a miss (holes, notches). */
  hole?: boolean;
}

/** A surface shader gets the hit point in the primitive's own normalised coordinates. */
export type Shader = (local: V3, world: V3) => Hit | null;

interface Base {
  mat: Material;
  shader?: Shader;
  /** Primitives sharing a group do not draw creases between each other. */
  group: number;
}

interface Ellipsoid extends Base {
  kind: 'ell';
  c: V3;
  /** Set for spheres (radius): rendered on a fast path. */
  sph?: number;
  /** Axis vectors (lengths = radii), mutually orthogonal. */
  a: [V3, V3, V3];
}

interface Box extends Base {
  kind: 'box';
  c: V3;
  /** Half-extent vectors, mutually orthogonal. */
  a: [V3, V3, V3];
}

interface Line {
  kind: 'line';
  p0: V3;
  p1: V3;
  mat: Material;
  /** Pixel width 1 or 2. */
  width: number;
  group: number;
}

type Prim = Ellipsoid | Box;

/** A scene of primitives in world space, then rendered into a Pix. */
export class Scene {
  prims: Prim[] = [];
  lines: Line[] = [];
  private g = 1;

  /** A new crease group (parts of one body that blend without inner outlines). */
  group(): number {
    return ++this.g;
  }

  get current(): number {
    return this.g;
  }

  sphere(c: V3, r: number, mat: Material, shader?: Shader, group = this.g): void {
    this.prims.push({ kind: 'ell', c, a: [[r, 0, 0], [0, r, 0], [0, 0, r]], mat, shader, group, sph: r });
  }

  /** Ellipsoid from a centre and three orthogonal axis vectors (their lengths are the radii). */
  ellipsoid(c: V3, ax: V3, ay: V3, az: V3, mat: Material, shader?: Shader, group = this.g): void {
    this.prims.push({ kind: 'ell', c, a: [ax, ay, az], mat, shader, group });
  }

  /** Ellipsoid aligned with a local frame: radii along forward f, side r and up u. */
  blob(c: V3, f: V3, r: V3, u: V3, rf: number, rr: number, ru: number, mat: Material, shader?: Shader, group = this.g): void {
    this.ellipsoid(c, mul(f, rf), mul(r, rr), mul(u, ru), mat, shader, group);
  }

  box(c: V3, ax: V3, ay: V3, az: V3, mat: Material, shader?: Shader, group = this.g): void {
    this.prims.push({ kind: 'box', c, a: [ax, ay, az], mat, shader, group });
  }

  /**
   * A tapered limb from a (radius ra) to b (radius rb): a sweep of spheres
   * spaced finely enough that it renders as a smooth rounded cone.
   */
  limb(a: V3, b: V3, ra: number, rb: number, mat: Material, shader?: Shader, group = this.g): void {
    const l = len(sub(b, a));
    const step = Math.max(0.014, Math.min(ra, rb) * 0.6);
    const n = Math.max(1, Math.ceil(l / step));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.sphere(lerp3(a, b, t), ra + (rb - ra) * t, mat, shader, group);
    }
  }

  /** A thin straight thing (shaft, string, blade edge) drawn as a depth-tested pixel line. */
  line(p0: V3, p1: V3, mat: Material, width = 1, group = this.g): void {
    this.lines.push({ kind: 'line', p0, p1, mat, width, group });
  }

  /** Move every primitive (rotations are applied by the rig before adding). */
  translate(d: V3): void {
    for (const p of this.prims) p.c = add(p.c, d);
    for (const l of this.lines) {
      l.p0 = add(l.p0, d);
      l.p1 = add(l.p1, d);
    }
  }

  /** Scale the whole scene about the origin (icons: a helmet blown up to fill 16 px). */
  scale(k: number): void {
    for (const p of this.prims) {
      p.c = mul(p.c, k);
      p.a = [mul(p.a[0], k), mul(p.a[1], k), mul(p.a[2], k)];
      if (p.kind === 'ell' && p.sph !== undefined) p.sph *= k;
    }
    for (const l of this.lines) {
      l.p0 = mul(l.p0, k);
      l.p1 = mul(l.p1, k);
    }
  }

  /** Rotate the whole scene about an axis through a pivot (Rodrigues). */
  rotate(pivot: V3, axis: V3, angle: number): void {
    const k = norm(axis);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const rot = (v: V3): V3 => add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
    const rp = (p: V3): V3 => add(pivot, rot(sub(p, pivot)));
    for (const p of this.prims) {
      p.c = rp(p.c);
      p.a = [rot(p.a[0]), rot(p.a[1]), rot(p.a[2])];
    }
    for (const l of this.lines) {
      l.p0 = rp(l.p0);
      l.p1 = rp(l.p1);
    }
  }

  /**
   * Render into a w x h Pix with the world origin (the feet) at (ox, oy).
   * Returns the pixels; shading, creases and the soft outline included.
   */
  render(w: number, h: number, ox: number, oy: number, opts: { outline?: boolean } = {}): Pix {
    const n = w * h;
    const depth = new Float32Array(n).fill(Infinity);
    const color = new Int32Array(n).fill(-1);
    const grp = new Int32Array(n);
    const tone = new Float32Array(n);
    const rampOf: (number[] | null)[] = new Array(n).fill(null);

    const put = (i: number, t: number, ramp: number[], level: number, g: number) => {
      depth[i] = t;
      rampOf[i] = ramp;
      tone[i] = level;
      grp[i] = g;
      color[i] = 1;
    };

    for (let pi = 0; pi < this.prims.length; pi++) {
      const p = this.prims[pi];
      // screen bounding box from the axis vectors
      const cs = project(p.c);
      if (p.kind === 'ell' && p.sph !== undefined) {
        // spheres: solved directly in screen space (most of a figure is spheres)
        const r = p.sph;
        const r2 = r * r;
        const rp = r * S;
        const cx = ox + cs.x;
        const cy = oy + cs.y;
        const dc = dot(p.c, VIEW);
        const ya = Math.max(0, Math.floor(cy - rp - 1));
        const yb = Math.min(h - 1, Math.ceil(cy + rp + 1));
        const xa = Math.max(0, Math.floor(cx - rp - 1));
        const xb = Math.min(w - 1, Math.ceil(cx + rp + 1));
        for (let py = ya; py <= yb; py++) {
          const uy = -(py + 0.5 - cy) / S;
          for (let px = xa; px <= xb; px++) {
            const ux = (px + 0.5 - cx) / S;
            const q = ux * ux + uy * uy;
            if (q > r2) continue;
            const hh = Math.sqrt(r2 - q);
            const d = dc - hh;
            const i = py * w + px;
            if (d >= depth[i]) continue;
            const nx = (RIGHT[0] * ux + UP[0] * uy + CAM[0] * hh) / r;
            const ny = (RIGHT[1] * ux + UP[1] * uy + CAM[1] * hh) / r;
            const nz = (RIGHT[2] * ux + UP[2] * uy + CAM[2] * hh) / r;
            let ramp = p.mat.ramp;
            let shade = 0;
            if (p.shader) {
              const nw: V3 = [nx, ny, nz];
              const lp: V3 = [dot(nw, p.a[0]) / r, dot(nw, p.a[1]) / r, dot(nw, p.a[2]) / r];
              const hres = p.shader(lp, [p.c[0] + nx * r, p.c[1] + ny * r, p.c[2] + nz * r]);
              if (hres) {
                if (hres.hole) continue;
                if (hres.ramp) ramp = hres.ramp;
                if (hres.shade) shade = hres.shade;
              }
            }
            put(i, d, ramp, this.toneOf(p.mat, nx, ny, nz, ramp.length, px, py, nx, ny, nz, pi) + shade, p.group);
          }
        }
        continue;
      }
      let ex = 0;
      let ey = 0;
      for (const a of p.a) {
        const q = project(a);
        ex += Math.abs(q.x);
        ey += Math.abs(q.y);
      }
      if (p.kind === 'box') {
        ex *= 1.01;
        ey *= 1.01;
      }
      const x0 = Math.max(0, Math.floor(ox + cs.x - ex - 1));
      const x1 = Math.min(w - 1, Math.ceil(ox + cs.x + ex + 1));
      const y0 = Math.max(0, Math.floor(oy + cs.y - ey - 1));
      const y1 = Math.min(h - 1, Math.ceil(oy + cs.y + ey + 1));
      if (x0 > x1 || y0 > y1) continue;
      // inverse axes for local coordinates
      const inv = p.a.map((a) => mul(a, 1 / dot(a, a))) as [V3, V3, V3];
      const dl: V3 = [dot(VIEW, inv[0]), dot(VIEW, inv[1]), dot(VIEW, inv[2])];
      for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
          const sx = (px + 0.5 - ox) / S;
          const sy = -(py + 0.5 - oy) / S;
          // ray origin on the view plane through the world origin
          const o: V3 = [RIGHT[0] * sx + UP[0] * sy - p.c[0], RIGHT[1] * sx + UP[1] * sy - p.c[1], RIGHT[2] * sx + UP[2] * sy - p.c[2]];
          const ol: V3 = [dot(o, inv[0]), dot(o, inv[1]), dot(o, inv[2])];
          let t: number;
          let nl: V3;
          let lp: V3;
          if (p.kind === 'ell') {
            const A = dot(dl, dl);
            const B = 2 * dot(ol, dl);
            const Cc = dot(ol, ol) - 1;
            const disc = B * B - 4 * A * Cc;
            if (disc < 0) continue;
            t = (-B - Math.sqrt(disc)) / (2 * A);
            lp = add(ol, mul(dl, t));
            nl = lp;
          } else {
            // slab test in the box's local [-1, 1]^3
            let tmin = -Infinity;
            let tmax = Infinity;
            let axis = 0;
            let sign = 1;
            let ok = true;
            for (let k = 0; k < 3; k++) {
              if (Math.abs(dl[k]) < 1e-9) {
                if (ol[k] < -1 || ol[k] > 1) ok = false;
                continue;
              }
              let ta = (-1 - ol[k]) / dl[k];
              let tb = (1 - ol[k]) / dl[k];
              let sg = -1;
              if (ta > tb) {
                const tt = ta;
                ta = tb;
                tb = tt;
                sg = 1;
              }
              if (ta > tmin) {
                tmin = ta;
                axis = k;
                sign = sg;
              }
              if (tb < tmax) tmax = tb;
            }
            if (!ok || tmin > tmax) continue;
            t = tmin;
            lp = add(ol, mul(dl, t));
            nl = [0, 0, 0];
            nl[axis] = sign;
          }
          const i = py * w + px;
          // the ray's t is the depth along VIEW (its origin plane passes through the world origin)
          const d = t;
          if (d >= depth[i]) continue;
          const wp = add(p.c, add(add(mul(p.a[0], lp[0]), mul(p.a[1], lp[1])), mul(p.a[2], lp[2])));
          let ramp = p.mat.ramp;
          let shade = 0;
          if (p.shader) {
            const hres = p.shader(lp, wp);
            if (hres) {
              if (hres.hole) continue;
              if (hres.ramp) ramp = hres.ramp;
              if (hres.shade) shade = hres.shade;
            }
          }
          // world normal: gradient of the local quadric / the box face
          const nw = norm(add(add(mul(inv[0], nl[0]), mul(inv[1], nl[1])), mul(inv[2], nl[2])));
          put(i, d, ramp, this.toneOf(p.mat, nw[0], nw[1], nw[2], ramp.length, px, py, lp[0], lp[1], lp[2], pi) + shade, p.group);
        }
      }
    }

    // lines (shafts, strings): depth-tested, two tones by orientation
    for (const l of this.lines) {
      const a = project(l.p0);
      const b = project(l.p1);
      const da = dot(l.p0, VIEW);
      const db = dot(l.p1, VIEW);
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 1.5));
      const dir = norm(sub(l.p1, l.p0));
      // a cylinder's best-lit side faces the light across the shaft
      const lit = 1 - Math.abs(dot(dir, LIGHT));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const x = Math.floor(ox + a.x + (b.x - a.x) * t);
        const y = Math.floor(oy + a.y + (b.y - a.y) * t);
        const d = da + (db - da) * t - 0.02;
        for (let wdt = 0; wdt < l.width; wdt++) {
          const xx = x + (Math.abs(b.y - a.y) > Math.abs(b.x - a.x) ? wdt : 0);
          const yy = y + (Math.abs(b.y - a.y) > Math.abs(b.x - a.x) ? 0 : wdt);
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const i = yy * w + xx;
          if (d >= depth[i]) continue;
          const tn = (wdt === 0 ? 0.25 + (1 - lit) * 0.9 : 1.4) * (l.mat.ramp.length - 1) / 2;
          put(i, d, l.mat.ramp, tn + (((xx + yy) & 3) === 0 && l.mat.grit ? 0.6 : 0), l.group);
        }
      }
    }

    // creases: a pixel behind a much nearer neighbour of another part goes a tone darker
    const out = new Pix(w, h);
    const od = out.data;
    const crease = (i: number, j: number) => color[j] >= 0 && grp[j] !== grp[i] && depth[i] - depth[j] > 0.09;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (color[i] < 0) continue;
        let lv = tone[i];
        if ((x > 0 && crease(i, i - 1)) || (x < w - 1 && crease(i, i + 1)) || (y > 0 && crease(i, i - w)) || (y < h - 1 && crease(i, i + w))) lv += 1;
        const ramp = rampOf[i]!;
        const c = ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(lv)))];
        const o = i * 4;
        od[o] = (c >> 16) & 255;
        od[o + 1] = (c >> 8) & 255;
        od[o + 2] = c & 255;
        od[o + 3] = 255;
      }
    }
    if (opts.outline !== false) softOutline(out);
    return out;
  }

  /** Light a surface point: diffuse + ambient, dithered onto the ramp; glints on metal; grit. */
  private toneOf(m: Material, nx: number, ny: number, nz: number, nr: number, px: number, py: number, g0: number, g1: number, g2: number, pi: number): number {
    const diff = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
    const facing = Math.max(0, nx * CAM[0] + ny * CAM[1] + nz * CAM[2]);
    const c = m.contrast ?? 1;
    // 0 = brightest, 1 = darkest
    let dark = 1 - (0.18 + 0.72 * diff + 0.1 * facing);
    dark = 0.5 + (dark - 0.5) * c;
    let lv = dark * (nr - 1) + (BAYER4[py & 3][px & 3] - 0.5) * 0.55;
    if (m.metal) {
      const spec = Math.pow(Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]), 24);
      if (spec > 0.45) lv = 0;
    }
    if (m.grit) {
      const q = hash2(Math.floor((g0 + 2) * 9) + pi * 31, Math.floor((g1 + 2) * 9) + Math.floor((g2 + 2) * 9) * 57, 7);
      if (q < m.grit * 0.35) lv += 1;
    }
    return lv;
  }
}

/** Soft outline: transparent pixels next to the sprite take a dark shade of their neighbour. */
export function softOutline(px: Pix): void {
  const { w, h, data } = px;
  const marks: number[] = [];
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 128;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 0) continue;
      // prefer the pixel above / left (the outline reads as a shadow edge below / right)
      let j = -1;
      if (solid(x, y - 1)) j = (y - 1) * w + x;
      else if (solid(x - 1, y)) j = y * w + x - 1;
      else if (solid(x + 1, y)) j = y * w + x + 1;
      else if (solid(x, y + 1)) j = (y + 1) * w + x;
      if (j >= 0) marks.push(y * w + x, (data[j * 4] << 16) | (data[j * 4 + 1] << 8) | data[j * 4 + 2]);
    }
  }
  for (let k = 0; k < marks.length; k += 2) {
    const c = shadeOf(marks[k + 1], 0.42);
    const o = marks[k] * 4;
    data[o] = (c >> 16) & 255;
    data[o + 1] = (c >> 8) & 255;
    data[o + 2] = c & 255;
    data[o + 3] = 235;
  }
}

/** A darker, slightly cooler version of a colour. */
export function shadeOf(c: number, k: number): number {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const f = 1 - k;
  return (Math.round(r * f * 0.92 + 18 * k) << 16) | (Math.round(g * f * 0.9 + 12 * k) << 8) | Math.round(b * f + 16 * k);
}

/**
 * A five-tone ramp from a base colour, hue-shifted the pixel-art way: lights
 * lean warm, shadows lean cool and earthy.
 */
export function ramp(base: number, n = 5): number[] {
  const out: number[] = [];
  const r = (base >> 16) & 255;
  const g = (base >> 8) & 255;
  const b = base & 255;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1); // 0 light .. 1 dark
    const k = 1.32 - t * 0.78; // brightness
    let rr = r * k;
    let gg = g * k;
    let bb = b * k;
    if (t < 0.5) {
      // warm lights
      const w = (0.5 - t) * 0.22;
      rr += (255 - rr) * w * 0.6;
      gg += (235 - gg) * w * 0.45;
      bb += (190 - bb) * w * 0.15;
    } else {
      // cool, earthy shadows
      const w = (t - 0.5) * 0.4;
      rr = rr * (1 - w) + 40 * w;
      gg = gg * (1 - w) + 30 * w;
      bb = bb * (1 - w) + 44 * w;
    }
    out.push((clamp255(rr) << 16) | (clamp255(gg) << 8) | clamp255(bb));
  }
  return out;
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
