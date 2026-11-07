/**
 * The local room store (docs/impl/godot-port.md P8 wave A, G-09): what the region Durable Object keeps in D1 for a room
 * (server/src/war/persons.ts, captives.ts: the persons book; holders.ts: the strongroom's goods the larder reads), held
 * in memory for the offline game. This is the TS reading the C++ MemoryStore (godot/native/src/room_store.h) is checked
 * against: the same SQL rules over plain records, in record insertion order.
 *
 * Kept from D1: claimForJoin (listed twice, not his, not fit, already in the field; the claim marks his region), release,
 * applyFight (once per fight id: XP and tallies, wounded HEAL.field, captives held by the captor's first player up to
 * HOLD_MAX a fort, the dead lose their gear, a battle honour appended, deeds and scars), claimSoul (a named soul moves
 * to the claimer; a new man is inserted under his path's cap), faded, freeRaided and releaseDue (toSouls: souls wake at
 * the room's shrine, else fade), armyCount, offField, deployed and the strongroom's goods.
 * Left out, as world or economy rules (P11): upkeep and its debts, the group's road and home checks (groupRefusal,
 * homeRefusal), the memorial, the boards' tallies and favour. The store keeps whole heroes (D1 keeps columns of them).
 */
import { freshHero } from '../war/sim/classes';
import { addDeeds, SCARS_MAX } from '../war/sim/deeds';
import { HONOURS_MAX } from '../war/sim/honours';
import { CAPTIVE } from '../war/sim/captives';
import { isCivClass } from '../data/classes';
import { mayHold, NO_PATH, soldierCap, workerCap, type PlayerPath } from '../war/world/start';
import type { FightReport, WarPerson } from '../war/types';

/** server/src/war/persons.ts HEAL.field and HOLD_MAX. */
const HEAL_FIELD = 6 * 3_600_000, HOLD_MAX = 20;
const IN_ARMY = new Set(['active', 'wounded', 'training']);

export type PersonState = 'active' | 'wounded' | 'captive' | 'dead' | 'training' | 'retired' | 'soul' | 'faded';
export interface Rec {
  id: string; pid: number; state: PersonState; region: string | null; until: number | null;
  captor: number | null; heldAt: string | null; captorPid: number | null; heldFort: number | null;
  barPid: number | null; barUntil: number | null; person: WarPerson;
}
/** A named soul to wake (captives.ts NamedSoul). */
export interface Soul { person: WarPerson; lifeMs: number; bar?: { pid: number; ms: number } }

const reUid = (p: WarPerson, now: number) =>
  Object.fromEntries(Object.entries(freshHero(p.hero.cls ?? 'militia', p.id).equip).filter(([, it]) => it).map(([slot, it]) => [slot, { ...it!, uid: `${p.id}-${slot}-${now.toString(36)}` }]));

export class RoomStore {
  recs: Rec[] = [];
  fights: string[] = [];
  goods = new Map<number, Record<string, number>>();
  paths = new Map<number, PlayerPath>();

