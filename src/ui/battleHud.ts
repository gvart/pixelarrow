/**
 * The battle HUD of the "Bronze & Stone" design (docs/UI_D2.md):
 *  - TopBar: Pause / Speed / Retreat, the battle clock and the two armies'
 *    strength side by side;
 *  - HintPill: the one sentence that says what is going on and what to do;
 *  - Medallion: a hero ability as a round bronze button on the field's right
 *    edge, with its name and what it does on a plate underneath, a gold halo
 *    when ready, a sweep and the seconds while it recovers.
 * The bottom sheet (group cards, orders) is laid out by BattleScene with kit
 * buttons and GroupCard.
 */
import Phaser from 'phaser';
import { Button, addIcon, addText, longPress, panelImage, panelK, tappable, uiMetrics, type FontKey } from './kit';
import { BRONZE_D2, STATUS_D2, renderMedallion, renderSweep, type MedallionState } from '../art/smoothUi';
import { RS } from '../platform/renderScale';
import { ellipsize, measureText, wrapText } from './textfit';
import { uiFrame, uiId } from './layout';
import type { StripSlot } from './strategos';

/** Height of the top bar (UI px). */
export const TOP_H = 46;

/** A slot of the top bar as a kit button: icon over word, primary terracotta, selected lit bronze. */
function slotButton(scene: Phaser.Scene, x: number, y: number, w: number, h: number, s: StripSlot, primary: boolean): Button {
  const b = new Button(scene, x, y, w, h, {
    label: s.label,
    icon: s.icon,
    onClick: s.onClick,
    tip: s.tip,
    disabledReason: s.off,
    id: s.id,
    variant: s.destructive ? 'destructive' : primary ? 'primary' : 'secondary',
    style: s.selected ? 'buttonSel' : undefined,
  });
  if (s.off) b.setEnabled(false, s.off);
  return b;
}

export interface TopBarOpts {
  /** Pause / Play (offline), Watch (online). */
  left: StripSlot;
  /** Speed (offline). */
  mid?: StripSlot | null;
  /** Retreat. */
  right: StripSlot;
  /** The slot that is the screen's one primary action (terracotta), if any. */
  primary?: 'left' | 'mid' | 'right';
}

