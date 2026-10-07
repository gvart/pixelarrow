import { beforeEach, describe, expect, it } from 'vitest';
import { hexInfo } from '../../src/online/hex';
import { ONLINE_RULES } from '../../src/online/rules';
import { WINS_TO_CLAIM } from '../../src/online/defenders';
import { currentSeason, endSeason, getShard, pickHome } from '../src/online/store';
import { api } from './helpers';
import { DB, fresh, freeNeighbour, getJson, join, play, post, weakenNeutrals, type Profile, type Ticket } from './onlineHelpers';

beforeEach(fresh);

describe('season, shard and profile', () => {
  it('joins the season: home hex, starting army, purse; idempotent', async () => {
    const p = await join(7001);
    expect(p.profile.heroes).toHaveLength(5);
    expect(p.profile.resources.gold).toBe(ONLINE_RULES.start.gold);
    expect(p.profile.army).toMatchObject(p.profile.home);
    const again = await post<Profile>('/api/online/profile', p.token);
    expect(again.body.home).toEqual(p.profile.home);
    expect(again.body.heroes.map((h) => h.hero.id)).toEqual(p.profile.heroes.map((h) => h.hero.id));
    const home = await DB().prepare('SELECT owner_id, home FROM online_hexes WHERE q = ?1 AND r = ?2').bind(p.profile.home.q, p.profile.home.r).first();
    expect(home).toMatchObject({ owner_id: p.playerId, home: 1 });
    const shard = await DB().prepare('SELECT players FROM online_shards').first<{ players: number }>();
    expect(shard?.players).toBeGreaterThanOrEqual(1);
  });

  it('places homes apart and on land', async () => {
    const a = await join(7002);
    const b = await join(7003);
    const d = (Math.abs(a.profile.home.q - b.profile.home.q) + Math.abs(a.profile.home.r - b.profile.home.r) + Math.abs(a.profile.home.q + a.profile.home.r - b.profile.home.q - b.profile.home.r)) / 2;
    expect(d).toBeGreaterThan(ONLINE_RULES.homeSpacing);
    const season = await currentSeason(DB());
    const shard = await getShard(DB(), season.id, a.profile.shard.id);
    expect(hexInfo(shard.seed, a.profile.home.q, a.profile.home.r).passable).toBe(true);
    expect(pickHome(shard, [a.profile.home, b.profile.home], 1)).not.toBeNull();
  });

  it('fog of war: only hexes near your land are sent; far hexes are hidden', async () => {
    const p = await join(7004);
    const map = await getJson<{ hexes: { q: number; r: number }[] }>('/api/online/map', p.token);
    expect(map.status).toBe(200);
    expect(map.body.hexes.length).toBe(37); // home + sight 3
    const far = { q: p.profile.home.q > 0 ? -20 : 20, r: 0 };
    expect((await api(`/api/online/hex/${far.q}/${far.r}`, { token: p.token })).status).toBe(404);
    expect((await api('/api/online/map')).status).toBe(401);
  });

});

describe('income', () => {
  it('accrues lazily from server time and is collected once', async () => {
    const p = await join(7101);
    const { q, r } = p.profile.home;
    await DB().prepare('UPDATE online_hexes SET accrued_at = ?1 WHERE q = ?2 AND r = ?3').bind(Date.now() - 10 * 3_600_000, q, r).run();
    const prof = await getJson<Profile>('/api/online/profile', p.token);
    const pending = prof.body.income.pending;
    expect(pending.gold + pending.food).toBeGreaterThan(0);
    const c1 = await post<{ collected: { gold: number; food: number }; resources: Profile['resources'] }>('/api/online/collect', p.token);
    expect(c1.status).toBe(200);
    expect(c1.body.collected.gold).toBe(pending.gold);
    expect(c1.body.resources.gold).toBe(p.profile.resources.gold + pending.gold);
    expect(c1.body.resources.food).toBe(p.profile.resources.food + pending.food);
    const c2 = await post<{ collected: { gold: number } }>('/api/online/collect', p.token);
    expect(c2.body.collected.gold).toBe(0);
  });

  it('caps accrual at incomeCapHours', async () => {
    const p = await join(7102);
    const { q, r } = p.profile.home;
    await DB().prepare('UPDATE online_hexes SET accrued_at = ?1 WHERE q = ?2 AND r = ?3').bind(Date.now() - 24 * 3_600_000, q, r).run();
    const a = (await getJson<Profile>('/api/online/profile', p.token)).body.income.pending.food;
    await DB().prepare('UPDATE online_hexes SET accrued_at = ?1 WHERE q = ?2 AND r = ?3').bind(Date.now() - 100 * 3_600_000, q, r).run();
    const b = (await getJson<Profile>('/api/online/profile', p.token)).body.income.pending.food;
    expect(b).toBe(a);
  });
});

