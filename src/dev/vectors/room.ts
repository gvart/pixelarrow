/**
 * The region room (server/src/war/room.ts WarRoom) for the Godot port (docs/impl/godot-port.md P8): a scripted client
 * message sequence driven through the TS room headless, as the Durable Object drives it (server/src/war/regionDO.ts
 * webSocketMessage and loop) minus sockets, with the DO's D1 books held by the local store (../roomStore.ts), and every
 * server message recorded. The Godot side (godot/tests/sim/test_room.gd) replays the same messages into LocalRoom and
 * matches the outbound messages exactly (JSON messages as values, binary frames byte for byte), the room's books of
 * each tick (fights, soul claims, raids, faded souls, larder draws; guide steps, story and encounter runs, the wild's
 * deeds, the tasks' tallies, the warlords' notes), the results of the room calls the DO and the world make (transfers,
 * musters, hires, level-ups, paths, saves and restores), the looks at the region (memory, summary, the warlords'
 * memory) and the store as it changes.
 *
 * The local transport (what LocalRoom does in place of the DO), per client in the order each first spoke:
 *  - send(pid, msg): the message parsed as the DO parses it (parseClientMsg), then join / order / view / ping / check /
 *    dev / guide / story / encounter as webSocketMessage handles them. A persons join claims its men from the store
 *    first. A welcome is followed by the world events (once any were set), the settlements list (sendSettlements
 *    fresh), then in the DO's order his path and army from the store, his guide, his larder, his story and encounters
 *    (guideStart, storyStart, encounterStart, each from its save in the store; masteryStart is D1's) and the muster of
 *    his men lying here (W-98); a dev class army (no men in the store) gets only his guide, story and encounters. pong carries no `ms` (wall clock) and idle is `alive() === 0`.
 *  - close(pid): his socket went away (webSocketClose: room.leave); dropped joins are released.
 *  - tick(): one room tick, its books into the store, then per client: his admitted message (a welcome from the line,
 *    then his guide, story, encounters and the settlements), his tick messages, his binary frame; then the guide, story
 *    and encounter saves of the tick into the store.
 *  - world(events, next, now): the world's RPC (worldEvents): applyEvents (the events running here now onto the room, a
 *    guardian woken once per boss wake), every client told.
 *  - call(op, args): what the DO and the world call on the room (transfers, musters, hires, level-ups, paths, saves).
 *  - wave B (../roomTrade.ts TradeDo): mend / stow / npc / board / handoff as the DO handles them over the store's trade
 *    books; per tick the crafted items written back, the mends freed and the board's Kills readied by the wild's deeds;
 *    a save keeps the region's holds, a restore its mends; seeds and looks: stash, rent, snap, hurtBoss.
 * WarRoom is loaded through import.meta.glob so the root typecheck does not follow it into the server's D1 types.
 */
import { parseRegion } from '../../war/region/schema';
import { ALLIANCES, CAMERA_MARGIN, DEFAULT_CAP, GOODS, KEYFRAME_EVERY, MAX_SQUAD, MAX_SQUADS, NET_VERSION, parseClientMsg, QUANT, VISION, WILD_EVERY, type ServerMsg } from '../../war/net/protocol';
import { NODES_EVERY, STORE_NEAR } from '../../war/net/economy';
import { BOSS_NEAR } from '../../war/net/interest';
import { LABOUR_EVERY, stagesOf, WONDER, WORK_R, WORKS, workSite } from '../../war/net/works';
import type { BuildingType, FightReport, RegionData, Snapshot, WarBuildSim, WarPerson } from '../../war/types';
import type { PlayerPath } from '../../war/world/start';
import { makePerson } from '../../war/sim/roster';
import { npcSpot } from '../../war/net/npcMarket';
import type { WorldEvent } from '../../war/world/events';
import { RoomStore, SETTLE, FAVOUR_LOG, type GuardWatch, type HeldRow, type RoomSettle, type Soul } from '../roomStore';
import { foundRefusal } from '../../war/net/settlements';
import { FAVOUR_EARN, FAVOUR_XP, HOUR_CAP, PAYS } from '../../war/net/favour';
import { FEUDAL } from '../../data/warFeudal';
import type { WorkId } from '../../war/net/works';
import { ALLIANCES as ALLIANCE_LIST } from '../../war/world/alliances';
import { BOARD } from '../../data/warTownBoard';
import { TradeDo, type TradeRoom } from '../roomTrade';

type Sha = (b: string) => string;
const files = import.meta.glob('../../war/regions/*.json', { eager: true, import: 'default' });
const server = import.meta.glob('../../../server/src/war/room.ts', { eager: true }) as Record<string, {
  WarRoom: (new (o: Record<string, unknown>) => Room) & { restore(o: Record<string, unknown>, st: unknown, persons: ReadonlyMap<string, WarPerson>): Room };
  CORPSE_TICKS: number; FIGHT_QUIET: number; HOME_CLAIM_R: number; SETTLE_EVERY: number; ATTACK_COOLDOWN: number;
}>;
const room = Object.values(server)[0];
/** Wave C: the DO's pure helpers round the books (favour.ts, persons.ts fightTally) and the server's SETTLE (checked against the store's). */
const books = import.meta.glob(['../../../server/src/war/favour.ts', '../../../server/src/war/persons.ts', '../../../server/src/war/settlements.ts'], { eager: true }) as Record<string, Record<string, unknown>>;
const fav = books['../../../server/src/war/favour.ts'] as {
  builtFavour(room: object, secs: readonly (readonly [number, number])[]): [number, number][];
  lairsCleared(s: Snapshot, seen: Map<number, string>, paidElse?: (lair: number) => boolean): number[];
  landFavour(s: Snapshot): [number, number][];
  LAND_TICKS: number; LAIR_NEAR: number; FAVOUR_LOG: number;
};
const fightTally = (books['../../../server/src/war/persons.ts'] as { fightTally(r: FightReport): Map<number, { kills: number }> }).fightTally;
const SERVER_SETTLE = (books['../../../server/src/war/settlements.ts'] as { SETTLE: Record<string, number> }).SETTLE;

/** What the harness calls of WarRoom (server/src/war/room.ts); TradeRoom: wave B's (../roomTrade.ts). */
interface Room extends Omit<TradeRoom, 'sim'> {
  region: RegionData;
  currentTick: number;
  refusal: string;
  run: string;
  join(pid: number, m: unknown, persons?: unknown): { msg: ServerMsg; admitted: boolean };
  order(pid: number, o: unknown): string | null;
  view(pid: number, r: unknown): void;
  leave(pid: number): void;
  check(pid: number, c: unknown): ServerMsg;
  dev(pid: number, m: unknown): string | null;
  alive(): number;
  settlementsFor(pid: number): unknown[];
  squadsOf(pid: number): number[];
  snapshot(): Snapshot;
  spawnsNew(pid: number): boolean;
  personsHere(): Set<string>;
  takeReleased(): string[];
  setPath(pid: number, way: PlayerPath): void;
  setArmy(pid: number, n: number): void;
  setLarder(pid: number, goods: Record<string, number>): void;
  depart(pid: number, side: string, foeRadius: number): { fight?: { id: string; report: FightReport }; ids?: string[] } & Record<string, unknown>;
  arrive(pid: number, team: number, persons: WarPerson[], side: string, lost?: Record<string, number>, cargo?: unknown): Record<string, unknown> & { msg?: ServerMsg | null };
  muster(pid: number, persons: WarPerson[]): { msg: ServerMsg | null } | null;
  hired(pid: number, persons: WarPerson[]): { msg: ServerMsg | null } | null;
  levelUp(id: string, attrs: Record<string, number>, skill?: string): string;
  saveState(): Record<string, unknown>;
  sim: WarBuildSim;
  tick(): {
    frames: Map<number, Uint8Array>; msgs: Map<number, ServerMsg[]>; admitted: Map<number, ServerMsg>;
    fights: { id: string; report: FightReport }[]; souls: { pid: number; person: WarPerson; squad: number; unit: number }[]; raided: number[]; faded: string[];
    larder: { pid: number; goods: Record<string, number> }[];
    peace: PeaceOut | null; settle: SettleOut | null;
    crafted: { kind: 'crafted'; owner: string; order: number; what: string; item: { uid: string } }[]; bosses: unknown[]; freed: string[];
  } & LifeBooks;
  holdRows(): { ref: string; kind: string; pid: number; team: number; goods: Record<string, number>; items: never[] }[];
  mendUids(): string[];
  startGuide(pid: number, save: unknown): ServerMsg | null;
  startStory(pid: number, save: unknown): ServerMsg | null;
  startEncounters(pid: number, save: unknown): ServerMsg | null;
  storyChoose(pid: number, option: string): void;
  encounterChoose(pid: number, option: string): void;
  guide: { hide(pid: number): unknown; saveOf(pid: number): unknown };
  encounters: { road(pid: number, loads: number, key: string): void };
  setWorldEvents(evs: WorldEvent[]): void;
  wakeGuardians(): void;
  setWarlordAge(days: number): void;
  warlordMemory(): unknown;
  recallWarlords(m: unknown): void;
  memory(): unknown;
  recall(m: unknown, elapsed: number): void;
  summary(): unknown;
  present(): number;
  // wave C: settlements and politics (room.ts W-63, W-64, W-150, W-61)
  setSettlements(list: RoomSettle[]): void;
  setOaths(list: { vassal: number; lord: number; pct: number }[]): void;
  setPacts(list: { a: number; b: number; kind: 'pact' | 'truce' }[]): void;
  settlementReports(): { id: number; level: number; tended: boolean; persist: { pieces?: Piece[] } }[];
  titheReports(): HeldRow[];
  restorePieces(team: number, s: { x: number; y: number; r: number }, pieces: Piece[]): number | null;
  presence(pid: number, id: number): boolean;
  storeGoods(id: number): Record<string, number>;
  setGuards(list: GuardWatch[]): void;
  setWorks(team: number, ids: string[]): void;
  watchTownJob(j: { id: number; pid: number; x: number; y: number }): void;
  unwatchTownJob(id: number): void;
  pathPlayers(): number[];
  townBandIs(lair: number): boolean;
  setLevel(pid: number, level: number): void;
}
type Piece = { type: BuildingType; x: number; y: number; rot: 0 | 1; hp: number; goods?: Record<string, number> };
interface SettleOut { found: { centre: number; x: number; y: number; lord: number }[]; attacks: { by: number; victim: number }[]; taking: { point: number; holder: number; by: number }[] }
interface PeaceOut { labour: { pid: number; site: number; secs: number }[]; guards: unknown[]; works: { team: number; work: WorkId; by: Record<number, number> }[]; townJobs?: { id: number; pid: number; secs: number }[] }

/** What the DO books of a tick's region life (room.ts tick): the guide, story and encounter runs moved (their saves), the rest. */
interface LifeBooks {
  guided: { pid: number; save: unknown }[];
  storied: { pid: number; save: unknown }[];
  met: { pid: number; save: unknown }[];
  wild: unknown[];
  gathered: unknown[];
  warlord: unknown[];
}

type Out = [number, unknown];
const b64 = (b: Uint8Array) => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};
/** The room's clock in ms (regionDO.ts TICK_MS a tick): what the store's timers read. */
const TICK_MS = 100;

/**
 * The local transport and the Durable Object's books round the room (regionDO.ts), on the local store: a persons join
 * claims its men first (claimForJoin; refused: released), a welcome sets his path, army and larder and musters his men
 * off the field (W-98); each tick's fights, faded souls, raids, soul claims and larder draws go to the store as the DO
 * writes them to D1; dropped joins are released on a close and a restore.
 */
class TsLocal {
  room: Room;
  readonly store = new RoomStore();
  private conns: number[] = [];
  private saved = '';
  private readonly o: Record<string, unknown>;
  private worldEv: { events: WorldEvent[]; next: WorldEvent | null } | null = null;
  private woke: number | null = null;
  // wave C, the DO's own (in memory: a restore, an eviction, starts them over): sockets open, each player's settlements
  // view as last sent, persisted pieces and tithes as last reported, the lairs as favourTick last saw them
  private live = new Set<number>();
  private settleSent = new Map<number, string>();
  private persisted = new Map<number, string>();
  private heldKey = '';
  private lairsSeen = new Map<number, string>();
  private readonly trade = new TradeDo(() => this.room as unknown as TradeRoom, this.store, this.store.trade, (pid) => this.live.has(pid), () => this.now, (s) => this.wake(s));
  constructor(o: Record<string, unknown>) {
    this.o = { epoch: 'e', ...o };
    this.room = new room.WarRoom(this.o);
    this.room.run = 'r';
  }
  private get now() {
    return this.room.currentTick * TICK_MS;
  }
  /** regionDO.ts wakeIn: a named soul wakes in this room's sim (false: no shrine here). */
  private wake = (s: Soul) => this.room.sim.spawnNamedSoul(s.person, Math.ceil(s.lifeMs / TICK_MS), s.bar ? { owner: `p:${s.bar.pid}`, ticks: Math.ceil(s.bar.ms / TICK_MS) } : undefined);
  private conn(pid: number) {
    if (!this.conns.includes(pid)) this.conns.push(pid);
    this.live.add(pid);
  }
  // ---------------------------------------------------------------- wave C: regionDO.ts round the settlements and politics

