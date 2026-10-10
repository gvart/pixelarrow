# UX Specs: Campaign screens (C-1 … C-10)

> **Status**: In Review (S2-UX-IA)
> **Author**: ux-designer (autonomous; answers in docs/v5/ux/ANSWERS.md)
> **Last Updated**: 2026-10-10
> **Journey Phase(s)**: first session (C-1, C-2), 5-minute loop and session loop (C-3 … C-10), VISION.md "Core loop"
> **Platform Target**: Telegram Mini App, portrait; touch first, mouse second; keyboard/gamepad out of scope (ANSWERS Q9). 390x844 design, 360x780 clean, 320x640 and 320x568 usable.
> **Accessibility tier**: Standard (V5-013)
> **Template**: UX Spec
> **GDDs referenced**: controls.md, battle-readability.md, campaign-arc.md, campaign-events.md, abilities.md, ai-doctrines.md, formations-orders.md, field-works.md

Core screens (`workflow: standard`) get the full spec: **C-3 Campaign hub, C-4 World map, C-10 Results**; the Battle is in [hud.md](hud.md). The others get the compact block (purpose, primary action, inventory, states, touch rules, acceptance). Entries, exits and Back for every screen are in [screen-flow.md](screen-flow.md) §3, and are not repeated here. Inventories cite the audit's element ids (`UI.md`) or the GDD rule that adds an element; the complete old-to-new ledger is `docs/v5/ux/ELEMENT_MAP.md`.

## 0. Rules shared by every screen

These hold on every screen in this file and in [screens-modes.md](screens-modes.md) unless a spec says otherwise. Component behaviour is in [interaction-patterns.md](interaction-patterns.md).

**Layout.** Mosaic shell (V4_SPEC): top bar (44 pt: back or nothing, plaque title, ⚙), framed parchment content in a scroll area, then either the tab bar (hubs) or a fixed action bar (sub-screens). Anchored, never absolute; content scrolls; the fixed head of a sub-screen **collapses to one line on scroll** (G9) and the scroll edge shows a fade + "more" chevron when content is clipped.

**Touch targets.** Every control ≥ 44x44 pt with ≥ 8 pt between targets (4 pt in the battle order bar, controls.md R9). The screen's one terracotta primary sits in the bottom third (thumb zone). A destructive action is never adjacent to the primary and always confirms.

**States.** Every screen that fetches data has *loading* (a skeleton of its cards, never a lone grey line, SHP-4), *error* (one line + Retry), *offline*, and for online modes *outside Telegram* ("Open in Telegram"). Every list has an *empty* state with a next action.

**Text.** Meaningful text ≥ 6.5 UI px (13 CSS px) (G10); numbers never ellipsized (G14); labels sized for **+40%** (ru) expansion; Cinzel for titles and buttons, Inter for body and numbers.

**Colour roles.** One terracotta primary; bronze for every live secondary; grey stone only for disabled, always with a one-line reason (G2); red only for errors, losses and alerts (G3); blue only for real money (G4). No state by colour alone: rarity has a gem letter, threat has an icon, selection has a ✓ or rim (G13).

**Data.** The UI owns no game state. Each screen reads from the named system and re-renders on its change event; nothing polls per frame.

**Events fired.** Every navigation fires the existing `screen:<id>` analytics hook (usage statistics on); actions call the existing game API (listed per screen). New v5 events are named per screen.

**Transitions.** 180 ms parchment fade between screens (battle-readability.md R6); sheets rise 200 ms from the bottom; reduce motion = instant cut.

**Accessibility.** Long-press is never the only path: wherever details exist, a visible (i) or chevron opens them, and mouse hover shows the same tip (G15). Haptics on select and confirm (setting). Contrast pairs from `tokens.ts` CONTRAST_PAIRS (4.5:1 text, 3:1 UI).

**Input completeness (touch + mouse).** Every action reachable by tap; hover = long-press tip; wheel scrolls lists and zooms maps; no drag-only action (drag to slot also has tap-select-then-tap-slot).

---

## C-1 Boot (S01)

