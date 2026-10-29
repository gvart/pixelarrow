-- W-68 captives, dismissal and the tunnel floor (docs/WAR.md "Lifecycle", "Prisoners"). Rules: server/src/war/persons.ts
-- and src/war/sim/captives.ts. war_persons is rebuilt for the new states (SQLite cannot widen a CHECK in place).
--   soul:    released or dismissed, waiting as a named soul at a shrine of region `held_at` until `until_at`; a claim
--            moves him to the claimer (movePerson). player_id stays his last owner's, but he is no man of his.
--   faded:   his soul faded or the wild took him: gone for good.
--   refused: a captive who refused to join his captor (1): he can only be released.
--   bar_pid, bar_until: the owner who dismissed him may not claim his soul before bar_until.
-- Ransom is gone; a captive no longer counts in his owner's army.

CREATE TABLE war_persons_next (
  id          TEXT PRIMARY KEY,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  cls         TEXT NOT NULL DEFAULT 'militia',
  name        TEXT NOT NULL DEFAULT '',
  level       INTEGER NOT NULL DEFAULT 1,
  xp          INTEGER NOT NULL DEFAULT 0,
  points      INTEGER NOT NULL DEFAULT 0,
  kills       INTEGER NOT NULL DEFAULT 0,
  battles     INTEGER NOT NULL DEFAULT 0,
  attrs       TEXT NOT NULL DEFAULT '{}',
  skills      TEXT NOT NULL DEFAULT '[]',
  gear        TEXT NOT NULL DEFAULT '{}',
  honours     TEXT NOT NULL DEFAULT '[]',
  state       TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'reserve', 'wounded', 'captive', 'dead', 'training', 'retired', 'soul', 'faded')),
  until_at    INTEGER,
  captor      INTEGER,
  held_at     TEXT,
  slot        INTEGER,
  region      TEXT,
  created_at  INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL DEFAULT 0,
  train_to    TEXT,
  captor_pid  INTEGER,
  perks       TEXT NOT NULL DEFAULT '[]',
  respec_at   INTEGER,
  held_fort   INTEGER,
  deeds       TEXT NOT NULL DEFAULT '[]',
  scars       INTEGER NOT NULL DEFAULT 0,
  refused     INTEGER NOT NULL DEFAULT 0,
  bar_pid     INTEGER,
  bar_until   INTEGER
);
INSERT INTO war_persons_next (id, player_id, cls, name, level, xp, points, kills, battles, attrs, skills, gear, honours, state, until_at, captor, held_at, slot, region, created_at, updated_at, train_to, captor_pid, perks, respec_at, held_fort, deeds, scars)
  SELECT id, player_id, cls, name, level, xp, points, kills, battles, attrs, skills, gear, honours, state, until_at, captor, held_at, slot, region, created_at, updated_at, train_to, captor_pid, perks, respec_at, held_fort, deeds, scars FROM war_persons;
DROP TABLE war_persons;
ALTER TABLE war_persons_next RENAME TO war_persons;
CREATE INDEX war_persons_player ON war_persons (player_id, state);
CREATE INDEX war_persons_region ON war_persons (region);
CREATE INDEX war_persons_captor ON war_persons (captor_pid, state);
CREATE INDEX war_persons_held ON war_persons (held_at, held_fort, state);