  /** loadSettlements: the region's settlements, the oaths and the pacts in force into the room; open sockets whose view changed hear it. */
  private loadSettlements(out: Out[]) {
    const r = this.room, s = this.store;
    r.setSettlements(s.regionSettlements(r.region.id));
    r.setOaths(s.sworn());
    r.setPacts(s.pactsOf().filter((p) => p.endsAt === null || p.endsAt > this.now).map((p) => ({ a: p.a, b: p.b, kind: p.kind })));
    for (const pid of this.conns) if (this.live.has(pid) && this.settleSent.has(pid)) this.sendSettlements(pid, out);
  }
  /** sendSettlements: his view when it changed (`fresh`: anyway, a welcome). */
  private sendSettlements(pid: number, out: Out[], fresh = false) {
    const list = this.room.settlementsFor(pid), k = JSON.stringify(list);
    if (!fresh && this.settleSent.get(pid) === k) return;
    this.settleSent.set(pid, k);
    if (this.live.has(pid)) out.push([pid, { t: 'settlements', list }]);
  }
  /** restoreSettlements: a fresh field: each settlement's persisting pieces down again under its lord's alliance; the centres re-keyed. */
  private restoreSettlements() {
    const r = this.room, s = this.store, region = r.region.id, rows = s.persisted(region);
    if (!rows.length) return;
    const list = s.regionSettlements(region), moved: [number, number][] = [];
    for (const row of rows) {
      const st = list.find((x) => x.id === row.id), pieces = (JSON.parse(row.persist) as { pieces?: Piece[] }).pieces ?? [];
      if (!st || st.team === null || !pieces.length) continue;
      const centre = r.restorePieces(st.team, st, pieces);
      if (centre !== null) moved.push([st.id, centre]);
    }
    s.rekey(region, moved);
  }
  /** reportSettlements: level, tending and persisting pieces (`all`: the pieces even when unchanged). */
  private reportSettlements(mode: 'tick' | 'all') {
    for (const x of this.room.settlementReports()) {
      const p = JSON.stringify(x.persist), fresh = mode !== 'tick' || this.persisted.get(x.id) !== p;
      this.store.report(x.id, { ...(x.level > 0 ? { level: x.level } : {}), tended: x.tended, ...(fresh ? { persist: x.persist } : {}) }, this.now);
      this.persisted.set(x.id, p);
    }
  }
  /** reportTithes: what is set aside in the region's buildings, when it changed. */
  private reportTithes() {
    const rows = this.room.titheReports(), key = JSON.stringify(rows);
    if (key === this.heldKey) return;
    this.store.reportHeld(this.room.region.id, rows);
    this.heldKey = key;
  }
  /** pollPeace: the guard contracts watched here, the home alliance's open works, every alliance's work bonuses, the levels. */
  private pollPeace() {
    const r = this.room, s = this.store, region = r.region.id;
    r.setGuards(s.guardsIn(region));
    const home = ALLIANCE_LIST.find((a) => a.home === region);
    if (home) r.setWorks(home.id, s.openWorks(home.id));
    const b = s.bonusesOf();
    for (const a of ALLIANCE_LIST) r.sim.setBonus(a.id, b.get(a.id) ?? {});
    const players = r.pathPlayers();
    if (players.length) for (const [pid, level] of s.levelsOf(players)) r.setLevel(pid, level);
  }
  /** The wave C books of a tick (regionDO.ts outputs): favour, the peace's labour, the settlements' foundings, attacks and claims, the polls. */
  private politics(res: { peace: PeaceOut | null; settle: SettleOut | null }, out: Out[]) {
    const r = this.room, s = this.store, region = r.region.id, now = this.now, tick = r.currentTick;
    // favourTick (W-66): lairs cleared, land held
    const snap = r.snapshot();
    for (const pid of fav.lairsCleared(snap, this.lairsSeen, (l) => r.townBandIs(l))) s.addFavour(pid, FAVOUR_EARN.lair, 'lair', now);
    if (tick % fav.LAND_TICKS === 7) for (const [pid, n] of fav.landFavour(snap)) s.addFavour(pid, n, 'land', now);
    const pz = res.peace;
    if (pz) {
      for (const w of pz.works) s.addLabour(w.team, w.work, w.by, now);
      for (const [pid, n] of fav.builtFavour(r, [...pz.labour.map((l) => [l.pid, l.secs] as const), ...pz.works.flatMap((w) => Object.entries(w.by).map(([p, secs]) => [Number(p), secs] as const)), ...(pz.townJobs ?? []).map((j) => [j.pid, j.secs * BOARD.labourFavour] as const)])) s.addFavour(pid, n, 'built', now);
    }
    if (tick % 300 === 1) this.pollPeace(); // PEACE_POLL
    const st = res.settle;
    if (st?.found.length) {
      const home = ALLIANCE_LIST.some((a) => a.home === region);
      for (const f of st.found) {
        const got = s.found({ region, centre: f.centre, x: f.x, y: f.y, lord: f.lord }, (c) => foundRefusal(r.snapshot(), home, c), now);
        if (typeof got === 'string') s.notify([f.lord], { t: 'crownNews', kind: 'noFounding', text: `Your camp stands, but it founds no settlement. ${got}.`, region });
      }
      this.loadSettlements(out);
    }
    for (const a of st?.attacks ?? []) {
      const l = s.logAttack(a.by, a.victim, now), name = s.regionSettlements(region).find((x) => x.id === a.victim)?.name ?? '';
      if (l.tell.length) s.notify(l.tell, { t: 'settlementAttacked', settlement: a.victim, name, region, by: a.by, broken: l.broken });
      const p = s.pactAttack(a.by, a.victim, now);
      if (p.tell.length) s.notify(p.tell, { t: 'crownNews', kind: 'pactBroken', text: p.text, region });
    }
    for (const c of st?.taking ?? []) {
      const pids = [...s.alliances].filter(([, a]) => a === c.holder).map(([pid]) => pid);
      if (pids.length) s.notify(pids, { t: 'claimAttacked', region, name: r.region.name, point: c.point, by: c.by });
    }
    if (tick % 100 === 3) { // SETTLE_POLL
      this.loadSettlements(out);
      if (tick % 600 === 3) (this.reportSettlements('tick'), this.reportTithes()); // SETTLE_REPORT
    }
  }
  private flush() {
    this.store.release(this.room.region.id, this.room.takeReleased());
  }
  /** regionDO.ts muster: his men off the field here fall in (no room: they stay claimed, off the field). */
  private muster(pid: number, out: Out[]) {
    const r = this.room, here = r.personsHere(), ids = this.store.offField(pid, r.region.id, here, this.now, this.wake);
    if (!ids.length) return;
    const got = this.store.claimForJoin(pid, r.region.id, [ids], here, this.now, this.wake);
    if (typeof got === 'string') return;
    const m = r.muster(pid, got[0]);
    if (m?.msg) out.push([pid, m.msg]);
  }
  send(pid: number, raw: unknown): Out[] {
    this.conn(pid);
    const out: Out[] = [], tell = (m: unknown) => out.push([pid, m]);
    const m = parseClientMsg(JSON.stringify(raw));
    const r = this.room, region = r.region.id;
    if (!m) return tell({ t: 'error', code: 'parse' }), out;
    if (m.t === 'join') {
      this.loadSettlements(out); // W-63: the settlements as they stand now: the room flies his banner by ground
      let persons: WarPerson[][] | undefined;
      if (m.squads && m.region === region && r.spawnsNew(pid)) {
        const got = this.store.claimForJoin(pid, region, m.squads, r.personsHere(), this.now, this.wake);
        if (typeof got === 'string') return tell({ t: 'refused', reason: 'army', detail: got }), out;
        persons = got;
      }
      const res = r.join(pid, m, persons);
      tell(res.msg);
      if (res.msg.t === 'welcome' && this.worldEv) tell({ t: 'worldEvents', ...this.worldEv }); // W-62
      if (res.msg.t === 'welcome') this.sendSettlements(pid, out, true); // W-63
      if (res.msg.t === 'refused' && persons) this.store.release(region, m.squads!.flat());
      // the DO's D1 reads (path, army, larder, muster) for a persons join; a dev class army has no men in the store, so
      // the room counts his field (as a DO with no D1)
      if (res.msg.t === 'welcome' && m.squads) {
        r.setPath(pid, this.store.path(pid));
        r.setArmy(pid, this.store.armyCount(pid));
        this.welcomed(pid, tell, () => r.setLarder(pid, this.store.goodsOf(pid)));
        this.muster(pid, out);
      } else if (res.msg.t === 'welcome') this.welcomed(pid, tell);
    } else if (m.t === 'order') {
      const err = r.order(pid, m.o);
      if (err) tell({ t: 'error', code: err, detail: err === 'notYourGround' || err === 'atPeace' ? r.refusal : m.o.kind });
    } else if (m.t === 'view') r.view(pid, m);
    else if (m.t === 'ping') tell({ t: 'pong', c: m.c, tick: r.currentTick, idle: r.alive() === 0 });
    else if (m.t === 'check') tell(r.check(pid, m));
    else if (m.t === 'dev') {
      const err = r.dev(pid, m);
      if (err) tell({ t: 'error', code: err, detail: `dev ${m.op}${err === 'forbidden' ? ': needs DEV_AUTH=1' : ''}` });
    } else if (m.t === 'guide') {
      const g = r.guide.hide(pid);
      if (g) this.store.keep('guide', pid, g);
    } else if (m.t === 'story') r.storyChoose(pid, m.option); // W-65
    else if (m.t === 'encounter') r.encounterChoose(pid, m.option); // W-65
    else if (m.t === 'mend') this.trade.mend(pid, m, tell); // wave B: holders and trade
    else if (m.t === 'stow') this.trade.stow(pid, m, tell);
    else if (m.t === 'npc') this.trade.npc(pid, m, out);
    else if (m.t === 'board') this.trade.board(pid, m, tell);
    else if (m.t === 'handoff') this.trade.handoff(pid, m, out);
    return out;
  }
  /** regionDO.ts guideStart, storyStart, encounterStart, each from its save in the store (`between`: the DO's setLarder). */
  private welcomed(pid: number, tell: (m: unknown) => void, between?: () => void) {
    const r = this.room, s = this.store, save = s.saveOf('guide', pid);
    const g = r.startGuide(pid, save);
    const fresh = save ? null : r.guide.saveOf(pid); // W-79: kept at once, so the rations are packed only once
    if (fresh) s.keep('guide', pid, fresh);
    if (g) tell(g);
    between?.();
    const st = r.startStory(pid, s.saveOf('story', pid));
    if (st) tell(st);
    const en = r.startEncounters(pid, s.saveOf('encounter', pid));
    if (en) tell(en);
  }
  /** The world's RPC (regionDO.ts worldEvents and applyEvents). */
  world(events: WorldEvent[], next: WorldEvent | null, now: number): Out[] {
    this.worldEv = { events, next };
    const mine = events.filter((e) => e.region === this.room.region.id && e.startAt <= now && now < e.endAt);
    this.room.setWorldEvents(mine);
    const wake = mine.find((e) => e.kind === 'bossWake');
    if (wake && this.woke !== wake.startAt) {
      this.room.wakeGuardians();
      this.woke = wake.startAt;
    }
    return this.conns.map((pid) => [pid, { t: 'worldEvents', events, next }]);
  }
  /** The socket went away (regionDO.ts webSocketClose): his squads hold where they stand. */
  close(pid: number): Out[] {
    this.room.leave(pid);
    this.flush();
    this.live.delete(pid);
    return [];
  }
  /**
   * One room tick: the tick's books into the store (regionDO.ts outputs), then per client his messages and frame, then
   * the guide, story and encounter saves of the tick into the store. `books`: what the tick handed the DO, each
   * non-empty one.
   */
  tick(): { out: Out[]; books?: unknown } {
    const r = this.room, res = r.tick(), out: Out[] = [], region = r.region.id, s = this.store;
    for (const f of res.fights) {
      if (s.applyFight(f.id, region, f.report, this.now)) s.bookFight(region, fightTally(f.report), this.now); // W-64: the crown's war goals' shares
      for (const pid of new Set(f.report.persons.filter((x) => x.state === 'captive').map((x) => Number(x.owner.slice(2))))) r.setArmy(pid, s.armyCount(pid));
    }
    for (const id of res.faded) s.fade(id);
    s.freeRaided(region, res.raided, this.now, this.wake);
    for (const c of res.souls) {
      if (!s.claimSoul(c.pid, c.person, region)) r.sim.dropPersons([c.person.id]);
      r.setArmy(c.pid, s.armyCount(c.pid));
    }
    for (const { pid, goods } of res.larder) {
      s.take(pid, goods);
      r.setLarder(pid, s.goodsOf(pid));
    }
    s.trade.applyCrafts(region, r.run, res.crafted as never); // wave B: crafted items written back, mends freed
    s.trade.returnMends(region, res.freed);
    for (const pid of this.conns) {
      const w = res.admitted.get(pid);
      if (w) out.push([pid, w]);
      if (w?.t === 'welcome') this.welcomed(pid, (m) => out.push([pid, m])); // W-62, W-65: in from the line
      if (w?.t === 'welcome') this.sendSettlements(pid, out, true); // W-63
      for (const m of res.msgs.get(pid) ?? []) out.push([pid, m]);
      const f = res.frames.get(pid);
      if (f) out.push([pid, { frame: b64(f) }]);
    }
    this.politics(res, out); // wave C: the settlements' and the peace's books, the polls
    for (const g of res.guided) s.keep('guide', g.pid, g.save);
    for (const g of res.storied) s.keep('story', g.pid, g.save);
    for (const g of res.met) s.keep('encounter', g.pid, g.save);
    // W-185: his Kills done by the wild's deeds: ready, and told
    const by = new Map<number, { kind: string; key: string }[]>();
    for (const x of res.wild as { pid: number; kind: string; key: string }[]) (by.get(x.pid) ?? by.set(x.pid, []).get(x.pid)!).push(x);
    for (const [pid, xs] of by) if (s.trade.boardDeeds(pid, region, xs)) this.trade.boardReady(pid, out);
    const all: Record<string, unknown[]> = {
      fights: res.fights, raided: res.raided, souls: res.souls.map((c) => ({ pid: c.pid, person: c.person.id, squad: c.squad, unit: c.unit })), faded: res.faded,
      guided: res.guided, storied: res.storied, met: res.met, wild: res.wild, larder: res.larder, gathered: res.gathered, warlord: res.warlord,
      crafted: res.crafted, bosses: res.bosses, freed: res.freed,
    };
    const books: Record<string, unknown> = Object.fromEntries(Object.entries(all).filter(([, v]) => v.length));
    if (res.peace) books.peace = res.peace; // wave C
    if (res.settle) books.settle = res.settle;
    return { out, ...(Object.keys(books).length ? { books } : {}) };
  }
  /** A call the DO (or the world) makes on the room, or a store seed; its result. */
  call(op: string, a: unknown[], sha: Sha): { res: unknown; out: Out[] } {
    const r = this.room, s = this.store, region = r.region.id, out: Out[] = [];
    const persons = (ids: string[]) => ids.map((id) => structuredClone(s.recs.find((x) => x.id === id)!.person));
    if (op === 'seed') {
      const [pid, ps, goods, at] = a as [number, WarPerson[], Record<string, number> | null, string | null];
      for (const p of ps) s.add(pid, p, at);
      if (goods) s.goods.set(pid, { ...goods });
      return { res: null, out };
    }
    if (op === 'depart') {
      const res = r.depart(...(a as [number, string, number]));
      if (res.fight) s.applyFight(res.fight.id, region, res.fight.report, this.now);
      if (res.ids) s.release(region, res.ids);
      return { res, out };
    }
    if (op === 'arrive') {
      const [pid, team, ids, side, lost, cargo] = a as [number, number, string[], string, Record<string, number>, unknown];
      const { msg, ...res } = r.arrive(pid, team, persons(ids), side, lost, cargo ?? undefined);
      if (!('error' in res)) for (const id of ids) s.recs.find((x) => x.id === id)!.region = region;
      if (msg) out.push([pid, msg]);
      return { res, out };
    }
    if (op === 'muster') return this.muster(a[0] as number, out), { res: null, out };
    if (op === 'hired') {
      const [pid, ids] = a as [number, string[]];
      const got = s.claimForJoin(pid, region, [ids], r.personsHere(), this.now, this.wake);
      if (typeof got === 'string') return { res: got, out };
      const res = r.hired(pid, got[0]);
      if (res?.msg) out.push([pid, res.msg]);
      return { res: res === null ? null : 'ok', out };
    }
    if (op === 'levelUp') return { res: r.levelUp(a[0] as string, a[1] as Record<string, number>, (a[2] as string | null) ?? undefined), out };
    if (op === 'setPath') {
      s.paths.set(a[0] as number, a[1] as PlayerPath);
      r.setPath(a[0] as number, a[1] as PlayerPath);
      return { res: null, out };
    }
    if (op === 'spawnSoul') return { res: r.sim.spawnSoul(...(a as [number, number, string, number])), out };
    if (op === 'save') {
      const st = r.saveState(), { sim, bots, ...head } = st;
      this.saved = JSON.stringify(st);
      s.trade.saveHolds(region, r.holdRows()); // M6e: the stash screen's snapshot
      return { res: { sha: sha(this.saved), len: this.saved.length, head, sim: sha(JSON.stringify(sim)), bots: sha(JSON.stringify(bots)) }, out };
    }
    if (op === 'restore') {
      const st = JSON.parse(this.saved) as { pids: string[] };
      this.room = room.WarRoom.restore(this.o, st, s.deployed(region, st.pids));
      s.trade.keepMends(region, this.room.mendUids());
      this.flush();
      // an eviction: the DO's memory starts over; ensure() polls the settlements into the restored room
      this.settleSent.clear();
      this.persisted.clear();
      this.heldKey = '';
      this.lairsSeen = new Map();
      this.loadSettlements(out);
      return { res: null, out };
    }
    // wave C: store seeds (what REST, the crown and the season sweep leave in D1) and the DO's calls round the settlements
    if (op === 'ally') {
      const [pid, team, name] = a as [number, number, string];
      s.alliances.set(pid, team);
      s.names.set(pid, name);
      return { res: null, out };
    }
    if (op === 'settlement') return { res: s.addSettlement({ region, tendedAt: 0, level: 0, overlord: null, tribute: 0, persist: '{}', ...(a[0] as object) } as Parameters<RoomStore['addSettlement']>[0]), out };
    if (op === 'member') return s.addMember(...(a as [number, number, 'citizen', null]), this.now), { res: null, out };
    if (op === 'oath') return s.swear(...(a as [number, number, number | null])), { res: null, out };
    if (op === 'pact') return { res: s.addPact(...(a as [number, number, 'pact', number | null])), out };
    if (op === 'order') return { res: s.addOrder(...(a as [number, 'attack', string, number])), out };
    if (op === 'guard') return s.addGuard(region, a[0] as GuardWatch), { res: null, out };
    if (op === 'giveWork') return s.giveWork(...(a as [number, WorkId, Record<string, number>])), { res: null, out };
    if (op === 'townJob') return r.watchTownJob(a[0] as { id: number; pid: number; x: number; y: number }), { res: null, out };
    if (op === 'endTownJob') return r.unwatchTownJob(a[0] as number), { res: null, out };
    if (op === 'fresh') return this.restoreSettlements(), this.loadSettlements(out), { res: null, out }; // ensure() on a fresh room
    if (op === 'poll') return this.loadSettlements(out), { res: null, out };
    if (op === 'peacePoll') return this.pollPeace(), { res: null, out };
    if (op === 'report') return this.reportSettlements('all'), this.reportTithes(), { res: { reports: r.settlementReports(), tithes: r.titheReports() }, out };
    if (op === 'presence') return { res: r.presence(a[0] as number, a[1] as number), out };
    if (op === 'storeGoods') return { res: r.storeGoods(a[0] as number), out };
    // wave B seeds and helpers: items into his stash, a rented site, a guardian hurt
    if (op === 'stash') {
      for (const it of a[1] as { uid: string }[]) s.trade.placeItem(a[0] as number, `sr:${a[0]}`, it as never);
      return { res: null, out };
    }
    if (op === 'rent') return { res: s.trade.rentSite(a[0] as number, a[1] as string, a[2] as 'stall', this.now), out };
    if (op === 'snap') return { res: (r.snapshot() as unknown as Record<string, unknown>)[a[0] as string] ?? null, out }; // a look at the snapshot (its piles, its buildings)
    if (op === 'hurtBoss') return { res: (r.sim as unknown as { hurtBoss(id: string, dmg: number, owner: string): void }).hurtBoss(a[0] as string, a[1] as number, a[2] as string) ?? null, out };
    throw new Error(`unknown op ${op}`);
  }
}

