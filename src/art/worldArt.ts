/**
 * Procedural pixel art for the overland map in the "ancient chart" look of
 * docs/ART_STYLE.md §6/§12: a lavender sea in depth bands with a light shelf,
 * foam and a dotted coastline, cream sand, a patchwork of sage land tiles with
 * wind-combed tufts, painted hills and mauve rock spires casting lavender
 * shadows to the south-east, blobby forest canopies with dotted rims, rivers
 * and dirt roads. Settlements, camp structures, plates and markers are
 * separate sprites. Everything is plain Pix work (no Phaser).
 */
import { P, mix } from './palette';
import { Pix, hash2, valueNoise } from './pixels';
import type { BandKind, SettlementKind, WorldMap } from '../world/map';
import type { StructureId } from '../world/camp';
import { KIT, drawStake, kitOutline, kitShadow, renderCampfire, renderProp, renderSoldier, renderTent, type PropKind } from './campArt';

export const WTILE = 8;

/** The map palette (a three-hue world: cream, lavender, sage). */
export const MAPC = {
  parch: [0xfde1c8, 0xfbdfc3, 0xf8e0c7, 0xf0dcc4],
  sea: [0x917899, 0x997fa0, 0xa187a6, 0xa98fac, 0xb197b2, 0xb69cb6, 0xbaa0b8],
  shelf: [0x9c7f98, 0xc4abc2, 0xcaafc0, 0xe6cbc8],
  foam: 0xf8ebe4,
  coastDot: 0x7f6270,
  cloudShadow: 0x7e5d8c,
  sand: [0xf7dac3, 0xfde0c7, 0xfee2ca],
  sandDot: 0xe2bfa8,
  grass: [0xd1c286, 0xd7cb88, 0xdcc992, 0xdece95],
  scrub: [0xdccb98, 0xe4d4a6, 0xd6c48e],
  forestFloor: [0xc8c07e, 0xcdc584],
  hillFloor: [0xd9c595, 0xd2bc8c],
  rockFloor: [0xd8bcb4, 0xcfb0ac],
  canopy: [0xe4e6a8, 0xc8d08a, 0xa8b46a, 0x86924e, 0x67703e],
  earth: [0x856a52, 0xa38b70, 0xb19c7c, 0xc4a88f, 0xe8d4ac],
  rock: [0xe4ccc8, 0xd2b4b8, 0xc4a2ac, 0xa5818d, 0x7f5f6e],
  snow: 0xfbeee4,
  stone: [0xf6e2d6, 0xefd4c6, 0xe0c2b6, 0xd5b5af, 0xb79690],
  roof: [0xb48c88, 0x937372, 0x81605f, 0x5e4448],
  teal: [0xd6e2da, 0xbecec6, 0x86b6ae, 0x5e8e88],
  oxblood: [0xc0606a, 0x894039, 0x5e2427],
  route: 0x7fa9a8,
  plot: [0xfde0ae, 0xaf8370],
  plotDot: 0xb06030,
  shade: 0x6e4f6a,
};

// ------------------------------------------------------------- settlements

export function renderSettlement(kind: SettlementKind, variant: number, coastal: boolean): Pix {
  if (kind === 'town') return town(variant, coastal);
  if (kind === 'village') return village(variant);
  return lair(variant, coastal);
}

const ST = MAPC.stone;
const RF = MAPC.roof;
const TL = MAPC.teal;

/** A square house block seen from above: cream or tiled roof slab, lit top-left, dark outline and south face. */
function block(px: Pix, x: number, y: number, w: number, h: number, roof: number[], court = false): void {
  const ink = RF[2];
  px.rect(x, y, w, h, roof[1]);
  px.hline(x + 1, x + w - 2, y + 1, roof[0]);
  px.vline(x + 1, y + 1, y + h - 2, roof[0]);
  // outline and south wall face
  px.hline(x, x + w - 1, y, ink);
  px.hline(x, x + w - 1, y + h - 1, ink);
  px.vline(x, y, y + h - 1, ink);
  px.vline(x + w - 1, y, y + h - 1, ink);
  px.hline(x, x + w - 1, y + h, ST[4]);
  if (court && w >= 6 && h >= 5) {
    px.rect(x + 2, y + 2, w - 4, h - 4, ST[3]);
    px.hline(x + 2, x + w - 3, y + 2, ink);
  } else if (w >= 5) {
    // a ridge line
    px.hline(x + 2, x + w - 3, y + Math.floor(h / 2), roof[2]);
  }
}

