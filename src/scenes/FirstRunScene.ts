/**
 * First-run screens (design/ux/screens-campaign.md C-2), in the v4 Mosaic & Parchment style:
 * - offer: on the very first launch old Nikias offers the tutorial over the painted key art
 *   (recommended), with Skip as a text link under it (FR-1, FR-2);
 * - resume: the tutorial was interrupted (the app closed): pick it up again;
 * - reward: after the tutorial, a little gold and a common item;
 * - modes: the three ways to fight, as cards named and ordered like the tab bar: Campaign,
 *   Duels, War (FR-3, D10).
 * Only new players get here: Boot routes a save without a tutorial record past it (bootRoute.ts).
 */
import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { addText, addIcon, ScrollArea } from '../ui/kit';
import { ItemIcon, confirmDialog } from '../ui/widgets';
import { ensureFonts } from '../ui/fonts';
import { ellipsize, wrapText, LINE_H } from '../ui/textfit';
import { SIZE } from '../ui/theme';
import { MOSAIC } from '../ui/tokens';
import { uiFrame, uiId, uiLayout, uiPrimary } from '../ui/layout';
import { FrescoBanner, MButton, MODE_TABS, ParchmentCard, ScreenFrame, TopBar, goTab, mosaicImage, mtext, type Box, type TabId } from '../ui/mosaic';
import { makePressable } from '../ui/mosaic/base';
import { ensureNarratorTextures, preloadNarrator, setNarratorFrame } from '../ui/tutorial/narrator';
import { columnBox, modesRow, offerLayout } from '../ui/tutorial/firstRunLayout';
import { layoutVariant, type LayoutVariant } from '../ui/mosaic/layout/variant';
import { NARRATOR_SIZE } from '../art/narrator';
import { state } from '../state';
import { progressOf, skipTutorial, TUTORIAL_REWARD } from '../game/tutorial';
import { track } from '../platform/analytics';
import { itemDef, type Item } from '../data/items';
import { uiLevelUp } from '../audio/hooks';
import { sfx } from '../audio';
import { hapticNotify } from '../platform/haptics';
import { t, tOr, type TKey } from '../i18n';

export type FirstRunMode = 'offer' | 'resume' | 'reward' | 'modes';

export interface FirstRunData {
  mode?: FirstRunMode;
  /** The reward item (mode 'reward'). */
  item?: Item;
}

const BTN_H = 26;
/** The reward's gold card and item card heights. */
const GOLD_H = 26;
const ITEM_H = SIZE.cell + 14;
/** The Skip text link's touch height (44 pt). */
const LINK_H = 22;
/** A mode card's height (64 pt at least, C-2). */
const MODE_H = 32;
/** The painted key art (docs/v5/art/asset-manifest.json T-SPLASH); loaded here, so only a new player downloads it. */
const SPLASH = 'ui_splash_keyart';

/** The three mode cards: the tab bar's modes in its order, with a fresco and a one-line pitch each. */
const MODES: { id: Extract<TabId, 'campaign' | 'duels' | 'war'>; pitch: TKey; art: string; file: string }[] = [
  { id: 'campaign', pitch: 'firstrun.pitch.campaign', art: 'ui_fresco_campaign', file: 'ui/fresco_campaign.jpg' },
  { id: 'duels', pitch: 'firstrun.pitch.duels', art: 'ui_fresco_arena', file: 'ui/fresco_arena.jpg' },
  { id: 'war', pitch: 'firstrun.pitch.war', art: 'ui_fresco_war', file: 'ui/fresco_war.jpg' },
];
/** A card's fresco strip: at most this wide per high, and none below MIN_ART high (a short screen keeps the words). */
const ART_ASPECT = 4;
const MIN_ART = 22;
/** Side by side, a card's fresco keeps the painting's own shape (1080 × 480). */
const MODE_ART_ASPECT = 2.25;

/** A CTA at most this wide outside compact portrait (§2.3), and the Skip link and Continue at most a button's width. */
const CTA_MAX = 300;
const BTN_MAX = 240;
/** The offer fresco's height on tablets (§13.1). */
const ART_MAX_H = 280;
/** The Skip link beside the CTA on a tablet. */
const SKIP_W = 112;

