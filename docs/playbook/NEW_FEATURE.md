# From an idea to a merged feature

The path every v5 and v6 mechanic and screen took. Small fixes can skip steps 2 and 3; nothing skips 5, 7 and 8.

```
idea → GDD → decisions → story card (STORIES + SPRINTS) → agent prompt → agent in a worktree
     → Director review → integrator merge + gates → balance record → regression additions → localization check
```

## 1. The idea

Write it in two or three sentences and test it against the pillars (V5-017):

| Pillar | Test |
| --- | --- |
| P1 The line decides | Does it give the player a formation decision, or replace one? |
| P2 Read it at a glance | Can a player read its state on a phone in a second, without colour alone? |
| P3 Command from the thumb | Is it one tap (or a drag) on a 390 px portrait screen? |
| P4 Every man has a name | Does it keep individual men, names and faces? |
| P5 One sim, everywhere | Does the battle sim stay deterministic and shared with the server? |

Reject it if it needs an anti-pillar: micro/APM, a hero brawler, pay for power, hidden information as difficulty,
an economy builder. It must not invent a feature in a mockup or prompt ([ART.md](ART.md) §3), nor silently remove
an element, piece of information or action: list a screen's real elements from the scene code before redesigning.

## 2. The GDD

Every mechanic change gets a GDD before any code: `quick-design` for a small addition, `design-system` for a new
system, then `design-review`; after several, `review-all-gdds` and `consistency-check` together.

```markdown
# <Feature name>
> **Type**: New system | Addition | Change   **Status**: Draft (<story>, <date>)   **Pillars**: P<n>   **Fixes**: <audit ids>

## Overview            2–4 sentences: what it is, where it runs (offline / online / both)
## Player Fantasy      one quoted line a player would say
## Detailed Rules      R1, R2, ... each testable; data shapes as TypeScript interfaces
## Formulas            F1, F2, ... with a symbol table (meaning, typical value) and the output range
## Edge Cases          one bullet per odd state (app killed, cap full, nothing to target)
## Dependencies        system / GDD, direction (uses / is used by / modifies), contract; cross-references
## Tuning Knobs        knob, default, range, category, rationale; knobs live in one data file
## Touch UI needs      the sheet or control, primary vs secondary, min sizes, 320 fit, en + ru strings
## Online and server impact   "None" or what changes on both sides (ADR-0001)
## Save impact         new fields, defaults, size limits
## Balance targets     measurable rows for `npm run balance`
## Acceptance Criteria checkboxes, at least one *Experiential* line
## Files touched       data, sim, scenes, i18n, tests
```

Good v5 models: campaign-events (closed effect vocabulary, an EV formula that makes "no dominated choice" testable),
field-works (a sim feature with formulas, bot behaviour and balance rows), forge-reroll (a quick-design options
table with a verdict), ai-doctrines (data-driven bot behaviour, readability rules). They are in git history.

**Load-bearing contracts** need an ADR (`architecture-decision`): ADR-0001 the server replays the battle sim (any
change under `src/sim/**`, the data it reads, stat derivation, setup building or order kinds is a rules change);
ADR-0002 saves; ADR-0003 engine version (Phaser 3.90 kept); ADR-0004 battle input layer; ADR-0005 the UI kit.

## 3. Decisions

Decide and log one row each; never rewrite old rows, add one that supersedes.

```markdown
| ID | Date | Decision | Alternatives | Why |
| V7-001 | 2027-01-10 | <what you chose, with the numbers> | <what you rejected> | <one or two sentences> |
```

A balance miss is a decision too: what was measured, the target, who owns the residual (V5-037).

## 4. The story card

One STORIES row plus a dispatch card in SPRINTS. Inside one wave no two stories own the same file (check it with a
script over "Files owned").

| Field | What goes in it |
| --- | --- |
| ID | Epic prefix + number (`EV-02`) |
| Goal | One line, with the GDD rule ids (`R5, R6, F2`) |
| Type | Logic, UI, Config/Data, Integration, Visual/Feel, Docs |
| Files owned | Exact paths; `(new)` for created files; a wildcard owns the folder for the wave |
| Depends on / Parallel-safe with | Story ids |
| Acceptance criteria | 2–4 measurable ACs, one experiential when players feel it; then `Gates: G-ALL, G-UI, …` |
| Skills / Agents | Names (full paths on the dispatch card) |
| Est. days | optimistic / **expected** / pessimistic |
| GDD / spec, Wave | The GDD rule ids and ADR; when it runs |

