/** Tiny seeded RNG for sound variation (mulberry32). Separate from the sim RNG so audio never touches determinism. */
export class AudioRng {
  private s: number;
  constructor(seed = 0x9e3779b9) {
    this.s = seed >>> 0;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  /** v scaled by a random factor in [1 - pct, 1 + pct]. */
  jit(v: number, pct: number): number {
    return v * (1 + (this.next() * 2 - 1) * pct);
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  pick<T>(a: readonly T[]): T {
    return a[this.int(a.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}
