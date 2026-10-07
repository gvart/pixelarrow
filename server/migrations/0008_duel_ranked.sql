-- Live ranked and unranked duels (docs/DUELS.md "Ranked live", slice 3):
-- Glicko-2 ratings, placements and leagues, the abandon cooldown, and one row
-- per live match. Shared rules: src/duel/rating.ts.
--
-- Ratings are season independent: monthly seasons (slice 4) will soft-reset
-- them and pay by peak league. `ladder` keeps a separate rating per format
-- ('live' now; 'async' for the defence ladder of slice 4).

CREATE TABLE duel_ratings (
  player_id   INTEGER NOT NULL REFERENCES players(id),
  ladder      TEXT NOT NULL DEFAULT 'live',            -- live | async (later)
  rating      REAL NOT NULL DEFAULT 1500,
  rd          REAL NOT NULL DEFAULT 350,
  vol         REAL NOT NULL DEFAULT 0.06,
  games       INTEGER NOT NULL DEFAULT 0,              -- rated games; the first 10 are placements
  wins        INTEGER NOT NULL DEFAULT 0,
  losses      INTEGER NOT NULL DEFAULT 0,
  draws       INTEGER NOT NULL DEFAULT 0,
  league      TEXT,                                    -- e.g. 'gold:2' (league:division), NULL during placements
  peak        REAL,                                    -- best rating after placements (season rewards by peak league)
  last_match  TEXT,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (player_id, ladder)
);
CREATE INDEX idx_duel_ratings_board ON duel_ratings(ladder, rating DESC);

-- Leaving matches: abandons inside the last 24 h (JSON times) and the queue
-- cooldown they earned. strikes/strike_at: cooldowns given; a repeat inside
-- 24 h doubles the next one.
CREATE TABLE duel_queue_state (
  player_id      INTEGER PRIMARY KEY REFERENCES players(id),
  abandons       TEXT NOT NULL DEFAULT '[]',
  cooldown_until INTEGER NOT NULL DEFAULT 0,
  strikes        INTEGER NOT NULL DEFAULT 0,
  strike_at      INTEGER NOT NULL DEFAULT 0,
  updated_at     INTEGER NOT NULL
);

-- One row per ranked or unranked match: created live by the MatchmakerDO,
-- settled once by its DuelDO (status live -> done | void, guarded by
-- apply_nonce like a ladder ticket). orders: the whole sealed order log the
-- server replayed; result: JSON {side0, side1} MatchReport for each player.
CREATE TABLE duel_matches (
  id            TEXT PRIMARY KEY,
  mode          TEXT NOT NULL,                         -- ranked | unranked
  seed          INTEGER NOT NULL,
  player_a      INTEGER NOT NULL REFERENCES players(id), -- side 0
  player_b      INTEGER NOT NULL REFERENCES players(id), -- side 1
  setup         TEXT NOT NULL,
  teams         TEXT NOT NULL,                         -- JSON [Hero[], Hero[]] as they went into battle
  status        TEXT NOT NULL DEFAULT 'live',          -- live | done | void
  orders        TEXT,
  deploy_orders INTEGER,
  winner        INTEGER,
  ending        TEXT,                                  -- battle | forfeit | void
  ticks         INTEGER,
  hash          TEXT,
  verified      INTEGER,
  delta_a       REAL,                                  -- rating change (ranked)
  delta_b       REAL,
  result        TEXT,
  apply_nonce   TEXT,
  created_at    INTEGER NOT NULL,
  finished_at   INTEGER
);
CREATE INDEX idx_duel_matches_a ON duel_matches(player_a, status);
CREATE INDEX idx_duel_matches_b ON duel_matches(player_b, status);
