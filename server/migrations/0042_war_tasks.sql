-- W-62 E7 daily and weekly tasks and the alliance wonder (rules: server/src/war/tasks.ts, server/src/war/works.ts; pools
-- and stages: src/war/net/tasks.ts, src/war/net/works.ts).
--   war_task_tally: what the server saw a player do per UTC day (metric: src/war/net/tasks.ts TaskMetric; guard and
--                   labour in seconds). A task's progress is the sum over its period's days less its `base`.
--   war_tasks:      a player's drawn tasks per period (`d<day>` or `w<week>`) and slot: the task, its base (the tally
--                   already there when it was rerolled in), the UTC day of a reroll, when it was claimed.
--   war_works.stage: stages of a staged work (the wonder) done; its goods and labour are the current stage's.
ALTER TABLE war_works ADD COLUMN stage INTEGER NOT NULL DEFAULT 0;

CREATE TABLE war_task_tally (
  season      INTEGER NOT NULL,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  day         INTEGER NOT NULL,
  metric      TEXT NOT NULL,
  n           REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (season, player_id, day, metric)
);

CREATE TABLE war_tasks (
  season      INTEGER NOT NULL,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  period      TEXT NOT NULL,
  slot        INTEGER NOT NULL,
  task        TEXT NOT NULL,
  base        REAL NOT NULL DEFAULT 0,
  rerolled_day INTEGER,
  claimed_at  INTEGER,
  PRIMARY KEY (season, player_id, period, slot)
);
CREATE INDEX war_tasks_reroll ON war_tasks (player_id, rerolled_day);
