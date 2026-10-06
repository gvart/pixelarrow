import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { BASE, devLogin } from './helpers';

interface Client {
  ws: WebSocket;
  msgs: Record<string, unknown>[];
  next(type: string): Promise<Record<string, unknown>>;
}

async function connect(region: string, token: string, via: 'query' | 'protocol' = 'query'): Promise<Client> {
  const url = via === 'query' ? `${BASE}/ws/region/${region}?token=${encodeURIComponent(token)}` : `${BASE}/ws/region/${region}`;
  const headers: Record<string, string> = { upgrade: 'websocket' };
  if (via === 'protocol') headers['sec-websocket-protocol'] = `pixelarrow.v1, ${token}`;
  const res = await SELF.fetch(url, { headers });
  expect(res.status).toBe(101);
  if (via === 'protocol') expect(res.headers.get('sec-websocket-protocol')).toBe('pixelarrow.v1');
  const ws = res.webSocket!;
  const msgs: Record<string, unknown>[] = [];
  const waiters: { type: string; resolve: (m: Record<string, unknown>) => void }[] = [];
  let seen = 0;
  const pump = () => {
    for (let i = 0; i < waiters.length; i++) {
      const w = waiters[i];
      const idx = msgs.findIndex((m, j) => j >= seen && m.type === w.type);
      if (idx >= 0) {
        seen = idx + 1;
        waiters.splice(i, 1);
        w.resolve(msgs[idx]);
        i--;
      }
    }
  };
  ws.addEventListener('message', (e) => {
    msgs.push(typeof e.data === 'string' && e.data.startsWith('{') ? JSON.parse(e.data) : { type: 'raw', data: e.data });
    pump();
  });
  ws.accept();
  return {
    ws,
    msgs,
    next: (type) =>
      new Promise((resolve, reject) => {
        waiters.push({ type, resolve });
        pump();
        setTimeout(() => reject(new Error(`timeout waiting for ${type}; got ${JSON.stringify(msgs)}`)), 3000);
      }),
  };
}

describe('RegionDO presence', () => {
  it('rejects unauthenticated and non-upgrade requests', async () => {
    expect((await SELF.fetch(`${BASE}/ws/region/aegean`, { headers: { upgrade: 'websocket' } })).status).toBe(401);
    expect((await SELF.fetch(`${BASE}/ws/region/aegean?token=bad`, { headers: { upgrade: 'websocket' } })).status).toBe(401);
    expect((await SELF.fetch(`${BASE}/ws/region/aegean`)).status).toBe(426);
  });

  it('welcomes, broadcasts join/leave, lists players and answers pings', async () => {
    const a = await devLogin(3001, 'Alcibiades');
    const b = await devLogin(3002, 'Brasidas');

    const ca = await connect('aegean', a.token);
    const welcomeA = await ca.next('welcome');
    expect(welcomeA).toMatchObject({ region: 'aegean', you: { id: a.playerId, name: 'Alcibiades' }, players: [{ id: a.playerId }] });

    const cb = await connect('aegean', b.token, 'protocol');
    const welcomeB = await cb.next('welcome');
    expect((welcomeB.players as { id: number }[]).map((p) => p.id).sort()).toEqual([a.playerId, b.playerId].sort());
    expect(await ca.next('join')).toMatchObject({ player: { id: b.playerId, name: 'Brasidas' } });

    ca.ws.send(JSON.stringify({ type: 'ping', t: 7 }));
    expect(await ca.next('pong')).toMatchObject({ t: 7 });
    ca.ws.send('ping');
    expect(await ca.next('raw')).toMatchObject({ data: 'pong' });
    ca.ws.send(JSON.stringify({ type: 'who' }));
    expect(((await ca.next('presence')).players as unknown[]).length).toBe(2);

    // A different region is a different room.
    const other = await connect('ionian', b.token);
    expect((await other.next('welcome')).players).toEqual([{ id: b.playerId, name: 'Brasidas' }]);

    cb.ws.close(1000, 'done');
    expect(await ca.next('leave')).toMatchObject({ player: { id: b.playerId } });
    ca.ws.close(1000);
    other.ws.close(1000);
  });
});
