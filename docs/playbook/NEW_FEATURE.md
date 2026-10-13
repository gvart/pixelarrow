# From an idea to a merged feature

The path every v5 mechanic and screen took. Small fixes can skip steps 2 and 3; nothing skips 5, 7 and 8.

```
idea → GDD (design/gdd) → decisions (DECISIONS.md) → story card (STORIES + SPRINTS)
     → agent prompt → agent works in a worktree → Director review → integrator merge + gates
     → balance record → regression additions → localization check
```

## 1. The idea

Write the idea in two or three sentences and test it against the pillars before anything else
([docs/v5/VISION.md](../v5/VISION.md), V5-017):

| Pillar | Test |
| --- | --- |
| P1 The line decides | Does it give the player a formation decision, or replace one? |
| P2 Read it at a glance | Can a player read its state on a phone in a second, without colour alone? |
| P3 Command from the thumb | Is it one tap (or a drag) on a 390 px portrait screen? |
| P4 Every man has a name | Does it keep individual men, names and faces? |
| P5 One sim, everywhere | Does the battle sim stay deterministic and shared with the server? |

Anti-pillars (reject the idea if it needs one): micro/APM, a hero brawler, pay for power, hidden information as
difficulty, an economy builder.

Also check it does not invent a feature the game lacks in a mockup or prompt (see [ART.md](ART.md) "Verify
mockups"), and that it does not silently remove an existing element, piece of information or action. Before
you redesign a screen, list its real elements from the scene code ([docs/v5/ux/ELEMENT_MAP.md](../v5/ux/ELEMENT_MAP.md)
is the v5 list).

## 2. The GDD

Every mechanic change gets a GDD in `design/gdd/` before any code. Use the `quick-design` skill for a small
addition, `design-system` for a new system, then `design-review`. After several GDDs, run `review-all-gdds` and
`consistency-check` together.

### Template (the section order every v5 GDD used)

```markdown
# <Feature name>

> **Type**: New system | Addition | Change  (quick-design or design-system)
> **Status**: Draft (<story>, <date>)
> **Pillars**: P<n> ...
> **Fixes**: <audit ids it answers, e.g. MECH C2, PLAY P1>

## Overview            2–4 sentences: what it is, where it runs (offline / online / both)
## Player Fantasy      one quoted line a player would say
## Detailed Rules      R1, R2, ... numbered, each testable. Data shapes as TypeScript interfaces.
## Formulas            F1, F2, ... with a symbol table (meaning, typical value) and the output range
## Edge Cases          one bullet per odd state (app killed, cap full, old save, nothing to target)
## Dependencies        table: system / GDD, direction (uses / is used by / modifies), contract
### Cross-References   table: target GDD, the element referenced, nature
## Tuning Knobs        table: knob, default, range, category, rationale. Knobs live in one data file.
## Touch UI needs      the sheet or control, primary vs secondary, min sizes, 320x640 fit, en + ru strings
## Online and server impact   "None" or what changes on both sides (ADR-0001)
## Save impact         new fields, defaults, size limits
## Balance targets     measurable rows for `npm run balance` (and a dev script if needed)
## Acceptance Criteria checkboxes, including at least one *Experiential* line
## Files touched       data, sim, scenes, i18n, tests
```

### Real examples to copy

| GDD | Why it is a good model |
| --- | --- |
| [design/gdd/campaign-events.md](../../design/gdd/campaign-events.md) | Closed effect vocabulary, deterministic triggers, an EV formula that makes "no dominated choice" testable, a starter content table |
| [design/gdd/field-works.md](../../design/gdd/field-works.md) | A sim feature: cell kinds, an order, formulas, bot behaviour, balance rows per work |
| [design/gdd/forge-reroll.md](../../design/gdd/forge-reroll.md) | A quick-design spec: change summary, motivation, an options table with a verdict |
| [design/gdd/ai-doctrines.md](../../design/gdd/ai-doctrines.md) | Data-driven bot behaviour; readability rules (R7) |

### Architecture decisions

If the feature changes a load-bearing contract, write or update an ADR with the `architecture-decision` skill:

| ADR | Contract |
| --- | --- |
| [ADR-0001](../../design/adr/ADR-0001-determinism-replay.md) | The server replays the battle sim: any change under `src/sim/**`, the data it reads, stat derivation, setup building or order kinds is a rules change |
| [ADR-0002](../../design/adr/ADR-0002-save-migration.md) | Save versions and migration |
| [ADR-0003](../../design/adr/ADR-0003-engine-version.md) | Phaser 3.90 kept (the Phaser 4 gate failed, V5-028) |
| [ADR-0004](../../design/adr/ADR-0004-input-layer.md) | Battle input layer (hit test, gestures) |
| [ADR-0005](../../design/adr/ADR-0005-ui-kit.md) | The UI kit |

## 3. Decisions

When a choice comes up (direction, numbers, scope, naming), decide and log it in a decisions table, one row
each. Never rewrite old rows; add a new one that supersedes.

```markdown
| ID | Date | Decision | Alternatives | Why |
| V6-001 | 2026-11-01 | <what you chose, with the numbers> | <what you rejected> | <the reason in one or two sentences> |
```

For v6 start a new file (for example `docs/v6/DECISIONS.md`). Good v5 examples: V5-039 (the Trial becomes
practice), V5-065 (ditch tuned below the GDD range, GDD updated), V5-074 (no users, compatibility dropped).
A balance miss is also a decision: say what was measured, the target, and who owns the residual (V5-037).

## 4. The story card

One row in a STORIES table plus a dispatch card in SPRINTS. File ownership is what makes parallel agents safe:
inside one wave no two stories own the same file (it was checked by a script over the "Files owned" column).

### Template (STORIES row)

| Field | What goes in it |
| --- | --- |
| ID | Epic prefix + number (`EV-02`) |
| Goal | One line, with the GDD rule ids (`R5, R6, F2`) |
| Type | Logic, UI, Config/Data, Integration, Visual/Feel, Docs |
| Files owned | Exact paths; `(new)` for created files; a wildcard owns the folder for that wave |
| Depends on | Story ids that must be merged first |
| Parallel-safe with | Stories in the same wave (disjoint files) |
| Acceptance criteria | 2–4 numbered ACs, measurable, plus at least one experiential AC when players feel it; then `Gates: G-ALL, G-UI, ...` |
| Skills | Skill names (resolved to full paths on the dispatch card) |
| Agents | Agent definitions the worker reads (`gameplay-programmer`, `ux-designer`, ...) |
| Est. days | optimistic / **expected** / pessimistic |
| GDD / spec | The GDD and the rule ids; the ADR |
| Wave | When it runs |

### Real example (EV-02, verbatim from STORIES.md)

> **EV-02** · Starter deck content and the EV check (R5, R6, F2). · Config/Data · Owns `src/data/eventDeck.ts`
> (new), `src/dev/eventBalance.ts` (new), `src/i18n/events.en.ts` (new), `src/i18n/events.ru.ts` (new),
> `tests/eventDeck.test.ts` · Depends on EV-01 · ACs: 1. Every event has 2-3 choices, at least one free; EV table
> shows 0 dominated choices 2. Net event gold per battle -10..+25 g; 0.3-0.5 events per battle in the scripted
> 40-battle run 3. Copy in en and ru, no text in code. Gates: G-ALL, G-MECH · Skills dialogue-systems,
> team-narrative, balance-check, localize, tdd · Agents writer, economy-designer, game-designer.

### Experiential ACs

A unit test can't tell you the feature feels right. Write at least one AC a player (or a proxy QA agent)
checks by playing, with a number:

- "≥ 8 real decisions in the first campaign battle" (VISION)
- "Time to first contact ≤ 15 s"
- "Describes the turning point before reading the why-line"
- "Remembers an event and its consequence after a session"
- "No event choice is picked more than 80% of the time across 5 testers"

The QA playthrough scores each one PASS / PARTIAL / FAIL / NOT ASSESSED
([docs/v5/qa/PLAYTHROUGH.md](../v5/qa/PLAYTHROUGH.md) "Experiential AC scorecard"). "Needs humans" is a valid
NOT ASSESSED; never mark it PASS on a guess.

### Gate codes (part of every AC list)

| Code | Means |
| --- | --- |
| G-ALL | `npx tsc --noEmit`, `npx vitest run`, `(cd server && npx vitest run)` if `server/` changed, `npx vite build`, layout check 0 new violations, the smokes, regression, replay-hash. Semantic commits, no AI co-author trailer, never push. Report ends with **Skills applied**. |
| G-UI | Screenshots at 390x844 and 360x780 (320x640 through layout-check), en and ru, looked at by the agent. Every element-map row present or its removal cited. No colour-only state, targets ≥ 44 pt. |
| G-MECH | GDD referenced; `balance-check` skill plus `npm run balance -- 400` **before and after**, both in `docs/<ver>/balance/<story>.md`; targets met or the miss logged as a decision; the matching doc updated (`docs/GAMEPLAY.md`, `DESIGN_V2.md`, `DUELS.md`, `ITEMS.md`); played in the browser. |
| G-GUARD | Presentation that touches battle: `npm run balance` before and after, within noise. |
| G-ONLINE | Online rule: client **and** `server/` in the same story, tests on both sides. |
| G-TRAIN | Sim rules: replay fixtures and hash parity (below). |
| G-SAVE | Save fields declared once, read with defaults. |
| G-ASSET | The art pipeline ([ART.md](ART.md)). |
| G-DOCS | Docs only: `npx tsc --noEmit` and a `docs(...)` commit. |

### Dispatch card (SPRINTS)

Per wave: a table of story → files owned → depends on; a **Hotspots** line naming the one owner of each hot
file this wave (`src/scenes/BattleScene.ts`, `src/sim/battle.ts`, `src/world/world.ts`, `src/game/campaign.ts`,
`src/ui/mosaic/**`); and a card with full skill and agent paths:

```
- **EV-02** (Config/Data, est. 1.5 / **2** / 3): skills $F/.claude/skills/dialogue-systems/SKILL.md,
  $F/.claude/skills/team-narrative/SKILL.md, $F/.claude/skills/balance-check/SKILL.md,
  $F/.claude/skills/localize/SKILL.md, ~/.claude/skills/tdd/SKILL.md; agents $F/.claude/agents/writer.md,
  $F/.claude/agents/economy-designer.md, $F/.claude/agents/game-designer.md.
```

Pick skills with the `router` skill and the table in [director-brief-v5.md](director-brief-v5.md) "Skills are
mandatory". The full list is in [PROMPTS_AGENTS.md](PROMPTS_AGENTS.md).

**Ordering rules that bit v5:** an engine that can open UI must not ship before the UI that closes it (V5-064:
an event pauses the map, so the event card merged before the deck was switched on; the deck shipped behind
`EVENT_DECK_ENABLED`). One story owns `BattleScene.ts` per wave; put new behaviour in new modules to keep that
diff small.

## 5. The agent prompt

Use the implementation template in [PROMPTS_AGENTS.md](PROMPTS_AGENTS.md). Dispatch with
`isolation: "worktree"`, a short `name`, in the background, siblings in the same message, at most 3–4 code
agents at once (fewer when the machine is loaded; see [LESSONS.md](LESSONS.md)).

## 6. Review (what to look at)

The Director never merges without looking. For each finished agent:

1. Read the report. Check its **Skills applied** section against the skills on the card. Send back work that
   skipped them.
2. Open 2–3 screenshots yourself, chosen from the risky ones: the narrowest size (320), Russian, a sheet or a
   state the AC names. Look for clipped or ellipsized text, tofu or missing characters, overlap with the tab
   bar, colour-only states, a missing element from the element map.
3. Spot-check one or two claims: a number in the balance file, a test name, a decision the agent says it made.
4. Check the agent's `docs/<ver>/stories/<ID>/NOTES.md` decisions; copy the ones that matter into DECISIONS.
5. Send changes back with SendMessage to the same agent (it keeps its context). A fix in an area already merged
   goes to a fresh, small agent.

## 7. Integration and gates

A short-lived integrator agent per merge batch (template in [PROMPTS_AGENTS.md](PROMPTS_AGENTS.md)). Merge with
`--no-ff` into the main line in a set order, then run the gates in this order:

```bash
npx tsc --noEmit
npx vitest run
(cd server && npx vitest run)                 # when server/ or shared rules changed
npx vite build
npx vite preview --port <free port> &         # never the dev server for gates (see LESSONS)
node scripts/layout-check.mjs http://localhost:<port>/ --no-shots
node scripts/smoke.mjs http://localhost:<port>/
node scripts/tutorial-smoke.mjs http://localhost:<port>/
node scripts/duel-smoke.mjs http://localhost:<port>/
node scripts/fullscreen-smoke.mjs http://localhost:<port>/
node scripts/audio-smoke.mjs http://localhost:<port>/
node scripts/online-smoke.mjs http://localhost:<port>/
npm run regression -- --port <another free port>
node scripts/online-e2e.mjs ...               # online code only; needs wrangler dev with DEV_AUTH and VITE_DEV_AUTH=1
node scripts/replay-hash.mjs chromium          # sim changes; add webkit with PW_WEBKIT_PATH set
npm run balance -- 400                         # mechanic changes
# stop every server you started; rm -rf dist shots
```

Never run layout-check, regression and online-e2e at the same time. A failure that passes alone is a flake:
report both runs and give it to a fixer; never just retry it away.

### Sim rules changes (ADR-0001)

Any change that can alter a replay either stays inside the current rules train with the fixtures re-recorded
on purpose and the diff reviewed:

```bash
RECORD_REPLAY_V2=1 npx vitest run tests/trainReplay.test.ts
node scripts/replay-hash.mjs                      # every engine must print "13/13 battles match"; NOT RUN is not a pass
PW_WEBKIT_PATH=~/Library/Caches/ms-playwright/webkit-2242/pw_run.sh node scripts/replay-hash.mjs webkit
```

or bumps `SIM_VERSION` and records new fixtures ([docs/OPS.md](../OPS.md) "The next rules change").

## 8. Balance

| Command | What it does |
| --- | --- |
| `npm run balance -- 400` | The seeded balance report (`scripts/dev/balance.mjs` → `src/dev/balance.ts`): matched fights, campaign curve, class mirrors, lairs, assaults, the host, duels, war beasts, economy, items, perks, doctrines, orders, works. 400 seeds; it took 74 min at load average 27–50. |
| `npm run balance:ladder [-- N [FROM-TO]]` | Ladder parity (`src/dev/ladderParity.ts`) against the frozen pre-EC-05 anchor (`src/dev/ladderParity/floors.frozen.json`, `ai.frozen.ts`). One paired SE is about 4 pts at 300 seeds, about 2 at 1,000. |
| Feature dev scripts | `src/dev/eventBalance.ts`, `worksBalance.ts`, `ordersBalance.ts`, `doctrineBalance.ts`, `arcBalance.ts`, `beastBalance.ts`, `classBalance.ts`, `rarityBalance.ts` |

**Anchors** (the numbers every merge was checked against at the end of v5; [FINAL.md](../v5/balance/FINAL.md)):

| Row | Value | Tolerance |
| --- | --- | --- |
| Matched fights | 53–54%, median 72 s | ±3 |
| Lairs | 43 / 58 / 53% | ±5 |
| Lair assault at 1.0× | about 45% | — |
| The host | about 49% | GDD 40–55% |
| The opening | 66–69% | — |
| Ladder floors | 49 of 50 within ±5 | re-measure after any sim change (V5-052) |
| Replay fixtures | Node 33/33, Chromium 13/13, WebKit 13/13 | must not change unless re-recorded on purpose |

Write `docs/<ver>/balance/<story>.md` with the before run, the after run, each GDD target marked met or
missed, and the decisions. A miss that needs another story gets an owner, not a silent pass (V5-037, V5-069).

## 9. Regression additions

Every bug class you fix gets a regression check, and **every control must answer a tap**. The F-07 refactor
moved the Settings Toggle and kept its size but dropped `setInteractive`; every switch drew and none took a
tap. The layout check and pixel diffs could not see it; `audio-smoke` caught it by luck (7575ce6). Since
FIXER-7, `scripts/regression/controls.mjs` taps each control like a finger once it stands still and checks
what follows.

When you add a control, a sheet or a door:

- add a tap check for a sample of the new control type in `scripts/regression/controls.mjs`;
- add the screen to `scripts/layout-check.mjs` fixtures or the sheet to `scripts/regression/sheet-layout.mjs`
  (`tests/regression/sheetFixtures.test.ts` fails if a sheet opener has neither);
- add a door to `scripts/regression/doors.mjs` if it opens a screen (`tests/regression/doors.test.ts` checks it
  against `src/platform/nav.ts`);
- list the script or test in [tests/regression/SUITE.md](../../tests/regression/SUITE.md) and `run.mjs`
  (`suite.test.ts` checks the manifest).

Wait on real conditions, never fixed sleeps: `settled()` scenes and `steadyBtn` (two equal reads two frames
apart, inside the list's window) in `scripts/regression/lib.mjs`.

## 10. Localization

| Rule | How |
| --- | --- |
| en and ru tables | Each story adds its own namespace pair `src/i18n/<ns>.en.ts` / `<ns>.ru.ts` and spreads it into `en.ts` / `ru.ts` (one line each; integrators resolve these conflicts). No text in code. |
| Numbers | Always through `src/i18n/numbers.ts`: `fmtCount` (en "12,400"; ru "12 400", four digits stay whole), `fmtSigned`, `fmtDecimal` (ru decimal comma). Display only; sim and save values never pass through it. |
| Names and places | Saves and the server keep Latin names. Screens show them through `heroName` ([src/i18n/names.ts](../../src/i18n/names.ts), `NAMES_RU`) and `placeName` ([src/i18n/places.ts](../../src/i18n/places.ts), `PLACES_RU`). A new name in `src/data/names.ts` needs its Russian form; `tests/heroNames.test.ts` holds the lists together. |
| Font glyphs | The UI text is drawn from bitmap atlases built from the characters in `src/art/fontMetrics.ts` (`UI_CHARS`). A character not in that table draws as nothing. **U+00A0 (no-break space) is not there**: it drew "12450" for "12 450" (F-07 NOTES), so use a plain space. Arrows (→ ← ↑ ↓) are in the table at a fixed advance; check them in a screenshot at the smallest size before relying on them. Adding a character means regenerating the metrics (`npm run fonts:metrics`) and checking all three faces. |
| Fit | Russian labels are usually longer ("Стрел…" was cut at 360, CT-02). Test at 320 in ru. Wrap, never ellipsize must-show facts; keep a label the same at every width (V5-063). |
| Card text carries no numbers | Event text never repeats a cost or effect; the chips show them from data, so the text can't drift (EV-02 decision 10). |

## 11. The platform rule for v6 (V5-076)

Neutral core interfaces, one adapter folder per platform, the platform detected once at startup, **no platform
checks in game code**.

```
src/platform/core/       interfaces: Auth, Payments, Storage, Haptics, BackButton, Share, SafeArea, InputHints, Notifications
src/platform/telegram/   today's behaviour (Stars payments, WebApp back button, CloudStorage)
src/platform/web/        email accounts, Payments "coming soon" placeholder
src/platform/steam/      later
src/platform/mobile/     later
```

Game code imports the interface, never `telegram.ts`. A feature that behaves differently per platform gets its
own interface and one adapter per platform, each tested on its own. A story that adds `if (isTelegram)` to a
scene fails review. See [docs/ROADMAP.md](../ROADMAP.md) "Next: v6" for the rest (landscape layouts, keyboard
and mouse, accounts, Turnstile, privacy).

## Checklist

- [ ] Idea tested against the five pillars and the anti-pillars
- [ ] Screen elements listed from the scene code before any redesign; nothing silently removed
- [ ] GDD in `design/gdd/` with rules, formulas, knobs, edge cases, save and server impact, balance targets, ACs
- [ ] `design-review` done; ADR written if a contract changes
- [ ] Decisions logged with alternatives and reasons
- [ ] Story row: goal, files owned (disjoint in its wave), depends on, 2–4 ACs including an experiential one, gate codes, skills, agents
- [ ] Dispatch card with full skill and agent paths; hotspots named
- [ ] Agent prompt from the template; worktree isolation; at most 3–4 code agents
- [ ] Report read; Skills applied checked; 2–3 screenshots opened; claims spot-checked
- [ ] Integrator merged `--no-ff`; all gates green in order; flakes reported with both runs
- [ ] Balance before and after recorded; anchors held or the miss logged with an owner
- [ ] Replay fixtures unchanged, or re-recorded on purpose with the diff reviewed
- [ ] Regression: a tap check for new controls, a fixture for new sheets, a door for new screens; SUITE.md updated
- [ ] en and ru strings; numbers through `fmtCount` / `fmtDecimal`; names through `heroName` / `placeName`; no NBSP; checked at 320 ru
- [ ] v6: no platform checks in game code; per-platform behaviour behind a core interface
- [ ] Matching player doc updated (`docs/GAMEPLAY.md`, `DESIGN_V2.md`, `DUELS.md`, `ITEMS.md`)
- [ ] Servers stopped; `dist/` and `shots/` removed; worktree and branch cleaned up
