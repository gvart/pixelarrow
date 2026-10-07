/**
 * Art for the character sheet and roster: the portrait stage (a lit tent
 * interior with a floor and a banner in the class colour), rank stars, group
 * badges and small role / status pips. All procedural, cached by the callers
 * (src/ui/sheet.ts) as textures.
 */
import { Pix, hash2 } from './pixels';
import { P } from './palette';

const mix = (a: number, b: number, t: number): number => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/**
 * The portrait stage, w x h: dark warm backdrop lit from above, a hanging
 * banner in `accent` behind the figure, a round floor of packed earth and a
 * soft vignette, framed in bronze.
 */
export function renderStage(w: number, h: number, accent: number): Pix {
  const px = new Pix(w, h);
  const cx = w / 2;
  const floorY = Math.round(h * 0.8);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // light cone from the top centre
      const dx = (x - cx) / (w * 0.55);
      const dy = y / h;
      const lit = Math.max(0, 1 - Math.hypot(dx, dy * 0.8 - 0.25) * 1.15);
      let c = mix(0x1d140f, 0x5a4232, lit * 0.9);
      // canvas folds of the tent
      if ((x + Math.round(y * 0.15)) % 11 === 0) c = mix(c, 0x120c09, 0.35);
      if (y >= floorY) {
        const fy = (y - floorY) / Math.max(1, h - floorY);
        c = mix(mix(0x6e5a44, 0x3a2c22, fy), 0x1d140f, Math.min(1, Math.abs(dx) * 0.9));
        if (hash2(x, y, 7) < 0.07) c = mix(c, 0x8a7458, 0.5);
      }
      // vignette
      const v = Math.min(1, Math.max(0, Math.hypot((x - cx) / (w / 2), (y - h / 2) / (h / 2)) - 0.75) * 1.6);
      c = mix(c, 0x0e0906, v * 0.8);
      px.set(x, y, c);
    }
  }
  // the banner: a long cloth hanging from a cross bar behind the figure
  const bw = Math.max(10, Math.round(w * 0.32));
  const bx = Math.round(cx - bw / 2);
  const by = 3;
  const bh = Math.round(h * 0.55);
  px.rect(bx - 3, by, bw + 6, 2, P.wood[1]);
  px.set(bx - 4, by, 0xe0b040);
  px.set(bx + bw + 3, by, 0xe0b040);
  for (let y = 0; y < bh; y++) {
    const tail = y > bh - bw / 2 ? Math.abs(Math.round(y - (bh - bw / 2))) : 0;
    for (let x = 0; x < bw; x++) {
      if (x >= bw / 2 - tail && x < bw / 2 + tail) continue; // swallow tail
      const edge = x === 0 || x === bw - 1;
      const t = 0.35 + 0.25 * Math.sin((x / bw) * Math.PI) - y / bh * 0.25;
      let c = mix(mix(accent, 0x000000, 0.55), accent, Math.max(0, Math.min(1, t)));
      if (edge) c = mix(accent, 0x000000, 0.7);
      if (y === 3 || y === bh - bw / 2 - 2) c = mix(c, 0xe0b040, 0.6);
      px.set(bx + x, by + 2 + y, c);
    }
  }
  // floor shadow ring
  for (let x = -Math.round(w * 0.28); x <= Math.round(w * 0.28); x++) {
    const yy = floorY + 2;
    px.set(Math.round(cx + x), yy, mix(px.get(Math.round(cx + x), yy), 0x000000, 0.25));
  }
  // bronze frame
  for (let x = 0; x < w; x++) {
    px.set(x, 0, 0x8a6128);
    px.set(x, h - 1, 0x5e401b);
  }
  for (let y = 0; y < h; y++) {
    px.set(0, y, 0x8a6128);
    px.set(w - 1, y, 0x5e401b);
  }
  for (let x = 1; x < w - 1; x++) px.set(x, 1, 0xb8863b);
  for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) px.clear(x, y);
  return px;
}

/** A 7 x 7 rank star, filled gold or an empty outline. */
export function renderStar(filled: boolean): Pix {
  const rows = ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '#.....#'];
  const px = new Pix(7, 7);
  px.bitmap(0, 0, rows, { '#': filled ? 0xe0b040 : 0x8a7a6a });
  if (filled) {
    px.set(3, 1, 0xfff0a0);
    px.set(2, 2, 0xfff0a0);
  }
  return px;
}

/** Battle group colours: I Phalanx red, II Skirmish green, III Reserve blue, IV Flank bronze. */
export const GROUP_COLOR = [0xa83a2c, 0x5f8a45, 0x4a6b9a, 0xb8863b];

/** A small round group badge (12 x 12) in the group colour with a rim. */
export function renderGroupBadge(group: number): Pix {
  const px = new Pix(12, 12);
  const c = GROUP_COLOR[group] ?? 0x8a7a6a;
  px.ellipse(0, 0, 12, 12, (_x, _y, edge, _u, v) => (edge ? 0x1d140f : v < -0.35 ? mix(c, 0xffffff, 0.3) : c));
  return px;
}

/** Role colours for chips (class cards, roster). */
export const ROLE_COLOR: Record<string, number> = {
  levy: 0x8a7a6a,
  heavy: 0x4a6b8a,
  ranged: 0x5f7a45,
  light: 0x9a3b2f,
  cavalry: 0x8a6a3a,
  elite: 0x7a3a9a,
  beast: 0x6e5a44,
};
