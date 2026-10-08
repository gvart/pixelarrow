-- Duels slice 4 (docs/DUELS.md "Ranked async", seasons, leaderboards):
-- saved team loadouts, the async defence ladder with its defence log, monthly
-- ranked seasons (soft reset, rewards by peak league) and the season columns
-- the leaderboards read. Shared rules: src/duel/season.ts.

-- Seasons are UTC calendar months, numbered as months since January 1970
-- (src/duel/season.ts seasonId). A rating row belongs to one season; the
-- first access in a later season rolls it over once (soft reset, rewards),
-- guarded by roll_nonce. played_at: the last rated game (RD grows with
-- inactivity, one Glicko-2 rating period per day). Defences are counted
-- apart from games (placements come from your own matches and attacks).
ALTER TABLE duel_ratings ADD COLUMN season INTEGER NOT NULL DEFAULT 0;
ALTER TABLE duel_ratings ADD COLUMN played_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE duel_ratings ADD COLUMN defences INTEGER NOT NULL DEFAULT 0;
ALTER TABLE duel_ratings ADD COLUMN defence_wins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE duel_ratings ADD COLUMN roll_nonce TEXT;
-- what slice 3 rated counts for the season running now
UPDATE duel_ratings SET season = (CAST(strftime('%Y', 'now') AS INTEGER) - 1970) * 12 + CAST(strftime('%m', 'now') AS INTEGER) - 1, played_at = updated_at;
CREATE INDEX idx_duel_ratings_season ON duel_ratings(ladder, season, rating DESC);

-- Saved teams: up to 3 per player (slot 1..3). duel_profiles.loadout is the
-- one the Team tab edits; lo_ladder / lo_arena / lo_defence say which one
-- fights on the ladder, in the arena (live matches and async attacks) and
-- defends. duel_profiles.team / formations (0007) are no longer read: they
-- move into loadout 1 here.
CREATE TABLE duel_loadouts (
  player_id   INTEGER NOT NULL REFERENCES players(id),
  slot        INTEGER NOT NULL,                        -- 1..3
  name        TEXT,                                    -- NULL: the default name
  team        TEXT NOT NULL,                           -- JSON hero ids
  formations  TEXT NOT NULL,                           -- JSON FormationType[4]
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (player_id, slot)
);
INSERT INTO duel_loadouts (player_id, slot, name, team, formations, updated_at) SELECT player_id, 1, NULL, team, formations, updated_at FROM duel_profiles;
ALTER TABLE duel_profiles ADD COLUMN loadout INTEGER NOT NULL DEFAULT 1;
ALTER TABLE duel_profiles ADD COLUMN lo_ladder INTEGER NOT NULL DEFAULT 1;
ALTER TABLE duel_profiles ADD COLUMN lo_arena INTEGER NOT NULL DEFAULT 1;
ALTER TABLE duel_profiles ADD COLUMN lo_defence INTEGER NOT NULL DEFAULT 1;

-- The defence the server bot plays: a snapshot of the defence loadout taken
-- when it is set or edited (fits the ranked budget, perfect gear). A row here
-- puts the player in the async pool.
CREATE TABLE duel_defences (
  player_id   INTEGER PRIMARY KEY REFERENCES players(id),
  heroes      TEXT NOT NULL,                           -- JSON Hero[]
  formations  TEXT NOT NULL,
  points      INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Async attacks: a ticket like the ladder's (the server fixes the seed and
-- both armies, replays the client's order log), then the defence log. The
-- row keeps what a replay needs (setup, orders, deploy_orders) and both
-- sides' rating changes and Glory. Settled once: status open -> used with a
-- fresh apply_nonce guarding every other write.
CREATE TABLE duel_attacks (
  id            TEXT PRIMARY KEY,
  attacker      INTEGER NOT NULL REFERENCES players(id),
  defender      INTEGER NOT NULL REFERENCES players(id),
  day           INTEGER NOT NULL,                      -- UTC day of the start (the daily cap)
  seed          INTEGER NOT NULL,
  setup         TEXT NOT NULL,
  team          TEXT NOT NULL,                         -- JSON Hero[] of the attacker as they went in
  defence       TEXT NOT NULL,                         -- JSON Hero[] of the defence the bot played
  status        TEXT NOT NULL DEFAULT 'open',          -- open | used | rejected | abandoned
  claim         TEXT,
  orders        TEXT,
  deploy_orders INTEGER,
  winner        INTEGER,
  ticks         INTEGER,
  delta_a       REAL,
  delta_d       REAL,
  glory_a       INTEGER,
  glory_d       INTEGER,
  result        TEXT,                                  -- the attacker's report
  apply_nonce   TEXT,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  finished_at   INTEGER
);
CREATE INDEX idx_duel_attacks_attacker ON duel_attacks(attacker, created_at);
CREATE INDEX idx_duel_attacks_defender ON duel_attacks(defender, finished_at);

-- Season rewards, one row per player, season and ladder (paid once, by the
-- rollover that inserted the row). seen_at: the client showed the popup.
CREATE TABLE duel_season_rewards (
  player_id   INTEGER NOT NULL REFERENCES players(id),
  season      INTEGER NOT NULL,
  ladder      TEXT NOT NULL,                           -- live | async
  league      TEXT NOT NULL,                           -- peak league id (the title)
  peak        REAL NOT NULL,
  glory       INTEGER NOT NULL,
  cosmetic    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  seen_at     INTEGER,
  PRIMARY KEY (player_id, season, ladder)
);