function tower(px: Pix, x: number, y: number): void {
  for (let j = 0; j < 7; j++) px.set(x + 5, y + 2 + j, MAPC.shade, 80);
  px.rect(x, y + 2, 5, 6, ST[1]);
  px.vline(x + 4, y + 2, y + 7, ST[4]);
  px.hline(x, x + 4, y + 7, ST[4]);
  px.rect(x, y, 5, 3, TL[2]);
  px.hline(x, x + 3, y, TL[0]);
  px.set(x + 2, y - 1, TL[1]);
  px.hline(x, x + 4, y + 2, TL[3]);
  px.set(x + 2, y + 5, RF[3]);
}

function town(variant: number, coastal: boolean): Pix {
  const W = 50;
  const H = 44;
  const px = new Pix(W, H);
  const L = 4; // left wall
  const R = 45; // right wall
  const Tp = 10; // top wall
  const B = 40; // bottom wall
  // ground shadow under the whole walled city (lavender, SE)
  for (let y = Tp + 2; y < B + 3; y++) for (let x = L + 2; x < R + 3; x++) px.set(x, y, MAPC.shade, 70);
  // paved floor with stone speckle
  px.rect(L, Tp, R - L + 1, B - Tp + 1, ST[1]);
  for (let y = Tp; y <= B; y++) for (let x = L; x <= R; x++) if (hash2(x, y, variant + 3) > 0.86) px.set(x, y, ST[2]);
  // the wall: crenellated top, thick lit rim
  for (let x = L; x <= R; x++) {
    px.set(x, Tp - 1, x % 2 ? ST[0] : ST[2]);
    px.set(x, Tp, ST[0]);
    px.set(x, Tp + 1, ST[3]);
    px.set(x, B, ST[2]);
    px.set(x, B + 1, ST[4]);
    px.set(x, B - 1, x % 2 ? ST[0] : ST[1]);
  }
  for (let y = Tp; y <= B; y++) {
    px.set(L, y, ST[2]);
    px.set(L + 1, y, ST[0]);
    px.set(R, y, ST[4]);
    px.set(R - 1, y, ST[2]);
  }
  // the avenue (north-south) and a cross street
  const avenue = variant % 2 ? 26 : 22;
  const cross = 26;
  px.rect(avenue - 1, Tp + 2, 3, B - Tp - 2, ST[0]);
  px.rect(L + 2, cross, R - L - 3, 2, ST[0]);
  // house blocks in the four quarters
  const cols = [L + 3, L + 10];
  const cols2 = [avenue + 3, avenue + 10];
  const rows = [Tp + 11, cross + 2, cross + 8];
  let n = 0;
  for (const ry of rows) {
    for (const cx of [...cols, ...cols2]) {
      n++;
      if (cx + 6 >= R - 1 || (cx < avenue && cx + 6 >= avenue - 1)) continue;
      if (ry + 5 > B - 1) continue;
      if (ry > cross + 4 && Math.abs(cx + 3 - avenue) < 12) continue; // the gate towers
      const tiled = (n + variant) % 3 === 0;
      block(px, cx, ry, 6, 5, tiled ? RF : [ST[0], ST[2], ST[3], ST[4]], (n + variant) % 4 === 1);
    }
  }
  // temple with a teal roof and a colonnade on the acropolis (north quarter)
  const tx = variant % 2 ? L + 4 : avenue + 4;
  px.rect(tx - 1, Tp + 2, 16, 9, ST[0]);
  for (let j = 0; j < 9; j++) px.set(tx + 15, Tp + 3 + j, MAPC.shade, 80);
  px.rect(tx, Tp + 2, 14, 5, TL[2]);
  px.hline(tx, tx + 13, Tp + 2, TL[0]);
  px.hline(tx, tx + 13, Tp + 3, TL[1]);
  px.hline(tx, tx + 13, Tp + 6, TL[3]);
  for (let k = 0; k < 7; k++) {
    px.vline(tx + k * 2, Tp + 7, Tp + 9, ST[0]);
    px.vline(tx + 1 + k * 2, Tp + 7, Tp + 9, ST[4]);
  }
  px.hline(tx - 1, tx + 14, Tp + 10, ST[3]);
  // a grove on the other side of the acropolis
  const gx = variant % 2 ? avenue + 6 : L + 6;
  px.ellipse(gx, Tp + 3, 6, 6, (_x, _y, e, u, v) => (e && (u > 0 || v > 0) ? MAPC.canopy[3] : u + v < -0.3 ? MAPC.canopy[0] : MAPC.canopy[1]));
  px.ellipse(gx + 5, Tp + 4, 5, 5, (_x, _y, e, u, v) => (e && (u > 0 || v > 0) ? MAPC.canopy[3] : u + v < -0.3 ? MAPC.canopy[0] : MAPC.canopy[2]));
  // gate in the south wall, towers at the corners and flanking the gate
  px.rect(avenue - 1, B - 1, 3, 3, RF[3]);
  tower(px, L - 3, Tp - 4);
  tower(px, R - 2, Tp - 4);
  tower(px, L - 3, B - 5);
  tower(px, R - 2, B - 5);
  tower(px, avenue - 6, B - 5);
  tower(px, avenue + 3, B - 5);
  if (coastal) {
    // a harbour mole with a moored boat
    px.rect(R + 1, cross, 4, 2, MAPC.earth[2]);
    px.hline(R + 1, R + 4, cross, MAPC.earth[3]);
    px.hline(R + 1, R + 4, cross + 3, MAPC.oxblood[1]);
    px.hline(R + 2, R + 4, cross + 4, MAPC.earth[0]);
  }
  px.outline(mix(RF[3], MAPC.shade, 0.3));
  return px;
}

