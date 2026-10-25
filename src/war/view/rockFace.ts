/**
 * Procedural pixel-art rock, painted once per material into tiling canvases:
 *
 * - wallTexture: the face of a tall cliff (./art.ts) in world space (16 px per 1 m cell along the wall, LH = 32 px per
 *   level down it), so the strata stay level round corners and across cells. Strata bands of varied thickness, some
 *   jutting as ledges with a lit top and the shadow of their overhang under them; columns of varied width split by
 *   joints, rounded (lit middle, dark edges) and often running on through several bands; crevices wandering down
 *   the face; a dither over all. One palette per stone: oxblood sandstone (kyrene), pale limestone (elaia),
 *   grey granite (mountains, crags).
 * - peakTexture: rgba marks laid over the flat-shaded peak triangles (./peaks.ts) at the near zooms, sheared so their
 *   rows follow the triangle's contour lines: broken strata with lit ledge tops, joints and crevices down the fall
 *   line, mottling; wind ripples on snow; even pebbles on scree.
 */
export type Stone = 'sandstone' | 'limestone' | 'granite';

/** Wall texture size (px): 32 cells along the wall, 24 levels down it. */
export const WALL_W = 512, WALL_H = 768;

/** Palettes, dark to light; sandstone's second ramp is its ochre bands. */
const PAL: Record<Stone, string[][]> = {
  // the deep oxblood red of the references (shots/war/regions/proto/kyrene-*.png), its second ramp a rust barely off it
  sandstone: [
    ['#220e0c', '#33130f', '#461a14', '#5a2119', '#6d281e', '#7f3024', '#8f3a2c', '#9d4636', '#aa5541'],
    ['#26110d', '#381811', '#4b2016', '#5f291b', '#713221', '#823b27', '#91462f', '#9e5239', '#aa6044'],
  ],
  limestone: [
    ['#3e3c3a', '#54514d', '#6b6761', '#827d75', '#99938a', '#aea89d', '#c1bcb0', '#d3cfc4', '#e3e0d7'],
    ['#44403a', '#5a554d', '#716b60', '#888174', '#9e9787', '#b2ab9a', '#c4bead', '#d5d0c0', '#e4e0d2'],
  ],
  granite: [
    ['#22242a', '#30333a', '#3f424a', '#4f525b', '#60636c', '#72757d', '#868890', '#9a9ca2', '#afb0b4'],
    ['#26252a', '#353339', '#444248', '#545158', '#646168', '#757279', '#87848a', '#9a979c', '#adaaae'],
  ],
};

/** Per stone: band thickness range (px), ledge share, column width range, share of bands whose joints carry on from the band above, crevices. */
/** `stripe`: how strongly each band darkens toward its bedding plane (the sandstone's bands stay faint, its columns lead). */
const KIT: Record<Stone, { band: [number, number]; ledge: number; col: [number, number]; carry: number; crev: number; alt: number; base: number; stripe: number }> = {
  sandstone: { band: [10, 44], ledge: 0.2, col: [12, 52], carry: 0.85, crev: 30, alt: 0.07, base: 3.6, stripe: 0.45 },
  limestone: { band: [5, 22], ledge: 0.4, col: [14, 60], carry: 0.45, crev: 30, alt: 0.25, base: 3.9, stripe: 1 },
  granite: { band: [14, 52], ledge: 0.25, col: [10, 46], carry: 0.45, crev: 34, alt: 0.25, base: 4, stripe: 1 },
};

