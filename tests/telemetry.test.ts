import { describe, expect, it } from 'vitest';
import { Breadcrumbs, ErrorReporter, fingerprint, MAX_PER_MINUTE, MAX_SENDS_PER_FP, type ErrorsPayload } from '../src/platform/telemetry';
import { Analytics, MAX_BATCH, type EventsPayload } from '../src/platform/analytics';
import { normalizeEvent, scrubText } from '../src/platform/analyticsSchema';

function fakeTimers() {
  const pending: (() => void)[] = [];
  return {
    schedule: (fn: () => void) => {
      pending.push(fn);
      return pending.length;
    },
    runAll: () => {
      while (pending.length) pending.shift()!();
    },
    get count() {
      return pending.length;
    },
  };
}

function reporter(over: Partial<ConstructorParameters<typeof ErrorReporter>[0]> = {}) {
  const sent: { payload: ErrorsPayload; beacon: boolean }[] = [];
  let now = 1_000_000;
  const timers = fakeTimers();
  const r = new ErrorReporter({
    send: (payload, beacon) => void sent.push({ payload, beacon }),
    context: () => ({ app: { version: 'test' }, device: {}, token: 'tok', scene: 'Menu' }),
    now: () => now,
    schedule: timers.schedule,
    ...over,
  });
  return { r, sent, timers, advance: (ms: number) => (now += ms) };
}

describe('error capture', () => {
  it('deduplicates the same error into one report with a count', () => {
    const { r, sent, timers } = reporter();
    for (let i = 0; i < 5; i++) r.capture(new TypeError(`x is undefined at row ${i}`));
    expect(r.pending).toBe(1);
    expect(timers.count).toBe(1);
    timers.runAll();
    expect(sent).toHaveLength(1);
    expect(sent[0].payload.token).toBe('tok');
    expect(sent[0].payload.errors[0]).toMatchObject({ kind: 'error', count: 5, scene: 'Menu', message: 'TypeError: x is undefined at row 0' });
  });

  it('reports one error object once (caught in the scene loop and again by window.onerror)', () => {
    const { r } = reporter();
    const e = new Error('boom');
    expect(r.capture(e, 'scene')).toBe(true);
    expect(r.capture(e, 'error')).toBe(false);
    expect(r.pending).toBe(1);
  });

  it('caps sends per fingerprint per session and new reports per minute', () => {
    const { r, sent, advance } = reporter();
    for (let i = 0; i < MAX_SENDS_PER_FP + 2; i++) {
      r.capture(new Error('same thing'));
      r.flush();
      advance(61_000);
    }
    expect(sent).toHaveLength(MAX_SENDS_PER_FP);
    for (let i = 0; i < MAX_PER_MINUTE + 5; i++) r.capture(new Error(`distinct ${String.fromCharCode(97 + i)}`));
    expect(r.pending).toBe(MAX_PER_MINUTE);
  });

  it('keeps the last breadcrumbs, scrubbed, and flushes with a beacon on hide', () => {
    const crumbs = new Breadcrumbs(3, () => 5);
    const { r, sent } = reporter({ crumbs });
    for (const m of ['start Menu', 'tap menu.play', 'start Battle', 'open https://x.app/?token=secret']) crumbs.add('scene', m);
    r.capture('a string rejection', 'rejection');
    r.flush(true);
    expect(sent[0].beacon).toBe(true);
    expect(sent[0].payload.errors[0].breadcrumbs.map((b) => b.m)).toEqual(['tap menu.play', 'start Battle', 'open https://x.app/']);
  });

  it('scrubs tokens from messages and fingerprints ignore numbers and positions', () => {
    const { r, sent } = reporter();
    r.capture(new Error('fetch failed Bearer pa1.eyJwaWQiOjF9abcdefghijklmnopqrstuvwxyz.c2lnbmF0dXJl'));
    r.flush();
    expect(sent[0].payload.errors[0].message).not.toContain('eyJwaWQ');
    expect(fingerprint('error', 'a 1', 'Error\n at f (main.js:10:20)')).toBe(fingerprint('error', 'a 22', 'Error\n at f (main.js:99:1)'));
    expect(scrubText('mail me@example.com')).toBe('mail <email>');
  });

  it('never throws into the game when sending fails', () => {
    const { r } = reporter({
      send: () => {
        throw new Error('offline');
      },
    });
    r.capture(new Error('x'));
    expect(() => r.flush()).not.toThrow();
  });
});

function analytics(over: Partial<ConstructorParameters<typeof Analytics>[0]> = {}) {
  const sent: { payload: EventsPayload; beacon: boolean }[] = [];
  const timers = fakeTimers();
  const state = { enabled: true, token: 'tok' as string | null, ok: true };
  const a = new Analytics({
    send: (payload, beacon) => {
      sent.push({ payload, beacon });
      return state.ok;
    },
    enabled: () => state.enabled,
    token: () => state.token,
    app: () => ({ version: 'v1', platform: 'ios' }),
    schedule: timers.schedule,
    ...over,
  });
  return { a, sent, timers, state };
}

describe('track()', () => {
  it('accepts only allowlisted client events', () => {
    const { a } = analytics();
    expect(a.track('tutorial_step', { id: 'deploy', step: 1 })).toBe(true);
    // @ts-expect-error server-only event
    expect(a.track('purchase', { pack: 'x' })).toBe(false);
    // @ts-expect-error unknown event
    expect(a.track('whatever')).toBe(false);
    expect(a.pending).toBe(1);
    expect(normalizeEvent('battle_result', { mode: 'offline', result: 'win' }, 'client')).not.toBeNull();
  });

  it('batches: one send per FLUSH timer, or at once when the batch is full', async () => {
    const { a, sent, timers } = analytics();
    a.track('session_start', {});
    a.track('tutorial_complete', { ms: 1000 });
    expect(sent).toHaveLength(0);
    expect(timers.count).toBe(1);
    timers.runAll();
    await Promise.resolve();
    expect(sent).toHaveLength(1);
    expect(sent[0].payload).toEqual({ token: 'tok', app: { version: 'v1', platform: 'ios' }, events: [{ e: 'session_start', p: {} }, { e: 'tutorial_complete', p: { ms: 1000 } }] });
    for (let i = 0; i < MAX_BATCH; i++) a.track('tutorial_step', { id: 's', step: i });
    await Promise.resolve();
    expect(sent).toHaveLength(2);
    expect(sent[1].payload.events).toHaveLength(MAX_BATCH);
  });

  it('waits for a session token and retries a failed send', async () => {
    const { a, sent, state } = analytics();
    state.token = null;
    a.track('session_start', {});
    await a.flush();
    expect(sent).toHaveLength(0);
    expect(a.pending).toBe(1);
    state.token = 'tok';
    state.ok = false;
    await a.flush();
    expect(sent).toHaveLength(1);
    expect(a.pending).toBe(1);
    state.ok = true;
    await a.flush();
    expect(a.pending).toBe(0);
  });

  it('opt-out drops queued events and sends nothing', async () => {
    const { a, sent, state } = analytics();
    a.track('session_start', {});
    state.enabled = false;
    expect(a.track('tutorial_complete', {})).toBe(false);
    await a.flush(true);
    expect(sent).toHaveLength(0);
    expect(a.pending).toBe(0);
  });
});
