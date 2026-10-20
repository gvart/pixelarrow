-- M4d: what the public war boards read (server/src/public/snapshot.ts). Per war season (src/war/world/alliances.ts
-- WAR_SEASON.id, as war_alliance_members): each player's fight tallies, written with every fight
-- (server/src/war/persons.ts applyFight), and the region bosses slain (W-45, server/src/war/bosses.ts).
CREATE TABLE war_player_stats (
  season      INTEGER NOT NULL,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  kills       INTEGER NOT NULL DEFAULT 0,
  fights      INTEGER NOT NULL DEFAULT 0,
  wins        INTEGER NOT NULL DEFAULT 0,
  honours     INTEGER NOT NULL DEFAULT 0,
  bosses      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (season, player_id)
);

-- One row per boss kill; id: region, room run and tick (a kill written twice changes nothing).
CREATE TABLE war_boss_kills (
  id          TEXT PRIMARY KEY,
  season      INTEGER NOT NULL,
  region      TEXT NOT NULL,
  boss        TEXT NOT NULL,
  -- the alliance of the player who struck the last blow (null: none)
  alliance    INTEGER,
  player_id   INTEGER REFERENCES players(id),
  at          INTEGER NOT NULL
);
CREATE INDEX war_boss_kills_boss ON war_boss_kills (season, boss, at);
