/**
 * The seasonal hex shard world (pure, deterministic; used by the Worker).
 *
 * A shard is a hex disc of SHARD_RADIUS around (0, 0) in axial coordinates
 * (q, r). Everything static about a hex (type, battlefield, fort, capital) is
 * a pure function of the shard seed and its coordinates, so nothing static is
 * stored: D1 only keeps the hexes whose state changed (owner, garrison, NPC
 * losses). The seed never leaves the server; clients only receive the hexes
 * their fog of war reveals.
 */
import { fbm, hash3 } from '../world/noise';
import { siteName, type BattleSite, type SiteBase } from '../world/battlefield';

/** ~3.5k hexes per shard (about 500 players). */
export const SHARD_RADIUS = 34;

export type HexType = 'plains' | 'farmland' | 'forest' | 'hills' | 'mine' | 'town' | 'ruins' | 'water' | 'mountain';
export const HEX_TYPES: HexType[] = ['plains', 'farmland', 'forest', 'hills', 'mine', 'town', 'ruins', 'water', 'mountain'];

/** Who holds a hex: a player, the neutral NPC garrison, or (later) a mythical beast. */
export type Occupant = 'npc' | 'player' | 'beast';

export interface Axial {
  q: number;
  r: number;
}

export interface HexInfo extends Axial {
  id: string;
  type: HexType;
  passable: boolean;
  /** Fortified objective: strong garrison, big bonuses. */
  fort: boolean;
  /** One of the seven capitals: the clan endgame. */
  capital: boolean;
  /** NPC garrison strength / income class, 1..5. */
  tier: 1 | 2 | 3 | 4 | 5;
  /** Battlefield for fights on this hex (src/world/battlefield). */
  site: BattleSite;
  /** Next to water. */
  coast: boolean;
}

export const HEX_DIRS: Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexId(q: number, r: number): string {
  return `${q}_${r}`;
}

export function parseHexId(id: string): Axial | null {
  const m = /^(-?\d{1,3})_(-?\d{1,3})$/.exec(id);
  return m ? { q: Number(m[1]), r: Number(m[2]) } : null;
}

export function hexDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function inShard(h: Axial, radius = SHARD_RADIUS): boolean {
  return hexDistance(h, { q: 0, r: 0 }) <= radius;
}

export function neighbours(h: Axial, radius = SHARD_RADIUS): Axial[] {
  const out: Axial[] = [];
  for (const d of HEX_DIRS) {
    const n = { q: h.q + d.q, r: h.r + d.r };
    if (inShard(n, radius)) out.push(n);
  }
  return out;
}

/** Every hex within `range` of `c` (inside the shard). */
export function hexesWithin(c: Axial, range: number, radius = SHARD_RADIUS): Axial[] {
  const out: Axial[] = [];
  for (let dq = -range; dq <= range; dq++) {
    for (let dr = Math.max(-range, -dq - range); dr <= Math.min(range, -dq + range); dr++) {
      const h = { q: c.q + dq, r: c.r + dr };
      if (inShard(h, radius)) out.push(h);
    }
  }
  return out;
}

/** Pointy-top layout: hex centre in units of the hex size. */
export function hexToPixel(h: Axial, size: number): { x: number; y: number } {
  return { x: size * Math.sqrt(3) * (h.q + h.r / 2), y: size * 1.5 * h.r };
}

export function pixelToHex(x: number, y: number, size: number): Axial {
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size;
  const r = ((2 / 3) * y) / size;
  return hexRound(q, r);
}

export function hexRound(fq: number, fr: number): Axial {
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q: q + 0, r: r + 0 };
}

/** The seven capitals: the centre and six around it. */
export function capitals(radius = SHARD_RADIUS): Axial[] {
  const d = Math.round(radius * 0.55);
  return [{ q: 0, r: 0 }, ...HEX_DIRS.map((v) => ({ q: v.q * d, r: v.r * d }))];
}

function elevation(seed: number, q: number, r: number, radius: number): number {
  const x = q + r / 2;
  const y = r * 0.866;
  const e = fbm(x + 1000, y + 1000, 14, seed, 4);
  // Sea toward the rim, highlands inland.
  const d = hexDistance({ q, r }, { q: 0, r: 0 }) / radius;
  return e * 0.85 + 0.32 - Math.max(0, d - 0.72) * 1.6;
}

function moisture(seed: number, q: number, r: number): number {
  return fbm(q + r / 2 + 500, r * 0.866 + 500, 9, seed + 77, 3);
}

function rawType(seed: number, q: number, r: number, radius: number): HexType {
  const e = elevation(seed, q, r, radius);
  if (e < 0.4) return 'water';
  if (e > 0.97) return 'mountain';
  const m = moisture(seed, q, r);
  const h = hash3(q, r, seed + 3);
  if (h > 0.988) return 'ruins';
  if (e > 0.8) return h < 0.3 ? 'mine' : 'hills';
  if (m > 0.6) return 'forest';
  if (h < 0.035) return 'town';
  if (m > 0.44) return h < 0.6 ? 'farmland' : 'plains';
  return h < 0.12 ? 'mine' : 'plains';
}

