import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Battle } from '../../src/sim/battle';
import { Lockstep } from '../../src/online/lockstep';
import { DEPLOY_GRACE_MS, DEPLOY_MS, type DuelStart, type ServerMsg } from '../../src/online/protocol';
import { DuelHub, type Out } from '../src/online/duel';
import { onlineBattleSetup } from '../../src/online/battle';
import { starterOnlineArmy, DEFAULT_FORMATIONS } from '../../src/online/rules';
import { api, mockTelegram, webhook } from './helpers';
import { DB, fresh, getJson, join, post, wsOnline, type Profile } from './onlineHelpers';

beforeEach(fresh);
afterEach(() => vi.restoreAllMocks());

interface ClanResp {
  clan: { id: number; name: string; tag: string; members: { id: number; role: string }[] } | null;
  role: string | null;
}

describe('clans', () => {
  it('create, invite link, join, roles and permissions, leave', async () => {
    mockTelegram({ getMe: { username: 'pixelarrow_bot' } });
    const a = await join(8001, 'Leonidas');
    const b = await join(8002, 'Brasidas');
    const c = await join(8003, 'Cleon');

    const made = await post<ClanResp>('/api/online/clans', a.token, { name: 'Lambda Band', tag: 'lmb' });
    expect(made.status).toBe(200);
    expect(made.body).toMatchObject({ role: 'leader', clan: { name: 'Lambda Band', tag: 'LMB' } });
    expect((await post('/api/online/clans', b.token, { name: 'lambda band', tag: 'XX' })).status).toBe(409); // name taken
    // A's land is clan land now.
    const home = await DB().prepare('SELECT clan_id FROM online_hexes WHERE owner_id = ?1').bind(a.playerId).first<{ clan_id: number }>();
    expect(home?.clan_id).toBe(made.body.clan!.id);

    const inv = await post<{ code: string; link: string }>('/api/online/clans/invite', a.token);
    expect(inv.status).toBe(200);
    expect(inv.body.link).toBe(`https://t.me/pixelarrow_bot/play?startapp=clan_${inv.body.code}`);
    const preview = await getJson<{ clan: { name: string; members: number } }>(`/api/online/clans/invite/${inv.body.code}`, b.token);
    expect(preview.body.clan).toMatchObject({ name: 'Lambda Band', members: 1 });

    const jb = await post<ClanResp>('/api/online/clans/join', b.token, { code: inv.body.code });
    expect(jb.status).toBe(200);
    expect(jb.body.role).toBe('member');
    expect((await post('/api/online/clans/join', b.token, { code: 'nope1234' })).status).toBe(404);

    // Members cannot invite or kick; officers can (but not the leader).
    expect((await post('/api/online/clans/invite', b.token)).status).toBe(403);
    expect((await post('/api/online/clans/kick', b.token, { playerId: a.playerId })).status).toBe(403);
    expect((await post('/api/online/clans/promote', b.token, { playerId: b.playerId, role: 'officer' })).status).toBe(403);
    const pr = await post<ClanResp>('/api/online/clans/promote', a.token, { playerId: b.playerId, role: 'officer' });
    expect(pr.body.clan!.members.find((m) => m.id === b.playerId)?.role).toBe('officer');
    const inv2 = await post<{ code: string }>('/api/online/clans/invite', b.token);
    expect(inv2.status).toBe(200);
    expect((await post('/api/online/clans/join', c.token, { code: inv2.body.code })).status).toBe(200);
    expect((await post('/api/online/clans/kick', b.token, { playerId: a.playerId })).status).toBe(403);
    const kicked = await post<ClanResp>('/api/online/clans/kick', b.token, { playerId: c.playerId });
    expect(kicked.status).toBe(200);
    expect(kicked.body.clan!.members.map((m) => m.id)).not.toContain(c.playerId);
    expect((await getJson<ClanResp>('/api/online/clans/mine', c.token)).body.clan).toBeNull();

    // Hand over leadership, then the new leader leaves: A (officer) takes over again.
    const handed = await post<ClanResp>('/api/online/clans/promote', a.token, { playerId: b.playerId, role: 'leader' });
    expect(handed.body.role).toBe('officer');
    expect((await post('/api/online/clans/leave', b.token)).status).toBe(200);
    const mine = await getJson<ClanResp>('/api/online/clans/mine', a.token);
    expect(mine.body.role).toBe('leader');
    expect(mine.body.clan!.members).toHaveLength(1);
    // Last member leaving dissolves the clan.
    await post('/api/online/clans/leave', a.token);
    const left = await DB().prepare('SELECT COUNT(*) AS n FROM clans WHERE id = ?1').bind(made.body.clan!.id).first<{ n: number }>();
    expect(left!.n).toBe(0);
  });

  it('the bot /start clan_<code> payload opens the game with the invite', async () => {
    const calls = mockTelegram();
    await webhook({ update_id: 30, message: { message_id: 1, chat: { id: 9, type: 'private' }, from: { id: 9 }, text: '/start clan_Abc123xyz' } });
    expect(calls[0].params).toMatchObject({ reply_markup: { inline_keyboard: [[{ web_app: { url: 'https://pixelarrow.app?startapp=clan_Abc123xyz' } }]] } });
  });

  it('a new player joining by invite is placed in the clan shard', async () => {
    const a = await join(8010);
    await post('/api/online/clans', a.token, { name: 'Owls', tag: 'OWL' });
    const inv = await post<{ code: string }>('/api/online/clans/invite', a.token);
    const { devLogin } = await import('./helpers');
    const n = await devLogin(8011, 'Newcomer');
    const j = await post<ClanResp>('/api/online/clans/join', n.token, { code: inv.body.code });
    expect(j.status).toBe(200);
    const prof = await getJson<Profile>('/api/online/profile', n.token);
    expect(prof.body.shard.id).toBe(a.profile.shard.id);
    expect(prof.body.clan).toMatchObject({ tag: 'OWL', role: 'member' });
  });
});

