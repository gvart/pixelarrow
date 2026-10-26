/**
 * Main-thread side of the sim worker: sends spawns and orders, keeps the last two Snapshots and
 * interpolates unit positions between them (rendering runs one 10 Hz tick behind).
 */
import type { Behaviour } from '../sim/bots';
import type { ScenarioGo } from '../scenarios/types';
import type { BridgeOrder, BridgePlan, BuildingSnap, BuildingType, FightReport, FogGrid, InfluenceMap, NodeSnap, Order, PlaceResult, RegionData, ResourceKind, Snapshot, SquadSnap, UnitSnap, WallOrder, WallPlan, WarEvent, WarPerson } from '../types';
import type { ToWorker } from './worker';
import type { HandoffMsg, ServerMsg, StowMsg } from '../net/protocol';
import { myTeam, setMyTeam } from './side';

/**
 * The snapshot as `team` knows it: foe men, engines and missiles only where it sees; foe buildings where it sees
 * them now, else as last seen (`seen`, drawn under the explored shroud); its own side whole.
 */
export function fogged(s: Snapshot, team: number, visible: (x: number, y: number) => boolean, seen: BuildingSnap[]): Snapshot {
  const of = new Map(s.squads.map((q) => [q.id, q.team]));
  const big = new Set((s.bosses ?? []).filter((b) => b.state !== 'slain' && b.state !== 'away').map((b) => b.unit));
  const vis = (b: BuildingSnap) => {
    for (let i = 0; i < b.tiles.length; i += 2) if (visible(b.tiles[i] + 0.5, b.tiles[i + 1] + 0.5)) return true;
    return visible(b.x, b.y);
  };
  // M7b: a region's pre-built towns are on the map (they were map objects before), so they show under the shroud too
  const buildings = (s.buildings ?? []).filter((b) => b.team === team || b.pre || vis(b));
  const here = new Set(buildings.map((b) => b.id));
  for (const b of seen) if (!here.has(b.id) && !vis(b)) buildings.push(b);
  return {
    ...s,
    // M7d: a guardian's body is seen from afar (a dragon on a keep roof), its fight under the fog is not
    units: s.units.filter((u) => of.get(u.squad) === team || big.has(u.id) || visible(u.x, u.y)),
    shots: s.shots?.filter((h) => visible(h.x0, h.y0) || visible(h.x1, h.y1)),
    sieges: s.sieges?.filter((e) => e.team === team || visible(e.x, e.y)),
    buildings,
  };
}

export interface DrawUnit { u: UnitSnap; x: number; y: number; facing: number; team: number }

export class SimClient {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private old = new Map<number, UnitSnap>();
  /** The newest snapshot as the player's team (./side.ts) knows it under the fog (W-39; `full` while fog is off). */
  cur: Snapshot | null = null;
  /** The newest snapshot, everything in it (dev tallies). */
  full: Snapshot | null = null;
  /** The player's team's fog grid (latest version) and the foe buildings as it last saw them; fog off (dev): no hiding. */
  fog: FogGrid | null = null;
  seen: BuildingSnap[] = [];
  fogOn = true;
  private at = 0;
  private interval = 100;
  stats = { stepMs: 0, units: 0 };
  squads = new Map<number, SquadSnap>();
  /** Economy (real sim only): the influence mask (latest version) and the resource nodes (posted every second). */
  influence: InfluenceMap | null = null;
  nodes: NodeSnap[] = [];
  /** M5g (./hud/roster): persons for a squad about to spawn (none: class soldiers), and the sim's event log as it comes. */
  personsFor: ((owner: string, team: number, cls: string, count: number) => WarPerson[] | undefined) | null = null;
  onEvents: ((ev: WarEvent[]) => void) | null = null;
  /** M6 net mode: the region server's trade answers (stowed, handoff, error) for the trade panels (../hud/market.ts). */
  onServer: ((m: ServerMsg) => void) | null = null;
  /** W-53 (../select.ts): names the selected men on an order to the selection's lead squad (they gather into one squad). */
  address: ((o: Order) => Order) | null = null;
  /** Net mode: our player id once the region welcomed us (hand-off halves are keyed by it). */
  playerId: number | null = null;
  private asks = new Map<number, (r: unknown) => void>();
  private askId = 0;

