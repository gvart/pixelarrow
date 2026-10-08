import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, addPanel, addScroll, addText, panelK } from '../ui/kit';
import { ensurePortrait } from '../ui/sprites';
import { dollFromHero } from '../art/paperdoll';
import { MenuBattle } from './menu/MenuBattle';
import { state } from '../state';
import { inTelegram, telegramUserName } from '../platform/telegram';
import { openSettings } from '../ui/settings';
import { demoNotifySource, openAbout, openNotifySettings } from '../ui/notifySettings';
import { addSyncBadge } from '../ui/online';
import { confirmDialog } from '../ui/widgets';
import { addNumbers, ofCount, type SitNumber } from '../ui/strategos';
import { ellipsize } from '../ui/textfit';
import { SIZE } from '../ui/theme';
import { t } from '../i18n';

/** The menu below the stage: card, Continue, the grid of starts, the first-steps line and the save label. */
const CARD_H = 50;
const GRID_ROWS = 3;
const MENU_H = 4 + CARD_H + SIZE.gap + 1 + 26 + SIZE.gap + 1 + GRID_ROWS * (22 + SIZE.gap) + 2 + 10 + 10 + 4;

/**
 * The hub (docs/UI_STRATEGOS.md "Home"): the top of the screen is a
 * cinematic stage where the player's own men fight a looping skirmish
 * (src/scenes/menu/MenuBattle.ts) with the title scroll laid over it; below,
 * the situation card of the save (who, where, what is up, numbers with
 * words), ONE primary (Continue the march), the other starts as a compact
 * grid, the next first step and the save's home.
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
    const x0 = 8;
    const w = VW - 16;
    this.addGrassBackdrop(11);

    // ---- the stage: as tall as the menu leaves, up to half the screen; the battle is drawn at 2x when there is room
    const stageH = Math.min(Math.round(VH * 0.5), VH - MENU_H);
    let y: number;
    if (stageH >= 56) {
      this.battle = new MenuBattle(this, c.heroes, (Date.now() % 100000) | 1);
      this.events.once('shutdown', () => {
        this.battle?.destroy();
        this.battle = null;
      });
      this.battle.start({ x: 0, y: 0, w: VW, h: stageH, zoom: stageH >= 160 && VW >= 180 ? 2 : 1 });
      // a quiet dim under the menu keeps it readable on the plain
      const dim = this.add.graphics();
      dim.fillStyle(0x1a100c, 0.22);
      dim.fillRect(0, stageH, VW, VH - stageH);
      this.ui.add(dim);
      // the title scroll laid over the top of the stage
      const tw = Math.min(w, 150);
      const tx = Math.round((VW - tw) / 2);
      addScroll(this, this.ui, tx, 6, tw, 42);
      // the wordmark: bronze small capitals, the subtitle spaced out under a rule
      const title = addText(this, VW / 2, 11, 'Pixelarrow', 'head', 0.5);
      title.setFontSize(13);
      this.ui.add(title);
      const sub = ellipsize(t('menu.subtitle').toUpperCase(), tw - 16, false, 5);
      this.ui.add(addText(this, VW / 2, 35, sub, 'dim', 0.5).setFontSize(5).setLetterSpacing(panelK(this) * 1.1));
      y = stageH + 4;
    } else {
      // no room for a stage (a very short window): the title line alone
      this.ui.add(addText(this, VW / 2, 4, 'Pixelarrow', 'head', 0.5).setFontSize(9));
      y = 18;
    }

    // ---- the situation of the save: who, where, what is up; numbers with words
    const lead = c.heroes[0];
    this.ui.add(addPanel(this, x0, y, w, CARD_H, 'parch'));
    let tx = x0 + 6;
    if (lead) {
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
    addNumbers(this, this.ui, x0 + 6, y + CARD_H - 12, w - 12 - 18, nums);
    addSyncBadge(this, this.ui, x0 + w - 18, y + CARD_H - 14);
    y += CARD_H + SIZE.gap + 1;

    // ---- the one primary
    const cont = new Button(this, x0, y, w, 26, { label: t('menu.continueMarch'), icon: 'play', inline: true, variant: 'primary', id: 'menu.continue', onClick: () => this.continueCampaign() });
    cont.setEnabled(state.hasSave, t('menu.noSave'));
    this.ui.add(cont);
    y += 26 + SIZE.gap + 1;

    // ---- the other starts: a grid of two columns
    const rows: { label: string; icon: string; id: string; onClick: () => void }[] = [
      { label: t('menu.newCampaign'), icon: 'flag', id: 'menu.new', onClick: () => (state.hasSave ? this.confirmReset() : this.newCampaign()) },
      { label: t('menu.online'), icon: 'map', id: 'menu.online', onClick: () => this.scene.start('Online', {}) },
      { label: t('menu.duels'), icon: 'swords', id: 'menu.duels', onClick: () => this.openDuels() },
      { label: t('menu.trial'), icon: 'beast', id: 'menu.trial', onClick: () => this.openTrial() },
      { label: t('menu.shop'), icon: 'coin', id: 'menu.shop', onClick: () => this.openShop() },
      { label: t('menu.settings'), icon: 'gear', id: 'menu.settings', onClick: () => this.openSettings() },
    ];
    const half = Math.floor((w - SIZE.gap) / 2);
    rows.forEach((r, i) => {
      const col = i % 2;
      const rx = x0 + col * (half + SIZE.gap);
      this.ui.add(new Button(this, rx, y + Math.floor(i / 2) * (22 + SIZE.gap), col ? w - half - SIZE.gap : half, 22, { label: r.label, icon: r.icon, id: r.id, onClick: r.onClick }));
    });
    y += GRID_ROWS * (22 + SIZE.gap) + 2;

    // ---- the next first step, and the save's home
    const who2 = telegramUserName();
    const saveLabel = inTelegram() ? (who2 ? t('menu.cloudSaveOf', { name: who2 }) : t('menu.cloudSave')) : t('menu.localSave');
    const steps = this.firstSteps();
    const done = steps.filter((s) => s.done).length;
    const next = steps.find((s) => !s.done);
    const stepLine = next ? `${t('menu.firstSteps', { done: ofCount(done, steps.length) })} · ${next.text}` : t('menu.firstSteps', { done: ofCount(done, steps.length) });
    if (VH - y >= 24) {
      this.ui.add(addText(this, x0, y, ellipsize(stepLine, w, true), 'light'));
      y += 10;
    }
    if (VH - y >= 12) this.ui.add(addText(this, VW / 2, Math.min(y + 2, VH - 12), ellipsize(saveLabel, w, true), 'light', 0.5));
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
