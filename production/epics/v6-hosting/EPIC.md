# Epic: Hosting split and landing package scaffold (ADR-0007, ADR-0011)

> **ID**: v6-hosting (stories V6-HOST-NN)
> **Layer**: Foundation
> **GDD / spec**: design/gdd/systems-index.md #51 Landing site (hosting part); brief Goal 1
> **Architecture Module**: wrangler.jsonc, landing/ (package, worker, wrangler config), server/src/index.ts (CORS, headers), .github/workflows/deploy.yml, ops docs
> **Status**: Ready
> **Engine Risk**: MEDIUM (wrangler features unverified by docs: gated by `wrangler deploy --dry-run` on both configs)
> **Manifest Version**: docs/v6/plan/CONTROL_MANIFEST_PLATFORM.md "Hosting and server" (2026-10-13)
> **Stories**: 3, below; schedule in `docs/v6/plan/SPRINTS.md`
> **Estimate**: 4.5 agent-days expected (sum of story expected values; not calibrated, no sprint history)
> **Created**: 2026-10-13 by P3-PLAN (`/create-epics`, `/create-stories`, `/estimate`)

## Overview

Splits the one-domain setup into the game on play.pixelarrow.app and a new landing Worker on the apex, without deploying anything. It scaffolds the `landing/` package (Astro, its Worker, its wrangler config and Worker tests), moves the legal pages into it, points the game Worker, CORS, framing and links at play, rewires CI so each site builds and deploys on its own, and fixes the leftover single-domain docs (V6-013). Every story that changes a wrangler config passes `wrangler deploy --dry-run` (V6-012).

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0007: Two Workers for pixelarrow.app and play.pixelarrow.app | Game Worker on play with its API; a separate landing Worker for the apex, www, legal pages, the startapp redirect and the stats proxy. | MEDIUM |
| ADR-0011: Landing stack and budget | Astro static `landing/` package with its own build and Worker. | MEDIUM |
| ADR-0010: Public stats API | The proxy calls the PublicApi RPC entrypoint; cache and last-good rules. | LOW |

## Requirements

*There is no `docs/architecture/tr-registry.yaml`; the IDs below are v6 requirement references traced to the brief, the decisions and the specs. At `standard` rigor untraced non-Foundation rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-v6-host-001 | pixelarrow.app = landing, play.pixelarrow.app = game for web and Telegram | ADR-0007 |
| TR-v6-host-002 | Each site builds and deploys on its own; never deploy in this run | ADR-0007, brief |
| TR-v6-host-003 | Cookies host-only on play; CORS list; play framable by web.telegram.org | ADR-0007 |
| TR-v6-host-004 | Update deploy.yml, wrangler config, bot links, README and docs/OPS.md | ADR-0007 |
| TR-v6-host-005 | Single-domain text in ROADMAP, README, OPS.md fixed | V6-013 (no ADR needed) |

## Stories

| # | Story | Type | Status | Sprint | Est. days (E) | Depends on |
|---|-------|------|--------|--------|---------------|------------|
| V6-HOST-01 | Landing package scaffold: Astro package, landing Worker with the proxy and redirects, legal pages moved, dry-run gate | Integration | Ready | S1 | 2 | None |
| V6-HOST-02 | Game Worker on play: routes and vars, CORS, frame-ancestors, the Origin-check scaffold, and play links everywhere | Integration | Ready | S2 | 1.5 | None |
| V6-HOST-03 | CI split and the single-domain doc fixes: deploy.yml changes/landing jobs, README, OPS.md, ROADMAP, cutover owner actions | Config/Data | Ready | S3 | 1 | V6-HOST-01, V6-HOST-02 |

## Definition of Done

This epic is complete when:
- every story is implemented, reviewed by the Director against its "Skills applied" section, merged into `v6` by an integrator with every gate green, and closed with `/story-done`;
- every acceptance criterion above is checked with evidence (tests, gate output, screenshots in `docs/v6/shots/<story>/`);
- no story added a platform check to game code or grew the boundary allowlist (brief review gate);
- auth, account, linking, deletion, rate-limit and public-API stories passed `/security-audit` before merge.

## Story details

### V6-HOST-01: Landing package scaffold: Astro package, landing Worker with the proxy and redirects, legal pages moved, dry-run gate

