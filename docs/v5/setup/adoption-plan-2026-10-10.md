# Adoption Plan

> **Generated**: 2026-10-10 (`/adopt full`, run autonomously)
> **Project phase**: Production (observed; `project.stage` is unset). The game is live (v4).
> **Engine**: not configured in `project.yaml`. The actual engine is Phaser 3.90 + TypeScript + Vite (`package.json`); the Phaser 4 decision is open (V5-005).
> **Template version**: v1.0+ (framework 1.1.3 per `project.yaml`)
> **Location note**: the skill's default path is `docs/adoption-plan-[date].md`. This plan lives in `docs/v5/setup/` because the S0-SETUP story owns only `docs/v5/setup/` and `design/` (see ANSWERS Q-ADOPT-4).

## Audit summary

```
Phase detected: Production (no project.stage, no production/stage.txt)
Engine: NOT CONFIGURED (project.yaml has no engine block; technical-preferences.md is [TO BE CONFIGURED])
GDDs audited: 0 (none exist in template format; legacy design lives in docs/*.md)
ADRs audited: 0 (docs/architecture/ does not exist)
Stories audited: 0 (production/ does not exist)
systems-index.md: written by this run's /map-systems, audited below

Gap counts:
  BLOCKING: 0
  HIGH:     5: unsafe to run /create-stories or /story-readiness
  MEDIUM:   7: quality degradation
  LOW:      3: optional improvements
```

Config resolved by `yaml-helper.sh resolve_config`:
- `modes.rigor: standard`, which gives `workflow: standard`, `review_mode: lean` and `docs.density: balanced`
- `modes.automation: autonomous`
- `automation_always_ask`: scope_changes, file_deletions, schema_changes (defaults)

**Review mode** resolves to `lean`, which comes from `modes.rigor` because nothing pins it. This run wrote no review mode (Phase 6b).

**v1.0 migration check (2g):** not needed. `project.yaml` exists at the framework root, and there is no `production/stage.txt`, no `production/review-mode.txt`, and no `technical-preferences.md` with real values, so `migrate-v1-config.sh` was not run.

### Format audit results

- **2a GDDs:** nothing to audit, so `gdd-structure-check.sh` was not run.
- **2b ADRs:** nothing to audit.
- **2c `design/gdd/systems-index.md`:** passes the blocking checks. It has no parenthetical Status values, and all 39 Status cells are `Not Started`, a valid value. The columns follow the template contract (`# / System Name / Category / Priority / Status / Design Doc / Depends On`). The adopt checklist also names a `Layer` column, which the template does not have; layers live in `## Dependency Map` and `## Recommended Design Order` (LOW-3).
- **2d Stories:** none.
- **2e Infrastructure:** every row is ABSENT:
  - TR registry and control manifest (HIGH)
  - engine reference docs (HIGH)
  - sprint status, stage and traceability matrix (MEDIUM)
- **2f Project config:** these are unconfigured in both `project.yaml` and `technical-preferences.md`:
  - `engine.*` (HIGH)
  - `naming.*` and `performance.*` (MEDIUM)
  - Forbidden Patterns and Allowed Libraries (LOW, empty by design)

Work through these steps in order. Check off each item as you complete it. Re-run `/adopt` at any time to check the remaining gaps.

---

## Step 1: Fix Blocking Gaps

None. No template skill will silently malfunction right now: there are no ADRs whose Status could be misread and no parenthetical index statuses.

---

## Step 2: Fix High-Priority Gaps

### H1. The engine is not configured
`engine.name`, `version`, `language`, `rendering` and `physics` are unset. ADR skills and engine-compatibility checks have nothing to check against. The code root still resolves to `src/` from the tree.
**Fix:** after the Phase 2 P4 spike decides 3.90 versus 4 (V5-005), run `/setup-engine`, or add an `engine:` block to `project.yaml`: Phaser, the chosen version, TypeScript, rendering `Phaser.AUTO` (WebGL with a Canvas fallback), and physics none (the battle sim is custom and `main.ts` configures no Phaser physics). This is the Director's write; S0-SETUP may write only `modes`.
**Time**: 5 min
- [ ] `engine.*` configured in `project.yaml`

### H2. No engine reference docs
`docs/engine-reference/<engine>/VERSION.md` is absent, so ADR engine checks are blind to post-cutoff API changes. This matters most if the project moves to Phaser 4.
**Fix:** `/setup-engine` creates it, or write it by hand from the Phaser docs via Context7 (the `phaser-core` skill targets Phaser 4.2).
**Time**: 30 min
- [ ] `docs/engine-reference/phaser/VERSION.md` created

### H3. No game concept
`design/gdd/game-concept.md` is missing. It is required at `standard`, and `/map-systems` has no source concept: the index cites the legacy docs instead.
**Fix:** Phase 2 VISION: `/brainstorm` with creative-director and game-designer, seeded from the legacy docs and the v5 brief.
**Time**: 1 session
- [ ] `design/gdd/game-concept.md` written; systems index "Source Concept" updated

