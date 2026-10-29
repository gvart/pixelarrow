/**
 * W-62 E6 alliance chat over the world socket (/ws/war/world?chat=1: a chat-only socket, no world snapshots; the world
 * map and the region view both open one). Two channels: the alliance's (the default) and W-69 World (`ch: 'world'`,
 * every player of every alliance); marks stay in the alliance.
 *
 *   client -> { t: 'say', text, links?, ch? } free text (CHAT_MAX chars; the server masks bad words: ./chatFilter.ts),
 *             W-69 with up to LINK_MAX item or man links, one tag character each in the text (./chatLinks.ts)
 *           | { t: 'say', phrase, ch? } one of PHRASES by index
 *           | { t: 'mark', kind, at, x, y } a map ping ("mark"; not the network `ping`): `at` 'world' (world map px) or a
 *             region id (its tile point); alliance members see it for MARK_MS
 *           | { t: 'mute', pid, on } hide (or show again) a player's messages, kept server side (war_chat_mutes)
 *           | { t: 'report', id } report a message for admin review (war_chat_reports)
 *   server -> { t: 'chat', you, msgs, muted } on connect: the alliance's and the world's last CHAT_KEEP messages
 *             each, oldest first (world ones with `ch: 'world'`)
 *           | { t: 'said', msg } | { t: 'marked', mark }
 *           | { t: 'chatError', code, until? } slow: over the rate limit (the message is dropped); silenced: muted for
 *             spam until `until`; noAlliance; reported (ack); link: a linked man is not the sender's
 */
import { z } from 'zod';
import { LINK, LINK_MAX, tagText, type ChatLinkData } from './chatLinks';

export const CHAT_MAX = 200;
/** The chat's channels: the alliance's, and W-69 every player's. */
export type ChatChannel = 'ally' | 'world';
/** Messages an alliance (and the world channel) keeps (D1) for a player who joins. */
export const CHAT_KEEP = 50;
/** How long a mark shows. */
export const MARK_MS = 20_000;
/** Rate limit: messages (say and marks together) per window; over it twice in a window and the player is silenced. */
export const CHAT_RATE = { n: 5, ms: 10_000, silenceMs: 60_000 } as const;

export const MARK_KINDS = ['gather', 'attack', 'defend', 'help'] as const;
export type MarkKind = (typeof MARK_KINDS)[number];
export const MARK_INFO: Record<MarkKind, { name: string; color: string; say: string }> = {
  gather: { name: 'Gather here', color: '#e8c25a', say: 'gather' },
  attack: { name: 'Attack', color: '#e0553f', say: 'attack' },
  defend: { name: 'Defend', color: '#5b9be0', say: 'defend' },
  help: { name: 'Need help', color: '#e6893a', say: 'needs help' },
};

/** The quick phrases (index on the wire; append only). */
export const PHRASES = [
  'Gather here', 'On my way', 'Attack!', 'Defend!', 'Retreat!', 'Hold the line', 'Need help', 'Need stone', 'Need wood',
  'Need food', 'Need iron', 'Need more men', 'Enemy spotted', 'Watch the walls', 'Siege engines coming', 'Escort my cart',
  'Wait for me', 'Ready', 'Thanks', 'Well fought',
] as const;

const id = z.number().int().min(1).max(2 ** 53);
export const chatClientMsgs = [
  z.object({
    t: z.literal('say'), text: z.string().min(1).max(CHAT_MAX).optional(), phrase: z.number().int().min(0).max(PHRASES.length - 1).optional(),
    links: z.array(LINK).min(1).max(LINK_MAX).optional(), ch: z.literal('world').optional(),
  }),
  z.object({ t: z.literal('mark'), kind: z.enum(MARK_KINDS), at: z.string().regex(/^(world|[a-z0-9_-]{1,40})$/), x: z.number().finite().min(-1e5).max(1e5), y: z.number().finite().min(-1e5).max(1e5) }),
  z.object({ t: z.literal('mute'), pid: id, on: z.boolean() }),
  z.object({ t: z.literal('report'), id }),
] as const;

export interface ChatMsg {
  id: number;
  pid: number;
  name: string;
  at: number;
  /** Free text (already masked), or: */
  text?: string;
  /** a quick phrase (PHRASES index). */
  phrase?: number;
  /** W-69: the items and men tagged in `text` (./chatLinks.ts). */
  links?: ChatLinkData[];
  /** W-69: said in the World channel (absent: the alliance's). */
  ch?: 'world';
}

export interface Mark { id: number; pid: number; name: string; kind: MarkKind; at: string; x: number; y: number; t: number }

export type ChatServerMsg =
  | { t: 'chat'; you: number; msgs: ChatMsg[]; muted: number[] }
  | { t: 'said'; msg: ChatMsg }
  | { t: 'marked'; mark: Mark }
  | { t: 'chatError'; code: 'slow' | 'silenced' | 'noAlliance' | 'reported' | 'link'; until?: number };

/** A message's words (a phrase by its text, a tag as "[label]"). */
export const chatText = (m: ChatMsg) => (m.phrase !== undefined ? PHRASES[m.phrase] ?? '' : tagText(m.text ?? '', m.links));
