/**
 * What the encounter and assault sheets say about the army and the fight
 * (QA-03 S2-2 and S4; docs/v5/stories/QAFIX-WORLD/NOTES.md). Pure: the World
 * scene builds the sheets from these keys.
 */
import type { Campaign } from './campaign';
import type { TKey } from '../i18n';
import { WORLD_RULES } from '../world/world';

export interface ArmyLine {
  /** Men fit to fight who march with the formation. */
  fit: number;
  /** Wounded men, in camp or not. */
  wounded: number;
  /** No man is fit: the wounded take the field (Campaign.fitHeroes). */
  lastStand: boolean;
  key: TKey;
}

/** "Your army: n fit, m wounded": only fit men count as fit, so fit + wounded never exceeds the army. */
export function armyLine(camp: Campaign): ArmyLine {
  const fit = camp.fitHeroes().filter((h) => (h.wound ?? 0) <= 0).length;
  const wounded = camp.wounded().length;
  const lastStand = fit === 0 && wounded > 0;
  return { fit, wounded, lastStand, key: lastStand ? 'wld.enc.armyLastStand' : wounded ? 'wld.enc.armyWounded' : 'wld.enc.army' };
}

export interface EncounterCopyIn {
  /** Band power over the power of the men who will take the field. */
  ratio: number;
  byPlayer: boolean;
  inCamp: boolean;
  failedFlee: boolean;
  /** Choices on the sheet. */
  flee: boolean;
  letGo: boolean;
}

/** The sheet's mood and advice: never a way out the sheet doesn't offer, never "caught up" with a band that won't let you go. */
export function encounterCopy(o: EncounterCopyIn): { mood: TKey; advice: TKey } {
  let mood: TKey = o.inCamp ? 'wld.enc.mood.camp' : 'wld.enc.mood.bar';
  if (o.failedFlee) mood = 'wld.enc.mood.cutOff';
  else if (o.byPlayer) mood = o.ratio < WORLD_RULES.surrenderRatio ? 'wld.enc.mood.surrender' : o.letGo ? 'wld.enc.mood.caught' : 'wld.enc.mood.stand';
  let advice: TKey = o.ratio < 0.85 ? 'wld.enc.adv.win' : 'wld.enc.adv.even';
  if (o.ratio > 1.15) advice = o.flee ? 'wld.enc.adv.hardFlee' : o.letGo ? 'wld.enc.adv.hardLetGo' : 'wld.enc.adv.hard';
  return { mood, advice };
}
