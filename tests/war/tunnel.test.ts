/** W-66 the Tunnel of Shades rule (src/war/sim/tunnel.ts): the floor of 6, one man every 10 min, settled lazily. */
import { describe, expect, it } from 'vitest';
import { clock, settleTunnel, span, TUNNEL, tunnelLine, wiped, wipeLine, wipeNext, type TunnelState, type WipeState } from '../../src/war/sim/tunnel';

const MIN = 60_000;
const T0 = 1_000_000;

/** A small seeded generator (mulberry32) for the read times. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('the Tunnel of Shades', () => {
  it('the wipe: 0 men start the clock, 6 pending, nothing yet', () => {
    expect(settleTunnel({ alive: 0, nextAt: null }, T0)).toEqual({ raise: 0, nextAt: T0 + 10 * MIN, alive: 0, pending: 6 });
    expect(tunnelLine(0, T0 + 10 * MIN, T0 + 2 * MIN + 18_000)).toBe('Next shade rises in 7:42, 0/6');
  });

  it('0 men: 1 man after 10 min, then one every 10 min up to 6, never past it', () => {
    let s: TunnelState = { alive: 0, nextAt: null };
    let st = settleTunnel(s, T0);
    s = { alive: st.alive, nextAt: st.nextAt };
    expect(settleTunnel(s, T0 + 10 * MIN - 1).raise).toBe(0);
    st = settleTunnel(s, T0 + 10 * MIN);
    expect(st).toEqual({ raise: 1, nextAt: T0 + 20 * MIN, alive: 1, pending: 5 });
    st = settleTunnel({ alive: 1, nextAt: st.nextAt }, T0 + 1000 * MIN);
    expect(st).toEqual({ raise: 5, nextAt: null, alive: 6, pending: 0 });
    expect(settleTunnel({ alive: 6, nextAt: null }, T0 + 2000 * MIN)).toEqual({ raise: 0, nextAt: null, alive: 6, pending: 0 });
  });

  it('above the floor (souls) the tunnel is quiet and pending clears', () => {
    expect(settleTunnel({ alive: 9, nextAt: T0 }, T0 + 60 * MIN)).toEqual({ raise: 0, nextAt: null, alive: 9, pending: 0 });
    expect(tunnelLine(9, T0, T0)).toBeNull();
  });

  it('seeded reads at random times: one man each full interval, the total never past 6', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed);
      let s: TunnelState = { alive: Math.floor(r() * 6), nextAt: null }, t = T0, raised = 0;
      const start = s.alive;
      let first: number | null = null;
      for (let k = 0; k < 60; k++) {
        const st = settleTunnel(s, t);
        first ??= st.nextAt;
        raised += st.raise;
        expect(st.alive).toBeLessThanOrEqual(TUNNEL.floor);
        expect(st.alive).toBe(s.alive + st.raise);
        s = { alive: st.alive, nextAt: st.nextAt };
        // the men risen so far: one per full interval since the clock started, up to the floor
        if (first !== null) expect(raised).toBe(Math.min(TUNNEL.floor - start, Math.max(0, Math.floor((t - first) / TUNNEL.everyMs) + 1)));
        t += Math.floor(r() * 25 * MIN);
      }
      expect(s.alive).toBe(TUNNEL.floor);
    }
  });

  it('a man lost again restarts the clock from that read', () => {
    const st = settleTunnel({ alive: 5, nextAt: null }, T0);
    expect(st.nextAt).toBe(T0 + TUNNEL.everyMs);
    expect(clock(7 * MIN + 42_000)).toBe('7:42');
    expect(clock(-5)).toBe('0:00');
  });
});

describe('the army destroyed card (wiped)', () => {
  const none: WipeState = { fit: 0, nextAt: null, wounded: 0, woundedAt: null, captive: 0, captiveAt: null };
  const H = 60 * MIN;

  it('shows with no man he can field: all dead (a rise pending), or the rest wounded or captive', () => {
    expect(wiped({ ...none, nextAt: T0 + 10 * MIN })).toBe(true);
    // the owner's wipe online: 11 taken captive, 1 dead; the floor counts the captives, so no rise is pending
    expect(wiped({ ...none, captive: 11, captiveAt: T0 + 24 * H })).toBe(true);
    expect(wiped({ ...none, wounded: 3, woundedAt: T0 + 6 * H })).toBe(true);
    expect(wiped({ ...none, fit: 1, captive: 11, captiveAt: T0 + 24 * H })).toBe(false);
    expect(wiped(none)).toBe(false); // never had a man
  });

  it('counts down to his first man back, and says what each will bring', () => {
    const t: WipeState = { fit: 0, nextAt: null, wounded: 3, woundedAt: T0 + 4 * H + 12 * MIN, captive: 8, captiveAt: T0 + 21 * H };
    expect(wipeNext(t)).toEqual({ at: T0 + 4 * H + 12 * MIN, text: 'Your first wounded man is fit in' });
    expect(wipeLine(t, T0)).toBe('3 wounded heal in 4 h 12 m · 8 held captive, back in 21 h or by ransom');
    expect(wipeNext({ ...t, nextAt: T0 + 7 * MIN })).toEqual({ at: T0 + 7 * MIN, text: 'The next man rises in' });
    expect(wipeLine({ ...none, nextAt: T0 + 7 * MIN }, T0)).toBe(''); // the headline says it all
    expect(span(7 * MIN + 42_000)).toBe('7:42');
  });
});