// ------------------------------------------------------------------ duel hub (unit)

function hub(clock: { now: number } = { now: 1000 }) {
  let n = 0;
  const p0 = starterOnlineArmy(1, { nextId: 1 }, 'a_');
  const p1 = starterOnlineArmy(2, { nextId: 1 }, 'b_');
  return new DuelHub({
    now: () => clock.now,
    randomId: () => `id${n++}`,
    randomSeed: () => 4242,
    online: () => true,
    buildDuel: async (_a, _b, seed) => ({
      setup: onlineBattleSetup(seed, { heroes: p0, formations: DEFAULT_FORMATIONS, bot: false }, { heroes: p1, formations: DEFAULT_FORMATIONS, bot: false }, null),
      heroes: [p0, p1],
    }),
  });
}

const A = { id: 1, name: 'A' };
const B = { id: 2, name: 'B' };
const lookup = (id: number) => (id === 1 ? A : id === 2 ? B : null);
const msgsTo = (out: Out[], to: number, type: string) => out.filter((o) => o.to === to && o.msg.type === type).map((o) => o.msg);

async function startedDuel(h: DuelHub): Promise<string> {
  const ch = await h.handle(A, { type: 'challenge', to: 2 }, lookup);
  const id = (msgsTo(ch, 2, 'challenged')[0] as { id: string }).id;
  const acc = await h.handle(B, { type: 'challenge_reply', id, accept: true }, lookup);
  const start = msgsTo(acc, 1, 'duel_start')[0] as DuelStart;
  expect(msgsTo(acc, 2, 'duel_start')[0]).toMatchObject({ side: 1, duel: start.duel });
  expect(start.side).toBe(0);
  return start.duel;
}

