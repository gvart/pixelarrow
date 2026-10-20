/**
 * Procedural pixel art of the camp kit (docs/ART_STYLE.md §13 "Camp"): the
 * living-camp props of the offline field camp and the world map. Pure Pix (no
 * Phaser) except registerCampKit.
 */
import type Phaser from 'phaser';
import { P } from './palette';
import { Pix } from './pixels';

// =====================================================================
// Camp kit: the living-camp props of the offline field camp (world
// map, 8 gp tiles). Small 3/4 top-down pixel
// pieces in the warm day palette of the map (cream canvas, honey wood,
// lavender stone, oxblood cloth), a lavender SE shadow and a dark plum
// sel-out: Greek ridge tents with guy ropes and open flaps, a campfire
// (4 flame frames), a waving standard (4 frames), crates / amphorae /
// sacks / log piles, straw dummies and targets, a weapon rack, an anvil,
// sharpened palisade stakes, construction scaffolds and map-scale
// soldiers (idle, walk, sit, spar, smith; 2 frames each, 6 looks).
// =====================================================================

/** Kit palette (warm day, matches the map's cream / lavender / sage). */
export const KIT = {
  ink: 0x5a3c44,
  /** The softer sel-out of props and structures (figures keep `ink`). */
  rim: 0x82606a,
  shade: 0x6e4f6a,
  canvas: [0xfff4e6, 0xf3dcc4, 0xdcbca4, 0xb48e80],
  ochre: [0xf2d6a0, 0xe0b878, 0xbf9058, 0x8e6640],
  red: [0xd47a6a, 0xb04a44, 0x86343a, 0x5e2427],
  wood: [0xecca9c, 0xcca478, 0xa67c5a, 0x7a5844],
  stone: [0xeedad4, 0xd2b4b8, 0xb4929c, 0x8a6a78],
  iron: [0xdcd8de, 0xa8a2ae, 0x76707e, 0x4e4856],
  straw: [0xf6e0a0, 0xe4c478, 0xc8a050, 0x987438],
  clay: [0xe8a878, 0xc87850, 0x9a5638, 0x6e3c2a],
  linen: [0xf6ead2, 0xe0d0b0, 0xbca888],
  earth: [0xe6cfa6, 0xd6bc92, 0xc4a680, 0xa88a6a, 0x8a6c56],
  ember: [0xfff4c0, 0xffd468, 0xf6a048, 0xe06838, 0xa83a2c],
  smoke: [0xf2e6e2, 0xd8c8cc, 0xb8a6b2],
  rope: 0xa48270,
  team: [0x7aa4c4, 0x4a6b8a, 0x344d66],
} as const;

/** Flat translucent lavender shadow (an ellipse), cast SE. */
export function kitShadow(px: Pix, x: number, y: number, w: number, h: number, a = 80): void {
  px.ellipse(x, y, w, h, () => null);
  const cx = x + (w - 1) / 2;
  const cy = y + (h - 1) / 2;
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) {
      if (((xx - cx) / (w / 2)) ** 2 + ((yy - cy) / (h / 2)) ** 2 > 1) continue;
      if (px.alpha(xx, yy) === 0) px.set(xx, yy, KIT.shade, a);
    }
}

/** A dark sel-out around the opaque (alpha > 160) pixels only. */
export function kitOutline(px: Pix, c: number = KIT.ink): void {
  const marks: number[] = [];
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      if (px.alpha(x, y) > 160) continue;
      if (px.alpha(x - 1, y) > 160 || px.alpha(x + 1, y) > 160 || px.alpha(x, y - 1) > 160 || px.alpha(x, y + 1) > 160) marks.push(x, y);
    }
  for (let i = 0; i < marks.length; i += 2) px.set(marks[i], marks[i + 1], c);
}

/** Tent cloth looks: plain cream, cream with an oxblood hem, ochre, striped red. */
type TentLook = 0 | 1 | 2 | 3;

/**
 * A Greek ridge tent seen 3/4 from the south: two roof slopes (lit west,
 * shaded east) running back to the ridge pole, the front gable with its flap
 * tied open on a dark doorway, guy ropes out to pegs. 17x14 gp, door at
 * (8, 12); `big` makes a 23x17 command tent, 'small' a 13x12 one (map tiles).
 */