Example (EV-02): *Starter deck content and the EV check (R5, R6, F2) · Config/Data · Owns `src/data/eventDeck.ts`
(new), `src/dev/eventBalance.ts` (new), `src/i18n/events.en.ts`/`.ru.ts` (new), `tests/eventDeck.test.ts` · Depends
on EV-01 · ACs: 1. every event has 2-3 choices, at least one free; 0 dominated choices 2. net event gold per battle
-10..+25 g; 0.3-0.5 events per battle in the scripted 40-battle run 3. copy in en and ru, no text in code. Gates:
G-ALL, G-MECH · Skills dialogue-systems, team-narrative, balance-check, localize, tdd · Agents writer,
economy-designer, game-designer.*

**Experiential ACs** are checked by playing, with a number: "≥ 8 real decisions in the first campaign battle", "time
to first contact ≤ 15 s", "describes the turning point before reading the why-line", "no event choice picked more
than 80% of the time across 5 testers". QA scores each PASS / PARTIAL / FAIL / NOT ASSESSED; "needs humans" is NOT
ASSESSED, never a guessed PASS.

### Gate codes

| Code | Means |
| --- | --- |
| G-ALL | `npx tsc --noEmit`, `npx vitest run`, server vitest if `server/` changed, `npx vite build`, the war play-smoke when war wiring changed, replay-hash. Semantic commits, no AI co-author trailer, never push. Report ends with **Skills applied**. |
| G-UI | Screenshots across the screen matrix ([director-brief.md](director-brief.md)), en and ru, looked at. Every listed element present or its removal cited. No colour-only state, targets ≥ 44 pt. |
| G-MECH | GDD referenced; `balance-check` plus `npm run balance:war` **before and after** in `docs/<ver>/balance/<story>.md`; targets met or the miss logged; the player doc updated (`docs/GAMEPLAY.md`, `DESIGN_V2.md`, `DUELS.md`, `ITEMS.md`); played in the browser. |
| G-GUARD | Presentation that touches battle: `npm run balance` before and after, within noise. |
| G-ONLINE | Client **and** `server/` in the same story, tests on both sides. |
| G-TRAIN | Sim rules: replay fixtures and hash parity (§7). |
| G-SAVE | Save fields declared once, read with defaults. |
| G-ASSET | The art pipeline ([ART.md](ART.md)). |
| G-DOCS | Docs only: `npx tsc --noEmit` and a `docs(...)` commit. |

**Dispatch card:** per wave a table of story → files owned → depends on; a **Hotspots** line naming the one owner of
each hot file (`src/scenes/BattleScene.ts`, `src/sim/battle.ts`, `src/world/world.ts`, `src/game/campaign.ts`,
`src/ui/mosaic/**`); and per story its full skill and agent paths
(`- **EV-02** (Config/Data, est. 1.5 / **2** / 3): skills {F}/skills/dialogue-systems/SKILL.md, …; agents {F}/agents/writer.md, …`).
Pick skills with the `router` skill and the table in [director-brief.md](director-brief.md).

**Ordering rules:** an engine that can open UI ships after the UI that closes it (V5-064: the event deck shipped
behind `EVENT_DECK_ENABLED` until the card merged). One story owns `BattleScene.ts` per wave; put new behaviour in
new modules.

## 5. The agent prompt

Use the implementation template in [PROMPTS_AGENTS.md](PROMPTS_AGENTS.md). Dispatch with `isolation: "worktree"`, a
short `name`, in the background, siblings in one message, at most 3–4 code agents ([LESSONS.md](LESSONS.md)).

## 6. Review

1. Read the report; check **Skills applied** against the card; send back work that skipped them.
2. Open 2–3 risky screenshots yourself (narrowest size, Russian, the state an AC names): clipped or ellipsized text,
   missing glyphs, overlap with the tab bar, colour-only states, a missing element.
3. Spot-check one or two claims (a balance number, a test name, a decision).
4. Copy the decisions that matter from the agent's `docs/<ver>/stories/<ID>/NOTES.md` into DECISIONS.
5. Changes go back by SendMessage to the same agent; a fix in an area already merged goes to a fresh, small agent.

## 7. Integration and gates

A short-lived integrator per merge batch ([PROMPTS_AGENTS.md](PROMPTS_AGENTS.md)) merges `--no-ff` in a set order,
then runs:

```bash
npx tsc --noEmit
npx vitest run
(cd server && npx vitest run)                 # when server/ or shared rules changed
npx vite build
npm run balance:war                            # mechanic changes
node scripts/war/play-smoke.mjs ...            # a short live wiring check (war code); wrangler dev with DEV_AUTH
# stop the servers you started; rm -rf dist shots
```

A failure that passes alone is a flake: report both runs in [docs/FLAKY.md](../FLAKY.md) and give it to a fixer.
(The legacy layout check, smokes and regression suite were removed with the campaign and duels.)

**Sim rules changes:** bump `SIM_VERSION` (src/sim/version.ts) so stale clients reload.

