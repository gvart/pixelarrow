/**
 * Beasts on the war-table map (design/ux/screens-modes.md M-8 "Boss and lair
 * info", WAR-7): one kit sheet for a lair (its level, when it returns, what
 * beats it, Attack) and for a world boss (shared HP, the damage leaderboard as
 * a table with clan chips, the clans, your tally and chest, Raid it). A
 * disabled action says why under it. "Codex ›" switches to the Codex tab with
 * the beast's sheet (ia.md L4: learn before you raid; how it fights lives
 * there). Also the battle source of a raid segment.
 */
import type Phaser from 'phaser';
import type { Battle } from '../../sim/battle';
import type { BattleSource } from '../../online/battleSource';
import { onlineApi, errorText, type BossView, type RaidTicket } from '../../online/client';
import { raidReport } from '../../online/report';
import { showReport } from '../ResultsScene';
import { backToOnline } from './OnlineScene';
import { beastThumb, encounterName } from '../../ui/beastInfo';
import type { EncounterId } from '../../data/beasts';
import { t, type TKey } from '../../i18n';
import { ScrollArea, type UIMetrics } from '../../ui/kit';
import { addScrollHint, type Modal } from '../../ui/widgets';
import { itemName } from '../../ui/sheet';
import { SHEET_TITLE_H, mosaicImage, mtext, mw, openParchmentSheet, sheetActionsH, wrapWords, type MButtonOpts } from '../../ui/mosaic';
import { uiId } from '../../ui/layout';
import { MOSAIC, TEXT_MIN, lineHeight } from '../../ui/tokens';

type UiScene = Phaser.Scene & { m: UIMetrics; ui: Phaser.GameObjects.Container };

const num = (n: number) => Math.round(n).toLocaleString('en-US');
const LH = Math.ceil(lineHeight(TEXT_MIN));

/** One row of the boss's damage table. */
export interface BoardRow {
  rank: number;
  name: string;
  clan: string | null;
  damage: string;
}

/** The boss's leaderboard as table rows (WAR-7: a table, not " - " lines): the top four. */
export function bossBoard(b: BossView): BoardRow[] {
  return b.top.slice(0, 4).map((x, i) => ({ rank: i + 1, name: x.name, clan: x.clan || null, damage: num(x.damage) }));
}

/** The status lines of a world boss under the table: the clans, your tally, your chest, the segment. */
export function bossLines(b: BossView): string[] {
  const out: string[] = [];
  if (b.status === 'dead') out.push(t('boss.dead'));
  if (!b.top.length) out.push(t('boss.none'));
  out.push(t('war5.boss.yours', { dmg: num(b.you.damage), n: b.you.raids }));
  if (b.you.chest) out.push(t('boss.chest', { name: itemName(b.you.chest.item) }));
  out.push(t('boss.segment', { s: b.segment }));
  return out;
}

export interface WarBeastOpts {
  level: number;
  boss?: BossView;
  /** A lair away from home: when it returns. */
  returnsIn?: string;
  /** Raid it / Attack; `disabled` is the reason, shown under it. */
  action?: { label: string; run: () => void; disabled?: string };
  codex: () => void;
  onClose?: () => void;
}

