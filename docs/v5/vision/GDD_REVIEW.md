# v5 GDD review: /review-all-gdds and /consistency-check

**Story**: S2-VISION, deliverable 4.

**Scope**: 8 GDDs in `design/gdd/`:

- `ai-doctrines`
- `formations-orders`
- `abilities`
- `campaign-arc`
- `campaign-events`
- `field-works`
- `controls`
- `battle-readability`

**Context**: `game-concept`, `docs/v5/VISION.md`, and the first-population registry `design/registry/entities.yaml`.

**How it ran**:

- **Phase 2 (consistency, 2a–2f)** and **Phases 3–4 (design holism and scenarios)** ran as two parallel read-only reviewers. Each was a general-purpose agent working to the `game-designer` brief.
- The consistency report reached the Director, who ruled on each finding. The holism findings were ruled by the agent acting as creative director (ANSWERS.md).
- **/consistency-check** was a grep pass of the 8 GDDs plus VISION against the registry. It's a first-population run, so the registry was built from these GDDs and the check confirms that the GDDs agree with each other and with the registry.

## Verdict

| Check | Result |
| --- | --- |
| Before fixes | **FAIL**: 4 blocking, 8 warning and 6 notes from consistency (B4 duplicated my own pass); 3 blocking, 11 warning and 7 notes from holism. |
| After fixes | **CONCERNS**: no open blocking findings. 3 items are deferred (below). The balance targets are still unmeasured until each epic runs `npm run balance`. |
| /consistency-check | **PASS** after fixes. 30 registry entries checked across 8 GDDs plus VISION. The stale values found and fixed were bounty, save version, the `wheel` id, the `staked` event, `hostMusters`, and "Fall back". |

## Consistency findings (Phase 2)

All rulings are the Director's.

| ID | Sev | Finding | Verdict | Change |
| --- | --- | --- | --- | --- |
| B1 | blocking | battle-readability consumes events that no GDD emits: `cohesion`, `disordered`, "broken on the stakes". | fixed | Payloads are defined in the owning GDDs: F-O R5, R3 and the new R7 (`cohesion{side,group,targets}`, `disordered{group,untilTick}`, `armyBreak{side}`), field-works R2 (`stakesBreak{unit,x,y}`) and abilities R5 (`standardLost`). The union is `SimEvent` in `src/sim/types.ts`. battle-readability cites each one. |
| B2 | blocking | Cohesion halving was claimed for both Steady Presence and the standard. | fixed | Standard aura only, owned by abilities R5. F-O F3 uses `inStdAura`. |
| B3 | blocking | swarm's `preferShape` "loose" isn't a `FormationType`. | fixed | It's now `skirmish`, and a "Shape per group" rule was added (shape by group role, and spearmen never go loose). |
| B4 | blocking | Garrison stakes were keyed to doctrines that no garrison has. | fixed (ec11f34) | `GARRISON_STAKES` = 2, keyed to the lair. The wording is checked across field-works R4.4 and R6, and campaign-arc R2. |
| W1 | warning | The ai-doctrines AC assumed v1 replay hashes. | fixed | The AC is now "steady reproduces today's timers (unit test)". `SIM_VERSION` is a prerequisite (V5-012). |
| W2 | warning | Bot routing around works was defined twice. | fixed | Field-works wording only: terrain speed, no special routing. "fury charges through" was removed. |
| W3 | warning | `hostMusters` vs `host_musters`, and an unconsumed `lairFallen`. | fixed | The arc calls `setFlag('host_musters')`. `lairFallen` was removed. |
| W4 | warning | Escape idle of 6 h vs today's 3 h. Garrison retreat undefined. | fixed | New knob `ESCAPE_IDLE_H` = 3. Garrisons never retreat (campaign-arc R2.5, R4). |
| W5 | warning | field-works cited controls R6 for the deployment tools. | fixed | Now R7. |
| W6 | warning | The out-of-range condition was defined differently in two places. | fixed | F-O R4 owns `focusOutOfRange` and `noTargetS`. controls R3.4 owns the HUD condition. battle-readability reads both. |
| W7 | warning | The `wheel` id collided with the "wheel" idiom and the turn rule. | fixed | Renamed `recharge` everywhere, including the registry. |
| W8 | warning | Dependency directions were asymmetric (controls/field-works, readability/field-works, F-O/abilities, F-O/field-works). | fixed | Made reciprocal. Aligned on "stakes vs the feint bait", and the ditch claim was dropped. |
| N1 | note | Missing Cross-Reference rows. | fixed | Added to battle-readability, abilities, controls, campaign-events and field-works. |
| N2 | note | "Fall back" vs "Withdraw". | fixed | "Withdraw" everywhere. |
| N3 | note | Code facts: `ClassDef.tree` type, band-cap lines, the Steady Presence radius. | fixed | `PerkId[]` at classes.ts:134, world.ts:681/683, radius 3.5. |
| N4 | note | Hard-coded v6 and v7. | fixed | "`SAVE_VERSION = (S4-FIX-SAVES version) + 1`", defined once in campaign-arc. |
| N5 | note | Formula ranges: press minimum, orb radius. | fixed | Press is 2.5–30 s (5.5–30 at the defaults). The orb radius is 1.2–10.2. |
| N6 | note | `rival_challenge` doubled the bounty with no knob. The oracle wording. | fixed | `bountyMult` was added to `spawnBand` and the tuning knobs. The oracle reads "Pay 40 g (one retrain)". |

