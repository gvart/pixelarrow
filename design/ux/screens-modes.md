# UX Specs: Codex, Duels, War, Shop and global sheets (M-1 … M-15)

> **Status**: In Review (S2-UX-IA)
> **Author**: ux-designer (autonomous; answers in docs/v5/ux/ANSWERS.md)
> **Last Updated**: 2026-10-10
> **Journey Phase(s)**: 5-minute loop (Duels, War), long-term (Codex, Shop)
> **Platform Target**: Telegram Mini App, portrait; touch first, mouse second; keyboard/gamepad out of scope. 390x844 design, 360x780 clean, 320x640 and 320x568 usable.
> **Accessibility tier**: Standard (V5-013)
> **Template**: UX Spec
> **GDDs referenced**: ai-doctrines.md (Codex doctrines), controls.md (ladder pause, settings), abilities.md (duel respec), battle-readability.md (report why line)

Shared rules (layout, touch targets, states, text, colour, data, transitions, accessibility, input) are **§0 of [screens-campaign.md](screens-campaign.md)** and apply here unchanged. Entries, exits and Back: [screen-flow.md](screen-flow.md) §3.

## M-1 Codex hub (S11) — the one home of beasts and doctrines

- **Purpose.** "What is this enemy, and how do I beat it?" (V5-015: the encyclopedia; the Trial is the action inside an entry.)
- **Primary action.** Open an entry; in a beast entry, **Trial fight**.

```
┌──────────────────────────────────────┐
│ [ ]        ▓ CODEX ▓            [⚙] │
│ [ Beasts 6 ][ Doctrines 2/4 ]        │ segmented (Doctrines appears after the first one is met)
│ ┌[art] Lernaean Hydra       Lv 7  ›┐ │ row: art 2×, name, 2-line hint, state
│ │ Five heads strike on long necks;  │ │
│ │ fire stops the regrowth. ✓ Defeated│ │
│ └───────────────────────────────────┘ │
│ ┌[sil] ? Not met              🔒  ›┐ │
├──────────────────────────────────────┤
│ Campaign  Duels  (WAR)  Codex  Shop  │
└──────────────────────────────────────┘
```

| Element | Old ref | New place / note |
| --- | --- | --- |
| Hub shell, title "Codex" | CDX | same; book icon in the tab (MENU-3) |
| Section "Beasts", one row per beast: thumbnail, name, hint, Level / World boss | CDX, CDX-2, CDX-3 | 2× art, **2-line hint**, one title size, state "Not met / Seen / Defeated ✓" (glyph + text) |
| Beast trial top bar, back, sub line "Fight any beast with your army" | TRL | **retired screen**; the sub line moves into the beast sheet as the Trial's caption |
| Beast trial rows (same as Codex rows) | TRL, D3 | **removed, redundant**: identical to the Codex rows |
| **Beast sheet**: stage art, "Beast lair / World boss · Level n", How it fights (bullets), Counter, Loot | TRL sheet, TRL-2 | moved intact to Codex; real bullet glyphs; flat sheet; X only |
| Beast sheet "Fight it" (disabled when no fit men) | TRL | renamed **Trial fight**, primary; caption "Practice: no spoils" (or the cooldown, V5-011); reason when disabled |
| Beast sheet Close | TRL-2 | removed (G5: the X closes; there is another action) |
| **Doctrines section**: one row per doctrine met (icon, name, one-line tell); unmet as "? Unknown doctrine" | ai-doctrines.md "Codex" | new |
| **Doctrine sheet**: tells, counters, the band kinds that use it | ai-doctrines.md | new; opened from the list or a "Codex ›" door |

- **States.** nothing met (all silhouettes; entries still open) · beasts only (Doctrines segment hidden until one is met) · Trial disabled (no fit men: reason) · opened through a door (the sheet's X returns to the door's screen).
- **Touch.** Rows ≥ 60 pt; the segmented control 44 pt; Trial fight full width in the sheet's action row.
- **Data.** beasts (`src/data/beasts.ts`), Codex seen/defeated flags (campaign save; new optional field), doctrine unlocks (ai-doctrines.md).
- **Events.** `codex:open {id}`, `trial:start {beast}`.
- **Acceptance.** Trial fight → Battle → Results → Onward lands on the same beast sheet; no screen titled "Beast trial" remains; at 320 every row title uses the same size.