function village(variant: number): Pix {
  const px = new Pix(28, 22);
  // fields: striped strips beside the houses
  const fx = variant % 2 ? 1 : 17;
  for (let y = 12; y < 20; y++) for (let x = fx; x < fx + 10; x++) px.set(x, y, y % 2 ? 0xe4d29a : 0xcdb878);
  for (let x = fx; x < fx + 10; x += 2) px.set(x, 20, MAPC.earth[1]);
  // houses (shadows first)
  const houses: [number, number, number, number, boolean][] = [
    [3, 3, 7, 6, false],
    [12, 1, 8, 7, variant % 2 === 1],
    [variant % 2 ? 15 : 5, 11, 6, 5, false],
  ];
  for (const [x, y, w, h] of houses) for (let j = 1; j <= h + 1; j++) for (let i = 1; i <= w + 1; i++) px.set(x + i, y + j, MAPC.shade, 60);
  for (const [x, y, w, h, tile] of houses) {
    const roof = tile ? [0xd0a8a0, 0xb48c88, 0x937372, 0x81605f] : [0xf6e2b0, 0xe6c890, 0xc4a474, 0x9a7e5e];
    block(px, x, y, w, h, roof);
    px.set(x + Math.floor(w / 2), y + h, 0x5e4448);
  }
  // a well and an olive tree
  px.rect(22, 5, 3, 3, ST[2]);
  px.set(23, 6, MAPC.sea[2]);
  px.ellipse(variant % 2 ? 2 : 22, 11, 5, 5, (_x, _y, e, u, v) => (e && (u > 0 || v > 0) ? MAPC.canopy[3] : u + v < -0.3 ? MAPC.canopy[0] : MAPC.canopy[1]));
  px.outline(RF[2]);
  return px;
}

function lair(variant: number, coastal: boolean): Pix {
  const px = new Pix(24, 20);
  const cloth = coastal ? [0x9a8aa0, 0x7a6a84, 0x5a4a66] : variant % 2 ? [0xb08a64, 0x8e6a48, 0x6a4c34] : [0xa4a070, 0x86824e, 0x666236];
  // trampled ground
  px.ellipse(1, 7, 22, 12, (_x, _y, e) => (e ? null : 0xd8c09a));
  const tent = (x: number, y: number, s: number) => {
    for (let dy = 0; dy < s; dy++) for (let dx = -dy; dx <= dy + 1; dx++) px.set(x + dx + 2, y + dy + 1, MAPC.shade, 60);
    for (let dy = 0; dy < s; dy++) for (let dx = -dy; dx <= dy; dx++) px.set(x + dx, y + dy, dx < 0 ? cloth[0] : dx === 0 ? cloth[2] : cloth[1]);
    px.set(x, y + s - 1, 0x3a2420);
    px.set(x, y + s - 2, 0x3a2420);
  };
  tent(7, 4, 8);
  tent(16, 8, 7);
  // fire
  px.hline(10, 14, 17, MAPC.rock[3]);
  px.set(12, 16, 0xffd070);
  px.set(12, 15, 0xf08040);
  px.set(11, 16, 0xc04a30);
  px.set(13, 16, 0xc04a30);
  // banner on a pole
  px.vline(21, 0, 16, MAPC.earth[0]);
  px.rect(18, 0, 3, 4, coastal ? 0x3a2a34 : MAPC.oxblood[1]);
  px.set(19, 1, 0xf0e0d0);
  px.outline(mix(RF[3], MAPC.shade, 0.4));
  return px;
}

