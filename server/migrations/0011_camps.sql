-- Online camp plots (docs/DESIGN_V2.md "Camp", rules in src/online/rules.ts
-- CAMP_RULES / CAMP_BUILDINGS, logic in src/online/camps.ts).
--
-- Every player's home region is a camp (made when they join); up to
-- CAMP_RULES.maxForward forward camps go on campPlot regions they hold. A camp
-- whose region is lost (captured, or abandoned back to the neutrals) is razed:
-- its rows are deleted with the capture.

CREATE TABLE online_camps (
  season_id   INTEGER NOT NULL,
  shard_id    INTEGER NOT NULL,
  loc         INTEGER NOT NULL,                   -- region id on the shard's map
  player_id   INTEGER NOT NULL REFERENCES players(id),
  home        INTEGER NOT NULL DEFAULT 0,         -- the home camp (never razed: homes cannot be attacked)
  rested_at   INTEGER,                            -- last rest of the army here (cooldown)
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (season_id, shard_id, loc)
);
CREATE INDEX idx_camps_player ON online_camps(season_id, player_id);

-- Buildings in a camp's slots. `level` is the level the building has or is
-- being raised to; it is reached at `done_at` (construction finishes lazily:
-- before done_at the building works at level - 1). One kind per camp.
CREATE TABLE online_camp_buildings (
  season_id   INTEGER NOT NULL,
  shard_id    INTEGER NOT NULL,
  loc         INTEGER NOT NULL,
  slot        INTEGER NOT NULL,                   -- row * CAMP_RULES.cols + col
  kind        TEXT NOT NULL,                      -- palisade | granary | forge | barracks | watchtower
  level       INTEGER NOT NULL,
  done_at     INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (season_id, shard_id, loc, slot),
  UNIQUE (season_id, shard_id, loc, kind)
);
