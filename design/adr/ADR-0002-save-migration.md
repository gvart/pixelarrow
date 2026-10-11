# ADR-0002: Campaign save format: SAVE_VERSION 6 as the baseline

## Status
Accepted. Simplified by V5-074 (2026-10-11): the app has no players, so v6 is the baseline. The v1..v5 migrations, their fixtures, the cloud downgrade guard (ST-02b) and the campaign-identity adoption (ST-02c) were removed (S4-NOCOMPAT).

## Date
2026-10-10

## Last Verified
2026-10-11

## Decision Makers
Autonomous v5 run (story ST-02; GDD review N4; decisions V5-011, V5-020, V5-026). The user was asleep and delegated the call.

## Summary
The v5 train adds lairs, a campaign arc, overland events, captains and new settings to the campaign save. This ADR declares all of them at once as `SAVE_VERSION` 6, with load-time defaults and repair, and it sets the rule that feature stories add no further bump. v6 is the baseline format: there are no migrations from older versions (V5-074), and a save this build cannot read takes the corrupt-save backup path.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Phaser 3.90 client (the save code is plain TypeScript and does not use Phaser). The cloud copy lives in a Cloudflare Worker + D1 (`server/src/routes/save.ts`). |
| **Domain** | Core (persistence) |
| **Knowledge Risk** | LOW. No engine API. Telegram CloudStorage limits: values up to 4,096 chars, keys up to 128 chars, 1,024 keys. |
| **References Consulted** | `design/gdd/campaign-arc.md`, `campaign-events.md`, `ai-doctrines.md`, `abilities.md`, `controls.md` ("Save impact"); `docs/v5/audit/MECHANICS.md` S1; `src/game/save.ts`; `src/platform/saveSync.ts`; `server/src/routes/save.ts` |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `tests/saveMigration.test.ts`, `tests/saveRecovery.test.ts` (the v6 fixture in `tests/fixtures/saves/` loads), `tests/stateLoad.test.ts`. |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | S4-FIX-SAVES (V5-011): two-slot atomic writes, the corrupt-save backup and the `newer` refusal path. |
| **Enables** | AI-02, AR-01..04, EV-01, FW-*, AB-01, DLG-01: they read and write the v6 fields. |
| **Blocks** | None (written and accepted in ST-02). |
| **Ordering Note** | None since V5-074: there are no older saves or clients to protect. |

## Context

### Problem Statement
Five GDDs add save fields. Bumping per feature would mean five schema changes and five chances to get one wrong. Per GDD review N4 the train gets exactly one bump, and it has to declare every field before the feature stories start (plan risk R4).

### Constraints
- There are no live players (V5-074), so no older save has to load.
- The cloud copy is a JSON blob; the server only checks `v` is an integer and the size (512 KB).
- CloudStorage is chunked into 3,800-char parts (`CHUNK_SIZE`), two slots plus a corrupt-save backup.
- No new dependencies.

### Requirements
- A new campaign is written at v6 with a default for each new field.
- A save from a newer build is refused, not overwritten (the `newer` path of S4-FIX-SAVES, kept).
- Malformed v6 values are repaired on load rather than losing the save.

## Decision

### `SAVE_VERSION` = 6, and these are its fields

| Where | Field | Default | Owner GDD |
| --- | --- | --- | --- |
| `WorldSave` | `lairs: Record<number, { fallen; lost; lostAt }>` | `{}` | campaign-arc |
| `WorldSave` | `arc: { stage: 'lairs' \| 'host' \| 'won' \| 'post'; hostParty?; sackedUntil? }` | `{ stage: 'lairs' }` | campaign-arc |
| `WorldSave` | `flags: Record<string, number>` (cap `FLAGS_CAP` = 64 keys) | `{}` | campaign-events |
| `WorldSave` | `eventCd: Record<string, number>` (day next allowed) | `{}` | campaign-events |
| `WorldSave` | `eventsToday: [day, count]` | `[0, 0]` | campaign-events |
| `WorldSave` | `pendingEvent?: { id; seed }` | absent | campaign-events |
| `WorldSave` | `journal: string[]` (the last `JOURNAL_CAP` = 20) | `[]` | campaign-events |
| `PartyState` | `kind` gains `'host'`; `escaped?: number`; `captainDead?: boolean` | absent = 0 / false | campaign-arc, ai-doctrines |
| `SettlementState` | `reborn?: boolean` | absent = false | campaign-arc |
| `Settings` | `reduceShake?`, `reduceFlash?`, `leftHand?` (booleans), `battleSpeed?` (0.5..3) | absent = off / 1× | controls |
| `Hero.perks` | the AB-01 B-path perk ids | (no data change) | abilities |

