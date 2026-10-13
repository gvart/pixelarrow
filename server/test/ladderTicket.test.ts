import { beforeEach, describe, expect, it } from 'vitest';
import type { BattleSetup } from '../../src/sim/types';
import { LADDER, LADDER_TICKET_TTL_MS } from '../../src/duel/ladder';
import { DB, fresh, openDuellist, play, post } from './onlineHelpers';

// CT-06 (controls.md R10, V5-021): a ladder battle may pause, so its ticket lives 30 minutes.
beforeEach(fresh);

interface Profile {
  glory: number;
  xp: number;
  battles: number;
  ladder: { cleared: number; stars: number[] };
}
interface Ticket {
  ticket: string;
  now: number;
  expiresAt: number;
  setup: BattleSetup;
}
interface Report {
  won: boolean;
  glory: number;
  accountXp: number;
  stars: number;
  expired?: boolean;
  replayed?: boolean;
  xp: unknown[];
  profile: Profile;
}

const MIN = 60_000;

/** A run with a pause in it: the plan staged while paused goes in at the resume tick (orders only at ticks, no wall clock). */
function pausedRun(setup: BattleSetup) {
  return play(setup, [
    { tick: 0, order: { kind: 'order', group: 0, order: 'advance' } },
    // paused at tick 40 for minutes of real time; Play issues the whole plan at tick 40
    { tick: 40, order: { kind: 'order', group: 0, order: 'charge' } },
    { tick: 40, order: { kind: 'order', group: 1, order: 'charge' } },
  ]);
}

/** Moves the ticket's clock as if it had been opened `ago` ms before now. */
async function age(ticket: string, ago: number): Promise<void> {
  const now = Date.now();
  await DB().prepare('UPDATE duel_tickets SET created_at = ?2, expires_at = ?3 WHERE id = ?1').bind(ticket, now - ago, now - ago + LADDER_TICKET_TTL_MS).run();
}

describe('the ladder ticket (CT-06)', () => {
  it('lives 30 minutes, and the client gets the server clock to count it down', async () => {
    expect(LADDER.ticketMin).toBe(30);
    const { token } = await openDuellist<Profile>(9601);
    const t = await post<Ticket>('/api/duel/ladder/start', token, { floor: 1 });
    expect(t.status).toBe(200);
    expect(t.body.expiresAt - t.body.now).toBe(30 * MIN);
    const row = await DB().prepare('SELECT created_at, expires_at FROM duel_tickets WHERE id = ?1').bind(t.body.ticket).first<{ created_at: number; expires_at: number }>();
    expect(row!.expires_at - row!.created_at).toBe(30 * MIN);
  });

  it('a paused run reported at 29 min verifies and pays', async () => {
    const { token, profile } = await openDuellist<Profile>(9602);
    const t = await post<Ticket>('/api/duel/ladder/start', token, { floor: 1 });
    await age(t.body.ticket, 29 * MIN);
    const sub = pausedRun(t.body.setup);
    const r = await post<Report>('/api/duel/ladder/submit', token, { ticket: t.body.ticket, ...sub });
    expect(r.status).toBe(200);
    expect(r.body.expired).toBeUndefined();
    expect(r.body.xp.length).toBeGreaterThan(0);
    expect(r.body.accountXp).toBeGreaterThan(0);
    expect(r.body.profile.battles).toBe(profile.battles + 1);
  });

  it('after 30 min the run is still verified (a false claim is void) but pays nothing and moves no progress', async () => {
    const { token, profile } = await openDuellist<Profile>(9603);
    const t = await post<Ticket>('/api/duel/ladder/start', token, { floor: 1 });
    await age(t.body.ticket, 31 * MIN);
    const sub = pausedRun(t.body.setup);
    // still verified: a lie about the outcome is refused like any other
    const bad = await post<{ error: { code: string } }>('/api/duel/ladder/submit', token, { ticket: t.body.ticket, ...sub, claim: { ...sub.claim, hash: 'deadbeef' } });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('replay_mismatch');

    const t2 = await post<Ticket>('/api/duel/ladder/start', token, { floor: 1 });
    expect(t2.body.ticket).not.toBe(t.body.ticket);
    await age(t2.body.ticket, 31 * MIN);
    const sub2 = pausedRun(t2.body.setup);
    const r = await post<Report>('/api/duel/ladder/submit', token, { ticket: t2.body.ticket, ...sub2 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ expired: true, glory: 0, accountXp: 0, stars: 0, xp: [], drop: null });
    expect(r.body.won).toBe(sub2.claim.winner === 0);
    expect(r.body.profile).toMatchObject({ glory: profile.glory, xp: profile.xp, battles: profile.battles, ladder: { cleared: 0 } });
    expect(r.body.profile.ladder.stars[0]).toBe(0);
    // settled once: the same report is answered from the ticket, another one refused
    const again = await post<Report>('/api/duel/ladder/submit', token, { ticket: t2.body.ticket, ...sub2 });
    expect(again.body).toMatchObject({ expired: true, replayed: true, glory: 0 });
    expect((await post('/api/duel/ladder/submit', token, { ticket: t2.body.ticket, ...sub2, claim: { ...sub2.claim, ticks: sub2.claim.ticks + 1 } })).status).toBe(409);
  });

  it('an expired ticket is not resumed: Fight opens a new one', async () => {
    const { token } = await openDuellist<Profile>(9604);
    const t = await post<Ticket>('/api/duel/ladder/start', token, { floor: 1 });
    await age(t.body.ticket, 30 * MIN + 1000);
    const next = await post<Ticket & { resumed?: boolean }>('/api/duel/ladder/start', token, { floor: 1 });
    expect(next.body.ticket).not.toBe(t.body.ticket);
    expect(next.body.resumed).toBeUndefined();
  });
});
