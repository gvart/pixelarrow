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
 *  - Season (docs/WAR.md "Season score and victory"; src/war/world/season.ts): start and end, score per alliance accrued
 *    continuously at each region's hourly rate (piecewise: rates change only on a report, which accrues up to it
 *    first), the hegemony clock (Omphalos + 3 frontier towns held for 24 h ends the season early) and, at the end, the
 *    frozen result (`ended`); no more score after it. newSeason() is the reset hook: fresh owners and scores, next id.
 *  - M6h trade: a transit carries its men's packs and the cart they drove (`cargo`, kept in the world state: it
 *    survives a restart); a wagon travels CARGO_TRAVEL.wagon slower, loaded porters CARGO_TRAVEL.porter. A `haul`
 *    (`path`) chains the transfers on each arrival, offline too, retried while a leg is refused. Convoys are seen
 *    like squads, by alliances with men in or next to either end; Safe Roads (the merchant node): only by alliances
 *    with men at the destination. Trade score (addTrade) adds to the season score as it comes.
 */
import { ALLIANCES, WAR_SEASON } from '../../../../src/war/world/alliances';
import { edge, worldRegion } from '../../../../src/war/world/graph';
import { WORLD_REGIONS } from '../../../../src/war/world/regions';
import { allianceRates, FRONTIER_TOWNS, HEGEMONY, hegemon, HOUR_MS, LIVING, OMPHALOS } from '../../../../src/war/world/season';
import type { AllianceId, SeasonConfig, Side } from '../../../../src/war/world/types';
import type { AllianceStats, ConvoySnap, LandmarkWorld, RegionState, SeasonResult, SeasonSnap, TransferError, TransferOrder, TransitCargo, TransitSnap, WorldSnapshot } from '../../../../src/war/net/world';
import { loads as holdLoads } from '../../../../src/war/sim/holders';
import { adjacent } from '../../../../src/war/world/graph';

/** M6h: travel time factors with cargo (docs/WAR.md "Carts": wagon x1.5, loaded porters x1.2). */
export const CARGO_TRAVEL = { wagon: 1.5, porter: 1.2 };
/** A refused haul leg is tried again after this. */
export const HAUL_RETRY_MS = 30_000;

export function cargoLoads(c: TransitCargo | undefined): number {
  if (!c) return 0;
  const of = (b: { lots: { r: string; n: number; o: string }[]; items: unknown[] }) => holdLoads({ lots: b.lots as never, items: b.items as never });
  return Object.values(c.packs).reduce((a, p) => a + of(p), 0) + (c.cart ? of(c.cart) : 0);
}

function cargoGoods(c: TransitCargo | undefined): { goods: Record<string, number>; items: number } {
  const goods: Record<string, number> = {};
  let items = 0;
  for (const b of c ? [...Object.values(c.packs), ...(c.cart ? [c.cart] : [])] : []) {
    for (const l of b.lots) goods[l.r] = Math.round(((goods[l.r] ?? 0) + l.n) * 1000) / 1000;
    items += b.items.length;
  }
  return { goods, items };
}

/** The travel factor of a cargo: a wagon x1.5, else loaded packs x1.2. */
export function cargoFactor(c: TransitCargo | undefined): number {
  if (c?.cart?.type === 'wagon') return CARGO_TRAVEL.wagon;
  return cargoLoads(c) > 1e-9 ? CARGO_TRAVEL.porter : 1;
}

/** A haul leg waiting to be sent on (the last leg was refused: foes near, the room away). */
export interface Haul { pid: number; alliance: AllianceId; at: string; ids: string[]; path: string[]; retryAt: number; safe?: boolean }

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
  /** Hit points each man was down when he left (by person id; absent: whole). */
  lost?: Record<string, number>;
  /** Next arrival attempt (queued). */
  retryAt?: number;
  /** M6h: what it carries; the regions still to go (a haul); its owner's Safe Roads. */
  cargo?: TransitCargo;
  path?: string[];
  safe?: boolean;
}

export interface SeasonState {
  id: number;
  startAt: number;
  endAt: number;
  /** Score per alliance (fractional: accrued by the ms). */
  scores: number[];
  /** Score is accrued up to here. */
  accruedAt: number;
  hegemony: { alliance: AllianceId; since: number } | null;
  ended: SeasonResult | null;
  /** M6h: trade score per alliance (also in `scores`). */
  trade?: number[];
}

