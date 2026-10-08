/**
 * Procedural pixel art of the online camps (docs/ART_STYLE.md §13 "Camp"):
 * the five buildings (small top-down 3/4 huts and towers, ~24 gp, stone /
 * cream walls, oxblood or teal roofs, a lavender south-east shadow and a
 * dotted dark rim) at levels 1-3, their team-cyan placement ghosts, the
 * single-colour pictogram icons of the build row, the camp-zone tile (tan /
 * pink 2x2 checker at ~40%, dotted orange-brown border in two "marching
 * ants" phases), the valid / invalid slot markers and the 3-frame cream dust
 * puff played on placement. Pure Pix (no Phaser) except registerCampTextures.
 */
import type Phaser from 'phaser';
import { P } from './palette';
import { Pix, hash2 } from './pixels';
import { renderIcon } from './uiTextures';
import type { CampBuildingId } from '../online/rules';

export const CAMP_SPRITE = 24;

/** Camp palette (sampled from the map and UI language of ART_STYLE §6). */
export const CAMP_COLOR = {
  rim: 0x4a2e2a,
  shadow: 0x5e4a6a,
  checkA: 0xfde0ae,
  checkB: 0xaf8370,
  border: 0xb06030,
  cyan: 0x7fd0e0,
  cyanDark: 0x3f8fa0,
  cyanLight: 0xc4eef4,
  invalid: 0xb83d4a,
  dust: 0xf0dcc4,
  dustShade: 0xd8bfa4,
} as const;

const WOOD = [0xb88a5a, 0x9a7048, 0x7a5532, 0x57391f];
const STONE = [0xf0e2c8, 0xdcc8a8, 0xbca486, 0x957c64];
const OXBLOOD = [0xc85a44, 0xa83a2c, 0x8c2f25, 0x6e2219];
const STRAW = [0xf0d488, 0xe0c070, 0xc8a050, 0x9a7838];

/** 1 gp dotted rim (every other pixel) around the opaque pixels. */
function dottedRim(px: Pix, c: number): void {
  const marks: number[] = [];
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      if (px.alpha(x, y) > 0 || (x + y) % 2) continue;
      if (px.alpha(x - 1, y) > 128 || px.alpha(x + 1, y) > 128 || px.alpha(x, y - 1) > 128 || px.alpha(x, y + 1) > 128) marks.push(x, y);
    }
  for (let i = 0; i < marks.length; i += 2) px.set(marks[i], marks[i + 1], c);
}

/** Flat translucent shadow cast to the SE, under everything. */
function shadow(px: Pix, x: number, y: number, w: number, h: number): void {
  px.ellipse(x + 2, y + 1, w, h, () => CAMP_COLOR.shadow);
  // make it translucent: rewrite as alpha pixels
  for (let yy = 0; yy < px.h; yy++)
    for (let xx = 0; xx < px.w; xx++) {
      const i = (yy * px.w + xx) * 4;
      if (px.data[i + 3] === 255 && px.get(xx, yy) === CAMP_COLOR.shadow) px.data[i + 3] = 110;
    }
}

function door(px: Pix, x: number, y: number, h = 3): void {
  px.rect(x, y, 2, h, 0x3a2420);
  px.set(x, y, 0x5a3a2a);
}

function flag(px: Pix, x: number, y: number, h: number, c = OXBLOOD[1]): void {
  px.vline(x, y, y + h, WOOD[3]);
  px.rect(x + 1, y, 3, 2, c);
  px.set(x + 3, y + 2, c);
  px.set(x + 1, y, OXBLOOD[0]);
}

