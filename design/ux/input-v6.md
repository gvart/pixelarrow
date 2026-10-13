# UX Spec: Mouse and Keyboard (v6 input)

> **Status**: Draft (P2-UX-INPUT), for `/ux-review`
> **Date**: 2026-10-13
> **Platform Target**: every v6 device. Touch stays exactly as in v5 (`design/gdd/controls.md`). Mouse and keyboard are added for play.pixelarrow.app in a desktop browser, Telegram Desktop and Telegram Web, and hybrid devices (touch laptops, tablets with a keyboard).
> **Architecture**: [ADR-0012](../adr/ADR-0012-input-v6.md) (amends ADR-0004). Device facts come only from `platform.input` (`InputHints`, ADR-0006).
> **Source of the requirement**: `docs/playbook/director-brief-v6.md` goal 3, "Mouse and keyboard".
> **Supersedes**: the "keyboard/gamepad out of scope" lines in `hud.md` §accessibility, `interaction-patterns.md`, `screens-campaign.md` and `screens-modes.md` headers, and A11Y-22, for menus (see §9).

## 0. Principles

1. **Touch is unchanged.** Every touch gesture, hit-test rule and threshold in controls.md and ADR-0004 stays as it is. Mouse and keyboard are added next to touch; they never replace it.
2. **Actions, not keys.** Game code acts on named actions (§1). Keys and mouse buttons are data that can be rebound. A hotkey runs exactly the same code path as tapping its button, so the sim, the order log and replays can't tell the difference.
3. **One meaning per input.** A left press means what a finger press means. The right button and the keyboard add shortcuts; they never change what a left press does.
4. **No new mechanics.** Every hotkey issues an order that already exists (`order`, `form`, `face`, `focus`, abilities, Undo, Then…, pause, speed). The only new input is "turn 45°" (§3.4), which sends the existing `face` order (in deployment, `form`), so it is an input change, not a sim change.
5. **Offered only where it helps.** Key hints, the Controls settings page and keyboard tutorial lines appear only when `platform.input.keyboard()` is true. Hover and cursor states appear only for a mouse (`pointer.wasTouch === false`).
6. **A disabled action always says why.** A hotkey for a disabled control shows the same reason as tapping it (controls.md R4.4), and the button flashes so the player sees which control they hit.

## 1. Action map

Actions are grouped in **contexts**. A context is active while its screen or layer is on top (§4.1). Conflict detection runs only between contexts that can be active at the same time (§5.3).

| Context | Active when |
| --- | --- |
| `global` | always, unless a DOM text field has focus or a rebinding capture is open |
| `menu` | any screen or layer that has focusable controls (every screen) |
| `map` | World map, War map, Camp, and any other pinch-zoom map |
| `battle` | BattleScene, both phases, with no layer (sheet, menu, dialog) on top |
| `battle.deploy` | `battle` and `sim.phase === 'deploy'` |
| `battle.fight` | `battle` and `sim.phase === 'battle'` |

Each action has a kind:
- **press**: fires once on key down. Auto-repeat is ignored.
- **repeat**: fires on key down and again on the OS auto-repeat (steppers and list scrolling only).
- **hold**: a level the game reads each frame while the key is down (camera pan only). A single tap still moves a fixed step (§7), so it is never hold-only.

### 1.1 The action table, with default bindings

Bindings are **physical keys** (`KeyboardEvent.code`), so the same place on the keyboard works on QWERTY, AZERTY and the Russian ЙЦУКЕН layout. The label shown to the player comes from the active layout (§6.2). Each action has up to **two** bindings, a primary and a secondary. **No default needs a chord:** every action has a single-key binding (Sticky Keys and one-handed play work).

**Global and menus (not rebindable, see §5.4)**

| Action | Primary | Secondary | What it does |
| --- | --- | --- | --- |
| `back` | Esc | — | Closes the top layer, else `nav.back()` (the same as Telegram's BackButton and the browser's back). In the `battle` context it opens the ⋯ battle menu instead (§3.1). |
| `focus.next` / `focus.prev` | Tab / Shift+Tab | — | Moves focus in reading order (§4.2) |
| `focus.up/down/left/right` | Arrows | — | Moves focus spatially, or adjusts a focused stepper or segmented control (§4.3) |
| `activate` | Enter | Space | Activates the focused control |
| `scroll.page` | PageUp / PageDown | — | Scrolls the focused scroll area by one view; Home / End go to its ends |
| `help.keys` | / (shown as "?") | F1 | Opens the Keyboard shortcuts sheet (§6.4). Offline battles pause while it is open. |

