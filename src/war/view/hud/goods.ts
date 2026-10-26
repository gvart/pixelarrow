/**
 * Goods as the HUD shows them: a name, a kind, a flavour line and what they are used for (derived from the build costs
 * and the recipes, so a new recipe or building shows up by itself). The squad chest (./chest.ts), the contextual
 * "needs 6 wood (you have 2)" hints and the market (./market.ts) read it. The codex card of a good: `goodCard`.
 */
import { RECIPES } from '../../../data/recipes';
import { BUILDINGS } from '../../sim/economy';
import type { ResourceKind } from '../../types';
import { card, fx, val } from './codex';
import { icon } from './kit';

export type GoodKind = 'raw' | 'metal' | 'refined' | 'remedy' | 'coin' | 'rare';
interface GoodInfo { name: string; kind: GoodKind; flavour: string }

/** Every good the HUD names, in display order (the chest sorts by it). Remedies sit in the team supplies (p:). */
export const GOOD_INFO: Record<string, GoodInfo> = {
  food: { name: 'Food', kind: 'raw', flavour: 'Barley, beans, olives and whatever the hunters bring.' },
  wood: { name: 'Wood', kind: 'raw', flavour: 'Pine and oak, felled and split.' },
  stone: { name: 'Stone', kind: 'raw', flavour: 'Rough-cut blocks from the nearest outcrop.' },
  marble: { name: 'Marble', kind: 'raw', flavour: 'White stone for temples and the proud.' },
  salt: { name: 'Salt', kind: 'raw', flavour: 'It keeps meat, and men, going.' },
  hides: { name: 'Hides', kind: 'raw', flavour: 'Raw skins from the hunt and the herd.' },
  flax: { name: 'Flax', kind: 'raw', flavour: 'Stalks to be retted, beaten and spun.' },
  herbs: { name: 'Herbs', kind: 'raw', flavour: 'Yarrow, thyme and the bitter roots physicians trust.' },
  pitch: { name: 'Pitch', kind: 'raw', flavour: 'Black and sticky; it burns hot and long.' },
  olives: { name: 'Olives', kind: 'raw', flavour: 'The tree of Athena gives twice: fruit, then oil.' },
  copper: { name: 'Copper', kind: 'metal', flavour: 'Red ore; with tin it becomes bronze.' },
  tin: { name: 'Tin', kind: 'metal', flavour: 'Rare and carried far: everyone needs it.' },
  iron: { name: 'Iron', kind: 'metal', flavour: 'Hard to work, harder to break.' },
  bronze: { name: 'Bronze', kind: 'metal', flavour: 'Copper, tin and patience.' },
  silver: { name: 'Silver', kind: 'metal', flavour: 'Bullion: minted into coin at a forge.' },
  charcoal: { name: 'Charcoal', kind: 'refined', flavour: 'Wood burned slow, for a hotter forge.' },
  leather: { name: 'Leather', kind: 'refined', flavour: 'Tanned hides for straps, grips and jerkins.' },
  linen: { name: 'Linen', kind: 'refined', flavour: 'Spun flax: corselets, bandages and sails.' },
  oil: { name: 'Oil', kind: 'refined', flavour: 'Pressed olives: lamps, cooking and trade.' },
  'p:bandage': { name: 'Bandages', kind: 'remedy', flavour: 'Clean linen strips; a squad carries them into a fight.' },
  'p:salve': { name: 'Salves', kind: 'remedy', flavour: 'Honey and herbs for wounds that will not close.' },
  'p:theriac': { name: 'Theriac', kind: 'remedy', flavour: 'Forty ingredients against every venom.' },
  coin: { name: 'Coin', kind: 'coin', flavour: 'Silver struck into drachmae; 200 make one load.' },
  dragonbone: { name: 'Dragonbone', kind: 'rare', flavour: 'Lighter than wood, harder than bronze.' },
  nereidPearl: { name: 'Nereid pearl', kind: 'rare', flavour: 'It glows faintly under water.' },
  starIron: { name: 'Star iron', kind: 'rare', flavour: 'Fallen from the sky, still warm to the touch.' },
  asphodel: { name: 'Asphodel', kind: 'rare', flavour: 'The flower of the dead meadow.' },
  titanBronze: { name: 'Titan bronze', kind: 'rare', flavour: 'An alloy no living smith can make.' },
  obsidian: { name: 'Obsidian', kind: 'rare', flavour: 'Volcanic glass, sharp beyond any blade.' },
};
export const KIND_LABEL: Record<GoodKind, string> = { raw: 'Raw good', metal: 'Metal', refined: 'Refined good', remedy: 'Remedy', coin: 'Money', rare: 'Rare good' };

