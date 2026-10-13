# ADR-0012: Input v6: action map, keyboard, mouse and focus

## Status
Proposed (P2-UX-INPUT, 2026-10-13). Amends ADR-0004.

## Date
2026-10-13

## Last Verified
2026-10-13

## Decision Makers
Autonomous v6 run, story P2-UX-INPUT, written in the `ux-designer` and `accessibility-specialist` roles. The Director moves this ADR to Accepted by logging it in `docs/v6/DECISIONS.md`.

## Summary
ADR-0004 made battle touch input pure and testable, but it is touch and portrait only: the game has no keyboard handling (the only key handler is Escape in the DOM text prompt), no focus, no rebinding, and mouse support is limited to hover tips and wheel zoom. v6 adds mouse and keyboard play on the web, Telegram Desktop and hybrid devices (brief goal 3). This ADR adds a device-free **action map**, **bindings** saved per device, a single **keyboard router**, a **focus manager** tied to the existing NavStack, and mouse extensions to the gesture recogniser. All of them are pure modules under `src/ui/input/` with thin Phaser and DOM shells. Device facts come only from `platform.input` (`InputHints`, ADR-0006). The UX is specified in `design/ux/input-v6.md`.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Phaser 3.90 (ADR-0003) |
| **Domain** | Input, UI |
| **Knowledge Risk** | LOW for Phaser: `Pointer.button`, `rightButtonDown()`, `middleButtonDown()`, `wasTouch`, `input.mouse.disableContextMenu()`, `input.setDefaultCursor()` and the `wheel` event (with the DOM `WheelEvent` on `pointer.event`) are stable 3.x APIs. Phaser's `KeyboardPlugin` is **not** used (see Decision 3). MEDIUM for the browser: the Keyboard Layout Map API (`navigator.keyboard.getLayoutMap()`) exists only in Chromium; Telegram Desktop's key handling in its embedded web view (Esc in particular) is unverified. Context7 was not reachable in this run, so the Phaser calls above were checked against the code base's existing use and the 3.90 typings in `node_modules`, not the docs. |
| **References Consulted** | `design/ux/input-v6.md`; ADR-0004; ADR-0006 (`InputHints`, `Storage.device()`); `design/gdd/controls.md` R1–R11; `design/accessibility-requirements.md` A11Y-02, -04, -14, -15, -16, -22; `docs/v6/audit/PLATFORM.md` §8; `src/ui/hover.ts`, `src/ui/kit.ts` (`tappable`, `Button`, `ScrollArea` wheel), `src/platform/nav.ts` (`NavStack`, `navLayer`), `src/scenes/BattleScene.ts` (pointer and wheel routing, `orderKeys()`, `topOpts()`, `undo()`, `toggleSpeed()`), `src/ui/input/{gestures,hitTest,pace}.ts`, `src/scenes/online/textInput.ts`. |
| **Post-Cutoff APIs Used** | None. `KeyboardEvent.code`, `isComposing`, `matchMedia('(any-pointer: fine)')` and `WheelEvent.deltaMode` are long-standing. |
| **Verification Required** | The tests in "Test strategy"; a manual check of Esc, Tab and Space in Telegram Desktop (Windows and macOS) and Telegram Web (iframe focus). |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0004 (gesture recogniser, hit-test), ADR-0006 (`platform.input`, `platform.storage.device()`, the boundary test) |
| **Amends** | ADR-0004: the recogniser gains mouse buttons; the "touch first, portrait" constraint becomes "touch unchanged, mouse and keyboard added". ADR-0006: `InputHints` gains `keyLabels()` (Decision 6). |
| **Enables** | The v6 Foundation input story (mouse, keyboard, focus, rebinding storage), the Settings Controls page, keyboard tutorial lines, the landscape battle layout's keycaps |
| **Blocks** | Any v6 story that adds a hotkey, a focusable control or a cursor |
| **Ordering Note** | Lands after the platform layer's `InputHints` (ADR-0006 migration step for `input.ts`). Inside the input story: I1 action map and bindings → I2 keyboard router and battle hotkeys → I3 mouse buttons, wheel, cursors → I4 focus manager and ring → I5 Settings rebinding → I6 hints, glyphs, tutorial. Each step is behaviour-preserving for touch. |

