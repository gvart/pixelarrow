-- M5e raids (docs/WAR.md "Capture", "Prisoners"): a captive is held at a building of the captor's alliance in region
-- `held_at` (the sim's fort or camp id, `held_fort`; NULL when the captor held none there). A raid reaching it, or its
-- fall, frees the captives held there (server/src/war/persons.ts freeRaided).
ALTER TABLE war_persons ADD COLUMN held_fort INTEGER;
CREATE INDEX war_persons_held ON war_persons (held_at, held_fort, state);