### H4. No TR registry
There are no stable requirement IDs, so stories cannot be traced to requirements.
**Fix:** `/architecture-review` (Step 3a). It is only useful once GDDs and Foundation ADRs exist; on an empty design layer it would register nothing.
**Time**: 1 session
- [ ] `docs/architecture/tr-registry.yaml` created

### H5. No control manifest
There are no layer rules for stories.
**Fix:** `/create-control-manifest` (Step 3b), after H4.
**Time**: 30 min
- [ ] `docs/architecture/control-manifest.md` created

---

## Step 3: Bootstrap Infrastructure

Prerequisite (brownfield order): first write the Foundation ADRs (M2) and the GDDs for the MVP systems v5 changes (M1). The registry is built from them.

### 3a. Register existing requirements (creates tr-registry.yaml)
Run `/architecture-review`. Even when ADRs already exist, this run bootstraps the TR registry from the existing GDDs and ADRs.
**Time**: 1 session (the review can be long for a large codebase)
- [ ] tr-registry.yaml created

### 3b. Create control manifest
Run `/create-control-manifest`
**Time**: 30 min
- [ ] docs/architecture/control-manifest.md created

### 3c. Create sprint tracking file
Run `/sprint-plan update`. Optional while the Director tracks v5 in `docs/v5/PROGRESS.md` (see M4).
**Time**: 5 min
- [ ] production/sprint-status.yaml created

### 3d. Set authoritative project stage
Run `/gate-check production`, the gate into the phase the project is in.
**Time**: 5 min
- [ ] `project.stage` in `project.yaml` written (legacy `production/stage.txt` also updated)

---

## Step 4: Medium-Priority Gaps

### M1. GDDs for the built systems (39 systems, 0 GDDs)
At `standard`, a built system without a GDD is a gap. Retrofit only the systems v5 changes, just before their stories. Start with the MVP rows of `design/gdd/systems-index.md`: Orders and abilities, Formations, Bot AI, Battle input and controls, Battle simulation core, Save and migration.
**Fix:** `/design-system retrofit design/gdd/<system>.md`, or `/quick-design` for a v5 expansion. Use the legacy doc named in each index row as the source.
**Time**: 1 session each
- [ ] MVP GDDs (19) retrofitted, at least those v5 touches

### M2. Foundation ADRs are missing
Three decisions need ADRs:
- the determinism and replay contract (ROADMAP invariants 1–4)
- save schema versioning and migration (live players)
- the engine version (V5-005)

**Fix:** `/architecture-decision` for each.
**Time**: 30 min each
- [ ] ADR: determinism and replay contract
- [ ] ADR: save versioning and migration
- [ ] ADR: engine version (Phaser 3.90 versus 4)

### M3. `project.stage` is unset
Phase auto-detect is unreliable. It reads "Production", but the design artifacts look like Concept.
**Fix:** Step 3d.
- [ ] stage set

### M4. No `production/sprint-status.yaml`
**Fix:** Step 3c, or record that v5 tracking stays in `docs/v5/PROGRESS.md`.
- [ ] decided and done

### M5. No architecture traceability matrix
**Fix:** generated by `/architecture-review` (3a).
- [ ] `docs/architecture/requirements-traceability.md`

### M6. Naming conventions are not configured
The code already follows them: camelCase files, PascalCase `*Scene.ts` and `src/ui/mosaic` components.
**Fix:** `/settings naming.*` or the `naming:` block in `project.yaml`.
**Time**: 5 min
- [ ] naming configured

### M7. Performance budgets are not configured
The ROADMAP backlog has a target of 30 fps on a budget Android with 40 soldiers.
**Fix:** `/settings performance.*` (frame budget 33 ms at minimum, 16.6 ms target).
**Time**: 5 min
- [ ] performance budgets configured

---

## Step 5: Optional Improvements

### L1. Forbidden Patterns and Allowed Libraries are empty
Seed them from ROADMAP invariant 1: no Phaser, DOM, `Math.random`, clocks or storage in `src/sim` and the other pure modules.
- [ ] filled in `technical-preferences.md`

### L2. The catalog step `test-setup` expects `.github/workflows/tests.yml`
The tests run in `deploy.yml` (build, server, layout and smoke jobs). This is informational; no new workflow is needed.
- [ ] noted (no action)

### L3. The systems index has no `Layer` column
`/adopt` lists `Layer` as a minimum column, but `templates/systems-index.md` is the fixed contract and `/map-systems` forbids widening it. Layers are recorded in the Dependency Map instead.
- [ ] no action unless the template changes

---

## What to Expect from Existing Stories

No stories exist yet. Once v5 stories are created they will carry TR-IDs if Step 3 has run first.

---

## Re-run

Run `/adopt` again after completing Step 3 to verify that all blocking and high gaps are resolved. The new run will reflect the current state of the project.

---

## Phase 7: first action (autonomous)

There is no BLOCKING gap, so the first HIGH item is H1 (engine config). It is **deferred**: S0-SETUP may write only `modes` to `project.yaml`, and the engine version waits on the V5-005 spike. It is logged for the Director in `docs/v5/setup/ANSWERS.md`.
