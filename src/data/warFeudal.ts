/**
 * W-150..W-155 the feudal hierarchy's numbers (docs/WAR.md "Feudal hierarchy"), read by the sim, the server and the HUD.
 */
const HOUR = 3_600_000;
export const FEUDAL = {
  /** Tribute: each lord (and the king) sets his own rate, whole %, on what his sworn pay. */
  rateMax: 20, rateDefault: 10,
  /** A broken oath bars him from swearing again this long. */
  barMs: 24 * HOUR,
  /** A king not seen this long loses the crown: to his heir, and an election opens. */
  inactiveMs: 72 * HOUR,
  /** An unanswered request to swear lapses. */
  askMs: 48 * HOUR,
} as const;

export type Rank = 'king' | 'lord' | 'vassal' | 'free';
export const RANK_NAME: Record<Rank, string> = { king: 'King', lord: 'Lord', vassal: 'Vassal', free: 'Free' };
