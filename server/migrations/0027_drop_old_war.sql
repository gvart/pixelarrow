-- W-01 (docs/impl/global-war-rebuild.md): the old shard / route-graph war is deleted with M4. Its map state, camps,
-- marketplace, merchants, world bosses and attack tickets go; the online season, profiles, heroes, items,
-- consumables, clans and season_rewards stay (economy, the pass and the war world use them). battle_log stays as
-- history behind the public battle counter. No backward compatibility (no live users).
DROP TABLE IF EXISTS online_garrisons;
DROP TABLE IF EXISTS online_camp_buildings;
DROP TABLE IF EXISTS online_camps;
DROP TABLE IF EXISTS online_regions;
DROP TABLE IF EXISTS online_shards;
DROP TABLE IF EXISTS market_audit;
DROP TABLE IF EXISTS market_listings;
DROP TABLE IF EXISTS merchant_orders;
DROP TABLE IF EXISTS merchant_daily;
DROP TABLE IF EXISTS world_boss_chests;
DROP TABLE IF EXISTS world_boss_loot;
DROP TABLE IF EXISTS world_boss_damage;
DROP TABLE IF EXISTS world_bosses;
DROP TABLE IF EXISTS battle_tickets;
DROP TABLE IF EXISTS _keep_merchant_orders;
