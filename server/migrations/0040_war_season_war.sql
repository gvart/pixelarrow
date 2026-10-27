-- W-62 season war (server/src/war/world/worldDO.ts rollover): when a world season ends its scoreboard is kept and
-- cosmetics are awarded; men, gear and titles stay, landmarks, score and region control start over.
--   war_season_results: one row per finished world season: how it ended, the winner (NULL: a tie), final and event
--                       score per alliance and the title holders (JSON).
--   war_cosmetics:      what a player earned: kind 'banner' (a player of the winning alliance; detail = the alliance) or
--                       'crest' (a title holder; detail = the title id). Shown on the world map and the roster.
CREATE TABLE war_season_results (
  season      INTEGER PRIMARY KEY,
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER NOT NULL,
  reason      TEXT NOT NULL CHECK (reason IN ('time', 'hegemony')),
  winner      INTEGER,
  scores      TEXT NOT NULL,
  event       TEXT NOT NULL DEFAULT '[]',
  titles      TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE war_cosmetics (
  player_id   INTEGER NOT NULL REFERENCES players(id),
  season      INTEGER NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('banner', 'crest')),
  detail      TEXT NOT NULL,
  alliance    INTEGER NOT NULL,
  at          INTEGER NOT NULL,
  PRIMARY KEY (player_id, season, kind, detail)
);
