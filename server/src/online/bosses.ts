/**
 * World bosses (POST/GET /api/online/boss/*): clan raids on a Kraken and a
 * Titan per shard with shared HP (docs/DESIGN_V2.md "Clan raids on world bosses").
 *
 * GET  /         every boss of the shard: HP, arms, status, top damage dealers
 *                (players and clans), your own tally and loot.
 * POST /start    a raid ticket: the server fixes the seed, your army and the
 *                boss at its CURRENT wounds (stored HP, severed arms) for a
 *                segment of ENCOUNTERS[boss].segment seconds. No region lock: many
 *                raids may run at once.
 * POST /submit   the order log; the server replays the segment (src/sim) and,
 *                only if the claim matches, applies it in one D1 batch:
 *                casualties and XP, damage tally, the boss's HP lowered by the
 *                damage dealt (relative, so concurrent raids all count),
 *                severed arms kept severed. The raid that brings it to 0 kills
 *                it, and its hoard is split by damage share (idempotent).
 * POST /abandon  gives an open raid up.
 */
import { emitWithFirst, outcomeOf } from '../telemetry/analytics';
import { Hono } from 'hono';
import { z } from 'zod';
import { LIMITS, replayBattle } from '../battle';
import { SubmitBody, verifyBattle } from '../duel/verify';
import { battleTicketView, closeBattleTicket, loadOwnTicket, requireOpenTicket, ticketPreamble, type TicketStatus } from '../tickets';
import { readJson } from '../body';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { requireAuth } from '../middleware';
import type { Hero } from '../../../src/data/units';
import type { Item } from '../../../src/data/items';
import type { BattleSetup } from '../../../src/sim/types';
import { ENCOUNTERS, trophyId, type EncounterId } from '../../../src/data/beasts';
import { SOURCES, armyClasses } from '../../../src/game/sources';
import { getPity, pityStmt } from '../loot';
import { BEAST_RULES, applyBossState, bossChest, bossDefenders, bossLoot, bossMaxHp, segmentOutcome, worldBossSites, type BossSite } from '../../../src/online/lairs';
import { DEFAULT_FORMATIONS, ONLINE_RULES } from '../../../src/online/rules';
import { onlineBattleSetup, resolveAttack } from '../../../src/online/battle';
import { CONSUMABLES } from '../../../src/data/consumables';
import { limit, player, type PlayerCtx } from './context';
import { ev, later, notify, type NotifyEvent } from '../notify/outbox';
import { pickConsumable, withConsumables } from './attack';
import { armyState, clanTags, energyNow, fieldReady, formationsOf, heroPrefix, loadHeroes, playerNames, randomToken, randomU32, staticRegion, type OwnedHero } from './store';

export const bosses = new Hono<AppEnv>();
bosses.use('*', requireAuth);

interface BossRow {
  season_id: number;
  shard_id: number;
  boss: EncounterId;
  loc: number;
  level: number;
  hp: number;
  max_hp: number;
  parts: string;
  status: 'active' | 'dead';
  version: number;
  killed_at: number | null;
  killed_by: number | null;
  created_at: number;
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
  defender_kind: string;
  status: TicketStatus;
  claim: string | null;
  result: string | null;
  consumable: string | null;
  expires_at: number;
}

const shardKey = (pc: { season: { id: number }; shard: { id: number; seed: number } }) => `${pc.season.id}:${pc.shard.id}:${pc.shard.seed}`;

function siteOf(pc: PlayerCtx, boss: string): BossSite {
  const site = worldBossSites(pc.shard.world, pc.shard.seed).find((b) => b.boss === boss);
  if (!site) throw new ApiError(404, 'not_found', 'No such world boss in this shard');
  return site;
}

/** The boss's row, created at full health the first time anyone looks. */
async function bossRow(pc: PlayerCtx, site: BossSite): Promise<BossRow> {
  const max = bossMaxHp(site.boss, site.level);
  await pc.db
    .prepare('INSERT OR IGNORE INTO world_bosses (season_id, shard_id, boss, loc, level, hp, max_hp, parts, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7, ?8)')
    .bind(pc.season.id, pc.shard.id, site.boss, site.loc, site.level, max.body, JSON.stringify(Array.from({ length: max.parts }, () => max.part)), pc.now)
    .run();
  return (await pc.db.prepare('SELECT * FROM world_bosses WHERE season_id = ?1 AND shard_id = ?2 AND boss = ?3').bind(pc.season.id, pc.shard.id, site.boss).first<BossRow>())!;
}