export interface WorldState {
  v: 2;
  seq: number;
  regions: Record<string, RegionState>;
  transit: Transit[];
  season: SeasonState;
  /** M6h: haul legs waiting to be sent on. */
  hauls?: Haul[];
}

/** What a region room tells the world (WarRoom.summary). */
export interface RegionReport {
  live: number[]; claims: number[]; channel: number[];
  /** M7f (WarRoom.summary): its landmark (back: minutes until its guardian returns), favour and prestige per alliance, a ruined town. */
  landmark?: { id: string; holder: number; guardian: 'alive' | 'slain' | 'away'; back?: number; state: LandmarkWorld['state']; hp: number; garrisoned: boolean };
  prestige?: number[];
  ruined?: boolean;
}

export type DepartResult = { ids: string[]; off: number; lost?: Record<string, number>; cargo?: TransitCargo } | { error: TransferError; detail?: string };
export type ArriveResult = { ok: true } | { error: 'full' | 'team' | 'squads' | 'gone' | 'unavailable' };

/** The region rooms as the world sees them (WarRegionDO RPC; fakes in tests). */
export interface Ports {
  /** `who`: the room squad id, or person ids. */
  depart(from: string, pid: number, who: number | string[], side: Side, to: string, foeRadius: number): Promise<DepartResult>;
  arrive(to: string, pid: number, alliance: AllianceId, ids: string[], side: Side, lost?: Record<string, number>, cargo?: TransitCargo): Promise<ArriveResult>;
}

const zeros = () => Array<number>(N).fill(0);

function freshRegion(id: string): RegionState {
  const r = worldRegion(id)!;
  return { id, owner: r.role === 'home' ? r.alliance! : -1, claims: zeros(), live: zeros(), contested: false, besieged: false };
}

const freshRegions = () => Object.fromEntries(WORLD_REGIONS.map((r) => [r.id, freshRegion(r.id)]));

export function freshSeason(id: number, now: number, cfg: SeasonConfig = WAR_SEASON): SeasonState {
  return { id, startAt: now, endAt: now + cfg.lengthMs, scores: zeros(), accruedAt: now, hegemony: null, ended: null };
}

export function freshWorld(now = Date.now(), cfg: SeasonConfig = WAR_SEASON): WorldState {
  return { v: 2, seq: 0, regions: freshRegions(), transit: [], season: freshSeason(cfg.id, now, cfg) };
}

export const snapOf = (t: Transit): TransitSnap => ({ id: t.id, from: t.from, to: t.to, men: t.men, departAt: t.departAt, arriveAt: t.arriveAt, state: t.state });

export class World {
  readonly st: WorldState;
  readonly season: SeasonConfig;

  constructor(st?: WorldState, season: SeasonConfig = WAR_SEASON) {
    this.st = st ?? freshWorld(Date.now(), season);
    this.season = season;
  }

  /** When the season ends as things stand: its end time, or sooner when hegemony runs out first. */
  seasonEndsAt(): number {
    const s = this.st.season;
    return s.hegemony ? Math.min(s.endAt, s.hegemony.since + HEGEMONY.ms) : s.endAt;
  }

  /**
   * Bring the season up to `now`: accrue score at the current rates (to the end at most) and end it when its time or
   * the hegemony clock ran out. Returns the result when it ended on this call.
   */
  advance(now: number): SeasonResult | null {
    const s = this.st.season;
    if (s.ended) return null;
    const end = this.seasonEndsAt(), to = Math.min(now, end);
    if (to > s.accruedAt) {
      const rates = allianceRates(Object.values(this.st.regions)), h = (to - s.accruedAt) / HOUR_MS;
      s.scores = s.scores.map((x, i) => x + rates[i] * h);
      s.accruedAt = to;
    }
    if (now < end) return null;
    const hegemony = s.hegemony && s.hegemony.since + HEGEMONY.ms <= s.endAt ? s.hegemony.alliance : null;
    const best = Math.max(...s.scores), top = s.scores.flatMap((x, i) => (x === best ? [i as AllianceId] : []));
    s.ended = { at: end, reason: hegemony !== null ? 'hegemony' : 'time', winner: hegemony ?? (top.length === 1 ? top[0] : null), scores: s.scores.map(Math.floor) };
    return s.ended;
  }

  /** Start or stop the hegemony clock after an ownership change. */
  private checkHegemony(now: number): void {
    const s = this.st.season;
    if (s.ended) return;
    const h = hegemon(Object.values(this.st.regions));
    if (h === null) s.hegemony = null;
    else if (s.hegemony?.alliance !== h) s.hegemony = { alliance: h, since: now };
  }