The B-path perk ids need no field: they ride the bump because a v5 client's `filter(p in PERKS)` would silently drop them, and the version gate stops a v5 client from loading the save at all.

### Loading and validation
- `migrateResult` takes only `SAVE_VERSION`: a higher version is `newer` (read-only session, never overwritten); anything lower, or no version, is `corrupt`. A save that cannot be loaded is kept raw under `px_corrupt_*` before anything is written, and the player is told. The two-slot atomic writes (S4-FIX-SAVES) are unchanged.
- `World.fresh` spreads `v6WorldDefaults()`, so every new campaign starts with the v6 fields.
- `validate` repairs every v6 value on every load: a missing or malformed value takes its default, a malformed map or list entry is dropped, flags keep their first 64 keys and the journal its last 20, malformed optional party, settlement and settings fields are deleted. A save is never refused for a v6 field.
- Optional fields stay optional and are read with defaults (`p.escaped ?? 0`); required world fields are always present after load.
- A future bump adds its one migration (`n` → `n+1`) to `migrateResult`.

### No further bump in v5
Feature stories use only these fields. A field found later must be optional, read with a default and pass the v6 validation, or the Director decides on a bump and logs it (plan risk R4).

### Size
A max-size v6 save (20 heroes with 10 perks each, 120 stash items, 15 lairs, 64 flags and 24 cooldowns with 24-char names, a full journal, every optional party and settlement field set) is 32,100 chars: 9 parts, each within 3,800 chars, and it round-trips through a KV that enforces the CloudStorage limits with both slots full. The v6 fields at their caps cost about 4,850 chars, under two parts.

### Cloud sync
`PUT /api/save` is plain optimistic concurrency on `revision` (409 `save_conflict`). The client keeps the more-played copy (`seq`, then `savedAt`), and holds (uploads nothing for the session) when the cloud copy is from a newer build. The downgrade guard (ST-02b) and campaign-identity adoption (ST-02c) guarded a mixed-bundle release window that does not exist without players; they were removed with V5-074.

## Alternatives Considered
- **One bump per feature story.** Simple locally, but five mixed-version windows and five migrations. Rejected (N4).
- **No bump: every new field optional.** An older client would load a newer save, drop fields it does not know, and save the loss. Rejected: the version gate is what protects the data.
- **Refuse a save with malformed v6 fields.** Loses a whole campaign over one bad flag. Rejected for repair-on-load.

## Consequences
- Positive: one schema, every downstream story unblocked on a fixed format.
- Positive: saves are never lost to a malformed v6 value.
- Positive: no migration chain, fixtures or release ordering to maintain (V5-074).
- Negative: fields are declared before their features exist.
- Negative: a save older than v6 cannot be read. None exist.

## Risks
- A feature needs a field nobody declared: optional + default + validation, or a logged bump (R4).
- Once there are players, the next bump needs its migration and a plan for stale bundles; revisit V5-074 then.

## GDD Requirements Addressed
- campaign-arc.md "Save impact" and AC "Migration … keeps every field (a fixture test)".
- campaign-events.md "Save impact" and "Size" (64 flags, 20 journal entries).
- ai-doctrines.md "Save impact" (`escaped`, `captainDead`).
- abilities.md "Save impact" (B-path perk ids ride the bump).
- controls.md "Save impact" (four settings, carried by `carrySettings`).

## Related
- `src/game/save.ts`, `src/world/world.ts` (`v6WorldDefaults`, `FLAGS_CAP`, `JOURNAL_CAP`)
- `tests/saveMigration.test.ts`; fixture `tests/fixtures/saves/v6-82d71f9.json`
- ADR-0001 (the same single-version model for the sim)
- `docs/v5/DECISIONS.md` V5-011, V5-020, V5-074
