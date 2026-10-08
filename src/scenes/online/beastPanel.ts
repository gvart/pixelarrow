/**
 * Beasts on the war-table map: the info panel of a lair (how its beast
 * fights, what beats it, Attack) and of a world boss (shared HP, the damage
 * leaderboard of players and clans, your tally, Raid), and the battle source
 * of a raid segment.
 */
import type Phaser from 'phaser';
import type { Battle } from '../../sim/battle';
import type { BattleSource } from '../../online/battleSource';
import { onlineApi, errorText, type BossView, type RaidTicket } from '../../online/client';
import { raidReport } from '../../online/report';
import { showReport } from '../ResultsScene';
import { backToOnline } from './OnlineScene';
import { openBeastInfo, encounterName } from '../../ui/beastInfo';
import type { EncounterId } from '../../data/beasts';
import { t } from '../../i18n';
import type { UIMetrics } from '../../ui/kit';
import type { Modal } from '../../ui/widgets';

type UiScene = Phaser.Scene & { m: UIMetrics; ui: Phaser.GameObjects.Container };

const num = (n: number) => Math.round(n).toLocaleString('en-US');

/** The status lines of a world boss: HP, the top damage dealers, the clans, your own tally. */
export function bossLines(b: BossView): string[] {
  const out = [t('boss.hp', { hp: num(b.hp), max: num(b.maxHp) })];
  if (b.status === 'dead') out.push(t('boss.dead'));
  if (b.top.length) {
    out.push(`${t('boss.top')}:`);
    b.top.slice(0, 4).forEach((x, i) => out.push(`${i + 1}. ${x.name}${x.clan ? ` [${x.clan}]` : ''} - ${num(x.damage)}`));
  } else out.push(t('boss.none'));
  if (b.clans.length) out.push(b.clans.slice(0, 2).map((c) => `[${c.tag}] ${num(c.damage)}`).join('  '));
  out.push(`${t('boss.you', { dmg: num(b.you.damage) })} (${t('boss.raids', { n: b.you.raids })})`);
  out.push(t('boss.segment', { s: b.segment }));
  return out;
}

export function openLairInfo(scene: UiScene, enc: EncounterId, level: number, o: { returnsIn?: string; attack?: { run: () => void; disabled?: string } }): Modal {
  return openBeastInfo(scene, enc, {
    level,
    extra: o.returnsIn ? [t('hex.lairBack', { t: o.returnsIn })] : undefined,
    action: o.attack ? { label: t('hex.act.attack'), icon: 'swords', run: o.attack.run, disabled: o.attack.disabled } : undefined,
  });
}

export function openBossInfo(scene: UiScene, b: BossView, o: { raid: () => void; disabled?: string }): Modal {
  return openBeastInfo(scene, b.boss as EncounterId, {
    level: b.level,
    hp: { v: b.hp, max: b.maxHp, pips: b.parts.map((p) => p > 0) },
    extra: bossLines(b),
    action: { label: t('boss.attack'), icon: 'swords', run: o.raid, disabled: o.disabled },
  });
}

/** The battle scene's source for a raid segment: submit, then the report and back to the map. */
export function raidSource(game: Phaser.Game, tk: RaidTicket): BattleSource {
  const label = encounterName(tk.boss as EncounterId);
  return {
    setup: tk.setup,
    heroes: [...tk.attackers, ...tk.defenders],
    side: 0,
    label: t('battle.vs', { name: label }),
    onFinish(sim: Battle, deployOrders: number) {
      const orders = sim.orderLog.filter((o) => o.side === 0).map((o) => ({ tick: o.tick, side: o.side, order: o.order }));
      const deployed = sim.orderLog.slice(0, deployOrders).filter((o) => o.side === 0).length;
      onlineApi
        .raidSubmit(tk.ticket, orders, deployed, { winner: sim.winner ?? -1, ticks: sim.tick, hash: sim.hash() })
        .then((r) => showReport(game, raidReport(r, this.label), () => backToOnline(game, { focus: tk.loc })))
        .catch((e) => backToOnline(game, { attack: { error: errorText(e) }, focus: tk.loc }));
    },
    onLeave() {
      void onlineApi.raidAbandon(tk.ticket).catch(() => undefined);
      backToOnline(game, { focus: tk.loc });
    },
  };
}