function palisade(px: Pix, level: number): void {
  const x0 = 2;
  const x1 = 20;
  const y0 = 7;
  const y1 = 20;
  shadow(px, x0, y1 - 3, x1 - x0 + 2, 6);
  // trampled yard with a path to the gate
  px.rect(x0 + 1, y0, x1 - x0, y1 - y0, KIT.earth[1]);
  for (let i = 0; i < 14; i++) px.set(x0 + 2 + ((i * 7) % (x1 - x0 - 3)), y0 + 1 + ((i * 5) % (y1 - y0 - 2)), i % 3 ? KIT.earth[2] : KIT.earth[0]);
  const gate = Math.floor((x0 + x1) / 2);
  for (let y = y0 + 4; y <= y1; y++) px.hline(gate - 1, gate + 1, y, KIT.earth[3]);
  // a tent and a crate inside
  px.blit(renderTent(1, 'small'), gate - 6, y0 - 1);
  px.blit(renderProp('crate'), x0 + 2, y1 - 8);
  // stakes: back wall, side walls, front wall with its gateway
  for (let x = x0; x <= x1; x += 2) drawStake(px, x, y0 + 1, 5 + (x % 4 === 0 ? 1 : 0));
  for (let y = y0 + 2; y <= y1 - 1; y += 2) {
    drawStake(px, x0, y + 1, 4);
    drawStake(px, x1, y + 1, 4);
  }
  for (let x = x0; x <= x1; x += 2) if (Math.abs(x + 1 - gate) > 2) drawStake(px, x, y1 + 1, 5 + (x % 4 === 0 ? 1 : 0));
  // gate posts
  for (const gx of [gate - 3, gate + 2]) {
    px.vline(gx, y1 - 6, y1 + 1, KIT.wood[1]);
    px.vline(gx + 1, y1 - 6, y1 + 1, KIT.wood[3]);
    px.set(gx, y1 - 7, KIT.wood[0]);
  }
  if (level >= 2) {
    // corner towers on the back wall
    for (const tx of [x0 - 1, x1 - 2]) {
      px.rect(tx, y0 - 6, 4, 4, KIT.wood[1]);
      px.hline(tx, tx + 3, y0 - 6, KIT.wood[0]);
      px.vline(tx + 3, y0 - 6, y0 - 3, KIT.wood[3]);
      px.set(tx + 1, y0 - 5, 0x3a2420);
      px.vline(tx, y0 - 2, y0 + 1, KIT.wood[2]);
      px.vline(tx + 3, y0 - 2, y0 + 1, KIT.wood[3]);
    }
  }
  if (level >= 3) {
    // a lintel over the gate with the banner, and a standard
    px.hline(gate - 4, gate + 4, y1 - 7, KIT.wood[1]);
    px.hline(gate - 4, gate + 4, y1 - 6, KIT.wood[3]);
    px.rect(gate - 1, y1 - 5, 3, 3, KIT.red[1]);
    px.set(gate, y1 - 4, KIT.canvas[0]);
    flag(px, x1 - 4, 0, 6);
  }
}

function granary(px: Pix, level: number): void {
  const silo = (cx: number, by: number, r: number, wallH: number) => {
    shadow(px, cx - r, by - 2, r * 2 + 2, 5);
    // drum wall (front half visible)
    for (let x = cx - r; x <= cx + r; x++) {
      const k = (x - (cx - r)) / (2 * r);
      const c = k < 0.3 ? STONE[0] : k < 0.75 ? STONE[1] : STONE[2];
      px.vline(x, by - wallH, by, c);
    }
    px.hline(cx - r, cx + r, by, STONE[3]);
    for (let x = cx - r + 1; x < cx + r; x += 3) px.set(x, by - 2, STONE[2]);
    door(px, cx - 1, by - 3, 3);
    // conical thatch roof with straw strokes
    px.ellipse(cx - r - 1, by - wallH - r - 2, 2 * r + 3, r + 3, (x, _y, edge, u, v) => (edge ? STRAW[3] : u + v < -0.5 ? STRAW[0] : (x + cx) % 3 === 0 ? STRAW[2] : u + v < 0.4 ? STRAW[1] : STRAW[2]));
    px.set(cx, by - wallH - r - 3, STRAW[3]);
    px.set(cx, by - wallH - r - 2, STRAW[0]);
  };
  if (level >= 2) silo(18, 13, 3, 4);
  silo(9, 18, 5, 5);
  px.blit(renderProp('sacks'), 13, 14);
  if (level >= 2) px.blit(renderProp('amphorae'), 0, 15);
  if (level >= 3) px.blit(renderProp('crates'), 12, 2);
}