const ICON_FILE: Record<string, string> = { 'p:bandage': 'res-bandages', 'p:salve': 'res-salves', 'p:theriac': 'res-theriac', nereidPearl: 'res-nereid-pearl', starIron: 'res-star-iron', titanBronze: 'res-titan-bronze' };
/** The kit icon id of a good. */
export const goodIcon = (r: string) => ICON_FILE[r] ?? 'res-' + r;
export const goodName = (r: string) => GOOD_INFO[r]?.name ?? r.replace(/^p:/, '').replace(/[A-Z]/g, (c) => ' ' + c.toLowerCase()).replace(/^./, (c) => c.toUpperCase());

/** What a good goes into: buildings it raises and things made from it (names, most common first). */
export function usesOf(r: string): string[] {
  const out = new Map<string, number>();
  for (const [t, d] of Object.entries(BUILDINGS)) if ((d.cost as Record<string, number>)[r] && !/\d$/.test(t)) out.set('building', (out.get('building') ?? 0) + 1);
  for (const rc of Object.values(RECIPES)) if ((rc.inputs as Record<string, number>)[r]) out.set(rc.kind, (out.get(rc.kind) ?? 0) + 1);
  const WORD: Record<string, string> = { building: 'buildings', item: 'arms and armour', tool: 'tools', dish: 'dishes', smelt: 'bronze', product: 'remedies', good: 'refined goods', engine: 'siege engines', fort: 'field works', cart: 'carts' };
  return [...out].sort((a, b) => b[1] - a[1]).map(([k]) => WORD[k] ?? k);
}

/** The codex card of good r: icon, name, kind, flavour, what it is for; `more` adds lines (how many, where). */
export function goodCard(r: string, more = ''): string {
  const g = GOOD_INFO[r], uses = usesOf(r);
  return card({
    icon: icon(goodIcon(r)), rawIcon: true, name: goodName(r), kind: g ? KIND_LABEL[g.kind] : 'Good', flavour: g?.flavour, w: 220,
    fx: uses.length ? [fx('ui:log', `used for ${uses.map((u) => val(u, '')).join(', ')}`)] : [],
    more: more || undefined,
  });
}

type Stock = Partial<Record<ResourceKind | string, number>>;
/**
 * A cost against what the player has, as chips: "6 wood" in plain ink when there is enough, else red with "(you have 2)".
 * Used by the build bar, the building card's upgrade and the forge.
 */
export function needChips(cost: Record<string, number | undefined>, have: Stock): string {
  const parts = Object.entries(cost).filter(([, n]) => (n ?? 0) > 0).map(([r, n]) => {
    const need = Math.ceil(n!), h = Math.floor(have[r] ?? 0), short = h < need;
    return `<span class="rf-need${short ? ' short' : ''}" title="${goodName(r)}: you have ${h}">${icon(goodIcon(r))}<b>${need}</b>${short ? `<i>/${h}</i>` : ''}</span>`;
  });
  return parts.join('') || '<span class="rf-dim">free</span>';
}

/** The plain-words hint of what is short: "needs 6 wood (you have 2), 4 stone (you have 0)", '' when nothing is. */
export function shortText(cost: Record<string, number | undefined>, have: Stock): string {
  const short = Object.entries(cost).filter(([r, n]) => Math.floor(have[r] ?? 0) < Math.ceil(n ?? 0));
  return short.length ? 'needs ' + short.map(([r, n]) => `${Math.ceil(n!)} ${goodName(r).toLowerCase()} (you have ${Math.floor(have[r] ?? 0)})`).join(', ') : '';
}