## M-2 Duels hub (S12): Ladder · Arena

- **Purpose.** "Climb the ladder today, or play a live/async match."
- **Primary action.** Ladder: **Fight floor n**. Arena: **Find match** (or Raid).
- **Layout (A2).** Chips (Glory, Lv), **Team** and **Armoury** in one row; small banner; Ladder | Arena switch; content; the CTA in the flow or with matching bottom padding so nothing hides under it (DUE-1, DUE-4).

| Element | Old ref | New place / note |
| --- | --- | --- |
| States loading skeleton / outside / offline / closed / error + Retry | DUE | outside gets **"Open in Telegram"** (DUE-9, N7) |
| "Duels" title, Demo note | DUE | same |
| Glory chip, Lv chip → Level sheet | DUE | parchment chips (DUE-4) |
| Team button (badge) → S13, Shop button → S14 | DUE | one row with the chips; Shop renamed **Armoury** |
| Fresco | DUE | shrinks; hidden < VH 700 |
| Ladder \| Arena switch | DUE | same |
| Ladder: tip, next-floor card → Floor sheet (wells, stars rule, enemy list, Fight/Farm), Farm-Glory bar, 5 chapters (toggle, stars, 3 chests → claim/preview, floor tiles), CTA Fight floor n | DUE, DUE-1, DUE-12 | floor tiles show "next ▸" / "cleared ✓" glyphs (G13); floor sheet full width, earth role pills |
| **Ladder battle can pause, 0.5×/1×/2×** | controls.md R10 | shown in the Floor sheet as "Pausable" |
| Arena: season line, Live PvP card (standing, won/lost, rule, Find match/Rejoin, Unranked, Top → board), locked ranked card, Raids card (standing, raids left, defence row → Defence sheet, Raid → S16, Log → Raid log, Top) | DUE, DUE-7 | season icon; scroll cue |
| Season rewards → choose a piece | DUE, DUE-10 | full text wraps |
| Chest preview / chest reward sheet | DUE-11 | painted chest (art pass) |
| Back arrow on the hub | NAV D12 | **removed** (root) |

- **States.** as listed; plus ladder ticket expiring (in battle, HUD §D).
- **Touch.** Floor tiles ≥ 44 pt; Team/Armoury 44 pt.
- **Acceptance.** At 320x640 the first chapter's floor tiles are fully visible above the CTA; no back arrow on the hub; "Open in Telegram" appears outside Telegram.

## M-3 Duels › Team (S13)

- **Purpose.** "Set who fights, in which preset."
- **Primary action.** **Recruit** (when room) — placed in the flow, not over row 5 (DUE-5).

| Element | Old ref | New place / note |
| --- | --- | --- |
| Roster card, Symbols legend | DUE | legend behind an (i) |
| Preset chips (+), rename / duplicate / delete, Use for Ladder / Arena / Defence, points bar | DUE, DUE-5 | preset tools move into a **Preset sheet** behind the active chip, labelled buttons; the selected use shows ✓ + bronze-lit |
| Hero rows → Hero (duel source); bench toggle | DUE | same; uses the Army row template (D6) |
| **Dismiss on bench rows** → confirm | N10, DUE-13 | new door to the existing `openDismiss` |
| Recruit sheet | DUE | 4 s undo toast on hire |
| Header Shop cross-link | D11 | **removed**; Back → hub |

- **States.** roster full (Recruit disabled: "Dismiss someone first" with the bench Dismiss now reachable) · empty preset.
- **Acceptance.** The first hero row is visible without scrolling at 390x844; a bench hero can be dismissed from Team.

## M-4 Duels › Armoury (S14) (was "Shop")

- **Purpose.** "Spend Glory on gear; sell what I don't need."
- **Primary action.** Buy (on the offer card).