function forge(px: Pix, level: number): void {
  // an open smithy: a stone hearth under a lean-to roof, the chimney, bellows, anvil and quench barrel
  const b = 19;
  shadow(px, 1, b - 3, 22, 6);
  const hw = level >= 2 ? 12 : 10;
  px.rect(1, b - 7, hw, 7, KIT.stone[2]);
  px.hline(1, hw, b - 7, KIT.stone[0]);
  px.hline(1, hw, b - 6, KIT.stone[1]);
  for (let x = 2; x < hw; x += 3) px.set(x, b - 3, KIT.stone[3]);
  px.vline(hw, b - 7, b, KIT.stone[3]);
  // coal mouth (the glow is the panel's / map's animated overlay)
  px.rect(3, b - 4, 5, 4, 0x3a2428);
  px.hline(3, 7, b - 1, KIT.ember[2]);
  px.set(4, b - 2, KIT.ember[1]);
  px.set(6, b - 2, KIT.ember[3]);
  // roof
  for (let y = 0; y < 4; y++) px.hline(0, hw + 3, b - 12 + y, y === 0 ? OXBLOOD[0] : y < 3 ? OXBLOOD[1] : OXBLOOD[3]);
  for (let x = 1; x < hw + 3; x += 3) px.set(x, b - 11, OXBLOOD[2]);
  px.vline(hw + 2, b - 8, b, KIT.wood[3]);
  // chimney through the roof
  px.rect(2, b - 17, 4, 8, KIT.stone[2]);
  px.vline(2, b - 17, b - 10, KIT.stone[1]);
  px.hline(2, 5, b - 17, KIT.stone[0]);
  px.hline(3, 4, b - 17, 0x3a2420);
  if (level >= 2) {
    // bellows
    px.hline(hw - 2, hw, b - 2, 0x8a6048);
    px.set(hw - 1, b - 3, 0xa87850);
  }
  // anvil on a stump, quench barrel
  px.blit(renderProp('anvil'), 13, 13);
  px.blit(renderProp('barrel'), 17, 15);
  if (level >= 3) {
    // bronze ingots and a tool rack
    for (let i = 0; i < 3; i++) {
      px.hline(1 + i * 3, 2 + i * 3, 22, P.bronze[1]);
      px.set(1 + i * 3, 22, P.bronze[0]);
    }
    px.vline(22, 4, 10, KIT.wood[3]);
    px.hline(18, 22, 5, KIT.wood[2]);
    px.vline(19, 5, 8, KIT.iron[2]);
    px.vline(21, 5, 7, KIT.iron[1]);
  }
}

function barracks(px: Pix, level: number): void {
  // hoplite tents: a back row and a front one, spears stacked by the door
  px.blit(level >= 3 ? renderTent(3, true) : renderTent(0), level >= 3 ? 1 : 7, 0);
  if (level >= 2) px.blit(renderProp('rack'), 12, 9);
  px.blit(renderTent(level >= 2 ? 2 : 1), 0, 10);
  px.blit(renderProp('shields'), 12, 16);
  if (level >= 3) flag(px, 21, 0, 7);
}

function watchtower(px: Pix, level: number): void {
  const h = 6 + level * 3; // leg height
  const top = 22 - h - 6;
  const x = 7;
  shadow(px, x, 18, 12, 5);
  // four legs with cross bracing
  for (const lx of [x + 1, x + 8]) px.vline(lx, top + 6, 21, WOOD[2]);
  for (const lx of [x + 3, x + 6]) px.vline(lx, top + 6, 20, WOOD[3]);
  for (let i = 0; i < h; i += 3) {
    px.line(x + 1, top + 6 + i, x + 8, top + 8 + i, WOOD[3]);
  }
  // ladder
  for (let y = top + 7; y < 21; y += 2) px.hline(x + 4, x + 5, y, WOOD[0]);
  // platform box
  px.rect(x, top + 3, 10, 4, WOOD[1]);
  px.hline(x, x + 9, top + 3, WOOD[0]);
  px.hline(x, x + 9, top + 6, WOOD[3]);
  for (let i = x + 1; i < x + 10; i += 2) px.set(i, top + 4, WOOD[2]);
  // roof (oxblood pyramid)
  for (let r = 0; r < 4; r++) px.hline(x + 4 - r - (r > 2 ? 1 : 0), x + 5 + r + (r > 2 ? 1 : 0), top - 1 + r, r < 2 ? OXBLOOD[0] : r === 3 ? OXBLOOD[3] : OXBLOOD[1]);
  px.set(x + 6, top + 1, OXBLOOD[2]);
  px.set(x + 7, top + 2, OXBLOOD[2]);
  if (level >= 3) flag(px, x + 5, Math.max(0, top - 5), 4);
}

