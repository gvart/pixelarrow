/**
 * Duel mode HTTP API (/api/duel/*), docs/DUELS.md and server/README.md "Duels".
 *
 * The duel army is server-owned and persistent (no season scope). Every
 * change is validated here against server state; the client never sends
 * amounts. Glory spends and gains carry a client request id (duel_orders):
 * a retried request answers with the stored result instead of paying twice.
 *
 * Ladder battles use tickets like war-map attacks: the server fixes the seed
 * and both armies, the client submits its order log, and only the server's
 * replay decides the payout. Duels cost nothing: no deaths, wounds or wear.
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { readJson } from '../body';
import type { AppEnv } from '../env';
import { ApiError, badRequest } from '../errors';
import { db, requireAuth } from '../middleware';
import { LIMITS } from '../battle';
import { SubmitBody, verifyBattle } from './verify';
import { emit, emitWithFirst, outcomeOf } from '../telemetry/analytics';
import { limit } from '../online/context';
import { randomToken, randomU32 } from '../online/store';
import { itemDef, SLOTS, type Item, type Slot } from '../../../src/data/items';
import { ATTR_IDS } from '../../../src/data/perks';
import { isClassId, type ClassId } from '../../../src/data/classes';
import type { Hero } from '../../../src/data/units';
import { FORMATION_TYPES, type FormationType } from '../../../src/sim/formation';
import type { BattleSetup } from '../../../src/sim/types';
import {
  DUEL_RULES, accountLevel, classUnlockLevel, developHero, duelRecruit, findOffer, freshGear, recruitPrice, respecHero, respecPrice,
  cleanPresetName, sellPrice, shopItem, teamProblem, utcDay,
} from '../../../src/duel/rules';
import { canFight, chestItem, chestReward, chestState, ladderFloor, ladderPayout, ladderSetup, validChest, CHAPTERS, CHEST_TIERS } from '../../../src/duel/ladder';
import { RANKED } from '../../../src/duel/rating';
import { DEFAULT_FORMATIONS } from '../../../src/online/rules';
import { getQueueState, getRating, liveMatchOf, matchReport, rowLeague } from './live';
import {
  LOADOUT_SLOTS, LOADOUT_USES, bumpRev, duelBatch, duelPrefix, duelProfileView, duelRevGuard, editedSlot, ensureDuelProfile, farmLeft, heroProgressStmts, loadDuelHeroes,
  loadDuelItems, loadLadderStars, loadLoadouts, loadoutFor, loadoutHeroes, loadoutStmt, presentSlot, presetAt, requireDuelProfile, reserveDuelIds, syncDefence, useSlot,
  type DuelProfileRow, type Loadout, type LoadoutUse,
} from './store';
import { rollRatings } from './season';
import { duelSeason } from './async';

export const duel = new Hono<AppEnv>();
duel.use('*', requireAuth);
// async attacks, the defence log, seasons and leaderboards (server/src/duel/async.ts)
duel.route('/', duelSeason);

const HeroId = z.string().min(1).max(80);
const RequestId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const Formations = z.array(z.enum(FORMATION_TYPES as [string, ...string[]])).length(4);

interface Ctx {
  db: D1Database;
  pid: number;
  now: number;
  p: DuelProfileRow;
}

async function ctx(c: Context<AppEnv>): Promise<Ctx> {
  const d = db(c.env);
  const pid = c.get('session').pid;
  return { db: d, pid, now: Date.now(), p: await requireDuelProfile(d, pid) };
}

async function view(x: Ctx) {
  return duelProfileView(x.db, x.pid, x.now);
}

// ------------------------------------------------------------------ Glory orders

interface OrderRow {
  kind: string;
  ref: string;
  result: string | null;
}

/**
 * Applies a Glory change with its statements in one batch, recorded under the
 * client's request id. `delta` is signed (negative: a spend). `more(G)` builds
 * the rest of the batch, guarded by G. A replay of the same request returns
 * the stored result; the same id for something else is a 409.
 */
async function gloryOrder<T>(x: Ctx, requestId: string, kind: string, ref: string, delta: number, more: (G: string) => D1PreparedStatement[], result: T): Promise<{ result: T; replayed: boolean }> {
  const old = await x.db.prepare('SELECT kind, ref, result FROM duel_orders WHERE player_id = ?1 AND request_id = ?2').bind(x.pid, requestId).first<OrderRow>();
  if (old) {
    if (old.kind === kind && old.ref === ref) return { result: JSON.parse(old.result ?? 'null') as T, replayed: true };
    throw new ApiError(409, 'request_reused', 'That request id was used for something else');
  }
  if (x.p.glory + delta < 0) throw new ApiError(409, 'cannot_afford', 'Not enough Glory', { glory: x.p.glory, need: -delta });
  const G = duelRevGuard(x.pid, x.p.rev + 1);
  const res = await x.db.batch([
    x.db
      .prepare('UPDATE duel_profiles SET glory = glory + ?4, rev = rev + 1, updated_at = ?2 WHERE player_id = ?1 AND rev = ?3 AND glory + ?4 >= 0')
      .bind(x.pid, x.now, x.p.rev, delta),
    x.db
      .prepare(`INSERT INTO duel_orders (player_id, request_id, kind, ref, glory, result, created_at) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE ${G}`)
      .bind(x.pid, requestId, kind, ref, delta, JSON.stringify(result), x.now),
    ...more(G),
  ]);
  if (res[0].meta.changes !== 1) {
    const raced = await x.db.prepare('SELECT kind, ref, result FROM duel_orders WHERE player_id = ?1 AND request_id = ?2').bind(x.pid, requestId).first<OrderRow>();
    if (raced && raced.kind === kind && raced.ref === ref) return { result: JSON.parse(raced.result ?? 'null') as T, replayed: true };
    throw new ApiError(409, 'conflict', 'Your duel army changed meanwhile; try again');
  }
  return { result, replayed: false };
}

