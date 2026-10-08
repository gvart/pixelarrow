/**
 * The offline campaign's overland map, baked once per seed into one texture
 * in the look of the online war map (docs/ART_STYLE.md §12): a lavender sea
 * in depth bands with a shelf, foam and a dotted coastline, cliffs where the
 * high ground meets the sea, sand, a patchwork of sage land tiles, reed
 * marshes, rivers with bridges, dirt roads, painted hills and rock spires,
 * varied woods (broadleaf blobs, dark pines, olive groves), patchwork fields
 * around the settlements, landmarks (ruins, stone circles, shrines,
 * watchtowers, barrows, statues), and the settlements themselves from the
 * shared map props (src/art/mapProps.ts): walled towns per culture with
 * harbours and moored ships, farming villages, and the bandit / Galatae /
 * pirate camps drawn with the field-camp kit (src/art/campArt.ts).
 *
 * Also returns what the scene animates (src/ui/overlandLife.ts): the sprite
 * anchors of every site (smoke, flags, fires), harbours, and sea lanes.
 * Pure Pix work, no Phaser.
 */
import { Pix, hash2, valueNoise } from './pixels';
import { T, isWater, type SettlementDef, type WorldMap } from '../world/map';
import { findPath } from '../world/path';
import { MAPC, WTILE } from './worldArt';
import { MP, LANDMARKS, drawCypress, drawField, drawTree, harbourProp, landmarkProp, mix, rng, shipPix, townProp, villageProp, type Arch, type LandmarkKind, type PropSprite, type Pt } from './mapProps';
import { KIT, drawStake, renderCampfire, renderProp, renderTent, type PropKind } from './campArt';

export interface SiteArt {
  /** Settlement id (-1 for a landmark). */
  id: number;
  kind: 'town' | 'village' | 'lair' | 'landmark';
  /** The sprite's box on the map (px). */
  x: number;
  y: number;
  w: number;
  h: number;
  sprite: PropSprite;
  /** Coast point and the way out to sea (towns, coastal villages, pirate coves). */
  harbour: { x: number; y: number; dx: number; dy: number; fires: Pt[] } | null;
  /** Name plate: centre x, top y. */
  lx: number;
  ly: number;
  /** Cramped on a cape: built out over the water on a stone quay. */
  quay?: boolean;
}

export interface SeaLane {
  pts: Pt[];
  len: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  kind: 'merchant' | 'galley';
  speed: number;
  phase: number;
}

export interface WorldMapArt {
  pix: Pix;
  /** 1 where the painted pixel is sea. */
  water: Uint8Array;
  sites: SiteArt[];
  lanes: SeaLane[];
  /** The cultivated fields (for the herds). */
  fields: { x: number; y: number; w: number; h: number; kind: number }[];
}

/** Building culture of a settlement on the overland map. */
export function archOfSettlement(s: SettlementDef): Arch {
  if (s.culture === 'phoenician') return 'punic';
  if (s.culture === 'celtic') return 'celtic';
  // a few Greek places inland read as native hill towns
  if (s.kind === 'village' && !s.coastal && hash2(s.id, 3, 77) < 0.25) return 'iberian';
  return 'greek';
}

