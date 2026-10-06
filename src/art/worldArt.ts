/**
 * Procedural top-down 3/4 pixel art for the overland map: terrain painted per
 * pixel (domain-warped borders, Bayer dither, coast foam), rivers and roads
 * drawn between tile centres, then trees, hills and mountains as little
 * sprites in row order so nearer ones overlap. Settlements and bands are
 * separate sprites. Same palette family as the battlefield.
 */
import { P, mix } from './palette';
import { BAYER4, Pix, hash2, valueNoise } from './pixels';
import { T, isWater, type BandKind, type SettlementKind, type WorldMap } from '../world/map';

export const WTILE = 8;

const C = {
  deep: [0x27415e, 0x2c4866, 0x31506f],
  sea: [0x37628a, 0x3e6b94, 0x46769e],
  shallow: [0x4f86a8, 0x5891b0, 0x63a0bc],
  foam: 0xd8e8ec,
  sand: [0xe0cc96, 0xd4bc84, 0xc4aa72],
  grass: P.grass,
  scrub: [0xb4ac68, 0xa49c5c, 0x948c52, 0x847c4a],
  forest: [0x5a7a40, 0x4e6c38, 0x425e30],
  hills: [0x9aa862, 0x8a9a56, 0x7a8a4c],
  rock: [0xa89c88, 0x8e8270, 0x726858, 0x585044],
  snow: 0xf0f0ea,
  river: [0x5a92bc, 0x4a7ea8, 0x3e6e96],
  road: [0xcfb07a, 0xb89a68, 0x9a7e52],
};

