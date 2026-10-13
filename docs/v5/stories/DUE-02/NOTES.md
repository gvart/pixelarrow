# DUE-02: the duel sub-screens, notes

Spec: [screens-modes.md](../../../../design/ux/screens-modes.md) M-5, M-6, M-7. Audit: UI.md §21 DUE-2, DUE-3, DUE-6, DUE-10. Element map: ELEMENT_MAP §1.21 E314–E318, E326. Depends on DUE-01 (`fmtCount`, the expired ladder notes).

## What changed

- **Leaderboard (M-5, DUE-2, DUE-3).**
  - The title is **Leaderboard** for Live and Legend: the switch under it is the only state, so the title can't contradict it. The Raids board has no switch and keeps "Raids leaderboard".
  - The third medal is the `bronze` token with a cream number (5.59:1, art bible 4.3), not terracotta. Gold and silver are unchanged. Only your row is lit; before, the top three were lit too, which read as "selected".
  - The season line and the title line wrap to two lines instead of being cut.
  - "You" is pinned at the bottom always. On Legend, with no Legend place, the pin says "Only Legend players are listed here".
  - Your row is also lit inside the list when you are in the top 50.
  - States: breathing skeleton rows while loading; an error card with **Retry** when the board fails with nothing to show; an empty card ("No ranked players yet").
  - League pills are 6.5 (`addLeaguePill` on the Army pill). The kit's `addPill` writes 6, which was the text-size failure. A rank of three digits widens its well instead of shrinking to 5.5.
- **Raid picks (M-6).**
  - "No opponents right now" has a bronze **Retry** in its card. The locked and capped cards don't, since retrying can't change them.
  - Skeleton rows while loading; an error card with Retry if the picks fail to load.
  - The picked defender gets a ✓ and a Cinzel name as well as the lit card (G13: not colour alone).
  - The tip may take 3 lines (the Russian one was cut). The "Pick a defender" heading steps down to 6.5; where even that would be cut beside Log (320 RU), it is left out, because the tip above says the same thing.
- **Search and Found (M-7, DUE-6, E326).**
  - No back arrow while searching or found. Cancel is the only exit.
  - The arena icon is painted at its shown size (`addCrispIcon`), not a 12 px icon scaled ×3.
  - The range bar's label is dropped where it would be cut beside the longest countdown (320 RU). The hint under the bar says the same.
  - Found's league pills are 6.5.
- **Season rewards (E318, DUE-10).**
  - "+ a Sacred Band of Thebes piece of your choice" wraps instead of being cut.
  - The cosmetic's name and the title line wrap. A row grows with its name.
  - All the row headings share one face and size.
  - On the shortest screens, the title line gives way first (it is on the leaderboard too), then the cosmetic name goes to one line.
  - The sheet titles have short forms ("Season over", "Choose a piece" with a "Set: …" line), so they never drop under 6.5.
- **Director 1: numbers.** Every number on these screens goes through `fmtCount`: ratings, won/lost, team points and cap, raid points, raids left, placements and ranks.
- **Director 2: the expired note.** The ladder report (`ladderReport` lives in DuelScene.ts, so it is in scope) and the hub toast now say "Your 30 real-time minutes for this floor ran out: verified, but it paid nothing". In Russian: «Ваши 30 мин реального времени на этаж истекли…». Before, "Finished after 30 min" sat next to the 1:04 battle clock and read as the battle's length.
- **Text size (V5-060).** Removed allowlist entries: `duel-board-live`, `duel-board-raids`, `duel-found`, `duel-season-pick`, `duel-season-reward`.

## Element map (ELEMENT_MAP §1.21, DUE-02's rows)

| # | Element | Now |
| --- | --- | --- |
| E314 | Raid picks: candidates + "Raid {name}" | Kept; ✓ on the pick, Retry on the empty card, loading and error states |
| E315 | Boards Live/Legend/Raids + pinned You | Kept; title "Leaderboard", bronze 3rd medal, You pinned always, states |
| E316 | Search: rings, timer, range bar, team card, Cancel | Kept; crisp arena icon |
| E317 | Found: crests, "vs", Preparing | Kept; 6.5 league pills |
| E318 | Season rewards → choose a piece | Kept; nothing cut, short titles where needed |
| E326 | Back arrow on Search | **Removed** (N5): Cancel is the exit |

## Decisions (the user was asleep)

1. **Raids board keeps its own title.** M-5's "the segment is the only state" applies where there is a segment. The Raids board has none, and "Leaderboard" alone wouldn't say which ladder it is.
2. **Bronze = the `bronze` token.** It is the art bible's bronze, and the cream-on-bronze pair is already contrast-checked. `bronzeHi` was too close to the gold medal.
3. **No per-player crest.** `BoardRow` carries only the league, so every row shows its league's crest. A crest per player would need a server field. This is a follow-up, not a guess.
4. **Retry inside the card, not the fixed action.** The raid view's terracotta action stays "Raid" (disabled, with its reason). Retry is a bronze secondary (art bible 4.2).
5. **Copy edits in `duels.v5.*.ts`.** DUE-01 created these files and it is done. The new keys (`d5.board*`, `d5.raidError`, `d5.seasonOver`, `d5.pickShort`, `d5.pickSet`) went there, next to the expired-note keys they sit beside.
7. **Director review, Raids.** "Wall" was the demo's seeded preset name, not player-typed. The demo now seeds it through i18n (`d5.demoWall`: Wall / Стена; one line in `src/duel/client.ts`). Player-typed names are never translated. The tip no longer repeats the raids left (`d5.sit.raid`). The count stays on the row with the raid league, so that row is not empty and nothing moves into the header.
6. **Telegram Back during a search is unchanged.** It still leaves for the Menu, as before. Only the in-game arrow is gone.

## Gates

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 113 files, 1388 tests.
- `npx vite build`: ok.
- Layout check, 36 duel screens × 24 configs: 0 new. The one known violation is `duel-shop-sell`, owned by DUE-01 and allowlisted.
- `smoke.mjs`: all pass. `duel-smoke.mjs`: all 53 pass.

## Follow-ups for other owners

| Item | Owner |
| --- | --- |
| Kit `addPill` writes at 6 (under the 6.5 floor); duel screens now use `addLeaguePill` | kit (F-05) |
| A per-player crest on the boards needs a server field (`BoardRow`) | server |
| Unused now: `duels.view.board.live`, `duels.view.board.legend` | i18n cleanup (DLG-02) |
| Telegram Back during a search goes to the Menu (the in-game arrow is hidden); decide whether it should cancel first | DUE / platform |
