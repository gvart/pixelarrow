/**
 * W-62 the guided first hour (the HUD: ./hud/guide.ts): a new player's step chain in his home region, where its targets
 * stand, what each step pays and when a step is done. Pure (no Phaser, no DOM): the sandbox and tests/war/guide.test.ts
 * use the same rules.
 *
 * Steps, in the order the road gives them: claim a soul (one waits a little way down the road from the entry), gather
 * wood or stone (the nearest node), drive off a bandit pair on the road home (offline the guide adds that weak lair;
 * ../sim/mobs.ts add), raise a camp in the home town (the alliance's influence round the town: server room HOME_CLAIM_R),
 * bring goods into a store (offline a delivery into his store, online a stow or a hand-off), and the hand-off (W-73): walk
 * to the exit towards the nearest neighbour with a region chain (guideNext), whose giver waits by its well. A step whose
 * condition is met early counts at once; the tracker points at the first one still open.
 */
import type { MobKind, ResourceKind, RegionData, Snapshot, WarEvent } from '../types';
import { entrySpot } from '../view/entry';
import { storyOf } from '../../data/warStories';
import { edge, worldRegion } from '../world/graph';

export type GuideStepId = 'soul' | 'gather' | 'lair' | 'build' | 'haul' | 'next';
/** reward: paid into his stores (offline); never wood or stone, which the haul step counts. */
export interface GuideStep { id: GuideStepId; title: string; hint: string; reward: Partial<Record<ResourceKind, number>> }

export const GUIDE_STEPS: readonly GuideStep[] = [
  { id: 'soul', title: 'Claim a soul', hint: 'A fallen warrior waits by the road. Right-click him with your men.', reward: { food: 20 } },
  { id: 'gather', title: 'Gather wood or stone', hint: 'Right-click a tree or a boulder: your men cut and carry.', reward: { coin: 10 } },
  { id: 'lair', title: 'Drive off the bandits', hint: 'Two bandits lurk on the road home. Attack them.', reward: { coin: 30 } },
  { id: 'build', title: 'Raise a camp at home', hint: 'Press B, pick Camp and place it on your town\'s ground.', reward: { food: 40 } },
  { id: 'haul', title: 'Bring goods into a store', hint: 'Gatherers carry their loads to your nearest store.', reward: { coin: 50 } },
  { id: 'next', title: 'Find the next storyteller', hint: 'Walk your men out of home towards the region whose giver waits by the well.', reward: { coin: 20 } },
];

/**
 * W-73 the guide's hand-off: of the home's neighbours with a region chain (src/data/warStories.ts), the one whose exit
 * lies nearest the home town (ties: the home's adjacency order); its giver and the exit tile towards it. Null: none.
 */
export function guideNext(home: string, region: Pick<RegionData, 'w' | 'h' | 'entries' | 'prebuilt'>): { region: string; name: string; giver: string; exit: { x: number; y: number } } | null {
  const town = homeAnchor(region);
  let best: { region: string; name: string; giver: string; exit: { x: number; y: number } } | null = null, bd = Infinity;
  for (const id of worldRegion(home)?.adj ?? []) {
    const story = storyOf(id), e = edge(home, id), side = e?.sideA;
    const ent = side ? region.entries.find((x) => x.side === side) : undefined;
    if (!story || !ent) continue;
    const exit = { x: ent.x + ent.w / 2, y: ent.y + ent.h / 2 }, d = Math.hypot(exit.x - town.x, exit.y - town.y);
    if (d < bd) (bd = d), (best = { region: id, name: worldRegion(id)!.name, giver: story.giver.name, exit });
  }
  return best;
}

/** The weak lair on a new player's road (2 bandits: 12 hoplites win it without a loss), tiles along the road from the entry. */
export const GUIDE_LAIR: { kind: MobKind; count: number; at: number } = { kind: 'bandit', count: 2, at: 90 };
/** The guide's soul: tiles along the road from the entry; his class and level. */
export const GUIDE_SOUL = { at: 16, cls: 'hoplite', level: 1 } as const;
/** The alliance's influence round its home town (server/src/war/room.ts HOME_CLAIM_R; the offline sandbox claims the same). */
export const HOME_R = 64;
/** Goods delivered into his stores (offline) that finish the haul step. */
export const HAUL_GOODS = 10;

