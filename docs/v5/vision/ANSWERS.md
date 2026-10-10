# v5 vision: answers given for the user

Story S2-VISION. The user is asleep, so every question a skill asked was answered here by the agent acting as **creative director**. Each answer says which skill and step asked the question, what was answered and why. Project config: `rigor: standard`, `automation: autonomous` (V5-010), which resolves to workflow standard, review **lean** and docs balanced.

## /brainstorm

| Step | Question | Answer | Why |
| --- | --- | --- | --- |
| Tier branch | `workflow` tier? | **standard**, so I ran the full flow (Phases 1–6) and wrote `design/gdd/game-concept.md`, not the lean brief. | V5-010. |
| Existing work | Is there a concept to resume? | No `game-concept.md` or `game-pillars.md`. The base is the shipped game plus `systems-index.md` and the audits. | V5-007: the concept is written now, by this run. |
| Phase 1, emotional anchors | A moment that moved you? A fantasy never quite found? | The moment a line you placed holds against a charge, and the enemy line breaks where your flank hit it. The missing fantasy is a **strategos who reads the enemy and breaks a line**, on a phone in two minutes. Total War gives this only on PC, in 20-minute battles. | This is the core fantasy the brief says v5 keeps: formation tactics, morale breaks, flanking and javelins. |
| Phase 1, taste | Three games played most? | Total War: Rome (the line, the flank and the rout), Battle Brothers (named men, permadeath, a mercenary company), Into the Breach (readable intent, every turn a decision). | It's the triangle pixelarrow already sits in. |
| Phase 1, experience | Challenge, story, expression or relaxation? | **Challenge & Mastery**, with Fantasy second. | The loop is tactical. Stakes come from permadeath. |
| Phase 1, timeline | How long? | **Months**: v5 is one milestone of about 3–4 months for a solo developer with agents. | It's the size of the existing roadmap. |
| Phase 1, dev level | Where are you in your dev journey? | **Shipped before**: live game, live players, a server. | A fact. |
| Phase 1, creative brief | Is the brief right? | Yes (VISION.md, "Creative brief"). | — |
| Phase 2, concept pick | Which concept resonates? (The skill says this always asks, even in autonomous mode.) | **Combine elements across concepts.** Take A, "Read the line", as the spine, with B's mercenary campaign arc and C's touch-command layer. Reject a PvP-first pivot. | The user is asleep and the brief already fixes the direction ("keep the core loop, go deeper"). The exemption exists because creative direction can't be chosen by algorithm. Here the brief chose it, and I record the pick so the user can overturn it. |
| Phase 3, core action feel | Primary feel? | **A weighty, readable clash**: slow approach, a hard impact, a visible morale swing. | The playtest's best moments were the drag snapping into a line and the auto-pause on a rout. |
| Phase 3, key dimension | Most important design variable? | **Decisions per battle**: a real decision every 10–15 s across a 60–120 s battle. | PLAY measured about 4 decisions per campaign battle. That's the number to raise. |
| Phase 4, pillars | Lock these in? | **[A] Lock these in.** Autonomous mode: no second round, logged here. | — |
| Phase 4, gates | CD-PILLARS and AD-CONCEPT-VISUAL? | **Skipped (lean review mode).** I am the CD for this run anyway. The visual anchor is taken from the shipped v4 "Mosaic & Parchment" direction (pixel field, painted chrome) and the UI audit's rule: pixel art only on the map and field. | The skill skips both gates in lean mode. The art bible is a parallel Phase 2 story (ART+UX). |
| Phase 5 | Player types? | Primary: **Achievers who like mastery** (a tactics fan on a phone). Secondary: Competitors (duels, war). Not for: RTS APM players or idle-game players. | — |
| Phase 6, platform | Platform? | **Web / Browser** (Telegram Mini App, mobile portrait). | A fact. |
| Phase 6, engine | Which engine? (The skill always asks this.) | **Phaser 3.90 (existing).** The v4 question belongs to V5-005 and the P4 spike, not to this skill. | It's a live codebase, so the engine is not a creative choice here. I record it instead of asking. |
| Phase 6, gates | TD-FEASIBILITY and PR-SCOPE? | **Skipped (lean review mode).** The feasibility facts come from MECHANICS.md §1.11–§3 (server replay, determinism, Phaser 4 risk). Scope is recorded as **not assessed by a producer**. | The skill skips both gates in lean mode. The skill-authoring rule says a skipped gate must say so, so it does. |
| Write approval | Write `game-concept.md`? | **[A] Yes.** | V5-007 names the path. |