export function renderTent(look: TentLook = 0, big: boolean | 'small' = false): Pix {
  const small = big === 'small';
  const W = big === true ? 23 : small ? 13 : 17;
  const H = big === true ? 17 : small ? 12 : 14;
  const px = new Pix(W, H);
  const cloth = look === 2 ? KIT.ochre : KIT.canvas;
  const hw = big === true ? 8 : small ? 4 : 6; // half width of the gable base
  const cx = Math.floor(W / 2);
  const base = H - 2; // gable base row
  const gh = big === true ? 7 : small ? 4 : 5; // gable height
  const depth = big === true ? 6 : small ? 4 : 5; // how far the slopes run back (north)
  kitShadow(px, cx - hw + 1, base - 3, hw * 2 + 3, 6, 70);
  // roof slopes: a parallelogram from the gable edges back by `depth`
  for (let d = 0; d <= depth; d++) {
    const y0 = base - gh - d + 1;
    for (let k = 0; k <= gh; k++) {
      const y = y0 + k;
      const xl = cx - Math.round((k / gh) * hw);
      const xr = cx + Math.round((k / gh) * hw);
      px.set(xl, y, cloth[k < 2 ? 0 : 1]);
      px.set(xr, y, cloth[k < 2 ? 2 : 2]);
      // fill between the gable edge and the ridge on each slope
      for (let x = xl + 1; x < cx; x++) px.set(x, y, cloth[d === 0 ? 1 : (x + d) % 5 === 0 ? 0 : 1]);
      for (let x = cx + 1; x < xr; x++) px.set(x, y, cloth[(x + d) % 6 === 0 || x === xr - 1 ? 3 : 2]);
    }
  }
  // the ridge pole and the back edge
  for (let d = 0; d <= depth; d++) px.set(cx, base - gh - d + 1, KIT.wood[1 + (d % 2)]);
  px.set(cx, base - gh - depth, KIT.wood[3]);
  // front gable (facing us): a triangle, lit left half
  for (let k = 0; k <= gh; k++) {
    const y = base - gh + 1 + k - 1;
    const half = Math.round((k / gh) * hw);
    for (let x = cx - half; x <= cx + half; x++) {
      const edge = x === cx - half || x === cx + half;
      px.set(x, y + 1, edge ? cloth[3] : x < cx ? cloth[1] : cloth[2]);
    }
  }
  // stripes / hem
  if (look === 1 || look === 3) {
    for (let x = cx - hw; x <= cx + hw; x++) px.set(x, base, x % 2 ? KIT.red[1] : KIT.red[2]);
  }
  if (look === 3) {
    for (let d = 1; d <= depth; d += 2)
      for (let k = 2; k <= gh; k++) {
        px.set(cx - Math.round((k / gh) * hw) + 1, base - gh - d + 1 + k, KIT.red[1]);
        px.set(cx + Math.round((k / gh) * hw) - 1, base - gh - d + 1 + k, KIT.red[2]);
      }
  }
  // the open doorway: a dark triangle with the flap folded back (lit) on the left
  const dh = big === true ? 5 : small ? 3 : 4;
  for (let k = 0; k < dh; k++) {
    const y = base - dh + 1 + k;
    const half = Math.floor(k / 2);
    for (let x = cx - half; x <= cx + half; x++) px.set(x, y, k === dh - 1 ? 0x2e1e24 : 0x46303a);
    px.set(cx - half - 1, y, cloth[0]);
    if (k > 0) px.set(cx - half - 2, y, cloth[1]);
  }
  px.set(cx, base - dh, KIT.wood[3]); // the pole in the doorway's apex
  // ground line under the gable
  px.hline(cx - hw, cx + hw, base + 1, cloth[3]);
  kitOutline(px, KIT.rim);
  // guy ropes to pegs (front corners out, back corners up)
  const ropes: [number, number, number, number][] = [
    [cx - hw, base - 1, 0, base + 1],
    [cx + hw, base - 1, W - 1, base + 1],
    [cx - hw + 2, base - gh - depth + 3, 1, base - gh - depth + 1],
    [cx + hw - 2, base - gh - depth + 3, W - 2, base - gh - depth + 1],
  ];
  for (const [x0, y0, x1, y1] of ropes) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 1; i < n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n);
      const y = Math.round(y0 + ((y1 - y0) * i) / n);
      if (px.alpha(x, y) < 200) px.set(x, y, KIT.rope, 200);
    }
    px.set(x1, y1, KIT.wood[3]);
  }
  // the ridge finial
  px.set(cx, base - gh - depth - 1, look === 3 || big === true ? KIT.red[1] : KIT.wood[3]);
  return px;
}