- **Purpose.** Show that the game is loading and route the player.
- **Primary action.** None (auto-routes, under 1 s).
- **Inventory.** Logo plaque (new, BOOT-1) · status line "Mustering the hoplites…" moved to i18n (G12) · progress bar (new, BOOT-1) · routing (live duel → Duels, first run → First run, deep link, `?scene=Kit`, else Campaign hub).
- **States.** Loading · **error** (new): "Couldn't load. Retry" (no dead end).
- **Touch.** Retry is a 44 pt bronze button, centred low.
- **Acceptance.** The line is translated in ru; on a forced asset failure the Retry button appears and reloads.

## C-2 First run (S02)

- **Purpose.** "I just opened this. What is it, and where do I start?"
- **Primary action.** *Offer/Resume:* Tutorial (recommended). *Reward:* Continue. *Modes:* the Campaign card.
- **Layout.** Key art behind the narrator (FR-1); the CTA at thumb height; **Skip as a text link under the CTA** (FR-2).

| Element | Old ref | New place / note |
| --- | --- | --- |
| Top bar title (Welcome / Training complete / **Three ways to fight**) | FR inventory | same; title text changes on Modes (FR-3) |
| Back arrow (reward, modes) | FR | same → Campaign hub |
| Narrator card (Nikias portrait, blink, name, ≤ 6 lines) | FR | over the key art; painted bust when the art lands (FR-5) |
| Tutorial (recommended) / Resume tutorial | FR | primary, full width, bottom |
| Skip (→ confirm Skip/Stay on resume) | FR, FR-2 | text link under the primary |
| Reward: gold count-up, item card | FR, FR-4 | centred plinth, item art at 3× |
| Continue | FR | primary |
| Mode cards | FR-3 | **three** cards in tab order: Campaign (→ World/Settlement), Duels (→ Duels hub), War (→ War hub); one-line pitch each |

- **States.** offer · resume · reward · modes · skip confirm.
- **Touch.** Mode cards are full-width rows ≥ 64 pt; the Skip link has a 44 pt hit box.
- **Acceptance.** The Modes step shows exactly three cards matching the tab bar; Skip sits below the primary at 320x568.

## C-3 Campaign hub (S03) — full spec

### Purpose & Player Need
"I want to see how my company stands and get back on the march in one tap." It is the root of the Campaign tab and the landing screen for returning players.

### Player Context on Arrival
Returning after hours away, or after a cloud-sync adopt, or from another tab. They remember their company, not the exact state: the status line answers "where are we, is anyone hurt, how far along is the arc".

### Navigation Position
Root of the Campaign tab. Children: World, Settlement (when inside), Army, Field camp. Settings sheet from ⚙.

### Entry & Exit Points
See screen-flow.md S03.

### Layout Specification

```
┌──────────────────────────────────────┐ 390x844
│ [ ]     ▓ PIXELARROW ▓          [⚙] │ top bar 44
├─╳ meander frame ─────────────────────┤
│ ┌──────┐ Strategos Epameinon         │ profile card (display only)
│ │ bust │ Day 14 · in Rhegion · Lairs 2/6
│ └──────┘ ◎ 240   🏆 3   👥 9 men     │
│ ┌ First steps · 2 of 4 ────────────┐ │ until done
│ │ ■■□□  Win a battle               │ │
│ └──────────────────────────────────┘ │
│ ┌──────── fresco (tappable) ───────┐ │ collapses to a 1-line banner < VH 700
│ └──────────────────────────────────┘ │
│ ◆═══ CONTINUE THE MARCH ═══◆         │ primary, thumb zone
│ [ARMY !2] [STASH] [CAMP]             │ tiles, always above the fold
│              Pitch camp on the map   │
├──────────────────────────────────────┤
│ Campaign  Duels  (WAR)  Codex  Shop  │ tab bar
└──────────────────────────────────────┘
```

**Zones.** Status (profile, quest) · Hero (fresco + CTA) · Shortcuts (tiles) · Tabs. Under VH 700 (320x640, 320x568) the fresco becomes a 1-line banner and the tiles stay above the fold (MENU-1).

### Component Inventory

