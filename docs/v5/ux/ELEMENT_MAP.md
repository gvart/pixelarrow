# Element map: every old UI element → its v5 place

Story S2-UX-IA, 2026-10-10. The guard against feature loss: every element in [audit/UI.md](../audit/UI.md) "(a) Inventory" (all 21 sections) has a row here with its new home, or an explicit removal and the reason. New elements from the merged GDDs follow in §2. The new homes are specified in `design/ux/` (ia.md, screen-flow.md, screens-campaign.md, screens-modes.md, hud.md).

**Status values**
- **Kept**: same screen and place (it may be restyled by an audit fix, noted).
- **Moved**: a different screen, zone or container.
- **Renamed**: same place, new name.
- **Removed**: gone, with the reason. Used only when truly redundant or unreachable.
- **New**: added by a merged GDD or a NAV fix (§2).

## 1. Old elements

### 1.1 Boot (UI §1)

| # | Old element | New location | Status |
| --- | --- | --- | --- |
| E001 | Text line "Mustering the hoplites…" | Boot, i18n key, with a logo and progress bar (C-1) | Kept |
| E002 | Routing (live duel / first run / deep link / Kit / Menu) | Boot routing, unchanged (screen-flow S01) | Kept |

### 1.2 Campaign hub (Menu) and Settings (UI §2)

| # | Old element | New location | Status |
| --- | --- | --- | --- |
| E003 | Top bar plaque "Pixelarrow" | Campaign hub top bar | Kept |
| E004 | Gear → Settings | every top bar (D9); battle ⋯ menu | Kept (+ doors) |
| E005 | Sync badge (top left) | top bar only on error; state chip in Settings › Account (MENU-4) | Moved |
| E006 | Tab bar Campaign/Duels/War/Codex/Shop | tab bar on all hubs; War glyph + label (MENU-2), book icon | Kept |
| E007 | Tab count badges | tab bar, counts only (G11) | Kept |
| E008 | Long-press tab name | long-press + hover | Kept |
| E009 | Profile portrait | profile card | Kept |
| E010 | "Strategos {name}" / "New campaign" | profile card | Kept |
| E011 | Status line (no save / fresh / hurt / day / march) | profile card; + "Lairs n/6" | Kept |
| E012 | Gold, Trophies, Warband n men | profile card | Kept |
| E013 | First-steps card (title, 4-segment bar, next step) | Campaign hub | Kept |
| E014 | Fresco banner (tappable) | Campaign hub; 1-line banner < VH 700 | Kept |
| E015 | Continue / Begin the march | Campaign hub primary | Kept |
| E016 | Army tile ("!" badge) | Campaign hub; count badge | Kept |
| E017 | Stash tile → Army stash tab | Campaign hub (a door to Army › Stash) | Kept |
| E018 | Camp tile (disabled + caption) | Campaign hub; one-line reason | Kept |
| E019 | Settings: Sound toggle | Settings › Audio (M-15) | Kept |
| E020 | Settings: Music and Effects steppers 0-10 | Settings › Audio | Kept |
| E021 | Settings: Language Auto/English/Русский | Settings › Language | Kept |
| E022 | Settings: Damage numbers | Settings › Battle | Kept |
| E023 | Settings: Pause on first contact | Settings › Battle | Kept |
| E024 | Settings: Pause when flanked | Settings › Battle | Kept |
| E025 | Settings: Pause when a group routs | Settings › Battle | Kept |
| E026 | Settings: Pause on hero death | Settings › Battle | Kept |
| E027 | Settings: Reduce motion | Settings › Accessibility | Kept |
| E028 | Settings: Haptic feedback | Settings › Accessibility | Kept |
| E029 | Settings: Tutorial Replay/Resume | Settings › Account and help (bronze) | Kept |
| E030 | Settings: Notifications Open | Settings › Account and help → nested page | Kept |
| E031 | Settings: About Open | Settings › Account and help → nested page | Kept |
| E032 | Settings: Usage statistics | Settings › Account and help | Kept |
| E033 | Settings: New campaign "Start…" | Settings › Account and help → nested confirm page | Kept |
| E034 | Settings close (X, tap outside, Back) | Settings sheet | Kept |
| E035 | Notifications modal: bot note / offline / blocked / failed | Settings › Notifications **page** (not a stacked modal) | Moved |
| E036 | Notifications toggles ×9 (Attacks, Marches, Full treasury, Duels, Clan, World bosses, Season end, Market sales, Quiet at night) | Settings › Notifications page | Moved |
| E037 | About: purchase note | Settings › About page | Moved |
| E038 | About: Terms, Privacy, Refund links | Settings › About page | Moved |
| E039 | New-campaign confirm: lost/kept list | Settings › New campaign page, with scrim | Moved |
| E040 | New-campaign Cancel / Begin | same page; Begin = destructive | Kept |

### 1.3 First run (UI §3)

