-- W-61 peaceful play (docs/WAR.md "Peaceful play"): rules in server/src/war/contracts.ts (build and guard contracts),
-- server/src/war/works.ts (alliance works) and server/src/war/peace.ts (season stats, peace score, titles).
--   war_contracts: two more kinds. build: labour (worker-seconds, `n`) by the taker's men on the poster's site `site` in
--                  `region`, its reward released pro rata as `delivered` grows (`paid` so far). guard: the taker holds the
--                  poster's town in `region` with at least `men` men for `n` hours, paid an hour at a time; out of bounds
--                  or dead past the grace (`away` seconds) it is `broken` and the rest goes back. No backward
--                  compatibility (no live users): the table is rebuilt for the wider CHECKs.
--   war_works:        an alliance's progress on a work (src/war/net/works.ts) this season: goods in, labour, done.
--   war_work_gifts:   who gave what to a work (goods as JSON, labour in man-seconds).
--   war_season_stats: per player and season: coin sold at his stalls, contracts filled, labour sold or given, guard
--                     seconds held (the titles).
--   war_peace_score:  peace score per season, alliance, UTC day and kind (the daily caps).
DROP TABLE IF EXISTS war_contracts;
CREATE TABLE war_contracts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL CHECK (kind IN ('carry', 'supply', 'escort', 'build', 'guard')),
  town        TEXT NOT NULL,
  to_town     TEXT NOT NULL,
  poster      INTEGER NOT NULL REFERENCES players(id),
  taker       INTEGER REFERENCES players(id),
  reward      INTEGER NOT NULL CHECK (reward > 0),
  res         TEXT,
  n           REAL NOT NULL DEFAULT 0,
  delivered   REAL NOT NULL DEFAULT 0,
  value       INTEGER NOT NULL DEFAULT 0,
  deposit     INTEGER NOT NULL DEFAULT 0,
  region      TEXT,
  site        INTEGER,
  men         INTEGER NOT NULL DEFAULT 0,
  paid        REAL NOT NULL DEFAULT 0,
  away        REAL NOT NULL DEFAULT 0,
  state       TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'taken', 'done', 'expired', 'cancelled', 'broken')),
  deadline    INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX war_contracts_town ON war_contracts (town, state);
CREATE INDEX war_contracts_poster ON war_contracts (poster, state);
CREATE INDEX war_contracts_region ON war_contracts (region, state);

CREATE TABLE war_works (
  season      INTEGER NOT NULL,
  alliance    INTEGER NOT NULL,
  work        TEXT NOT NULL,
  goods       TEXT NOT NULL DEFAULT '{}',
  labour      REAL NOT NULL DEFAULT 0,
  done_at     INTEGER,
  PRIMARY KEY (season, alliance, work)
);

CREATE TABLE war_work_gifts (
  season      INTEGER NOT NULL,
  alliance    INTEGER NOT NULL,
  work        TEXT NOT NULL,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  goods       TEXT NOT NULL DEFAULT '{}',
  labour      REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (season, alliance, work, player_id)
);

CREATE TABLE war_season_stats (
  season      INTEGER NOT NULL,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  sold        REAL NOT NULL DEFAULT 0,
  contracts   INTEGER NOT NULL DEFAULT 0,
  labour      REAL NOT NULL DEFAULT 0,
  guard       REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (season, player_id)
);

CREATE TABLE war_peace_score (
  season      INTEGER NOT NULL,
  alliance    INTEGER NOT NULL,
  day         INTEGER NOT NULL,
  kind        TEXT NOT NULL,
  points      REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (season, alliance, day, kind)
);