export class FirstRunScene extends BaseScene {
  /** Lays out for each size class (landscape-v6.md §13.1); compact portrait is the v5 column. */
  protected override readonly responsive = true;
  private variant: LayoutVariant = 'compactPortrait';
  /** The frame's content box (UI px), under the top bar. */
  private inner: Box = { x: 0, y: 0, w: 0, h: 0 };
  private mode: FirstRunMode = 'offer';
  private portrait: Phaser.GameObjects.Image | null = null;
  private dialog: Phaser.GameObjects.Container | null = null;
  /** The content area inside the frame (UI px), centred and at most 200 wide. */
  private area: Box = { x: 0, y: 0, w: 0, h: 0 };

  constructor() {
    super('FirstRun');
  }

  /** The painted art of the step about to open (only a new player downloads it); a missing file shows plain parchment (raster.ts). */
  preload(): void {
    const mode = (this.sys.settings.data as FirstRunData | undefined)?.mode ?? 'offer';
    const art = mode === 'offer' || mode === 'resume' ? [{ art: SPLASH, file: 'ui/splash_keyart.jpg' }] : mode === 'modes' ? MODES : [];
    for (const a of art) if (!this.textures.exists(a.art)) this.load.image(a.art, a.file);
    preloadNarrator(this);
  }

  create(data: FirstRunData): void {
    this.mode = data?.mode ?? 'offer';
    this.portrait = null;
    this.dialog = null;
    this.initUi();
    const root = this.mode === 'offer' || this.mode === 'resume';
    const back = root ? null : () => this.scene.start('Menu', {});
    this.screen({ back });
    ensureNarratorTextures(this);
    ensureFonts(this);
    const { VW, VH } = this.m;
    const frame = new ScreenFrame(this, VW, VH);
    this.ui.add(frame);
    const title = t(this.mode === 'reward' ? 'firstrun.rewardTitle' : this.mode === 'modes' ? 'firstrun.ways' : 'firstrun.title');
    this.ui.add(new TopBar(this, frame.topBar, { title, id: 'firstrun.topbar', back: back && this.inGameBack ? back : undefined }));
    this.variant = layoutVariant(this.m);
    uiLayout(this, this.m.cls, this.m.land);
    this.inner = { x: frame.inner.x, y: frame.inner.y + 2, w: frame.inner.w, h: frame.inner.h - 2 };
    // the v5 column (compact portrait), else a 360 column; the offer, reward and modes widen it as they need
    this.area = columnBox(this.variant, this.inner);
    if (this.mode === 'modes') this.buildModes();
    else if (this.mode === 'reward') this.buildReward(data?.item ?? null);
    else this.buildOffer(this.mode === 'resume');
  }

  update(time: number): void {
    if (!this.portrait) return;
    const blink = time % 3100 < 130;
    setNarratorFrame(this.portrait, blink ? 2 : 0, this.portrait.displayWidth);
  }

  /** Height of the compact speech card (portrait beside the words) for `text`. */
  private compactSpeechH(text: string): number {
    const pad = 6;
    const ps = NARRATOR_SIZE + 4;
    const lines = wrapText(text, this.area.w - pad - (pad + ps + 8), 0).lines;
    return Math.max(ps + pad * 2, 18 + lines.length * LINE_H + pad);
  }

