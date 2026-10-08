import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, addPanel, addScroll, addText } from '../ui/kit';
import { ensurePortrait } from '../ui/sprites';
import { dollFromHero } from '../art/paperdoll';
import { MenuBattle } from './menu/MenuBattle';
import { state } from '../state';
import { inTelegram, telegramUserName } from '../platform/telegram';
import { openSettings } from '../ui/settings';
import { demoNotifySource, openAbout, openNotifySettings } from '../ui/notifySettings';
import { addSyncBadge } from '../ui/online';
import { confirmDialog } from '../ui/widgets';
import { ListRow, addChecklist, addNumbers, ofCount, type SitNumber } from '../ui/strategos';
import { ellipsize, wrapText } from '../ui/textfit';
import { SIZE, STRAT } from '../ui/theme';
import { t } from '../i18n';

/**
 * The hub (docs/UI_STRATEGOS.md "Home"): the title scroll, the situation card
 * of the save (who, where, what is up, numbers with words), ONE primary
 * (Continue the march), the other starts as rows with a line of context, and
 * the first-steps checklist. Short screens fold the rows into two columns.
 * Behind it all, in the free band under the rows, the player's own men fight
 * a looping skirmish (src/scenes/menu/MenuBattle.ts).
 */
export class MenuScene extends BaseScene {
  private battle: MenuBattle | null = null;
  private overlay: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Menu');
  }

  create(data?: { settings?: 'notify' }): void {
    this.initUi();
    this.screen({ back: null }); // root: Telegram shows Close
    const { VW, VH } = this.m;
    const c = state.campaign.data;
    // the plain under everything; the skirmish starts once the layout says where the free band is
    this.battle = new MenuBattle(this, c.heroes, (Date.now() % 100000) | 1);
    this.events.once('shutdown', () => {
      this.battle?.destroy();
      this.battle = null;
    });
    const compact = VH < STRAT.compactVH;
    const x0 = 8;
    const w = VW - 16;
    let y = compact ? 4 : 8;

    // ---- title
    if (compact) {
      this.ui.add(addText(this, VW / 2, y, 'Pixelarrow', 'title', 0.5));
      y += 14;
    } else {
      const tw = Math.min(w, 176);
      const tx = Math.round((VW - tw) / 2);
      addScroll(this, this.ui, tx, y + 4, tw, 44);
      const title = addText(this, VW / 2, y + 11, 'Pixelarrow', 'red', 0.5);
      title.setFontSize(14);
      this.ui.add(title);
      this.ui.add(addText(this, VW / 2, y + 30, ellipsize(t('menu.subtitle'), tw - 16), 'ink', 0.5));
      y += 54;
    }

    // ---- the situation of the save: who, where, what is up; numbers with words
    const lead = c.heroes[0];
    const cardH = compact ? 50 : 56;
    this.ui.add(addPanel(this, x0, y, w, cardH, 'parch'));
    let tx = x0 + 6;
    if (lead && !compact) {
      this.ui.add(addPanel(this, x0 + 6, y + 6, 28, 28, 'slot'));
      this.ui.add(this.add.image(x0 + 8, y + 8, ensurePortrait(this, dollFromHero(lead))).setOrigin(0, 0).setCrop(0, 0, 24, 24));
      tx = x0 + 40;
    }
    const tw2 = x0 + w - 6 - tx - 14;
    const day = Math.floor(c.world.time / 24) + 1;
    const inside = state.hasSave ? state.campaign.world.s.inside : -1;
    const place = inside >= 0 ? state.campaign.world.settlement(inside)?.name : undefined;
    const hurt = c.heroes.filter((h) => (h.wound ?? 0) > 0).length;
    const who = lead ? t('menu.strategos', { name: lead.name }) : t('menu.noSave');
    const where = !state.hasSave ? t('menu.status.noSave') : place ? t('menu.where.inside', { n: day, place }) : t('menu.where.day', { n: day });
    const status = !state.hasSave ? t('menu.status.fresh') : hurt > 0 ? t('menu.status.hurt', { n: hurt }) : t('menu.status.ready');
    this.ui.add(addText(this, tx, y + 6, ellipsize(who, tw2), 'ink'));
    this.ui.add(addText(this, tx, y + 16, ellipsize(where, tw2), 'dim'));
    this.ui.add(addText(this, tx, y + 26, ellipsize(status, tw2), hurt > 0 && state.hasSave ? 'red' : 'ink'));
    const nums: SitNumber[] = [
      { icon: 'coin', value: `${c.gold}`, word: t('strat.gold'), tip: t('menu.tip.gold') },
      { icon: 'people', value: `${c.heroes.length}`, word: hurt > 0 ? `${t('strat.menWord', { n: c.heroes.length })}, ${hurt} ${t('strat.hurtWord', { n: hurt })}` : t('strat.menWord', { n: c.heroes.length }), tip: t('menu.tip.army') },
      { icon: 'star', value: `${c.won}`, word: t('menu.wonWord', { n: c.won }), tip: t('menu.tip.record') },
    ];
    addNumbers(this, this.ui, x0 + 6, y + cardH - 12, w - 12 - 18, nums);
    addSyncBadge(this, this.ui, x0 + w - 18, y + cardH - 14);
    y += cardH + SIZE.gap + 1;

    // ---- the one primary
    const cont = new Button(this, x0, y, w, 26, { label: t('menu.continueMarch'), icon: 'play', inline: true, variant: 'primary', id: 'menu.continue', onClick: () => this.continueCampaign() });
    cont.setEnabled(state.hasSave, t('menu.noSave'));
    this.ui.add(cont);
    y += 26 + SIZE.gap + 1;

    // ---- the other starts: rows with a line of context (two columns on short screens)
    const rows: { label: string; sub: string; icon: string; id: string; onClick: () => void }[] = [
      { label: t('menu.newCampaign'), sub: t('menu.row.new'), icon: 'flag', id: 'menu.new', onClick: () => (state.hasSave ? this.confirmReset() : this.newCampaign()) },
      { label: t('menu.online'), sub: t('menu.row.online'), icon: 'map', id: 'menu.online', onClick: () => this.scene.start('Online', {}) },
      { label: t('menu.duels'), sub: t('menu.row.duels'), icon: 'swords', id: 'menu.duels', onClick: () => this.openDuels() },
      { label: t('menu.trial'), sub: t('menu.row.trial'), icon: 'beast', id: 'menu.trial', onClick: () => this.openTrial() },
      { label: t('menu.shop'), sub: t('menu.row.shop'), icon: 'coin', id: 'menu.shop', onClick: () => this.openShop() },
      { label: t('menu.settings'), sub: t('menu.row.settings'), icon: 'gear', id: 'menu.settings', onClick: () => this.openSettings() },
    ];
    if (compact) {
      const half = Math.floor((w - SIZE.gap) / 2);
      rows.forEach((r, i) => {
        const col = i % 2;
        const rx = x0 + col * (half + SIZE.gap);
        this.ui.add(new Button(this, rx, y + Math.floor(i / 2) * (22 + SIZE.gap), col ? w - half - SIZE.gap : half, 22, { label: r.label, icon: r.icon, id: r.id, onClick: r.onClick }));
      });
      y += 3 * (22 + SIZE.gap);
    } else {
      rows.forEach((r) => {
        this.ui.add(new ListRow(this, x0, y, w, { label: r.label, sub: r.sub, icon: r.icon, id: r.id, onClick: r.onClick }, 24));
        y += 24 + SIZE.gap;
      });
    }
    y += 2;

    // ---- the save's home and the first steps, with the skirmish on the plain around them
    const who2 = telegramUserName();
    const saveLabel = inTelegram() ? (who2 ? t('menu.cloudSaveOf', { name: who2 }) : t('menu.cloudSave')) : t('menu.localSave');
    const room = VH - 4 - y;
    if (!compact && room >= 40) {
      const steps = this.firstSteps();
      const done = steps.filter((s) => s.done).length;
      const cw = Math.min(112, Math.floor(w * 0.62));
      const ch = addChecklist(this, this.ui, x0, y, cw, t('menu.firstSteps', { done: ofCount(done, steps.length) }), steps);
      const wr = wrapText(saveLabel, w - cw - 8, 2, true);
      const label = addText(this, x0 + w, VH - 4 - wr.lines.length * 10, wr.lines.join('\n'), 'light', 1);
      label.setRightAlign();
      this.ui.add(label);
      // the skirmish is drawn under the checklist and the label; its melee sits in the clear part of the band
      this.battle?.start({ x: x0, y, w, h: room + 4, panelRight: x0 + cw + 2, panelBottom: y + ch, labelH: wr.lines.length * 10 + 2 });
    } else {
      this.battle?.still();
      if (room >= 12) this.ui.add(addText(this, VW / 2, VH - 12, ellipsize(saveLabel, w, true), 'light', 0.5));
    }
    // Opened from a bot message's "Open in the game" (startapp=settings).
    if (data?.settings === 'notify') this.openNotifications();
  }

  /** The first-steps checklist: what the save says the player has done. */
  private firstSteps(): { text: string; done: boolean }[] {
    const c = state.campaign.data;
    const st = c.settings;
    const tut = st.tutorial?.status;
    const seen = st.seenHints ?? [];
    return [
      { text: t('menu.step.tutorial'), done: tut === 'done' || tut === 'skipped' },
      { text: t('menu.step.battle'), done: c.won > 0 },
      { text: t('menu.step.hire'), done: c.heroes.length >= 4 },
      { text: t('menu.step.gear'), done: seen.includes('*') || seen.includes('army') || seen.includes('hero') },
    ];
  }

  /** Settings with the notification switches on top (`demo`: in-memory switches, for the layout check). */
  openNotifications(demo = false): void {
    this.openSettings();
    openNotifySettings(this, demo ? { source: demoNotifySource() } : {});
  }

  /** Settings → About (terms, privacy, refunds). */
  openAboutPage(): void {
    this.openSettings();
    openAbout(this);
  }

  update(_time: number, delta: number): void {
    this.battle?.update(delta);
  }

  private closeOverlay(): void {
    this.overlay?.destroy();
    this.overlay = null;
  }

  /** The shop scene (wallet, cosmetics, consumables, season pass). */
  openShop(): void {
    this.closeOverlay();
    this.scene.start('Shop', { back: { scene: 'Menu' } });
  }

  /** The duel hub: the persistent duel army, the ladder and the duel shop. */
  openDuels(): void {
    this.closeOverlay();
    this.scene.start('Duel', {});
  }

  /** The Beast trial: fight any mythical beast offline. */
  openTrial(): void {
    this.closeOverlay();
    this.scene.start('BeastTrial');
  }

  private openSettings(): void {
    this.closeOverlay();
    openSettings(this);
  }

  private continueCampaign(): void {
    const w = state.campaign.world;
    if (w.s.inside >= 0) this.scene.start('Settlement', { id: w.s.inside });
    else this.scene.start('World');
  }

  private newCampaign(): void {
    void state.reset().then(() => this.scene.start('World'));
  }

  private confirmReset(): void {
    const prev = this.overlay;
    const c = confirmDialog(this, {
      title: t('menu.resetTitle'),
      body: t('menu.resetBody'),
      cancel: t('common.cancel'),
      ok: t('menu.resetOk'),
      destructive: true,
      onOk: () => this.newCampaign(),
    });
    this.overlay = c;
    c.once('destroy', () => this.overlay === c && (this.overlay = null));
    prev?.destroy();
  }
}
