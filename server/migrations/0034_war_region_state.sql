-- M7f living regions (docs/WAR.md "Living regions"; server/src/war/memory.ts): what each region remembers once its room
-- empties (pre-built pieces' hp, ruin and owner, claim holders, guardians slain and when they are back, its landmark's
-- capture and restore), per war season. DO storage keeps the same; this row survives a lost DO and feeds tools.
CREATE TABLE war_region_state (
  region      TEXT PRIMARY KEY,
  season      INTEGER NOT NULL,
  memory      TEXT NOT NULL,
  at          INTEGER NOT NULL
);
