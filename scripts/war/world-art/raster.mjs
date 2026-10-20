// Region raster: warp the cell grid into organic shapes, clean it, check it against WAR.md, trace polygons.
import { LW, LH, GX, GY, CELL, OX, OY, gridLabel } from './layout.mjs';

// Seeded value noise (smoothstep-interpolated lattice), deterministic.
function hash(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
export function noise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * 2 - 1;
}
const fbm = (x, y, seed, layers) => layers.reduce((s, [amp, freq], i) => s + amp * noise(x / freq, y / freq, seed + i * 101), 0);

// Displacement field (logical px) that bends the grid's straight cell edges into organic region borders.
const K = CELL / 30; // the fields were tuned on 30 px cells
export const BORDER = [[44, 210], [24, 70], [8, 24]].map(([a, f]) => [a * K, f * K]);
export const warp = (x, y, layers, seed) => [x + fbm(x, y, seed, layers), y + fbm(x, y, seed + 7, layers)];

function cellAt(x, y) {
  const cx = Math.floor((x - OX) / CELL), cy = Math.floor((y - OY) / CELL);
  if (cx < 0 || cy < 0 || cx >= GX || cy >= GY) return null;
  return gridLabel(cx, cy);
}

/**
 * Fit the cell grid to the painted continent (v2, W-43): every land pixel of the painting looks up the warped grid
 * along its ray from the centre (the Omphalos mesa), scaled so the painted coast lands on the grid's edge. The
 * painting's land mask is the coast; the grid only decides which region a land pixel belongs to.
 * fit = { land: Uint8Array(LW * LH), centre: [x, y] } in logical px.
 */
export function buildRaster(ids, fit) {
  const index = new Map(ids.map((id, i) => [id, i + 1])); // 0 = sea
  const lab = new Int16Array(LW * LH);
  const { land, centre: [px, py], twist = [] } = fit;
  // twist: [[paint angle, extra grid angle, width], ...] in degrees turns the grid locally (keeps a corner off a bay)
  const rad = Math.PI / 180;
  const turn = (a) => twist.reduce((t, [at, by, w]) => {
    const d = Math.atan2(Math.sin(a - at * rad), Math.cos(a - at * rad)) / rad;
    return t + by * Math.exp(-((d / w) ** 2));
  }, 0) * rad;
  const gx = OX + (GX * CELL) / 2, gy = OY + (GY * CELL) / 2;
  const BINS = 720, rp = new Float32Array(BINS);
  const bin = (a) => ((Math.round((a / (2 * Math.PI)) * BINS) % BINS) + BINS) % BINS;
  for (let i = 0; i < land.length; i++) {
    if (!land[i]) continue;
    const x = (i % LW) + 0.5 - px, y = ((i / LW) | 0) + 0.5 - py, b = bin(Math.atan2(y, x)), r = Math.hypot(x, y);
    if (r > rp[b]) rp[b] = r;
  }
  const rs = rp.map((_, b) => { let s = 0; for (let k = -6; k <= 6; k++) s += rp[(b + k + BINS) % BINS]; return s / 13; });
  const hw = (GX * CELL) / 2 - 1, hh = (GY * CELL) / 2 - 1;
  for (let y = 0; y < LH; y++) {
    for (let x = 0; x < LW; x++) {
      const i = y * LW + x;
      if (!land[i]) continue;
      const dx = x + 0.5 - px, dy = y + 0.5 - py, a = Math.atan2(dy, dx), r = Math.hypot(dx, dy);
      const g = a + turn(a), c = Math.cos(g), s = Math.sin(g), rg = Math.min(hw / Math.max(1e-6, Math.abs(c)), hh / Math.max(1e-6, Math.abs(s)));
      const t = Math.min(1, r / Math.max(1, rs[bin(a)])) * rg;
      const [bx, by] = warp(gx + c * t, gy + s * t, BORDER, 11);
      const id = cellAt(bx, by);
      lab[i] = id ? index.get(id) : -1;
    }
  }
  // Keep each region's largest piece; stray pieces and unlabelled land take the neighbouring label by growth.
  for (let r = 1; r <= ids.length; r++) {
    const comps = components(lab, r);
    comps.sort((a, b) => b.length - a.length);
    for (const c of comps.slice(1)) for (const i of c) lab[i] = -1;
  }
  grow(lab);
  for (let i = 0; i < lab.length; i++) if (lab[i] < 0) lab[i] = 0; // detached scraps of land become sea
  // v3: round off the grid's stair steps and noise wiggles (smooth borders like a hand-inked atlas)
  for (const r of fit.smooth ?? []) smoothLabels(lab, ids.length, r, fit.allowed);
  return { lab, index };
}

