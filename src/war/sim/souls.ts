/**
 * W-60 souls (docs/WAR.md "Souls"): recruiting is gone; the newly dead wake on Metaxy and wait to be claimed. A soul
 * appears at a shrine or temple, a ruin, an old battlefield (where SOUL.field men fell close together) or a lair; where
 * he wakes decides his class, and danger his worth: lairs and deeper regions give higher levels, and lair souls are the
 * rarest. A squad ordered to him (claimSoul) and standing within SOUL.reach claims him over SOUL.channel ticks; he joins
 * only while the owner has fewer than ARMY_MAX men (the gate), else the claim is refused and he waits on. More than one
 * side at him stalls the claim (contested); the wild's men at him with no claimer take him (lost). Unclaimed, he fades
 * after SOUL.life ticks. Deterministic: its own Rng (seeded from the sim seed), fixed iteration order.
 */
import { Rng } from '../../sim/rng';
import type { RegionData, SoulSnap, WarEvent, WarPerson } from '../types';
import { depthOf } from './depth';
import { MOB_TEAM } from './mobs';

export type SoulSite = SoulSnap['site'];

export const SOUL = {
  /** Ticks between spawn rolls (2 min). */
  every: 1200,
  /** Chance a site wakes a soul on a roll. */
  chance: { shrine: 0.12, ruin: 0.08, battlefield: 0.2, lair: 0.05 } as Record<SoulSite, number>,
  /** Souls in a region at once. */
  max: 4,
  /** Ticks a soul waits before he fades (10 min); the view fades him over the last `fade`. */
  life: 6000,
  fade: 600,
  /** Claim: reach in tiles, channel in ticks (3 s). */
  reach: 2.5,
  channel: 30,
  /** Ticks between claim checks. */
  scan: 5,
  /** Falls within one `cell` x `cell` tile cell that make an old battlefield; most battlefields a region keeps. */
  field: 6,
  cell: 12,
  fields: 6,
  /** Ruins a region offers as sites (spaced `spacing` tiles apart). */
  ruins: 4,
  spacing: 16,
  /** W-62 soul storm (setStorm): souls at once while it blows; rolls come twice as often. */
  stormMax: 10,
};

/** The classes a site wakes, by kind (the six with war sprites). */
export const SOUL_CLASSES: Record<SoulSite, readonly string[]> = {
  shrine: ['hoplite', 'archer', 'militia'],
  ruin: ['militia', 'slinger', 'javelineer'],
  battlefield: ['hoplite', 'celt_sword', 'archer', 'javelineer'],
  lair: ['celt_sword', 'hoplite', 'archer'],
};
/** Base level by site; + half the region's depth (rounded down), at most SOUL_LEVEL_MAX. */
export const SOUL_LEVEL: Record<SoulSite, number> = { shrine: 1, ruin: 1, battlefield: 2, lair: 3 };
export const SOUL_LEVEL_MAX = 6;
const START = new Set(['militia', 'hoplite', 'celt_sword', 'archer', 'slinger', 'javelineer']);

/** The level a soul of `site` wakes at in a region of `depth`. */
export const soulLevel = (site: SoulSite, depth: number): number => Math.min(SOUL_LEVEL_MAX, SOUL_LEVEL[site] + Math.floor(depth / 2));

export interface Soul { id: number; x: number; y: number; cls: string; level: number; site: SoulSite; until: number; prog: number; team: number; contested: boolean; at: number }
interface Site { kind: SoulSite; x: number; y: number }
interface Cell { n: number; x: number; y: number; by: Record<string, number>; site: number }