describe('duel relay (DuelHub)', () => {
  it('echoes deployment orders in one order, seals turns with both players’ orders stamped with ticks', async () => {
    const h = hub();
    const duel = await startedDuel(h);
    const d1 = await h.handle(A, { type: 'd_order', duel, order: { kind: 'preset', group: 0, type: 'shieldwall' } }, lookup);
    const d2 = await h.handle(B, { type: 'd_order', duel, order: { kind: 'preset', group: 4, type: 'wedge' } }, lookup);
    expect(msgsTo(d1, 2, 'd_order')[0]).toMatchObject({ seq: 0, side: 0 });
    expect(msgsTo(d2, 1, 'd_order')[0]).toMatchObject({ seq: 1, side: 1 });
    // Orders before the start are refused; deployment ends when both are ready.
    expect(msgsTo(await h.handle(A, { type: 'cmd', duel, order: { kind: 'order', group: 0, order: 'charge' } }, lookup), 1, 'error')).toHaveLength(1);
    await h.handle(A, { type: 'd_ready', duel }, lookup);
    const go = await h.handle(B, { type: 'd_ready', duel }, lookup);
    expect(msgsTo(go, 1, 'go')).toHaveLength(1);
    expect(msgsTo(go, 2, 'turn').map((t) => (t as { n: number }).n)).toEqual([0, 1]);

    await h.handle(B, { type: 'cmd', duel, order: { kind: 'order', group: 4, order: 'advance' } }, lookup);
    await h.handle(A, { type: 'cmd', duel, order: { kind: 'order', group: 0, order: 'charge' } }, lookup);
    expect(await h.handle(A, { type: 'reach', duel, n: 0, hash: 'abc' }, lookup)).toHaveLength(0); // waits for B
    const sealed = await h.handle(B, { type: 'reach', duel, n: 0, hash: 'abc' }, lookup);
    const t2a = msgsTo(sealed, 1, 'turn')[0] as { n: number; tick: number; orders: { side: number }[] };
    const t2b = msgsTo(sealed, 2, 'turn')[0];
    expect(t2a).toEqual(t2b);
    expect(t2a.n).toBe(2);
    expect(t2a.tick).toBe(4);
    expect(t2a.orders.map((o) => o.side)).toEqual([1, 0]); // arrival order
    const state = h.duels.get(duel)!;
    expect(state.log.slice(-2).map((o) => o.tick)).toEqual([4, 4]);
    expect(state.deployOrders).toBe(2);
  });

  it('timed deployment: the duel starts by itself when the time is up, with the deploy orders logged before it', async () => {
    const clock = { now: 1000 };
    const h = hub(clock);
    const ch = await h.handle(A, { type: 'challenge', to: 2 }, lookup);
    const id = (msgsTo(ch, 2, 'challenged')[0] as { id: string }).id;
    const acc = await h.handle(B, { type: 'challenge_reply', id, accept: true }, lookup);
    const start = msgsTo(acc, 1, 'duel_start')[0] as DuelStart;
    expect(start.deployMs).toBe(DEPLOY_MS);
    const duel = start.duel;
    expect(h.nextDeadline()).toBe(1000 + DEPLOY_MS + DEPLOY_GRACE_MS);
    await h.handle(A, { type: 'd_order', duel, order: { kind: 'preset', group: 0, type: 'wedge' } }, lookup);
    // one side ready is not enough before the time is up
    const ra = await h.handle(A, { type: 'd_ready', duel }, lookup);
    expect(msgsTo(ra, 2, 'd_ready')[0]).toMatchObject({ side: 0 });
    expect(msgsTo(ra, 1, 'go')).toHaveLength(0);
    clock.now += DEPLOY_MS;
    expect(h.tick()).toHaveLength(0); // the grace period still runs
    clock.now += DEPLOY_GRACE_MS;
    const out = h.tick();
    expect(msgsTo(out, 1, 'go')).toHaveLength(1);
    expect(msgsTo(out, 2, 'go')).toHaveLength(1);
    expect(msgsTo(out, 2, 'turn').map((t) => (t as { n: number }).n)).toEqual([0, 1]);
    const d = h.duels.get(duel)!;
    expect(d.phase).toBe('battle');
    expect(d.deployOrders).toBe(1);
    expect(h.nextDeadline()).toBeNull();
    // late deployment orders and a second go are refused
    expect(await h.handle(B, { type: 'd_order', duel, order: { kind: 'preset', group: 4, type: 'line' } }, lookup)).toHaveLength(0);
    expect(msgsTo(await h.handle(B, { type: 'd_ready', duel }, lookup), 1, 'go')).toHaveLength(0);
    expect(h.tick()).toHaveLength(0);
  });

  it('timed deployment: any message after the deadline starts the duel too (no alarm needed)', async () => {
    const clock = { now: 5000 };
    const h = hub(clock);
    const duel = await startedDuel(h);
    clock.now += DEPLOY_MS + DEPLOY_GRACE_MS + 1;
    const out = await h.handle(A, { type: 'cmd', duel, order: { kind: 'order', group: 0, order: 'advance' } }, lookup);
    expect(msgsTo(out, 1, 'go')).toHaveLength(1);
    expect(msgsTo(out, 1, 'error')).toHaveLength(0);
    expect(h.duels.get(duel)!.pending).toHaveLength(1);
  });

  it('detects a desync from differing state hashes', async () => {
    const h = hub();
    const duel = await startedDuel(h);
    await h.handle(A, { type: 'd_ready', duel }, lookup);
    await h.handle(B, { type: 'd_ready', duel }, lookup);
    await h.handle(A, { type: 'reach', duel, n: 0, hash: 'aaaa' }, lookup);
    const out = await h.handle(B, { type: 'reach', duel, n: 0, hash: 'bbbb' }, lookup);
    expect(msgsTo(out, 1, 'desync')[0]).toMatchObject({ n: 0, hashes: ['aaaa', 'bbbb'] });
    expect(msgsTo(out, 2, 'desync')).toHaveLength(1);
    expect(h.busy(1) || h.busy(2)).toBe(false);
  });

  it('declines, cancels and aborts when a player leaves', async () => {
    const h = hub();
    const ch = await h.handle(A, { type: 'challenge', to: 2 }, lookup);
    const id = (msgsTo(ch, 2, 'challenged')[0] as { id: string }).id;
    const dec = await h.handle(B, { type: 'challenge_reply', id, accept: false }, lookup);
    expect(msgsTo(dec, 1, 'challenge_closed')[0]).toMatchObject({ reason: 'declined' });
    const duel = await startedDuel(h);
    const gone = h.disconnect(2);
    expect(gone[0]).toMatchObject({ to: 1, msg: { type: 'duel_abort', duel, reason: 'opponent_left' } });
  });
});

