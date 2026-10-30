/**
 * W-73 region mastery and the wild's solo deeds (docs/WAR.md "Wild fill, chiefs and hidden quests" › "Region mastery").
 * Shared by the server (server/src/war/mastery.ts: D1, the tallies, favour, the banner deed) and the HUD's mastery chip
 * (src/war/view/hud/mastery.ts; offline it keeps the progress itself from the local sim).
 *
 *  - A deed of the wild (wildDeeds, pure over a tick's snapshot and events): a lair turning cleared (every player with
 *    living men within MASTERY.near of it), a chief slain (every player of the slaying team with men within MASTERY.near
 *    of where he fell), a hidden quest done (its owner). They feed the solo tasks (lair, chief, secret) and mastery.
 *  - Mastery, per player and region: every lair the region was built with (RegionData.lairs: a respawning lair counts
 *    once, by its id), every chief among them (by chief id) and every hidden quest (hiddenStories). A quest's own
 *    lairs and chiefs (added later) feed the tasks only. All done: the region is mastered once, for MASTERY.favour divine
 *    favour, the banner deed on his men standing there (src/war/sim/deeds.ts masteryDeed) and a badge on the chip.
 */
import { hiddenStories } from '../../data/warStories';
import type { RegionData, Snapshot, WarEvent } from '../types';

export const MASTERY = {
  /** Tiles from a lair (or a fallen chief) within which a player's living men share the deed. */
  near: 20,
  /** Divine favour for mastering a region. */
  favour: 300,
} as const;

export type WildKind = 'lair' | 'chief' | 'secret';
/** One player's deed of the wild: `key` the lair id, the chief id or the hidden quest id. */
export interface WildDeed { pid: number; kind: WildKind; key: string }

/** What mastering a region takes: its own lairs (ids), chiefs (ids) and hidden quests (ids). Pure. */
export interface MasteryNeed { lairs: string[]; chiefs: string[]; secrets: string[] }
export function masteryNeed(r: RegionData): MasteryNeed {
  const lairs = r.lairs ?? [];
  return {
    lairs: lairs.map((_, i) => String(i)),
    chiefs: lairs.flatMap((l) => (l.chief ? [l.chief] : [])),
    secrets: hiddenStories(r).map((s) => s.id),
  };
}

/** A player's progress in a region (the `mastery` message, the chip): have / need of each, and mastered. */
export interface MasteryView { region: string; lairs: [number, number]; chiefs: [number, number]; secrets: [number, number]; done: boolean }
export function masteryView(region: string, need: MasteryNeed, have: Iterable<{ kind: WildKind; key: string }>): MasteryView {
  const got: Record<WildKind, Set<string>> = { lair: new Set(), chief: new Set(), secret: new Set() };
  for (const d of have) got[d.kind].add(d.key);
  const n = (k: WildKind, xs: string[]): [number, number] => [xs.filter((x) => got[k].has(x)).length, xs.length];
  const lairs = n('lair', need.lairs), chiefs = n('chief', need.chiefs), secrets = n('secret', need.secrets);
  const total = lairs[1] + chiefs[1] + secrets[1];
  return { region, lairs, chiefs, secrets, done: total > 0 && lairs[0] === lairs[1] && chiefs[0] === chiefs[1] && secrets[0] === secrets[1] };
}
/** Is this deed one mastery of the region counts. */
export const countsFor = (need: MasteryNeed, d: Pick<WildDeed, 'kind' | 'key'>): boolean =>
  (d.kind === 'lair' ? need.lairs : d.kind === 'chief' ? need.chiefs : need.secrets).includes(d.key);

const pidOf = (owner: string | undefined): number | null => {
  const m = /^p:(\d+)$/.exec(owner ?? '');
  return m ? Number(m[1]) : null;
};

/** Players with living fighters in the snapshot (pid: owner `p:<pid>`; offline `you` maps to `self`): team and men. */
function standing(s: Snapshot, self: number | null): Map<number, { team: number; men: { x: number; y: number }[] }> {
  const out = new Map<number, { team: number; men: { x: number; y: number }[] }>();
  for (const u of s.units) {
    if (u.state === 'dead' || u.wounded || u.cls.startsWith('civ_')) continue;
    const q = s.squads[u.squad];
    const pid = q ? pidOf(q.owner) ?? (self !== null && q.owner === 'you' ? self : null) : null;
    if (pid === null || !q) continue;
    const e = out.get(pid) ?? { team: q.team, men: [] };
    e.men.push({ x: u.x, y: u.y });
    out.set(pid, e);
  }
  return out;
}

/**
 * The tick's deeds of the wild. `seen`: each lair's state as last seen (kept by the caller, a lair counts on turning
 * cleared). `self`: offline, the pid of the local player (his squads' owner is `you`). Pure but for `seen`.
 */
export function wildDeeds(s: Snapshot, evs: readonly WarEvent[], seen: Map<number, string>, self: number | null = null): WildDeed[] {
  const out: WildDeed[] = [];
  let men: ReturnType<typeof standing> | null = null;
  const near = (x: number, y: number, team?: number) => {
    men ??= standing(s, self);
    return [...men].filter(([, e]) => (team === undefined || e.team === team) && e.men.some((m) => (m.x - x) ** 2 + (m.y - y) ** 2 <= MASTERY.near ** 2)).map(([pid]) => pid);
  };
  for (const l of s.lairs ?? []) {
    const was = seen.get(l.id);
    seen.set(l.id, l.state);
    if (was === undefined || was === 'cleared' || l.state !== 'cleared') continue;
    for (const pid of near(l.x, l.y)) out.push({ pid, kind: 'lair', key: String(l.id) });
  }
  for (const e of evs) {
    if (e.kind === 'chiefSlain' && e.by >= 0) for (const pid of near(e.x, e.y, e.by)) out.push({ pid, kind: 'chief', key: e.chief });
    if (e.kind === 'secret' && e.what === 'done') {
      const pid = pidOf(e.owner) ?? (self !== null && e.owner === 'you' ? self : null);
      if (pid !== null) out.push({ pid, kind: 'secret', key: e.quest });
    }
  }
  return out;
}
