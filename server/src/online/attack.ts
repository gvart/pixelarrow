/**
 * Async attacks on regions (POST /api/online/attack/*).
 *
 * start:   the server checks the attack is legal (army one route away, energy,
 *          cooldown), takes the region lock in the shard's Durable Object, fixes
 *          the seed and both armies and stores a ticket (10 min).
 * submit:  the client sends the order log of the battle it played; the server
 *          replays the ticket's setup with it (src/sim) and, only if the claim
 *          matches, applies the result in one D1 batch: casualties, wounds and
 *          XP on both sides, loot for the attacker, siege progress / capture.
 *          Submitting the same ticket again returns the stored result.
 * abandon: gives up an open ticket (no casualties, re-attack cooldown).
 */
import { emitWithFirst, outcomeOf } from '../telemetry/analytics';
import { Hono } from 'hono';
import { z } from 'zod';
import { LIMITS, LoggedOrderSchema, replayBattle } from '../battle';
import { readJson } from '../body';
import type { AppEnv } from '../env';
import { ApiError, badRequest } from '../errors';
import { requireAuth } from '../middleware';
import type { Hero } from '../../../src/data/units';
import type { BattleSetup, LoggedOrder } from '../../../src/sim/types';
import { ABANDON_MS, neutralDefenders, RESPAWN_MS, SIEGE_DECAY_MS, WINS_TO_CLAIM } from '../../../src/online/defenders';
import { militia, ONLINE_RULES, DEFAULT_FORMATIONS } from '../../../src/online/rules';
import { onlineBattleSetup, resolveAttack } from '../../../src/online/battle';
import { limit, player, regionKey, shardStub, type PlayerCtx } from './context';
import { applyBattleConsumable, BATTLE_CONSUMABLES, CONSUMABLES, type ConsumableId } from '../../../src/data/consumables';
import { attackXp, passXpStmt } from '../economy/pass';
import { pendingIncome } from './income';
import { pushArmyMove } from './live';
import { BEAST_RULES, bossAt, lairAt, lairBeasts, type Lair } from '../../../src/online/lairs';
import { ev, later, notify } from '../notify/outbox';
import { trophyId } from '../../../src/data/beasts';
import {
  armyState,
  energyNow,
  fieldReady,
  formationsOf,
  heroPrefix,
  loadGarrison,
  loadHeroes,
  randomToken,
  randomU32,
  regionRow,
  staticRegion,
  type OwnedHero,
  type RegionRow,
  type Shard,
} from './store';

export const attack = new Hono<AppEnv>();
attack.use('*', requireAuth);

/** The beast of a lair region if it is at home (never slain, or back after BEAST_RULES.respawnMs). */
export function lairBeast(shard: Pick<Shard, 'world' | 'seed'>, loc: number, row: Pick<RegionRow, 'beast_slain_at'> | null | undefined, now: number): Lair | null {
  const lair = lairAt(shard.world, shard.seed, loc);
  if (!lair) return null;
  const slain = row?.beast_slain_at ?? null;
  return slain === null || now - slain >= BEAST_RULES.respawnMs ? lair : null;
}

/** The neutrals holding a region right now (a lair's beast, persisted losses, or a fresh wave). */
export function currentNeutrals(shard: Pick<Shard, 'world' | 'seed'>, loc: number, row: RegionRow | null | undefined, now: number, slain?: Pick<RegionRow, 'beast_slain_at'> | null): Hero[] {
  const info = shard.world.info(loc);
  const lair = lairBeast(shard, loc, slain !== undefined ? slain : row, now);
  // A beast heals between fights: always the whole beast and its hoard.
  if (lair) return lairBeasts(shard.seed, info, lair, row?.npc_gen ?? 0);
  if (row?.npc && row.npc_at && now - row.npc_at < RESPAWN_MS) return JSON.parse(row.npc) as Hero[];
  return neutralDefenders(shard.seed, info, row?.npc_gen ?? 0);
}

/** An owned region nobody guards and whose income was left alone for ABANDON_MS falls back to the neutrals. */
export function abandoned(row: RegionRow | null | undefined, garrison: number, now: number): boolean {
  return !!row?.owner_id && row.home !== 1 && garrison === 0 && now - (row.accrued_at ?? now) > ABANDON_MS;
}