| Field | Value |
| --- | --- |
| Goal | Landing package scaffold: Astro package, landing Worker with the proxy and redirects, legal pages moved, dry-run gate. |
| Type | Integration |
| Sprint and port slot | S1 · slot 3 (ports 6130–6139, V6-002) |
| Estimate | 2 d expected (1.5–3); confidence Medium |
| Depends on | None |
| Governing ADRs and specs | ADR-0007 (primary), ADR-0011, ADR-0010 §3–§4 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/devops-engineer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- landing/** (new: package.json with exact pins ≥ 2 weeks old, lockfile, astro.config.mjs, src/pages/index.astro placeholder, worker/index.ts, wrangler.jsonc, worker tests)
- public/terms.html, public/privacy.html, public/refunds.html, public/ru/** (moved to landing/public/ at the same paths)

**Shared files touched** (see SPRINTS.md "Shared files"): `landing/package.json`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/security-audit/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/performance-optimization/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] `landing/wrangler.jsonc`: name `pixelarrow-landing`, `main: worker/index.ts`, assets `./dist` with `404-page` and `run_worker_first: ["/api/public/*", "/"]`, apex and www custom domains, `services` GAME with `"entrypoint": "PublicApi"`, `RL_LANDING_PUBLIC` (namespace 6004), observability on.
- [ ] Worker tests (workerd, stub GAME): cache hit, miss, last-good with `X-Stale: 1`, 503 with no copy, 429 on a cache miss over the limit, 405 for non-GET, `/?startapp=x` and `/?tgWebAppStartParam=x` 302 to play with the query kept, `frame-ancestors 'none'`.
- [ ] The placeholder `index.html` carries the inline hash redirect for `tgWebApp` launches.
- [ ] `npm run build` in `landing/` passes and `landing/dist` contains no file from the game build.
- [ ] `npx wrangler deploy --dry-run --config landing/wrangler.jsonc` (the wrangler pinned in server/) passes; nothing is deployed.
- [ ] Legal pages answer at the same paths from `wrangler dev` of the landing config on the story's ports.
- [ ] Gates: G-LAND (build only), G-DRYRUN, G-SEC (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-HOST-02: Game Worker on play: routes and vars, CORS, frame-ancestors, the Origin-check scaffold, and play links everywhere

| Field | Value |
| --- | --- |
| Goal | Game Worker on play: routes and vars, CORS, frame-ancestors, the Origin-check scaffold, and play links everywhere. |
| Type | Integration |
| Sprint and port slot | S2 · slot 2 (ports 6120–6129, V6-002) |
| Estimate | 1.5 d expected (1–2.5); confidence Low |
| Depends on | None |
| Governing ADRs and specs | ADR-0007 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/devops-engineer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- wrangler.jsonc (routes, vars GAME_URL, LANDING_URL, header comment)
- server/src/index.ts (CORS list, frame-ancestors header)
- server/src/middleware.ts (Origin-check scaffold)
- server/src/online/clans.ts and server/src/notify/outbox.ts (fallback URLs)
- server/scripts/bot-setup.mjs (webhook URL)
- src/online/rules.ts (invite fallback)
- server/.dev.vars.example (dev origins)
- server/test/{notify,online-social,payments}.test.ts, tests/deeplink.test.ts, a new headers test

**Shared files touched** (see SPRINTS.md "Shared files"): `wrangler.jsonc`, `server/src/index.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/security-audit/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] CORS allows only `https://play.pixelarrow.app`, `https://web.telegram.org` and dev origins from `.dev.vars`; never `access-control-allow-credentials`; the apex is refused (test).
- [ ] Every HTML response from play carries `frame-ancestors 'self' https://web.telegram.org` and no `X-Frame-Options` (test).
- [ ] A cookie-authenticated cross-origin POST is refused with 403 by the scaffold (test; finished in V6-ACCT-02).
- [ ] Bot webhook, invite and notification fallbacks use play; legal links use `LANDING_URL` (tests updated).
- [ ] `npx wrangler deploy --dry-run` on `wrangler.jsonc` passes.
- [ ] Gates: G-CODE, G-SERVER, G-DRYRUN, G-SEC (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-HOST-03: CI split and the single-domain doc fixes: deploy.yml changes/landing jobs, README, OPS.md, ROADMAP, cutover owner actions

| Field | Value |
| --- | --- |
| Goal | CI split and the single-domain doc fixes: deploy.yml changes/landing jobs, README, OPS.md, ROADMAP, cutover owner actions. |
| Type | Config/Data |
| Sprint and port slot | S3 · no server (no port slot) |
| Estimate | 1 d expected (0.5–1.5); confidence Medium |
| Depends on | V6-HOST-01, V6-HOST-02 |
| Governing ADRs and specs | ADR-0007 "Build and deploy each site on its own", "Cutover" |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/devops-engineer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- .github/workflows/deploy.yml (changes job, target input, landing-build, landing-deploy)
- README.md
- server/README.md
- docs/OPS.md
- docs/ROADMAP.md ("Agreed architecture")
- docs/v6/OWNER_ACTIONS.md (append the cutover steps 1–4, www rule, HSTS, BotFather, setWebhook)

**Shared files touched** (see SPRINTS.md "Shared files"): `.github/workflows/deploy.yml`, `docs/v6/OWNER_ACTIONS.md`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/release-checklist/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/launch-checklist/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] A `changes` job sets `game` and `landing` from the paths in ADR-0007; `workflow_dispatch` takes `target: game | landing | both`.
- [ ] `landing-deploy` needs `[changes, landing-build, deploy]` with the ADR's `if:` so a landing-only change never waits on or triggers a game deploy; one `concurrency: deploy` group.
- [ ] A table in NOTES.md shows which jobs run for three sample change sets (game only, landing only, both). The YAML parses (actionlint if installed). Nothing is run remotely.
- [ ] README, server/README, OPS.md and ROADMAP describe two hosts; no "Mini App at pixelarrow.app" text remains outside the legal pages (owner sign-off, OWNER_ACTIONS).
- [ ] Gates: G-DOCS (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").
