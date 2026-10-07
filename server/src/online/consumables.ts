/**
 * Consumable inventory of the season (/api/online/consumables) and the
 * out-of-battle ones (healing salve, march rations). Battle consumables are
 * picked with `consumable` on POST /api/online/attack/start or on a duel
 * challenge / challenge_reply (at most one per battle) and spent there.
 * Buying them: POST /api/economy/buy.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { readJson } from '../body';
import type { AppEnv } from '../env';
import { ApiError, badRequest } from '../errors';
import { requireAuth } from '../middleware';
import { CONSUMABLE_IDS, CONSUMABLES, type ConsumableId } from '../../../src/data/consumables';
import { limit, player } from './context';
import { armyState, revBatch, revGuard } from './store';
import { utcDay } from '../economy/routes';

export const consumables = new Hono<AppEnv>();
consumables.use('*', requireAuth);

export async function consumableInventory(d: D1Database, season: number, pid: number): Promise<Partial<Record<ConsumableId, number>>> {
  const r = await d
    .prepare('SELECT consumable_id, qty FROM online_consumables WHERE season_id = ?1 AND player_id = ?2 AND qty > 0')
    .bind(season, pid)
    .all<{ consumable_id: ConsumableId; qty: number }>();
  return Object.fromEntries(r.results.map((x) => [x.consumable_id, x.qty]));
}

/** SQL: the player holds at least one of a consumable this season (params ?1 season, ?2 player, `idParam`). */
export function holdsSql(idParam: string): string {
  return `EXISTS (SELECT 1 FROM online_consumables WHERE season_id = ?1 AND player_id = ?2 AND consumable_id = ${idParam} AND qty >= 1)`;
}

consumables.get('/', async (c) => {
  const pc = await player(c);
  const day = utcDay(pc.now);
  const bought = await pc.db
    .prepare('SELECT consumable_id, bought FROM consumable_daily WHERE player_id = ?1 AND day = ?2')
    .bind(pc.pid, day)
    .all<{ consumable_id: string; bought: number }>();
  const today = Object.fromEntries(bought.results.map((x) => [x.consumable_id, x.bought]));
  return c.json({
    inventory: await consumableInventory(pc.db, pc.season.id, pc.pid),
    day,
    caps: Object.fromEntries(CONSUMABLE_IDS.map((id) => [id, { cap: CONSUMABLES[id].dailyCap, bought: today[id] ?? 0 }])),
  });
});

const UseBody = z.object({ id: z.enum(CONSUMABLE_IDS as [ConsumableId, ...ConsumableId[]]) });

/** Uses a healing salve (shortens every wound) or march rations (speeds up the current march). */
consumables.post('/use', async (c) => {
  limit(c, 'consume', 30);
  const pc = await player(c);
  const body = await readJson(c, UseBody, 1024);
  const def = CONSUMABLES[body.id];
  if (def.use === 'battle') throw badRequest('Battle consumables are chosen when an attack or a duel starts');
  const p = pc.profile;
  const g = revGuard(pc.season.id, pc.pid, p.rev + 1);
  const stmts: D1PreparedStatement[] = [];
  let march: string | null = p.march;
  if (def.use === 'march') {
    const army = armyState(p, pc.now);
    if (!army.marching || !army.march) throw new ApiError(409, 'not_marching', 'Your army is not on the march');
    const mult = def.effect.marchMult ?? 1;
    const at = army.march.at.map((t) => (t > pc.now ? Math.round(pc.now + (t - pc.now) * mult) : t));
    march = JSON.stringify({ path: army.march.path, at });
  } else {
    const wounded = await pc.db.prepare('SELECT COUNT(*) AS n FROM online_heroes WHERE season_id = ?1 AND player_id = ?2 AND wounded_until > ?3').bind(pc.season.id, pc.pid, pc.now).first<{ n: number }>();
    if (!wounded?.n) throw new ApiError(409, 'nobody_wounded', 'None of your heroes is wounded');
  }
  stmts.push(
    pc.db
      .prepare(`UPDATE online_profiles SET march = ?3, rev = rev + 1, updated_at = ?4 WHERE season_id = ?1 AND player_id = ?2 AND rev = ?5 AND ${holdsSql('?6')}`)
      .bind(pc.season.id, pc.pid, march, pc.now, p.rev, body.id),
    pc.db.prepare(`UPDATE online_consumables SET qty = qty - 1 WHERE season_id = ?1 AND player_id = ?2 AND consumable_id = ?3 AND qty >= 1 AND ${g}`).bind(pc.season.id, pc.pid, body.id),
  );
  if (def.use === 'heal') {
    stmts.push(
      pc.db
        .prepare(`UPDATE online_heroes SET wounded_until = MAX(0, wounded_until - ?3) WHERE season_id = ?1 AND player_id = ?2 AND wounded_until > ?4 AND ${g}`)
        .bind(pc.season.id, pc.pid, def.effect.healMs ?? 0, pc.now),
    );
  }
  try {
    await revBatch(pc.db, stmts);
  } catch (e) {
    const inv = await consumableInventory(pc.db, pc.season.id, pc.pid);
    if (!inv[body.id]) throw new ApiError(409, 'none_left', `You have no ${def.name.toLowerCase()}`);
    throw e;
  }
  return c.json({ used: body.id, inventory: await consumableInventory(pc.db, pc.season.id, pc.pid), march: march ? JSON.parse(march) : null });
});
