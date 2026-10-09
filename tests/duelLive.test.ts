/**
 * The client side of live duel matches (src/duel/match.ts, the queue in
 * src/duel/client.ts): the end of a match and Cancel racing the server's
 * pairing. No server, no Phaser: a fake WebSocket and a fake sign-in.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/platform/cloud', () => ({
  online: { available: true, signIn: async () => true, api: { token: 'tok', base: 'http://local' } },
}));

import { Battle } from '../src/sim/battle';
import { MATCH_HEARTBEAT, MatchLink, STALL_GIVE_UP_MS, STALL_POLL_MS, forgetMatch, matchSource, ongoingMatch, rememberMatch } from '../src/duel/match';
import { ApiDuelSource, type QueueEvent } from '../src/duel/client';
import { onlineBattleSetup } from '../src/online/battle';
import { DEFAULT_FORMATIONS, starterOnlineArmy } from '../src/online/rules';
import type { DuelStart } from '../src/online/protocol';
import type { DuelLiveServerMsg, MatchReport } from '../src/duel/protocol';

/** A WebSocket stand-in: records what is sent, and lets the test deliver messages. */
class FakeSocket {
  static OPEN = 1;
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  deliver(m: unknown): void {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
  send(s: string): void {
    // the heartbeat's `ping` is a bare text frame
    this.sent.push(s === 'ping' ? s : JSON.parse(s));
  }
  close(): void {
    this.readyState = 3;
  }
}

beforeEach(() => {
  FakeSocket.all = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('location', { origin: 'http://local' });
});

function duelStart(side: 0 | 1 = 0): DuelStart {
  const a = starterOnlineArmy(3, { nextId: 1 }, 'a_');
  const b = starterOnlineArmy(4, { nextId: 1 }, 'b_');
  const setup = onlineBattleSetup(21, { heroes: a, formations: DEFAULT_FORMATIONS, bot: false }, { heroes: b, formations: DEFAULT_FORMATIONS, bot: false }, null);
  return { type: 'duel_start', duel: 'm1', side, setup, heroes: [a, b], names: ['Ann', 'Bob'], turnTicks: 2, delayTurns: 2, hashEvery: 10, mode: 'unranked' };
}

function report(over: Partial<MatchReport> = {}): MatchReport {
  return { match: 'm1', mode: 'unranked', side: 0, names: ['Ann', 'Bob'], winner: 0, end: 'battle', verified: true, ticks: 400, abandoned: false, glory: 15, accountXp: 40, rating: null, league: null, placements: null, xp: [], ...over };
}

describe('live match end', () => {
  it('a report settled first by the other side lets this client run on to the end of the battle', () => {
    const start = duelStart();
    const link = new MatchLink('m1');
    link.sock.open();
    const ws = FakeSocket.all[0];
    ws.open();
    const done = vi.fn();
    const src = matchSource(link, start, done);
    const sim = new Battle(JSON.parse(JSON.stringify(start.setup)));
    src.lockstep!.attach(sim);
    const msg = (m: DuelLiveServerMsg) => ws.deliver(m);
    msg({ type: 'go', duel: 'm1' });
    for (let n = 0; n < 5; n++) msg({ type: 'turn', duel: 'm1', n, tick: n * 2, orders: [] });
    expect(sim.phase).toBe('battle');
    // the other client ended the battle and the server settled it before this one got there
    msg({ type: 'match_result', duel: 'm1', report: report() });
    expect(link.report).not.toBeNull();
    // sealed turns are left to run: no "opponent left" banner, the battle plays out
    expect(src.lockstep!.aborted()).toBeNull();
    while (src.lockstep!.canStep()) {
      src.lockstep!.beforeStep();
      sim.step();
    }
    // stuck past the sealed turns: the battle ends with the settled result, not "left the duel"
    expect(src.lockstep!.aborted()).toBe('Victory!');
    src.onFinish(sim, 0);
    expect(done).toHaveBeenCalledTimes(1);
    expect(done.mock.calls[0][0].report).toMatchObject({ end: 'battle', winner: 0 });
  });

  it('an opponent who left still ends the battle with the abandon banner', () => {
    const start = duelStart();
    const link = new MatchLink('m1');
    link.sock.open();
    const ws = FakeSocket.all[0];
    ws.open();
    const src = matchSource(link, start, () => undefined);
    src.lockstep!.attach(new Battle(JSON.parse(JSON.stringify(start.setup))));
    ws.deliver({ type: 'match_result', duel: 'm1', report: report({ end: 'forfeit' }) });
    expect(src.lockstep!.aborted()).toBe('Bob left the duel');
  });
});

describe('ranked queue', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('a match the server found while Cancel was on its way is still delivered (never abandoned unseen)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      const events: QueueEvent[] = [];
      const cancel = new ApiDuelSource().queue('unranked', (e) => events.push(e));
      await vi.waitFor(() => expect(FakeSocket.all.length).toBe(1));
      const ws = FakeSocket.all[0];
      ws.open();
      ws.deliver({ type: 'mm_welcome', now: 1, match: null, cooldownUntil: 0 });
      expect(ws.sent).toEqual([{ type: 'queue', mode: 'unranked' }]);
      ws.deliver({ type: 'queued', mode: 'unranked', since: 1, now: 1 });
      cancel();
      expect(ws.sent.at(-1)).toEqual({ type: 'cancel' });
      // the server was pairing: no `unqueued`, the match comes
      ws.deliver({ type: 'match_found', match: 'm9', mode: 'unranked', side: 1, opponent: { name: 'Bob', league: null } });
      expect(events.at(-1)).toMatchObject({ type: 'match_found', match: 'm9' });
      cancel();
      expect(ws.sent.filter((m) => (m as { type: string }).type === 'cancel')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
    await flush();
  });

  it('a cancel the server confirms ends the queue quietly (nothing after it reaches the screen)', async () => {
    const events: QueueEvent[] = [];
    const cancel = new ApiDuelSource().queue('ranked', (e) => events.push(e));
    await vi.waitFor(() => expect(FakeSocket.all.length).toBe(1));
    const ws = FakeSocket.all[0];
    ws.open();
    ws.deliver({ type: 'mm_welcome', now: 1, match: null, cooldownUntil: 0 });
    cancel();
    const n = events.length;
    ws.deliver({ type: 'unqueued', reason: 'cancelled' });
    ws.deliver({ type: 'queued', mode: 'ranked', since: 1, now: 1 });
    expect(events.length).toBe(n);
  });
});