| Element | Old ref | New place / note |
| --- | --- | --- |
| Top bar "Armoury" | DUE-8 | renamed |
| Today / Gear / Sell, slot filter, Compare-with sheet, offer cards (Buy), Sell grid | DUE | same; rarity gem |
| Header Team cross-link | D11 | removed |

- **Acceptance.** No screen in Duels is titled "Shop".

## M-5 Duels › Leaderboard (S15)

| Element | Old ref | New place / note |
| --- | --- | --- |
| Boards Live / Legend / Raids, pinned "You" row | DUE | "You" pinned at the bottom always |
| Title | DUE-2 | "Leaderboard"; the segment is the only state |
| Medals, season line, crests | DUE-3 | bronze 3rd medal; season line wraps; player crest |

- **States.** loading skeleton · error Retry · empty ("No ranked players yet").
- **Acceptance.** The title never contradicts the selected segment.

## M-6 Duels › Raid picks (S16)

Candidates and "Raid {name}" (primary). Back → Arena. Empty: "No defenders in range · Retry". Unchanged apart from shared rules.

## M-7 Duels › Search / Found (S17)

Rings, timer, range bar, team card, **Cancel** (the only exit; back arrow hidden, N5); Found: crests, "vs", Preparing. Crisp arena icon (DUE-6).

## M-8 War hub (S18)

- **Purpose.** "Grow my war army: collect, march, take hexes."
- **Primary action.** **Collect** when income waits (lives in the situation strip, WAR-4); otherwise the selected hex's main action.