/** A small docked boat (for coastal towns): hull and a furled sail, 12x7. */
export function renderBoat(): Pix {
  const px = new Pix(12, 8);
  for (let x = 1; x < 11; x++) px.set(x + 1, 6, MAPC.shade, 70);
  px.hline(1, 10, 4, MAPC.earth[1]);
  px.hline(2, 9, 5, MAPC.earth[0]);
  px.hline(0, 11, 3, MAPC.oxblood[1]);
  px.vline(6, 0, 3, MAPC.earth[0]);
  px.hline(4, 8, 1, MAPC.stone[0]);
  return px;
}

/**
 * A settlement's name plate: a little parchment scroll with darker rolled caps
 * (the text goes on top as a bitmap font).
 */
export function renderNamePlate(w: number, kind: SettlementKind): Pix {
  const h = 10;
  const px = new Pix(w + 4, h + 1);
  const paper = kind === 'lair' ? 0xe0bfaf : MAPC.parch[0];
  for (let x = 2; x < w + 2; x++) px.set(x + 1, h, MAPC.shade, 80);
  px.rect(2, 0, w, h, paper);
  px.hline(2, w + 1, 0, 0xfff2e2);
  px.hline(2, w + 1, h - 1, 0xd8b8a4);
  // checker-dither underline (UI motif)
  for (let x = 3; x < w + 1; x++) if (x % 2 === 0) px.set(x, h - 2, 0xe8cbb8);
  // rolled caps
  for (const cx of [0, w + 2]) {
    px.rect(cx, 0, 2, h, 0x8e725c);
    px.vline(cx, 1, h - 2, 0xb6957c);
  }
  return px;
}

// ------------------------------------------------------------- camp

/**
 * Camp zone overlay (ART_STYLE §13, the footage's camp plots): trodden earth
 * in a tan / pink 2x2 checker, footpaths worn from the camp's heart to each
 * structure, scattered supplies (crates, amphorae, sacks, logs, hay) on the
 * free tiles, and a ring of sharpened stakes along the border once the
 * palisade stands. The dotted border itself is drawn by the scene (it marches).
 */