export function renderWorldMap(m: WorldMap): Pix {
  const S = WTILE;
  const W = m.w * S;
  const H = m.h * S;
  const px = new Pix(W, H);
  const seed = m.seed & 0xffff;
  const terr = (tx: number, ty: number) => (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h ? T.deep : m.terrain[ty * m.w + tx]);
  // distance-to-land field for shallow water / foam (in tiles, capped at 3)
  const coastD = new Uint8Array(m.w * m.h).fill(9);
  for (let ty = 0; ty < m.h; ty++) {
    for (let tx = 0; tx < m.w; tx++) {
      if (!isWater(terr(tx, ty))) continue;
      let best = 9;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (!isWater(terr(tx + dx, ty + dy))) best = Math.min(best, Math.max(Math.abs(dx), Math.abs(dy)));
      coastD[ty * m.w + tx] = best;
    }
  }
  const wet = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // domain warp: borders between terrains wobble instead of following the grid
      const wx = x + (valueNoise(x, y, 7, seed) - 0.5) * 7;
      const wy = y + (valueNoise(x + 99, y + 99, 7, seed) - 0.5) * 7;
      const tx = Math.floor(wx / S);
      const ty = Math.floor(wy / S);
      const t = terr(tx, ty);
      const n = valueNoise(x, y, 5, seed + 3) * 0.6 + valueNoise(x, y, 17, seed + 5) * 0.4;
      const b = BAYER4[y & 3][x & 3];
      const pick = (ramp: number[], bias = 0) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor((n + (b - 0.5) * 0.35 + bias) * ramp.length)))];
      let c: number;
      if (isWater(t)) {
        wet[y * W + x] = 1;
        const d = tx >= 0 && ty >= 0 && tx < m.w && ty < m.h ? coastD[ty * m.w + tx] : 9;
        c = d <= 1 ? pick(C.shallow) : d <= 3 ? pick(C.sea) : pick(C.deep);
        // wave glints: short light dashes
        if (hash2(x >> 2, y, seed + 17) > 0.985 && (x & 3) !== 3) c = mix(c, 0xcfe0ea, 0.5);
      } else if (t === T.beach) c = pick(C.sand);
      else if (t === T.scrub) c = pick(C.scrub);
      else if (t === T.forest) c = pick(C.forest);
      else if (t === T.hills) c = pick(C.hills);
      else if (t === T.mountain) c = pick(C.rock, 0.1);
      else c = pick(C.grass as number[], -0.1);
      px.set(x, y, c);
    }
  }
  // foam on the shoreline: water pixels touching land pixels
  const land = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && !wet[y * W + x];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (!wet[y * W + x]) continue;
      const touch = land(x + 1, y) || land(x - 1, y) || land(x, y + 1) || land(x, y - 1);
      if (touch && (x + y) % 3 !== 0) px.set(x, y, C.foam);
      else if (!touch && (land(x + 2, y) || land(x - 2, y) || land(x, y + 2) || land(x, y - 2)) && ((x * 3 + y) & 3) === 0) px.set(x, y, mix(px.get(x, y), C.foam, 0.45));
    }
  }

  // rivers and roads: strokes between neighbouring tile centres
  const stroke = (layer: Uint8Array, width: number, ramp: number[], dotted: boolean) => {
    for (let ty = 0; ty < m.h; ty++) {
      for (let tx = 0; tx < m.w; tx++) {
        if (!layer[ty * m.w + tx]) continue;
        const cx = tx * S + S / 2;
        const cy = ty * S + S / 2;
        let links = 0;
        for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
          const nx = tx + dx;
          const ny = ty + dy;
          if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || !layer[ny * m.w + nx]) continue;
          // skip a diagonal when an orthogonal path already connects the two
          if (dx !== 0 && dy !== 0 && (layer[ty * m.w + nx] || layer[ny * m.w + tx])) continue;
          links++;
          const steps = S * Math.max(Math.abs(dx), Math.abs(dy));
          for (let k = 0; k <= steps; k++) {
            const x = cx + (dx * S * k) / steps + (valueNoise(tx * 8 + k, ty * 8, 4, seed + 41) - 0.5) * 1.5;
            const y = cy + (dy * S * k) / steps + (valueNoise(tx * 8, ty * 8 + k, 4, seed + 43) - 0.5) * 1.5;
            for (let oy = -width; oy <= width; oy++) {
              for (let ox = -width; ox <= width; ox++) {
                if (ox * ox + oy * oy > width * width + 0.5) continue;
                const edge = ox * ox + oy * oy > (width - 1) * (width - 1);
                if (dotted && edge && ((x + ox + y + oy) | 0) % 2 === 0) continue;
                px.set(x + ox, y + oy, edge ? ramp[2] : (k + ox) % 5 === 0 ? ramp[0] : ramp[1]);
              }
            }
          }
        }
        if (links === 0) px.rect(cx - 1, cy - 1, 3, 3, ramp[1]);
      }
    }
  };
  stroke(m.river, 2, C.river, false);
  stroke(m.road, 1, C.road, true);

  // objects in row order: trees, hill humps, mountain peaks
  for (let ty = 0; ty < m.h; ty++) {
    for (let tx = 0; tx < m.w; tx++) {
      const i = ty * m.w + tx;
      const t = m.terrain[i];
      if (m.road[i] || m.river[i]) continue;
      const h1 = hash2(tx, ty, seed + 61);
      const bx = tx * S;
      const by = ty * S;
      if (t === T.forest) {
        tree(px, bx + 1 + Math.floor(h1 * 3), by + 2, h1 > 0.5);
        if (h1 > 0.35) tree(px, bx + 4 + Math.floor(h1 * 2), by + 6, h1 > 0.7);
      } else if (t === T.grass && h1 > 0.94) tree(px, bx + 2, by + 3, true);
      else if (t === T.scrub && h1 > 0.7) bush(px, bx + 2 + Math.floor(h1 * 4), by + 4);
      else if (t === T.hills && h1 > 0.45) hill(px, bx + 2 + Math.floor(h1 * 4), by + 7, 6 + Math.floor(h1 * 5));
      else if (t === T.mountain) {
        const e = m.elev[i];
        if (h1 > 0.3 || tx % 2 === ty % 2) peak(px, bx + 4 + Math.floor((h1 - 0.5) * 3), by + 8, 7 + Math.floor(h1 * 5), e > 1.05 || h1 > 0.82);
      }
    }
  }
  return px;
}

function tree(px: Pix, x: number, y: number, olive: boolean): void {
  const leaf = olive ? [0x8a9a5a, 0x6f8048, 0x56663a] : [0x5a8040, 0x456a32, 0x335226];
  px.set(x + 2, y + 5, 0x5e4026);
  px.set(x + 2, y + 6, 0x4a3020);
  px.ellipse(x, y, 5, 5, (_x, _y, edge, u, v) => (edge && v > 0 ? leaf[2] : u + v < -0.3 ? leaf[0] : leaf[1]));
  px.set(x + 2, y + 7, 0x2e3a20, 120);
  px.set(x + 3, y + 7, 0x2e3a20, 120);
}