  /** The reset hook: the next season starts now with fresh owners and scores (squads on the road ride on). */
  newSeason(now: number): void {
    this.st.regions = freshRegions();
    this.st.season = freshSeason(this.st.season.id + 1, now, this.season);
  }

  region(id: string): RegionState | undefined {
    return this.st.regions[id];
  }

  /**
   * A region room's report. Returns whether an ownership change it implied was rejected (a home: W-09) and whether
   * anything the map shows changed.
   */
  report(id: string, rep: RegionReport, now = Date.now()): { rejected: boolean; changed: boolean; ended: SeasonResult | null } {
    const w = worldRegion(id), cur = this.st.regions[id];
    if (!w || !cur) return { rejected: false, changed: false, ended: null };
    // the old owners score up to now
    const ended = this.advance(now);
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
    // M7f: the landmark, favour and prestige, a ruined town (season score; the map's landmark icons)
    const lm = rep.landmark;
    if (lm) {
      next.landmark = {
        id: lm.id, holder: (lm.holder >= 0 && lm.holder < N ? lm.holder : -1) as AllianceId | -1, guardian: lm.guardian, state: lm.state, hp: lm.hp, garrisoned: lm.garrisoned,
        ...(lm.back !== undefined ? { backAt: now + lm.back * 60_000 } : {}),
      };
    }
    if (rep.prestige?.some((v) => v > 0)) next.prestige = Array.from({ length: N }, (_, i) => rep.prestige![i] ?? 0);
    if (rep.ruined) next.ruined = true;
    const changed = JSON.stringify(next) !== JSON.stringify(cur);
    this.st.regions[id] = next;
    if (changed) this.checkHegemony(now);
    return { rejected, changed: changed || ended !== null, ended };
  }

  /** M7f: alliance `a` razed a temple or shrine: LIVING.sacrilege off its score (after the season is brought up to now). */
  sacrilege(a: AllianceId, now: number): void {
    this.advance(now);
    const s = this.st.season;
    if (s.ended || a < 0 || a >= N) return;
    s.scores[a] -= LIVING.sacrilege;
  }

  /** M6h: trade score `pts` to alliance `a` (after the season is brought up to now). */
  addTrade(a: AllianceId, pts: number, now: number): void {
    this.advance(now);
    const s = this.st.season;
    if (s.ended || !(pts > 0)) return;
    s.scores[a] += pts;
    (s.trade ??= zeros())[a] += pts;
  }