describe('army, recruiting and marches', () => {
  it('recruits through the server, paying gold, food and a recruit', async () => {
    const p = await join(7201);
    const r = await post<{ hero: { id: string } }>('/api/online/recruit', p.token, { archetype: 'archer' });
    expect(r.status).toBe(200);
    const prof = (await getJson<Profile>('/api/online/profile', p.token)).body;
    expect(prof.heroes).toHaveLength(6);
    expect(prof.resources.gold).toBe(p.profile.resources.gold - ONLINE_RULES.recruitCost.gold);
    expect(prof.resources.recruits).toBe(p.profile.resources.recruits - 1);
    expect((await post('/api/online/recruit', p.token, { archetype: 'archer' })).status).toBe(200);
    expect((await post('/api/online/recruit', p.token, { archetype: 'archer' })).status).toBe(409); // out of recruits
    expect((await post('/api/online/recruit', p.token, { archetype: 'wizard' })).status).toBe(400);
  });

  it('equips from the stash and back', async () => {
    const p = await join(7202);
    const h = p.profile.heroes[0].hero as unknown as { id: string; equip: Record<string, { uid: string }> };
    const off = await post<{ stash: { uid: string }[] }>('/api/online/equip', p.token, { heroId: h.id, slot: 'weapon', itemUid: null });
    expect(off.status).toBe(200);
    expect(off.body.stash.map((i) => i.uid)).toContain(h.equip.weapon.uid);
    const on = await post<{ hero: { equip: { weapon: { uid: string } } }; stash: unknown[] }>('/api/online/equip', p.token, { heroId: h.id, slot: 'weapon', itemUid: h.equip.weapon.uid });
    expect(on.body.hero.equip.weapon.uid).toBe(h.equip.weapon.uid);
    expect(on.body.stash).toHaveLength(0);
    expect((await post('/api/online/equip', p.token, { heroId: h.id, slot: 'helmet', itemUid: 'nope' })).status).toBe(404);
  });

  it('marches with travel time and energy; arrival resolves lazily', async () => {
    const p = await join(7203);
    const to = await freeNeighbour(p);
    const m = await post<{ path: [number, number][]; at: number[]; energy: number; arriveAt: number }>('/api/online/march', p.token, to);
    expect(m.status).toBe(200);
    expect(m.body.path).toHaveLength(2);
    expect(m.body.arriveAt).toBeGreaterThan(Date.now() + 60_000);
    expect(m.body.energy).toBe(ONLINE_RULES.energyMax - ONLINE_RULES.energyPerHex);
    const during = (await getJson<Profile>('/api/online/profile', p.token)).body;
    expect(during.army).toMatchObject({ marching: true, q: p.profile.home.q, r: p.profile.home.r });
    // Time passes: shift the march into the past.
    const march = JSON.stringify({ path: m.body.path, at: m.body.at.map((t) => t - 3_600_000) });
    await DB().prepare('UPDATE online_profiles SET march = ?1 WHERE player_id = ?2').bind(march, p.playerId).run();
    const after = (await getJson<Profile>('/api/online/profile', p.token)).body;
    expect(after.army).toMatchObject({ marching: false, q: to.q, r: to.r });
  });
});