function heroStmt(d: D1Database, pid: number, h: Hero, G: string, now: number): D1PreparedStatement {
  return d.prepare(`UPDATE duel_heroes SET data = ?3, updated_at = ?4 WHERE id = ?1 AND player_id = ?2 AND ${G}`).bind(h.id, pid, JSON.stringify(h), now);
}

function itemInsert(d: D1Database, pid: number, it: Item, G: string, now: number): D1PreparedStatement {
  return d.prepare(`INSERT INTO duel_items (uid, player_id, data, created_at) SELECT ?1, ?2, ?3, ?4 WHERE ${G}`).bind(it.uid, pid, JSON.stringify(it), now);
}

async function findHero(x: Ctx, id: string) {
  const all = await loadDuelHeroes(x.db, x.pid);
  const h = all.find((y) => y.hero.id === id);
  if (!h) throw new ApiError(404, 'not_found', 'No such hero');
  return { all, h };
}

// ------------------------------------------------------------------ profile

/** Opens the duel mode (idempotent): the profile with the starter roster and Glory. */
duel.post('/profile', async (c) => {
  limit(c, 'duel_profile', 20);
  const d = db(c.env);
  const pid = c.get('session').pid;
  const now = Date.now();
  const { row, created } = await ensureDuelProfile(d, pid, now);
  if (created) emit(c, 'duel_join', {});
  return c.json(await duelProfileView(d, pid, now, row));
});

duel.get('/profile', async (c) => {
  const x = await ctx(c);
  return c.json(await duelProfileView(x.db, x.pid, x.now, x.p));
});

// ------------------------------------------------------------------ roster

const RecruitBody = z.object({ cls: z.string().max(40), requestId: RequestId });

/** Recruits a level-1 hero of an unlocked class for Glory. */
duel.post('/recruit', async (c) => {
  limit(c, 'duel_recruit', 30);
  const x = await ctx(c);
  const body = await readJson(c, RecruitBody, 1024);
  if (!isClassId(body.cls)) throw badRequest('Unknown class');
  const cls = body.cls as ClassId;
  const unlock = classUnlockLevel(cls);
  if (unlock === null) throw new ApiError(400, 'not_recruitable', 'That class is not recruited for duels');
  if (accountLevel(x.p.xp) < unlock) throw new ApiError(409, 'locked', `Unlocks at duel level ${unlock}`, { level: unlock });
  const heroes = await loadDuelHeroes(x.db, x.pid);
  const replay = await x.db.prepare('SELECT 1 FROM duel_orders WHERE player_id = ?1 AND request_id = ?2').bind(x.pid, body.requestId).first();
  if (!replay && heroes.length >= DUEL_RULES.rosterMax) throw new ApiError(409, 'roster_full', `At most ${DUEL_RULES.rosterMax} heroes`);
  const start = await reserveDuelIds(x.db, x.pid, 40);
  x.p = await requireDuelProfile(x.db, x.pid);
  const hero = duelRecruit(randomU32(), { nextId: start }, duelPrefix(x.pid), cls, heroes.map((h) => h.hero));
  const out = await gloryOrder(x, body.requestId, 'recruit', cls, -recruitPrice(cls), (G) => [
    x.db
      .prepare(`INSERT INTO duel_heroes (id, player_id, data, base_attrs, created_at, updated_at) SELECT ?1, ?2, ?3, ?4, ?5, ?5 WHERE ${G}`)
      .bind(hero.id, x.pid, JSON.stringify(hero), JSON.stringify(hero.attrs), x.now),
  ], { hero });
  return c.json({ ...out.result, replayed: out.replayed, profile: await view(x) });
});

/** Dismisses a hero: his gear goes to the stash; nothing is refunded. */
duel.post('/dismiss', async (c) => {
  limit(c, 'duel_dismiss', 30);
  const x = await ctx(c);
  const body = await readJson(c, z.object({ heroId: HeroId }), 1024);
  const { all, h } = await findHero(x, body.heroId);
  if (all.length <= 1) throw new ApiError(409, 'last_hero', 'Keep at least one hero');
  const G = duelRevGuard(x.pid, x.p.rev + 1);
  const loadouts = (await loadLoadouts(x.db, x.p)).filter((l) => l.team.includes(h.hero.id));
  await duelBatch(x.db, [
    bumpRev(x.db, x.p, x.now),
    ...loadouts.map((l) => loadoutStmt(x.db, x.pid, { ...l, team: l.team.filter((id) => id !== h.hero.id) }, G, x.now)),
    x.db.prepare(`DELETE FROM duel_heroes WHERE id = ?1 AND player_id = ?2 AND ${G}`).bind(h.hero.id, x.pid),
    ...Object.values(h.hero.equip).filter((it): it is Item => !!it).map((it) => itemInsert(x.db, x.pid, it, G, x.now)),
  ]);
  await syncDefence(x.db, x.pid, x.now);
  return c.json({ profile: await view(x) });
});