/** A small seeded generator (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

const walls = new Map<Stone, HTMLCanvasElement>();

/** The tiling face texture of one stone (WALL_W x WALL_H), made once. */
export function wallTexture(stone: Stone): HTMLCanvasElement {
  const have = walls.get(stone);
  if (have) return have;
  const W = WALL_W, H = WALL_H, K = KIT[stone], R = rng(stone.length * 977 + 13), pal = PAL[stone].map((p) => p.map(hex));
  const shade = new Float32Array(W * H), ramp = new Uint8Array(W * H);
  // bands down the face (the last one closes at H so the texture tiles vertically)
  let cols: number[] = [];
  const newCols = () => {
    const c: number[] = [];
    for (let x = Math.floor(R() * K.col[0]); x < W - K.col[0]; x += K.col[0] + Math.floor(R() * R() * (K.col[1] - K.col[0]))) c.push(x);
    return c;
  };
  let prevLedge = false;
  for (let y0 = 0; y0 < H;) {
    let t = K.band[0] + Math.floor(R() * R() * (K.band[1] - K.band[0]));
    if (H - (y0 + t) < K.band[0]) t = H - y0;
    const alt = R() < K.alt ? 1 : 0, tone = K.base + (R() - 0.5) * 1.0 - alt * 0.6, ledge = R() < K.ledge;
    if (!cols.length || R() > K.carry) cols = newCols();
    else cols = cols.map((x) => (R() < 0.25 ? Math.max(0, Math.min(W - 1, x + Math.round((R() - 0.5) * 6))) : x)); // joints drift a little
    const colTone = cols.map(() => (R() - 0.5) * 1.3);
    for (let y = y0; y < y0 + t; y++) {
      const dy = y - y0;
      // within the band: lit top, darker toward its bedding plane; under a ledge above, its overhang's shadow
      let vb = (0.5 - (dy / t) * 1.1) * K.stripe;
      if (dy === 0 && ledge) vb += 2;
      if (dy === t - 1) vb -= 1.3 * K.stripe;
      if (prevLedge && dy < 3) vb -= 2.2 - dy * 0.6;
      let c = 0;
      for (let x = 0; x < W; x++) {
        while (c < cols.length - 1 && x >= cols[c + 1]) c++;
        const x0 = cols[c] ?? 0, x1 = c + 1 < cols.length ? cols[c + 1] : W + (cols[0] ?? 0), cw = Math.max(1, x1 - x0), fx = (x - x0) / cw;
        // a rounded column: lit toward the left (the NW light), dark at its right edge
        let v = tone + vb + (colTone[c] ?? 0) + 0.9 * Math.sin(Math.PI * fx) - 0.6 * fx;
        if (x === x0) v -= 2.6; else if (x === x0 + 1) v += 1.2;
        v += (R() - 0.5) * 0.9;
        const i = y * W + x;
        shade[i] = v;
        ramp[i] = alt;
      }
    }
    prevLedge = ledge;
    y0 += t;
  }
  // crevices: dark runs down the face, wandering a pixel at a time, a lit lip on their left
  for (let n = 0; n < K.crev; n++) {
    let x = Math.floor(R() * W), y = Math.floor(R() * H);
    const len = 40 + Math.floor(R() * 260), wide = R() < 0.4 ? 2 : 1;
    for (let s = 0; s < len; s++, y++) {
      if (R() < 0.18) x += R() < 0.5 ? -1 : 1;
      for (let k = 0; k < wide; k++) shade[((y % H) * W + ((x + k + W) % W))] -= 3.2;
      shade[((y % H) * W + ((x - 1 + W) % W))] += 0.9;
    }
  }
  // pits and chips
  for (let n = 0; n < W * H * 0.004; n++) {
    const x = Math.floor(R() * W), y = Math.floor(R() * H), i = y * W + x;
    shade[i] -= 2; shade[((y + 1) % H) * W + x] -= 1; shade[y * W + ((x + W - 1) % W)] += 1;
  }
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!, img = g.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const p = pal[ramp[i]], col = p[Math.max(0, Math.min(p.length - 1, Math.round(shade[i])))], o = 4 * i;
    img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  walls.set(stone, c);
  return c;
}

/** Peak texture size (px). */
const PT = 192;
const peaks = new Map<number, HTMLCanvasElement>();