/** Victories in a row this player already has against the neutrals of a region. */
export function siegeWins(row: RegionRow | null | undefined, pid: number, now: number): number {
  if (!row || row.siege_by !== pid || !row.siege_at || now - row.siege_at > SIEGE_DECAY_MS) return 0;
  return row.siege_wins;
}

interface TicketRow {
  id: string;
  season_id: number;
  shard_id: number;
  player_id: number;
  loc: number;
  seed: number;
  setup: string;
  attackers: string;
  defenders: string;
  defender_kind: 'npc' | 'militia' | 'garrison' | 'beast' | 'boss';
  defender_id: number | null;
  region_version: number;
  status: 'open' | 'used' | 'rejected' | 'abandoned';
  claim: string | null;
  result: string | null;
  apply_nonce: string | null;
  won: number | null;
  consumable: string | null;
  created_at: number;
  expires_at: number;
  finished_at: number | null;
}

function ticketView(t: TicketRow, info: { kind: string; tier: number }, extra: Record<string, unknown> = {}) {
  return {
    ticket: t.id,
    expiresAt: t.expires_at,
    region: { loc: t.loc, kind: info.kind, tier: info.tier },
    defenderKind: t.defender_kind,
    consumable: t.consumable ?? null,
    setup: JSON.parse(t.setup) as BattleSetup,
    attackers: JSON.parse(t.attackers) as Hero[],
    defenders: JSON.parse(t.defenders) as Hero[],
    ...extra,
  };
}

const StartBody = z.object({
  loc: z.number().int().min(1).max(1_000_000),
  heroIds: z.array(z.string().max(80)).max(ONLINE_RULES.maxArmy).optional(),
  /** At most ONE battle consumable per battle (spent when the ticket is created). */
  consumable: z.string().max(40).nullable().optional(),
  /** Rejected when it names more than one: one consumable per battle. */
  consumables: z.array(z.string().max(40)).max(10).optional(),
});

/** The single battle consumable an attack/duel request names (400 for several or a non-battle one). */
export function pickConsumable(one: string | null | undefined, many: string[] | undefined): ConsumableId | null {
  const all = [...(one ? [one] : []), ...(many ?? [])];
  if (all.length > 1) throw new ApiError(400, 'one_consumable', 'At most one consumable per battle');
  if (all.length === 0) return null;
  if (!(BATTLE_CONSUMABLES as string[]).includes(all[0])) throw new ApiError(400, 'bad_consumable', `${all[0]} is not a battle consumable`);
  return all[0] as ConsumableId;
}

/** Records the consumables of both sides in a setup and bakes in their effects (the server replay sees the same setup). */
export function withConsumables(setup: BattleSetup, picks: [ConsumableId | null, ConsumableId | null]): BattleSetup {
  if (!picks[0] && !picks[1]) return setup;
  picks.forEach((id, side) => {
    if (id) applyBattleConsumable(setup.armies[side], id);
  });
  (setup as BattleSetup & { consumables?: [string | null, string | null] }).consumables = picks;
  return setup;
}