/**
 * One scripted step: a client message (made from the room as it stands), `n` ticks, a socket closed, a call
 * (TsLocal.call), the world's events, the warlords' age, a road crossed (W-197: robbers?), or a look at the room: its
 * memory (and a recall of the last one, `recall` ticks later), its summary, the warlords' memory (and a recall of it).
 */
type Step =
  | { pid: number; msg: (r: Room) => unknown }
  | { ticks: number }
  | { close: number }
  | { op: string; args: (r: Room, s: RoomStore) => unknown[] }
  | { world: { events: WorldEvent[]; next: WorldEvent | null; now: number } }
  | { age: number }
  | { road: { pid: number; loads: number; key: string } }
  | { look: 'memory' | 'summary' | 'lords' }
  | { recall: number }
  | { recallLords: true };
const army = (region: string, pid: number, team: number, groups: [string, number][], v = NET_VERSION) =>
  ({ t: 'join', v, region, playerId: pid, team, army: groups.map(([cls, count]) => ({ cls, count })) });
const squads = (region: string, pid: number, team: number, ids: string[][]) => ({ t: 'join', v: NET_VERSION, region, playerId: pid, team, squads: ids });
const squad = (r: Room, pid: number, i = 0) => r.squadsOf(pid)[i];
const centre = (r: Room, sq: number) => {
  const us = r.snapshot().units.filter((u) => u.squad === sq && u.state !== 'dead');
  return { x: us.reduce((a, u) => a + u.x, 0) / us.length, y: us.reduce((a, u) => a + u.y, 0) / us.length };
};
/** The nearest tile centre round (x,y) where `team` may place `type` (a spiral out to 30 tiles). */
const spotFor = (r: Room, team: number, type: BuildingType, x: number, y: number) => {
  for (let d = 0; d < 30; d++)
    for (let dy = -d; dy <= d; dy++)
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        const p = { x: Math.round(x) + dx + 0.5, y: Math.round(y) + dy + 0.5 };
        if (r.sim.checkPlacement(team, type, p.x, p.y).ok) return p;
      }
  return { x: Math.round(x) + 0.5, y: Math.round(y) + 0.5 };
};
const lair = (r: Room) => (r.snapshot().lairs ?? []).find((l) => l.state !== 'cleared')!;

