/**
 * Where a map object meets the ground on its sprite, for the rings drawn round it (the resource hover ring). The sprite's
 * anchor is its lowest opaque pixel (objects.json), the tip of the front root or the boulder's front edge, a few px below
 * and aside of the trunk: the ring goes to the middle of the spread base instead, the widest row near the foot, centred
 * on the trunk over it.
 */

/** Rows searched above the lowest opaque one for the spread base and for the trunk over it: a share of the sprite's height, at most so many px. */
const BASE = [0.1, 12], TRUNK = [0.15, 32];

/**
 * Offset (sprite px) from the anchor (ax, ay) to the base's centre, from the sprite's RGBA `px` (w x h). Spans are the
 * opaque run through the trunk column (the anchor's at first), so a canopy or a neighbouring root aside does not count.
 */
export function baseOffset(px: Uint8ClampedArray | Uint8Array, w: number, h: number, ax: number, ay: number): { dx: number; dy: number } {
  const op = (x: number, y: number) => px[(y * w + x) * 4 + 3] > 128;
  let bottom = -1;
  for (let y = Math.min(h - 1, ay); y >= 0 && bottom < 0; y--) for (let x = 0; x < w; x++) if (op(x, y)) { bottom = y; break; }
  if (bottom < 0) return { dx: 0, dy: 0 };
  // the opaque run of row y through column c (or the nearest opaque pixel to it)
  const run = (y: number, c: number): [number, number] | null => {
    let x = Math.round(c);
    if (!op(x, y)) {
      let best = -1;
      for (let d = 1; d < w && best < 0; d++) { if (x - d >= 0 && op(x - d, y)) best = x - d; else if (x + d < w && op(x + d, y)) best = x + d; }
      if (best < 0) return null;
      x = best;
    }
    let lo = x, hi = x;
    while (lo > 0 && op(lo - 1, y)) lo--;
    while (hi < w - 1 && op(hi + 1, y)) hi++;
    return [lo, hi];
  };
  const band = ([k, m]: number[]) => Math.max(0, bottom - Math.min(m, Math.round(k * h))), top = band(TRUNK), baseTop = band(BASE);
  let c = ax, wide = -1, yw = bottom, cw = ax;
  const spans: { y: number; lo: number; hi: number }[] = [];
  for (let y = bottom; y >= top; y--) {
    const s = run(y, c);
    if (!s) continue;
    spans.push({ y, lo: s[0], hi: s[1] });
    c = (s[0] + s[1]) / 2;
    if (y >= baseTop && s[1] - s[0] > wide) { wide = s[1] - s[0]; yw = y; cw = c; }
  }
  // the trunk: the narrowest run above the widest one (none for a bush or a stone: the widest row's middle)
  let narrow = Infinity, xt = cw;
  const at = spans.find((s) => s.y === yw);
  for (const s of spans) if (s.y < yw && s.hi - s.lo < narrow) { narrow = s.hi - s.lo; xt = (s.lo + s.hi) / 2; }
  // a trunk leaning out past the base (a branch, a neighbour's root) is not the one standing on it
  if (at && (xt < at.lo || xt > at.hi)) xt = cw;
  return { dx: Math.round(xt - ax), dy: yw - ay };
}
