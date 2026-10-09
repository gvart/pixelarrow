-- Items step 3: where set pieces and named legendaries come from
-- (docs/ITEMS.md "Where items come from", docs/DUELS.md "Spoils").
--
-- Bad-luck protection: beast and world-boss chests in a row without a
-- legendary, per player and track ('war': lairs and world bosses, kept across
-- war seasons; 'duel': ladder boss floors). At 8 the next chest is legendary
-- and the count resets (src/game/sources.ts pityChest). No row: 0.
CREATE TABLE loot_pity (
  player_id   INTEGER NOT NULL REFERENCES players(id),
  track       TEXT NOT NULL,                           -- war | duel
  count       INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (player_id, track)
);

-- World-boss chests: one per contributor with at least 5% of the damage of a
-- slain boss (a legendary set piece, the boss's named item or an epic), on top
-- of the hoard split in world_boss_loot. kind: set | named | epic | legendary.
-- At most one named item per player and boss per season (kind = 'named').
CREATE TABLE world_boss_chests (
  season_id   INTEGER NOT NULL,
  shard_id    INTEGER NOT NULL,
  boss        TEXT NOT NULL,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  kind        TEXT NOT NULL,
  item        TEXT NOT NULL,                           -- JSON Item (also put in online_items)
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (season_id, shard_id, boss, player_id)
);
CREATE INDEX world_boss_chests_named ON world_boss_chests (player_id, season_id, kind);

-- Per-duel spoils: the UTC day of the player's last first-ranked-win spoil
-- (the first ranked win of a day always drops an item). -1: never.
ALTER TABLE duel_profiles ADD COLUMN spoils_day INTEGER NOT NULL DEFAULT -1;

-- Ranked season rewards: Strategos and Legend (live) pick a piece of a set
-- (pick = the set id); picked = the JSON Item once chosen. Older rows: NULL.
ALTER TABLE duel_season_rewards ADD COLUMN pick TEXT;
ALTER TABLE duel_season_rewards ADD COLUMN picked TEXT;