/** A campfire frame (0..3): a ring of stones, crossed logs, flames, a warm glow. 13x13 gp, fire base at (6, 9). */
export function renderCampfire(frame: number, lit = true): Pix {
  const px = new Pix(13, 13);
  const f = ((frame % 4) + 4) % 4;
  const cx = 6;
  const cy = 9;
  if (lit) {
    // glow on the ground
    for (let y = cy - 3; y <= cy + 3; y++)
      for (let x = cx - 6; x <= cx + 6; x++) {
        const d = ((x - cx) / 6) ** 2 + ((y - cy) / 3) ** 2;
        if (d <= 1) px.set(x, y, KIT.ember[1], Math.round(70 * (1 - d) + (f % 2) * 8));
      }
  }
  // ash bed and logs
  px.ellipse(cx - 3, cy - 1, 7, 4, (_x, _y, e) => (e ? 0x7a6064 : 0x5a4448));
  px.line(cx - 3, cy + 1, cx + 2, cy - 1, KIT.wood[2]);
  px.line(cx - 2, cy - 1, cx + 3, cy + 1, KIT.wood[3]);
  px.set(cx - 3, cy + 1, KIT.wood[1]);
  px.set(cx + 3, cy + 1, KIT.wood[1]);
  // stones
  for (let a = 0; a < 10; a++) {
    const ang = (a / 10) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(ang) * 4.6);
    const y = Math.round(cy + Math.sin(ang) * 2.4);
    const lit2 = Math.sin(ang) < 0;
    px.set(x, y, lit2 ? KIT.stone[1] : KIT.stone[2]);
    px.set(x, y - 1, lit2 ? KIT.stone[0] : KIT.stone[1]);
    if (lit && Math.sin(ang) > 0.3) px.set(x, y - 1, 0xf8d8b0);
  }
  if (!lit) return px;
  // embers
  px.set(cx - 1, cy, KIT.ember[3]);
  px.set(cx + 1, cy, KIT.ember[2]);
  px.set(cx, cy + 1, KIT.ember[3]);
  // flames: per frame column heights
  const H = [
    [2, 4, 6, 3, 1],
    [3, 5, 4, 5, 2],
    [1, 4, 7, 4, 2],
    [2, 6, 5, 3, 2],
  ][f];
  for (let i = 0; i < 5; i++) {
    const x = cx - 2 + i;
    const h = H[i];
    for (let k = 0; k < h; k++) {
      const y = cy - k;
      const t = k / Math.max(1, h - 1);
      const core = i >= 1 && i <= 3 && k < h - 2;
      px.set(x, y, k === h - 1 ? KIT.ember[4] : core ? (t < 0.4 ? KIT.ember[0] : KIT.ember[1]) : t < 0.6 ? KIT.ember[2] : KIT.ember[3]);
    }
  }
  // a detached tongue
  const tx = [cx, cx + 1, cx - 1, cx][f];
  const ty = cy - [7, 6, 8, 7][f];
  px.set(tx, ty, KIT.ember[2]);
  return px;
}

/** The camp standard: a pole with a gilded finial and a swallow-tailed cloth waving (frame 0..3). 13x20 gp, foot at (1, 19). */
function renderStandard(frame: number, cloth = KIT.red as readonly number[], emblem: number = KIT.canvas[0]): Pix {
  const px = new Pix(13, 20);
  const f = ((frame % 4) + 4) % 4;
  kitShadow(px, 0, 17, 5, 3, 80);
  px.vline(1, 2, 19, KIT.wood[2]);
  px.vline(2, 3, 19, KIT.wood[3]);
  px.set(1, 0, P.gold);
  px.set(1, 1, 0xa07a30);
  px.set(2, 1, P.gold);
  px.hline(1, 10, 2, KIT.wood[1]); // cross bar
  for (let i = 0; i < 9; i++) {
    const x = 2 + i;
    const dy = Math.round(Math.sin(i * 0.8 - f * (Math.PI / 2)) * 1.1);
    const slope = Math.cos(i * 0.8 - f * (Math.PI / 2));
    const len = i < 7 ? 7 : 5; // swallowtail
    for (let k = 0; k < len; k++) {
      if (i >= 7 && k >= 2 && k <= 4) continue;
      const c = k === 0 ? cloth[0] : slope > 0.3 ? cloth[0] : slope < -0.3 ? cloth[2] : cloth[1];
      px.set(x, 3 + dy + k, c);
    }
    px.set(x, 3 + dy + len - 1, cloth[3] ?? cloth[2]);
  }
  // emblem (a little owl-ish blob)
  const ex = 5;
  const ey = 5 + Math.round(Math.sin(3 * 0.8 - f * (Math.PI / 2)) * 1.1);
  px.set(ex, ey, emblem);
  px.set(ex + 1, ey, emblem);
  px.set(ex, ey + 1, emblem);
  px.set(ex + 1, ey + 1, emblem);
  px.set(ex + 2, ey + 2, emblem);
  px.set(ex - 1, ey + 2, emblem);
  kitOutline(px, KIT.rim);
  return px;
}

