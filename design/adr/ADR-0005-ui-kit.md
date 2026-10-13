# ADR-0005: The UI kit's control contract

## Status
Accepted

## Date
2026-10-10

## Last Verified
2026-10-10

## Decision Makers
Autonomous v5 run (story F-02). The user was asleep and delegated the call; the Director assigned the tab bar case fix.

## Summary
Every menu screen builds its controls from the v4 kit (`src/ui/mosaic/**`, `src/ui/kit.ts`), but the kit let screens pick colours, sizes and overflow by hand, so grey live buttons (G2), "!" badges (G11), 4 UI px tab labels (G10), cut numbers (G14) and lists with no scroll cue (G9) shipped. This ADR makes the kit the place where those rules live: a control's look comes from its role, its rules are pure functions in `src/ui/mosaic/policy.ts` with unit tests, and screens keep their existing API.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Phaser 3.90 (ADR-0003) |
| **Domain** | UI |
| **Knowledge Risk** | LOW. Containers, BitmapText, Graphics (`fillRect`, `fillCircle`, `strokePath`), canvas textures and `setInteractive` with a rectangle, all stable in 3.x. No WebGL-only call (the scroll cue uses stacked alpha bands, not `fillGradientStyle`, so the Canvas fallback of `Phaser.AUTO` draws it too). |
| **References Consulted** | `design/art/art-bible.md` §4.2, §7.2, §7.3; `design/ux/interaction-patterns.md` P1-P3, P7, P17-P19, P21; `design/accessibility-requirements.md` A11Y-05..A11Y-10; `docs/v5/audit/UI.md` G2, G9, G10, G11, G13, G14, MENU-3, DUE-5, HRO-5/7, ARM-7, BTL-6, SHP-2; `docs/v5/DECISIONS.md` V5-045, V5-046 |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `tests/mosaic.test.ts` (policy, tab geometry, colour roles); `scripts/layout-check.mjs` (24 configurations); `scripts/smoke.mjs`, `scripts/tutorial-smoke.mjs`; before/after shots in `docs/v5/stories/F-02/`. |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0003 (Phaser 3.90). F-01's tokens (`COLOR_ROLE`, `TEXT_MIN`, `DISPLAY_MIN`). |
| **Enables** | F-03 (overlays use the same button roles), F-05 (the Kit's variant x state grid), HUB-01 (tab bar and hubs), IN-02 (layout-check rules for 44 pt and text size), every screen story that adopts `wrap` and the badge rule. |
| **Blocks** | Stories that reference "ADR-0005 (pending)": F-01, F-03, F-05, HUB-01. |
| **Ordering Note** | Visual changes land in the kit only; screens change with their own stories. |

## Context

### Problem Statement
The audit found the v4 shell right and its controls wrong in ways a screen author could not see: `neutral` drew grey cut stone, which the art bible reserves for disabled, so Close, Flee, Dismiss, Undo, the "−" stepper and the pager arrows looked dead. Labels shrank to 4-5.5 UI px to fit. The tab bar wrote "Campaign" in Inter beside "DUELS" in Cinzel at 320 px. A badge could say "!". A chip cut "1…." out of a number. Fixed heads left slivers of list with nothing saying more was below.

### Constraints
- Live players: no control may be lost; every screen keeps rendering through the same API (story AC6).
- Only the kit's files change in this story; screens adopt new options in their own stories.
- Phaser 3.90, no new dependency, portrait 390x844 design, must pass at 360x780 and 320 width, en and ru.

### Requirements
- One terracotta primary, bronze secondary, grey disabled only (AC1).
- 44 pt hit areas, a pressed and a disabled state on every control (AC2, A11Y-06).
- Badges only for actionable counts (AC3, G11).
- A scroll cue on clipped content; must-show facts wrap (AC4, G9, G14).
- No meaningful kit text under 6.5 UI px (A11Y-09, F-01 AC4's kit half).

## Decision

**Roles, not colours.** A control names its role and the kit maps it to a surface. Grey (`btnStone`, `tileOff`) is drawn only for a disabled control.

| Role | MButton | MIconButton | KeyButton | v3 Button | Surface |
|------|---------|-------------|-----------|-----------|---------|
| The one action to take now | `primary`, `primaryHero` | `primary` | `primary` | `primary` | terracotta, raised |
| Any other action | `secondary` | `secondary` | `bronze` | default | bronze, raised |
| A quiet action (Close, Flee, Dismiss, Undo, an unpicked filter) | `neutral` | `neutral` | `stone` | `ghost` | **dark bronze**, raised (was grey stone) |
| The toggle in force | `lit` (new) | `selected`, `lit` | `lit` flag | `buttonSel` | lit bronze with ink label |
| Not available | `disabled` + reason | `off` | `disabledReason` | `buttonOff` | flat grey, no bevel/rim/shadow, faded label, **a lock**, the reason on tap |
| Destroys something | (wine, via v3 `destructive`) | | | `destructive` | wine |
| Real money | `purchase` | | | `purchase` | blue |

The variant names stay (`neutral`, `stone`, `ghost`), so no screen changes; only what they draw changes. `MActionBar`'s `selected` slot now draws `lit` instead of the old stone.

**States.** Every kit control has a hit area of at least `TAP` = 22 UI px (44 pt) both ways (MButton width and a tappable MChip now enforced too), a pressed state (the face sinks or the surface swaps; the tab bar and segmented switch dim while held) and a disabled state (flat grey plus a lock: the lock replaces a labelled button's icon, sits in an icon button's corner, and replaces a segment's icon), so state is never colour alone (G13). Tabs are never disabled: every mode hub opens and says itself what is locked.

**Type.** Labels never go under `TEXT_MIN` (6.5): MButton, StoneTile, SegmentedSwitch, RoundButton, badges, the icon button's count, the empty-state hint, the v3 Button, and `mtext`'s Cinzel step-down all stop at 6.5, then write the words in Inter, then cut as a last resort (with the full text as the long-press tip). A row of labels shares one face, case and size (`fitTabLabels`, `switchLabelStyle`): Cinzel capitals while all fit, else Inter in sentence case; never "Campaign" beside "DUELS" (MENU-3).

**Tab bar.** Slots follow their labels (`tabSlotWidths`): each label gets its room, the two sides stay equal so the War medallion stays centred, spare width keeps slots equal. Styles tried in order: Cinzel 7, Cinzel 6.5 (P19), Inter 7, Inter 6.5, Inter 6. The selected tab gains a bronze rim on its parchment block.

**Badges.** `badgeText(n)`: a count of things to act on, "99+" at most; nothing for 0, negatives or empty; a non-number ("!") becomes a small dot. The disc is `alert` red with a cream ring (red on stone alone is 2.08:1).

**Overflow.** `mtext(..., { maxW, wrap: true })` wraps a must-show fact (`wrapWords`: never breaks or cuts a word). `chipText`: a chip shrinks a number to 6.5, then writes it short (`fmtNum`: 12K), never "1…."; only a word may be cut. A disabled tile's reason wraps without a line limit.

**Scroll cue.** `ScrollArea` draws a shade on any edge that hides content and a chevron at the bottom right while there is more below (`scrollCue`), over the content and never taking taps. `new ScrollArea(..., S, { cue: false })` opts out.

### Architecture Diagram

```
screen code ──(role: variant, off, badge, wrap)──▶ kit component (src/ui/mosaic/*.ts, kit.ts)
                                                      │ rules            │ surfaces
                                                      ▼                  ▼
                                        src/ui/mosaic/policy.ts   src/art/mosaicUi.ts
                                        (pure, tested: badges,    (procedural canvas,
                                         wrap, chips, sizes,       colours from MOSAIC
                                         row style, scroll cue)    tokens; buttonLook())
                                        src/ui/mosaic/tabLayout.ts (pure: tab slots, label style)
```

### Key Interfaces

```ts
// src/ui/mosaic/policy.ts (pure)
badgeText(n: number | string | undefined | null): string | null
wrapWords(str: string, maxW: number, width: (s: string) => number): string[]
chipText(val: string, room: number, big: number, width: (s: string, size: number) => number): { text: string; size: number }
buttonLabelSizes(h: number): number[]
switchLabelStyle(items: { label: string; room: number; bare?: number }[], measure): { face: 'roman' | 'body'; size: number; icons: boolean }
scrollCue(scroll: number, max: number): { above: boolean; below: boolean }
// src/ui/mosaic/tabLayout.ts (pure)
tabSlotWidths(VW: number, labelW: number[]): number[] | null
fitTabLabels(VW: number, labels: string[], measure): { style; texts; widths; slots }
tabLayout(VW: number, count = 5, widths?: number[]): TabLayout   // widths optional: old calls unchanged
// additive options
type MButtonVariant = ... | 'lit';  SwitchOption.off?: string;  TextOpts.wrap?: boolean;
new ScrollArea(scene, parent, x, y, w, h, S, opts?: { cue?: boolean });
// src/art/mosaicUi.ts
buttonLook(style: MosaicStyle): BtnLook | null   // null = the flat disabled face
```

### Implementation Guidelines
- A screen **must** pick a role, never a colour: `primary` once per screen; `neutral` for Close/Flee/Dismiss/Cancel; `disabled` only with a reason.
- A screen **must never** draw grey (`off`, `slab*`, `btnStone`, `tileOff`) on an enabled control; `tests/mosaic.test.ts` holds that no raised button face is grey.
- A toggle **should** use `lit` / `selected` for the state in force, not `secondary` vs `neutral` (DuelScene's use buttons and StashGrid's filters still do; their stories switch).
- A badge **must** be a count of something actionable; pass 0 or `undefined` when there is nothing to do. Do not pass "!".
- A must-show fact (a number, a cost, a reason, a reward line) **must** use `wrap: true` or a chip, never `maxW` alone.
- New pure rules go into `policy.ts` with a test; Phaser components only call them.

## Alternatives Considered

### Alternative 1: Fix the colours screen by screen
- **Description**: Change each `neutral` call site to `secondary`.
- **Pros**: No kit change.
- **Cons**: Dozens of files owned by other stories; toggles built as `on ? 'secondary' : 'neutral'` would lose their state; the next screen repeats the bug.
- **Rejection Reason**: The rule belongs in the kit, and the story owns only the kit.

### Alternative 2: Make `neutral` identical to `secondary`
- **Description**: Draw both as standard bronze, as the art bible's role table literally reads.
- **Pros**: Simplest.
- **Cons**: Several screens use the pair as a toggle (Duels use buttons, stash filters); both states would look alike.
- **Rejection Reason**: Information loss. Dark bronze keeps the pair distinct while both read as live.

### Alternative 3: Tab labels by per-tab best fit
- **Description**: Each tab picks its own face and size (today's code).
- **Rejection Reason**: That is the "Campaign" beside "DUELS" mix (MENU-3).

### Alternative 4: Shrink the medallion or move it off-centre to keep Cinzel tabs at 7 on every phone
- **Rejection Reason**: The medallion is centred on the frame's symmetry; an off-centre medallion reads as a bug. Short i18n labels are the right fix (P7) and belong to the i18n owner.

## Consequences

### Positive
- Close, Flee, Dismiss, Undo, the pager arrows, the "−" stepper and the stash filters read as live on every screen at once (G2, HRO-5/7, ARM-7, BTL-6, SHP-2).
- Tab labels go from 8-11 CSS px to 13-14 CSS px (12 in English at 320), one style per bar.
- Disabled controls carry a lock; badges are counts or a quiet dot; chips never cut numbers.
- Every clipped scroll area shows it has more.

### Negative
- Labels that used to squeeze in as 5.5 Cinzel now fall back to Inter sentence case (e.g. the hub's "Continue the march" at 320 px); some segment and tab icons drop to make room for their label.
- English tabs are Inter below 390 px until short labels exist.
- The War medallion is smaller on narrow phones and in English at 390 (40 UI px instead of 46) so its neighbours' labels fit.
- A scene that draws its own bottom fade now also gets the kit's shade.

## Risks
- A screen that relied on a 5.5 label fitting now shows "…": the long-press tip carries the full label; layout-check's text-overflow rule still guards boxes. Mitigation: full layout-check run, before/after shots.
- Taller StoneTile captions and RoundButton labels (9 px lines): `totalH` and `RoundButton.size()` report the new heights, so screens that use them stay laid out.

## GDD Requirements Addressed

| Source | Requirement | How This ADR Addresses It |
|--------|-------------|---------------------------|
| art-bible.md §4.2, §7.3 | Grey means disabled only; disabled is flat with a reason or a lock | Role table; `neutral` is dark bronze; disabled draws a lock; `buttonLook` test |
| art-bible.md §7.2, P19 | Cinzel caps for tabs and buttons; minimum sizes | `fitTabLabels`, `switchLabelStyle`, `buttonLabelSizes` |
| accessibility-requirements.md A11Y-05, -06, -07, -09 | Red only for alerts, 44 pt targets, 4 pt in the tab bar, 6.5 UI px text | Badge rule, `TAP` on every control, `TAB_GAP` 3, `TEXT_MIN` floor |
| interaction-patterns.md P17, P18, P21 | Compact numbers, count badges, fade + chevron | `chipText`, `badgeText`, `scrollCue` |
| UI.md G9, G11, G14 | Scroll cue, badge inflation, truncation | as above, plus `wrap` |

## Performance Implications
- **CPU**: one Graphics redraw per scroll change per scroll area (a few rects); tab layout is arithmetic on five numbers.
- **Memory**: no new textures except the button surfaces already cached per size.
- **Load Time**: none.
- **Network**: none.

## Migration Plan
Nothing to migrate: every existing call keeps its meaning and gets the new look. Follow-ups by owner: DuelScene and StashGrid toggles to `lit`/`selected` (their screen stories); short tab labels and the i18n keys (HUB-01); the Kit gallery's own `Tabs` row (`src/ui/widgets.ts`, F-03); the layout-check text-size rule (IN-02, with the existing violations allowlisted by owner); the battle HUD's KeyButton label sizes (RD-01 / BTL-01).

## Validation Criteria
- `tests/mosaic.test.ts` green: no raised face is grey; tab labels one style, centred medallion, hit areas >= 22 UI px at 320-430 px in en and ru; badges, wrap, chips, scroll cue.
- `scripts/layout-check.mjs` passes on all 24 configurations with no new allowlist entry.
- Before/after shots of the Kit, the menu hub, the Duels hub and the Close / Dismiss dialogs at 390, 360 and 320, en and ru.

## Related
- ADR-0003 (engine version), ADR-0004 (input layer).
- `design/art/art-bible.md`, `design/ux/interaction-patterns.md`, `docs/v5/audit/UI.md`, `docs/v5/stories/F-02/NOTES.md`.