| # | Old element | New location | Status |
| --- | --- | --- | --- |
| E041 | Top bar title (Welcome / Training complete / Two ways to fight) | First run; "Three ways to fight" | Renamed |
| E042 | Back (reward, modes) → Menu | First run | Kept |
| E043 | Narrator card (portrait, blink, name, text) | First run, over key art | Kept |
| E044 | Offer: Tutorial (recommended) | First run primary, bottom | Kept |
| E045 | Offer: Skip → modes | text link under the primary (FR-2) | Moved |
| E046 | Resume: Resume tutorial | First run primary | Kept |
| E047 | Resume: Skip → confirm Skip/Stay | text link + confirm | Moved |
| E048 | Reward: gold count-up card | reward plinth | Kept |
| E049 | Reward: item card (icon, name, rarity) | reward plinth, 3× art | Kept |
| E050 | Reward: Continue | primary | Kept |
| E051 | Modes: Campaign info card → Settlement/World | Modes card 1 of 3 | Kept |
| E052 | Modes: Online war card (covering duels and war) → Online | split into **Duels** and **War** cards (FR-3) | Moved |

### 1.4 Tutorial overlay (UI §4)

| # | Old element | New location | Status |
| --- | --- | --- | --- |
| E053 | Narrator panel (portrait, name, typewriter text) | Battle tutorial; docks above the deployment panel (TUT-1) | Moved |
| E054 | Narrator ✕ = Skip tutorial | ✕ dismisses the bubble; "Skip" text link → confirm (TUT-2) | Moved |
| E055 | Tap-to-continue arrow | narrator panel | Kept |
| E056 | Spotlight | tutorial overlay | Kept |
| E057 | Ghost hand | tutorial overlay | Kept |
| E058 | Field flag marker | tutorial overlay | Kept |
| E059 | Praise pill | tutorial overlay | Kept |
| E060 | Steps (intro … win/defeat) | tutorial, unchanged | Kept |
| E061 | Skip confirm Skip/Stay → FirstRun modes; finish → reward | unchanged | Kept |

### 1.5 Codex (UI §5)

| # | Old element | New location | Status |
| --- | --- | --- | --- |
| E062 | Hub shell + title "Codex" | Codex hub (M-1) | Kept |
| E063 | Section "Beasts" | Codex › Beasts segment | Kept |
| E064 | Beast row: thumbnail | Codex row, 2× art | Kept |
| E065 | Beast row: name | Codex row | Kept |
| E066 | Beast row: hint 1 | Codex row, 2 lines | Kept |
| E067 | Beast row: Level n / World boss | Codex row | Kept |
| E068 | Row tap → BeastTrial | row tap → **Codex beast sheet** | Moved |

### 1.6 Beast trial (UI §6)

| # | Old element | New location | Status |
| --- | --- | --- | --- |
| E069 | Top bar "Beast trial" + back | — | **Removed**: the screen is retired; its list duplicated Codex (V5-015, D3) |
| E070 | Sub line "Fight any beast with your army" | Codex beast sheet, as the Trial fight caption | Moved |
| E071 | Beast rows (thumbnail, name, hint, level) | — | **Removed**: identical to Codex rows E064-E067 (CDX-1) |
| E072 | Beast sheet: stage art | Codex beast sheet | Moved |
| E073 | Beast sheet: "Beast lair / World boss - Level n" | Codex beast sheet | Moved |
| E074 | Beast sheet: How it fights (bullets) | Codex beast sheet | Moved |
| E075 | Beast sheet: Counter | Codex beast sheet | Moved |
| E076 | Beast sheet: Loot | Codex beast sheet | Moved |
| E077 | Beast sheet: Close button | — | **Removed**: duplicate of the sheet's X (G5); the sheet has another action |
| E078 | Beast sheet: Fight it (disabled with no fit men) | Codex beast sheet: **Trial fight** (primary, reason when disabled) | Moved + Renamed |

### 1.7 Kit (UI §7)

| # | Old element | New location | Status |
| --- | --- | --- | --- |
| E079 | Tabs Controls/Items/Lists/V3/Mosaic/Parts + Shell demo | Kit (debug, unlinked) | Kept |
| E080 | Component galleries, toast on tap | Kit | Kept |
| E081 | Back → Menu | Kit | Kept |

### 1.8 World map (UI §8)

| # | Old element | New location | Status |
| --- | --- | --- | --- |
| E082 | Painted map | World | Kept |
| E083 | Settlement name plates | World; ink on stone (WLD-3) | Kept |
| E084 | Fog of war | World; painted fog + next-town marker | Kept |
| E085 | Party sprite | World | Kept |
| E086 | Band plates (men count, threat colour) | World; + threat icon (G13) | Kept |
| E087 | Dotted route and target | World | Kept |
| E088 | Camp zone and life, night tint | World | Kept |
| E089 | Top bar "Day n · Region" + back → Menu | World; + ⚙ + Lairs chip | Kept |
| E090 | Situation line + hint | World; + "next: {town}" | Kept |
| E091 | Chips gold, men, food (days), supplies | World; one order everywhere | Kept |
| E092 | Follow (eye) toggle | World | Kept |
| E093 | Sync badge | top bar only on error | Moved |
| E094 | Action bar: Camp (pitch / open) | World action bar | Kept |
| E095 | Action bar: Stop (moving) / Rest-Pause (camp) | World action bar | Kept |
| E096 | Action bar: Party "!" → Army | World action bar; count badge | Kept |
| E097 | Banners (spotted, found town, camp, ransom, No way there…) | World Z-top; i18n; 6 s | Kept |
| E098 | Discovery pan | World | Kept |
| E099 | Strike-camp confirm | World, Mosaic confirm | Kept |
| E100 | Encounter dialog (v3): band name, figure, threat + men, culture/level, mood, your army, advice | **Encounter decision sheet** (Mosaic BottomPanel) | Moved |
| E101 | Encounter: Attack / Take ransom / Let them go or Flee n% | Encounter sheet; Back rule (screen-flow §4) | Moved |
| E102 | Gestures pan, pinch 1-4, wheel; tap band/town/land | World | Kept |
| E103 | `placing` path and "tap Build" banner | — | **Removed**: dead code, unreachable (WLD-7, NAV §5) |

