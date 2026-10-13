import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { BASE, devLogin } from './helpers';
import { wsPath, type WsClient } from './onlineHelpers';

/** A presence socket on a region room, the bearer token in the WebSocket protocol header. */
async function connect(region: string, token: string): Promise<WsClient> {
  const c = await wsPath(token, `/ws/region/${region}`);
  expect(c.protocol).toBe('pixelarrow.v1');
  return c;
}

describe('RegionDO presence', () => {
  it('rejects unauthenticated and non-upgrade requests', async () => {
    expect((await SELF.fetch(`${BASE}/ws/region/aegean`, { headers: { upgrade: 'websocket' } })).status).toBe(401);
    expect((await SELF.fetch(`${BASE}/ws/region/aegean`, { headers: { upgrade: 'websocket', 'sec-websocket-protocol': 'pixelarrow.v1, bad' } })).status).toBe(401);
    expect((await SELF.fetch(`${BASE}/ws/region/aegean`)).status).toBe(426);
  });

  it('welcomes, broadcasts join/leave, lists players and answers pings', async () => {
    const a = await devLogin(3001, 'Alcibiades');
    const b = await devLogin(3002, 'Brasidas');

    const ca = await connect('aegean', a.token);
    const welcomeA = await ca.next('welcome');
    expect(welcomeA).toMatchObject({ region: 'aegean', you: { id: a.playerId, name: a.name }, players: [{ id: a.playerId }] });

    const cb = await connect('aegean', b.token);
    const welcomeB = await cb.next('welcome');
    expect((welcomeB.players as { id: number }[]).map((p) => p.id).sort()).toEqual([a.playerId, b.playerId].sort());
    expect(await ca.next('join')).toMatchObject({ player: { id: b.playerId, name: b.name } });

    ca.ws.send(JSON.stringify({ type: 'ping', t: 7 }));
    expect(await ca.next('pong')).toMatchObject({ t: 7 });
    ca.ws.send('ping');
    expect(await ca.next('raw')).toMatchObject({ data: 'pong' });
    ca.ws.send(JSON.stringify({ type: 'who' }));
    expect(((await ca.next('presence')).players as unknown[]).length).toBe(2);

    // A different region is a different room.
    const other = await connect('ionian', b.token);
    expect((await other.next('welcome')).players).toEqual([{ id: b.playerId, name: b.name }]);

    cb.ws.close(1000, 'done');
    expect(await ca.next('leave')).toMatchObject({ player: { id: b.playerId } });
    ca.ws.close(1000);
    other.ws.close(1000);
  });
});
