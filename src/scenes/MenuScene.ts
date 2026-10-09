import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, addPanel, addScroll, addText, panelK } from '../ui/kit';
import { ProgressBar, Tile, addCard, fitChips, layChips, resourceChipOpts, type TileOpts } from '../ui/v3';
import { ACCENT, SURFACE } from '../ui/tokens';
import { DUEL_RULES } from '../duel/rules';
import { addPortrait } from '../ui/sprites';
import { dollFromHero } from '../art/paperdoll';
import { MenuBattle } from './menu/MenuBattle';
import { state } from '../state';
import { inTelegram, telegramUserName } from '../platform/telegram';
import { confirmNewCampaign, openSettings } from '../ui/settings';
import { demoNotifySource, openAbout, openNotifySettings } from '../ui/notifySettings';
import { addSyncBadge } from '../ui/online';
import { ofCount } from '../ui/strategos';
import { ellipsize, measureText } from '../ui/textfit';
import { t } from '../i18n';

/** The menu below the stage (UI px): the save's card, the hero CTA, three mode tiles, the utility row, first steps. */
const CARD_H = 58;
const CONT_H = 30;
const TILE_H = 50;
const TILE_H_COMPACT = 40;
const UTIL_H = 28;
const menuH = (tileH: number) => 4 + CARD_H + 5 + CONT_H + 5 + tileH + 4 + UTIL_H + 4 + 18 + 4;

