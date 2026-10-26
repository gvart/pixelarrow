/**
 * The player's side in the region view: the signed-in player's alliance (team 0..3). The menu and the world map open
 * the region with `?team=<alliance>`; the live region's welcome confirms it (./simClient.ts). Everything that asks
 * "is this ours?" (fog, selection, cards, the HUD) asks `isMine`; the sim keeps the real team ids.
 *
 * Colours are absolute: every team draws in its alliance's colour, as on the world map (../world/palette.ts); the
 * player's own men stand out by their foot ring (./units.ts), not by a colour of their own.
 */
let me = parseTeam(typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('team'));

function parseTeam(v: string | null): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n < 4 ? n : 0;
}

/** The player's team. */
export const myTeam = (): number => me;

/** Set by the region's welcome (and tests). */
export function setMyTeam(team: number): void {
  me = team;
}

export const isMine = (team: number | undefined): boolean => team === me;

/** The colour slot a team draws in: its own (alliance) colour, the same for every player. */
export const slot = (team: number): number => team;