export function renderCampZone(
  m: WorldMap,
  zone: number[],
  palisade: boolean,
  built: { id: StructureId; x: number; y: number; w: number; h: number }[] = [],
  heart?: { x: number; y: number },
): { pix: Pix; x: number; y: number } {
  const set = new Set(zone);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const i of zone) {
    const x = i % m.w;
    const y = Math.floor(i / m.w);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const S = WTILE;
  const ox = minX * S - 4;
  const oy = minY * S - 8;
  const px = new Pix((maxX - minX + 1) * S + 8, (maxY - minY + 1) * S + 12);
  const inZ = (tx: number, ty: number) => set.has(ty * m.w + tx);
  // distance to the zone edge (in px) for a soft trodden centre
  const edgeD = (X: number, Y: number) => {
    const tx = Math.floor(X / S);
    const ty = Math.floor(Y / S);
    let d = 99;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        if (inZ(tx + dx, ty + dy)) continue;
        const ex = Math.max((tx + dx) * S - X, X - ((tx + dx) * S + S - 1), 0);
        const ey = Math.max((ty + dy) * S - Y, Y - ((ty + dy) * S + S - 1), 0);
        d = Math.min(d, Math.max(ex, ey));
      }
    return d;
  };
  for (const i of zone) {
    const tx = i % m.w;
    const ty = Math.floor(i / m.w);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const X = tx * S + x;
        const Y = ty * S + y;
        const ch = ((X >> 1) + (Y >> 1)) % 2 === 0;
        const d = edgeD(X, Y);
        const n = hash2(X, Y, 91);
        // grass tufts survive near the edge; the middle is worn to earth
        let c: number = d < 2 && n > 0.55 ? MAPC.grass[1] : n > 0.985 ? KIT.earth[3] : n > 0.94 ? KIT.earth[0] : KIT.earth[1];
        // trodden-grass strokes (vertical pairs) in clumps
        if (d >= 2 && valueNoise(X, Y, 5, 31) > 0.62 && (X + (Y >> 1)) % 3 === 0 && hash2(X, Y >> 1, 32) > 0.4) c = Y % 2 ? KIT.earth[2] : KIT.earth[0];
        if (d >= 2 && d < 4 && n > 0.86) c = MAPC.grass[0];
        px.set(X - ox, Y - oy, c);
        px.set(X - ox, Y - oy, ch ? MAPC.plot[0] : MAPC.plot[1], ch ? 90 : 55);
      }
  }
  // grass tufts (2 px vertical) left standing
  for (const i of zone) {
    const tx = i % m.w;
    const ty = Math.floor(i / m.w);
    for (let k = 0; k < 2; k++) {
      const X = tx * S + Math.floor(hash2(tx, ty, 40 + k) * 7);
      const Y = ty * S + Math.floor(hash2(tx, ty, 50 + k) * 6) + 1;
      if (edgeD(X, Y) > 3 || hash2(tx, ty, 60 + k) < 0.4) continue;
      px.set(X - ox, Y - oy, MAPC.canopy[3]);
      px.set(X - ox, Y - 1 - oy, MAPC.canopy[2]);
      px.set(X + 1 - ox, Y - oy, MAPC.canopy[2]);
    }
  }
  // footpaths: worn darker earth from the heart to each structure's door
  const taken = new Set<number>();
  if (heart) taken.add(heart.y * m.w + heart.x);
  for (const b of built) for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) taken.add((b.y + j) * m.w + b.x + i);
  if (heart) {
    const hx = heart.x * S + 4;
    const hy = heart.y * S + 6;
    for (const b of built) {
      const bx = b.x * S + Math.floor((b.w * S) / 2);
      const by = (b.y + b.h) * S;
      let x = hx;
      let y = hy;
      // an L-shaped path, 2 px wide, dithered at its edges
      const step = (X: number, Y: number) => {
        for (const [dx, dy, a] of [[0, 0, 150], [1, 0, 150], [0, 1, 90], [-1, 0, 60], [2, 0, 60]] as const) {
          const PX = X + dx;
          const PY = Y + dy;
          if (!inZ(Math.floor(PX / S), Math.floor(PY / S))) continue;
          if (a < 100 && (PX + PY) % 2) continue;
          px.set(PX - ox, PY - oy, KIT.earth[3], a);
        }
      };
      while (x !== bx) {
        step(x, y);
        x += Math.sign(bx - x);
      }
      while (y !== by) {
        step(x, y);
        y += Math.sign(by - y);
      }
    }
  }
  // scattered supplies on free tiles away from the heart
  const props: PropKind[] = ['crates', 'amphorae', 'sacks', 'logs', 'hay', 'amphora', 'crate', 'barrel', 'sack'];
  let placed = 0;
  const cands = zone.filter((i) => !taken.has(i));
  for (const i of cands) {
    const tx = i % m.w;
    const ty = Math.floor(i / m.w);
    if (heart && Math.abs(tx - heart.x) + Math.abs(ty - heart.y) < 2) continue;
    if (hash2(tx, ty, m.seed ^ 77) > 0.34 || placed >= 6) continue;
    // keep a neighbour gap so the props do not crowd
    if (taken.has(i - 1) || taken.has(i - m.w)) continue;
    const kind = props[Math.floor(hash2(tx, ty, 78) * props.length)];
    const p = renderProp(kind);
    px.blit(p, tx * S + 4 - Math.floor(p.w / 2) - ox, ty * S + 7 - p.h + 1 - oy);
    taken.add(i);
    placed++;
  }
  if (palisade) {
    // sharpened stakes on every outer edge (the south ones in front, drawn later)
    const edges: { x: number; y: number; south: boolean }[] = [];
    for (const i of zone) {
      const tx = i % m.w;
      const ty = Math.floor(i / m.w);
      for (let k = 0; k < S; k += 2) {
        if (!inZ(tx, ty - 1)) edges.push({ x: tx * S + k, y: ty * S + 1, south: false });
        if (!inZ(tx - 1, ty)) edges.push({ x: tx * S, y: ty * S + k + 1, south: false });
        if (!inZ(tx + 1, ty)) edges.push({ x: tx * S + S - 2, y: ty * S + k + 1, south: false });
        if (!inZ(tx, ty + 1)) edges.push({ x: tx * S + k, y: ty * S + S - 1, south: true });
      }
    }
    edges.sort((a, b) => a.y - b.y || a.x - b.x);
    for (const e of edges) drawStake(px, e.x - ox, e.y - oy, 5 + (((e.x >> 1) + (e.y >> 1)) % 2));
    // a rail binding the stakes
    for (const e of edges) {
      px.set(e.x - ox, e.y - 2 - oy, KIT.rope, 200);
      px.set(e.x + 1 - ox, e.y - 2 - oy, KIT.rope, 200);
    }
  }
  return { pix: px, x: ox, y: oy };
}