| Element | Old ref | Change |
| --- | --- | --- |
| Top bar: plaque "Pixelarrow", ⚙ → Settings | MENU hub shell | same |
| Sync badge | MENU-4 | shown **only on error** (an icon + "Sync failed" chip that opens Settings › Account); otherwise in Settings › Account |
| Tab bar (5 tabs, count badges, long-press name) | MENU hub shell, MENU-2/3 | War medallion gets a glyph and its label in the bar; long-press name also on hover; book icon for Codex |
| Profile card: portrait, "Strategos {name}" / "New campaign", status line, Gold, Trophies, Warband n men | MENU profile | status line adds **"Lairs n/6"** once the arc exists (campaign-arc.md; ANSWERS Q30), display only |
| First-steps card (title, 4-segment bar, next step) | MENU quest | same; hidden when done |
| Fresco banner (tap = Continue) | MENU actions, MENU-10 | painted art (art pass); compact banner < VH 700 |
| Continue / Begin the march | MENU actions | the one primary |
| Army tile ("!" → count badge of heroes with unspent points) | MENU tiles, G11 | count, not "!" |
| Stash tile → Army › Stash | MENU tiles | **kept**: a door, not a second home (ANSWERS Q22) |
| Camp tile (disabled + "Pitch camp on the map") → Field camp | MENU tiles, MENU-11 | one-line reason; full reason on tap |
| Sync-adopt notice sheet | NAV N9 | **new** sheet: "A newer save from another device was loaded (day n)" · OK |

### Information Hierarchy
1. Continue the march (the verb). 2. Status line (where, hurt, arc). 3. Army badge (pending points). 4. Resources. 5. Fresco (mood).

### States & Variants

| State | Trigger | What changes |
| --- | --- | --- |
| No save | first visit after skipping onboarding | profile "New campaign"; CTA "Begin the march"; Army/Stash tiles disabled with "Begin the march first" |
| Fresh / day n / hurt | save | status line variants (as today) |
| Inside a town | `world.inside` | CTA opens the Settlement |
| First steps done | all 4 | quest card hidden; fresco moves up |
| Arc won (post-game) | `arc.stage = 'won' \| 'post'` | status "Day n · The Tyrant is beaten" |
| Sync error | cloud save fails | error chip in the top bar |
| Sync adopt | newer cloud save | notice sheet over the hub |
| Compact (< VH 700) | small phones | 1-line fresco banner |

Loading: none (local save). Error: sync only (above).

### Interaction Map
Tap fresco or CTA → World/Settlement · tap tile → its screen · tap disabled Camp → toast with the full reason · ⚙ → Settings · tab → hub · hover = tips.

### Data Requirements

