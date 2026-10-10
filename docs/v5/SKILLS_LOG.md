# v5 Skills log

| Story | Agent | Skills applied (reported) | Director check |
| --- | --- | --- | --- |
| S0-SETUP | setup (producer, technical-director) | adopt: a 7-phase audit with severity-graded gaps; project-stage-detect: ran artifact-check.sh and set CONCERNS confidence; map-systems: dependency layers, bottlenecks, cycles (battle↔ai/myth/powers) | OK: outputs match the skills, docs only |
| S1-AUDIT-MECH | audit-mech (systems-designer, economy-designer) | balance-check: targets from GAMEPLAY/ITEMS, worst-finding verdict; game-ai: FSM vs utility, fixed timers exploitable; rpg: lasting flags, quest state machine, save versions | OK |
| S1-AUDIT-UI | audit-ui (ux-designer, accessibility-specialist) | ux-review: Standard tier assumed, entry/exit and empty/error states; game-ui-ux: safe area and scaling at 3 sizes, screen stack and dead ends; a11y: 4.5:1, no colour-only state | OK: 2 shots spot-checked, they match |
| S1-AUDIT-PLAY | audit-play (qa-tester, game-designer) | playtest-report: template and routing; input-systems: touch, mistaken input, undo/confirm checks; game-feel: small/medium/large feedback tiers, shake and hit-stop on impact only | OK: 1 shot spot-checked (B2 confirmed) |
| S2-VISION | vision (creative-director, game-designer, systems-designer) | brainstorm: 3 directions merged, loops at every scale, pillars with design tests, anti-pillars; quick-design: rules, knobs with ranges, AC, touch/server/save/balance sections; review-all-gdds and consistency-check: reviewer agents found 4 blocking issues, fixes in progress | Sent back once for the incomplete review |
| S4-FIX-SAVES | fix-saves (gameplay-programmer) | save-systems: atomic writes, backup slot, migration chain, refuse newer saves, fail loudly; tdd: a failing test first for each bug; dev-story: rule documented in GAMEPLAY.md | OK: 2 shots spot-checked; the integrator proved legacy-save loading |
| S2-UX-IA | ux-ia (ux-designer, accessibility-specialist) | ux-design: full specs for core screens, HUD zones, no silent drops; game-ui-ux: screen stack, safe areas, event HUD; ux-review: independent review, 12 blocking fixed; a11y: single-tap alternatives | OK |
| S4-SIM-VERSION | sim-version (network-programmer, lead-programmer) | architecture-decision: ADR-0001; tdd: through the HTTP endpoints; security-audit: bounded zod input; backward-compatible clients | OK |
| Phase 3 plan | planner (producer, technical-director) | create-epics: one epic per module, in layer order; create-stories: 2–4 ACs plus gate codes, ADR per story; sprint-plan: Must/Should/Nice, 20% buffer; scope-check: PASS 0% creep; estimate: 3-point; router: skills per discipline | OK: wave disjointness verified by script |
| S4-FIXER-1 | fixer-1 (qa-tester, accessibility-specialist) | smoke-check (automated part only); a11y: 22 testable requirements with verify lines | OK |
| S4-P4-UPGRADE | p4-spike (technical-director, engine-programmer) | phaser-core: check the version, v4 rebuilt the renderer; architecture-decision: ADR-0003 (Rejected); performance-optimization: measure, alternate runs, revert unproven pre-warm | OK: the gate made the decision |
| IN-01 | in-01 (gameplay-programmer, lead-programmer) | input-systems: input separated from actions, gesture events only; phaser-core: per-run state reset in create (3.90 API); architecture-decision: ADR-0004; tdd: pure hit-test tested first | OK: 1 shot spot-checked |
| ST-01 | st-01 (network-programmer, lead-programmer) | architecture-decision: ADR-0001 cutover steps; security-audit: rule-shopping risk found (D2); tdd: mutated the frozen copy to prove the gate fires | Sent back once for V5-033 (backward compatibility) |
| LF-01 | lf-01 (per story) | tdd: one failing test per bug; bug-report: PLAY repro replayed; game-ui-ux: pure HUD rules, 390/360 en+ru; phaser-core: clocks reset in create | OK: 1 shot spot-checked |
| ST-03 | st-03 (per story) | security-audit: bounded zod, found the orb crash; balance-check: identical before and after; network-programmer: backward-compatible messages | OK |
| ST-02 | st-02 (per card) | save-systems: refuse newer saves, one migration per version, a fixture per version; architecture-decision: ADR-0002; tdd | OK: found the old-client wipe risk |
| FO-01 | fo-01 (per card) | tdd through orders and the hash; balance-check: each value vs its GDD target, misses named; team-combat edge cases; values kept in RULES | OK |
| ST-02b | st-02b | tdd, save-systems, security-audit (atomic guard, bounded v), network-programmer | OK after one clarification |
| AI-01 | ai-01 (ai-programmer, per card) | game-ai: decision separate from motion, doctrine as data; balance-check: every value vs target, misses named; tdd | OK: misses accepted (V5-037-style) |
| ST-02c | st-02c | save-systems: backups, never overwrite without a choice; tdd: red first | OK |
| LF-02 | lf-02 (economy-designer, gameplay-programmer) | quick-design: practice-fight GDD first; balance-check: loot columns before and after; tdd: 40-repeat test | OK |
| S4-FIXER-2 | fixer-2 | tdd; security-audit: bounded to existing, unexpired tickets; network-programmer | OK |