/** What a player owns this season (stash and heroes' gear: item defs) and the classes of their army. */
async function warHoldings(pc: PlayerCtx, season: number, pid: number): Promise<{ owned: Set<string>; classes: string[] }> {
  const [items, heroes] = await Promise.all([
    pc.db.prepare('SELECT data FROM online_items WHERE season_id = ?1 AND player_id = ?2').bind(season, pid).all<{ data: string }>(),
    loadHeroes(pc.db, season, pid),
  ]);
  const owned = new Set<string>(items.results.map((r) => (JSON.parse(r.data) as Item).def));
  for (const h of heroes) for (const it of Object.values(h.hero.equip)) if (it) owned.add(it.def);
  return { owned, classes: armyClasses(heroes.map((h) => h.hero)) };
}

/**
 * Splits a dead boss's hoard by damage share and hands each contributor of
 * at least SOURCES.bossChest.minShare their chest (bossChest: a legendary
 * set piece, the named item or an epic; the war bad-luck counter); safe to
 * run any number of times: every write is guarded by its row not existing yet.
 */
export async function splitBossLoot(pc: PlayerCtx, row: BossRow): Promise<void> {
  if (row.status !== 'dead') return;
  const dmg = await pc.db
    .prepare('SELECT player_id, damage FROM world_boss_damage WHERE season_id = ?1 AND shard_id = ?2 AND boss = ?3 AND damage > 0 ORDER BY player_id')
    .bind(row.season_id, row.shard_id, row.boss)
    .all<{ player_id: number; damage: number }>();
  const total = dmg.results.reduce((a, x) => a + x.damage, 0);
  if (total <= 0) return;
  const [looted, chested] = await Promise.all(
    ['world_boss_loot', 'world_boss_chests'].map(async (table) =>
      new Set(
        (await pc.db.prepare(`SELECT player_id FROM ${table} WHERE season_id = ?1 AND shard_id = ?2 AND boss = ?3`).bind(row.season_id, row.shard_id, row.boss).all<{ player_id: number }>()).results.map(
          (r) => r.player_id,
        ),
      ),
    ),
  );
  const stmts: D1PreparedStatement[] = [];
  const key = `${row.season_id}:${row.shard_id}:${pc.shard.seed}`;
  for (const d of dmg.results) {
    const share = d.damage / total;
    const wantChest = share >= SOURCES.bossChest.minShare && !chested.has(d.player_id);
    if (looted.has(d.player_id) && !wantChest) continue;
    const held = await warHoldings(pc, row.season_id, d.player_id);
    if (wantChest) {
      const [pity, namedHad] = await Promise.all([
        getPity(pc.db, d.player_id, 'war'),
        pc.db.prepare("SELECT 1 FROM world_boss_chests WHERE player_id = ?1 AND season_id = ?2 AND boss = ?3 AND kind = 'named'").bind(d.player_id, row.season_id, row.boss).first(),
      ]);
      const chest = bossChest(row.boss, key, d.player_id, `${heroPrefix(row.season_id, d.player_id)}wbc${row.boss}`, { owned: held.owned, namedHad: !!namedHad, pity, classes: held.classes });
      const noChest = `NOT EXISTS (SELECT 1 FROM world_boss_chests WHERE season_id = ${row.season_id | 0} AND shard_id = ${row.shard_id | 0} AND boss = '${row.boss}' AND player_id = ${d.player_id | 0})`;
      // the item and the counter first, guarded by the chest row not existing yet; the row last
      stmts.push(
        pc.db.prepare(`INSERT OR IGNORE INTO online_items (uid, season_id, player_id, data, created_at) SELECT ?1, ?2, ?3, ?4, ?5 WHERE ${noChest}`).bind(chest.item.uid, row.season_id, d.player_id, JSON.stringify(chest.item), pc.now),
        pityStmt(pc.db, d.player_id, 'war', chest.pity, noChest, pc.now),
        pc.db
          .prepare('INSERT OR IGNORE INTO world_boss_chests (season_id, shard_id, boss, player_id, kind, item, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
          .bind(row.season_id, row.shard_id, row.boss, d.player_id, chest.kind, JSON.stringify(chest.item), pc.now),
      );
    }
    if (looted.has(d.player_id)) continue;
    const items = bossLoot(row.boss, key, d.player_id, share, `${heroPrefix(row.season_id, d.player_id)}wb${row.boss}_`, held.classes);
    const notYet = `NOT EXISTS (SELECT 1 FROM world_boss_loot WHERE season_id = ${row.season_id | 0} AND shard_id = ${row.shard_id | 0} AND boss = '${row.boss}' AND player_id = ${d.player_id | 0})`;
    // items first, guarded by the loot row not existing yet: a second split inserts nothing
    for (const it of items) {
      stmts.push(pc.db.prepare(`INSERT OR IGNORE INTO online_items (uid, season_id, player_id, data, created_at) SELECT ?1, ?2, ?3, ?4, ?5 WHERE ${notYet}`).bind(it.uid, row.season_id, d.player_id, JSON.stringify(it), pc.now));
    }
    stmts.push(pc.db.prepare(`INSERT OR IGNORE INTO entitlements (player_id, product_id, purchase_id, granted_at) SELECT ?1, ?2, NULL, ?3 WHERE ${notYet}`).bind(d.player_id, trophyId(row.boss), pc.now));
    stmts.push(
      pc.db
        .prepare('INSERT OR IGNORE INTO world_boss_loot (season_id, shard_id, boss, player_id, share, items, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
        .bind(row.season_id, row.shard_id, row.boss, d.player_id, share, JSON.stringify(items), pc.now),
    );
  }
  for (let i = 0; i < stmts.length; i += 60) await pc.db.batch(stmts.slice(i, i + 60));
}

async function bossView(pc: PlayerCtx, site: BossSite) {
  let row = await bossRow(pc, site);
  if (row.status === 'dead') await splitBossLoot(pc, row);
  row = (await pc.db.prepare('SELECT * FROM world_bosses WHERE season_id = ?1 AND shard_id = ?2 AND boss = ?3').bind(pc.season.id, pc.shard.id, site.boss).first<BossRow>())!;
  const top = await pc.db
    .prepare('SELECT player_id, clan_id, damage, raids FROM world_boss_damage WHERE season_id = ?1 AND shard_id = ?2 AND boss = ?3 ORDER BY damage DESC, player_id LIMIT 5')
    .bind(pc.season.id, pc.shard.id, site.boss)
    .all<{ player_id: number; clan_id: number | null; damage: number; raids: number }>();
  const clanTop = await pc.db
    .prepare('SELECT clan_id, SUM(damage) AS damage FROM world_boss_damage WHERE season_id = ?1 AND shard_id = ?2 AND boss = ?3 AND clan_id IS NOT NULL GROUP BY clan_id ORDER BY damage DESC LIMIT 3')
    .bind(pc.season.id, pc.shard.id, site.boss)
    .all<{ clan_id: number; damage: number }>();
  const mine = await pc.db
    .prepare('SELECT damage, raids FROM world_boss_damage WHERE season_id = ?1 AND shard_id = ?2 AND boss = ?3 AND player_id = ?4')
    .bind(pc.season.id, pc.shard.id, site.boss, pc.pid)
    .first<{ damage: number; raids: number }>();
  const loot = await pc.db
    .prepare('SELECT share, items FROM world_boss_loot WHERE season_id = ?1 AND shard_id = ?2 AND boss = ?3 AND player_id = ?4')
    .bind(pc.season.id, pc.shard.id, site.boss, pc.pid)
    .first<{ share: number; items: string }>();
  const chest = await pc.db
    .prepare('SELECT kind, item FROM world_boss_chests WHERE season_id = ?1 AND shard_id = ?2 AND boss = ?3 AND player_id = ?4')
    .bind(pc.season.id, pc.shard.id, site.boss, pc.pid)
    .first<{ kind: string; item: string }>();
  const names = await playerNames(pc.db, top.results.map((x) => x.player_id));
  const tags = await clanTags(pc.db, [...top.results.map((x) => x.clan_id), ...clanTop.results.map((x) => x.clan_id)].filter((x): x is number => x !== null));
  const max = bossMaxHp(site.boss, site.level);
  return {
    boss: site.boss,
    loc: site.loc,
    level: site.level,
    hp: row.hp,
    maxHp: row.max_hp,
    parts: JSON.parse(row.parts) as number[],
    partMax: max.part,
    status: row.status,
    killedAt: row.killed_at,
    segment: ENCOUNTERS[site.boss].segment ?? 120,
    top: top.results.map((x) => ({ player: x.player_id, name: names.get(x.player_id) ?? '?', clan: x.clan_id !== null ? tags.get(x.clan_id)?.tag ?? null : null, damage: x.damage, raids: x.raids })),
    clans: clanTop.results.map((x) => ({ clan: x.clan_id, tag: tags.get(x.clan_id)?.tag ?? '?', name: tags.get(x.clan_id)?.name ?? '?', damage: x.damage })),
    you: {
      damage: mine?.damage ?? 0,
      raids: mine?.raids ?? 0,
      loot: loot ? { share: loot.share, items: JSON.parse(loot.items) as Item[] } : null,
      /** The contributor's chest (at least SOURCES.bossChest.minShare of the damage), or null. */
      chest: chest ? { kind: chest.kind, item: JSON.parse(chest.item) as Item } : null,
    },
  };
}

bosses.get('/', async (c) => {
  const pc = await player(c);
  const out = [];
  for (const site of worldBossSites(pc.shard.world, pc.shard.seed)) out.push(await bossView(pc, site));
  return c.json({ now: pc.now, bosses: out });
});

const StartBody = z.object({
  boss: z.enum(['kraken', 'titan']),
  heroIds: z.array(z.string().max(80)).max(ONLINE_RULES.maxArmy).optional(),
  consumable: z.string().max(40).nullable().optional(),
  consumables: z.array(z.string().max(40)).max(10).optional(),
});

function ticketView(t: TicketRow, boss: EncounterId, extra: Record<string, unknown> = {}) {
  return battleTicketView(t, { boss, loc: t.loc, defenderKind: 'boss' }, extra);
}

bosses.post('/start', async (c) => {
  limit(c, 'raid', 12);
  const pc = await player(c);
  const body = await readJson(c, StartBody, 8 * 1024);
  const consumable = pickConsumable(body.consumable, body.consumables);
  const site = siteOf(pc, body.boss);
  const now = pc.now;
  const open = await pc.db
    .prepare("SELECT * FROM battle_tickets WHERE player_id = ?1 AND season_id = ?2 AND shard_id = ?3 AND loc = ?4 AND status = 'open' AND expires_at > ?5 ORDER BY created_at DESC LIMIT 1")
    .bind(pc.pid, pc.season.id, pc.shard.id, site.loc, now)
    .first<TicketRow>();
  if (open) return c.json(ticketView(open, site.boss, { resumed: true }));
  const row = await bossRow(pc, site);
  if (row.status === 'dead') throw new ApiError(409, 'boss_dead', 'This world boss is already slain');
  const army = armyState(pc.profile, now);
  if (army.marching) throw new ApiError(409, 'marching', 'Your army is on the march');
  if (army.pos !== site.loc && !pc.shard.world.adjacent(army.pos, site.loc)) throw new ApiError(409, 'not_adjacent', 'Your army must stand next to the boss');
  const energy = energyNow(pc.profile, now);
  if (energy < BEAST_RULES.raidEnergy) throw new ApiError(409, 'no_energy', 'Not enough energy');
  let attackers: OwnedHero[] = fieldReady(await loadHeroes(pc.db, pc.season.id, pc.pid), now);
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
  // The boss as it stands now: its stored HP and severed arms.
  const { heroes: defenders, hp0 } = bossDefenders(site.boss, site.level, row.hp, JSON.parse(row.parts) as number[], shardKey(pc));
  const seed = randomU32();
  const info = staticRegion(pc.shard, site.loc);
  const setup = withConsumables(
    applyBossState(
      onlineBattleSetup(seed, { heroes: attackers.map((a) => a.hero), formations: formationsOf(pc.profile.formations), bot: false }, { heroes: defenders, formations: [...DEFAULT_FORMATIONS], bot: true }, info.site),
      hp0,
      ENCOUNTERS[site.boss].segment ?? 120,
    ),
    [consumable, null],
  );
  const id = randomToken(16);
  const expiresAt = now + BEAST_RULES.ticketMs;
  const busy = attackers.map((a) => a.hero.id);
  const ph = busy.map((_, i) => `?${i + 3}`).join(',');
  const g = `EXISTS (SELECT 1 FROM battle_tickets WHERE id = '${id}')`;
  const res = await pc.db.batch([
    pc.db
      .prepare(
        `INSERT INTO battle_tickets (id, season_id, shard_id, player_id, loc, seed, setup, attackers, defenders, defender_kind, defender_id, region_version, created_at, expires_at, consumable)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'boss', NULL, ?10, ?11, ?12, ?13
         WHERE NOT EXISTS (SELECT 1 FROM online_heroes WHERE id IN (${busy.map((_, i) => `?${i + 14}`).join(',')}) AND busy_until > ?11)
           AND (?13 IS NULL OR EXISTS (SELECT 1 FROM online_consumables WHERE season_id = ?2 AND player_id = ?4 AND consumable_id = ?13 AND qty >= 1))`,
      )
      .bind(id, pc.season.id, pc.shard.id, pc.pid, site.loc, seed, JSON.stringify(setup), JSON.stringify(attackers.map((a) => a.hero)), JSON.stringify(defenders), row.version, now, expiresAt, consumable, ...busy),
    pc.db.prepare(`UPDATE online_heroes SET busy_ticket = ?1, busy_until = ?2 WHERE id IN (${ph}) AND ${g}`).bind(id, expiresAt, ...busy),
    pc.db.prepare(`UPDATE online_profiles SET energy = ?3, energy_at = ?4, rev = rev + 1 WHERE season_id = ?1 AND player_id = ?2 AND ${g}`).bind(pc.season.id, pc.pid, energy - BEAST_RULES.raidEnergy, now),
    ...(consumable
      ? [pc.db.prepare(`UPDATE online_consumables SET qty = qty - 1 WHERE season_id = ?1 AND player_id = ?2 AND consumable_id = ?3 AND qty >= 1 AND ${g}`).bind(pc.season.id, pc.pid, consumable)]
      : []),
  ]);
  if (res[0].meta.changes !== 1) throw new ApiError(409, 'heroes_busy', 'Some heroes are already in a battle (or the consumable is gone)');
  const t = (await pc.db.prepare('SELECT * FROM battle_tickets WHERE id = ?1').bind(id).first<TicketRow>())!;
  return c.json(ticketView(t, site.boss));
});

function loadTicket(pc: PlayerCtx, id: string): Promise<TicketRow> {
  return loadOwnTicket<TicketRow>(pc.db, 'battle_tickets', id, pc.pid, 'No such raid', " AND defender_kind = 'boss'");
}

function closeTicket(pc: PlayerCtx, t: TicketRow, status: 'rejected' | 'abandoned', extra: { claim?: string; result?: string } = {}): Promise<void> {
  return closeBattleTicket(pc.db, t.id, status, pc.now, extra);
}

bosses.post('/submit', async (c) => {
  limit(c, 'raidSubmit', 20);
  const pc = await player(c);
  const body = await readJson(c, SubmitBody, LIMITS.maxBodyBytes);
  const t = await loadTicket(pc, body.ticket);
  const claimJson = JSON.stringify(body.claim);
  const replay = await ticketPreamble(t, claimJson, pc.now, 'raid', () => closeTicket(pc, t, 'abandoned'));
  if (replay) return c.json({ ...JSON.parse(replay), replayed: true });
  const setup = JSON.parse(t.setup) as BattleSetup;
  const out = await verifyBattle(setup, body, (claim, result) => closeTicket(pc, t, 'rejected', { claim, result }), 'The raid did not replay as reported; it is void');
  const s = out.summary;
  const res = await applyRaid(pc, t, out.result, s, setup, claimJson);
  if (res.killedNow) later(c, (async () => notify(c.env, await slainEvents(pc, t), { shard: pc.shard }))());
  if (!(res as { replayed?: boolean }).replayed) await emitWithFirst(c, 'battle_result', { mode: 'boss', result: outcomeOf(s.winner), ticks: s.ticks }, 'first_battle', { mode: 'boss' });
  return c.json(res);
});

/** "The boss you damaged was slain": everyone with a loot share except the killer (who sees it on screen). */
async function slainEvents(pc: PlayerCtx, t: TicketRow): Promise<NotifyEvent[]> {
  const site = worldBossSites(pc.shard.world, pc.shard.seed).find((b) => b.loc === t.loc);
  if (!site) return [];
  const rows = await pc.db
    .prepare('SELECT player_id, share, items FROM world_boss_loot WHERE season_id = ?1 AND shard_id = ?2 AND boss = ?3')
    .bind(t.season_id, t.shard_id, site.boss)
    .all<{ player_id: number; share: number; items: string }>();
  return rows.results
    .filter((r) => r.player_id !== pc.pid)
    .map((r) => {
      let items = 0;
      try {
        items = (JSON.parse(r.items) as unknown[]).length;
      } catch {
        // none
      }
      return ev(r.player_id, 'boss_slain', `boss:${t.season_id}:${t.shard_id}:${site.boss}`, { boss: site.boss, loc: site.loc, share: r.share, items });
    });
}

bosses.post('/abandon', async (c) => {
  const pc = await player(c);
  const body = await readJson(c, z.object({ ticket: z.string().regex(/^[0-9a-f]{32}$/) }), 1024);
  const t = await loadTicket(pc, body.ticket);
  requireOpenTicket(t, 'raid');
  await closeTicket(pc, t, 'abandoned');
  return c.json({ ok: true });
});

/** Applies a verified raid segment atomically (guarded by the ticket's apply nonce). */
async function applyRaid(pc: PlayerCtx, t: TicketRow, result: ReturnType<typeof replayBattle>['result'], summary: ReturnType<typeof replayBattle>['summary'], setup: BattleSetup, claimJson: string) {
  const { db: d, now } = pc;
  const site = worldBossSites(pc.shard.world, pc.shard.seed).find((b) => b.loc === t.loc)!;
  const attackers = JSON.parse(t.attackers) as Hero[];
  const defenders = JSON.parse(t.defenders) as Hero[];
  const res = resolveAttack(result, attackers, defenders, t.seed);
  const seg = segmentOutcome(setup, result);
  const startBody = setup.armies[1].units.find((u) => u.stats.boss === site.boss);
  const bodyDealt = Math.max(0, Math.round((startBody?.hp0 ?? startBody?.stats.maxHp ?? 0) - seg.body));
  const nonce = randomToken(8);
  const G = `EXISTS (SELECT 1 FROM battle_tickets WHERE id = '${t.id}' AND apply_nonce = '${nonce}')`;
  const row = await bossRow(pc, site);
  // Severed arms stay severed (an arm alive in the store but cut in this raid goes to 0).
  const stored = JSON.parse(row.parts) as number[];
  const parts = stored.map((v, i) => (seg.parts[i] !== undefined && seg.parts[i] <= 0 ? 0 : v));
  const clanId = pc.clan?.clanId ?? null;
  const stmts: D1PreparedStatement[] = [
    d.prepare("UPDATE battle_tickets SET status = 'used', apply_nonce = ?2, claim = ?3, finished_at = ?4, won = ?5 WHERE id = ?1 AND status = 'open'").bind(t.id, nonce, claimJson, now, seg.killed ? 1 : 0),
    d
      .prepare(`UPDATE online_profiles SET gold = gold + ?3, battles = battles + 1, rev = rev + 1, updated_at = ?4 WHERE season_id = ?1 AND player_id = ?2 AND ${G}`)
      .bind(t.season_id, pc.pid, res.attacker.outcome.gold, now),
  ];
  for (const id of res.attacker.dead) stmts.push(d.prepare(`DELETE FROM online_heroes WHERE id = ?1 AND busy_ticket = ?2 AND ${G}`).bind(id, t.id));
  for (const h of res.attacker.survivors) {
    const wounded = res.attacker.wounded.includes(h.id) ? now + ONLINE_RULES.woundMs : 0;
    stmts.push(
      d
        .prepare(`UPDATE online_heroes SET data = ?2, wounded_until = MAX(wounded_until, ?3), busy_ticket = NULL, busy_until = 0, updated_at = ?4 WHERE id = ?1 AND busy_ticket = ?5 AND ${G}`)
        .bind(h.id, JSON.stringify(h), wounded, now, t.id),
    );
  }
  // the damage tally (players and, through clan_id, clans)
  stmts.push(
    d
      .prepare(
        `INSERT INTO world_boss_damage (season_id, shard_id, boss, player_id, clan_id, damage, raids, updated_at) SELECT ?1, ?2, ?3, ?4, ?5, ?6, 1, ?7 WHERE ${G}
         ON CONFLICT (season_id, shard_id, boss, player_id) DO UPDATE SET damage = damage + excluded.damage, raids = raids + 1, clan_id = excluded.clan_id, updated_at = excluded.updated_at`,
      )
      .bind(t.season_id, t.shard_id, site.boss, pc.pid, clanId, seg.dealt, now),
  );
  // the shared HP, lowered relatively (concurrent raids all count); the raid that reaches 0 kills it
  stmts.push(
    d
      .prepare(
        `UPDATE world_bosses SET
           killed_at = CASE WHEN hp - ?4 <= 0 THEN ?5 ELSE killed_at END,
           killed_by = CASE WHEN hp - ?4 <= 0 THEN ?6 ELSE killed_by END,
           status = CASE WHEN hp - ?4 <= 0 THEN 'dead' ELSE status END,
           hp = MAX(0, hp - ?4), version = version + 1
         WHERE season_id = ?1 AND shard_id = ?2 AND boss = ?3 AND status = 'active' AND ${G}`,
      )
      .bind(t.season_id, t.shard_id, site.boss, bodyDealt, now, pc.pid),
  );
  // severed arms, only if nobody wrote the boss since we read it (best effort; HP above is exact)
  stmts.push(
    d
      .prepare(`UPDATE world_bosses SET parts = ?4 WHERE season_id = ?1 AND shard_id = ?2 AND boss = ?3 AND version = ?5 + 1 AND ${G}`)
      .bind(t.season_id, t.shard_id, site.boss, JSON.stringify(parts), row.version),
  );
  const summaryOut = {
    boss: site.boss,
    dealt: seg.dealt,
    bodyDealt,
    winner: summary.winner,
    ticks: summary.ticks,
    hash: summary.hash,
    loc: t.loc,
    gold: res.attacker.outcome.gold,
    attacker: { dead: res.attacker.dead, wounded: res.attacker.wounded, heroes: res.attacker.outcome.heroes },
    consumable: t.consumable ?? null,
  };
  stmts.push(d.prepare(`UPDATE battle_tickets SET result = ?2 WHERE id = ?1 AND ${G}`).bind(t.id, JSON.stringify(summaryOut)));
  stmts.push(
    d
      .prepare(
        `INSERT INTO battle_log (season_id, shard_id, kind, ref, attacker_id, defender_id, loc, winner, ticks, hash, verified, summary, created_at)
         SELECT ?1, ?2, 'raid', ?3, ?4, NULL, ?5, ?6, ?7, ?8, 1, ?9, ?10 WHERE ${G}`,
      )
      .bind(t.season_id, t.shard_id, t.id, pc.pid, t.loc, summary.winner, summary.ticks, summary.hash, JSON.stringify({ boss: site.boss, dealt: seg.dealt }), now),
  );
  const outB = await d.batch(stmts);
  if (outB[0].meta.changes !== 1) {
    const again = await loadTicket(pc, t.id);
    if (again.status === 'used' && again.result && again.claim === claimJson) return { ...JSON.parse(again.result), replayed: true };
    throw new ApiError(409, 'ticket_used', 'This raid was already reported');
  }
  const after = (await d.prepare('SELECT * FROM world_bosses WHERE season_id = ?1 AND shard_id = ?2 AND boss = ?3').bind(t.season_id, t.shard_id, site.boss).first<BossRow>())!;
  if (after.status === 'dead') await splitBossLoot(pc, after);
  const view = await bossView(pc, site);
  const full = { ...summaryOut, killed: after.status === 'dead', killedNow: after.status === 'dead' && after.killed_by === pc.pid && after.killed_at === now, bossView: view };
  await d.prepare('UPDATE battle_tickets SET result = ?2 WHERE id = ?1').bind(t.id, JSON.stringify(full)).run();
  return full;
}
