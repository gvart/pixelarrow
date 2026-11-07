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
 * the room's shrine, else fade), armyCount, offField, deployed and the strongroom's goods. And each player's guide,
 * story and encounter saves (D1 and DO storage), as the DO writes and reads them.
 * Left out, as world or economy rules (P11): upkeep and its debts, the group's road and home checks (groupRefusal,
 * homeRefusal), the memorial, the boards' tallies. The store keeps whole heroes (D1 keeps columns of them).
 *
 * Wave C, what the DO books round the room's settlements and politics (server/src/war/settlements.ts, oaths.ts, crown.ts,
 * works.ts, favour.ts): the alliance rolls and names (war_alliance_members, players), the settlements and their members
 * (found, report, the region's list as loadRegionSettlements reads it, an attack logged and who hears it, the centres
 * re-keyed on a fresh field), the oaths sworn and their rates (syncTies on a founding; liegeOf and tributeCut for wave B's
 * sales and tribute), the tribute held in buildings
 * (reportHeld), the pacts and truces (pactsOf, pactAttack), the crown's war goals' shares (bookFight), the alliance works
 * (addLabour, openWorks, bonusesOf), favour (addFavour within its path and hour cap, levelsOf), the guard contracts the
 * room watches, and the world's notes to players (notify). Left out, as REST or world rules (P11): settlement offers and
 * truce bonds, swearing and the crown's votes, offices, treasury and orders' payouts, the contracts' pay (labour, guard
 * checks). Wave B's holders and trade books (the town boards with them) are `trade` (./roomTrade.ts).
 */
import { freshHero } from '../war/sim/classes';
import { addDeeds, SCARS_MAX } from '../war/sim/deeds';
import { HONOURS_MAX } from '../war/sim/honours';
import { CAPTIVE } from '../war/sim/captives';
import { isCivClass } from '../data/classes';
import { ALLIANCES } from '../war/world/alliances';
import { mayHold, NO_PATH, soldierCap, workerCap, type PlayerPath } from '../war/world/start';
import type { FightReport, TeamBonus, WarPerson } from '../war/types';
import { foldBonus, stagesOf, WONDER, WORKS, type WorkId } from '../war/net/works';
import { FAVOUR_MAX, FAVOUR_XP, HOUR_CAP, PAYS, type FavourReason } from '../war/net/favour';
import { FEUDAL } from '../data/warFeudal';
import type { Circle, Plot } from '../war/net/settlements';
import { TradeBooks } from './roomTrade';

/** server/src/war/persons.ts HEAL.field and HOLD_MAX. */
const HEAL_FIELD = 6 * 3_600_000, HOLD_MAX = 20;
const IN_ARMY = new Set(['active', 'wounded', 'training']);
/** src/war/world/alliances.ts ALLIANCES names by id. */
const ALLIANCE_NAMES = ALLIANCES.map((a) => a.name);
/** server/src/war/settlements.ts SETTLE (the vectors check it against the server's). */
export const SETTLE = { r: 24, presence: 6, nameMax: 32 };
/** server/src/war/favour.ts FAVOUR_LOG (rows kept a player). */
export const FAVOUR_LOG = 20;
const HOUR = 3_600_000, EPS = 1e-6;

export type Role = 'lord' | 'citizen' | 'garrison';
/** A war_settlements row (persist: its JSON text). */
export interface SettleRec { id: number; region: string; centre: number; x: number; y: number; r: number; name: string; lord: number; level: number; overlord: number | null; tribute: number; tendedAt: number; persist: string }
export interface MemberRec { settlement: number; pid: number; role: Role; plot: Plot | null; since: number }
export interface PactRec { id: number; a: number; b: number; kind: 'pact' | 'truce'; state: string; endsAt: number | null; brokenBy: number | null }
export interface OrderRec { id: number; alliance: number; kind: 'attack' | 'defend' | 'rally' | 'supply'; region: string; state: string; expiresAt: number }
export interface WorkRec { alliance: number; work: string; goods: Record<string, number>; labour: number; stage: number; doneAt: number | null }
export interface FavourRec { pid: number; xp: number; level: number; landHour: number; landN: number }
/** A room's settlement as loadRegionSettlements hands it (server/src/war/roomSettlements.ts RoomSettlement). */
export interface RoomSettle {
  id: number; centre: number; x: number; y: number; r: number; name: string; lord: number; lordName: string; team: number | null;
  level: number; overlord: number | null; tribute: number; overlordLords: number[]; members: { pid: number; role: Role; plot: Plot | null }[];
}
export interface HeldRow { building: number; type: string; payer: number; receiver: number; goods: Record<string, number> }
export interface GuardWatch { id: number; team: number; taker: number; men: number }

