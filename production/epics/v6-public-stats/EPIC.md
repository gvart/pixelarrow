# Epic: Public stats API (ADR-0010)

> **ID**: v6-public-stats (stories V6-STATS-NN)
> **Layer**: Feature
> **GDD / spec**: design/gdd/systems-index.md #50; brief Goal 2; docs/v6/landing/STRUCTURE.md §5
> **Architecture Module**: server/migrations/0019, server/src/public/**, PublicApi entrypoint in server/src/index.ts, landing/worker proxy
> **Status**: Ready
> **Engine Risk**: LOW
> **Manifest Version**: docs/v6/plan/CONTROL_MANIFEST_ACCOUNTS.md "Public stats API"
> **Stories**: 3, below; schedule in `docs/v6/plan/SPRINTS.md`
> **Estimate**: 5.5 agent-days expected (sum of story expected values; not calibrated, no sprint history)
> **Created**: 2026-10-13 by P3-PLAN (`/create-epics`, `/create-stories`, `/estimate`)

## Overview

Real numbers for the landing page with no personal data beyond display names: a cron-built snapshot in D1, a single read-only endpoint with edge-friendly caching and rate limits, and the landing proxy calling the PublicApi RPC entrypoint with a last-good fallback.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0010: Public stats API | One snapshot built by the 5-minute cron; one read-only endpoint; RPC entrypoint for the landing; no ids; boards under 3 left empty. | LOW |
| ADR-0007: Hosting | Landing proxy and service binding. | MEDIUM |
| ADR-0009: Display names | display_name, public_boards, deleted_at filters. | LOW |

## Requirements

*There is no `docs/architecture/tr-registry.yaml`; the IDs below are v6 requirement references traced to the brief, the decisions and the specs. At `standard` rigor untraced non-Foundation rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-v6-stats-001 | Public, read-only, cached, rate-limited stats and leaderboards | ADR-0010 |
| TR-v6-stats-002 | No personal data beyond public display names | ADR-0010 §5, ADR-0009 |
| TR-v6-stats-003 | Never invented numbers; empty state while few players | ADR-0010 §2 |

## Stories

| # | Story | Type | Status | Sprint | Est. days (E) | Depends on |
|---|-------|------|--------|--------|---------------|------------|
| V6-STATS-01 | The snapshot: migration 0019, buildPublicSnapshot on the cron, read-only duel tops, monotonic counters, strict schema | Logic | Ready | S7 | 2.5 | V6-LINK-01 |
| V6-STATS-02 | The endpoint: GET/HEAD /api/public/v1/summary, caching headers, RL_PUBLIC_IP, the PublicApi RPC entrypoint | Integration | Ready | S8 | 1.5 | V6-STATS-01, V6-ACCT-04 |
| V6-STATS-03 | Landing proxy on the real entrypoint: two-Worker local run, cookie isolation check and the summary fixture | Integration | Ready | S9 | 1.5 | V6-STATS-02, V6-HOST-01 |

## Definition of Done

This epic is complete when:
- every story is implemented, reviewed by the Director against its "Skills applied" section, merged into `v6` by an integrator with every gate green, and closed with `/story-done`;
- every acceptance criterion above is checked with evidence (tests, gate output, screenshots in `docs/v6/shots/<story>/`);
- no story added a platform check to game code or grew the boundary allowlist (brief review gate);
- auth, account, linking, deletion, rate-limit and public-API stories passed `/security-audit` before merge.

## Story details

### V6-STATS-01: The snapshot: migration 0019, buildPublicSnapshot on the cron, read-only duel tops, monotonic counters, strict schema

| Field | Value |
| --- | --- |
| Goal | The snapshot: migration 0019, buildPublicSnapshot on the cron, read-only duel tops, monotonic counters, strict schema. |
| Type | Logic |
| Sprint and port slot | S7 · slot 4 (ports 6140–6149, V6-002) |
| Estimate | 2.5 d expected (2–3.5); confidence Medium |
| Depends on | V6-LINK-01 |
| Governing ADRs and specs | ADR-0010 §2 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/network-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- server/migrations/0019_public_stats.sql
- server/src/public/{snapshot,schema,duelTop}.ts (new)
- server/src/index.ts (cron step line)
- server/test/public*.test.ts (new)

**Shared files touched** (see SPRINTS.md "Shared files"): `server/src/index.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/security-audit/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/performance-optimization/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] The strict zod `PublicSummaryV1` rejects unknown keys; the body is ≤ 32 KB with ≤ 10 rows per board and ≤ 5 champions per kind.
- [ ] Deleted, banned and opted-out players are absent from boards (still counted in totals); boards under 3 rows are `[]`.
- [ ] Counters stay monotonic across a prune; `publicDuelTop` performs no writes (D1 spy).
- [ ] A recursive scan finds no seeded player id, Telegram id or email in the snapshot.
- [ ] Gates: G-SERVER, G-SEC (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-STATS-02: The endpoint: GET/HEAD /api/public/v1/summary, caching headers, RL_PUBLIC_IP, the PublicApi RPC entrypoint

| Field | Value |
| --- | --- |
| Goal | The endpoint: GET/HEAD /api/public/v1/summary, caching headers, RL_PUBLIC_IP, the PublicApi RPC entrypoint. |
| Type | Integration |
| Sprint and port slot | S8 · slot 4 (ports 6140–6149, V6-002) |
| Estimate | 1.5 d expected (1–2); confidence High |
| Depends on | V6-STATS-01, V6-ACCT-04 |
| Governing ADRs and specs | ADR-0010 §1, §3–§5 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/network-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- server/src/public/routes.ts (new)
- server/src/index.ts (route, PublicApi export)
- wrangler.jsonc (RL_PUBLIC_IP 6003)
- server/src/env.ts
- server/test/**

**Shared files touched** (see SPRINTS.md "Shared files"): `server/src/index.ts`, `wrangler.jsonc`, `server/src/env.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/security-audit/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/performance-optimization/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] A D1 spy shows only the single `SELECT` on the request path; no session middleware, cookies or CORS headers.
- [ ] Headers: `public, max-age=60, s-maxage=300, stale-while-revalidate=600`, ETag with 304, nosniff; 405, 429 and the 503 warming case tested.
- [ ] `PublicApi.summary()` returns the same row; `npx wrangler deploy --dry-run` passes.
- [ ] Gates: G-SERVER, G-DRYRUN, G-SEC (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-STATS-03: Landing proxy on the real entrypoint: two-Worker local run, cookie isolation check and the summary fixture

| Field | Value |
| --- | --- |
| Goal | Landing proxy on the real entrypoint: two-Worker local run, cookie isolation check and the summary fixture. |
| Type | Integration |
| Sprint and port slot | S9 · slot 3 (ports 6130–6139, V6-002) |
| Estimate | 1.5 d expected (1–2); confidence High |
| Depends on | V6-STATS-02, V6-HOST-01 |
| Governing ADRs and specs | ADR-0010 §3–§4, ADR-0007 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/network-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- landing/worker/index.ts
- landing/wrangler.jsonc
- landing/scripts/proxy-e2e.mjs (new)
- landing/src/fixtures/summary.v1.json (new, generated by a server test)
- server/test/public-fixture.test.ts (new)

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/security-audit/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/performance-optimization/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] `wrangler dev -c wrangler.jsonc -c landing/wrangler.jsonc` on the story's ports: the second call is a cache hit, a stopped game Worker gives the last-good copy, then 503 with none.
- [ ] `__Host-pa_sid` never reaches the landing host; `/?startapp=clan_x` answers 302 to play.
- [ ] The fixture is produced from the server schema so the landing builds against the real shape.
- [ ] Gates: G-SERVER, G-LAND (build), G-DRYRUN, G-SEC (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").
