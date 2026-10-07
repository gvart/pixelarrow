/**
 * First-run screens (docs/DESIGN_V2.md "Onboarding"):
 * - offer: on the very first launch old Nikias offers the tutorial
 *   (recommended) or a skip;
 * - resume: the tutorial was interrupted (the app closed): pick it up again;
 * - reward: after the tutorial, a little gold and a common item;
 * - modes: the two ways to play, Campaign (offline) and the Online war.
 */
import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, addPanel, addScroll, addText, addIcon } from '../ui/kit';
import { CountUp, ItemIcon, confirmDialog } from '../ui/widgets';
import { ensureFonts, rarityFont } from '../ui/fonts';
import { ellipsize, wrapText, LINE_H } from '../ui/textfit';
import { SIZE } from '../ui/theme';
import { uiFrame } from '../ui/layout';
import { ensureNarratorTextures } from '../ui/tutorial/narrator';
import { NARRATOR_SIZE } from '../art/narrator';
import { state } from '../state';
import { progressOf, skipTutorial, TUTORIAL_REWARD } from '../game/tutorial';
import { track } from '../platform/analytics';
import { itemDef, type Item } from '../data/items';
import { uiLevelUp } from '../audio/hooks';
import { hapticNotify } from '../platform/telegram';
import { t, tOr } from '../i18n';

export type FirstRunMode = 'offer' | 'resume' | 'reward' | 'modes';

export interface FirstRunData {
  mode?: FirstRunMode;
  /** The reward item (mode 'reward'). */
  item?: Item;
}

