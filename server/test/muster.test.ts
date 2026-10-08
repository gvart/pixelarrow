import { beforeEach, describe, expect, it } from 'vitest';
import type { ProfileView } from '../../src/online/client';
import { MUSTER } from '../../src/game/muster';
import { fresh, getJson, join, placeArmy, post, worldOf, type Ticket } from './onlineHelpers';

beforeEach(async () => {
  await fresh();
});

describe('the muster (reserve)', () => {
  it('stores who stays in camp; the attack ticket fields only the rest', async () => {
    const p = await join(910001);
    const prof = await getJson<ProfileView>('/api/online/profile', p.token);
    expect(prof.status).toBe(200);
    const heroes = prof.body.heroes;
    expect(heroes.length).toBeGreaterThan(2);
    expect(heroes.every((h) => h.reserve === false)).toBe(true);
    const kept = heroes[0].hero.id;
    const r = await post<{ ok: true }>('/api/online/army', p.token, { reserve: { [kept]: true } });
    expect(r.status).toBe(200);
    const after = await getJson<ProfileView>('/api/online/profile', p.token);
    expect(after.body.heroes.find((h) => h.hero.id === kept)?.reserve).toBe(true);
    expect(after.body.heroes.filter((h) => h.reserve)).toHaveLength(1);
    // the reserve man does not march into the attack
    const w = worldOf(p);
    const next = w.neighbours(p.profile.home).find((n) => w.info(n).passable)!;
    await placeArmy(p, next);
    const target = w.neighbours(next).find((n) => n !== p.profile.home && w.info(n).passable)!;
    const t = await post<Ticket & { attackers: { id: string }[] }>('/api/online/attack/start', p.token, { loc: target });
    expect(t.status).toBe(200);
    expect(t.body.attackers.map((h) => h.id)).not.toContain(kept);
    expect(t.body.attackers.length).toBe(Math.min(MUSTER.fieldCap, heroes.length - 1));
  });

  it('someone must march: the whole army cannot be kept in camp, and the flag can be cleared', async () => {
    const p = await join(910002);
    const prof = await getJson<ProfileView>('/api/online/profile', p.token);
    const all = Object.fromEntries(prof.body.heroes.map((h) => [h.hero.id, true]));
    const bad = await post<{ error: { code: string } }>('/api/online/army', p.token, { reserve: all });
    expect(bad.status).toBe(400);
    const id = prof.body.heroes[1].hero.id;
    expect((await post('/api/online/army', p.token, { reserve: { [id]: true } })).status).toBe(200);
    expect((await post('/api/online/army', p.token, { reserve: { [id]: false } })).status).toBe(200);
    const after = await getJson<ProfileView>('/api/online/profile', p.token);
    expect(after.body.heroes.find((h) => h.hero.id === id)?.reserve).toBe(false);
    const unknown = await post<{ error: { code: string } }>('/api/online/army', p.token, { reserve: { nope: true } });
    expect(unknown.status).toBe(404);
  });
});