export function renderWorldMap(m: WorldMap): WorldMapArt {
  const S = WTILE;
  const W = m.w * S;
  const H = m.h * S;
  const px = new Pix(W, H);
  const seed = m.seed & 0xffff;
  const terr = (tx: number, ty: number) => (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h ? T.deep : m.terrain[ty * m.w + tx]);
  // ---- tile per pixel through a domain warp: organic coasts and borders
  const tix = new Int32Array(W * H);
  const tp = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const wx = x + (valueNoise(x, y, 11, seed) - 0.5) * 9 + (valueNoise(x, y, 4, seed + 7) - 0.5) * 3;
      const wy = y + (valueNoise(x + 99, y + 99, 11, seed) - 0.5) * 9 + (valueNoise(x + 9, y + 9, 4, seed + 8) - 0.5) * 3;
      const tx = Math.floor(wx / S);
      const ty = Math.floor(wy / S);
      const i = y * W + x;
      tix[i] = tx < 0 || ty < 0 || tx >= m.w || ty >= m.h ? -1 : ty * m.w + tx;
      tp[i] = terr(tx, ty);
    }
  }
  const water = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) water[i] = isWater(tp[i]) ? 1 : 0;
  const toLand = distField(W, H, (i) => !water[i], 60);
  const toSea = distField(W, H, (i) => water[i] === 1, 12);

  // ---- tile classes: reed marshes where a river spreads out, cliffs on high or rocky shores
  const n = m.w * m.h;
  const marsh = new Uint8Array(n);
  const cliff = new Uint8Array(n);
  for (let ty = 0; ty < m.h; ty++)
    for (let tx = 0; tx < m.w; tx++) {
      const i = ty * m.w + tx;
      const t = m.terrain[i];
      if (m.river[i] && !m.road[i]) {
        let k = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && tx + dx >= 0 && ty + dy >= 0 && tx + dx < m.w && ty + dy < m.h && m.river[(ty + dy) * m.w + tx + dx]) k++;
        if (k >= 4) marsh[i] = 1;
      }
      if (!isWater(t) && t !== T.beach && (t === T.hills || t === T.mountain || valueNoise(tx, ty, 7, seed + 71) > 0.55)) cliff[i] = 1;
    }
  for (let i = 0; i < n; i++)
    if (marsh[i]) {
      // grow the marsh a little into flat neighbours
      const tx = i % m.w;
      const ty = (i - tx) / m.w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (ty + dy) * m.w + tx + dx;
        const t = m.terrain[j];
        if (!marsh[j] && !m.road[j] && (t === T.grass || t === T.scrub) && hash2(tx + dx, ty + dy, seed + 72) < 0.5) marsh[j] = 2;
      }
    }

  // ---- ground colours
  for (let y = 0; y < H; y++) {
    const rowOff = Math.floor(hash2(7, y, seed + 3) * 7);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const t = tp[i];
      let c: number;
      if (water[i]) {
        // a cliff face hangs into the sea below a cliff top
        let face = 0;
        for (let k = 1; k <= 4; k++) {
          const j = i - k * W;
          if (y - k < 0 || water[j]) continue;
          if (tix[j] >= 0 && cliff[tix[j]] && toSea[j] <= 1.01) face = k;
          break;
        }
        if (face && face <= 3) {
          const st = hash2(x, 1, seed + 75) < 0.3;
          c = face === 1 ? (st ? MP.cliffLo : MP.cliff) : face === 2 ? (st ? MP.peakRim : MP.cliffLo) : (x + y) % 2 ? MP.peakRim : MP.cliffLo;
          px.set(x, y, c);
          continue;
        }
        if (face === 4 || (y > 4 && !water[i - 4 * W] && tix[i - 4 * W] >= 0 && cliff[tix[i - 4 * W]] && water[i - W] && water[i - 2 * W])) {
          // foam at the foot of the cliff
          if (hash2(x, y, seed + 76) < 0.6) {
            px.set(x, y, MAPC.foam);
            continue;
          }
        }
        const d = toLand[i] + (valueNoise(x, y, 6, seed + 11) - 0.5) * 2.4;
        const sea = MAPC.sea;
        let k: number;
        if (d < 1.6) c = MP.shelfLight;
        else if (d < 3.4) c = MAPC.shelf[2];
        else if (d < 5.4) c = MAPC.shelf[1];
        else if (d < 6.4) c = (x + y) % 2 === 0 ? MAPC.shelf[0] : MAPC.shelf[1]; // dotted shelf edge
        else {
          k = d < 9 ? 6 : d < 16 ? 5 : d < 26 ? 4 : d < 38 ? 3 : 2;
          if (d > 14) {
            const dn = valueNoise(x, y, 46, seed + 13) + (valueNoise(x, y, 9, seed + 14) - 0.5) * 0.12;
            if (dn > 0.64 || (dn > 0.61 && (x + y) % 2 === 0)) k = Math.max(0, k - 2);
          }
          const st = hash2(Math.floor((x + rowOff) / 5), y, seed + 17);
          if (st > 0.93) k = Math.min(6, k + 1);
          else if (st < 0.05) k = Math.max(0, k - 1);
          c = sea[k];
        }
        if (d >= 1.2 && d < 4.5 && hash2(x, y, seed + 19) > 0.9 && (x + y) % 2 === 0) c = MAPC.foam;
      } else {
        const ti = tix[i];
        const ds = toSea[i] + (valueNoise(x, y, 5, seed + 23) - 0.5) * 1.8;
        const beach = t === T.beach;
        if (ti >= 0 && cliff[ti] && toSea[i] <= 3.2) {
          // cliff top: a rocky lip with a dark dotted rim on the edge
          const h = hash2(x, y >> 1, seed + 92);
          if (toSea[i] <= 1.01) c = (x + y) % 2 === 0 ? MP.peakRim : MP.cliffLo;
          else if (toSea[i] <= 2.01) c = h < 0.3 ? MP.cliffLo : MP.cliff;
          else c = h < 0.15 ? MP.cliff : h > 0.8 ? MP.peakHi : MP.rock;
        } else if (toSea[i] <= 1.01) {
          c = (x + y) % 2 === 0 ? MAPC.coastDot : MAPC.sand[0];
        } else if (beach || ds < 4.2) {
          c = hash2(x, y, seed + 29) > 0.9 ? MAPC.sandDot : MAPC.sand[(hash2(x >> 3, y >> 3, seed) * 3) | 0];
          if (!beach && ds > 3.4 && (x + y) % 2 === 0) c = landColor(t, x, y, seed);
        } else if (ti >= 0 && marsh[ti]) {
          const w = valueNoise(x, y * 1.2, 7, seed + 93);
          if (w > 0.6 && marsh[ti] === 1) c = w > 0.7 && hash2(x, y, seed + 94) < 0.2 ? MP.marshHi : MP.marshWater;
          else if (hash2(x, y, seed + 95) < 0.08 || hash2(x, y - 1, seed + 95) < 0.08) c = MP.reed;
          else c = marsh[ti] === 2 && valueNoise(x, y, 6, seed + 96) > 0.5 ? landColor(t, x, y, seed) : MP.marsh;
        } else c = landColor(t, x, y, seed);
      }
      px.set(x, y, c);
    }
  }

  // ---- rivers (lavender) and roads (pale dirt): strokes between tile centres
  const stroke = (layer: Uint8Array, width: number, core: number, edge: number, dotted: boolean, skip?: (a: number, b: number) => boolean) => {
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
          if (dx !== 0 && dy !== 0 && (layer[ty * m.w + nx] || layer[ny * m.w + tx])) continue;
          links++;
          if (skip?.(ty * m.w + tx, ny * m.w + nx)) continue;
          const steps = S * Math.max(Math.abs(dx), Math.abs(dy));
          for (let k = 0; k <= steps; k++) {
            const x = cx + (dx * S * k) / steps + (valueNoise(tx * 8 + k, ty * 8, 4, seed + 41) - 0.5) * 2;
            const y = cy + (dy * S * k) / steps + (valueNoise(tx * 8, ty * 8 + k, 4, seed + 43) - 0.5) * 2;
            for (let oy = -width; oy <= width; oy++) {
              for (let ox = -width; ox <= width; ox++) {
                const r2 = ox * ox + oy * oy;
                if (r2 > width * width + 0.5) continue;
                const isEdge = r2 > (width - 1) * (width - 1) + 0.5;
                const X = Math.round(x + ox);
                const Y = Math.round(y + oy);
                if (X < 0 || Y < 0 || X >= W || Y >= H || water[Y * W + X]) continue;
                if (isEdge) {
                  if (dotted && (X + Y) % 2 === 0) continue;
                  if (px.get(X, Y) === core) continue;
                  px.set(X, Y, edge);
                } else px.set(X, Y, hash2(X, Y, seed + 45) < 0.08 && !dotted ? MP.waterHi : core);
              }
            }
          }
        }
        if (links === 0 && !(skip && marsh[ty * m.w + tx])) px.rect(cx - 1, cy - 1, 3, 3, core);
      }
    }
  };
  stroke(m.river, 2, MP.water, MAPC.shelf[2], false, (a, b) => marsh[a] === 1 && marsh[b] === 1);
  stroke(m.road, 1, 0xecd6b0, MAPC.earth[2], true);
  for (let ty = 0; ty < m.h; ty++)
    for (let tx = 0; tx < m.w; tx++) {
      if (!m.road[ty * m.w + tx]) continue;
      const h = hash2(tx, ty, seed + 47);
      if (h > 0.5) px.set(tx * S + 3 + Math.floor(h * 3), ty * S + 4, MAPC.earth[3]);
    }

  // ---- settlements, their fields, landmarks
  const reserved = new Uint8Array(n);
  const reserve = (x0: number, y0: number, x1: number, y1: number, pad = 0) => {
    for (let ty = Math.max(0, Math.floor(y0 / S) - pad); ty <= Math.min(m.h - 1, Math.floor(y1 / S) + pad); ty++)
      for (let tx = Math.max(0, Math.floor(x0 / S) - pad); tx <= Math.min(m.w - 1, Math.floor(x1 / S) + pad); tx++) reserved[ty * m.w + tx] = 1;
  };
  const sites = layoutSites(m, water, toLand, W, H);
  for (const s of sites) reserve(s.x + 2, s.y + 2, s.x + s.w - 3, s.y + s.h - 3, 0);
  const fields = layoutFields(m, sites, reserved);
  for (const f of fields) {
    drawField(px, f.x, f.y, f.w, f.h, f.kind);
    reserve(f.x, f.y, f.x + f.w, f.y + f.h);
  }
  const marks = layoutLandmarks(m, reserved, seed);
  for (const s of marks) reserve(s.x, s.y, s.x + s.w, s.y + s.h);

  // ---- objects in row order: rock spires, hills, woods, shrubs, olive groves
  for (let ty = 0; ty < m.h; ty++) {
    for (let tx = 0; tx < m.w; tx++) {
      const i = ty * m.w + tx;
      const t = m.terrain[i];
      if (m.road[i] || m.river[i] || marsh[i] || reserved[i]) continue;
      const h1 = hash2(tx, ty, seed + 61);
      const h2 = hash2(tx, ty, seed + 67);
      const bx = tx * S;
      const by = ty * S;
      if (t === T.forest) {
        // pines on the high ground, oaks and blob canopies in the lowland woods
        let high = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (terr(tx + dx, ty + dy) === T.hills || terr(tx + dx, ty + dy) === T.mountain) high++;
        const wood = valueNoise(tx, ty, 6, seed + 81);
        if (high > 2 || wood < 0.3) {
          drawCypress(px, Math.round(bx + 1 + h1 * 3), by + 7, 6 + Math.floor(h2 * 3));
          if (h2 > 0.3) drawCypress(px, Math.round(bx + 4 + h2 * 3), by + 5 + Math.floor(h1 * 3), 5 + Math.floor(h1 * 3));
        } else if (wood > 0.68) {
          drawTree(px, Math.round(bx + 3 + h1 * 2), Math.round(by + 3 + h2 * 2), 3 + Math.floor(h2 * 1.5), i + seed);
        } else {
          canopy(px, bx + 2 + h1 * 4, by + 2 + h2 * 4, 3.4 + h1 * 1.8, seed + i);
          if (h2 > 0.55) canopy(px, bx + 1 + h2 * 6, by + 5 + h1 * 2, 2.6 + h2, seed + i + 7);
        }
      } else if (t === T.grass) {
        const grove = valueNoise(tx, ty, 9, seed + 83);
        if ((grove > 0.74 && h1 > 0.45) || h1 > 0.975) drawTree(px, Math.round(bx + 2 + h2 * 4), Math.round(by + 3 + h1 * 2), 2 + Math.floor(h2 * 2), i + seed);
        else if (grove < 0.18 && h1 > 0.8) drawCypress(px, Math.round(bx + 3 + h2 * 2), by + 7, 6 + Math.floor(h1 * 3));
      } else if (t === T.scrub) {
        const grove = valueNoise(tx, ty, 8, seed + 84);
        if (grove > 0.7 && h1 > 0.35) {
          // an olive grove in loose rows
          drawTree(px, bx + 2, by + 2 + (tx & 1), 1 + (h2 > 0.6 ? 1 : 0), i, 1);
          if (h2 > 0.35) drawTree(px, bx + 6, by + 5 - (tx & 1), 1, i + 1, 1);
        } else if (h1 > 0.72) shrub(px, bx + 2 + Math.floor(h2 * 4), by + 3 + Math.floor(h1 * 3));
      } else if (t === T.hills && h1 > 0.42) hump(px, bx + 3 + h2 * 3, by + 7, 8 + Math.floor(h1 * 7), seed + i);
      else if (t === T.mountain) {
        const e = m.elev[i];
        if (h1 > 0.55) spire(px, bx + 4 + (h2 - 0.5) * 4, by + 8, 8 + Math.floor(h1 * 8), e > 1.08 && h2 > 0.5, seed + i);
        else if (h1 > 0.2) rockLump(px, bx + 2 + h2 * 4, by + 6, 4 + Math.floor(h2 * 3));
      } else if (t === T.beach && h1 > 0.93) rockLump(px, bx + 3 + h2 * 3, by + 5, 3 + Math.floor(h2 * 3));
    }
  }

  // ---- bridges where the roads cross rivers
  for (let ty = 0; ty < m.h; ty++)
    for (let tx = 0; tx < m.w; tx++) {
      const i = ty * m.w + tx;
      if (!m.road[i] || !m.river[i]) continue;
      const horiz = (tx > 0 && m.road[i - 1]) || (tx < m.w - 1 && m.road[i + 1]);
      const cx = tx * S + 4;
      const cy = ty * S + 4;
      if (horiz) {
        for (let k = -5; k <= 5; k++) for (let j = -1; j <= 1; j++) px.set(cx + k, cy + j, (cx + k) % 2 ? MAPC.earth[3] : MAPC.earth[4]);
        px.hline(cx - 5, cx + 5, cy - 2, MP.woodDk);
        px.hline(cx - 5, cx + 5, cy + 2, MP.woodDk);
        px.hline(cx - 4, cx + 5, cy + 3, MP.shadow);
      } else {
        for (let k = -5; k <= 5; k++) for (let j = -1; j <= 1; j++) px.set(cx + j, cy + k, (cy + k) % 2 ? MAPC.earth[3] : MAPC.earth[4]);
        px.vline(cx - 2, cy - 5, cy + 5, MP.woodDk);
        px.vline(cx + 2, cy - 5, cy + 5, MP.woodDk);
        px.vline(cx + 3, cy - 4, cy + 6, MP.shadow);
      }
    }

  // ---- landmarks and settlements, north to south; houses never stand in the sea
  const all = [...marks, ...sites].sort((a, b) => a.y + a.h - (b.y + b.h));
  for (const s of all) {
    const sp = s.sprite.pix;
    if (s.quay) {
      // a cramped town is built out over the shallows on a stone quay
      const inQ = (i: number, j: number) => i >= 0 && j >= 0 && i < sp.w && j < sp.h && sp.alpha(i, j) > 200;
      for (let j = 0; j < sp.h + 2; j++)
        for (let i = 0; i < sp.w; i++) {
          const X = s.x + i;
          const Y = s.y + j;
          if (X < 0 || Y < 0 || X >= W || Y >= H || !water[Y * W + X]) continue;
          if (inQ(i, j)) px.set(X, Y, hash2(X, Y, 919) < 0.1 ? MP.stoneDk : MP.stoneLo);
          else if (inQ(i, j - 1)) px.set(X, Y, MP.stoneRim);
          else if (inQ(i, j - 2)) px.set(X, Y, MAPC.foam);
        }
    }
    for (let j = 0; j < sp.h; j++) {
      const Y = s.y + j;
      if (Y < 0 || Y >= H) continue;
      for (let i = 0; i < sp.w; i++) {
        const X = s.x + i;
        if (X < 0 || X >= W) continue;
        const a = sp.alpha(i, j);
        if (!a) continue;
        if (water[Y * W + X] && !s.quay) {
          // towns are built down to the water on quays; elsewhere the picture stops at the shore
          if (s.kind === 'town' && toLand[Y * W + X] <= 5 && a >= 200) {
            px.set(X, Y, sp.get(i, j));
            if (Y + 1 < H && water[(Y + 1) * W + X] && !(j + 1 < sp.h && sp.alpha(i, j + 1) >= 200)) px.set(X, Y + 1, MP.stoneRim);
            continue;
          }
          if (toLand[Y * W + X] > 1.5 || a < 200 || s.kind === 'landmark') continue;
          px.set(X, Y, (X + Y) % 3 ? MP.stoneLo : MP.stoneDk);
          continue;
        }
        px.set(X, Y, sp.get(i, j), a);
      }
    }
  }
  // harbours on top: quays, piers, moored ships, a beached pirate galley
  for (const s of sites) {
    const h = s.harbour;
    if (!h) continue;
    if (s.kind === 'lair') {
      const ship = shipPix(0x3a2a34);
      const sx = Math.round(h.x + h.dx * 12) - 10;
      const sy = Math.round(h.y + h.dy * 12) - 10;
      px.blit(ship, sx, sy, h.dx < 0);
      continue;
    }
    const arch = archOfSettlement(m.settlements[s.id]);
    const hp = harbourProp(s.kind === 'town' ? 'town' : 'post', h.dx, h.dy, arch, s.id * 31 + seed);
    h.fires = hp.fires.map((f) => ({ x: h.x - hp.ox + f.x, y: h.y - hp.oy + f.y }));
    for (let j = 0; j < hp.pix.h; j++)
      for (let i = 0; i < hp.pix.w; i++) {
        const a = hp.pix.alpha(i, j);
        if (!a) continue;
        const X = h.x - hp.ox + i;
        const Y = h.y - hp.oy + j;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        if (!water[Y * W + X] && toSea[Y * W + X] > 2) continue; // piers and ships stay in the water
        px.set(X, Y, hp.pix.get(i, j), a);
      }
  }
  const lanes = seaLanes(m, sites, seed);
  return { pix: px, water, sites: [...sites, ...marks], lanes, fields };
}

