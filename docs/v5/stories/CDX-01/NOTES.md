# CDX-01: the Codex, the one home of beasts and doctrines, notes

Spec: [screens-modes.md](../../../../design/ux/screens-modes.md) M-1, [ia.md](../../../../design/ux/ia.md) §4, ai-doctrines.md R7 "Codex". Decisions: V5-029, V5-039. Audit: UI.md §5 CDX-1..3, §6 TRL-1, TRL-2.

## What changed

- **Codex hub (AC1).** Beasts and, once one doctrine is met, a Beasts / Doctrines segmented switch. Beast rows: the painted plate in a 32 UI px well (2x), the name, a two-line hint, the level (or World boss), a chevron. One title size per list; where a name does not fit beside its level (360, 320, ru), every row puts the level on its own line instead of cutting the name (CDX-3).
- **Beast sheet (AC2).** The old BeastTrial sheet, moved to the Codex on the v4 parchment sheet: plate beside the pixel figure on its stage, "Beast lair · Level n", How it fights with real bullets, Counter, Loot; X only (G5); the primary action **Trial fight** across the bottom with the caption "Practice with your army: no spoils, no losses." (E070 + N29), or the no-fit-men reason in its place. The sheet is as tall as its content.
- **Trial fight returns (TRL-1, N1).** `CodexScene.fight` starts a practice battle from `'Codex'`; Results' Onward starts `BeastTrial { from, open }`, which now only forwards to `Codex { open }`: the same beast sheet opens. Played: Codex › Hydra › Trial fight (tapped) › Battle › Results "Practice: no spoils" › Onward › Hydra sheet open, no page errors.
- **Doctrines (AC3).** Five rows: a met doctrine shows its icon, name and tell and opens the doctrine sheet (tell, how it fights, counter, who fights this way); an unknown one is "? Unknown doctrine" with a lock, no chevron, and a tap says how to learn it. `Codex { doctrine }` and `{ seg }` are the doors for the encounter row and the battle chip.
- **Text size (V5-060).** Everything is 6.5 UI px or more: `codex|text-size|*`, `trial|text-size|*` and `trial-info|spacing|beast.sheet.close|label-expand` are removed from the allowlist. The layout check gets `codex-beast`, `codex-doctrines`, `codex-doctrine`; `trial` and `trial-info` are gone with the screen; `battle-beast` starts its fight from the Codex.

## Element map (ELEMENT_MAP §1.5, §1.6, N27-N29)

E062-E068 kept (E068 now opens the Codex beast sheet). E069 and E071 removed as the map says. E070 is the Trial caption. E072-E076 moved intact. E077 removed (the X). E078 is Trial fight, primary, reason when disabled. N27 (Doctrines segment and rows), N28 (doctrine sheet), N29 (caption) added. The old row long-press tip "Tap a beast to see…" is dropped: the chevron says the same.

## Art (ASSET_PIPELINE)

Shipped after `preview.mjs` (layout exit 0 at 390, 360, 320) and reading every DPR 3 contact sheet: the 8 beast plates ART-036..043 (`public/ui/beasts/`, 24-32 KB, `check --shipped` PASS) and the 5 doctrine icons ART-057..061 (atlas rebuilt by `atlas.mjs --add`, identical bytes to the previewed atlas; keys removed from `STAGED_ICONS`). The plates were previewed with temporary copies of the other seven in place (as TUT-01 did), then promoted over them.

**Pipeline fix:** `preview.mjs` served a staged atlas at `icons/icons_ui.png`, but the game loads `icons/ui.png`, so an icon preview showed the stand-ins. It now serves the path the game loads (my first icon previews were redone after the fix).

## Decisions (the user was asleep)

1. **Met doctrines live in local storage** (`pixelarrow:codex.doctrines`), not the save: the Codex save flags belong to the save story (screens-modes.md open question 1) and `save.ts` is not this story's. They are noted from the last battle each time the Codex opens (a Trial teaches none); `noteDoctrine()` is exported for WLD-01's encounter row and the battle chip. Knowledge is the player's, so it is not per campaign.
2. **No "Defeated ✓" mark**: it is marked "proposed (Director decision)" and needs a save field.
3. **Plate beside the pixel figure** on the beast sheet: the plate says what it is, the figure how it looks in battle (a 3:1 crop of a square plate would cut the heads).
4. **The beast sheet is docked at the bottom, full width, and as tall as its content**, with the X: centred, "Lernaean Hydra" fell under the text floor beside the X at 320x568 in Telegram. The caption sits fixed over the button so the rule is always next to the action. A door straight to a sheet (Results, `{ open }`) waits for the plates so the header has its painting.
5. **Book icon not wired**: its slot is the tab bar (TabBar/tabLayout, not this story's files); it stays staged.
6. **Doctrine texts** are under `doctrine.<id>.*` so the encounter row and battle chip can reuse them; counters follow the GDD balance table (rush ← brace, hammer ← reserve to the flank or orb, swarm ← fast advance and cavalry, fury ← missiles and feint); steady's is "strike a flank before the reserve commits".

## Follow-ups for other owners

| Item | Owner |
| --- | --- |
| Call `noteDoctrine(id)` where a band's doctrine is shown, and open `Codex { doctrine }` from the "Codex ›" door | WLD-01, BTL-01 / CT-07 |
| War boss/lair panel "Codex ›" opens `Codex { open }` (ia.md L4) | WAR-01 |
| `nav.ts` BACK_RULES still lists `BeastTrial` (harmless: the scene forwards at once) | F-03 / nav owner |
| `trial.title`, `trial.sub`, `trial.fight`, `trial.tip` are unused now (beasts.*.ts) | i18n cleanup |
| Book icon in the Codex tab (MENU-3) | HUB / tab bar owner |
| Codex seen/defeated save field | save story |

## Shots

`docs/v5/shots/CDX-01/`: before (Codex 390, trial sheet 390) and after (Codex 390 en and 320 ru, beast sheet 320 ru, doctrines 390, doctrine sheet 360 ru, the beast sheet reopened after a Trial fight).