attack.post('/start', async (c) => {
  limit(c, 'attack', 12);
  const pc = await player(c);
  const body = await readJson(c, StartBody, 8 * 1024);
  const consumable = pickConsumable(body.consumable, body.consumables);
  const target = body.loc;
  if (!pc.shard.world.has(target)) throw badRequest('No such region');
  const info = staticRegion(pc.shard, target);
  const now = pc.now;

  // An open ticket on this region is resumed (same seed, same armies): no seed fishing by restarting.
  const last = await pc.db
    .prepare('SELECT * FROM battle_tickets WHERE player_id = ?1 AND season_id = ?2 AND shard_id = ?3 AND loc = ?4 ORDER BY created_at DESC LIMIT 1')
    .bind(pc.pid, pc.season.id, pc.shard.id, target)
    .first<TicketRow>();
  if (last && last.status === 'open' && last.expires_at > now) return c.json(ticketView(last, info, { resumed: true }));
  if (last && now - (last.finished_at ?? last.expires_at) < ONLINE_RULES.reattackCooldownMs && last.won !== 1) {
    throw new ApiError(429, 'cooldown', 'Your men need a moment before trying this region again', { retryAt: (last.finished_at ?? last.expires_at) + ONLINE_RULES.reattackCooldownMs });
  }

  if (!info.passable) throw badRequest('Nobody can fight there');
  if (bossAt(pc.shard.world, pc.shard.seed, target)) throw new ApiError(409, 'world_boss', 'A world boss: raid it instead (POST /api/online/boss/start)');
  const army = armyState(pc.profile, now);
  if (army.marching) throw new ApiError(409, 'marching', 'Your army is on the march');
  if (!pc.shard.world.adjacent(army.pos, target)) throw new ApiError(409, 'not_adjacent', 'Your army must stand one route away from the region');
  const energy = energyNow(pc.profile, now);
  if (energy < ONLINE_RULES.energyPerAttack) throw new ApiError(409, 'no_energy', 'Not enough energy');
  const row = await regionRow(pc.db, pc.shard, target);
  if (row?.owner_id === pc.pid || (row?.clan_id && pc.clan && row.clan_id === pc.clan.clanId)) throw new ApiError(409, 'own_region', 'That region is yours already');
  if (row?.home === 1) throw new ApiError(409, 'protected', 'Home regions cannot be attacked');

  const mine = await loadHeroes(pc.db, pc.season.id, pc.pid);
  let attackers: OwnedHero[] = fieldReady(mine, now);
  if (body.heroIds) {
    const want = new Set(body.heroIds);
    attackers = attackers.filter((h) => want.has(h.hero.id));
    if (attackers.length !== want.size) throw new ApiError(409, 'heroes_unavailable', 'Some of those heroes cannot fight now');
  }
  if (attackers.length === 0) throw new ApiError(409, 'no_army', 'No hero of your field army can fight');
  if (consumable) {
    const has = await pc.db
      .prepare('SELECT qty FROM online_consumables WHERE season_id = ?1 AND player_id = ?2 AND consumable_id = ?3')
      .bind(pc.season.id, pc.pid, consumable)
      .first<{ qty: number }>();
    if (!has || has.qty < 1) throw new ApiError(409, 'none_left', `You have no ${CONSUMABLES[consumable].name.toLowerCase()}`);
  }

  let kind: TicketRow['defender_kind'] = 'npc';
  let defenders: Hero[];
  let defenderIds: string[] = [];
  let defFormations = [...DEFAULT_FORMATIONS];
  if (row?.owner_id) {
    const garrison = (await loadGarrison(pc.db, pc.shard, target)).filter((g) => g.woundedUntil <= now && g.busyUntil <= now);
    if (abandoned(row, garrison.length, now)) {
      defenders = currentNeutrals(pc.shard, target, null, now, row);
      if (lairBeast(pc.shard, target, row, now)) kind = 'beast';
    } else if (garrison.length > 0) {
      kind = 'garrison';
      defenders = garrison.map((g) => g.hero);
      defenderIds = defenders.map((h) => h.id);
      defFormations = formationsOf(row.formations);
    } else {
      kind = 'militia';
      defenders = militia(pc.shard.seed, info, row.version);
    }
  } else {
    defenders = currentNeutrals(pc.shard, target, row, now);
    if (lairBeast(pc.shard, target, row, now)) kind = 'beast';
  }

  const id = randomToken(16);
  const seed = randomU32();
  const expiresAt = now + ONLINE_RULES.ticketTtlMs;
  const setup = withConsumables(
    onlineBattleSetup(
      seed,
      { heroes: attackers.map((a) => a.hero), formations: formationsOf(pc.profile.formations), bot: false },
      { heroes: defenders, formations: defFormations, bot: true },
      info.site,
    ),
    [consumable, null],
  );

  const stub = shardStub(pc.env, pc.shard);
  const lock = await stub.lockRegion(regionKey(target), id, pc.pid, expiresAt, now);
  if (!lock.ok) throw new ApiError(409, 'region_locked', 'Someone is already attacking this region', { until: lock.until });

  const busy = [...attackers.map((a) => a.hero.id), ...defenderIds];
  const ph = busy.map((_, i) => `?${i + 3}`).join(',');
  const g = `EXISTS (SELECT 1 FROM battle_tickets WHERE id = '${id}')`;
  const res = await pc.db.batch([
    pc.db
      .prepare(
        `INSERT INTO battle_tickets (id, season_id, shard_id, player_id, loc, seed, setup, attackers, defenders, defender_kind, defender_id, region_version, created_at, expires_at, consumable)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15
         WHERE NOT EXISTS (SELECT 1 FROM online_heroes WHERE id IN (${busy.map((_, i) => `?${i + 16}`).join(',')}) AND busy_until > ?13)
           AND (?15 IS NULL OR EXISTS (SELECT 1 FROM online_consumables WHERE season_id = ?2 AND player_id = ?4 AND consumable_id = ?15 AND qty >= 1))`,
      )
      .bind(id, pc.season.id, pc.shard.id, pc.pid, target, seed, JSON.stringify(setup), JSON.stringify(attackers.map((a) => a.hero)), JSON.stringify(defenders), kind, row?.owner_id ?? null, row?.version ?? 0, now, expiresAt, consumable, ...busy),
    pc.db.prepare(`UPDATE online_heroes SET busy_ticket = ?1, busy_until = ?2 WHERE id IN (${ph}) AND ${g}`).bind(id, expiresAt, ...busy),
    pc.db
      .prepare(`UPDATE online_profiles SET energy = ?3, energy_at = ?4, rev = rev + 1 WHERE season_id = ?1 AND player_id = ?2 AND ${g}`)
      .bind(pc.season.id, pc.pid, energy - ONLINE_RULES.energyPerAttack, now),
    ...(consumable
      ? [pc.db.prepare(`UPDATE online_consumables SET qty = qty - 1 WHERE season_id = ?1 AND player_id = ?2 AND consumable_id = ?3 AND qty >= 1 AND ${g}`).bind(pc.season.id, pc.pid, consumable)]
      : []),
  ]);
  if (res[0].meta.changes !== 1) {
    await stub.unlockRegion(regionKey(target), id);
    throw new ApiError(409, 'heroes_busy', 'Some heroes are already in a battle (or the consumable is gone)');
  }
  const t = (await pc.db.prepare('SELECT * FROM battle_tickets WHERE id = ?1').bind(id).first<TicketRow>())!;
  // The owner hears about it (unless they are on the war table right now).
  if (row?.owner_id && (kind === 'garrison' || kind === 'militia')) {
    later(c, notify(c.env, [ev(row.owner_id, 'attack_start', `atk:${id}:start`, { loc: target, place: info.name, by: pc.name, ticket: id })], { shard: pc.shard }));
  }
  return c.json(ticketView(t, info));
});

