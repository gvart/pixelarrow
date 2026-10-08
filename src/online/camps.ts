/**
 * Online camp plots (docs/MAP_V3.md "Camp", rules in ./rules.ts CAMP_*):
 * the state of a camp's buildings over time (lazy construction timers), the
 * effects of the buildings (income, sight, garrison and militia), the checks
 * of a build / upgrade / claim shared by the server (which decides) and the
 * camp panel (which explains), and the views the API answers with.
 * Pure TS: no Phaser, DOM or clocks.
 */
import {
  CAMP_BUILDING_IDS,
  CAMP_RULES,
  ONLINE_RULES,
  PALISADE,
  RESOURCE_KEYS,
  WATCHTOWER_SIGHT,
  campBuildingIncome,
  campLevelCost,
  campSlots,
  canAfford,
  type CampBuildingId,
  type Resources,
} from './rules';

/** A stored building: `level` is the level it has or is being raised to, reached at `doneAt`. */
export interface CampBuildingState {
  slot: number;
  kind: CampBuildingId;
  level: number;
  doneAt: number;
}

/** The level a building works at now (the one under construction does not count yet). */
export function effectiveLevel(b: Pick<CampBuildingState, 'level' | 'doneAt'>, now: number): number {
  return b.doneAt <= now ? b.level : b.level - 1;
}

/** The building under construction in a camp (one at a time), if any. */
export function underConstruction<T extends Pick<CampBuildingState, 'doneAt'>>(list: readonly T[], now: number): T | null {
  return list.find((b) => b.doneAt > now) ?? null;
}

/** Level of a kind of building in a camp now (0: none). */
export function levelOf(list: readonly CampBuildingState[], kind: CampBuildingId, now: number): number {
  const b = list.find((x) => x.kind === kind);
  return b ? Math.max(0, effectiveLevel(b, now)) : 0;
}

/** Hourly income of a camp's buildings now. */
export function campRate(list: readonly CampBuildingState[], now: number): Resources {
  const out: Resources = { gold: 0, food: 0, wood: 0, bronze: 0, recruits: 0 };
  for (const b of list) {
    const inc = campBuildingIncome(b.kind, effectiveLevel(b, now));
    for (const k of RESOURCE_KEYS) out[k] += inc[k];
  }
  return out;
}

/**
 * Income of a camp's buildings accrued since `accruedAt` (the region's
 * accrual time), capped like region income (incomeCapHours). A building
 * finished meanwhile pays its old level until `doneAt`, its new one after.
 * Whole numbers except recruits (like accruedIncome).
 */
export function campAccrued(list: readonly CampBuildingState[], accruedAt: number, now: number): Resources {
  const from = Math.max(accruedAt, now - ONLINE_RULES.incomeCapHours * 3_600_000);
  const out: Resources = { gold: 0, food: 0, wood: 0, bronze: 0, recruits: 0 };
  if (now <= from) return out;
  for (const b of list) {
    const split = Math.max(from, Math.min(now, b.doneAt));
    const before = campBuildingIncome(b.kind, b.level - 1);
    const after = campBuildingIncome(b.kind, b.level);
    const h0 = (split - from) / 3_600_000;
    const h1 = (now - split) / 3_600_000;
    for (const k of RESOURCE_KEYS) out[k] += before[k] * h0 + after[k] * h1;
  }
  for (const k of RESOURCE_KEYS) out[k] = k === 'recruits' ? Math.floor(out[k] * 100) / 100 : Math.floor(out[k]);
  return out;
}

/** Extra sight (routes) from this camp's watchtower now. */
export function towerSight(list: readonly CampBuildingState[], now: number): number {
  return WATCHTOWER_SIGHT[levelOf(list, 'watchtower', now)] ?? 0;
}

/** Garrison places of a region with this camp (ONLINE_RULES.maxGarrison + palisade). */
export function garrisonCap(list: readonly CampBuildingState[], now: number): number {
  return ONLINE_RULES.maxGarrison + (PALISADE.garrison[levelOf(list, 'palisade', now)] ?? 0);
}

/** Extra militia men behind this camp's palisade. */
export function militiaBonus(list: readonly CampBuildingState[], now: number): number {
  return PALISADE.militia[levelOf(list, 'palisade', now)] ?? 0;
}

// ------------------------------------------------------------------ checks

/** Why a camp action cannot be taken (i18n key suffix: ocamp.why.<reason>). */
export type CampReason =
  | 'notCamp'
  | 'badSlot'
  | 'slotTaken'
  | 'built'
  | 'notBuilt'
  | 'busy'
  | 'maxLevel'
  | 'funds'
  | 'notYours'
  | 'notPlot'
  | 'isCamp'
  | 'limit'
  | 'notHere'
  | 'resting';

export type CampCheck = { ok: true; level: number; cost: Resources; minutes: number } | { ok: false; reason: CampReason };

/**
 * Can `kind` be built on `slot` of a camp (a new building, level 1), or the
 * existing one of that kind raised a level (`slot` omitted or its own)?
 */