  constructor(region: RegionData) {
    type Msg = { snap: Snapshot; stats: { stepMs: number; units: number }; events?: WarEvent[]; nodes?: NodeSnap[]; influence?: InfluenceMap; fog?: FogGrid; seen?: BuildingSnap[] } | { reply: number; place?: PlaceResult | null; wall?: WallPlan | null; bridge?: BridgePlan | null; report?: FightReport | null; api?: unknown } | { server: ServerMsg };
    this.worker.onmessage = (e: MessageEvent<Msg>) => {
      if ('server' in e.data) {
        if (e.data.server.t === 'welcome') (this.playerId = e.data.server.you.id), setMyTeam(e.data.server.you.team);
        else this.onServer?.(e.data.server);
        return;
      }
      if ('reply' in e.data) {
        const r = e.data;
        this.asks.get(r.reply)?.(r.place ?? r.wall ?? r.bridge ?? r.report ?? r.api ?? null);
        this.asks.delete(r.reply);
        return;
      }
      if (e.data.nodes) this.nodes = e.data.nodes;
      if (e.data.influence) this.influence = e.data.influence;
      if (e.data.fog) (this.fog = e.data.fog), (this.seen = e.data.seen ?? []);
      this.old = new Map(this.cur?.units.map((u) => [u.id, u]));
      this.full = e.data.snap;
      this.cur = this.fogged(e.data.snap);
      this.stats = e.data.stats;
      this.at = performance.now();
      this.squads = new Map(this.cur.squads.map((s) => [s.id, s]));
      if (e.data.events) this.onEvents?.(e.data.events);
    };
    const q = new URLSearchParams(location.search), dev = Number(q.get('dev')) || undefined;
    // ?net=<ws url or /ws/war/<region>>: play on the live region server (M3) instead of the local sim
    // ?seed=<n>: the sim's seed (dev console: restart with the same or a new one; ./main.ts puts a scenario's own there)
    this.send({ t: 'init', region, team: myTeam(), seed: Number(q.get('seed')) || 1, sim: q.get('sim') === 'fake' ? 'fake' : 'real', net: q.get('net') ?? undefined, dev });
    this.speed(1);
  }

  /** The player's team sees tile point (x, y) now (always with fog off or before the first grid). */
  visible(x: number, y: number): boolean {
    const g = this.fog;
    if (!g || !this.fogOn) return true;
    const cx = Math.floor(x / g.cell), cy = Math.floor(y / g.cell);
    return cx >= 0 && cy >= 0 && cx < g.w && cy < g.h && g.state[cy * g.w + cx] === 2;
  }

  private fogged(s: Snapshot): Snapshot {
    return this.fog && this.fogOn ? fogged(s, myTeam(), (x, y) => this.visible(x, y), this.seen) : s;
  }

  /** Dev: fog of war on / off (re-filters the snapshot drawn now). */
  setFog(on: boolean): void {
    this.fogOn = on;
    if (this.full) this.cur = this.fogged(this.full);
  }

  private send(m: ToWorker): void {
    this.worker.postMessage(m);
  }

  /** `bot`: a bot behaviour that drives the squad (../sim/bots.ts). */
  spawn(owner: string, team: number, cls: string, count: number, x: number, y: number, bot?: Behaviour, go?: ScenarioGo): void {
    const persons = this.personsFor?.(owner, team, cls, count);
    this.send({ t: 'spawn', owner, team, cls, count, x, y, bot, go, ...(persons?.length ? { persons } : {}) });
  }

  /** Dev panel: a squad of any class and team at (x,y) (net mode: the server's DEV_AUTH spawn; the player's team is ours). */
  devSpawn(team: number, cls: string, count: number, x: number, y: number): void {
    this.send({ t: 'devSpawn', team, cls, count, x, y });
  }

  order(o: Order): void {
    this.send({ t: 'order', o: this.address?.(o) ?? o });
  }

