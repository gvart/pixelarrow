-- W-73 region mastery (rules: src/war/net/mastery.ts; store: server/src/war/mastery.ts). Per season and player:
--   war_mastery:      each deed of the wild that counts once toward a region's mastery (kind lair / chief / secret,
--                     key the lair id, chief id or hidden quest id); a respawned lair cleared again adds nothing.
--   war_mastery_done: the regions he mastered (the favour and banner paid once, the map badge).
CREATE TABLE war_mastery (
  season      INTEGER NOT NULL,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  region      TEXT NOT NULL,
  kind        TEXT NOT NULL,
  key         TEXT NOT NULL,
  at          INTEGER NOT NULL,
  PRIMARY KEY (season, player_id, region, kind, key)
);

CREATE TABLE war_mastery_done (
  season      INTEGER NOT NULL,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  region      TEXT NOT NULL,
  at          INTEGER NOT NULL,
  PRIMARY KEY (season, player_id, region)
);
