/**
 * Online season HTTP API (/api/online/*): season and profile, recruiting and
 * equipment, clans (clans.ts) and consumables (consumables.ts). The old
 * route-graph war map (marches, attacks, camps, market) is gone (W-01).
 * Every economy change happens here, validated against server state; the
 * client never sends amounts.
 */
import { emit } from '../telemetry/analytics';
import { Hono } from 'hono';
import { z } from 'zod';
import { readJson } from '../body';
import type { AppEnv } from '../env';
import { ApiError, badRequest } from '../errors';
import { requirePlayable } from '../middleware';
import { isBound, itemDef, salvageValue, SLOTS, type Item, type Slot } from '../../../src/data/items';
import { equipBlocker, equipBlockerText, equipInto, unequipInto } from '../../../src/game/gear';
import { FORMATION_TYPES, type FormationType } from '../../../src/sim/formation';
import { ONLINE_RULES, RECRUIT_ARCHETYPES, recruitHero, RESOURCE_KEYS, type Resources } from '../../../src/online/rules';
import type { Archetype } from '../../../src/game/heroes';
import { clans } from './clans';
import { consumableInventory, consumables } from './consumables';
import { base, limit, player, type PlayerCtx } from './context';
import {
  energyNow,
  ensureProfile,
  formationsOf,
  getProfile,
  heroPrefix,
  loadHeroes,
  loadItems,
  randomU32,
  reserveIds,
  revBatch,
  revGuard,
  type ProfileRow,
} from './store';

export const online = new Hono<AppEnv>();
online.use('*', requirePlayable);

const Formations = z.array(z.enum(FORMATION_TYPES as [string, ...string[]])).length(4);
const HeroId = z.string().min(1).max(80);

// ------------------------------------------------------------------ views

function resources(p: ProfileRow): Resources {
  return { gold: p.gold, food: p.food, wood: p.wood, bronze: p.bronze, recruits: Math.round(p.recruits * 100) / 100 };
}

async function profileView(c: PlayerCtx) {
  const { db: d, now, season } = c;
  const p = c.profile;
  const [heroes, stash, clanInfo, inventory] = await Promise.all([
    loadHeroes(d, season.id, c.pid),
    loadItems(d, season.id, c.pid),
    c.clan ? d.prepare('SELECT id, name, tag FROM clans WHERE id = ?1').bind(c.clan.clanId).first<{ id: number; name: string; tag: string }>() : null,
    consumableInventory(d, season.id, c.pid),
  ]);
  return {
    season: { id: season.id, startedAt: season.startedAt, endsAt: season.endsAt },
    now,
    resources: resources(p),
    energy: Math.floor(energyNow(p, now) * 10) / 10,
    energyMax: ONLINE_RULES.energyMax,
    formations: formationsOf(p.formations),
    heroes: heroes.map((h) => ({ hero: h.hero, woundedUntil: h.woundedUntil, busy: h.busyUntil > now, reserve: h.reserve })),
    stash,
    consumables: inventory,
    clan: clanInfo && c.clan ? { ...clanInfo, role: c.clan.role } : null,
    battles: p.battles,
    wins: p.wins,
  };
}

// ------------------------------------------------------------------ season & profile

online.get('/status', async (c) => {
  const b = await base(c);
  const p = await getProfile(b.db, b.season.id, b.pid);
  return c.json({ season: b.season, joined: !!p, shard: p?.shard_id ?? null, now: b.now });
});

/** Joins the current season (idempotent): the starting army. */
online.post('/profile', async (c) => {
  limit(c, 'profile', 10);
  const b = await base(c);
  const had = await getProfile(b.db, b.season.id, b.pid);
  const prof = had ?? (await ensureProfile(b.db, b.season, b.pid, b.now));
  if (!had) emit(c, 'online_join', { shard: prof.shard_id, season: b.season.id });
  return c.json(await profileView(await player(c)));
});

online.get('/profile', async (c) => c.json(await profileView(await player(c))));

online.get('/season', async (c) => {
  const b = await base(c);
  const rewards = await b.db
    .prepare('SELECT season_id AS season, rank, score, title, clan_name AS clan FROM season_rewards WHERE player_id = ?1 ORDER BY season_id DESC LIMIT 20')
    .bind(b.pid)
    .all();
  return c.json({ season: b.season, now: b.now, rewards: rewards.results });
});

// ------------------------------------------------------------------ recruiting & equipment

const RecruitBody = z.object({ archetype: z.enum(RECRUIT_ARCHETYPES as [Archetype, ...Archetype[]]) });