const EquipBody = z.object({ heroId: HeroId, slot: z.enum(SLOTS as [Slot, ...Slot[]]), itemUid: z.string().max(80).nullable() });

/** Moves an item between the stash and a hero (two-handed weapons and shields exclude each other). */
duel.post('/equip', async (c) => {
  limit(c, 'duel_equip', 120);
  const x = await ctx(c);
  const body = await readJson(c, EquipBody, 1024);
  const { h } = await findHero(x, body.heroId);
  const hero = h.hero;
  const stash = await loadDuelItems(x.db, x.pid);
  const toStash: Item[] = [];
  let taken: Item | null = null;
  if (body.itemUid) {
    taken = stash.find((i) => i.uid === body.itemUid) ?? null;
    if (!taken) throw new ApiError(404, 'not_found', 'No such item in your stash');
    const def = itemDef(taken.def);
    if (def.slot !== body.slot) throw badRequest(`${def.name} does not go in the ${body.slot} slot`);
    const prev = hero.equip[body.slot];
    if (prev) toStash.push(prev);
    hero.equip[body.slot] = taken;
    if (body.slot === 'weapon' && def.twoHanded && hero.equip.shield) {
      toStash.push(hero.equip.shield);
      delete hero.equip.shield;
    }
    if (body.slot === 'shield' && hero.equip.weapon && itemDef(hero.equip.weapon.def).twoHanded) {
      toStash.push(hero.equip.weapon);
      delete hero.equip.weapon;
    }
  } else {
    const prev = hero.equip[body.slot];
    if (!prev) return c.json({ profile: await view(x) });
    toStash.push(prev);
    delete hero.equip[body.slot];
  }
  const G = duelRevGuard(x.pid, x.p.rev + 1);
  await duelBatch(x.db, [
    bumpRev(x.db, x.p, x.now),
    heroStmt(x.db, x.pid, freshGear(hero), G, x.now),
    ...(taken ? [x.db.prepare(`DELETE FROM duel_items WHERE uid = ?1 AND player_id = ?2 AND ${G}`).bind(taken.uid, x.pid)] : []),
    ...toStash.map((it) => itemInsert(x.db, x.pid, it, G, x.now)),
  ]);
  await syncDefence(x.db, x.pid, x.now);
  return c.json({ profile: await view(x) });
});

const DevelopBody = z.object({
  heroId: HeroId,
  attrs: z.object(Object.fromEntries(ATTR_IDS.map((k) => [k, z.number().int().min(0).max(40).optional()])) as Record<(typeof ATTR_IDS)[number], z.ZodOptional<z.ZodNumber>>).optional(),
  perks: z.array(z.string().max(40)).max(5).optional(),
});

/** Spends attribute points and takes perks (checked against level, points and the class tree). */
duel.post('/develop', async (c) => {
  limit(c, 'duel_develop', 60);
  const x = await ctx(c);
  const body = await readJson(c, DevelopBody, 2048);
  const { h } = await findHero(x, body.heroId);
  const out = developHero(h.hero, body.attrs ?? {}, body.perks ?? []);
  if (out === 'no_points') throw new ApiError(409, 'no_points', 'Not enough attribute points');
  if (out === 'attr_max') throw new ApiError(409, 'attr_max', 'That attribute is at its maximum');
  if (out === 'bad_perk') throw new ApiError(409, 'bad_perk', 'That perk cannot be taken now');
  const G = duelRevGuard(x.pid, x.p.rev + 1);
  await duelBatch(x.db, [bumpRev(x.db, x.p, x.now), heroStmt(x.db, x.pid, out, G, x.now)]);
  await syncDefence(x.db, x.pid, x.now);
  return c.json({ hero: out, profile: await view(x) });
});

/** Respec for Glory: the recruitment attributes, all points back, no perks. */
duel.post('/respec', async (c) => {
  limit(c, 'duel_respec', 30);
  const x = await ctx(c);
  const body = await readJson(c, z.object({ heroId: HeroId, requestId: RequestId }), 1024);
  const { h } = await findHero(x, body.heroId);
  const out = respecHero(h.hero, h.base);
  const r = await gloryOrder(x, body.requestId, 'respec', h.hero.id, -respecPrice(h.hero), (G) => [heroStmt(x.db, x.pid, out, G, x.now)], { hero: out });
  if (!r.replayed) await syncDefence(x.db, x.pid, x.now);
  return c.json({ ...r.result, replayed: r.replayed, profile: await view(x) });
});

const TeamBody = z.object({
  heroIds: z.array(HeroId).max(DUEL_RULES.teamMax).optional(),
  formations: Formations.optional(),
  groups: z.record(HeroId, z.number().int().min(0).max(3)).optional(),
  /** The saved team to change (default: the one the Team tab edits). */
  loadout: z.number().int().min(1).max(LOADOUT_SLOTS).optional(),
});

