/**
 * W-60 hunger as the HUD shows it (src/war/sim/food.ts): an icon first everywhere. `hungerBadge` is the small mark on the
 * soldier card, the roster row and the command card (a grain bundle while fed, the hunger sign once hungry, red once
 * starving), with a satiety bar; its tooltip is a codex card that leads with the icon and lists the effects with icons.
 */
import { HUNGER, HUNGER_NAMES, hungerStage, type HungerStage } from '../../sim/food';
import { card, fx, val } from './codex';
import { glyph } from './glyph';
import { esc } from './roster/ui';

const ICON: Record<HungerStage, string> = { 0: 'ui:food', 1: 'power:hunger', 2: 'power:hunger' };
const TONE: Record<HungerStage, string> = { 0: '#8fbf6a', 1: '#e0a944', 2: '#e05a4a' };
const pct = (m: number) => `${Math.round((1 - m) * 100)}%`;

/** The codex card of a man's hunger: stage, satiety, effects, how he eats. */
export function hungerCard(sat: number): string {
  const st = hungerStage(sat);
  const effects = st === 0
    ? [fx('ui:check', `no penalty; he eats below ${HUNGER.eatAt}`)]
    : [
        fx('ui:march', `pace ${val('−' + pct(HUNGER.pace[st]), 'neg')}`),
        fx('ui:sword', `attack ${val('−' + pct(HUNGER.attack[st]), 'neg')}`),
        ...(st === 2 ? [fx('ui:heart', `slowly loses health, never below ${val(Math.round(HUNGER.floor * 100) + '%', 'neg')}`)] : []),
      ];
  return card({
    icon: ICON[st], name: HUNGER_NAMES[st], kind: `Satiety ${Math.round(sat)} / ${HUNGER.max}`, w: 230,
    fx: [
      ...effects,
      fx('goods:march_rations', `eats a ration (${val('+' + HUNGER.ration, '')}) or food (${val('+' + HUNGER.food, '')}) from his pack`),
      fx('ui:chest', `else from a store of yours within ${HUNGER.storeR} tiles`),
    ],
  });
}

/** The hunger mark: icon tinted by stage and a thin satiety bar under it; '' with no satiety (the wild). */
export function hungerBadge(sat: number | undefined, px = 14, tip = true): string {
  if (sat === undefined) return '';
  const st = hungerStage(sat), w = Math.max(0, Math.min(1, sat / HUNGER.max));
  const t = tip ? ` data-tip="${esc(hungerCard(sat))}"` : '';
  return `<span class="hg-mark hg-${st}"${t} style="display:inline-flex;flex-direction:column;align-items:center;gap:1px;vertical-align:middle;${st ? `filter:drop-shadow(0 0 2px ${TONE[st]})` : ''}">${glyph(ICON[st], px)}<i style="display:block;width:${px}px;height:2px;background:#0006"><i style="display:block;height:2px;width:${Math.round(w * 100)}%;background:${TONE[st]}"></i></i></span>`;
}

/** The card's line: the mark, the satiety bar in the stage's colour and the stage name. */
export function hungerLine(sat: number): string {
  const st = hungerStage(sat), w = Math.round(100 * Math.max(0, Math.min(1, sat / HUNGER.max)));
  return `${hungerBadge(sat, 16, false)}<div class="rr-bar"><i style="width:${w}%;background:${TONE[st]}"></i></div><span class="rf-dim" style="color:${st ? TONE[st] : ''}">${HUNGER_NAMES[st]}</span>`;
}

/** The worst stage among men (their satieties) and how many are at it: for a squad row. */
export function worstHunger(sats: (number | undefined)[]): { sat: number; n: number } | null {
  const xs = sats.filter((s): s is number => s !== undefined);
  if (!xs.length) return null;
  const sat = Math.min(...xs), st = hungerStage(sat);
  return { sat, n: xs.filter((s) => hungerStage(s) === st).length };
}
