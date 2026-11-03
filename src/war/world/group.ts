/**
 * W-87 one region: where a player's group is, and who may take the field where. Pure rules shared by the server
 * (server/src/war/persons.ts, the one that decides) and the region client (src/war/net/client.ts, which names only men
 * who may come).
 *
 *  - The group is his men with a `region`: fit or wounded, in a region or on a road (`>to`). Nobody with a region: he has
 *    no group out; his men are all at home.
 *  - A man with no region waits at home, off the field (W-98): he takes the field only in the player's home region.
 */
import { worldRegion } from './graph';

export interface GroupMan { state: string; region: string | null }

/** The region or road his group is in; null: nobody is out. */
export function groupAt(men: readonly GroupMan[]): string | null {
  return men.find((m) => m.region && (m.state === 'active' || m.state === 'wounded'))?.region ?? null;
}

export const ROAD = '>';
const named = (id: string) => worldRegion(id)?.name ?? id;

/** null: his group does not stop a man of his taking the field in `region`; else why not. */
export function groupRefusal(group: string | null, region: string): string | null {
  if (group?.startsWith(ROAD)) return `Your group is on the road to ${named(group.slice(ROAD.length))}`;
  if (group && group !== region) return `Your group is in ${named(group)}`;
  return null;
}

/** null: a man waiting at home may take the field in `region`; else why not. `home`: the player's (null: no rule, a test map). */
export function homeRefusal(home: string | null, region: string): string | null {
  return worldRegion(region) && home && home !== region ? `Your men wait at home in ${named(home)}` : null;
}
