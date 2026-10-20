/**
 * Where the world screen gets its state from.
 *
 *  - NetSource: the live world (wrangler dev with DEV_AUTH=1, through the vite proxy). Signs in as dev player `?dev=`
 *    (else one kept in localStorage, so the region sandbox opened from here is the same player), joins alliance
 *    `?alliance=` (default Dodona) when it has none, follows /ws/war/world (polls GET /api/war/world when the socket is
 *    down) and the roster (GET /api/war/roster) for the player's men per region. A transfer needs the room's squad ids:
 *    it opens the region's socket for a moment with an empty join (a rejoin of the squads standing there, no spawn),
 *    reads the welcome's squads and sends each over POST /api/war/world/transfer.
 *  - MockSource (?offline=1): a made-up mid-season world in memory, transfers run on local timers, so the map can be
 *    browsed with no server.
 */
import { SIM_VERSION } from '../../sim/version';
import { DEFAULT_CAP, NET_VERSION, splitQuota } from '../net/protocol';
import type { RegionState, TransitSnap, WorldSnapshot } from '../net/world';
import { ALLIANCES, WAR_SEASON } from '../world/alliances';
import { edge, worldRegion, WORLD_IDS } from '../world/graph';
import type { AllianceId } from '../world/types';

/** The player's men standing in one region (from the roster). */
export interface FieldSquad { region: string; men: number; classes: Record<string, number> }

export interface WorldView {
  snap: WorldSnapshot;
  squads: FieldSquad[];
  /** Season score so far per alliance (null: the server keeps none yet) and when the season ends (null: no clock). */
  scores: number[] | null;
  endsAt: number | null;
  /** Live soldier quota per alliance in a region. */
  quota: number[];
  status: string;
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
    const s = by.get(p.region) ?? { region: p.region, men: 0, classes: {} };
    s.men++;
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
  private pid = 0;
  private auth: Record<string, string> = {};
  private snap: WorldSnapshot | null = null;
  private squads: FieldSquad[] = [];
  private status = 'signing in';
  private emit: (v: WorldView) => void = () => undefined;

  constructor(private q = new URLSearchParams(location.search)) {
    this.devId = devPlayerId(q);
  }

  private view(): void {
    if (this.snap) this.emit({ snap: this.snap, squads: this.squads, scores: null, endsAt: null, quota: QUOTA, status: this.status });
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
    const s = (await res.json()) as { token: string; player: { id: number } };
    this.token = s.token;
    this.pid = s.player.id;
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

  /** The squad ids the player holds in `region` (a rejoin over the room's socket, closed again at once). */
  private roomSquads(region: string, team: number): Promise<number[]> {
    return new Promise((ok, no) => {
      const ws = new WebSocket(`${wsBase()}/ws/war/${region}?sim=${SIM_VERSION}`, ['pixelarrow.v1', this.token]);
      const done = (v: number[] | Error) => { clearTimeout(t); ws.close(); if (v instanceof Error) no(v); else ok(v); };
      const t = setTimeout(() => done(new Error(`${region}: no answer from the room`)), 8000);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'join', v: NET_VERSION, region, playerId: this.pid, team, squads: [['none']] }));
      ws.onmessage = (e) => {
        if (typeof e.data !== 'string') return;
        const m = JSON.parse(e.data) as { t: string; squads?: number[]; reason?: string };
        if (m.t === 'welcome') done(m.squads ?? []);
        else if (m.t === 'refused') done([]);
      };
      ws.onerror = () => done(new Error(`${region}: room socket failed`));
    });
  }

  async transfer(from: string, to: string): Promise<TransferResult> {
    const team = this.snap?.you.alliance;
    if (team === null || team === undefined) return { error: 'join an alliance first' };
    try {
      const ids = await this.roomSquads(from, team);
      if (!ids.length) return { error: `no squad of yours stands in ${worldRegion(from)?.name ?? from} (close its region tab and retry)` };
      const ok: TransitSnap[] = [];
      for (const squad of ids) ok.push((await this.api<{ transit: TransitSnap }>('POST', '/api/war/world/transfer', { from, to, squad })).transit);
      if (this.snap) this.snap = { ...this.snap, transit: [...this.snap.transit.filter((t) => !ok.some((o) => o.id === t.id)), ...ok] };
      await this.loadRoster().catch(() => undefined);
      this.view();
      return { ok };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
}

/** A made-up world mid-season: owners, fights and the player's men (alliance Dodona). */
export function mockWorld(now: number): { snap: WorldSnapshot; squads: FieldSquad[]; scores: number[]; endsAt: number } {
  const owners: Record<string, AllianceId> = {
    krios: 0, moors: 0, saddle: 0, stymphalia: 0, siren: 3, 'dodona-s': 0,
    kleisoura: 1, kimmeria: 1, ammos: 1, ammon: 2,
    canyons: 2, savanna: 2, achelous: 2, omphalos: 2, gorge: 2,
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
  const squads: FieldSquad[] = [
    { region: 'dodona', men: 12, classes: { hoplite: 8, archer: 4 } },
    { region: 'dodona-e', men: 10, classes: { hoplite: 6, slinger: 4 } },
    { region: 'moors', men: 12, classes: { celt_sword: 8, javelineer: 4 } },
  ];
  const transit: TransitSnap[] = [
    { id: 1, from: 'dodona-s', to: 'stymphalia', men: 9, departAt: now - 60_000, arriveAt: now - 60_000 + travelMs('dodona-s', 'stymphalia'), state: 'moving' },
    { id: 2, from: 'saddle', to: 'omphalos', men: 12, departAt: now - 200_000, arriveAt: now - 80_000, state: 'queued' },
  ];
  const alliances = ALLIANCES.map((a) => ({
    id: a.id, members: 40 + a.id * 3, clans: 6 + a.id, regions: regions.filter((r) => r.owner === a.id).length,
    soldiers: regions.reduce((s, r) => s + r.live[a.id], 0), inTransit: a.id === 0 ? 21 : 6,
  }));
  return { snap: { season: WAR_SEASON.id, at: now, you: { id: 1, alliance: 0 }, alliances, regions, transit }, squads, scores: [412, 377, 498, 365], endsAt: now + (9 * 24 + 4) * 3600_000 };
}

export class MockSource implements WorldSource {
  readonly mode = 'offline';
  readonly devId = null;
  private w = mockWorld(Date.now());
  private seq = 10;
  private emit: (v: WorldView) => void = () => undefined;

  private view(): void {
    this.w.snap.at = Date.now();
    this.emit({ snap: this.w.snap, squads: this.w.squads, scores: this.w.scores, endsAt: this.w.endsAt, quota: QUOTA, status: 'offline (mock world)' });
  }

  async start(onChange: (v: WorldView) => void): Promise<void> {
    this.emit = onChange;
    this.view();
    setInterval(() => this.tick(), 1000);
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
      else this.w.squads.push({ region: t.to, men: t.men, classes: { hoplite: t.men } });
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