## Holism and scenario findings (Phases 3–4)

| ID | Sev | Finding | Verdict | Change |
| --- | --- | --- | --- | --- |
| H1 | blocking | A garrison or host retreat contradicts "victory destroys the lair / wins the arc". | fixed | Garrisons and the host have `retreatAt` forced to 0 (ai-doctrines R5, campaign-arc R4). |
| H2 | blocking | A KO'd captain pays his bounty and comes back. | fixed | A KO'd captain is captured (`captainDead`) and leaves the band, so the bounty is paid at most once. |
| H3 | blocking | Post-game rewards undefined (reborn hosts, hoards, pity). | fixed | No reborn hosts. A reborn-lair win drops only a missing legendary set piece, no hoard and no pity, with a 10-day cooldown. |
| W4 | warning | Attention budget: 6 active systems. | fixed | controls R10b: Feint and Orb unlock after the 3rd battle, and Works after the first camp. Live online has no Then or Advance-to-range chips. At most 4 kinds of interactive control. Plus a readability playtest row at 20 men. |
| W5 | warning | The enemy feint was hidden intent (an anti-pillar). The bait triggered on any advance. | fixed | A feint marker on the badge for both sides. Pursuit needs an advance or charge targeting the feinting group. |
| W6 | warning | The bounty was 80–180% of battle gold, with no sink. | fixed / partly deferred | The bounty was cut to 15 + 5·L (30–65 g), and the arc's gold target now says so. **Endgame gold sink: the forge reroll stays deferred**, and is recorded as a known gap. |
| W7 | warning | Retreating bands double-dip rewards. | fixed | A retreat win pays no 60 g bonus. `rival_returns` brings the band back at full size. |
| W8 | warning | Army break vs Raise. Stacked shocks. | fixed | Army break wins (F-O R6, abilities R5.3). A balance row was added: the cascade reaches at most 2 more groups. |
| W9 | warning | The why-line always blamed army break. No retreat-win line. | fixed | Army break moved to the last real rule. Added "They withdrew at {t}". |
| W10 | warning | Tier 3 arrives at day 30 (about 36 battles). No catch-up. | fixed | `TIER3_DAY` = 50. A volunteer floor: under 5 men, up to 3 volunteers at 20 g each. |
| W11 | warning | Host size followed the men you field, which you control. | fixed | Sized from the fit roster when `host_musters` fires. |
| W12 | warning | Routing and garrison-stakes duplication. | fixed | Covered by W2 and B4. The arc table now says it covers all 6 lairs. |
| W13 | warning | Ridge + works + orb turtle. | fixed | Balance row: at most 70%. swarm and hammer get a stand-off rule (ai-doctrines R5). |
| W14 | warning | The event EV check couldn't see bounties. | fixed | `spawnBand` is valued at p_win × (win gold + bounty) − deaths × 60. |
| N15 | note | Flank threat shown only after the hit. | fixed | A dashed flank-threat arc before contact (presentation only). |
| N16 | note | Gear power drifts toward "stats decide". | **deferred** | Check it in the items balance pass, keeping item deltas at or under 10 pts. |
| N17 | note | Retrain is cheap. | **deferred** | Keep 40 × tier for now and revisit after the perk-path playtest. |
| N18 | note | A ladder ticket can expire mid-battle. | fixed | A countdown from 5 min out. An expired run is verified but grants no rewards. |
| N19 | note | Captain state after a failed assault. | fixed | The next-highest hero is promoted on regrowth. |
| N20 | note | `deserters` said four men, but grants two. | fixed | "Two free spears". |
| N21 | note | `nextBattle +50% gold` stacking. | fixed | Applied after the goldBonus cap, to battle gold only. |

## Deferred, with owner

1. **The endgame gold sink**: the forge reroll (W6, MECH E2). Owner: the items pass.
2. **The item-power cap check** (N16). Owner: the items pass, through `npm run balance`.
3. **The retrain cost scaling** (N17). Owner: the abilities epic, after its playtest.

## Process notes

- **Director gates.** CD-PILLARS, AD-CONCEPT-VISUAL, TD-FEASIBILITY and PR-SCOPE were skipped (lean review mode). Feasibility and scope are **NOT ASSESSED** by a producer or a technical director.
- **Not yet measured.** Every balance target is a target. Each epic must run `npm run balance` with the new harness rows its GDD names.
- **Gates for this docs-only change**: `npx tsc --noEmit` exited 0 (run against v5's installed `node_modules`).
