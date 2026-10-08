/**
 * The tutorial narrator's speech panel: the old strategos' portrait (he talks
 * while the text types out, and blinks), his name, typewriter text with a
 * quill tick and a murmur per few letters, a skip button, and a bouncing
 * arrow when a tap goes on. The panel swallows taps (a press on it never
 * reaches the battlefield) and, for the layout check, covers what is under it.
 */
import Phaser from 'phaser';
import { Button, addPanel, addText } from '../kit';
import { uiBlocker, uiColumn, uiFrame, uiId } from '../layout';
import { ellipsize, measureText, LINE_H } from '../textfit';
import { SIZE } from '../theme';
import { NARRATOR_SIZE, renderNarrator } from '../../art/narrator';
import { narratorType } from '../../audio/hooks';
import { t } from '../../i18n';
import type { UiScene } from '../widgets';

/** Characters per second of the typewriter. */
const CPS = 52;
const PORTRAIT = NARRATOR_SIZE + 2;

export function ensureNarratorTextures(scene: Phaser.Scene): void {
  for (const f of [0, 1, 2] as const) {
    const key = `narrator_${f}`;
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, renderNarrator(f).toCanvas());
  }
}

/** Greedy word wrap where each line has its own width (the first lines beside the skip button are shorter). */
export function wrapWidths(text: string, widths: (i: number) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const cand = line ? `${line} ${word}` : word;
    if (measureText(cand) <= widths(lines.length) || !line) {
      line = cand;
      continue;
    }
    lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines;
}

export interface SayOpts {
  /** Top edge (UI px) of the panel, or 'bottom' to sit on the bottom edge of the screen. */
  y: number | 'bottom';
  /** A tap goes on: show the bouncing arrow. */
  tap?: boolean;
  /** No typewriter (screenshots, a line already read). */
  instant?: boolean;
  /** A tap on the panel. */
  onTap?: () => void;
}

export class Narrator {
  readonly c: Phaser.GameObjects.Container;
  private scene: UiScene;
  private portrait: Phaser.GameObjects.Image | null = null;
  private texts: { obj: Phaser.GameObjects.BitmapText; start: number; str: string }[] = [];
  private arrow: Phaser.GameObjects.Graphics | null = null;
  private full = '';
  private shown = 0;
  private acc = 0;
  private nextBlink = 0;
  private blinkUntil = 0;
  /** Panel rectangle (UI px). */
  rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(scene: UiScene, parent: Phaser.GameObjects.Container, private onSkip: () => void) {
    this.scene = scene;
    ensureNarratorTextures(scene);
    this.c = scene.add.container(0, 0);
    parent.add(this.c);
    this.c.setVisible(false);
  }

  get visible(): boolean {
    return this.c.visible;
  }

  get typing(): boolean {
    return this.c.visible && this.shown < this.full.length;
  }

