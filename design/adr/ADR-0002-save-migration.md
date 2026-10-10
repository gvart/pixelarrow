# ADR-0002: Campaign save migration and the one v5 bump (SAVE_VERSION 6)

## Status
Accepted

## Date
2026-10-10

## Last Verified
2026-10-10

## Decision Makers
Autonomous v5 run (story ST-02; GDD review N4; decisions V5-011, V5-020, V5-026). The user was asleep and delegated the call.

## Summary
The v5 train adds lairs, a campaign arc, overland events, captains and new settings to the campaign save. This ADR declares all of them at once as `SAVE_VERSION` 6 (S4-FIX-SAVES' version 5, plus one), with a pure v5 → v6 migration and load-time defaults, and it sets the rule that feature stories add no further bump. It also records how older clients treat a v6 save, and the release order that keeps them from wiping one.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Phaser 3.90 client (the save code is plain TypeScript and does not use Phaser). The cloud copy lives in a Cloudflare Worker + D1 (`server/src/routes/save.ts`). |
| **Domain** | Core (persistence) |
| **Knowledge Risk** | LOW. No engine API. Telegram CloudStorage limits: values up to 4,096 chars, keys up to 128 chars, 1,024 keys. |
| **References Consulted** | `design/gdd/campaign-arc.md`, `campaign-events.md`, `ai-doctrines.md`, `abilities.md`, `controls.md` ("Save impact"); `docs/v5/audit/MECHANICS.md` S1; `src/game/save.ts`; `src/platform/saveSync.ts`; `server/src/routes/save.ts` |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `tests/saveMigration.test.ts`, `tests/saveRecovery.test.ts` (every fixture in `tests/fixtures/saves/` loads), `tests/stateLoad.test.ts` and `tests/legacySave.test.ts`. |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | S4-FIX-SAVES (V5-011): two-slot atomic writes, the corrupt-save backup and the `newer` refusal path. |
| **Enables** | AI-02, AR-01..04, EV-01, FW-*, AB-01, DLG-01: they read and write the v6 fields. |
| **Blocks** | None (written and accepted in ST-02). |
| **Ordering Note** | **A build with the S4-FIX-SAVES refusal path must be live, and the old `main` bundle aged out, before any build that writes v6 reaches players.** See "Older clients" below. |

## Context

### Problem Statement
Five GDDs add save fields. Bumping per feature would mean five migrations, five windows in which an older client meets a newer save, and five chances to get it wrong. Per GDD review N4 the train gets exactly one bump, and it has to declare every field before the feature stories start (plan risk R4).

### Constraints
- Live players hold saves at v1..v5 in localStorage, Telegram CloudStorage and the server. All must load.
- The cloud copy is a JSON blob; the server only checks `v` is an integer and the size (512 KB).
- CloudStorage is chunked into 3,800-char parts (`CHUNK_SIZE`), two slots plus a corrupt-save backup.
- No new dependencies.

### Requirements
- Every v1..v5 save migrates to v6 with a default for each new field, keeping everything else (V5-020: an existing army is kept).
- A v6 save is refused, not overwritten, by a client built for v5.
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

### Migration and validation
- `migrations[5]` is pure: `{ ...d, v: 6, world: { ...v6WorldDefaults(), ...d.world } }`. Defaults go under the existing world, so nothing a v5 save holds is replaced. v1..v4 reach it through the existing chain.
- `World.fresh` spreads the same `v6WorldDefaults()`, so new campaigns and migrated saves start identical.
- `validate` repairs every v6 value on every load (also for saves already at v6): a missing or malformed value takes its default, a malformed map or list entry is dropped, flags keep their first 64 keys and the journal its last 20, malformed optional party, settlement and settings fields are deleted. A save is never refused for a v6 field.
- Optional fields stay optional and are read with defaults (`p.escaped ?? 0`); required world fields are always present after load.

### No further bump in v5
Feature stories use only these fields. A field found later must be optional, read with a default and pass the v6 validation, or the Director decides on a bump and logs it (plan risk R4).

### Size
A max-size v6 save (20 heroes with 10 perks each, 120 stash items, 15 lairs, 64 flags and 24 cooldowns with 24-char names, a full journal, every optional party and settlement field set) is 32,100 chars: 9 parts, each within 3,800 chars, and it round-trips through a KV that enforces the CloudStorage limits with both slots full. The v6 fields at their caps cost about 4,850 chars, under two parts.

### Older clients and a v6 save (confirmed by running each build's code)

| Client | Local v6 save | Cloud v6 save, local older save present |
| --- | --- | --- |
| v5 branch before ST-02 (S4-FIX-SAVES, `SAVE_VERSION` 5) | Refused as `newer`: read-only session, notice `save.newer`, raw copy kept under `px_corrupt_*`, **no key written**, nothing pushed. | `decideOnLoad` → `hold`, `resolveConflict` → `hold`: never overwritten. |
| `main` (bd61069, the live v4, `SAVE_VERSION` 5, no refusal path) | `migrate` returns null, so it is taken for "no save": a new campaign is started and **saved over** `px_meta` and `px_part_*`, then pushed. | `remoteSaveData` is null, so `decideOnLoad` → `push` and a 409 resolves to `local`: **the cloud v6 save is overwritten.** |

So the refusal path protects v6 saves only from builds that contain it. `main` does not (MECHANICS S1 is fixed on the v5 branch only). A `main` bundle can still boot after a v6 save exists in two ways: a WebView serving a cached old bundle, or a rollback (V5-026; after v6 a rollback wipes rather than showing the last pre-v5 save).

**Release rule (the ordering note above):** ship the refusal path before v6, as ADR-0001 does for `SIM_VERSION`. Either release S4-FIX-SAVES at `SAVE_VERSION` 5 first and let old bundles age out, or ship v5 as one release and accept the window. A rollback from v6 to `main` must not be done; roll back to a build with the refusal path instead. Recommended follow-up (server, G-ONLINE): `PUT /api/save` refuses a body whose `v` is lower than the stored `version`, so a stale client can never overwrite a newer cloud save whatever it runs.

## Alternatives Considered
- **One bump per feature story.** Simple locally, but five mixed-version windows and five migrations. Rejected (N4).
- **No bump: every new field optional.** A v5 client would load a v6 save, drop B-path perks and arc state it does not know, and save the loss. Rejected: the version gate is what protects the data.
- **Refuse a save with malformed v6 fields.** Loses a whole campaign over one bad flag. Rejected for repair-on-load.
- **Shadow meta key so a v6 client can recover from a `main` overwrite.** It recovers the local copy, but cloud sync then adopts `main`'s new campaign anyway (it is the newer revision and the recovered copy is not dirty), so it needs `saveSync.ts` and server changes too. Deferred to the server guard above.

## Consequences
- Positive: one migration, one mixed-version window, every downstream story unblocked on a fixed schema.
- Positive: saves are never lost to a malformed v6 value.
- Negative: fields are declared before their features exist; a host band (`kind: 'host'`) fields raiders until AR-04 gives it an army.
- Negative: the `main` client wipes a v6 save; the release rule above is the guard.

## Risks
- A feature needs a field nobody declared: optional + default + validation, or a logged bump (R4).
- The release rule is skipped: stale `main` bundles overwrite v6 saves. The server guard removes this risk.

## GDD Requirements Addressed
- campaign-arc.md "Save impact" and AC "Migration … keeps every field (a fixture test)".
- campaign-events.md "Save impact" and "Size" (64 flags, 20 journal entries).
- ai-doctrines.md "Save impact" (`escaped`, `captainDead`).
- abilities.md "Save impact" (B-path perk ids ride the bump).
- controls.md "Save impact" (four settings, carried by `carrySettings`).

## Related
- `src/game/save.ts`, `src/world/world.ts` (`v6WorldDefaults`, `FLAGS_CAP`, `JOURNAL_CAP`)
- `tests/saveMigration.test.ts`; fixtures `tests/fixtures/saves/v5-played-b88eadd.json`, `v6-82d71f9.json`
- ADR-0001 (the same "plumbing first, then the bump" ordering)

## Release order (ST-02b)
The server guard now exists: `PUT /api/save` answers **409 `save_version_downgrade`** and keeps the stored copy when the stored `version` is above the upload's `data.v` (atomic in the `UPDATE` predicate, reported before `save_conflict`). A `main` client treats that code as a plain failure and retries with backoff (max 5 min), never reaching its overwrite path; the v5 client holds sync for the session.

1. **Server guard first, or in the same deploy as the client.** Never let a v6 save reach the cloud before the guard is live.
2. **Client refusal path and `SAVE_VERSION` 6 together** (one v5 release), as above.
3. **No rollback to the `main` bundle without a restore plan.** The guard protects the cloud copy only: a `main` bundle still replaces the *local* v6 save on that device with a new campaign. A v6 client booting afterwards on that device sees an unchanged cloud revision and does not re-adopt it; once the new campaign's `seq` passes the synced one, its push (same version, so allowed) overwrites the cloud. Before any rollback, have a way to restore (e.g. a server-side copy of each player's last v6 blob, or forcing an adopt) and roll back to a build with the refusal path, never to `main`.