  /**
   * Nikias and his line on a parchment card: the painted mentor (the pixel bust if it failed to load)
   * in a bronze-framed square, his name in Cinzel and the speech. A tall screen stacks them, a short one
   * (or `compact`) puts the portrait beside the words.
   */
  private speech(y: number, bottom: number, text: string, compact = false): number {
    const { x, w } = this.area;
    const pad = 6;
    const bigLines = wrapText(text, w - pad * 2, 6).lines;
    const bigH = pad + NARRATOR_SIZE * 2 + 4 + 4 + 11 + bigLines.length * LINE_H + pad + 2;
    const big = !compact && bottom - y >= bigH;
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
      this.portrait = this.add.image(card.x + px + 2, card.y + py + 2, 'narrator_0').setOrigin(0, 0);
      setNarratorFrame(this.portrait, 0, NARRATOR_SIZE * scale);
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
    const lines = wrapText(text, w - pad - tx, 0).lines;
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

  /** A text link (FR-2): underlined ink on parchment, a full-width 44 pt touch strip. */
  private textLink(x: number, y: number, w: number, label: string, id: string, onClick: () => void): void {
    const link = this.add.container(x, y);
    const face = this.add.container(w / 2, LINK_H / 2);
    link.add(face);
    const txt = mtext(this, 0, -Math.round(LINE_H / 2) + 1, label, 'pSec', { align: 0.5, maxW: w - 8, box: { owner: link, w, h: LINK_H } });
    face.add(txt);
    const g = this.add.graphics();
    g.lineStyle(0.6, MOSAIC.bronze, 1);
    const half = Math.min(txt.width, w - 8) / 2;
    g.lineBetween(-half, 4.5, half, 4.5);
    face.add(g);
    makePressable(link, { face, w, h: LINK_H, onTap: onClick, tip: label });
    Object.assign(link, { opts: { label } });
    uiId(link, id);
    this.ui.add(link);
  }

  // ------------------------------------------------------------------ offer / resume

  /** The key art in its fresco frame (FR-1); Nikias, the CTA at thumb height and the Skip link under it. */
  private buildOffer(resume: boolean): void {
    if (this.variant !== 'compactPortrait') return this.buildOfferWide(resume);
    const { x, y: top, w, h } = this.area;
    const bottom = top + h;
    const linkY = bottom - LINK_H;
    const ctaY = linkY - 2 - BTN_H;
    this.ui.add(uiPrimary(new MButton(this, x, ctaY, w, BTN_H, { label: resume ? t('firstrun.resumeBtn') : t('firstrun.tutorial'), icon: 'swords', variant: 'primary', onClick: () => this.startTutorial() })));
    this.textLink(x, linkY, w, t('firstrun.skip'), 'firstrun.skip', () => (resume ? this.confirmSkip() : this.skip()));
    const text = resume ? t('firstrun.resume') : t('firstrun.offer');
    // never up into the top bar (UI.md §3.17)
    const sy = Math.max(top, ctaY - 6 - this.compactSpeechH(text));
    this.speech(sy, ctaY - 6, text, true);
    const artH = sy - 5 - top;
    if (artH >= 40) this.ui.add(new FrescoBanner(this, x, top, w, artH, { image: SPLASH, label: t('firstrun.title'), id: 'firstrun.art' }));
  }

  /**
   * Tablets and landscape (§13.1): on a tablet the fresco on top (at most 280 tall), then Nikias, the CTA
   * and Skip, centred as one block; in landscape a stage, the fresco on the left and the rest on the right,
   * centred in its height (the CTA always above the fold).
   */
  private buildOfferWide(resume: boolean): void {
    const text = resume ? t('firstrun.resume') : t('firstrun.offer');
    const lay = offerLayout(this.variant, this.inner);
    // on a tablet the CTA and Skip share a row (the column's whole width: the CTA is capped at 300)
    const row = lay.kind === 'column';
    const blockH = (w: number) => {
      this.area = { ...this.area, w };
      return this.compactSpeechH(text) + 6 + BTN_H + (row ? 0 : 2 + LINK_H);
    };
    let words: Box;
    let art: Box | null;
    if (lay.kind === 'stage') {
      // a short phone (Telegram's insets) gives the words the room they need, the fresco the rest
      let { art: a, side } = lay;
      while (blockH(side.w) > side.h && a.w > 100) {
        a = { ...a, w: a.w - 20 };
        side = { ...side, x: side.x - 20, w: side.w + 20 };
      }
      const bh = blockH(side.w);
      words = { x: side.x, y: side.y + Math.max(0, Math.round((side.h - bh) / 2)), w: side.w, h: bh };
      // the portrait key art, as tall as the stage and no taller than 1.6 x its width
      const ah = Math.min(a.h, Math.round(a.w * 1.6));
      art = { x: a.x, y: a.y + Math.round((a.h - ah) / 2), w: a.w, h: ah };
    } else {
      const col = lay.col;
      const bh = blockH(col.w);
      const ah = Math.min(ART_MAX_H, col.h - bh - 5);
      const total = (ah >= 40 ? ah + 5 : 0) + bh;
      const y0 = col.y + Math.max(0, Math.round((col.h - total) / 2));
      const aw = Math.min(col.w, CTA_MAX);
      art = ah >= 40 ? { x: col.x + Math.round((col.w - aw) / 2), y: y0, w: aw, h: ah } : null;
      words = { x: col.x, y: y0 + (art ? ah + 5 : 0), w: col.w, h: bh };
    }
    this.area = words;
    const sh = this.compactSpeechH(text);
    this.speech(words.y, words.y + sh, text, true);
    const ctaY = words.y + sh + 6;
    const label = resume ? t('firstrun.resumeBtn') : t('firstrun.tutorial');
    const linkW = row ? SKIP_W : Math.min(words.w, BTN_MAX);
    const ctaW = Math.min(row ? words.w - 8 - linkW : words.w, CTA_MAX);
    const ctaX = row ? words.x : words.x + Math.round((words.w - ctaW) / 2);
    const cta = new MButton(this, ctaX, ctaY, ctaW, BTN_H, { label, icon: 'swords', variant: 'primary', onClick: () => this.startTutorial() });
    this.ui.add(uiPrimary(cta));
    const skip = () => (resume ? this.confirmSkip() : this.skip());
    if (row) this.textLink(words.x + words.w - linkW, ctaY + Math.round((BTN_H - LINK_H) / 2), linkW, t('firstrun.skip'), 'firstrun.skip', skip);
    else this.textLink(words.x + Math.round((words.w - linkW) / 2), ctaY + BTN_H + 2, linkW, t('firstrun.skip'), 'firstrun.skip', skip);
    // the key art is a door to the tutorial too, as the Menu's fresco is to the march (a big target beside the words)
    if (art) this.ui.add(uiPrimary(new FrescoBanner(this, art.x, art.y, art.w, art.h, { image: SPLASH, label, id: 'firstrun.art', onClick: () => this.startTutorial() })));
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
    if (this.variant === 'compactLandscape' || this.variant === 'expanded') return this.buildRewardStage(item);
    // tablets (§13.1): a 360 column, the gold and the item side by side, Continue ≤ 300 wide
    const wide = this.variant !== 'compactPortrait';
    if (wide) this.area = columnBox(this.variant, this.inner);
    const { x, w } = this.area;
    let top: number;
    if (wide) {
      const bw = Math.min(w, CTA_MAX);
      top = this.area.y + this.area.h - BTN_H;
      this.continueBtn(x + Math.round((w - bw) / 2), top, bw);
    } else top = this.bottomButtons([{ label: t('menu.continue'), icon: 'check', primary: true, onClick: () => this.scene.start('FirstRun', { mode: 'modes' }) }]);
    // the reward as two card rows: gold counting up, and the item in its rarity frame
    const need = item ? (wide ? ITEM_H : GOLD_H + 3 + ITEM_H) : 0;
    const first = this.ui.length;
    let y = this.speech(this.area.y + 4, top - 6 - need - 6, item ? t('firstrun.reward') : t('firstrun.rewardSeen'));
    if (!item) return;
    y += 6;
    const end = this.rewardCards(item, x, y, w, wide);
    // the speech and the rewards as one block, centred above the button (no empty band between them)
    const dy = Math.max(0, Math.floor((top - 6 - end - 4) / 2));
    this.ui.list.slice(first).forEach((o) => ((o as unknown as { y: number }).y += dy));
    uiLevelUp();
    hapticNotify('success');
  }

  /** Landscape (§13.1): a stage, Nikias and his line on the left, the gold, the item and Continue on the right, each centred in its height. */
  private buildRewardStage(item: Item | null): void {
    const lay = offerLayout(this.variant, this.inner);
    if (lay.kind !== 'stage') return;
    const { art: left, side } = lay;
    const centre = (first: number, top: number, end: number, box: Box) => {
      const dy = Math.max(0, Math.floor((box.h - (end - top)) / 2));
      this.ui.list.slice(first).forEach((o) => ((o as unknown as { y: number }).y += dy));
    };
    const text = item ? t('firstrun.reward') : t('firstrun.rewardSeen');
    // the rewards on the left, where the offer's fresco was; Nikias and Continue on the right, where its words were
    let first = this.ui.length;
    this.area = left;
    const end = item ? this.rewardCards(item, left.x, left.y, left.w, true) : this.speech(left.y, left.y + left.h, text, true) - 4;
    centre(first, left.y, end, left);
    first = this.ui.length;
    this.area = side;
    let y = side.y;
    if (item) y = this.speech(y, side.y + side.h, text, true) + 4;
    const bw = Math.min(side.w, CTA_MAX);
    this.continueBtn(side.x + Math.round((side.w - bw) / 2), y, bw);
    centre(first, side.y, y + BTN_H, side);
    if (!item) return;
    uiLevelUp();
    hapticNotify('success');
  }

  private continueBtn(x: number, y: number, w: number): void {
    this.ui.add(uiPrimary(new MButton(this, x, y, w, BTN_H, { label: t('menu.continue'), icon: 'check', variant: 'primary', onClick: () => this.scene.start('FirstRun', { mode: 'modes' }) })));
  }

  /** The gold card (counting up) and the item card in its rarity frame, stacked or side by side; returns their bottom. */
  private rewardCards(item: Item, x: number, y: number, w: number, sideBySide: boolean): number {
    // side by side: the gold card as tall as the item's
    const gw = sideBySide ? Math.floor((w - 6) / 2) : w;
    const gh = sideBySide ? ITEM_H : GOLD_H;
    const gold = new ParchmentCard(this, x, y, gw, gh, { id: 'firstrun.gold' });
    this.ui.add(gold);
    gold.add(addIcon(this, 8, Math.round((gh - 12) / 2), 'coin'));
    gold.add(mtext(this, 26, Math.round((gh - 9) / 2), t('common.gold'), 'rInk', { size: 7, maxW: sideBySide ? gw - 56 : gw - 80, box: { owner: gold, w: gw, h: gh } }));
    const num = addText(this, gw - 8, Math.round((gh - 9) / 2), '+0', 'pInk', 1);
    uiFrame(num, gold, gw, gh);
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
    const iy = sideBySide ? y : y + GOLD_H + 3;
    const ix = sideBySide ? x + gw + 6 : x;
    const iw = sideBySide ? w - gw - 6 : w;
    const row = new ParchmentCard(this, ix, iy, iw, ITEM_H, { id: 'firstrun.item' });
    this.ui.add(row);
    const icon = new ItemIcon(this, 8, Math.round((ITEM_H - SIZE.cell) / 2), { item }, { size: SIZE.cell });
    row.add(icon);
    const nx = 8 + SIZE.cell + 6;
    const name = tOr(`item.${item.def}.name`, itemDef(item.def).name);
    const nw = iw - 6 - nx;
    const nameLines = wrapText(name, nw, 2).lines;
    const nameText = addText(this, nx, nameLines.length > 1 ? 9 : 12, nameLines.join('\n'), 'pInk');
    uiFrame(nameText, row, iw, ITEM_H);
    row.add(nameText);
    if (nameLines.length < 2) row.add(addText(this, nx, 23, ellipsize(tOr(`rarity.${item.rarity}`, item.rarity), nw), 'pSec'));
    return iy + ITEM_H;
  }

  // ------------------------------------------------------------------ the three modes

  /** One card per mode, in the tab bar's order and with its name and icon; the Campaign card is the lit one (the primary). */
  private buildModes(): void {
    const row = modesRow(this.variant, this.inner);
    if (row) return this.buildModesRow(row);
    const { x, w } = this.area;
    const gap = SIZE.gap + 2;
    // a screen too short for all three (320x568 inside Telegram) scrolls them
    const top0 = this.area.y + 4;
    const scroll = new ScrollArea(this, this.ui, x, top0, w, this.area.y + this.area.h - top0, this.m.S);
    this.events.once('shutdown', () => scroll.destroy());
    let y = 0;
    // the icon sits in the title row, so the pitch has the card's whole width (a short screen keeps all three cards)
    const px = 8;
    const tx = 26;
    const cards = MODES.map((m) => {
      const lines = wrapText(t(m.pitch), w - px - 20, 0).lines;
      return { m, lines, textH: Math.max(MODE_H, 20 + lines.length * LINE_H + 4) };
    });
    // the frescoes share what the words leave, up to a 4:1 strip each
    const room = this.area.y + this.area.h - top0 - gap * (MODES.length - 1) - cards.reduce((s, c) => s + c.textH, 0);
    let artH = Math.min(Math.floor(room / MODES.length) - 3, Math.round((w - 6) / ART_ASPECT));
    if (artH < MIN_ART) artH = 0;
    for (const { m, lines, textH } of cards) {
      const tab = MODE_TABS.find((tb) => tb.id === m.id)!;
      const label = t(tab.key);
      const top = artH ? artH + 3 : 0;
      const h = top + textH;
      const card = new ParchmentCard(this, 0, y, w, h, { id: `firstrun.mode.${m.id}`, selected: m.id === 'campaign' });
      const face = this.add.container(0, 0);
      card.add(face);
      if (artH) face.add(new FrescoBanner(this, 3, 3, w - 6, artH, { image: m.art, id: `firstrun.mode.${m.id}.art` }));
      face.add(addIcon(this, px, top + 5, tab.icon));
      face.add(mtext(this, tx, top + 7, label, 'rInk', { size: 7.5, maxW: w - tx - 20, box: { owner: card, w, h } }));
      const body = addText(this, px, top + 19, lines.join('\n'), 'pInk');
      uiFrame(body, card, w, h);
      face.add(body);
      const chev = addIcon(this, w - 15, top + Math.round((textH - 12) / 2), 'chevR');
      face.add(chev);
      makePressable(card, { w, h, onTap: () => !scroll.moved && this.openMode(m.id), tip: label });
      Object.assign(card, { opts: { label } });
      scroll.content.add(card);
      y += h + gap;
    }
    scroll.setContentHeight(y - gap);
  }

  /**
   * Tablets and landscape (§13.1): the three cards side by side, as tall as each other, the fresco on top
   * of each (its own 2.25:1 or what the words leave) and the row centred in the height; a screen too short
   * for the cards scrolls them.
   */
  private buildModesRow(row: { x: number; w: number; gap: number }): void {
    const { w, gap } = row;
    const { y: top0, h: areaH } = this.inner;
    const totalW = w * MODES.length + gap * (MODES.length - 1);
    const scroll = new ScrollArea(this, this.ui, row.x, top0, totalW, areaH, this.m.S);
    this.events.once('shutdown', () => scroll.destroy());
    const px = 8;
    const tx = 26;
    const cards = MODES.map((m) => ({ m, lines: wrapText(t(m.pitch), w - px * 2, 0).lines }));
    const textH = Math.max(MODE_H, 20 + Math.max(...cards.map((c) => c.lines.length)) * LINE_H + 4);
    let artH = Math.min(Math.round((w - 6) / MODE_ART_ASPECT), areaH - textH - 3 - 6);
    if (artH < MIN_ART) artH = 0;
    const top = artH ? artH + 3 : 0;
    const h = top + textH;
    const y = Math.max(0, Math.round((areaH - h) / 2));
    cards.forEach(({ m, lines }, i) => {
      const tab = MODE_TABS.find((tb) => tb.id === m.id)!;
      const label = t(tab.key);
      const card = new ParchmentCard(this, i * (w + gap), y, w, h, { id: `firstrun.mode.${m.id}`, selected: m.id === 'campaign' });
      const face = this.add.container(0, 0);
      card.add(face);
      if (artH) face.add(new FrescoBanner(this, 3, 3, w - 6, artH, { image: m.art, id: `firstrun.mode.${m.id}.art` }));
      face.add(addIcon(this, px, top + 5, tab.icon));
      face.add(mtext(this, tx, top + 7, label, 'rInk', { size: 7.5, maxW: w - tx - 20, box: { owner: card, w, h } }));
      const body = addText(this, px, top + 19, lines.join('\n'), 'pInk');
      uiFrame(body, card, w, h);
      face.add(body);
      face.add(addIcon(this, w - 15, top + 5, 'chevR'));
      makePressable(card, { w, h, onTap: () => !scroll.moved && this.openMode(m.id), tip: label });
      Object.assign(card, { opts: { label } });
      scroll.content.add(card);
    });
    scroll.setContentHeight(y + h);
  }

  private openMode(id: 'campaign' | 'duels' | 'war'): void {
    if (id === 'campaign') this.toCampaign();
    else goTab(this, id);
  }

  private toCampaign(): void {
    state.hasSave = true;
    const w = state.campaign.world;
    if (w.s.inside >= 0) this.scene.start('Settlement', { id: w.s.inside });
    else this.scene.start('World', {});
  }
}
