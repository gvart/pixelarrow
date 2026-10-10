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