/** test-ridge with its lairs: joins, the line, orders and refusals, checks, dev helpers, a fight, a camp. */
function ridge(): Step[] {
  const R = 'test-ridge';
  return [
    { pid: 1, msg: () => ({ t: 'ping', c: 7 }) },
    { pid: 1, msg: () => ({ t: 'order', o: { kind: 'hold', squad: 0 } }) }, // not joined
    { pid: 1, msg: () => army(R, 1, 0, [['hoplite', 12]], 99) }, // wrong version
    { pid: 1, msg: () => ({ t: 'nonsense' }) }, // parse
    { pid: 1, msg: () => army(R, 1, 0, [['hoplite', 12], ['archer', 10]]) },
    { pid: 2, msg: () => army(R, 2, 1, [['hoplite', 12]]) },
    { pid: 3, msg: () => army(R, 3, 0, [['peltast', 10]]) }, // over the quota: the line
    { pid: 2, msg: () => army(R, 2, 0, [['hoplite', 4]]) }, // already in alliance 1
    { ticks: 3 },
    { pid: 1, msg: (r) => { const c = centre(r, squad(r, 1)); return { t: 'view', x0: c.x - 30, y0: c.y - 20, x1: c.x + 30, y1: c.y + 20 }; } },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: squad(r, 1), x: 190, y: 62 } }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: squad(r, 2), x: 10, y: 10 } }) }, // not his
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'attack', squad: squad(r, 1), target: squad(r, 1, 1) } }) }, // his own
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: squad(r, 1), x: -4, y: 10 } }) }, // off the map
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'formation', squad: squad(r, 1, 1), shape: 'wedge' } }) },
    { ticks: 20 },
    { pid: 1, msg: () => ({ t: 'dev', op: 'stock', res: 'wood', n: 400 }) },
    { pid: 1, msg: () => ({ t: 'dev', op: 'stock', res: 'stone', n: 200 }) },
    { pid: 1, msg: () => ({ t: 'dev', op: 'claim', x: 190, y: 66, r: 24 }) },
    { ticks: 1 },
    { pid: 1, msg: (r) => { const c = centre(r, squad(r, 1)); return { t: 'check', id: 1, kind: 'building', type: 'camp', x: Math.round(c.x) + 0.5, y: Math.round(c.y + 8) + 0.5 }; } },
    { pid: 1, msg: (r) => ({ t: 'check', id: 4, kind: 'building', type: 'camp', ...spotFor(r, 0, 'camp', 190, 68) }) },
    { pid: 1, msg: () => ({ t: 'check', id: 2, kind: 'wall', material: 'wood', points: [182, 76, 196, 76] }) },
    { pid: 2, msg: () => ({ t: 'check', id: 3, kind: 'building', type: 'storehouse', x: 5, y: 5 }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'placeBuilding', type: 'camp', ...spotFor(r, 0, 'camp', 190, 68) } }) },
    { ticks: 2 },
    { pid: 1, msg: (r) => { const s = (r.snapshot().buildings ?? []).find((b) => b.team === 0 && b.state !== 'done'); return { t: 'order', o: { kind: 'build', squad: squad(r, 1), site: s?.id ?? 0 } }; } },
    { pid: 1, msg: (r) => { const c = centre(r, squad(r, 1)); return { t: 'dev', op: 'spawn', team: 2, cls: 'hoplite', count: 6, x: Math.round(c.x) + 9, y: Math.round(c.y) + 3 }; } }, // a foe at hand: a fight
    { pid: 2, msg: (r) => { const c = centre(r, squad(r, 1)); return { t: 'dev', op: 'spawn', team: 1, cls: 'archer', count: 5, x: Math.round(c.x) - 10, y: Math.round(c.y) + 6 }; } }, // his own
    { pid: 2, msg: () => ({ t: 'dev', op: 'skip', ticks: 15 }) },
    { ticks: 60 },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'attack', squad: squad(r, 1, 1), target: lair(r).squad } }) },
    { pid: 2, msg: (r) => ({ t: 'order', o: { kind: 'attackMove', squad: squad(r, 2), x: centre(r, squad(r, 1)).x, y: centre(r, squad(r, 1)).y } }) },
    { pid: 1, msg: () => ({ t: 'ping', c: 8 }) },
    { ticks: 120 },
    { close: 2 }, // his squads hold
    { ticks: 140 },
    { pid: 2, msg: () => army(R, 2, 1, [['hoplite', 12]]) }, // a rejoin: his squads back, none spawned
    { pid: 1, msg: () => ({ t: 'view', x0: 0, y0: 0, x1: 511, y1: 511 }) },
    { ticks: 150 },
  ];
}

/** Men of a player for the store: ids `${p}1..n` of class cls at `level` (roster.ts makePerson). */
const men = (p: string, cls: string, n: number, level = 1) => Array.from({ length: n }, (_, i) => makePerson(`${p}${i + 1}`, cls, { level }));

/**
 * test-ridge as alliance 0's home (the W-80 larder), with persons: joins claimed from the store and their refusals, a
 * muster of men lying here, a camp (his men's packs topped up from his strongroom by it), level-ups and a path, a foe
 * arriving over the border into a fight (wounded, dead, captives held at the camp, honours, the fight written back),
 * soul claims (one taken, one refused by the cap), the captives freed by a raid on the camp, hires, transfers out and
 * in, then a save and a restore that plays on and a rejoin.
 */
function persons(): Step[] {
  const R = 'test-ridge';
  const h = men('h', 'hoplite', 8, 3), a = men('a', 'archer', 6, 2), f = men('f', 'hoplite', 5).concat(men('g', 'peltast', 4));
  h[0] = { ...h[0], hero: { ...h[0].hero, points: 2 } };
  const site = (r: Room) => (r.snapshot().buildings ?? []).find((b) => b.type === 'camp') ?? { id: 0, x: 190, y: 64 };
  return [
    { op: 'seed', args: () => [1, [...h, ...a], { food: 40, ration: 5 }, null] },
    { op: 'seed', args: () => [1, men('m', 'hoplite', 2), null, R] }, // healed men lying here: they muster on his join
    { op: 'seed', args: () => [2, [...f, ...men('c', 'civ_forager', 3)], null, null] },
    { pid: 1, msg: () => squads(R, 1, 0, [h.map((p) => p.id), a.map((p) => p.id)]) },
    { pid: 3, msg: () => squads(R, 3, 0, [['h1']]) }, // not his
    { pid: 1, msg: () => squads(R, 1, 0, [['h1']]) }, // already in the field
    { pid: 1, msg: () => squads(R, 1, 0, [['a1', 'a1']]) }, // listed twice
    { pid: 1, msg: () => squads(R, 1, 0, [['zz']]) }, // nobody
    { pid: 1, msg: (r) => { const c = centre(r, squad(r, 1)); return { t: 'view', x0: c.x - 40, y0: c.y - 10, x1: c.x + 40, y1: c.y + 70 }; } },
    { pid: 1, msg: () => ({ t: 'dev', op: 'claim', x: 190, y: 62, r: 30 }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'placeBuilding', type: 'camp', ...spotFor(r, 0, 'camp', 190, 64) } }) },
    { ticks: 2 },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'build', squad: squad(r, 1), site: site(r).id } }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'build', squad: squad(r, 1, 2), site: site(r).id } }) },
    { ticks: 420 },
    { op: 'levelUp', args: () => ['h1', { str: 1, end: 1 }, null] },
    { op: 'levelUp', args: () => ['a2', { str: 9 }, null] },
    { op: 'levelUp', args: () => ['zz', { str: 1 }, null] },
    { op: 'setPath', args: () => [1, { path: 'warrior', family: 'line', level: 3 }] },
    // a foe over the north border, by his archers at the entry: they fight
    { op: 'arrive', args: () => [2, 1, f.map((p) => p.id), 'N', { f1: 6, g2: 3 }, { packs: { f2: { lots: [{ r: 'wood', n: 3, o: 'elaia' }], items: [] }, zz: { lots: [{ r: 'food', n: 2, o: 'elaia' }], items: [] } } }] },
    { op: 'arrive', args: () => [2, 0, ['c1'], 'N', {}, null] }, // another alliance
    { pid: 2, msg: () => squads(R, 2, 1, [['f1']]) }, // a rejoin of the men standing here
    { pid: 2, msg: (r) => { const c = centre(r, squad(r, 2)); return { t: 'view', x0: c.x - 40, y0: c.y - 10, x1: c.x + 40, y1: c.y + 70 }; } },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'attack', squad: squad(r, 1, 1), target: squad(r, 2) } }) },
    { pid: 2, msg: (r) => ({ t: 'order', o: { kind: 'attack', squad: squad(r, 2), target: squad(r, 1, 1) } }) },
    { ticks: 70 },
    { pid: 2, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: squad(r, 2), x: 236, y: 14 } }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'hold', squad: squad(r, 1, 1) } }) },
    { ticks: 110 },
    // souls: his rival takes one; his own is refused by his cap (warrior: 12)
    { op: 'spawnSoul', args: (r) => { const c = centre(r, squad(r, 2)); return [Math.round(c.x) + 0.5, Math.round(c.y) + 3.5, 'hoplite', 2]; } },
    { pid: 2, msg: (r) => ({ t: 'order', o: { kind: 'claimSoul', squad: squad(r, 2), soul: (r.sim.snapshot().souls ?? []).at(-1)!.id } }) },
    { op: 'spawnSoul', args: (r) => { const c = centre(r, squad(r, 1, 1)); return [Math.round(c.x) + 0.5, Math.round(c.y) + 3.5, 'hoplite', 1]; } },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'claimSoul', squad: squad(r, 1, 1), soul: (r.sim.snapshot().souls ?? []).at(-1)!.id } }) },
    { ticks: 60 },
    // his men walk off and he goes; the rival's raid the camp: the captives held there go free (no shrine here: they fade)
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: squad(r, 1), x: 120, y: 62 } }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: squad(r, 1, 2), x: 124, y: 66 } }) },
    { pid: 2, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: squad(r, 2), x: site(r).x, y: site(r).y + 3 } }) },
    { ticks: 60 },
    { close: 1 },
    { ticks: 430 },
    { pid: 1, msg: () => squads(R, 1, 0, [['h1']]) }, // a rejoin: his squads back
    { op: 'muster', args: () => [1] },
    { op: 'hired', args: () => [2, ['c2']] }, // none of his workers here: a squad of his own
    { op: 'hired', args: () => [2, ['c3']] }, // into it
    { ticks: 2 },
    { op: 'depart', args: () => [1, 'W', 400] }, // foes in reach
    { op: 'depart', args: () => [2, 'N', 2] },
    { ticks: 5 },
    { op: 'arrive', args: (_r, s) => [2, 1, s.recs.filter((x) => x.pid === 2 && x.state === 'active' && x.region === null && !x.person.hero.cls?.startsWith('civ_')).map((x) => x.id), 'N', {}, null] },
    { ticks: 20 },
    { op: 'save', args: () => [] },
    { op: 'restore', args: () => [] },
    { ticks: 30 },
    { pid: 1, msg: () => squads(R, 1, 0, [['h1']]) }, // a rejoin after the restore
    { op: 'save', args: () => [] },
    { ticks: 40 },
  ];
}

/**
 * test-ridge, an open fight between persons: two souls claimed in the same tick by a warrior one short of his cap (the
 * soul gate lets both by, the store's count takes one and the other leaves the field), then his veterans, one XP short
 * of a level, against a dozen militia: level-ups baked in the fight, honours (Veteran), the wounded beside their friends
 * (deeds and scars), captives with no camp to hold them, the dead stripped of their gear, all written back.
 */
function veterans(): Step[] {
  const R = 'test-ridge';
  const v = men('v', 'hoplite', 6, 4).map((p) => ({ ...p, hero: { ...p.hero, xp: 155 } })), w = men('w', 'hoplite', 5, 2), x = men('x', 'militia', 12);
  const soulBy = (r: Room, sq: number): unknown[] => { const c = centre(r, sq); return [Math.round(c.x) + 0.5, Math.round(c.y) + 0.5, 'hoplite', 1]; };
  const last = (r: Room) => (r.sim.snapshot().souls ?? []).at(-1)!.id;
  return [
    { op: 'seed', args: () => [1, [...v, ...w], null, null] },
    { op: 'seed', args: () => [2, x, null, null] },
    { op: 'setPath', args: () => [1, { path: 'warrior', family: 'line', level: 1 }] },
    { pid: 1, msg: () => squads(R, 1, 0, [v.map((p) => p.id), w.map((p) => p.id)]) },
    { ticks: 3 },
    { pid: 1, msg: (r) => { const c = centre(r, squad(r, 1)); return { t: 'view', x0: c.x - 40, y0: c.y - 30, x1: c.x + 40, y1: c.y + 50 }; } },
    { op: 'spawnSoul', args: (r) => soulBy(r, squad(r, 1)) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'claimSoul', squad: squad(r, 1), soul: last(r) } }) },
    { op: 'spawnSoul', args: (r) => soulBy(r, squad(r, 1, 1)) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'claimSoul', squad: squad(r, 1, 1), soul: last(r) } }) },
    { ticks: 50 },
    // the fight: militia come over the north border by him; both his squads on them, they on his first
    { op: 'arrive', args: () => [2, 1, x.map((p) => p.id), 'N', {}, null] },
    { pid: 2, msg: () => squads(R, 2, 1, [x.map((p) => p.id)]) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'attack', squad: squad(r, 1), target: squad(r, 2) } }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'attack', squad: squad(r, 1, 1), target: squad(r, 2) } }) },
    { pid: 2, msg: (r) => ({ t: 'order', o: { kind: 'attack', squad: squad(r, 2), target: squad(r, 1) } }) },
    { ticks: 200 },
    // a save mid-fight, restored after it: the fallen are gone from the store and leave the room
    { op: 'save', args: () => [] },
    { ticks: 130 },
    { op: 'restore', args: () => [] },
    { ticks: 20 },
    { op: 'save', args: () => [] },
  ];
}

