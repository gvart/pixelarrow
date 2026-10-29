/**
 * W-62 E6 alliance chat and the W-69 World channel, the world object's side (WarWorldDO relays; protocol
 * src/war/net/chat.ts; tables migrations/0043_war_chat.sql, 0049_war_chat_world.sql: World messages are kept under
 * alliance WORLD). The rate gate lives in the object's memory (one world object: one gate for everyone, both channels);
 * an evicted object forgets its counts, which only makes it kinder for a moment.
 */
import { CHAT_KEEP, CHAT_RATE, type ChatMsg } from '../../../../src/war/net/chat';
import { cleanTags, maskLink, maskTagged, type ChatLinkData } from '../../../../src/war/net/chatLinks';
import type { AllianceId } from '../../../../src/war/world/types';

/** The World channel's rows in war_chat. */
export const WORLD = -1;

export type GateResult = { ok: true } | { ok: false; code: 'slow' | 'silenced'; until?: number };

/**
 * CHAT_RATE.n messages per CHAT_RATE.ms; one over it is dropped (slow), a second over it in the same window silences
 * the player for CHAT_RATE.silenceMs (every message dropped till then).
 */
export class ChatGate {
  private hits = new Map<number, number[]>();
  private strikes = new Map<number, number[]>();
  private silenced = new Map<number, number>();

  check(pid: number, now: number): GateResult {
    const until = this.silenced.get(pid) ?? 0;
    if (until > now) return { ok: false, code: 'silenced', until };
    const from = now - CHAT_RATE.ms;
    const hits = (this.hits.get(pid) ?? []).filter((t) => t > from);
    if (hits.length < CHAT_RATE.n) {
      hits.push(now);
      this.hits.set(pid, hits);
      return { ok: true };
    }
    const strikes = [...(this.strikes.get(pid) ?? []).filter((t) => t > from), now];
    this.strikes.set(pid, strikes);
    if (strikes.length < 2) return { ok: false, code: 'slow' };
    const u = now + CHAT_RATE.silenceMs;
    this.silenced.set(pid, u);
    this.strikes.delete(pid);
    return { ok: false, code: 'silenced', until: u };
  }
}

interface Row { id: number; alliance: number; player_id: number; name: string; text: string | null; phrase: number | null; links: string | null; at: number }
const msgOf = (r: Row): ChatMsg => ({
  id: r.id, pid: r.player_id, name: r.name, at: r.at, ...(r.phrase !== null ? { phrase: r.phrase } : { text: r.text ?? '' }),
  ...(r.links ? { links: JSON.parse(r.links) as ChatLinkData[] } : {}), ...(r.alliance === WORLD ? { ch: 'world' as const } : {}),
});

/** The alliance's (none: no alliance) and the World channel's last CHAT_KEEP messages each, oldest first. */
export async function chatHistory(d: D1Database, alliance: AllianceId | null): Promise<ChatMsg[]> {
  const q = (a: number) => d.prepare('SELECT id, alliance, player_id, name, text, phrase, links, at FROM war_chat WHERE alliance = ?1 ORDER BY id DESC LIMIT ?2').bind(a, CHAT_KEEP);
  const res = await d.batch<Row>(alliance === null ? [q(WORLD)] : [q(alliance), q(WORLD)]);
  return res.flatMap((r) => r.results).sort((a, b) => a.id - b.id).map(msgOf);
}

/**
 * Keep a message in `room` (an alliance, or WORLD; free text and the links' names masked here, tags without a link
 * dropped) and drop the room's older ones past CHAT_KEEP; the message as relayed.
 */
export async function chatStore(d: D1Database, room: AllianceId | typeof WORLD, pid: number, name: string, said: { text?: string; phrase?: number; links?: ChatLinkData[] }, now: number): Promise<ChatMsg> {
  const links = said.text !== undefined && said.links?.length ? said.links.map(maskLink) : null;
  const text = said.text !== undefined ? maskTagged(cleanTags(said.text, links?.length ?? 0).replace(/\s+/g, ' ').trim()) : null;
  const json = links && JSON.stringify(links);
  const row = await d.prepare('INSERT INTO war_chat (alliance, player_id, name, text, phrase, links, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING id').bind(room, pid, name, text, said.phrase ?? null, json, now).first<{ id: number }>();
  await d.prepare('DELETE FROM war_chat WHERE alliance = ?1 AND id <= (SELECT id FROM war_chat WHERE alliance = ?1 ORDER BY id DESC LIMIT 1 OFFSET ?2)').bind(room, CHAT_KEEP).run();
  return msgOf({ id: row!.id, alliance: room, player_id: pid, name, text, phrase: said.phrase ?? null, links: json, at: now });
}

/** W-69: every man linked is the sender's (war_persons); items are only checked for shape. */
export async function chatOwns(d: D1Database, pid: number, links: readonly ChatLinkData[]): Promise<boolean> {
  const ids = [...new Set(links.flatMap((l) => (l.k === 'man' ? [l.id] : [])))];
  if (!ids.length) return true;
  const r = await d.prepare(`SELECT COUNT(*) AS n FROM war_persons WHERE player_id = ?1 AND id IN (${ids.map((_, i) => `?${i + 2}`).join(', ')})`).bind(pid, ...ids).first<{ n: number }>();
  return (r?.n ?? 0) === ids.length;
}

export async function chatMutes(d: D1Database, pid: number): Promise<number[]> {
  return (await d.prepare('SELECT muted_id FROM war_chat_mutes WHERE player_id = ?1').bind(pid).all<{ muted_id: number }>()).results.map((r) => r.muted_id);
}

export async function chatMute(d: D1Database, pid: number, other: number, on: boolean, now: number): Promise<void> {
  if (other === pid) return;
  if (on) await d.prepare('INSERT OR IGNORE INTO war_chat_mutes (player_id, muted_id, at) SELECT ?1, id, ?3 FROM players WHERE id = ?2').bind(pid, other, now).run();
  else await d.prepare('DELETE FROM war_chat_mutes WHERE player_id = ?1 AND muted_id = ?2').bind(pid, other).run();
}

/**
 * A report of message `id` (one of the reporter's alliance's or the World channel's kept messages, not his own): true
 * when it was stored.
 */
export async function chatReport(d: D1Database, pid: number, alliance: AllianceId | null, id: number, now: number): Promise<boolean> {
  const r = await d.prepare(`INSERT OR IGNORE INTO war_chat_reports (msg_id, reporter_id, author_id, alliance, text, at)
    SELECT id, ?2, player_id, alliance, COALESCE(text, '#' || phrase), ?4 FROM war_chat WHERE id = ?1 AND alliance IN (?3, ${WORLD}) AND player_id != ?2`).bind(id, pid, alliance ?? WORLD, now).run();
  return (r.meta.changes ?? 0) > 0;
}
