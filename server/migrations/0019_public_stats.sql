-- v6 public stats (ADR-0010 §2): the landing page's snapshot and the
-- incremental battle counters behind it. The 5-minute cron writes both
-- (server/src/public/snapshot.ts); nothing else does.

-- The one precomputed PublicSummaryV1 body (JSON, at most 32 KB).
CREATE TABLE public_snapshot (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  body          TEXT NOT NULL,
  generated_at  INTEGER NOT NULL            -- unix ms
);

-- Monotonic totals: `value` only grows; `high_water` is the last source rowid
-- counted, so a prune of old source rows never lowers a total.
CREATE TABLE stats_counters (
  name        TEXT PRIMARY KEY,
  value       INTEGER NOT NULL,
  high_water  INTEGER NOT NULL
);