const SubmitBody = z.object({
  ticket: z.string().regex(/^[0-9a-f]{32}$/),
  orders: z.array(LoggedOrderSchema).max(LIMITS.maxOrders),
  deployOrders: z.number().int().min(0).max(LIMITS.maxOrders).optional(),
  claim: z.object({
    winner: z.union([z.literal(0), z.literal(1), z.literal(-1)]),
    ticks: z.number().int().min(0),
    hash: z.string().max(16),
  }),
});

async function loadTicket(pc: PlayerCtx, id: string): Promise<TicketRow> {
  const t = await pc.db.prepare('SELECT * FROM battle_tickets WHERE id = ?1 AND player_id = ?2').bind(id, pc.pid).first<TicketRow>();
  if (!t) throw new ApiError(404, 'not_found', 'No such ticket');
  return t;
}

async function closeTicket(pc: PlayerCtx, t: TicketRow, status: 'rejected' | 'abandoned', extra: { claim?: string; result?: string } = {}): Promise<void> {
  await pc.db.batch([
    pc.db
      .prepare("UPDATE battle_tickets SET status = ?2, finished_at = ?3, claim = COALESCE(?4, claim), result = COALESCE(?5, result), won = 0 WHERE id = ?1 AND status = 'open'")
      .bind(t.id, status, pc.now, extra.claim ?? null, extra.result ?? null),
    pc.db.prepare('UPDATE online_heroes SET busy_ticket = NULL, busy_until = 0 WHERE busy_ticket = ?1').bind(t.id),
  ]);
  await shardStub(pc.env, { season: t.season_id, id: t.shard_id }).unlockRegion(regionKey(t.loc), t.id);
}