/** The home town's middle: the centroid of the region's pre-built pieces (server/src/war/room.ts homeAnchor). */
export function homeAnchor(region: Pick<RegionData, 'w' | 'h' | 'prebuilt'>): { x: number; y: number } {
  const ps = (region.prebuilt ?? []).filter((p) => !p.tiles);
  if (!ps.length) return { x: region.w / 2, y: region.h / 2 };
  return { x: Math.round(ps.reduce((a, p) => a + p.x, 0) / ps.length) + 0.5, y: Math.round(ps.reduce((a, p) => a + p.y, 0) / ps.length) + 0.5 };
}

/** Tiles a man may stand on: no deep water, rock or massif ground (boulders are few and far between on the roads). */
function openMask(r: RegionData): Uint8Array {
  const n = r.w * r.h, m = new Uint8Array(n);
  for (let t = 0; t < n; t++) m[t] = r.water[t] === 2 || r.terrain[t] === 'rock' ? 0 : 1;
  const b = r.blocked ?? [];
  for (let k = 0; k + 1 < b.length; k += 2) m.fill(0, b[k], Math.min(n, b[k] + b[k + 1]));
  return m;
}

/**
 * Steps a man walks from `from` to every tile (-1: no way there): a breadth-first flood over open tiles, steps of one
 * height level at most (a cliff is no way), 4-connected.
 */
function walkSteps(r: RegionData, from: { x: number; y: number }): Int32Array {
  const { w, h } = r, ok = openMask(r), dist = new Int32Array(w * h).fill(-1), q = new Int32Array(w * h);
  let start = Math.floor(from.y) * w + Math.floor(from.x);
  for (let k = 1; !ok[start] && k < 40; k++) start += w; // an entry on rough ground: the first open tile inward
  let head = 0, tail = 0;
  q[tail++] = start;
  dist[start] = 0;
  while (head < tail) {
    const t = q[head++], x = t % w;
    for (const n of [x > 0 ? t - 1 : -1, x < w - 1 ? t + 1 : -1, t - w, t + w]) {
      if (n < 0 || n >= w * h || dist[n] >= 0 || !ok[n] || Math.abs(r.height[n] - r.height[t]) > 1) continue;
      dist[n] = dist[t] + 1;
      q[tail++] = n;
    }
  }
  return dist;
}

export interface GuideSpots { entry: { x: number; y: number }; home: { x: number; y: number }; soul: { x: number; y: number }; lair: { x: number; y: number } }

/**
 * Where the guide's targets stand for `team` entering `region`: `at` steps' walk from its entry (never across a river or
 * a cliff from it), as near the straight line to the home town as the ground allows.
 */
export function guideSpots(region: RegionData, team: number): GuideSpots {
  const entry = entrySpot(region, team), home = homeAnchor(region), dist = walkSteps(region, entry), w = region.w;
  const dx = home.x - entry.x, dy = home.y - entry.y, len = Math.hypot(dx, dy) || 1;
  // the tile `d` steps' walk from the entry that lies nearest the straight line to the town (ahead of the entry)
  const along = (d: number) => {
    let best = -1, bs = Infinity;
    for (let t = 0; t < dist.length; t++) {
      if (dist[t] !== d) continue;
      const px = (t % w) + 0.5 - entry.x, py = ((t / w) | 0) + 0.5 - entry.y, ahead = (px * dx + py * dy) / len;
      const off = Math.abs(px * dy - py * dx) / len + (ahead < 0 ? 1000 : 0);
      if (off < bs) (bs = off), (best = t);
    }
    return best < 0 ? { ...entry } : { x: (best % w) + 0.5, y: Math.floor(best / w) + 0.5 };
  };
  return { entry, home, soul: along(GUIDE_SOUL.at), lair: along(GUIDE_LAIR.at) };
}

