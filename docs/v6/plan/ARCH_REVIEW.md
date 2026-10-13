# v6 architecture review (ADR-0006 to ADR-0012)

> **Date**: 2026-10-13 · **Story**: P3-PLAN · **Skill**: `/architecture-review full` (autonomous, review mode lean), in the lead-programmer and producer roles
> **Engine**: Phaser 3.90 + TypeScript + Vite (ADR-0003 Rejected the Phaser 4 upgrade, so 3.90 stays pinned); Cloudflare Workers with wrangler ^4.148; Astro 7 for the landing
> **ADRs reviewed**: 7 v6 ADRs (0006–0012) plus the v5 ADRs they depend on (0002, 0003, 0004, 0005)
> **Requirement sources**: there is no `docs/architecture/tr-registry.yaml` and no v6 GDDs. Requirements come from the brief (Goals 1–9 and the hard constraints), DECISIONS V6-009..020, the audits, and the specs design/ux/{input,accounts,landscape}-v6.md and docs/v6/landing/*.
> **Verdict: CONCERNS.** No blocking conflict remains. Every brief goal is covered by an Accepted ADR or an accepted spec, except the responsive scale policy, which has an accepted UX spec (V6-020) but no ADR yet (ADR-0013 is the first task of V6-RFND-01). Three integration conflicts stay open with a named owner story. The engine reference and the architecture document are NOT ASSESSED.

## 1. Traceability matrix

| # | Requirement (source) | ADR / spec | Coverage | Epic and stories |
| --- | --- | --- | --- | --- |
| R1 | Two sites on one domain; game at play for web and Telegram, platform detected at runtime (Goal 1) | ADR-0007; ADR-0006 detection | ✅ | v6-hosting HOST-01..03; PLAT-01 |
| R2 | Update deploy.yml, wrangler, bot links, README, OPS.md; never deploy (Goal 1, constraints) | ADR-0007 | ✅ | HOST-02, HOST-03; G-DRYRUN |
| R3 | Landing: dark, parallax, scroll-driven, micro-interactions, studio quality (Goal 2) | ADR-0011 + V6-015 amendments | ✅ | v6-landing LAND-01..06 |
| R4 | Gameplay videos, webm + mp4 with posters (Goal 2) | ADR-0011 clip budget | ✅ | LAND-02, 03, 05 (clips from the video agent) |
| R5 | Gemini key art matched to the game (Goal 2) | ART_DIRECTION.md, V6-019 (no ADR needed) | ⚠️ spec only | LAND-01 moves assets in; LAND-02 |
| R6 | Live stats and leaderboards from a public, read-only, cached, rate-limited API; no personal data beyond display names (Goal 2) | ADR-0010, ADR-0009 §6 | ✅ | v6-public-stats STATS-01..03; LAND-04 |
| R7 | CTAs, sections, FAQ, privacy, footer; English only; SEO basics (Goal 2) | ADR-0011; STRUCTURE.md | ✅ | LAND-01, 03, 05, 06 |
| R8 | 320 px to 4K, lazy media, reduced motion, no CLS, Lighthouse budget (Goal 2) | ADR-0011 | ✅ | GATE-03, LAND-06, QA-03 |
| R9 | True landscape layouts for tablets and laptops for every screen; tablet portrait; phones portrait-first (Goal 3) | design/ux/landscape-v6.md (V6-020); ADR-0005 | ⚠️ no ADR (gap G1) | v6-responsive-foundation RFND-01..04; v6-responsive-screens RSCR-01..11 |
| R10 | Mouse and keyboard: hover, right-click, wheel zoom, focus navigation, battle hotkeys, rebinding with conflicts per device, only with a keyboard (Goal 3) | ADR-0012 (amends ADR-0004), ADR-0006 InputHints | ✅ | v6-input INP-01..06; RFND-04 (wheel) |
| R11 | Platform layer: neutral interfaces, one adapter per platform, detected once, no `if (telegram)` in game code, adapters tested on their own (Goal 4) | ADR-0006 | ✅ | v6-platform-layer PLAT-01..07; PAY-01 (M7) |
| R12 | Email and password accounts, verification and reset through Cloudflare email, slow hash, cookie sessions, rate limits (Goal 5) | ADR-0008 | ✅ (iteration count pending the spike) | v6-accounts ACCT-01..07 |
| R13 | Linked accounts, one player id, several log-in methods (Goal 6) | ADR-0009 §1–§5 | ✅ | v6-linking-privacy LINK-01..06 |
| R14 | Payments interface; Telegram keeps Stars; web "coming soon"; provider-ready without touching the shop or grants (Goal 7) | ADR-0006 Payments | ✅ | v6-payments PAY-01, PAY-02 |
| R15 | Turnstile on sign-up and log-in; per-IP and per-account limits; verified before online play (Goal 8) | ADR-0008 §5–§7 | ✅ | ACCT-04, ACCT-05 |
| R16 | Privacy notice and in-app deletion, linked from sign-up, Settings and the landing footer (Goal 9) | ADR-0009 §7–§8 | ✅ (legal text needs owner sign-off) | LINK-04, LINK-02, LINK-07; LAND-01 footer |
| R17 | Public names not Telegram data (V6-011) | ADR-0009 §6 | ✅ | LINK-01 |
| R18 | Screen matrix in layout-check and screenshots (constraint) | landscape-v6.md §5 (tooling, no ADR needed) | ✅ | GATE-01, RFND-03 |
| R19 | Every new in-game string in EN and RU; landing English only (constraint) | ADR-0006 guideline; accounts-v6.md §13.6 | ✅ | all UI stories (G-SHOTS en and ru) |
| R20 | Security: ADR, workerd tests and /security-audit for auth, accounts, linking, deletion, rate limits, public API; no secrets in the repo (constraint) | ADR-0008/0009/0010; CONTROL_MANIFEST_ACCOUNTS | ✅ | G-SEC on every such story; QA-04 |
| R21 | Guest play on the web with no account wall (V6-017) | accounts-v6.md (no ADR needed) | ⚠️ spec only | ACCT-07 |

**Summary:** 21 requirements · ✅ 17 covered by Accepted ADRs · ⚠️ 4 covered by accepted specs only (R5, R9, R21 need no ADR; R9 needs one, see G1) · ❌ 0 with no coverage.

## 2. Gaps

- **G1 (responsive scale policy, MEDIUM).** The size classes, the whole-number S per class, the UIMetrics contract and the content caps (landscape-v6.md §1–§2) change ADR-0005's `uiMetrics`, an architectural contract every scene reads. The spec is accepted (V6-020) but there is no ADR. **Action:** V6-RFND-01 writes ADR-0013 with `/architecture-decision` before code, amending ADR-0005.
- **G2 (architecture document, NOT ASSESSED).** `docs/v6/ARCHITECTURE.md` (ADOPT.md step 6) does not exist, so Phase 6 of the skill could not run. The ADRs and the two control manifests carry the module boundaries. Proposed for QA-05 or a later docs story; it does not block the plan.
- **G3 (engine reference, NOT ASSESSED).** No `docs/engine-reference/` or engine config (ADOPT.md Q4, V6-007). Context7 was unavailable for ADR-0006, 0007 and 0012; their APIs are verified by tests, the 3.90 typings in `node_modules`, and `wrangler deploy --dry-run` (V6-012).

## 3. Cross-ADR conflicts

### Fixed in this story (doc inconsistencies)

| ID | Between | Type | What was wrong | Fix |
| --- | --- | --- | --- | --- |
| C-01 | ADR-0006 with itself; CONTROL_MANIFEST_PLATFORM | Dependency | "M1 to M10 land in order" vs "M6 and M7 pair with the accounts and payments stories; M9 with the sign-in UI" | Clarified order in ADR-0006 and the manifest: M1–M5, then M8; M6, M7 and M9 with their stories (M6 first); M10 last. |
| C-02 | ADR-0007 vs ADR-0010 | Integration | Landing proxy: `env.GAME.fetch(...)` for any `/api/public/*`, rate limit before the cache, `s-maxage=60`, stale header `x-pa-stale`, 503 body `{"state":"unavailable"}`; vs the `PublicApi` RPC entrypoint, rate limit on a cache miss only, `s-maxage=300`, `X-Stale: 1`, 24 h last-good | A note in ADR-0007 says ADR-0010 wins; CONTROL_MANIFEST_PLATFORM rule and guardrail rewritten to ADR-0010. |
| C-03 | ADR-0007 vs ADR-0010 | Integration | Landing Worker path `landing/worker/index.ts` vs `landing/src/worker.ts` | ADR-0010 now uses `landing/worker/index.ts`. |
| C-04 | ADR-0011 vs ADR-0010 | Integration | The page script fetched `/api/public/stats` and `/api/public/leaderboards`; the API has one route | ADR-0011 now fetches `/api/public/v1/summary`. |
| C-05 | ADR-0011 vs V6-015 | Performance budget | Status "Accepted with amendments" but the body still said 15 kB JS total and no hero module | Added "Amendments on acceptance (V6-015)" to ADR-0011 (diorama, scroll moments, the lazy ≤ 80 kB hero module, the owner-eyes pass). |
| C-06 | ADR-0011 vs ADR-0007 | Pattern | "assets-only landing Worker" vs a Worker that runs first for `/` and `/api/public/*` | ADR-0011 wording follows ADR-0007; its Depends On now names ADR-0007 and ADR-0010 by ID (the dependency graph had no edge for it). |
| C-07 | ADR-0006 vs ADR-0012 | Integration | `InputHints` lacked `keyLabels()` (V6-016) and used `(hover: hover) and (pointer: fine)` where ADR-0012 uses `(any-pointer: fine)` | ADR-0006 interface and adapter table updated. |
| C-09 | ADR-0008 vs ADR-0006 | Integration | `transport(): 'bearer' \| 'cookie'` (method) vs `readonly transport` (property); "being written in parallel" | ADR-0008 Depends On updated. |
| C-10 | ADR-0008 §2 vs V6-014 | State | ADR fixes 100,000 iterations as "the workerd ceiling"; V6-014 makes the spike pick the highest safe value (target ≥ 310k, floor 100k) | Acceptance-condition note in ADR-0008 §2; manifest M-PW-1 points at the spike; V6-ACCT-01 writes the number. |
| C-13 | STRUCTURE.md vs ADR-0010 | Data | Landing copy promised "Battles fought", "Regions held" and war standings by regions held; the API has `onlineBattles`, `clans`, and clans by score and members | STRUCTURE.md §5 now names only fields in `PublicSummaryV1`. |
| C-16 | ADR-0006/0007 Related; manifests | Status | "planned" ADRs and "built from Proposed ADRs" | Updated to Accepted (V6-012, V6-014). |
| C-17 | accounts-v6.md vs ADR-0012 | Reference | "the input layer (ADR-0004 amendment)" | Now ADR-0012. |

### Open, with an owner story

| ID | Between | Type | Conflict | Resolution (owner) |
| --- | --- | --- | --- | --- |
| C-08 | ADR-0012 vs ADR-0006 | Pattern | `glyphs.ts` (game code) picks the Ctrl or ⌘ label from `platform.client().platform`, which is a platform-name comparison the boundary rule forbids outside telemetry | **V6-INP-06**: get the modifier label from a capability (`InputHints.keyLabels()` result or a new `InputHints.primaryModifier()`), implemented in every adapter, and amend ADR-0012 and ADR-0006. |
| C-11 | accounts-v6.md §12 vs ADR-0006 | Integration | The Turnstile slot sits behind `auth.humanCheck?()`, which is not in the `Auth` interface | **V6-ACCT-05**: add the optional capability to `core/auth.ts` and every adapter in one commit (ADR-0006 rule) and list it in ADR-0006's interface block. |
| C-12 | ADR-0008 vs accounts-v6.md Q6 | State | `logout-all` revokes every session including the current one; the devices page wants "all other devices" | **V6-ACCT-07**: follow the server; the label becomes "Log out everywhere" as the spec's default says. |
| C-14 | landscape-v6.md §5 vs the plan order | Dependency | The nine new checks "can never be allowlisted for the foundation screens", but the checks land in S3 and the shell migrates in S9 | **V6-RFND-03**: unmigrated families are `pending` (reported, not failed) in their own allowlist file; each family's story removes its file; foundation screens are enforced from the moment they migrate; V6-RSCR-11 deletes the mechanism. |
| C-18 | ADR-0007 (game-side public limit) vs ADR-0010 §4 | Integration | ADR-0007 limits the binding "as one caller with a generous bucket"; ADR-0010 bypasses HTTP with the RPC entrypoint | Covered by the C-02 note (ADR-0010 wins); **V6-STATS-02** implements ADR-0010. |

No data-ownership or state-authority conflict was found: `players.id` is the one key (ADR-0008, ADR-0009), the identity module alone writes `auth_identities` and the `telegram_id` mirror, the snapshot builder alone writes `public_snapshot`, and `platform` is the only owner of device facts.

## 4. ADR dependency order

From `.claude/scripts/adr-dep-graph.sh` (run on lower-cased copies of `design/adr/`, because the script expects `adr-NNNN-*.md`): 12 ADRs, 13 edges, **no cycles**. ADR-0011 had no ID-based edge (fixed, C-06).

```
Foundation (no dependencies): ADR-0002 save KV · ADR-0003 engine (Rejected: pins Phaser 3.90) · ADR-0005 UI kit
  → ADR-0004 battle input (needs 0003)
  → ADR-0006 platform layer (needs 0002, 0003)
      → ADR-0007 hosting (needs 0006)
      → ADR-0012 input v6 (needs 0004, 0006)
      → ADR-0008 accounts and sessions (needs 0006, 0007)
          → ADR-0009 linking, names, deletion (needs 0008)
              → ADR-0010 public stats (needs 0007, 0008, 0009)
                  → ADR-0011 landing stack (needs 0007, 0010)
  → ADR-0013 responsive scale (to write; needs 0005)
```

Every v6 ADR is Accepted, so no story is blocked by a Proposed dependency. ADR-0003 is Rejected, which is the decision that keeps Phaser 3.90; depending on it is informational.

## 5. Engine compatibility

| ADR | Knowledge risk | Unverified APIs | How the plan verifies them |
| --- | --- | --- | --- |
| 0006 | MEDIUM (Telegram SDK version gates) | none new | adapter tests with a fake `TgWebApp`; smokes in both modes (GATE-02) |
| 0007 | MEDIUM | `run_worker_first` route list, service bindings, `ratelimits` syntax, multi-config `wrangler dev` | G-DRYRUN on both configs (HOST-01, HOST-02, ACCT-04, STATS-02); two-Worker local run (STATS-03) |
| 0008 | MEDIUM | `send_email` binding (Beta), `ratelimits`, the PBKDF2 ceiling | ACCT-01 spike; fakes in workerd tests; owner actions confirm after deploy |
| 0009 | LOW | none | workerd tests |
| 0010 | LOW | `WorkerEntrypoint` RPC over a service binding | STATS-02 and STATS-03 |
| 0011 | MEDIUM | Astro 7 config, CSS `animation-timeline` | landing build and the no-timeline pass (GATE-03) |
| 0012 | LOW (Phaser) / MEDIUM (browser) | Keyboard Layout Map (Chromium only), Telegram Desktop key handling | glyph fallback tests; INP-06 manual list; QA-02 |

No ADR uses a Phaser API outside 3.90. **Engine validation: NOT ASSESSED** against a pinned engine reference (none configured, G3).

## 6. Verdict

**CONCERNS.** Traceability is complete (0 gaps without coverage); 12 doc conflicts are fixed; 5 integration or state conflicts are open, each assigned to a story that must close it; one architectural gap (G1, ADR-0013) is the first task of V6-RFND-01. NOT ASSESSED line items: the architecture document (G2) and the engine reference (G3). None of these blocks Sprint 1.

### Required ADRs

1. ADR-0013 Responsive scale policy and size classes (amends ADR-0005), in V6-RFND-01.
2. Amendments, not new ADRs: ADR-0006 interface additions from V6-ACCT-05 (`humanCheck`) and V6-INP-06 (modifier label); ADR-0008 §2 iteration count from V6-ACCT-01.

## Skills applied

- **architecture-review** (`.claude/skills/architecture-review/SKILL.md` and its phase references 4 and 7): built the requirement → ADR matrix with ✅/⚠️/❌ status; checked every ADR pair for integration, state, dependency, pattern and budget conflicts and wrote each with both claims and resolution options; ran `adr-dep-graph.sh` instead of tracing the graph by hand and reported the missing ADR-0011 edge as a structural gap; reported NOT ASSESSED line items for the missing architecture doc and engine reference instead of letting them pass silently, which keeps the verdict from PASS.
