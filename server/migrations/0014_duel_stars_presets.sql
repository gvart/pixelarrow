-- Duels hub redesign (docs/DUELS.md "Ladder stars and chapters", "Presets").
--
-- Ladder stars: the best stars (1..3) a player earned on each won floor
-- (src/duel/ladder.ts ladderStars). Only raised, never lowered. Floors
-- cleared before stars existed have no row and count as 1 star
-- (starsByFloor: no row and floor <= duel_profiles.ladder_cleared).
CREATE TABLE duel_ladder_stars (
  player_id   INTEGER NOT NULL REFERENCES players(id),
  floor       INTEGER NOT NULL,                        -- 1..50
  stars       INTEGER NOT NULL,                        -- 1..3
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (player_id, floor)
);

-- Chapter chests (5 chapters of 10 floors; tiers 1..3 at 10/20/30 stars),
-- claimed once each. glory / item: what the claim paid (a repeated claim
-- answers with them).
CREATE TABLE duel_ladder_chests (
  player_id   INTEGER NOT NULL REFERENCES players(id),
  chapter     INTEGER NOT NULL,                        -- 1..5
  tier        INTEGER NOT NULL,                        -- 1..3
  glory       INTEGER NOT NULL,
  item        TEXT,                                    -- JSON Item (tier 3) or NULL
  claimed_at  INTEGER NOT NULL,
  PRIMARY KEY (player_id, chapter, tier)
);

-- Presets: duel_loadouts (0010) now holds up to 5 rows per player (slot
-- 1..5) and a preset exists only while its row does (create, duplicate,
-- delete). Slots 2..3 that were never saved simply do not exist. Nothing to
-- migrate: every profile has its slot-1 row (0010 or the profile's creation).
