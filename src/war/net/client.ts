/**
 * Browser side of the live region (./protocol.ts), used by the sandbox worker's net mode (src/war/view/worker.ts):
 * plays as the page's player (./session.ts: the menu's email session cookie, else a dev player: POST /api/auth/telegram
 * { dev } on the page's origin, which the vite dev server proxies to `wrangler dev`; needs DEV_AUTH=1), loads the player's war roster (GET /api/war/roster; M5e) and, when he has no
 * one alive anywhere (a fresh dev id) or `seed` is set, seeds a dev roster (POST /api/war/dev/seed); with men in the
 * field or a few at home he joins with what he has (the seed would replace his men at home). Opens the region socket (the session cookie, or the dev bearer token in the WebSocket protocol), decodes every binary frame into a Snapshot and hands it on.
 * A spawn becomes a join with person ids: his field squad (active, slot order) first, then fit men of the asked class, then any. Joins wait until
 * the socket is open and the roster is in. Every order goes up as is (the server checks the squad is ours and fills in
 * our team for squad-less site orders); placement checks go up as `check` and come back as `checked`.
 */
import { SIM_VERSION } from '../../sim/version';
import type { BridgePlan, Order, PlaceResult, Snapshot, WallPlan } from '../types';
import { DeltaDecoder } from './codec';
import { devAuth, warAuth } from './session';
import { MAX_SQUAD, NET_VERSION, type CheckMsg, type DevMsg, type HandoffMsg, type ServerMsg, type StowMsg } from './protocol';

