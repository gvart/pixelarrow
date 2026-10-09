/** Small numeric helpers shared by the sim, art and UI (deterministic, no Phaser). */

/** `v` limited to [lo, hi] (lo when below, hi when above; NaN passes through). */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** `v` limited to [0, 1]. */
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
