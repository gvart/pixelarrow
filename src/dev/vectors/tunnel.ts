/**
 * The Tunnel of Shades (src/war/sim/tunnel.ts): settleTunnel on states round the floor, the cap and the clock, and the
 * card and HUD lines on waits round the minute and the hour.
 */
import { Rng } from '../../sim/rng';
import { clock, settleTunnel, span, tunnelHint, tunnelLine, wiped, wipeLine, wipeNext, TUNNEL, type TunnelState, type WipeState } from '../../war/sim/tunnel';

const E = TUNNEL.everyMs;

export const vectors = () => {
  const r = new Rng(66), now = 5_000_000_000;
  const states: TunnelState[] = [
    { alive: 6, nextAt: null }, { alive: 7, nextAt: now - E }, { alive: 0, nextAt: null }, { alive: 5, nextAt: now },
    { alive: 0, nextAt: now - 10 * E }, { alive: 2, nextAt: now - 3 * E + 1 }, { alive: 1, nextAt: now + 5 }, { alive: 0, nextAt: now - 2 * E, room: 0 },
    { alive: 0, nextAt: now - 9 * E, room: 2 }, { alive: 1, nextAt: now - 9 * E, room: 3, floor: 4 }, { alive: 3, nextAt: now - E, floor: 4 },
    { alive: 4, nextAt: now - E, floor: 4 }, { alive: 2, nextAt: null, room: -1 }, { alive: 0, nextAt: now - E, floor: 0 },
  ];
  for (let i = 0; i < 60; i++) {
    const s: TunnelState = { alive: r.int(0, 8), nextAt: r.chance(0.2) ? null : now + r.int(-12 * E, 2 * E) };
    if (r.chance(0.4)) s.room = r.int(-1, 6);
    if (r.chance(0.4)) s.floor = r.int(0, 6);
    states.push(s);
  }
  const waits = [-5000, 0, 1, 999, 1000, 1001, 59_999, 60_000, 61_000, 599_000, 3_599_000, 3_599_999, 3_600_000, 3_600_001, 3_659_999,
    3_660_000, 7_200_000, 15_120_000, 86_400_000, 123_456_789];
  for (let i = 0; i < 40; i++) waits.push(r.int(-60_000, 30_000_000));
  const wipes: WipeState[] = [
    { fit: 0, nextAt: null, wounded: 0, woundedAt: null }, { fit: 0, nextAt: now + 5000, wounded: 0, woundedAt: null },
    { fit: 0, nextAt: null, wounded: 3, woundedAt: now + 9_000_000 }, { fit: 0, nextAt: now + 5000, wounded: 2, woundedAt: now + 4000 },
    { fit: 0, nextAt: now + 5000, wounded: 2, woundedAt: now + 5000 }, { fit: 0, nextAt: null, wounded: 1, woundedAt: null },
    { fit: 1, nextAt: now + 5000, wounded: 1, woundedAt: now }, { fit: 0, nextAt: now - 3000, wounded: 4, woundedAt: now + 20_000_000 },
  ];
  for (let i = 0; i < 30; i++) {
    const wounded = r.chance(0.5) ? r.int(1, 5) : 0;
    wipes.push({ fit: r.chance(0.8) ? 0 : r.int(1, 3), nextAt: r.chance(0.3) ? null : now + r.int(-5000, 5_000_000), wounded, woundedAt: r.chance(0.3) ? null : now + r.int(-5000, 20_000_000) });
  }
  const lines: [number, number | null, number | undefined][] = [[0, null, undefined], [6, now + 5, undefined], [3, now + 61_000, undefined], [3, now - 1, 4], [4, now + 1, 4], [0, now + 599_999, 2]];
  for (let i = 0; i < 20; i++) lines.push([r.int(0, 7), r.chance(0.2) ? null : now + r.int(-1000, E), r.chance(0.5) ? r.int(1, 6) : undefined]);
  return {
    tunnel: TUNNEL, now,
    settle: states.map((s) => [s, settleTunnel(s, now)]),
    clock: waits.map((ms) => [ms, clock(ms), span(ms)]),
    wipes: wipes.map((t) => [t, wiped(t), wipeNext(t), wipeLine(t, now)]),
    lines: lines.map(([a, n, f]) => [a, n, f ?? null, f === undefined ? tunnelLine(a, n, now) : tunnelLine(a, n, now, f)]),
    hints: [0, 4, 6].map((f) => [f, tunnelHint(f)]),
  };
};
