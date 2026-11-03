-- Paths rework (W-83, W-86, W-95; docs/WAR.md "Starting a game"): the start ends with a path, kept per player and season
-- on his membership row, and with a family for a warrior. No live users: every player's war data goes and everyone
-- starts over (precedent 0012_map_v3_reset.sql). Accounts and everything outside the war stay. Region rooms saved before
-- this start over on their own (server/src/war/regions.ts regionVersion).
ALTER TABLE war_alliance_members ADD COLUMN path TEXT CHECK (path IN ('warrior', 'builder', 'trader'));
ALTER TABLE war_alliance_members ADD COLUMN family TEXT;

DELETE FROM war_crown_shares;
DELETE FROM war_crown_orders;
DELETE FROM war_crown_ballots;
DELETE FROM war_crown_votes;
DELETE FROM war_crown_offices;
DELETE FROM war_crown_pacts;
DELETE FROM war_crown_log;
DELETE FROM war_crowns;
DELETE FROM war_settlement_log;
DELETE FROM war_settlement_offers;
DELETE FROM war_settlement_members;
DELETE FROM war_settlements;
DELETE FROM war_mastery_done;
DELETE FROM war_mastery;
DELETE FROM war_task_tally;
DELETE FROM war_tasks;
DELETE FROM war_favour_log;
DELETE FROM war_favour;
DELETE FROM war_work_gifts;
DELETE FROM war_works;
DELETE FROM war_contracts;
DELETE FROM war_letters;
DELETE FROM war_deals;
DELETE FROM war_fills;
DELETE FROM war_offers;
DELETE FROM war_gifts;
DELETE FROM war_crafts;
DELETE FROM war_fights;
DELETE FROM war_trophies;
DELETE FROM war_memorial;
DELETE FROM war_tunnel;
DELETE FROM war_upkeep;
DELETE FROM war_items;
DELETE FROM war_persons;
DELETE FROM war_goods;
DELETE FROM war_holders;
DELETE FROM war_region_holds;
DELETE FROM war_region_state;
DELETE FROM war_boss_kills;
DELETE FROM war_player_stats;
DELETE FROM war_season_stats;
DELETE FROM war_trade_score;
DELETE FROM war_peace_score;
DELETE FROM war_board_seen;
DELETE FROM war_seen;
DELETE FROM war_cosmetics;
DELETE FROM war_season_results;
DELETE FROM war_alliance_clans;
DELETE FROM war_alliance_members;
