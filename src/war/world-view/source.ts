/**
 * Where the world screen gets its state from.
 *
 *  - NetSource: the live world (wrangler dev with DEV_AUTH=1, through the vite proxy). Signs in as dev player `?dev=`
 *    (else one kept in localStorage, so the region sandbox opened from here is the same player), joins alliance
 *    `?alliance=` (default Dodona) when it has none, follows /ws/war/world (polls GET /api/war/world when the socket is
 *    down) and the roster (GET /api/war/roster) for the player's men per region. A transfer sends the roster's person
 *    ids of his men in the region over POST /api/war/world/transfer, TRANSFER_MAX at a time (each arrives as a squad).
 *  - MockSource (?offline=1): a made-up mid-season world in memory, transfers run on local timers, so the map can be
 *    browsed with no server.
 */
import { SIM_VERSION } from '../../sim/version';
import { DEFAULT_CAP, splitQuota } from '../net/protocol';
import { TRANSFER_MAX, type LandmarkWorld, type RegionState, type SeasonSnap, type TransitSnap, type WorldSnapshot } from '../net/world';
import { ALLIANCES, WAR_SEASON } from '../world/alliances';
import { edge, worldRegion, WORLD_IDS } from '../world/graph';
import { allianceRates, FRONTIER_TOWNS, OMPHALOS } from '../world/season';
import type { AllianceId } from '../world/types';
import type { BoardSeen, ConvoySnap } from './geo';

/** The player's men standing in one region (from the roster); ids: their person ids. */
export interface FieldSquad { region: string; men: number; classes: Record<string, number>; ids: string[] }

export interface WorldView {
  snap: WorldSnapshot;
  squads: FieldSquad[];
  /** Season score so far per alliance (null: the server keeps none yet) and when the season ends (null: no clock). */
  scores: number[] | null;
  endsAt: number | null;
  /** Live soldier quota per alliance in a region. */
  quota: number[];
  status: string;
  /** M6l: carts and porters on the road, the price boards your men last saw, today's trade score per alliance (live: from
   * WorldSnapshot.convoys / boards / score.trade, ./liveTrade; offline: the mock's). */
  convoys?: ConvoySnap[];
  boards?: Record<string, BoardSeen>;
  trade?: number[];
}

export type TransferResult = { ok: TransitSnap[] } | { error: string };

export interface WorldSource {
  readonly mode: 'net' | 'offline';
  readonly devId: number | null;
  start(onChange: (v: WorldView) => void): Promise<void>;
  transfer(from: string, to: string): Promise<TransferResult>;
}

const QUOTA = splitQuota(DEFAULT_CAP);
const N = ALLIANCES.length;

/** Travel time of a transfer from the exit zone (the off-exit penalty comes on top, server side). */
export const travelMs = (from: string, to: string) => Math.round((edge(from, to)?.ms ?? 0) * WAR_SEASON.travelScale);

interface RosterPerson { id: string; cls: string; state: string; region: string | null }

/** Men per region from a roster: deployed persons (`region` set, not on the road '>x'). */
export function fieldSquads(persons: RosterPerson[]): FieldSquad[] {
  const by = new Map<string, FieldSquad>();
  for (const p of persons) {
    if (!p.region || p.region.startsWith('>') || !worldRegion(p.region)) continue;
    const s = by.get(p.region) ?? { region: p.region, men: 0, classes: {}, ids: [] };
    s.men++;
    s.ids.push(p.id);
    s.classes[p.cls] = (s.classes[p.cls] ?? 0) + 1;
    by.set(p.region, s);
  }
  return [...by.values()];
}

function devPlayerId(q: URLSearchParams): number {
  const asked = Number(q.get('dev'));
  if (asked > 0) return asked;
  try {
    const kept = Number(localStorage.getItem('war.devId'));
    if (kept > 0) return kept;
    const id = 700000 + Math.floor(Math.random() * 100000);
    localStorage.setItem('war.devId', String(id));
    return id;
  } catch {
    return 700000 + Math.floor(Math.random() * 100000);
  }
}

const wsBase = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;