function bush(px: Pix, x: number, y: number): void {
  px.set(x, y, 0x6a7040);
  px.set(x + 1, y, 0x7a8048);
  px.set(x, y - 1, 0x8a9058);
  px.set(x + 1, y + 1, 0x4e5430);
}

/** A rounded hump: lit on the upper left, shaded on the right, a dark rim on the shaded side. */
function hill(px: Pix, cx: number, by: number, w: number): void {
  const h = Math.ceil(w / 2);
  const rim = mix(C.hills[2], 0x2e3a20, 0.45);
  for (let dy = 0; dy < h; dy++) {
    const half = Math.round((w / 2) * Math.sqrt(1 - ((h - dy) / h) ** 2));
    for (let dx = -half; dx <= half; dx++) {
      let c = dx < -half / 3 ? C.hills[0] : dx > half / 3 ? C.hills[2] : C.hills[1];
      if (dx === half && dx > 0) c = rim;
      if (dy === 0) c = dx <= 0 ? mix(C.hills[0], 0xffffff, 0.2) : C.hills[1];
      px.set(cx + dx, by - h + dy, c);
    }
  }
}

function peak(px: Pix, cx: number, by: number, h: number, snow: boolean): void {
  for (let dy = 0; dy < h; dy++) {
    const half = Math.floor((dy * 0.9 * 6) / h + 0.5) + (dy > h / 2 ? 1 : 0);
    for (let dx = -half; dx <= half; dx++) {
      let c = dx < 0 ? C.rock[0] : dx === 0 ? C.rock[1] : C.rock[2];
      if (dx > half - 1 && dx > 0) c = C.rock[3];
      if (snow && dy < h * 0.35 && (dx <= 0 || dy < h * 0.2)) c = dx < 0 ? C.snow : 0xd8dcd8;
      px.set(cx + dx, by - h + dy, c);
    }
  }
}

// ------------------------------------------------------------- settlements

export function renderSettlement(kind: SettlementKind, variant: number, coastal: boolean): Pix {
  if (kind === 'town') return town(variant);
  if (kind === 'village') return village(variant);
  return lair(variant, coastal);
}

const STONE = [0xeee4cc, 0xd8ccb0, 0xb8a888, 0x8a7a60];
const ROOF = [0xc4603e, 0xa84a32, 0x803626];
const THATCH = [0xe0c070, 0xc8a050, 0x9a7a3a];

function house(px: Pix, x: number, y: number, w: number, h: number, roof: number[]): void {
  px.rect(x, y + 3, w, h - 3, STONE[1]);
  px.vline(x + w - 1, y + 3, y + h - 1, STONE[2]);
  px.set(x + Math.floor(w / 2), y + h - 2, 0x4a3020);
  px.set(x + Math.floor(w / 2), y + h - 1, 0x4a3020);
  for (let r = 0; r < 4; r++) px.hline(x - 1 + (r > 1 ? 0 : 0), x + w, y + r, r === 0 ? roof[0] : r === 3 ? roof[2] : roof[1]);
}

function town(variant: number): Pix {
  const px = new Pix(30, 26);
  // walls
  px.rect(2, 12, 26, 12, STONE[1]);
  px.hline(2, 27, 12, STONE[0]);
  for (let x = 2; x < 28; x += 3) px.rect(x, 10, 2, 2, STONE[1]);
  px.rect(2, 22, 26, 2, STONE[2]);
  px.rect(13, 17, 4, 7, 0x4a3020); // gate
  px.set(13, 17, STONE[2]);
  px.set(16, 17, STONE[2]);
  px.rect(0, 8, 4, 16, STONE[1]); // towers
  px.rect(26, 8, 4, 16, STONE[2]);
  px.hline(0, 3, 8, STONE[0]);
  px.hline(26, 29, 8, STONE[1]);
  // houses behind the wall
  house(px, 5, 4, 6, 8, ROOF);
  house(px, 19, 5, 6, 7, ROOF);
  // temple with columns on the acropolis
  const tx = variant % 2 ? 9 : 11;
  px.rect(tx, 2, 10, 2, STONE[0]);
  px.hline(tx + 1, tx + 8, 1, STONE[0]);
  px.hline(tx + 3, tx + 6, 0, STONE[0]);
  for (let c = 0; c < 5; c++) px.vline(tx + 1 + c * 2, 4, 9, STONE[0]);
  px.rect(tx, 10, 10, 1, STONE[2]);
  px.outline(P.outline);
  return px;
}