**Battle: orders and groups (`battle.fight` unless noted)**

| Action | Primary | Secondary | Same as tapping |
| --- | --- | --- | --- |
| `order.advance` | Q | — | Order bar key 1, Advance |
| `order.charge` | W | — | Order bar key 2, Charge |
| `order.hold` | E | — | Order bar key 3, Hold |
| `order.shoot` | R | — | Order bar key 4, Shoot (Loose/Throw; toggles) |
| `order.fifth` | T | — | Order bar key 5: Withdraw, or Feint for a feint-eligible group (formations-orders.md R3) |
| `order.then` | F | — | The **Then…** chip (R6.2): arms the next order key as "on arrival". Only while the chip shows; otherwise it says why. |
| `order.undo` | U | Ctrl+Z (⌘Z on Mac) | The Undo chip (R4.1); in deployment, the 10-step deployment undo (R4.2) |
| `turn.left` / `turn.right` | , (shown "<") | . (shown ">") | New: turns the selected group 45° (§3.4). `battle` (both phases). |
| `group.1` … `group.9` | 1 … 9 | Numpad 1 … 9 | Selects the group whose card shows that numeral (stable numbering, R1.5). Pressing the number of the group that is **already selected** centres the camera on it (the card double-tap of R8.2, without a timing window). `battle` (both phases). |
| `ability.1` / `.2` / `.3` | Z / X / C | — | Medallions 1–3, top to bottom (abilities.md R4) |
| `ability.more` | V | — | The rail's overflow sheet ("more", hud.md Z5) |

**Battle: time and camera (`battle` unless noted)**

