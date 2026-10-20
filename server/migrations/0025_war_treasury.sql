-- M5e alliance treasury (docs/WAR.md "Prisoners": ransom): a silver pool per alliance (the clan: leader / officer /
-- member). Members deposit from their war stock; the leader and officers pay members' ransoms from it. Every move is in
-- the audit log. Rules: server/src/war/treasury.ts.
CREATE TABLE war_treasury (
  clan_id     INTEGER PRIMARY KEY REFERENCES clans(id) ON DELETE CASCADE,
  silver      INTEGER NOT NULL DEFAULT 0 CHECK (silver >= 0)
);

CREATE TABLE war_treasury_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  clan_id     INTEGER NOT NULL,                         -- no foreign key: the audit outlives a disbanded clan
  player_id   INTEGER NOT NULL REFERENCES players(id),  -- who deposited or paid
  kind        TEXT NOT NULL CHECK (kind IN ('deposit', 'ransom')),
  amount      INTEGER NOT NULL,
  person_id   TEXT,                                     -- ransom: the captive freed
  at          INTEGER NOT NULL
);
CREATE INDEX war_treasury_log_clan ON war_treasury_log (clan_id, at);