/**
 * A saved team: who fights, its formations, and the heroes' battle groups
 * (groups belong to the hero, so they are the same in every loadout). The
 * budget is checked when a battle starts; the defence snapshot follows its
 * loadout while it fits the budget.
 */
duel.post('/team', async (c) => {
  limit(c, 'duel_team', 60);
  const x = await ctx(c);
  const body = await readJson(c, TeamBody, 8 * 1024);
  const heroes = await loadDuelHeroes(x.db, x.pid);
  const byId = new Map(heroes.map((h) => [h.hero.id, h.hero]));
  const loadouts = await loadLoadouts(x.db, x.p);
  if (body.loadout !== undefined && !loadouts.some((y) => y.slot === body.loadout)) throw new ApiError(404, 'no_preset', 'No such preset');
  const l = presetAt(loadouts, body.loadout ?? editedSlot(x.p));
  const team = body.heroIds ? [...new Set(body.heroIds)] : l.team;
  for (const id of team) if (!byId.has(id)) throw new ApiError(404, 'not_found', `No hero ${id}`);
  const G = duelRevGuard(x.pid, x.p.rev + 1);
  const stmts = [bumpRev(x.db, x.p, x.now), loadoutStmt(x.db, x.pid, { ...l, team, formations: (body.formations as FormationType[] | undefined) ?? l.formations }, G, x.now)];
  for (const [id, group] of Object.entries(body.groups ?? {})) {
    const h = byId.get(id);
    if (!h) throw new ApiError(404, 'not_found', `No hero ${id}`);
    if (h.group === group) continue;
    h.group = group;
    stmts.push(heroStmt(x.db, x.pid, h, G, x.now));
  }
  await duelBatch(x.db, stmts);
  await syncDefence(x.db, x.pid, x.now);
  return c.json({ profile: await view(x) });
});

const PresetName = z.string().trim().max(DUEL_RULES.presetNameMax).nullable().optional();

const LoadoutBody = z.object({
  slot: z.number().int().min(1).max(LOADOUT_SLOTS),
  /** Edit this loadout in the Team tab. */
  edit: z.boolean().optional(),
  /** Rename (trimmed, at most 16; empty or null: the default "Team <slot>"). */
  name: PresetName,
  /** Fight with this loadout there (the others keep theirs). */
  use: z.array(z.enum(LOADOUT_USES as [LoadoutUse, ...LoadoutUse[]])).max(3).optional(),
});

/**
 * Picks, names and assigns a saved team. A slot never saved starts as a copy
 * of the edited one. Making it the defence needs it to fit the ranked budget
 * (it is snapshot for the async bot at once).
 */
duel.post('/loadout', async (c) => {
  limit(c, 'duel_loadout', 60);
  const x = await ctx(c);
  const body = await readJson(c, LoadoutBody, 1024);
  const loadouts = await loadLoadouts(x.db, x.p);
  const saved = await x.db.prepare('SELECT 1 FROM duel_loadouts WHERE player_id = ?1 AND slot = ?2').bind(x.pid, body.slot).first();
  const edited = presetAt(loadouts, editedSlot(x.p));
  const l: Loadout = saved ? presetAt(loadouts, body.slot) : { ...edited, slot: body.slot, name: null };
  if (body.name !== undefined) l.name = cleanPresetName(body.name);
  const use = new Set(body.use ?? []);
  if (use.has('defence')) {
    const problem = teamProblem(loadoutHeroes(l, await loadDuelHeroes(x.db, x.pid)), DUEL_RULES.budget);
    if (problem === 'empty') throw new ApiError(409, 'no_team', 'That team is empty');
    if (problem) throw new ApiError(409, problem, `A defence must fit the ${DUEL_RULES.budget}-point budget`, { budget: DUEL_RULES.budget });
  }
  const slotOf = (u: LoadoutUse) => (use.has(u) ? body.slot : presentSlot(loadouts, useSlot(x.p, u)));
  const G = duelRevGuard(x.pid, x.p.rev + 1);
  await duelBatch(x.db, [
    x.db
      .prepare('UPDATE duel_profiles SET loadout = ?2, lo_ladder = ?3, lo_arena = ?4, lo_defence = ?5, rev = rev + 1, updated_at = ?6 WHERE player_id = ?1 AND rev = ?7')
      .bind(x.pid, body.edit ? body.slot : presentSlot(loadouts, editedSlot(x.p)), slotOf('ladder'), slotOf('arena'), slotOf('defence'), x.now, x.p.rev),
    loadoutStmt(x.db, x.pid, l, G, x.now),
  ]);
  await syncDefence(x.db, x.pid, x.now, use.has('defence'));
  return c.json({ profile: await view(x) });
});

const CreatePresetBody = z.object({
  /** Copy this preset (duplicate); omitted: a copy of the edited one; null: an empty team. */
  from: z.number().int().min(1).max(LOADOUT_SLOTS).nullable().optional(),
  name: PresetName,
  /** Edit the new preset in the Team tab (default true). */
  edit: z.boolean().optional(),
});