  private rec(id: string) {
    return this.recs.find((r) => r.id === id);
  }
  /** A new man of his, active, at home (persons.ts insertPerson). */
  add(pid: number, p: WarPerson, region: string | null = null): void {
    this.recs.push({ id: p.id, pid, state: 'active', region, until: null, captor: null, heldAt: null, captorPid: null, heldFort: null, barPid: null, barUntil: null, person: p });
  }
  path(pid: number): PlayerPath {
    return this.paths.get(pid) ?? NO_PATH;
  }
  private count(pid: number, civ: boolean, states = IN_ARMY) {
    return this.recs.filter((r) => r.pid === pid && states.has(r.state) && isCivClass(r.person.hero.cls ?? '') === civ).length;
  }
  armyCount(pid: number): number {
    return this.count(pid, false);
  }
  /** persons.ts settle (its timers): the wounded whose time is up are fit; his captives due go free (releaseDue). */
  settle(pid: number, now: number, wake: (s: Soul) => boolean): void {
    for (const r of this.recs) if (r.pid === pid && r.state === 'wounded' && r.until !== null && r.until <= now) (r.state = 'active'), (r.until = null);
    this.toSouls(this.recs.filter((r) => (r.pid === pid || r.captorPid === pid) && r.state === 'captive' && r.until !== null && r.until <= now), now, wake);
  }
  claimForJoin(pid: number, region: string, squads: string[][], inRoom: ReadonlySet<string>, now: number, wake: (s: Soul) => boolean): WarPerson[][] | string {
    const ids = squads.flat();
    if (new Set(ids).size !== ids.length) return 'a soldier listed twice';
    this.settle(pid, now, wake);
    for (const id of ids) {
      const r = this.rec(id);
      if (!r || r.pid !== pid) return `no soldier ${id}`;
      if (r.state !== 'active') return `${r.person.hero.name} is ${r.state}`;
      if (inRoom.has(id)) return `${r.person.hero.name} is already in the field`;
    }
    if (ids.some((id) => { const r = this.rec(id)!; return r.region !== null && r.region !== region; })) return 'a soldier was taken meanwhile';
    for (const id of ids) this.rec(id)!.region = region;
    return squads.map((s) => s.map((id) => structuredClone(this.rec(id)!.person)));
  }
  release(region: string, ids: readonly string[]): void {
    for (const id of ids) {
      const r = this.rec(id);
      if (r && r.region === region) r.region = null;
    }
  }
  offField(pid: number, region: string, inRoom: ReadonlySet<string>, now: number, wake: (s: Soul) => boolean): string[] {
    this.settle(pid, now, wake);
    return this.recs.filter((r) => r.pid === pid && r.state === 'active' && r.region === region && !inRoom.has(r.id)).map((r) => r.id);
  }
  deployed(region: string, ids: readonly string[]): Map<string, WarPerson> {
    return new Map(this.recs.filter((r) => r.region === region && r.state === 'active' && ids.includes(r.id)).map((r) => [r.id, structuredClone(r.person)]));
  }
  applyFight(id: string, region: string, rep: FightReport, now: number): boolean {
    if (this.fights.includes(id)) return false;
    this.fights.push(id);
    const owner = (o: string) => (/^p:(\d+)$/.test(o) ? Number(o.slice(2)) : null);
    const byTeam = new Map<number, number[]>();
    for (const x of rep.persons) {
      const pid = owner(x.owner);
      if (pid === null) continue;
      const l = byTeam.get(x.team) ?? [];
      if (!l.includes(pid)) l.push(pid);
      byTeam.set(x.team, l);
    }
    for (const l of byTeam.values()) l.sort((a, b) => a - b);
    const held = new Map<number, number>();
    for (const x of rep.persons) if (x.state === 'captive' && x.fort !== undefined && !held.has(x.fort)) held.set(x.fort, this.recs.filter((r) => r.heldAt === region && r.heldFort === x.fort && r.state === 'captive').length);
    const overHold = (f: number | undefined) => {
      if (f === undefined) return false;
      const n = held.get(f)! + 1;
      held.set(f, n);
      return n > HOLD_MAX;
    };
    for (const x of rep.persons) {
      const pid = owner(x.owner), r = this.rec(x.pid);
      if (pid === null || !r || r.pid !== pid) continue;
      const was = r.person, honours = [...(was.honours ?? [])];
      if (x.honour && x.state !== 'dead' && x.state !== 'captive' && honours.length < HONOURS_MAX && !honours.some((h) => h.name === x.honour!.name)) honours.push(x.honour);
      const deeds = addDeeds(was.deeds ?? [], x.deeds ?? []).all, scars = Math.min(SCARS_MAX, (was.scars ?? 0) + (x.scar ? 1 : 0));
      r.person = { ...was, hero: { ...x.hero, ...(x.state === 'dead' ? { equip: {} } : {}) }, honours, ...(deeds.length ? { deeds } : {}), ...(scars ? { scars } : {}) };
      const wounded = () => ((r.state = 'wounded'), (r.until = now + HEAL_FIELD));
      if (x.state === 'wounded') wounded();
      else if (x.state === 'captive' && !overHold(x.fort))
        Object.assign(r, { state: 'captive', until: now + CAPTIVE.holdMs, captor: x.captor ?? null, heldAt: region, captorPid: x.captor !== undefined ? (byTeam.get(x.captor)?.[0] ?? null) : null, heldFort: x.fort ?? null, region: null });
      else if (x.state === 'captive') wounded();
      else if (x.state === 'dead') Object.assign(r, { state: 'dead', until: null, region: null });
    }
    return true;
  }
  /** persons.ts claimSoul: a named soul moves to him (movePerson), a new man is inserted under his path's cap. */
  claimSoul(pid: number, p: WarPerson, region: string): boolean {
    const way = this.path(pid), cls = p.hero.cls ?? 'militia', civ = isCivClass(cls), r = this.rec(p.id);
    if (r?.state === 'soul') {
      if (!mayHold(way, cls) || this.count(pid, civ) >= (civ ? workerCap(way.path) : soldierCap(way.path))) return false;
      Object.assign(r, { pid, state: 'active', until: null, captor: null, captorPid: null, heldAt: null, heldFort: null, barPid: null, barUntil: null, region });
      r.person = { ...r.person, hero: { ...r.person.hero, equip: p.hero.equip } };
      return true;
    }
    if (!mayHold(way, cls) || r || this.count(pid, false) >= soldierCap(way.path) || this.count(pid, false, new Set(['active'])) >= soldierCap(way.path)) return false;
    this.add(pid, { ...p, hero: { ...p.hero, kills: 0, battles: 0 }, honours: [] }, region);
    return true;
  }
  fade(id: string): void {
    const r = this.rec(id);
    if (r?.state === 'soul') r.state = 'faded';
  }
  /** captives.ts toSouls, for this one region: each wakes at a shrine here (wake), else fades. */
  toSouls(rows: Rec[], now: number, wake: (s: Soul) => boolean): number {
    for (const r of rows) {
      const origin = r.heldAt ?? r.region ?? 'unknown';
      Object.assign(r, { state: 'soul', until: now + CAPTIVE.soulMs, heldAt: origin, captor: null, captorPid: null, heldFort: null, region: null, barPid: null, barUntil: null });
      r.person = { ...r.person, hero: { ...r.person.hero, equip: reUid(r.person, now) } };
      if (!wake({ person: structuredClone(r.person), lifeMs: CAPTIVE.soulMs })) r.state = 'faded';
    }
    return rows.length;
  }
  freeRaided(region: string, buildings: readonly number[], at: number, wake: (s: Soul) => boolean): number {
    if (!buildings.length) return 0;
    return this.toSouls(this.recs.filter((r) => r.heldAt === region && r.state === 'captive' && r.heldFort !== null && buildings.includes(r.heldFort) && r.until !== null && r.until <= at + CAPTIVE.holdMs), at, wake);
  }
  /** His home strongroom's goods (the larder reads them). */
  goodsOf(pid: number): Record<string, number> {
    return { ...(this.goods.get(pid) ?? {}) };
  }
  /** What his men drew from it (the DO's planTake: never below zero). */
  take(pid: number, goods: Record<string, number>): void {
    const g = this.goods.get(pid) ?? {};
    for (const [k, n] of Object.entries(goods)) g[k] = Math.max(0, (g[k] ?? 0) - n);
    this.goods.set(pid, g);
  }
  dump() {
    return { persons: this.recs, fights: this.fights, goods: [...this.goods] };
  }
}
