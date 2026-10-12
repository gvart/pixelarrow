/**
 * The battle HUD of the "Bronze & Stone" design (docs/UI_KIT.md "Battle HUD"):
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
import { addIcon, addText, longPress, panelK, tappable, uiMetrics, type FontKey } from './kit';
import { renderMedallion, renderSweep, type MedallionState } from '../art/smoothUi';
import { KeyButton, caps, mosaicImage, mw } from './mosaic';
import { MOSAIC } from './tokens';
import { RS } from '../platform/renderScale';
import { ellipsize, measureText, wrapText } from './textfit';
import { uiFrame, uiId } from './layout';
import { pulse } from './motion';
import type { Side, SimEvent, SimGroup, SimUnit } from '../sim/types';
import { TICK_RATE } from '../sim/battle';
import { t } from '../i18n';

/** Height of the top bar (UI px). */
export const TOP_H = 46;

/** A slot of the top bar as a kit button: icon over word, primary terracotta, selected lit bronze. */
/** One slot of the battle's command strip (a KeyButton: Back-or-Flee | the one primary | Army-or-More). */
export interface StripSlot {
  label: string;
  icon?: string;
  onClick?: () => void;
  /** Cannot right now, and why (grey dither; a tap says why). */
  off?: string;
  /** Long-press explanation. */
  tip?: string;
  /** Count bubble in the corner (0 hides it). */
  badge?: number | string;
  /** Layout-check / script id. */
  id?: string;
  /** Selected look for a toggle (bronze-rimmed parchment), e.g. Pause while paused. */
  selected?: boolean;
  /** Middle slot only: not the red primary (a toggle or a secondary wide action). */
  secondary?: boolean;
  /** Destructive (dark wine): confirm first in `onClick`. */
  destructive?: boolean;
}

function slotButton(scene: Phaser.Scene, x: number, y: number, w: number, h: number, s: StripSlot, primary: boolean, plain: boolean): KeyButton {
  return new KeyButton(scene, x, y, w, h, {
    label: s.label,
    icon: s.icon,
    onClick: s.onClick,
    tip: s.tip,
    disabledReason: s.off,
    id: s.id,
    // Play is terracotta when it is the next thing to do; the rest bronze
    variant: s.destructive ? 'stone' : primary ? 'primary' : 'bronze',
    lit: !!s.selected,
    plain,
  });
}

/** The HUD's text floor (A11Y-09: meaningful text >= 13 CSS px = 6.5 UI px). */
export const HUD_TEXT = 6.5;

/**
 * Z1 of hud.md §C: the ⋯ battle menu at one end, Pause/Play and the speed at
 * the other (offline only), the clock between them. Left-hand mode swaps the
 * ends (hud.md §I: "the ⋯ moves right, Pause left").
 */
export interface TopBarOpts {
  /** The ⋯ key: the battle menu (always there). */
  menu: StripSlot;
  /** Pause / Play (offline). */
  pause?: StripSlot | null;
  /** Speed (offline). */
  speed?: StripSlot | null;
  /** Pause/Play is the one thing to do next (paused): terracotta. */
  primary?: boolean;
  /** Mirror the ends. */
  leftHand?: boolean;
}

/** Width of a top bar key (UI px) for a bar `w` wide: a little slimmer on a narrow phone. */
export function topKeyW(w: number): number {
  return w < 170 ? 30 : 32;
}

