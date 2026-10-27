/**
 * Personal map markers (./pins.ts draws them): up to PIN_MAX points per view (a region's tile points, the world map's
 * px), the oldest dropped beyond that. Temporary: each one lasts PIN_MS, fading over its last PIN_FADE_MS, and is not
 * kept anywhere. Never sent anywhere: the alliance's shared marks are the chat's (./chat.ts).
 */
export const PIN_MAX = 5;
export const PIN_MS = 8_000;
export const PIN_FADE_MS = 1_000;

/** n: its number on the map (1..PIN_MAX, the lowest free one, so a marker keeps it while others come and go); t: placed at. */
export interface Pin { n: number; x: number; y: number; t: number }

/** A marker's opacity at `now`: 1, then down to 0 over its last PIN_FADE_MS. */
export const pinAlpha = (p: Pin, now: number) => Math.max(0, Math.min(1, (p.t + PIN_MS - now) / PIN_FADE_MS));

export class PinStore {
  private pins: Pin[] = [];

  constructor(private readonly now: () => number = Date.now) {}

  /** The live ones, oldest first (the expired go). */
  list(): readonly Pin[] {
    const t = this.now();
    if (this.pins.some((p) => p.t + PIN_MS <= t)) this.pins = this.pins.filter((p) => p.t + PIN_MS > t);
    return this.pins;
  }

  /** A new marker at (x, y); beyond PIN_MAX the oldest goes. */
  add(x: number, y: number): Pin {
    const pins = this.list() as Pin[];
    if (pins.length >= PIN_MAX) pins.shift();
    let n = 1;
    while (pins.some((p) => p.n === n)) n++;
    const p = { n, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, t: this.now() };
    pins.push(p);
    return p;
  }

  remove(n: number): void {
    this.pins = this.pins.filter((p) => p.n !== n);
  }

  clear(): void {
    this.pins = [];
  }
}
