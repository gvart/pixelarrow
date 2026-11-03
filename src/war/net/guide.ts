/**
 * W-62 the guided first hour (the HUD: ./hud/guide.ts), one chain per path (W-170): where its targets stand, what each
 * step pays and when a step is done. Pure (no Phaser, no DOM): the sandbox and tests/war/guide.test.ts use the same rules.
 *
 *   Warrior  claim a soul of his family down the road, gather, beat the guide's own small camp of bandits (W-171; it never
 *            points at a full lair), raise a camp at home, then the hand-off: the story giver nearest him (W-73, guideHand).
 *   Builder  gather, raise a house of his own, set who may use a building, start a workplace with a man in it, then his
 *            path's chain giver (W-147) by the well.
 *   Trader   load the handcart, carry goods to the next land's town, sell them there, hire or buy there, then back home
 *            to his path's chain giver.
 *
 * A step whose condition is met early counts at once; the tracker points at the first one still open. No path (a dev
 * player, the offline sandbox with no ?path=) walks the warrior's chain.
 */
import type { MobKind, ResourceKind, RegionData, Snapshot, WarEvent } from '../types';
import { entrySpot } from '../view/entry';
import { storyOf } from '../../data/warStories';
import { NPC } from '../../data/warNpcTowns';
import { BUILDINGS } from '../sim/economy';
import { edge, worldRegion } from '../world/graph';
import type { PathId } from '../world/start';
import { npcSpot } from './npcMarket';

export type GuideStepId = 'soul' | 'gather' | 'lair' | 'build' | 'house' | 'access' | 'work' | 'load' | 'carry' | 'sell' | 'hire' | 'next';
/** reward: paid into his home strongroom (offline: his stores). */
export interface GuideStep { id: GuideStepId; reward: Partial<Record<ResourceKind, number>> }

/** W-170 each path's chain, in the order the road gives it (words: ./questLore.ts GUIDE_LORE). */
export const GUIDE_PATHS: Record<PathId, readonly GuideStep[]> = {
  warrior: [
    { id: 'soul', reward: { food: 20 } },
    { id: 'gather', reward: { coin: 10 } },
    { id: 'lair', reward: { coin: 30 } },
    { id: 'build', reward: { food: 40 } },
    { id: 'next', reward: { coin: 70 } },
  ],
  builder: [
    { id: 'gather', reward: { coin: 10 } },
    { id: 'house', reward: { food: 40 } },
    { id: 'access', reward: { coin: 20 } },
    { id: 'work', reward: { coin: 40 } },
    { id: 'next', reward: { coin: 60 } },
  ],
  trader: [
    { id: 'load', reward: { food: 20 } },
    { id: 'carry', reward: { coin: 20 } },
    { id: 'sell', reward: { coin: 30 } },
    { id: 'hire', reward: { coin: 30 } },
    { id: 'next', reward: { coin: 50 } },
  ],
};
/** The chain of a path; no path: the warrior's. */
export const guideSteps = (path: PathId | null | undefined): readonly GuideStep[] => GUIDE_PATHS[path ?? 'warrior'];

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

type Exits = Pick<RegionData, 'w' | 'h' | 'entries' | 'prebuilt'>;

/** W-170 the last step: who the guide hands him to and where: the chain here (his path's at a home, a land's own), else the road to the nearest. */
export function guideHand(id: string, region: Exits, path: PathId | null): { giver: string; at: { x: number; y: number }; region: string; road: string | null } | null {
  const story = storyOf(id, path);
  if (story) return { giver: story.giver.name, at: { x: story.giver.at[0], y: story.giver.at[1] }, region: worldRegion(id)?.name ?? id, road: null };
  const n = guideNext(id, region);
  return n && { giver: n.giver, at: n.exit, region: n.name, road: n.region };
}