/** A player's guide progress (offline: localStorage; online: the home region's DO storage, `guide:<pid>`). */
export interface GuideSave { v: 1; done: GuideStepId[]; hidden?: boolean }
/** The guide still has steps to show for this save (none saved: a new player). */
export const guideOpen = (g: GuideSave | null) => !g || (!g.hidden && GUIDE_STEPS.some((s) => !g.done.includes(s.id)));
/** His men stand this near a lair as it is cleared, or a new building as it is done, for it to count as his (online). */
export const GUIDE_NEAR = 30;

/** What the done-checks remember between snapshots (./hud/guide.ts keeps one per page, the server room one per player). */
export interface GuideWatch {
  team: number;
  /** Online (the server room): the player's squads' owner (`p:<pid>`): only his men count, and the haul step comes by flag. */
  owner?: string;
  /** Own building ids standing when the guide began (they do not count as built by him). */
  had: Set<number>;
  /** Goods in his stores at the start (offline haul), -1 until the first snapshot. */
  stock0: number;
  /** The lair he is to beat (by where it stands; null: none in this region). */
  lair: { x: number; y: number } | null;
  /** Server notes and sim events that finished a step. */
  flags: Set<GuideStepId>;
  /** W-73: the exit towards the hand-off's region (guideNext; null: no hand-off here). */
  next: { x: number; y: number } | null;
}

export const newWatch = (team: number, lair: { x: number; y: number } | null, owner?: string, next: { x: number; y: number } | null = null): GuideWatch => ({ team, ...(owner ? { owner } : {}), had: new Set(), stock0: -1, lair, flags: new Set(), next });

/**
 * Sim events that finish a step: a soul claimed by a squad of his (team, or owner online). Online a claim refused
 * (his army is full) ends the soul step too: there is nothing to claim, it never sticks.
 */
export function watchEvents(w: GuideWatch, s: Pick<Snapshot, 'squads'> | null, ev: readonly WarEvent[]): void {
  for (const e of ev) {
    if (e.kind !== 'soulClaimed' && e.kind !== 'soulRefused') continue;
    if (w.owner ? e.owner === w.owner : e.kind === 'soulClaimed' && s?.squads.find((q) => q.id === e.squad)?.team === w.team) w.flags.add('soul');
  }
}

const goods = (s: Snapshot, team: number) => {
  const g = s.stock?.[team] ?? {};
  return (g.wood ?? 0) + (g.stone ?? 0);
};

/** The steps done by this snapshot (with what the watch remembers). */
export function doneNow(w: GuideWatch, s: Snapshot): Set<GuideStepId> {
  const out = new Set(w.flags);
  if (w.stock0 < 0) {
    w.stock0 = goods(s, w.team);
    for (const b of s.buildings ?? []) if (b.team === w.team) w.had.add(b.id);
  }
  const own = new Set(s.squads.filter((q) => q.team === w.team && (!w.owner || q.owner === w.owner)).map((q) => q.id));
  const men = s.units.filter((u) => own.has(u.squad) && u.state !== 'dead');
  const near = (x: number, y: number) => !w.owner || men.some((u) => Math.hypot(u.x - x, u.y - y) < GUIDE_NEAR);
  if (men.some((u) => (u.carry === 'wood' || u.carry === 'stone') && (u.load ?? 0) > 0)) out.add('gather');
  if (w.lair) {
    // every lair at the spot cleared (a later player's fresh pair stands where the first one fell)
    const ls = (s.lairs ?? []).filter((x) => Math.hypot(x.x - w.lair!.x, x.y - w.lair!.y) < 0.5);
    if (ls.length && ls.every((l) => l.state === 'cleared') && near(w.lair.x, w.lair.y)) out.add('lair');
  }
  if ((s.buildings ?? []).some((b) => b.team === w.team && b.state === 'done' && !b.pre && !w.had.has(b.id) && near(b.x, b.y))) out.add('build');
  if (!w.owner && goods(s, w.team) >= w.stock0 + HAUL_GOODS) out.add('haul');
  if (w.next && men.some((u) => Math.hypot(u.x - w.next!.x, u.y - w.next!.y) < GUIDE_NEAR)) out.add('next'); // W-73: at the exit
  return out;
}