const DRAW: Record<CampBuildingId, (px: Pix, level: number) => void> = { palisade, granary, forge, barracks, watchtower };

/** A building at a level (1..3), 24x24 gp with its shadow and dotted rim. Level 0 draws a staked-out foundation. */
export function renderCampBuilding(kind: CampBuildingId, level: number): Pix {
  const px = new Pix(CAMP_SPRITE, CAMP_SPRITE);
  if (level <= 0) {
    // foundation: pegs and a string outline, a timber pile
    for (let x = 5; x <= 18; x += 2) {
      px.set(x, 8, WOOD[2]);
      px.set(x, 19, WOOD[2]);
    }
    for (let y = 8; y <= 19; y += 2) {
      px.set(5, y, WOOD[2]);
      px.set(18, y, WOOD[2]);
    }
    for (let i = 0; i < 3; i++) px.hline(9, 14, 13 + i, i === 0 ? WOOD[0] : WOOD[1 + (i % 2)]);
    return px;
  }
  DRAW[kind](px, Math.min(3, level));
  dottedRim(px, CAMP_COLOR.rim);
  return px;
}

/** The team-cyan placement ghost of a building (50% alpha, luminance kept). */
export function renderCampGhost(kind: CampBuildingId, level = 1): Pix {
  const src = renderCampBuilding(kind, level);
  const out = new Pix(src.w, src.h);
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const a = src.alpha(x, y);
      if (a < 200) continue; // drop the shadow
      const c = src.get(x, y);
      const l = (((c >> 16) & 255) * 3 + ((c >> 8) & 255) * 4 + (c & 255)) / 8;
      out.set(x, y, l > 170 ? CAMP_COLOR.cyanLight : l > 110 ? CAMP_COLOR.cyan : CAMP_COLOR.cyanDark, 128);
    }
  return out;
}

/**
 * One building plot of the camp grid: a pegged-out square (rope dots, corner
 * pegs) over the trodden ground; the selected plot gets the footage's pink
 * 2x2 checker and orange-brown dots.
 */
export function renderCampTile(size: number, active = false): Pix {
  const px = new Pix(size, size);
  if (active) {
    for (let y = 1; y < size - 1; y++)
      for (let x = 1; x < size - 1; x++) {
        const on = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0;
        px.set(x, y, on ? CAMP_COLOR.checkA : 0xe8a8a0, on ? 120 : 140);
      }
  }
  const c = active ? CAMP_COLOR.border : KIT.earth[3];
  for (let k = 2; k < size - 2; k += 2) {
    px.set(k, 1, c, active ? 255 : 170);
    px.set(k, size - 2, c, active ? 255 : 170);
    px.set(1, k, c, active ? 255 : 170);
    px.set(size - 2, k, c, active ? 255 : 170);
  }
  for (const [x, y] of [[1, 1], [size - 2, 1], [1, size - 2], [size - 2, size - 2]]) {
    px.set(x, y, KIT.wood[3]);
    px.set(x, y - 1, KIT.wood[1]);
  }
  return px;
}

/** The camp ground's blob: inset (px) of each edge per 6 px block, stair-stepped like the footage's plots. */
function groundInside(w: number, h: number, seed: number): (x: number, y: number) => boolean {
  const ins = (side: number, k: number) => 1 + Math.floor(hash2(side, k, seed) * 4);
  return (x, y) => {
    if (x < ins(0, Math.floor(y / 6)) || x >= w - ins(1, Math.floor(y / 6))) return false;
    if (y < ins(2, Math.floor(x / 6)) - 1 || y >= h - ins(3, Math.floor(x / 6)) + 1) return false;
    // chamfered corners
    const cx = Math.min(x, w - 1 - x);
    const cy = Math.min(y, h - 1 - y);
    return cx + cy >= 5;
  };
}

/**
 * The camp's trodden ground for the panel (w x h): worn tan earth under a
 * faint tan / pink checker, grass tufts surviving at the rim, a few pebbles,
 * inside a stair-stepped blob (its dotted border is renderCampGroundBorder).
 */