/** Marks over the flat peak fills for material m (./peaks.ts RAMPS: rock, snow, scree, red rock, red scree), made once. */
export function peakTexture(m: number): HTMLCanvasElement {
  const have = peaks.get(m);
  if (have) return have;
  const N = PT, R = rng(101 + m * 31), a = new Float32Array(N * N); // signed: < 0 shade, > 0 light
  const put = (x: number, y: number, v: number) => { const i = (((y % N) + N) % N) * N + (((x % N) + N) % N); a[i] = v; };
  const add = (x: number, y: number, v: number) => { const i = (((y % N) + N) % N) * N + (((x % N) + N) % N); a[i] += v; };
  const rock = m === 0 || m === 3, scree = m === 2 || m === 4;
  if (rock) {
    // mottling: a few soft blobs of light and shade so a facet is not one flat colour
    for (let n = 0; n < 22; n++) {
      const cx = R() * N, cy = R() * N, r = 10 + R() * 22, s = (R() < 0.5 ? -1 : 1) * 0.14;
      for (let y = Math.floor(cy - r); y < cy + r; y++) for (let x = Math.floor(cx - r * 1.6); x < cx + r * 1.6; x++) {
        const d = ((x - cx) / 1.6) ** 2 + (y - cy) ** 2;
        if (d < r * r && R() < 0.85) add(x, y, s * (1 - d / (r * r)));
      }
    }
    // strata rows: broken dark bedding lines, a lit ledge top over each dash
    for (let y = 0; y < N;) {
      y += (m === 3 ? 4 : 5) + Math.floor(R() * 7);
      for (let x = Math.floor(R() * 8); x < N;) {
        const len = 3 + Math.floor(R() * R() * 34);
        const dark = m === 3 ? -0.55 : -0.5;
        for (let k = 0; k < len; k++) { put(x + k, y, dark); if (R() < 0.8) put(x + k, y - 1, 0.3); }
        // joints: short drops from the dash's ends down to the next row
        if (R() < 0.55) for (let k = 1; k < 4 + R() * 5; k++) put(x + len, y + k, -0.28);
        x += len + 2 + Math.floor(R() * 12);
      }
    }
    // crevices down the fall line, a lit lip on their left
    for (let n = 0; n < 16; n++) {
      let x = Math.floor(R() * N), y = Math.floor(R() * N);
      const len = 8 + Math.floor(R() * 34);
      for (let s = 0; s < len; s++, y++) {
        if (R() < 0.2) x += R() < 0.5 ? -1 : 1;
        put(x, y, -0.65); put(x + 1, y, -0.3); put(x - 1, y, 0.28);
      }
    }
    for (let n = 0; n < N * N * 0.03; n++) add(Math.floor(R() * N), Math.floor(R() * N), R() < 0.6 ? -0.16 : 0.14);
  } else if (scree) {
    // even pebbles: one-two px stones lit on top, shaded under, over a fine grain; faint runs down the slope
    for (let n = 0; n < N * N * 0.05; n++) {
      const x = Math.floor(R() * N), y = Math.floor(R() * N), big = R() < 0.35;
      put(x, y, 0.2); if (big) put(x + 1, y, 0.16);
      put(x, y + 1, -0.3); if (big) put(x + 1, y + 1, -0.3);
    }
    for (let n = 0; n < N * N * 0.06; n++) add(Math.floor(R() * N), Math.floor(R() * N), R() < 0.5 ? -0.12 : 0.09);
    for (let n = 0; n < 30; n++) { const x = Math.floor(R() * N), y = Math.floor(R() * N), l = 6 + R() * 20; for (let k = 0; k < l; k++) add(x, y + k, -0.06); }
  } else {
    // snow: wind ripples along the contours (a blue shade under a bright crest), sparkle
    for (let y = 0; y < N;) {
      y += 6 + Math.floor(R() * 9);
      for (let x = Math.floor(R() * 10); x < N;) {
        const len = 6 + Math.floor(R() * 30);
        for (let k = 0; k < len; k++) { put(x + k, y, -0.3); put(x + k, y + 1, -0.12); if (R() < 0.7) put(x + k, y - 1, 0.22); }
        x += len + 4 + Math.floor(R() * 18);
      }
    }
    for (let n = 0; n < N * N * 0.008; n++) put(Math.floor(R() * N), Math.floor(R() * N), 0.35);
  }
  const c = document.createElement('canvas');
  c.width = N; c.height = N;
  const g = c.getContext('2d')!, img = g.createImageData(N, N);
  // shade toward a cool dark (warm on red rock), light toward a warm white (blue-white on snow)
  const dk = m >= 3 ? [40, 12, 8] : m === 1 ? [52, 68, 104] : [10, 10, 18], lt = m === 1 ? [255, 255, 255] : m >= 3 ? [255, 214, 170] : [255, 246, 226];
  for (let i = 0; i < N * N; i++) {
    const v = a[i], o = 4 * i;
    if (Math.abs(v) < 0.02) continue;
    const c0 = v < 0 ? dk : lt;
    img.data[o] = c0[0]; img.data[o + 1] = c0[1]; img.data[o + 2] = c0[2]; img.data[o + 3] = Math.round(Math.min(1, Math.abs(v)) * 255);
  }
  g.putImageData(img, 0, 0);
  peaks.set(m, c);
  return c;
}