attack.post('/submit', async (c) => {
  limit(c, 'submit', 20);
  const pc = await player(c);
  const body = await readJson(c, SubmitBody, LIMITS.maxBodyBytes);
  const t = await loadTicket(pc, body.ticket);
  const claimJson = JSON.stringify(body.claim);
  if (t.status === 'used') {
    if (t.claim === claimJson && t.result) return c.json({ ...JSON.parse(t.result), replayed: true });
    throw new ApiError(409, 'ticket_used', 'This battle was already reported');
  }
  if (t.status !== 'open') throw new ApiError(409, 'ticket_closed', `This attack was ${t.status}`);
  if (t.expires_at < pc.now) {
    await closeTicket(pc, t, 'abandoned');
    throw new ApiError(410, 'ticket_expired', 'Too late: the attack ticket expired');
  }

  // The server's own replay of the ticket's setup is the only truth.
  const setup = JSON.parse(t.setup) as BattleSetup;
  let out;
  try {
    out = replayBattle(setup, body.orders as LoggedOrder[], body.deployOrders);
  } catch (e) {
    await closeTicket(pc, t, 'rejected', { claim: claimJson });
    throw new ApiError(422, 'sim_rejected', `The simulation rejected this battle: ${(e as Error).message}`);
  }
  const s = out.summary;
  const mismatches: string[] = [];
  if (s.winner !== body.claim.winner) mismatches.push(`winner: claimed ${body.claim.winner}, server ${s.winner}`);
  if (s.ticks !== body.claim.ticks) mismatches.push(`ticks: claimed ${body.claim.ticks}, server ${s.ticks}`);
  if (s.hash !== body.claim.hash) mismatches.push(`hash: claimed ${body.claim.hash}, server ${s.hash}`);
  if (mismatches.length) {
    await closeTicket(pc, t, 'rejected', { claim: claimJson, result: JSON.stringify({ mismatches }) });
    throw new ApiError(422, 'replay_mismatch', 'The battle did not replay as reported; the attack is void', { mismatches });
  }

  const result = await applyAttack(pc, t, out.result, s, claimJson);
  await shardStub(pc.env, { season: t.season_id, id: t.shard_id }).unlockRegion(regionKey(t.loc), t.id);
  // The defender: region lost, or the garrison held.
  const owner = t.defender_id;
  if (owner && owner !== pc.pid && !('replayed' in result && result.replayed)) {
    const held = !result.won && (t.defender_kind === 'garrison' || t.defender_kind === 'militia');
    if (result.captured || held) {
      const data = { loc: t.loc, place: pc.shard.world.has(t.loc) ? pc.shard.world.info(t.loc).name : `#${t.loc}`, by: pc.name, ticket: t.id };
      later(c, notify(c.env, [result.captured ? ev(owner, 'attack_captured', `atk:${t.id}:end`, data) : ev(owner, 'attack_held', `atk:${t.id}:end`, data)], { shard: { season: t.season_id, id: t.shard_id } }));
    }
  }
  if (!(result as { replayed?: boolean }).replayed) {
    const mode = t.defender_kind === 'beast' ? 'beast' : 'online';
    await emitWithFirst(c, 'battle_result', { mode, result: outcomeOf(s.winner), ticks: s.ticks }, 'first_battle', { mode });
    if ((result as { captured?: boolean }).captured) await emitWithFirst(c, null, {}, 'first_capture', {});
  }
  return c.json(result);
});

attack.post('/abandon', async (c) => {
  const pc = await player(c);
  const body = await readJson(c, z.object({ ticket: z.string().regex(/^[0-9a-f]{32}$/) }), 1024);
  const t = await loadTicket(pc, body.ticket);
  if (t.status !== 'open') throw new ApiError(409, 'ticket_closed', `This attack was ${t.status}`);
  await closeTicket(pc, t, 'abandoned');
  return c.json({ ok: true });
});

