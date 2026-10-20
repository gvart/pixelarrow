/**
 * Browser side of the live region (./protocol.ts), used by the sandbox worker's net mode (src/war/view/worker.ts):
 * signs in as a dev player (POST /api/auth/telegram { dev } on the page's origin, which the vite dev server proxies to
 * `wrangler dev`; needs DEV_AUTH=1), opens the region socket with the bearer token in the WebSocket protocol, decodes
 * every binary frame into a Snapshot and hands it on. The renderer then interpolates between snapshots as it does for
 * the local sim. Joins are queued until the socket is open.
 */
import { SIM_VERSION } from '../../sim/version';
import type { Order, Snapshot } from '../types';
import { DeltaDecoder } from './codec';
import { NET_VERSION, type ServerMsg } from './protocol';

export interface Net {
  join(team: number, cls: string, count: number): void;
  order(o: Order): void;
  view(x0: number, y0: number, x1: number, y1: number): void;
}

export function createNet(url: string, region: string, devId: number | undefined, onSnap: (s: Snapshot, stats: { stepMs: number; units: number }) => void): Net {
  const dec = new DeltaDecoder();
  const pending: string[] = [];
  let ws: WebSocket | null = null;
  let pid = 0;
  const send = (m: unknown) => {
    const t = JSON.stringify(m);
    if (ws?.readyState === WebSocket.OPEN) ws.send(t);
    else pending.push(t);
  };
  const id = devId ?? 700000 + Math.floor(Math.random() * 100000);
  void (async () => {
    const res = await fetch('/api/auth/telegram', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dev: { id, first_name: `Sandbox${id}` } }) });
    if (!res.ok) throw new Error(`net: dev login failed (${res.status}); is wrangler dev running with DEV_AUTH=1?`);
    const s = (await res.json()) as { token: string; player: { id: number } };
    pid = s.player.id;
    const abs = /^wss?:/.test(url) ? url : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${url}`;
    ws = new WebSocket(`${abs}${abs.includes('?') ? '&' : '?'}sim=${SIM_VERSION}`, ['pixelarrow.v1', s.token]);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      // joins sent before sign-in carry playerId 0: fill it in now
      for (const t of pending.splice(0)) ws!.send(t.replace('"playerId":0', `"playerId":${pid}`));
    };
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') {
        const m = JSON.parse(e.data) as ServerMsg;
        if (m.t !== 'pong') console.info('[net]', m);
        return;
      }
      const snap = dec.apply(e.data as ArrayBuffer);
      onSnap(snap, { stepMs: 0, units: snap.units.filter((u) => u.state !== 'dead').length });
    };
    ws.onclose = (e) => console.warn('[net] closed', e.code, e.reason);
  })().catch((e) => console.error(e));
  return {
    join: (team, cls, count) => send({ t: 'join', v: NET_VERSION, region, playerId: pid, team, army: [{ cls, count: Math.min(count, 20) }] }),
    order: (o) => send({ t: 'order', o }),
    view: (x0, y0, x1, y1) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'view', x0, y0, x1, y1 }));
    },
  };
}