/** Creates a preset in the lowest free slot (at most LOADOUT_SLOTS): a copy of one (duplicate) or an empty team. */
duel.post('/loadout/create', async (c) => {
  limit(c, 'duel_loadout', 60);
  const x = await ctx(c);
  const body = await readJson(c, CreatePresetBody, 1024);
  const loadouts = await loadLoadouts(x.db, x.p);
  let slot = 0;
  for (let s = 1; s <= LOADOUT_SLOTS && !slot; s++) if (!loadouts.some((l) => l.slot === s)) slot = s;
  if (!slot) throw new ApiError(409, 'presets_full', `At most ${LOADOUT_SLOTS} presets`, { max: LOADOUT_SLOTS });
  if (typeof body.from === 'number' && !loadouts.some((l) => l.slot === body.from)) throw new ApiError(404, 'no_preset', 'No such preset');
  const src = body.from === null ? null : presetAt(loadouts, body.from ?? editedSlot(x.p));
  const l: Loadout = { slot, name: cleanPresetName(body.name), team: src ? [...src.team] : [], formations: src ? [...src.formations] : [...DEFAULT_FORMATIONS] };
  const G = duelRevGuard(x.pid, x.p.rev + 1);
  // a profile without rows (before 0010) keeps its legacy preset 1 as a row
  const rows = await x.db.prepare('SELECT COUNT(*) AS n FROM duel_loadouts WHERE player_id = ?1').bind(x.pid).first<{ n: number }>();
  await duelBatch(x.db, [
    x.db
      .prepare('UPDATE duel_profiles SET loadout = ?2, rev = rev + 1, updated_at = ?3 WHERE player_id = ?1 AND rev = ?4')
      .bind(x.pid, body.edit === false ? presentSlot(loadouts, editedSlot(x.p)) : slot, x.now, x.p.rev),
    ...(rows?.n ? [] : [loadoutStmt(x.db, x.pid, loadouts[0], G, x.now)]),
    loadoutStmt(x.db, x.pid, l, G, x.now),
  ]);
  return c.json({ slot, profile: await view(x) });
});

/**
 * Deletes a preset (never the last one). The edited preset and every use
 * that pointed at it move to the first remaining preset (the defence
 * snapshot follows when that one fits the budget).
 */
duel.post('/loadout/delete', async (c) => {
  limit(c, 'duel_loadout', 60);
  const x = await ctx(c);
  const body = await readJson(c, z.object({ slot: z.number().int().min(1).max(LOADOUT_SLOTS) }), 1024);
  const loadouts = await loadLoadouts(x.db, x.p);
  if (!loadouts.some((l) => l.slot === body.slot)) throw new ApiError(404, 'no_preset', 'No such preset');
  if (loadouts.length <= 1) throw new ApiError(409, 'last_preset', 'Keep at least one preset');
  const rest = loadouts.filter((l) => l.slot !== body.slot);
  const move = (slot: number) => presentSlot(rest, slot);
  const G = duelRevGuard(x.pid, x.p.rev + 1);
  await duelBatch(x.db, [
    x.db
      .prepare('UPDATE duel_profiles SET loadout = ?2, lo_ladder = ?3, lo_arena = ?4, lo_defence = ?5, rev = rev + 1, updated_at = ?6 WHERE player_id = ?1 AND rev = ?7')
      .bind(x.pid, move(editedSlot(x.p)), move(useSlot(x.p, 'ladder')), move(useSlot(x.p, 'arena')), move(useSlot(x.p, 'defence')), x.now, x.p.rev),
    x.db.prepare(`DELETE FROM duel_loadouts WHERE player_id = ?1 AND slot = ?2 AND ${G}`).bind(x.pid, body.slot),
  ]);
  if (presentSlot(loadouts, useSlot(x.p, 'defence')) === body.slot) await syncDefence(x.db, x.pid, x.now);
  return c.json({ profile: await view(x) });
});

// ------------------------------------------------------------------ shop

/** Buys a catalogue item or one of today's offers (each daily offer once per player). */
duel.post('/shop/buy', async (c) => {
  limit(c, 'duel_buy', 60);
  const x = await ctx(c);
  const body = await readJson(c, z.object({ offer: z.string().max(80), requestId: RequestId }), 1024);
  const day = utcDay(x.now);
  const offer = findOffer(body.offer, day);
  if (!offer) throw new ApiError(404, 'no_offer', 'That offer is not in the shop (today)');
  if (body.offer.startsWith('day')) {
    const had = await x.db.prepare("SELECT request_id FROM duel_orders WHERE player_id = ?1 AND kind = 'buy' AND ref = ?2").bind(x.pid, offer.id).first<{ request_id: string }>();
    if (had && had.request_id !== body.requestId) throw new ApiError(409, 'sold_out', 'You already bought this offer today');
  }
  const start = await reserveDuelIds(x.db, x.pid, 4);
  x.p = await requireDuelProfile(x.db, x.pid);
  const item = shopItem(randomU32(), { nextId: start }, duelPrefix(x.pid), offer);
  const r = await gloryOrder(x, body.requestId, 'buy', offer.id, -offer.price, (G) => [itemInsert(x.db, x.pid, item, G, x.now)], { item });
  return c.json({ ...r.result, replayed: r.replayed, profile: await view(x) });
});

