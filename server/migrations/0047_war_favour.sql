-- W-66 divine favour (rules: src/war/net/favour.ts; earning: server/src/war/favour.ts). Per account, never reset by
-- a season.
--   war_favour:     the player's favour total and level; land_hour / land_n: the UTC hour of the last land pay and the
--                   land favour paid in it (capped an hour across regions).
--   war_favour_log: what earned favour recently (the newest FAVOUR_LOG kept per player).
CREATE TABLE war_favour (
  player_id   INTEGER PRIMARY KEY REFERENCES players(id),
  xp          INTEGER NOT NULL DEFAULT 0,
  level       INTEGER NOT NULL DEFAULT 1,
  land_hour   INTEGER NOT NULL DEFAULT 0,
  land_n      INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE war_favour_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  at          INTEGER NOT NULL,
  amount      INTEGER NOT NULL,
  reason      TEXT NOT NULL
);
CREATE INDEX war_favour_log_player ON war_favour_log (player_id, id);