/** Majority filter: every land pixel takes the label most common in a (2r+1)^2 box round it (box blur per label,
 *  argmax); the sea stays put, and a change that would make two regions touch that WAR.md keeps apart (allowed: Set of
 *  "a,b" 1-based index pairs, a < b) is not taken. Then each region keeps its largest piece and gaps are regrown. */
function smoothLabels(lab, n, r, allowed) {
  const N = LW * LH, best = new Float32Array(N), arg = new Int16Array(N), tmp = new Float32Array(N), acc = new Float32Array(N);
  for (let k = 1; k <= n; k++) {
    for (let y = 0; y < LH; y++) {
      let s = 0;
      for (let x = -r; x <= r; x++) s += lab[y * LW + Math.max(0, Math.min(LW - 1, x))] === k ? 1 : 0;
      for (let x = 0; x < LW; x++) {
        tmp[y * LW + x] = s;
        s += (lab[y * LW + Math.min(LW - 1, x + r + 1)] === k ? 1 : 0) - (lab[y * LW + Math.max(0, x - r)] === k ? 1 : 0);
      }
    }
    for (let x = 0; x < LW; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[Math.max(0, Math.min(LH - 1, y)) * LW + x];
      for (let y = 0; y < LH; y++) {
        acc[y * LW + x] = s;
        s += tmp[Math.min(LH - 1, y + r + 1) * LW + x] - tmp[Math.max(0, y - r) * LW + x];
      }
    }
    for (let i = 0; i < N; i++) if (acc[i] > best[i]) { best[i] = acc[i]; arg[i] = k; }
  }
  const ok = (a, b) => a <= 0 || b <= 0 || a === b || !allowed || allowed.has(a < b ? `${a},${b}` : `${b},${a}`);
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < N; i++) {
    const v = arg[i];
    if (lab[i] <= 0 || v <= 0 || v === lab[i]) continue;
    const x = i % LW;
    if ((x > 0 && !ok(v, lab[i - 1])) || (x < LW - 1 && !ok(v, lab[i + 1])) || (i >= LW && !ok(v, lab[i - LW])) || (i + LW < N && !ok(v, lab[i + LW]))) continue;
    lab[i] = v;
  }
  for (let k = 1; k <= n; k++) {
    const comps = components(lab, k);
    comps.sort((a, b) => b.length - a.length);
    for (const c of comps.slice(1)) for (const i of c) lab[i] = -1;
  }
  grow(lab, ok);
  for (let i = 0; i < lab.length; i++) if (lab[i] < 0) lab[i] = 0;
}

function components(lab, r) {
  const seen = new Uint8Array(LW * LH);
  const out = [];
  for (let i = 0; i < lab.length; i++) {
    if (lab[i] !== r || seen[i]) continue;
    const comp = [];
    const st = [i];
    seen[i] = 1;
    while (st.length) {
      const k = st.pop();
      comp.push(k);
      const x = k % LW, y = (k / LW) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= LW || ny >= LH) continue;
        const j = ny * LW + nx;
        if (!seen[j] && lab[j] === r) { seen[j] = 1; st.push(j); }
      }
    }
    out.push(comp);
  }
  return out;
}

function grow(lab, ok = () => true) {
  for (let pass = 0; pass < 200; pass++) {
    const todo = [];
    for (let i = 0; i < lab.length; i++) {
      if (lab[i] !== -1) continue;
      const x = i % LW, y = (i / LW) | 0;
      const votes = new Map();
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= LW || ny >= LH) continue;
        const v = lab[ny * LW + nx];
        if (v > 0) votes.set(v, (votes.get(v) || 0) + 1);
      }
      const nb = [...votes.keys()], pick = [...votes].sort((a, b) => b[1] - a[1] || a[0] - b[0]).find(([v]) => nb.every((w) => ok(v, w)));
      if (pick) todo.push([i, pick[0]]);
    }
    if (!todo.length) return;
    for (const [i, v] of todo) lab[i] = v;
  }
}