/** Sells a stash item back to the shop for Glory. */
duel.post('/shop/sell', async (c) => {
  limit(c, 'duel_sell', 60);
  const x = await ctx(c);
  const body = await readJson(c, z.object({ uid: z.string().max(80), requestId: RequestId }), 1024);
  const replay = await x.db.prepare('SELECT kind, ref FROM duel_orders WHERE player_id = ?1 AND request_id = ?2').bind(x.pid, body.requestId).first<OrderRow>();
  const it = (await loadDuelItems(x.db, x.pid)).find((i) => i.uid === body.uid);
  if (!it && !(replay && replay.kind === 'sell' && replay.ref === body.uid)) throw new ApiError(404, 'not_found', 'No such item in your stash');
  const price = it ? sellPrice(it) : 0;
  const r = await gloryOrder(x, body.requestId, 'sell', body.uid, price, (G) => [x.db.prepare(`DELETE FROM duel_items WHERE uid = ?1 AND player_id = ?2 AND ${G}`).bind(body.uid, x.pid)], { glory: price });
  return c.json({ ...r.result, replayed: r.replayed, profile: await view(x) });
});

// ------------------------------------------------------------------ ladder

interface TicketRow {
  id: string;
  player_id: number;
  floor: number;
  seed: number;
  setup: string;
  team: string;
  status: 'open' | 'used' | 'rejected' | 'abandoned';
  claim: string | null;
  result: string | null;
  won: number | null;
  created_at: number;
  expires_at: number;
  finished_at: number | null;
}

function ticketView(t: TicketRow, extra: Record<string, unknown> = {}) {
  const floor = ladderFloor(t.floor);
  return {
    ticket: t.id,
    floor: t.floor,
    boss: floor.boss,
    expiresAt: t.expires_at,
    setup: JSON.parse(t.setup) as BattleSetup,
    team: JSON.parse(t.team) as Hero[],
    enemies: floor.heroes,
    ...extra,
  };
}

/** Starts a ladder battle with the current team (it must fit the floor's budget). An open ticket of the same floor is resumed. */
duel.post('/ladder/start', async (c) => {
  limit(c, 'duel_ladder', 20);
  const x = await ctx(c);
  const body = await readJson(c, z.object({ floor: z.number().int().min(1).max(1000) }), 1024);
  if (!canFight(body.floor, x.p.ladder_cleared)) throw new ApiError(409, 'floor_locked', 'Clear the floors below first');
  const open = await x.db
    .prepare("SELECT * FROM duel_tickets WHERE player_id = ?1 AND status = 'open' AND expires_at > ?2 ORDER BY created_at DESC LIMIT 1")
    .bind(x.pid, x.now)
    .first<TicketRow>();
  // Same floor: resume (same seed, no fishing for a better one). Another floor: the open one is given up.
  if (open && open.floor === body.floor) return c.json(ticketView(open, { resumed: true }));
  if (open) await x.db.prepare("UPDATE duel_tickets SET status = 'abandoned', finished_at = ?2 WHERE id = ?1 AND status = 'open'").bind(open.id, x.now).run();
  const floor = ladderFloor(body.floor);
  const l = await loadoutFor(x.db, x.p, 'ladder');
  const team = loadoutHeroes(l, await loadDuelHeroes(x.db, x.pid));
  const problem = teamProblem(team, floor.budget);
  if (problem === 'empty') throw new ApiError(409, 'no_team', 'Pick your team first');
  if (problem === 'too_many') throw new ApiError(409, 'team_too_big', `At most ${DUEL_RULES.teamMax} heroes`);
  if (problem === 'over_budget') throw new ApiError(409, 'over_budget', `Your team is over this floor's ${floor.budget}-point budget`, { budget: floor.budget });
  const id = randomToken(16);
  const seed = randomU32();
  const setup = ladderSetup(seed, team, l.formations, floor);
  await x.db
    .prepare('INSERT INTO duel_tickets (id, player_id, kind, floor, seed, setup, team, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)')
    .bind(id, x.pid, 'ladder', floor.floor, seed, JSON.stringify(setup), JSON.stringify(team), x.now, x.now + DUEL_RULES.ticketTtlMs)
    .run();
  const t = (await x.db.prepare('SELECT * FROM duel_tickets WHERE id = ?1').bind(id).first<TicketRow>())!;
  return c.json(ticketView(t));
});

async function loadTicket(x: Ctx, id: string): Promise<TicketRow> {
  const t = await x.db.prepare('SELECT * FROM duel_tickets WHERE id = ?1 AND player_id = ?2').bind(id, x.pid).first<TicketRow>();
  if (!t) throw new ApiError(404, 'not_found', 'No such ticket');
  return t;
}

async function closeTicket(x: Ctx, t: TicketRow, status: 'rejected' | 'abandoned', claim?: string, result?: string): Promise<void> {
  await x.db
    .prepare("UPDATE duel_tickets SET status = ?2, finished_at = ?3, claim = COALESCE(?4, claim), result = COALESCE(?5, result), won = 0 WHERE id = ?1 AND status = 'open'")
    .bind(t.id, status, x.now, claim ?? null, result ?? null)
    .run();
}