| Action | Primary | Secondary | Same as tapping |
| --- | --- | --- | --- |
| `time.pause` | Space | P | Pause / Play (top bar). `battle.fight`, not under `realtimeLocked`. |
| `time.faster` / `time.slower` | ] | [ | Steps the speed key up or down through this battle's speeds (`SPEEDS[pace]`). The speed key itself only cycles forward; the keys go both ways. |
| `cam.pan.up/down/left/right` | Arrows | — | Pans the field (hold). Turns Follow off, as a finger pan does. `battle` and `map`. |
| `cam.zoom.in` / `cam.zoom.out` | = (shown "+") | − | The zoom key (A11Y-14), one whole step in or out, anchored at the view centre. Numpad + / − are extra fixed aliases. `battle` and `map`. |
| `cam.follow` | G | — | The Follow eye (R8.1) |
| `menu.battle` | M | — | The ⋯ battle menu (hud.md §D; pauses offline). Esc also opens it in field mode: that is the fixed `back` action's meaning in battle (§3.1), not a binding, so it is not a conflict and survives any rebinding. |

**Battle: deployment (`battle.deploy`)**

| Action | Primary | Secondary | Same as tapping |
| --- | --- | --- | --- |
| `deploy.fight` | Enter | — | FIGHT / READY (R7). Only in the field (no control focused): with a control focused, Enter activates that control. |
| `deploy.shape` | S | — | The Shape chip (Shape sheet). Also in `battle.fight` where the chip is shown. |
| `deploy.groups` | A | — | Groups (Assign groups) |
| `deploy.works` | B | — | Works tray (field-works.md), when the player has works |
| `deploy.inspect` | I | — | The Inspect (i) toggle (A11Y-15) |

Reset all, Retreat, Leave deployment and Dismiss stay **menu-only** with their confirmations (P4). They get no default key, so a stray key press can never start a destructive flow. They are still listed in the Controls page, unbound, so a player who wants a key can add one; the confirmation sheet still opens.

### 1.2 Letter map at a glance

```
 1 2 3 4 5 6 7 8 9   groups            [ ]  speed      - =  zoom
 Q W E R T           the order bar, left to right
 A S . . . G         Groups, Shape, Follow
 Z X C V B           medallions 1-3, More, Works
 F  Then…   U  Undo   I  Inspect   M  menu   , .  turn
 Space  pause   Enter  FIGHT   Esc  menu (battle) / back   ?  shortcuts   Arrows  pan
```

The order keys are **positional**: Q to T map to the five order bar keys left to right, so the keycaps (§6.1) read in the same order as the bar. In left-hand mode (A11Y-16) the mapping stays the same: left-hand mode moves the rail and the eye, not the order bar.

## 2. Mouse

### 2.1 Hover states

| Target | Hover state | Tooltip (after `HOVER_MS` = 500 ms, as v5) |
| --- | --- | --- |
| Any kit button (MButton, KeyButton, chips, rows, tabs, toggles) | rim lightens one step (`hover` token), no movement; distinct from **pressed** (inset 1 px) and **focused** (ring, §4.4) | its existing long-press tip, plus the bound key: "Charge (W)" |
| A disabled button | no lightening; cursor `not-allowed` | the disabled reason (P3) |
| Own soldier, non-selected group | that group's field badge brightens and its formation box outline shows | group card summary (as long-press) |
| Own soldier, selected group | cursor `grab` (§2.4) | — |
| The selected group's knob | the knob scales 1.1× (none under Reduce motion) and the cursor is `turn` | — |
| Enemy soldier or badge, with a group of mine selected | a 50% preview of what a click would do: the dashed attack arrow with chevron (melee, R3.1) or the reticle (missile, R3.2); cursor `target` | enemy group info (as long-press) |
| Ground | nothing (no ghost: too noisy while moving the mouse) | terrain tip, as v5 (A11Y-15) |
| Map hex / node (World, War) | the existing selection outline at 50% | the existing tip |

Hover never changes state: moving the mouse never selects, orders or opens anything.

### 2.2 Buttons on the battlefield

The left button is a finger. The right and middle buttons add shortcuts.

| Input | On | Result |
| --- | --- | --- |
| Left press + drag | own selected group body / knob / non-selected soldier / empty ground | exactly as touch (R1.1 hit-test priority, R2): move drag, turn drag, select, pan |
| Left click | anything | exactly as a tap (select, Solo on a second click, attack/focus, tap-move, Inspect tip) |
| **Right click** | ground | the tap-move order for the selected group (R2.4: keep shape, face the nearest enemy, path line and ghost for 600 ms). Never selects. |
| **Right click** | enemy soldier or badge | attack (melee) or focus (missile), as R3.1/R3.2. A second right click on the focused enemy clears focus, as a second tap does. |
| **Right click** | own soldier, either group | nothing (a short "Right-click the ground or an enemy" hint the first 3 times). Right never selects, so it can't change the selection by accident. |
| **Right press + drag** (drag-to-order) | ground | **Move and face.** The selected group's ghost appears at the press point; dragging sets the facing (from the press point toward the cursor, snapped to 8 directions within 8°, as the knob). Release sends one `form` with that facing (the move-drag order, R2.1, with a new facing). Under `DRAG_PX` it is a plain right click. |
| Right drag, cancel | — | Esc, or a left click, during the drag cancels it; nothing is sent. |
| Middle press + drag | anywhere | pan, 1:1 with the cursor. Turns Follow off. |
| Any button, during deployment | — | the same rules with the deployment orders (`form` for move and turn), inside the deployment zone only, with the ✓/✗ ghost validity (A11Y-04) |
| Right click anywhere in the game | — | the browser context menu is suppressed on the canvas only (never on DOM text fields) |

With no group selected (rare: every group dead), a right click shows the idle hint (`battle.sit.idle`).

Online and `realtimeLocked`: unchanged rules. Right-click orders are ordinary orders, logged at the real tick.

### 2.3 Wheel and trackpad

| Input | Result |
| --- | --- |
| Wheel on the battlefield or a map | zoom one whole step (R8.3), **anchored at the cursor**: the world point under the cursor stays under it. v5 zoomed about the centre in battle and about the cursor on the War map; v6 uses the cursor everywhere. |
| Wheel over a list or sheet (ScrollArea) | scrolls it (as v5) |
| Trackpad two-finger scroll | the same as the wheel, through a delta accumulator: one zoom step per 100 px of `deltaY` (`deltaMode` line × 16, page × view height), at most one step per 120 ms. Small trackpad deltas no longer jump a step per event. |
| Trackpad pinch (`wheel` with `ctrlKey`) | zoom, by the same accumulator; `preventDefault` so the browser page doesn't zoom |
| Shift + wheel, or horizontal `deltaX` | pans horizontally on the field and maps |

### 2.4 Cursor states

Set on the canvas (`cursor` CSS); every custom cursor has a CSS keyword fallback, so the pixel cursor art is optional and can ship later (asset list in ADR-0012).

| State | When | Custom (16 px pixel art, 2× on hi-DPI) | Fallback |
| --- | --- | --- | --- |
| default | anywhere else | bronze arrow | `default` |
| pointer | over an enabled interactive control | bronze arrow with a spark | `pointer` |
| not-allowed | over a disabled control | arrow with a stone bar | `not-allowed` |
| grab | over the selected group's body | open gauntlet | `grab` |
| grabbing | during a move drag | closed gauntlet | `grabbing` |
| turn | over the knob, and during a turn drag or right-drag facing | curved arrow | `alias` |
| target | over an enemy, with a group selected | reticle | `crosshair` |
| pan | during a pan (left on ground, middle) | four-way arrow | `all-scroll` |
| wait | while a network action is busy (P1 busy) | hourglass | `progress` |

The cursor only changes on a mouse. Touch never sets it, and a pen behaves as a mouse when it hovers.

## 3. Keyboard in battle

### 3.1 Field mode and HUD focus mode

A battle has two keyboard modes:

- **Field mode** (the default): no focus ring is drawn; every battle hotkey (§1.1) is live. Space pauses, Enter starts the fight in deployment, Esc opens the ⋯ battle menu.
- **HUD focus mode**: pressing **Tab** puts focus on the HUD (the order bar first, then cards, medallions, Undo/Then, top bar, in reading order). Enter and Space activate the focused control; arrows move between controls; letter and number hotkeys still work. **Esc** leaves HUD focus mode back to field mode (it does not open the menu). A left click on the field also returns to field mode.

Esc opens the ⋯ menu in field mode, not `nav.back()`'s Retreat offer, because on a desktop Esc is the pause-menu key. The menu already holds Retreat, Leave, Reset all, Sound and Settings (hud.md §D). Telegram's BackButton and the browser's back keep their v5 behaviour (`nav.back()`).

While any layer is open over the battle (⋯ menu, Shape sheet, More, a confirm, Settings, the shortcuts sheet), battle hotkeys are **suspended**; only the `global` and `menu` actions work, and focus is trapped in the layer (§4.5). Closing the layer returns to the mode the player was in.

### 3.2 Orders

- An order hotkey acts on the **selected group**, exactly like its key in the bar, including the paused staging plan (R6.1), the Then… arming (R6.2), the Feint/Withdraw switch and the cooldown reason.
- The key in the bar shows its pressed state for 100 ms when its hotkey fires, so the player connects key and button.
- `order.then` (F) then an order key (Q–T) is the keyboard Then…: "F, W" = "Then… Charge". It is available only while the Then… chip is shown (3 s after a move, `THEN_CHIP_S`); otherwise F shows the hint "Then… follows a move order". Live online (`realtimeLocked`) there is no Then… chip (R10b), so F says why.
- `order.undo` (U) is the Undo chip while it shows; with no chip it says `undo.why.none`, as in deployment.

### 3.3 Groups

- 1–9 select by the numeral on the card and badge. An empty group's number does nothing and shows "No group 4" (cards for empty groups are hidden, R1.4).
- Pressing the number of the selected group centres the camera on it (RECENTRE_MS glide; a cut under Reduce motion). It turns Follow off, as the edge pointer tap does.
- Solo (detach a single hero or man, R1.2) stays pointer-only: it needs a soldier picked on the field.

### 3.4 Turn 45° (new input, existing order)

`turn.left` and `turn.right` rotate the selected group's facing by 45° about its centre, snapped to the 8 directions the knob snaps to (R2.2). In deployment this sends `form` (the knob's deployment order); in battle `face`, which keeps the current order (formations-orders.md R1). Each press is one order, so it is undoable with U. It gives the knob's turn a non-drag alternative (WCAG 2.5.7) for mouse and keyboard players alike. Touch keeps the knob.

