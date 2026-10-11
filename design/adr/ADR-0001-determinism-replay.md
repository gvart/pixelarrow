# ADR-0001: Determinism and replay contract (SIM_VERSION)

## Status
Accepted. Simplified by V5-074 (2026-10-11): the app has no players, so the server keeps one sim and takes only `SIM_VERSION`. The version window, the frozen v1 sim, the in-flight ticket path and live-duel pairing by version were removed (S4-NOCOMPAT).

## Date
2026-10-10

## Last Verified
2026-10-11

## Decision Makers
Autonomous v5 run (story S4-SIM-VERSION; decisions V5-008, V5-012, V5-019). The user was asleep and delegated the call.

## Summary
The server replays every online battle with the client's own `src/sim`, so client and server must run the same rules. This ADR defines the determinism contract and puts a `SIM_VERSION` on every online battle. The server runs one sim and turns away a client on any other version with a "please reload" error. With no players to keep (V5-074) there is no version window and no older sim on the server.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Phaser 3.90 client and a Cloudflare Worker with Durable Objects and D1 for the server. The sim is plain TypeScript and does not use Phaser. |
| **Domain** | Core and Networking |
| **Knowledge Risk** | LOW. The sim uses no engine API. |
| **References Consulted** | `docs/v5/audit/MECHANICS.md` §1.11 (O1–O3), `server/README.md`, `server/src/battle.ts`, `src/online/protocol.ts` |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | Replay hash equality of `tests/sim.test.ts` and `server/test/battle.test.ts` (fixture replayed inside workerd). The train 2 fixtures (`tests/trainReplay.test.ts`, `server/test/trainReplay.test.ts`, `scripts/replay-hash.mjs` in the browsers). `server/test/simVersion.test.ts` covers the version check. |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | None |
| **Enables** | V5-019: the sim train ships as `SIM_VERSION` 2 (formations-orders, ai-doctrines, field-works and abilities GDDs). |
| **Blocks** | Every [SERVER] story in `docs/v5/VISION.md` |
| **Ordering Note** | None since V5-074: client and server deploy together as one Worker. |

## Context

### Problem Statement
The client runs a battle, and the server re-runs it from the seed, the setups and the order log. Then it compares the winner, the ticks and `Battle.hash()`. Before this ADR there was no rules version (MECHANICS O1). Any change to the sim, the AI, the data or the stats broke three things. Tickets in flight (10 minutes) failed. Live duels between mixed builds desynced. Stored async raid replays changed. v5 plans many sim changes (V5-019), so versioning has to land first.

### Constraints
- Live duels run in lockstep. Both clients and the relay's replay must use exactly the same rules.
- The server builds battle setups (seed, armies, derived `CombatStats`) with the code it is running.
- The Worker bundles `src/sim` through relative imports. Each replayable version costs bundle size.

### Requirements
- Every online battle records the sim version it was issued and played under.
- A client on another version (or none) gets a clear error, and the client shows "please reload".

## Decision

### The determinism contract
A battle is a pure function of `BattleSetup` (seed, both armies with derived stats, terrain, time limit) and the order log of the non-bot sides (tick, side, order). The bots re-derive their orders from the seed. Under the same `SIM_VERSION`, any two runs must produce the same `Battle.hash()` at every tick, whether they run in a browser, Node or workerd.

The sim must never:
- use `Math.random`, `Date` or any other clock;
- iterate units, groups or events in any order but by id (or by insertion order where insertion is itself by id);
- use transcendental math (`Math.sin`, `cos`, `atan2`, `exp`, `log`, `pow` with non-integer exponents), whose results can differ by engine. Today the sim uses only `+ - * /`, `sqrt`, `abs`, `min`, `max`, `floor`, `ceil`, `round` and `imul`, which are exact under IEEE 754;
- read anything outside the setup and the order log, such as save state, settings, i18n or the UI.

All randomness goes through `src/sim/rng.ts`, seeded from the setup.

### What needs a SIM_VERSION bump
Bump the version for any change that can alter a replay's winner, ticks or hash for some valid setup and log:
- code in `src/sim/**` (battle, AI, formations, myth, powers, terrain, stats derivation);
- data the sim or stat derivation reads (`src/data/**`: perks and abilities, auras, beasts, classes and mounts, terrain, items, affixes, sets, traits, units);
- new order kinds, or new enum values in the order or setup schema (`server/src/battle.ts` zod);
- the way the server builds setups (`ladderSetup`, `asyncSetup`, `onlineBattleSetup`, consumables applied to armies);
- `TICK_RATE` and the lockstep constants that place orders on ticks (`TURN_TICKS`).

These do not need a bump: rendering, the HUD, audio, i18n, the camera, presentation-only events, and refactors that are proven hash-identical by the replay tests.

All [SERVER] changes ship together as one train per version (V5-019), never as one bump per feature.

### The wire protocol
- `src/sim/version.ts` exports `SIM_VERSION` (2 = sim train 2, the baseline).
- HTTP: these calls take `simVersion`:
  - `/api/battle/verify`;
  - the start and submit calls of war attacks (`/api/online/attack/*`), boss raids (`/api/online/boss/*`), ladder floors (`/api/duel/ladder/*`) and async raids (`/api/duel/async/*`).
  The zod schema checks it as an integer in range (`SimVersionField`); it is optional there so that a missing one is 426, not 400.
- Sockets: every `/ws/*` takes `?sim=N`.