online.post('/recruit', async (c) => {
  limit(c, 'recruit', 30);
  const pc = await player(c);
  const body = await readJson(c, RecruitBody, 1024);
  const cost = ONLINE_RULES.recruitCost;
  const p = pc.profile;
  for (const k of RESOURCE_KEYS) if (p[k] < cost[k]) throw new ApiError(409, 'cannot_afford', `Not enough ${k}`);
  const heroes = await loadHeroes(pc.db, pc.season.id, pc.pid);
  if (heroes.length >= ONLINE_RULES.maxArmy) throw new ApiError(409, 'army_full', `At most ${ONLINE_RULES.maxArmy} heroes`);
  const start = await reserveIds(pc.db, pc.season.id, pc.pid, 40);
  const ids = { nextId: start };
  const hero = recruitHero(randomU32(), ids, heroPrefix(pc.season.id, pc.pid), body.archetype, heroes.map((x) => x.hero));
  const fresh = (await getProfile(pc.db, pc.season.id, pc.pid))!;
  const g = revGuard(pc.season.id, pc.pid, fresh.rev + 1);
  await revBatch(pc.db, [
    pc.db
      .prepare(
        `UPDATE online_profiles SET gold = gold - ?3, food = food - ?4, recruits = recruits - ?5, rev = rev + 1, updated_at = ?6
         WHERE season_id = ?1 AND player_id = ?2 AND rev = ?7 AND gold >= ?3 AND food >= ?4 AND recruits >= ?5`,
      )
      .bind(pc.season.id, pc.pid, cost.gold, cost.food, cost.recruits, pc.now, fresh.rev),
    pc.db
      .prepare(`INSERT INTO online_heroes (id, season_id, player_id, data, created_at, updated_at) SELECT ?1, ?2, ?3, ?4, ?5, ?5 WHERE ${g}`)
      .bind(hero.id, pc.season.id, pc.pid, JSON.stringify(hero), pc.now),
  ]);
  return c.json({ hero });
});

const EquipBody = z.object({ heroId: HeroId, slot: z.enum(SLOTS as [Slot, ...Slot[]]), itemUid: z.string().max(80).nullable() });

/** Moves an item between the stash and a hero (two-handed weapons and shields exclude each other). */
online.post('/equip', async (c) => {
  limit(c, 'equip', 120);
  const pc = await player(c);
  const body = await readJson(c, EquipBody, 1024);
  const heroes = await loadHeroes(pc.db, pc.season.id, pc.pid);
  const owned = heroes.find((x) => x.hero.id === body.heroId);
  if (!owned) throw new ApiError(404, 'not_found', 'No such hero');
  if (owned.busyUntil > pc.now) throw new ApiError(409, 'busy', 'That hero is in a battle');
  const hero = owned.hero;
  const stash = await loadItems(pc.db, pc.season.id, pc.pid);
  const toStash: Item[] = [];
  let taken: Item | null = null;
  if (body.itemUid) {
    taken = stash.find((i) => i.uid === body.itemUid) ?? null;
    if (!taken) throw new ApiError(404, 'not_found', 'No such item in your stash');
    const def = itemDef(taken.def);
    if (def.slot !== body.slot) throw badRequest(`${def.name} does not go in the ${body.slot} slot`);
    const block = equipBlocker(hero, taken);
    if (block) throw new ApiError(400, 'class_gear', equipBlockerText(block));
    toStash.push(...equipInto(hero.equip, taken));
  } else if (!unequipInto(hero.equip, body.slot, toStash)) return c.json({ hero, stash });
  const g = revGuard(pc.season.id, pc.pid, pc.profile.rev + 1);
  await revBatch(pc.db, [
    pc.db.prepare('UPDATE online_profiles SET rev = rev + 1, updated_at = ?3 WHERE season_id = ?1 AND player_id = ?2 AND rev = ?4').bind(pc.season.id, pc.pid, pc.now, pc.profile.rev),
    pc.db.prepare(`UPDATE online_heroes SET data = ?2, updated_at = ?3 WHERE id = ?1 AND busy_until <= ?3 AND ${g}`).bind(hero.id, JSON.stringify(hero), pc.now),
    ...(taken ? [pc.db.prepare(`DELETE FROM online_items WHERE uid = ?1 AND player_id = ?2 AND ${g}`).bind(taken.uid, pc.pid)] : []),
    ...toStash.map((it) =>
      pc.db
        .prepare(`INSERT INTO online_items (uid, season_id, player_id, data, created_at) SELECT ?1, ?2, ?3, ?4, ?5 WHERE ${g}`)
        .bind(it.uid, pc.season.id, pc.pid, JSON.stringify(it), pc.now),
    ),
  ]);
  return c.json({ hero, stash: await loadItems(pc.db, pc.season.id, pc.pid) });
});

