-- W-62 E6 alliance chat (server/src/war/world/chat.ts; protocol src/war/net/chat.ts).
--   war_chat:         an alliance's recent messages (free text already masked, or a quick phrase by index); the last
--                     CHAT_KEEP (50) per alliance are kept, a player joining gets them.
--   war_chat_mutes:   whose messages a player hides (his own choice, kept across devices).
--   war_chat_reports: a message a player reported, its words copied (the message may age out), for admin review.
CREATE TABLE war_chat (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  alliance  INTEGER NOT NULL,
  player_id INTEGER NOT NULL REFERENCES players(id),
  name      TEXT NOT NULL,
  text      TEXT,
  phrase    INTEGER,
  at        INTEGER NOT NULL
);
CREATE INDEX war_chat_alliance ON war_chat (alliance, id);

CREATE TABLE war_chat_mutes (
  player_id INTEGER NOT NULL REFERENCES players(id),
  muted_id  INTEGER NOT NULL REFERENCES players(id),
  at        INTEGER NOT NULL,
  PRIMARY KEY (player_id, muted_id)
);

CREATE TABLE war_chat_reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  msg_id      INTEGER NOT NULL,
  reporter_id INTEGER NOT NULL REFERENCES players(id),
  author_id   INTEGER NOT NULL REFERENCES players(id),
  alliance    INTEGER NOT NULL,
  text        TEXT NOT NULL,
  at          INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'actioned')),
  UNIQUE (msg_id, reporter_id)
);
CREATE INDEX war_chat_reports_open ON war_chat_reports (status, at);