export class TopBar extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly buttons: Partial<Record<'menu' | 'pause' | 'speed', KeyButton>> = {};
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
    this.add(mosaicImage(scene, -2, -4, w + 4, TOP_H + 4, 'topBar'));
    this.slots = scene.add.container(0, 0);
    this.add(this.slots);
    this.timeText = addText(scene, 0, 4, '', 'ink', 0.5);
    this.timeText.setFontSize(13);
    this.wordText = addText(scene, 0, 21, '', 'dim', 0.5);
    this.wordText.setFontSize(HUD_TEXT);
    this.add([this.timeText, this.wordText]);
    this.row = scene.add.container(0, 0);
    this.add(this.row);
    uiId(this, 'battle.top');
    this.set(o);
    scene.add.existing(this);
  }

  /** Swap the keys (Pause for Play, Speed 2x to 3x) without rebuilding the bar. */
  set(o: TopBarOpts): this {
    const key = JSON.stringify([o.menu, o.pause, o.speed, o.primary, o.leftHand], (_k, v) => (typeof v === 'function' ? undefined : v));
    // the callbacks close over the scene's live state, so equal slots can keep their buttons
    if (key === this.key) return this;
    this.key = key;
    this.slots.removeAll(true);
    for (const k of Object.keys(this.buttons) as (keyof TopBar['buttons'])[]) delete this.buttons[k];
    const s = this.scene;
    const y = 4;
    const h = 26;
    const kw = topKeyW(this.w);
    const gap = 3;
    // one face for the bar: capitals when every word fits as such at the text floor, else Inter
    const slots = [o.menu, o.pause, o.speed].filter((x): x is StripSlot => !!x);
    const plain = !slots.every((slot) => mw(caps(slot.label), 'rCream', HUD_TEXT) <= kw - 4);
    const control = [o.pause, o.speed].filter((x): x is StripSlot => !!x);
    const controlW = control.length * kw + Math.max(0, control.length - 1) * gap;
    // the menu at the left (right in left-hand mode), Pause and speed at the other end
    const menuX = o.leftHand ? this.w - 4 - kw : 4;
    const ctlX = o.leftHand ? 4 : this.w - 4 - controlW;
    this.buttons.menu = slotButton(s, menuX, y, kw, h, o.menu, false, plain);
    this.slots.add(this.buttons.menu);
    control.forEach((slot, i) => {
      const b = slotButton(s, ctlX + i * (kw + gap), y, kw, h, slot, slot === o.pause && !!o.primary, plain);
      this.buttons[slot === o.pause ? 'pause' : 'speed'] = b;
      this.slots.add(b);
    });
    // the clock in the room between the ends (centred on the bar when only the menu key is there)
    const lead = kw + 2;
    const tail = controlW ? controlW + 2 : lead;
    const x0 = 4 + (o.leftHand ? tail : lead);
    const x1 = this.w - 4 - (o.leftHand ? lead : tail);
    this.clock = { x0, x1, size: x1 - x0 < 80 ? 10 : 12 };
    const cx = Math.round((x0 + x1) / 2);
    this.timeText.setX(cx);
    this.wordText.setX(cx);
    // the clock and its word live between the keys, above the strength row
    uiFrame(this.timeText, this, x1 - x0, TOP_H - 14, x0, 0);
    uiFrame(this.wordText, this, x1 - x0, TOP_H - 14, x0, 0);
    this.layoutClock();
    return this;
  }

  /** Clock size and the word under it, fitted to the room between the slots. */
  private layoutClock(): void {
    const { x0, x1, size } = this.clock;
    this.timeText.setFontSize(size);
    const wordY = 4 + (10 * size) / 7;
    const wordSize = HUD_TEXT;
    this.wordText.setY(wordY);
    // never cut (A11Y-10): a word that does not fit the room between the keys is left out, the clock reads alone
    const fitted = measureText(this.word, false, wordSize) <= x1 - x0 - 2 ? this.word : '';
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
      const t = addText(s, this.w / 2, y - 1.5, ellipsize(r.text, this.w - 12, false, HUD_TEXT), 'dim', 0.5);
      t.setFontSize(HUD_TEXT);
      uiFrame(t, this, this.w, TOP_H);
      this.row.add(t);
      return this;
    }
    const left = `${r.you} ${r.ours}%`;
    const right = `${r.theirs}% ${r.foe}`;
    const lw = measureText(left, false, HUD_TEXT);
    const rw = measureText(right, false, HUD_TEXT);
    const lt = addText(s, 6, y - 1.5, left, 'light', 0).setFontSize(HUD_TEXT);
    const rt = addText(s, this.w - 6, y - 1.5, right, 'light', 1).setFontSize(HUD_TEXT);
    const vs = addText(s, this.w / 2, y - 1.5, 'vs', 'gold', 0.5).setFontSize(HUD_TEXT);
    for (const t of [lt, rt, vs]) uiFrame(t, this, this.w, TOP_H);
    const g = s.add.graphics();
    const bar = (x0: number, x1: number, f: number, color: number, fromRight: boolean) => {
      const w = Math.max(4, x1 - x0);
      g.fillStyle(MOSAIC.bronzeLo, 1);
      g.fillRoundedRect(x0, y, w, 5, 1.5);
      g.fillStyle(MOSAIC.stone0, 1);
      g.fillRoundedRect(x0 + 0.5, y + 0.5, w - 1, 4, 1.2);
      const fw = Math.max(0, Math.min(1, f)) * (w - 2);
      if (fw > 0.5) {
        g.fillStyle(color, 1);
        g.fillRoundedRect(fromRight ? x0 + w - 1 - fw : x0 + 1, y + 1, fw, 3, 1);
      }
    };
    bar(6 + lw + 4, this.w / 2 - 8, r.ours / 100, MOSAIC.bronzeHi, false);
    bar(this.w / 2 + 8, this.w - 6 - rw - 4, r.theirs / 100, MOSAIC.terraHi, true);
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

  /**
   * The sentence and its glyph (G3, BTL-4): an hourglass while paused, an
   * info glyph for a hint, the red "!" only for an alert (the fight is going
   * badly). Red ink only on an alert.
   */
  setText(sentence: string, tone: HintTone = 'info'): this {
    const key = `${sentence}|${tone}`;
    if (key === this.key) return this;
    this.key = key;
    this.removeAll(true);
    if (!sentence) {
      this.h = 0;
      return this;
    }
    const s = this.scene;
    const size = HUD_TEXT;
    const textW = this.maxW - 22;
    const lines = wrapText(sentence, textW, 2, false, size).lines;
    const tw = Math.max(...lines.map((l) => measureText(l, false, size)));
    const w = Math.min(this.maxW, tw + 24);
    const lineH = 9;
    const h = 7 + lines.length * lineH;
    const x = Math.round(this.cx - w / 2);
    this.add(mosaicImage(s, x, 0, w, h, 'parchment'));
    if (tone === 'alert') {
      const g = s.add.graphics();
      g.fillStyle(MOSAIC.terra, 1);
      g.fillCircle(x + 9, h / 2, 4.5);
      g.lineStyle(0.6, MOSAIC.goldHi, 0.9);
      g.strokeCircle(x + 9, h / 2, 4.5);
      this.add(g);
      this.add(addText(s, x + 9, h / 2 - 3.6, '!', 'rCream', 0.5).setFontSize(HUD_TEXT));
    } else {
      const glyph = addIcon(s, x + 9, h / 2, tone === 'paused' ? 'hourglass' : 'info').setOrigin(0.5);
      glyph.setDisplaySize(10, 10);
      this.add(glyph);
    }
    lines.forEach((l, i) => {
      const t = addText(s, x + 17, 3 + i * lineH, l, tone === 'alert' ? 'pBad' : 'pInk', 0).setFontSize(size);
      uiFrame(t, this, w, h, x, 0);
      this.add(t);
    });
    this.h = h;
    return this;
  }
}

