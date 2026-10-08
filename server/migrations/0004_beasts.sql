-- Mythical beasts: lair kills (the beast returns after a long timer) and the
-- shard's world bosses with shared HP, the damage tally per player / clan and
-- the loot split by damage share. Lairs (map regions of kind 'lair') and boss
-- sites are a pure function of the map and the shard seed (src/online/lairs.ts):
-- nothing static is stored. When a lair's beast was slain lives in
-- online_regions.beast_slain_at (0002_online.sql).

-- One row per world boss of a shard, created on first sight. hp is the body's
-- HP; parts the HP of each arm (JSON number[]). Raids subtract relatively, so
-- concurrent raids all count; version bumps on every write.
CREATE TABLE world_bosses (
  season_id   INTEGER NOT NULL,
  shard_id    INTEGER NOT NULL,
  boss        TEXT NOT NULL,                      -- kraken | titan
  loc         INTEGER NOT NULL,                   -- the region it stands in
  level       INTEGER NOT NULL,
  hp          INTEGER NOT NULL,
  max_hp      INTEGER NOT NULL,
  parts       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',     -- active | dead
  version     INTEGER NOT NULL DEFAULT 0,
  killed_at   INTEGER,
  killed_by   INTEGER,                            -- player whose raid struck the last blow
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (season_id, shard_id, boss)
);

-- Damage dealt to a world boss, per player (with the clan they raided for).
CREATE TABLE world_boss_damage (
  season_id   INTEGER NOT NULL,
  shard_id    INTEGER NOT NULL,
  boss        TEXT NOT NULL,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  clan_id     INTEGER,
  damage      INTEGER NOT NULL DEFAULT 0,
  raids       INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (season_id, shard_id, boss, player_id)
);
CREATE INDEX idx_boss_damage ON world_boss_damage(season_id, shard_id, boss, damage);

-- The split of a slain boss's hoard: one row per player (idempotent: a second
-- split inserts nothing).
CREATE TABLE world_boss_loot (
  season_id   INTEGER NOT NULL,
  shard_id    INTEGER NOT NULL,
  boss        TEXT NOT NULL,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  share       REAL NOT NULL,
  items       TEXT NOT NULL,                      -- JSON Item[] (also put in online_items)
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (season_id, shard_id, boss, player_id)
);
