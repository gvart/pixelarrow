-- The sim version each battle was issued and replayed under
-- (design/adr/ADR-0001-determinism-replay.md, server/src/simVersion.ts).
-- Every battle before this migration ran the unversioned sim, which is version 1.
ALTER TABLE battle_tickets ADD COLUMN sim_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE duel_tickets ADD COLUMN sim_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE duel_attacks ADD COLUMN sim_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE duel_matches ADD COLUMN sim_version INTEGER NOT NULL DEFAULT 1;