export class TopBar extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly buttons: Partial<Record<'left' | 'mid' | 'right', Button>> = {};
  private slots: Phaser.GameObjects.Container;
  private timeText: Phaser.GameObjects.BitmapText;
  private wordText: Phaser.GameObjects.BitmapText;
  private row: Phaser.GameObjects.Container;
  private rowKey = '';
  private clock = { x0: 0, x1: 0, size: 12 };
  private word = '';
  private key = '';

  constructor(scene: Phaser.Scene, w: number, o: TopBarOpts) {
    super(scene, 0, 0);
    this.w = w;
    this.add(panelImage(scene, -2, -4, w + 4, TOP_H + 4, 'parch'));
    this.slots = scene.add.container(0, 0);
    this.add(this.slots);
    this.timeText = addText(scene, 0, 4, '', 'ink', 0.5);
    this.timeText.setFontSize(13);
    this.wordText = addText(scene, 0, 21, '', 'dim', 0.5);
    this.wordText.setFontSize(5.5);
    this.add([this.timeText, this.wordText]);
    this.row = scene.add.container(0, 0);
    this.add(this.row);
    uiId(this, 'battle.top');
    this.set(o);
    scene.add.existing(this);
  }

  /** Swap the slots (Pause for Play, Speed 2x to 3x) without rebuilding the bar. */
  set(o: TopBarOpts): this {
    const key = JSON.stringify([o.left, o.mid, o.right, o.primary], (_k, v) => (typeof v === 'function' ? undefined : v));
    // the callbacks close over the scene's live state, so equal slots can keep their buttons
    if (key === this.key) return this;
    this.key = key;
    this.slots.removeAll(true);
    const s = this.scene;
    const y = 4;
    const h = 26;
    // narrow phones: slimmer slots leave the clock its room
    const narrow = this.w < 170;
    const bw = narrow ? 26 : 30;
    const rw = narrow ? 36 : 42;
    this.buttons.left = slotButton(s, 4, y, bw, h, o.left, o.primary === 'left');
    this.slots.add(this.buttons.left);
    let x0 = 4 + bw + 2;
    if (o.mid) {
      this.buttons.mid = slotButton(s, x0 + 1, y, bw, h, o.mid, o.primary === 'mid');
      this.slots.add(this.buttons.mid);
      x0 += bw + 3;
    } else delete this.buttons.mid;
    this.buttons.right = slotButton(s, this.w - 4 - rw, y, rw, h, o.right, o.primary === 'right');
    this.slots.add(this.buttons.right);
    const x1 = this.w - 4 - rw - 2;
    this.clock = { x0, x1, size: narrow ? 10 : 12 };
    const cx = Math.round((x0 + x1) / 2);
    this.timeText.setX(cx);
    this.wordText.setX(cx);
    // the clock and its word live between the slots, above the strength row
    uiFrame(this.timeText, this, x1 - x0, TOP_H - 14, x0, 0);
    uiFrame(this.wordText, this, x1 - x0, TOP_H - 14, x0, 0);
    this.layoutClock();
    return this;
  }

  /** Clock size and the word under it, fitted to the room between the slots. */
  private layoutClock(): void {
    const { x0, x1, size } = this.clock;
    this.timeText.setFontSize(size);
    const wordY = 4 + (10 * size) / 7 + 0.5;
    const wordSize = 5.5;
    this.wordText.setY(wordY);
    const fitted = ellipsize(this.word, x1 - x0, false, wordSize);
    if (this.wordText.text !== fitted) this.wordText.setText(fitted);
    this.wordText.setFontSize(wordSize);
  }

  /** The clock ("0:09") and its word ("battle time"); `hot` turns it red (the online deployment's last seconds). */
  setTime(value: string, word: string, hot = false): this {
    if (this.timeText.text !== value) this.timeText.setText(value);
    this.timeText.setFont(hot ? 'font_red' : 'font_ink');
    this.word = word;
    this.layoutClock();
    return this;
  }

  /**
   * The second row: "You 86% [bar] vs [bar] 92% Foe" in battle, or a line of
   * words in deployment ("8 men in 2 groups").
   */
  setRow(r: { ours: number; theirs: number; you: string; foe: string } | { text: string }): this {
    const key = JSON.stringify(r);
    if (key === this.rowKey) return this;
    this.rowKey = key;
    this.row.removeAll(true);
    const s = this.scene;
    const y = 33;
    if ('text' in r) {
      const t = addText(s, this.w / 2, y - 1, ellipsize(r.text, this.w - 12, false, 6), 'dim', 0.5);
      t.setFontSize(6);
      uiFrame(t, this, this.w, TOP_H);
      this.row.add(t);
      return this;
    }
    const left = `${r.you} ${r.ours}%`;
    const right = `${r.theirs}% ${r.foe}`;
    const lw = measureText(left, false, 6);
    const rw = measureText(right, false, 6);
    const lt = addText(s, 6, y - 1, left, 'ink', 0).setFontSize(6);
    const rt = addText(s, this.w - 6, y - 1, right, 'ink', 1).setFontSize(6);
    const vs = addText(s, this.w / 2, y - 1, 'vs', 'dim', 0.5).setFontSize(5.5);
    for (const t of [lt, rt, vs]) uiFrame(t, this, this.w, TOP_H);
    const g = s.add.graphics();
    const bar = (x0: number, x1: number, f: number, color: number, fromRight: boolean) => {
      const w = Math.max(4, x1 - x0);
      g.fillStyle(BRONZE_D2.lo, 1);
      g.fillRoundedRect(x0, y, w, 5, 1.5);
      g.fillStyle(0x0d0a08, 1);
      g.fillRoundedRect(x0 + 0.5, y + 0.5, w - 1, 4, 1.2);
      const fw = Math.max(0, Math.min(1, f)) * (w - 2);
      if (fw > 0.5) {
        g.fillStyle(color, 1);
        g.fillRoundedRect(fromRight ? x0 + w - 1 - fw : x0 + 1, y + 1, fw, 3, 1);
      }
    };
    bar(6 + lw + 4, this.w / 2 - 7, r.ours / 100, STATUS_D2.gold, false);
    bar(this.w / 2 + 7, this.w - 6 - rw - 4, r.theirs / 100, STATUS_D2.hp, true);
    this.row.add([g, lt, rt, vs]);
    return this;
  }
}