/** Verifies a ladder battle by replay and pays it out (hero XP; Glory, account XP and maybe an item on a win). */
duel.post('/ladder/submit', async (c) => {
  limit(c, 'duel_submit', 20);
  const x = await ctx(c);
  const body = await readJson(c, SubmitBody, LIMITS.maxBodyBytes);
  const t = await loadTicket(x, body.ticket);
  const claimJson = JSON.stringify(body.claim);
  if (t.status === 'used') {
    if (t.claim === claimJson && t.result) return c.json({ ...JSON.parse(t.result), replayed: true, profile: await view(x) });
    throw new ApiError(409, 'ticket_used', 'This battle was already reported');
  }
  if (t.status !== 'open') throw new ApiError(409, 'ticket_closed', `This battle was ${t.status}`);
  if (t.expires_at < x.now) {
    await closeTicket(x, t, 'abandoned');
    throw new ApiError(410, 'ticket_expired', 'Too late: the battle ticket expired');
  }
  const out = await verifyBattle(JSON.parse(t.setup) as BattleSetup, body, (claim, result) => closeTicket(x, t, 'rejected', claim, result));
  const s = out.summary;

  const floor = ladderFloor(t.floor);
  const team = JSON.parse(t.team) as Hero[];
  const start = await reserveDuelIds(x.db, x.pid, 4);
  x.p = await requireDuelProfile(x.db, x.pid);
  const pay = ladderPayout(floor, out.result, team, x.p.ladder_cleared, farmLeft(x.p, x.now), t.seed, { nextId: start }, duelPrefix(x.pid));
  const prevStars = (await loadLadderStars(x.db, x.p)).stars[floor.floor - 1] ?? 0;
  const summary = {
    floor: floor.floor,
    boss: floor.boss,
    won: pay.won,
    firstClear: pay.firstClear,
    winner: s.winner,
    ticks: s.ticks,
    hash: s.hash,
    glory: pay.glory,
    capped: pay.capped,
    accountXp: pay.accountXp,
    xp: pay.xp,
    drop: pay.drop,
    enemies: { dead: out.result.units.filter((u) => u.side === 1 && u.state === 'dead').length, total: floor.heroes.length },
    /** Stars of this battle (0: lost), the share of team points lost, the floor's best before, and whether this is a new best. */
    stars: pay.stars,
    lost: Math.round(pay.lost * 1000) / 1000,
    prevStars,
    bestStars: Math.max(prevStars, pay.stars),
    newBest: pay.stars > prevStars,
  };

  // Only progression is written to the heroes (level, XP, points, traits, tallies): gear changed meanwhile is kept.
  const current = new Map((await loadDuelHeroes(x.db, x.pid)).map((h) => [h.hero.id, h.hero]));
  const nonce = randomToken(8);
  const G = `EXISTS (SELECT 1 FROM duel_tickets WHERE id = '${t.id}' AND apply_nonce = '${nonce}')`;
  const day = utcDay(x.now);
  const farm = pay.won && !pay.firstClear ? pay.glory : 0;
  const stmts: D1PreparedStatement[] = [
    x.db
      .prepare("UPDATE duel_tickets SET status = 'used', apply_nonce = ?2, claim = ?3, finished_at = ?4, won = ?5, result = ?6 WHERE id = ?1 AND status = 'open'")
      .bind(t.id, nonce, claimJson, x.now, pay.won ? 1 : 0, JSON.stringify(summary)),
    x.db
      .prepare(
        `UPDATE duel_profiles SET glory = glory + ?2, xp = xp + ?3, ladder_cleared = MAX(ladder_cleared, ?4),
           farm_glory = CASE WHEN farm_day = ?5 THEN farm_glory + ?6 ELSE ?6 END, farm_day = ?5,
           battles = battles + 1, wins = wins + ?7, rev = rev + 1, updated_at = ?8 WHERE player_id = ?1 AND ${G}`,
      )
      .bind(x.pid, pay.glory, pay.accountXp, pay.won ? floor.floor : 0, day, farm, pay.won ? 1 : 0, x.now),
  ];
  stmts.push(...heroProgressStmts(x.db, x.pid, team, pay.heroes, current, G, x.now));
  if (pay.drop) stmts.push(itemInsert(x.db, x.pid, pay.drop, G, x.now));
  if (pay.stars > 0) {
    stmts.push(
      x.db
        .prepare(
          `INSERT INTO duel_ladder_stars (player_id, floor, stars, updated_at) SELECT ?1, ?2, ?3, ?4 WHERE ${G}
           ON CONFLICT (player_id, floor) DO UPDATE SET stars = MAX(stars, excluded.stars), updated_at = excluded.updated_at`,
        )
        .bind(x.pid, floor.floor, pay.stars, x.now),
    );
  }
  const res = await x.db.batch(stmts);
  if (res[0].meta.changes !== 1) {
    const again = await loadTicket(x, t.id);
    if (again.status === 'used' && again.result && again.claim === claimJson) return c.json({ ...JSON.parse(again.result), replayed: true, profile: await view(x) });
    throw new ApiError(409, 'ticket_used', 'This battle was already reported');
  }
  await emitWithFirst(c, 'battle_result', { mode: 'ladder', result: outcomeOf(s.winner), ticks: s.ticks }, 'first_battle', { mode: 'ladder' });
  return c.json({ ...summary, profile: await view(x) });
});