/**
 * Salvages a bound stash item (named legendaries, legendary set pieces: never
 * listed or sold, docs/ITEMS.md "Bound items") for a quarter of its value in
 * gold. Idempotent: the gold is paid only while the item is still there, and
 * a retry after it is gone answers `salvaged: false`.
 */
online.post('/salvage', async (c) => {
  limit(c, 'salvage', 60);
  const pc = await player(c);
  const body = await readJson(c, z.object({ uid: z.string().max(80) }), 1024);
  const it = (await loadItems(pc.db, pc.season.id, pc.pid)).find((i) => i.uid === body.uid);
  if (!it) return c.json({ salvaged: false, gold: 0, profile: await profileView(pc) });
  if (!isBound(it)) throw new ApiError(409, 'not_bound', 'Only bound gear is salvaged: sell it on the marketplace instead');
  const gold = salvageValue(it);
  const has = `EXISTS (SELECT 1 FROM online_items WHERE uid = ?3 AND season_id = ?1 AND player_id = ?2)`;
  const res = await pc.db.batch([
    pc.db.prepare(`UPDATE online_profiles SET gold = gold + ?4, rev = rev + 1, updated_at = ?5 WHERE season_id = ?1 AND player_id = ?2 AND ${has}`).bind(pc.season.id, pc.pid, it.uid, gold, pc.now),
    pc.db.prepare('DELETE FROM online_items WHERE uid = ?1 AND season_id = ?2 AND player_id = ?3').bind(it.uid, pc.season.id, pc.pid),
  ]);
  const done = res[0].meta.changes === 1;
  return c.json({ salvaged: done, gold: done ? gold : 0, profile: await profileView(await player(c)) });
});

const ArmyBody = z.object({ groups: z.record(HeroId, z.number().int().min(0).max(3)).optional(), formations: Formations.optional(), reserve: z.record(HeroId, z.boolean()).optional() });

/** Battle groups of heroes and the field army's formations. */
online.post('/army', async (c) => {
  limit(c, 'army', 60);
  const pc = await player(c);
  const body = await readJson(c, ArmyBody, 16 * 1024);
  const heroes = await loadHeroes(pc.db, pc.season.id, pc.pid);
  const g = revGuard(pc.season.id, pc.pid, pc.profile.rev + 1);
  const stmts = [
    pc.db
      .prepare('UPDATE online_profiles SET formations = ?3, rev = rev + 1, updated_at = ?4 WHERE season_id = ?1 AND player_id = ?2 AND rev = ?5')
      .bind(pc.season.id, pc.pid, JSON.stringify((body.formations as FormationType[] | undefined) ?? formationsOf(pc.profile.formations)), pc.now, pc.profile.rev),
  ];
  for (const [id, group] of Object.entries(body.groups ?? {})) {
    const x = heroes.find((h) => h.hero.id === id);
    if (!x) throw new ApiError(404, 'not_found', `No hero ${id}`);
    if (x.busyUntil > pc.now || x.hero.group === group) continue;
    x.hero.group = group;
    stmts.push(pc.db.prepare(`UPDATE online_heroes SET data = ?2, updated_at = ?3 WHERE id = ?1 AND busy_until <= ?3 AND ${g}`).bind(id, JSON.stringify(x.hero), pc.now));
  }
  // the muster: who stays in camp; someone must still march
  for (const [id, reserve] of Object.entries(body.reserve ?? {})) {
    const x = heroes.find((h) => h.hero.id === id);
    if (!x) throw new ApiError(404, 'not_found', `No hero ${id}`);
    if (x.busyUntil > pc.now || x.reserve === reserve) continue;
    x.reserve = reserve;
    stmts.push(pc.db.prepare(`UPDATE online_heroes SET reserve = ?2, updated_at = ?3 WHERE id = ?1 AND busy_until <= ?3 AND ${g}`).bind(id, reserve ? 1 : 0, pc.now));
  }
  if (body.reserve && !heroes.some((h) => !h.reserve)) throw new ApiError(400, 'bad_request', 'Someone must march with the army');
  await revBatch(pc.db, stmts);
  return c.json({ ok: true });
});

online.route('/clans', clans);
online.route('/consumables', consumables);