/** W-170 a trader's road out: the exit towards the neighbour nearest his home town (every land has a town, W-140). */
export function guideAbroad(home: string, region: Exits): { region: string; name: string; exit: { x: number; y: number } } | null {
  const town = homeAnchor(region);
  let best: { region: string; name: string; exit: { x: number; y: number } } | null = null, bd = Infinity;
  for (const id of worldRegion(home)?.adj ?? []) {
    const exit = guideExit(home, id, region);
    if (!exit) continue;
    const d = Math.hypot(exit.x - town.x, exit.y - town.y);
    if (d < bd) (bd = d), (best = { region: id, name: worldRegion(id)!.name, exit });
  }
  return best;
}

/** The exit from `here` towards a neighbour `to` (a trader coming home), null: not next door. */
export function guideExit(here: string, to: string, region: Pick<RegionData, 'entries'>): { x: number; y: number } | null {
  const ent = region.entries.find((x) => x.side === edge(here, to)?.sideA);
  return ent ? { x: ent.x + ent.w / 2, y: ent.y + ent.h / 2 } : null;
}

/** W-171 the warrior's first fight, a small camp on his road (2 bandits): every family's first men win it unhurt (tests/war/firstFight.test.ts); tiles along the road from the entry. */
export const GUIDE_LAIR: { kind: MobKind; count: number; at: number } = { kind: 'bandit', count: 2, at: 90 };
/** The guide's soul: tiles along the road from the entry and his level; his class is the player's family's first (W-101: a stranger would refuse him). */
export const GUIDE_SOUL = { at: 16, level: 1 } as const;
/** The alliance's influence round its home town (server/src/war/room.ts HOME_CLAIM_R; the offline sandbox claims the same). */
export const HOME_R = 64;

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

/** A player's guide progress (offline: localStorage; online: his row in D1, it follows him abroad). */
export interface GuideSave { v: 1; done: GuideStepId[]; hidden?: boolean }
/** The guide still has steps to show for this save (none saved: a new player). */
export const guideOpen = (g: GuideSave | null, path: PathId | null = null) => !g || (!g.hidden && guideSteps(path).some((s) => !g.done.includes(s.id)));
/** His men stand this near a lair as it is cleared, or a new building as it is done, for it to count as his (online). */
export const GUIDE_NEAR = 30;
/** His men stand this near the chain's giver to close the hand-off: the giver's own marker takes over from there. */
export const GIVER_NEAR = 14;

/** What the done-checks remember between snapshots (./hud/guide.ts keeps one per page, the server room one per player). */
export interface GuideWatch {
  team: number;
  /** Online (the server room): the player's squads' owner (`p:<pid>`): only his men count. */
  owner?: string;
  /** Own building ids standing when the guide began (they do not count as built by him); `seen`: that first look is done. */
  had: Set<number>;
  seen: boolean;
  /** The lair he is to beat (by where it stands; null: none here). */
  lair: { x: number; y: number } | null;
  /** Server notes and sim events that finished a step. */
  flags: Set<GuideStepId>;
  /** The hand-off's point: the chain's giver, or the exit towards one (W-73); null: no hand-off here. */
  next: { x: number; y: number } | null;
  /** How near his men must come to `next`. */
  nextR: number;
  /** W-170 a trader abroad: this land's town. */
  town: { x: number; y: number } | null;
  /** W-170 each of his buildings' access as last seen: a change closes the access step. */
  access: Map<number, string>;
}

export const newWatch = (team: number, lair: { x: number; y: number } | null, owner?: string, next: { x: number; y: number } | null = null, o: { nextR?: number; town?: { x: number; y: number } | null } = {}): GuideWatch =>
  ({ team, ...(owner ? { owner } : {}), had: new Set(), seen: false, lair, flags: new Set(), next, nextR: o.nextR ?? GUIDE_NEAR, town: o.town ?? null, access: new Map() });

/**
 * The watch for a player of `path` in `region`, given his home region (W-170): the warrior's camp and the hand-off at home,
 * a trader's town abroad; a trader abroad has no hand-off (his chain is at home).
 */