/** The hint pill's glyph: info (a hint), paused (hourglass), alert (red "!"). */
export type HintTone = 'info' | 'paused' | 'alert';

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
    const plate = mosaicImage(scene, 0, plateY, MED_W, 19, 'parchment');
    const size = 6;
    const name = addText(scene, cx, plateY + 1.5, ellipsize(o.label, MED_W - 4, false, size), 'pInk', 0.5).setFontSize(size);
    name.setY(plateY + 1);
    const sub = addText(scene, cx, plateY + 10, ellipsize(o.sub, MED_W - 4, false, 5), 'pSec', 0.5).setFontSize(5);
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
      g.fillStyle(MOSAIC.terra, 1);
      g.fillCircle(0, 3, 4.5);
      g.lineStyle(0.5, MOSAIC.goldHi, 1);
      g.strokeCircle(0, 3, 4.5);
      const n = addText(this.scene, 0, -1, this.corner, 'light' as FontKey, 0.5).setFontSize(6);
      this.badge.add([g, n]);
    }
  }
}

/** The rail holds at most this many medallions (hud.md Z5; BTL-01 AC 4). */
export const RAIL_MAX = 3;
/** Under this field height (UI px, 420 pt) the rail holds 2 (hud.md §C Z5). */
export const RAIL_SHORT_FIELD = 210;
/** Height of the rail's "more" key (UI px, a 44 pt target). */
export const MORE_H = 24;

/**
 * How many medallions the rail shows and whether the "more" key follows
 * (hud.md Z5): at most RAIL_MAX, 2 on a short field, and only as many as fit
 * `room` (UI px) together with the more key; the rest open from "more".
 */
export function railLayout(n: number, fieldH: number, room: number): { shown: number; more: boolean } {
  const cap = fieldH < RAIL_SHORT_FIELD ? 2 : RAIL_MAX;
  let shown = Math.min(n, cap);
  const fits = (k: number) => k * (MED_H + 4) + (k < n ? MORE_H + 4 : 0) <= room;
  while (shown > 0 && !fits(shown)) shown--;
  return { shown, more: shown < n };
}

/** A facing pip's touch target (UI px): 44 pt (A11Y-06). Its disc is smaller. */
export const PIP_D = 22;

/**
 * A facing pip (A11Y-14, CT-07): tap the knob, then tap one of these to turn
 * the group without dragging. An ink disc with a gold rim and a cream arrow
 * pointing the way the group will face on screen (`ang`, radians), so it reads
 * on any ground (A11Y-03) and by shape, not colour (A11Y-04). Placed by its centre.
 */
export class FacingPip extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, cx: number, cy: number, ang: number, id: string, label: string, onTap: () => void) {
    super(scene, Math.round(cx - PIP_D / 2), Math.round(cy - PIP_D / 2));
    const c = PIP_D / 2;
    // the full 44 pt target, invisible: it gives the pip its bounds (scripts and the layout check measure them)
    this.add(scene.add.rectangle(0, 0, PIP_D, PIP_D, 0x000000, 0).setOrigin(0, 0));
    const g = scene.add.graphics();
    g.fillStyle(MOSAIC.ink, 0.88);
    g.fillCircle(c, c, 8.5);
    g.lineStyle(1, MOSAIC.meanderHi, 1);
    g.strokeCircle(c, c, 8.5);
    const co = Math.cos(ang);
    const si = Math.sin(ang);
    const at = (f: number, l: number) => ({ x: c + co * f - si * l, y: c + si * f + co * l });
    const [a, b, d] = [at(5.5, 0), at(-3.5, 4), at(-3.5, -4)];
    g.fillStyle(0xfff4c0, 1);
    g.fillTriangle(a.x, a.y, b.x, b.y, d.x, d.y);
    this.add(g);
    this.setSize(PIP_D, PIP_D);
    this.setInteractive(new Phaser.Geom.Rectangle(PIP_D / 2, PIP_D / 2, PIP_D, PIP_D), Phaser.Geom.Rectangle.Contains);
    uiId(this, id);
    tappable(this, null, onTap, () => label);
    scene.add.existing(this);
  }

  /** Follow the group (the camera may move while the pips are open). */
  follow(cx: number, cy: number): void {
    this.setPosition(Math.round(cx - PIP_D / 2), Math.round(cy - PIP_D / 2));
  }
}

