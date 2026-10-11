/**
 * Who may pause a battle, and at what speeds (design/gdd/controls.md R10 and
 * R11 "Speed"; CT-06, V5-021).
 *
 * | Battle                                   | Pause, auto-pause | Speeds             |
 * | ---------------------------------------- | ----------------- | ------------------ |
 * | Campaign, tutorial, practice (offline)   | yes               | 0.5×, 1×, 2×, 3×   |
 * | Duel PvE ladder (vs a bot, verified after) | yes             | 0.5×, 1×, 2×       |
 * | Live duels, async raids, war-map attacks | no (realtimeLocked) | 1×               |
 *
 * Speed is only how fast the client steps the sim (real seconds per tick); the
 * tick, the order log and so the server's replay never change (ADR-0001). A
 * live duel runs at the relay's pace for both players, and an attack's other
 * side is real time on the war map, so those stay locked at 1×.
 *
 * Pure: no Phaser, no scene (ADR-0004).
 */

export type PaceMode = 'offline' | 'ladder' | 'locked';

/** The speeds each kind of battle offers, slowest first (the speed key steps through them). */
export const SPEEDS: Readonly<Record<PaceMode, readonly number[]>> = {
  offline: [0.5, 1, 2, 3],
  ladder: [0.5, 1, 2],
  locked: [1],
};

/** The mode of a battle: offline (no online source), a ladder floor, or any other online battle. */
export function paceMode(online: boolean, ladder: boolean): PaceMode {
  return !online ? 'offline' : ladder ? 'ladder' : 'locked';
}

/** The battle cannot pause or change speed (controls.md R10 `realtimeLocked`). */
export function realtimeLocked(mode: PaceMode): boolean {
  return mode === 'locked';
}

/**
 * The speed a battle opens at: the saved battle speed (Settings, A11Y-21) or
 * the fastest this battle offers below it; 1× when none is saved.
 */
export function startSpeed(mode: PaceMode, saved?: number): number {
  const list = SPEEDS[mode];
  const want = saved ?? 1;
  let best = list[0];
  for (const s of list) if (s <= want) best = s;
  return best;
}

/** The speed after a tap on the speed key: the next one up, back to the slowest after the fastest. */
export function nextSpeed(mode: PaceMode, cur: number): number {
  const list = SPEEDS[mode];
  const i = list.findIndex((s) => s > cur);
  return i < 0 ? list[0] : list[i];
}

/** "0.5×", "2×". */
export function speedLabel(s: number): string {
  return `${s}×`;
}
