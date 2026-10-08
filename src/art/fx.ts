/**
 * Procedural pixel-art effect textures: aura ground rings (iso ellipses with a
 * dithered glow and a travelling highlight), stun stars, buff pips and outlined
 * ability icons. Stepped colours and Bayer dithering only, no smooth gradients.
 */
import { P, mix } from './palette';
import { BAYER4, Pix } from './pixels';
import { ISO_HH, ISO_HW } from './iso';
import { paintIcon, type IconPart } from './iconStyle';

/** Semi-axes in pixels of a field-space circle of radius r projected to the iso screen. */
export function isoEllipse(r: number): { rx: number; ry: number } {
  return { rx: r * ISO_HW * Math.SQRT2, ry: r * ISO_HH * Math.SQRT2 };
}

/**
 * Aura ring: a 2px rim (bright outer line, dithered inner line), a sparse
 * dithered glow inside, and one bright arc whose angle steps with `frame` so
 * cycling the frames makes the ring shimmer around.
 */
export function renderAuraRing(r: number, color: number, frame: number, frames: number): Pix {
  const { rx, ry } = isoEllipse(r);
  const w = Math.ceil(rx * 2) + 3;
  const h = Math.ceil(ry * 2) + 3;
  const px = new Pix(w, h);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const light = mix(color, 0xffffff, 0.45);
  const dark = mix(color, 0x1d140f, 0.35);
  const hiAngle = (frame / frames) * Math.PI * 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      const t = BAYER4[y & 3][x & 3];
      const edgePx = (1 - d) * ry; // distance inside the rim in (vertical) pixels
      if (d > 1.0 + 0.5 / ry) continue;
      const ang = Math.atan2(dy, dx);
      let da = Math.abs(ang - hiAngle);
      if (da > Math.PI) da = Math.PI * 2 - da;
      const hot = da < 0.5;
      if (edgePx < 1) px.set(x, y, hot ? 0xfff4d8 : light, 255);
      else if (edgePx < 2) {
        if (t < 0.6 || hot) px.set(x, y, hot ? light : color, 230);
      } else if (edgePx < 4) {
        if (t < 0.28) px.set(x, y, color, 170);
      } else if (t < 0.07) px.set(x, y, dark, 140);
    }
  }
  return px;
}

/** A tiny 5x5 four-point star (stun indicator). */
export function renderStar(color = 0xfff08a): Pix {
  const px = new Pix(5, 5);
  const o = 0x5a3a10;
  px.set(2, 0, color);
  px.set(2, 4, color);
  px.set(0, 2, color);
  px.set(4, 2, color);
  px.set(1, 2, color);
  px.set(3, 2, color);
  px.set(2, 1, color);
  px.set(2, 3, color);
  px.set(2, 2, 0xffffff);
  px.set(1, 1, o, 120);
  px.set(3, 3, o, 120);
  return px;
}

/** 5x5 buff/debuff pips shown above a soldier's head. */
export function renderPip(kind: 'up' | 'fang' | 'shield', color: number): Pix {
  const px = new Pix(7, 7);
  const o = P.outline;
  const rows: Record<string, string[]> = {
    up: ['..#..', '.###.', '##.##', '..#..', '..#..'],
    fang: ['#...#', '##.##', '#####', '.#.#.', '.#.#.'],
    shield: ['#####', '#####', '#####', '.###.', '..#..'],
  };
  px.bitmap(1, 1, rows[kind], { '#': color });
  px.outline(o);
  return px;
}

/** Edge in world px of a floating ability icon (the old 12 px pixel icon plus its outline). */
export const FX_ICON_PX = 14;

/**
 * A floating ability / level-up icon: the smooth UI icon (src/art/vectorIcons.ts)
 * painted at `n` device px, to be shown scaled down to FX_ICON_PX world px.
 */
export function renderFxIcon(parts: IconPart[], n: number): HTMLCanvasElement {
  return paintIcon('fx', parts, 'full', n);
}

/** Confetti flake (2x2) and a square particle in a solid colour. */
export function renderDot(size: number, color: number): Pix {
  const px = new Pix(size, size);
  px.rect(0, 0, size, size, color);
  if (size > 1) px.set(0, 0, mix(color, 0xffffff, 0.4));
  return px;
}
