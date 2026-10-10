# Quick Design Spec: Practice fight (the Beast Trial without spoils)

**Type**: Tweak (a behavioural change to an existing system; no new state, no save field)
**System**: Offline campaign battle, Beast Trial entry (`src/scenes/BeastTrialScene.ts`, `src/game/campaignBattle.ts`)
**GDD Reference**: no GDD covered the Beast Trial. Sources used instead: `docs/v5/audit/MECHANICS.md` I1, `docs/v5/balance/BASELINE.md` "Degenerate: the Beast Trial farm", `docs/v5/DECISIONS.md` V5-011 and V5-029, `design/ux/ia.md` §4, story LF-02 in `docs/v5/plan/STORIES.md`.
**Date**: 2026-10-10
**Story**: LF-02 (W4)

## Change summary

A Trial fight becomes a **Practice** fight: the player fights any beast with the
real army to learn how it fights, and the campaign does not change in any way.
No item, no gold, no pity progress, and also no deaths, wounds, XP or gear wear.

## Motivation

The Trial was a free, repeatable source of beast hoards: rare 50 / epic 35 /
legendary 15, plus the hoard pity that forces a legendary at 8 (BASELINE "Loot").
It cost nothing, had no cooldown and fed `beastPity`, so it was the dominant
legendary source offline and made every other loot source pointless (audit I1,
severity S1). V5-011 asks for "a cooldown or one-time reward"; VISION and the
IA spec name the outcome "Practice: no spoils".

## Options considered (decided autonomously; the user was asleep)

| Option | For | Against | Verdict |
| --- | --- | --- | --- |
| A. **Practice: nothing changes** (no spoils, no losses, no XP) | Closes the farm completely; matches the IA's "Trial fight = learn the beast" and VISION "Practice: no spoils"; no new save field; no timer to explain | The Trial no longer pays XP | **Chosen** |
| B. Practice with real deaths and XP, no spoils | Keeps stakes | Free XP farm (any beast, any time) or a trap that kills heroes in a mode meant for learning | Rejected |
| C. Cooldown (one rewarded Trial per beast per N days) | Keeps some reward | Needs a save field (ST-02 already closed the v6 bump); still a legendary source with no risk; a timer UI | Rejected |
| D. One-time first-win reward per beast | A small carrot | Needs a save field; reward size is an open economy question | Deferred: can be added later on top of A without changing it |

## Design delta

Before (code, `BeastTrialScene.fight`): the Trial built a beast army with its
hoard and ran it as an ordinary campaign battle, so `settleBattle` applied
deaths, wounds, XP, gear wear, gold, the loot pool and `beastPity`.

After: the rules below.

## Rules

1. **Practice tag.** A Trial fight is started with a pending battle tagged
   `practice: { enc, from }` (`trialBattle()` in `src/game/campaignBattle.ts`):
   `enc` is the beast, `from` the screen the Trial was opened from.
2. **The fight itself is unchanged.** Same beast, same level rule
   (`beastLevelFor`: army average +1, world boss +3), same field per beast, a
   fresh seed each time. The beast army carries **no hoard** (zero items), so no
   item can exist to be taken, whatever later code does with the pool.
3. **Settling a Practice fight changes nothing in the campaign** (`settleBattle`):
   - heroes: no deaths (the fallen are back), no wounds, no XP, no level-ups,
     no gear wear, no kill or battle counters;
   - gold: +0; loot: none, picks 0; hoard pity: unchanged;
   - campaign counters `fought` / `won`: unchanged; no band, no world time.
4. **The report is honest about the fight.** Results shows what happened (the
   result, time, kills, who fell or was knocked out) with XP 0 and gold 0, and
   says so: the sub-line under the banner reads "Practice: no spoils" and the
   Spoils page's empty state explains that practice gives no spoils and costs
   no men.
5. **No marker.** A Practice fight never writes the battle-in-progress marker,
   so killing the app mid-fight leaves nothing to resolve (there is nothing to
   lose or gain). A Practice marker found in a save is dropped unresolved.
6. **Return.** Continue on Results goes back to the beast's sheet in the Trial
   (`BeastTrial { from, open: enc }`), which was opened from the Codex. When
   CDX-01 moves the sheet into the Codex, it changes only this target (ia.md L3).
7. **Pre-fight honesty.** The Trial's sub-line tells the player before the
   fight: practice, no spoils, no losses.

## Tuning knobs

| Knob | Default | Range | Category | Rationale |
| --- | --- | --- | --- | --- |
| Practice hoard items | 0 | 0 (fixed) | gate | Any hoard in practice re-opens the farm |
| Practice beast level | `beastLevelFor` (avg +1, boss +3) | unchanged | curve | Same fight as before; only the rewards change |

No other values. There is no cooldown, cost or timer.

## Out of scope (handed off)

- **The Codex beast sheet and retiring the BeastTrial list** (V5-029): CDX-01.
  Until then the Trial fight stays reachable exactly as today: Codex → beast row
  → the beast's sheet → "Fight it". No entry point is removed by this story.
- **Leaving during deployment** returns to the Army for any non-band battle
  (`BattleScene.leaveDeploy`, owned by CT-01/BTL-01): screen-flow N2 asks for the
  origin. Noted for those stories.
- **Offline sources for named/legendary gear** after the farm closes
  (MECHANICS 2.5 item 1): overland beast bands (`bandBeast`, one band in
  fourteen) still carry hoards with legendaries and pity, at full stakes.
- **A first-win reward** (option D): a later economy story, if wanted.

## Affected systems

| System | Impact | Action |
| --- | --- | --- |
| Beast Trial screen | Fight builds a practice pending battle | `BeastTrialScene.fight` uses `trialBattle()` |
| Offline battle settle | Practice branch: no campaign change | `campaignBattle.settleBattle`, `markBattle`, `resolveAbandoned` |
| Results | Practice sub-line, empty-spoils text, return to the sheet | `ResultsScene` |
| Loot / pity | No hoard in practice; pity untouched | none in `loot.ts` |
| Overland beast bands, online lairs and bosses | Unchanged | none |
| Save | No new field (practice is never in the marker) | none |
| `docs/GAMEPLAY.md` | New "Beast Trial (practice)" section; Abandoned battles bullet | updated |

## Acceptance criteria

- [ ] A Practice win grants no item, gold or pity progress; the stash, gold,
      pity and heroes are identical before and after, over many repeats (test).
- [ ] A Practice defeat kills nobody and wounds nobody (test).
- [ ] No Practice marker is saved; a Practice marker in a save resolves to nothing (test).
- [ ] Results shows "Practice: no spoils" for a Trial fight, and Continue
      returns to the beast's sheet (Playwright at 390x844 and 360x780).
- [ ] The BeastTrial scene starts Battle with explicit scene data `{}` (test).
- [ ] No regression: a band battle still pays loot, gold, XP and pity
      (existing tests), and the overland beast band keeps its hoard.

## GDD update required?

No GDD existed. `docs/GAMEPLAY.md` gets the rules (section "Beast Trial (practice)").
