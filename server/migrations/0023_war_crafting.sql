-- M5h4 crafting persistence (docs/WAR.md "Crafting and professions"; rules in server/src/war/crafting.ts).
--   war_persons.perks:     a civilian's profession node ids (Hero.perks), picked through /api/war
--   war_persons.respec_at: when his nodes were last reset (50 silver, once a day)
--   war_items.region:      the item lies at a workplace in that region's room (a repair or salvage order); NULL: in the stash
--   war_crafts:            one row per `crafted` event written back (minted item, repair, salvage): the id makes it idempotent
ALTER TABLE war_persons ADD COLUMN perks TEXT NOT NULL DEFAULT '[]';
ALTER TABLE war_persons ADD COLUMN respec_at INTEGER;
ALTER TABLE war_items ADD COLUMN region TEXT;
CREATE INDEX war_items_region ON war_items (region);

CREATE TABLE war_crafts (
  id          TEXT PRIMARY KEY,
  region      TEXT NOT NULL,
  what        TEXT NOT NULL,
  player_id   INTEGER,
  uid         TEXT,
  at          INTEGER NOT NULL
);