/** The sentence under the top bar: what is going on, what to do. */
export class HintPill extends Phaser.GameObjects.Container {
  private key = '';
  private maxW: number;
  private cx: number;
  h = 0;

  constructor(scene: Phaser.Scene, cx: number, y: number, maxW: number) {
    super(scene, 0, y);
    this.cx = cx;
    this.maxW = maxW;
    uiId(this, 'battle.hint');
    scene.add.existing(this);
  }

  setText(sentence: string, urgent = false): this {
    const key = `${sentence}|${urgent}`;
    if (key === this.key) return this;
    this.key = key;
    this.removeAll(true);
    if (!sentence) {
      this.h = 0;
      return this;
    }
    const s = this.scene;
    const size = 6.5;
    const textW = this.maxW - 22;
    const lines = wrapText(sentence, textW, 2, false, size).lines;
    const tw = Math.max(...lines.map((l) => measureText(l, false, size)));
    const w = Math.min(this.maxW, tw + 24);
    const lineH = 9;
    const h = 7 + lines.length * lineH;
    const x = Math.round(this.cx - w / 2);
    this.add(panelImage(s, x, 0, w, h, 'tooltip'));
    // the "!" disc
    const g = s.add.graphics();
    g.fillStyle(urgent ? 0xd8774f : BRONZE_D2.hi, 1);
    g.fillCircle(x + 9, h / 2, 4.5);
    this.add(g);
    const bang = addText(s, x + 9, h / 2 - 4.5, '!', 'ink', 0.5).setFontSize(6.5);
    bang.setTint(0x120e0b);
    this.add(bang);
    lines.forEach((l, i) => {
      const t = addText(s, x + 17, 3 + i * lineH, l, urgent ? 'gold' : 'ink', 0).setFontSize(size);
      uiFrame(t, this, w, h, x, 0);
      this.add(t);
    });
    this.h = h;
    return this;
  }
}

export interface MedallionOpts {
  icon: string;
  label: string;
  /** What it does, in a few words. */
  sub: string;
  tip: string;
  id: string;
  onClick: () => void;
}

/** Medallion diameter and the plate under it (UI px). */
export const MED_D = 26;
export const MED_W = 50;
export const MED_H = MED_D + 2 + 19;
const HALO = 4;

/**
 * An ability: bronze medallion + name plate. Same state API as the kit Chip
 * (setBlocked / setCorner) so BattleScene.refreshAbilities drives either.
 */
export class Medallion extends Phaser.GameObjects.Container {
  readonly w = MED_W;
  readonly h = MED_H;
  readonly o: MedallionOpts;
  private disc: Phaser.GameObjects.Image;
  private icon: Phaser.GameObjects.Image;
  private sweep: Phaser.GameObjects.Image;
  private cdText: Phaser.GameObjects.BitmapText;
  private badge: Phaser.GameObjects.Container;
  private blocked: string | null = null;
  private corner = '';
  private look: MedallionState | '' = '';
  private frac = -1;

