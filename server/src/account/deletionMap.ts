/**
 * What account deletion does to every table (ADR-0009 §7, M-ID-5). Every table
 * of the schema has an entry, and every column that can hold a players.id or a
 * Telegram user id is named by it; test/deletion-map.test.ts checks this
 * against the migrated schema, so a new table or player column fails the
 * build until it is classified here.
 *
 * Rules:
 * - delete          rows of the player are hard-deleted (`pid` and `tg` columns
 *                   are matched; `via` names custom handling in delete.ts)
 * - keep_tombstone  kept for bookkeeping, audit or moderation, pointing only at
 *                   the tombstone id; no personal data in them
 * - shared_history  other players' history (battles, matches, boards): kept,
 *                   shown as "Deleted player"
 * - release         the player's hold on a shared structure is let go (columns
 *                   reset), the row stays
 * - tombstone       the players row itself, stripped of personal fields
 * - not_player_keyed  holds no player id (ban_tombstones holds only hashes)
 * - derived         rebuilt from eligible players only (the public snapshot)
 * - dev_only        written only with DEV_EMAIL=1 locally, never in production
 */

type DeletionRule = 'delete' | 'keep_tombstone' | 'shared_history' | 'release' | 'tombstone' | 'not_player_keyed' | 'derived' | 'dev_only';

interface TableRule {
  rule: DeletionRule;
  /** Columns holding the player's id that this rule acts on. */
  pid?: string[];
  /** Columns holding the player's Telegram user id that this rule acts on. */
  tg?: string[];
  /** Player columns left as they are (they point at another player's row, or at the tombstone). */
  kept?: string[];
  /** Custom handling in delete.ts (cascades, keys, joins). */
  via?: string;
}

/** Ordered: children before parents, so the hard-delete batch satisfies foreign keys. */
export const DELETION_MAP: Record<string, TableRule> = {
  // Identities and sessions: step 'revoke'.
  sessions: { rule: 'delete', pid: ['player_id'] },
  password_hashes: { rule: 'delete', via: 'cascade from auth_identities' },
  auth_identities: { rule: 'delete', pid: ['player_id'] },
  email_tokens: { rule: 'delete', pid: ['player_id'], via: 'also by the player’s email addresses' },
  link_codes: { rule: 'delete', pid: ['player_id'], tg: ['telegram_id'] },
  link_conflicts: { rule: 'delete', pid: ['player_id', 'other_player_id'] },
  auth_throttle: { rule: 'delete', via: 'keys of the player’s addresses and id' },
  bot_state: { rule: 'delete', tg: ['telegram_id'] },
  support_requests: { rule: 'delete', pid: ['player_id'], tg: ['telegram_id'] },

  // Shared structures: step 'leave'.
  market_listings: { rule: 'shared_history', kept: ['seller_id', 'buyer_id'], via: 'active listings of the seller are removed' },
  online_regions: { rule: 'release', pid: ['owner_id', 'siege_by'], via: 'owned regions turn neutral, sieges reset' },
  online_garrisons: { rule: 'delete', pid: ['player_id'], via: 'also others’ heroes guarding the player’s regions' },
  clan_members: { rule: 'delete', pid: ['player_id'], via: 'leadership passes on; an empty clan is disbanded' },
  clan_invites: { rule: 'delete', pid: ['created_by'] },
  duel_queue_state: { rule: 'delete', pid: ['player_id'] },

  // Personal and gameplay rows: step 'purge'.
  saves: { rule: 'delete', pid: ['player_id'] },
  online_camp_buildings: { rule: 'delete', via: 'the buildings of the player’s camps' },
  online_camps: { rule: 'delete', pid: ['player_id'] },
  online_heroes: { rule: 'delete', pid: ['player_id'] },
  online_items: { rule: 'delete', pid: ['player_id'] },
  online_consumables: { rule: 'delete', pid: ['player_id'] },
  online_profiles: { rule: 'delete', pid: ['player_id'] },
  consumable_daily: { rule: 'delete', pid: ['player_id'] },
  battle_tickets: { rule: 'delete', pid: ['player_id'], kept: ['defender_id'] },
  merchant_daily: { rule: 'delete', pid: ['player_id'] },
  merchant_orders: { rule: 'delete', pid: ['player_id'], kept: ['holder_id'] },
  loot_pity: { rule: 'delete', pid: ['player_id'] },
  duel_profiles: { rule: 'delete', pid: ['player_id'] },
  duel_heroes: { rule: 'delete', pid: ['player_id'] },
  duel_items: { rule: 'delete', pid: ['player_id'] },
  duel_tickets: { rule: 'delete', pid: ['player_id'] },
  duel_orders: { rule: 'delete', pid: ['player_id'] },
  duel_loadouts: { rule: 'delete', pid: ['player_id'] },
  duel_ladder_stars: { rule: 'delete', pid: ['player_id'] },
  duel_ladder_chests: { rule: 'delete', pid: ['player_id'] },
  duel_defences: { rule: 'delete', pid: ['player_id'] },
  duel_ratings: { rule: 'delete', pid: ['player_id'] },
  wallets: { rule: 'delete', pid: ['player_id'] },
  cosmetic_loadout: { rule: 'delete', pid: ['player_id'] },
  pass_progress: { rule: 'delete', pid: ['player_id'] },
  pass_claims: { rule: 'delete', pid: ['player_id'] },
  shop_orders: { rule: 'delete', pid: ['player_id'] },
  world_boss_chests: { rule: 'delete', pid: ['player_id'] },
  world_boss_loot: { rule: 'delete', pid: ['player_id'] },
  notify_settings: { rule: 'delete', pid: ['player_id'] },
  notify_outbox: { rule: 'delete', pid: ['player_id'] },
  notify_log: { rule: 'delete', pid: ['player_id'] },
  analytics_milestones: { rule: 'delete', pid: ['player_id'] },
  client_errors: { rule: 'delete', pid: ['last_player'] },
  war_items: { rule: 'delete', pid: ['player_id'] },
  // captor_pid: another player's captive held by this one stays held at the tombstone and walks home on his timer
  war_persons: { rule: 'delete', pid: ['player_id'], kept: ['captor_pid'] },
  war_upkeep: { rule: 'delete', pid: ['player_id'] },
  war_memorial: { rule: 'delete', pid: ['player_id'] },
  war_pools: { rule: 'delete', pid: ['player_id'] },
  war_stock: { rule: 'delete', pid: ['player_id'] },
  display_name_history: { rule: 'delete', pid: ['player_id'], via: 'one row is written back at the tombstone step so the freed name stays held 30 days' },

  // Kept against the tombstone.
  purchases: { rule: 'keep_tombstone', kept: ['player_id'] },
  entitlements: { rule: 'keep_tombstone', kept: ['player_id'] },
  drachmae_ledger: { rule: 'keep_tombstone', kept: ['player_id'] },
  market_audit: { rule: 'keep_tombstone', kept: ['actor_id'] },
  admin_audit: { rule: 'keep_tombstone', kept: ['player_id'] },
  deletion_jobs: { rule: 'keep_tombstone', kept: ['player_id'] },

  // Other players' history.
  battle_log: { rule: 'shared_history', kept: ['attacker_id', 'defender_id'] },
  duel_matches: { rule: 'shared_history', kept: ['player_a', 'player_b'] },
  duel_attacks: { rule: 'shared_history', kept: ['attacker', 'defender'] },
  world_boss_damage: { rule: 'shared_history', kept: ['player_id'] },
  world_bosses: { rule: 'shared_history', kept: ['killed_by'] },
  season_rewards: { rule: 'shared_history', kept: ['player_id'] },
  duel_season_rewards: { rule: 'shared_history', kept: ['player_id'] },
  clans: { rule: 'shared_history', kept: ['created_by'] },

  players: { rule: 'tombstone' },

  ban_tombstones: { rule: 'not_player_keyed' },
  bot_meta: { rule: 'not_player_keyed' },
  online_seasons: { rule: 'not_player_keyed' },
  online_shards: { rule: 'not_player_keyed' },
  stats_counters: { rule: 'not_player_keyed' },
  war_fights: { rule: 'not_player_keyed' },
  public_snapshot: { rule: 'derived' },
  dev_outbox: { rule: 'dev_only' },
};

