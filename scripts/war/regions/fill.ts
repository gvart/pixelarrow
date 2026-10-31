/**
 * world-fill: the wild a region lacks after its authored lairs (docs/WAR.md "Region lore and depth": 3-8 lairs by depth),
 * placed by the kit on its last pass, deterministic. Three things, all on open, reachable ground off the roads, clear of
 * towns, landmarks, entries, named spots, the region story's places and each other:
 *
 *  - lairs up to the depth table's top (src/war/sim/depth.ts DEPTH lairs), of the region's own fauna; the homes get
 *    2-4 weak lairs of wolves, boars or jackals on their outskirts (half packs), far from the town ground;
 *  - 1-2 chiefs past the homes (depth 1: one, deeper: two): a lair led by a named mini-boss (src/data/warWild.ts) of
 *    one of its fighting kinds, spread from the other lairs;
 *  - 2-3 hidden quest spots past the homes (src/data/warStories.ts hiddenStories), each with its next step's place a
 *    short walk off, both 26+ tiles from every lair (a step fights only its own foes).
 *
 * The added lairs come after the authored ones and join no claim zone (claiming stays as authored).
 */
import type { MobKind } from '../../../src/war/types.ts';
import { DEPTH } from '../../../src/war/sim/depth.ts';
import { CHIEF_FIRM, chiefsOfKind, HIDDEN_IDS } from '../../../src/data/warWild.ts';

export { CHIEF_FIRM };
import { WORLD } from './world.ts';

type P = [number, number];
export interface FillLair { kind: MobKind; x: number; y: number; count?: number; as?: string; chief?: string }
export interface FillSecret { x: number; y: number; quest: string; then: P }
export interface FillIn {
  id: string; role: 'home' | 'entry' | 'neutral' | 'center'; family: string; depth: number;
  fauna: readonly { kind: MobKind; as: string }[];
  W: number; H: number;
  /** Open, flat, dry ground around (x,y), not a road. */
  ground(x: number, y: number): boolean;
  /** Tiles to the nearest road. */
  roadDist(x: number, y: number): number;
  /** Some ford or marsh within CHIEF_FIRM tiles (a chief fights on firm ground: in a bog men lose their block, W-81). */
  bog?(x: number, y: number): boolean;
  /** Joined to the first entry. */
  reach(x: number, y: number): boolean;
  lairs: readonly { x: number; y: number; kind: MobKind }[];
  /** Places to keep clear, each with its radius (tiles). */
  keep: readonly { x: number; y: number; r: number }[];
}

/** FNV-1a of a text, then a 0..1 value per (text, k). */
const hash = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
};
const rnd = (s: string, k: number) => (hash(`${s}:${k}`) % 100003) / 100003;

/** A home's weak fauna by its family (wolves, boars, jackals), at half their pack. */
const HOME: Record<string, MobKind[]> = { forest: ['wolf', 'boar'], steppe: ['wolf', 'boar'], desert: ['jackal', 'jackal'], med: ['boar', 'jackal'], mountain: ['wolf', 'boar'], wet: ['boar', 'wolf'] };
const HALF: Partial<Record<MobKind, number>> = { wolf: 3, boar: 2, jackal: 3 };
const AS: Partial<Record<MobKind, string>> = { wolf: 'wolves', boar: 'boars', jackal: 'jackals' };
/** Kinds that never lead (a fleeing herd). */
const NO_CHIEF = new Set<MobKind>(['ibex']);
/** Tiles kept between lairs (the authored kit keeps 12; the wild spreads further), from lairs to hidden spots, and the map edge. */
const LAIR_GAP = 34, SECRET_GAP = 26, EDGE = 18, STRIDE = 4;

