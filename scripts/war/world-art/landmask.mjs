// Land mask of the painted base (v2): the continent is the one big textured, saturated mass; the Abyss round it is
// smooth low-saturation mist. Returns Uint8Array(LW * LH), 1 = land, sampled from the painting stretched to LW x LH.
import { LW, LH } from './layout.mjs';

export function landMask(img) {
  const N = LW * LH;
  const lum = new Float32Array(N), sat = new Float32Array(N);
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const sx = Math.min(img.w - 1, Math.floor((x * img.w) / LW)), sy = Math.min(img.h - 1, Math.floor((y * img.h) / LH));
    const s = (sy * img.w + sx) * 4, r = img.data[s], g = img.data[s + 1], b = img.data[s + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    lum[y * LW + x] = (r + g + b) / 3;
    sat[y * LW + x] = mx ? (mx - mn) / mx : 0;
  }
  // local contrast (3 px box std-dev of luminance)
  const R = 3, tex = new Float32Array(N);
  for (let y = R; y < LH - R; y++) for (let x = R; x < LW - R; x++) {
    let s = 0, s2 = 0, n = 0;
    for (let dy = -R; dy <= R; dy += 1) for (let dx = -R; dx <= R; dx += 1) { const v = lum[(y + dy) * LW + x + dx]; s += v; s2 += v * v; n++; }
    tex[y * LW + x] = Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2));
  }
  // the drake's wing brushes the south-east shore in this painting: there, near-black is a beast, not land
  const dark = (i) => i % LW > LW * 0.68 && i / LW > LH * 0.78;
  let land = new Uint8Array(N);
  for (let i = 0; i < N; i++) land[i] = (sat[i] > 0.2 || tex[i] > 9 || (lum[i] > 200 && tex[i] > 4)) && !(dark(i) && lum[i] < 50) ? 1 : 0;
  land = smooth(land, 4, 0.5);
  // cut the beasts off where a wing or a coil brushes the shore: open (erode, keep the biggest mass, grow back)
  const core = largest(smooth(land, 4, 0.97));
  const grown = smooth(core, 6, 0.03);
  for (let i = 0; i < N; i++) land[i] &= grown[i];
  land = largest(land);
  land = fillHoles(land);
  land = smooth(land, 3, 0.5);
  return { land, lum, sat, tex };
}


function smooth(m, r, th) {
  const N = LW * LH, a = new Float32Array(N), out = new Uint8Array(N);
  for (let i = 0; i < N; i++) a[i] = m[i];
  const tmp = new Float32Array(N);
  for (let y = 0; y < LH; y++) { let s = 0; for (let x = -r; x <= r; x++) s += a[y * LW + Math.max(0, Math.min(LW - 1, x))];
    for (let x = 0; x < LW; x++) { tmp[y * LW + x] = s / (2 * r + 1); s += a[y * LW + Math.min(LW - 1, x + r + 1)] - a[y * LW + Math.max(0, x - r)]; } }
  for (let x = 0; x < LW; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.max(0, Math.min(LH - 1, y)) * LW + x];
    for (let y = 0; y < LH; y++) { out[y * LW + x] = s / (2 * r + 1) > th ? 1 : 0; s += tmp[Math.min(LH - 1, y + r + 1) * LW + x] - tmp[Math.max(0, y - r) * LW + x]; } }
  return out;
}
function comps(m, val) {
  const N = LW * LH, id = new Int32Array(N).fill(-1), sizes = [];
  for (let i = 0; i < N; i++) {
    if (m[i] !== val || id[i] >= 0) continue;
    const k = sizes.length, st = [i];
    id[i] = k;
    let n = 0;
    while (st.length) {
      const j = st.pop(); n++;
      const x = j % LW, y = (j / LW) | 0;
      for (const q of [x > 0 ? j - 1 : -1, x < LW - 1 ? j + 1 : -1, y > 0 ? j - LW : -1, y < LH - 1 ? j + LW : -1]) if (q >= 0 && id[q] < 0 && m[q] === val) { id[q] = k; st.push(q); }
    }
    sizes.push(n);
  }
  return { id, sizes };
}
function largest(m) {
  const { id, sizes } = comps(m, 1), k = sizes.indexOf(Math.max(...sizes)), out = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) out[i] = id[i] === k ? 1 : 0;
  return out;
}
function fillHoles(m) {
  const { id } = comps(m, 0), out = m.slice(), outer = id[0];
  for (let i = 0; i < m.length; i++) if (!m[i] && id[i] !== outer) out[i] = 1;
  return out;
}
