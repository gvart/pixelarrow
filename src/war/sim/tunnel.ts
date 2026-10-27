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

/** The HUD and building line: "Next shade rises in 7:42, 3/6" (null: nothing pending). */
export function tunnelLine(alive: number, nextAt: number | null, now: number): string | null {
  if (nextAt === null || alive >= TUNNEL.floor) return null;
  return `Next shade rises in ${clock(nextAt - now)}, ${alive}/${TUNNEL.floor}`;
}
