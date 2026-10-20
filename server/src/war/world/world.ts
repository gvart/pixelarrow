/**
 * World: the strategic layer's state and rules (M4; W-02, W-03, W-06, W-09), free of Durable Object APIs so tests drive
 * it directly. WarWorldDO (./worldDO.ts) owns the one instance, keeps its state in DO storage and wires the region
 * rooms in as `Ports`.
 *
 *  - Regions: owner, claim points and live men per alliance, as the region rooms report them (report). Owner: the
 *    alliance with strictly the most claim points; on a tie the owner stays. A home always belongs to its alliance
 *    (W-09): a foreign claim or foes there only mark it besieged, the change is rejected. Entries keep their no-build
 *    band whoever holds them (it is region data, the world never touches it).
 *  - Transfers (src/war/net/world.ts): a squad leaves `from` for an adjacent `to` (Ports.depart: the room checks it is
 *    the player's and no foe is near, and takes it off the field); it travels for the border's time, scaled by the
 *    season, plus the off-exit penalty; then Ports.arrive puts it on `to`'s entry facing `from`. While the alliance's
 *    quota there is full it waits (queued) and is retried every RETRY_MS, first come first served per region and
 *    alliance.
 */
import { ALLIANCES, WAR_SEASON } from '../../../../src/war/world/alliances';
import { edge, worldRegion } from '../../../../src/war/world/graph';
import { WORLD_REGIONS } from '../../../../src/war/world/regions';
import type { AllianceId, SeasonConfig, Side } from '../../../../src/war/world/types';
import type { AllianceStats, RegionState, TransferError, TransferOrder, TransitSnap, WorldSnapshot } from '../../../../src/war/net/world';

/** The WarWorldDO's name: there is one. */
export const WORLD_NAME = 'world';
/** A queued arrival is tried again after this. */
export const RETRY_MS = 5_000;
const N = ALLIANCES.length;

export interface Transit extends TransitSnap {
  pid: number;
  alliance: AllianceId;
  /** Entry side of `to` the squad comes in by. */
  side: Side;
  /** Person ids. */
  ids: string[];
  /** Next arrival attempt (queued). */
  retryAt?: number;
}

export interface WorldState {
  v: 1;
  seq: number;
  regions: Record<string, RegionState>;
  transit: Transit[];
}

/** What a region room tells the world (WarRoom.summary). */
export interface RegionReport { live: number[]; claims: number[]; channel: number[] }

export type DepartResult = { ids: string[]; off: number } | { error: TransferError; detail?: string };
export type ArriveResult = { ok: true } | { error: 'full' | 'team' | 'squads' | 'gone' | 'unavailable' };

/** The region rooms as the world sees them (WarRegionDO RPC; fakes in tests). */
export interface Ports {
  depart(from: string, pid: number, squad: number, side: Side, to: string, foeRadius: number): Promise<DepartResult>;
  arrive(to: string, pid: number, alliance: AllianceId, ids: string[], side: Side): Promise<ArriveResult>;
}

const zeros = () => Array<number>(N).fill(0);

function freshRegion(id: string): RegionState {
  const r = worldRegion(id)!;
  return { id, owner: r.role === 'home' ? r.alliance! : -1, claims: zeros(), live: zeros(), contested: false, besieged: false };
}

export function freshWorld(): WorldState {
  return { v: 1, seq: 0, regions: Object.fromEntries(WORLD_REGIONS.map((r) => [r.id, freshRegion(r.id)])), transit: [] };
}

export const snapOf = (t: Transit): TransitSnap => ({ id: t.id, from: t.from, to: t.to, men: t.men, departAt: t.departAt, arriveAt: t.arriveAt, state: t.state });

export class World {
  readonly st: WorldState;
  readonly season: SeasonConfig;

  constructor(st: WorldState = freshWorld(), season: SeasonConfig = WAR_SEASON) {
    this.st = st;
    this.season = season;
  }

  region(id: string): RegionState | undefined {
    return this.st.regions[id];
  }

  /**
   * A region room's report. Returns whether an ownership change it implied was rejected (a home: W-09) and whether
   * anything the map shows changed.
   */
  report(id: string, rep: RegionReport): { rejected: boolean; changed: boolean } {
    const w = worldRegion(id), cur = this.st.regions[id];
    if (!w || !cur) return { rejected: false, changed: false };
    const claims = Array.from({ length: N }, (_, i) => rep.claims[i] ?? 0), live = Array.from({ length: N }, (_, i) => rep.live[i] ?? 0);
    const best = Math.max(...claims), leaders = claims.flatMap((n, i) => (n === best && n > 0 ? [i as AllianceId] : []));
    const leader = leaders.length === 1 ? leaders[0] : null;
    let owner = cur.owner, rejected = false;
    if (w.role === 'home') {
      owner = w.alliance!;
      rejected = leader !== null && leader !== owner;
    } else if (leader !== null) owner = leader;
    const present = live.flatMap((n, i) => (n > 0 ? [i] : []));
    const foes = present.filter((a) => a !== owner);
    const claiming = rep.channel.some((n, i) => n > 0 && i !== owner);
    const contested = owner >= 0 ? foes.length > 0 || claiming : present.length >= 2;
    const besieged = w.role === 'home' && (foes.length > 0 || claiming || claims.some((n, i) => n > 0 && i !== owner));
    const next: RegionState = { id, owner, claims, live, contested, besieged };
    const changed = JSON.stringify(next) !== JSON.stringify(cur);
    this.st.regions[id] = next;
    return { rejected, changed };
  }

