# ADR-0001: Determinism and replay contract (SIM_VERSION)

## Status
Accepted

## Date
2026-10-10

## Last Verified
2026-10-10

## Decision Makers
Autonomous v5 run (story S4-SIM-VERSION; decisions V5-008, V5-012, V5-019). The user was asleep and delegated the call.

## Summary
The server replays every online battle with the client's own `src/sim`, so a rule change breaks battles in flight and old clients. This ADR defines the determinism contract, puts a `SIM_VERSION` on every online battle, and sets how versions are added and retired. The server replays each battle with the version it was played under, and turns away clients outside its window with a "please reload" error.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Phaser 3.90 client and a Cloudflare Worker with Durable Objects and D1 for the server. The sim is plain TypeScript and does not use Phaser. |
| **Domain** | Core and Networking |
| **Knowledge Risk** | LOW. The sim uses no engine API. |
| **References Consulted** | `docs/v5/audit/MECHANICS.md` §1.11 (O1–O3), `server/README.md`, `server/src/battle.ts`, `src/online/protocol.ts` |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | Replay hash equality of `tests/sim.test.ts` and `server/test/battle.test.ts` (fixture replayed inside workerd). `server/test/simVersion.test.ts` covers the version window. |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | None |
| **Enables** | V5-019: the sim train ships as `SIM_VERSION` 2 (formations-orders, ai-doctrines, field-works and abilities GDDs). |
| **Blocks** | Every [SERVER] story in `docs/v5/VISION.md` |
| **Ordering Note** | The plumbing (S4-SIM-VERSION) must be deployed and old clients must age out before the first v2 deploy. Until then, every client in the field sends no version, which the server reads as v1. |

## Context

### Problem Statement
The client runs a battle, and the server re-runs it from the seed, the setups and the order log. Then it compares the winner, the ticks and `Battle.hash()`. Before this ADR there was no rules version (MECHANICS O1). Any change to the sim, the AI, the data or the stats broke three things. Tickets in flight (10 minutes) failed. Live duels between mixed builds desynced. Stored async raid replays changed. v5 plans many sim changes (V5-019), so versioning has to land first.

### Constraints
- Live players run old clients that send no version. The API must stay backward compatible.
- Live duels run in lockstep. Both clients and the relay's replay must use exactly the same rules.
- The server builds battle setups (seed, armies, derived `CombatStats`) with the code it is running.
- The Worker bundles `src/sim` through relative imports. Each replayable version costs bundle size.