/**
 * Elaia, the home of alliance 0 (W-62 the guide): new players' guides (their rations packed, the guide's camp woken; a
 * full army closes the soul step unpaid, a small one wakes the guide's soul), his men at the camp (the lair step,
 * paid), the guide hidden and his save kept; a player of another alliance has none. The wild's deeds (a lair cleared
 * near his men).
 */
function home(): Step[] {
  const R = 'elaia';
  const at = (r: Room) => (r.snapshot().lairs ?? []).filter((l) => l.kind === 'bandit').at(-1)!; // the guide's camp, woken last
  return [
    { pid: 1, msg: () => army(R, 1, 0, [['hoplite', 12], ['archer', 12], ['hoplite', 12]]) }, // a full army: the soul step unpaid
    { pid: 2, msg: () => army(R, 2, 1, [['peltast', 8]]) }, // not of the home alliance: no guide
    { pid: 3, msg: () => army(R, 3, 0, [['hoplite', 3]]) }, // a new player of the home alliance, under his cap: the guide's soul woken (its camp stands)
    { ticks: 2 },
    { pid: 1, msg: () => ({ t: 'view', x0: 0, y0: 0, x1: 511, y1: 511 }) },
    ...[0, 1, 2].map((i): Step => ({ pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'attack', squad: squad(r, 1, i), target: at(r).squad } }) })),
    { ticks: 20 },
    { pid: 1, msg: () => ({ t: 'dev', op: 'skip', ticks: 600 }) },
    { ticks: 30 },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'attackMove', squad: squad(r, 1), x: at(r).x, y: at(r).y } }) },
    { pid: 1, msg: () => ({ t: 'dev', op: 'skip', ticks: 600 }) },
    { ticks: 60 },
    { pid: 1, msg: () => ({ t: 'guide', op: 'hide' }) },
    { pid: 1, msg: () => ({ t: 'story', op: 'choose', option: 'none' }) }, // no story here: nothing
    { close: 1 },
    { ticks: 5 },
    { pid: 1, msg: () => army(R, 1, 0, [['hoplite', 4]]) }, // back: his hidden guide's save
    { ticks: 5 },
    { look: 'summary' },
  ];
}

/**
 * Elaia North (Kelaino's domain, W-72 proposal; the story "Bones in the Reeds", W-65): the warlords aged and thinking
 * with players in, their feed and notes, the story started and stepped, an encounter run, robbers on the road (W-197),
 * his men falling while he is away (W-221: told once he is back), the summary, the warlords' memory and its recall;
 * then a save and a restore (the warlords' state in it) that plays on, and his rejoin.
 */
function north(): Step[] {
  const R = 'elaia-n';
  // his run's spots (where the giver and the first marks stand, as the runner snapped them)
  const spots = (r: Room) => (r as unknown as { stories: { runs: Map<number, { run: { spots: { giver: { x: number; y: number }; steps: Record<string, { x: number; y: number }[]> } } }> } }).stories.runs.get(1)!.run.spots;
  return [
    { age: 40 },
    { pid: 1, msg: () => army(R, 1, 0, [['hoplite', 12], ['archer', 12]]) },
    { pid: 2, msg: () => army(R, 2, 1, [['hoplite', 10]]) },
    { ticks: 30 },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: squad(r, 1), ...spots(r).giver } }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: squad(r, 1, 1), ...spots(r).giver } }) },
    { pid: 1, msg: () => ({ t: 'story', op: 'choose', option: 'nope' }) }, // no choice open: nothing
    { pid: 1, msg: () => ({ t: 'encounter', op: 'choose', option: 'nope' }) },
    { ticks: 20 },
    ...[1, 2, 3, 4, 5].map((): Step => ({ pid: 1, msg: () => ({ t: 'dev', op: 'skip', ticks: 600 }) })),
    { ticks: 30 },
    { road: { pid: 1, loads: 5, key: 'elaia-n:S:1' } },
    { road: { pid: 1, loads: 5, key: 'elaia-n:S:2' } },
    ...[3, 4, 5, 6, 7, 8].map((k): Step => ({ road: { pid: 1, loads: 5, key: `elaia-n:S:${k}` } })),
    { ticks: 60 },
    { pid: 1, msg: () => ({ t: 'encounter', op: 'choose', option: 'pay' }) }, // the robbers' toll
    { ticks: 2 },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: squad(r, 1), ...spots(r).steps.poles[0] } }) },
    { pid: 1, msg: () => ({ t: 'dev', op: 'skip', ticks: 400 }) },
    { ticks: 60 },
    { look: 'lords' },
    { look: 'summary' },
    { close: 1 },
    { pid: 2, msg: (r) => { const c = centre(r, squad(r, 1)); return { t: 'dev', op: 'spawn', team: 2, cls: 'hoplite', count: 12, x: Math.round(c.x) + 3, y: Math.round(c.y) + 2 }; } }, // his men fall while he is away
    { ticks: 150 },
    { pid: 1, msg: () => army(R, 1, 0, [['hoplite', 4]]) }, // back: what befell them
    { ticks: 20 },
    { age: 41 },
    { recallLords: true },
    { ticks: 30 },
    { look: 'summary' },
    // an eviction: saved (the warlords with it), restored on a fresh room and played on; his rejoin takes his guide,
    // story and encounters up from their saves in the store
    { op: 'save', args: () => [] },
    { op: 'restore', args: () => [] },
    { ticks: 40 },
    { pid: 1, msg: () => army(R, 1, 0, [['hoplite', 4]]) },
    { ticks: 20 },
    { op: 'save', args: () => [] },
  ];
}

const T0 = 1_000_000;
const ev = (id: number, kind: string, region: string, from: number, to: number) => ({ id, kind, region, startAt: T0 + from, endAt: T0 + to }) as WorldEvent;

/**
 * The Moors (W-62 world events): a soul storm and a boss wake running here (the guardian woken once, stronger), an event
 * elsewhere and one to come (not applied), told to every client and to a player on his welcome; the region's memory
 * (M7f) taken and recalled later, and its summary.
 */
function moors(): Step[] {
  const R = 'moors';
  const evs = [ev(1, 'soulStorm', R, 0, 600_000), ev(2, 'bossWake', R, -1000, 600_000), ev(3, 'soulStorm', 'elaia-n', 0, 600_000), ev(4, 'bossWake', R, 700_000, 900_000)];
  return [
    { pid: 1, msg: () => army(R, 1, 0, [['hoplite', 12], ['archer', 10]]) },
    { ticks: 10 },
    { world: { events: evs, next: ev(5, 'soulStorm', 'kimmeria', 900_000, 1_200_000), now: T0 } },
    { world: { events: evs, next: null, now: T0 + 1 } }, // the same wake: woken once
    { pid: 2, msg: () => army(R, 2, 1, [['hoplite', 10]]) }, // told the events on his welcome
    { pid: 1, msg: () => ({ t: 'view', x0: 0, y0: 0, x1: 511, y1: 511 }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'attackMove', squad: squad(r, 1), x: 169, y: 93 } }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'attackMove', squad: squad(r, 1, 1), x: 169, y: 93 } }) },
    { ticks: 200 },
    { look: 'memory' },
    { look: 'summary' },
    { world: { events: [], next: null, now: T0 + 700_000 } }, // the storm over
    { ticks: 100 },
    { recall: 300 },
    { ticks: 50 },
    { look: 'memory' },
    { look: 'summary' },
  ];
}

/** Wave C: the open site of `team` nearest (x,y) (a camp just placed). */
const siteNear = (r: Room, team: number, x: number, y: number) =>
  (r.snapshot().buildings ?? []).filter((b) => b.team === team && b.state !== 'done').sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]?.id ?? 0;

/**
 * test-ridge, settlements and politics (W-63, W-64, W-150): Bo's settlement Bohold seeded with a citizen of another
 * alliance (his men fly its banner), a pact between the alliances (allies), a refused ask for another alliance (his own
 * stays), building on Bohold's ground refused (an outsider, a citizen off his plot, the lord on a citizen's plot, a wall),
 * two camps built: one too close to Bohold (no settlement: the lord hears why), one founding a settlement; Bo's men
 * strike it (the attack logged and told, the pact broken), the fight booked to a war goal; presence, store goods and the
 * reports; an oath sworn (the liege set), a citizen taken in (his men turn to its banner, his welcome told later); a save
 * and a restore that plays on.
 */
function settle(): Step[] {
  const R = 'test-ridge', A = { x: 190, y: 68 }, B = { x: 150, y: 52 }, h = men('ah', 'hoplite', 12, 2), a = men('aa', 'archer', 8);
  return [
    { op: 'seed', args: () => [1, [...h, ...a], null, null] },
    { op: 'ally', args: () => [1, 0, 'Ann'] },
    { op: 'ally', args: () => [2, 1, 'Bo'] },
    { op: 'ally', args: () => [3, 1, 'Cy'] },
    { op: 'ally', args: () => [4, 0, 'Di'] },
    { op: 'settlement', args: () => [{ centre: 9999, x: 200, y: 112, r: 24, name: 'Bohold', lord: 2 }] },
    { op: 'member', args: () => [1, 4, 'citizen', { x0: 196, y0: 108, x1: 202, y1: 114 }] },
    { op: 'pact', args: () => [0, 1, 'pact', null] },
    { op: 'order', args: () => [0, 'attack', R, 1e12] },
    { pid: 1, msg: () => squads(R, 1, 0, [h.map((p) => p.id), a.map((p) => p.id)]) },
    { pid: 4, msg: () => army(R, 4, 0, [['hoplite', 4]]) }, // a citizen of Bohold: Bo's banner
    { pid: 2, msg: () => army(R, 2, 1, [['hoplite', 6]]) },
    { pid: 3, msg: () => army(R, 3, 1, [['peltast', 4]]) },
    { pid: 1, msg: () => army(R, 1, 1, [['hoplite', 4]]) }, // already in alliance 0: refused, his own stays
    { ticks: 3 },
    { op: 'poll', args: () => [] },
    { pid: 1, msg: () => ({ t: 'view', x0: 100, y0: 0, x1: 260, y1: 160 }) },
    { pid: 1, msg: () => ({ t: 'order', o: { kind: 'placeBuilding', type: 'storehouse', x: 200.5, y: 118.5 } }) }, // Bo's ground
    { pid: 4, msg: () => ({ t: 'order', o: { kind: 'placeBuilding', type: 'storehouse', x: 190.5, y: 112.5 } }) }, // off his plot
    { pid: 2, msg: () => ({ t: 'order', o: { kind: 'placeBuilding', type: 'storehouse', x: 199.5, y: 111.5 } }) }, // a citizen's plot
    { pid: 1, msg: () => ({ t: 'order', o: { kind: 'placeWall', material: 'wood', points: [180, 96, 200, 96] } }) },
    { pid: 1, msg: () => ({ t: 'dev', op: 'stock', res: 'wood', n: 900 }) },
    { pid: 1, msg: () => ({ t: 'dev', op: 'stock', res: 'stone', n: 400 }) },
    { pid: 1, msg: () => ({ t: 'dev', op: 'claim', ...A, r: 20 }) },
    { pid: 1, msg: () => ({ t: 'dev', op: 'claim', ...B, r: 20 }) },
    { ticks: 1 },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'placeBuilding', type: 'camp', ...spotFor(r, 0, 'camp', A.x, A.y) } }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'placeBuilding', type: 'camp', ...spotFor(r, 0, 'camp', B.x, B.y) } }) },
    { ticks: 2 },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'build', squad: squad(r, 1), site: siteNear(r, 0, A.x, A.y) } }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'build', squad: squad(r, 1, 1), site: siteNear(r, 0, B.x, B.y) } }) },
    { pid: 1, msg: () => ({ t: 'dev', op: 'skip', ticks: 600 }) },
    { pid: 1, msg: () => ({ t: 'dev', op: 'skip', ticks: 400 }) },
    { ticks: 30 }, // both camps stand: one founds nothing (too close to Bohold), one a settlement
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: squad(r, 1), x: B.x + 2, y: B.y + 4 } }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: squad(r, 1, 1), x: B.x - 3, y: B.y + 2 } }) },
    { pid: 1, msg: () => ({ t: 'dev', op: 'skip', ticks: 600 }) },
    { ticks: 4 },
    { op: 'presence', args: () => [1, 2] },
    { op: 'presence', args: () => [2, 2] },
    { op: 'storeGoods', args: () => [2] },
    { op: 'report', args: () => [] },
    // Bo's men at the new settlement: they strike it, the pact breaks
    { pid: 2, msg: (r) => { const c = centre(r, squad(r, 1)); return { t: 'dev', op: 'spawn', team: 1, cls: 'hoplite', count: 8, x: Math.round(c.x) + 6, y: Math.round(c.y) + 2 }; } },
    { ticks: 60 },
    { pid: 2, msg: () => ({ t: 'dev', op: 'skip', ticks: 30 }) },
    { ticks: 140 },
    { pid: 2, msg: () => ({ t: 'dev', op: 'skip', ticks: 100 }) },
    { ticks: 60 }, // the fight over: written back, booked to the war goal
    { op: 'oath', args: () => [4, 1, 10] },
    { op: 'member', args: () => [2, 3, 'citizen', null] }, // Cy into Ann's settlement: his men turn to her banner
    { op: 'poll', args: () => [] },
    { ticks: 2 },
    { op: 'peacePoll', args: () => [] },
    { op: 'save', args: () => [] },
    { op: 'restore', args: () => [] },
    { ticks: 20 },
    { pid: 1, msg: () => squads(R, 1, 0, [['ah1']]) }, // a rejoin
    { ticks: 110 },
  ];
}