/** Applies a verified attack atomically (guarded by the ticket's apply nonce). */
async function applyAttack(pc: PlayerCtx, t: TicketRow, result: ReturnType<typeof replayBattle>['result'], summary: ReturnType<typeof replayBattle>['summary'], claimJson: string) {
  const { db: d, now } = pc;
  const shard: Shard = { ...pc.shard, season: t.season_id, id: t.shard_id };
  const loc = t.loc;
  const info = staticRegion(shard, loc);
  const attackers = JSON.parse(t.attackers) as Hero[];
  const defenders = JSON.parse(t.defenders) as Hero[];
  const res = resolveAttack(result, attackers, defenders, t.seed);
  const won = result.winner === 0;
  const row = await regionRow(d, shard, loc);
  const nonce = randomToken(8);
  const G = `EXISTS (SELECT 1 FROM battle_tickets WHERE id = '${t.id}' AND apply_nonce = '${nonce}')`;

  // Siege progress against neutrals: several wins in a row for strong regions.
  const needed = t.defender_kind === 'npc' ? WINS_TO_CLAIM[info.tier] ?? 1 : 1;
  const beast = t.defender_kind === 'beast' ? lairAt(shard.world, shard.seed, loc) : null;
  const prior = t.defender_kind === 'npc' ? siegeWins(row, pc.pid, now) : 0;
  const wins = won ? prior + 1 : 0;
  const captured = won && wins >= needed;

  // Plunder: the previous owner's uncollected income goes to the conqueror.
  let plunder = { gold: 0, food: 0, wood: 0, bronze: 0, recruits: 0 };
  if (captured && row?.owner_id) {
    const inc = await pendingIncome(d, shard, row.owner_id, row.clan_id, now);
    plunder = inc.regions.find((x) => x.loc === loc)?.income ?? plunder;
  }
  const gold = res.attacker.outcome.gold + plunder.gold;
  const prefix = heroPrefix(t.season_id, pc.pid);
  const loot = res.loot.map((it, i) => ({ ...it, uid: `${prefix}l${t.id.slice(0, 8)}_${i}` }));

  const stmts: D1PreparedStatement[] = [
    d
      .prepare("UPDATE battle_tickets SET status = 'used', apply_nonce = ?2, claim = ?3, finished_at = ?4, won = ?5 WHERE id = ?1 AND status = 'open'")
      .bind(t.id, nonce, claimJson, now, won ? 1 : 0),
    d
      .prepare(
        `UPDATE online_profiles SET gold = gold + ?3, food = food + ?4, wood = wood + ?5, bronze = bronze + ?6, recruits = recruits + ?7,
           battles = battles + 1, wins = wins + ?8, rev = rev + 1, updated_at = ?9 WHERE season_id = ?1 AND player_id = ?2 AND ${G}`,
      )
      .bind(t.season_id, pc.pid, gold, plunder.food, plunder.wood, plunder.bronze, plunder.recruits, won ? 1 : 0, now),
  ];
  const heroStmts = (side: typeof res.attacker, owned: boolean) => {
    for (const id of side.dead) stmts.push(d.prepare(`DELETE FROM online_heroes WHERE id = ?1 AND busy_ticket = ?2 AND ${G}`).bind(id, t.id));
    if (!owned) return;
    for (const h of side.survivors) {
      const wounded = side.wounded.includes(h.id) ? now + ONLINE_RULES.woundMs : 0;
      stmts.push(
        d
          .prepare(`UPDATE online_heroes SET data = ?2, wounded_until = MAX(wounded_until, ?3), busy_ticket = NULL, busy_until = 0, updated_at = ?4 WHERE id = ?1 AND busy_ticket = ?5 AND ${G}`)
          .bind(h.id, JSON.stringify(h), wounded, now, t.id),
      );
    }
  };
  heroStmts(res.attacker, true);
  for (const it of loot) {
    stmts.push(d.prepare(`INSERT INTO online_items (uid, season_id, player_id, data, created_at) SELECT ?1, ?2, ?3, ?4, ?5 WHERE ${G}`).bind(it.uid, t.season_id, pc.pid, JSON.stringify(it), now));
  }

  if (t.defender_kind === 'garrison') {
    heroStmts(res.defender, true);
    if (captured) {
      // Surviving defenders fall back to their owners' field armies.
      stmts.push(d.prepare(`DELETE FROM online_garrisons WHERE season_id = ?1 AND shard_id = ?2 AND loc = ?3 AND ${G}`).bind(t.season_id, t.shard_id, loc));
    }
    if (t.defender_id) {
      stmts.push(
        d
          .prepare(`UPDATE online_profiles SET gold = gold + ?3, battles = battles + 1, wins = wins + ?4, rev = rev + 1 WHERE season_id = ?1 AND player_id = ?2 AND ${G}`)
          .bind(t.season_id, t.defender_id, res.defender.outcome.gold, won ? 0 : 1),
      );
    }
  }

  const clanId = pc.clan?.clanId ?? null;
  const where = `season_id = ${t.season_id | 0} AND shard_id = ${t.shard_id | 0} AND loc = ${loc | 0}`;
  stmts.push(d.prepare(`INSERT OR IGNORE INTO online_regions (season_id, shard_id, loc) SELECT ?1, ?2, ?3 WHERE ${G}`).bind(t.season_id, t.shard_id, loc));
  if (captured) {
    stmts.push(
      d
        .prepare(
          `UPDATE online_regions SET occupant = 'player', owner_id = ?1, clan_id = ?2, home = 0, captured_at = ?3, accrued_at = ?3, formations = NULL,
             npc = NULL, npc_at = NULL, npc_gen = npc_gen + 1, siege_by = NULL, siege_wins = 0, siege_at = NULL, version = version + 1,
             beast_slain_at = CASE WHEN ?5 THEN ?3 ELSE beast_slain_at END
           WHERE ${where} AND version = ?4 AND ${G}`,
        )
        .bind(pc.pid, clanId, now, t.region_version, beast ? 1 : 0),
    );
    // A slain beast leaves a trophy (a cosmetic entitlement, kept across seasons).
    if (beast) stmts.push(d.prepare(`INSERT OR IGNORE INTO entitlements (player_id, product_id, purchase_id, granted_at) SELECT ?1, ?2, NULL, ?3 WHERE ${G}`).bind(pc.pid, trophyId(beast.enc), now));
    // The army moves into the conquered region.
    stmts.push(d.prepare(`UPDATE online_profiles SET army_loc = ?3, march = NULL WHERE season_id = ?1 AND player_id = ?2 AND ${G}`).bind(t.season_id, pc.pid, loc));
  } else if (t.defender_kind === 'beast') {
    // The beast licks its wounds (it heals between fights): only the region row exists.
  } else if (t.defender_kind === 'npc') {
    // Neutrals keep their losses until they respawn; a won round of a siege brings the next wave.
    const survivors = won ? null : JSON.stringify(res.defender.survivors);
    stmts.push(
      d
        .prepare(
          `UPDATE online_regions SET npc = ?1, npc_at = ?2, npc_gen = npc_gen + ?3, siege_by = ?4, siege_wins = ?5, siege_at = ?6,
             owner_id = CASE WHEN ?7 THEN NULL ELSE owner_id END, clan_id = CASE WHEN ?7 THEN NULL ELSE clan_id END,
             occupant = CASE WHEN ?7 THEN 'npc' ELSE occupant END, version = version + 1
           WHERE ${where} AND ${G}`,
        )
        .bind(survivors, now, won ? 1 : 0, won ? pc.pid : null, wins, won ? now : null, row?.owner_id ? 1 : 0),
    );
  }

  const summaryOut = {
    won,
    captured,
    siege: t.defender_kind === 'npc' ? { wins, needed } : null,
    beast: beast ? { enc: beast.enc, level: beast.level, trophy: captured ? trophyId(beast.enc) : null } : null,
    winner: summary.winner,
    ticks: summary.ticks,
    hash: summary.hash,
    loc,
    defenderKind: t.defender_kind,
    gold,
    plunder,
    loot,
    attacker: { dead: res.attacker.dead, wounded: res.attacker.wounded, heroes: res.attacker.outcome.heroes },
    defender: { dead: res.defender.dead.length, total: defenders.length },
    consumable: t.consumable ?? null,
    passXp: attackXp(won, captured),
  };
  stmts.push(d.prepare(`UPDATE battle_tickets SET result = ?2 WHERE id = ?1 AND ${G}`).bind(t.id, JSON.stringify(summaryOut)));
  stmts.push(passXpStmt(d, t.season_id, pc.pid, summaryOut.passXp, G, now));
  stmts.push(
    d
      .prepare(
        `INSERT INTO battle_log (season_id, shard_id, kind, ref, attacker_id, defender_id, loc, winner, ticks, hash, verified, summary, created_at)
         SELECT ?1, ?2, 'attack', ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1, ?10, ?11 WHERE ${G}`,
      )
      .bind(t.season_id, t.shard_id, t.id, pc.pid, t.defender_id, loc, summary.winner, summary.ticks, summary.hash, JSON.stringify({ captured, gold, loot: loot.length }), now),
  );
  const out = await d.batch(stmts);
  if (out[0].meta.changes !== 1) {
    // Someone (a retry of this very request) applied it first: answer with what was stored.
    const again = await loadTicket(pc, t.id);
    if (again.status === 'used' && again.result && again.claim === claimJson) return { ...JSON.parse(again.result), replayed: true };
    throw new ApiError(409, 'ticket_used', 'This battle was already reported');
  }
  // The army moved into the conquered region: show it there to everyone who can see it.
  if (captured) await pushArmyMove(pc, { kind: 'pos', pos: loc });
  return summaryOut;
}