// ------------------------------------------------------------------ layout

/** Unit vector from (cx, cy) towards the open sea nearby (water well away from land), or null inland. */
function seaDir(water: Uint8Array, toLand: Float32Array, W: number, H: number, cx: number, cy: number, R = 72): { dx: number; dy: number } | null {
  let sx = 0;
  let sy = 0;
  let k = 0;
  for (let dy = -R; dy <= R; dy += 4)
    for (let dx = -R; dx <= R; dx += 4) {
      const d = Math.hypot(dx, dy);
      if (d > R || d < 1) continue;
      const X = Math.round(cx + dx);
      const Y = Math.round(cy + dy);
      if (X < 0 || Y < 0 || X >= W || Y >= H || !water[Y * W + X] || toLand[Y * W + X] < 8) continue;
      const wgt = Math.min(3, toLand[Y * W + X] / 8) / d;
      sx += dx * wgt;
      sy += dy * wgt;
      k++;
    }
  const l = Math.hypot(sx, sy);
  if (k < 6 || l < 1e-3) return null;
  return { dx: sx / l, dy: sy / l };
}

/** The last land pixel walking from (cx, cy) along (dx, dy) before the sea, or null. */
function coastAlong(water: Uint8Array, W: number, H: number, cx: number, cy: number, dx: number, dy: number, max = 90): { x: number; y: number; d: number } | null {
  for (let k = 1; k <= max; k++) {
    const X = Math.round(cx + dx * k);
    const Y = Math.round(cy + dy * k);
    if (X < 0 || Y < 0 || X >= W || Y >= H) return null;
    if (water[Y * W + X]) return { x: Math.round(cx + dx * (k - 1)), y: Math.round(cy + dy * (k - 1)), d: k - 1 };
  }
  return null;
}