export class NetSource implements WorldSource {
  readonly mode = 'net';
  readonly devId: number;
  private token = '';
  private auth: Record<string, string> = {};
  private snap: WorldSnapshot | null = null;
  private squads: FieldSquad[] = [];
  private status = 'signing in';
  private emit: (v: WorldView) => void = () => undefined;

  constructor(private q = new URLSearchParams(location.search)) {
    this.devId = devPlayerId(q);
  }

  private view(): void {
    if (this.snap) this.emit({ snap: this.snap, squads: this.squads, scores: this.snap.score.scores, endsAt: this.snap.at + this.snap.score.left, quota: QUOTA, status: this.status, ...liveTrade(this.snap) });
  }

  private async api<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const r = await fetch(path, { method, headers: this.auth, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const j = (await r.json().catch(() => ({}))) as T & { error?: string; message?: string };
    if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
    return j;
  }

  async start(onChange: (v: WorldView) => void): Promise<void> {
    this.emit = onChange;
    const res = await fetch('/api/auth/telegram', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dev: { id: this.devId, first_name: `World${this.devId}` } }) });
    if (!res.ok) throw new Error(`dev login failed (${res.status}): is wrangler dev running with DEV_AUTH=1? Or open ?offline=1`);
    const s = (await res.json()) as { token: string };
    this.token = s.token;
    this.auth = { authorization: `Bearer ${s.token}`, 'content-type': 'application/json' };
    let snap = await this.api<WorldSnapshot>('GET', '/api/war/world');
    if (snap.you.alliance === null) {
      await this.api('POST', '/api/war/world/dev/alliance', { alliance: Math.max(0, Math.min(3, Number(this.q.get('alliance')) || 0)) });
      snap = await this.api<WorldSnapshot>('GET', '/api/war/world');
    }
    this.snap = snap;
    await this.loadRoster();
    this.status = 'live';
    this.view();
    this.follow();
    setInterval(() => void this.loadRoster().then(() => this.view()).catch(() => undefined), 5000);
  }

  private async loadRoster(): Promise<void> {
    this.squads = fieldSquads((await this.api<{ persons: RosterPerson[] }>('GET', '/api/war/roster')).persons);
  }

  /** The world socket; while it is down, poll the snapshot every 5 s and retry the socket. */
  private follow(): void {
    const ws = new WebSocket(`${wsBase()}/ws/war/world?sim=${SIM_VERSION}`, ['pixelarrow.v1', this.token]);
    let poll: ReturnType<typeof setInterval> | null = null;
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      const m = JSON.parse(e.data) as { t: string } & WorldSnapshot;
      if (m.t !== 'world') return;
      this.snap = m;
      this.status = 'live';
      void this.loadRoster().catch(() => undefined).then(() => this.view());
    };
    ws.onclose = () => {
      this.status = 'reconnecting';
      this.view();
      poll = setInterval(() => void this.api<WorldSnapshot>('GET', '/api/war/world').then((s) => ((this.snap = s), this.view())).catch(() => undefined), 5000);
      setTimeout(() => { if (poll) clearInterval(poll); this.follow(); }, 15000);
    };
  }

  async transfer(from: string, to: string): Promise<TransferResult> {
    const team = this.snap?.you.alliance;
    if (team === null || team === undefined) return { error: 'join an alliance first' };
    try {
      await this.loadRoster();
      const ids = this.squads.find((s) => s.region === from)?.ids ?? [];
      if (!ids.length) return { error: `no men of yours stand in ${worldRegion(from)?.name ?? from}` };
      const ok: TransitSnap[] = [];
      for (let i = 0; i < ids.length; i += TRANSFER_MAX) ok.push((await this.api<{ transit: TransitSnap }>('POST', '/api/war/world/transfer', { from, to, ids: ids.slice(i, i + TRANSFER_MAX) })).transit);
      if (this.snap) this.snap = { ...this.snap, transit: [...this.snap.transit.filter((t) => !ok.some((o) => o.id === t.id)), ...ok] };
      await this.loadRoster().catch(() => undefined);
      this.view();
      return { ok };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
}

/** Cargo as words: its main goods by amount (at most 3), then the items. */
const cargoText = (goods: Record<string, number>, items: number) =>
  [...Object.entries(goods).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g), ...(items ? [`${items} item${items > 1 ? 's' : ''}`] : [])].join(', ') || undefined;