### The one check
`server/src/simVersion.ts` takes exactly `SIM_VERSION` (V5-074). It protects against stale bundles cheaply.
- HTTP with another version, or none, gets **426 `sim_version_unsupported`** with `{simVersion, expected}`, before any work. A refused submission leaves its ticket open.
- A socket with another `?sim=` (or none) is opened only to send `{type:'error', code:'sim_version_unsupported'}` and is closed with 4426; a browser cannot read an HTTP error on an upgrade. A malformed `?sim=` is 400.
- Every socket that gets in runs `SIM_VERSION`, so live duels need no pairing by version.
- The client (`errorText` in `src/online/client.ts` and `ShardSocket`) shows the localized `online.reloadForUpdate` message and stops reconnecting.

### Recording and replay
- `battle_tickets`, `duel_tickets`, `duel_attacks` and `duel_matches` keep the `sim_version` column (migration 0016), stamped with `SIM_VERSION`. It records which rules produced a stored battle; nothing dispatches on it.
- `replayBattle(setup, log, deployOrders?)` in `server/src/battle.ts` replays with today's `src/sim`. `verifyBattle(setup, body, reject)` in `server/src/duel/verify.ts` checks the version, then replays.
- A deploy that bumps `SIM_VERSION` voids battles in flight: tickets issued before it replay under the new rules and most fail, and live duels end.

### Architecture Diagram
```
client (SIM_VERSION=n) ──start {simVersion:n}──▶ n == SIM_VERSION ? ─426 otherwise
                                                   ▼
                                   ticket row (setup, sim_version=n)
client ──submit {simVersion:n}──▶ n == SIM_VERSION ? ─426 otherwise (ticket open)
                                                   ▼
                                     replayBattle(setup) → compare hash
sockets: /ws/*?sim=n ──▶ n == SIM_VERSION ? upgrade : error frame + close 4426
```

### Key Interfaces
- `src/sim/version.ts`: `SIM_VERSION`
- `src/online/protocol.ts`: `SIM_VERSION_REJECTED = 'sim_version_unsupported'`, `SIM_VERSION_CLOSE = 4426`
- `server/src/simVersion.ts`: `SimVersionField`, `checkSimVersion(v)`, `checkSocketSimVersion(raw)`
- `server/src/battle.ts`: `replayBattle(setup, log, deployOrders?)`
- `server/src/duel/verify.ts`: `verifyBattle(setup, body, reject, message?)`

### Implementation Guidelines
- Every new online battle endpoint must take `simVersion: SimVersionField` and call `checkSimVersion` before it does any work.
- Every replay must go through `replayBattle`. Code must never call `new Battle` directly on the server for verification.
- A [SERVER] change must never merge without a `SIM_VERSION` bump in the same train. The replay fixture tests must be updated deliberately, never regenerated silently.
- The sim must never branch on `SIM_VERSION` internally.

### A future version
Bump `SIM_VERSION`, record new replay fixtures, and deploy client and server together. Once the game has players, revisit V5-074 first: keeping battles in flight alive across a bump would need the previous sim on the server again (a frozen copy, as in the history of this ADR).

## Alternatives Considered

### Alternative 1: No versions at all
- **Description**: Deploy client and server together, and compare hashes only.
- **Pros**: No plumbing.
- **Cons**: A stale bundle (a WebView cache) fails with an opaque `replay_mismatch` instead of a reload prompt.
- **Rejection Reason**: The single check is cheap and gives a clear message.

### Alternative 2: Version branches inside the sim
- **Description**: `if (setup.simVersion >= 2)` inside `battle.ts` and the other sim modules.
- **Pros**: One copy of the code, and a small bundle.
- **Cons**: Every rule becomes conditional forever, a missed branch silently breaks v1 replays, and the GDDs' train of changes touches most of the sim.
- **Rejection Reason**: It is fragile, and the cost grows with every train.

### Alternative 3: The version in an HTTP header or a client build id
- **Description**: `X-Sim-Version` on every request, or the client's build hash.
- **Pros**: One central place in the client.
- **Cons**: It is not validated by the endpoint's zod schema, and it is not stored with the battle. A build id changes on every deploy, even when the rules do not.
- **Rejection Reason**: The version belongs to the battle, not the transport. Rules versions change only when rules change.

## Consequences

### Positive
- Stale clients get an actionable "please reload" message instead of `replay_mismatch`.
- One sim in the Worker; no version dispatch to keep correct.
- Every stored battle says which rules produced it.

### Negative
- A rules deploy voids battles in flight (tickets live 10 minutes) and ends live duels. Acceptable with no players (V5-074).
- Every new battle endpoint has to carry the field. This is a review item.

## Risks
- **A rules change ships without a bump.** Mitigation: the replay fixture tests (`server/test/battle.test.ts`, `tests/sim.test.ts`, the train 2 fixtures) fail on any hash change. Review the [SERVER] flag in stories.

## GDD Requirements Addressed

| GDD | Requirement | How |
|-----|-------------|-----|
| game-concept.md | "Sim determinism and `SIM_VERSION` (V5-012)"; ADRs (V5-008) | This ADR, plus the plumbing |
| formations-orders.md | Ships in sim train 2, and "Old replays (SIM_VERSION 1): rejected by version" | The single version check; recorded `sim_version` on replays |
| ai-doctrines.md | Doctrines are sim changes and ship only in train 2 | Bump rules: the AI is listed |
| field-works.md | An old setup without `works` plays as before, under SIM_VERSION 2 | The version decides the rules, not the setup's fields |

## Related
- `docs/v5/DECISIONS.md` V5-008, V5-012, V5-019, V5-074
- `docs/v5/audit/MECHANICS.md` §1.11 O1–O3
- `server/README.md` "Sim version"
