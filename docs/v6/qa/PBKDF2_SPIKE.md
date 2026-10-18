# PBKDF2 spike (V6-ACCT-01)

**Result:** PBKDF2-HMAC-SHA256 at **310,000 iterations** (V6-014 target met; floor 100,000). It needs **Workers Paid**. Production CPU and the absence of a 100,000 cap still need the owner's check on a deployed throwaway Worker, because this run never deploys.

Date: 2026-10-13. Governs: ADR-0008 §2, CONTROL_MANIFEST_ACCOUNTS M-PW-1, V6-014.

## Method

- **Probe Worker:** `server/scripts/pbkdf2-probe/worker.ts` with its own `wrangler.jsonc`. It has no bindings or secrets, stores nothing and is never deployed by this run. `GET /hash?iter=N` runs exactly the ADR-0008 §2 hash: an HMAC-SHA256 pepper step, then `crypto.subtle.deriveBits` with PBKDF2-SHA256, a 16-byte random salt and a 32-byte output. It answers `{ok:true}`, or `{ok:false, error}` with status 422 when workerd refuses.
- **Runtime:** local `wrangler dev` 4.148.0 with workerd 1.20261006.1, compatibility date 2026-08-15, on `127.0.0.1:6140`, inspector on 6141 (the story's port slot). Machine: Apple M2 Pro, with other agents' work running at the same time.
- **Driver:** `server/scripts/pbkdf2-probe/measure.mjs`. For each count it sends 2 warm-up requests, then 20 sequential requests. **Wall** is per request, timed by the client, so it includes the local HTTP round trip (the `iter=1` row is the baseline). **CPU** is the delta of the worker's workerd process CPU time (`ps -o time`) over the 20 runs divided by 20, so it includes the per-request overhead (about 1 ms, the `iter=1` row) and has a 10 ms total resolution (0.5 ms per hash).
- **workerd tests:** `server/test/pbkdf2-spike.test.ts` runs the same `hashOnce` inside vitest-pool-workers (Miniflare workerd). It confirms that the floor, the chosen count and 100,001 all derive 32 bytes there too. It does not time anything, because workerd freezes `Date.now()` and `performance.now()` between I/O, so timing inside the runtime is meaningless.
- Three runs were made. The first sampled the wrong workerd process for CPU (wrangler starts two: a proxy and the user worker), so only its wall times count, and they were noisy (machine load). Runs 2 and 3 used the user worker's process (the one whose CPU grew with the count).

## Numbers (20 runs per count)

| Iterations | Accepted locally | Wall p50 (ms), runs 2 / 3 | Wall p95 (ms), runs 2 / 3 | CPU per hash (ms), runs 2 / 3 |
| ---: | :---: | ---: | ---: | ---: |
| 1 (baseline) | yes | 2.5 / 2.7 | 23.1 / 8.0 | 1.0 / 1.0 |
| 100,000 | yes | 10.7 / 10.1 | 21.9 / 14.6 | 8.5 / 8.0 |
| 100,001 | **yes (not refused)** | 11.1 / 9.9 | 23.8 / 14.4 | 8.5 / 8.5 |
| 200,000 | yes | 20.0 / 16.9 | 32.4 / 25.1 | 16.5 / 16.0 |
| **310,000** | yes | 32.2 / 25.9 | 44.4 / 30.6 | **26.0 / 24.0** |
| 400,000 | yes | 48.5 / 33.9 | 74.1 / 47.6 | 32.0 / 31.0 |
| 600,000 | yes | 61.8 / 50.7 | 112.6 / 56.2 | 50.5 / 46.0 |
| 1,000,000 | yes | 82.0 / 80.2 | 97.9 / 93.2 | 76.5 / 76.0 |

The cost is linear: about **8 ms of CPU per 100,000 iterations** on this machine. Wall p50 minus the baseline tracks CPU, as expected for a CPU-bound call with no I/O.

## Cloudflare's limits

From [Workers platform limits](https://developers.cloudflare.com/workers/platform/limits/) (read 2026-10-13; Context7 was not authorised, so the official page was read directly):

- **Workers Free:** 10 ms of CPU per HTTP request, fixed.
- **Workers Paid:** 30 s of CPU per request by default, configurable up to 5 minutes.
- Exceeding it returns error 1102 ("Worker exceeded resource limits"). Isolates tolerate occasional overruns, but a Worker that keeps exceeding the limit is terminated. CPU time excludes I/O waits (fetch, D1).

[Web Crypto in Workers](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/) lists PBKDF2 for `deriveBits` and `deriveKey` with **no stated iteration limit**. The "100,000 cap" in ADR-0008's first draft goes back to community reports, such as a 2024 blog post on hashing passwords in Workers that calls 100,000 the apparent maximum. Cloudflare does not document it.

## Is there an iteration cap?

- **Local workerd: no.** Every count from 1 to 1,000,000 was accepted, both in `wrangler dev` and in vitest-pool-workers. The workerd binary has no PBKDF2 iteration-limit message (`strings` shows only Node's `validateInt32` check for `node:crypto`).
- **Production: unknown.** The production runtime is built from the same source but can have extra limits. This run cannot deploy (brief, Hard constraints), so the owner checks it (see below). Until then, ADR-0008 treats 310,000 as chosen but unconfirmed.

## Limits of local measurement

- **Hardware:** an M2 Pro core is fast at SHA-256 (ARMv8 SHA extensions). Cloudflare's servers may be slower per core. The 2x margin below allows for that, but it is an assumption, not a measurement.
- **Runtime:** local workerd is the open-source build. Production can add limits (the reported cap) and accounts CPU differently (`cpu_ms` in Workers Logs or the dashboard is the authority).
- **Load:** other processes were running on the machine. CPU time is robust to that; wall time is not (see run 2's p95). A real log-in also does D1 reads and writes, which add wall time but no CPU.
- **Resolution:** `ps` CPU time has a 10 ms resolution over 20 runs, so ±0.5 ms per hash.

## Decision

The budget is ADR-0008 §2's ceiling of **60 ms CPU per hash**. A log-in that rehashes costs two hashes, and the request also does routing, JSON and D1 work.

| Candidate | Local CPU | At 2x slower production | Within 60 ms? |
| ---: | ---: | ---: | :---: |
| 100,000 | ~8 ms | ~17 ms | yes |
| 200,000 | ~16 ms | ~33 ms | yes |
| **310,000** | **~25 ms** | **~52 ms** | **yes** |
| 400,000 | ~31 ms | ~64 ms | no |
| 600,000 | ~48 ms | ~97 ms | no |

**Choose 310,000.** It is the highest count measured that workerd accepts and that stays inside the 60 ms budget with a 2x hardware margin. It meets the V6-014 target and OWASP's 2021 figure for PBKDF2-HMAC-SHA256. It is below OWASP's current 600,000; the pepper (a D1 dump alone can't be attacked offline), the durable per-account lockout and Turnstile make up the gap (ADR-0008 §2).

**Workers Paid is needed.** On Free (10 ms), even the 100,000 floor uses about 8 ms locally before the rest of the request, and more on slower hardware. That would mean 1102 errors on log-in. ADR-0008 already needs Paid for Email Service, so this adds no new cost decision; owner action 4 already covers the upgrade.

**Guard:** `server/scripts/pbkdf2-probe/limits.ts` records the range (`PBKDF2_SAFE_MIN` 100,000, `PBKDF2_SAFE_MAX` 310,000, `PBKDF2_CHOSEN` 310,000). `server/test/pbkdf2-spike.test.ts` fails if the chosen value leaves the range, if `PBKDF2_ITERATIONS` in `server/src/auth/password.ts` (V6-ACCT-03) differs from it, if ADR-0008 §2 or M-PW-1 states a different number, or if workerd starts refusing counts above 100,000.

**Rehash on log-in** (ADR-0008 §2, M-PW-1): after a successful verification, rehash when the tag isn't `pbkdf2-sha256`, when the stored count differs from `PBKDF2_ITERATIONS` (in either direction), or when the pepper id differs from `PASSWORD_PEPPER_ID`. Use a fresh salt. A failed rehash write never fails the log-in.

**Fallback:** if the owner's check shows production refuses counts above 100,000, or that 310,000 costs over 60 ms of CPU, set `PBKDF2_ITERATIONS` and `PBKDF2_SAFE_MAX` to the highest count that passes (floor 100,000), and update ADR-0008 §2 and M-PW-1. The guard test enforces the update. There are no live users (V5-074), so no stored hash is stranded.

## Reproduce

```sh
cd server
lsof -nP -iTCP:6140 -sTCP:LISTEN; lsof -nP -iTCP:6141 -sTCP:LISTEN   # both must be free
npx wrangler dev --config scripts/pbkdf2-probe/wrangler.jsonc --ip 127.0.0.1 --port 6140 --inspector-port 6141 &
ps -axo pid,ppid,command | grep workerd    # the user worker is the second workerd child of wrangler
node scripts/pbkdf2-probe/measure.mjs http://127.0.0.1:6140 <workerd pid> 20
npx vitest run test/pbkdf2-spike.test.ts
```

## Proposed decision line (for the Director to log in DECISIONS.md)

`V6-0xx | 2026-10-13 | PBKDF2-SHA256 runs at 310,000 iterations (V6-ACCT-01). Local workerd accepts up to 1,000,000 with no 100,000 cap; about 8 ms of CPU per 100k on an M2 Pro, so 310k is about 25 ms and stays under ADR-0008's 60 ms with a 2x hardware margin. It needs Workers Paid (Free's 10 ms fits no count ≥ 100k). The owner confirms production cpu_ms and the absence of a cap on a throwaway Worker before the first real sign-up; if production refuses, fall back to the highest passing count (floor 100k). Rehash on log-in when the tag, count or pepper id differ. | 100,000 (reported cap); 600,000 (OWASP, ~97 ms at 2x margin) | Highest measured count inside the CPU budget.`