// ------------------------------------------------------------------ live duel over the shard socket (e2e)

describe('live duel over WebSocket', () => {
  it('two players: presence, challenge, lockstep battle on both clients, verified result', async () => {
    const a = await join(8101, 'Achilles');
    const b = await join(8102, 'Hektor');
    const ca = await wsOnline(a.token);
    const cb = await wsOnline(b.token);
    await ca.next('welcome');
    const wb = await cb.next('welcome');
    expect((wb.players as { id: number }[]).map((p) => p.id)).toEqual(expect.arrayContaining([a.playerId, b.playerId]));

    ca.send({ type: 'challenge', to: b.playerId });
    const challenged = await cb.next('challenged');
    cb.send({ type: 'challenge_reply', id: challenged.id, accept: true });
    const sa = (await ca.next('duel_start')) as unknown as DuelStart;
    const sb = (await cb.next('duel_start')) as unknown as DuelStart;
    expect(sa.setup).toEqual(sb.setup);
    expect(sa.setup.armies.every((x) => !x.bot)).toBe(true);
    expect(sa.heroes[0].map((h) => h.id)).toEqual(expect.arrayContaining(a.profile.heroes.map((h) => h.hero.id)));

    // Both clients run the same battle through the Lockstep adapter.
    const mk = (start: DuelStart, c: typeof ca) => {
      const ls = new Lockstep(new Battle(JSON.parse(JSON.stringify(start.setup))), start.side, start.duel, (m) => c.send(m), { turnTicks: start.turnTicks, delayTurns: start.delayTurns, hashEvery: start.hashEvery });
      c.onMessage = (m) => ls.receive(m as unknown as ServerMsg);
      for (const m of c.msgs) ls.receive(m as unknown as ServerMsg);
      return ls;
    };
    const la = mk(sa, ca);
    const lb = mk(sb, cb);
    la.issue({ kind: 'preset', group: 0, type: 'shieldwall' });
    lb.issue({ kind: 'preset', group: 4, type: 'wedge' });
    await ca.next('d_order', (m) => m.side === 1);
    await cb.next('d_order', (m) => m.side === 0);
    la.markReady();
    lb.markReady();
    await ca.next('go');
    await cb.next('go');
    let ordered = false;
    let retreated = false;
    for (let guard = 0; guard < 4000 && !(la.sim.phase === 'ended' && lb.sim.phase === 'ended'); guard++) {
      la.pump(50);
      lb.pump(50);
      if (!ordered && la.sim.tick >= 6) {
        la.issue({ kind: 'order', group: 0, order: 'advance' });
        lb.issue({ kind: 'order', group: 4, order: 'charge' });
        ordered = true;
      }
      if (!retreated && la.sim.tick >= 60) {
        lb.issue({ kind: 'retreat' });
        retreated = true;
      }
      if (la.desync || lb.desync) break;
      await new Promise((r) => setTimeout(r, 2));
    }
    expect(la.desync).toBeNull();
    expect(la.sim.phase).toBe('ended');
    expect(lb.sim.phase).toBe('ended');
    expect(la.sim.hash()).toBe(lb.sim.hash());
    expect(la.sim.retreated).toBe(1);
    la.finish();
    lb.finish();
    const ra = await ca.next('duel_result');
    expect(ra).toMatchObject({ verified: true, winner: 0, ticks: la.sim.tick, hash: la.sim.hash() });
    await cb.next('duel_result');
    const log = await DB().prepare("SELECT * FROM battle_log WHERE kind = 'duel' ORDER BY id DESC").first<{ verified: number; winner: number }>();
    expect(log).toMatchObject({ verified: 1, winner: 0 });
    ca.ws.close(1000);
    cb.ws.close(1000);
  }, 30_000);

  it('the online socket needs a session and a season profile', async () => {
    const { BASE } = await import('./helpers');
    const { SELF } = await import('cloudflare:test');
    expect((await SELF.fetch(`${BASE}/ws/online`, { headers: { upgrade: 'websocket' } })).status).toBe(401);
    const { devLogin } = await import('./helpers');
    const n = await devLogin(8199);
    expect((await SELF.fetch(`${BASE}/ws/online?token=${encodeURIComponent(n.token)}`, { headers: { upgrade: 'websocket' } })).status).toBe(409);
    expect((await api('/api/online/status', { token: n.token })).status).toBe(200);
  });
});