// ---- HUD rules (pure: no Phaser, tested in tests/battleLiveFixes.test.ts)

/** The group numerals, as on the cards and the field badges. */
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

/** What the HUD rules read from the battle (a `Battle` fits). */
export interface HudSim {
  groups: readonly SimGroup[];
  units: readonly SimUnit[];
  members(gid: number): readonly SimUnit[];
  activeMembers(gid: number): readonly SimUnit[];
  /** Extra missile range shooting downhill. */
  rangeBonus(s: SimUnit, t: SimUnit): number;
}

/** The hint says "Contact soon" only with an enemy this close to the selected group (paces; battle-readability R4). */
export const CONTACT_SOON_PACES = 6;
/** ...and for at most this long (s of battle time), so it never goes stale (PLAY B5). */
export const CONTACT_SOON_S = 6;

/** Distance (paces) from a group's men still fighting to the nearest enemy standing; Infinity when there is none. */
export function nearestFoe(sim: HudSim, gid: number): number {
  let best = Infinity;
  for (const u of sim.activeMembers(gid)) {
    for (const e of sim.units) {
      if (e.side === u.side || e.state !== 'ready') continue;
      best = Math.min(best, Math.hypot(e.x - u.x, e.y - u.y));
    }
  }
  return best;
}

/** Whether the situation hint may say "Contact soon" for the selected group: an enemy within 6 paces, for 6 s at most. */
export class ContactSoon {
  private gid = -1;
  private since = 0;

  /** `now`: battle time in seconds. */
  check(sim: HudSim, gid: number, now: number): boolean {
    if (nearestFoe(sim, gid) > CONTACT_SOON_PACES) {
      this.gid = -1;
      return false;
    }
    if (this.gid !== gid) {
      this.gid = gid;
      this.since = now;
    }
    return now - this.since < CONTACT_SOON_S;
  }
}

/** Shoot on with no target in range for longer than this (s of battle time): the card says "Out of range" (controls.md R3.4). */
export const NO_TARGET_S = 3;

/**
 * Whether a group has Shoot on and men with missiles left, none of whom has a
 * standing enemy in range (the sim's own range test, uphill bonus included).
 */
export function noTargetInRange(sim: HudSim, gid: number): boolean {
  const g = sim.groups[gid];
  if (!g?.fireAtWill || g.routed) return false;
  const shooters = sim.activeMembers(gid).filter((u) => u.ammo > 0 && u.stats.range > 0);
  if (!shooters.length) return false;
  for (const s of shooters) {
    for (const e of sim.units) {
      if (e.side === s.side || e.state !== 'ready') continue;
      if (Math.hypot(e.x - s.x, e.y - s.y) <= s.stats.range + sim.rangeBonus(s, e)) return false;
    }
  }
  return true;
}

/**
 * The cards' "Out of range" (controls.md R3.4; PLAY B6): Shoot on, and either
 * the focused group is out of every shooter's range (the sim's
 * `focusOutOfRange`, at once) or no enemy has been in range for more than 3 s.
 */
export class OutOfRange {
  private since = new Map<number, number>();

  /** `now`: battle time in seconds. */
  check(sim: HudSim, gid: number, now: number): boolean {
    const g = sim.groups[gid];
    const focusFar = !!g?.fireAtWill && !g.routed && g.focusOutOfRange === true;
    if (!noTargetInRange(sim, gid)) {
      this.since.delete(gid);
      return focusFar;
    }
    const t0 = this.since.get(gid) ?? now;
    this.since.set(gid, t0);
    return focusFar || now - t0 > NO_TARGET_S;
  }
}

// ---- targeting (CT-02, controls.md R3)

/** A group that can shoot now: a man still fighting with missiles left (missile or hybrid groups). */
export function isMissileGroup(sim: HudSim, gid: number): boolean {
  return sim.activeMembers(gid).some((u) => u.stats.range > 0 && u.ammo > 0);
}

/** What a tap on an enemy of group `foe` does for the selected group `gid` (R3.1, R3.2). */
export type EnemyTap = { kind: 'attack' } | { kind: 'focus'; target: number };

/** Melee groups attack; missile groups focus on that group, and a tap on the focused group again clears it (-1). */
export function enemyTap(sim: HudSim, gid: number, foe: number): EnemyTap {
  if (!isMissileGroup(sim, gid)) return { kind: 'attack' };
  return { kind: 'focus', target: (sim.groups[gid]?.focus ?? -1) === foe ? -1 : foe };
}

/** The centre of a group's men still fighting; null when none is. */
export function groupCentre(sim: HudSim, gid: number): { x: number; y: number } | null {
  const mem = sim.activeMembers(gid);
  if (!mem.length) return null;
  return { x: mem.reduce((a, u) => a + u.x, 0) / mem.length, y: mem.reduce((a, u) => a + u.y, 0) / mem.length };
}

/** The median weapon range (paces) of a group's men with missiles left; 0 when it has none. */
export function medianRange(sim: HudSim, gid: number): number {
  const r = sim
    .activeMembers(gid)
    .filter((u) => u.stats.range > 0 && u.ammo > 0)
    .map((u) => u.stats.range)
    .sort((a, b) => a - b);
  if (!r.length) return 0;
  const m = r.length >> 1;
  return r.length % 2 ? r[m] : (r[m - 1] + r[m]) / 2;
}

