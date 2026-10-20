import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { DeltaDecoder } from '../../../src/war/net/codec';
import { NET_VERSION, type ServerMsg } from '../../../src/war/net/protocol';
import { SIM_VERSION } from '../../../src/sim/version';
import { BASE, devLogin } from '../helpers';

interface Client { ws: WebSocket; msgs: ServerMsg[]; dec: DeltaDecoder; frames: number; next(t: ServerMsg['t']): Promise<ServerMsg>; send(m: unknown): void }

async function connect(token: string, region = 'test-ridge'): Promise<Client> {
  const res = await SELF.fetch(`${BASE}/ws/war/${region}?sim=${SIM_VERSION}`, { headers: { upgrade: 'websocket', 'sec-websocket-protocol': `pixelarrow.v1, ${token}` } });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  ws.accept();
  (ws as unknown as { binaryType: string }).binaryType = "arraybuffer";
  const c: Client = {
    ws, msgs: [], dec: new DeltaDecoder(), frames: 0,
    send: (m) => ws.send(JSON.stringify(m)),
    next: (t) => new Promise((ok, fail) => {
      const t0 = Date.now();
      const poll = () => {
        const i = c.msgs.findIndex((m) => m.t === t);
        if (i >= 0) return ok(c.msgs.splice(i, 1)[0]);
        if (Date.now() - t0 > 20_000) return fail(new Error(`no ${t}: ${JSON.stringify(c.msgs)}`));
        setTimeout(poll, 20);
      };
      poll();
    }),
  };
  ws.addEventListener('message', (e) => {
    if (typeof e.data === 'string') c.msgs.push(JSON.parse(e.data) as ServerMsg);
    else { const d = e.data as unknown; if (!(d instanceof ArrayBuffer)) throw new Error(`frame type ${Object.prototype.toString.call(d)} ${(d as { byteLength?: number }).byteLength}`); c.dec.apply(d); c.frames++; }
  });
  return c;
}

const until = async (f: () => boolean, ms = 20_000) => {
  const t0 = Date.now();
  while (!f()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe('WarRegionDO over the socket', () => {
  it('refuses unknown regions and unauthenticated sockets', async () => {
    expect((await SELF.fetch(`${BASE}/ws/war/test-ridge?sim=${SIM_VERSION}`, { headers: { upgrade: 'websocket' } })).status).toBe(401);
    const a = await devLogin(7101);
    const res = await SELF.fetch(`${BASE}/ws/war/atlantis?sim=${SIM_VERSION}`, { headers: { upgrade: 'websocket', 'sec-websocket-protocol': `pixelarrow.v1, ${a.token}` } });
    expect(res.status).toBe(404);
  });

  it('joins, streams decoded snapshots, checks ownership and keeps offline squads', async () => {
    const a = await devLogin(7102), b = await devLogin(7103);
    const ca = await connect(a.token), cb = await connect(b.token);
    ca.send({ t: 'join', v: NET_VERSION, region: 'test-ridge', playerId: a.playerId, team: 0, army: [{ cls: 'hoplite', count: 12 }] });
    const w = await ca.next('welcome');
    expect(w).toMatchObject({ you: { id: a.playerId, team: 0 } });
    const mine = (w as Extract<ServerMsg, { t: 'welcome' }>).squads[0];
    cb.send({ t: 'join', v: NET_VERSION, region: 'test-ridge', playerId: a.playerId, team: 1, army: [{ cls: 'archer', count: 12 }] });
    expect(await cb.next('refused')).toMatchObject({ reason: 'player' });
    cb.send({ t: 'join', v: NET_VERSION, region: 'test-ridge', playerId: b.playerId, team: 1, army: [{ cls: 'archer', count: 12 }] });
    await cb.next('welcome');
    await until(() => ca.frames > 3 && ca.dec.units.size === 12);
    // b may not order a's squad; garbage gets a parse error
    cb.send({ t: 'order', o: { kind: 'move', squad: mine, x: 100, y: 100 } });
    expect(await cb.next('error')).toMatchObject({ code: 'notOwner' });
    cb.send({ t: 'nonsense' });
    expect(await cb.next('error')).toMatchObject({ code: 'parse' });
    ca.send({ t: 'order', o: { kind: 'move', squad: mine, x: 192, y: 60 } });
    await until(() => [...ca.dec.units.values()].some((u) => u.state === 'move'));
    // a leaves: its squad stays in the region (b's stats count it), a rejoins without a new army
    ca.ws.close(1000);
    await new Promise((r) => setTimeout(r, 300));
    const stats = await (await SELF.fetch(`${BASE}/api/war/test-ridge/stats`)).json<{ units: number; online: number; running: boolean; totalMs: { avg: number } }>();
    expect(stats).toMatchObject({ units: 24, online: 1, running: true });
    const again = await connect(a.token);
    again.send({ t: 'join', v: NET_VERSION, region: 'test-ridge', playerId: a.playerId, team: 0, army: [{ cls: 'hoplite', count: 12 }] });
    expect(await again.next('welcome')).toMatchObject({ squads: [mine] });
    await until(() => again.dec.units.size === 12);
    again.send({ t: 'ping', c: 5 });
    expect(await again.next('pong')).toMatchObject({ c: 5 });
    again.ws.close(1000);
    cb.ws.close(1000);
  });
});
