/**
 * W-62 E6 alliance chat, the world object's side (WarWorldDO relays; protocol src/war/net/chat.ts; tables
 * migrations/0043_war_chat.sql). The rate gate lives in the object's memory (one world object: one gate for everyone);
 * an evicted object forgets its counts, which only makes it kinder for a moment.
 */
import { CHAT_KEEP, CHAT_RATE, type ChatMsg } from '../../../../src/war/net/chat';
import { maskText } from '../../../../src/war/net/chatFilter';
import type { AllianceId } from '../../../../src/war/world/types';

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

interface Row { id: number; player_id: number; name: string; text: string | null; phrase: number | null; at: number }
const msgOf = (r: Row): ChatMsg => ({ id: r.id, pid: r.player_id, name: r.name, at: r.at, ...(r.phrase !== null ? { phrase: r.phrase } : { text: r.text ?? '' }) });

/** The alliance's last CHAT_KEEP messages, oldest first. */
export async function chatHistory(d: D1Database, alliance: AllianceId): Promise<ChatMsg[]> {
  const rows = (await d.prepare('SELECT id, player_id, name, text, phrase, at FROM war_chat WHERE alliance = ?1 ORDER BY id DESC LIMIT ?2').bind(alliance, CHAT_KEEP).all<Row>()).results;
  return rows.reverse().map(msgOf);
}

/** Keep a message (free text masked here) and drop the alliance's older ones past CHAT_KEEP; the message as relayed. */
export async function chatStore(d: D1Database, alliance: AllianceId, pid: number, name: string, said: { text?: string; phrase?: number }, now: number): Promise<ChatMsg> {
  const text = said.text !== undefined ? maskText(said.text.replace(/\s+/g, ' ').trim()) : null;
  const row = await d.prepare('INSERT INTO war_chat (alliance, player_id, name, text, phrase, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) RETURNING id').bind(alliance, pid, name, text, said.phrase ?? null, now).first<{ id: number }>();
  await d.prepare('DELETE FROM war_chat WHERE alliance = ?1 AND id <= (SELECT id FROM war_chat WHERE alliance = ?1 ORDER BY id DESC LIMIT 1 OFFSET ?2)').bind(alliance, CHAT_KEEP).run();
  return msgOf({ id: row!.id, player_id: pid, name, text, phrase: said.phrase ?? null, at: now });
}

export async function chatMutes(d: D1Database, pid: number): Promise<number[]> {
  return (await d.prepare('SELECT muted_id FROM war_chat_mutes WHERE player_id = ?1').bind(pid).all<{ muted_id: number }>()).results.map((r) => r.muted_id);
}

export async function chatMute(d: D1Database, pid: number, other: number, on: boolean, now: number): Promise<void> {
  if (other === pid) return;
  if (on) await d.prepare('INSERT OR IGNORE INTO war_chat_mutes (player_id, muted_id, at) SELECT ?1, id, ?3 FROM players WHERE id = ?2').bind(pid, other, now).run();
  else await d.prepare('DELETE FROM war_chat_mutes WHERE player_id = ?1 AND muted_id = ?2').bind(pid, other).run();
}

/** A report of message `id` (one of the reporter's alliance's kept messages, not his own): true when it was stored. */
export async function chatReport(d: D1Database, pid: number, alliance: AllianceId, id: number, now: number): Promise<boolean> {
  const r = await d.prepare(`INSERT OR IGNORE INTO war_chat_reports (msg_id, reporter_id, author_id, alliance, text, at)
    SELECT id, ?2, player_id, alliance, COALESCE(text, '#' || phrase), ?4 FROM war_chat WHERE id = ?1 AND alliance = ?3 AND player_id != ?2`).bind(id, pid, alliance, now).run();
  return (r.meta.changes ?? 0) > 0;
}
