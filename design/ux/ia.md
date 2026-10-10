# Information Architecture (v5)

> **Status**: In Review (S2-UX-IA)
> **Author**: ux-designer (autonomous; answers in `docs/v5/ux/ANSWERS.md`)
> **Last Updated**: 2026-10-10
> **Platform Target**: Telegram Mini App, portrait; touch first, mouse second (Telegram Desktop). Designed at 390x844; clean at 360x780; usable at 320x640 and 320x568.
> **Accessibility tier**: Standard (V5-013)
> **Template**: UX Spec (flow)
> **Inputs**: docs/v5/audit/NAV.md, UI.md; docs/v5/VISION.md; DECISIONS V5-013..024; design/gdd/*.md; docs/redesign/V4_SPEC.md

This is the map of the game: which tabs exist, which screen is the **home** of each thing, and which **doors** lead there. The screen-by-screen specs are in [screens-campaign.md](screens-campaign.md) and [screens-modes.md](screens-modes.md), the flow in [screen-flow.md](screen-flow.md), the battle HUD in [hud.md](hud.md) and the shared controls in [interaction-patterns.md](interaction-patterns.md).

## 1. Principles

1. **One home per thing, many doors.** Every object or action has exactly one screen where it is shown in full and changed. Other screens may link there (a door), or show a read-only summary, but never a second editor. *(Fixes NAV D3, D4, D6.)*
2. **Tabs are modes; hubs are roots.** The five tabs are the five things you can *do*. A hub has no back arrow, ever; Telegram shows Close. A door into a hub (War army → Shop, "Need n Dr", a deep link) **switches tabs**; it never pushes the hub as a sub-screen. *(V4_SPEC, NAV D12.)*
3. **Back returns to where you came from.** Two kinds of screen:
   - **Single-parent** screens have one way in, so Back goes to that parent: World → Campaign hub, Settlement → World, Field camp → World, War camp → War hub, Clan → War hub, Merchant → War hub, Duels views → the Duels hub view they came from.
   - **Multi-door** screens return to the **origin** passed in `back: { scene, data }`: Army, Hero, War army, Market, Battle, Results, and every sheet opened through a door.
   Back labels never name a place; the arrow (or Telegram's BackButton) is the only back. *(NAV N1-N3, D8.)*
4. **≤ 2 taps from a hub to the mode's main action** (march, fight a floor, find a match, collect, buy). *(P3.)*
5. **No dead ends.** Every screen and every state (empty, error, offline, outside Telegram) has an exit and a next action. *(NAV §3.)*
6. **Honesty.** Only features in the code or a merged GDD. *(V4_SPEC, memory "verify mockups".)*

## 2. Top level

```
┌──────────────────────── Tab bar (roots) ────────────────────────┐
│ Campaign      Duels        ( WAR )        Codex        Shop       │
│ your company  ladder+arena  season map     what you know  money    │
└───────────────────────────────────────────────────────────────────┘
Global, from every top bar: ⚙ Settings (sheet). Telegram ⋯ › Settings is a second door.
```

| Tab | Hub (root) | Answers the question | Main action (≤ 2 taps) |
| --- | --- | --- | --- |
| **Campaign** | Campaign hub (`Menu`) | "Where is my company, and what next?" | Continue the march → World map |
| **Duels** | Duels hub (`Duel`), views Ladder · Arena | "Can I climb today?" | Fight floor n / Find match |
| **War** (centre medallion) | War hub (`Online`), the season map; plaque "PIXELARROW" as today | "What does my war army need?" | Collect / tap a hex → March or Attack |
| **Codex** | Codex hub (`Codex`) | "What is this enemy, and how do I beat it?" | Open an entry → Trial fight (beasts) |
| **Shop** | Shop hub (`Shop`), pages Shop · Pass · Wallet | "What can I buy or claim?" | Claim (Pass) / Buy |

The tabs are unchanged from v4 (locked with the owner). What changes is what lives under them.

## 3. Homes: one per thing

| Thing | Home (where it is shown in full and changed) | Doors (links in) | Read-only mirrors |
| --- | --- | --- | --- |
| Campaign company (roster, groups) | **Army** (campaign source) › Roster | Campaign hub Army tile · World Party · Settlement Army · Drillmaster (pick mode) | Hub profile card "Warband n men", World men chip |
| Campaign stash | **Army** › Stash | Hub Stash tile · Camp Loot · Hero › Gear (same component, equip context) · Settlement › Sell (sell context) | — |
| One hero (stats, gear, perks, skills, retrain) | **Hero** | Army row (2nd tap) / Sheet · Duels Team row · Drillmaster | Results › Heroes rows |
| Campaign world (map, bands, lairs, events) | **World map** | Hub Continue · Settlement Leave · Camp back · Results Onward | Hub status line "Day n · Lairs 2/6" |
| Lairs and the arc | **Arc sheet › Lairs** (World) | World "Lairs n/6" chip | Hub status line |
| Event journal | **Arc sheet › Journal** (World) | the same chip | — |
| Field camp (structures, muster, temper, end day) | **Field camp** | Hub Camp tile · World Camp | — |
| Town services (hire, buy, sell, rest, drillmaster) | **Settlement** | World (arrive or tap) · Hub Continue (when inside) | — |
| Beasts (lore, how it fights, counter, loot) and the **Trial fight** | **Codex › Beast sheet** | Codex list · War boss/lair panel "Codex ›" | — |
| Enemy doctrines (tells, counters) | **Codex › Doctrine sheet** | Codex list | Encounter and Assault doctrine row (i) page; battle doctrine chip popover (same text) |
| Duel team, presets, bench | **Duels › Team** | Duels hub Team button | — |
| Glory gear | **Duels › Armoury** (renamed from "Shop") | Duels hub Armoury button | — |
| War army, war stash, garrison | **War army** (`OnlineArmy`) | War hub Army · hex Garrison · Camp Loot (war) | — |
| War camp | **War camp** (`Camp` online) | War hex Camp action | — |
| Clan | **Clan** | War hub Clan · pending invite · bot deep link | — |
| Map merchants | **Merchant** | War hex Merchant action | — |
| Player market | **Market** | **Shop hub › Shop "Market" card (new door)** · War army Market · stash item Market · bot deep link | — |
| Cosmetics, Pass, Drachmae | **Shop hub** (Shop · Pass · Wallet) | Shop tab · War army Shop (tab switch) · "Need n Dr" → Wallet page (tab switch) · bot deep link | Drachmae chips (Market, Merchant) |
| Settings, notifications, about, new campaign | **Settings sheet** (pages, not stacked modals) | ⚙ in every top bar · battle menu (⋯) · Telegram ⋯ · bot deep link | — |
| Tutorial | **Battle (tutorial)** | First run · Settings › Tutorial Replay | Hub First-steps card |

## 4. V5-015 resolved: Codex is the encyclopedia, the Trial is the action

**Decision.** The BeastTrial *list screen* is retired: it was the Codex list again (NAV D3, CDX-1). Its **beast sheet** becomes the **Codex beast sheet** with everything it had, and the **Trial fight** is the sheet's primary action. A Trial fight returns to that sheet (NAV N1).

```
Codex hub ──tap beast──▶ Beast sheet (Codex) ──Trial fight──▶ Battle (beast) ──▶ Results ──Onward──▶ Beast sheet
   │                         ▲                                                                     (same entry, "Defeated ✓")
   └─tap doctrine─▶ Doctrine sheet
War hub ─hex/boss panel─ "Codex ›" ─────┘  (read only; the War action stays Raid it / Attack in War)
Encounter / Assault sheet ─ doctrine row (i) ─▶ the same doctrine text, as a page inside the sheet (no navigation)
```

| Link | From | To | Kind | Why |
| --- | --- | --- | --- | --- |
| L1 | Codex beast row | Beast sheet | navigation | the one home of a beast |
| L2 | Beast sheet "Trial fight" | Battle (beast, practice) | action | the Trial lives *in* the entry; no separate list |
| L3 | Results (trial) Onward | Beast sheet | return | fixes N1 |
| L4 | War boss / lair panel "Codex ›" | **switches to the Codex tab** with the Beast sheet open | door | learn before you raid; the War action stays in War. The sheet's X lands on the Codex hub; the War tab brings the player back. |
| L5 | Encounter / Assault sheet doctrine row "(i)" | the doctrine's Codex text as a **nested page inside the sheet** (back chevron returns to the encounter) | inline | the player must still answer the encounter; leaving the map mid-decision is not allowed |
| — | Codex → War, Codex → Campaign | none | — | the encyclopedia never sends you into a mode |

**Rules.**
- Beasts are always listed by name (as today). Doctrines are hidden until first fought (ai-doctrines.md), shown as "? Unknown doctrine" rows (a lock glyph + text) so the player knows there is more. A "Defeated ✓" mark on beasts is **proposed** (needs a small optional save flag; Director decision, REVIEW.md).
- The Trial's rule line comes from VISION ("Practice: no spoils"); if V5-011's fix picks a cooldown, the sub-line shows it instead.
- Trial fight is disabled with a reason when the army has no fit men (as today).
- Deep links to `BeastTrial` (none exist today) would route to `Codex {open}`.

## 5. Names (one name, one place)

| Old | New | Where | Why |
| --- | --- | --- | --- |
| Duels "Shop" (top bar "SHOP") | **Armoury** | Duels view | collides with the Shop tab (D2, DUE-8) |
| Battle order "Back" | **Withdraw** (Feint for eligible groups) | Battle order bar | V5-024, controls.md R9 |
| Battle "Flee" (top bar) | **Retreat** (⋯ menu, its confirm and the Results banner use the same word) | Battle | one term per action; "Flee n%" stays on the map Encounter, where it is a different action |
| Market "withdraw" a listing | **Cancel listing** | Market › Mine | "Withdraw" now belongs to the battle order |
| Battle "Men" | **Groups** | Battle deployment | controls.md R1.4 |
| Camp (both) | **Field camp** / **War camp** | Camp top bar | D7 |
| Town tab "Rest" | **Services** (towns); villages keep "Rest" | Settlement | holds the drillmaster (abilities.md R7) |
| "Beast trial" screen | gone; the action is **Trial fight** | Codex beast sheet | V5-015 |
| FirstRun "Two ways to fight" | **Three ways to fight** | First run | FR-3 |
| Active `wheel` | **recharge** ("Wheel and Re-charge") | medallion | V5-024 |

Shop, Market, Merchant and the town's Buy tab keep their names: each is distinct once the Duels one is renamed. Each gets its own icon (Shop: stall; Armoury: crossed swords on a rack; Market: scales; Merchant: mule pack; Buy: coins).

## 6. Back and modal contract

| Surface | Back / Telegram BackButton | X | Tap outside |
| --- | --- | --- | --- |
| Hub (tab root) | hidden; Telegram shows Close | — | — |
| Sub-screen | pops to `back` | — | — |
| Optional sheet (info, item, recruit card, Assault, Settings) | closes the sheet | **yes**, top right; no footer CLOSE when another action exists (G5) | closes |
| Decision sheet (Encounter, Event card, Leave/Flee/Reset confirm) | the least committal choice (see screen-flow §4) | no | nothing |
| Nested page inside a sheet (Notifications, About, a doctrine page in the Encounter, Settings inside the battle menu) | back chevron inside the sheet; never a 2nd stacked sheet (G6, MENU-8) | — | closes the sheet |
| Confirm over a sheet (buy, sell, retrain, choose an event option) | Cancel | — | nothing |
| Battle | opens the **battle menu** (⋯: Settings, Retreat or Leave; tutorial: Skip tutorial); offline it pauses | — | — |
| Search (Duels) | Cancel only; the back arrow is hidden (N5) | — | — |

**Stacking rule:** at most **one sheet plus one confirm** on screen. Anything else that would open from a sheet replaces the sheet's content as a nested page. Every modal sits on a **45% basalt scrim** (G6).

## 7. What moved, at a glance

- **Removed screens:** BeastTrial list (merged into Codex). No other screen is removed.
- **New screens/sheets** (all from merged GDDs): Assault sheet, Event card, Arc sheet (Lairs · Journal), Victory variant of Results, Doctrine sheet (Codex), Works tray, "more" medallion sheet, battle menu (⋯), Retrain mode on Hero › Perks, sync-adopt notice.
- **New doors:** Market from the Shop hub; Codex from War boss panels and from doctrine rows; Drillmaster row in towns.
- **Removed doors:** Army footer back; back arrows on the Duels and War hubs; Team ↔ Armoury cross-links; the Duels search back arrow.
- The full element-by-element ledger is `docs/v5/ux/ELEMENT_MAP.md`.

## 8. Acceptance Criteria

- [ ] No hub ever shows a back arrow, including when reached from a door (tab switch).
- [ ] Every multi-door screen's Back returns to the screen that opened it (test each door listed in §3).
- [ ] At most one sheet and one confirm are ever on screen at once.
- [ ] No screen is titled "Beast trial" and the Trial fight is only in the Codex beast sheet.
- [ ] Every thing in §3 has exactly one editing screen (manual audit per release).