function layoutSites(m: WorldMap, water: Uint8Array, toLand: Float32Array, W: number, H: number): SiteArt[] {
  const out: SiteArt[] = [];
  const wet = (X: number, Y: number) => X < 0 || Y < 0 || X >= W || Y >= H || water[Y * W + X] === 1;
  for (const s of m.settlements) {
    const arch = archOfSettlement(s);
    const cx = s.x * WTILE + WTILE / 2;
    const cy = s.y * WTILE + WTILE / 2;
    const lift = s.kind === 'lair' ? 6 : 0;
    // built on dry land: slide the picture (keeping the settlement's tile on it) to cover the least sea
    const place = (w: number, h: number) => {
      const R = s.kind === 'town' ? 18 : s.kind === 'village' ? 14 : 6;
      let best = { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2 - lift), score: Infinity, frac: 1 };
      for (let oy = -R; oy <= R; oy += 2)
        for (let ox = -R; ox <= R; ox += 2) {
          const bx = Math.round(cx - w / 2 + ox);
          const by = Math.round(cy - h / 2 + oy - lift);
          if (cx < bx + 6 || cx > bx + w - 6 || cy < by + 6 || cy > by + h - 4) continue;
          let n = 0;
          let all = 0;
          for (let j = 3; j < h - 3; j += 3)
            for (let i = 3; i < w - 3; i += 3) {
              all++;
              if (wet(bx + i, by + j)) n++;
            }
          const score = n * 4 + Math.hypot(ox, oy) * 0.6;
          if (score < best.score) best = { x: bx, y: by, score, frac: n / all };
        }
      return best;
    };
    let sprite: PropSprite;
    let best: { x: number; y: number; frac: number };
    if (s.kind === 'town') {
      // a big town where there is room, a smaller one on a narrow cape
      const sizes: [number, number][] = [
        [78 + Math.floor(hash2(s.id, 1, m.seed) * 8), 66 + Math.floor(hash2(s.id, 2, m.seed) * 6)],
        [66, 56],
        [54, 46],
      ];
      let k = 0;
      best = place(...sizes[0]);
      while (best.frac > 0.16 && k < sizes.length - 1) best = place(...sizes[++k]);
      sprite = townProp(arch, s.id * 977 + m.seed, ...sizes[k]);
    } else {
      sprite = s.kind === 'village' ? villageProp(arch, s.id * 977 + m.seed) : lairProp(s.name, s.id * 977 + m.seed);
      best = place(sprite.pix.w, sprite.pix.h);
    }
    const w = sprite.pix.w;
    const h = sprite.pix.h;
    const x = best.x;
    const y = best.y;
    const mx = x + w / 2;
    const my = y + h / 2;
    let harbour: SiteArt['harbour'] = null;
    const dir0 = s.coastal ? seaDir(water, toLand, W, H, mx, my) : null;
    if (dir0) {
      // the way out to sea, turned a little if a headland is in the way
      for (const turn of [0, 0.5, -0.5, 1, -1]) {
        const dx = dir0.dx * Math.cos(turn) - dir0.dy * Math.sin(turn);
        const dy = dir0.dx * Math.sin(turn) + dir0.dy * Math.cos(turn);
        const coast = coastAlong(water, W, H, mx, my, dx, dy);
        if (!coast || coast.d > Math.max(w, h) * 0.75) continue;
        // room for piers and moored ships: open water off the coast point
        let n = 0;
        let all = 0;
        for (let j = -8; j <= 8; j += 2)
          for (let i = -8; i <= 8; i += 2) {
            all++;
            if (wet(Math.round(coast.x + dx * 18 + i), Math.round(coast.y + dy * 18 + j))) n++;
          }
        if (n / all < 0.65) continue;
        harbour = { x: coast.x, y: coast.y, dx, dy, fires: [] };
        break;
      }
    }
    // the name plate under the picture, or over it when the harbour is on the south side
    const ly = harbour && harbour.dy > 0.55 ? y - 8 : y + h - (s.kind === 'town' ? 4 : 2);
    out.push({ id: s.id, kind: s.kind, x, y, w, h, sprite, harbour, lx: Math.round(mx), ly, quay: s.kind !== 'lair' && best.frac > 0.16 });
  }
  return out;
}