/**
 * M6h live trade for the map (the server's shapes to the map's): convoys with a cart or loads (men only are squads in
 * transit, drawn as such), already filtered by the server's fog and Safe Roads (`seen` set); the boards as rows by good;
 * the season's trade score.
 */
export function liveTrade(snap: WorldSnapshot): Pick<WorldView, 'convoys' | 'boards' | 'trade'> {
  const convoys: ConvoySnap[] = (snap.convoys ?? []).filter((c) => c.cart || c.loads > 0).map((c) => ({
    id: c.id, from: c.from, to: c.to, departAt: c.departAt, arriveAt: c.arriveAt, alliance: c.alliance, kind: c.cart ?? 'porters',
    loads: c.loads, cargo: cargoText(c.goods, c.items), seen: true, ...(c.mine ? { mine: true } : {}),
  }));
  const boards: Record<string, BoardSeen> = {};
  for (const [town, b] of Object.entries(snap.boards ?? {})) {
    const rows = Object.entries(b.goods).map(([good, g]) => ({ good, ask: g.ask, bid: g.bid, depth: g.askDepth + g.bidDepth })).sort((a, z) => z.depth - a.depth);
    boards[town] = { at: b.at, rows, fills: b.fills.length };
  }
  return { convoys, boards, ...(snap.score.trade ? { trade: snap.score.trade } : {}) };
}