### 1.9 Camp (UI §9)

| # | Old element | New location | Status |
| --- | --- | --- | --- |
| E104 | Top bar field "Day n · hh:00" | Field camp top bar ("Field camp") | Renamed |
| E105 | Top bar online "Home/Forward camp · name" | War camp top bar ("War camp" + kind/place sub-title) | Renamed |
| E106 | Back → World / back target | Camp | Kept |
| E107 | Chips field: gold, food, supplies, men | Field camp; shared chip order | Kept |
| E108 | Chips online: war gold, food, wood, bronze, recruits | War camp; compact numbers | Kept |
| E109 | Right rail: 5 field structures with counts and reasons | rail → **Build drawer** (name, cost, time, reason) (CMP-1) | Moved |
| E110 | Right rail: 5 online buildings with levels | rail → Build drawer | Moved |
| E111 | Zoom (eye) | Camp rail | Kept |
| E112 | Field: Muster (icon) | action bar, labelled | Kept |
| E113 | Field: Loot (icon) → Army stash | action bar, labelled | Kept |
| E114 | Field: End day (primary) | action bar primary | Kept |
| E115 | Field: Strike | action bar, label kept at 320, ≥ 16 pt from End day | Kept |
| E116 | Placing: Cancel / Place | action bar | Kept |
| E117 | Online: Muster, Loot, Rest, Build/Upgrade, Make camp | War camp action bar; reasons on disabled | Kept |
| E118 | Info line | Camp; cost on its own row | Kept |
| E119 | Temper dialog | Camp sheet; one cost line | Kept |
| E120 | Muster dialog (class steppers, per-man list) | Camp sheet; Formation/Reserve columns | Kept |
| E121 | Strike confirm | Camp confirm | Kept |
| E122 | Gestures drag pan, tap structure/tile | Camp | Kept |

### 1.10 Settlement (UI §10)