describe('async attacks', () => {
  async function startAttack(p: Awaited<ReturnType<typeof join>>, h: { q: number; r: number }) {
    return post<Ticket & { error?: { code: string } }>('/api/online/attack/start', p.token, h);
  }

  it('a verified attack applies: ticket, casualties, log; resubmitting returns the same result', async () => {
    const p = await join(7301);
    const h = await freeNeighbour(p);
    const t = await startAttack(p, h);
    expect(t.status).toBe(200);
    expect(t.body.defenderKind).toBe('npc');
    expect(t.body.setup.terrain).toBeDefined();
    // Heroes are busy until the ticket closes.
    const busy = (await getJson<Profile>('/api/online/profile', p.token)).body.heroes.filter((x) => x.busy);
    expect(busy.length).toBe(t.body.attackers.length);
    const run = play(t.body.setup);
    const sub = await post<{ won: boolean; captured: boolean; hash: string; gold: number }>('/api/online/attack/submit', p.token, { ticket: t.body.ticket, ...run });
    expect(sub.status).toBe(200);
    expect(sub.body.hash).toBe(run.claim.hash);
    const log = await DB().prepare("SELECT * FROM battle_log WHERE kind = 'attack'").first<{ verified: number; winner: number }>();
    expect(log).toMatchObject({ verified: 1, winner: run.claim.winner });
    const again = await post<{ replayed: boolean; hash: string }>('/api/online/attack/submit', p.token, { ticket: t.body.ticket, ...run });
    expect(again.status).toBe(200);
    expect(again.body.replayed).toBe(true);
    const prof = (await getJson<Profile>('/api/online/profile', p.token)).body;
    expect(prof.heroes.every((x) => !x.busy)).toBe(true);
    expect(prof.resources.gold).toBe(p.profile.resources.gold + sub.body.gold);
  });

  it('a won attack on weakened neutrals captures the hex and moves the army in', async () => {
    const p = await join(7302);
    const h = await freeNeighbour(p, () => true);
    const season = await currentSeason(DB());
    const shard = await getShard(DB(), season.id, p.profile.shard.id);
    const tier = hexInfo(shard.seed, h.q, h.r).tier;
    await weakenNeutrals(p, h);
    let captured = false;
    for (let i = 0; i < (WINS_TO_CLAIM[tier] ?? 1); i++) {
      if (i > 0) await weakenNeutrals(p, h);
      const t = await startAttack(p, h);
      expect(t.status).toBe(200);
      const run = play(t.body.setup);
      expect(run.claim.winner).toBe(0);
      const sub = await post<{ captured: boolean; siege: { wins: number; needed: number } }>('/api/online/attack/submit', p.token, { ticket: t.body.ticket, ...run });
      expect(sub.status).toBe(200);
      captured = sub.body.captured;
      expect(sub.body.siege?.wins).toBe(i + 1);
    }
    expect(captured).toBe(true);
    const row = await DB().prepare('SELECT owner_id FROM online_hexes WHERE q = ?1 AND r = ?2').bind(h.q, h.r).first<{ owner_id: number }>();
    expect(row?.owner_id).toBe(p.playerId);
    const prof = (await getJson<Profile>('/api/online/profile', p.token)).body;
    expect(prof.army).toMatchObject({ q: h.q, r: h.r });
    // Own hexes cannot be attacked; the army now garrisons it.
    expect((await startAttack(p, p.profile.home)).status).toBe(409);
    const g = await post<{ garrison: unknown[] }>(`/api/online/hex/${h.q}/${h.r}/garrison`, p.token, { heroIds: [prof.heroes[0].hero.id], formations: ['line', 'skirmish', 'line', 'column'] });
    expect(g.status).toBe(200);
    expect(g.body.garrison).toHaveLength(1);
  });

  it('rejects a forged claim and a tampered order log; then cools down', async () => {
    const p = await join(7303);
    const h = await freeNeighbour(p);
    const t = await startAttack(p, h);
    const run = play(t.body.setup);
    const forged = { ...run, claim: { ...run.claim, winner: run.claim.winner === 0 ? 1 : 0 } };
    const bad = await post<{ error: { code: string; mismatches: string[] } }>('/api/online/attack/submit', p.token, { ticket: t.body.ticket, ...forged });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('replay_mismatch');
    // The ticket is void now, even with the honest log.
    expect((await post('/api/online/attack/submit', p.token, { ticket: t.body.ticket, ...run })).status).toBe(409);
    const prof = (await getJson<Profile>('/api/online/profile', p.token)).body;
    expect(prof.heroes.every((x) => !x.busy)).toBe(true);
    expect((await startAttack(p, h)).status).toBe(429);

    // Tampered: an honest-looking claim that belongs to a different order log.
    const q = await join(7304);
    const h2 = await freeNeighbour(q);
    const t2 = await startAttack(q, h2);
    const real = play(t2.body.setup, [{ tick: 0, order: { kind: 'order', group: 0, order: 'charge' } }]);
    const other = play(t2.body.setup, [{ tick: 40, order: { kind: 'order', group: 0, order: 'fallback' } }]);
    const tampered = await post<{ error: { code: string } }>('/api/online/attack/submit', q.token, { ticket: t2.body.ticket, orders: other.orders, claim: real.claim });
    if (real.claim.hash !== other.claim.hash) expect(tampered.body.error.code).toBe('replay_mismatch');
  });

  it('expired tickets are refused; open tickets resume with the same seed', async () => {
    const p = await join(7305);
    const h = await freeNeighbour(p);
    const t = await startAttack(p, h);
    const again = await startAttack(p, h);
    expect(again.body.ticket).toBe(t.body.ticket);
    expect(again.body.setup.seed).toBe(t.body.setup.seed);
    await DB().prepare('UPDATE battle_tickets SET expires_at = ?1 WHERE id = ?2').bind(Date.now() - 1, t.body.ticket).run();
    const run = play(t.body.setup);
    const late = await post<{ error: { code: string } }>('/api/online/attack/submit', p.token, { ticket: t.body.ticket, ...run });
    expect(late.status).toBe(410);
    expect(late.body.error.code).toBe('ticket_expired');
    expect((await post('/api/online/attack/submit', p.token, { ticket: t.body.ticket, ...run })).status).toBe(409);
    const other = await join(7306);
    expect((await post('/api/online/attack/submit', other.token, { ticket: t.body.ticket, ...run })).status).toBe(404);
  });

  it('locks a hex: two concurrent attacks, one wins the lock', async () => {
    const a = await join(7307);
    const b = await join(7308);
    const h = await freeNeighbour(a);
    // Put B's army next to the same hex.
    const { neighbours } = await import('../../src/online/hex');
    const spot = neighbours(h).find((n) => !(n.q === a.profile.army.q && n.r === a.profile.army.r))!;
    await DB().prepare('UPDATE online_profiles SET army_q = ?1, army_r = ?2 WHERE player_id = ?3').bind(spot.q, spot.r, b.playerId).run();
    const season = await currentSeason(DB());
    const shard = await getShard(DB(), season.id, a.profile.shard.id);
    if (!hexInfo(shard.seed, spot.q, spot.r).passable) return; // geometry did not allow it on this seed
    const [ra, rb] = await Promise.all([startAttack(a, h), startAttack(b, h)]);
    const statuses = [ra.status, rb.status].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = ra.status === 409 ? ra : rb;
    expect(loser.body.error?.code).toBe('hex_locked');
    // After the winner abandons, the hex is free again.
    const winner = ra.status === 200 ? { p: a, t: ra } : { p: b, t: rb };
    expect((await post('/api/online/attack/abandon', winner.p.token, { ticket: winner.t.body.ticket })).status).toBe(200);
    const retry = ra.status === 409 ? await startAttack(a, h) : await startAttack(b, h);
    expect(retry.status).toBe(200);
  });

  it('attacks a player garrison: defenders fight under the bot, both sides take casualties', async () => {
    const a = await join(7309);
    const h = await freeNeighbour(a);
    await weakenNeutrals(a, h);
    const season = await currentSeason(DB());
    const shard = await getShard(DB(), season.id, a.profile.shard.id);
    // Give A the hex directly and a garrison of two.
    await DB()
      .prepare("UPDATE online_hexes SET owner_id = ?1, occupant = 'player', accrued_at = ?2, captured_at = ?2 WHERE q = ?3 AND r = ?4")
      .bind(a.playerId, Date.now(), h.q, h.r)
      .run();
    await DB().prepare('UPDATE online_profiles SET army_q = ?1, army_r = ?2 WHERE player_id = ?3').bind(h.q, h.r, a.playerId).run();
    const ids = a.profile.heroes.slice(0, 2).map((x) => x.hero.id);
    expect((await post(`/api/online/hex/${h.q}/${h.r}/garrison`, a.token, { heroIds: ids })).status).toBe(200);
    // B stands next to it.
    const b = await join(7310);
    const { neighbours } = await import('../../src/online/hex');
    const spot = neighbours(h).find((n) => hexInfo(shard.seed, n.q, n.r).passable && !(n.q === a.profile.home.q && n.r === a.profile.home.r))!;
    await DB().prepare('UPDATE online_profiles SET army_q = ?1, army_r = ?2 WHERE player_id = ?3').bind(spot.q, spot.r, b.playerId).run();
    const t = await post<Ticket>('/api/online/attack/start', b.token, h);
    expect(t.status).toBe(200);
    expect(t.body.defenderKind).toBe('garrison');
    expect(t.body.defenders.map((d) => d.id).sort()).toEqual([...ids].sort());
    // The owner cannot reshuffle the garrison during the attack.
    expect((await post(`/api/online/hex/${h.q}/${h.r}/garrison`, a.token, { heroIds: [] })).status).toBe(409);
    const run = play(t.body.setup);
    const sub = await post<{ captured: boolean; defender: { dead: number } }>('/api/online/attack/submit', b.token, { ticket: t.body.ticket, ...run });
    expect(sub.status).toBe(200);
    const left = await DB().prepare('SELECT COUNT(*) AS n FROM online_heroes WHERE player_id = ?1').bind(a.playerId).first<{ n: number }>();
    expect(left!.n).toBe(5 - sub.body.defender.dead);
    const row = await DB().prepare('SELECT owner_id FROM online_hexes WHERE q = ?1 AND r = ?2').bind(h.q, h.r).first<{ owner_id: number }>();
    expect(row!.owner_id).toBe(sub.body.captured ? b.playerId : a.playerId);
  });
});

// Runs last: it moves the database to the next season.
describe('season lifecycle', () => {
  it('ends a season: titles kept, new season starts empty', async () => {
    const p = await join(7005);
    const s1 = await currentSeason(DB());
    await endSeason(DB(), s1.id);
    const reward = await DB().prepare('SELECT * FROM season_rewards WHERE player_id = ?1').bind(p.playerId).first<{ title: string; rank: number; score: number }>();
    expect(reward).toMatchObject({ score: 1 });
    expect(reward!.rank).toBeGreaterThanOrEqual(1);
    fresh();
    const s2 = await currentSeason(DB());
    expect(s2.id).toBe(s1.id + 1);
    expect((await api('/api/online/profile', { token: p.token })).status).toBe(409); // must join the new season
    const seasonView = await getJson<{ rewards: { season: number; title: string }[] }>('/api/online/season', p.token);
    expect(seasonView.body.rewards[0]).toMatchObject({ season: s1.id, title: reward!.title });
  });
});