  /** Show a line. */
  say(text: string, o: SayOpts): void {
    const s = this.scene;
    const { VW, VH } = s.m;
    this.c.removeAll(true);
    this.c.setVisible(true);
    const x = 4;
    const w = VW - 8;
    const tx = x + 4 + PORTRAIT + 5;
    const skipW = SIZE.btnMinW + SIZE.gap + 2;
    // every line stays in the column right of the portrait (the panel grows
    // taller instead of a last line flowing under the portrait);
    // lines beside the skip button (top 3 .. 25) are shorter
    const lineY = (i: number) => 17 + i * LINE_H;
    const colR = x + w - 6;
    // (1 px spare: a glyph box is a pixel wider than its measured advance)
    const lines = wrapWidths(text, (i) => colR - tx - 1 - (lineY(i) < 3 + SIZE.btnH ? skipW : 0));
    const h = Math.max(PORTRAIT + 8, lineY(lines.length) - 3 + (o.tap ? 9 : 4));
    const y = o.y === 'bottom' ? VH - h - 2 : o.y;
    this.rect = { x, y, w, h };
    // a tap catcher under the content: presses on the panel never reach the field
    const swallow = s.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive();
    uiBlocker(uiId(swallow, 'tut.narrator'));
    if (o.onTap) swallow.on('pointerup', o.onTap);
    this.c.add(swallow);
    this.c.add(addPanel(s, x, y, w, h, 'parch'));
    this.c.add(addPanel(s, x + 3, y + 3, PORTRAIT + 2, PORTRAIT + 2, 'inset'));
    this.portrait = s.add.image(x + 4, y + 4, 'narrator_0').setOrigin(0, 0);
    this.c.add(this.portrait);
    const name = addText(s, tx, y + 5, ellipsize(t('tut.narrator'), x + w - 6 - tx - skipW), 'red');
    this.c.add(name);
    const skip = new Button(s, x + w - 3 - SIZE.btnMinW, y + 3, SIZE.btnMinW, SIZE.btnH - 2, { icon: 'close', iconOnly: true, label: t('tut.skip'), tip: t('tut.skip'), id: 'tut.skip', onClick: () => this.onSkip() });
    this.c.add(skip);
    this.full = lines.join('\n');
    this.texts = [];
    let start = 0;
    lines.forEach((str, i) => {
      const obj = addText(s, tx, y + lineY(i), '', 'ink');
      const ref = this.c as unknown as Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject;
      uiFrame(obj, ref, w, h, x, y);
      uiColumn(obj, ref, tx, colR, 'tut.narrator.text');
      this.c.add(obj);
      this.texts.push({ obj, start, str });
      start += str.length + 1;
    });
    this.shown = o.instant ? this.full.length : 0;
    this.acc = 0;
    this.showText();
    this.arrow = null;
    if (o.tap) {
      this.arrow = s.add.graphics();
      this.arrow.setVisible(this.shown >= this.full.length);
      this.c.add(this.arrow);
    }
  }

  /** Show the whole line at once; true if it was still typing. */
  finishTyping(): boolean {
    if (!this.typing) return false;
    this.shown = this.full.length;
    this.showText();
    return true;
  }

  private showText(): void {
    for (const l of this.texts) l.obj.setText(l.str.slice(0, Math.max(0, this.shown - l.start)));
  }

  hide(): void {
    this.c.removeAll(true);
    this.c.setVisible(false);
    this.texts = [];
    this.portrait = null;
    this.arrow = null;
    this.full = '';
    this.shown = 0;
  }

  private last = -1;

  update(time: number): void {
    // real time (the game loop smooths its delta on slow devices)
    const delta = this.last < 0 ? 16 : Math.min(250, Math.max(0, time - this.last));
    this.last = time;
    if (!this.c.visible) return;
    if (this.shown < this.full.length && this.texts.length) {
      this.acc += (delta / 1000) * CPS;
      while (this.acc >= 1 && this.shown < this.full.length) {
        this.acc -= 1;
        const ch = this.full[this.shown];
        narratorType(this.shown, ch);
        this.shown++;
      }
      this.showText();
    }
    const talking = this.shown < this.full.length;
    if (this.portrait) {
      if (time > this.nextBlink) {
        this.blinkUntil = time + 130;
        this.nextBlink = time + 2200 + ((time * 7) % 1900);
      }
      const f = time < this.blinkUntil ? 2 : talking && Math.floor(time / 110) % 2 === 0 ? 1 : 0;
      this.portrait.setTexture(`narrator_${f}`);
    }
    if (this.arrow) {
      this.arrow.setVisible(!talking);
      const r = this.rect;
      const bob = Math.floor(time / 220) % 2;
      this.arrow.clear();
      this.arrow.fillStyle(0x8c2f25, 1);
      const ax = r.x + r.w - 10;
      const ay = r.y + r.h - 8 + bob;
      this.arrow.fillTriangle(ax, ay, ax + 5, ay + 3, ax, ay + 6);
    }
  }

  destroy(): void {
    this.c.destroy();
  }
}
