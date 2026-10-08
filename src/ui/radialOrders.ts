/**
 * Radial orders (docs/UI_STRATEGOS.md "Battle"): tap a group on the field and
 * a ring of orders opens around it, each a 26 px glyph button with its word
 * outside the ring. The ring follows the group as the camera moves (`place`),
 * stays inside the field (clamped clear of the group cards and the strip) and
 * hides while a finger drags the field. The facing handle is the battle
 * scene's own turn knob, drawn bronze beside the ring.
 */
import Phaser from 'phaser';
import { addIcon, addText, panelTexture, holdTimer, longPress, type HoldTimer } from './kit';
import { uiFrame, uiId } from './layout';
import { BRONZE } from './theme';
import { haptic, hapticNotify, hapticSelect } from '../platform/telegram';
import { uiButton, uiError } from '../audio/hooks';
import { t } from '../i18n';

export interface RadialOrder {
  key: string;
  icon: string;
  label: string;
  tip?: string;
  /** The order in force (red, cream glyph). */
  selected?: boolean;
  /** Cannot now: grey dither; a tap says why. */
  off?: string;
  onTap: () => void;
}

/** Ring radius (centre to button centre) and button edge, UI px; the compact ring (short screens) drops the words. */
export const RING_R = 34;
export const RING_BTN = 26;
export const RING_R_COMPACT = 30;
export const RING_BTN_COMPACT = 24;
/** Room the ring needs around its centre (buttons plus their words), sideways and up / down. */
export const RING_REACH_X = 58;
export const RING_REACH_Y = 60;
export const RING_REACH_COMPACT = 43;

/** The ring's reach for a screen. */
export function ringReach(compact: boolean): { x: number; y: number } {
  return compact ? { x: RING_REACH_COMPACT, y: RING_REACH_COMPACT } : { x: RING_REACH_X, y: RING_REACH_Y };
}

/** One order button on the ring: a glyph at 2x, the word outside, like the kit's PanelButton. */
class RingButton extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  readonly o: RadialOrder;
  private downAt: { x: number; y: number } | null = null;
  private timer: HoldTimer | null = null;
  private long = false;
  private bg: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, o: RadialOrder, size = RING_BTN) {
    super(scene, Math.round(x), Math.round(y));
    this.o = o;
    this.w = size;
    this.h = size;
    const style = o.off ? 'buttonOff' : o.selected ? 'buttonSel' : 'button';
    this.bg = scene.add.image(0, 0, panelTexture(scene, size, size, style)).setOrigin(0, 0);
    this.add(this.bg);
    const variant = o.off ? 'D' : o.selected ? 'L' : '';
    // the glyph at 2x: 24 px in a 26 px button
    this.add(addIcon(scene, Math.floor((size - 24) / 2), Math.floor((size - 24) / 2), o.icon, variant).setScale(2));
    this.setSize(size, size);
    this.setInteractive(new Phaser.Geom.Rectangle(size / 2, size / 2, size, size), Phaser.Geom.Rectangle.Contains);
    uiId(this, `battle.cmd.${o.key}`);
    this.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.downAt = { x: p.x, y: p.y };
      this.long = false;
      this.timer?.remove();
      this.timer = holdTimer(scene, longPress.ms, () => {
        this.timer = null;
        if (!this.downAt || !this.scene) return;
        const tip = [o.label, o.tip, o.off].filter(Boolean).join('\n');
        this.long = true;
        haptic('light');
        longPress.show?.(scene, tip, this);
        this.release();
      });
      if (!o.off) this.bg.setTexture(panelTexture(scene, size, size, o.selected ? 'buttonSelDown' : 'buttonDown'));
    });
    this.on('pointerout', () => this.release());
    this.on('pointerup', (p: Phaser.Input.Pointer) => {
      const d = this.downAt;
      const long = this.long;
      this.release();
      if (!d || long || Math.abs(p.x - d.x) + Math.abs(p.y - d.y) > 14) return;
      if (o.off) {
        uiError();
        hapticNotify('warning');
        longPress.toast?.(scene, o.off);
        return;
      }
      hapticSelect();
      uiButton(o.icon);
      o.onTap();
    });
    this.once('destroy', () => this.timer?.remove());
    scene.add.existing(this);
  }

  /** Same shape as the kit Button's options (scripts find buttons by `opts.label` / `opts.icon`). */
  get opts(): { label: string; icon: string } {
    return { label: this.o.label, icon: this.o.icon };
  }

  get label(): string {
    return this.o.label;
  }

  private release(): void {
    this.downAt = null;
    this.timer?.remove();
    this.timer = null;
    if (!this.scene) return;
    this.bg.setTexture(panelTexture(this.scene, this.w, this.h, this.o.off ? 'buttonOff' : this.o.selected ? 'buttonSel' : 'button'));
  }
}

