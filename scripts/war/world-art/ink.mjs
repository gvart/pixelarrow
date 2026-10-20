// Region borders as inked lines (v2, W-43): the shared edges of the region raster chained between junctions,
// simplified and smoothed, then stroked anti-aliased (dark ink core, faint gold edge) into a transparent layer.
import { LW, LH } from './layout.mjs';

/** Border chains between land regions, in logical px: [[x, y], ...] per chain. */
export function chains(lab) {
  const key = (x, y) => y * (LW + 1) + x;
  const adj = new Map(); // corner -> list of neighbour corners (each shared edge once)
  const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const v = lab[y * LW + x];
    if (v <= 0) continue;
    if (x + 1 < LW) { const w = lab[y * LW + x + 1]; if (w > 0 && w !== v) link(key(x + 1, y), key(x + 1, y + 1)); }
    if (y + 1 < LH) { const w = lab[(y + 1) * LW + x]; if (w > 0 && w !== v) link(key(x, y + 1), key(x + 1, y + 1)); }
  }
  const used = new Set(), ek = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  const pt = (k) => [k % (LW + 1), Math.floor(k / (LW + 1))];
  const out = [];
  const walk = (a, b) => {
    const line = [a];
    let prev = a, cur = b;
    used.add(ek(a, b));
    for (;;) {
      line.push(cur);
      const nb = adj.get(cur);
      if (nb.length !== 2) break;
      const next = nb[0] === prev ? nb[1] : nb[0];
      if (used.has(ek(cur, next))) break;
      used.add(ek(cur, next));
      prev = cur; cur = next;
    }
    return line.map(pt);
  };
  for (const [a, nb] of adj) if (nb.length !== 2) for (const b of nb) if (!used.has(ek(a, b))) out.push(walk(a, b));
  for (const [a, nb] of adj) for (const b of nb) if (!used.has(ek(a, b))) out.push(walk(a, b)); // closed loops
  return out.map((c) => chaikin(dp(c, 0.9), 3));
}

export function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const L = Math.hypot(bx - ax, by - ay);
  let idx = -1, dmax = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = L > 0.01 ? Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L : Math.hypot(pts[i][0] - ax, pts[i][1] - ay);
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= tol) return [pts[0], pts[pts.length - 1]];
  return dp(pts.slice(0, idx + 1), tol).slice(0, -1).concat(dp(pts.slice(idx), tol));
}

/** Chaikin corner cutting; open lines keep their ends, closed ones (closed = true) wrap. */
export function chaikin(pts, n, closed = false) {
  let p = pts;
  for (let k = 0; k < n; k++) {
    const q = closed ? [] : [p[0]];
    const m = closed ? p.length : p.length - 1;
    for (let i = 0; i < m; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!closed) q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

/** Stroke chains (logical px) into an RGBA layer of w x h, s = output px per logical px. */
export function inkLayer(lines, w, h, s, { core = 2.2, halo = 5.5, ink = [26, 16, 12], gold = [214, 176, 112] } = {}) {
  const a = new Float32Array(w * h), g = new Float32Array(w * h);
  const cw = (core * s) / 2, hw = (halo * s) / 2;
  for (const line of lines) for (let k = 0; k < line.length - 1; k++) {
    const x0 = line[k][0] * s, y0 = line[k][1] * s, x1 = line[k + 1][0] * s, y1 = line[k + 1][1] * s;
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1e-6;
    const bx0 = Math.max(0, Math.floor(Math.min(x0, x1) - hw - 1)), bx1 = Math.min(w - 1, Math.ceil(Math.max(x0, x1) + hw + 1));
    const by0 = Math.max(0, Math.floor(Math.min(y0, y1) - hw - 1)), by1 = Math.min(h - 1, Math.ceil(Math.max(y0, y1) + hw + 1));
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L2));
      const d = Math.hypot(px - x0 - t * dx, py - y0 - t * dy), i = y * w + x;
      const ca = Math.max(0, Math.min(1, cw + 0.5 - d));
      const ga = Math.max(0, Math.min(1, (hw + 0.5 - d) / (hw - cw + 0.5))) * 0.55;
      if (ca > a[i]) a[i] = ca;
      if (ga > g[i]) g[i] = ga;
    }
  }
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    // the gold edge under the ink: composite ink (alpha a) over gold (alpha g)
    const A = a[i] + g[i] * (1 - a[i]);
    if (A <= 0) continue;
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round((ink[c] * a[i] + gold[c] * g[i] * (1 - a[i])) / A);
    data[i * 4 + 3] = Math.round(A * 255);
  }
  return { w, h, data };
}