/** test-ridge, a fresh field (regionDO.ts ensure): a settlement's persisting pieces laid down again, the centre re-keyed; its lord joins and the report reads them back. */
function realm(): Step[] {
  const R = 'test-ridge';
  const pieces = [
    { type: 'camp', x: 145.5, y: 57.5, rot: 0, hp: 0.8, goods: { wood: 20, food: 4.5 } },
    { type: 'storehouse', x: 153.5, y: 58.5, rot: 0, hp: 0.02, goods: { stone: 5 } },
    { type: 'storehouse', x: 145.5, y: 57.5, rot: 0, hp: 1 }, // its tiles taken now: dropped
  ];
  return [
    { op: 'ally', args: () => [1, 0, 'Ann'] },
    { op: 'settlement', args: () => [{ centre: 77, x: 150, y: 52, r: 24, name: 'Annis', lord: 1, level: 2, persist: JSON.stringify({ pieces }) }] },
    { op: 'settlement', args: () => [{ centre: 78, x: 400, y: 400, r: 24, name: 'Empty', lord: 5, persist: '{}' }] },
    { op: 'fresh', args: () => [] },
    { pid: 1, msg: () => army(R, 1, 0, [['hoplite', 8]]) },
    { ticks: 3 },
    { op: 'storeGoods', args: () => [1] },
    { op: 'report', args: () => [] },
    { ticks: 5 },
  ];
}

// ---------------------------------------------------------------- wave B: holders and trade

const kit = (uid: string, def: string, cond: number) => ({ uid, def, rarity: 'common', cond });
const piece = (r: Room, type: string, team = 0) => (r.snapshot().buildings ?? []).find((b) => b.type === type && b.team === team);
const devAt = (team: number, cls: string, count: number, at: { x: number; y: number }, dx = 0, dy = 0) => ({ t: 'dev', op: 'spawn', team, cls, count, x: Math.round(at.x) + dx, y: Math.round(at.y) + dy });
const skip = (pid: number, n: number): Step[] => Array.from({ length: n }, () => ({ pid, msg: () => ({ t: 'dev', op: 'skip', ticks: 600 }) }));

/**
 * test-ridge (no world region: every player's strongroom stands here): a camp, a forge and a chest raised, smiths at the
 * forge; a craft (the item into his chest, M6e), mends of his stash items (a repair, a salvage, one the forge cannot
 * take: freed and home again, refusals); stows between his packs and his strongroom (goods and items, out, in, short,
 * refused sites); hand-offs (a swap with an ally, a window too far apart, cancelled, refusals); a save (the region's
 * holds), a restore (mends kept) and on.
 */
function craft(): Step[] {
  const R = 'test-ridge', H = { x: 342, y: 338 }, F = { x: 336.5, y: 334.5 };
  const mine = (r: Room, i: number) => squad(r, 1, i);
  return [
    { op: 'seed', args: () => [1, [...men('h', 'hoplite', 4), ...men('k', 'civ_smith', 2)], { coin: 40, wood: 30, bronze: 4 }, null] },
    { op: 'ally', args: () => [1, 0, 'Ann'] },
    { op: 'ally', args: () => [2, 0, 'Bo'] },
    { op: 'ally', args: () => [3, 1, 'Cy'] },
    { op: 'stash', args: () => [1, [kit('s1', 'xiphos', 30), kit('s2', 'xiphos', 80), kit('s3', 'longsword', 50), kit('s4', 'xiphos', 60)]] },
    { pid: 1, msg: () => squads(R, 1, 0, [['h1', 'h2', 'h3', 'h4'], ['k1', 'k2']]) },
    { pid: 2, msg: () => army(R, 2, 0, [['hoplite', 4]]) },
    { pid: 3, msg: () => army(R, 3, 1, [['hoplite', 4]]) },
    { ticks: 2 },
    { pid: 1, msg: () => ({ t: 'dev', op: 'claim', x: H.x, y: H.y, r: 24 }) },
    ...(['wood', 'stone', 'bronze', 'iron', 'charcoal'] as const).map((res): Step => ({ pid: 1, msg: () => ({ t: 'dev', op: 'stock', res, n: 300 }) })),
    { pid: 1, msg: () => devAt(0, 'militia', 12, H, -4, 4) },
    { pid: 1, msg: () => ({ t: 'view', x0: H.x - 30, y0: H.y - 30, x1: H.x + 30, y1: H.y + 30 }) },
    { pid: 2, msg: () => ({ t: 'view', x0: H.x - 30, y0: H.y - 30, x1: H.x + 30, y1: H.y + 30 }) },
    { ticks: 2 },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'placeBuilding', type: 'camp', ...spotFor(r, 0, 'camp', H.x, H.y) } }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'placeBuilding', type: 'forge', ...spotFor(r, 0, 'forge', F.x, F.y) } }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'placeBuilding', squad: mine(r, 2), type: 'chest', ...spotFor(r, 0, 'chest', H.x + 6, H.y + 2) } }) },
    { ticks: 2 },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: mine(r, 1), x: F.x + 3, y: F.y + 4 } }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'build', squad: mine(r, 2), site: piece(r, 'camp')?.id ?? 0 } }) },
    ...skip(1, 2),
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'build', squad: mine(r, 2), site: piece(r, 'chest')?.id ?? 0 } }) },
    ...skip(1, 1),
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'build', squad: mine(r, 2), site: piece(r, 'forge')?.id ?? 0 } }) },
    ...skip(1, 3),
    { ticks: 5 },
    { op: 'snap', args: () => ['buildings'] },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'civWork', squad: mine(r, 1), building: piece(r, 'forge')?.id ?? 0 } }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'craft', building: piece(r, 'forge')?.id ?? 0, recipe: 'item:club' } }) },
    { pid: 1, msg: (r) => ({ t: 'mend', kind: 'repair', building: piece(r, 'forge')?.id ?? 0, uid: 's1' }) },
    { pid: 1, msg: (r) => ({ t: 'mend', kind: 'salvage', building: piece(r, 'forge')?.id ?? 0, uid: 's2' }) },
    { pid: 1, msg: (r) => ({ t: 'mend', kind: 'repair', building: piece(r, 'camp')?.id ?? 0, uid: 's3' }) }, // no workplace for it: freed
    { pid: 1, msg: () => ({ t: 'mend', kind: 'repair', building: 9999, uid: 's4' }) }, // no building of his: back home
    { pid: 1, msg: (r) => ({ t: 'mend', kind: 'repair', building: piece(r, 'forge')?.id ?? 0, uid: 's1' }) }, // at the forge already
    { pid: 3, msg: (r) => ({ t: 'mend', kind: 'repair', building: piece(r, 'forge')?.id ?? 0, uid: 's4' }) }, // not his
    { ticks: 3 },
    ...skip(1, 3),
    { ticks: 20 },
    { op: 'snap', args: () => ['buildings'] },
    // stows between his militia's packs and his strongroom
    { pid: 1, msg: (r) => ({ t: 'stow', dir: 'out', site: 'strongroom', squad: mine(r, 2), goods: { wood: 10, coin: 20 }, uids: ['s4'] }) },
    { pid: 1, msg: (r) => ({ t: 'stow', dir: 'in', site: 'strongroom', squad: mine(r, 2), goods: { wood: 4 }, uids: ['s4'] }) },
    { pid: 1, msg: (r) => ({ t: 'stow', dir: 'out', site: 'strongroom', squad: mine(r, 2), goods: { wood: 999 } }) }, // short
    { pid: 1, msg: (r) => ({ t: 'stow', dir: 'out', site: 'strongroom', squad: mine(r, 2), uids: ['zz'] }) }, // no such item
    { pid: 1, msg: (r) => ({ t: 'stow', dir: 'in', site: 'strongroom', squad: mine(r, 2), goods: { iron: 3 } }) }, // they carry none
    { pid: 1, msg: (r) => ({ t: 'stow', dir: 'in', site: 'stall', squad: mine(r, 2), goods: { wood: 1 } }) }, // no market here
    { pid: 1, msg: (r) => ({ t: 'stow', dir: 'in', site: 'contract', contract: 4, squad: mine(r, 2), goods: { wood: 1 } }) },
    { pid: 1, msg: (r) => ({ t: 'stow', dir: 'out', site: 'tribute', squad: mine(r, 2) }) },
    { pid: 1, msg: (r) => ({ t: 'stow', dir: 'in', site: 'tribute', squad: mine(r, 2) }) },
    { pid: 1, msg: (r) => ({ t: 'stow', dir: 'in', site: 'strongroom', squad: squad(r, 2), goods: { wood: 1 } }) }, // not his
    // hand-offs: an ally's men beside his militia
    { pid: 2, msg: (r) => devAt(0, 'hoplite', 3, centre(r, mine(r, 2)), 1, 1) },
    { ticks: 30 },
    { pid: 1, msg: () => ({ t: 'handoff', op: 'confirm', with: 2 }) }, // no window
    { pid: 1, msg: (r) => ({ t: 'handoff', op: 'offer', with: 1, squad: mine(r, 0), goods: {} }) }, // himself
    { pid: 1, msg: (r) => ({ t: 'handoff', op: 'offer', with: 2, squad: mine(r, 2), goods: { wood: 2, coin: 5 }, uids: [] }) },
    { pid: 2, msg: (r) => ({ t: 'handoff', op: 'offer', with: 1, squad: squad(r, 2, 1), goods: {} }) }, // gives nothing
    { pid: 2, msg: () => ({ t: 'handoff', op: 'confirm', with: 1 }) },
    { pid: 1, msg: () => ({ t: 'handoff', op: 'confirm', with: 2 }) },
    { pid: 1, msg: (r) => ({ t: 'handoff', op: 'offer', with: 3, squad: mine(r, 0), goods: { coin: 1 } }) },
    { pid: 3, msg: (r) => ({ t: 'handoff', op: 'offer', with: 1, squad: squad(r, 3), goods: {} }) }, // too far apart
    { pid: 3, msg: (r) => ({ t: 'handoff', op: 'offer', with: 1, squad: squad(r, 1), goods: {} }) }, // not his carrier
    { pid: 1, msg: () => ({ t: 'handoff', op: 'cancel', with: 3 }) },
    { pid: 1, msg: () => ({ t: 'handoff', op: 'cancel', with: 3 }) }, // gone
    { ticks: 10 },
    { op: 'save', args: () => [] },
    { op: 'restore', args: () => [] },
    { ticks: 10 },
    { pid: 1, msg: () => squads(R, 1, 0, [['h1']]) },
    { ticks: 10 },
    { op: 'save', args: () => [] },
  ];
}

/**
 * Elaia (alliance 3's home): its NPC town and its board. His men (alliance 3, at home: his strongroom is here) sell,
 * buy, hire and get a cart, coin to and from his strongroom; a rival's (alliance 1, abroad) deal from their packs. The
 * board read, lines taken (a Kill's band set down, a Trade's load sealed into his packs, a Build watched), dropped,
 * delivered at the wrong town, refused; a Kill done by the wild's deeds (told), handed in for coin; deals refused.
 * Board lines of the first window are `<kind><i>.0`; the rival's jobs are numbered as taken (1 the load, 2 the work, 3 the
 * Kill).
 */