## 8. Balance

| Command | What it does |
| --- | --- |
| `npm run balance -- 400` | Seeded report (`src/dev/balance.ts`): matched fights, campaign curve, class mirrors, lairs, assaults, the host, duels, war beasts, economy, items, perks, doctrines, orders, works. 74 min at load 27–50. |
| `npm run balance:ladder [-- N [FROM-TO]]` | Ladder parity (`src/dev/ladderParity.ts`) against the frozen anchor (`src/dev/ladderParity/floors.frozen.json`). One paired SE ≈ 4 pts at 300 seeds, ≈ 2 at 1,000. |
| Feature scripts | `src/dev/eventBalance.ts`, `worksBalance.ts`, `ordersBalance.ts`, `doctrineBalance.ts`, `arcBalance.ts`, `beastBalance.ts`, `classBalance.ts`, `rarityBalance.ts` |

**Anchors at the end of v5:**

| Row | Value | Tolerance |
| --- | --- | --- |
| Matched fights | 53–54%, median 72 s | ±3 |
| Lairs | 43 / 58 / 53% | ±5 |
| Lair assault at 1.0× | about 45% | — |
| The host | about 49% | GDD 40–55% |
| The opening | 66–69% | — |
| Ladder floors | 49 of 50 within ±5 | re-measure after any sim change (V5-052) |
| Replay fixtures | Node 33/33, Chromium 13/13, WebKit 13/13 | unchanged unless re-recorded on purpose |

Write `docs/<ver>/balance/<story>.md`: before, after, each GDD target met or missed, the decisions. A miss that
needs another story gets an owner (V5-037, V5-069).

## 9. Regression additions

Every bug class fixed gets a check (a seeded vitest scenario for war logic, tests/war).

Wait on real conditions, never fixed sleeps (`settled()`, `steadyBtn` in `scripts/regression/lib.mjs`).

## 10. Localization

| Rule | How |
| --- | --- |
| en and ru tables | Each story adds a namespace pair `src/i18n/<ns>.en.ts` / `.ru.ts`, spread into `en.ts` / `ru.ts` (one line each). No text in code. |
| Numbers | Through `src/i18n/numbers.ts`: `fmtCount` (en "12,400"; ru "12 400", four digits stay whole), `fmtSigned`, `fmtDecimal` (ru decimal comma). Display only. |
| Names and places | Saves and the server keep Latin names; screens use `heroName` (`src/i18n/names.ts`) and `placeName` (`src/i18n/places.ts`). A new name needs its Russian form (`tests/heroNames.test.ts`). |
| Font glyphs | Only characters in `UI_CHARS` (`src/art/fontMetrics.ts`) draw. **No U+00A0.** Arrows are there at a fixed advance. Adding a character: `npm run fonts:metrics` and check all three faces. |
| Fit | Russian is longer; test at 320 in ru. Wrap, never ellipsize must-show facts; a label stays the same at every width (V5-063). |
| Card text carries no numbers | Chips show costs from data, so text can't drift. |

## 11. The platform rule (V5-076)

Neutral interfaces in `src/platform/core/` (auth, payments, storage, haptics, back button, share, safe area, input
hints, notifications), one adapter folder per platform (`telegram/`, `web/`; later `steam/`, `mobile/`), the
platform detected once at startup. Game code imports the interface, never an adapter; per-platform behaviour gets
its own interface and one tested adapter per platform. A story that adds `if (isTelegram)` to a scene fails review.

## Checklist

- [ ] Idea tested against the pillars and anti-pillars; screen elements listed; nothing silently removed
- [ ] GDD with rules, formulas, knobs, edge cases, save and server impact, balance targets, ACs; `design-review`; ADR if a contract changes
- [ ] Decisions logged with alternatives and reasons
- [ ] Story row: goal, files owned (disjoint in its wave), depends on, 2–4 ACs incl. an experiential one, gates, skills, agents; dispatch card with full paths and hotspots
- [ ] Agent prompt from the template; worktree isolation; at most 3–4 code agents
- [ ] Report read; Skills applied checked; 2–3 screenshots opened; claims spot-checked
- [ ] Integrator merged `--no-ff`; gates green in order; flakes recorded with both runs
- [ ] Balance before and after; anchors held or the miss owned; replay fixtures unchanged or re-recorded on purpose
- [ ] Regression: tap check for new controls, fixture for new sheets, door for new screens; SUITE.md updated
- [ ] en and ru; `fmtCount` / `fmtDecimal`; `heroName` / `placeName`; no NBSP; checked at 320 ru
- [ ] No platform checks in game code
- [ ] Player doc updated; servers stopped; `dist/` and `shots/` removed; worktree and branch cleaned up