interface ChestRow {
  glory: number;
  item: string | null;
}

/**
 * Claims a chapter chest (idempotent: a chest already claimed answers with
 * what it paid, `replayed: true`). Needs the chapter's stars to reach the
 * tier's threshold (10 / 20 / 30). Pays Glory; the top tier also a rare or
 * better item into the stash.
 */
duel.post('/ladder/chest', async (c) => {
  limit(c, 'duel_chest', 30);
  const x = await ctx(c);
  const body = await readJson(c, z.object({ chapter: z.number().int().min(1).max(CHAPTERS), tier: z.number().int().min(1).max(CHEST_TIERS) }), 1024);
  if (!validChest(body.chapter, body.tier)) throw badRequest('No such chest');
  const had = () => x.db.prepare('SELECT glory, item FROM duel_ladder_chests WHERE player_id = ?1 AND chapter = ?2 AND tier = ?3').bind(x.pid, body.chapter, body.tier).first<ChestRow>();
  const answer = async (r: ChestRow, replayed: boolean) =>
    c.json({ chapter: body.chapter, tier: body.tier, glory: r.glory, item: r.item ? (JSON.parse(r.item) as Item) : null, replayed, profile: await view(x) });
  const old = await had();
  if (old) return answer(old, true);
  const ladder = await loadLadderStars(x.db, x.p);
  if (chestState(ladder.stars, ladder.chests, body.chapter, body.tier) !== 'ready') throw new ApiError(409, 'chest_locked', 'Not enough stars in this chapter yet');
  const reward = chestReward(body.chapter, body.tier);
  let item: Item | null = null;
  if (reward.item) {
    const start = await reserveDuelIds(x.db, x.pid, 4);
    x.p = await requireDuelProfile(x.db, x.pid);
    item = chestItem(randomU32(), { nextId: start }, duelPrefix(x.pid), body.chapter);
  }
  const G = duelRevGuard(x.pid, x.p.rev + 1);
  const res = await x.db.batch([
    x.db
      .prepare(
        `UPDATE duel_profiles SET glory = glory + ?2, rev = rev + 1, updated_at = ?3 WHERE player_id = ?1 AND rev = ?4
           AND NOT EXISTS (SELECT 1 FROM duel_ladder_chests WHERE player_id = ?1 AND chapter = ?5 AND tier = ?6)`,
      )
      .bind(x.pid, reward.glory, x.now, x.p.rev, body.chapter, body.tier),
    x.db
      .prepare(`INSERT INTO duel_ladder_chests (player_id, chapter, tier, glory, item, claimed_at) SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE ${G}`)
      .bind(x.pid, body.chapter, body.tier, reward.glory, item ? JSON.stringify(item) : null, x.now),
    ...(item ? [itemInsert(x.db, x.pid, item, G, x.now)] : []),
  ]);
  if (res[0].meta.changes !== 1) {
    const raced = await had();
    if (raced) return answer(raced, true);
    throw new ApiError(409, 'conflict', 'Your duel army changed meanwhile; try again');
  }
  return answer({ glory: reward.glory, item: item ? JSON.stringify(item) : null }, false);
});

duel.post('/ladder/abandon', async (c) => {
  const x = await ctx(c);
  const body = await readJson(c, z.object({ ticket: z.string().regex(/^[0-9a-f]{32}$/) }), 1024);
  const t = await loadTicket(x, body.ticket);
  if (t.status !== 'open') throw new ApiError(409, 'ticket_closed', `This battle was ${t.status}`);
  await closeTicket(x, t, 'abandoned');
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ live ranked and unranked (docs/DUELS.md "Ranked live")

/** The ranked card: league, placements, the level gate, the queue cooldown and a live match to rejoin. */
duel.get('/ranked', async (c) => {
  const x = await ctx(c);
  await rollRatings(x.db, x.pid, x.now);
  const [r, q, match] = await Promise.all([getRating(x.db, x.pid, 'live', x.now), getQueueState(x.db, x.pid), liveMatchOf(x.db, x.pid, x.now)]);
  const league = rowLeague(r);
  const level = accountLevel(x.p.xp);
  return c.json({
    now: x.now,
    level,
    unlockLevel: DUEL_RULES.rankedLevel,
    unlocked: level >= DUEL_RULES.rankedLevel,
    league,
    // the rating stays hidden below Legend
    rating: league?.id === 'legend' ? Math.round(r.rating) : null,
    games: r.games,
    wins: r.wins,
    losses: r.losses,
    draws: r.draws,
    placements: { played: Math.min(r.games, RANKED.placements), of: RANKED.placements },
    cooldownUntil: q.cooldownUntil > x.now ? q.cooldownUntil : 0,
    match,
  });
});

/** A settled match's report for this player (a reconnect after the end); 409 while it is live. */
duel.get('/match/:id', async (c) => {
  const x = await ctx(c);
  const id = c.req.param('id');
  if (!/^[0-9a-f]{32}$/.test(id)) throw badRequest('Bad match id');
  const r = await matchReport(x.db, id, x.pid);
  if (!r) throw new ApiError(404, 'not_found', 'No such match');
  if (r === 'live') throw new ApiError(409, 'match_live', 'The match is still being fought');
  return c.json({ report: r, profile: await view(x) });
});