/** Camp structure sprites: the footprint's top-left sits at (STRUCT_PAD, STRUCT_LIFT) inside the sprite. */
export const STRUCT_LIFT: Record<StructureId, number> = { tent: 5, fire: 5, palisade: 9, forge: 9, training: 5 };
export const STRUCT_PAD: Record<StructureId, number> = { tent: 2, fire: 2, palisade: 1, forge: 1, training: 1 };
/** Frames of each structure's own animation (fire flames, forge coals). */
export const STRUCT_FRAMES: Record<StructureId, number> = { tent: 1, fire: 4, palisade: 1, forge: 2, training: 1 };

/** Where smoke / sparks / sitters attach, relative to the footprint's top-left (px). */
export const STRUCT_FX: Record<StructureId, { smoke?: [number, number]; sparks?: [number, number]; work?: [number, number] }> = {
  tent: {},
  fire: { smoke: [4, -2], sparks: [4, 1] },
  palisade: {},
  forge: { smoke: [3, -9], sparks: [12, 4], work: [9, 7] },
  training: {},
};

/** A structure sprite; `look` varies the tents' cloth. */
export function renderStructure(id: StructureId, frame = 0, look = 0): Pix {
  const S = WTILE;
  const pad = STRUCT_PAD[id];
  const L = STRUCT_LIFT[id];
  if (id === 'tent') {
    const px = new Pix(S + 2 * pad + 1, S + L + 1);
    px.blit(renderTent((look % 4) as 0 | 1 | 2 | 3, 'small'), 0, 1);
    return px;
  }
  if (id === 'fire') {
    const px = new Pix(S + 2 * pad + 1, S + L + 1);
    // two log seats, then the fire
    for (const [x, y] of [[0, 11], [9, 11]]) {
      px.hline(x, x + 2, y, KIT.wood[1]);
      px.hline(x, x + 2, y + 1, KIT.wood[3]);
      px.set(x + 3, y + 1, KIT.shade, 80);
    }
    px.blit(renderCampfire(frame), 0, 0);
    return px;
  }
  if (id === 'palisade') {
    // the gateway: two stake towers joined by a lintel with the camp's banner, open between
    const px = new Pix(2 * S + 2 * pad, S + L + 1);
    const b = L + S - 1;
    for (const x of [2, 14]) {
      drawStake(px, x, b, 11);
      drawStake(px, x + (x < 8 ? -2 : 2), b, 6);
    }
    px.hline(1, 16, b - 9, KIT.wood[1]);
    px.set(1, b - 9, KIT.wood[0]);
    px.set(16, b - 9, KIT.wood[2]);
    // the banner hangs from the lintel's middle
    px.rect(7, b - 7, 4, 4, KIT.red[1]);
    px.vline(7, b - 7, b - 4, KIT.red[0]);
    px.set(8, b - 3, KIT.red[2]);
    px.set(10, b - 3, KIT.red[2]);
    px.set(8, b - 6, KIT.canvas[0]);
    px.set(9, b - 5, KIT.canvas[0]);
    kitOutline(px, KIT.rim);
    return px;
  }
  if (id === 'forge') {
    const px = new Pix(2 * S + 2 * pad + 2, S + L + 2);
    const b = L + S - 1;
    kitShadow(px, 1, b - 2, 18, 5, 70);
    // stone hearth with the coal mouth
    px.rect(1, b - 6, 8, 6, KIT.stone[2]);
    px.hline(1, 8, b - 6, KIT.stone[0]);
    px.hline(1, 8, b - 5, KIT.stone[1]);
    for (let x = 2; x < 8; x += 3) px.set(x, b - 3, KIT.stone[3]);
    px.vline(8, b - 6, b, KIT.stone[3]);
    px.rect(3, b - 3, 4, 3, 0x3a2428);
    const hot = frame % 2 === 0;
    px.hline(3, 6, b - 1, hot ? KIT.ember[1] : KIT.ember[2]);
    px.set(4, b - 2, hot ? KIT.ember[2] : KIT.ember[3]);
    px.set(5, b - 2, hot ? KIT.ember[0] : KIT.ember[1]);
    // chimney
    px.rect(2, b - 12, 3, 6, KIT.stone[2]);
    px.vline(2, b - 12, b - 7, KIT.stone[1]);
    px.hline(2, 4, b - 12, KIT.stone[0]);
    px.set(3, b - 12, 0x3a2428);
    // lean-to roof over the hearth on two posts
    for (let y = 0; y < 3; y++) px.hline(0, 10, b - 9 + y, y === 0 ? KIT.red[0] : y === 1 ? KIT.red[1] : KIT.red[2]);
    px.rect(2, b - 12, 3, 3, KIT.stone[2]);
    px.hline(2, 4, b - 12, KIT.stone[0]);
    px.set(3, b - 12, 0x3a2428);
    px.vline(10, b - 6, b, KIT.wood[3]);
    // bellows
    px.set(9, b - 2, KIT.wood[2]);
    px.hline(9, 10, b - 1, 0x8a6048);
    // anvil on a stump, a quench barrel
    px.rect(13, b - 2, 3, 3, KIT.wood[2]);
    px.hline(12, 16, b - 3, KIT.iron[1]);
    px.hline(13, 15, b - 4, KIT.iron[0]);
    px.set(17, b - 3, KIT.iron[2]);
    px.rect(17, b - 1, 2, 2, KIT.wood[1]);
    px.set(17, b - 1, 0x7a9cae);
    if (hot) px.set(14, b - 5, KIT.ember[1]);
    kitOutline(px, KIT.rim);
    // the coal glow spills out over the sel-out
    px.set(4, b + 1, KIT.ember[1], hot ? 110 : 70);
    px.set(5, b + 1, KIT.ember[1], hot ? 90 : 60);
    return px;
  }
  // training: a sand yard fenced with posts and rope, straw dummy, target and rack
  const W2 = 2 * S;
  const px = new Pix(W2 + 2 * pad, W2 + L + 1);
  const o = pad;
  for (let y = 1; y < W2 - 1; y++)
    for (let x = 1; x < W2 - 1; x++) {
      const n = hash2(x, y, 3);
      px.set(o + x, L + y, n > 0.88 ? KIT.earth[2] : n > 0.7 ? KIT.earth[0] : 0xeedcb4);
    }
  // rope fence on posts (dotted rope)
  for (let k = 0; k < W2; k++) {
    if (k % 2 === 0) {
      px.set(o + k, L, KIT.rope);
      px.set(o + k, L + W2 - 1, KIT.rope);
      px.set(o, L + k, KIT.rope);
      px.set(o + W2 - 1, L + k, KIT.rope);
    }
  }
  for (const [x, y] of [[0, 0], [W2 - 1, 0], [0, W2 - 1], [W2 - 1, W2 - 1], [Math.floor(W2 / 2), 0], [0, Math.floor(W2 / 2)], [W2 - 1, Math.floor(W2 / 2)]]) {
    px.vline(o + x, L + y - 2, L + y, KIT.wood[2]);
    px.set(o + x, L + y - 3, KIT.wood[0]);
  }
  px.blit(renderProp('dummy'), o + 1, L - 6);
  px.blit(renderProp('target'), o + W2 - 10, L - 7);
  px.blit(renderProp('shields'), o + W2 - 12, L + W2 - 8);
  return px;
}

