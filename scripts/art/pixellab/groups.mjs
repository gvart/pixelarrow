// Colour pipeline of a sheet (I3a, docs/v5/art/STYLE_LOCK.md › Colour): every frame is
//  1. remapped ramp-aware onto PA-WORLD-DARK (remap.mjs), limited to the class's ramps, so no invented colour survives;
//  2. split into parts: the crimson into cloak / crest / emblem, the browns into metal / trim (the lightest step) / wood (the spear
//     shaft) / weaponMetal (the spearhead), the rest by ramp (skin, outline);
//  3. written with one exclusive set of hex values per part (a part that shares a ramp step with another gets the
//     step nudged by 1 in one channel, invisible), so a runtime recolour of one group never bleeds into another.
// The part of a crimson blob is carried from frame to frame of a clip (nearest labelled pixel of the previous frame),
// so a crest that falls with the man stays a crest.
import { loadRamps, oklab } from './remap.mjs';

/** Screen direction a levelled spearhead leads in, per facing (model3d camera). */
export const LEVEL = { 'south-east': [0.894, 0.447], 'north-east': [0.894, -0.447], 'south-west': [-0.894, 0.447], 'north-west': [-0.894, -0.447] };

/** Ramps a hoplite may use (palette-dark.json names). teamRed and the cold ramps are kept out. */
export const HOPLITE_RAMPS = ['outline', 'crimson', 'umber', 'darkBronze', 'skin'];

/**
 * A class's own ramp -> part map (spec `parts`), or null when it says nothing of this step. Keys: "<ramp>:<step>",
 * "<ramp>:<from>-<to>" (inclusive) or "<ramp>"; a per-step key wins over a range, a range over the whole ramp.
 */
export function overridePart(ramp, step, parts) {
  if (!parts) return null;
  if (parts[`${ramp}:${step}`]) return parts[`${ramp}:${step}`];
  for (const [k, p] of Object.entries(parts)) {
    const m = /^(\w+):(\d+)-(\d+)$/.exec(k);
    if (m && m[1] === ramp && step >= +m[2] && step <= +m[3]) return p;
  }
  return parts[ramp] ?? null;
}

/**
 * The part each ramp step goes to before the splits. The lightest brown step becomes trim (the
 * highlights on helmet, cuirass and shield rims: what the elite gilds); the darkest step stays shadow.
 * `parts` (the class spec's ramp -> part map) overrides this default per ramp or per step.
 */
export function partOfStep(ramp, step, n, parts = null) {
  const o = overridePart(ramp, step, parts);
  if (o) return o;
  if (ramp === 'outline') return 'outline';
  if (ramp === 'crimson') return 'cloak';
  if (ramp === 'skin') return 'skin';
  if (ramp === 'umber' || ramp === 'darkBronze') {
    if (step === 0) return 'shadow';
    if (step === n - 1 && n > 3) return 'trim';
    return 'metal';
  }
  return 'shadow';
}

/** One nudge per part: [channel, delta] applied to every step it shares with an earlier part. */
const NUDGE = { crest: [1, 1], emblem: [2, 1], wood: [2, 1], weaponMetal: [1, 1], shadow: [0, 1] };
export const PART_ORDER = ['outline', 'skin', 'cloak', 'crest', 'emblem', 'metal', 'trim', 'shadow', 'wood', 'weaponMetal'];

/** Ramp lookup: every colour -> { ramp, step, rgb } (cached), limited to `allowed` ramps. */
export function rampMapper(allowed = HOPLITE_RAMPS) {
  const ramps = loadRamps().filter((r) => allowed.includes(r.name));
  const cache = new Map();
  return (r, g, b) => {
    const k = (r << 16) | (g << 8) | b;
    let hit = cache.get(k);
    if (hit) return hit;
    const [L, A, B] = oklab([r, g, b]);
    let best = null, bd = Infinity;
    for (const rp of ramps) for (const c of rp.cols) {
      const d = (A - c.lab[1]) ** 2 + (B - c.lab[2]) ** 2 + 0.08 * (L - c.lab[0]) ** 2;
      if (d < bd) (bd = d), (best = rp);
    }
    let step = 0, sd = Infinity;
    best.cols.forEach((c, i) => {
      const d = (L - c.lab[0]) ** 2;
      if (d < sd) (sd = d), (step = i);
    });
    hit = { ramp: best.name, step, n: best.cols.length, rgb: best.cols[step].rgb };
    cache.set(k, hit);
    return hit;
  };
}

// ---------------------------------------------------------------- geometry helpers