const favourLevelOf = (xp: number) => {
  for (let l = FAVOUR_MAX; l >= 2; l--) if (xp >= FAVOUR_XP[l]) return l;
  return 1;
};

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
  saves = { guide: new Map<number, unknown>(), story: new Map<number, unknown>(), encounter: new Map<number, unknown>() };
  // wave C (rows in insertion order, as the SQL reads them by id or rowid)
  alliances = new Map<number, number>();
  names = new Map<number, string>();
  settles: SettleRec[] = [];
  members: MemberRec[] = [];
  settleLog: { settlement: number; kind: string; actor: number; at: number }[] = [];
  oaths: { vassal: number; lord: number }[] = [];
  rates = new Map<number, number>();
  held: { region: string; rows: HeldRow[] }[] = [];
  pacts: PactRec[] = [];
  orders: OrderRec[] = [];
  shares: { order: number; pid: number; share: number }[] = [];
  works: WorkRec[] = [];
  gifts: { alliance: number; work: string; pid: number; labour: number }[] = [];
  stats: { pid: number; labour: number }[] = [];
  favour: FavourRec[] = [];
  favourLog: { pid: number; at: number; amount: number; reason: FavourReason }[] = [];
  guards: { region: string; watch: GuardWatch }[] = [];
  news: { pids: number[]; msg: unknown }[] = [];
  private nextSettle = 1;
  /** Wave B: holders and trade (./roomTrade.ts). */
  readonly trade = new TradeBooks(this);

  private rec(id: string) {
    return this.recs.find((r) => r.id === id);
  }
  /** A new man of his, active, at home (persons.ts insertPerson). */
  add(pid: number, p: WarPerson, region: string | null = null): void {
    this.recs.push({ id: p.id, pid, state: 'active', region, until: null, captor: null, heldAt: null, captorPid: null, heldFort: null, barPid: null, barUntil: null, person: p });
  }
  /** His path (start.ts pathOf: his level is war_favour's; a seeded path's level stands for it until he earns favour). */
  path(pid: number): PlayerPath {
    const p = this.paths.get(pid), f = this.favour.find((x) => x.pid === pid);
    return p && f ? { ...p, level: f.level } : (p ?? NO_PATH);
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
  /** His guide, story or encounter save (null: none). */
  saveOf(kind: keyof RoomStore['saves'], pid: number): unknown {
    return this.saves[kind].get(pid) ?? null;
  }
  keep(kind: keyof RoomStore['saves'], pid: number, save: unknown): void {
    this.saves[kind].set(pid, save);
  }
  // ---------------------------------------------------------------- wave C: settlements (server/src/war/settlements.ts)

  /** His alliance this season (war_alliance_members; null: none). */
  allianceOf(pid: number): number | null {
    return this.alliances.get(pid) ?? null;
  }
  private settlement(id: number): SettleRec | undefined {
    return this.settles.find((s) => s.id === id);
  }
  /** The settlement's overlords, nearest first. */
  private overlords(s: SettleRec): SettleRec[] {
    const out: SettleRec[] = [];
    for (let cur = s; cur.overlord !== null && out.length < 16; ) {
      const o = this.settlement(cur.overlord);
      if (!o || out.some((x) => x.id === o.id)) break;
      out.push((cur = o));
    }
    return out;
  }
  /** roomSettlements.ts loadRegionSettlements: the region's settlements with members (by since, pid), banner and overlords' lords. */
  regionSettlements(region: string): RoomSettle[] {
    const rows = this.settles.filter((s) => s.region === region).sort((a, b) => a.id - b.id);
    const ms = this.members.filter((m) => rows.some((s) => s.id === m.settlement)).sort((a, b) => a.since - b.since || a.pid - b.pid);
    return rows.map((r) => {
      const lords: number[] = [];
      for (let cur = r.overlord, n = 0; cur !== null && n < 16; n++) {
        const o = this.settlement(cur);
        if (!o || lords.includes(o.lord)) break;
        lords.push(o.lord);
        cur = o.overlord;
      }
      return {
        id: r.id, centre: r.centre, x: r.x, y: r.y, r: r.r || SETTLE.r, name: r.name, lord: r.lord, lordName: this.names.get(r.lord) ?? `Player ${r.lord}`,
        team: this.allianceOf(r.lord), level: r.level, overlord: r.overlord, tribute: r.tribute, overlordLords: lords,
        members: ms.filter((m) => m.settlement === r.id).map((m) => ({ pid: m.pid, role: m.role, plot: m.plot ? { ...m.plot } : null })),
      };
    });
  }
  /** found: a settlement round a finished camp, its builder the lord (the same camp twice: its id); else why not. */
  found(f: { region: string; centre: number; x: number; y: number; lord: number }, mapOk: (c: Circle) => string | null, now: number): number | string {
    const had = this.settles.find((s) => s.region === f.region && s.centre === f.centre);
    if (had) return had.id;
    const c = { x: Math.round(f.x), y: Math.round(f.y), r: SETTLE.r };
    if (!this.settles.filter((s) => s.region === f.region).every((o) => Math.hypot(c.x - o.x, c.y - o.y) >= c.r + o.r)) return 'Too close to another settlement';
    const why = mapOk(c);
    if (why) return why;
    const id = this.nextSettle++;
    this.settles.push({ id, region: f.region, centre: f.centre, x: c.x, y: c.y, r: c.r, name: 'Camp', lord: f.lord, level: 0, overlord: null, tribute: 0, tendedAt: now, persist: '{}' });
    this.members.push({ settlement: id, pid: f.lord, role: 'lord', plot: null, since: now });
    this.syncTies(f.lord);
    return id;
  }
  /** A store seed: a settlement (its pieces to persist in `persist`), its lord a member (what found and the season sweep leave online). */
  addSettlement(s: Omit<SettleRec, 'id'>): number {
    const id = this.nextSettle++;
    this.settles.push({ id, ...s });
    this.members.push({ settlement: id, pid: s.lord, role: 'lord', plot: null, since: 0 });
    return id;
  }
  /** A store seed: a citizen with his plot, or a garrison (an offer accepted). */
  addMember(settlement: number, pid: number, role: Role, plot: Plot | null, now: number): void {
    const m = this.members.find((x) => x.settlement === settlement && x.pid === pid);
    if (m) Object.assign(m, { role, plot });
    else this.members.push({ settlement, pid, role, plot, since: now });
  }
  /** report: town level, what persists (JSON) and tended now. */
  report(id: number, r: { level?: number; persist?: unknown; tended?: boolean }, now: number): void {
    const s = this.settlement(id);
    if (!s) return;
    if (r.level !== undefined) s.level = r.level;
    if (r.persist !== undefined) s.persist = JSON.stringify(r.persist);
    if (r.tended) s.tendedAt = now;
  }
  /** logAttack: logged; who must hear (the lords up the chain, the attacker aside). Settlement truces are REST's: none here. */
  logAttack(by: number, victim: number, now: number): { tell: number[]; broken: number[] } {
    const v = this.settlement(victim);
    if (!v) return { tell: [], broken: [] };
    const hit = [v, ...this.overlords(v)];
    this.settleLog.push({ settlement: victim, kind: 'attack', actor: by, at: now });
    return { tell: [...new Set(hit.map((h) => h.lord))].filter((p) => p !== by), broken: [] };
  }
  /** regionDO.ts restoreSettlements: the old centre ids off (-id), then the new ones. */
  rekey(region: string, moved: readonly [number, number][]): void {
    for (const s of this.settles) if (s.region === region) s.centre = -s.id;
    for (const [id, c] of moved) {
      const s = this.settlement(id);
      if (s) s.centre = c;
    }
  }
  /** The region's settlements and their persisted pieces, by id (restoreSettlements' read). */
  persisted(region: string): { id: number; persist: string }[] {
    return this.settles.filter((s) => s.region === region).sort((a, b) => a.id - b.id).map((s) => ({ id: s.id, persist: s.persist }));
  }

  // ---------------------------------------------------------------- oaths (server/src/war/oaths.ts)

  /** A store seed: an oath sworn (answerOath's yes), and the lord's rate if given; the vassal's ties follow it. */
  swear(vassal: number, lord: number, pct: number | null): void {
    this.oaths = this.oaths.filter((o) => o.vassal !== vassal);
    this.oaths.push({ vassal, lord });
    if (pct !== null) this.rates.set(lord, pct);
    this.syncTies(vassal);
  }
  /** syncTies: his settlements' overlord (the liege's oldest settlement) and tribute as his oath stands. */
  private syncTies(pid: number): void {
    const lord = this.oaths.find((o) => o.vassal === pid)?.lord ?? null;
    const seat = lord === null ? null : (this.settles.filter((s) => s.lord === lord).sort((a, b) => a.id - b.id)[0]?.id ?? null);
    for (const s of this.settles) if (s.lord === pid) (s.overlord = seat), (s.tribute = seat === null || lord === null ? 0 : (this.rates.get(lord) ?? FEUDAL.rateDefault));
  }
  /** liegeOf: whom he is sworn to (null: nobody). */
  liegeOf(pid: number): number | null {
    return this.oaths.find((o) => o.vassal === pid)?.lord ?? null;
  }
  /** tributeCut: his liege's part of `coin` he earned from a sale (0: nobody's man, or a lord at 0%). */
  tributeCut(seller: number, coin: number): number {
    const lord = coin > 0 ? this.liegeOf(seller) : null;
    return lord === null ? 0 : Math.floor(((coin * (this.rates.get(lord) ?? FEUDAL.rateDefault)) / 100) * 100 + 1e-6) / 100;
  }
  /** sworn: every oath in force with its rate, by vassal. */
  sworn(): { vassal: number; lord: number; pct: number }[] {
    return [...this.oaths].sort((a, b) => a.vassal - b.vassal).map((o) => ({ vassal: o.vassal, lord: o.lord, pct: this.rates.get(o.lord) ?? FEUDAL.rateDefault }));
  }
  /** reportHeld: a room's report of the tribute set aside in its buildings replaces its last. */
  reportHeld(region: string, rows: readonly HeldRow[]): void {
    this.held = this.held.filter((h) => h.region !== region);
    if (rows.length) this.held.push({ region, rows: structuredClone([...rows]) });
  }

  // ---------------------------------------------------------------- crown (server/src/war/crown.ts)

  /** A store seed: a pact or truce in force between alliances a and b (answerPact's accept). */
  addPact(a: number, b: number, kind: 'pact' | 'truce', endsAt: number | null): number {
    const id = this.pacts.length + 1;
    this.pacts.push({ id, a, b, kind, state: 'active', endsAt, brokenBy: null });
    return id;
  }
  /** pactsOf: the active pacts and truces, by id. */
  pactsOf(): PactRec[] {
    return this.pacts.filter((p) => p.state === 'active');
  }
  /** pactAttack: player `by` attacked settlement `victim`: the pacts between his alliance and its lord's break; both alliances hear it. */
  pactAttack(by: number, victim: number, now: number): { broken: number[]; tell: number[]; text: string } {
    const none = { broken: [], tell: [], text: '' };
    const lord = this.settlement(victim)?.lord;
    if (lord === undefined) return none;
    const va = this.allianceOf(by), vb = this.allianceOf(lord);
    if (va === null || vb === null || va === vb) return none;
    const ps = this.pacts.filter((p) => p.state === 'active' && (p.endsAt ?? Infinity) > now && ((p.a === va && p.b === vb) || (p.a === vb && p.b === va)));
    if (!ps.length) return none;
    const who = this.names.get(by) ?? `#${by}`;
    for (const p of ps) Object.assign(p, { state: 'broken', brokenBy: by, endsAt: now });
    const tell = [...this.alliances].filter(([, a]) => a === va || a === vb).map(([pid]) => pid);
    const kind = ps.some((p) => p.kind === 'pact') ? 'pact' : 'truce';
    return { broken: ps.map((p) => p.id), tell, text: `${who} of ${ALLIANCE_NAMES[va]} broke the ${kind} with ${ALLIANCE_NAMES[vb]}` };
  }
  /** A store seed: an open order of alliance `alliance` on `region` (postOrder). */
  addOrder(alliance: number, kind: OrderRec['kind'], region: string, expiresAt: number): number {
    const id = this.orders.length + 1;
    this.orders.push({ id, alliance, kind, region, state: 'open', expiresAt });
    return id;
  }
  /** bookFight: members whose men fought in a region with an open war goal of their alliance get shares (1 + kills). */
  bookFight(region: string, tally: ReadonlyMap<number, { kills: number }>, now: number): void {
    const orders = this.orders.filter((o) => o.region === region && o.state === 'open' && (o.kind === 'attack' || o.kind === 'defend') && o.expiresAt > now);
    if (!orders.length) return;
    for (const [pid, s] of tally) {
      const a = this.allianceOf(pid);
      for (const o of orders) {
        if (o.alliance !== a) continue;
        const sh = this.shares.find((x) => x.order === o.id && x.pid === pid);
        if (sh) sh.share += 1 + s.kills;
        else this.shares.push({ order: o.id, pid, share: 1 + s.kills });
      }
    }
  }

  // ---------------------------------------------------------------- alliance works (server/src/war/works.ts)

  private work(a: number, id: string): WorkRec | undefined {
    return this.works.find((w) => w.alliance === a && w.work === id);
  }
  /** addLabour: man-seconds by player at alliance a's work (its current stage), capped at the need; then the stage done? */
  addLabour(a: number, id: WorkId, by: Record<number, number>, now: number): number {
    const stages = stagesOf(id);
    if (!stages) return 0;
    const r = this.work(a, id);
    if (r?.doneAt) return 0;
    let left = stages[r?.stage ?? 0].labour * 3600 - (r?.labour ?? 0), put = 0;
    if (!r) this.works.push({ alliance: a, work: id, goods: {}, labour: 0, stage: 0, doneAt: null });
    for (const [p, secs] of Object.entries(by).sort((x, y) => Number(x[0]) - Number(y[0]))) {
      const n = Math.min(secs, left), pid = Number(p);
      if (!(n > EPS)) continue;
      left -= n;
      put += n;
      const g = this.gifts.find((x) => x.alliance === a && x.work === id && x.pid === pid);
      if (g) g.labour += n;
      else this.gifts.push({ alliance: a, work: id, pid, labour: n });
      const st = this.stats.find((x) => x.pid === pid);
      if (st) st.labour += n;
      else this.stats.push({ pid, labour: n });
    }
    if (!(put > EPS)) return 0;
    this.work(a, id)!.labour += put;
    this.finish(a, id, now);
    return put;
  }
  /** finish: the current stage done? Marked once (the last: the work stands; else the next opens empty). */
  private finish(a: number, id: string, now: number): void {
    const stages = stagesOf(id)!, r = this.work(a, id);
    const st = r && !r.doneAt ? stages[r.stage] : undefined;
    if (!r || !st) return;
    if (Object.entries(st.goods).some(([k, n]) => (r.goods[k] ?? 0) < n - EPS) || r.labour < st.labour * 3600 - EPS) return;
    if (r.stage + 1 >= stages.length) (r.doneAt = now), (r.stage += 1);
    else if (now > 0) Object.assign(r, { stage: r.stage + 1, goods: {}, labour: 0 });
  }
  /** openWorks: the works (and the wonder) still open in the alliance's home region. */
  openWorks(a: number): WorkId[] {
    const done = new Set(this.works.filter((w) => w.alliance === a && w.doneAt !== null).map((w) => w.work));
    return [...WORKS.map((w) => w.id), WONDER.id].filter((id) => !done.has(id));
  }
  /** bonusesOf: each alliance's sim bonuses from its works and wonder stages (rows in insertion order). */
  bonusesOf(): Map<number, TeamBonus> {
    const by = new Map<number, [string, number][]>();
    for (const r of this.works) if (r.doneAt !== null || r.stage > 0) by.set(r.alliance, [...(by.get(r.alliance) ?? []), [r.work, r.doneAt !== null ? (stagesOf(r.work)?.length ?? 0) : r.stage]]);
    const out = new Map<number, TeamBonus>();
    for (const [a, done] of by) {
      const b = foldBonus(done), cur: TeamBonus = {};
      if (b.repairCost !== undefined) cur.repairCost = b.repairCost;
      if (b.sight) cur.sight = b.sight;
      if (Object.keys(cur).length) out.set(a, cur);
    }
    return out;
  }
  /** A store seed: goods given to a work (give, without the strongroom). */
  giveWork(a: number, id: WorkId, goods: Record<string, number>): void {
    if (!this.work(a, id)) this.works.push({ alliance: a, work: id, goods: {}, labour: 0, stage: 0, doneAt: null });
    const r = this.work(a, id)!;
    for (const [k, n] of Object.entries(goods)) r.goods[k] = (r.goods[k] ?? 0) + n;
  }

  // ---------------------------------------------------------------- favour (server/src/war/favour.ts)

  /** addFavour: if the reason pays his path (none set: every path pays), within its hour cap; the level by the curve, his log trimmed. */
  addFavour(pid: number, amount: number, reason: FavourReason, now: number): void {
    const only = PAYS[reason];
    if (only && (this.paths.get(pid)?.path ?? only) !== only) return;
    const cap = HOUR_CAP[reason];
    if (cap === undefined) return this.favourOf(pid, Math.round(amount), reason, now);
    const hour = Math.floor(now / HOUR), r = this.favour.find((f) => f.pid === pid), had = r?.landHour === hour ? r.landN : 0;
    const n = Math.min(Math.round(amount), cap - had);
    if (!(n > 0)) return;
    this.favourOf(pid, n, reason, now);
    const f = this.favour.find((x) => x.pid === pid)!;
    (f.landHour = hour), (f.landN = had + n);
  }
  private favourOf(pid: number, n: number, reason: FavourReason, now: number): void {
    if (!(n > 0)) return;
    const f = this.favour.find((x) => x.pid === pid);
    if (f) (f.xp += n), (f.level = favourLevelOf(f.xp));
    else this.favour.push({ pid, xp: n, level: favourLevelOf(n), landHour: 0, landN: 0 });
    this.favourLog.push({ pid, at: now, amount: n, reason });
    const mine = this.favourLog.filter((l) => l.pid === pid);
    if (mine.length > FAVOUR_LOG) this.favourLog = this.favourLog.filter((l) => l !== mine[0]);
  }
  /** levelsOf: the demigod levels of these players (no row: 1). */
  levelsOf(pids: readonly number[]): [number, number][] {
    return pids.map((p) => [p, this.favour.find((f) => f.pid === p)?.level ?? this.paths.get(p)?.level ?? 1]);
  }

  // ---------------------------------------------------------------- the rest

  /** A store seed: a taken guard contract the room in `region` watches (workContracts' guards). */
  addGuard(region: string, w: GuardWatch): void {
    this.guards.push({ region, watch: { ...w } });
  }
  guardsIn(region: string): GuardWatch[] {
    return this.guards.filter((g) => g.region === region).map((g) => ({ ...g.watch }));
  }
  /** The world's note to players (WarWorldDO.notify), kept for the vectors. */
  notify(pids: readonly number[], msg: unknown): void {
    this.news.push({ pids: [...pids], msg: structuredClone(msg) });
  }

  dump() {
    return {
      persons: this.recs, fights: this.fights, goods: [...this.goods],
      settlements: this.settles, members: this.members, settleLog: this.settleLog, oaths: this.sworn(), held: this.held, pacts: this.pacts, shares: this.shares,
      works: this.works, gifts: this.gifts, stats: this.stats, favour: this.favour, favourLog: this.favourLog, news: this.news,
      ...this.trade.dump(),
    };
  }
}
