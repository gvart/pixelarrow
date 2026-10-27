/** The war's online cap (server/src/war/world/gate.ts, the gate sockets of WarWorldDO; src/war/net/gate.ts). */
import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { GATE_EXPIRE_MS, GATE_LEAVE, MAX_ONLINE_DEFAULT, type GateMsg } from '../../../src/war/net/gate';
import { gateAdmin, gateCap, gateEta, planGate, type GateTab } from '../../src/war/world/gate';
import type { WarWorldDO } from '../../src/war/world/worldDO';

const T0 = 1_000_000_000;
const tab = (pid: number, at: number, o: Partial<GateTab> = {}): GateTab => ({ pid, admin: false, in: false, at, seen: at, ...o });

describe('planGate', () => {
  it('admits up to the cap, then keeps the line in arrival order', () => {
    const tabs = [tab(5, T0 + 4), tab(1, T0), tab(2, T0 + 1), tab(3, T0 + 2), tab(4, T0 + 3)];
    const p = planGate(tabs, new Map(), 3, T0 + 10);
    expect(p.admit.map((i) => tabs[i].pid)).toEqual([1, 2, 3]);
    expect(p.online).toBe(3);
    expect(p.waiting).toBe(2);
    expect([...p.place].map(([i, n]) => [tabs[i].pid, n])).toEqual([[4, 1], [5, 2]]);
  });

  it('advances the line when a place frees', () => {
    const tabs = [tab(1, T0, { in: true }), tab(2, T0 + 1, { in: true }), tab(3, T0 + 2), tab(4, T0 + 3)];
    expect(planGate(tabs, new Map(), 2, T0 + 10).admit).toEqual([]);
    const left = tabs.slice(1); // player 1 left
    const p = planGate(left, new Map(), 2, T0 + 20);
    expect(p.admit.map((i) => left[i].pid)).toEqual([3]);
    expect(p.fromLine).toEqual([3]);
    expect([...p.place].map(([i, n]) => [left[i].pid, n])).toEqual([[4, 1]]);
  });

  it('drops a tab whose heartbeat expired and gives its place to the next', () => {
    const now = T0 + GATE_EXPIRE_MS + 5000;
    const tabs = [tab(1, T0, { in: true, seen: T0 }), tab(2, T0 + 1, { in: true, seen: now - 1000 }), tab(3, T0 + 2, { seen: now - 1000 })];
    const p = planGate(tabs, new Map(), 2, now);
    expect(p.expired).toEqual([0]);
    expect(p.admit.map((i) => tabs[i].pid)).toEqual([3]);
    expect(p.online).toBe(2);
  });

  it('counts a player with several tabs once, and lets his new tab in even when full', () => {
    const tabs = [tab(1, T0, { in: true }), tab(1, T0 + 5, { in: true }), tab(2, T0 + 1), tab(1, T0 + 9)];
    const p = planGate(tabs, new Map(), 2, T0 + 10);
    expect(p.online).toBe(2);
    expect(p.admit.map((i) => tabs[i].pid).sort()).toEqual([1, 2]);
    // full: player 3 waits, player 1's next tab goes in
    const more = [...tabs.map((t) => ({ ...t, in: true })), tab(3, T0 + 11), tab(1, T0 + 12)];
    const q = planGate(more, new Map(), 2, T0 + 20);
    expect(q.admit.map((i) => more[i].pid)).toEqual([1]);
    expect(q.waiting).toBe(1);
    // two waiting tabs of one player: one place, the earlier tab's
    const line = [tab(9, T0, { in: true }), tab(4, T0 + 3), tab(5, T0 + 1), tab(4, T0 + 4)];
    const r = planGate(line, new Map(), 1, T0 + 10);
    expect([...r.place].sort((x, y) => x[0] - y[0]).map(([i, n]) => [line[i].pid, n])).toEqual([[4, 2], [5, 1], [4, 2]]);
    expect(r.waiting).toBe(2);
  });

  it('lets admins in at once and never counts them', () => {
    const tabs = [tab(1, T0, { in: true }), tab(7, T0 + 1, { admin: true }), tab(2, T0 + 2)];
    const p = planGate(tabs, new Map(), 1, T0 + 10);
    expect(p.admit.map((i) => tabs[i].pid)).toEqual([7]);
    expect(p.online).toBe(1);
    expect(p.waiting).toBe(1);
  });

  it('keeps a held place until it runs out', () => {
    const held = new Map([[1, T0 + 30_000]]);
    const tabs = [tab(2, T0 + 1)];
    expect(planGate(tabs, held, 1, T0 + 10)).toMatchObject({ admit: [], online: 1, waiting: 1 });
    expect(planGate([tab(1, T0 + 20), ...tabs], held, 1, T0 + 20).admit).toEqual([0]); // back in time: in at once
    const p = planGate(tabs, held, 1, T0 + 31_000);
    expect(p.admit).toEqual([0]);
    expect(held.size).toBe(0);
  });

  it('reads the cap and the admins from the env, and guesses a wait', () => {
    expect(gateCap(undefined)).toBe(MAX_ONLINE_DEFAULT);
    expect(gateCap('')).toBe(MAX_ONLINE_DEFAULT);
    expect(gateCap('x')).toBe(MAX_ONLINE_DEFAULT);
    expect(gateCap('120')).toBe(120);
    expect(gateCap('0')).toBe(0);
    expect(gateAdmin('3, 17,40', 17)).toBe(true);
    expect(gateAdmin('3,17', 4)).toBe(false);
    expect(gateAdmin(undefined, 4)).toBe(false);
    expect(gateEta(2, [], 50, T0)).toBe(2 * 36_000); // half an hour a place over 50 places
    expect(gateEta(3, [T0 - 60_000, T0 - 30_000], 50, T0)).toBe(90_000); // two let in over the last minute
  });
});