export class FirstRunScene extends BaseScene {
  private mode: FirstRunMode = 'offer';
  private portrait: Phaser.GameObjects.Image | null = null;
  private dialog: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('FirstRun');
  }

  create(data: FirstRunData): void {
    this.mode = data?.mode ?? 'offer';
    this.portrait = null;
    this.dialog = null;
    this.initUi();
    const root = this.mode === 'offer' || this.mode === 'resume';
    this.screen({ back: root ? null : () => this.scene.start('Menu') });
    this.addGrassBackdrop(13);
    ensureNarratorTextures(this);
    ensureFonts(this);
    if (this.mode === 'modes') this.buildModes();
    else if (this.mode === 'reward') this.buildReward(data?.item ?? null);
    else this.buildOffer(this.mode === 'resume');
  }

  update(time: number): void {
    if (!this.portrait) return;
    const blink = time % 3100 < 130;
    this.portrait.setTexture(`narrator_${blink ? 2 : 0}`);
  }

  /** Title on a scroll at the top; returns the y below it. */
  private title(text: string): number {
    const { VW } = this.m;
    const tw = Math.min(VW - 16, 176);
    const tx = Math.round((VW - tw) / 2);
    addScroll(this, this.ui, tx, 8, tw, 30);
    this.ui.add(addText(this, VW / 2, 18, ellipsize(text.toUpperCase(), tw - 16), 'red', 0.5));
    return 8 + 30 + 4;
  }

  /** Nikias and his line: a big portrait over a speech panel, or side by side when the screen is short. */
  private speech(y: number, bottom: number, text: string): number {
    const { VW } = this.m;
    const w = Math.min(VW - 16, 200);
    const x = Math.round((VW - w) / 2);
    const big = bottom - y >= 2 * NARRATOR_SIZE + 8 + 12 + 4 * LINE_H + 16;
    const scale = big ? 2 : 1;
    const ps = NARRATOR_SIZE * scale + 4;
    if (big) {
      const px = Math.round((VW - ps) / 2);
      this.ui.add(addPanel(this, px, y, ps, ps, 'inset'));
      this.portrait = this.add.image(px + 2, y + 2, 'narrator_0').setOrigin(0, 0).setScale(2);
      this.ui.add(this.portrait);
      y += ps + 4;
      const lines = wrapText(text, w - 16, 6).lines;
      const h = 14 + lines.length * LINE_H + 6;
      this.ui.add(addPanel(this, x, y, w, h, 'parch'));
      this.ui.add(addText(this, VW / 2, y + 5, t('tut.narrator').toUpperCase(), 'red', 0.5));
      const body = addText(this, VW / 2, y + 16, lines.join('\n'), 'ink', 0.5).setCenterAlign();
      this.ui.add(body);
      return y + h + 4;
    }
    const tx = x + ps + 8;
    const lines = wrapText(text, x + w - 6 - tx, 6).lines;
    const h = Math.max(ps + 8, 16 + lines.length * LINE_H + 6);
    this.ui.add(addPanel(this, x, y, w, h, 'parch'));
    this.ui.add(addPanel(this, x + 4, y + 4, ps, ps, 'inset'));
    this.portrait = this.add.image(x + 6, y + 6, 'narrator_0').setOrigin(0, 0);
    this.ui.add(this.portrait);
    this.ui.add(addText(this, tx, y + 5, ellipsize(t('tut.narrator').toUpperCase(), x + w - 6 - tx), 'red'));
    this.ui.add(addText(this, tx, y + 17, lines.join('\n'), 'ink'));
    return y + h + 4;
  }

  /** Buttons stacked from the bottom edge up (the first is the primary, at the bottom). */
  private bottomButtons(items: { label: string; icon: string; primary?: boolean; onClick: () => void }[]): number {
    const { VW, VH } = this.m;
    const w = Math.min(VW - 16, 200);
    const x = Math.round((VW - w) / 2);
    let y = VH - 8 - SIZE.btnH;
    for (const it of items) {
      this.ui.add(new Button(this, x, y, w, SIZE.btnH, { label: it.label, icon: it.icon, variant: it.primary ? 'primary' : 'secondary', onClick: it.onClick }));
      y -= SIZE.btnH + SIZE.gap + 2;
    }
    return y + SIZE.btnH;
  }

  // ------------------------------------------------------------------ offer / resume

  private buildOffer(resume: boolean): void {
    const y = this.title(t('firstrun.title'));
    const top = this.bottomButtons([
      { label: resume ? t('firstrun.resumeBtn') : t('firstrun.tutorial'), icon: 'swords', primary: true, onClick: () => this.startTutorial() },
      { label: t('tut.skipOk'), icon: 'close', onClick: () => (resume ? this.confirmSkip() : this.skip()) },
    ]);
    this.speech(y + 4, top - 6, resume ? t('firstrun.resume') : t('firstrun.offer'));
  }

  startTutorial(): void {
    this.scene.start('Battle', { tutorial: {} });
  }

  private skip(): void {
    const st = state.campaign.data.settings;
    st.tutorial = skipTutorial(progressOf(st));
    track('tutorial_skip', { id: 'first_run', step: 0 });
    void state.save();
    this.scene.start('FirstRun', { mode: 'modes' });
  }

  confirmSkip(): void {
    if (this.dialog) return;
    const d = confirmDialog(this, { title: t('tut.skipTitle'), body: t('tut.skipBody'), ok: t('tut.skipOk'), cancel: t('common.stay'), onOk: () => this.skip() });
    this.dialog = d;
    d.once('destroy', () => this.dialog === d && (this.dialog = null));
  }

  // ------------------------------------------------------------------ reward

  private buildReward(item: Item | null): void {
    const { VW } = this.m;
    let y = this.title(t('firstrun.rewardTitle'));
    const top = this.bottomButtons([{ label: t('menu.continue'), icon: 'check', primary: true, onClick: () => this.scene.start('FirstRun', { mode: 'modes' }) }]);
    // the reward row: gold counting up and the item in its rarity frame
    // the reward: gold counting up and the item in its rarity frame (one row, or two on narrow screens)
    const w = Math.min(VW - 16, 200);
    const x = Math.round((VW - w) / 2);
    const rowH = 40;
    const stack = w < 190;
    const need = stack ? rowH * 2 + SIZE.gap + 2 : rowH;
    y = this.speech(y + 4, top - 6 - need - 6, item ? t('firstrun.reward') : t('firstrun.rewardSeen'));
    if (!item) return;
    const ry = Math.max(y + 2, Math.round((y + top - 6 - need) / 2));
    const gw = stack ? w : 56;
    const tile = new CountUp(this, x, ry, gw, rowH, { icon: 'coin', label: t('common.gold'), value: TUTORIAL_REWARD.gold, prefix: '+', duration: 900, delay: 300 });
    this.ui.add(tile);
    tile.start();
    const ix = stack ? x : x + gw + SIZE.gap + 2;
    const iy = stack ? ry + rowH + SIZE.gap + 2 : ry;
    const iw = x + w - ix;
    this.ui.add(addPanel(this, ix, iy, iw, rowH, 'inset'));
    const icon = new ItemIcon(this, ix + 8, iy + 8, { item }, { size: SIZE.cell });
    this.ui.add(icon);
    const nx = ix + 8 + SIZE.cell + 6;
    const name = tOr(`item.${item.def}.name`, itemDef(item.def).name).toUpperCase();
    const nw = ix + iw - 5 - nx;
    const nameLines = wrapText(name, nw, 2).lines;
    const nameText = addText(this, nx, iy + (nameLines.length > 1 ? 9 : 12), nameLines.join('\n'), rarityFont(item.rarity));
    uiFrame(nameText, this.ui as unknown as Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, iw, rowH, ix, iy);
    this.ui.add(nameText);
    if (nameLines.length < 2) this.ui.add(addText(this, nx, iy + 23, ellipsize(tOr(`rarity.${item.rarity}`, item.rarity).toUpperCase(), nw), 'dim'));
    uiLevelUp();
    hapticNotify('success');
  }

  // ------------------------------------------------------------------ the two modes

  private buildModes(): void {
    const { VW } = this.m;
    let y = this.title(t('firstrun.modesTitle'));
    const w = Math.min(VW - 16, 200);
    const x = Math.round((VW - w) / 2);
    const bw = Math.floor((w - SIZE.gap - 2) / 2);
    const { VH } = this.m;
    const by = VH - 8 - SIZE.btnH;
    this.ui.add(new Button(this, x, by, bw, SIZE.btnH, { label: t('menu.online'), icon: 'swords', onClick: () => this.scene.start('Online', {}) }));
    this.ui.add(new Button(this, x + w - bw, by, bw, SIZE.btnH, { label: t('firstrun.campaign'), icon: 'map', variant: 'primary', onClick: () => this.toCampaign() }));
    const cards: [string, string, string][] = [
      ['map', t('firstrun.campaign'), t('firstrun.campaignBody')],
      ['swords', t('firstrun.online'), t('firstrun.onlineBody')],
    ];
    const room = by - 6 - (y + 2);
    const each = Math.floor((room - SIZE.gap) / 2);
    for (const [icon, title, body] of cards) {
      const maxLines = Math.max(2, Math.floor((each - 22) / LINE_H));
      const lines = wrapText(body, w - 12, maxLines).lines;
      const h = Math.min(each, 20 + lines.length * LINE_H + 4);
      this.ui.add(addPanel(this, x, y, w, h, 'parch'));
      this.ui.add(addIcon(this, x + 5, y + 4, icon));
      this.ui.add(addText(this, x + 21, y + 6, ellipsize(title.toUpperCase(), w - 27), 'red'));
      this.ui.add(addText(this, x + 6, y + 19, lines.join('\n'), 'ink'));
      y += h + SIZE.gap + 2;
    }
  }

  private toCampaign(): void {
    state.hasSave = true;
    const w = state.campaign.world;
    if (w.s.inside >= 0) this.scene.start('Settlement', { id: w.s.inside });
    else this.scene.start('World');
  }
}
