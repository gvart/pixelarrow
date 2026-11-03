-- W-184..W-191 (docs/WAR.md "Town boards"; rules in src/war/net/townBoard.ts, server/src/war/townBoard.ts):
--   war_town_jobs: what a player holds from a town's board, a copy of its line so it outlives the listing and his absence.
--                  target: the band's lair id; x, y: the band or the work; done / need: labour, or the load delivered.
--   war_town_heat: how much a kind at a town weighs on his next hand-in there, when it last stood at this (it fades).
-- Both are wiped with the season and deleted with the account.
CREATE TABLE war_town_jobs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id  INTEGER NOT NULL REFERENCES players(id),
  town       TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('kill', 'build', 'trade')),
  entry      TEXT NOT NULL,
  errand     INTEGER NOT NULL DEFAULT 0,
  goal       TEXT NOT NULL,
  giver      TEXT,
  story      TEXT,
  state      TEXT NOT NULL DEFAULT 'taken' CHECK (state IN ('taken', 'ready')),
  target     INTEGER,
  band       TEXT,
  x          REAL,
  y          REAL,
  done       REAL NOT NULL DEFAULT 0,
  need       REAL NOT NULL DEFAULT 0,
  to_town    TEXT,
  res        TEXT,
  n          REAL NOT NULL DEFAULT 0,
  coin       INTEGER NOT NULL,
  points     INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX war_town_jobs_player ON war_town_jobs (player_id);
CREATE INDEX war_town_jobs_town ON war_town_jobs (town, kind, state);

CREATE TABLE war_town_heat (
  player_id  INTEGER NOT NULL REFERENCES players(id),
  town       TEXT NOT NULL,
  kind       TEXT NOT NULL,
  heat       REAL NOT NULL,
  at         INTEGER NOT NULL,
  PRIMARY KEY (player_id, town, kind)
);