// Shared border length (pixel edges) for every pair of labels; 0 = sea.
export function borderStats(lab) {
  const m = new Map();
  const add = (a, b, x, y) => {
    if (a === b) return;
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    let e = m.get(k);
    if (!e) m.set(k, (e = { n: 0, pts: [] }));
    e.n++;
    e.pts.push([x, y]);
  };
  for (let y = 0; y < LH; y++) {
    for (let x = 0; x < LW; x++) {
      const a = lab[y * LW + x];
      if (x + 1 < LW) add(a, lab[y * LW + x + 1], x + 1, y + 0.5);
      if (y + 1 < LH) add(a, lab[(y + 1) * LW + x], x + 0.5, y + 1);
    }
  }
  return m;
}

// Outer outline of one region along pixel corners, then Douglas-Peucker. Returns [[x, y], ...] in logical px.
export function trace(lab, r, tol = 0.9) {
  const out = new Map(); // "x,y" -> [[x2,y2], ...] directed edges, region on the right (clockwise, y down)
  const put = (x1, y1, x2, y2) => {
    const k = `${x1},${y1}`;
    if (!out.has(k)) out.set(k, []);
    out.get(k).push([x2, y2]);
  };
  const at = (x, y) => (x < 0 || y < 0 || x >= LW || y >= LH ? 0 : lab[y * LW + x]);
  for (let y = 0; y < LH; y++) {
    for (let x = 0; x < LW; x++) {
      if (at(x, y) !== r) continue;
      if (at(x, y - 1) !== r) put(x, y, x + 1, y);
      if (at(x + 1, y) !== r) put(x + 1, y, x + 1, y + 1);
      if (at(x, y + 1) !== r) put(x + 1, y + 1, x, y + 1);
      if (at(x - 1, y) !== r) put(x, y + 1, x, y);
    }
  }
  const loops = [];
  while (out.size) {
    const [k0] = out.keys();
    let [x, y] = k0.split(',').map(Number);
    const loop = [[x, y]];
    let prev = null;
    for (;;) {
      const k = `${x},${y}`;
      const list = out.get(k);
      if (!list) break;
      let pick = 0;
      if (list.length > 1 && prev) {
        // at a pinch, turn right (keeps the loop tight round this region's pixels)
        const [dx, dy] = [x - prev[0], y - prev[1]];
        pick = list.findIndex(([nx, ny]) => (nx - x) === -dy && (ny - y) === dx);
        if (pick < 0) pick = 0;
      }
      const [nx, ny] = list.splice(pick, 1)[0];
      if (!list.length) out.delete(k);
      prev = [x, y];
      x = nx; y = ny;
      if (`${x},${y}` === k0 && !out.has(k0)) break;
      loop.push([x, y]);
    }
    loops.push(loop);
  }
  loops.sort((a, b) => b.length - a.length);
  return simplifyClosed(loops[0], tol);
}

function simplifyClosed(pts, tol) {
  // split at the two farthest-apart points, DP each half
  let far = 0, best = 0;
  for (let i = 0; i < pts.length; i++) {
    const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
    if (d > best) { best = d; far = i; }
  }
  const a = dp(pts.slice(0, far + 1), tol);
  const b = dp(pts.slice(far).concat([pts[0]]), tol);
  return a.slice(0, -1).concat(b.slice(0, -1));
}
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const L = Math.hypot(bx - ax, by - ay) || 1;
  let idx = -1, dmax = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= tol) return [pts[0], pts[pts.length - 1]];
  return dp(pts.slice(0, idx + 1), tol).slice(0, -1).concat(dp(pts.slice(idx), tol));
}

// Chamfer distance to the region edge (or sea), per pixel.
export function distanceField(lab) {
  const D = new Float32Array(LW * LH);
  const INF = 1e9;
  for (let i = 0; i < D.length; i++) {
    const x = i % LW, y = (i / LW) | 0;
    const v = lab[i];
    const edge = v <= 0 || x === 0 || y === 0 || x === LW - 1 || y === LH - 1 ||
      lab[i - 1] !== v || lab[i + 1] !== v || lab[i - LW] !== v || lab[i + LW] !== v;
    D[i] = edge ? 0 : INF;
  }
  const s = Math.SQRT2;
  for (let y = 1; y < LH - 1; y++) for (let x = 1; x < LW - 1; x++) {
    const i = y * LW + x;
    D[i] = Math.min(D[i], D[i - 1] + 1, D[i - LW] + 1, D[i - LW - 1] + s, D[i - LW + 1] + s);
  }
  for (let y = LH - 2; y > 0; y--) for (let x = LW - 2; x > 0; x--) {
    const i = y * LW + x;
    D[i] = Math.min(D[i], D[i + 1] + 1, D[i + LW] + 1, D[i + LW + 1] + s, D[i + LW - 1] + s);
  }
  return D;
}
