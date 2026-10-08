import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAMP_BUILDINGS, CAMP_RULES, ONLINE_RULES, regionIncome } from '../../src/online/rules';
import type { CampsView } from '../../src/online/camps';
import { bossAt } from '../../src/online/lairs';
import { mockTelegram, type BotCall } from './helpers';
import { DB, fresh, getJson, join, placeArmy, play, post, sameShard, shardOf, worldOf, type Player, type Ticket } from './onlineHelpers';

// Attacks notify the region's owner in the background (waitUntil): keep that off the network.
let bot: BotCall[] = [];
beforeEach(async () => {
  await fresh();
  bot = mockTelegram();
});
afterEach(() => vi.restoreAllMocks());

const RICH = { gold: 5000, food: 2000, wood: 2000, bronze: 1000, recruits: 10 };

async function enrich(p: Player): Promise<void> {
  await DB()
    .prepare('UPDATE online_profiles SET gold = ?3, food = ?4, wood = ?5, bronze = ?6, recruits = ?7 WHERE season_id = ?1 AND player_id = ?2')
    .bind(p.profile.season.id, p.playerId, RICH.gold, RICH.food, RICH.wood, RICH.bronze, RICH.recruits)
    .run();
}

/** Finishes every construction of a camp now. */
async function finish(p: Player, loc: number): Promise<void> {
  await DB().prepare('UPDATE online_camp_buildings SET done_at = 0 WHERE season_id = ?1 AND shard_id = ?2 AND loc = ?3').bind(p.profile.season.id, p.profile.shard.id, loc).run();
}

/** Makes a player the holder of a region (test shortcut for a conquest). */
async function own(p: Player, loc: number, accruedAt = Date.now()): Promise<void> {
  await DB()
    .prepare(
      `INSERT INTO online_regions (season_id, shard_id, loc, occupant, owner_id, accrued_at, captured_at) VALUES (?1, ?2, ?3, 'player', ?4, ?5, ?5)
       ON CONFLICT (season_id, shard_id, loc) DO UPDATE SET occupant = 'player', owner_id = excluded.owner_id, accrued_at = excluded.accrued_at, home = 0`,
    )
    .bind(p.profile.season.id, p.profile.shard.id, loc, p.playerId, accruedAt)
    .run();
}

/** Gives the camp plots of the player's shard that are no home back to the neutrals (earlier tests took them). */
async function releasePlots(p: Player): Promise<void> {
  const plots = worldOf(p)
    .all()
    .filter((r) => r.campPlot)
    .map((r) => r.id);
  const s = [p.profile.season.id, p.profile.shard.id] as const;
  await DB().batch([
    DB().prepare('DELETE FROM online_camp_buildings WHERE season_id = ?1 AND shard_id = ?2 AND loc IN (SELECT loc FROM online_camps WHERE season_id = ?1 AND shard_id = ?2 AND home = 0)').bind(...s),
    DB().prepare('DELETE FROM online_camps WHERE season_id = ?1 AND shard_id = ?2 AND home = 0').bind(...s),
    DB().prepare(`DELETE FROM online_regions WHERE season_id = ?1 AND shard_id = ?2 AND home = 0 AND loc IN (${plots.join(',')})`).bind(...s),
  ]);
}

/** A camp plot of the player's shard that nobody holds. */
async function freeCampPlot(p: Player, except: number[] = []): Promise<number> {
  const held = new Set(
    (
      await DB()
        .prepare('SELECT loc FROM online_regions WHERE season_id = ?1 AND shard_id = ?2 AND owner_id IS NOT NULL UNION SELECT loc FROM online_camps WHERE season_id = ?1 AND shard_id = ?2')
        .bind(p.profile.season.id, p.profile.shard.id)
        .all<{ loc: number }>()
    ).results.map((x) => x.loc),
  );
  const shard = await shardOf(p);
  const loc = shard.world
    .all()
    .find((r) => r.campPlot && !held.has(r.id) && !except.includes(r.id) && !bossAt(shard.world, shard.seed, r.id))?.id;
  if (loc === undefined) throw new Error('no free camp plot');
  return loc;
}