interface FieldPatch {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: number;
}

/** Patchwork fields around towns and villages (flat open ground only). */
function layoutFields(m: WorldMap, sites: SiteArt[], reserved: Uint8Array): FieldPatch[] {
  const out: FieldPatch[] = [];
  const S = WTILE;
  for (const s of sites) {
    if (s.kind !== 'town' && s.kind !== 'village') continue;
    const R = rng(s.id * 7919 + m.seed + 3);
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    const blocks = s.kind === 'town' ? 4 : 3;
    const base = Math.max(s.w, s.h) / 2 + 2;
    const mine: FieldPatch[] = [];
    let made = 0;
    for (let tries = 0; tries < blocks * 10 && made < blocks; tries++) {
      const a = R() * Math.PI * 2;
      const d = base + R() * (s.kind === 'town' ? 30 : 20);
      const FW = 22 + Math.floor(R() * 20);
      const FH = 16 + Math.floor(R() * 12);
      const x = Math.round(cx + Math.cos(a) * d - FW / 2);
      const y = Math.round(cy + Math.sin(a) * d * 0.8 - FH / 2);
      let ok = x > 4 && y > 4 && x + FW < m.w * S - 4 && y + FH < m.h * S - 4;
      for (let ty = Math.floor((y - 1) / S); ok && ty <= Math.floor((y + FH + 1) / S); ty++)
        for (let tx = Math.floor((x - 1) / S); ok && tx <= Math.floor((x + FW + 1) / S); tx++) {
          const i = ty * m.w + tx;
          const t = m.terrain[i];
          if ((t !== T.grass && t !== T.scrub) || m.road[i] || m.river[i] || reserved[i]) ok = false;
        }
      if (!ok || [...out, ...mine].some((o) => x < o.x + o.w + 3 && x + FW > o.x - 3 && y < o.y + o.h + 3 && y + FH > o.y - 3)) continue;
      made++;
      const vertical = R() < 0.5;
      const k = 2 + Math.floor(R() * 3);
      let at = 0;
      const total = vertical ? FW : FH;
      for (let q = 0; q < k && at < total; q++) {
        const size = q === k - 1 ? total - at : Math.max(6, Math.floor((total / k) * (0.7 + R() * 0.6)));
        if (size < 5) break;
        const kind = Math.floor(R() * 5);
        if (vertical) mine.push({ x: x + at, y, w: size - 1, h: FH, kind });
        else mine.push({ x, y: y + at, w: FW, h: size - 1, kind });
        at += size;
      }
    }
    out.push(...mine);
  }
  return out;
}