/** The War beast sheet (docked, X and Back close it). */
export function openWarBeast(scene: UiScene, enc: EncounterId, o: WarBeastOpts): Modal {
  const { VW, VH } = scene.m;
  const w = VW - 8;
  const actions: MButtonOpts[] = [{ label: t('war5.codex'), icon: 'beast', variant: 'secondary', tip: t('war5.codexTip'), id: 'beast.codex', onClick: () => o.codex() }];
  if (o.action) {
    const a = o.action;
    actions.push({ label: a.label, icon: 'swords', variant: a.disabled ? 'disabled' : 'primary', disabledReason: a.disabled, id: 'beast.action', onClick: () => a.run() });
  }
  const capLines = o.action?.disabled ? wrapWords(o.action.disabled, w - 16, (s) => mw(s, 'pInk', TEXT_MIN)).slice(0, 2) : [];
  const capH = capLines.length ? capLines.length * LH + 4 : 0;
  // measure the content once (off screen) so the sheet is as tall as it needs, at most the screen
  const probe = scene.add.container(0, 0);
  const contentH = fill(scene, probe, enc, w - 20, o);
  probe.destroy();
  const s = openParchmentSheet(scene, { title: encounterName(enc), w, h: Math.min(VH - 12, SHEET_TITLE_H + contentH + 6 + capH + sheetActionsH(actions, w) + 8), actions, dock: 'bottom', id: 'online.beast', onClose: o.onClose });
  const b = s.body;
  capLines.forEach((l, i) => s.c.add(mtext(scene, b.x + b.w / 2, b.y + b.h - capH + 2 + i * LH, l, 'pInk', { size: TEXT_MIN, align: 0.5, maxW: b.w })));
  const area = new ScrollArea(scene, s.c, b.x, b.y, b.w, b.h - capH - 2, scene.m.S);
  area.setContentHeight(fill(scene, area.content, enc, b.w - 4, o));
  addScrollHint(scene, s.c, area, MOSAIC.parch);
  s.c.once('destroy', () => area.destroy());
  return s;
}

/** The sheet's content into `c` (width w); returns its height. */
function fill(scene: Phaser.Scene, c: Phaser.GameObjects.Container, enc: EncounterId, w: number, o: WarBeastOpts): number {
  const box = { owner: c, w, h: 2000 };
  const lines = (str: string, font: 'pInk' | 'pSec' | 'pGood', y: number, max = 4): number => {
    const ls = wrapWords(str, w, (x) => mw(x, font, TEXT_MIN)).slice(0, max);
    ls.forEach((l, i) => c.add(mtext(scene, 0, y + i * LH, l, font, { size: TEXT_MIN, maxW: w, box })));
    return y + ls.length * LH;
  };
  // the beast, its kind and level, and the shared HP of a world boss
  const T = 36;
  c.add(mosaicImage(scene, 0, 0, T + 4, T + 4, 'parchmentWell'));
  c.add(scene.add.image(2, 2, beastThumb(scene, enc, T)).setOrigin(0, 0));
  const tx = T + 10;
  const tw = w - tx;
  const boss = o.boss;
  c.add(mtext(scene, tx, 2, boss ? t('war5.boss.level', { n: o.level }) : t('war5.lair.level', { n: o.level }), 'pSec', { size: TEXT_MIN, maxW: tw, box }));
  let y = T + 8;
  if (boss) {
    c.add(mtext(scene, tx, 13, t('boss.hp', { hp: num(boss.hp), max: num(boss.maxHp) }), 'rInk', { size: 7, maxW: tw, box }));
    const g = scene.add.graphics();
    const f = boss.maxHp > 0 ? Math.max(0, Math.min(1, boss.hp / boss.maxHp)) : 0;
    const pips = boss.parts;
    const bw = tw - (pips.length ? pips.length * 6 + 4 : 0);
    g.fillStyle(0x2a1a16, 1).fillRect(tx, 26, bw, 6);
    g.fillStyle(0xa83a2c, 1).fillRect(tx, 26, Math.round(bw * f), 6);
    pips.forEach((alive, i) => g.fillStyle(alive > 0 ? 0x7a3a46 : 0x3a2a22, 1).fillRect(tx + bw + 4 + i * 6, 26, 5, 6));
    c.add(g);
    // the leaderboard as a table: rank, player with the clan chip, damage at the right
    const rows = bossBoard(boss);
    if (rows.length) {
      c.add(mtext(scene, 0, y, t('war5.boss.board').toUpperCase(), 'rInk', { size: 7, maxW: w, box }));
      y += 11;
      const rowH = LH + 4;
      rows.forEach((r, i) => {
        const ry = y + i * rowH;
        if (i % 2 === 0) c.add(mosaicImage(scene, 0, ry - 1, w, rowH, 'parchmentWell'));
        c.add(mtext(scene, 4, ry + 1, `${r.rank}`, 'rInk', { size: 7, box }));
        const dmg = mtext(scene, w - 4, ry + 1, r.damage, 'pInk', { size: TEXT_MIN, align: 1, box });
        c.add(dmg);
        let nx = 16;
        if (r.clan) nx += clanChip(scene, c, nx, ry, r.clan) + 3;
        c.add(mtext(scene, nx, ry + 1, r.name, 'pInk', { size: TEXT_MIN, maxW: w - 4 - dmg.width - 4 - nx, box }));
      });
      y += rows.length * rowH + 3;
    }
    if (boss.clans.length) {
      c.add(mtext(scene, 0, y + 1, `${t('war5.boss.clans')}:`, 'pSec', { size: TEXT_MIN, box }));
      let cx = mw(`${t('war5.boss.clans')}:`, 'pSec', TEXT_MIN) + 4;
      for (const k of boss.clans.slice(0, 2)) {
        const label = `${num(k.damage)}`;
        if (cx + 30 + mw(label, 'pInk', TEXT_MIN) > w) break;
        cx += clanChip(scene, c, cx, y, k.tag) + 3;
        const v = mtext(scene, cx, y + 1, label, 'pInk', { size: TEXT_MIN, box });
        c.add(v);
        cx += v.width + 8;
      }
      y += LH + 4;
    }
    for (const l of bossLines(boss)) y = lines(l, 'pInk', y, 3) + 2;
  } else {
    if (o.returnsIn) y = lines(t('hex.lairBack', { t: o.returnsIn }), 'pInk', y) + 3;
    c.add(mtext(scene, 0, y, t('myth.info.counters').toUpperCase(), 'rInk', { size: 7, maxW: w, box }));
    y = lines(t(`myth.${enc}.counter` as TKey), 'pGood', y + 11, 5) + 3;
  }
  y = lines(t('myth.info.loot'), 'pSec', y, 3);
  return y + 2;
}