export type PropKind = 'crate' | 'crates' | 'amphora' | 'amphorae' | 'sack' | 'sacks' | 'logs' | 'barrel' | 'pot' | 'rack' | 'dummy' | 'target' | 'anvil' | 'shields' | 'hay';

/** Small supplies and drill props (each sits on its bottom row, centre column). */
export function renderProp(kind: PropKind): Pix {
  const crate = (px: Pix, x: number, y: number) => {
    px.rect(x, y, 5, 2, KIT.wood[0]);
    px.rect(x, y + 2, 5, 3, KIT.wood[2]);
    px.hline(x, x + 4, y + 2, KIT.wood[1]);
    px.vline(x + 4, y + 2, y + 4, KIT.wood[3]);
    px.set(x + 1, y + 3, KIT.wood[3]);
    px.set(x + 2, y + 1, KIT.wood[1]);
  };
  const amph = (px: Pix, x: number, y: number) => {
    px.set(x + 1, y, KIT.clay[2]);
    px.set(x + 1, y + 1, KIT.clay[1]);
    px.set(x, y + 1, KIT.clay[3]);
    px.set(x + 2, y + 1, KIT.clay[3]);
    px.rect(x, y + 2, 3, 3, KIT.clay[1]);
    px.vline(x, y + 2, y + 4, KIT.clay[0]);
    px.vline(x + 2, y + 2, y + 4, KIT.clay[2]);
    px.set(x + 1, y + 5, KIT.clay[3]);
    px.set(x + 1, y + 3, 0x5e2a20);
  };
  const sack = (px: Pix, x: number, y: number) => {
    px.rect(x, y + 1, 4, 3, KIT.linen[1]);
    px.hline(x, x + 2, y + 1, KIT.linen[0]);
    px.vline(x + 3, y + 1, y + 3, KIT.linen[2]);
    px.set(x + 1, y, KIT.linen[2]);
    px.set(x + 2, y, KIT.rope);
  };
  let px: Pix;
  switch (kind) {
    case 'crate':
      px = new Pix(8, 8);
      kitShadow(px, 1, 5, 7, 3);
      crate(px, 1, 2);
      break;
    case 'crates':
      px = new Pix(12, 11);
      kitShadow(px, 1, 7, 11, 4);
      crate(px, 1, 5);
      crate(px, 6, 5);
      crate(px, 3, 1);
      break;
    case 'amphora':
      px = new Pix(6, 9);
      kitShadow(px, 1, 6, 5, 3);
      amph(px, 1, 2);
      break;
    case 'amphorae':
      px = new Pix(11, 10);
      kitShadow(px, 1, 7, 10, 3);
      amph(px, 1, 3);
      amph(px, 4, 2);
      amph(px, 7, 3);
      break;
    case 'sack':
      px = new Pix(7, 7);
      kitShadow(px, 1, 4, 6, 3);
      sack(px, 1, 2);
      break;
    case 'sacks':
      px = new Pix(11, 9);
      kitShadow(px, 1, 5, 10, 4);
      sack(px, 1, 4);
      sack(px, 5, 4);
      sack(px, 3, 1);
      break;
    case 'logs':
      px = new Pix(11, 8);
      kitShadow(px, 1, 5, 10, 3);
      for (const [x, y, n] of [[1, 5, 8], [2, 3, 7], [3, 1, 5]] as const) {
        px.hline(x, x + n - 1, y, KIT.wood[1]);
        px.hline(x, x + n - 1, y + 1, KIT.wood[2]);
        px.set(x + n - 1, y, KIT.wood[0]);
        px.set(x + n - 1, y + 1, KIT.straw[1]);
      }
      break;
    case 'barrel':
      px = new Pix(7, 8);
      kitShadow(px, 1, 5, 6, 3);
      px.rect(1, 2, 4, 4, KIT.wood[1]);
      px.vline(1, 2, 5, KIT.wood[0]);
      px.vline(4, 2, 5, KIT.wood[3]);
      px.hline(1, 4, 3, KIT.iron[2]);
      px.hline(1, 4, 5, KIT.iron[3]);
      px.hline(1, 4, 1, KIT.wood[2]);
      px.hline(2, 3, 1, 0x7a9cae); // water
      break;
    case 'pot':
      px = new Pix(9, 10);
      // a tripod with a bronze pot
      px.line(1, 9, 4, 1, KIT.wood[3]);
      px.line(7, 9, 4, 1, KIT.wood[2]);
      px.vline(4, 2, 4, KIT.iron[3]);
      px.rect(3, 5, 3, 2, P.bronze[1]);
      px.hline(2, 6, 5, P.bronze[0]);
      px.set(5, 6, P.bronze[2]);
      break;
    case 'rack':
      px = new Pix(12, 12);
      kitShadow(px, 1, 9, 11, 3);
      px.hline(1, 10, 4, KIT.wood[1]);
      px.hline(1, 10, 9, KIT.wood[2]);
      px.vline(1, 3, 10, KIT.wood[3]);
      px.vline(10, 3, 10, KIT.wood[3]);
      for (let i = 0; i < 4; i++) {
        const x = 3 + i * 2;
        px.vline(x, 1, 10, KIT.wood[2]);
        px.set(x, 0, KIT.iron[0]);
        px.set(x, 1, KIT.iron[1]);
      }
      break;
    case 'shields':
      px = new Pix(12, 8);
      kitShadow(px, 1, 5, 11, 3);
      for (const [x, c] of [[1, KIT.team], [6, KIT.red]] as const) {
        px.ellipse(x, 1, 5, 6, (_x, _y, e, u, v) => (e ? P.bronze[1] : u + v < -0.3 ? c[0] : c[1]));
        px.set(x + 2, 3, P.bronze[0]);
      }
      break;
    case 'dummy':
      px = new Pix(9, 13);
      kitShadow(px, 2, 10, 6, 3);
      px.vline(4, 4, 11, KIT.wood[2]);
      px.hline(1, 7, 6, KIT.wood[2]);
      px.set(1, 7, KIT.straw[2]);
      px.set(7, 7, KIT.straw[2]);
      px.rect(3, 5, 3, 4, KIT.straw[1]);
      px.vline(3, 5, 8, KIT.straw[0]);
      px.vline(5, 5, 8, KIT.straw[2]);
      px.rect(3, 1, 3, 3, KIT.straw[1]);
      px.set(3, 1, KIT.straw[0]);
      px.set(5, 3, KIT.straw[3]);
      px.hline(3, 5, 4, KIT.rope);
      px.set(4, 9, KIT.straw[3]);
      break;
    case 'target':
      px = new Pix(10, 12);
      kitShadow(px, 2, 9, 7, 3);
      px.line(2, 11, 4, 6, KIT.wood[3]);
      px.line(7, 11, 5, 6, KIT.wood[2]);
      px.ellipse(1, 0, 8, 8, (_x, _y, e, u, v) => {
        const r = Math.hypot(u, v);
        return e ? KIT.straw[3] : r < 0.3 ? KIT.red[1] : r < 0.6 ? KIT.canvas[0] : r < 0.85 ? KIT.red[2] : KIT.straw[1];
      });
      px.set(6, 2, KIT.wood[3]); // an arrow in it
      px.set(7, 1, KIT.canvas[0]);
      break;
    case 'anvil':
      px = new Pix(9, 8);
      kitShadow(px, 1, 5, 8, 3);
      px.rect(3, 4, 3, 3, KIT.wood[2]);
      px.vline(3, 4, 6, KIT.wood[1]);
      px.hline(1, 7, 2, KIT.iron[1]);
      px.hline(2, 6, 1, KIT.iron[0]);
      px.set(0, 1, KIT.iron[1]);
      px.rect(3, 3, 3, 1, KIT.iron[3]);
      px.set(7, 2, KIT.iron[2]);
      break;
    case 'hay':
      px = new Pix(9, 7);
      kitShadow(px, 1, 4, 8, 3);
      px.ellipse(1, 1, 7, 5, (_x, _y, e, u, v) => (e ? KIT.straw[2] : u + v < -0.2 ? KIT.straw[0] : KIT.straw[1]));
      px.set(3, 2, KIT.straw[2]);
      px.set(5, 3, KIT.straw[3]);
      break;
  }
  kitOutline(px, KIT.rim);
  return px;
}