export function fillWild(f: FillIn): { lairs: FillLair[]; secrets: FillSecret[]; log: string } {
  const home = f.role === 'home', d = Math.max(0, Math.min(4, f.depth));
  const want = home ? 3 : DEPTH[d].lairs[1];
  const chiefs = home ? 0 : d <= 1 ? 1 : 2;
  const nSecrets = home ? 0 : d <= 1 ? 2 : 3;
  const placed: { x: number; y: number }[] = f.lairs.map((l) => ({ x: l.x, y: l.y }));
  const keepOut = (x: number, y: number, extra = 0) => f.keep.some((k) => (k.x - x) ** 2 + (k.y - y) ** 2 < (k.r + extra) ** 2);
  // the candidate ground: every STRIDE tiles, open, off the roads, reachable, clear of the kept places
  const cand: P[] = [];
  for (let y = EDGE; y < f.H - EDGE; y += STRIDE) for (let x = EDGE; x < f.W - EDGE; x += STRIDE) {
    const cx = x + 0.5, cy = y + 0.5;
    if (!f.ground(x, y) || f.roadDist(x, y) <= 4 || keepOut(cx, cy) || !f.reach(cx, cy)) continue;
    cand.push([cx, cy]);
  }
  const minTo = (p: P, ps: readonly { x: number; y: number }[]) => ps.reduce((m, q) => Math.min(m, Math.hypot(q.x - p[0], q.y - p[1])), Infinity);
  /** The candidate furthest from what is placed (and `away`, weighted), at least `gap` from it; null: none. */
  const pick = (gap: number, score: (p: P) => number = () => 0): P | null => {
    let best: P | null = null, bs = -Infinity;
    for (const [i, p] of cand.entries()) {
      const m = minTo(p, placed);
      if (m < gap) continue;
      // spread out (to 80 tiles), a little off the map edge, and a seeded jitter so it is not always the far corner
      const edge = Math.min(p[0], p[1], f.W - p[0], f.H - p[1]);
      const s = Math.min(m, 80) + 0.6 * Math.min(edge, 50) + 30 * rnd(`${f.id}:${placed.length}`, i) + score(p);
      if (s > bs) (bs = s), (best = p);
    }
    return best;
  };
  const out: FillLair[] = [];
  const kinds: { kind: MobKind; as: string }[] = home
    ? (HOME[f.family] ?? HOME.forest).map((k) => ({ kind: k, as: AS[k] ?? k }))
    : f.fauna.length ? [...f.fauna] : [{ kind: 'wolf', as: 'wolves' }];
  // homes: on the outskirts, as far from the town ground (the kept places) as the map allows
  const outskirts = home ? (p: P) => Math.min(80, f.keep.reduce((m, k) => Math.min(m, Math.hypot(k.x - p[0], k.y - p[1]) - k.r), Infinity)) : () => 0;
  for (let i = f.lairs.length, n = 0; i < want; i++, n++) {
    const p = pick(LAIR_GAP, outskirts);
    if (!p) break;
    const k = kinds[(n + (hash(f.id) % kinds.length)) % kinds.length];
    placed.push({ x: p[0], y: p[1] });
    out.push({ kind: k.kind, x: p[0], y: p[1], as: k.as, ...(home && HALF[k.kind] ? { count: HALF[k.kind] } : {}) });
  }
  // chiefs: deep in, furthest from the entries' kept ground and everything placed
  const fighters = kinds.filter((k) => !NO_CHIEF.has(k.kind) && chiefsOfKind(k.kind).length);
  const named = new Set<string>();
  for (let c = 0; c < chiefs && fighters.length; c++) {
    const p = pick(LAIR_GAP, (q) => (f.bog?.(q[0], q[1]) ? -Infinity : 0));
    if (!p) break;
    const k = fighters[(c + (hash(f.id) % fighters.length)) % fighters.length], pool = chiefsOfKind(k.kind).filter((x) => !named.has(x.id));
    if (!pool.length) continue;
    // spread the names over the world: each region's turn in the world list walks the pool (a name repeats only far apart)
    const chief = pool[(Math.max(0, WORLD.findIndex((r) => r.id === f.id)) * 3 + c * 5) % pool.length];
    named.add(chief.id);
    placed.push({ x: p[0], y: p[1] });
    out.push({ kind: k.kind, x: p[0], y: p[1], as: chief.name, chief: chief.id });
  }
  // hidden spots, each with its next place 10-16 tiles off on the same kind of ground
  const secrets: FillSecret[] = [];
  const lairsNow = placed.slice();
  const spots: { x: number; y: number }[] = [];
  for (let s = 0; s < nSecrets; s++) {
    let got: FillSecret | null = null;
    const order = cand.map((p, i) => [p, rnd(`${f.id}:secret:${s}`, i)] as const).sort((a, b) => a[1] - b[1]);
    for (const [p] of order) {
      if (minTo(p, lairsNow) < SECRET_GAP + 4 || minTo(p, spots) < 60) continue;
      for (let a = 0; a < 8 && !got; a++) {
        const t = (a / 8) * Math.PI * 2 + rnd(`${f.id}:then:${s}`, 0) * 6.28, r = 10 + 6 * rnd(`${f.id}:r:${s}`, a);
        const q: P = [Math.floor(p[0] + Math.cos(t) * r) + 0.5, Math.floor(p[1] + Math.sin(t) * r) + 0.5];
        if (q[0] < EDGE || q[1] < EDGE || q[0] > f.W - EDGE || q[1] > f.H - EDGE) continue;
        if (!f.ground(Math.floor(q[0]), Math.floor(q[1])) || !f.reach(q[0], q[1]) || keepOut(q[0], q[1]) || minTo(q, lairsNow) < SECRET_GAP) continue;
        got = { x: p[0], y: p[1], quest: HIDDEN_IDS[(s + hash(f.id)) % HIDDEN_IDS.length], then: q };
      }
      if (got) break;
    }
    if (!got) break;
    spots.push({ x: got.x, y: got.y });
    secrets.push(got);
  }
  const log = `wild +${out.filter((l) => !l.chief).length} lairs, ${out.filter((l) => l.chief).length} chiefs (${out.filter((l) => l.chief).map((l) => l.chief).join(', ')}), ${secrets.length} hidden spots`;
  return { lairs: out, secrets, log };
}