### Requirements
- Every online battle records the sim version it was issued and played under.
- The server replays with the matching version, and its structure can take v2.
- An unknown or newer version gets a clear error, and the client shows "please reload".
- A missing version means v1.
- One constant, `MIN_SIM_VERSION`, turns stale clients away.

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
- `src/sim/version.ts` exports `SIM_VERSION` (1 = the v4 rules, today's sim).
- HTTP: these calls take an optional `simVersion`:
  - `/api/battle/verify`;
  - the start and submit calls of war attacks (`/api/online/attack/*`), boss raids (`/api/online/boss/*`), ladder floors (`/api/duel/ladder/*`) and async raids (`/api/duel/async/*`).
  The zod schema checks it as an integer in range (`SimVersionField`).
- Sockets: every `/ws/*` takes `?sim=N`.
- No version at all means version 1 (`LEGACY_SIM_VERSION`).

### The server's window
`server/src/simVersion.ts` accepts `MIN_SIM_VERSION..SIM_VERSION`. Today that is 1..1.
- HTTP outside the window gets **426 `sim_version_unsupported`** with `{simVersion, min, max}`.
- A socket must run a version in `SOCKET_MIN_SIM_VERSION..SIM_VERSION` (V5-033; a missing `?sim=` is 1). Otherwise the gateway opens the socket only to send `{type:'error', code:'sim_version_unsupported'}` and close it with 4426. A browser cannot read an HTTP error on an upgrade.
- The gateway forwards the socket's version as `x-sim-version`. Live lockstep pairs only clients of the same version, because mixed rules would desync: the shard's DuelHub refuses a challenge between versions (`sim_version_mismatch`), the MatchmakerDO pairs within each version (`pairBySimVersion`), the match records its version, and the DuelDO refuses a join under other rules (409).
- The client (`errorText` in `src/online/client.ts` and `ShardSocket`) shows the localized `online.reloadForUpdate` message and stops reconnecting.

### Recording and dispatch
- `battle_tickets`, `duel_tickets`, `duel_attacks` and `duel_matches` store `sim_version` (migration 0016). Rows from before the migration default to 1.
- A ticket is issued under the client's version. Its submission must run the same version. Otherwise it gets **409 `sim_version_mismatch`** and the ticket is rejected, because the setup was built for other rules.
- A submission whose version the server cannot take gets 426, and the ticket stays open.
- `replayBattle(setup, log, deployOrders, simVersion)` dispatches through `REPLAYERS` (version → sim factory) in `server/src/battle.ts`. An unknown version throws.
- A live duel's relay state carries `simVersion`. The DuelDO persists it, and the end-of-duel replay uses it.
- `/api/duel/async/replay/:id` returns `simVersion`, so a viewer can tell a replay fought under other rules.

### Architecture Diagram
```
client (SIM_VERSION=n) ──start {simVersion:n}──▶ resolveSimVersion ─426 if outside window
                                                   │ ok
                                                   ▼
                                   ticket row (setup, sim_version=n)
client ──submit {simVersion:n}──▶ verifyBattle: n == ticket.sim_version ? ─409 mismatch
                                                   ▼
                              REPLAYERS[n](setup) → replay → compare hash
sockets: /ws/*?sim=n ──▶ n == SIM_VERSION ? upgrade : error frame + close 4426
```

### Key Interfaces
- `src/sim/version.ts`: `SIM_VERSION`
- `src/online/protocol.ts`: `SIM_VERSION_REJECTED = 'sim_version_unsupported'`, `SIM_VERSION_CLOSE = 4426`
- `server/src/simVersion.ts`: `MIN_SIM_VERSION`, `LEGACY_SIM_VERSION`, `SimVersionField`, `resolveSimVersion(v)`, `socketSimVersion(raw)`
- `server/src/battle.ts`: `REPLAYERS`, `replayBattle(setup, log, deployOrders?, simVersion = 1)`
- `server/src/duel/verify.ts`: `verifyBattle({ setup, simVersion }, body, reject, message?)`

### Implementation Guidelines
- Every new online battle endpoint must take `simVersion: SimVersionField`. It must call `resolveSimVersion` before it does any work, and store the result with the battle.
- Every replay must go through `replayBattle` with the battle's recorded version. Code must never call `new Battle` directly on the server for verification.
- A [SERVER] change must never merge without a `SIM_VERSION` bump in the same train. The replay fixture tests must be updated deliberately, never regenerated silently.
- The sim must never branch on `SIM_VERSION` internally. Old rules live in frozen copies (see below) so that the current sim stays clean.

### Adding a version (the v2 cutover)
1. Freeze v1. Copy `src/sim/**` and the `src/data/**` modules it imports into `server/src/sims/v1/`. These are read-only, so tests import them only to prove the copy is hash-identical to the old fixture. Register `1: (s) => new BattleV1(s)` in `REPLAYERS`.
2. Bump `SIM_VERSION` to 2 in `src/sim/version.ts`, and register `2: (s) => new Battle(s)`.
3. Keep `MIN_SIM_VERSION = 1` for a grace window. It must be at least one ticket TTL (10 minutes) plus the time for clients to pick up the new build. During the window:
   - v1 tickets issued before the deploy replay with the frozen v1 sim.
   - A v1 client asking for a new ticket still gets one, but its setup is built by the v2 server code. Unless the train leaves setup building untouched, raise the *start* floor to 2 at once: either a second constant or `MIN_SIM_VERSION = 2` right after the ticket TTL.
   - Live sockets keep `SOCKET_MIN_SIM_VERSION = 1` while v1 and v2 rules are identical (V5-033): today's clients send no `?sim=` and have no reload UI, so a refusal would break their duels for nothing. Duels pair only equal versions.
   - **The first rule-changing story raises both floors, `MIN_SIM_VERSION` (new tickets) and `SOCKET_MIN_SIM_VERSION`, to 2 in the same commit as the rule change.** That closes the rule-shopping gap (a client picking v1 rules for a new ticket) and the setup-building drift above. Tickets already issued under v1 still replay with the frozen sim until the v1 copy is retired.
4. Deploy the server and the client together (`docs/OPS.md`).

### Retiring a version
- Set `MIN_SIM_VERSION` to the new floor. Stale clients then get 426 and the reload message.
- Remove that version's `REPLAYERS` entry and its frozen copy in the same change. A `REPLAYERS` key below `MIN_SIM_VERSION` is dead code.
- Stored async replays of a retired version keep their `sim_version`. Clients must label them, or decline to replay them, instead of replaying under other rules. Per formations-orders.md, "Old replays (SIM_VERSION 1) are rejected by version".

## Alternatives Considered

### Alternative 1: A hard cutover, no versions
- **Description**: Deploy client and server together, and let anything in flight fail.
- **Pros**: No plumbing.
- **Cons**: Every deploy voids open tickets and live duels, and old clients fail with opaque `replay_mismatch` errors.
- **Rejection Reason**: This is the O1 problem itself.

### Alternative 2: Version branches inside the sim
- **Description**: `if (setup.simVersion >= 2)` inside `battle.ts` and the other sim modules.
- **Pros**: One copy of the code, and a small bundle.
- **Cons**: Every rule becomes conditional forever, a missed branch silently breaks v1 replays, and the GDDs' train of changes touches most of the sim.
- **Rejection Reason**: It is fragile, and the cost grows with every train. Frozen copies are retired cleanly.

### Alternative 3: The version in an HTTP header or a client build id
- **Description**: `X-Sim-Version` on every request, or the client's build hash.
- **Pros**: One central place in the client.
- **Cons**: It is not validated by the endpoint's zod schema, and it is not stored with the battle. A build id changes on every deploy, even when the rules do not.
- **Rejection Reason**: The version belongs to the battle, not the transport. Rules versions change only when rules change.

## Consequences

### Positive
- Battles in flight survive a rules deploy, as long as the old version stays in the window.
- Stale clients get an actionable "please reload" message instead of `replay_mismatch`.
- Every stored battle says which rules produced it.

### Negative
- During a grace window the Worker bundles two sims.
- Every new battle endpoint has to carry the field. This is a review item.
- Live duels get no grace window. A deploy ends live duels in flight.

## Risks
- **Setup building drifts from the ticket's version during a window.** Mitigation: the start-floor rule in "Adding a version", step 3.
- **A rules change ships without a bump.** Mitigation: the replay fixture tests (`server/test/battle.test.ts`, `tests/sim.test.ts`) fail on any hash change. Review the [SERVER] flag in stories.
- **A frozen copy differs from what shipped.** Mitigation: when freezing, assert that the v1 fixture's hash matches the frozen sim.

## GDD Requirements Addressed

| GDD | Requirement | How |
|-----|-------------|-----|
| game-concept.md | "Sim determinism and `SIM_VERSION` (V5-012)"; ADRs (V5-008) | This ADR, plus the plumbing |
| formations-orders.md | Ships in sim train 2, and "Old replays (SIM_VERSION 1): rejected by version" | Version window, recorded `sim_version` on replays |
| ai-doctrines.md | Doctrines are sim changes and ship only in train 2 | Bump rules: the AI is listed |
| field-works.md | An old setup without `works` plays as before, under SIM_VERSION 2 | The version decides the rules, not the setup's fields |

## Related
- `docs/v5/DECISIONS.md` V5-008, V5-012, V5-019
- `docs/v5/audit/MECHANICS.md` §1.11 O1–O3
- `server/README.md` "Sim version"