### 3.5 Time and camera

- Space (or P) is the Pause/Play key. Under `realtimeLocked` it shows `pace.locked`.
- ] and [ step through this battle's speeds, saving the choice as the speed key does (A11Y-21). At the end of the range they show "Fastest for this battle" or "Slowest for this battle".
- Arrows pan in screen space at a constant 600 UI px/s whatever the zoom, frame-rate independent, with a 120 ms ease-in to full speed and a stop with no drift (no inertia). A single short press pans 48 UI px. The pan is clamped to the field bounds as a finger pan is, and turns Follow off.
- `=` / `-` zoom one whole step about the view centre; G toggles Follow.

### 3.6 Deployment

Enter is FIGHT/READY only in field mode. FIGHT has no confirmation in v5 (R4.3), and a mistaken Enter is as cheap as a mistaken tap, so none is added. A, S, B and I open Groups, Shape, Works and toggle Inspect; 1–9 select; the turn keys turn the placement; U steps the 10-step deployment undo.

### 3.7 Pointer targeting stays a pointer job

Moving to a point, choosing an enemy to attack or focus, placing works and Solo need a pointed position on the field. v6 does not add a keyboard cursor for the field: Charge already targets the nearest enemy group, and the mouse is present on every keyboard device in scope. This is recorded as the remaining keyboard deviation (§9).

## 4. Keyboard focus in menus, sheets, tabs and dialogs

### 4.1 Where focus lives

- Every screen registered with the NavStack (`registerScreen`) is a **focus scope**; every `navLayer` (sheet, modal, confirm, toast with an action) is a nested scope on top of it. Focus can only be in the **top** scope.
- Every kit control is focusable automatically, in the same single place that wires the hover tip today (`tappable` and `Button` in `src/ui/kit.ts`, plus MButton, KeyButton, Toggle, Stepper, Segmented, TabBar, TabStrip, ParchmentRow, StashGrid cells). No screen hand-codes focus.
- Disabled controls **stay focusable**, so a keyboard player can read the reason (P3): Enter on one shows the reason, as a tap does.
- Decorative or read-only items (badges, bars, labels) are not focusable.

### 4.2 Tab order

Reading order: by the control's top edge in 8 UI px bands, then left to right (right to left is not needed: no RTL locale). Tab wraps from the last control to the first. Regions are visited in this order on hub screens: top bar → content (scroll area) → action bar / footer → tab bar. A scope can override the order for a region where reading order is wrong (the battle HUD lists the order bar first).

### 4.3 Arrows

- Arrows move focus **spatially**: to the nearest control whose centre lies in that direction (within a 45° cone, distance weighted by off-axis offset). With nothing in that direction, focus stays.
- Inside a **group** (a tab bar, segmented control, the order bar, a grid such as the stash, a row of chips), Left/Right (and Up/Down in a grid) move within the group, and Tab leaves the group. Tabs use **manual activation**: arrows move focus between tabs, Enter or Space switches. Switching a hub tab rebuilds a scene, which is too heavy to do on every arrow.
- On a focused **stepper**, Left/Right (and − / =) change the value, with key auto-repeat (the stepper's long-press repeat). On a **segmented** control, Left/Right change the selection directly (it's cheap). On a **toggle**, Enter/Space flip it.
- In a **scroll area**, moving focus to a control that is clipped scrolls it fully into view (the 10 px scroll cue stays visible). PageUp/PageDown scroll by one view without moving focus off-screen: focus moves to the first fully visible control.

### 4.4 The focus ring

- A two-tone ring: a 1 UI px basalt outer line and a 2 UI px cream inner line, 2 UI px outside the control's bounds, following its corner radius. Two tones keep 3:1 against both parchment and stone (A11Y-02); add the pair to `CONTRAST_PAIRS`.
- It is a shape, not a colour change (A11Y-04), and it never changes the control's size or position.
- **Focus-visible rule**: the ring shows only after a keyboard focus action (Tab, arrows). A mouse click or touch hides it; the focus position is kept, so the next Tab continues from the clicked control.
- It slides between controls in 80 ms (ease-out); under Reduce motion it jumps.
- It is drawn above the scope's content and under any toast; the Kit page "States" shows the real Focused state (replacing the v5 stand-in, `src/scenes/kit/statesPage.ts`).

### 4.5 Opening, closing and Esc

- **Initial focus.** When a screen or layer opens, focus goes to its default control: a decision sheet's primary (P12), but in a **destructive confirm (P4) the safe choice (Cancel / Fight on)**, never the danger button; a list screen's first row; otherwise the first control in reading order. The ring is not drawn until the player uses the keyboard (§4.4).
- **Trap.** Tab and arrows never leave the top layer while it is open.
- **Esc** closes the top layer (`navLayer` close, which may refuse, e.g. a dialog that must be answered), else calls `nav.back()`. On a root screen Esc does nothing (it never closes the app; Telegram's Close stays a deliberate click).
- **Restore.** When a layer closes, focus returns to the control that opened it, or to the scope's default if that control is gone.
- **Tooltips.** When focus rests on a control for `HOVER_MS`, its tip shows (the same as hover); it hides on the next key.

### 4.6 Text fields

The DOM prompt (`textInput.ts`, P26) keeps native browser behaviour: typing, Enter = OK, Esc = Cancel (v5). While a DOM field has focus, the game ignores every key (no hotkey fires while typing a clan name). When the prompt closes, focus returns to the control that opened it.

### 4.7 Maps (World, War, Camp)

Tab and arrows reach the HUD (top bar, the map's action bar, the zoom key). When no HUD control has focus (after a click on the map, or Esc from HUD focus), arrows pan and = / − zoom (`map` context), and the wheel zooms at the cursor. Campaign nodes on the World map are focusable in reading order (there are few); War-map hexes stay pointer-only (§9).

## 5. Rebinding in Settings

### 5.1 Where

- A new Settings section **Controls** (keyboard icon) with one row, **Keyboard shortcuts**, which opens a nested page (P13).
- The section exists only while `platform.input.keyboard()` is true. It appears as soon as `InputHints.onChange` reports a keyboard (a tablet that just paired one), without reopening Settings. Touch-only devices never see it.
- The section also holds the toggle **Show key hints** (default On, §6.1).

### 5.2 The Keyboard shortcuts page

```
┌ Keyboard shortcuts ──────────────────── ✕ ┐
│ ORDERS                                    │
│ Advance            [ Q ]  [ + ]           │
│ Charge             [ W ]  [ + ]           │
│ Undo               [ U ]  [Ctrl Z]     ↺  │  ← ↺ only on a changed row
│ ...                                       │
│ GROUPS · ABILITIES · TIME · CAMERA ·      │
│ DEPLOYMENT · MENUS (fixed, read-only)     │
│                                           │
│ [ Reset all to defaults ]                 │
└───────────────────────────────────────────┘
```

- Sections follow §1.1. Each row: the action's name (the same i18n label as its button), two binding chips (primary, secondary; an empty secondary shows "+"), and ↺ (reset this row) when the row differs from the default.
- Rows are ParchmentRows (44 pt), fully keyboard-navigable: arrows move between chips, Enter starts capture.
- The fixed actions of §5.4 are listed read-only under MENUS so the player knows them.

### 5.3 Capturing a key and conflicts

1. Enter (or a click) on a chip opens the **capture sheet**: "Press a key for Charge", with **Clear** and **Cancel** buttons. Esc cancels. There is no timeout.
2. Modifier keys alone (Shift, Ctrl, Alt, ⌘) wait for a key; a chord such as Ctrl+Z is allowed but never required.
3. **Refused keys** are not taken, and the sheet says why: Esc and Tab ("Used to go back and move focus"), browser and system shortcuts that a page can't or shouldn't catch (Ctrl/⌘ + W, T, N, Q, R, L, H; F5, F11, F12; Alt+F4; the ⌘ or Windows key alone), and keys a DOM field would eat.
4. **Conflict.** If the key is bound to another action in a context that can be active at the same time (`global` and `menu` with everything; `battle` with `battle.deploy` and `battle.fight`; `map` with `menu`), the sheet shows: "**W** is already **Charge**." with three buttons:
   - **Swap** (default focus): the other action takes this action's old key in that slot. Nothing is left unbound.
   - **Replace**: the other action loses the key. If that leaves it with no key, the line says "Charge will have no key" (allowed; its button still works).
   - **Cancel**.
   Actions in contexts that are never active together (for example `deploy.shape` S and a `map` action) may share a key; no conflict is shown.
5. The change applies at once and is saved (§5.5). A toast confirms "Charge: W → K".

### 5.4 Fixed keys

`back` (Esc), `focus.next/prev` (Tab, Shift+Tab), and `activate` (Enter, Space) while a control has focus, are **not rebindable**, so there is always a way back and a way through menus whatever the player rebinds. Enter and Space can still be bound to field-mode battle actions (their defaults are FIGHT and Pause), because in field mode no control has focus; conflict detection therefore treats `activate` as active only while a control has focus, and `back` as never conflicting (it is not bindable).

### 5.5 Saving per device

- Bindings are saved on **this device**, in `platform.storage.device()` (ADR-0006: "bindings"), never in the campaign save and never synced: keyboards differ between devices (a laptop, a tablet's cover keyboard).
- Only the differences from the defaults are stored, so improving a default later reaches every player who didn't change that row.
- **Reset all to defaults** asks first (P4 confirm, safe default Cancel), then clears the overrides.
- A stored binding that no longer validates (unknown action, refused key, a new conflict after a default changed) is dropped on load and that action falls back to its default; the player isn't interrupted.

## 6. Hints and glyphs

### 6.1 Keycaps on controls

- When `keyboard()` is true and **Show key hints** is on, every HUD control with a bound action shows a **keycap**: a small stone chip with the key's label, in the control's top-right corner, overlapping its rim so it never takes layout width or shrinks a label (G14, no ellipsis). Text ≥ 6.5 UI px (A11Y text minimum), cream on basalt (4.5:1).
- Shown on: the five order keys, Then… and Undo chips, medallions and More, Pause/Play, Speed, Follow, Zoom, the ⋯ menu, FIGHT, Shape, Groups, Works, Inspect, and group cards (their numeral already is the key, so cards show no extra keycap).
- Menus show no keycaps (Enter/Esc/Tab are universal); the screen's primary button may show "⏎" when it has the default focus.
- Tooltips always append the key: "Charge (W)", in every locale, whether keycaps are on or off.
- Hybrid devices: keycaps follow `keyboard()`, not the last input, so they don't flicker when a touch-laptop player alternates between the screen and the keys.
- At phone sizes with a keyboard (390x844 with a Bluetooth keyboard), keycaps are hidden on controls narrower than 32 UI px; the tooltip still names the key.

### 6.2 Key labels

- A binding stores the physical key (`code`). Its label is the active layout's character for that key (the Keyboard Layout Map where the browser has one, upper-cased), else a built-in US label table. So on a Russian layout Q shows as "Й" in Chromium-based clients, and as "Q" where the layout map is missing (Firefox, Safari, Telegram Desktop on macOS). Both are the same physical key, which the keycap legends usually show anyway.
- Named keys use short, localized labels: Space ("Space" / "Пробел"), Enter "⏎", Esc, Tab, arrows "← → ↑ ↓", Numpad "Num 1", Ctrl/⌘ by OS ("⌘Z" on Mac, "Ctrl+Z" elsewhere).

### 6.3 Hints in copy

Lines that describe a gesture get a pointer-neutral or keyboard variant on keyboard devices, chosen by `InputHints` at display time, never by platform name:
- `battle.sit.idle`: "Tap a group, then an order below." → keyboard: "Click a group or press 1–9, then an order (Q–T)."
- The battle hint pill rotation (`battle.hint.*`) adds "Right-click the ground to move; right-drag to move and face." and "Press ? for all shortcuts." on mouse and keyboard devices.

### 6.4 The shortcuts sheet

`?` (or F1) opens a read-only ParchmentSheet listing the **current** bindings in the §1.2 layout, grouped as in §1.1, with an "Edit in Settings" button (keyboard devices only). Offline battles pause while it is open, as the ⋯ menu does.

## 7. Camera with mouse and keyboard (summary)

| Input | Behaviour | Follow |
| --- | --- | --- |
| Wheel / trackpad | one whole zoom step at the cursor, accumulated (§2.3) | unchanged (as the v5 pinch) |
| Left drag on ground, middle drag | 1:1 pan | turns off |
| Arrows | 600 UI px/s screen-space pan, 120 ms ease-in, no inertia, 48 px per short press | turns off |
| = / − | one zoom step at the view centre | unchanged |
| Number of the selected group | glide to centre it (320 ms, a cut under Reduce motion) | turns off |
| G | toggles Follow | — |

All camera moves are clamped to the field bounds, use dt (not per-frame lerp), and run after the sim step, as the existing follow does.

## 8. Touch and hybrid devices

- **Touch is unchanged**: same gestures, thresholds, hit-test priority, 44 pt targets, long-press tips, pinch. Touch-only devices see no keycaps, no Controls settings section, no cursor and no keyboard tutorial lines.
- **Per-event, not per-device**: on a touch laptop, each pointer is handled by what it is (`pointer.wasTouch` / `pointerType`): a finger gets long-press and pinch, the mouse gets hover, right-click and cursors, at the same time. Nothing switches modes globally.
- **Layout follows the viewport, not the input.** Targets stay ≥ 44 pt with a mouse; the landscape layouts (the separate layout spec) decide sizes.
- **Keyboard detection** is `InputHints.keyboard()`: true when the platform says a keyboard is likely (a fine pointer with hover; Telegram Desktop, macOS and Web clients) or after the first real `keydown`. The on-screen keyboard of a phone typing into a DOM field does not count (ADR-0012), so a phone never grows keycaps after naming a clan.
- A tablet that pairs a keyboard mid-session: keycaps and the Controls section appear on the next key press, through `onChange`.
- A tablet with a keyboard but no mouse: keys and focus work; field targeting uses touch, as today.

## 9. Accessibility

Applies the Standard tier (V5-013) and updates A11Y-22.

| Need | Rule |
| --- | --- |
| Remapping | Every battle and map action is rebindable, with two bindings each; menus keep fixed Esc/Tab/Enter/Space so the player can never lock themselves out (§5.4). |
| No chords required | No default needs two keys at once; chords are allowed only if the player chooses them. Works with OS Sticky Keys. |
| No hold-only actions | Every action is a press. The only hold (arrow pan) also steps on a short press, and the drag gestures have click or key alternatives: move = right/left click on the ground; turn = the turn keys (§3.4); pan = arrows; zoom = keys, wheel or the zoom key. |
| No timing | Nothing needs a double-press: "centre on group" is pressing the selected group's number again. The Undo and Then… windows (3 s) are unchanged and, as v5, they stand still while the tutorial narrator waits. |
| Keyboard access to menus | Every screen, sheet, tab and dialog is reachable and operable by keyboard with a visible focus ring (WCAG 2.1.1, 2.4.3, 2.4.7, 2.1.2: Esc always leaves a layer, browser shortcuts are never captured). |
| Remaining deviation (A11Y-22, updated) | Pointing at a field position or enemy, Solo, works placement and War-map hexes need a pointer (mouse or touch). Screen readers are out of scope (the game is a canvas). |
| Disabled feedback | A hotkey for a disabled action shows the reason and flashes the button (§0.6). |
| Reduced motion | The focus ring jumps instead of sliding; keyboard recentring cuts instead of gliding; the knob hover scale and the keycap pulse in the tutorial are off; cursors are never animated. Follows `reduceMotion` (src/ui/motion.ts). |
| Contrast | The focus ring and keycaps get `CONTRAST_PAIRS` entries (3:1 UI, 4.5:1 text). |
| Left-hand mode | Unaffected by keys; keycaps move with their controls. |

Follow-ups for the implementation story: update A11Y-22 in `design/accessibility-requirements.md`, the "out of scope" header lines in `design/ux/*.md`, and add a "Keyboard and mouse" pointer section to `design/gdd/controls.md` (R11 "Mouse" row) that points here.

## 10. Tutorial

The battle tutorial (`src/ui/tutorial/battleTutorial.ts`) keeps its steps and order. On keyboard or mouse devices:

- **Wording.** Steps that name a touch gesture get a pointer variant when `finePointer()` is true: `tut.step.pan` "Drag on empty ground to look around." gains "…or use the arrow keys."; `tut.step.zoom` "Pinch with two fingers…" becomes "Scroll the mouse wheel to zoom, or press + and −." Steps that say "tap" read "click" for a fine pointer.
- **Keyboard line.** When `keyboard()` is true, steps with a hotkey add one short line naming the **current** binding (so a rebound key shows correctly): select ("or press {key:group.1}"), loose ({key:order.shoot}), play ({key:time.pause}), then ({key:order.then} then {key:order.charge}), undo ({key:order.undo}), ability ({key:ability.1}), fight ({key:deploy.fight}).
- **Accepting keys.** The tutorial's events accept the keyboard equivalents: arrow pan counts as `pan`, zoom keys as `zoom`, the order and Undo hotkeys as taps on their buttons (they run the same code path, §0.2).
- **Ghost hand.** Pointer demos stay (the finger ghost reads as a mouse too). For a step with a hotkey, the target's keycap pulses once (not under Reduce motion).
- **Victory card.** On keyboard devices the last card adds "Press ? any time for all shortcuts."
- New strings go to `tutorial.en.ts` and `tutorial.ru.ts` with the `.mouse` and `.kb` suffixes; no step logic changes.

## 11. Acceptance criteria

- [ ] Every action in §1.1 runs the same code path as its button: an order log from a scripted hotkey battle equals the one from the same taps (replay-equal test).
- [ ] With touch emulation and no key pressed, at 390x844: no keycaps, no Controls section, no cursor changes; the touch smoke section passes unchanged.
- [ ] At 1280x800 and 1920x1080: Tab reaches every control on every screen and sheet, the ring is visible on every background, Esc closes layers and goes back, focus returns to the opener, destructive confirms open on Cancel.
- [ ] Right click moves, right-drag moves and faces, middle-drag pans, the wheel zooms at the cursor, trackpad scroll steps at most once per 120 ms, and the page never zooms on a trackpad pinch.
- [ ] Rebinding: capture, refused key, conflict Swap and Replace, row reset and Reset all; bindings survive a reload on the same device and are absent on another.
- [ ] A hybrid run (touch plus mouse plus keys at 1280x800 with touch emulation) shows hover for the mouse, long-press for the finger, and keycaps after the first key.
- [ ] The tutorial completes using only mouse and keyboard, and its lines show the current bindings.
- [ ] Reduce motion: no ring slide, no recentre glide, no knob hover scale.

## 12. Open questions (decided as below, logged for review)

| Question | Decision | Easy to undo? |
| --- | --- | --- |
| Esc in battle: menu or Retreat offer | ⋯ menu (desktop convention; the menu holds Retreat) | yes, one binding |
| Positional QWERT vs mnemonic letters (A/C/H/S) for orders | positional: matches the bar, works on every layout | yes, defaults table |
| Shift-queue (Shift+order = Then) | not in v6; F then the order key covers it without a chord | add later |
| Edge-of-screen scrolling | not in v6 (it misfires in windowed browsers and Telegram Desktop) | add later as a setting |
| Keyboard field cursor for targeting | not in v6 (§3.7) | add later |