interface Sock { ws: WebSocket; msgs: GateMsg[]; closed: number | null; last(): GateMsg | undefined }

/** A gate socket straight to a world object of its own (no Worker, no D1). */
async function gate(stub: DurableObjectStub<WarWorldDO>, pid: number, admin = false): Promise<Sock> {
  const res = await stub.fetch(new Request('https://war/ws/war/world?gate=1', { headers: { upgrade: 'websocket', 'x-player-id': String(pid), 'x-alliance': '', 'x-war-admin': admin ? '1' : '0' } }));
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  const s: Sock = { ws, msgs: [], closed: null, last: () => s.msgs[s.msgs.length - 1] };
  ws.addEventListener('message', (e) => { if (typeof e.data === 'string' && e.data !== 'pong') s.msgs.push(JSON.parse(e.data) as GateMsg); });
  ws.addEventListener('close', (e) => { s.closed = e.code; });
  ws.accept();
  return s;
}

const until = async (ok: () => boolean, what: string) => {
  const t0 = Date.now();
  while (!ok()) {
    if (Date.now() - t0 > 10_000) throw new Error(`timed out: ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
};

let n = 0;
async function world(cap: number) {
  const stub = env.WAR_WORLD.get(env.WAR_WORLD.idFromName(`gate-test-${++n}`));
  await runInDurableObject(stub, (o: WarWorldDO) => void (o.gateCapOverride = cap));
  return stub;
}

describe('the gate sockets of the world', () => {
  it('admits up to the cap, queues the rest in order, and lets the next in when one leaves', async () => {
    const w = await world(2);
    const a = await gate(w, 101), b = await gate(w, 102);
    await until(() => a.last()?.s === 'in' && b.last()?.s === 'in', 'two in');
    const c = await gate(w, 103), d = await gate(w, 104);
    await until(() => c.last()?.s === 'queue' && d.last()?.s === 'queue', 'two waiting');
    expect(c.last()).toMatchObject({ s: 'queue', place: 1, of: 1 });
    expect(d.last()).toMatchObject({ s: 'queue', place: 2, of: 2 });
    expect(await w.admitted(103, false)).toBe(false);
    expect(await w.admitted(101, false)).toBe(true);

    a.ws.close(GATE_LEAVE, 'leave');
    await until(() => c.last()?.s === 'in', 'the first in line goes in');
    await until(() => d.last()?.s === 'queue' && (d.last() as { place: number }).place === 1, 'the second moves up');
    expect(await w.admitted(103, false)).toBe(true);
    expect(await w.admitted(101, false)).toBe(false); // left on purpose: no held place
  });

  it('counts a player with several tabs once', async () => {
    const w = await world(2);
    const a1 = await gate(w, 201), a2 = await gate(w, 201), b = await gate(w, 202);
    await until(() => [a1, a2, b].every((s) => s.last()?.s === 'in'), 'all in');
    const c = await gate(w, 203), a3 = await gate(w, 201);
    await until(() => c.last()?.s === 'queue' && a3.last()?.s === 'in', 'his third tab in, the other waits');
    expect(await w.gateRun()).toEqual({ online: 2, waiting: 1 });
    a1.ws.close(GATE_LEAVE, 'leave');
    await new Promise((r) => setTimeout(r, 100));
    expect(c.last()?.s).toBe('queue'); // one tab left of three: still in
  });

  it('frees the place of a tab whose heartbeat expired, and a ping keeps a tab alive', async () => {
    const age = (w: DurableObjectStub<WarWorldDO>, pid: number, ms: number) => runInDurableObject(w, (_o: WarWorldDO, st: DurableObjectState) => {
      for (const ws of st.getWebSockets('gate')) {
        const at = ws.deserializeAttachment();
        if (at?.pid === pid) ws.serializeAttachment({ ...at, gate: { ...at.gate, at: at.gate.at - ms } });
      }
    });
    const w = await world(1);
    const a = await gate(w, 301);
    await until(() => a.last()?.s === 'in', 'in');
    const b = await gate(w, 302);
    await until(() => b.last()?.s === 'queue', 'waiting');
    await age(w, 301, GATE_EXPIRE_MS + 5000); // a crashed: not a word since long ago
    expect(await w.gateRun()).toEqual({ online: 1, waiting: 0 });
    await until(() => a.closed === 4000, 'a closed as expired');
    await until(() => b.last()?.s === 'in', 'b goes in');

    const w2 = await world(1);
    const c = await gate(w2, 303);
    await until(() => c.last()?.s === 'in', 'in');
    await age(w2, 303, 60_000);
    c.ws.send('ping'); // auto-answered: its time is c's last sign of life
    await new Promise((r) => setTimeout(r, 100));
    expect(await w2.gateRun(Date.now() + GATE_EXPIRE_MS - 30_000)).toEqual({ online: 1, waiting: 0 });
    expect(c.closed).toBe(null);
  });

  it('lets admins past a full war without taking a place', async () => {
    const w = await world(1);
    const a = await gate(w, 401);
    await until(() => a.last()?.s === 'in', 'in');
    const op = await gate(w, 499, true);
    await until(() => op.last()?.s === 'in', 'the admin goes in');
    const b = await gate(w, 402);
    await until(() => b.last()?.s === 'queue', 'b waits');
    expect(await w.gateRun()).toEqual({ online: 1, waiting: 1 });
    expect(await w.admitted(499, true)).toBe(true);
    expect(await w.admitted(498, true)).toBe(true); // an admin needs no gate socket at all
    expect(await w.admitted(402, false)).toBe(false);
  });

  it('keeps the place of a tab that dropped by accident for a while', async () => {
    const w = await world(1);
    const a = await gate(w, 501);
    await until(() => a.last()?.s === 'in', 'in');
    a.ws.close(1000, 'drop');
    const b = await gate(w, 502);
    await until(() => b.last()?.s === 'queue', 'b waits behind the held place');
    const a2 = await gate(w, 501);
    await until(() => a2.last()?.s === 'in', 'back in');
  });

  it('lets any player play while the war has room', async () => {
    const w = await world(2);
    expect(await w.admitted(601, false)).toBe(true); // no gate socket: refused only once the war is full
  });
});