/** Placement ghost tile: a dotted square, cyan (valid) or red (blocked). */
export function renderPlaceTile(ok: boolean): Pix {
  const S = WTILE;
  const px = new Pix(S, S);
  const c = ok ? 0x7fd0e0 : 0xb83d4a;
  for (let k = 0; k < S; k++) {
    if (k % 2 === 0) {
      px.set(k, 0, c);
      px.set(k, S - 1, c);
      px.set(0, k, c);
      px.set(S - 1, k, c);
    }
  }
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) px.set(x, y, c, (x + y) % 2 ? 60 : 30);
  return px;
}

/** Build dust: three frames of cream puffs, 16x12 each, side by side. */
export function renderDust(): Pix {
  const px = new Pix(48, 12);
  for (let f = 0; f < 3; f++) {
    const r = 2 + f * 2;
    for (let k = 0; k < 10 + f * 4; k++) {
      const a = hash2(k, f, 77) * Math.PI * 2;
      const d = r * (0.5 + hash2(k, f, 78) * 0.6);
      const x = Math.round(8 + Math.cos(a) * d);
      const y = Math.round(7 + Math.sin(a) * d * 0.6);
      if (f === 2 && hash2(k, f, 79) > 0.5) continue;
      px.set(f * 16 + x, y, k % 3 ? MAPC.parch[3] : 0xfff2e2);
    }
  }
  return px;
}

