/**
 * W-89 the small access control on a building's command card: its owner picks who may use it and what he keeps. One tap
 * moves each to its next setting. Everyone else sees nothing here; the card's status line says when it is closed to him.
 */
import { ACCESS, BUILDINGS, TERMS } from '../../sim/economy';
import type { Access, BuildingSnap, Order } from '../../types';

export const ACCESS_WORDS: Record<Access, string> = { private: 'Only me', household: 'My household', alliance: 'My alliance', anyone: 'Anyone' };
const ACCESS_TIP: Record<Access, string> = {
  private: 'Only your own men may work here or take from it.',
  household: 'Your men, your settlement\'s people and your vassals.',
  alliance: 'Anyone in your alliance.',
  anyone: 'Anyone at all, foes too, if they can reach it.',
};
/** Steps of each term, derived from what the sim allows (TERMS). */
export const SHARE_STEPS = [0, 0.1, 0.25, TERMS.share];
export const FEE_STEPS = [0, 5, 20, 50];
const next = <T>(list: readonly T[], at: T): T => list[(list.indexOf(at) + 1) % list.length];

type Term = 'access' | 'share' | 'fee';
/** The order one tap on `term` sends for building b. */
export function accessStep(b: BuildingSnap, term: Term, owner: string): Extract<Order, { kind: 'setAccess' }> {
  const o = { kind: 'setAccess' as const, building: b.id, owner };
  if (term === 'access') return { ...o, access: next(ACCESS, b.access ?? 'alliance') };
  if (term === 'share') return { ...o, share: next(SHARE_STEPS, b.share ?? 0) };
  return { ...o, fee: next(FEE_STEPS, b.fee ?? 0) };
}

/** May he set it? His own building that has terms. */
export const ownsTerms = (b: BuildingSnap, owner: string) => b.owner === owner && b.access !== undefined && b.state !== 'foundation' && b.state !== 'scaffold' && b.state !== 'destroyed';

export function accessHtml(b: BuildingSnap): string {
  const a = b.access ?? 'alliance', closed = a === 'private'; // nobody else there: no terms to ask
  const pill = (term: Term, label: string, tip: string) => `<button class="rf-tbtn" data-acc="${term}" data-tip="${tip}">${label}</button>`;
  return `<span class="rf-dim">Open to</span>${pill('access', ACCESS_WORDS[a], ACCESS_TIP[a])}`
    + (closed || BUILDINGS[b.type].house ? '' : `<span class="rf-dim">You keep</span>${pill('share', `${Math.round((b.share ?? 0) * 100)}%`, 'Your share of what others make here. It waits in this building until your men fetch it.')}`
      + `<span class="rf-dim">Fee</span>${pill('fee', `${b.fee ?? 0}`, 'Coin each order pays you before work starts. It waits here too.')}`);
}