  constructor(scene: Phaser.Scene, x: number, y: number, o: MedallionOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.o = o;
    const cx = MED_W / 2;
    this.disc = scene.add.image(cx, MED_D / 2, '__DEFAULT').setScale(1 / panelK(scene));
    this.icon = addIcon(scene, cx - 6, MED_D / 2 - 6, o.icon, '');
    this.sweep = scene.add.image(cx, MED_D / 2, '__DEFAULT').setVisible(false).setScale(1 / panelK(scene));
    this.cdText = addText(scene, cx, MED_D / 2 - 5, '', 'ink', 0.5).setFontSize(8).setVisible(false);
    this.badge = scene.add.container(cx + MED_D / 2 - 3, 2);
    const plateY = MED_D + 2;
    const plate = panelImage(scene, 0, plateY, MED_W, 19, 'tooltip');
    const size = 6;
    const name = addText(scene, cx, plateY + 1.5, ellipsize(o.label, MED_W - 4, false, size), 'ink', 0.5).setFontSize(size);
    name.setY(plateY + 1);
    const sub = addText(scene, cx, plateY + 10, ellipsize(o.sub, MED_W - 4, false, 5), 'dim', 0.5).setFontSize(5);
    uiFrame(name, this, MED_W, MED_H);
    uiFrame(sub, this, MED_W, MED_H);
    this.add([this.disc, this.icon, this.sweep, this.cdText, this.badge, plate, name, sub]);
    this.setSize(MED_W, MED_H);
    this.setInteractive(new Phaser.Geom.Rectangle(MED_W / 2, MED_H / 2, MED_W, MED_H), Phaser.Geom.Rectangle.Contains);
    uiId(this, o.id);
    tappable(
      this,
      null,
      () => {
        if (this.blocked) {
          longPress.toast?.(scene, this.blocked);
          return;
        }
        o.onClick();
      },
      () => `${o.label}: ${o.tip}`,
    );
    this.setState2('idle');
    scene.add.existing(this);
  }

  /** The label, for scripts and the tutorial (like Button.label). */
  get label(): string {
    return this.o.label;
  }

  private setState2(state: MedallionState): void {
    if (state === this.look) return;
    this.look = state;
    const s = this.scene;
    const K = panelK(s);
    const css = (K * RS) / uiMetrics(s).S;
    const key = `medal_${MED_D}_${state}@${K}`;
    if (!s.textures.exists(key)) s.textures.addCanvas(key, renderMedallion(MED_D, HALO, state, K, css))!.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.disc.setTexture(key);
    this.icon.setAlpha(state === 'cool' ? 0.35 : 1);
  }

  /** Keep the look but refuse taps with `reason` (null: usable again). */
  setBlocked(reason: string | null): this {
    this.blocked = reason;
    this.refresh();
    return this;
  }

  /** "44s" while recovering, a count of ready holders, or ''. */
  setCorner(text: string): this {
    if (text === this.corner) return this;
    this.corner = text;
    this.refresh();
    return this;
  }

  /** Fraction of the cooldown still to run (0: none). */
  setCooldown(f: number): this {
    const q = Math.round(Math.max(0, Math.min(1, f)) * 32) / 32;
    if (q === this.frac) return this;
    this.frac = q;
    if (q <= 0) {
      this.sweep.setVisible(false);
      return this;
    }
    const s = this.scene;
    const K = panelK(s);
    const key = `sweep_${MED_D}_${q}@${K}`;
    if (!s.textures.exists(key)) s.textures.addCanvas(key, renderSweep(MED_D - 6, q, K))!.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.sweep.setTexture(key).setVisible(true);
    return this;
  }

  private refresh(): void {
    const cooling = /\d/.test(this.corner) && /[sс]$/.test(this.corner);
    this.setState2(cooling ? 'cool' : this.blocked ? 'idle' : 'ready');
    this.cdText.setVisible(cooling);
    this.icon.setVisible(!cooling);
    if (cooling) this.cdText.setText(this.corner).setFontSize(8);
    this.badge.removeAll(true);
    if (!cooling && this.corner) {
      const g = this.scene.add.graphics();
      g.fillStyle(0x76291a, 1);
      g.fillCircle(0, 3, 4.5);
      g.lineStyle(0.5, BRONZE_D2.hi, 1);
      g.strokeCircle(0, 3, 4.5);
      const n = addText(this.scene, 0, -1, this.corner, 'light' as FontKey, 0.5).setFontSize(6);
      this.badge.add([g, n]);
    }
  }
}
