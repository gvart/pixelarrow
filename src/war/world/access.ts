/**
 * Who may join a world region's room with fresh squads (M4; W-09). A player serves his alliance there (the room team
 * is the alliance). New men may come into his own home, a region his alliance holds, an unheld one or a contested
 * one; another alliance's home, or a region a foe holds uncontested, only by marching in over a border (a transfer:
 * into a home that is always by one of its entries). Rejoining squads already standing in the region is always fine.
 */
import { ALLIANCES } from './alliances';
import { worldRegion } from './graph';
import type { AllianceId } from './types';

/** What the rule reads of the region's world state (RegionState fits). */
export interface HeldRegion { owner: number; contested: boolean }

/** null: fresh squads of `alliance` may join `id`; else why not. */
export function joinRefusal(id: string, alliance: AllianceId, st: HeldRegion | null): string | null {
  const r = worldRegion(id);
  if (!r) return null; // not a world region (test maps): no rule
  if (r.role === 'home') return r.alliance === alliance ? null : `${r.name} is ${ALLIANCES[r.alliance!].name}'s home: march in over one of its entries`;
  if (!st || st.owner < 0 || st.owner === alliance || st.contested) return null;
  return `${r.name} is held by ${ALLIANCES[st.owner]?.name ?? 'a foe'}: march in from a neighbour`;
}