  /** Start a transfer for player `pid` of `alliance` (`safe`: his convoy rides under Safe Roads). */
  async transfer(pid: number, alliance: AllianceId | null, o: TransferOrder, now: number, ports: Ports, safe = false): Promise<Transit | { error: TransferError; detail?: string }> {
    if (alliance === null) return { error: 'noAlliance', detail: 'join an alliance first' };
    if (!worldRegion(o.from) || !worldRegion(o.to)) return { error: 'region', detail: 'unknown region' };
    const e = edge(o.from, o.to);
    if (!e) return { error: 'notAdjacent', detail: `${o.from} does not border ${o.to}` };
    let out: DepartResult;
    try {
      out = await ports.depart(o.from, pid, o.ids ?? o.squad!, e.sideA, o.to, this.season.foeRadius);
    } catch {
      return { error: 'unavailable', detail: o.from };
    }
    if ('error' in out) return out;
    const ms = Math.round((e.ms * this.season.travelScale + out.off * this.season.offExitMsPerTile) * cargoFactor(out.cargo));
    const t: Transit = {
      id: ++this.st.seq, pid, alliance, from: o.from, to: o.to, side: e.sideB, ids: out.ids, ...(out.lost && Object.keys(out.lost).length ? { lost: out.lost } : {}), men: out.ids.length, departAt: now, arriveAt: now + ms, state: 'moving',
      ...(out.cargo ? { cargo: out.cargo } : {}), ...(o.path?.length ? { path: [...o.path] } : {}), ...(safe ? { safe } : {}),
    };
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
        r = await ports.arrive(t.to, t.pid, t.alliance, t.ids, t.side, t.lost, t.cargo);
      } catch {
        r = { error: 'unavailable' };
      }
      if ('ok' in r || r.error === 'gone') {
        this.st.transit = this.st.transit.filter((x) => x !== t);
        changed = true;
        // a haul: the next leg leaves at once (the player may be offline)
        if ('ok' in r && t.path?.length) (this.st.hauls ??= []).push({ pid: t.pid, alliance: t.alliance, at: t.to, ids: t.ids, path: t.path, retryAt: now, ...(t.safe ? { safe: true } : {}) });
        continue;
      }
      blocked.add(key);
      if (t.state !== 'queued') (t.state = 'queued'), (changed = true);
      t.retryAt = now + RETRY_MS;
    }
    // haul legs due: sent on, or tried again later
    for (const h of [...(this.st.hauls ?? [])]) {
      if (h.retryAt > now) continue;
      const out = await this.transfer(h.pid, h.alliance, { from: h.at, to: h.path[0], ids: h.ids, ...(h.path.length > 1 ? { path: h.path.slice(1) } : {}) }, now, ports, !!h.safe);
      if ('error' in out && out.error !== 'notOwner' && out.error !== 'notAdjacent' && out.error !== 'region') h.retryAt = now + HAUL_RETRY_MS;
      else this.st.hauls = this.st.hauls!.filter((x) => x !== h);
      changed = true;
    }
    return changed;
  }

  /** When the next arrival (or retry) is due; null with nobody on the road. */
  nextDue(): number | null {
    let at: number | null = null;
    for (const h of this.st.hauls ?? []) if (at === null || h.retryAt < at) at = h.retryAt;
    for (const t of this.st.transit) {
      const x = t.state === 'moving' ? t.arriveAt : (t.retryAt ?? t.arriveAt);
      if (at === null || x < at) at = x;
    }
    return at;
  }

  /** The world's next alarm: the next arrival or the season's end, whichever is first (null: neither). */
  nextAlarm(): number | null {
    const a = this.nextDue(), e = this.st.season.ended ? null : this.seasonEndsAt();
    return a === null ? e : e === null ? a : Math.min(a, e);
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
      season: this.st.season.id, score: this.seasonSnap(now), at: now, you: { id: pid, alliance }, alliances, regions,
      transit: this.st.transit.filter((t) => t.pid === pid).map(snapOf),
      convoys: this.convoys(pid, alliance),
      boards: {},
    };
  }

  /**
   * M6h: the transits the player's alliance sees, with their cargo: its own always; another's while the alliance has
   * men in or next to either end (Safe Roads: only at the destination).
   */
  convoys(pid: number, alliance: AllianceId | null): ConvoySnap[] {
    const here = (id: string) => alliance !== null && (this.st.regions[id]?.live[alliance] ?? 0) > 0;
    const near = (id: string) => here(id) || Object.values(this.st.regions).some((r) => r.id !== id && adjacent(r.id, id) && alliance !== null && (r.live[alliance] ?? 0) > 0);
    return this.st.transit
      .filter((t) => t.pid === pid || t.alliance === alliance || (t.safe ? here(t.to) : near(t.from) || near(t.to)))
      .map((t) => ({ ...snapOf(t), alliance: t.alliance, ...(t.cargo?.cart ? { cart: t.cargo.cart.type } : {}), loads: Math.round(cargoLoads(t.cargo) * 100) / 100, ...cargoGoods(t.cargo), mine: t.pid === pid }));
  }

  /** The season as the map shows it, accrued (for display only) up to `now`. */
  seasonSnap(now: number): SeasonSnap {
    const s = this.st.season, regions = Object.values(this.st.regions), rates = allianceRates(regions);
    const end = this.seasonEndsAt(), to = s.ended ? s.accruedAt : Math.max(s.accruedAt, Math.min(now, end));
    const h = (to - s.accruedAt) / HOUR_MS;
    const owner = (id: string) => (this.st.regions[id]?.owner ?? -1) as AllianceId | -1;
    return {
      id: s.id, startAt: s.startAt, endAt: s.endAt, left: s.ended ? 0 : Math.max(0, end - now),
      scores: s.ended ? [...s.ended.scores] : s.scores.map((x, i) => Math.floor(x + rates[i] * h)), rates,
      omphalos: owner(OMPHALOS), towns: Object.fromEntries(FRONTIER_TOWNS.map((t) => [t, owner(t)])),
      hegemony: s.hegemony && !s.ended ? { ...s.hegemony, endsAt: s.hegemony.since + HEGEMONY.ms } : null,
      ended: s.ended,
      trade: (s.trade ?? zeros()).map(Math.floor),
    };
  }
}