export function renderCampGround(w: number, h: number, seed = 7): Pix {
  const px = new Pix(w, h);
  const inside = groundInside(w, h, seed);
  const edge = (x: number, y: number) => {
    for (let d = 1; d <= 3; d++) if (!inside(x - d, y) || !inside(x + d, y) || !inside(x, y - d) || !inside(x, y + d)) return d;
    return 9;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      const n = hash2(x, y, seed + 3);
      const e = edge(x, y);
      let c: number = n > 0.985 ? KIT.earth[3] : n > 0.95 ? KIT.earth[0] : KIT.earth[1];
      if (e <= 2 && n > 0.5) c = 0xd7cb88;
      px.set(x, y, c);
      const ch = ((x >> 1) + (y >> 1)) % 2 === 0;
      px.set(x, y, ch ? CAMP_COLOR.checkA : CAMP_COLOR.checkB, ch ? 70 : 40);
    }
  // trodden-grass strokes in wind-combed clumps (2 px vertical, lit tip)
  for (let i = 0; i < (w * h) / 45; i++) {
    const x0 = Math.floor(hash2(i, 5, seed) * w);
    const y0 = Math.floor(hash2(i, 6, seed) * h);
    for (let k = 0; k < 3; k++) {
      const x = x0 + k * 2 + (k === 1 ? 0 : 0);
      const y = y0 + (k % 2);
      if (!inside(x, y) || !inside(x, y - 1) || edge(x, y) < 2) continue;
      px.set(x, y, KIT.earth[2]);
      px.set(x, y - 1, KIT.earth[2]);
      px.set(x, y - 2, KIT.earth[0]);
    }
  }
  // tufts at the rim
  for (let i = 0; i < (w * h) / 60; i++) {
    const x = Math.floor(hash2(i, 1, seed) * w);
    const y = Math.floor(hash2(i, 2, seed) * h);
    if (!inside(x, y) || edge(x, y) > 4) continue;
    px.set(x, y, 0x86924e);
    px.set(x, y - 1, 0xa8b46a);
    px.set(x + 1, y, 0xa8b46a);
  }
  return px;
}

/** The ground blob's 1 gp dotted orange-brown border; `phase` 0/1 marches the dots. */
export function renderCampGroundBorder(w: number, h: number, seed = 7, phase = 0): Pix {
  const px = new Pix(w, h);
  const inside = groundInside(w, h, seed);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      if (inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1)) continue;
      if ((x + y + phase) % 2 === 0) px.set(x, y, CAMP_COLOR.border);
      else px.set(x, y, 0x8a4a28, 90);
    }
  return px;
}

/** Where a building's smoke, sparks and worker go (sprite px, for the panel's live layer). */
export const CAMP_FX: Partial<Record<CampBuildingId, { smoke?: [number, number]; sparks?: [number, number]; work?: [number, number]; coals?: [number, number] }>> = {
  forge: { smoke: [4, 1], sparks: [16, 14], work: [12, 18], coals: [3, 17] },
  granary: {},
  barracks: {},
};

/** A 1 gp dotted rectangle border; `phase` 0/1 shifts the dots by one pixel (marching ants). */
export function renderDottedBorder(w: number, h: number, color: number, phase = 0): Pix {
  const px = new Pix(w, h);
  let i = 0;
  const step = (x: number, y: number) => {
    if ((i++ + phase) % 2 === 0) px.set(x, y, color);
  };
  for (let x = 0; x < w; x++) step(x, 0);
  for (let y = 1; y < h; y++) step(w - 1, y);
  for (let x = w - 2; x >= 0; x--) step(x, h - 1);
  for (let y = h - 2; y > 0; y--) step(0, y);
  return px;
}

/** The slot marker under a placement ghost: dotted cyan (valid) or red (invalid) diamond-cornered square. */
export function renderSlotMarker(size: number, valid: boolean): Pix {
  const px = renderDottedBorder(size - 4, size - 4, valid ? CAMP_COLOR.cyan : CAMP_COLOR.invalid);
  const out = new Pix(size, size);
  out.blit(px, 2, 2);
  // corner ticks
  const c = valid ? CAMP_COLOR.cyanLight : CAMP_COLOR.invalid;
  for (const [x, y] of [
    [1, 1],
    [size - 2, 1],
    [1, size - 2],
    [size - 2, size - 2],
  ])
    out.set(x, y, c);
  return out;
}