| # | Old element | New location | Status |
| --- | --- | --- | --- |
| E123 | Sub-shell name + back → World | Settlement | Kept |
| E124 | Banner + "Town/Village of the {people}" | Settlement; painted vignette | Kept |
| E125 | Chips gold, men n/20, hurt | Settlement | Kept |
| E126 | Tabs Hire/Buy/Sell/Rest (village Hire/Rest) | Hire/Buy/Sell/**Services** (towns); villages Hire/Rest | Renamed (towns) |
| E127 | Hire rows (portrait → class card, name · Lv, class, role pill, trait, price) | Settlement › Hire; trait on its own line; Undo toast | Kept |
| E128 | Hire footer "New volunteers in nh" | Settlement › Hire | Kept |
| E129 | Hire empty state | Settlement › Hire | Kept |
| E130 | Buy rows (icon → item card, name, slot, stats, price) | Settlement › Buy; rarity gem | Kept |
| E131 | Buy footer; sold out | Settlement › Buy | Kept |
| E132 | Sell: stash grid → item card → confirm | Settlement › Sell; price on cell (shared grid P10) | Kept |
| E133 | Rest: "The wounded: n" + list | Settlement › Services/Rest; list sized to content | Kept |
| E134 | Rest: rate note, provisions line | Services/Rest | Kept |
| E135 | Rest: Food +10, Supplies +10, Rest 8 hours, Physician | Services/Rest; price chips; Rest 8 h primary | Kept |
| E136 | Recruit card (sprite, CLOSE + ✕) | Settlement sheet; X only | Kept |
| E137 | Action bar Army → Army | Settlement | Kept |
| E138 | Action bar Leave (terracotta) → World | Settlement; bronze (SET-3) | Kept |

### 1.11 Army (UI §11)

| # | Old element | New location | Status |
| --- | --- | --- | --- |
| E139 | Sub-shell "Army", back, sync badge | Army; back to origin; sync only on error | Kept |
| E140 | Status sentence | Army | Kept |
| E141 | Chips men, gold, hurt | Army | Kept |
| E142 | Hero card: niche, name, stars, class, Lv pill, role pill, Power | Army head; collapses on scroll | Kept |
| E143 | Group buttons I-IV + group name | Army head | Kept |
| E144 | 5 gear slots + mount (tap, drop target) | Army head; shared slot order | Kept |
| E145 | Tabs Roster n/20 · Stash n | Army | Kept |
| E146 | Roster filter (All/Phalanx/Skirmish/Reserve/Flank/Wounded/Fit) | Army › Roster; option sheet | Kept |
| E147 | Roster sort (power/level/class/group) | Army › Roster; option sheet | Kept |
| E148 | Roster rows (portrait, group disc, power, name, "!", Lv/class or wounded, stars); 1st tap select, 2nd Hero | Army › Roster; group-colour disc + numeral; points badge | Kept |
| E149 | Roster empty state | Army › Roster | Kept |
| E150 | Stash: 6 slot filters, rarity filter, sort | Army › Stash; "Sort: rarity" | Kept |
| E151 | Stash grid (rarity frame, condition, upgrade arrow) | Army › Stash (P10) + gem | Kept |
| E152 | Item card (Sell in town / Scrap in camp / Repair / Equip / Take off) | Army sheet; verdict line first | Kept |
| E153 | Long-press drag onto a slot | kept + tap-then-tap path | Kept |
| E154 | Footer back labelled "Map/Town/Camp" | — | **Removed**: duplicate of the top-bar back and its label was wrong (N3, D8) |
| E155 | Footer Sheet (primary, "!") → Hero | Army action bar | Kept |
| E156 | Footer Dismiss → confirm | Army action bar, bronze | Kept |

### 1.12 Hero (UI §12)

| # | Old element | New location | Status |
| --- | --- | --- | --- |
| E157 | Top bar name + back → Army/Duel | Hero; back to origin | Kept |
| E158 | Power chip | Hero head | Kept |
| E159 | Pager ‹ i/n › | Hero; **under the niche** (HRO-4) | Moved |
| E160 | Wounded line | Hero head | Kept |
| E161 | Stage niche (swipe) | Hero head; collapses on scroll | Kept |
| E162 | 5 slots + mount | Hero head; shared slot order | Kept |
| E163 | Lv pill, stars, class, role pill, traits | Hero head | Kept |
| E164 | XP bar "XP to level n" | Hero head; 0% notch | Kept |
| E165 | Tabs Stats/Gear/Perks/Skills (badges) | Hero | Kept |
| E166 | Stats: points header | Hero › Stats | Kept |
| E167 | Stats: STR/AGI/END/WIL with −/+ | Hero › Stats; description full width | Kept |
| E168 | Stats: derived bars with preview | Hero › Stats | Kept |
| E169 | Stats: Record (kills/battles/fit) | Hero › Stats | Kept |
| E170 | Stats: Traits | Hero › Stats | Kept |
| E171 | Stats: Respec (duel) | Hero › Stats (duel source) | Kept |
| E172 | Gear: stash grid + drag to slot | Hero › Gear (equip context of the one stash) | Kept |
| E173 | Perks: tier tree (level, node, name, status) | Hero › Perks; tiers as A/B card rows (abilities.md) | Kept |
| E174 | Perk modal: Learn + confirm | perk sheet "Take {name}?" | Kept |
| E175 | Skills: abilities and auras with cooldowns | Hero › Skills | Kept |
| E176 | Skills empty state → Perks | Hero › Skills | Kept |
| E177 | Action bar Undo / Confirm n | Hero | Kept |
| E178 | Action bar Dismiss (duel source) | Hero; bronze | Kept |

### 1.13 Battle (UI §13)

| # | Old element | New location | Status |
| --- | --- | --- | --- |
| E179 | Deployment: Leave → confirm | **⋯ battle menu** → Leave confirm | Moved |
| E180 | Deployment: Men → Assign groups | deployment panel **Groups** | Moved + Renamed |
| E181 | Battle: Pause/Play | Z1 top bar | Kept |
| E182 | Battle: speed 1×/2×/3× | Z1; + 0.5× | Kept |
| E183 | Battle: Flee → retreat confirm | **⋯ battle menu** → Retreat confirm | Moved |
| E184 | Online: Follow/Watch | Z2 eye | Moved |
| E185 | Online: Flee | ⋯ menu | Moved |
| E186 | Clock / men count / deploy countdown | Z1 | Kept |
| E187 | Strength row "You n% vs n% Foe" | Z1 | Kept |
| E188 | Follow eye | Z2 right | Moved |
| E189 | Hint pill | Z3, info glyph | Kept |
| E190 | Banners (deploy, contact, flanked, routing, victory…) | Z3, 6 s TTL, one at a time | Kept |
| E191 | Ability medallions (Horn and unit abilities, cooldowns) | Z5 rail, ≤ 3 + more | Moved |
| E192 | Group cards (portrait, numeral, name, men · order, HP and morale bars) | Z7; glyph + labelled H/M + state line; only groups with men | Kept |
| E193 | Header "Orders · group" | order bar numeral badge in group colour (controls R1.3) | Moved |
| E194 | Shape chip → Shape sheet (Line/Column/Wedge/Loose/Wall) | deployment panel + selection; Shape sheet + **Orb** | Kept |
| E195 | Reset (deployment) | deployment panel "Reset all" + confirm | Kept |
| E196 | Alone / Rejoin (single soldier) | selected-soldier panel | Kept |
| E197 | Fight! / Ready | deployment panel primary | Kept |
| E198 | Orders Advance, Charge, Hold, Shoot, Back | Z8 order bar; "Back" → **Withdraw** (Feint when eligible) | Renamed |
| E199 | Selected-soldier panel (HP/MOR/STA) | above Z7 | Kept |
| E200 | Group tags over the field | field badges (numeral + glyph + markers) | Kept |
| E201 | Gesture hint | Z3, first battles | Kept |
| E202 | Terrain info by long-press | long-press kept + **Inspect (i)** toggle | Kept |
| E203 | Gestures pan, tap-move, drag formation, facing knob, pinch, wheel | unchanged; hit-test priority (controls R1) | Kept |
| E204 | Assign groups dialog | Groups sheet; ink names, group-colour chip | Kept |
| E205 | Leave dialog | confirm from the ⋯ menu | Kept |
| E206 | Retreat dialog | confirm from the ⋯ menu; copy by state (BTL-9) | Kept |
| E207 | Shape dialog | Shape sheet | Kept |
| E208 | Settings pauses the battle | ⋯ menu → Settings (pauses offline) | Moved |
| E209 | Radial order ring (`this.ring`) | — | **Removed**: dead code, never assigned (NAV §5, BTL-10); its copy `battle.sit.quiet` is rewritten |
| E210 | Boss HP bar (beast) | Z2b own row (BTL-1) | Moved |

### 1.14 Results (UI §14)

| # | Old element | New location | Status |
| --- | --- | --- | --- |
| E211 | Banner plaque (Victory/Defeat/Stalemate/Retreat), laurels, confetti, shake | Results | Kept |
| E212 | "vs name · verified" | Results | Kept |
| E213 | Tabs Summary/Heroes/Spoils | Results | Kept |
| E214 | Summary tiles Time, Kills, Losses, Gold/Glory, XP (tap = tip) | Results › Summary; + (i) | Kept |
| E215 | MVP card | Results › Summary; head visible | Kept |
| E216 | Level-up line, report notes | Results › Summary; chips | Kept |
| E217 | Heroes rows (portrait, name, Lv, XP bar, +XP, status, fallen) | Results › Heroes | Kept |
| E218 | Spoils pick counter | Results › Spoils | Kept |
| E219 | Spoils face-down cards → flip | Results › Spoils | Kept |
| E220 | Inspect modal (compare bars, Take / Put back) | Results sheet; X only | Kept |
| E221 | Primary Spoils → / Take spoils k/n / Onward | Results; Onward → origin | Kept |
| E222 | Back = finish | Back → Spoils first if unseen (N8) | Kept (changed) |

### 1.15 Shop hub (UI §15)

| # | Old element | New location | Status |
| --- | --- | --- | --- |
| E223 | Hub shell "Shop" (back only with `back`) | Shop hub | Kept |
| E224 | Drachmae chip → Wallet | Shop hub | Kept |
| E225 | Fresco | Shop hub, painted | Kept |
| E226 | Tabs Shop · Pass (badge) · Wallet | Shop hub | Kept |
| E227 | States loading/outside/offline/closed/error + Retry | Shop hub; skeleton; outside "Open in Telegram" | Kept |
| E228 | Shop page tip | Shop › Shop | Kept |
| E229 | Cosmetic OfferCard grids (Equipped/Owned/price/locked) | Shop › Shop | Kept |
| E230 | Cosmetic dialog (preview, Equip/Take off/Open Pass/Open Duels/Buy/Need n Dr) | Shop sheet; X only | Kept |
| E231 | Consumables note | Shop › Shop | Kept |
| E232 | Pass: season card (tier, ends in, XP bar → XP sheet, Unlock premium, Claim all) | Shop › Pass, **pinned** | Kept |
| E233 | Pass: Free/Premium columns | Shop › Pass, pinned headers | Kept |
| E234 | Pass: tier rows (badge, You, two reward cells, state) → claim / tooltip | Shop › Pass; Claim buttons | Kept |
| E235 | Wallet: balance, overdrawn warning, note | Shop › Wallet | Kept |
| E236 | Wallet: 4 Drachmae packs → confirm → toasts | Shop › Wallet | Kept |
| E237 | Wallet: legal text, Terms/Refunds, History (30 rows) | Shop › Wallet | Kept |
| E238 | Dialogs buy confirm, unlock premium, need Drachmae → Wallet | Shop sheets, scrim | Kept |

### 1.16 Market (UI §16)

| # | Old element | New location | Status |
| --- | --- | --- | --- |
| E239 | Top bar "Market", back → back.scene (default Online) | Market; default origin **Shop hub** | Kept |
| E240 | Chips war gold, Drachmae | Market | Kept |
| E241 | Tabs Browse/Mine/Sell | Market | Kept |
| E242 | Browse cycle filters Kind/Currency/Sort | Market; option sheets (P8) | Kept |
| E243 | Browse Find… (item picker) + clear ✕ | Market | Kept |
| E244 | Browse rows → listing card → buy confirm | Market; expired = disabled | Kept |
| E245 | Browse Show more; empty state | Market | Kept |
| E246 | Mine: n/max open; rows with status; withdraw ✕ → confirm | Market › Mine | Kept |
| E247 | Sell grid (stash, resources, consumables) | Market › Sell | Kept |
| E248 | Sell form: quantity, currency toggle, price stepper, fee, you get, town picker, List | Market sell sheet; numeric entry (P23), town list sheet | Kept |

### 1.17 War hub (UI §17)

| # | Old element | New location | Status |
| --- | --- | --- | --- |
| E249 | Hub shell "Pixelarrow" + gear; War tab | War hub; **no back** | Kept |
| E250 | State loading | War hub | Kept |
| E251 | State unavailable ("Back to menu") | War hub; "Open in Telegram" | Kept (changed) |
| E252 | State join (Back, Join) | War hub; Join primary, tabs as exit | Kept |
| E253 | Situation line | War hub | Kept |
| E254 | Chips war gold, food, wood, bronze, recruits, energy (tap = tip) | War hub; compact numbers, never "…" | Kept |
| E255 | March bar (countdown, Halt) | War hub | Kept |
| E256 | Round button Army → OnlineArmy | War stone rail, labelled | Moved |
| E257 | Round button Clan → Clan | War rail | Moved |
| E258 | Round button Lobby (badge) → lobby | War rail | Moved |
| E259 | Round button Region map | War rail | Moved |
| E260 | Collect (floating primary) | War situation strip (WAR-4) | Moved |
| E261 | Hex panel: title, tier, owner, yields, defenders, siege, boss HP, garrison, income, merchant kind | War hex panel; + "Codex ›" on beasts | Kept |
| E262 | Hex actions Merchant, Camp, Beast, March, Attack, Garrison, Collect + reasons | War hex panel | Kept |
| E263 | Attack and duel result modals | War sheets, Results tile language | Kept |
| E264 | Lobby sheet (Challenge / Cancel / Busy) | War sheet; crest, level, X | Kept |
| E265 | Boss and lair info (Raid it / Attack) | War sheet; table leaderboard; "Codex ›" | Kept |
| E266 | Coach marks (7) | War, opposite the rail | Kept |
| E267 | Challenge popup (Decline / Fight) | any Online scene | Kept |
| E268 | Gestures tap hex, pan, pinch, wheel | War | Kept |
| E269 | Back (modal → selection → Menu) | Back closes modal/selection; never leaves the hub | Kept (changed) |
| E270 | `openCampPanel()` / `campPanel.ts` | — | **Removed**: dead code, replaced by the Camp scene (WAR-10) |

### 1.18 War army (UI §18)

| # | Old element | New location | Status |
| --- | --- | --- | --- |
| E271 | Sub-shell "Online army"/"Garrison" + back → Online | "War army"/"Garrison" | Renamed |
| E272 | Chips war gold, food, energy | War army; wheat icon | Kept |
| E273 | Hero head (stage, name, stars, class, Lv, Power, status pill, groups, slots) | War army head (Army template); groups on own row | Kept |
| E274 | Garrison head and pick mode | War army | Kept |
| E275 | Tabs Roster/Stash; rows | War army (Army template) | Kept |
| E276 | Stash grid → item card (Market / Salvage, Equip) | War army › Stash (P10) | Kept |
| E277 | Footer Recruit (primary) → recruit sheet | War army | Kept |
| E278 | Footer Market → Market | War army | Kept |
| E279 | Footer Shop → Shop | War army | Kept |
| E280 | Footer Map icon → Online | — | **Removed**: duplicate of Back, and it rendered empty (OAR-2) |
| E281 | Garrison mode: Station | War army footer (garrison) | Kept |
| E282 | Recruit sheet (Hire, class card) | War army sheet; undo toast | Kept |

### 1.19 Clan (UI §19)

| # | Old element | New location | Status |
| --- | --- | --- | --- |
| E283 | Sub-shell "Clan" + back → Online | Clan | Kept |
| E284 | States loading/offline/error | Clan | Kept |
| E285 | No clan: info card + Found a clan → prompt (name, tag) | Clan; icon bullets; 44 pt prompt | Kept |
| E286 | Clan header "[TAG] Name", "n/30 men - r regions - role" | Clan banner card | Kept |
| E287 | Member rows → manage (Make officer, Demote, Hand over lead, Kick, Close) | Clan; sheet with X | Kept |
| E288 | Footer Invite (share / copied link, code, 7 days) | Clan; reason when disabled | Kept |
| E289 | Footer Leave (confirm) | Clan | Kept |
| E290 | Join offer popup | Clan | Kept |
| E291 | Flash messages | Clan | Kept |

### 1.20 Merchant (UI §20)

| # | Old element | New location | Status |
| --- | --- | --- | --- |
| E292 | Sub-shell "Merchant/Crossroads/Harbour" + back → Online | Merchant | Kept |
| E293 | Chips war gold, Drachmae | Merchant | Kept |
| E294 | Info card (kind, goods, in reach ✓/✗, discount/holder, restock) | Merchant; discount shown once | Kept |
| E295 | Sections (supplies and basic gear, regional, Rare today) | Merchant | Kept |
| E296 | Offer rows (icon → item card, name, Today n/cap, description, buy gold/Drachmae with reasons → confirm) | Merchant; cap reason line | Kept |

### 1.21 Duels (UI §21)

| # | Old element | New location | Status |
| --- | --- | --- | --- |
| E297 | States loading skeleton/outside/offline/closed/error + Retry | Duels hub; outside "Open in Telegram" | Kept |
| E298 | "Duels" title, Demo note | Duels hub | Kept |
| E299 | Glory chip | Duels hub chip row | Kept |
| E300 | Lv chip → level sheet | Duels hub chip row | Kept |
| E301 | Team button ("!") | Duels hub chip row; count badge | Kept |
| E302 | Shop button | Duels hub chip row, **"Armoury"** | Renamed |
| E303 | Fresco | Duels hub; hidden < VH 700 | Kept |
| E304 | Ladder \| Arena switch | Duels hub | Kept |
| E305 | Ladder tip | Ladder | Kept |
| E306 | Next-floor card → floor sheet (wells, stars rule, enemy list, Fight/Farm) | Ladder; full-width sheet | Kept |
| E307 | Farm-Glory bar | Ladder | Kept |
| E308 | 5 chapters (toggle, stars, 3 chests → claim/preview, floor tiles) | Ladder; ✓/▸ glyphs | Kept |
| E309 | CTA Fight floor n | Ladder primary, in the flow | Kept |
| E310 | Arena season line | Arena; season icon | Kept |
| E311 | Live PvP card (standing, won/lost, rule, Find match/Rejoin, Unranked, Top → board) | Arena | Kept |
| E312 | Locked ranked card | Arena | Kept |
| E313 | Raids card (standing, raids left, defence row → defence sheet, Raid, Log, Top) | Arena | Kept |
| E314 | Raid picks: candidates + "Raid {name}" | S16 Raid picks | Kept |
| E315 | Boards Live/Legend/Raids + pinned You | S15 Leaderboard; title fixed | Kept |
| E316 | Search: rings, timer, range bar, team card, Cancel | S17; back arrow hidden | Kept |
| E317 | Found: crests, "vs", Preparing | S17 | Kept |
| E318 | Season rewards → choose a piece | Duels sheet | Kept |
| E319 | Team: roster card, Symbols legend | S13; legend behind (i) | Kept |
| E320 | Team: preset chips (+), rename/duplicate/delete, Use for Ladder/Arena/Defence, points bar | S13; tools in a Preset sheet | Moved |
| E321 | Team: hero rows → Hero; bench toggle | S13 (Army row template) | Kept |
| E322 | Team: Recruit sheet | S13 | Kept |
| E323 | Shop: Today/Gear/Sell, slot filter, Compare-with sheet, offer cards (Buy), Sell grid | S14 Armoury | Renamed |
| E324 | Team ↔ Shop header cross-links | — | **Removed**: they formed a loop; both views open from the hub (D11) |
| E325 | Back arrow on hub views | — | **Removed**: hubs are roots, the tab bar is on screen (D12) |
| E326 | Back arrow on Search | — | **Removed**: a false affordance; Cancel is the exit (N5) |
| E327 | `openDismiss()` (unreachable) | **Dismiss on bench rows** in Team | Moved (now reachable) |

### 1.22 Global and cross-screen (UI G-items, NAV)

| # | Old element | New location | Status |
| --- | --- | --- | --- |
| E328 | Telegram ⋯ → Settings | unchanged second door | Kept |
| E329 | Deep links (market, wallet, settings, loc/boss/duel/income/season/invite, clan) | `sceneForRoute`, unchanged; Market's default origin = Shop | Kept |
| E330 | Cloud-sync adopt jump to Menu | Campaign hub + notice sheet (N9) | Kept (changed) |
| E331 | Unused `common.ts` helpers (`addResourceBar`, `resourceLine`, `MINE_COLOR`, `CLAN_COLOR`) | — | **Removed**: dead code, never rendered (NAV §5) |

## 2. New elements (from merged GDDs and NAV fixes)

| # | New element | Home | Source |
| --- | --- | --- | --- |
| N01 | "Lairs n/6" on the hub status line | Campaign hub profile card | campaign-arc.md; ANSWERS Q30 |
| N02 | Sync-adopt notice sheet | Campaign hub | NAV N9 |
| N03 | Three mode cards (Duels card split out) | First run | FR-3 |
| N04 | Lair garrison plate + threat icon; burnt-lair icon | World map | campaign-arc.md Touch UI |
| N05 | Host banner plate + march line | World map | campaign-arc.md R5 |
| N06 | "Lairs n/6" chip in the World top bar | World | campaign-arc.md Touch UI |
| N07 | Arc sheet: Lairs list (tap = centre) | World | campaign-arc.md Touch UI |
| N08 | Arc sheet: Journal (last 20 lines) | World | campaign-events.md Touch UI |
| N09 | Assault sheet (garrison, power, threat, doctrine, captain, reward; Assault / Leave) | World | campaign-arc.md R2.2 |
| N10 | Event card (vignette, title, body, 2-3 choices, cost chips) + paused scrim | World (also Camp, Settlement arrival) | campaign-events.md R4 |
| N11 | Encounter doctrine row (icon, name, tell, Codex ›) | Encounter sheet | ai-doctrines.md Touch UI |
| N12 | Encounter captain row (name, level, crest) | Encounter sheet | ai-doctrines.md Touch UI |
| N13 | First-visit coach marks (2) | World | campaign-arc.md R1.6 |
| N14 | Sacked-town state | Settlement, World plate | campaign-arc.md R5.3 |
| N15 | Volunteer-floor recruits | Settlement › Hire | campaign-arc.md R1.5 |
| N16 | Drillmaster row (towns) | Settlement › Services | abilities.md R7 |
| N17 | "Services" tab (towns) | Settlement | ANSWERS Q28 |
| N18 | Army pick mode ("Retrain whom?") | Army | abilities.md R7 |
| N19 | Perk tiers as A/B card rows; free point pulse | Hero › Perks | abilities.md Touch UI |
| N20 | Retrain mode + cost confirm (and Oracle free retrain) | Hero › Perks | abilities.md R7, campaign-events.md |
| N21 | Hire Undo toast (4 s) | Settlement, Duels Team, War army | controls.md R4.3 |
| N22 | Build drawer (labelled) | Camp | CMP-1 |
| N23 | Why line | Results | battle-readability.md R5 |
| N24 | Victory variant (company roll, set-piece reveal, Continue the campaign) | Results | campaign-arc.md R5.4 |
| N25 | Lair hoard (3 picks, 1 epic) | Results › Spoils | campaign-arc.md R6 |
| N26 | Bounty note ("Captain captured") | Results › Summary | ai-doctrines.md R6.4 |
| N27 | Codex Doctrines segment + doctrine rows | Codex | ai-doctrines.md "Codex" |
| N28 | Doctrine sheet (tells, counters) | Codex | ai-doctrines.md |
| N29 | Trial fight caption "Practice: no spoils" | Codex beast sheet | VISION, V5-011 |
| N30 | "Codex ›" on War beast/boss panels | War hub | ia.md L4 |
| N31 | Market card on the Shop page | Shop hub | NAV D5, MKT-4 |
| N32 | "Open in Telegram" on outside/unavailable states | Duels, War, Shop, Market | NAV N7 |
| N33 | Dismiss on Duels bench rows | Duels Team | NAV N10 |
| N34 | Preset sheet (Duels Team) | Duels Team | DUE-5 |
| N35 | Boot error + Retry | Boot | dead-end check |
| N36 | Settings: Reduce shake | Settings › Accessibility | controls.md R11 |
| N37 | Settings: Reduce flash | Settings › Accessibility | controls.md R11 |
| N38 | Settings: Left-hand | Settings › Accessibility | controls.md R11 |
| N39 | Speed 0.5× (offline) | Battle Z1 | controls.md R11 |
| N40 | Battle menu ⋯ (Settings, Flee/Leave) | Battle Z1 | NAV D9; ANSWERS Q40 |
| N41 | Doctrine chip (tap = tell + counters) | Battle Z2 | ai-doctrines.md Touch UI |
| N42 | Ladder ticket timer | Battle Z2 | controls.md R10 |
| N43 | Morale glyph (steady/wavering/routing) on cards and badges | Battle | battle-readability.md R1 |
| N44 | Badge markers: reticle, disordered, feinting, standard, captain crest, queued step | Battle field | battle-readability.md R2 |
| N45 | Labelled H/M bars + card state line (Out of range, Flanked!, → Charge) | Battle Z7 | battle-readability.md R3 |
| N46 | Advance-to-range chip | Battle Z7 | controls.md R3.4 |
| N47 | Undo chip (3 s) | Battle Z6 | controls.md R4 |
| N48 | Then… chip | Battle Z6 | controls.md R6 |
| N49 | Deployment Undo (10 steps) | Battle deployment panel | controls.md R4.2 |
| N50 | Works button + tray (3 items, cost, allowance, supplies) | Battle deployment panel | field-works.md Touch UI |
| N51 | Works placement ghost ✓/✗, ✕ remove chip | Battle field | field-works.md Touch UI |
| N52 | Orb in the Shape sheet | Shape sheet | formations-orders.md Touch UI |
| N53 | Feint key (curved arrow + cooldown sweep) | Battle Z8 5th key | formations-orders.md Touch UI |
| N54 | Range ring | Battle field | controls.md R3.3 |
| N55 | Charge arrow, feint path, tap-move path + ghost | Battle field | controls.md R5 |
| N56 | Staged-order ghosts with ✕, Clear plan | Battle field, Z6 | controls.md R6.1 |
| N57 | Edge pointer (selected group) / edge arrow (enemy zone) | Battle field | controls.md R7, R8 |
| N58 | "More" medallion chevron + sheet | Battle Z5 | abilities.md R4 |
| N59 | Standard medallion with a use pip; banner glyph | Battle Z5, card, field | abilities.md R5 |
| N60 | Flank-threat dashed arc; flanked arc with chevrons | Battle field | battle-readability.md R4 |
| N61 | Army-break banner + fleeing flags | Battle Z3 | battle-readability.md R1, R4 |
| N62 | Inspect (i) toggle | Battle deployment panel | controls.md R11 |
| N63 | Coach cards for Feint, Orb, Works | Battle | controls.md R10b |
| N64 | Hourglass Paused pill with merged reasons | Battle Z3 | battle-readability.md R4, controls.md R6.3 |

## 3. Counts

| Status | Count | Rows |
| --- | --- | --- |
| Old elements mapped | **331** | E001-E331 |
| — Kept in place (incl. restyled, changed behaviour) | 269 | |
| — Moved (incl. "Moved + Renamed" and the now-reachable Dismiss) | 42 | |
| — Renamed in place | 8 | |
| — **Removed** | **12** rows, 11 reasons | see below |
| New elements | **64** | N01-N64 |

**Removed, with reasons (12 rows):**
1. E069 Beast trial top bar: the screen is retired (V5-015); the beast sheet moved to Codex.
2. E071 Beast trial rows: identical to the Codex rows.
3. E077 Beast sheet Close: duplicate of the sheet's X (G5).
4. E154 Army footer back "Map/Town/Camp": duplicate of the top back, with a wrong label (N3).
5. E280 War army footer Map icon: duplicate of Back, rendered empty (OAR-2).
6. E324 Duels Team ↔ Shop cross-links: a loop; both open from the hub (D11).
7. E325 Duels hub back arrow: hubs are roots (D12).
8. E326 Duels search back arrow: a false exit (N5).
9. E103 World `placing` path and Build banner: dead code.
10. E209 Battle radial ring: dead code.
11. E270 War `openCampPanel` and E331 `common.ts` helpers: dead code (counted as two rows, one reason; 12 rows in all, 11 reasons).

No player-reachable *feature* is removed: every removed row is a duplicate control, a false affordance, or code no player can reach.
