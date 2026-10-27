/**
 * W-62 the guided first hour (the HUD: ./hud/guide.ts): a new player's step chain in his home region, where its targets
 * stand, what each step pays and when a step is done. Pure (no Phaser, no DOM): the sandbox and tests/war/guide.test.ts
 * use the same rules.
 *
 * Steps, in the order the road gives them: claim a soul (one waits a little way down the road from the entry), gather
 * wood or stone (the nearest node), drive off a bandit pair on the road home (offline the guide adds that weak lair;
 * ../sim/mobs.ts add), raise a camp in the home town (the alliance's influence round the town: server room HOME_CLAIM_R),
 * bring goods into a store (offline a delivery into his store, online a stow or a hand-off). A step whose condition is met
 * early counts at once; the tracker points at the first one still open.
 */
import type { MobKind, ResourceKind, RegionData, Snapshot, WarEvent } from '../types';
import { entrySpot } from './entry';

export type GuideStepId = 'soul' | 'gather' | 'lair' | 'build' | 'haul';
/** reward: paid into his stores (offline); never wood or stone, which the haul step counts. */
export interface GuideStep { id: GuideStepId; title: string; hint: string; reward: Partial<Record<ResourceKind, number>> }

export const GUIDE_STEPS: readonly GuideStep[] = [
  { id: 'soul', title: 'Claim a soul', hint: 'A fallen warrior waits by the road. Right-click him with your men.', reward: { food: 20 } },
  { id: 'gather', title: 'Gather wood or stone', hint: 'Right-click a tree or a boulder: your men cut and carry.', reward: { coin: 10 } },
  { id: 'lair', title: 'Drive off the bandits', hint: 'Two bandits lurk on the road home. Attack them.', reward: { coin: 30 } },
  { id: 'build', title: 'Raise a camp at home', hint: 'Press B, pick Camp and place it on your town\'s ground.', reward: { food: 40 } },
  { id: 'haul', title: 'Bring goods into a store', hint: 'Gatherers carry their loads to your nearest store.', reward: { coin: 50 } },
];

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

/** A tile a man may stand on: no deep water, rock or massif ground (boulders are few and far between on the roads). */
function open(r: RegionData, x: number, y: number): boolean {
  if (x < 1 || y < 1 || x >= r.w - 1 || y >= r.h - 1) return false;
  const t = y * r.w + x;
  if (r.water[t] === 2 || r.terrain[t] === 'rock') return false;
  const b = r.blocked ?? [];
  for (let k = 0; k + 1 < b.length; k += 2) if (t >= b[k] && t < b[k] + b[k + 1]) return false;
  return true;
}

/** The open tile centre nearest (x,y), searched in growing squares (the point itself when nothing is open near). */
function nearestOpen(r: RegionData, x: number, y: number): { x: number; y: number } {
  const tx = Math.floor(x), ty = Math.floor(y);
  for (let d = 0; d < 24; d++)
    for (let yy = ty - d; yy <= ty + d; yy++)
      for (let xx = tx - d; xx <= tx + d; xx++)
        if ((Math.abs(xx - tx) === d || Math.abs(yy - ty) === d) && open(r, xx, yy)) return { x: xx + 0.5, y: yy + 0.5 };
  return { x, y };
}

export interface GuideSpots { entry: { x: number; y: number }; home: { x: number; y: number }; soul: { x: number; y: number }; lair: { x: number; y: number } }

/** Where the guide's targets stand for `team` entering `region`: along the straight road from its entry to the home town. */
export function guideSpots(region: RegionData, team: number): GuideSpots {
  const entry = entrySpot(region, team), home = homeAnchor(region);
  const dx = home.x - entry.x, dy = home.y - entry.y, len = Math.hypot(dx, dy) || 1;
  const along = (d: number) => nearestOpen(region, entry.x + (dx / len) * Math.min(d, len * 0.6), entry.y + (dy / len) * Math.min(d, len * 0.6));
  return { entry, home, soul: along(GUIDE_SOUL.at), lair: along(GUIDE_LAIR.at) };
}

/** What the done-checks remember between snapshots (./hud/guide.ts keeps one per page). */
export interface GuideWatch {
  team: number;
  /** Own building ids standing when the guide began (they do not count as built by him). */
  had: Set<number>;
  /** Goods in his stores at the start (offline haul), -1 until the first snapshot. */
  stock0: number;
  /** The lair he is to beat (by where it stands; null: none in this region). */
  lair: { x: number; y: number } | null;
  /** Server notes and sim events that finished a step. */
  flags: Set<GuideStepId>;
}

export const newWatch = (team: number, lair: { x: number; y: number } | null): GuideWatch => ({ team, had: new Set(), stock0: -1, lair, flags: new Set() });

/** Sim events that finish a step: a soul claimed by a squad of his team. */
export function watchEvents(w: GuideWatch, s: Pick<Snapshot, 'squads'> | null, ev: readonly WarEvent[]): void {
  for (const e of ev) if (e.kind === 'soulClaimed' && s?.squads.find((q) => q.id === e.squad)?.team === w.team) w.flags.add('soul');
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
  const own = new Set(s.squads.filter((q) => q.team === w.team).map((q) => q.id));
  if (s.units.some((u) => own.has(u.squad) && u.state !== 'dead' && (u.carry === 'wood' || u.carry === 'stone') && (u.load ?? 0) > 0)) out.add('gather');
  if (w.lair) {
    const l = (s.lairs ?? []).find((x) => Math.hypot(x.x - w.lair!.x, x.y - w.lair!.y) < 0.5);
    if (l?.state === 'cleared') out.add('lair');
  }
  if ((s.buildings ?? []).some((b) => b.team === w.team && b.state === 'done' && !w.had.has(b.id))) out.add('build');
  if (goods(s, w.team) >= w.stock0 + HAUL_GOODS) out.add('haul');
  return out;
}