/** A made-up world mid-season: owners, fights and the player's men (alliance Dodona). */
export function mockWorld(now: number): { snap: WorldSnapshot; squads: FieldSquad[]; scores: number[]; endsAt: number; convoys: ConvoySnap[]; boards: Record<string, BoardSeen>; trade: number[] } {
  const owners: Record<string, AllianceId> = {
    krios: 0, moors: 0, saddle: 0, stymphalia: 0, siren: 3, 'dodona-s': 0,
    kleisoura: 1, kimmeria: 1, ammos: 1,
    savanna: 2, achelous: 2, omphalos: 2, gorge: 2,
    delta: 3, bacchae: 3, erymanthos: 3,
  };
  const fights: Record<string, number[]> = { kleisoura: [36, 48, 0, 0], omphalos: [142, 0, 90, 22], achelous: [0, 0, 40, 34], erymanthos: [12, 0, 0, 30] };
  const regions: RegionState[] = WORLD_IDS.map((id) => {
    const w = worldRegion(id)!;
    const owner: AllianceId | -1 = w.role === 'home' || w.role === 'entry' ? w.alliance! : (owners[id] ?? -1);
    const live = fights[id] ?? Array.from({ length: N }, (_, i) => (i === owner ? (w.role === 'home' ? 120 : 24 + ((id.length * 7) % 30)) : 0));
    const claims = live.map((n, i) => (i === owner ? 3 : n > 0 ? 1 : 0));
    const contested = live.filter((n) => n > 0).length > 1;
    return { id, owner, claims, live, contested, besieged: id === 'kyrene' };
  });
  regions.find((r) => r.id === 'kyrene')!.live[1] = 18;
  // M7g landmarks: Drakon's Citadel just taken by Dodona (damaged), the Rim Watchtower restored and garrisoned by Elaia,
  // the Dead City still guarded, the Obsidian Hold's Chimera slain but nobody has claimed it yet
  const lms: Record<string, LandmarkWorld> = {
    krios: { id: 'drakons_citadel', holder: 0, guardian: 'slain', state: 'damaged', hp: 0.38, garrisoned: false },
    siren: { id: 'rim_watchtower', holder: 3, guardian: 'slain', state: 'restored', hp: 1, garrisoned: true },
    ammon: { id: 'dead_city', holder: -1, guardian: 'alive', state: 'guarded', hp: 0.6, garrisoned: false },
    canyons: { id: 'obsidian_hold', holder: -1, guardian: 'slain', backAt: now + 17 * 3600_000 + 12 * 60_000, state: 'unclaimed', hp: 0.52, garrisoned: false },
    delta: { id: 'sunken_temple', holder: 3, guardian: 'slain', state: 'damaged', hp: 0.4, garrisoned: false },
    omphalos: { id: 'temple_city', holder: 2, guardian: 'slain', state: 'damaged', hp: 0.33, garrisoned: false },
    saddle: { id: 'cyclopean_gatehouse', holder: 0, guardian: 'slain', state: 'restored', hp: 1, garrisoned: false },
    erymanthos: { id: 'oracle_grove', holder: 3, guardian: 'slain', state: 'damaged', hp: 0.4, garrisoned: false },
    gorge: { id: 'titans_forge', holder: 2, guardian: 'slain', state: 'restored', hp: 1, garrisoned: true },
  };
  for (const r of regions) if (lms[r.id]) r.landmark = lms[r.id];
  const squads: FieldSquad[] = [
    { region: 'dodona', men: 12, classes: { hoplite: 8, archer: 4 }, ids: [] },
    { region: 'dodona-e', men: 10, classes: { hoplite: 6, slinger: 4 }, ids: [] },
    { region: 'moors', men: 12, classes: { celt_sword: 8, javelineer: 4 }, ids: [] },
  ];
  const transit: TransitSnap[] = [
    { id: 1, from: 'dodona-s', to: 'stymphalia', men: 9, departAt: now - 60_000, arriveAt: now - 60_000 + travelMs('dodona-s', 'stymphalia'), state: 'moving' },
    { id: 2, from: 'saddle', to: 'omphalos', men: 12, departAt: now - 200_000, arriveAt: now - 80_000, state: 'queued' },
  ];
  const alliances = ALLIANCES.map((a) => ({
    id: a.id, members: 40 + a.id * 3, clans: 6 + a.id, regions: regions.filter((r) => r.owner === a.id).length,
    soldiers: regions.reduce((s, r) => s + r.live[a.id], 0), inTransit: a.id === 0 ? 21 : 6,
  }));
  const scores = [412, 377, 498, 365], left = (9 * 24 + 4) * 3600_000;
  const owner = (id: string) => regions.find((r) => r.id === id)!.owner;
  const score: SeasonSnap = {
    id: WAR_SEASON.id, startAt: now + left - WAR_SEASON.lengthMs, endAt: now + left, left, scores, rates: allianceRates(regions),
    omphalos: owner(OMPHALOS), towns: Object.fromEntries(FRONTIER_TOWNS.map((t) => [t, owner(t)])), hegemony: null, ended: null,
  };
  // M6l: convoys on the road (yours, a seen foe cart, a Safe Roads foe wagon to a town you stand in, one out of sight)
  const leg = (from: string, to: string, f: number, mul: number) => { const ms = travelMs(from, to) * mul; return { departAt: now - ms * f, arriveAt: now + ms * (1 - f) }; };
  const convoys: ConvoySnap[] = [
    { id: 101, from: 'dodona', to: 'dodona-s', ...leg('dodona', 'dodona-s', 0.45, 1.5), alliance: 0, kind: 'wagon', loads: 11, cargo: 'iron, pitch' },
    { id: 102, from: 'kleisoura', to: 'dodona-e', ...leg('kleisoura', 'dodona-e', 0.3, 1), alliance: 1, kind: 'handcart', loads: 5, cargo: 'tin' },
    { id: 103, from: 'elaia-n', to: 'stymphalia', ...leg('elaia-n', 'stymphalia', 0.6, 1.5), alliance: 3, kind: 'wagon', loads: 12, cargo: 'oil, marble', safe: true },
    { id: 104, from: 'savanna', to: 'kyrene-n', ...leg('savanna', 'kyrene-n', 0.5, 1.2), alliance: 2, kind: 'porters', loads: 8, cargo: 'hides' },
  ];
  const min = 60_000;
  const boards: Record<string, BoardSeen> = {
    dodona: { at: now - 1 * min, fills: 7, rows: [{ good: 'iron', ask: 6, bid: 4, depth: 140 }, { good: 'pitch', ask: 3, bid: 2, depth: 90 }, { good: 'food', ask: 1, bid: 1, depth: 600 }, { good: 'tin', ask: 14, bid: 11, depth: 20 }] },
    stymphalia: { at: now - 3 * min, fills: 10, rows: [{ good: 'tin', ask: 11, bid: 9, depth: 45 }, { good: 'oil', ask: 5, bid: 4, depth: 120 }, { good: 'marble', ask: 9, bid: null, depth: 30 }, { good: 'iron', ask: 8, bid: 6, depth: 60 }, { good: 'food', ask: 2, bid: 1, depth: 300 }] },
    kleisoura: { at: now - 47 * min, fills: 4, rows: [{ good: 'tin', ask: 8, bid: 7, depth: 80 }, { good: 'iron', ask: 9, bid: 5, depth: 25 }, { good: 'hides', ask: 3, bid: null, depth: 40 }] },
  };
  return { snap: { season: WAR_SEASON.id, score, at: now, you: { id: 1, alliance: 0 }, alliances, regions, transit }, squads, scores, endsAt: now + left, convoys, boards, trade: [34, 18, 60, 9] };
}