/**
 * The range ring (R3.3): `n` field points round the group's centre at its
 * median range, each pushed out by the sim's downhill bonus toward it. Null
 * for a group that cannot shoot.
 */
export function rangeRing(sim: HudSim, gid: number, n = 48): { x: number; y: number }[] | null {
  const c = groupCentre(sim, gid);
  const r = medianRange(sim, gid);
  if (!c || r <= 0) return null;
  const from = { x: c.x, y: c.y } as SimUnit;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const rr = r + sim.rangeBonus(from, { x: c.x + dx * r, y: c.y + dy * r } as SimUnit);
    pts.push({ x: c.x + dx * rr, y: c.y + dy * rr });
  }
  return pts;
}

/** What "Advance to range" walks toward: the focused group's centre, else the nearest enemy standing. */
export function rangeTarget(sim: HudSim, gid: number): { x: number; y: number } | null {
  const c = groupCentre(sim, gid);
  const g = sim.groups[gid];
  if (!c || !g) return null;
  const focus = g.focus ?? -1;
  if (focus >= 0) {
    const ready = sim.members(focus).filter((u) => u.state === 'ready');
    if (ready.length) return { x: ready.reduce((a, u) => a + u.x, 0) / ready.length, y: ready.reduce((a, u) => a + u.y, 0) / ready.length };
  }
  let best: SimUnit | null = null;
  let bestD = Infinity;
  for (const e of sim.units) {
    if (e.side === g.side || e.state !== 'ready') continue;
    const d = Math.hypot(e.x - c.x, e.y - c.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}

/**
 * The staged Charge preview (controls.md R5, CT-04): from group `gid`'s centre
 * (or `from`, where a staged move puts it) to the centre of the enemy group
 * nearest it, centre to centre, ties to the lower id, as the sim picks. Null
 * when no enemy group stands.
 */
export function chargeTarget(sim: HudSim, gid: number, from?: { x: number; y: number }): { from: { x: number; y: number }; to: { x: number; y: number }; group: number } | null {
  const c = from ?? groupCentre(sim, gid);
  const g = sim.groups[gid];
  if (!c || !g) return null;
  let best: { x: number; y: number; group: number } | null = null;
  let bestD = Infinity;
  for (const e of sim.groups) {
    if (e.side === g.side || e.disbanded) continue;
    const ec = groupCentre(sim, e.id);
    if (!ec) continue;
    const d = (ec.x - c.x) ** 2 + (ec.y - c.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { ...ec, group: e.id };
    }
  }
  return best ? { from: c, to: { x: best.x, y: best.y }, group: best.group } : null;
}

/** "Advance to range" stops the group's centre at this share of its median range from the target (R3.4). */
export const ADVANCE_RANGE_K = 0.9;

/**
 * The `form` that "Advance to range" sends (R3.4): the group's centre moves
 * straight toward the target until it is at 90% of the median range (or 80%
 * of the way there when it is that close already), facing the target. Null:
 * nothing to walk to.
 */
export function advanceToRange(sim: HudSim, gid: number): { cx: number; cy: number; fx: number; fy: number } | null {
  const c = groupCentre(sim, gid);
  const t = rangeTarget(sim, gid);
  const r = medianRange(sim, gid);
  if (!c || !t || r <= 0) return null;
  const dx = c.x - t.x;
  const dy = c.y - t.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return null;
  const want = Math.min(ADVANCE_RANGE_K * r, d * 0.8);
  return { cx: t.x + (dx / d) * want, cy: t.y + (dy / d) * want, fx: -dx / d, fy: -dy / d };
}

/** Narrowest order key (UI px): the 44 pt touch target. */
export const KEY_MIN_W = 22;

/**
 * Widths of the order bar's keys (controls.md R9: labels are never
 * ellipsized), at the text floor (6.5 UI px, A11Y-09): equal when every
 * label fits an equal share; else each key gets its label's width and the
 * rest is shared out, so a long word keeps its room. Labels that do not fit
 * even so get equal keys (orderLabels picks the short words before that).
 */
export function orderKeyWidths(labels: readonly string[], total: number, gap: number): number[] {
  const n = labels.length;
  if (!n) return [];
  const room = total - gap * (n - 1);
  const even = Math.floor(room / n);
  const need = labels.map((l) => Math.max(KEY_MIN_W, Math.ceil(measureText(l, true, HUD_TEXT)) + 4));
  if (need.every((w) => w <= even)) return labels.map(() => even);
  const spare = room - need.reduce((a, w) => a + w, 0);
  if (spare < 0) return labels.map(() => even);
  const each = Math.floor(spare / n);
  let rest = spare - each * n;
  return need.map((w) => w + each + (rest-- > 0 ? 1 : 0));
}

/** Do `labels` fit an order bar `total` wide at the text floor? */
export function orderLabelsFit(labels: readonly string[], total: number, gap: number): boolean {
  const room = total - gap * (labels.length - 1);
  return labels.reduce((a, l) => a + Math.max(KEY_MIN_W, Math.ceil(measureText(l, true, HUD_TEXT)) + 4), 0) <= room;
}

/**
 * The order bar's words: the full ones when they fit at the text floor, else
 * the short ones (hud.md §I); on a canvas too narrow even for those (Telegram
 * full screen at 320x568, about 137 UI px) the keys show their icons alone,
 * the word as the tip, as the tab bar does there (V5-068): never a word under
 * the floor and never an ellipsis.
 */
export function orderLabels(full: readonly string[], short: readonly string[], total: number, gap: number): { words: string[]; iconOnly: boolean } {
  if (orderLabelsFit(full, total, gap)) return { words: [...full], iconOnly: false };
  return { words: [...short], iconOnly: !orderLabelsFit(short, total, gap) };
}

/**
 * A group's numeral, fixed for the whole battle: its place among its side's
 * formed groups, counting the empty ones (sim groups are never removed), so
 * the card and the field badge always agree (PLAY B3). Men fighting alone: '*'.
 */
export function groupNumeral(groups: readonly SimGroup[], gid: number): string {
  const g = groups[gid];
  if (!g || g.individual) return '*';
  let i = 0;
  for (const o of groups) {
    if (o.id === gid) break;
    if (o.side === g.side && !o.individual) i++;
  }
  return ROMAN[i] ?? `${i + 1}`;
}

/**
 * The bottom sheet's group cards, in order, with their numerals: the side's
 * formed groups (empty ones only while deploying), then the men fighting alone
 * ('*'); at most four.
 */
export function cardGroups(sim: HudSim, side: number, deploy: boolean): { gid: number; numeral: string }[] {
  const groups = sim.groups.filter((g) => g.side === side && !g.disbanded && (sim.members(g.id).length > 0 || deploy) && !g.individual);
  const indiv = sim.groups.filter((g) => g.side === side && g.individual && !g.disbanded && sim.activeMembers(g.id).length > 0);
  return [...groups, ...indiv].slice(0, 4).map((g) => ({ gid: g.id, numeral: groupNumeral(sim.groups, g.id) }));
}

// ---- morale glyph and badge markers (RD-01, battle-readability.md R1-R3)

/** A group's morale state (R1); null: no glyph (beasts, nobody left). */
export type MoraleState = 'steady' | 'wavering' | 'routing';

/** F2: wavering when at least this share of the non-routing men... */
export const WAVER_SHARE = 1 / 3;
/** ...are below this share of their max morale. */
export const WAVER_MORALE = 0.5;

/** The glyph of each state: shapes that read without colour (A11Y-04; src/art/vectorIcons.ts). */
export const MORALE_GLYPH: Record<MoraleState, string> = {
  steady: 'morale_steady',
  wavering: 'morale_wavering',
  routing: 'morale_routing',
};

/** The glyph's tint by state (R1: ink, amber, red; red is an alert, G3). Steady keeps the glyph's own cream and ink. */
export const MORALE_TINT: Record<MoraleState, number> = {
  steady: 0xffffff,
  wavering: 0xf0a830,
  routing: 0xf05a40,
};

/** Beasts (animals, myth bosses) keep their own HP and state UI: no morale glyph. */
function isBeast(u: Pick<SimUnit, 'stats'>): boolean {
  return u.stats.kind === 'animal' || u.stats.boss !== undefined;
}

/**
 * The morale state of a group (R1, F2), pure: routing on the group's routed
 * flag or its army's break; wavering when at least a third of its men still
 * standing (not routing) are below half their max morale; else steady. Null
 * for beasts and for a group with nobody alive.
 */
export function groupState(routed: boolean, men: readonly Pick<SimUnit, 'state' | 'morale' | 'stats'>[], armyBroken = false): MoraleState | null {
  const alive = men.filter((u) => u.state === 'ready' || u.state === 'routing');
  if (!alive.length || alive.every(isBeast)) return null;
  if (routed || armyBroken) return 'routing';
  const standing = alive.filter((u) => u.state === 'ready');
  const shaken = standing.filter((u) => u.morale < WAVER_MORALE * u.stats.morale).length;
  return shaken >= Math.ceil(standing.length * WAVER_SHARE) ? 'wavering' : 'steady';
}

/** The card's "Flanked!" lasts this long after a `flanked` event (R3; FLANK_ARC_S). */
export const FLANK_CARD_S = 2;

/** What the readout reads from the battle beyond the HUD rules (a `Battle` fits). */
export interface ReadoutSim extends HudSim {
  tick: number;
  phase: string;
  isBroken(side: Side): boolean;
  standardBearer(side: Side): SimUnit | null;
  disordered(gid: number): boolean;
}

/** A group's glyph and markers for its field badge and its card. */
export interface GroupReadout {
  state: MoraleState | null;
  /** Its man carries the side's standing Standard (abilities.md R5). */
  standard: boolean;
  /** ...and he is the band's captain: the crest (ai-doctrines.md R6). */
  captain: boolean;
  /** For FLANK_CARD_S after a flanked event (R3). */
  flanked: boolean;
  /** Drawn by a feint, for its 3 s (formations-orders.md R3). */
  disordered: boolean;
}

/** The readout of group `gid`; `isCaptain` tells a band captain (the scene knows the heroes). */
export function groupReadout(sim: ReadoutSim, gid: number, isCaptain: (u: SimUnit) => boolean = () => false): GroupReadout {
  const g = sim.groups[gid];
  if (!g) return { state: null, standard: false, captain: false, flanked: false, disordered: false };
  const bearer = sim.standardBearer(g.side);
  const standard = !!bearer && bearer.group === gid && (bearer.state === 'ready' || bearer.state === 'routing');
  return {
    state: groupState(g.routed, sim.members(gid), sim.isBroken(g.side)),
    standard,
    captain: standard && isCaptain(bearer!),
    flanked: sim.phase !== 'deploy' && sim.tick - g.lastFlankEvent < FLANK_CARD_S * TICK_RATE,
    disordered: sim.disordered(gid),
  };
}

/** R3: the bars read "HP" / "MOR" the first BAR_LABEL_SEEN battles, then one letter. */
export const BAR_LABEL_SEEN = 3;

/** The bar labels for the `seen`-th battle with cards (1-based). */
export function barLabels(seen: number): { long: boolean; hp: string; mor: string } {
  const long = seen <= BAR_LABEL_SEEN;
  return long ? { long, hp: t('battle.stat.hp'), mor: t('battle.stat.mor') } : { long, hp: t('readout.bar.h'), mor: t('readout.bar.m') };
}

/**
 * A morale glyph (R1) centred on (cx, cy), `size` UI px: its state's shape in
 * its tint; wavering pulses at 1 Hz unless motion is reduced (then static).
 */
export function moraleGlyph(scene: Phaser.Scene, cx: number, cy: number, size: number, state: MoraleState): Phaser.GameObjects.Image {
  const img = scene.add.image(cx, cy, `icon_${MORALE_GLYPH[state]}`).setDisplaySize(size, size);
  if (state !== 'steady') img.setTint(MORALE_TINT[state]);
  if (state === 'wavering' && pulse(scene, img, 'alpha', 1, 0.45, 500)) img.once('destroy', () => scene.tweens.killTweensOf(img));
  return img;
}

/** A badge marker (R2: the crest, the Standard, disordered, feinting, a queued step) centred on (cx, cy), in its own colours. */
export function markerGlyph(scene: Phaser.Scene, cx: number, cy: number, size: number, name: 'crest' | 'standard' | 'disordered' | 'feint' | 'queued'): Phaser.GameObjects.Image {
  return scene.add.image(cx, cy, `icon_marker_${name}`).setDisplaySize(size, size);
}

/** What a field badge shows (R2): our numeral ('' on an enemy's), the glyph and the markers. */
export interface BadgeSpec {
  numeral: string;
  /** Ours: the bronze plate (lit when selected); the enemy's: dark stone. */
  mine: boolean;
  selected: boolean;
  readout: GroupReadout;
  /** One of our missile groups focuses on it: the reticle (formations-orders.md R4). */
  focused?: boolean;
  /** Ours, feinting (formations-orders.md R3): the U-turn marker (BTL-01). */
  feinting?: boolean;
  /** Ours, with a Then… step queued (controls.md R6.2): the dotted-arrow marker (BTL-01). */
  queued?: boolean;
}

/** A field badge's markers, in hud.md §G priority order (the flank arc is drawn round the badge, not on it). */
export type BadgeMarker = 'reticle' | 'crest' | 'standard' | 'disordered' | 'feint' | 'queued';

/** At most this many markers on a badge besides the numeral and the glyph (hud.md §G visual budget). */
export const BADGE_MARKERS_MAX = 2;

/**
 * The markers a badge shows (hud.md §G): by priority reticle, the
 * captain's crest or the Standard, disordered, feinting, queued step; at
 * most BADGE_MARKERS_MAX, so the badge stays small and readable at 320.
 */
export function badgeMarkers(b: BadgeSpec): BadgeMarker[] {
  const r = b.readout;
  const all: BadgeMarker[] = [];
  if (b.focused) all.push('reticle');
  if (r.captain) all.push('crest');
  else if (r.standard) all.push('standard');
  if (r.disordered) all.push('disordered');
  if (b.feinting) all.push('feint');
  if (b.queued) all.push('queued');
  return all.slice(0, BADGE_MARKERS_MAX);
}

/** The badge's cache key: rebuild only when what it shows changes. */
export function badgeKey(b: BadgeSpec): string {
  const r = b.readout;
  return [b.numeral, b.mine, b.selected, r.state ?? '', badgeMarkers(b).join(',')].join('|');
}

/** The badge's plate height (UI px). */
export const BADGE_H = 13;
/** Glyphs on a badge (UI px). */
const BADGE_GLYPH = 9;

/**
 * A group's field badge (R2), centred on its origin: on a bronze plate (ours;
 * lit when selected) or a dark stone one (the enemy's), the numeral, the
 * morale glyph, then the markers: the captain's crest or the Standard, the
 * ragged line of a disordered group, the focus reticle. Shapes, each one,
 * never a colour alone (A11Y-04). Null when there is nothing to show.
 */
export function fieldBadge(scene: Phaser.Scene, b: BadgeSpec): Phaser.GameObjects.Container | null {
  const r = b.readout;
  const parts: ((x: number) => Phaser.GameObjects.GameObject)[] = [];
  const widths: number[] = [];
  const push = (w: number, make: (x: number) => Phaser.GameObjects.GameObject) => {
    widths.push(w);
    parts.push(make);
  };
  if (b.numeral) {
    const w = Math.ceil(mw(b.numeral, 'rCream', 6.5));
    push(w, (x) => addText(scene, x + w / 2, -3.4, b.numeral, b.selected ? 'rInk' : 'rCream', 0.5).setFontSize(6.5));
  }
  if (r.state) push(BADGE_GLYPH, (x) => moraleGlyph(scene, x + BADGE_GLYPH / 2, 0.5, BADGE_GLYPH, r.state!));
  for (const m of badgeMarkers(b)) {
    if (m === 'reticle')
      push(BADGE_GLYPH, (x) => {
        const g = scene.add.graphics();
        strokeBadgeReticle(g, x + BADGE_GLYPH / 2, 0.5, 3.4);
        return g;
      });
    else push(BADGE_GLYPH, (x) => markerGlyph(scene, x + BADGE_GLYPH / 2, 0.5, BADGE_GLYPH + 1, m));
  }
  if (!parts.length) return null;
  const gap = 1.5;
  const inner = widths.reduce((a, w) => a + w, 0) + gap * (widths.length - 1);
  const w = Math.ceil(inner) + 8;
  const c = scene.add.container(0, 0);
  c.add(mosaicImage(scene, -w / 2, -6, w, BADGE_H, !b.mine ? 'btnStone' : b.selected ? 'btnLit' : 'btnBronze'));
  let x = -inner / 2;
  parts.forEach((make, i) => {
    c.add(make(x));
    x += widths[i] + gap;
  });
  c.setData('key', badgeKey(b));
  c.setData('w', w);
  return c;
}

/** The focus reticle on a badge: a ring with four ticks, cream over ink (the card's look, smaller). */
function strokeBadgeReticle(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number): void {
  const pass = (lw: number, color: number) => {
    g.lineStyle(lw, color, 1);
    g.strokeCircle(cx, cy, r);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.lineBetween(cx + dx * r * 0.45, cy + dy * r * 0.45, cx + dx * r * 1.4, cy + dy * r * 1.4);
  };
  pass(2, MOSAIC.ink);
  pass(0.9, MOSAIC.cream);
}

/** R2: the badge fades to 60% when the camera zoom is 2x or more, so it never hides the men. */
export function badgeAlpha(zoom: number): number {
  return zoom >= 2 ? 0.6 : 1;
}

// ---- field banners, auto-pauses and damage numbers (RD-02, battle-readability.md R4)

/** A field banner expires after this long (s), or earlier when its condition is false (R4, PLAY R4/B5). */
export const BANNER_TTL_S = 6;
/** Auto-pauses this close together (s of battle time) merge into one pause and one banner. */
export const AUTOPAUSE_MERGE_S = 5;
/** The merged banner lists at most this many reasons (the newest). */
const MERGE_MAX = 3;

/** How long a banner shown at `t0` (ms) stays: `ttlMs` at most, and only while `live` holds. */
export class BannerLife {
  constructor(
    private t0: number,
    private ttlMs = BANNER_TTL_S * 1000,
    private live?: () => boolean,
  ) {}

  expired(now: number): boolean {
    return now - this.t0 >= this.ttlMs || (!!this.live && !this.live());
  }
}

/** Why the battle paused itself; `live` false once the reason no longer holds (none: it holds). */
export interface PauseReason {
  text: string;
  live?: () => boolean;
}

/** Auto-pauses within AUTOPAUSE_MERGE_S merge: one pause, one banner listing the reasons. */
export class AutoPauseMerge {
  private at = -Infinity;
  private reasons: PauseReason[] = [];

  /** A reason at `now` (s of battle time): true when it starts a pause, false when it merges into the last one. */
  offer(now: number, r: PauseReason): boolean {
    if (now - this.at <= AUTOPAUSE_MERGE_S) {
      if (!this.reasons.some((x) => x.text === r.text)) this.reasons.push(r);
      return false;
    }
    this.at = now;
    this.reasons = [r];
    return true;
  }

  /** The banner: the newest reasons, one per line. */
  text(): string {
    return this.reasons
      .slice(-MERGE_MAX)
      .map((r) => r.text)
      .join('\n');
  }

  /** Whether any listed reason still holds. */
  live(): boolean {
    return this.reasons.slice(-MERGE_MAX).some((r) => !r.live || r.live());
  }
}

type HitEvent = Extract<SimEvent, { type: 'hit' }>;

/** The hits that get a damage number (R4): only a charge impact's blow and a killing blow. */
export function damageNumberHits(events: readonly SimEvent[]): HitEvent[] {
  const impacts = new Set<string>();
  const deaths = new Set<number>();
  for (const e of events) {
    if (e.type === 'impact') impacts.add(`${e.unit}:${e.by}`);
    else if (e.type === 'death') deaths.add(e.unit);
  }
  const out: HitEvent[] = [];
  const killed = new Set<number>();
  // the last hit on a dead man is the killing blow
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type !== 'hit') continue;
    const kill = deaths.has(e.unit) && !killed.has(e.unit);
    if (kill) killed.add(e.unit);
    if (kill || impacts.has(`${e.unit}:${e.by}`)) out.push(e);
  }
  return out.reverse();
}