/** One sharpened palisade stake (2 gp wide), `h` tall, lit west face; for borders. */
export function drawStake(px: Pix, x: number, y: number, h: number): void {
  px.set(x + 2, y, KIT.shade, 70);
  px.set(x + 2, y - 1, KIT.shade, 50);
  px.vline(x, y - h + 2, y, KIT.wood[1]);
  px.vline(x + 1, y - h + 2, y, KIT.wood[3]);
  px.set(x, y - h + 1, KIT.wood[0]);
  px.set(x + 1, y - h + 1, KIT.wood[2]);
  px.set(x, y - h, KIT.wood[0]);
  px.set(x, y, KIT.wood[3]);
}

// --------------------------------------------------------------- soldiers

/** Soldier poses (2 frames each). */
export const SOLDIER_POSES = ['idle', 'walk', 'sit', 'spar', 'smith'] as const;
export type SoldierPose = (typeof SOLDIER_POSES)[number];
/** Frame size of a map-scale soldier; feet at (5, 13). */
export const SOLDIER_W = 13;
export const SOLDIER_H = 15;
/** Distinct looks (tunic, crest, skin, shield). */
const SOLDIER_LOOKS = 6;

const LOOKS = [
  { tunic: [0xf2e8d2, 0xd8c8a8, 0xb0a084], crest: KIT.red[1], skin: P.skin[0], shield: KIT.team, hair: P.hair[1] },
  { tunic: KIT.red, crest: 0x2b1d1a, skin: P.skin[1], shield: KIT.team, hair: P.hair[0] },
  { tunic: [0x9ab0c4, 0x6d8fae, 0x4a6b8a], crest: 0xe8e0cc, skin: P.skin[2], shield: KIT.red, hair: P.hair[2] },
  { tunic: KIT.ochre, crest: KIT.red[1], skin: P.skin[1], shield: KIT.team, hair: P.hair[3] },
  { tunic: [0x9aa86e, 0x7f9a5e, 0x5f7a45], crest: 0xe8e0cc, skin: P.skin[0], shield: KIT.red, hair: P.hair[1] },
  { tunic: [0xf2e8d2, 0xd8c8a8, 0xb0a084], crest: 0x2b1d1a, skin: P.skin[3], shield: KIT.team, hair: P.hair[0] },
] as const;