| Element | Old ref | New place / note |
| --- | --- | --- |
| Hub shell, ⚙, War tab | WAR | **no back arrow** (D12) |
| States loading / unavailable / join | WAR, WAR-5 | unavailable: "Open in Telegram" primary; the empty HUD band hidden |
| Situation line; chips war gold, food, wood, bronze, recruits, energy (tap = tip) | WAR, WAR-1 | **compact numbers (1.2K), icon chips, 2 rows if needed; never "…"** (the audit's one blocker) |
| March bar (countdown, Halt) | WAR | same |
| Round buttons Army, Clan, Lobby (badge), Region map | WAR, WAR-2 | a **stone rail with labelled keys** (≥ 6.5 UI px, ink on stone) |
| Collect | WAR, WAR-4 | in the situation strip |
| Hex panel: title, tier, owner, yields, defenders, siege, boss HP, garrison, income, merchant kind; actions Merchant, Camp, Beast, March, Attack, Garrison, Collect with reasons | WAR | same; + **"Codex ›"** on beast/boss hexes (ia.md L4) |
| Attack and duel result modals | WAR-9 | Results tile language |
| Lobby (Challenge / Cancel / Busy) | WAR-8 | crest + level; X |
| Boss and lair info (Raid it / Attack) | WAR-7 | leaderboard as a table; reason under a disabled Raid it; "Codex ›" |
| Coach marks (7) | WAR-6 | placed opposite the rail |
| Challenge popup (Decline / Fight) | WAR | same (any `Online*` scene) |
| Region plates | WAR-2, WAR-3 | ink on parchment; toned fog |
| Gestures: tap hex, pan, pinch, wheel | WAR | same |

- **Acceptance.** At 320x640 every resource chip shows a number; no back arrow; Collect never overlaps the region plate.

## M-9 War army (S19) (+ garrison picker)

- **Purpose.** "Recruit, equip and station my war army." Same Army template as C-7 (D6).
- **Primary action.** **Recruit** (garrison mode: **Station**).

| Element | Old ref | New place / note |
| --- | --- | --- |
| Sub-shell "War army" / "Garrison", back → War hub | OAR | renamed from "Online army" |
| Chips war gold, food (**wheat icon**), energy | OAR, OAR-3 | wheat, not heart |
| Hero head (stage, name, stars, class, Lv, Power, status pill, group I-IV, gear slots) | OAR, OAR-1, OAR-4 | group buttons on their own row (fits 320); bronze Lv pill; ink status |
| Garrison head and pick mode | OAR | same |
| Tabs Roster · Stash; rows; stash grid → item card (Market / Salvage, Equip) | OAR | Army row template |
| Footer Recruit (primary), Market, Shop, Map icon | OAR, OAR-2 | **Map icon removed** (back exists, redundant); 3 labels at a fixed size |
| Recruit sheet (Hire, class card) | OAR | undo toast |

- **Acceptance.** At 320x640 group IV is on canvas; the footer has 3 labelled buttons.

## M-10 Clan (S20)

| Element | Old ref | New place / note |
| --- | --- | --- |
| Sub-shell "Clan", back → War hub; states loading / offline / error | CLN | i18n (CLN-1) |
| No clan: info card, "Found a clan" → name/tag prompt | CLN, CLN-4 | art + "how clans work" in 3 icon bullets; prompt buttons 44 pt, localized (CLN-3) |
| Clan header "[TAG] Name", "n/30 men · r regions · role" | CLN, CLN-2 | banner card (Clan flags cosmetic, regions, rank); role chips |
| Member rows → manage (Make officer, Demote, Hand over lead, Kick, Close) | CLN | X only |
| Footer Invite (share or copied link, code, 7 days), Leave (confirm) | CLN, CLN-3 | reason under a disabled Invite |
| Join offer popup, flash messages | CLN | same |

- **Primary action.** Invite (in a clan) / Found a clan (none).
- **Acceptance.** Every string is translated in ru; a disabled Invite shows why.

## M-11 Merchant (S21)

| Element | Old ref | New place / note |
| --- | --- | --- |
| Sub-shell "Merchant / Crossroads / Harbour", back → War hub | MER | same |
| Chips war gold, Drachmae | MER | same |
| Info card: kind, goods, in reach ✓/✗, discount or holder, restock | MER, MER-1 | the discount shown **once** here; list prices struck through |
| Sections (supplies and basic gear, regional, Rare today); rows: icon → item card, name, "Today n/cap", description, buy gold / Drachmae with reasons → confirm | MER, MER-2 | "Daily limit reached" under capped rows |

- **Primary action.** Buy on a row. **Acceptance.** A capped row shows its reason.

## M-12 Market (S22)

- **Purpose.** "Buy from and sell to other players." Home stays here; doors from the Shop hub (new), War army, stash items and the deep link (ia.md §3).
- **Primary action.** Browse: Buy on a row; Sell: **List**.

| Element | Old ref | New place / note |
| --- | --- | --- |
| Top bar "Market", back → (origin), default **Shop hub** | MKT, N4 | default origin changes from War to Shop |
| Chips war gold, Drachmae | MKT | same |
| Tabs Browse · Mine · Sell | MKT | same |
| Browse: Kind / Currency / Sort, Find…, clear ✕; rows → listing card → buy confirm; Show more; empty | MKT, MKT-1, MKT-2 | filters open **option sheets**; expired listings use the disabled style with "Expired" or are hidden |
| Mine: "n/max open", rows with status, withdraw ✕ → confirm | MKT | same |
| Sell: grid → sell form (quantity, currency toggle, price stepper, fee, you get, town picker, List) | MKT, MKT-3, MKT-5 | numeric entry + ×1/×2/×5 presets; ✓ on the selected currency; town list sheet; laid out from the sheet width |

- **States.** loading · offline · outside ("Open in Telegram") · empty browse ("Nothing listed · Sell something") · max listings.
- **Acceptance.** Reachable from the Shop hub in 1 tap; an expired listing never shows an active price button.

## M-13 Shop hub (S23): Shop · Pass · Wallet

- **Purpose.** "What can I buy, claim or top up?"
- **Primary action.** Pass: **Claim all** (when claimable) or Unlock premium; Shop: Buy on an offer; Wallet: a pack.

| Element | Old ref | New place / note |
| --- | --- | --- |
| Hub shell "Shop"; back only when opened with `back` | SHP | same |
| Drachmae chip → Wallet; fresco; tabs Shop · Pass (claim badge) · Wallet | SHP, SHP-5 | painted fresco |
| States loading / outside / offline / closed / error + Retry | SHP, SHP-4 | card skeleton; outside: "Open in Telegram" |
| Shop: tip; cosmetics per slot (Equipped / Owned / price / locked with source) → cosmetic dialog (preview, Equip / Take off / Open Pass / Open Duels / Buy / Need n Dr); consumables note | SHP, SHP-2 | dialog: X only, price once, bronze secondary |
| **Market card** ("Market: trade with other players") → S22 | NAV D5, MKT-4 | new door on the Shop page |
| Pass: season card (tier, ends in, XP bar → XP sheet, Unlock premium, Claim all), Free/Premium columns, tier rows (badge, You, two reward cells, state) → claim with fly-to-chip or tooltip | SHP, SHP-1 | **season card and column headers pinned**; only the track scrolls; claimable cells get a real Claim button |
| Wallet: balance, overdrawn warning, note; 4 packs (Stars, best value) → confirm → toasts; legal text, Terms / Refunds, History | SHP, SHP-3 | 2-line pack cards, fixed label size, tag inside the card (real money: pixel-perfect) |
| Dialogs buy confirm, unlock premium, need Drachmae → Wallet | SHP | scrim |
| Locked labels | SHP-5 | ink + lock chip |

- **Acceptance.** Opening Pass shows the season card and Claim all without scrolling; the Market card opens S22 and Back returns here.

## M-14 Kit (S24, debug)

Tabs Controls / Items / Lists / V3 / Mosaic / Parts (+ Shell demo); taps toast; Back → Campaign hub. Unlinked from the player IA. Follow-ups KIT-1 (retire V3 when unused) and KIT-2 (variant × state grid) are engineering notes.

## M-15 Settings sheet (global)

- **Purpose.** "Change sound, language, battle pauses, accessibility; get help."
- **Doors.** ⚙ in every top bar · battle menu (⋯) · Telegram ⋯ · deep link `settings` (opens on Notifications).
- **Layout.** Max-height sheet with scrim and a sticky title; sections collapse; nested pages (Notifications, About, New campaign) **replace the sheet content with a back chevron** instead of stacking (MENU-6, MENU-8, G6).

| Element | Old ref | New place / note |
| --- | --- | --- |
| Audio: Sound toggle, Music and Effects steppers 0-10 | MENU settings | bronze steppers |
| Language: Auto / English / Русский | MENU settings | ✓ on the selected segment |
| Battle pauses and numbers: Damage numbers, Pause on first contact / when flanked / when a group routs / on hero death | MENU settings | same; title spacing fixed (G1) |
| **Battle speed 0.5×** (offline) | controls.md R11 | new: the speed key gains 0.5×; last speed saved (`battleSpeed`) — no new row, noted here for discoverability in the section footer |
| Accessibility: Reduce motion, Haptic feedback | MENU settings | same |
| **Reduce shake, Reduce flash, Left-hand** | controls.md R11 | new toggles in Accessibility (default follow Reduce motion) |
| Account and help: Tutorial Replay/Resume, Notifications Open, About Open, Usage statistics, New campaign "Start…" | MENU settings, MENU-7 | **bronze** buttons (G2); "New campaign" with a sub-line; **sync state chip** here (MENU-4) |
| Notifications page: bot note or offline/blocked/failed; 9 toggles | MENU notify | page with back chevron |
| About page: purchase note; Terms, Privacy, Refund (external) | MENU about | page |
| New-campaign confirm: lost/kept list; Cancel / Begin (destructive) → World | MENU reset, MENU-9 | scrim; Begin is the destructive style |
| Close: X, tap outside, Back | MENU settings | same |

- **Acceptance.** No two X buttons are ever visible; every enabled button is bronze; the three new accessibility toggles persist across reloads.

## Open Questions
1. Codex seen/defeated flags need a small optional save field; owned by the save story (no migration: optional with a default).
2. Whether "Units" or "Lore" ever join the Codex is a content decision for a later GDD; v5 ships Beasts and Doctrines only.