## /quick-design (one run per expansion GDD, plus controls and readability)

| Step | Question | Answer | Why |
| --- | --- | --- | --- |
| Output path | The skill writes to `design/quick-specs/[name]-[date].md`. | The brief overrides it: the GDDs go to **`design/gdd/<system>.md`**. | The brief names the destination. The quick-design structure (classification, context scan, rules, knobs, acceptance criteria) is kept. |
| 1, classify | Tuning, Tweak, Addition, New Small System, or redirect to /design-system? | Classified per GDD in its header. AI doctrines, formations and orders, abilities and field works are **Additions** to existing systems (#10, #4/#7, #7/#16, #5). Campaign events is a **New Small System** (it grows #19). Campaign arc and controls are **[F] too large**: I recorded it, but kept quick-design depth, because the brief asks for /quick-design and V5-006 prefers a lean retrofit. Each such GDD is flagged "candidate for /design-system before its epic starts". | Honesty over fit. The flag is a follow-up for the Director. |
| 1, sections | Which template? | The skill's New Small System trims Player Fantasy and Formulas. The brief and `workflow: standard` require Overview, Rules, Edge Cases, Dependencies, Acceptance Criteria, plus Formulas where there are numbers. Every GDD carries those, plus the brief's **Touch UI**, **Online and server impact**, **Save impact** and **Balance targets** sections. | The standard tier's required set, plus the brief. |
| 2, context scan | GDD found? | None of these systems has a GDD. The legacy docs and audit IDs are used as the GDD reference. No prior quick-specs (`design/quick-specs/` does not exist). | — |
| 4, approval | Approve, revise or redirect? | **[A] Approve** for each, after one self-review pass against the pillars and the audit IDs it claims to fix. | Autonomous mode. |
| 4, GDD update | Update an existing GDD? | None exist. The legacy docs (GAMEPLAY.md and others) are **not** edited, because the brief says no code changes and the GDDs supersede them for v5. `/propagate-design-change` is for the implementation stories. | — |
| Registry | Add the new cross-system entities to `design/registry/entities.yaml`? | **Yes.** It's created by this story, since /consistency-check needs it. | The systems-designer's registry rule. |

## /review-all-gdds

| Step | Question | Answer |
| --- | --- | --- |
| Focus | full, consistency or design theory? | **full**. |
| Phases 2 and 3 | Spawn parallel `game-designer` sub-agents? | Yes, two parallel reviewers: consistency (2a–2f) and holism (3a–3g). The `game-designer` subagent type isn't registered in this session, so they run as general-purpose agents told to act from `$F/.claude/agents/game-designer.md`. |
| Report path | The skill writes `design/gdd/gdd-cross-review-*.md`. | The brief names **`docs/v5/vision/GDD_REVIEW.md`**, and the brief wins. |
| Don't make design decisions | The skill says flag, don't decide. | As acting CD I **do** decide, because the brief says "fix the findings". Each fix is listed in GDD_REVIEW.md with the option chosen. |

## /consistency-check

| Step | Question | Answer |
| --- | --- | --- |
| Registry | `design/registry/entities.yaml` is missing. | Created by this story from the cross-GDD constants, so the check has something to compare. The verdict says it's a **first-population** run. |
| Phase 6 | Update the registry, and log conflicts to `docs/consistency-failures.md`? | Registry: yes. Conflicts found and fixed are logged in GDD_REVIEW.md, and **also** appended to `docs/consistency-failures.md`, as the skill asks. |
| Phase 7 | Breadcrumb in `production/session-state/active.md`? | **Skipped**: V5-009 keeps tracking in `docs/v5/PROGRESS.md`, and the Director owns that file. |