export interface Net {
  join(team: number, cls: string, count: number): void;
  order(o: Order): void;
  view(x0: number, y0: number, x1: number, y1: number): void;
  /** A placement check for our team; `done` gets the server's answer (null: not joined or the socket closed). */
  check(c: CheckBody, done: (r: PlaceResult | WallPlan | BridgePlan | null) => void): void;
  /** M5h4: repair or salvage stash item `uid` at a workplace of our team (the server loads the item). */
  mend(kind: 'repair' | 'salvage', building: number, uid: string): void;
  /** The war API (/api/war/<path>) as the dev player, once signed in: its JSON, or { error } on a refusal. */
  api(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown>;
  /** M6f: goods between his packs or cart and his stall, warehouse, strongroom or a contract here (-> stowed | error). */
  stow(m: Omit<StowMsg, 't'>): void;
  /** M6g: the hand-off window with another player here (-> handoff to both). */
  handoff(m: Omit<HandoffMsg, 't'>): void;
  /** Dev panel helpers (DEV_AUTH servers only; else an `error` forbidden). */
  dev(m: DevBody): void;
}

/** A dev message without its envelope. */
export type DevBody = DevMsg extends infer D ? (D extends unknown ? Omit<D, 't'> : never) : never;

/** A check message without its envelope (t, id). */
export type CheckBody = CheckMsg extends infer C ? (C extends unknown ? Omit<C, 't' | 'id'> : never) : never;

interface RosterPerson { id: string; cls: string; state: string; region: string | null; slot?: number | null }

export function createNet(url: string, region: string, devId: number | undefined, onSnap: (s: Snapshot, stats: { stepMs: number; units: number }) => void, seed = false, onMsg: (m: ServerMsg) => void = () => undefined): Net {
  const dec = new DeltaDecoder();
  const pending: (() => unknown)[] = [];
  let ws: WebSocket | null = null;
  let ready = false;
  let pid = 0;
  let home: RosterPerson[] = [];
  let checkId = 0;
  const checks = new Map<number, (r: PlaceResult | WallPlan | BridgePlan | null) => void>();
  let signedIn: (auth: Record<string, string>) => void = () => undefined;
  const authed = new Promise<Record<string, string>>((ok) => (signedIn = ok));
  const send = (m: () => unknown) => {
    if (ready && ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m()));
    else pending.push(m);
  };
  void (async () => {
    // the page's player (the menu's email session, a dev id), else a fresh dev player (local sandbox)
    const s = (await warAuth(devId)) ?? (await devAuth(700000 + Math.floor(Math.random() * 100000), 'Sandbox'));
    pid = s.pid;
    const auth = s.headers;
    signedIn(auth);
    const fit = (p: RosterPerson) => (p.state === 'active' || p.state === 'reserve') && !p.region;
    const all = async () => ((await (await fetch('/api/war/roster', { headers: auth })).json()) as { persons: RosterPerson[] }).persons;
    const load = async () => (await all()).filter(fit);
    const roster = await all();
    home = roster.filter(fit);
    // a dev player with nobody (a fresh dev id) gets a dev roster; an email account makes his start in the menu
    if (s.dev && (seed || !roster.some((p) => p.state !== 'dead'))) {
      const r = await fetch('/api/war/dev/seed', { method: 'POST', headers: auth, body: '{}' });
      if (!r.ok) console.warn('[net] seed roster failed', r.status, await r.text());
      home = await load();
    }
    console.info(`[net] roster: ${home.length} soldiers at home`, home.map((p) => p.cls).join(' '));
    const abs = /^wss?:/.test(url) ? url : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${url}`;
    ws = new WebSocket(`${abs}${abs.includes('?') ? '&' : '?'}sim=${SIM_VERSION}`, s.protocols);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      ready = true;
      for (const m of pending.splice(0)) ws!.send(JSON.stringify(m()));
    };
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') {
        const m = JSON.parse(e.data) as ServerMsg;
        if (m.t === 'checked') {
          checks.get(m.id)?.(m.result);
          checks.delete(m.id);
          return;
        }
        if (m.t === 'nodes' || m.t === 'influence' || m.t === 'stock') return onMsg(m); // the economy view (./economy.ts)
        if (m.t !== 'pong') console.info('[net]', m);
        if (m.t === 'stowed' || m.t === 'handoff' || m.t === 'error' || m.t === 'welcome') onMsg(m); // M6: the trade panels (welcome: our player id)
        return;
      }
      const snap = dec.apply(e.data as ArrayBuffer);
      onSnap(snap, { stepMs: 0, units: snap.units.filter((u) => u.state !== 'dead').length });
    };
    ws.onclose = (e) => {
      console.warn('[net] closed', e.code, e.reason);
      for (const done of checks.values()) done(null);
      checks.clear();
    };
  })().catch((e) => console.error(e));
  /** Take up to n soldiers from home for a squad: his field squad in slot order first, then the class asked for. */
  const pick = (cls: string, n: number): string[] => {
    const squad = home.filter((p) => p.state === 'active').sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99));
    const rest = home.filter((p) => p.state !== 'active');
    const order = [...squad, ...rest.filter((p) => p.cls === cls), ...rest.filter((p) => p.cls !== cls)].slice(0, Math.min(n, MAX_SQUAD));
    home = home.filter((p) => !order.includes(p));
    return order.map((p) => p.id);
  };
  return {
    join: (team, cls, count) =>
      send(() => {
        const ids = pick(cls, count);
        // none left at home: an empty join still rejoins squads standing in the region
        return { t: 'join', v: NET_VERSION, region, playerId: pid, team, squads: [ids.length ? ids : ['none']] };
      }),
    order: (o) => send(() => ({ t: 'order', o })),
    check: (c, done) => {
      const id = ++checkId;
      checks.set(id, done);
      send(() => ({ ...c, t: 'check', id }));
    },
    mend: (kind, building, uid) => send(() => ({ t: 'mend', kind, building, uid })),
    stow: (m) => send(() => ({ ...m, t: 'stow' })),
    handoff: (m) => send(() => ({ ...m, t: 'handoff' })),
    dev: (m) => send(() => ({ ...m, t: 'dev' })),
    api: async (method, path, body) => {
      const r = await fetch(`/api/war/${path}`, { method, headers: await authed, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      return r.ok ? j : { error: (j.error as string | undefined) ?? `HTTP ${r.status}`, ...j };
    },
    view: (x0, y0, x1, y1) => {
      if (ready && ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'view', x0, y0, x1, y1 }));
    },
  };
}
