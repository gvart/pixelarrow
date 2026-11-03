/**
 * W-61, W-166 the season's titles (first place on each path's ladder) as emblems (after Crusader Kings 3 and Rise of Kingdoms): a small gold medallion per title
 * with its painted glyph; the words (who holds it, by how much) live in the tooltip. Shared by the region HUD (the
 * roster strip, the Works window's Titles tab) and the world map (the season panel, the region labels). Glyph-only
 * dependencies, so the world screen can take it without the sandbox.
 */
import { glyph } from './glyph';

export interface TitleDef { name: string; glyph: string; /** the canvas emblem (a kit icon) */ icon: string; metric: string; how: string }
export const TITLES: Record<string, TitleDef> = {
  merchantPrince: { name: 'Merchant Prince', glyph: 'ui:scales', icon: 'res-coin', metric: 'level points', how: 'first among traders this season' },
  masterBuilder: { name: 'Master Builder', glyph: 'ui:works', icon: 'node-engineer-master-builder', metric: 'level points', how: 'first among builders this season' },
  warlord: { name: 'Ares-born', glyph: 'ui:swords', icon: 'act-attack', metric: 'level points', how: 'first among warriors this season' },
};
export const TITLE_ORDER = Object.keys(TITLES);

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n: number) => (n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));

/** A title's medallion, `px` across (the glyph a little inside its gold rim); `me`: the player holds it (it glows). */
export const medal = (id: string, px = 20, me = false) => `<span class="rf-medal${me ? ' me' : ''}" style="width:${px}px;height:${px}px">${glyph(TITLES[id]?.glyph ?? 'ui:laurel', Math.round(px * 0.68))}</span>`;

/** A title's tooltip: name, holder, the value he leads with and what it is for. */
export const titleTip = (x: { id: string; player: string; value: number; home?: string | null }) => {
  const d = TITLES[x.id];
  return `<b class="k">${esc(d?.name ?? x.id)}</b> · ${esc(x.player)}${x.home ? ` <span class="rf-dim">of ${esc(x.home)}</span>` : ''}<br>${fmt(x.value)} ${d?.metric ?? ''}<br><span class="rf-dim tip-w">${d?.how ?? ''}</span>`;
};
