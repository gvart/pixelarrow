-- V6-053 (amends ADR-0009 §3, §5): a link conflict needs the choice of both
-- sides, the web session that asked and the Telegram owner in the Mini App
-- with fresh initData; either side can cancel. No live users (V5-074).

-- The SHA-256 of the initData that completed the code: a conflict choice must come from a newer launch.
ALTER TABLE link_codes ADD COLUMN init_hash TEXT;
-- Set by the Mini App's "Not me" (the web shows it as cancelled).
ALTER TABLE link_codes ADD COLUMN cancelled_at INTEGER;

-- The web session allowed to choose (the creating session, or the one that proved the email account).
ALTER TABLE link_conflicts ADD COLUMN web_session TEXT;
-- The Telegram user who must choose in the Mini App, and the initData already spent (the code's complete).
ALTER TABLE link_conflicts ADD COLUMN tg_id INTEGER;
ALTER TABLE link_conflicts ADD COLUMN tg_init_hash TEXT;
-- Each side's choice: the players.id it keeps.
ALTER TABLE link_conflicts ADD COLUMN keep_web INTEGER;
ALTER TABLE link_conflicts ADD COLUMN keep_tg INTEGER;
ALTER TABLE link_conflicts ADD COLUMN cancelled_at INTEGER;
CREATE INDEX link_conflicts_tg ON link_conflicts (tg_id);