/** A handful of landmarks out in the countryside, away from settlements and roads. */
function layoutLandmarks(m: WorldMap, reserved: Uint8Array, seed: number): SiteArt[] {
  const R = rng(seed * 31 + 7);
  const out: SiteArt[] = [];
  const S = WTILE;
  const cands: { x: number; y: number; s: number }[] = [];
  for (let ty = 4; ty < m.h - 6; ty += 2)
    for (let tx = 4; tx < m.w - 6; tx += 2) cands.push({ x: tx, y: ty, s: hash2(tx, ty, seed + 301) });
  cands.sort((a, b) => a.s - b.s);
  const used: LandmarkKind[] = [];
  for (const c of cands) {
    if (out.length >= 8) break;
    if (m.settlements.some((s) => Math.max(Math.abs(s.x - c.x), Math.abs(s.y - c.y)) < 9)) continue;
    if (out.some((o) => Math.hypot(o.x / S - c.x, o.y / S - c.y) < 16)) continue;
    let ok = true;
    for (let dy = -2; ok && dy <= 2; dy++)
      for (let dx = -2; ok && dx <= 2; dx++) {
        const i = (c.y + dy) * m.w + c.x + dx;
        const t = m.terrain[i];
        if (isWater(t) || t === T.mountain || t === T.forest || m.road[i] || m.river[i] || reserved[i]) ok = false;
      }
    if (!ok) continue;
    const t = m.terrain[c.y * m.w + c.x];
    const pool: LandmarkKind[] = t === T.hills ? ['tower', 'tumulus', 'stones'] : t === T.scrub ? ['ruin', 'statue', 'stones', 'shrine'] : ['shrine', 'ruin', 'tumulus', 'statue', 'tower'];
    const fresh = pool.filter((k) => !used.includes(k));
    const kind = (fresh.length ? fresh : pool)[Math.floor(R() * (fresh.length || pool.length))] ?? LANDMARKS[0];
    used.push(kind);
    const sprite = landmarkProp(kind, c.x * 131 + c.y);
    const x = c.x * S + 4 - sprite.ax;
    const y = c.y * S + 4 - sprite.ay;
    out.push({ id: -1, kind: 'landmark', x, y, w: sprite.pix.w, h: sprite.pix.h, sprite, harbour: null, lx: 0, ly: 0 });
  }
  return out;
}

/** Ship lanes on open water: between the harbours, and a few offshore runs. */
function seaLanes(m: WorldMap, sites: SiteArt[], seed: number): SeaLane[] {
  const S = WTILE;
  const cost = (x: number, y: number) => {
    const t = m.terrain[y * m.w + x];
    return t === T.deep ? 1 : t === T.sea ? 1.4 : Infinity;
  };
  const portTile = (s: SiteArt) => {
    const h = s.harbour!;
    for (let k = 16; k < 60; k += 2) {
      const tx = Math.floor((h.x + h.dx * k) / S);
      const ty = Math.floor((h.y + h.dy * k) / S);
      if (tx < 1 || ty < 1 || tx >= m.w - 1 || ty >= m.h - 1) return null;
      if (isWater(m.terrain[ty * m.w + tx])) return { x: tx, y: ty };
    }
    return null;
  };
  const ports = sites.filter((s) => s.harbour && s.kind !== 'lair').map(portTile).filter((p): p is { x: number; y: number } => !!p);
  const pairs: [{ x: number; y: number }, { x: number; y: number }][] = [];
  for (let a = 0; a < ports.length; a++) for (let b = a + 1; b < ports.length; b++) pairs.push([ports[a], ports[b]]);
  pairs.sort((p, q) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) - Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y));
  const R = rng(seed * 17 + 5);
  const routes: { x: number; y: number }[][] = [];
  for (const [a, b] of pairs) {
    if (routes.length >= 5) break;
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d < 10 || d > 90) continue;
    const p = findPath(m.w, m.h, cost, a.x, a.y, b.x, b.y, 1, 30000);
    if (p && p.length > 8) routes.push(p);
  }
  // offshore runs
  const deep: { x: number; y: number }[] = [];
  for (let ty = 2; ty < m.h - 2; ty += 3) for (let tx = 2; tx < m.w - 2; tx += 3) if (m.terrain[ty * m.w + tx] === T.deep) deep.push({ x: tx, y: ty });
  for (let k = 0; k < 12 && routes.length < 8 && deep.length > 2; k++) {
    const a = deep[Math.floor(R() * deep.length)];
    const b = deep[Math.floor(R() * deep.length)];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d < 24 || d > 70) continue;
    const p = findPath(m.w, m.h, cost, a.x, a.y, b.x, b.y, 1, 30000);
    if (p && p.length > 12) routes.push(p);
  }
  return routes.map((p, i) => {
    const pts: Pt[] = [];
    for (let k = 0; k < p.length; k += 2) pts.push({ x: p[k].x * S + 4 + (valueNoise(k, i, 3, seed) - 0.5) * 6, y: p[k].y * S + 4 + (valueNoise(i, k, 3, seed) - 0.5) * 6 });
    const last = p[p.length - 1];
    pts.push({ x: last.x * S + 4, y: last.y * S + 4 });
    let len = 0;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let k = 0; k < pts.length; k++) {
      if (k) len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
      x0 = Math.min(x0, pts[k].x);
      y0 = Math.min(y0, pts[k].y);
      x1 = Math.max(x1, pts[k].x);
      y1 = Math.max(y1, pts[k].y);
    }
    return { pts, len, x0, y0, x1, y1, kind: hash2(i, 4, seed) < 0.6 ? 'merchant' : 'galley', speed: 5 + hash2(i, 5, seed) * 4, phase: hash2(i, 6, seed) };
  });
}

// ------------------------------------------------------------------ lairs

/**
 * A band's camp drawn with the field-camp kit (same tents, fire and supplies
 * as the player's camp): a bandit camp behind a stake fence, a Galatae
 * war camp with a ring palisade and a chief's tent, or a pirate cove (its
 * galley is beached at the shore by the map).
 */
