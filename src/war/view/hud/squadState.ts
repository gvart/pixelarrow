/**
 * The squad card's state line (./hud.ts #cTag): what is wrong with the selected squads right now, each part an icon and
 * a few plain words, shown for as long as it is true (W-70: no ids, no jargon, the counts few and small).
 *
 *   in combat     they hit or were hit lately (the sim's combat tag): no safe court until it runs out
 *   N down        W-79 early mercy: men knocked down by the wild, who get up once the fighting near them stops
 *   food          starving / hungry men, or packs empty / low (./foodWatch.ts packLevel), the toast's warning kept up
 */
import { hungerStage } from '../../sim/food';
import type { UnitSnap } from '../../types';
import { packLevel } from './foodWatch';
import { glyph } from './glyph';

export interface SquadState { combat: boolean; down: number; stage: 0 | 1 | 2; pack: 'ok' | 'low' | 'out' | null }

/** The state of the squads `sqs` (their men in `units`; `meals`: their packs' bites, undefined when not counted). */
export function squadState(units: readonly UnitSnap[], sqs: ReadonlySet<number>, meals: number | undefined): SquadState {
  const mine = units.filter((u) => sqs.has(u.squad)), up = mine.filter((u) => u.state !== 'dead');
  const sats = up.filter((u) => u.sat !== undefined).map((u) => u.sat!);
  return {
    combat: up.some((u) => (u.tag ?? 0) > 0),
    down: mine.filter((u) => u.state === 'dead' && u.down).length,
    stage: sats.length ? hungerStage(Math.min(...sats)) : 0,
    pack: meals === undefined || !up.length ? null : packLevel(meals, up.length),
  };
}

const part = (tone: 'bad' | 'warn', g: string, text: string, tip: string) => `<span class="sq-${tone}" title="${tip}">${glyph(g, 14)}${text}</span>`;

/** The line's HTML ('' when all is well) and its worst tone. */
export function squadStateHtml(st: SquadState): { html: string; tone: 'bad' | 'warn' | '' } {
  const out: [string, 'bad' | 'warn'][] = [];
  if (st.combat) out.push([part('bad', 'ui:swords', 'In combat', 'They hit or were hit lately: no safe court until the fighting stops'), 'bad']);
  if (st.down) out.push([part('warn', 'ui:heart', `${st.down} down · rises soon`, 'Knocked down, not dead: he gets up once the fighting near him stops'), 'warn']);
  if (st.stage === 2) out.push([part('bad', 'power:hunger', 'Starving', 'Men starving: go to a store'), 'bad']);
  else if (st.pack === 'out') out.push([part('bad', 'goods:march_rations', 'No food', 'Packs empty: refill at a store'), 'bad']);
  else if (st.stage === 1) out.push([part('warn', 'power:hunger', 'Hungry', 'Men hungry: go to a store'), 'warn']);
  else if (st.pack === 'low') out.push([part('warn', 'goods:march_rations', 'Food low', 'Food low: refill at a store'), 'warn']);
  return { html: out.map(([h]) => h).join(''), tone: out.some(([, t]) => t === 'bad') ? 'bad' : out.length ? 'warn' : '' };
}