/** A living man as the souls see him: his team, squad, the soul his squad is ordered to claim (-1 none), owner, civilian. */
export interface SoulMan { x: number; y: number; team: number; squad: number; claim: number; owner: string; civ: boolean }
export interface SoulHost {
  men(): Iterable<SoulMan>;
  /** May `owner` take one more man (and how many he has). */
  gate(owner: string): { ok: boolean; have: number };
  /** The soul joins squad `squad` (a new man): his unit and person; null when he cannot (the squad is gone). */
  join(s: Soul, squad: number): { unit: number; person: WarPerson } | null;
  /** `owner`'s squads give up their claim on soul `soul` (refused). */
  stop(owner: string, soul: number): void;
  emit(e: WarEvent): void;
  /** W-61: a soul-chance multiplier at (x,y) (a levelled town's ground); default 1. */
  chanceAt?(x: number, y: number): number;
}

/** The fixed sites of a region: its shrines and temples, a few spaced ruins, its lairs. */
export function soulSites(region: RegionData): Site[] {
  const out: Site[] = [];
  for (const e of region.prebuilt ?? []) if ((e.type === 'shrine' || e.type === 'temple') && e.state !== 'ruined') out.push({ kind: 'shrine', x: e.x, y: e.y });
  const ruins: Site[] = [];
  for (const e of region.prebuilt ?? []) {
    if (e.state !== 'ruined' || ruins.length >= SOUL.ruins) continue;
    if (ruins.some((r) => (r.x - e.x) ** 2 + (r.y - e.y) ** 2 < SOUL.spacing ** 2)) continue;
    ruins.push({ kind: 'ruin', x: e.x, y: e.y });
  }
  out.push(...ruins);
  for (const l of region.lairs ?? []) out.push({ kind: 'lair', x: l.x, y: l.y });
  return out;
}