function lairProp(name: string, seed: number): PropSprite {
  const W = 52;
  const H = 42;
  const p = new Pix(W, H);
  const smoke: Pt[] = [];
  const flags: (Pt & { c: number })[] = [];
  const fires: Pt[] = [];
  const pirates = /Pirate/.test(name);
  const gal = /Galatae/.test(name);
  const cx = 26;
  const cy = 25;
  // trampled ground, worn to earth in the middle
  for (let j = -14; j <= 14; j++)
    for (let i = -24; i <= 24; i++) {
      const d = (i / 23) ** 2 + (j / 13) ** 2 + (hash2(i, j, seed) - 0.5) * 0.18;
      if (d > 1) continue;
      const h = hash2(i + cx, j + cy, seed + 1);
      let c: number = d < 0.55 ? (h < 0.12 ? KIT.earth[2] : h > 0.93 ? KIT.earth[3] : KIT.earth[1]) : h < 0.5 ? KIT.earth[0] : MAPC.grass[1];
      if (pirates && d < 0.8) c = h < 0.1 ? MAPC.sandDot : MAPC.sand[1];
      p.set(cx + i, cy + j, c);
    }
  // a stake fence round the back (all round for the Galatae)
  const stakes: { x: number; y: number }[] = [];
  if (!pirates)
    for (let a = 0; a < 40; a++) {
      const t = Math.PI + (a / 40) * Math.PI * (gal ? 2 : 1.05);
      if (gal && Math.abs(t - Math.PI * 2.5) < 0.25) continue; // the gate, south
      stakes.push({ x: Math.round(cx + Math.cos(t) * 23), y: Math.round(cy + Math.sin(t) * 13) });
    }
  stakes.sort((a, b) => a.y - b.y);
  const back = stakes.filter((s) => s.y <= cy);
  const front = stakes.filter((s) => s.y > cy);
  for (const s of back) drawStake(p, s.x, s.y, 5);
  // tents (north first), the fire, supplies
  const tents: [number, number, 0 | 1 | 2 | 3, boolean | 'small'][] = gal
    ? [[14, 20, 1, false], [33, 18, 0, true], [40, 31, 1, 'small']]
    : pirates
      ? [[13, 21, 3, false], [33, 19, 2, false]]
      : [[13, 20, 2, false], [32, 18, 3, false], [11, 34, 2, 'small']];
  tents.sort((a, b) => a[1] - b[1]);
  for (const [x, y, look, big] of tents) {
    const t = renderTent(look, big);
    p.blit(t, x - Math.floor(t.w / 2), y - t.h + 2);
  }
  const fire = renderCampfire(0);
  p.blit(fire, cx - 6, cy + 4 - 9);
  fires.push({ x: cx, y: cy + 1 });
  smoke.push({ x: cx, y: cy - 3 });
  const props: [PropKind, number, number][] = pirates
    ? [['amphorae', 40, 34], ['crates', 8, 32], ['barrel', 30, 35]]
    : gal
      ? [['shields', 22, 36], ['logs', 30, 37]]
      : [['rack', 40, 30], ['crates', 22, 37], ['sacks', 33, 37]];
  for (const [k, x, y] of props) {
    const q = renderProp(k);
    p.blit(q, x - Math.floor(q.w / 2), y - q.h + 1);
  }
  for (const s of front) drawStake(p, s.x, s.y, 5);
  // the band's banner (the cloth waves on the map)
  const fx = gal ? 24 : 44;
  const fy = gal ? 8 : 12;
  p.vline(fx, fy, fy + 10, KIT.wood[3]);
  p.set(fx + 1, fy + 10, MAPC.shade, 90);
  flags.push({ x: fx, y: fy - 1, c: pirates ? 0x2e2026 : gal ? 0x3d5a78 : 0x86343a });
  return { pix: p, ax: cx, ay: cy, smoke, flags, fires };
}

// ------------------------------------------------------------------ terrain helpers


/** Lavender drop shadow, blended. */
function shadowAt(px: Pix, x: number, y: number, a = 70): void {
  px.set(x, y, MAPC.shade, a);
}

function distField(W: number, H: number, src: (i: number) => boolean, cap: number): Float32Array {
  const d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = src(i) ? 0 : cap;
  const D = 1.414;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let v = d[i];
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[i - W] + 1);
        if (x > 0) v = Math.min(v, d[i - W - 1] + D);
        if (x < W - 1) v = Math.min(v, d[i - W + 1] + D);
      }
      d[i] = v;
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      let v = d[i];
      if (v === 0) continue;
      if (x < W - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < H - 1) {
        v = Math.min(v, d[i + W] + 1);
        if (x < W - 1) v = Math.min(v, d[i + W + 1] + D);
        if (x > 0) v = Math.min(v, d[i + W - 1] + D);
      }
      d[i] = v;
    }
  }
  return d;
}

/** Land in sage tones: organic patches of drier and lusher ground (no grid), with wind-combed "w" tufts. */
function landColor(t: number, x: number, y: number, seed: number): number {
  const blk = valueNoise(x, y, 38, seed + 31) * 0.65 + valueNoise(x, y, 12, seed + 32) * 0.35;
  let base: number;
  let ramp: number[];
  if (t === T.scrub) ramp = MAPC.scrub;
  else if (t === T.forest) ramp = MAPC.forestFloor;
  else if (t === T.hills) ramp = MAPC.hillFloor;
  else if (t === T.mountain) ramp = MAPC.rockFloor;
  else ramp = MAPC.grass;
  // a dithered fringe between the patches keeps the edges pixel-clean
  const q = Math.min(ramp.length - 1, Math.max(0, (blk - 0.2) / 0.6) * ramp.length);
  const qi = Math.floor(q);
  base = ramp[q - qi < 0.15 && ((x + y) & 1) && qi > 0 ? qi - 1 : qi];
  if (t === T.grass && blk > 0.68 && !(blk < 0.71 && ((x + y) & 1))) base = hash2(x, y, seed + 33) > 0.96 ? MAPC.sandDot : MP.pale;
  // tufts: a little "w" mark in a 6x5 cell
  const cx = Math.floor(x / 6);
  const cy = Math.floor(y / 5);
  const h = hash2(cx, cy, seed + 37);
  if (h < (t === T.mountain ? 0.12 : 0.42)) {
    const lx = x - cx * 6 - Math.floor(h * 10) % 2;
    const ly = y - cy * 5 - Math.floor(h * 20) % 3;
    if ((ly === 0 && (lx === 0 || lx === 2 || lx === 4)) || (ly === 1 && (lx === 1 || lx === 3))) {
      return h < 0.08 ? mix(base, 0xfff4d8, 0.45) : mix(base, MAPC.earth[1], 0.28);
    }
  }
  // scrubland: sparse ochre dots
  if (t === T.scrub && hash2(x, y, seed + 5) > 0.965) return MAPC.earth[3];
  return base;
}

