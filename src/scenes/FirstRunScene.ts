/**
 * First-run screens (docs/DESIGN_V2.md "Onboarding"), in the v4 Mosaic & Parchment style:
 * - offer: on the very first launch old Nikias offers the tutorial
 *   (recommended) or a skip;
 * - resume: the tutorial was interrupted (the app closed): pick it up again;
 * - reward: after the tutorial, a little gold and a common item;
 * - modes: the two ways to play, Campaign (offline) and the Online war.
 */
import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { addText, addIcon } from '../ui/kit';
import { ItemIcon, confirmDialog } from '../ui/widgets';
import { ensureFonts } from '../ui/fonts';
import { ellipsize, wrapText, LINE_H } from '../ui/textfit';
import { SIZE } from '../ui/theme';
import { MOSAIC } from '../ui/tokens';
import { uiFrame } from '../ui/layout';
import { MButton, ParchmentCard, ScreenFrame, TopBar, mosaicImage, mtext, type Box } from '../ui/mosaic';
import { ensureNarratorTextures } from '../ui/tutorial/narrator';
import { NARRATOR_SIZE } from '../art/narrator';
import { state } from '../state';
import { progressOf, skipTutorial, TUTORIAL_REWARD } from '../game/tutorial';
import { track } from '../platform/analytics';
import { itemDef, type Item } from '../data/items';
import { uiLevelUp } from '../audio/hooks';
import { sfx } from '../audio';
import { hapticNotify } from '../platform/telegram';
import { t, tOr } from '../i18n';

export type FirstRunMode = 'offer' | 'resume' | 'reward' | 'modes';

export interface FirstRunData {
  mode?: FirstRunMode;
  /** The reward item (mode 'reward'). */
  item?: Item;
}

const BTN_H = 26;

export class FirstRunScene extends BaseScene {
  private mode: FirstRunMode = 'offer';
  private portrait: Phaser.GameObjects.Image | null = null;
  private dialog: Phaser.GameObjects.Container | null = null;
  /** The content area inside the frame (UI px), centred and at most 200 wide. */
  private area: Box = { x: 0, y: 0, w: 0, h: 0 };

  constructor() {
    super('FirstRun');
  }

  create(data: FirstRunData): void {
    this.mode = data?.mode ?? 'offer';
    this.portrait = null;
    this.dialog = null;
    this.initUi();
    const root = this.mode === 'offer' || this.mode === 'resume';
    const back = root ? null : () => this.scene.start('Menu');
    this.screen({ back });
    ensureNarratorTextures(this);
    ensureFonts(this);
    const { VW, VH } = this.m;
    const frame = new ScreenFrame(this, VW, VH);
    this.ui.add(frame);
    const title = t(this.mode === 'reward' ? 'firstrun.rewardTitle' : this.mode === 'modes' ? 'firstrun.modesTitle' : 'firstrun.title');
    this.ui.add(new TopBar(this, frame.topBar, { title, id: 'firstrun.topbar', back: back && this.inGameBack ? back : undefined }));
    const w = Math.min(frame.inner.w, 200);
    this.area = { x: frame.inner.x + Math.round((frame.inner.w - w) / 2), y: frame.inner.y + 2, w, h: frame.inner.h - 2 };
    if (this.mode === 'modes') this.buildModes();
    else if (this.mode === 'reward') this.buildReward(data?.item ?? null);
    else this.buildOffer(this.mode === 'resume');
  }

  update(time: number): void {
    if (!this.portrait) return;
    const blink = time % 3100 < 130;
    this.portrait.setTexture(`narrator_${blink ? 2 : 0}`);
  }