## Context

### Problem Statement
The brief asks for hover states, right-click and wheel zoom on the field, keyboard focus through menus and sheets, battle hotkeys (orders, groups, pause, speed, Undo, Then), and rebindable keys with conflict detection saved per device, offered only where a keyboard is present. Today:
- every control acts through a pointer callback (`onClick`, `onTap`); nothing names an action independently of the button;
- there is no keyboard listener, no focus concept (the Kit's "Focused" state is a stand-in, `src/scenes/kit/statesPage.ts`), and no binding storage;
- the battle's `wheel` handler zooms about the centre while the War map's zooms about the cursor, and a trackpad fires a zoom step per tiny delta;
- the right button acts as a left press, and the browser context menu can appear;
- nothing tells the game whether a keyboard exists; ADR-0006 defines `InputHints` for it.

### Constraints
- Touch behaviour must not change (no live users, but v5's touch controls were playtested and are kept).
- No `if (telegram)` or device sniffing in game code (V5-076; ADR-0006 boundary test).
- No new npm dependency; Phaser 3.90.
- Hotkeys must produce exactly the orders the buttons produce: deterministic replay (ADR-0001) and online lockstep see only ordinary orders.
- `BattleScene.ts` is a hotspot: the scene diff stays routing only (as ADR-0004).
- Text typed into the DOM prompt must never trigger a hotkey.

### Requirements
- Named actions with contexts, defaults and up to two bindings each, independent of devices.
- Rebinding with conflict detection by context, swap or replace, reset, refused keys, and per-device persistence.
- Keyboard focus for every kit control, scoped to the NavStack's top screen or layer, with a visible focus ring.
- Mouse: right click and right-drag orders, middle-drag pan, cursor-anchored and accumulated wheel zoom, cursor states.
- Keyboard presence and key labels from `platform.input` only.
- Pure modules with unit tests; Playwright smoke for the browser.

## Decision

### Architecture

```
platform.input (InputHints: keyboard(), finePointer(), onChange(), keyLabels())   ADR-0006
        │ device facts                                 platform.storage.device()  (bindings)
        ▼                                                           │
DOM keydown/keyup/blur (one listener, src/ui/input/keySource.ts) ───┤
        │ KeyEvent (code, mods, repeat, editable, composing)         ▼
        ▼                                            Bindings (src/ui/input/bindings.ts, pure)
KeyRouter (src/ui/input/keys.ts, pure) ◀── ACTIONS (src/ui/input/actions.ts, data)
        │ resolve(event, activeContexts) → ActionId
        │                          ▲ contexts from NavStack top + the scene (battle phase, field/HUD mode)
        ├──▶ FocusManager (src/ui/input/focus.ts, pure) ──▶ focusRing.ts (Phaser: draws the ring)
        │       ▲ focusables registered by kit: tappable(), Button, MButton, KeyButton, Toggle, ...
        └──▶ scene handlers: keys.on('order.charge', fn, scene) → the same method the button calls

Phaser pointer events ─▶ BattleScene (routing) ─▶ GestureRecognizer (+ button: left/right/middle)
Phaser wheel ─▶ WheelAccumulator (src/ui/input/wheel.ts, pure) ─▶ zoom step at cursor / pan
hitTest + drag state ─▶ cursorFor() (src/ui/input/cursor.ts, pure) ─▶ canvas cursor
```

### 1. The action map (`src/ui/input/actions.ts`)
A typed table, data only: `ActionId` (a string union), and per action its `context`, `kind` (`press` | `repeat` | `hold`), `rebindable`, an i18n label key, and `defaults: Binding[]` (at most two). The defaults are the table in `design/ux/input-v6.md` §1.1. Game code refers to actions only by `ActionId`; no file outside `src/ui/input/` and the platform adapters reads `KeyboardEvent`.

Contexts: `global`, `menu`, `map`, `battle`, `battle.deploy`, `battle.fight`, plus the internal `capture` (rebinding) that suspends everything. A static `OVERLAPS` table says which contexts can be active together; it drives conflict detection.

### 2. Bindings and storage (`src/ui/input/bindings.ts`)
- `Binding = { code: string; mod?: true; alt?: true; shift?: true }`. `code` is `KeyboardEvent.code` (the physical key), so layouts don't matter. `mod` matches Ctrl **or** ⌘ (`ctrlKey || metaKey`), so one default (Undo's Ctrl+Z / ⌘Z) works on every OS without detecting it; only the label differs, and `glyphs.ts` takes it from `platform.client().platform`.
- `BindingMap` = defaults overlaid with overrides. Functions, all pure: `resolve(map, ev, contexts)`, `conflictsWith(map, action, binding)`, `assign(map, action, slot, binding, mode: 'swap' | 'replace')`, `resetAction`, `resetAll`, `refused(binding)` (Esc, Tab, browser and OS shortcuts, modifiers alone), `serialize(map)` (overrides only) and `parse(json)` (drops invalid, refused, unknown or newly conflicting entries; never throws).
- Storage: `platform.storage.device()` key `input.bindings`, JSON `{ v: 1, o: { [ActionId]: [Binding | null, Binding | null] } }`. Device-local by design: never in the campaign save, never synced. No migration code (V5-074); `v` lets a later change drop old data cleanly.

### 3. One keyboard source and router (`keySource.ts`, `keys.ts`)
- **One DOM listener** for `keydown`, `keyup` and `blur`/`visibilitychange` on `window`, installed once at boot. Phaser's per-scene `KeyboardPlugin` is disabled (`input.keyboard: false` in the game config): it would double-handle keys, its captures are per scene, and our router must outlive scene switches and work with DOM overlays.
- `keySource` turns a DOM event into a plain `KeyEvent` (`code`, modifiers, `repeat`, `editable` = the target is an input, textarea or contenteditable, `composing` = `isComposing` or `keyCode === 229`). Editable or composing events are ignored entirely, so typing a clan name never fires a hotkey and a phone's on-screen keyboard is never mistaken for a hardware one.
- `KeyRouter` (pure) holds the active context stack, the binding map and handler registrations. It resolves an event to an action in the most specific active context (layer > screen > global), drops auto-repeat for `press` actions, keeps a held set for `hold` actions (cleared on blur so no key sticks), and calls the handler. It calls `preventDefault` **only** for keys it handled (so browser shortcuts and Tab out of an unhandled state still work).
- Scenes register handlers with `keys.on(action, fn, scene)`; registrations are removed on scene shutdown (the pattern `ScrollArea` uses). A battle hotkey handler calls the **same scene method** as the button's callback (`command()`, `togglePause()`, `toggleSpeed()`, `undo()`, `queueThen()`, ...). Disabled buttons expose their `off` reason; the handler shows it and flashes the button (UX §0.6).
- Contexts come from the NavStack (top screen, open layers) and from the scene (`battle.deploy` / `battle.fight`, field vs HUD focus mode). NavStack gets a `subscribe(cb)` for top changes; it gains no input logic.
- Esc: the router's `back` action calls `nav.back()`, which closes the top layer first. In the `battle` field mode, Esc is bound to `menu.battle` instead (UX §3.1). Telegram's BackButton and the browser's `popstate` keep calling `nav.back()` (ADR-0006).

### 4. The focus manager (`src/ui/input/focus.ts`, `src/ui/focusRing.ts`)
- Pure `FocusManager`: scopes (one per NavStack screen entry and per `navLayer`), focusables per scope `{ id, rect(), enabled(), group?, onActivate, onAdjust?(dir), tip? }`, the focused id per scope, `next/prev` (reading order: 8 px bands, then x), `move(dir)` (45° cone, nearest by distance plus off-axis weight; group-local first), `trap` (only the top scope), `restore` (focus returns to the opener when a layer closes), and a `visible` flag (focus-visible: set by Tab/arrows, cleared by any pointer down).
- Registration lives in the same single places that already wire hover tips: `tappable()` and `Button` in `src/ui/kit.ts`, and the Mosaic components (MButton, KeyButton, Toggle, Stepper, Segmented, TabBar, TabStrip, ParchmentRow, StashGrid). A control finds its scope by walking up its parent containers to the nearest container registered by `navLayer`, else its scene's screen. Screens write no focus code; a scope may supply an order override (the battle HUD) or a default control (destructive confirms default to Cancel).
- Rects are read lazily (`getBounds()` in UI space) only when navigating, so there is no per-frame cost. A focusable inside a `ScrollArea` asks it to scroll the rect into view.
- `focusRing.ts` draws the two-tone ring (UX §4.4) on a per-scene top container, slides it in 80 ms unless `reduceMotion`, and hides it when `visible` is false.

### 5. Mouse (`gestures.ts` amendment, `wheel.ts`, `cursor.ts`)
- `Ptr` gains `button: 0 | 1 | 2` (left, middle, right) and `touch: boolean`. Left-button and touch paths are **unchanged** (the existing 28 tests pin them). The right button emits `order-click` or `order-drag-start/move/end` (press point, facing snapped to 8 directions within 8°, cancel on Esc or a left press); the middle button emits `pan`. The scene maps `order-click` to the existing tap-move or target code and `order-drag-end` to a `form` with the chosen facing.
- `input.mouse.disableContextMenu()` in every scene with a field or map (the canvas only; DOM fields keep theirs).
- `WheelAccumulator` (pure): normalises `deltaMode` (line × 16 px, page × view height), accumulates `deltaY`, emits one zoom step per 100 px with at most one step per 120 ms; `ctrlKey` (trackpad pinch) zooms and is `preventDefault`ed; `shiftKey` or `deltaX` pans. Zoom is anchored at the cursor in battle, World, War and Camp (one shared `zoomAt` helper; the War map's `zoomAt` becomes it).
- `cursorFor(state)` (pure) maps the hover hit, drag kind, disabled flag and busy flag to a `CursorKind` (UX §2.4). One helper sets `canvas.style.cursor` with a CSS keyword fallback; pixel cursors are optional PNGs in `public/cursors/` (default, pointer, grab, grabbing, turn, target, pan, not-allowed, wait; 16 px with 2× variants), logged in the asset log when made. Touch never sets a cursor.
- Hover previews on the field (an enemy's would-be attack arrow or reticle at 50%) reuse the existing preview drawing; `hitTest()` is called on `pointermove` for a mouse only, throttled to one call per frame.

### 6. Device facts and key labels (ADR-0006 `InputHints`)
`keyboard()`, `finePointer()` and `onChange()` are used as ADR-0006 defines them, with two clarifications for the adapters:
- keyboard presence flips to true on the first `keydown` that is **not** editable or composing (Decision 3), so on-screen keyboards never count;
- `finePointer()` uses `matchMedia('(any-pointer: fine)')` (not `pointer`), so a touch laptop with a trackpad reports a fine pointer.

One addition: `keyLabels(): Promise<ReadonlyMap<string, string> | null>`, the layout map where the platform has one (Chromium's `navigator.keyboard.getLayoutMap()`), else `null`. It lives in the adapter because it is a browser capability; `src/ui/input/glyphs.ts` (pure) turns a `Binding` into a label from that map or a built-in US table, and localizes named keys (Space, Enter, arrows, Ctrl/⌘).

Game code decides **what to show** from these facts (keycaps, the Controls section, tutorial lines, cursor); per-event pointer kind (`pointer.wasTouch`) is event data, not device detection, and stays allowed.

### Key interfaces

```ts
// src/ui/input/actions.ts
export type Context = 'global' | 'menu' | 'map' | 'battle' | 'battle.deploy' | 'battle.fight';
export interface ActionDef { id: ActionId; context: Context; kind: 'press' | 'repeat' | 'hold'; rebindable: boolean; label: TKey; defaults: readonly Binding[] }
export const ACTIONS: Readonly<Record<ActionId, ActionDef>>;
export const OVERLAPS: Readonly<Record<Context, readonly Context[]>>;

// src/ui/input/bindings.ts
export interface Binding { code: string; mod?: true; alt?: true; shift?: true }
export type Slot = 0 | 1;
export function resolve(map: BindingMap, ev: KeyEvent, active: readonly Context[]): ActionId | null;
export function conflictsWith(map: BindingMap, action: ActionId, b: Binding): ActionId | null;
export function assign(map: BindingMap, action: ActionId, slot: Slot, b: Binding | null, mode: 'swap' | 'replace'): BindingMap;
export function refused(b: Binding): 'reserved' | 'browser' | 'modifier' | null;
export function serialize(map: BindingMap): string;   // overrides only
export function parse(json: string | null): BindingMap; // defaults + valid overrides

// src/ui/input/keys.ts
export class KeyRouter {
  setContexts(stack: readonly Context[]): void;
  on(action: ActionId, fn: () => void, owner: { once(ev: 'shutdown', fn: () => void): unknown }): () => void;
  down(ev: KeyEvent): boolean;  // true: handled (caller calls preventDefault)
  up(ev: KeyEvent): void;
  held(action: ActionId): boolean;
  clear(): void;                // blur
}

// src/ui/input/focus.ts
export interface Focusable { id: string; rect(): Rect; enabled(): boolean; group?: string; onActivate(): void; onAdjust?(d: Dir): boolean; tip?(): string | undefined }
export class FocusManager {
  pushScope(owner: object, opts?: { defaultId?: string; order?: (a: Focusable[]) => Focusable[] }): void;
  popScope(owner: object): void;            // restores focus to the opener
  add(owner: object, f: Focusable): () => void;
  next(): void; prev(): void; move(d: Dir): void; activate(): void;
  readonly focused: Focusable | null; readonly visible: boolean;
}

// src/ui/input/wheel.ts
export class WheelAccumulator { push(e: { deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; shiftKey: boolean }, nowMs: number, viewH: number): { zoom?: 1 | -1; panX?: number } }

// src/ui/input/cursor.ts
export type CursorKind = 'default' | 'pointer' | 'not-allowed' | 'grab' | 'grabbing' | 'turn' | 'target' | 'pan' | 'wait';
export function cursorFor(s: { hit: HoverHit; drag: DragKind | 'pan' | null; disabled: boolean; busy: boolean }): CursorKind;
```

### Implementation guidelines
- A new hotkey: add its `ActionDef` and default, add its label, register the handler next to the button that does the same thing. Never read `KeyboardEvent` or `code` outside `src/ui/input/` and the platform adapters.
- A new control: use the kit; it becomes focusable and hoverable for free. If a control is built by hand, call `focusable()` in the same place it calls `tappable()`.
- Never add a default that needs a chord, a hold or a double press (UX §9).
- Never call `preventDefault` for a key the router didn't handle.
- Keep touch thresholds and `hitTest()` rules untouched; mouse paths are new branches keyed on `button` and `touch`.

## Alternatives Considered

### Alternative 1: Phaser's KeyboardPlugin per scene (`this.input.keyboard.addKey`)
Rejected: handlers and captures are per scene, so global keys (Esc, Tab, `?`) would be re-registered in every scene and lost during transitions; it captures keys even while a DOM text field is focused unless every scene manages it; and it can't be unit-tested without Phaser. The router is about 150 lines and is pure.

### Alternative 2: DOM focus with an invisible HTML button per control (an accessibility tree mirror)
Rejected for v6: it would give screen readers something to read, but every canvas control would need a positioned DOM twin kept in sync through scrolling, sheets and scene rebuilds, which is a large, fragile system. The canvas focus manager meets the brief (keyboard navigation with a visible ring); screen-reader support stays out of scope (A11Y-22) and this alternative is the path if it is ever needed.

### Alternative 3: Key bindings stored by `KeyboardEvent.key` (the character)
Rejected: a Russian layout would need a second set of bindings (Q vs Й), and shifted characters change with Shift. `code` binds the physical key and the label layer shows the right character.

### Alternative 4: Bindings in the campaign save (roaming)
Rejected: a laptop and a tablet's cover keyboard want different keys, the save is per account while keyboards are per device, and the brief asks for per-device saving.

### Alternative 5: Detect the keyboard from the user agent or the platform name
Rejected by V5-076 and ADR-0006: only `platform.input` answers it.

## Consequences

### Positive
- Every hotkey is a second door to an existing method, so replays, lockstep and the server see nothing new; the replay-equal test proves it.
- Focus comes free with the kit, so all existing and future screens are keyboard-navigable without per-screen work.
- Rebinding, conflicts and storage are pure and fully unit-tested.
- Wheel zoom behaves the same on all maps and is usable on trackpads.

### Negative
- Kit components gain a focus registration and a hover state: a small cost per control (a closure and an entry), and one more thing to keep in mind in hand-built controls.
- Another listener on `pointermove` for mouse hover hit-tests in battle (throttled to one per frame).
- Disabling Phaser's KeyboardPlugin means any future code that expects `this.input.keyboard` must go through the router instead (stated in the guidelines).

### Neutral
- `InputHints` grows by one method (`keyLabels`), which every adapter implements (`null` is valid).

## Risks
| Risk | Mitigation |
| --- | --- |
| Telegram Desktop may close the Mini App or eat Esc, Tab or Space before the page sees them | Manual check on Windows and macOS clients in the input story's QA; battles already ask before closing (`setClosingConfirmation`); `M` is a second binding for the battle menu, and Back stays on screen. |
| Telegram Web runs the game in an iframe: keys reach it only after the iframe has focus | The first click focuses it; the shortcuts hint appears only after the first key, so nothing promises keys that can't arrive. |
| A browser or extension shortcut collides with a default (for example `/` for quick find in Firefox) | The router `preventDefault`s handled keys while the canvas is focused; `/` has F1 as a second binding; the refused list grows as found. |
| Focus scopes drift from what is actually on top (a layer not registered with `navLayer`) | The focus scope is derived from NavStack, the same source Back uses; a Kit test opens every overlay kind (`openOverlays()`) and asserts Tab stays inside it. |
| Keycaps crowd landscape HUD controls | They overlap the rim, never take width; the layout check gets keycap fixtures at the landscape sizes. |
| Trackpad feel (threshold 100 px / 120 ms) is wrong on some devices | Both are tuning constants in `wheel.ts`; checked on a macOS trackpad and a Windows precision touchpad in QA. |

## Test strategy

**Unit (vitest, no Phaser, no DOM)**
- `tests/inputActions.test.ts`: every action has a label, a valid context, at most two defaults; no two defaults conflict in overlapping contexts; no default is a chord-only, refused or modifier-only key; every order bar key, medallion slot and top-bar control has an action.
- `tests/bindings.test.ts`: resolve per context and precedence (layer over screen over global); conflict detection respects `OVERLAPS`; swap and replace (including leaving an action unbound); refused keys; reset one and all; `serialize` stores only overrides; `parse` round-trips and drops invalid, unknown, refused and newly conflicting entries without throwing.
- `tests/keys.test.ts`: press ignores auto-repeat, repeat accepts it, hold tracks down/up and clears on blur; editable and composing events are ignored; only handled keys report `true`; handlers unregister on owner shutdown; capture context suspends everything.
- `tests/focus.test.ts`: reading order with bands; wrap; spatial moves in a grid, a row and a mixed layout; group-local arrows; disabled controls stay focusable; trap in the top scope; restore to the opener and fallback to the default; the destructive confirm defaults to Cancel; `visible` toggles on key versus pointer.
- `tests/wheel.test.ts`: a mouse notch (deltaY 100, mode 0) is one step; ten 10 px trackpad deltas are one step; mode 1 lines; the 120 ms limit; ctrl zooms; shift and deltaX pan.
- `tests/input.test.ts` (extended): the existing left and touch cases unchanged; right click, right-drag facing snapped within 8°, sub-threshold right-drag as a click, Esc and left press cancel, middle pan.
- `tests/cursor.test.ts`: the `cursorFor` table.
- `tests/glyphs.test.ts`: labels from a fake layout map, the US fallback, Ctrl vs ⌘, named keys in en and ru.
- Platform adapters (ADR-0006 per-adapter tests): web and Telegram `InputHints` with fake `matchMedia`, a fake client platform, a real versus an editable `keydown`, and `keyLabels` present or `null`. The boundary test keeps `KeyboardEvent`, `navigator.keyboard` and `matchMedia` out of game code.

**Integration (vitest with the sim)**
- `tests/hotkeyReplay.test.ts`: a scripted battle driven by actions (select 2, W, F then W, U, Space, `.`) produces an order log identical to the same inputs through the button callbacks; replaying it gives the same hash (ADR-0001).
- Settings: the Controls section is present only with a fake `InputHints.keyboard() === true`, and appears on `onChange`.

**Browser (Playwright, `scripts/keyboard-smoke.mjs`, new; ports per V6-002)**
- At 1280x800 and 1920x1080: Tab through the Menu hub, a sheet, a destructive confirm (opens on Cancel), Esc back, focus restored; the ring is visible (screenshot).
- Battle: 1 selects, W charges (read through the existing debug hook), F then W queues, U undoes, Space pauses, `]` speeds up, `,` turns; right click moves, right-drag faces, middle drag pans, wheel zooms at the cursor; Esc opens the ⋯ menu.
- Rebinding: capture W for Advance, conflict Swap, reload, the binding persists; Reset all restores.
- Touch regression: the existing `scripts/smoke.mjs` touch section and `scripts/tutorial-smoke.mjs` pass unchanged; with touch emulation at 390x844 there are no keycaps and no Controls section.
- Hybrid: touch emulation plus a key press at 1280x800 shows keycaps, and a finger long-press and a mouse hover both show tips.
- Tutorial: completes with mouse and keys only; the lines show the current bindings.
- `scripts/layout-check.mjs`: new fixtures `battle-keys` (keycaps on) and `kit-focus` at the landscape sizes, with no overlap or ellipsis.

**Manual**: Telegram Desktop (Windows, macOS) and Telegram Web for Esc, Tab, Space and right click; Firefox (no layout map) labels; a Russian layout in Chromium (labels show Cyrillic); Reduce motion.

## GDD and spec requirements addressed

| Source | Requirement | How |
|-----|-------------|-----|
| Brief goal 3 | Hover, right-click, wheel zoom on the field | Decision 5; UX §2 |
| Brief goal 3 | Focus navigation through menus and sheets | Decision 4; UX §4 |
| Brief goal 3 | Battle hotkeys: orders, groups, pause, speed, Undo, Then | Decisions 1–3; UX §1.1, §3 |
| Brief goal 3 | Rebindable keys, conflict detection, saved per device, only with a keyboard | Decision 2, 6; UX §5 |
| controls.md R4.4 | A disabled control says why | the hotkey shows the button's `off` reason |
| controls.md R10, R10b | Who may pause; no Then in live online | hotkeys call the same gated methods |
| A11Y-15 | No long-press-only info | hover and focus show tips |
| A11Y-22 | Keyboard access | now in scope for menus; the field-pointing deviation is recorded (UX §9) |

## Related
- `design/ux/input-v6.md` (the UX spec), `design/gdd/controls.md`, `design/accessibility-requirements.md`
- ADR-0004 (amended), ADR-0006 (`InputHints`, `Storage.device()`)
- `src/ui/input/`, `src/ui/hover.ts`, `src/ui/kit.ts`, `src/platform/nav.ts`