/** A blobby tree canopy: overlapping discs, lit top-left, dark under-band, dotted rim, lavender shadow SE. */
function canopy(px: Pix, cx: number, cy: number, r: number, seed: number): void {
  const n = 3 + Math.floor(hash2(seed, 1, 5) * 2);
  const discs: { x: number; y: number; r: number }[] = [{ x: cx, y: cy, r }];
  for (let k = 1; k < n; k++) {
    const a = hash2(seed, k, 9) * Math.PI * 2;
    const d = r * (0.45 + hash2(seed, k, 11) * 0.35);
    discs.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.8, r: r * (0.55 + hash2(seed, k, 13) * 0.3) });
  }
  const x0 = Math.floor(cx - r * 2) - 1;
  const y0 = Math.floor(cy - r * 2) - 1;
  const sz = Math.ceil(r * 4) + 3;
  const inside = (x: number, y: number) => {
    let best = -1;
    let lit = 0;
    for (const d of discs) {
      const q = 1 - Math.hypot(x + 0.5 - d.x, y + 0.5 - d.y) / d.r;
      if (q > best) {
        best = q;
        lit = -((x + 0.5 - d.x) + (y + 0.5 - d.y)) / d.r;
      }
    }
    return best >= 0 ? lit : null;
  };
  // shadow to the south-east
  for (let y = y0; y < y0 + sz + 3; y++) for (let x = x0; x < x0 + sz + 3; x++) {
    if (inside(x, y) !== null) continue;
    if (inside(x - 2, y - 2) !== null) shadowAt(px, x, y, 80);
  }
  const C = MAPC.canopy;
  for (let y = y0; y < y0 + sz; y++) {
    for (let x = x0; x < x0 + sz; x++) {
      const lit = inside(x, y);
      if (lit === null) continue;
      const below = inside(x, y + 1) === null;
      const right = inside(x + 1, y) === null;
      const top = inside(x, y - 1) === null || inside(x - 1, y) === null;
      let c: number;
      if (below || right) c = (x + y) % 2 === 0 ? C[4] : C[3];
      else if (inside(x, y + 2) === null) c = C[3];
      else if (top) c = C[1];
      else c = lit > 0.5 ? C[0] : lit > -0.15 ? C[1] : C[2];
      px.set(x, y, c);
    }
  }
}

function shrub(px: Pix, x: number, y: number): void {
  const C = MAPC.canopy;
  shadowAt(px, x + 1, y + 2, 70);
  shadowAt(px, x + 2, y + 2, 70);
  px.set(x, y, C[1]);
  px.set(x + 1, y, C[0]);
  px.set(x, y + 1, C[3]);
  px.set(x + 1, y + 1, C[2]);
  px.set(x - 1, y + 1, C[3]);
}

/** A painted hill: a soft dome lit from the upper left, dotted rim on the shaded side, shadow SE. */
function hump(px: Pix, cx: number, by: number, w: number, seed: number): void {
  const h = Math.max(3, Math.round(w * 0.42));
  const E = MAPC.earth;
  const inDome = (dx: number, dy: number) => {
    const u = dx / (w / 2);
    const v = (h - dy) / h;
    return u * u + v * v <= 1 && dy <= h;
  };
  for (let dy = 0; dy <= h + 2; dy++) for (let dx = -Math.ceil(w / 2) - 1; dx <= Math.ceil(w / 2) + 3; dx++) {
    if (inDome(dx, dy)) continue;
    if (inDome(dx - 2, dy - 1) && dy > h / 3) shadowAt(px, cx + dx, by - h + dy, 75);
  }
  for (let dy = 0; dy <= h; dy++) {
    for (let dx = -Math.ceil(w / 2); dx <= Math.ceil(w / 2); dx++) {
      if (!inDome(dx, dy)) continue;
      const u = dx / (w / 2);
      const v = (h - dy) / h;
      const lit = -u * 0.8 + v * 0.6;
      const edgeR = !inDome(dx + 1, dy) || !inDome(dx, dy + 1);
      let c = lit > 0.55 ? E[4] : lit > 0.05 ? E[3] : E[2];
      if (!inDome(dx, dy - 1) && dx <= 0) c = 0xf4e4c0;
      if (edgeR) c = (Math.round(cx + dx) + dy) % 2 === 0 ? E[1] : E[2];
      // a few grass tufts on the crown
      if (!edgeR && lit > 0.2 && hash2(dx, dy, seed) > 0.86) c = MAPC.grass[0];
      px.set(cx + dx, by - h + dy, c);
    }
  }
}

/** A mauve rock spire (mountains), with a long soft lavender shadow trailing south-east. */
function spire(px: Pix, cx: number, by: number, h: number, snow: boolean, seed: number): void {
  const R = MAPC.rock;
  const w = Math.max(4, Math.round(h * 0.85));
  const half = (dy: number) => (w / 2) * Math.sqrt(Math.min(1, (dy + 1) / (h * 0.75)));
  // shadow tail
  for (let k = 0; k < h; k++) {
    const sx = cx + 1 + k * 0.7;
    const sy = by - 1 + k * 0.35;
    const sw = Math.max(1, (w / 2) * (1 - k / h));
    for (let o = -sw; o <= sw; o++) shadowAt(px, Math.round(sx + o * 0.3), Math.round(sy + o * 0.5), 55);
  }
  for (let dy = 0; dy < h; dy++) {
    const hw = half(dy);
    for (let dx = Math.floor(-hw); dx <= Math.ceil(hw); dx++) {
      if (Math.abs(dx) > hw + 0.3) continue;
      const u = dx / Math.max(1, hw);
      const rightEdge = Math.abs(dx + 1) > hw + 0.3;
      let c = u < -0.35 ? R[1] : u < 0.25 ? R[2] : R[3];
      if (dy === 0 || (u < -0.5 && hash2(dx, dy, seed) > 0.6)) c = R[0];
      if (rightEdge || dy === h - 1) c = (dx + dy) % 2 === 0 ? R[4] : R[3];
      // a crack or two
      if (!rightEdge && dy > 2 && hash2(dx, dy, seed + 3) > 0.92) c = R[3];
      if (snow && dy < h * 0.32 && !rightEdge) c = u < 0.2 ? MAPC.snow : 0xe8d8d4;
      px.set(Math.round(cx + dx), by - h + dy, c);
    }
  }
}

function rockLump(px: Pix, cx: number, by: number, s: number): void {
  const R = MAPC.rock;
  for (let k = 0; k < s + 2; k++) shadowAt(px, Math.round(cx + 1 + k), by + 1, 55);
  px.ellipse(Math.round(cx - s / 2), by - s + 1, s + 1, s, (_x, _y, edge, u, v) => (edge && (u > 0 || v > 0) ? R[4] : u + v < -0.4 ? R[0] : R[2]));
}