export function watchFor(path: PathId | null, region: RegionData, team: number, owner: string | undefined, home: string, lair: { x: number; y: number } | null): GuideWatch {
  const abroad = path === 'trader' && region.id !== home, hand = abroad ? null : guideHand(region.id, region, path);
  return newWatch(team, path === null || path === 'warrior' ? lair : null, owner, hand?.at ?? null, { nextR: hand && !hand.road ? GIVER_NEAR : GUIDE_NEAR, town: abroad ? npcSpot(region) : null });
}

/**
 * Sim events that finish a step: a soul claimed by a squad of his (team, or owner online). Online a claim refused
 * because his army is full ends the soul step too: there is nothing to claim, it never sticks. A stranger refused (W-101)
 * does not: another soul will do.
 */
export function watchEvents(w: GuideWatch, s: Pick<Snapshot, 'squads'> | null, ev: readonly WarEvent[]): void {
  for (const e of ev) {
    if (e.kind !== 'soulClaimed' && !(e.kind === 'soulRefused' && e.why === 'full')) continue;
    if (w.owner ? e.owner === w.owner : e.kind === 'soulClaimed' && s?.squads.find((q) => q.id === e.squad)?.team === w.team) w.flags.add('soul');
  }
}

/** The steps done by this snapshot (with what the watch remembers): any path's; the caller keeps those of his chain. */
export function doneNow(w: GuideWatch, s: Snapshot): Set<GuideStepId> {
  const out = new Set(w.flags);
  const blds = s.buildings ?? [], mine = (b: (typeof blds)[number]) => b.team === w.team && !b.pre && (!w.owner || b.owner === w.owner);
  if (!w.seen) {
    w.seen = true;
    for (const b of blds) if (b.team === w.team) w.had.add(b.id);
  }
  const own = new Set(s.squads.filter((q) => q.team === w.team && (!w.owner || q.owner === w.owner)).map((q) => q.id));
  const men = s.units.filter((u) => own.has(u.squad) && u.state !== 'dead'), ids = new Set(men.map((u) => u.id));
  const near = (x: number, y: number, r = GUIDE_NEAR) => men.some((u) => Math.hypot(u.x - x, u.y - y) < r);
  const nearOn = (x: number, y: number) => !w.owner || near(x, y);
  if (men.some((u) => (u.carry === 'wood' || u.carry === 'stone') && (u.load ?? 0) > 0)) out.add('gather');
  if (w.lair) {
    // every lair at the spot cleared (a later player's fresh pair stands where the first one fell)
    const ls = (s.lairs ?? []).filter((x) => Math.hypot(x.x - w.lair!.x, x.y - w.lair!.y) < 0.5);
    if (ls.length && ls.every((l) => l.state === 'cleared') && nearOn(w.lair.x, w.lair.y)) out.add('lair');
  }
  for (const b of blds) {
    if (!mine(b)) continue;
    if (b.state === 'done' && !w.had.has(b.id) && nearOn(b.x, b.y)) out.add(b.type === 'privateHouse' ? 'house' : 'build');
    // the access step: he changed who may use a building of his (the card's setting)
    const was = w.access.get(b.id), now = b.access ?? '';
    if (was !== undefined && was !== now) w.flags.add('access'), out.add('access');
    w.access.set(b.id, now);
  }
  // a workplace going: his own with a man at it, or any where a man of his has an order running
  if (blds.some((b) => b.state === 'done' && !!BUILDINGS[b.type]?.workplace && ((mine(b) && b.staffed) || b.queue?.some((q) => ids.has(q.by))))) out.add('work');
  if ((s.sieges ?? []).some((e) => (w.owner ? e.owner === w.owner : e.team === w.team) && (e.loads ?? 0) > 0)) out.add('load');
  if (w.town && near(w.town.x, w.town.y, NPC.reach)) out.add('carry');
  if (out.has('sell')) out.add('carry');
  if (out.has('carry')) out.add('load'); // goods carried in on men's backs do as well
  if (w.next && near(w.next.x, w.next.y, w.nextR)) out.add('next'); // W-73: at the exit; W-170: at the giver
  return out;
}