const DIRS4 = [[1, 0], [0, 1], [1, 1], [1, -1]];

/** Opaque width through (x, y) along the narrowest of 4 directions (a shaft is 3-4 with its outline). */
function minWidth(op, w, h, x, y) {
  let best = 99;
  for (const [dx, dy] of DIRS4) {
    // across the direction perpendicular to (dx, dy)
    const px = -dy, py = dx;
    let n = 1;
    for (let s = 1; s < 8; s++) { const X = x + px * s, Y = y + py * s; if (X < 0 || Y < 0 || X >= w || Y >= h || !op[Y * w + X]) break; n++; }
    for (let s = 1; s < 8; s++) { const X = x - px * s, Y = y - py * s; if (X < 0 || Y < 0 || X >= w || Y >= h || !op[Y * w + X]) break; n++; }
    best = Math.min(best, n);
  }
  return best;
}

/**
 * The spear: the longest straight run of thin pixels (Hough over angle and offset). Returns the segment ends,
 * which one is the head (by `headDir`, the screen direction it must lead in), the support and the head/butt widths,
 * or null when no line of at least `minLen` px is found.
 */
export function findSpear(img, { candidate, headDir, minLen = 18 }) {
  const { w, h, data } = img;
  const op = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) op[i] = data[i * 4 + 3] > 0 ? 1 : 0;
  const pts = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!op[i] || !candidate(x, y)) continue;
    if (minWidth(op, w, h, x, y) <= 4) pts.push([x, y]);
  }
  if (pts.length < minLen) return null;
  let best = null;
  for (let a = 0; a < 180; a += 1.5) {
    const t = (a * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    const bins = new Map();
    for (const [x, y] of pts) {
      const r = Math.round(x * c + y * s);
      const k = r;
      if (!bins.has(k)) bins.set(k, []);
      bins.get(k).push(-x * s + y * c);
    }
    for (const [r, along] of bins) {
      if (along.length < minLen * 0.6) continue;
      along.sort((p, q) => p - q);
      // longest run with gaps under 12 px (the shaft passes behind the hand and the body)
      let i0 = 0, bi0 = 0, bi1 = 0;
      for (let i = 1; i <= along.length; i++) {
        if (i === along.length || along[i] - along[i - 1] > 12) {
          if (along[i - 1] - along[i0] > along[bi1] - along[bi0]) { bi0 = i0; bi1 = i - 1; }
          i0 = i;
        }
      }
      const L = along[bi1] - along[bi0];
      const support = bi1 - bi0 + 1;
      if (L >= minLen && support >= L * 0.55 && (!best || support > best.support)) best = { t, r, u0: along[bi0], u1: along[bi1], support, L };
    }
  }
  if (!best) return null;
  const c = Math.cos(best.t), s = Math.sin(best.t);
  const P = (u) => [best.r * c - u * s, best.r * s + u * c];
  let A = P(best.u0), B = P(best.u1);
  // the head end: the one further along the direction the head must lead in
  const dA = A[0] * headDir[0] + A[1] * headDir[1], dB = B[0] * headDir[0] + B[1] * headDir[1];
  if (dA > dB) [A, B] = [B, A];
  const width = (E, F) => {
    // opaque width across the line averaged over the last 6 px towards end E
    const ux = (E[0] - F[0]) / best.L, uy = (E[1] - F[1]) / best.L, px = -uy, py = ux;
    let sum = 0;
    for (let k = 0; k < 6; k++) {
      const cx = E[0] - ux * k, cy = E[1] - uy * k;
      let n = 0;
      for (let q = -4; q <= 4; q++) { const X = Math.round(cx + px * q), Y = Math.round(cy + py * q); if (X >= 0 && Y >= 0 && X < w && Y < h && op[Y * w + X]) n++; }
      sum += n;
    }
    return sum / 6;
  };
  return { butt: A, head: B, support: best.support, len: best.L, headW: width(B, A), buttW: width(A, B) };
}

export function distToSeg(x, y, A, B) {
  const vx = B[0] - A[0], vy = B[1] - A[1];
  const t = Math.max(0, Math.min(1, ((x - A[0]) * vx + (y - A[1]) * vy) / (vx * vx + vy * vy || 1)));
  return { d: Math.hypot(x - A[0] - vx * t, y - A[1] - vy * t), t };
}