export interface SchemaColumn {
  table: string;
  column: string;
  /** The table a foreign key on this column points at, if any. */
  references: string | null;
}

/** Column names that hold a player id without a foreign key saying so. */
const PID_NAME = /^(player_id|player_[ab]|other_player_id|last_player|(attacker|defender|seller|buyer|holder|owner)(_id)?|actor_id|created_by|killed_by|siege_by)$/;
/** Column names that hold a Telegram user id (not a payment charge id). */
const TG_NAME = /^telegram_(id|user|chat)/;

/** The columns that can hold a player id or a Telegram user id. */
export function playerColumnsOf(cols: SchemaColumn[]): SchemaColumn[] {
  return cols.filter((c) => c.references === 'players' || PID_NAME.test(c.column) || TG_NAME.test(c.column));
}

/** What the schema has that DELETION_MAP doesn't classify; empty when complete. */
export function unclassified(cols: SchemaColumn[]): string[] {
  const out = new Set<string>();
  for (const c of cols) if (!DELETION_MAP[c.table]) out.add(`${c.table}: not in DELETION_MAP`);
  for (const c of playerColumnsOf(cols)) {
    const r = DELETION_MAP[c.table];
    if (!r || c.table === 'players') continue;
    if (![...(r.pid ?? []), ...(r.tg ?? []), ...(r.kept ?? [])].includes(c.column)) out.add(`${c.table}.${c.column}: player column not in DELETION_MAP`);
  }
  return [...out].sort();
}

/** The tables whose matching rows the purge step hard-deletes, in map order. */
export function purgeTables(): [string, TableRule][] {
  return Object.entries(DELETION_MAP).filter(([, r]) => r.rule === 'delete' && ((r.pid?.length ?? 0) > 0 || (r.tg?.length ?? 0) > 0));
}
