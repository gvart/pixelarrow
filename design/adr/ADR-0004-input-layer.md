# ADR-0004: Battle input layer

## Status
Accepted

## Date
2026-10-10

## Last Verified
2026-10-10

## Decision Makers
Autonomous v5 run (story IN-01, decision V5-023 for the controls it prepares). The user was asleep and delegated the call.

## Summary
Battle pointer handling lived inside the 3,061-line `BattleScene.ts`, mixed with camera, HUD and rendering code, so the controls epic could not change the hit-test priority (PLAY C1) without touching the whole scene. This ADR moves gesture recognition and the press hit-test into pure, unit-tested modules under `src/ui/input/`; the scene only routes Phaser's pointer events to them and carries out the result.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Phaser 3.90 (ADR-0003 Rejected the 4.x upgrade, V5-028) |
| **Domain** | Input |
| **Knowledge Risk** | LOW. The scene uses only `this.input.on('pointerdown' / 'pointermove' / 'pointerup' / 'pointerupoutside' / 'wheel')`, `input.manager.pointers` and `Pointer.{id, x, y, isDown}`, all stable in 3.x. The new modules import no Phaser. |
| **References Consulted** | `design/gdd/controls.md` R1, R2, R11; `docs/v5/audit/PLAY.md` (C1, C2, C4, C6, Keep list); `docs/v5/audit/UI.md` BTL-10; `docs/v5/audit/NAV.md` (the dead ring) |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `tests/input.test.ts` (hit-test and gestures), `tests/drag.test.ts` (drag maths), `scripts/smoke.mjs` touch section (pan, drag-to-move, knob, cancel, pinch cancels, tap-to-move, pinch zoom), `scripts/tutorial-smoke.mjs`. |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0003 (engine version: Phaser 3.90) |
| **Enables** | CT-01 (selection priority, the knob sends `face`), CT-02..CT-07 (targeting, undo, staging, camera), IN-02 (menu input contract) |
| **Blocks** | The battle controls epic (EP-11) stories that change pointer behaviour |
| **Ordering Note** | IN-01 is behaviour-preserving. Behaviour changes land in later stories, one per wave on `BattleScene.ts` (SPRINTS.md R1). |

## Context

### Problem Statement
The battle's touch controls work (PLAY "Keep": drag to move, drag the knob to turn, pan on empty ground, pinch, tap to move), but the code that decides what a press means was spread over `onDown`, `onMove`, `onUp`, `grabAt` and `tap` inside `BattleScene`, reading the camera and the sim directly. Nothing of it could be unit-tested, and the controls GDD needs to change exactly that logic: a press on another group's soldier must beat the knob (C1), new previews, undo and a queue hang off the same gestures. A dead radial ring (`this.ring` was never assigned) still shaped `onDown` and the idle hint copy (BTL-10).

### Constraints
- Live players: no existing control may change or be lost in this step.
- No sim change, no new npm dependency, Phaser 3.90.
- Touch first (portrait, 390x844 design, 360 and 320 widths), mouse and wheel on Telegram Desktop.
- `BattleScene.ts` is a hotspot owned by one story per wave: the scene diff must stay small.

### Requirements
- A pure `hitTest(state, point)` with unit tests.
- A gesture recogniser for tap, pan, formation drag, long press and pinch, testable without a browser.
- The scene only routes events and carries out results.
- The radial ring removed, with its copy rewritten.

## Decision

Two pure modules under `src/ui/input/`, no Phaser imports:

- **`hitTest.ts`**: `hitTest(state: HitState, p: Pt): Hit`. `HitState` is a snapshot in screen px that the scene builds from the sim and the camera (`BattleScene.hitState()`): visible men, group tags, the selection's body points and knob, and the radii. A press is resolved twice, because one finger can still become either gesture:
  - `grab`: what a drag would take hold of. The knob turns, the body moves, the closer wins, a tie goes to the knob. That is today's rule; CT-01 changes it to controls.md R1.1 (another group's soldier wins) in this one function.
  - `tap`: first match wins: a group tag, then the nearest man in reach (own: select, enemy: attack or show who), then the ground (move).
  
  `tapSelect(sel, unit, individual)` is the selection rule for a tap on your own man (select the group, Solo, back to the group, a lone hero).
- **`gestures.ts`**: `GestureRecognizer`, a small state machine. `down / move / up` take the pointer, the pointers down and a probe or predicate, and return `GestureEvent[]` (`press`, `pan`, `drag-start`, `drag-move`, `drag-end`, `tap`, `release`, `pinch-start`, `pinch`, `pinch-end`). `hold(press)` turns a still-pending press into info (the long press). It owns the thresholds' logic; the scene passes the values (`DRAG_PX`).

