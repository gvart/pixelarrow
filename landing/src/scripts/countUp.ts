// Count-up for the live counters (V6-015: "the stats count up when they come into view"). The curve
// is an ease-out (quartic): fast at first, settling on the real value, with no overshoot, because a
// counter that passes its value and comes back would show a number that was never measured. The last
// frame always writes the exact value. Under reduced motion the caller writes the value directly.
// Pure (no DOM), so the landing's unit tests run it; stats.ts drives it on animation frames.

export const COUNT_MS = 1100;

/** Ease-out quartic on t in [0, 1]. */
export const easeOut = (t: number): number => 1 - (1 - Math.min(1, Math.max(0, t))) ** 4;

/** The whole number shown at time t of a count-up to `to`. */
export const valueAt = (to: number, t: number): number => (t >= 1 ? to : Math.floor(to * easeOut(t)));
