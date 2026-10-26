-- The campaign, duels, the shop, the pass and the Telegram bot are removed: the game is only the war.
-- Their tables go. Kept: players and accounts (0017, 0018, 0020), ops (0006), public stats (0019), the
-- war (0021+), the online season and clans (the war's seasons and clan membership), battle_log and
-- season_rewards (read by the public snapshot), and the tables the account-link conflict check still
-- reads (saves, purchases, entitlements, wallets, drachmae_ledger, online_profiles, duel_profiles,
-- duel_ratings, duel_matches, notify_settings, notify_outbox, bot_state, support_requests).
-- No backward compatibility (no live users). Children before parents (foreign keys).
DROP TABLE IF EXISTS online_items;
DROP TABLE IF EXISTS online_heroes;
DROP TABLE IF EXISTS online_consumables;
DROP TABLE IF EXISTS consumable_daily;
DROP TABLE IF EXISTS shop_orders;
DROP TABLE IF EXISTS cosmetic_loadout;
DROP TABLE IF EXISTS pass_claims;
DROP TABLE IF EXISTS pass_progress;
DROP TABLE IF EXISTS notify_log;
DROP TABLE IF EXISTS bot_meta;
DROP TABLE IF EXISTS duel_heroes;
DROP TABLE IF EXISTS duel_items;
DROP TABLE IF EXISTS duel_orders;
DROP TABLE IF EXISTS duel_tickets;
DROP TABLE IF EXISTS duel_queue_state;
DROP TABLE IF EXISTS duel_loadouts;
DROP TABLE IF EXISTS duel_defences;
DROP TABLE IF EXISTS duel_attacks;
DROP TABLE IF EXISTS duel_season_rewards;
DROP TABLE IF EXISTS duel_ladder_stars;
DROP TABLE IF EXISTS duel_ladder_chests;
DROP TABLE IF EXISTS loot_pity;