  /**
   * Nikias and his line on a parchment card: the pixel mentor in a bronze-framed square (a painted
   * portrait comes later), his name in Cinzel and the speech. A tall screen stacks them, a short one
   * puts the portrait beside the words.
   */
  private speech(y: number, bottom: number, text: string): number {
    const { x, w } = this.area;
    const pad = 6;
    const bigLines = wrapText(text, w - pad * 2, 6).lines;
    const bigH = pad + NARRATOR_SIZE * 2 + 4 + 4 + 11 + bigLines.length * LINE_H + pad + 2;
    const big = bottom - y >= bigH;
    const scale = big ? 2 : 1;
    const ps = NARRATOR_SIZE * scale + 4;
    const frameAt = (px: number, py: number, card: ParchmentCard) => {
      card.add(mosaicImage(this, px, py, ps, ps, 'parchmentWell'));
      const g = this.add.graphics();
      g.lineStyle(1.4, MOSAIC.bronze, 1);
      g.strokeRect(px - 0.5, py - 0.5, ps + 1, ps + 1);
      g.lineStyle(0.6, MOSAIC.parchEdge, 1);
      g.strokeRect(px - 1.5, py - 1.5, ps + 3, ps + 3);
      card.add(g);
      this.portrait = this.add.image(card.x + px + 2, card.y + py + 2, 'narrator_0').setOrigin(0, 0).setScale(scale);
      this.ui.add(this.portrait);
    };
    if (big) {
      const h = bigH;
      const card = new ParchmentCard(this, x, y, w, h, { id: 'firstrun.speech' });
      this.ui.add(card);
      frameAt(Math.round((w - ps) / 2), pad, card);
      card.add(mtext(this, w / 2, pad + ps + 5, t('tut.narrator'), 'rInk', { size: 7.5, align: 0.5, maxW: w - pad * 2, box: { owner: card, w, h } }));
      const body = addText(this, w / 2, pad + ps + 17, bigLines.join('\n'), 'pInk', 0.5).setCenterAlign();
      uiFrame(body, card, w, h);
      card.add(body);
      return y + h + 4;
    }
    const tx = pad + ps + 8;
    const lines = wrapText(text, w - pad - tx, 6).lines;
    const h = Math.max(ps + pad * 2, 18 + lines.length * LINE_H + pad);
    const card = new ParchmentCard(this, x, y, w, h, { id: 'firstrun.speech' });
    this.ui.add(card);
    frameAt(pad, pad, card);
    card.add(mtext(this, tx, pad, t('tut.narrator'), 'rInk', { size: 7.5, maxW: w - pad - tx, box: { owner: card, w, h } }));
    const body = addText(this, tx, pad + 12, lines.join('\n'), 'pInk');
    uiFrame(body, card, w, h);
    card.add(body);
    return y + h + 4;
  }

  /** Buttons stacked from the bottom edge up (the first is the primary, at the bottom). */
  private bottomButtons(items: { label: string; icon: string; primary?: boolean; onClick: () => void }[]): number {
    const { x, w } = this.area;
    let y = this.area.y + this.area.h - BTN_H;
    for (const it of items) {
      this.ui.add(new MButton(this, x, y, w, BTN_H, { label: it.label, icon: it.icon, variant: it.primary ? 'primary' : 'secondary', onClick: it.onClick }));
      y -= BTN_H + SIZE.gap + 2;
    }
    return y + BTN_H;
  }

  // ------------------------------------------------------------------ offer / resume