function market(): Step[] {
  const R = 'elaia';
  const at = (r: Room) => npcSpot(r.region);
  const band = (r: Room) => (r.snapshot().lairs ?? []).at(-1)?.squad ?? 0;
  return [
    { op: 'seed', args: () => [1, [], { coin: 1100, wood: 60, food: 20 }, null] },
    { op: 'setPath', args: () => [1, { path: 'trader', family: 'line', level: 2 }] },
    { op: 'ally', args: () => [1, 3, 'Ann'] },
    { op: 'ally', args: () => [2, 1, 'Bo'] },
    { op: 'ally', args: () => [3, 2, 'Cy'] },
    { pid: 1, msg: () => army(R, 1, 3, [['hoplite', 4]]) },
    { pid: 2, msg: () => army(R, 2, 1, [['hoplite', 4]]) },
    { pid: 3, msg: () => army(R, 3, 2, [['hoplite', 4]]) },
    { pid: 1, msg: (r) => devAt(3, 'hoplite', 10, at(r), 0, 2) },
    { pid: 2, msg: (r) => devAt(1, 'hoplite', 12, at(r), 2, -2) },
    { ticks: 3 },
    { pid: 1, msg: () => ({ t: 'view', x0: 0, y0: 0, x1: 511, y1: 511 }) },
    { pid: 2, msg: () => ({ t: 'view', x0: 0, y0: 0, x1: 511, y1: 511 }) },
    { pid: 1, msg: () => ({ t: 'npc', op: 'sell', res: 'wood' }) }, // they carry none
    { pid: 3, msg: () => ({ t: 'npc', op: 'sell', res: 'wood' }) }, // nobody at the town
    { pid: 1, msg: (r) => ({ t: 'stow', dir: 'out', site: 'strongroom', squad: squad(r, 1, 1), goods: { wood: 40, coin: 100 } }) },
    { pid: 1, msg: (r) => ({ t: 'stow', dir: 'out', site: 'warehouse', squad: squad(r, 1, 1), goods: { wood: 5 } }) }, // at home the warehouse is the strongroom
    { pid: 1, msg: (r) => ({ t: 'stow', dir: 'in', site: 'stall', squad: squad(r, 1, 1), goods: { wood: 5 } }) }, // no stall yet
    { op: 'rent', args: () => [1, R, 'stall'] },
    { pid: 1, msg: (r) => ({ t: 'stow', dir: 'in', site: 'stall', squad: squad(r, 1, 1), goods: { wood: 5, coin: 10 } }) },
    { pid: 1, msg: (r) => ({ t: 'stow', dir: 'out', site: 'stall', squad: squad(r, 1, 1), goods: { wood: 2 } }) },
    { pid: 1, msg: () => ({ t: 'npc', op: 'sell', res: 'wood', n: 20 }) },
    { pid: 1, msg: () => ({ t: 'npc', op: 'sell', res: 'marble', n: 2 }) }, // carry none
    { pid: 1, msg: () => ({ t: 'npc', op: 'buy', res: 'salt', n: 10 }) },
    { pid: 1, msg: () => ({ t: 'npc', op: 'buy', res: 'flax', n: 3 }) }, // not dealt here
    { pid: 1, msg: () => ({ t: 'npc', op: 'buy', res: 'iron', n: 40 }) },
    { pid: 1, msg: () => ({ t: 'npc', op: 'hire', cls: 'civ_forager' }) },
    { pid: 1, msg: () => ({ t: 'npc', op: 'hire', cls: 'civ_porter' }) }, // nobody hires out as that
    { pid: 1, msg: () => ({ t: 'npc', op: 'cart', cart: 'handcart' }) },
    { ticks: 5 },
    { pid: 2, msg: () => ({ t: 'npc', op: 'buy', res: 'food', n: 5 }) }, // no coin with him
    { pid: 2, msg: (r) => ({ t: 'stow', dir: 'out', site: 'strongroom', squad: squad(r, 2, 1), goods: { coin: 1 } }) }, // not at home
    // the board
    { pid: 2, msg: () => ({ t: 'board', op: 'view' }) },
    { pid: 3, msg: () => ({ t: 'board', op: 'take', entry: 'k0.0' }) }, // nobody at the town
    { pid: 2, msg: () => ({ t: 'board', op: 'take', entry: 't0.0' }) },
    { pid: 2, msg: () => ({ t: 'board', op: 'take', entry: 't0.0' }) }, // held
    { pid: 2, msg: () => ({ t: 'board', op: 'take', entry: 'zz' }) }, // gone
    { pid: 2, msg: () => ({ t: 'board', op: 'deliver', job: 1 }) }, // the wrong town
    { pid: 2, msg: () => ({ t: 'board', op: 'handin', job: 1 }) }, // not done
    { pid: 2, msg: () => ({ t: 'board', op: 'drop', job: 1 }) },
    { pid: 2, msg: () => ({ t: 'board', op: 'take', entry: 'b0.0' }) },
    { pid: 2, msg: () => ({ t: 'board', op: 'drop', job: 2 }) },
    { pid: 2, msg: () => ({ t: 'board', op: 'drop', job: 999 }) }, // not his
    { pid: 2, msg: () => ({ t: 'board', op: 'take', entry: 'k0.0' }) },
    { ticks: 3 },
    { pid: 2, msg: (r) => ({ t: 'order', o: { kind: 'attack', squad: squad(r, 2, 1), target: band(r) } }) },
    { pid: 2, msg: (r) => ({ t: 'order', o: { kind: 'attack', squad: squad(r, 2), target: band(r) } }) },
    { ticks: 200 },
    ...skip(2, 2),
    { ticks: 60 },
    { pid: 2, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: squad(r, 2, 1), x: at(r).x + 2, y: at(r).y } }) },
    ...skip(2, 1),
    { ticks: 5 },
    { pid: 2, msg: () => ({ t: 'board', op: 'handin', job: 3 }) },
    { pid: 2, msg: () => ({ t: 'npc', op: 'buy', res: 'food', n: 5 }) }, // his pay in his packs
    { pid: 2, msg: () => ({ t: 'npc', op: 'cart', cart: 'wagon' }) },
    { pid: 1, msg: () => ({ t: 'board', op: 'view' }) },
    { pid: 1, msg: (r) => ({ t: 'stow', dir: 'out', site: 'strongroom', cart: r.cartsOf(1)[0] ?? 0, goods: { wood: 3 } }) }, // into his cart (a hold row)
    { ticks: 5 },
    { op: 'save', args: () => [] },
  ];
}

/** The Saddle in a boss wake (W-62): Brontes slain by his men, his loot pile WAKE.loot times over (M6e bossItems). */
function wake(): Step[] {
  const R = 'saddle';
  return [
    { pid: 1, msg: () => army(R, 1, 0, [['hoplite', 12]]) },
    { world: { events: [ev(2, 'bossWake', R, -1000, 600_000)], next: null, now: T0 } },
    { ticks: 5 },
    { pid: 1, msg: () => ({ t: 'view', x0: 0, y0: 0, x1: 511, y1: 511 }) },
    { op: 'hurtBoss', args: () => ['brontes', 1e9, 'p:1'] },
    { ticks: 5 },
    { op: 'snap', args: () => ['piles'] },
    { op: 'save', args: () => [] },
  ];
}

/**
 * Elaia, the home of alliance 3 (W-61): its open works (a work's goods given), a builder's men at the temple's site
 * (labour, his favour in lumps), a guard contract watched, a town job (his men drawn at work, its labour), the job
 * ended; the polls (works, bonuses, levels).
 */
function peace(): Step[] {
  const R = 'elaia';
  const temple = (r: Room) => workSite('temple', r.region, 'SW');
  return [
    { op: 'ally', args: () => [1, 3, 'Eu'] },
    { op: 'ally', args: () => [2, 3, 'Fa'] },
    { op: 'setPath', args: () => [1, { path: 'builder', family: null, level: 2 }] },
    { op: 'giveWork', args: () => [3, 'temple', { stone: 600, marble: 120, coin: 300 }] },
    { op: 'guard', args: () => [{ id: 7, team: 3, taker: 2, men: 4 }] },
    { op: 'peacePoll', args: () => [] },
    { pid: 1, msg: () => army(R, 1, 3, [['hoplite', 12], ['archer', 6]]) },
    { pid: 2, msg: () => army(R, 2, 3, [['hoplite', 8]]) },
    { ticks: 2 },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: squad(r, 1), ...temple(r) } }) },
    { pid: 2, msg: (r) => { const t = (r.snapshot().townLevels ?? [])[0]; return { t: 'order', o: { kind: 'move', squad: squad(r, 2), x: t?.x ?? 256, y: t?.y ?? 320 } }; } },
    { pid: 1, msg: () => ({ t: 'dev', op: 'skip', ticks: 600 }) },
    { pid: 1, msg: () => ({ t: 'dev', op: 'skip', ticks: 600 }) },
    { pid: 1, msg: () => ({ t: 'dev', op: 'skip', ticks: 400 }) },
    { pid: 1, msg: (r) => { const c = centre(r, squad(r, 1, 1)); return { t: 'view', x0: c.x - 30, y0: c.y - 20, x1: c.x + 30, y1: c.y + 20 }; } },
    { op: 'townJob', args: (r) => { const c = centre(r, squad(r, 1, 1));  return [{ id: 5, pid: 1, x: Math.round(c.x), y: Math.round(c.y) }]; } },
    { ticks: 320 },
    { op: 'endTownJob', args: () => [5] },
    { ticks: 110 },
  ];
}

const RUNS: { id: string; region: string; seed: number; opts: Record<string, unknown>; steps: () => Step[] }[] = [
  { id: 'ridge', region: 'test-ridge', seed: 1, opts: { cap: 96, wild: true }, steps: ridge },
  { id: 'persons', region: 'test-ridge', seed: 3, opts: { cap: 96, home: 0, fightQuiet: 40 }, steps: persons },
  { id: 'veterans', region: 'test-ridge', seed: 5, opts: { cap: 96, fightQuiet: 40 }, steps: veterans },
  { id: 'home', region: 'elaia', seed: 3, opts: { cap: 400, wild: true, home: 0 }, steps: home },
  { id: 'north', region: 'elaia-n', seed: 5, opts: { cap: 400, wild: true, warlords: true }, steps: north },
  { id: 'moors', region: 'moors', seed: 9, opts: { cap: 400, wild: true }, steps: moors },
  { id: 'settle', region: 'test-ridge', seed: 11, opts: { cap: 96, fightQuiet: 40 }, steps: settle },
  { id: 'realm', region: 'test-ridge', seed: 13, opts: { cap: 96 }, steps: realm },
  { id: 'peace', region: 'elaia', seed: 3, opts: { cap: 400, home: 3 }, steps: peace },
  { id: 'craft', region: 'test-ridge', seed: 11, opts: { cap: 96, home: 0 }, steps: craft },
  { id: 'market', region: 'elaia', seed: 13, opts: { cap: 400 }, steps: market },
  { id: 'wake', region: 'saddle', seed: 15, opts: { cap: 400, wild: true }, steps: wake },
];

function run(r: (typeof RUNS)[number], sha: Sha) {
  const region = parseRegion(files[`../../war/regions/${r.region}.json`]);
  const local = new TsLocal({ region, seed: r.seed, ...r.opts });
  const steps: unknown[] = [];
  let kept = JSON.stringify(local.store.dump());
  const store = () => {
    const now = JSON.stringify(local.store.dump());
    if (now === kept) return {};
    kept = now;
    return { store: JSON.parse(now) as unknown };
  };
  // each step as it stood (a message holds the run's live save, mutated by the ticks after it)
  const push = (x: object) => steps.push(structuredClone({ ...x, ...store() }));
  let memory: unknown = null, lords: unknown = null;
  for (const s of r.steps()) {
    if ('ticks' in s) for (let i = 0; i < s.ticks; i++) push({ tick: true, ...local.tick() });
    else if ('close' in s) push({ close: s.close, out: local.close(s.close) });
    else if ('op' in s) {
      const args = s.args(local.room, local.store);
      push({ op: s.op, args, ...local.call(s.op, args, sha) });
    } else if ('world' in s) push({ world: s.world, out: local.world(s.world.events, s.world.next, s.world.now) });
    else if ('age' in s) (local.room.setWarlordAge(s.age), push({ age: s.age, out: [] }));
    else if ('road' in s) (local.room.encounters.road(s.road.pid, s.road.loads, s.road.key), push({ road: s.road, out: [] }));
    else if ('look' in s) {
      const got = s.look === 'memory' ? local.room.memory() : s.look === 'summary' ? local.room.summary() : local.room.warlordMemory();
      if (s.look === 'memory') memory = got;
      if (s.look === 'lords') lords = got;
      const snap = local.room.snapshot(); // the guardians (a boss wake's hp) and the souls (a storm's) as they stand
      push({ look: s.look, got, present: local.room.present(), bosses: snap.bosses ?? [], souls: (snap.souls ?? []).length, out: [] });
    } else if ('recall' in s) {
      // the region left with its guardians slain, back in 900 ticks: `recall` ticks later they still wait
      const m = { ...(memory as { guardians: { state: string; left: number }[] }) };
      m.guardians = m.guardians.map((g) => ({ ...g, state: 'slain', left: 900 }));
      local.room.recall(m, s.recall);
      push({ recall: m, elapsed: s.recall, out: [] });
    } else if ('recallLords' in s) (local.room.recallWarlords(lords), push({ recallLords: lords, out: [] }));
    else {
      const msg = s.msg(local.room);
      push({ pid: s.pid, msg, out: local.send(s.pid, msg) });
    }
  }
  return { id: r.id, region: r.region, seed: r.seed, opts: r.opts, steps };
}