describe('camps', () => {
  it('the home region is a camp; buildings go in slots, one construction at a time, levels cost more', async () => {
    const p = await join(880001);
    const v = await getJson<CampsView>('/api/online/camps', p.token);
    expect(v.status).toBe(200);
    expect(v.body.camps).toHaveLength(1);
    expect(v.body.camps[0]).toMatchObject({ loc: p.profile.home, home: true, slots: CAMP_RULES.homeSlots, buildings: [], garrisonCap: ONLINE_RULES.maxGarrison, sight: 0 });
    expect(v.body.forward).toEqual({ n: 0, max: CAMP_RULES.maxForward });

    // the starting purse cannot pay a forge (bronze)
    const poor = await post<{ error: { code: string } }>('/api/online/camps/build', p.token, { loc: p.profile.home, kind: 'forge', slot: 0 });
    expect(poor.status).toBe(409);
    expect(poor.body.error.code).toBe('camp_funds');

    await enrich(p);
    const b = await post<CampsView & { built: { level: number; doneAt: number } }>('/api/online/camps/build', p.token, { loc: p.profile.home, kind: 'granary', slot: 0 });
    expect(b.status).toBe(200);
    const cost = CAMP_BUILDINGS.granary.levels[0].cost;
    expect(b.body.resources.gold).toBe(RICH.gold - cost.gold);
    expect(b.body.resources.wood).toBe(RICH.wood - cost.wood);
    expect(b.body.built.level).toBe(1);
    expect(b.body.built.doneAt - b.body.now).toBe(CAMP_BUILDINGS.granary.levels[0].minutes * 60_000);
    expect(b.body.camps[0].buildings[0]).toMatchObject({ slot: 0, kind: 'granary', level: 0, building: 1 });
    // under construction it pays nothing yet
    expect(b.body.camps[0].income.food).toBe(0);

    const busy = await post<{ error: { code: string } }>('/api/online/camps/build', p.token, { loc: p.profile.home, kind: 'forge', slot: 1 });
    expect(busy.body.error.code).toBe('camp_busy');
    await finish(p, p.profile.home);

    const taken = await post<{ error: { code: string } }>('/api/online/camps/build', p.token, { loc: p.profile.home, kind: 'forge', slot: 0 });
    expect(taken.body.error.code).toBe('camp_slotTaken');
    const twice = await post<{ error: { code: string } }>('/api/online/camps/build', p.token, { loc: p.profile.home, kind: 'granary', slot: 2 });
    expect(twice.body.error.code).toBe('camp_built');
    const bad = await post<{ error: { code: string } }>('/api/online/camps/build', p.token, { loc: p.profile.home, kind: 'forge', slot: CAMP_RULES.homeSlots });
    expect(bad.body.error.code).toBe('camp_badSlot');

    // raise the granary (no slot needed) to level 2, then 3, then no further
    const up = await post<CampsView>('/api/online/camps/build', p.token, { loc: p.profile.home, kind: 'granary' });
    expect(up.status).toBe(200);
    expect(up.body.camps[0].buildings[0]).toMatchObject({ level: 1, building: 2 });
    expect(up.body.camps[0].income.food).toBe(CAMP_BUILDINGS.granary.income![0].food);
    await finish(p, p.profile.home);
    await post('/api/online/camps/build', p.token, { loc: p.profile.home, kind: 'granary' });
    await finish(p, p.profile.home);
    const max = await post<{ error: { code: string } }>('/api/online/camps/build', p.token, { loc: p.profile.home, kind: 'granary' });
    expect(max.body.error.code).toBe('camp_maxLevel');
    const after = await getJson<CampsView>('/api/online/camps', p.token);
    expect(after.body.camps[0].buildings[0]).toMatchObject({ level: 3, building: null });
    expect(after.body.camps[0].income.food).toBe(CAMP_BUILDINGS.granary.income![2].food);

    // someone else's camp is not yours to build in
    const q = await join(880002);
    await enrich(q);
    const foreign = await post<{ error: { code: string } }>('/api/online/camps/build', q.token, { loc: p.profile.home, kind: 'forge', slot: 3 });
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('camp_notCamp');
  });

  it('camp buildings add to the income collected', async () => {
    const p = await join(880101);
    await enrich(p);
    await post('/api/online/camps/build', p.token, { loc: p.profile.home, kind: 'forge', slot: 2 });
    await finish(p, p.profile.home);
    const hours = 2;
    await DB()
      .prepare('UPDATE online_regions SET accrued_at = ?4 WHERE season_id = ?1 AND shard_id = ?2 AND loc = ?3')
      .bind(p.profile.season.id, p.profile.shard.id, p.profile.home, Date.now() - hours * 3_600_000)
      .run();
    const base = regionIncome(worldOf(p).info(p.profile.home));
    const c = await post<{ collected: { bronze: number } }>('/api/online/collect', p.token);
    expect(c.status).toBe(200);
    const forge = CAMP_BUILDINGS.forge.income![0].bronze * hours;
    expect(c.body.collected.bronze).toBeGreaterThanOrEqual(Math.floor(base.bronze * hours) + forge);
    expect(c.body.collected.bronze).toBeLessThanOrEqual(Math.floor(base.bronze * hours * 1.5) + forge + 1);
  });

  it('forward camps: only on your camp plots, with the army there, at most two', async () => {
    const p = await join(880201);
    const w = worldOf(p);
    await releasePlots(p);
    const plot = await freeCampPlot(p);
    // not yours yet
    await placeArmy(p, plot);
    const notYours = await post<{ error: { code: string } }>('/api/online/camps/claim', p.token, { loc: plot });
    expect(notYours.body.error.code).toBe('camp_notYours');
    await own(p, plot);
    const poor = await post<{ error: { code: string } }>('/api/online/camps/claim', p.token, { loc: plot });
    expect(poor.body.error.code).toBe('camp_funds');
    await enrich(p);
    // army elsewhere
    await placeArmy(p, p.profile.home);
    const away = await post<{ error: { code: string } }>('/api/online/camps/claim', p.token, { loc: plot });
    expect(away.body.error.code).toBe('camp_notHere');
    const listed = await getJson<CampsView>('/api/online/camps', p.token);
    expect(listed.body.claimable).toContain(plot);
    await placeArmy(p, plot);
    const ok = await post<CampsView>('/api/online/camps/claim', p.token, { loc: plot });
    expect(ok.status).toBe(200);
    expect(ok.body.camps.find((c) => c.loc === plot)).toMatchObject({ home: false, slots: CAMP_RULES.forwardSlots });
    expect(ok.body.forward.n).toBe(1);
    expect(ok.body.resources.gold).toBe(RICH.gold - CAMP_RULES.claimCost.gold);
    expect(ok.body.claimable).not.toContain(plot);
    const again = await post<{ error: { code: string } }>('/api/online/camps/claim', p.token, { loc: plot });
    expect(again.body.error.code).toBe('camp_isCamp');
    // a plain plot is no camp plot
    const plain = w.all().find((r) => r.kind === 'plot' && !r.campPlot && !r.spawn)!.id;
    await own(p, plain);
    await placeArmy(p, plain);
    expect((await post<{ error: { code: string } }>('/api/online/camps/claim', p.token, { loc: plain })).body.error.code).toBe('camp_notPlot');
    // the limit: two forward camps (a second one made directly)
    await DB().prepare('INSERT INTO online_camps (season_id, shard_id, loc, player_id, home, created_at) VALUES (?1, ?2, ?3, ?4, 0, ?5)').bind(p.profile.season.id, p.profile.shard.id, plain, p.playerId, Date.now()).run();
    const third = await freeCampPlot(p, [plot]);
    await own(p, third);
    await placeArmy(p, third);
    expect((await post<{ error: { code: string } }>('/api/online/camps/claim', p.token, { loc: third })).body.error.code).toBe('camp_limit');
    // a forward camp has fewer slots
    const slot = await post<{ error: { code: string } }>('/api/online/camps/build', p.token, { loc: plot, kind: 'granary', slot: CAMP_RULES.forwardSlots });
    expect(slot.body.error.code).toBe('camp_badSlot');
  });

  it('rest at a camp: energy back, then a cooldown', async () => {
    const p = await join(880301);
    await DB().prepare('UPDATE online_profiles SET energy = 10, energy_at = ?3 WHERE season_id = ?1 AND player_id = ?2').bind(p.profile.season.id, p.playerId, Date.now()).run();
    const r = await post<{ energy: number; camps: CampsView['camps'] }>('/api/online/camps/rest', p.token, { loc: p.profile.home });
    expect(r.status).toBe(200);
    expect(r.body.energy).toBeGreaterThanOrEqual(10 + CAMP_RULES.restEnergy);
    expect(r.body.camps[0].restAt).toBeGreaterThan(Date.now());
    const again = await post<{ error: { code: string } }>('/api/online/camps/rest', p.token, { loc: p.profile.home });
    expect(again.body.error.code).toBe('camp_resting');
  });

  it('a watchtower lets the camp see one route further', async () => {
    const p = await join(880401);
    const w = worldOf(p);
    const before = await getJson<{ regions: { loc: number }[]; camps: { loc: number; owner: number; home: boolean }[] }>('/api/online/map', p.token);
    expect(before.body.camps).toContainEqual(expect.objectContaining({ loc: p.profile.home, owner: p.playerId, home: true }));
    const seen = new Set(before.body.regions.map((r) => r.loc));
    const ring = w.within(p.profile.home, ONLINE_RULES.sight + 1).filter((l) => !seen.has(l));
    expect(ring.length).toBeGreaterThan(0);
    await enrich(p);
    await post('/api/online/camps/build', p.token, { loc: p.profile.home, kind: 'watchtower', slot: 5 });
    // not before it is finished
    const building = await getJson<{ regions: { loc: number }[] }>('/api/online/map', p.token);
    expect(building.body.regions.map((r) => r.loc)).not.toContain(ring[0]);
    await finish(p, p.profile.home);
    const after = await getJson<{ regions: { loc: number }[] }>('/api/online/map', p.token);
    const now = new Set(after.body.regions.map((r) => r.loc));
    for (const l of ring) expect(now.has(l)).toBe(true);
    expect((await getJson<{ status: number }>(`/api/online/region/${ring[0]}`, p.token)).status).toBe(200);
  });

  it('a palisade raises the militia and the garrison cap; a captured camp is razed', { timeout: 30_000 }, async () => {
    const owner = await join(880501, 'Owner');
    const att = await join(880502, 'Raider');
    await sameShard(owner, att);
    const w = worldOf(owner);
    await releasePlots(owner);
    const plot = await freeCampPlot(owner);
    await own(owner, plot);
    await enrich(owner);
    await placeArmy(owner, plot);
    expect((await post('/api/online/camps/claim', owner.token, { loc: plot })).status).toBe(200);
    await post('/api/online/camps/build', owner.token, { loc: plot, kind: 'palisade', slot: 0 });
    await finish(owner, plot);
    const v = await getJson<CampsView>('/api/online/camps', owner.token);
    expect(v.body.camps.find((c) => c.loc === plot)).toMatchObject({ garrisonCap: ONLINE_RULES.maxGarrison + 2, militia: 1 });
    // the owner leaves; the raider comes next door
    await placeArmy(owner, owner.profile.home);
    const next = w.neighbours(plot).find((n) => w.info(n).passable)!;
    await placeArmy(att, next);
    const t = await post<Ticket>('/api/online/attack/start', att.token, { loc: plot });
    expect(t.status).toBe(200);
    expect(t.body.defenderKind).toBe('militia');
    expect(t.body.defenders).toHaveLength(Math.min(4, w.info(plot).tier) + 1);
    const sub = await post<{ captured: boolean }>('/api/online/attack/submit', att.token, { ticket: t.body.ticket, ...play(t.body.setup) });
    expect(sub.status).toBe(200);
    const camp = await DB().prepare('SELECT COUNT(*) AS n FROM online_camps WHERE season_id = ?1 AND shard_id = ?2 AND loc = ?3').bind(owner.profile.season.id, owner.profile.shard.id, plot).first<{ n: number }>();
    const blds = await DB().prepare('SELECT COUNT(*) AS n FROM online_camp_buildings WHERE season_id = ?1 AND shard_id = ?2 AND loc = ?3').bind(owner.profile.season.id, owner.profile.shard.id, plot).first<{ n: number }>();
    expect(camp!.n).toBe(sub.body.captured ? 0 : 1);
    expect(blds!.n).toBe(sub.body.captured ? 0 : 1);
    // The owner hears of the attack and of its end; both go out in the background (waitUntil). Wait for
    // them: a notification still in flight when the file's last test ends hangs the pool's teardown.
    const end = sub.body.captured ? 'attack_captured' : 'attack_held';
    await vi.waitFor(
      async () => {
        const rows = (await DB().prepare('SELECT event, status FROM notify_outbox WHERE player_id = ?1').bind(owner.playerId).all<{ event: string; status: string }>()).results;
        expect(rows.find((r) => r.event === 'attack_start')?.status).toBe('sent');
        // the end of the same attack is coalesced into the next attack message (NOTIFY_RULES.coalesceMs)
        expect(rows.find((r) => r.event === end)?.status).toBe('pending');
        expect(bot.filter((b) => b.method === 'sendMessage')).toHaveLength(1);
      },
      { timeout: 8000, interval: 50 },
    );
  });
});
