/**
 * Post-battle reports for online battles (src/game/report.ts): a verified
 * attack (the server's AttackResult) or a finished live duel, combined with
 * the kills, damage and duration the battle scene recorded (lastBattle).
 */
import { buildReport, lastBattle, resultFor, type BattleReport } from '../game/report';
import type { AttackResult, RaidResult } from './client';
import { encounterName } from '../ui/beastInfo';
import type { EncounterId } from '../data/beasts';
import type { DuelOutcome } from './duelDriver';
import { t } from '../i18n';

export function attackReport(r: AttackResult, label: string): BattleReport {
  const notes: string[] = [];
  if (r.beast && r.captured) notes.push(t('results.beastSlain', { name: encounterName(r.beast.enc as EncounterId) }));
  if (r.captured) notes.push(t('results.captured'));
  else if (r.siege && r.won) notes.push(t('results.siege', { wins: r.siege.wins, needed: r.siege.needed }));
  return buildReport({
    result: resultFor(r.winner, 0),
    vs: label,
    ticks: r.ticks,
    side: 0,
    stats: lastBattle.stats,
    heroes: lastBattle.heroes,
    outcomes: r.attacker.heroes.map((h) => ({ name: h.name, died: h.died, wounded: h.wounded, xp: h.xp, levelsGained: h.levelsGained })),
    gold: r.gold,
    loot: r.loot,
    picks: 0,
    lootInStash: r.loot.length > 0,
    verified: true,
    online: 'attack',
    notes,
  });
}

/** A world boss raid: the damage dealt is the result; the boss's hoard if this raid slew it. */
export function raidReport(r: RaidResult, label: string): BattleReport {
  const name = encounterName(r.boss as EncounterId);
  const notes = [t('boss.dealt', { n: r.dealt, name })];
  if (r.killed) notes.push(t('boss.dead'));
  const loot = r.killed && r.bossView.you.loot ? r.bossView.you.loot.items : [];
  return buildReport({
    result: r.killedNow ? 'victory' : resultFor(r.winner, 0),
    vs: label,
    ticks: r.ticks,
    side: 0,
    stats: lastBattle.stats,
    heroes: lastBattle.heroes,
    outcomes: r.attacker.heroes.map((h) => ({ name: h.name, died: h.died, wounded: h.wounded, xp: h.xp, levelsGained: h.levelsGained })),
    gold: r.gold,
    loot,
    picks: 0,
    lootInStash: loot.length > 0,
    verified: true,
    online: 'attack',
    notes,
  });
}

/** Null when the duel did not finish with a result (aborted, out of sync, no answer). */
export function duelReport(o: DuelOutcome): BattleReport | null {
  if (!o.result) return null;
  const opp = o.names[o.side === 0 ? 1 : 0];
  return buildReport({
    result: resultFor(o.result.winner, o.side),
    vs: t('battle.vs', { name: opp }),
    ticks: o.result.ticks,
    side: o.side,
    stats: lastBattle.stats,
    heroes: lastBattle.heroes,
    verified: o.result.verified,
    online: 'duel',
    notes: [t('results.friendly')],
  });
}