function village(variant: number): Pix {
  const px = new Pix(22, 16);
  house(px, 1, 5, 6, 8, THATCH);
  house(px, 9, 2, 7, 9, variant % 2 ? ROOF : THATCH);
  house(px, 14, 8, 6, 7, THATCH);
  // fence / field
  for (let x = 0; x < 9; x += 2) px.set(x, 15, 0x7a5532);
  px.outline(P.outline);
  return px;
}

function lair(variant: number, coastal: boolean): Pix {
  const px = new Pix(22, 18);
  const cloth = coastal ? [0x6a7e94, 0x52647a, 0x3c4a5c] : variant % 2 ? [0x8a6a44, 0x6e5234, 0x523c26] : [0x6e7a48, 0x56603a, 0x40482c];
  const tent = (x: number, y: number, s: number) => {
    for (let dy = 0; dy < s; dy++) {
      for (let dx = -dy; dx <= dy; dx++) px.set(x + dx, y + dy, dx < 0 ? cloth[0] : dx === 0 ? cloth[2] : cloth[1]);
    }
    px.set(x, y + s - 1, 0x2a1a10);
    px.set(x, y + s - 2, 0x2a1a10);
  };
  tent(6, 5, 8);
  tent(15, 8, 7);
  // fire
  px.set(11, 15, 0xffd060);
  px.set(11, 14, 0xf08030);
  px.set(10, 15, 0xc04a20);
  px.set(12, 15, 0xc04a20);
  px.hline(9, 13, 16, 0x5a3a20);
  // skull pole / banner
  px.vline(19, 0, 15, 0x5a3a20);
  px.rect(17, 0, 2, 3, coastal ? 0x202020 : 0x9a2a20);
  px.set(19, 1, 0xe8e0cc);
  px.outline(P.outline);
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

/** A tiny standard-bearer: 12x16, two walk frames side by side (24x16). */
export function renderPartyFigure(color: number, flag: number): Pix {
  const px = new Pix(24, 16);
  for (let f = 0; f < 2; f++) {
    const ox = f * 12;
    // pole + banner
    px.vline(ox + 7, 1, 13, 0x6a4a2a);
    px.rect(ox + 8, 1, 4, 3, flag);
    px.set(ox + 11, 3, mix(flag, 0x000000, 0.3));
    px.set(ox + 8, 4, flag);
    px.set(ox + 7, 0, P.gold);
    // body
    px.rect(ox + 3, 6, 3, 1, 0xdcab80); // head
    px.rect(ox + 3, 5, 3, 1, P.bronze[1]); // helmet
    px.rect(ox + 2, 7, 5, 4, color);
    px.set(ox + 2, 8, mix(color, 0xffffff, 0.25));
    px.rect(ox + 6, 8, 1, 3, mix(color, 0x000000, 0.3));
    // shield
    px.rect(ox + 1, 8, 2, 3, P.bronze[0]);
    // legs
    if (f === 0) {
      px.set(ox + 3, 11, 0x5a3a28);
      px.set(ox + 5, 11, 0x5a3a28);
      px.set(ox + 3, 12, 0x3a2418);
      px.set(ox + 5, 12, 0x3a2418);
    } else {
      px.set(ox + 4, 11, 0x5a3a28);
      px.set(ox + 3, 12, 0x3a2418);
      px.set(ox + 6, 12, 0x3a2418);
    }
  }
  px.outline(P.outline);
  return px;
}

/** A destination marker (little crossed flag). */
export function renderMarker(): Pix {
  const px = new Pix(9, 9);
  px.line(1, 1, 7, 7, 0xf6ecd8);
  px.line(7, 1, 1, 7, 0xf6ecd8);
  px.line(2, 1, 7, 6, P.red);
  px.line(6, 1, 1, 6, P.red);
  px.outline(P.outline);
  return px;
}