/** Dust puff frame 0..2 (cream pixels spreading and thinning), 28x18 gp. */
export function renderDustPuff(frame: number): Pix {
  const px = new Pix(28, 18);
  const f = Math.max(0, Math.min(2, frame));
  const rings = [
    { r: 5, n: 18, a: 255 },
    { r: 9, n: 22, a: 220 },
    { r: 12, n: 16, a: 150 },
  ][f];
  // a few clumps around the base, flattened (iso), rising a little
  for (let i = 0; i < rings.n; i++) {
    const ang = (i / rings.n) * Math.PI * 2 + f * 0.4;
    const jitter = ((i * 37) % 5) - 2;
    const x = 14 + Math.cos(ang) * (rings.r + jitter * 0.5);
    const y = 11 + Math.sin(ang) * (rings.r * 0.45) - f;
    const s = f === 2 ? 1 : 2 - (i % 2);
    px.rect(Math.round(x), Math.round(y), s, s, i % 3 === 0 ? CAMP_COLOR.dustShade : CAMP_COLOR.dust, rings.a);
  }
  if (f === 0) px.rect(11, 9, 6, 3, CAMP_COLOR.dust, 200);
  return px;
}

/** 12x12 pictograms of the build row ('#' ink, '+' highlight), drawn like the kit's icons. */
export const CAMP_ICONS: Record<CampBuildingId, string[]> = {
  palisade: ['............', '.#..#..#..#.', '###########.', '###########.', '.#..#..#..#.', '.#..#..#..#.', '.#..#..#..#.', '.#..#..#..#.', '.#..#..#..#.', '############', '############', '............'],
  granary: ['.....##.....', '....####....', '...######...', '..########..', '.##########.', '############', '..#+++++++..', '..#+++++++..', '..#++##+++..', '..#++##+++..', '..########..', '............'],
  forge: ['............', '............', '.##########.', '############', '.##########.', '...######...', '....####....', '....####....', '...######...', '..########..', '..########..', '............'],
  barracks: ['.....##.....', '....#..#....', '....####....', '...######...', '...##..##...', '..###..###..', '..##....##..', '.###....###.', '.##......##.', '###......###', '############', '............'],
  watchtower: ['...######...', '..########..', '...######...', '...#....#...', '...#.##.#...', '...##..##...', '...#.##.#...', '...##..##...', '...#.##.#...', '..##....##..', '.##......##.', '............'],
};

/**
 * Registers the camp textures once per game: `campb_<kind>_<0..3>`,
 * `campghost_<kind>`, `icon[L|D]_camp_<kind>`, `camp_dust_<0..2>`,
 * `camp_slot_ok|bad_<size>`, `camp_tile_<size>[_on]`, `camp_ants_<w>x<h>_<0|1>`.
 */
export function registerCampTextures(scene: Phaser.Scene, tile: number): void {
  const add = (key: string, make: () => Pix) => {
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, make().toCanvas());
  };
  for (const kind of Object.keys(DRAW) as CampBuildingId[]) {
    for (let l = 0; l <= 3; l++) add(`campb_${kind}_${l}`, () => renderCampBuilding(kind, l));
    add(`campghost_${kind}`, () => renderCampGhost(kind));
    add(`icon_camp_${kind}`, () => renderIcon(CAMP_ICONS[kind], P.inkRed, P.parchShade));
    add(`iconL_camp_${kind}`, () => renderIcon(CAMP_ICONS[kind], P.cream, 0xd08070));
    add(`iconD_camp_${kind}`, () => renderIcon(CAMP_ICONS[kind], 0x9a8070, 0xc8b0a0));
  }
  for (let f = 0; f < 3; f++) add(`camp_dust_${f}`, () => renderDustPuff(f));
  add(`camp_slot_ok_${tile}`, () => renderSlotMarker(tile, true));
  add(`camp_slot_bad_${tile}`, () => renderSlotMarker(tile, false));
  add(`camp_tile_${tile}`, () => renderCampTile(tile));
  add(`camp_tile_${tile}_on`, () => renderCampTile(tile, true));
  add(`camp_hover_${tile}_0`, () => renderDottedBorder(tile, tile, CAMP_COLOR.border, 0));
  add(`camp_hover_${tile}_1`, () => renderDottedBorder(tile, tile, CAMP_COLOR.border, 1));
}