export function checkBuild(
  camp: { home: boolean; buildings: readonly CampBuildingState[] },
  kind: CampBuildingId,
  slot: number | null,
  have: Resources,
  now: number,
): CampCheck {
  if (!CAMP_BUILDING_IDS.includes(kind)) return { ok: false, reason: 'notBuilt' };
  const existing = camp.buildings.find((b) => b.kind === kind);
  let level: number;
  if (existing) {
    if (slot !== null && slot !== existing.slot) return { ok: false, reason: 'built' };
    if (existing.level >= CAMP_RULES.maxLevel) return { ok: false, reason: 'maxLevel' };
    level = existing.level + 1;
  } else {
    if (slot === null || !Number.isInteger(slot) || slot < 0 || slot >= campSlots(camp.home)) return { ok: false, reason: 'badSlot' };
    if (camp.buildings.some((b) => b.slot === slot)) return { ok: false, reason: 'slotTaken' };
    level = 1;
  }
  if (underConstruction(camp.buildings, now)) return { ok: false, reason: 'busy' };
  const c = campLevelCost(kind, level);
  if (!canAfford(have, c.cost)) return { ok: false, reason: 'funds' };
  return { ok: true, level, cost: c.cost, minutes: c.minutes };
}

/** Can a forward camp be made on this region? */
export function checkClaim(i: {
  campPlot: boolean;
  mine: boolean;
  isCamp: boolean;
  forward: number;
  armyHere: boolean;
  have: Resources;
}): { ok: true } | { ok: false; reason: CampReason } {
  if (i.isCamp) return { ok: false, reason: 'isCamp' };
  if (!i.campPlot) return { ok: false, reason: 'notPlot' };
  if (!i.mine) return { ok: false, reason: 'notYours' };
  if (i.forward >= CAMP_RULES.maxForward) return { ok: false, reason: 'limit' };
  if (!i.armyHere) return { ok: false, reason: 'notHere' };
  if (!canAfford(i.have, CAMP_RULES.claimCost)) return { ok: false, reason: 'funds' };
  return { ok: true };
}

/** When a camp may be rested at next (null: now). */
export function restReadyAt(restedAt: number | null, now: number): number | null {
  if (restedAt === null) return null;
  const at = restedAt + CAMP_RULES.restCooldownMs;
  return at > now ? at : null;
}

// ------------------------------------------------------------------ views

export interface CampBuildingView {
  slot: number;
  kind: CampBuildingId;
  /** Level it works at now. */
  level: number;
  /** Level being built (null: idle) and when it is done. */
  building: number | null;
  doneAt: number | null;
}

export interface CampView {
  loc: number;
  home: boolean;
  /** Usable slots of the grid (CAMP_RULES.cols x rows). */
  slots: number;
  buildings: CampBuildingView[];
  /** Hourly income of the buildings now. */
  income: Resources;
  /** Extra sight (routes) from the watchtower. */
  sight: number;
  garrisonCap: number;
  militia: number;
  /** The next rest is possible from (null: now). */
  restAt: number | null;
}

/** GET /api/online/camps. */
export interface CampsView {
  now: number;
  camps: CampView[];
  /** Your camp plots that could become a forward camp. */
  claimable: number[];
  forward: { n: number; max: number };
  resources: Resources;
  army: { loc: number; marching: boolean };
}

/** A camp on the map (GET /map `camps`, the camps in sight). */
export interface CampMarker {
  loc: number;
  owner: number;
  home: boolean;
  /** Buildings standing (finished levels > 0). */
  buildings: number;
}

/** Shape passed to WorldMapView.setCampPlots: camp plots and camps in sight. */
export interface CampPlotMarker {
  loc: number;
  /** A camp stands here (else an unclaimed camp plot). */
  camp: boolean;
  owner: number | null;
  mine: boolean;
  home: boolean;
  /** Your camp plot that can be made a camp now-ish (the "active" checker). */
  claimable: boolean;
}

export function campView(c: { loc: number; home: boolean; restedAt: number | null; buildings: readonly CampBuildingState[] }, now: number): CampView {
  return {
    loc: c.loc,
    home: c.home,
    slots: campSlots(c.home),
    buildings: [...c.buildings]
      .sort((a, b) => a.slot - b.slot)
      .map((b) => {
        const busy = b.doneAt > now;
        return { slot: b.slot, kind: b.kind, level: effectiveLevel(b, now), building: busy ? b.level : null, doneAt: busy ? b.doneAt : null };
      }),
    income: campRate(c.buildings, now),
    sight: towerSight(c.buildings, now),
    garrisonCap: garrisonCap(c.buildings, now),
    militia: militiaBonus(c.buildings, now),
    restAt: restReadyAt(c.restedAt, now),
  };
}

/** Back from a view to stored states (the panel's checks run on views). */
export function statesOf(v: Pick<CampView, 'buildings'>): CampBuildingState[] {
  return v.buildings.map((b) => ({ slot: b.slot, kind: b.kind, level: b.building ?? b.level, doneAt: b.doneAt ?? 0 }));
}

/** The markers for the map renderer: camps in sight plus your own claimable plots. */
export function campPlotMarkers(
  world: { info(id: number): { campPlot: boolean }; has(id: number): boolean },
  regions: readonly { loc: number; owner: number | null }[],
  camps: readonly CampMarker[],
  me: number,
  forward: number,
): CampPlotMarker[] {
  const at = new Map(camps.map((c) => [c.loc, c]));
  const out: CampPlotMarker[] = [];
  for (const r of regions) {
    const c = at.get(r.loc);
    const plot = world.has(r.loc) && world.info(r.loc).campPlot;
    if (!c && !plot) continue;
    out.push({
      loc: r.loc,
      camp: !!c,
      owner: c?.owner ?? r.owner,
      mine: (c?.owner ?? r.owner) === me,
      home: !!c?.home,
      claimable: !c && plot && r.owner === me && forward < CAMP_RULES.maxForward,
    });
  }
  return out;
}