/**
 * A map-scale hoplite (facing east; mirror for west) in a 13x15 frame:
 * crested bronze helmet, tunic, round shield with a bronze rim, spear.
 * Poses: idle (breathing), walk, sit (by the fire), spar (guard / thrust),
 * smith (bare-headed, hammer up / down).
 */
export function renderSoldier(look: number, pose: SoldierPose, frame: number): Pix {
  const L = LOOKS[((look % SOLDIER_LOOKS) + SOLDIER_LOOKS) % SOLDIER_LOOKS];
  const f = frame % 2;
  const px = new Pix(SOLDIER_W, SOLDIER_H);
  const fx = 5; // body column (centre)
  const feet = 13;
  const sit = pose === 'sit';
  const bob = pose === 'walk' && f === 1 ? -1 : 0;
  const top = (sit ? feet - 8 : feet - 11) + bob; // helmet top row
  const helm = pose !== 'smith';
  /** Thin things (spear, hammer) drawn after the sel-out. */
  const late: (() => void)[] = [];
  // shadow
  px.set(fx - 1, feet + 1, KIT.shade, 90);
  px.set(fx, feet + 1, KIT.shade, 90);
  px.set(fx + 1, feet + 1, KIT.shade, 90);
  px.set(fx + 2, feet + 1, KIT.shade, 60);
  // legs
  const sk = L.skin;
  const sandal = 0x5a3a28;
  if (sit) {
    px.hline(fx, fx + 2, feet - 1, sk[1]);
    px.hline(fx, fx + 2, feet, sk[2]);
    px.set(fx + 3, feet, sandal);
    px.set(fx + 3, feet - 1, sandal);
  } else if (pose === 'walk') {
    if (f === 0) {
      px.set(fx - 1, feet - 1, sk[1]);
      px.set(fx + 1, feet - 1, sk[2]);
      px.set(fx - 1, feet, sandal);
      px.set(fx + 2, feet, sandal);
      px.set(fx + 1, feet, sk[2]);
    } else {
      px.vline(fx, feet - 2, feet - 1, sk[1]);
      px.set(fx, feet, sandal);
      px.set(fx + 1, feet, sandal);
    }
  } else if (pose === 'spar') {
    px.set(fx - 1, feet - 1, sk[1]);
    px.set(fx + 1 + f, feet - 1, sk[2]);
    px.set(fx - 1, feet, sandal);
    px.set(fx + 2 + f, feet, sandal);
  } else {
    px.vline(fx - 1, feet - 2, feet - 1, sk[1]);
    px.vline(fx + 1, feet - 2, feet - 1, sk[2]);
    px.set(fx - 1, feet, sandal);
    px.set(fx + 1, feet, sandal);
  }
  // tunic (with a darker belt), 3 wide, 4 tall
  const ty = top + 4;
  const T = pose === 'smith' ? KIT.wood.slice(1) : L.tunic;
  for (let y = ty; y < ty + (sit ? 3 : 4); y++) {
    px.set(fx - 1, y, T[0]);
    px.set(fx, y, T[1]);
    px.set(fx + 1, y, T[2]);
  }
  px.set(fx - 1, ty + (sit ? 3 : 4), T[1]);
  px.set(fx + 1, ty + (sit ? 3 : 4), T[2]);
  if (!sit) px.set(fx, ty + 4, T[2]);
  px.set(fx, ty + 2, 0x6a4a38); // belt
  // head
  px.set(fx - 1, top + 2, sk[0]);
  px.set(fx, top + 2, sk[1]);
  px.set(fx + 1, top + 2, sk[1]);
  px.set(fx, top + 3, sk[2]);
  px.set(fx + 1, top + 3, sk[1]);
  if (helm) {
    px.hline(fx - 1, fx + 1, top + 1, P.bronze[0]);
    px.set(fx + 1, top + 1, P.bronze[1]);
    px.set(fx - 1, top + 2, P.bronze[1]); // cheek guard (back of the head)
    px.set(fx - 1, top + 3, P.bronze[2]);
    // crest: a fan from front to back, it sways while idle
    const sway = pose === 'idle' && f === 1 ? 1 : 0;
    px.hline(fx - 2 + sway, fx + 1, top, L.crest);
    px.set(fx - 2 + sway, top + 1, L.crest);
  } else {
    px.hline(fx - 1, fx + 1, top + 1, L.hair);
    px.set(fx - 1, top + 2, L.hair);
  }
  // arms, shield and spear
  const sh = L.shield;
  const shield = (x: number, y: number) => {
    px.vline(x, y, y + 3, P.bronze[1]);
    px.vline(x + 1, y, y + 3, sh[0]);
    px.vline(x + 2, y, y + 3, sh[1]);
    px.set(x + 1, y - 1, P.bronze[0]);
    px.set(x + 1, y + 4, P.bronze[2]);
    px.set(x + 2, y + 1, P.bronze[0]);
  };
  if (pose === 'idle' || pose === 'walk') {
    // spear upright in the front hand, shield on the near arm
    px.set(fx + 2, ty + 1, sk[1]);
    shield(fx - 3, ty);
    late.push(() => {
      px.vline(fx + 3, top - 2, feet - 1, KIT.wood[3]);
      px.set(fx + 3, top - 3, KIT.iron[0]);
      px.set(fx + 3, ty + 1, sk[2]);
    });
  } else if (pose === 'sit') {
    // hands to the fire, spear laid down behind, shield leaning
    px.set(fx + 2, ty + 1 + f, sk[1]);
    shield(fx - 4, ty + 1);
    late.push(() => px.line(fx - 5, feet, fx + 5, feet - 3, KIT.wood[3]));
  } else if (pose === 'spar') {
    // spear levelled: guard (f0) or thrust (f1)
    const sy = ty + 1;
    const reach = f ? 4 : 1;
    px.set(fx + 1 + (f ? 1 : 0), sy, sk[1]);
    shield(fx, ty - 1);
    late.push(() => {
      px.hline(fx - 3 + reach, fx + 3 + reach, sy, KIT.wood[3]);
      px.set(fx + 4 + reach, sy, KIT.iron[0]);
    });
  } else {
    // smith: hammer raised (f0) or struck (f1)
    if (f === 0) {
      px.vline(fx + 2, top + 1, ty + 1, sk[1]);
      late.push(() => {
        px.set(fx + 2, top, KIT.wood[3]);
        px.hline(fx + 1, fx + 3, top - 1, KIT.iron[2]);
      });
    } else {
      px.set(fx + 2, ty + 1, sk[1]);
      late.push(() => {
        px.set(fx + 3, ty + 2, KIT.wood[3]);
        px.hline(fx + 3, fx + 4, ty + 3, KIT.iron[2]);
      });
    }
  }
  kitOutline(px);
  for (const fn of late) fn();
  return px;
}