| Data | Source system (owner) | Update | Null |
| --- | --- | --- | --- |
| Name, portrait | campaign save (#22) | on enter | "New campaign" |
| Day, place, hurt | world state (#19) | on enter | "Day 1 on the march" |
| Lairs n/6 | `WorldSave.lairs`, `arc` (campaign-arc.md) | on enter | hidden |
| Gold, trophies, men | campaign (#16, #22) | on enter | 0 |
| First steps | save flags | on enter | hidden when done |
| Unspent points count | heroes | on enter | no badge |

### Events Fired
Continue → `scene World/Settlement`; tile taps → their scenes; no new events.

### Transitions & Animations
Parchment fade in; the Army badge pops once on enter when its count grew (reduce motion: static).

### Accessibility
Badges carry a number (not colour); disabled Camp has text; profile icons have text labels; contrast per tokens.

### Localization Considerations
Status line ≤ 48 chars en (wraps to 2 lines); tile labels ≤ 10 chars (abbreviation table for ru, not case changes, MENU-3); CTA ≤ 22 chars.

### Acceptance Criteria
- [ ] At 320x568 the Army, Stash and Camp tiles are fully visible without scrolling.
- [ ] The status line shows "Lairs n/6" once a lair has been seen, and never truncates (wraps).
- [ ] The sync icon is absent in the top bar unless the last sync failed.
- [ ] A cloud-sync adopt lands here and shows the notice sheet with the loaded day.
- [ ] The War tab shows a glyph and a label at all four sizes.
- [ ] The hub renders in under 300 ms from the tab tap on a mid-range Android.

## C-4 World map (S04) — full spec

### Purpose & Player Need
"Where do I go next, what's out there, and is it a fight I can win?" The session loop happens here: march, answer events, pick fights, choose a lair.

### Player Context on Arrival
From the hub (planning), from a battle (wounded, richer), or from a town (resupplied). They need the next goal and the danger at a glance.

### Navigation Position
Child of the Campaign hub. Children: Settlement, Field camp, Army, Battle; sheets Encounter, Assault, Event card, Arc sheet.

### Layout Specification

```
┌──────────────────────────────────────┐
│ [←]  Day 14 · Ionian coast  [Lairs 2/6][⚙] │ top bar; chip opens the Arc sheet
│ Day 14, 09:00 · Ionian coast, danger ▲▲ · next: Rhegion │ situation line
│ ◎ 240   👥 8/9   🌾 32 (4d)   ⚒ 12        [👁] │ chips (one order everywhere, WLD-5)
│                                       │
│            painted map                │ field: plates with threat icon,
│      [▲10 Bandits]   ⌂ Rhegion        │ lair garrison plates, burnt lairs,
│                ↘ route ··· ⚑          │ host banner + march line
│                                       │
│ banners (top-centre, 6 s)             │
├──────────────────────────────────────┤
│ [Camp]   [Stop/Rest]   [Party 2]      │ action bar (bronze; march = tap the map)
└──────────────────────────────────────┘
```

### Component Inventory

| Element | Old ref | Change |
| --- | --- | --- |
| Painted map, settlement plates, fog | WLD map, WLD-1, WLD-3 | ink plates on stone (WLD-3); painted fog with a "next town" marker at the fog edge (WLD-1) |
| Party sprite, band plates (men count + threat **icon**), route, target | WLD map, G13 | threat icon added |
| Camp zone and life, night tint | WLD map | same |
| **Lair garrison plate** (size, threat icon) and **burnt lair** icon | campaign-arc.md Touch UI | new |
| **Host banner plate + dotted march line** | campaign-arc.md | new |
| Top bar "Day n · Region", back → hub | WLD top bar | + ⚙ (D9) + **"Lairs n/6" chip** → Arc sheet |
| Situation line + hint | WLD | adds "next: {town}" (WLD-4) |
| Chips gold, men fit/total, food (days), supplies | WLD, WLD-5 | one order everywhere |
| Follow toggle (eye), sync badge | WLD | eye stays; sync badge only on error |
| Action bar: Camp (pitch / open), Stop or Rest/Pause, Party (count) → Army | WLD | Party badge is a count (G11) |
| Banners (spotted, found town, camp, ransom, no way there…) | WLD, WLD-6 | i18n; 6 s TTL |
| Discovery pan | WLD | same |
| Strike-camp confirm | WLD | Mosaic confirm with scrim |
| Encounter sheet: band name, figure, threat + men, culture/level, mood, your army, advice; Attack / Take ransom / Let them go or Flee n% | WLD, WLD-2 | **Mosaic decision sheet** (ia.md §6): band art in a niche, threat chip with icon; **doctrine row** (icon, name, tell, "Codex ›") and **captain row** (name, level, crest) (ai-doctrines.md) |
| **Assault sheet** | campaign-arc.md R2.2 | new optional sheet: garrison art, size, power plate, threat chip, doctrine row, captain row, reward chest; Assault (primary) / Leave; X |
| **Event card** | campaign-events.md R4 | new decision sheet: vignette, title, ≤ 280-char body, 2-3 choices (one terracotta, others bronze), cost chips (icon + number); map paused under a dim scrim |
| **Arc sheet** (Lairs · Journal) | campaign-arc.md, campaign-events.md | new: Lairs list (name, state: standing n men / fallen ✓ / reborn, tap = centre map); Journal (last 20 lines) |
| **Coach marks** (2, first visit) | campaign-arc.md R1.6 | new, reuse the online coach system; placed away from the action bar |
| Gestures: pan, pinch 1-4, wheel; tap band → pursue; tap town → march/enter; tap land → march | WLD | unchanged; an unreachable tap shows "No way there" at the tap point (PLAY C7) |
| ~~`placing` path, "tap Build" banner~~ | WLD-7 | dead code, not mapped |

### States & Variants

| State | Trigger | Change |
| --- | --- | --- |
| Marching / stopped / camping / night | world | action bar variants (as today) |
| Encounter | band contact | decision sheet; map paused |
| Event | event drawn (`pendingEvent`) | event card; dim scrim; time stopped; reopens after an app kill |
| Host marching | `arc.stage = 'host'` | host plate always visible; banner "The Tyrant's host marches on {town}" |
| Start town sacked | host arrival | banner; town plate shows a sacked icon |
| First visit | new campaign | 2 coach marks |
| Error: save write fails | storage | toast "Couldn't save. Retrying" (existing save path) |

Loading: the map renders from the save; the parchment worker shows a fog placeholder until the region is painted.

### Interaction Map
As in the inventory. Decision sheets: Back per screen-flow §4. Arc chip: tap → Arc sheet. Lair tap → Assault sheet. Band tap → pursue; contact → Encounter.

### Data Requirements
World state (#19) for map, bands, day; `WorldSave.lairs`, `arc` (campaign-arc.md); `pendingEvent`, `journal` (campaign-events.md); doctrine and captain from the band (ai-doctrines.md). All event-driven from `world.advance`.

### Events Fired
Existing world actions; new: `assault:open`, `assault:start {lairId}`, `event:choose {id, key}` (campaign-events.md R4), `arc:open`.

### Transitions & Animations
Map → deployment: 180 ms parchment fade. Sheets rise 200 ms. Banners slide in from the top, 6 s.

### Accessibility
Threat = icon + colour; lair state = icon + text; cost chips = icon + number; the event body is text, never in art.

### Localization Considerations
Event body ≤ 280 chars, choice labels ≤ 24 chars (campaign-events.md R5); encounter tell ≤ 60 chars; band names wrap.

### Acceptance Criteria
- [ ] The Encounter, Assault and Event sheets fit at 320x640 with no truncation, en and ru.
- [ ] System Back on the Encounter picks "Let them go", or shakes and highlights Flee when the band hunts.
- [ ] The Lairs chip opens the Arc sheet; tapping a lair centres the map on it.
- [ ] Killing the app with an event open reopens the same card.
- [ ] Chips appear in the order gold, men, food, supplies on World and Field camp.
- [ ] ⚙ is present in the top bar.

## C-5 Field camp / War camp (S05)

- **Purpose.** Field camp: "rest, build and prepare the men"; War camp: "manage this camp's buildings". One scene, two titles (D7).
- **Primary action.** Field: **End day**. War: **Build/Upgrade** (or Collect when waiting).

| Element | Old ref | New place / note |
| --- | --- | --- |
| Top bar "Field camp · Day n hh:00" / "War camp" + sub-title "Home/Forward · {place}" | CAMP, CMP-6, D7 | two-line title |
| Chips field (gold, food, supplies, men) / online (war gold, food, wood, bronze, recruits) | CAMP | one chip order; compact numbers, never "…" |
| Right rail: 5 structures (field) / 5 buildings (online) + zoom | CAMP, CMP-1 | rail opens a **labelled Build drawer** (name, cost, time, count, disabled reason) |
| Action bar field: Muster, Loot → Army › Stash, End day (primary), Strike; placing: Cancel / Place | CAMP, CMP-2 | Muster and Loot get text labels; **Strike keeps its label at 320** (never the tent glyph) |
| Action bar online: Muster, Loot → War army › Stash, Rest, Build/Upgrade, Make camp | CAMP, CMP-6 | disabled buttons show their reason |
| Info line | CAMP, CMP-6 | cost on its own row |
| Temper dialog (forge) | CAMP, CMP-4 | one cost line (icon + amount per currency); localized rarity |
| Muster dialog (class steppers, per-man list) | CAMP, CMP-3 | Formation / Reserve two columns, legend for counts, bronze steppers, ink header |
| Strike confirm | CAMP | Mosaic confirm |
| Placing ghost (valid/invalid) | CMP-5 | ghost centred in view; ✓/✗ glyph |
| Gestures: drag pan, tap structure/tile | CAMP | same |
| **Event card (camp trigger)** | campaign-events.md R3 | same card as World; shown over the camp |
| ~~`campPanel.ts` / `openCampPanel`~~ | WAR-10 | dead code, not mapped |

- **States.** field / online · placing · no camp (auto-return to World) · encounter on End day (→ World with the encounter) · event at night.
- **Touch.** Rail keys 44 pt; drawer rows 52 pt; Strike separated from End day by ≥ 16 pt.
- **Acceptance.** At 320x640 Strike shows its label; every disabled button shows a reason; the build drawer shows name and cost for all 5 items.

## C-6 Settlement (S06)

- **Purpose.** "Hire, resupply, heal, sell, retrain." Villages: Hire and Rest only.
- **Primary action.** Contextual per tab: Hire / Buy / Sell / **Rest 8 hours** (SET-4). Leave becomes bronze (SET-3).

| Element | Old ref | New place / note |
| --- | --- | --- |
| Sub-shell name, back → World | SET | same |
| Banner, "Town/Village of the {people}" | SET, SET-1 | painted vignette per kind and culture (art pass) |
| Chips gold, men n/20, hurt | SET | same |
| Tabs Hire / Buy / Sell / **Services** (towns) · Hire / Rest (villages) | SET | "Rest" → "Services" in towns (ANSWERS Q28) |
| Hire rows: portrait → class card, name · Lv, class, role pill, trait, price; footer "New volunteers in nh"; empty state | SET, SET-2 | trait on its own line; earth-tone role pill (G4); **hire = 4 s Undo toast, no confirm** (controls.md R4.3) |
| **Volunteer-floor recruits** (up to 3 at 20 g when the army < 5) | campaign-arc.md R1.5 | rows marked "Volunteer" in Hire |
| Buy rows (icon → item card, name in rarity ink + gem, slot, stats, price); sold out | SET, G13 | rarity gem letter |
| Sell: stash grid → item card → sell confirm | SET, SET-8 | sell price on each cell |
| Services/Rest: wounded list, rate note, provisions line, Food +10, Supplies +10, Rest 8 hours, Physician: heal all | SET, SET-4 | price chips with coin icon; wounded list sized to content; Rest 8 h primary |
| **Drillmaster row** ("Retrain a perk · 40 g × tier") → Army pick → Hero › Perks retrain | abilities.md R7 | new, towns only |
| Recruit card (sprite, CLOSE + ✕) | SET-7 | X only (G5); 3× sprite or painted bust; ink stat line |
| Action bar: Army → Army; Leave → World | SET | Leave bronze |
| **Sacked state** | campaign-arc.md R5.3 | Hire and Buy tabs show "Sacked by the host: reopens in n days"; Services stays |
| **Event card (arrival trigger)** | campaign-events.md R3 | on enter, before the page is interactive |

- **States.** village / town · empty Hire ("No volunteers today · new in nh") · sold out · sacked · no wounded ("All fit").
- **Touch.** Price buttons ≥ 44 pt with the coin icon inside; tab bar 44 pt.
- **Acceptance.** The town's Services tab lists the Drillmaster with its cost; a village has none; the hire undo toast reverses the hire within 4 s.

## C-7 Army (S07) — the one Army template

- **Purpose.** "Who is in my company, how are they grouped and equipped?" One template with three sources: **campaign** (this screen), **war** (S19 War army), **duel** (S13 Team uses the same row and hero head) (NAV D6). Slot order, Lv pill colour, chip icons and footer are identical across sources.
- **Primary action.** **Sheet** (open the selected hero).

| Element | Old ref | New place / note |
| --- | --- | --- |
| Sub-shell "Army", back → (origin), sync badge | ARM | back to origin; **footer back removed** (N3, ARM-1) |
| Status sentence, chips men/gold/hurt | ARM | same |
| Selected hero card: niche, name, stars, class, Lv pill, role pill, Power, group buttons I-IV + name, 5 gear slots + mount | ARM, ARM-8 | collapses to a 1-line header on scroll (ARM-3); **one slot layout** shared with Hero |
| Tabs Roster n/20 · Stash n | ARM | count badges only for actionable states (G11) |
| Roster filter + sort; rows (portrait, group disc in group colour + numeral, power, name, points badge, Lv + class or wounded, stars); 1st tap select, 2nd → Hero; empty state | ARM, ARM-2, ARM-4 | group discs in the 4 group colours with numerals (G3); full class names (no "Hoplt") |
| Stash: 6 slot filters, rarity filter, sort, grid (rarity frame + **gem**, condition bar, upgrade arrow); tap → item card; long-press drag to slot | ARM, ARM-5 | "Sort: rarity" label; gem letter; **tap item, then tap slot** as the non-drag path |
| Item card / compare (Sell in town, Scrap in camp, Repair, Equip, Take off) | ARM-6 | verdict line first ("Worse: −34 power"); Equip in a warn style when requirements fail |
| Action bar: Sheet (primary), Dismiss → confirm | ARM, ARM-7 | Dismiss bronze with skull, confirm stays |
| **Pick mode** ("Retrain whom?") | abilities.md R7 | new: from the Drillmaster; a tap on a row opens Hero › Perks in retrain mode |

- **States.** roster / stash · empty roster ("Volunteers wait in {town}") · empty stash · pick mode.
- **Touch.** Rows 52 pt; slot cells 44 pt; Dismiss and Sheet ≥ 24 pt apart.
- **Acceptance.** Opened from the hub, Back returns to the hub and no footer button says "Map"; slot order matches Hero.

## C-8 Hero (S08)

- **Purpose.** "Grow this man: stats, gear, perk path, abilities."
- **Primary action.** **Confirm n** while points are pending; otherwise none (tabs are the content).

| Element | Old ref | New place / note |
| --- | --- | --- |
| Top bar name, back → (origin) | HRO | same |
| Power chip; pager ‹ i/n ›; wounded line | HRO, HRO-4 | pager moves **under the niche** (fixes the 320 overlap) |
| Stage niche (swipe = next/prev) | HRO, HRO-2 | 3× integer sprite or painted bust; collapses on scroll (HRO-1) |
| 5 slots + mount, Lv pill, stars, class, role pill, traits, XP bar | HRO, HRO-5 | shared slot layout; XP bar shows "0%" notch |
| Tabs (badges) Stats · Gear · Perks · Skills | HRO | Stats default |
| Stats: points header, STR/AGI/END/WIL with −/+, derived bars with preview, Record, Traits, Respec (duel) | HRO, HRO-3 | description under the name, full width; bronze steppers |
| Gear: stash grid + drag to slot | HRO, HRO-6 | kept (equip context), same component as Army › Stash |
| Perks: tier tree → perk modal (Learn + confirm) | HRO | **tiers become rows of two cards A/B** (abilities.md Touch UI); a free point pulses both cards; tap → sheet with details and "Take {name}?" |
| **Retrain mode** (Retrain button on taken tiers, cost 40 g × tier, or "1 free retrain" from the Oracle) | abilities.md R7, campaign-events.md | new; only from the Drillmaster or with a free retrain |
| Skills: abilities and auras with cooldowns; empty → Perks | HRO | lists the hero's signature active and the standard if any (abilities.md) |
| Action bar: Undo / Confirm n (pending); Dismiss (duel source) | HRO, HRO-7 | Dismiss bronze |

- **States.** points pending · no points · wounded · duel source · retrain mode · last fit hero (Dismiss disabled with a reason).
- **Touch.** Perk cards ≥ 44 pt tall, two per row at 320; steppers 44 pt.
- **Acceptance.** At 320x640 the pager does not overlap any slot; a perk tier shows two cards; retrain shows the cost and confirms.

## C-9 Battle (S09)

The HUD, its states and the deployment tools are specified in [hud.md](hud.md). Entry/exit rules: screen-flow.md S09. The tutorial overlay is HUD §E.

## C-10 Results (S10) — full spec

### Purpose & Player Need
"Did we win, why, who did well, and what do I take?" P4: every loss is explained.

### Player Context on Arrival
Straight from the field, emotional. Victory: wants the loot. Defeat: wants the reason and the dead.

### Navigation Position
Pushed by Battle; exits to the battle's origin via Onward.

### Layout Specification

```
┌──────────────────────────────────────┐
│          ▓ VICTORY ▓ (laurels)       │ banner plaque
│        vs Bandits of Kroton          │
│  "We broke their flank at 0:42."     │ WHY LINE (≤ 2 lines, never ellipsized)
│ [Summary] [Heroes] [Spoils 3]        │ tabs
│ ┌ Time ┐┌ Kills ┐┌ Losses ┐┌ Gold ┐┌ XP ┐
│ ┌ MVP: bust · name · class · kills ┐ │
│ report notes as chips                │
├──────────────────────────────────────┤
│ ◆═══ SPOILS → / TAKE 2/3 / ONWARD ═══◆│ primary
└──────────────────────────────────────┘
```

### Component Inventory

| Element | Old ref | Change |
| --- | --- | --- |
| Banner plaque Victory/Defeat/Stalemate/Retreat, laurels, confetti, shake; "vs name · verified" | RES, RES-2 | painted laurels |
| **Why line** | battle-readability.md R5 | new, under the banner; mirror lines on victory; "They withdrew at {t}" |
| Tabs Summary · Heroes · Spoils | RES | same |
| Summary tiles Time, Kills, Losses, Gold/Glory, XP (tap = tip) | RES | (i) on tiles for the non-touch path |
| MVP card | RES, RES-1 | painted class bust or a correctly framed 3× sprite (head visible) |
| Level-up line, report notes | RES, RES-5 | chips with icons; promotions as a badge |
| Heroes rows (portrait, name, Lv, XP bar, +XP, status, fallen) | RES, RES-3 | bar aligned to the text column |
| Spoils: pick counter, face-down cards that flip, rarity/name/condition; tap → Inspect (compare, Take / Put back) | RES, RES-4, RES-7 | chest art for the empty state; Inspect X only; compare deltas with +/− signs |
| **Bounty line** ("Captain captured: +n g") | ai-doctrines.md R6.4 | new report note when it applies |
| **Lair hoard** (3 picks, one epic guaranteed) | campaign-arc.md R6 | rides the Spoils tab with a "Lair hoard" header |
| **Victory variant** (the host beaten): company roll (survivors' names), set-piece reveal, "Continue the campaign" | campaign-arc.md R5.4 | new full-height variant, then the normal Spoils |
| Primary: Spoils → / Take spoils k/n / Onward | RES | Onward → origin (World, Codex beast sheet, Duels, War, First run) |
| System Back | RES-6, N8 | Spoils tab first if unseen; on Spoils = Onward + toast "Spoils taken: n" |

### States & Variants
Victory · Defeat · Stalemate · Retreat · Victory (arc) · trial (practice: "No spoils in practice", Spoils tab hidden) · online (verified line; Onward → source `done()`) · no spoils (empty state) · verify pending (online: "Verifying…" skeleton on the report notes; error: "Couldn't verify: rewards will arrive later", Onward stays).

### Interaction Map
Tabs; tiles (tap/hover tip); spoil card flip and Inspect; Onward.

### Data Requirements
`report.ts` (#18): outcome, tiles, MVP, why, notes, bounty; loot (#18) for spoils; heroes (#16) for XP. Read once on enter; online verify result by callback.

### Events Fired
Existing `results:take`, `results:onward`; new `results:why {rule}` (analytics, to check the "100% explained defeats" target).

### Transitions & Animations
180 ms fade from battle; banner shake (Reduce shake = 0); card flips 250 ms (reduce motion: instant reveal).

### Accessibility
Outcome in text and plaque colour; rarity gem on spoils; the why line is text.

### Localization Considerations
Why line ≤ 90 chars en, wraps to 2 lines; tile labels ≤ 8 chars.

### Acceptance Criteria
- [ ] Every defeat shows a why line (fixtures one per rule, `results-why`).
- [ ] A Trial fight's Onward returns to the same Codex beast sheet.
- [ ] Back with unseen spoils opens the Spoils tab instead of leaving.
- [ ] The MVP portrait shows the head.
- [ ] The Victory variant lists every survivor by name and then the set-piece reveal.
- [ ] Results is interactive within 400 ms of the battle end.

## Open Questions
1. The Trial's rule copy depends on V5-011's chosen fix (practice vs cooldown); C-10 and M-1 carry both variants.
2. Painted art (busts, vignettes, fresco) is an art-pass dependency; until then the specs fall back to 3× integer sprites, never upscaled pixel art in painted frames (G8).
