/**
 * What the encounter and assault sheets say about the army and the fight, and
 * which choices they offer (QA-03 S2-2 and S4; docs/v5/stories/QAFIX-WORLD/NOTES.md).
 * Only fit men fight: with none fit there is no battle to offer. Pure: the
 * World scene builds the sheets from these.
 */
import type { Campaign } from './campaign';
import type { TKey } from '../i18n';
import { WORLD_RULES } from '../world/world';

export interface ArmyLine {
  /** Men fit to fight who march with the formation. */
  fit: number;
  /** Wounded men, in camp or not. */
  wounded: number;
  /** No man is fit: nobody can fight. */
  noneFit: boolean;
  /** Combat power of the fit men who would take the field (0 with none): the odds. */
  power: number;
  key: TKey;
}

/** "Your army: n fit, m wounded": only fit men count as fit, so fit + wounded never exceeds the army. */
export function armyLine(camp: Campaign): ArmyLine {
  const fit = camp.fitHeroes().filter((h) => (h.wound ?? 0) <= 0).length;
  const wounded = camp.wounded().length;
  const noneFit = fit === 0;
  return { fit, wounded, noneFit, power: noneFit ? 0 : camp.playerInfo().power, key: noneFit ? 'wld.enc.armyNoneFit' : wounded ? 'wld.enc.armyWounded' : 'wld.enc.army' };
}

export interface OffersIn {
  byPlayer: boolean;
  /** Band power over ArmyLine.power. */
  ratio: number;
  failedFlee: boolean;
  /** Campaign.canSurrender. */
  canRansom: boolean;
  noneFit: boolean;
}

/** The encounter sheet's choices. With no man fit, the band is let go: nobody can fight, and no band falls on such an army (S2-1). */
export function encounterOffers(o: OffersIn): { attack: boolean; ransom: boolean; letGo: boolean; flee: boolean } {
  if (o.noneFit) return { attack: false, ransom: false, letGo: true, flee: false };
  const letGo = !o.failedFlee && o.byPlayer && o.ratio < WORLD_RULES.chaseRatio;
  return { attack: true, ransom: o.canRansom && !o.failedFlee, letGo, flee: !o.failedFlee && !letGo };
}

export interface EncounterCopyIn {
  /** Band power over ArmyLine.power. */
  ratio: number;
  byPlayer: boolean;
  inCamp: boolean;
  failedFlee: boolean;
  /** Choices on the sheet. */
  flee: boolean;
  letGo: boolean;
  noneFit?: boolean;
}

/** The sheet's mood and advice: never a way out the sheet doesn't offer, never "caught up" with a band that won't let you go. */
export function encounterCopy(o: EncounterCopyIn): { mood: TKey; advice: TKey } {
  let mood: TKey = o.inCamp ? 'wld.enc.mood.camp' : 'wld.enc.mood.bar';
  if (o.failedFlee) mood = 'wld.enc.mood.cutOff';
  else if (o.byPlayer) mood = o.ratio < WORLD_RULES.surrenderRatio ? 'wld.enc.mood.surrender' : o.letGo ? 'wld.enc.mood.caught' : 'wld.enc.mood.stand';
  let advice: TKey = o.ratio < 0.85 ? 'wld.enc.adv.win' : 'wld.enc.adv.even';
  if (o.ratio > 1.15) advice = o.flee ? 'wld.enc.adv.hardFlee' : o.letGo ? 'wld.enc.adv.hardLetGo' : 'wld.enc.adv.hard';
  if (o.noneFit) advice = 'wld.enc.adv.noneFit';
  return { mood, advice };
}
