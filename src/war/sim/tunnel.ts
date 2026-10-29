/**
 * W-66 the Tunnel of Shades (docs/WAR.md "Tunnel of Shades"): the anti-reroll floor. Every home town has a tunnel;
 * while a player has fewer than TUNNEL.floor living men (what armyCount counts), the shades of his fallen walk back
 * through it, one man every TUNNEL.everyMs, up to the floor. Raised men are level 1 in starter gear; past the floor
 * men come only from souls. Pure and lazy: the server (server/src/war/raise.ts) and the offline sandbox
 * (src/war/view/hud/tunnel.ts) both keep one stored `nextAt` per player and settle it on read.
 */
export const TUNNEL = { floor: 6, everyMs: 10 * 60_000 } as const;

export interface TunnelState { alive: number; nextAt: number | null }
export interface TunnelSettle { raise: number; nextAt: number | null; alive: number; pending: number }

/**
 * Settle the clock at `now`: how many men rise (catching up on every interval that passed), the next rise (null: at or
 * above the floor, nothing pending) and how many are still to come. A player who just fell under the floor starts the
 * clock now (the first man rises TUNNEL.everyMs later).
 */
export function settleTunnel(s: TunnelState, now: number): TunnelSettle {
  let alive = s.alive, nextAt = s.nextAt, raise = 0;
  if (alive >= TUNNEL.floor) return { raise: 0, nextAt: null, alive, pending: 0 };
  if (nextAt === null) nextAt = now + TUNNEL.everyMs;
  while (nextAt <= now && alive < TUNNEL.floor) {
    raise++;
    alive++;
    nextAt += TUNNEL.everyMs;
  }
  if (alive >= TUNNEL.floor) nextAt = null;
  return { raise, nextAt, alive, pending: TUNNEL.floor - alive };
}

/** "7:42" for a countdown in ms (never negative). */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * After a wipe: his men he can field (not wounded, not captive), the tunnel's next rise, and his wounded and captive men
 * with the first of each back (GET /api/war/tunnel; offline: no wounded or captives).
 */
export interface WipeState { fit: number; nextAt: number | null; wounded: number; woundedAt: number | null; captive: number; captiveAt: number | null }

/** The "Your army is destroyed" card: no man he can field, and a man to come (a rise, a wounded man healing, a captive). */
export const wiped = (t: WipeState): boolean => t.fit === 0 && (t.nextAt !== null || t.wounded > 0 || t.captive > 0);

/** A wait: "7:42" under an hour, else "4 h 12 m". */
export function span(ms: number): string {
  if (ms < 3_600_000) return clock(ms);
  const m = Math.ceil(ms / 60_000);
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} m` : ''}`;
}

/** The first man to stand again: when (null: not known) and how (the card's headline). */
export function wipeNext(t: WipeState): { at: number | null; text: string } {
  const c = [
    t.nextAt !== null && { at: t.nextAt, text: 'The next man rises in' },
    t.wounded > 0 && t.woundedAt !== null && { at: t.woundedAt, text: 'Your first wounded man is fit in' },
    t.captive > 0 && t.captiveAt !== null && { at: t.captiveAt, text: 'Your first captive walks home in' },
  ].filter((x): x is { at: number; text: string } => !!x).sort((a, b) => a.at - b.at)[0];
  return c ? { at: c.at, text: c.text } : { at: null, text: 'Your next man stands in' };
}

/** The card's detail line (none when the tunnel alone brings him back): "Next shade rises in 7:42 · 3 wounded heal in 4 h 12 m · 8 held captive, back in 21 h or by ransom". */
export function wipeLine(t: WipeState, now: number): string {
  const p: string[] = [];
  if (t.nextAt !== null && (t.wounded > 0 || t.captive > 0)) p.push(`Next shade rises in ${span(t.nextAt - now)}`);
  if (t.wounded > 0) p.push(`${t.wounded} wounded heal${t.woundedAt !== null ? ` in ${span(t.woundedAt - now)}` : ''}`);
  if (t.captive > 0) p.push(`${t.captive} held captive, back${t.captiveAt !== null ? ` in ${span(t.captiveAt - now)}` : ''} or by ransom`);
  return p.join(' · ');
}

/** The HUD and building line: "Next shade rises in 7:42, 3/6" (null: nothing pending). */
export function tunnelLine(alive: number, nextAt: number | null, now: number): string | null {
  if (nextAt === null || alive >= TUNNEL.floor) return null;
  return `Next shade rises in ${clock(nextAt - now)}, ${alive}/${TUNNEL.floor}`;
}