/** All soldier frames of one look side by side: pose p, frame f at x = (p * 2 + f) * SOLDIER_W. */
function renderSoldierSheet(look: number): Pix {
  const out = new Pix(SOLDIER_W * SOLDIER_POSES.length * 2, SOLDIER_H);
  SOLDIER_POSES.forEach((p, i) => {
    for (let f = 0; f < 2; f++) out.blit(renderSoldier(look, p, f), (i * 2 + f) * SOLDIER_W, 0);
  });
  return out;
}

/** Frame index in a soldier sheet. */
export function soldierFrame(pose: SoldierPose, f: number): number {
  return SOLDIER_POSES.indexOf(pose) * 2 + (f % 2);
}

/**
 * Registers the camp kit textures once per game: `ck_tent_<look>[_big]`,
 * `ck_fire_<0..3>`, `ck_fire_out`, `ck_std_<0..3>`, `ck_prop_<kind>`,
 * `ck_soldier_<look>` (a sheet with numbered frames, see soldierFrame) and
 * `ck_coal_<0|1>`, `ck_puff0..2` (smoke) / `ck_spark` pixels.
 */
export function registerCampKit(scene: Phaser.Scene): void {
  if (scene.textures.exists('ck_spark')) return;
  const add = (key: string, px: Pix) => scene.textures.addCanvas(key, px.toCanvas());
  for (let l = 0; l < 4; l++) add(`ck_tent_${l}`, renderTent(l as TentLook));
  add('ck_tent_3_big', renderTent(3, true));
  for (let f = 0; f < 4; f++) {
    add(`ck_fire_${f}`, renderCampfire(f));
    add(`ck_std_${f}`, renderStandard(f));
  }
  add('ck_fire_out', renderCampfire(0, false));
  for (let f = 0; f < 2; f++) {
    const coal = new Pix(5, 2);
    for (let x = 0; x < 5; x++) {
      coal.set(x, 1, (x + f) % 2 ? KIT.ember[1] : KIT.ember[2]);
      if ((x + f) % 3 === 0) coal.set(x, 0, f ? KIT.ember[0] : KIT.ember[1]);
    }
    add(`ck_coal_${f}`, coal);
  }
  const props: PropKind[] = ['crate', 'crates', 'amphora', 'amphorae', 'sack', 'sacks', 'logs', 'barrel', 'pot', 'rack', 'dummy', 'target', 'anvil', 'shields', 'hay'];
  for (const k of props) add(`ck_prop_${k}`, renderProp(k));
  for (let l = 0; l < SOLDIER_LOOKS; l++) {
    const tex = add(`ck_soldier_${l}`, renderSoldierSheet(l));
    for (let i = 0; i < SOLDIER_POSES.length * 2; i++) tex?.add(i, 0, i * SOLDIER_W, 0, SOLDIER_W, SOLDIER_H);
  }
  // smoke puffs growing as they rise (2x2, 4x3, 5x4) and a 1x1 spark
  const puffs = [['##', '##'], ['.##.', '####', '.##.'], ['.###.', '#####', '#####', '.###.']];
  puffs.forEach((rows, i) => {
    const p = new Pix(rows[0].length, rows.length);
    p.bitmap(0, 0, rows, { '#': i === 0 ? KIT.smoke[0] : KIT.smoke[1] });
    // a lit top-left and a lavender underside so the puff reads on tan ground
    p.set(1, 0, KIT.smoke[0]);
    if (i > 0) {
      p.hline(1, rows[0].length - 2, rows.length - 1, KIT.smoke[2]);
      p.set(0, 1, KIT.smoke[0]);
    }
    add(`ck_puff${i}`, p);
  });
  const spark = new Pix(1, 1);
  spark.set(0, 0, 0xffffff);
  add('ck_spark', spark);
}