/** Key of the zone's outer dotted border (registered on demand). */
export function campBorderKey(scene: Phaser.Scene, w: number, h: number, phase: 0 | 1): string {
  const key = `camp_ants_${w}x${h}_${phase}`;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, renderDottedBorder(w, h, CAMP_COLOR.border, phase).toCanvas());
  return key;
}

// =====================================================================
// Camp kit: the living-camp props shared by the offline field camp (world
// map, 8 gp tiles) and the online camp panel. Small 3/4 top-down pixel
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
export type TentLook = 0 | 1 | 2 | 3;

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
export function renderStandard(frame: number, cloth = KIT.red as readonly number[], emblem: number = KIT.canvas[0]): Pix {
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

/**
 * Construction scaffold over a footprint `w` x `h` gp (art may rise `lift`
 * above it), stage 0 = pegs, string and a timber pile; 1 = a pole frame with
 * cross braces and a ladder; 2 = the frame with planks going up.
 */
export function renderScaffold(w: number, h: number, lift: number, stage: number): Pix {
  const px = new Pix(w + 2, h + lift + 2);
  const y0 = lift;
  const bx = 1;
  const by = y0 + h - 1;
  // pegs and string
  for (let x = bx; x < bx + w; x += 2) {
    px.set(x, y0 + 1, KIT.rope, 220);
    px.set(x, by, KIT.rope, 220);
  }
  for (let y = y0 + 1; y <= by; y += 2) {
    px.set(bx, y, KIT.rope, 220);
    px.set(bx + w - 1, y, KIT.rope, 220);
  }
  for (const [x, y] of [[bx, y0 + 1], [bx + w - 1, y0 + 1], [bx, by], [bx + w - 1, by]]) px.set(x, y, KIT.wood[3]);
  if (stage <= 0) {
    // timber pile
    const tx = bx + Math.floor(w / 2) - 3;
    const ty = by - 3;
    for (let i = 0; i < 3; i++) {
      px.hline(tx + i, tx + 5, ty + i, i === 0 ? KIT.wood[0] : KIT.wood[1 + (i % 2)]);
      px.set(tx + 5, ty + i, KIT.straw[1]);
    }
    kitOutline(px, KIT.rim);
    return px;
  }
  // poles at the corners and the middle, rising into the lift
  const top = Math.max(0, y0 - Math.min(lift, 6) + 1);
  const poles = [bx + 1, bx + Math.floor(w / 2), bx + w - 2];
  for (const x of poles) {
    px.vline(x, top, by - 1, KIT.wood[2]);
    px.set(x, top, KIT.wood[0]);
    px.set(x + 1, by - 1, KIT.shade, 80);
  }
  const mid = Math.floor((top + by) / 2);
  px.hline(poles[0], poles[2], top + 1, KIT.wood[1]);
  px.hline(poles[0], poles[2], mid, KIT.wood[1]);
  px.line(poles[0], mid, poles[1], top + 1, KIT.wood[3]);
  px.line(poles[1], by - 1, poles[2], mid, KIT.wood[3]);
  // ladder
  px.vline(poles[2] - 2, mid, by - 1, KIT.wood[3]);
  for (let y = mid + 1; y < by; y += 2) px.set(poles[2] - 1, y, KIT.wood[0]);
  if (stage >= 2) {
    for (let y = mid + 1; y < by - 1; y++) for (let x = poles[0] + 1; x < poles[1]; x++) px.set(x, y, (y + x) % 3 ? KIT.wood[1] : KIT.wood[0]);
    px.hline(poles[0] + 1, poles[1] - 1, by - 1, KIT.wood[3]);
  }
  kitOutline(px, KIT.rim);
  return px;
}

// --------------------------------------------------------------- soldiers

/** Soldier poses (2 frames each). */
export const SOLDIER_POSES = ['idle', 'walk', 'sit', 'spar', 'smith'] as const;
export type SoldierPose = (typeof SOLDIER_POSES)[number];
/** Frame size of a map-scale soldier; feet at (5, 13). */
export const SOLDIER_W = 13;
export const SOLDIER_H = 15;
/** Distinct looks (tunic, crest, skin, shield). */
export const SOLDIER_LOOKS = 6;

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
export function renderSoldierSheet(look: number): Pix {
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