export function createSouls(region: RegionData, seed: number, host: SoulHost) {
  const depth = depthOf(region);
  const fixed = soulSites(region);
  let rng = new Rng((seed ^ 0x5017) >>> 0);
  let list: Soul[] = [];
  let next = 0;
  /** Old battlefields found so far (sites after the fixed ones) and the falls per cell. */
  let fields: Site[] = [];
  let cells = new Map<number, Cell>();
  /** W-62: the soul storm's chance multiplier (1: none). */
  let storm = 1;

  const sites = () => (fields.length ? [...fixed, ...fields] : fixed);
  const make = (x: number, y: number, cls: string, level: number, site: SoulSite, t: number, at = -1): Soul => {
    const s: Soul = { id: next++, x, y, cls, level, site, until: t + SOUL.life, prog: 0, team: -1, contested: false, at };
    list.push(s);
    return s;
  };
  const pick = (site: Site, i: number): string => {
    if (site.kind === 'battlefield') {
      // the class most of the fallen there were
      const c = [...cells.values()].find((x) => x.site === i);
      const best = c && Object.entries(c.by).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      if (best) return best[0];
    }
    const pool = SOUL_CLASSES[site.kind];
    return pool[Math.floor(rng.next() * pool.length)];
  };
  const roll = (t: number) => {
    const all = sites();
    const max = storm > 1 ? SOUL.stormMax : SOUL.max;
    for (let i = 0; i < all.length && list.length < max; i++) {
      // a storm wakes more than one soul at a site (offset round it)
      const at = list.filter((s) => s.at === i).length;
      if (at >= (storm > 1 ? 2 : 1)) continue;
      const site = all[i];
      if (rng.next() >= SOUL.chance[site.kind] * storm * (host.chanceAt?.(site.x, site.y) ?? 1)) continue;
      make(site.x + (at ? 1.5 : 0), site.y + (at ? 1 : 0), pick(site, i), soulLevel(site.kind, depth), site.kind, t, i);
    }
  };
  const claim = (s: Soul, t: number): boolean => {
    let mob = false;
    const by = new Map<number, number>(); // team -> its first claiming squad
    for (const m of host.men()) {
      if ((m.x - s.x) ** 2 + (m.y - s.y) ** 2 > SOUL.reach * SOUL.reach) continue;
      if (m.team === MOB_TEAM) mob = true;
      else if (m.claim === s.id && !m.civ) {
        const q = by.get(m.team);
        if (q === undefined || m.squad < q) by.set(m.team, m.squad);
      }
    }
    // the wild at him with no claimer takes him; a claimer at him keeps the wild off (contested)
    const sides = by.size + (mob ? 1 : 0);
    s.contested = sides > 1;
    if (sides === 0) {
      s.prog = Math.max(0, s.prog - SOUL.scan);
      if (s.prog === 0) s.team = -1;
      return false;
    }
    if (sides > 1) return false;
    const team = mob ? MOB_TEAM : [...by.keys()][0];
    if (team !== s.team) (s.team = team), (s.prog = 0);
    s.prog += SOUL.scan;
    if (s.prog < SOUL.channel) return false;
    if (mob) {
      host.emit({ t, kind: 'soulLost', soul: s.id, team: MOB_TEAM });
      return true;
    }
    const squad = by.get(team)!;
    let owner = '';
    for (const m of host.men()) if (m.squad === squad) { owner = m.owner; break; }
    const g = host.gate(owner);
    if (!g.ok) {
      host.emit({ t, kind: 'soulRefused', soul: s.id, squad, owner, have: g.have });
      host.stop(owner, s.id);
      s.prog = 0;
      s.team = -1;
      return false;
    }
    const j = host.join(s, squad);
    if (!j) return false;
    host.emit({ t, kind: 'soulClaimed', soul: s.id, squad, owner, unit: j.unit, person: j.person });
    return true;
  };

  return {
    /** Every tick: rolls on SOUL.every, claims and fading on SOUL.scan. */
    tick(t: number) {
      if (t > 0 && t % (storm > 1 ? SOUL.every / 2 : SOUL.every) === 0) roll(t);
      if (t % SOUL.scan !== 0 || !list.length) return;
      list = list.filter((s) => {
        if (s.until <= t) {
          host.emit({ t, kind: 'soulFaded', soul: s.id });
          return false;
        }
        return !claim(s, t);
      });
    },
    /** A man of a player fell at (x,y): enough falls in one cell make it an old battlefield. */
    fell(x: number, y: number, cls: string) {
      const k = Math.floor(y / SOUL.cell) * 4096 + Math.floor(x / SOUL.cell);
      let c = cells.get(k);
      if (!c) cells.set(k, (c = { n: 0, x: 0, y: 0, by: {}, site: -1 }));
      c.n++;
      c.x += x;
      c.y += y;
      if (START.has(cls)) c.by[cls] = (c.by[cls] ?? 0) + 1;
      if (c.n === SOUL.field && fields.length < SOUL.fields) {
        c.site = fixed.length + fields.length;
        fields.push({ kind: 'battlefield', x: c.x / c.n, y: c.y / c.n });
      }
    },
    spawn(x: number, y: number, cls: string, level: number, site: SoulSite, t: number): number {
      return make(x, y, cls, level, site, t).id;
    },
    get(id: number): Soul | undefined {
      return list.find((s) => s.id === id);
    },
    snaps(t: number): SoulSnap[] {
      return list.map((s) => ({
        id: s.id, x: s.x, y: s.y, cls: s.cls, level: s.level, site: s.site, left: Math.max(0, s.until - t),
        ...(s.prog > 0 ? { claim: Math.min(1, s.prog / SOUL.channel), team: s.team } : {}),
        ...(s.contested ? { contested: true as const } : {}),
      }));
    },
    any: () => list.length > 0,
    /** W-62 soul storm: chance x k (1: calm). */
    setStorm(k: number) {
      storm = Math.max(1, k);
    },
    sites: () => sites().map((s) => ({ ...s })),
    saveRoot: () => ({ list, next, fields, cells, rng }),
    loadRoot(o: { list: Soul[]; next: number; fields: Site[]; cells: Map<number, Cell>; rng: Rng }) {
      ({ list, next, fields, cells, rng } = o);
    },
  };
}
export type Souls = ReturnType<typeof createSouls>;