  /** Start a transfer for player `pid` of `alliance`. */
  async transfer(pid: number, alliance: AllianceId | null, o: TransferOrder, now: number, ports: Ports): Promise<Transit | { error: TransferError; detail?: string }> {
    if (alliance === null) return { error: 'noAlliance', detail: 'join an alliance first' };
    if (!worldRegion(o.from) || !worldRegion(o.to)) return { error: 'region', detail: 'unknown region' };
    const e = edge(o.from, o.to);
    if (!e) return { error: 'notAdjacent', detail: `${o.from} does not border ${o.to}` };
    let out: DepartResult;
    try {
      out = await ports.depart(o.from, pid, o.squad, e.sideA, o.to, this.season.foeRadius);
    } catch {
      return { error: 'unavailable', detail: o.from };
    }
    if ('error' in out) return out;
    const ms = Math.round(e.ms * this.season.travelScale + out.off * this.season.offExitMsPerTile);
    const t: Transit = { id: ++this.st.seq, pid, alliance, from: o.from, to: o.to, side: e.sideB, ids: out.ids, men: out.ids.length, departAt: now, arriveAt: now + ms, state: 'moving' };
    this.st.transit.push(t);
    return t;
  }

  /**
   * Arrivals due at `now`, oldest first. A full region keeps the rest of its alliance's line waiting behind the first
   * refused. Returns whether anything changed.
   */
  async due(now: number, ports: Ports): Promise<boolean> {
    let changed = false;
    const keyOf = (t: Transit) => `${t.to}|${t.alliance}`;
    const isDue = (t: Transit) => (t.state === 'moving' ? t.arriveAt : (t.retryAt ?? 0)) <= now;
    // a line still waiting for its retry holds back newcomers to the same region and alliance
    const blocked = new Set(this.st.transit.filter((t) => t.state === 'queued' && !isDue(t)).map(keyOf));
    const due = this.st.transit.filter(isDue).sort((a, b) => a.arriveAt - b.arriveAt || a.id - b.id);
    for (const t of due) {
      const key = keyOf(t);
      if (blocked.has(key)) {
        if (t.state !== 'queued') (t.state = 'queued'), (changed = true);
        t.retryAt = now + RETRY_MS;
        continue;
      }
      let r: ArriveResult;
      try {
        r = await ports.arrive(t.to, t.pid, t.alliance, t.ids, t.side);
      } catch {
        r = { error: 'unavailable' };
      }
      if ('ok' in r || r.error === 'gone') {
        this.st.transit = this.st.transit.filter((x) => x !== t);
        changed = true;
        continue;
      }
      blocked.add(key);
      if (t.state !== 'queued') (t.state = 'queued'), (changed = true);
      t.retryAt = now + RETRY_MS;
    }
    return changed;
  }

  /** When the next arrival (or retry) is due; null with nobody on the road. */
  nextDue(): number | null {
    let at: number | null = null;
    for (const t of this.st.transit) {
      const x = t.state === 'moving' ? t.arriveAt : (t.retryAt ?? t.arriveAt);
      if (at === null || x < at) at = x;
    }
    return at;
  }

  /** Person ids on the road or waiting (D1 recovery: anyone marked in transit and not here goes home). */
  personsInTransit(): Set<string> {
    return new Set(this.st.transit.flatMap((t) => t.ids));
  }

  snapshot(pid: number, alliance: AllianceId | null, members: { members: number[]; clans: number[] }, now: number): WorldSnapshot {
    const regions = Object.values(this.st.regions);
    const alliances: AllianceStats[] = ALLIANCES.map((a) => ({
      id: a.id,
      members: members.members[a.id] ?? 0,
      clans: members.clans[a.id] ?? 0,
      regions: regions.filter((r) => r.owner === a.id).length,
      soldiers: regions.reduce((s, r) => s + (r.live[a.id] ?? 0), 0),
      inTransit: this.st.transit.filter((t) => t.alliance === a.id).reduce((s, t) => s + t.men, 0),
    }));
    return {
      season: this.season.id, at: now, you: { id: pid, alliance }, alliances, regions,
      transit: this.st.transit.filter((t) => t.pid === pid).map(snapOf),
    };
  }
}