/** Static description of a hex (pure function of seed and coordinates). */
export function hexInfo(seed: number, q: number, r: number, radius = SHARD_RADIUS): HexInfo {
  const id = hexId(q, r);
  const isCapital = capitals(radius).some((c) => c.q === q && c.r === r);
  const nearCapital = capitals(radius).some((c) => hexDistance(c, { q, r }) <= 3);
  let type = rawType(seed, q, r, radius);
  if (isCapital) type = 'town';
  else if (nearCapital && (type === 'water' || type === 'mountain')) type = 'plains';
  const passable = type !== 'water' && type !== 'mountain';
  const fort = !isCapital && passable && !nearCapital && type !== 'town' && hash3(q, r, seed + 11) < 0.014;
  const coast = HEX_DIRS.some((d) => inShard({ q: q + d.q, r: r + d.r }, radius) && rawType(seed, q + d.q, r + d.r, radius) === 'water') && !isCapital;
  const tier: HexInfo['tier'] = isCapital ? 5 : fort ? 4 : type === 'town' || type === 'ruins' ? 3 : type === 'plains' ? 1 : 2;
  const base: SiteBase = type === 'forest' ? 'forest' : type === 'hills' || type === 'mine' ? 'hills' : type === 'ruins' ? 'scrub' : coast && hash3(q, r, seed + 5) < 0.4 ? 'beach' : type === 'farmland' ? 'plain' : hash3(q, r, seed + 6) < 0.3 ? 'scrub' : 'plain';
  const site: BattleSite = {
    base,
    river: type !== 'hills' && type !== 'mine' && hash3(q, r, seed + 7) < 0.14,
    coast,
    rocky: type === 'mine' || (type === 'hills' && hash3(q, r, seed + 8) < 0.5),
    woods: type === 'forest' ? 0.4 : type === 'farmland' ? 0.05 : Math.round(moisture(seed, q, r) * 30) / 100,
  };
  return { id, q, r, type, passable, fort, capital: isCapital, tier, site, coast };
}

/** Minutes for an army to cross into a hex of this type. */
export const MARCH_MINUTES: Record<HexType, number> = {
  plains: 6,
  farmland: 6,
  town: 6,
  ruins: 8,
  forest: 10,
  hills: 12,
  mine: 12,
  water: Infinity,
  mountain: Infinity,
};

/**
 * Cheapest path (A*) from `from` to `to` (inclusive both ends) over hexes
 * that `ok` allows; cost = march minutes of each entered hex. null if none.
 */
export function findHexPath(
  seed: number,
  from: Axial,
  to: Axial,
  ok: (h: HexInfo) => boolean,
  maxNodes = 6000,
  radius = SHARD_RADIUS,
): Axial[] | null {
  if (!inShard(to, radius) || !inShard(from, radius)) return null;
  const key = (h: Axial) => hexId(h.q, h.r);
  const info = new Map<string, HexInfo>();
  const get = (h: Axial) => {
    const k = key(h);
    let v = info.get(k);
    if (!v) {
      v = hexInfo(seed, h.q, h.r, radius);
      info.set(k, v);
    }
    return v;
  };
  const target = get(to);
  if (!target.passable || !ok(target)) return null;
  const g = new Map<string, number>([[key(from), 0]]);
  const prev = new Map<string, Axial>();
  // Small binary heap on f = g + h.
  const open: { h: Axial; f: number; n: number }[] = [];
  let counter = 0;
  const push = (h: Axial, f: number) => {
    open.push({ h, f, n: counter++ });
    let i = open.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (open[p].f < open[i].f || (open[p].f === open[i].f && open[p].n < open[i].n)) break;
      [open[p], open[i]] = [open[i], open[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = open[0];
    const last = open.pop()!;
    if (open.length) {
      open[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const rr = l + 1;
        let m = i;
        const less = (a: number, b: number) => open[a].f < open[b].f || (open[a].f === open[b].f && open[a].n < open[b].n);
        if (l < open.length && less(l, m)) m = l;
        if (rr < open.length && less(rr, m)) m = rr;
        if (m === i) break;
        [open[m], open[i]] = [open[i], open[m]];
        i = m;
      }
    }
    return top;
  };
  push(from, hexDistance(from, to) * 6);
  let expanded = 0;
  const closed = new Set<string>();
  while (open.length && expanded < maxNodes) {
    const cur = pop().h;
    const ck = key(cur);
    if (closed.has(ck)) continue;
    closed.add(ck);
    expanded++;
    if (cur.q === to.q && cur.r === to.r) {
      const path: Axial[] = [cur];
      let k = ck;
      while (prev.has(k)) {
        const p = prev.get(k)!;
        path.push(p);
        k = key(p);
      }
      return path.reverse();
    }
    for (const n of neighbours(cur, radius)) {
      const ni = get(n);
      if (!ni.passable || !ok(ni)) continue;
      const cost = g.get(ck)! + MARCH_MINUTES[ni.type];
      const nk = key(n);
      if (cost < (g.get(nk) ?? Infinity)) {
        g.set(nk, cost);
        prev.set(nk, cur);
        push(n, cost + hexDistance(n, to) * 6);
      }
    }
  }
  return null;
}

/** Display name of a hex's battlefield ("Wooded hills", "River ford", ...). */
export function siteLabel(site: BattleSite): string {
  return siteName(site);
}