describe('a live match that goes quiet', () => {
  it('a socket that stopped hearing anything (half-open: no close ever comes) is replaced, and the match resumes', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] });
    try {
      const link = new MatchLink('m1');
      link.sock.open();
      const ws = FakeSocket.all[0];
      ws.open();
      vi.advanceTimersByTime(MATCH_HEARTBEAT.everyMs);
      expect(ws.sent).toContain('ping');
      // the phone was put away: the socket still looks open but nothing arrives, not even the pongs
      vi.advanceTimersByTime(MATCH_HEARTBEAT.deadMs + MATCH_HEARTBEAT.everyMs);
      expect(FakeSocket.all.length).toBe(2);
      expect(link.sock.connected).toBe(false);
      // the new socket gets the server's resume (here: the report of a match settled meanwhile)
      const ws2 = FakeSocket.all[1];
      ws2.open();
      ws2.deliver({ type: 'match_result', duel: 'm1', report: report({ end: 'forfeit', winner: 1 }) });
      expect(link.report).toMatchObject({ end: 'forfeit', winner: 1 });
      // the dead socket's late frames go nowhere
      ws.deliver({ type: 'peer', duel: 'm1', side: 1, online: false, until: 1 });
      expect(link.foeAwayUntil).toBeNull();
      link.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a pong keeps a quiet socket (deployment, nobody moving) alive', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] });
    try {
      const link = new MatchLink('m1');
      link.sock.open();
      const ws = FakeSocket.all[0];
      ws.open();
      for (let t = 0; t < MATCH_HEARTBEAT.deadMs * 3; t += MATCH_HEARTBEAT.everyMs) {
        vi.advanceTimersByTime(MATCH_HEARTBEAT.everyMs);
        ws.onmessage?.({ data: 'pong' });
      }
      expect(FakeSocket.all.length).toBe(1);
      link.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a match silent for long asks the server for its report and ends the battle with it (no endless wait)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] });
    try {
      const start = duelStart();
      const link = new MatchLink('m1');
      link.sock.open();
      const ws = FakeSocket.all[0];
      ws.open();
      let settled: MatchReport | null = null;
      const poll = vi.fn(async () => settled);
      const done = vi.fn();
      const src = matchSource(link, start, done, poll);
      const sim = new Battle(JSON.parse(JSON.stringify(start.setup)));
      src.lockstep!.attach(sim);
      ws.deliver({ type: 'go', duel: 'm1' });
      ws.deliver({ type: 'turn', duel: 'm1', n: 0, tick: 0, orders: [] });
      // the turns stop coming (and the match_result will be lost with the socket)
      vi.advanceTimersByTime(STALL_POLL_MS + 5000);
      expect(poll).toHaveBeenCalled();
      expect(src.lockstep!.aborted()).toBeNull(); // still running on the server
      settled = report({ end: 'forfeit', winner: 1 });
      await vi.advanceTimersByTimeAsync(5000);
      expect(src.lockstep!.aborted()).toBe('Match lost');
      src.onFinish(sim, 0);
      expect(done).toHaveBeenCalledTimes(1);
      expect(done.mock.calls[0][0].report).toMatchObject({ end: 'forfeit' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('a match the server cannot be reached about is given up after a while', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] });
    try {
      const start = duelStart();
      const link = new MatchLink('m1');
      const src = matchSource(link, start, () => undefined, async () => null);
      src.lockstep!.attach(new Battle(JSON.parse(JSON.stringify(start.setup))));
      vi.advanceTimersByTime(STALL_GIVE_UP_MS - 10_000);
      expect(src.lockstep!.aborted()).toBeNull();
      vi.advanceTimersByTime(20_000);
      expect(src.lockstep!.aborted()).toBe('Cannot reach the match');
      link.close();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('back into a live match after a reload', () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
  });

  it('remembers the match being played until it ends, and only for a while', () => {
    expect(ongoingMatch()).toBeNull();
    rememberMatch('m7', 'ranked', 1_000_000);
    expect(ongoingMatch(1_000_000 + 60_000)).toEqual({ id: 'm7', mode: 'ranked', at: 1_000_000 });
    // long over either way (the server voids a match after 12 minutes)
    expect(ongoingMatch(1_000_000 + 16 * 60_000)).toBeNull();
    // another match's end does not forget this one
    forgetMatch('m8');
    expect(ongoingMatch(1_000_000)).not.toBeNull();
    forgetMatch('m7');
    expect(ongoingMatch(1_000_000)).toBeNull();
  });

  it('a broken or blocked storage is no match', () => {
    localStorage.setItem('pixelarrow.duel.ongoing', '{oops');
    expect(ongoingMatch()).toBeNull();
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => undefined,
    });
    expect(() => rememberMatch('m1', 'unranked')).not.toThrow();
    expect(ongoingMatch()).toBeNull();
  });
});
