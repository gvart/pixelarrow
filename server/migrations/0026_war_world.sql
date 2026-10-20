-- M4 world (docs/WAR.md "World", W-03): the four alliances of a war season and their members. An alliance's clans
-- (clans / clan_members of the online season) are its sub-groups: a clan's alliance is set by the first member who
-- joins one, and every member of the clan serves that alliance. Region ownership, influence and squads in transit live
-- in the WarWorldDO's own storage (server/src/war/world/).
CREATE TABLE war_alliance_members (
  season      INTEGER NOT NULL,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  alliance    INTEGER NOT NULL CHECK (alliance BETWEEN 0 AND 3),
  joined_at   INTEGER NOT NULL,
  PRIMARY KEY (season, player_id)
);
CREATE INDEX war_alliance_members_alliance ON war_alliance_members (season, alliance);

CREATE TABLE war_alliance_clans (
  season      INTEGER NOT NULL,
  clan_id     INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  alliance    INTEGER NOT NULL CHECK (alliance BETWEEN 0 AND 3),
  PRIMARY KEY (season, clan_id)
);
