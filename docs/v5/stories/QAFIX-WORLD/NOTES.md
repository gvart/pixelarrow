# QAFIX-WORLD: world and campaign findings from QA-03

Fixes for the world and campaign findings in `docs/v5/qa/PLAYTHROUGH.md` (S2-1, S2-2, S3-4 and the world S4 copy). Tests: `tests/qafixWorld.test.ts`. Before and after shots: `docs/v5/qa/fixes/world/`.

No sim rule changed. Replay fixtures and balance numbers are unchanged.

## S2-1: the camp defeat death spiral

**Cause.** `afterPartyBattle` set `safeUntil = time + 3` game hours, and the band idled for 3 hours. The World scene re-entered camp rest at once (`create`: `if (this.w.camp) this.waiting = true`), and rest runs at 4 game hours a second. The 3-hour window passed in under a second, and the band was still standing on the camp.

**Rule chosen.** After a battle the army did not win (a defeat or a draw):

1. **The map comes back with the rest stopped.** `Campaign.takeRestHalt()` is true once after such a battle, and `WorldScene.create` doesn't resume the rest. Game time stands still until the player acts: he can rest, break camp, march or check the army. This is the real-time breather, and it has no time limit.
2. **The band that kept the field leaves the army alone for `WORLD_RULES.defeatRespiteH` = 12 game hours** (`PartyState.spareUntil`, saved). While spared, it neither chases nor falls on the army, and it wanders off. 12 hours of camp rest heals 24 hours of a 36-hour wound. It's long enough to break camp and march off, and short enough that a band that won stays a threat.
3. **No band falls on an army with no man fit to fight** (`PlayerInfo.fit`), and no band chases one. This holds for every band, including event hunters. Once one man is back on his feet, the bands come again.

The global `safeUntil` (3 hours) is unchanged. The World scene now refreshes `PlayerInfo` as time passes, so the bands see men heal.

Alternatives considered:

- A real-time respite (seconds). It does nothing for a player who walks away and comes back to a resting camp.
- A respite for every band. It would make losing a battle a shield against all other bands.

## S2-2: the encounter sheet miscount, and the odds

"Fit" counted `Campaign.fitHeroes()`, which, with no man fit, returns the wounded ("if nobody is fit, everyone fights"). So the sheet said "5 fit, 5 wounded" with 5 men, and called the fight even because the wounded fought at full strength.

**Rule: only fit men fight.** `src/game/encounter.ts`:

- `armyLine`: fit means fielded and not wounded, so fit + wounded never exceeds the army. `power` is the power of the fit men who would take the field (0 with none). The sheet's odds and threat use it.
- `encounterOffers`: with no man fit, the encounter sheet offers only "Let them go". There's no Attack, ransom or flight to fail. The advice reads "No man is fit to fight. Let them go, and rest." By S2-1 rule 3 such a sheet only opens when the player marches into a band himself.
- A lair assault with no man fit is refused with "No man is fit to fight. Rest first."

`Campaign.fitHeroes()` keeps its fallback for the paths that still build a battle with no man fit, such as an abandoned battle fought out.

## S3-4: the lair assault stall

**Why the Rush garrison stayed put.** It's EC-05 (V5-073): a garrison behind its palisade holds its posts until an enemy comes within `WALL_REACH` paces of the wall (`src/sim/ai.ts holdWalls`). An army that never reached the wall met no one. The doctrine label wasn't wrong about how the garrison fights; it was wrong about when. So the copy changes, not the sim:

- `arc.as.walls`: "…A garrison holds its walls until you close in, and never retreats."
- The assault sheet's doctrine row: "Once you reach the wall: charges at once in a wedge…"

**A timeout is a draw.** At the time limit the sim tallies a winner from side strength (×1.1), and that tally stays because replays hash it. A campaign battle that ends at the time limit with both armies standing (`campaignBattle.ts timedOut`), and that the player did not win, is settled as a **draw** (`Outcome.timedOut`):

- **Rewards follow the result.** There's no base pay for taking the field (the 20 gold and 12 XP a man), no draw bonus and no loot picks. Only the men killed pay: 12 gold and 10 XP each, with the usual gear and level multipliers. Standing outside a palisade for five minutes is no longer a repeatable gold and XP farm. A victory on the tally (the player 10% stronger) stays a victory.
- **The why-line is true.** "Time ran out. The garrison held its walls." against a garrison (the foe had `holdField`), otherwise "Time ran out before either side broke." These are new selection rules in `whyLine` (`WhyOpts.timedOut`, `walls`), checked before anything else for a draw.

**Not done here (BattleScene belongs to the battle fixer):** the end-of-battle banner in `BattleScene` (around line 1801) still reads the sim's winner, so a timed-out assault flashes "Defeat" before Results says "Draw". The fix is one line: show `battle.banner.draw` when `timedOut(this.sim)` (exported from `src/game/campaignBattle.ts`) and the player did not win.

## S4: world copy and polish

- **"Consider fleeing or resting" with no way out.** `encounterCopy` suggests only a choice the sheet offers: "A hard fight. Consider fleeing.", "…Consider letting them go.", or plain "A hard fight." after a failed flight.
- **"You have caught up with them … They won't let you go" (the host).** "Caught up" is only said when the band would let you go. A band that won't, such as the host, "turns to face you, weapons drawn!"
- **"food -0 a day".** `fmtSigned` rounds first, then signs: "+2", "-1", "0". It's used by the map's camp line and the Camp screen.
- **A lone beast's why-line.** With no cause rule matched, the fallback against a beast (`WhyOpts.beast`, from `encounterOf` on Results) is "The beast outlasted our men." (a defeat) or "We wore the beast down." (a victory), never "Their line held longer than ours."
- **Lair names.** Galatae and bandit lairs take names in turn from six each (`LAIR_NAMES` in `src/world/map.ts`), starting from `seed % 6`. There is no extra RNG draw, so the rest of every map is unchanged. Every Galatae name contains "Galatae", which the map art keys on, and every name has en and ru.
- **The town tap area.** It was an 11 px circle around the settlement's tile plus the whole picture box. The circle reached past the picture. The box also took in the plain ground a settlement is drawn on (a village's clearing, an unwalled town's beaten earth) and the transparent corners. All of that looks like open ground on the map.
  - The sprite now carries a `body` mask (`PropSprite.body`, from `Cv.done`): what stands on the ground, such as buildings, walls, fields and paving, but not the ground fill `Cv.ground` lays first. Nothing drawn changes.
  - `pickSettlement` (`src/art/overlandMap.ts`) picks a settlement by its tap area. That's the body grown by `SITE_TAP_MARGIN` (4 map px), with the ground it walls in filled, so there are no holes. A walled town is tappable wall to wall. The name plate also counts.
  - The open ground beside a settlement is ground, so the player can march there.
  - Camping right beside a town is still refused within `CAMP_RULES.clearance` (7 tiles for a town). That's a separate design knob, left as it is.