export class MockSource implements WorldSource {
  readonly mode = 'offline';
  readonly devId = null;
  private w = mockWorld(Date.now());
  private seq = 10;
  private emit: (v: WorldView) => void = () => undefined;

  private view(): void {
    this.w.snap.at = Date.now();
    const now = Date.now();
    // convoys that arrived set off again the other way (the mock keeps the roads busy)
    for (const c of this.w.convoys) if (c.arriveAt <= now) { const ms = c.arriveAt - c.departAt; [c.from, c.to] = [c.to, c.from]; c.departAt = now; c.arriveAt = now + ms; }
    this.emit({ snap: this.w.snap, squads: this.w.squads, scores: this.w.scores, endsAt: this.w.endsAt, quota: QUOTA, status: 'offline (mock world)', convoys: this.w.convoys, boards: this.w.boards, trade: this.w.trade });
  }

  async start(onChange: (v: WorldView) => void): Promise<void> {
    this.emit = onChange;
    this.view();
    setInterval(() => this.tick(), 1000);
    setInterval(() => this.view(), 5000);
  }

  /** Arrivals: into the region while the quota has room, else wait (queued). */
  private tick(): void {
    const now = Date.now(), you = this.w.snap.you.alliance!;
    let changed = false;
    for (const t of [...this.w.snap.transit]) {
      if (t.arriveAt > now) continue;
      const r = this.w.snap.regions.find((x) => x.id === t.to)!;
      if (r.live[you] + t.men > QUOTA[you]) {
        if (t.state !== 'queued') (t.state = 'queued'), (changed = true);
        continue;
      }
      r.live[you] += t.men;
      this.w.snap.transit = this.w.snap.transit.filter((x) => x !== t);
      const s = this.w.squads.find((x) => x.region === t.to);
      if (s) s.men += t.men;
      else this.w.squads.push({ region: t.to, men: t.men, classes: { hoplite: t.men }, ids: [] });
      changed = true;
    }
    if (changed) this.view();
  }

  async transfer(from: string, to: string): Promise<TransferResult> {
    const s = this.w.squads.find((x) => x.region === from);
    if (!s) return { error: 'no squad of yours there' };
    if (!edge(from, to)) return { error: 'not a neighbour' };
    const now = Date.now(), you = this.w.snap.you.alliance!;
    const t: TransitSnap = { id: ++this.seq, from, to, men: s.men, departAt: now, arriveAt: now + travelMs(from, to), state: 'moving' };
    this.w.squads = this.w.squads.filter((x) => x !== s);
    const r = this.w.snap.regions.find((x) => x.id === from)!;
    r.live[you] = Math.max(0, r.live[you] - s.men);
    this.w.snap.transit.push(t);
    this.view();
    return { ok: [t] };
  }
}
