/** The page's end of the online cap: the gate socket (src/war/net/gateLink.ts) and the idle clock (src/war/view/hud/gate.ts). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GATE_BEAT_MS, GATE_LEAVE, type GateMsg } from '../../src/war/net/gate';
import { openGate } from '../../src/war/net/gateLink';
import { IDLE_MS, idlePhase, waitText, WARN_MS } from '../../src/war/view/hud/gate';

class FakeSocket {
  static all: FakeSocket[] = [];
  static OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  closedWith: number | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(readonly url: string, readonly protocols: string[]) { FakeSocket.all.push(this); }
  send(m: string) { this.sent.push(m); }
  close(code: number) { this.closedWith = code; this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  say(m: GateMsg) { this.onmessage?.({ data: JSON.stringify(m) }); }
  drop() { this.readyState = 3; this.onclose?.(); }
}

describe('openGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.all = [];
    vi.stubGlobal('WebSocket', FakeSocket);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits in line, goes in, pings, reconnects after a drop and leaves with GATE_LEAVE', async () => {
    const heard: GateMsg[] = [];
    const g = openGate({ protocols: ['pixelarrow.v1', 'tok'] }, (m) => heard.push(m), 'ws://x');
    const s = FakeSocket.all[0];
    expect(s.url).toMatch(/^ws:\/\/x\/ws\/war\/world\?sim=.+&gate=1$/);
    expect(s.protocols).toEqual(['pixelarrow.v1', 'tok']);
    s.open();
    let inside = false;
    void g.admitted.then(() => (inside = true));
    s.say({ t: 'gate', s: 'queue', place: 2, of: 3, eta: 60_000 });
    await Promise.resolve();
    expect(inside).toBe(false);
    s.say({ t: 'gate', s: 'in' });
    await Promise.resolve();
    expect(inside).toBe(true);
    expect(heard.map((m) => m.s)).toEqual(['queue', 'in']);
    vi.advanceTimersByTime(GATE_BEAT_MS * 2);
    expect(s.sent).toEqual(['ping', 'ping']);

    s.drop();
    expect(FakeSocket.all.length).toBe(1);
    vi.advanceTimersByTime(2000);
    expect(FakeSocket.all.length).toBe(2); // reconnected
    const s2 = FakeSocket.all[1];
    s2.open();
    g.stop();
    expect(s2.closedWith).toBe(GATE_LEAVE);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all.length).toBe(2); // no reconnect after a leave
    expect(s2.sent).toEqual([]);
  });
});

describe('idle clock', () => {
  it('plays until IDLE_MS, warns for WARN_MS, then is out', () => {
    expect(idlePhase(0)).toEqual({ phase: 'play' });
    expect(idlePhase(IDLE_MS - 1)).toEqual({ phase: 'play' });
    expect(idlePhase(IDLE_MS)).toEqual({ phase: 'warn', left: WARN_MS });
    expect(idlePhase(IDLE_MS + 45_000)).toEqual({ phase: 'warn', left: 15_000 });
    expect(idlePhase(IDLE_MS + WARN_MS)).toEqual({ phase: 'out' });
    expect(IDLE_MS).toBe(15 * 60_000);
    expect(WARN_MS).toBe(60_000);
  });

  it('says a wait in words', () => {
    expect(waitText(20_000)).toBe('under a minute');
    expect(waitText(4 * 60_000)).toBe('about 4 min');
    expect(waitText(80 * 60_000)).toBe('about 1 h 20 min');
    expect(waitText(120 * 60_000)).toBe('about 2 h');
  });
});