export interface RadialOpts {
  orders: RadialOrder[];
  /** The group's numeral in the ring's centre. */
  numeral: string;
  /** Where the ring may be (UI px): it is clamped inside, clear of the chrome. */
  bounds: { x0: number; y0: number; x1: number; y1: number };
  /** Short screens: a smaller ring without the words (they stay in the long-press tips). */
  compact?: boolean;
}

/**
 * The ring: built once per selection, moved every frame with `place(cx, cy)`
 * (the group's centre in UI px). `buttons` maps order keys to the buttons for
 * the tutorial's spotlight.
 */
export class RadialOrders extends Phaser.GameObjects.Container {
  readonly buttons = new Map<string, RingButton>();
  private ringG: Phaser.GameObjects.Graphics;
  private o: RadialOpts;
  private shown = true;

  constructor(scene: Phaser.Scene, o: RadialOpts) {
    super(scene, 0, 0);
    this.o = o;
    this.ringG = scene.add.graphics();
    this.add(this.ringG);
    const R = o.compact ? RING_R_COMPACT : RING_R;
    const B = o.compact ? RING_BTN_COMPACT : RING_BTN;
    const reach = ringReach(!!o.compact);
    // the dotted bronze ring
    for (let a = 0; a < 360; a += 5) {
      const r = (a * Math.PI) / 180;
      this.ringG.fillStyle(BRONZE.dark, 1);
      this.ringG.fillRect(Math.round(Math.cos(r) * (R - 1)), Math.round(Math.sin(r) * (R - 1)), 1, 1);
    }
    // the centre: the numeral on a dark pill
    const nw = o.numeral.length * 6 + 8;
    this.ringG.fillStyle(0x1d140f, 0.75);
    this.ringG.fillRoundedRect(-nw / 2, -7, nw, 14, 3);
    const num = addText(scene, 0, -4, o.numeral, 'light', 0.5);
    this.add(num);
    uiId(num, 'battle.ring.numeral');
    // five slots round the ring
    const angles = [-90, -18, 54, 126, 198];
    o.orders.slice(0, 5).forEach((ord, i) => {
      const deg = angles[i];
      const rad = (deg * Math.PI) / 180;
      const bx = Math.round(Math.cos(rad) * R) - B / 2;
      const by = Math.round(Math.sin(rad) * R) - B / 2;
      const b = new RingButton(scene, bx, by, ord, B);
      this.add(b);
      this.buttons.set(ord.key, b);
      if (o.compact) return;
      // the word outside the ring, in the field, with a dark shadow: over the top button, under the others
      const top = i === 0;
      const lx = Math.round(Math.cos(rad) * R);
      const ly = top ? by - 10 : by + B + 2;
      const txt = addText(scene, lx, ly, ord.label, ord.off ? 'dim' : 'light', 0.5);
      if (ord.selected) txt.setTint(BRONZE.hi);
      // the frame is a loose box round the whole ring: the words never overflow it
      uiFrame(txt, this, 2 * reach.x, 2 * reach.y, -reach.x, -reach.y);
      this.add(txt);
    });
    uiId(this, 'battle.ring');
    scene.add.existing(this);
  }

  /** Where the ring may be now (the narrator of the tutorial moves). */
  setBounds(b: RadialOpts['bounds']): void {
    this.o.bounds = b;
  }

  /** Move the ring to the group's centre (UI px), clamped inside its bounds. */
  place(cx: number, cy: number): void {
    const b = this.o.bounds;
    const reach = ringReach(!!this.o.compact);
    const x = Math.round(Math.max(b.x0 + reach.x, Math.min(b.x1 - reach.x, cx)));
    const y = Math.round(Math.max(b.y0 + reach.y, Math.min(b.y1 - reach.y, cy)));
    this.setPosition(x, y);
  }

  /** Hide while a finger pans or drags the field (the ring would chase the group). */
  setShown(on: boolean): void {
    if (on === this.shown) return;
    this.shown = on;
    this.setVisible(on);
  }

  /** Label of the facing handle, for the scene to draw beside its knob. */
  static faceWord(): string {
    return t('battle.ring.face');
  }
}
