/**
 * Personal map markers (./pins.ts draws them): up to PIN_MAX points per view (a region's tile points, the world map's
 * px), the oldest dropped beyond that, kept in localStorage per view (wrapped: a blocked store keeps them for this
 * visit only). Never sent anywhere: the alliance's shared marks are the chat's (./chat.ts).
 */
export const PIN_MAX = 5;
const KEY = 'pa.war.pins.';

/** n: its number on the map (1..PIN_MAX, the lowest free one, so a marker keeps it while others come and go). */
export interface Pin { n: number; x: number; y: number }

interface Store { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
const local = (): Store | null => { try { return localStorage; } catch { return null; } };

export class PinStore {
  private pins: Pin[] = [];
  private readonly key: string;

  constructor(scope: string, private readonly store: Store | null = local()) {
    this.key = KEY + scope;
    try {
      const o = JSON.parse(this.store?.getItem(this.key) ?? 'null') as { v?: number; pins?: Pin[] } | null;
      if (o?.v === 1 && Array.isArray(o.pins)) this.pins = o.pins.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y) && p.n >= 1 && p.n <= PIN_MAX).slice(-PIN_MAX);
    } catch { /* unreadable: none */ }
  }

  /** Oldest first. */
  list(): readonly Pin[] {
    return this.pins;
  }

  /** A new marker at (x, y); beyond PIN_MAX the oldest goes. */
  add(x: number, y: number): Pin {
    if (this.pins.length >= PIN_MAX) this.pins.shift();
    let n = 1;
    while (this.pins.some((p) => p.n === n)) n++;
    const p = { n, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    this.pins.push(p);
    this.save();
    return p;
  }

  remove(n: number): void {
    this.pins = this.pins.filter((p) => p.n !== n);
    this.save();
  }

  clear(): void {
    this.pins = [];
    this.save();
  }

  private save(): void {
    try {
      if (this.pins.length) this.store?.setItem(this.key, JSON.stringify({ v: 1, pins: this.pins }));
      else this.store?.removeItem(this.key);
    } catch { /* storage blocked: this visit only */ }
  }
}
