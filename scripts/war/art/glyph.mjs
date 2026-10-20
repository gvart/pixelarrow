// Glyph renderer shared by the war UI scripts (ui.mjs, ui-craft.mjs): ramps, the outline colour and pictograms drawn
// from shapes on a 32-unit grid, rasterised at any size with a light edge up-left, a dark edge down-right and a 1 px outline.
import { blank, hexToRgb } from '../../art/lib/ops.mjs';
// Glyph ramps (dark, mid, light, highlight), picked to sit in the sheet's bronze / iron / oxblood family.
export const RAMP = {
  bronze: ['#4f3219', '#8a5a2c', '#c08a48', '#e6c27a'],
  iron: ['#25252b', '#47474f', '#6e6e78', '#a2a2aa'],
  wood: ['#3a2416', '#664226', '#8e6236', '#b4884f'],
  stone: ['#3e3c42', '#625e66', '#8a868c', '#b6b2b2'],
  red: ['#3e1012', '#74201e', '#a8352a', '#d0644a'],
  fire: ['#7a2a14', '#c0501c', '#e8962e', '#f6d48a'],
  water: ['#1f3446', '#365a74', '#5a88a2', '#a0c8d6'],
  green: ['#1f3a1c', '#3c6430', '#68904a', '#a4c070'],
  tin: ['#464c56', '#7a828c', '#a8b0b8', '#dce2e6'],
  canvas: ['#5a4630', '#8a7254', '#b49c78', '#d8c4a0'],
  pitch: ['#241b16', '#3a2c23', '#5e4a3a', '#c4ae8c'], // black pitch, a warm gloss
  clay: ['#5a2a16', '#94482a', '#c06a3c', '#e09a64'], // terracotta
};
export const OUTLINE = '#16120e';

// ---------- glyph renderer ----------
// Shapes are drawn on a 32-unit grid and rasterised at the target size (24 or 32): fill by material, then a light
// edge up-left, a dark edge down-right and a 1 px dark outline outside (light from the upper left, ART_STYLE §4).
export function glyph(size, shapes) {
  const s = size / 32;
  const mat = new Array(size * size).fill(null);
  const inside = (sh, x, y) => {
    if (sh.t === 'poly') { let c = false; const p = sh.p; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }
    if (sh.t === 'circle') return (x - sh.x) ** 2 + (y - sh.y) ** 2 <= sh.r ** 2 && (!sh.r0 || (x - sh.x) ** 2 + (y - sh.y) ** 2 >= sh.r0 ** 2);
    if (sh.t === 'line') { const [ax, ay, bx, by] = sh.p, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)); return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 <= (sh.w / 2) ** 2; }
    if (sh.t === 'rect') return x >= sh.x && x < sh.x + sh.w && y >= sh.y && y < sh.y + sh.h;
    return false;
  };
  for (const sh of shapes) for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) if (inside(sh, (px + 0.5) / s, (py + 0.5) / s)) mat[py * size + px] = sh.erase ? null : sh.m;
  const img = blank(size, size);
  const set = (i, hex) => { const [r, g, b] = hexToRgb(hex); img.data.set([r, g, b, 255], i * 4); };
  const at = (x, y) => (x < 0 || y < 0 || x >= size || y >= size ? null : mat[y * size + x]);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const m = at(x, y);
    if (!m) { if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy))) set(y * size + x, OUTLINE); continue; }
    const r = RAMP[m];
    const up = at(x, y - 1) !== m || at(x - 1, y) !== m, dn = at(x, y + 1) !== m || at(x + 1, y) !== m;
    set(y * size + x, up && !dn ? r[2] : dn && !up ? r[0] : r[1]);
    if (up && at(x, y - 1) !== m && at(x - 1, y) !== m) set(y * size + x, r[3]);
  }
  return img;
}
const L = (m, x0, y0, x1, y1, w = 3) => ({ t: 'line', m, p: [x0, y0, x1, y1], w });
const C = (m, x, y, r, r0) => ({ t: 'circle', m, x, y, r, r0 });
const P = (m, ...p) => ({ t: 'poly', m, p });
const R = (m, x, y, w, h) => ({ t: 'rect', m, x, y, w, h });
const E = (sh) => ({ ...sh, erase: true });
const ladder = (m, x0, y0, x1, y1, n = 5, w = 7) => {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), nx = (-dy / l) * (w / 2), ny = (dx / l) * (w / 2);
  const out = [L(m, x0 + nx, y0 + ny, x1 + nx, y1 + ny, 2.2), L(m, x0 - nx, y0 - ny, x1 - nx, y1 - ny, 2.2)];
  for (let k = 1; k <= n; k++) { const t = k / (n + 1); out.push(L(m, x0 + dx * t + nx, y0 + dy * t + ny, x0 + dx * t - nx, y0 + dy * t - ny, 1.6)); }
  return out;
};
const flame = (m, cx, by, h, w) => P(m, [cx - w / 2, by], [cx - w / 2 - 1, by - h * 0.45], [cx - w * 0.15, by - h * 0.7], [cx, by - h], [cx + w * 0.2, by - h * 0.62], [cx + w / 2 + 1, by - h * 0.4], [cx + w / 2, by]);
const dots = (pts, r = 2.3) => pts.map(([x, y]) => C('bronze', x, y, r));
const man = (m, x, y, k = 1) => [C(m, x, y - 5 * k, 3.2 * k), P(m, [x - 6 * k, y + 7 * k], [x - 5 * k, y], [x + 5 * k, y], [x + 6 * k, y + 7 * k])];
const arrowHead = (m, x, y, dir, s = 6) => { // dir: 'r','l','u','d'
  const pts = { r: [[x, y - s], [x + s, y], [x, y + s]], l: [[x, y - s], [x - s, y], [x, y + s]], u: [[x - s, y], [x, y - s], [x + s, y]], d: [[x - s, y], [x, y + s], [x + s, y]] }[dir];
  return P(m, ...pts);
};
const sword = (x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l; const gx = x0 + ux * 7, gy = y0 + uy * 7; return [L('wood', x0, y0, gx, gy, 3), L('bronze', gx - uy * 5, gy + ux * 5, gx + uy * 5, gy - ux * 5, 3), L('iron', gx + ux, gy + uy, x1 - ux * 3, y1 - uy * 3, 4), P('iron', [x1 - ux * 4 - uy * 2, y1 - uy * 4 + ux * 2], [x1, y1], [x1 - ux * 4 + uy * 2, y1 - uy * 4 - ux * 2])]; };
const hammer = (o = 0) => [L('wood', 7 + o, 26 + o, 19, 14, 3.4), P('iron', [13, 9], [19, 3], [29, 13], [23, 19])];
const pick = () => [L('wood', 7, 27, 21, 11, 3.2), P('iron', [8, 8], [14, 5], [20, 6], [26, 10], [29, 16], [24, 13], [19, 11], [14, 11], [9, 13])];
const stairs = (m) => [P(m, [4, 28], [4, 22], [10, 22], [10, 16], [16, 16], [16, 10], [22, 10], [22, 4], [28, 4], [28, 28])];
export { L, C, P, R, E, ladder, flame, dots, man, arrowHead, sword, hammer, pick, stairs };
