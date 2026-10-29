-- W-69 world chat and links (server/src/war/world/chat.ts; protocol src/war/net/chat.ts, src/war/net/chatLinks.ts).
--   war_chat.alliance -1: the World channel (every player's); its last CHAT_KEEP messages are kept like an alliance's.
--   war_chat.links:       the message's item and man links (JSON, snapshots taken when it was sent), or NULL.
ALTER TABLE war_chat ADD COLUMN links TEXT;
