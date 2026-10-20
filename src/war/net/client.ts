/**
 * Browser side of the live region (./protocol.ts), used by the sandbox worker's net mode (src/war/view/worker.ts):
 * signs in as a dev player (POST /api/auth/telegram { dev } on the page's origin, which the vite dev server proxies to
 * `wrangler dev`; needs DEV_AUTH=1), loads the player's war roster (GET /api/war/roster; M5e) and, when fewer than a
 * squad of fit soldiers are at home (or `seed` is set), seeds a dev roster (POST /api/war/dev/seed). Opens the region
 * socket with the bearer token in the WebSocket protocol, decodes every binary frame into a Snapshot and hands it on.
 * A spawn becomes a join with person ids: fit soldiers at home of the asked class first, then any. Joins wait until
 * the socket is open and the roster is in. Every order goes up as is (the server checks the squad is ours and fills in
 * our team for squad-less site orders); placement checks go up as `check` and come back as `checked`.
 */
import { SIM_VERSION } from '../../sim/version';
import type { BridgePlan, Order, PlaceResult, Snapshot, WallPlan } from '../types';
import { DeltaDecoder } from './codec';
import { MAX_SQUAD, NET_VERSION, type CheckMsg, type ServerMsg } from './protocol';

export interface Net {
  join(team: number, cls: string, count: number): void;
  order(o: Order): void;
  view(x0: number, y0: number, x1: number, y1: number): void;
  /** A placement check for our team; `done` gets the server's answer (null: not joined or the socket closed). */
  check(c: CheckBody, done: (r: PlaceResult | WallPlan | BridgePlan | null) => void): void;
}

/** A check message without its envelope (t, id). */
export type CheckBody = CheckMsg extends infer C ? (C extends unknown ? Omit<C, 't' | 'id'> : never) : never;

interface RosterPerson { id: string; cls: string; state: string; region: string | null }

export function createNet(url: string, region: string, devId: number | undefined, onSnap: (s: Snapshot, stats: { stepMs: number; units: number }) => void, seed = false): Net {
  const dec = new DeltaDecoder();
  const pending: (() => unknown)[] = [];
  let ws: WebSocket | null = null;
  let ready = false;
  let pid = 0;
  let home: RosterPerson[] = [];
  let checkId = 0;
  const checks = new Map<number, (r: PlaceResult | WallPlan | BridgePlan | null) => void>();
  const send = (m: () => unknown) => {
    if (ready && ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m()));
    else pending.push(m);
  };
  const id = devId ?? 700000 + Math.floor(Math.random() * 100000);
  void (async () => {
    const res = await fetch('/api/auth/telegram', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dev: { id, first_name: `Sandbox${id}` } }) });
    if (!res.ok) throw new Error(`net: dev login failed (${res.status}); is wrangler dev running with DEV_AUTH=1?`);
    const s = (await res.json()) as { token: string; player: { id: number } };
    pid = s.player.id;
    const auth = { authorization: `Bearer ${s.token}`, 'content-type': 'application/json' };
    const fit = (p: RosterPerson) => (p.state === 'active' || p.state === 'reserve') && !p.region;
    const load = async () => ((await (await fetch('/api/war/roster', { headers: auth })).json()) as { persons: RosterPerson[] }).persons.filter(fit);
    home = await load();
    if (seed || home.length < MAX_SQUAD) {
      const r = await fetch('/api/war/dev/seed', { method: 'POST', headers: auth, body: '{}' });
      if (!r.ok) console.warn('[net] seed roster failed', r.status, await r.text());
      home = await load();
    }
    console.info(`[net] roster: ${home.length} soldiers at home`, home.map((p) => p.cls).join(' '));
    const abs = /^wss?:/.test(url) ? url : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${url}`;
    ws = new WebSocket(`${abs}${abs.includes('?') ? '&' : '?'}sim=${SIM_VERSION}`, ['pixelarrow.v1', s.token]);
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
        if (m.t !== 'pong') console.info('[net]', m);
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
  /** Take up to n soldiers from home for a squad: the class asked for first. */
  const pick = (cls: string, n: number): string[] => {
    const order = [...home.filter((p) => p.cls === cls), ...home.filter((p) => p.cls !== cls)].slice(0, Math.min(n, MAX_SQUAD));
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
    view: (x0, y0, x1, y1) => {
      if (ready && ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'view', x0, y0, x1, y1 }));
    },
  };
}