/**
 * The hub (docs/UI_KIT.md "Home"): the top of the screen is a cinematic stage
 * where the player's own men fight a looping skirmish
 * (src/scenes/menu/MenuBattle.ts) under the title; below it, in order of
 * importance: the save's card (who, where, campaign gold and battles won),
 * the one hero action (Continue the march), the three game modes as big
 * tiles (Duels, Online, Beasts), then the utility row (Shop, New campaign,
 * Settings) and the first-steps progress.
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
    const w = Math.min(VW - 12, 300);
    const x0 = Math.round((VW - w) / 2);
    this.addGrassBackdrop(11);

    // ---- the stage: what the menu leaves, at most 42% of the screen
    const tileH = VH - menuH(TILE_H) >= 90 ? TILE_H : TILE_H_COMPACT;
    const stageH = Math.min(Math.round(VH * 0.42), VH - menuH(tileH));
    let y: number;
    if (stageH >= 56) {
      this.battle = new MenuBattle(this, c.heroes, (Date.now() % 100000) | 1);
      this.events.once('shutdown', () => {
        this.battle?.destroy();
        this.battle = null;
      });
      this.battle.start({ x: 0, y: 0, w: VW, h: stageH, zoom: stageH >= 160 && VW >= 320 ? 2 : stageH >= 100 && VW >= 150 ? 1.5 : 1 });
      // the page under the stage: deep warm stone, a bronze edge where the field ends
      this.ui.add(this.add.rectangle(0, stageH, VW, VH - stageH, SURFACE.bg, 0.94).setOrigin(0, 0));
      this.ui.add(this.add.rectangle(0, stageH, VW, 1, SURFACE.rim).setOrigin(0, 0));
      const tw = Math.min(w, 150);
      const tx = Math.round((VW - tw) / 2);
      addScroll(this, this.ui, tx, 6, tw, 42);
      const title = addText(this, VW / 2, 11, 'Pixelarrow', 'head', 0.5);
      title.setFontSize(13);
      this.ui.add(title);
      const sub = ellipsize(t('menu.subtitle').toUpperCase(), tw - 16, false, 5);
      this.ui.add(addText(this, VW / 2, 35, sub, 'dim', 0.5).setFontSize(5).setLetterSpacing(panelK(this) * 1.1));
      y = stageH + 4;
    } else {
      this.ui.add(this.add.rectangle(0, 0, VW, VH, SURFACE.bg, 0.94).setOrigin(0, 0));
      this.ui.add(addText(this, VW / 2, 4, 'Pixelarrow', 'head', 0.5).setFontSize(9));
      y = 18;
    }

    // ---- the save: the strategos, where the army is, what is up; campaign gold, battles won, men
    const lead = c.heroes[0];
    addCard(this, this.ui, x0, y, w, CARD_H, 'cardRaised');
    let tx = x0 + 8;
    if (lead) {
      this.ui.add(addPanel(this, x0 + 6, y + 6, 26, 26, 'well'));
      this.ui.add(addPortrait(this, dollFromHero(lead), x0 + 7, y + 7, { size: 24 }));
      tx = x0 + 37;
    }
    const tw2 = x0 + w - 24 - tx;
    const day = Math.floor(c.world.time / 24) + 1;
    const inside = state.hasSave ? state.campaign.world.s.inside : -1;
    const place = inside >= 0 ? state.campaign.world.settlement(inside)?.name : undefined;
    const hurt = c.heroes.filter((h) => (h.wound ?? 0) > 0).length;
    const who = lead ? t('menu.strategos', { name: lead.name }) : t('menu.noSave');
    const where = !state.hasSave ? t('menu.status.noSave') : place ? t('menu.where.inside', { n: day, place }) : t('menu.where.day', { n: day });
    const status = !state.hasSave ? t('menu.status.fresh') : hurt > 0 ? t('menu.status.hurt', { n: hurt }) : t('menu.status.ready');
    // "Name, strategos" where it fits whole, else the name alone
    const whoFits = measureText(who, false, 7, 'head') <= tw2;
    this.ui.add(addText(this, tx, y + 6, ellipsize(whoFits || !lead ? who : lead.name, tw2, false, 7, 'head'), 'head'));
    // where and how the men are: one line when it fits, else the more urgent half
    const both = `${where} · ${status}`;
    const line = measureText(both) <= tw2 ? both : hurt > 0 && state.hasSave ? status : where;
    this.ui.add(addText(this, tx, y + 18, ellipsize(line, tw2), hurt > 0 && state.hasSave ? 'bad' : 'sec'));
    const chips = fitChips(this, [
      resourceChipOpts('gold', c.gold, { word: t('strat.gold'), tipKey: 'res.tip.gold.campaign', id: 'menu.gold' }),
      { icon: 'trophy', value: c.won, word: t('menu.wonWord', { n: c.won }), tip: `${t('menu.tip.record')}: ${t('menu.record', { won: c.won, fought: c.fought })}`, id: 'menu.wins' },
      { icon: 'people', lead: t('menu.warband'), value: c.heroes.length, tip: t('menu.tip.warband', { n: c.heroes.length }), id: 'menu.men' },
    ], w - 12);
    layChips(this.ui, chips, x0 + 6, y + CARD_H - 27, w - 12);
    addSyncBadge(this, this.ui, x0 + w - 20, y + 4);
    y += CARD_H + 5;

    // ---- the one hero action
    // (no save yet: the same place begins one; "New campaign" over a save lives in Settings, confirmed)
    const cont = state.hasSave
      ? new Button(this, x0, y, w, CONT_H, { label: t('menu.continueMarch'), icon: 'march', inline: true, variant: 'primary', id: 'menu.continue', onClick: () => this.continueCampaign() })
      : new Button(this, x0, y, w, CONT_H, { label: t('menu.beginMarch'), icon: 'march', inline: true, variant: 'primary', id: 'menu.new', onClick: () => this.newCampaign() });
    this.ui.add(cont);
    y += CONT_H + 5;

    // ---- the game modes: three big tiles
    const modes: TileOpts[] = [
      { icon: 'swords', label: t('menu.duels'), tip: t('menu.row.duels', { n: DUEL_RULES.rankedLevel }), id: 'menu.duels', raised: true, onClick: () => this.openDuels() },
      { icon: 'map', label: t('menu.online'), tip: t('menu.row.online'), id: 'menu.online', raised: true, onClick: () => this.scene.start('Online', {}) },
      { icon: 'beast', label: t('menu.trial'), tip: t('menu.row.trial'), id: 'menu.trial', raised: true, onClick: () => this.openTrial() },
    ];
    const gap = 4;
    const mw = Math.floor((w - 2 * gap) / 3);
    modes.forEach((o, i) => this.ui.add(new Tile(this, x0 + i * (mw + gap), y, i === 2 ? w - 2 * (mw + gap) : mw, tileH, { ...o, iconScale: tileH >= TILE_H ? 2 : 1.5 })));
    y += tileH + 4;

    // ---- utility: smaller, quieter
    const util: { label: string; icon: string; id: string; tip: string; onClick: () => void }[] = [
      { label: t('menu.shop'), icon: 'shop', id: 'menu.shop', tip: t('menu.row.shop'), onClick: () => this.openShop() },
      { label: t('menu.settings'), icon: 'gear', id: 'menu.settings', tip: t('menu.row.settings'), onClick: () => this.openSettings() },
    ];
    const uw = Math.floor((w - gap) / 2);
    util.forEach((u, i) => this.ui.add(new Button(this, x0 + i * (uw + gap), y, i === 1 ? w - (uw + gap) : uw, UTIL_H, { label: u.label, icon: u.icon, inline: true, variant: 'ghost', id: u.id, tip: u.tip, onClick: u.onClick })));
    y += UTIL_H + 4;

    // ---- first steps: a progress line with the next step, and where the save lives ("New campaign" is in Settings → Account)
    const steps = this.firstSteps();
    const done = steps.filter((s) => s.done).length;
    const next = steps.find((s) => !s.done);
    const lw = w;
    if (next && VH - y >= 14) {
      const label = `${t('menu.firstSteps', { done: ofCount(done, steps.length) })} · ${next.text}`;
      this.ui.add(new ProgressBar(this, x0 + 2, y + 3, lw - 4, { value: done, max: steps.length, h: 3, label, color: ACCENT.gold }));
      y += 26;
    } else if (VH - y >= 12) {
      const who2 = telegramUserName();
      const saveLabel = inTelegram() ? (who2 ? t('menu.cloudSaveOf', { name: who2 }) : t('menu.cloudSave')) : t('menu.localSave');
      this.ui.add(addText(this, x0 + 2, y + 7, ellipsize(saveLabel, lw - 2), 'muted'));
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

  /** "New campaign?" (the shared confirmation; Settings → Account opens the same). */
  confirmReset(): void {
    const prev = this.overlay;
    const c = confirmNewCampaign(this);
    this.overlay = c;
    c.once('destroy', () => this.overlay === c && (this.overlay = null));
    prev?.destroy();
  }
}
