-- E3 veterans (src/war/sim/deeds.ts, server/src/war/persons.ts, server/src/war/bosses.ts): every man keeps his deeds
-- (names only) and scars; the fallen get a grave on their player's home memorial with their deeds; a guardian's
-- killers hang its trophy in their home town. No live users: no data to carry over.

-- deeds: JSON [{id, name}] (at most DEEDS_MAX); scars: 0..SCARS_MAX
ALTER TABLE war_persons ADD COLUMN deeds TEXT NOT NULL DEFAULT '[]';
ALTER TABLE war_persons ADD COLUMN scars INTEGER NOT NULL DEFAULT 0;

-- The memorial lists the fallen (kind 'fallen', written by the fight write-back) beside the retired (kind 'retired',
-- one honour). honour: his first honour or ''. region: where he fell. deeds: JSON [{id, name}].
ALTER TABLE war_memorial ADD COLUMN kind TEXT NOT NULL DEFAULT 'retired';
ALTER TABLE war_memorial ADD COLUMN cls TEXT NOT NULL DEFAULT 'militia';
ALTER TABLE war_memorial ADD COLUMN kills INTEGER NOT NULL DEFAULT 0;
ALTER TABLE war_memorial ADD COLUMN battles INTEGER NOT NULL DEFAULT 0;
ALTER TABLE war_memorial ADD COLUMN deeds TEXT NOT NULL DEFAULT '[]';
ALTER TABLE war_memorial ADD COLUMN region TEXT;

-- One trophy per killer of a guardian kill (war_boss_kills.id): shown in his home town.
CREATE TABLE war_trophies (
  kill_id     TEXT NOT NULL,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  season      INTEGER NOT NULL,
  boss        TEXT NOT NULL,
  region      TEXT NOT NULL,
  at          INTEGER NOT NULL,
  PRIMARY KEY (kill_id, player_id)
);
CREATE INDEX war_trophies_player ON war_trophies (player_id);