// ------------------------------------------------------------- party figures

export const BAND_COLORS: Record<BandKind | 'player' | 'pirates', number> = {
  player: 0x4a6b8a,
  bandits: 0x8a5a32,
  raiders: 0x5f7a45,
  mercs: 0x3e3a4a,
  pirates: 0x2a2a2a,
};

/** Party miniature frames: PARTY_FRAMES walk frames of PARTY_FW x PARTY_FH side by side; feet at PARTY_FOOT. */
export const PARTY_FW = 24;
export const PARTY_FH = 22;
export const PARTY_FRAMES = 4;
export const PARTY_FOOT = { x: 13, y: 20 };
/** Where the standard's finial sits in each frame (supporter glint). */
export const PARTY_FINIAL = { x: 17, y: 1 };

/**
 * A marching party in the field-camp soldiers' style (src/art/campArt.ts): a
 * standard-bearer in front with the banner waving, a hoplite behind, tunics
 * in the band's colour. Four walk frames side by side.
 */
export function renderPartyFigure(color: number, flag: number): Pix {
  const out = new Pix(PARTY_FW * PARTY_FRAMES, PARTY_FH);
  const tunicFrom = [0xf2e8d2, 0xd8c8a8, 0xb0a084];
  const tunicTo = [mix(color, 0xffffff, 0.28), color, mix(color, 0x000000, 0.3)];
  const recolor = (q: Pix) => {
    for (let y = 0; y < q.h; y++)
      for (let x = 0; x < q.w; x++) {
        if (!q.alpha(x, y)) continue;
        const k = tunicFrom.indexOf(q.get(x, y));
        if (k >= 0) q.set(x, y, tunicTo[k]);
      }
    return q;
  };
  const flagLo = mix(flag, 0x000000, 0.28);
  const flagHi = mix(flag, 0xffffff, 0.3);
  for (let f = 0; f < PARTY_FRAMES; f++) {
    const ox = f * PARTY_FW;
    const back = recolor(renderSoldier(5, 'walk', (f + 1) % 2));
    const lead = recolor(renderSoldier(0, 'walk', f % 2));
    out.blit(back, ox + 1, 3);
    // the standard: a pole with a gilded finial and a waving swallow-tailed cloth
    const bob = f % 2 ? -1 : 0;
    const px0 = ox + PARTY_FINIAL.x;
    out.vline(px0, 2 + bob, 18 + bob, KIT.wood[3]);
    out.set(px0, 1 + bob, P.gold);
    for (let i = 0; i < 6; i++) {
      const dy = Math.round(Math.sin(i * 0.9 - f * (Math.PI / 2)) * 0.9);
      const len = i < 5 ? 4 : 2;
      for (let k = 0; k < len; k++) {
        const slope = Math.cos(i * 0.9 - f * (Math.PI / 2));
        out.set(px0 + 1 + i, 3 + bob + dy + k, k === 0 ? flagHi : slope < -0.3 ? flagLo : flag);
      }
      out.set(px0 + 1 + i, 3 + bob + dy + len, mix(flagLo, KIT.ink, 0.4));
    }
    out.blit(lead, ox + 8, 6);
  }
  return out;
}

/** The tap target: a dashed square in the route's cyan-grey (11x11). */
export function renderMarker(): Pix {
  const px = new Pix(11, 11);
  const c = MAPC.route;
  for (let k = 0; k < 11; k++) {
    if (k % 3 === 2) continue;
    px.set(k, 0, c);
    px.set(k, 10, c);
    px.set(0, k, c);
    px.set(10, k, c);
  }
  for (let y = 2; y < 9; y++) for (let x = 2; x < 9; x++) if ((x + y) % 2 === 0) px.set(x, y, c, 120);
  px.set(5, 5, 0xe6f2ee);
  return px;
}