`BattleScene` keeps the Phaser side: it subscribes to the pointer events, builds the `HitState`, and in `onGestures()` carries out each event (camera scroll and zoom, the drag plan from `dragFormation.ts`, orders, haptics, the tutorial's events, the terrain tooltip).

The radial ring (`src/ui/radialOrders.ts`) is deleted; its order list became the order row's `orderKeys()`. The idle hint is the new `battle.sit.idle` ("Tap a group, then an order below.").

### Architecture Diagram

```
Phaser pointer events ──▶ BattleScene.onDown/onMove/onUp   (routing only)
                              │  probe: hitTest(hitState(), p).grab
                              ▼
                    GestureRecognizer (src/ui/input/gestures.ts, pure)
                              │  GestureEvent[]
                              ▼
                    BattleScene.onGestures()  ──▶ camera, dragFormation, command(), tutorial
                              │  tap
                              ▼
                    hitTest().tap + tapSelect (src/ui/input/hitTest.ts, pure)
```

### Key Interfaces

```ts
hitTest(s: HitState, p: Pt): { grab: DragKind | null; tap: TapHit }
tapSelect(sel: Selection, unit: { id; group }, individual: boolean): Selection
class GestureRecognizer {
  down(p: Ptr, downs: Ptr[], zoom: number, probe: () => PressProbe): GestureEvent[];
  move(p: Ptr, downs: Ptr[], canDrag: () => boolean): GestureEvent[];
  up(p: Ptr, downs: Ptr[]): GestureEvent[];
  hold(press: Press): boolean;
}
```

### Implementation Guidelines
- New pointer behaviour goes into `src/ui/input/` first, with a test, then into the scene's `onGestures()` switch.
- Keep `HitState` a plain snapshot; never pass the scene or the sim into `src/ui/input/`.
- Keep the knob's tuning constants in `src/ui/dragFormation.ts` (controls.md "Tuning Knobs").
- Radii: `GRAB_PX` and `TAG_PX` scale with the render scale (`px()`). The man tap radius `UNIT_TAP_PX` is 30 device px and does not; this is kept as it was and left for CT-01 to revisit with R1's 44 pt targets.

## Alternatives Considered

### Alternative 1: A host-callback controller
A controller holding a `host` interface (camera, sim, orders) and calling it. Rejected: the tests would need a fake host for every case, and the controller would still read game state through it. Returning events keeps the recogniser free of the game.

### Alternative 2: Phaser interactive zones per soldier and per knob
Let Phaser's input plugin hit-test sprites. Rejected: priority between overlapping zones (C1) is what the GDD needs to control, Phaser resolves it by depth, and it cannot be unit-tested.

### Alternative 3: Keep the ring code for a later return
Rejected: it was never shown in v4, it bent `onDown` around a ring that did not exist, and the controls GDD has no ring.

## Consequences

### Positive
- The C1 fix (CT-01) is a change to `grabAt` plus a test.
- 28 unit tests cover the hit-test and the gestures.
- 214 lines of dead UI removed; `onDown` loses the ring special case.

### Negative
- One more indirection: a pointer event goes through the recogniser before the scene acts.
- `HitState` is rebuilt on each press and tap (a pass over the views); cheap at battle sizes, but not free.

## Risks
- A behaviour drift hidden by the refactor. Mitigated by the smoke run's touch section, the tutorial smoke and a scripted touch playtest at 390x844 and 360x780 (`docs/v5/stories/IN-01/`).
- The tutorial host still has a `showRing()` member, now a no-op; the tutorial owner removes it.

## GDD Requirements Addressed

| GDD | Requirement | How |
|-----|-------------|-----|
| controls.md R1.1 | Hit-test priority, unit-tested on a pure function | `hitTest()`; today's order is pinned in a test and CT-01 changes it there |
| controls.md R2.3, R2.5 | Cancel by lifting at the start; two fingers never order | `gestures.ts`, tested |
| controls.md R11 | Targets | Radii are parameters of `HitState`, ready for 44 pt |
| UI.md BTL-10 | Dead ring copy | `battle.sit.idle` |

## Related
- `design/gdd/controls.md`, `docs/v5/DECISIONS.md` V5-023
- `src/ui/input/hitTest.ts`, `src/ui/input/gestures.ts`, `src/ui/dragFormation.ts`
- `tests/input.test.ts`, `tests/drag.test.ts`