/** A clan tag on a small bronze chip (the clan, never colour alone: its letters). Returns its width. */
function clanChip(scene: Phaser.Scene, c: Phaser.GameObjects.Container, x: number, y: number, tag: string): number {
  const w = Math.ceil(mw(tag, 'onAccent', TEXT_MIN)) + 6;
  const g = scene.add.graphics();
  g.fillStyle(0x1a0d06, 1).fillRoundedRect(x, y, w, LH + 2, 2);
  g.fillStyle(MOSAIC.bronze, 1).fillRoundedRect(x + 0.7, y + 0.7, w - 1.4, LH + 0.6, 1.6);
  c.add(g);
  c.add(uiId(mtext(scene, x + 3, y + 1, tag, 'onAccent', { size: TEXT_MIN }), 'beast.clan'));
  return w;
}

export function openLairInfo(scene: UiScene, enc: EncounterId, level: number, o: { returnsIn?: string; attack?: { run: () => void; disabled?: string }; codex: () => void; onClose?: () => void }): Modal {
  return openWarBeast(scene, enc, {
    level,
    returnsIn: o.returnsIn,
    action: o.attack ? { label: t('hex.act.attack'), run: o.attack.run, disabled: o.attack.disabled } : undefined,
    codex: o.codex,
    onClose: o.onClose,
  });
}

export function openBossInfo(scene: UiScene, b: BossView, o: { raid: () => void; disabled?: string; codex: () => void; onClose?: () => void }): Modal {
  return openWarBeast(scene, b.boss as EncounterId, { level: b.level, boss: b, action: { label: t('boss.attack'), run: o.raid, disabled: o.disabled }, codex: o.codex, onClose: o.onClose });
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