  private buildOffer(resume: boolean): void {
    const top = this.bottomButtons([
      { label: resume ? t('firstrun.resumeBtn') : t('firstrun.tutorial'), icon: 'swords', primary: true, onClick: () => this.startTutorial() },
      { label: t('tut.skipOk'), icon: 'close', onClick: () => (resume ? this.confirmSkip() : this.skip()) },
    ]);
    this.speech(this.area.y + 4, top - 6, resume ? t('firstrun.resume') : t('firstrun.offer'));
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
    const { x, w } = this.area;
    const top = this.bottomButtons([{ label: t('menu.continue'), icon: 'check', primary: true, onClick: () => this.scene.start('FirstRun', { mode: 'modes' }) }]);
    // the reward as two card rows: gold counting up, and the item in its rarity frame
    const goldH = 26;
    const itemH = SIZE.cell + 14;
    const need = item ? goldH + 3 + itemH : 0;
    let y = this.speech(this.area.y + 4, top - 6 - need - 6, item ? t('firstrun.reward') : t('firstrun.rewardSeen'));
    if (!item) return;
    y = Math.max(y + 2, Math.round((y + top - 6 - need) / 2));
    const gold = new ParchmentCard(this, x, y, w, goldH, { id: 'firstrun.gold' });
    this.ui.add(gold);
    gold.add(addIcon(this, 8, Math.round((goldH - 12) / 2), 'coin'));
    gold.add(mtext(this, 26, Math.round((goldH - 9) / 2), t('common.gold'), 'rInk', { size: 7, maxW: w - 80, box: { owner: gold, w, h: goldH } }));
    const num = addText(this, w - 8, Math.round((goldH - 9) / 2), '+0', 'pInk', 1);
    uiFrame(num, gold, w, goldH);
    gold.add(num);
    let lastTick = 0;
    this.tweens.addCounter({
      from: 0,
      to: TUTORIAL_REWARD.gold,
      duration: 900,
      delay: 300,
      ease: 'Cubic.easeOut',
      onUpdate: (tw) => {
        const v = Math.round(tw.getValue() ?? 0);
        num.setText(`+${v}`);
        const now = this.time.now;
        if (now - lastTick > 70 && v > 0) {
          lastTick = now;
          sfx.play('tap');
        }
      },
      onComplete: () => num.setText(`+${TUTORIAL_REWARD.gold}`),
    });
    const iy = y + goldH + 3;
    const row = new ParchmentCard(this, x, iy, w, itemH, { id: 'firstrun.item' });
    this.ui.add(row);
    const icon = new ItemIcon(this, 8, Math.round((itemH - SIZE.cell) / 2), { item }, { size: SIZE.cell });
    row.add(icon);
    const nx = 8 + SIZE.cell + 6;
    const name = tOr(`item.${item.def}.name`, itemDef(item.def).name);
    const nw = w - 6 - nx;
    const nameLines = wrapText(name, nw, 2).lines;
    const nameText = addText(this, nx, nameLines.length > 1 ? 9 : 12, nameLines.join('\n'), 'pInk');
    uiFrame(nameText, row, w, itemH);
    row.add(nameText);
    if (nameLines.length < 2) row.add(addText(this, nx, 23, ellipsize(tOr(`rarity.${item.rarity}`, item.rarity), nw), 'pSec'));
    uiLevelUp();
    hapticNotify('success');
  }

  // ------------------------------------------------------------------ the two modes

  private buildModes(): void {
    const { x, w } = this.area;
    let y = this.area.y + 4;
    const bw = Math.floor((w - SIZE.gap - 2) / 2);
    const by = this.area.y + this.area.h - BTN_H;
    this.ui.add(new MButton(this, x, by, bw, BTN_H, { label: t('menu.online'), icon: 'swords', variant: 'secondary', onClick: () => this.scene.start('Online', {}) }));
    this.ui.add(new MButton(this, x + w - bw, by, bw, BTN_H, { label: t('firstrun.campaign'), icon: 'map', variant: 'primary', onClick: () => this.toCampaign() }));
    const cards: [string, string, string][] = [
      ['map', t('firstrun.campaign'), t('firstrun.campaignBody')],
      ['swords', t('firstrun.online'), t('firstrun.onlineBody')],
    ];
    const room = by - 6 - y;
    const each = Math.floor((room - SIZE.gap) / 2);
    for (const [icon, title, body] of cards) {
      const maxLines = Math.max(2, Math.floor((each - 26) / LINE_H));
      const lines = wrapText(body, w - 14, maxLines).lines;
      const h = Math.min(each, 24 + lines.length * LINE_H + 4);
      const card = new ParchmentCard(this, x, y, w, h, { id: `firstrun.mode.${icon}` });
      this.ui.add(card);
      card.add(addIcon(this, 7, 6, icon));
      card.add(mtext(this, 25, 7, title, 'rInk', { size: 7.5, maxW: w - 32, box: { owner: card, w, h } }));
      const bt = addText(this, 7, 21, lines.join('\n'), 'pInk');
      uiFrame(bt, card, w, h);
      card.add(bt);
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
