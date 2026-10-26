/**
 * The player's side in the region view: the signed-in player's alliance (team 0..3). The menu and the world map open
 * the region with `?team=<alliance>`; the live region's welcome confirms it (./simClient.ts). Everything that asks
 * "is this ours?" (fog, selection, cards, the HUD) asks `isMine`; the sim keeps the real team ids.
 *
 * Colours are relative: the player's side always draws in slot 0 (blue, the TEAM_SWAP cloth of ./units.ts) and team 0
 * takes the player's own slot, so every side keeps a distinct colour.
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

/** The colour slot a team draws in: ours 0, team 0 ours, the rest their own. */
export const slot = (team: number): number => (team === me ? 0 : team === 0 ? me : team);