/** Connected components (4-neighbour) of the pixels where mask[i]; returns { comp: Int32Array, n }. */
function components(mask, w, h) {
  const comp = new Int32Array(w * h).fill(-1);
  let n = 0;
  const st = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || comp[i] >= 0) continue;
    comp[i] = n;
    st.push(i);
    while (st.length) {
      const j = st.pop(), x = j % w, y = (j / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const k = Y * w + X;
        if (mask[k] && comp[k] < 0) { comp[k] = n; st.push(k); }
      }
    }
    n++;
  }
  return { comp, n };
}

// ---------------------------------------------------------------- invented colours

/**
 * A colour no dark-epic unit has: a saturated spark or glow (OKLab chroma over 0.14), a near-white flash
 * (lightness over 0.86) or a light neutral grey (the ghost trails PixelLab leaves on fast spears). Such pixels are
 * cut, not remapped: remapping would keep the invented shape in a legal colour.
 */
export function foreign(rgb) {
  const [L, a, b] = oklab(rgb);
  const C = Math.hypot(a, b);
  return C > 0.14 || L > 0.86 || (C < 0.025 && L > 0.55);
}

/** Clears detached specks (8-connected bits under 5 px) and loose crimson splats (under 60 px); returns how many pixels. */
function dropSpecks(parts, w, h, isRed) {
  const mask = parts.map((p) => (p ? 1 : 0));
  const comp = new Int32Array(w * h).fill(-1);
  const sizes = [];
  const reds = [];
  const st = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || comp[i] >= 0) continue;
    const id = sizes.length;
    let n = 0, red = 0;
    comp[i] = id;
    st.push(i);
    while (st.length) {
      const j = st.pop(), x = j % w, y = (j / w) | 0;
      n++;
      if (isRed(j)) red++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const k = Y * w + X;
        if (mask[k] && comp[k] < 0) { comp[k] = id; st.push(k); }
      }
    }
    sizes.push(n);
    reds.push(red);
  }
  // specks, and loose crimson splats (the blood PixelLab adds to hits and deaths, prompt or not)
  const big = Math.max(...sizes, 0);
  const drop = sizes.map((n, k) => n < 5 || (n < big && n < 60 && reds[k] >= 0.6 * n));
  let cut = 0;
  for (let i = 0; i < w * h; i++) if (comp[i] >= 0 && drop[comp[i]]) { parts[i] = null; cut++; }
  return cut;
}

// ---------------------------------------------------------------- the per-frame split

/**
 * Parts of one frame: Array(w*h) of part names (null = transparent). `prev` is the previous frame's parts of the
 * same clip (or null). `headDir` the screen direction the spearhead must lead in ([0,-1] upright). `crest` / `emblem`
 * false (spec flags): a class with no crest / no shield emblem keeps that crimson in the cloak.
 */