  /** The camera's ground rect in tiles (corner tiles): the live server sends what lies near it (net mode only). */
  camera(corners: { x: number; y: number }[]): void {
    const xs = corners.map((c) => c.x), ys = corners.map((c) => c.y);
    this.send({ t: 'view', x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
  }

  /** Dev: a claim anchor (influence radius r) for a team. */
  claim(team: number, x: number, y: number, r?: number): void {
    this.send({ t: 'claim', team, x, y, r });
  }

  /** Neutral play: spawn the region's lairs. */
  /** M7d dev and scenarios: hurt guardian `boss` down to `to` of its hp (its phases follow); `part`: kill that head. */
  hurtBossTo(boss: string, to: number, part?: number): void {
    this.send({ t: 'hurtBoss', boss, to, part });
  }

  /** M7g dev and scripts: every claim point of the region to `team` (its landmark takes the capture damage). */
  takeRegion(team: number): void {
    this.send({ t: 'takeRegion', team });
  }

  spawnMobs(): void {
    this.send({ t: 'mobs' });
  }

  /** Scenarios: fast-forward up to `max` ticks, the team's squads building its unfinished sites, until none is left. */
  prebuild(team: number, max: number): void {
    this.send({ t: 'prebuild', team, max });
  }

  /** Scenarios: step `ticks` ticks at once (squads settle before play). */
  skip(ticks: number): void {
    this.send({ t: 'skip', ticks });
  }

  /** Dev console: site `id` done at once (materials and labour free). */
  finishSite(id: number): void {
    this.send({ t: 'finishSite', id });
  }

  /** Dev console: these men struck down (wounded or dead by their END), hurt to a quarter, or healed. */
  devUnits(ids: number[], op: 'kill' | 'hurt' | 'heal'): void {
    if (ids.length) this.send({ t: 'devUnits', ids, op });
  }

  /** Dev: damage a building (scripts: a breach). */
  damageBuilding(id: number, dmg: number): void {
    this.send({ t: 'damage', id, dmg });
  }

  /** Scenarios: the team's unfinished bridges done at once. */
  finishBridges(team: number): void {
    this.send({ t: 'finishBridges', team });
  }

  /** Scenarios (M6k): a finished, empty cart of `owner` at (x,y). */
  spawnCart(team: number, owner: string, type: 'handcart' | 'wagon', x: number, y: number): void {
    this.send({ t: 'cart', team, owner, type, x, y });
  }

  /** Dev: add to a team's stockpile. */
  addStock(team: number, res: ResourceKind, n: number): void {
    this.send({ t: 'stock', team, res, n });
  }

  /** The sim's checkPlacement, answered off the worker (null on the fake sim). */
  checkPlacement(team: number, type: BuildingType, x: number, y: number, rot: 0 | 1): Promise<PlaceResult | null> {
    return this.ask((id) => ({ t: 'check', id, team, type, x, y, rot }));
  }

  /** The sim's checkWall, answered off the worker (null on the fake sim). */
  checkWall(team: number, wall: Omit<WallOrder, 'kind' | 'squad'>): Promise<WallPlan | null> {
    return this.ask((id) => ({ t: 'checkWall', id, team, wall }));
  }

  /** The sim's checkBridge, answered off the worker (null on the fake sim). */
  checkBridge(team: number, bridge: Omit<BridgeOrder, 'kind' | 'squad'>): Promise<BridgePlan | null> {
    return this.ask((id) => ({ t: 'checkBridge', id, team, bridge }));
  }

  private ask<T>(m: (id: number) => ToWorker): Promise<T | null> {
    const id = ++this.askId;
    return new Promise((ok) => {
      this.asks.set(id, ok as (r: unknown) => void);
      this.send(m(id));
    });
  }

  /** M5d: end the fight; the report of every person in it (null on the fake sim). */
  endFight(): Promise<FightReport | null> {
    return this.ask((id) => ({ t: 'endFight', id }));
  }

  /** M5g: a person changed off the field (level-up choice, dev XP): his living man is baked again. */
  setPerson(p: WarPerson): void {
    this.send({ t: 'person', p });
  }

  /** Net mode (?net=): the live region server holds the stash and persons (M5h4), not the local roster. */
  readonly net = new URLSearchParams(location.search).has('net');

  /** M5h net mode: repair or salvage a stash item at a workplace of our team. */
  mend(kind: 'repair' | 'salvage', building: number, uid: string): void {
    this.send({ t: 'mend', kind, building, uid });
  }

  /** M5h net mode: a war API call as the dev player (null off net mode). */
  api<T = unknown>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T | null> {
    return this.net ? this.ask<T>((id) => ({ t: 'api', id, method, path, body })) : Promise.resolve(null);
  }

  /** M6f net mode: goods between his packs or cart and his site here (answered by `stowed` or `error` on onServer). */
  stow(m: Omit<StowMsg, 't'>): void {
    this.send({ t: 'stow', m });
  }

  /** M6g net mode: the hand-off window (answered by `handoff` on onServer, to both players). */
  handoff(m: Omit<HandoffMsg, 't'>): void {
    this.send({ t: 'handoff', m });
  }

  /** Time scale; 0 pauses. */
  speed(scale: number): void {
    if (scale > 0) this.interval = 100 / scale;
    this.send({ t: 'speed', scale });
  }

  /** M7d: ms since the newest snapshot came. */
  since(_now: number): number {
    return performance.now() - this.at;
  }

  /** Render time for the clips (./anim.ts): the fractional tick drawn (one behind the newest snapshot). */
  time(now: number): { now: number; tick: number; snap: number; tickMs: number } {
    const snap = this.cur?.tick ?? 0;
    return { now, tick: snap - 1 + Math.min(1, (performance.now() - this.at) / this.interval), snap, tickMs: this.interval };
  }

  /** Units at render time, positions in tiles. */
  units(): DrawUnit[] {
    if (!this.cur) return [];
    const a = Math.min(1, (performance.now() - this.at) / this.interval);
    return this.cur.units.map((u) => {
      const p = this.old.get(u.id) ?? u;
      let df = u.facing - p.facing;
      df -= Math.round(df / (2 * Math.PI)) * 2 * Math.PI;
      return { u, x: p.x + (u.x - p.x) * a, y: p.y + (u.y - p.y) * a, facing: p.facing + df * a, team: this.squads.get(u.squad)?.team ?? 0 };
    });
  }
}
