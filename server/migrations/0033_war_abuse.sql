-- M6i anti-abuse (docs/WAR.md "Season score and anti-abuse"); rules in server/src/war/abuse.ts.
--   war_seen:  the IP (hashed) and device keys each account used on the war API and sockets, with the last time;
--              accounts sharing one within 7 days are linked: no hand-offs, fills, contracts or cart captures between.
--   war_gifts: one-sided hand-offs received per receiver and UTC day, by value (last-fill prices), capped.
CREATE TABLE war_seen (
  player_id   INTEGER NOT NULL REFERENCES players(id),
  key         TEXT NOT NULL,
  at          INTEGER NOT NULL,
  PRIMARY KEY (player_id, key)
);
CREATE INDEX war_seen_key ON war_seen (key, at);

CREATE TABLE war_gifts (
  player_id   INTEGER NOT NULL REFERENCES players(id),
  day         INTEGER NOT NULL,
  value       REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, day)
);