export function splitFrame(img, map, { prev = null, headDir = [0, -1], spear = true, parts: partMap = null, crest = true, emblem = true } = {}) {
  const { w, h, data } = img;
  const parts = new Array(w * h).fill(null);
  const info = new Array(w * h).fill(null);
  let dropped = 0;
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] < 128) continue;
    const rgb = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
    if (foreign(rgb)) { dropped++; continue; }
    const m = map(rgb[0], rgb[1], rgb[2]);
    info[i] = m;
    parts[i] = partOfStep(m.ramp, m.step, m.n, partMap);
  }
  // only crimson cloak pixels are splats, crest or emblem: a cloak given by `parts` in another ramp is just cloak
  const isRed = (i) => parts[i] === 'cloak' && info[i].ramp === 'crimson';
  dropped += dropSpecks(parts, w, h, isRed);
  // the spear shaft: thin brown / iron / skin-ramp pixels on the longest straight line
  let sp = null;
  if (spear) {
    const cand = (x, y) => { const m = info[y * w + x]; return m && (m.ramp === 'umber' || m.ramp === 'darkBronze' || m.ramp === 'metal' || m.ramp === 'skin' || m.ramp === 'outline'); };
    sp = findSpear({ w, h, data }, { candidate: cand, headDir });
    if (sp) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, m = info[i];
        if (!m || m.ramp === 'outline' || m.ramp === 'crimson') continue;
        const { d, t } = distToSeg(x, y, sp.butt, sp.head);
        if (d > 1.6) continue;
        // skin-ramp pixels on the line are the fist, except at the butt, which is light bare wood
        if (m.ramp === 'skin' && t * sp.len > 4) continue;
        // the end found is the spearhead only when it is wider than the other (a leaf, not a shaft cut by the body)
        const nearHead = sp.headW > sp.buttW + 1 && t * sp.len > sp.len - 7;
        if (nearHead && d <= 2.6) parts[i] = 'weaponMetal';
        else parts[i] = 'wood';
      }
      // the head is wider than the shaft: its leaf pixels a little off the line
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, m = info[i];
        if (!m || (m.ramp !== 'umber' && m.ramp !== 'darkBronze' && m.ramp !== 'metal')) continue;
        const { d, t } = distToSeg(x, y, sp.butt, sp.head);
        if (sp.headW > sp.buttW + 1 && d <= 2.6 && t * sp.len > sp.len - 7) parts[i] = 'weaponMetal';
      }
    }
  }
  // the crimson: components; the emblem is enclosed by brown, the crest is up at the helmet, the rest is cloak
  const red = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) red[i] = parts[i] && isRed(i) ? 1 : 0;
  const { comp, n } = components(red, w, h);
  let topRed = h;
  for (let i = 0; i < w * h; i++) if (red[i]) { topRed = Math.min(topRed, (i / w) | 0); }
  const stats = Array.from({ length: n }, () => ({ y0: h, size: 0, brown: 0, edge: 0, outline: 0, clear: 0, prevVotes: {} }));
  for (let i = 0; i < w * h; i++) {
    const c = comp[i];
    if (c < 0) continue;
    const s = stats[c], x = i % w, y = (i / w) | 0;
    s.y0 = Math.min(s.y0, y);
    s.size++;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= w || Y >= h) { s.clear++; continue; }
      const k = Y * w + X;
      if (comp[k] === c) continue;
      const p = parts[k];
      if (!p) s.clear++;
      else if (p === 'outline') s.outline++;
      else s.brown++;
    }
    if (prev) {
      // the label of the nearest crimson part of the previous frame (within 10 px)
      let lab = null;
      for (let r = 0; r <= 10 && !lab; r++) {
        for (let dy = -r; dy <= r && !lab; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const X = x + dx, Y = y + dy;
          if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
          const q = prev[Y * w + X];
          if (q === 'cloak' || q === 'crest' || q === 'emblem') { lab = q; break; }
        }
      }
      if (lab) s.prevVotes[lab] = (s.prevVotes[lab] ?? 0) + 1;
    }
  }
  const labelOf = stats.map((s) => {
    if (process.env.GROUPS_DEBUG) console.log('crimson comp', s.y0, s.size, s.brown, s.outline, s.clear);
    // painted on the shield: bordered by its bronze face, hardly by outline, never by the background
    if (emblem && !s.clear && s.brown >= 0.6 * (s.brown + s.outline) && s.size >= 6 && s.size < 120) return 'emblem';
    // crest or cloak: what it was in the previous frame, else by height
    delete s.prevVotes.emblem;
    if (!crest) return 'cloak';
    const votes = Object.entries(s.prevVotes).sort((a, b) => b[1] - a[1]);
    if (votes.length) return votes[0][0];
    if (s.y0 <= topRed + 3) return 'crest';
    return 'cloak';
  });
  for (let i = 0; i < w * h; i++) if (comp[i] >= 0) parts[i] = labelOf[comp[i]];
  return { parts, info, spear: sp, dropped };
}

// ---------------------------------------------------------------- exclusive colours

/**
 * The exclusive palette: for every part and every ramp step it uses, one hex. Steps shared with an earlier part
 * are nudged by NUDGE (repeated until unique). Returns { hexOf(part, rgb) -> rgb, groups: { part: [hex dark->light] } }.
 */
export function exclusivePalette(usage) {
  // usage: Map part -> Map 'r,g,b' -> { rgb, L }
  const taken = new Map(); // hex -> part
  const out = new Map(); // part|key -> rgb
  const groups = {};
  const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  for (const part of PART_ORDER) {
    const u = usage.get(part);
    if (!u) continue;
    const cols = [...u.values()].sort((a, b) => a.L - b.L);
    groups[part] = [];
    for (const c of cols) {
      let rgb = [...c.rgb];
      const [ch, dl] = NUDGE[part] ?? [2, 1];
      while (taken.has(hex(rgb)) && taken.get(hex(rgb)) !== part) rgb[ch] = Math.max(0, Math.min(255, rgb[ch] + dl));
      taken.set(hex(rgb), part);
      out.set(`${part}|${c.rgb.join(',')}`, rgb);
      groups[part].push(hex(rgb));
    }
  }
  return { rgbOf: (part, rgb) => out.get(`${part}|${rgb.join(',')}`), groups };
}

/** Lightness for ordering. */
export const lum = ([r, g, b]) => oklab([r, g, b])[0];