/** The wire constants LocalRoom keeps in C++ (godot/native/src/room.h Net): protocol.ts and room.ts are no data tables. */
const consts = () => ({
  NET_VERSION, QUANT, KEYFRAME_EVERY, WILD_EVERY, VISION, CAMERA_MARGIN, MAX_SQUAD, MAX_SQUADS, DEFAULT_CAP, ALLIANCES, NODES_EVERY, STORE_NEAR, BOSS_NEAR,
  LABOUR_EVERY, CORPSE_TICKS: room.CORPSE_TICKS, FIGHT_QUIET: room.FIGHT_QUIET, HOME_CLAIM_R: room.HOME_CLAIM_R, GOODS: [...GOODS],
  ...settleConsts(),
});
/**
 * Wave C: the settlements' and the peace's constants and the small tables of works.ts, favour.ts the C++ keeps (no data
 * tables): the store's SETTLE and FAVOUR_LOG are the server's.
 */
const settleConsts = () => {
  if (JSON.stringify(SETTLE) !== JSON.stringify({ r: SERVER_SETTLE.r, presence: SERVER_SETTLE.presence, nameMax: SERVER_SETTLE.nameMax }) || FAVOUR_LOG !== fav.FAVOUR_LOG) throw new Error('roomStore.ts SETTLE or FAVOUR_LOG is not the server\'s');
  return {
    SETTLE_EVERY: room.SETTLE_EVERY, ATTACK_COOLDOWN: room.ATTACK_COOLDOWN, SETTLE: { ...SETTLE }, WORK_R, LAIR_NEAR: fav.LAIR_NEAR, LAND_TICKS: fav.LAND_TICKS, FAVOUR_LOG,
    WORKS: [...WORKS.map((w) => w.id), WONDER.id].map((id) => ({ id, stages: stagesOf(id)!.map((s) => ({ goods: s.goods, labour: s.labour, bonus: s.bonus })) })),
    FAVOUR_XP: [...FAVOUR_XP], FAVOUR_EARN: { lair: FAVOUR_EARN.lair, built: FAVOUR_EARN.built.labour, land: FAVOUR_EARN.land },
    PAYS: { ...PAYS }, HOUR_CAP: { ...HOUR_CAP }, LABOUR_FAVOUR: BOARD.labourFavour, RATE_DEFAULT: FEUDAL.rateDefault,
    ALLIANCE_LIST: ALLIANCE_LIST.map((a) => ({ name: a.name, home: a.home, quadrant: a.quadrant })),
  };
};

/**
 * parseClientMsg (src/war/net/protocol.ts, the zod schema) on raw messages: the parsed message as it comes out (unknown
 * keys stripped, keys in schema order) or null. Every message kind, its bounds and refinements, the unions' order and
 * the length cap (JSON.stringify's UTF-16 units).
 */
const PARSE: unknown[] = [
  { t: 'ping', c: 1 }, { t: 'ping', c: 1.5, extra: 2 }, { t: 'ping' }, { t: 'ping', c: '1' }, { t: 'ping', c: null }, { c: 1 }, { t: 'pong', c: 1 }, null, 7, 'join', [], [{ t: 'ping', c: 1 }],
  army('elaia', 1, 0, [['hoplite', 12]]), { ...army('elaia', 1, 0, [['hoplite', 12]]), extra: true, region: 'elaia' },
  army('elaia', 1, 4, [['hoplite', 12]]), army('elaia', 0, 0, [['hoplite', 12]]), army('elaia', 1.5, 0, [['hoplite', 12]]), army('Elaia', 1, 0, [['hoplite', 12]]),
  army('elaia', 1, 0, [['hoplite', 0]]), army('elaia', 1, 0, [['hoplite', 12], ['archer', 3], ['peltast', 2], ['hoplite', 1]]), army('elaia', 1, 0, []),
  army('elaia', 1, 0, [['Hoplite', 2]]), { t: 'join', v: 28, region: 'elaia', playerId: 1, team: 0 }, { t: 'join', v: 28, region: 'elaia', playerId: 1, team: 0, squads: [['p1', 'p2'], ['p3']] },
  { t: 'join', v: 28, region: 'elaia', playerId: 1, team: 0, squads: [[]] }, { t: 'join', v: 28, region: 'elaia', playerId: 1, team: 0, squads: [['bad id']] },
  { t: 'join', v: 28, region: 'elaia', playerId: 1, team: 0, army: null }, { t: 'join', v: 2 ** 53, region: 'elaia', playerId: 1, team: 0 },
  { t: 'order', o: { kind: 'move', squad: 0, x: 1, y: 2 } }, { t: 'order', o: { kind: 'move', squad: 0, x: 1, y: 2, units: [3, 1], junk: 1 } }, { t: 'order', o: { kind: 'move', squad: -1, x: 1, y: 2 } },
  { t: 'order', o: { kind: 'move', squad: 2 ** 31 + 1, x: 1, y: 2 } }, { t: 'order', o: { kind: 'move', squad: 0, x: 1 } }, { t: 'order', o: { kind: 'fly', squad: 0 } }, { t: 'order', o: {} }, { t: 'order' },
  { t: 'order', o: { kind: 'move', squad: 0, x: 1, y: 2, units: [] } }, { t: 'order', o: { kind: 'formation', squad: 1, shape: 'wedge' } }, { t: 'order', o: { kind: 'formation', squad: 1, shape: 'box' } },
  { t: 'order', o: { kind: 'detach', squad: 1, count: 3, unitIds: [4, 5] } }, { t: 'order', o: { kind: 'detach', squad: 1, count: 0 } }, { t: 'order', o: { kind: 'man', squad: 1, unit: 2, act: 'rear' } },
  { t: 'order', o: { kind: 'placeBuilding', type: 'camp', x: 3.5, y: 4.5, rot: 1 } }, { t: 'order', o: { kind: 'placeBuilding', type: 'camp', x: 3.5, y: 4.5, rot: 2 } }, { t: 'order', o: { kind: 'placeBuilding', type: 'castle', x: 3.5, y: 4.5 } },
  { t: 'order', o: { kind: 'placeWall', material: 'wood', points: [1, 2, 3, 4], towers: [1, 2] } }, { t: 'order', o: { kind: 'placeWall', material: 'wood', points: [1, 2, 3] } }, { t: 'order', o: { kind: 'placeWall', material: 'wood', points: [1, 2, 3, 4], inside: [1, 2, 3, 4] } },
  { t: 'order', o: { kind: 'placeBridge', material: 'stone', points: [1, 2, 3, 4], width: 3 } }, { t: 'order', o: { kind: 'placeBridge', material: 'stone', points: [1, 2, 3, 4], width: 4 } },
  { t: 'order', o: { kind: 'setAccess', building: 3, access: 'public', share: 0.5, fee: 10 } }, { t: 'order', o: { kind: 'setAccess', building: 3, share: 1.5 } },
  { t: 'order', o: { kind: 'craft', building: 3, recipe: 'bread' } }, { t: 'order', o: { kind: 'craft', building: 3, recipe: 'iron_sword:t2' } }, { t: 'order', o: { kind: 'craft', building: 3, recipe: 'Bread!' } },
  { t: 'order', o: { kind: 'raiseLadder', squad: 1, wallTile: [3, 4] } }, { t: 'order', o: { kind: 'raiseLadder', squad: 1, wallTile: [] } },
  { t: 'order', o: { kind: 'attackBuilding', squad: 1, building: 3 } }, { t: 'order', o: { kind: 'attackBuilding', squad: 1, siege: 3 } }, { t: 'order', o: { kind: 'attackBuilding', squad: 1 } }, { t: 'order', o: { kind: 'ignite', squad: 1, building: 3, siege: 4 } },
  { t: 'order', o: { kind: 'load', squad: 1, from: { building: 3 }, res: 'wood', n: 5, send: true } }, { t: 'order', o: { kind: 'load', squad: 1, from: { building: 3 }, n: 0 } }, { t: 'order', o: { kind: 'load', squad: 1, from: { building: 3 }, send: false } },
  { t: 'order', o: { kind: 'unload', squad: 1, to: { cart: 2 }, res: 'gold' } }, { t: 'order', o: { kind: 'salvagePile', squad: 1, pile: 2, uid: 'abc' } }, { t: 'order', o: { kind: 'salvagePile', squad: 1, pile: 2, uid: '' } },
  { t: 'order', o: { kind: 'buildSiege', squad: 1, type: 'ram', x: 1, y: 2 } }, { t: 'order', o: { kind: 'fireArrows', squad: 1, on: 1 } }, { t: 'order', o: { kind: 'gather', squad: 1, node: 4, cart: 2 } },
  { t: 'view', x0: 0, y0: 0, x1: 10, y1: 10 }, { t: 'view', x0: 0, y0: 0, x1: 10 },
  { t: 'check', id: 1, kind: 'building', type: 'camp', x: 3.5, y: 4.5 }, { t: 'check', id: 1, kind: 'wall', material: 'stone', points: [1, 2, 3, 4], gates: [2, 3] }, { t: 'check', id: 1, kind: 'bridge', material: 'wood', points: [1, 2] },
  { t: 'check', id: 1, kind: 'tower', x: 1, y: 2 }, { t: 'check', id: -1, kind: 'building', type: 'camp', x: 3.5, y: 4.5 },
  { t: 'dev', op: 'stock', res: 'wood', n: 400 }, { t: 'dev', op: 'stock', res: 'wood', n: 0 }, { t: 'dev', op: 'stock', res: 'nothing', n: 4 }, { t: 'dev', op: 'claim', x: 1, y: 2, r: 64 }, { t: 'dev', op: 'claim', x: 1, y: 2, r: 65 },
  { t: 'dev', op: 'spawn', team: 2, cls: 'hoplite', count: 6, x: 1, y: 2 }, { t: 'dev', op: 'skip', ticks: 600 }, { t: 'dev', op: 'skip', ticks: 601 }, { t: 'dev', op: 'fly' },
  { t: 'mend', kind: 'repair', building: 3, uid: 'u1' }, { t: 'mend', kind: 'melt', building: 3, uid: 'u1' },
  { t: 'stow', dir: 'in', site: 'stall', goods: { wood: 4, coin: 2 }, uids: ['a'] }, { t: 'stow', dir: 'in', site: 'stall', goods: { wood: 4, gold: 2 } }, { t: 'stow', dir: 'in', site: 'stall', goods: { wood: -1 } },
  { t: 'stow', dir: 'out', site: 'contract', contract: 3, of: 2, squad: 1, cart: 4 },
  { t: 'handoff', op: 'offer', with: 2, goods: { food: 3 } }, { t: 'handoff', op: 'offer', with: 0 },
  { t: 'npc', op: 'sell', res: 'wood', n: 4 }, { t: 'npc', op: 'hire', cls: 'civ_porter' }, { t: 'npc', op: 'hire', cls: 'porter' }, { t: 'npc', op: 'cart', cart: 'wagon' },
  { t: 'board', op: 'take', entry: 'a.b1', job: 3 }, { t: 'board', op: 'take', entry: 'A' },
  { t: 'guide', op: 'hide' }, { t: 'guide', op: 'show' }, { t: 'story', op: 'choose', option: 'help-her' }, { t: 'story', op: 'choose', option: '' }, { t: 'encounter', op: 'choose', option: 'pay_1' }, { t: 'encounter', op: 'choose' },
  { t: 'ping', c: 1, pad: 'x'.repeat(4100) }, { t: 'ping', c: 1, pad: 'é'.repeat(4060) }, { t: 'ping', c: 1, pad: '😀'.repeat(2040) },
];
const parseCases = () => PARSE.map((raw) => ({ raw, got: parseClientMsg(JSON.stringify(raw)) }));

export const vectors = (sha: Sha) => ({ consts: consts(), parse: parseCases(), runs: RUNS.map((r) => run(r, sha)) });
