/**
 * The tutorial narrator's speech panel: the old strategos' portrait (he talks
 * while the text types out, and blinks; left out on a narrow canvas so the
 * words get the width), his name, typewriter text with a quill tick and a
 * murmur per few letters, and a bouncing arrow when a tap goes on.
 *
 * Its two keys (hud.md "Dialogue / cutscene: tutorial", TUT-2): a "Skip" link
 * that asks before skipping, and ✕ that only hides the bubble (the tutorial
 * decides what hiding means: an info line goes on, an action step folds the
 * bubble into a small "Nikias" key that brings it back).
 *
 * The panel swallows taps (a press on it never reaches the battlefield) and,
 * for the layout check, covers what is under it. Where it sits is the
 * tutorial's choice (`measure` first, then `say` at a y clear of the lit
 * control: src/ui/tutorial/battleTutorial.ts `dock`).
 */
import Phaser from 'phaser';
import { addText } from '../kit';
import { KeyButton, MIconButton, mosaicImage, mtext, mw } from '../mosaic';
import { MOSAIC, TEXT_MIN } from '../tokens';
import { uiBlocker, uiColumn, uiFrame, uiId } from '../layout';
import { measureText, LINE_H } from '../textfit';
import { coverTexture, hasRaster } from '../mosaic/raster';
import { NARRATOR_SIZE, renderNarrator } from '../../art/narrator';
import { narratorType } from '../../audio/hooks';
import { t } from '../../i18n';
import type { UiScene } from '../widgets';

/** Characters per second of the typewriter. */
const CPS = 52;
const PORTRAIT = NARRATOR_SIZE + 2;
/** Below this canvas width (UI px) the portrait is left out: the words need the room (Telegram full screen at 320 is about 137). */
const PORTRAIT_MIN_VW = 170;
/** The keys' height (44 pt) and the gap between them. */
const KEY = 22;
const GAP = 3;
/** A line beside the keys narrower than this starts under them instead. */
const BESIDE_MIN = 60;

export function ensureNarratorTextures(scene: Phaser.Scene): void {
  for (const f of [0, 1, 2] as const) {
    const key = `narrator_${f}`;
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, renderNarrator(f).toCanvas());
  }
}

/** The painted Nikias (AS-08, ART-033..035): mouth shut, talking, blinking; texture key -> file under public/. */
const PAINTED: readonly (readonly [string, string])[] = [
  ['ui_portrait_nikias', 'ui/portrait_nikias.jpg'],
  ['ui_portrait_nikias_talk', 'ui/portrait_nikias_talk.jpg'],
  ['ui_portrait_nikias_blink', 'ui/portrait_nikias_blink.jpg'],
];

/** Queue the painted portraits (a scene's preload); a file that fails to load leaves the pixel bust. */
export function preloadNarrator(scene: Phaser.Scene): void {
  for (const [key, url] of PAINTED) if (!scene.textures.exists(key)) scene.load.image(key, url);
}

/** Show frame `f` on `img` at `size` x `size` UI px: the painted portrait when all three frames loaded, else the pixel bust. */
export function setNarratorFrame(img: Phaser.GameObjects.Image, f: 0 | 1 | 2, size: number): void {
  const s = img.scene;
  const painted = PAINTED.every(([key]) => hasRaster(s, key)) ? coverTexture(s, PAINTED[f][0], size, size) : null;
  img.setTexture(painted ?? `narrator_${f}`);
  img.setDisplaySize(size, size);
}

/** Greedy word wrap where each line has its own width (the first lines beside the keys are shorter). */
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

/** What the narrator's two keys do. */
export interface NarratorKeys {
  /** "Skip": ask, then leave the tutorial. */
  skip: () => void;
  /** ✕: hide the bubble. */
  close: () => void;
}

/** The panel's layout for a line (UI px, relative to its top edge). */
interface Layout {
  x: number;
  w: number;
  h: number;
  tx: number;
  colR: number;
  portrait: boolean;
  lines: string[];
  lineY: (i: number) => number;
  closeX: number;
  skipX: number;
  skipW: number;
  name: string;
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
  private last = -1;
  /** The line on show, to bring it back after the bubble was hidden. */
  private said: { text: string; o: SayOpts } | null = null;
  /** The bubble is folded into the "Nikias" key (✕ on an action step). */
  folded = false;
  /** Panel rectangle (UI px); the recall key's while folded. */
  rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(scene: UiScene, parent: Phaser.GameObjects.Container, private keys: NarratorKeys) {
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
    return this.c.visible && !this.folded && this.shown < this.full.length;
  }

  private layout(text: string, tap: boolean): Layout {
    const { VW } = this.scene.m;
    const x = 4;
    const w = VW - 8;
    const portrait = VW >= PORTRAIT_MIN_VW;
    const tx = x + 4 + (portrait ? PORTRAIT + 5 : 0);
    const colR = x + w - 6;
    const closeX = x + w - 3 - KEY;
    const skipLabel = t('tut.skipLink');
    const skipW = Math.max(KEY, Math.ceil(mw(skipLabel, 'light', TEXT_MIN)) + 14);
    const skipX = closeX - GAP - skipW;
    // the name beside the keys: the full title, else the short name, else none (never cut)
    const room = skipX - 4 - tx;
    const name = [t('tut.narrator'), t('tut.narratorShort')].find((n) => mw(n.toUpperCase(), 'rInk', TEXT_MIN) <= room) ?? '';
    // the words: beside the keys while there is room, else under them; every line stays right of the portrait
    const beside = skipX - 4 - tx;
    const top = beside >= BESIDE_MIN ? 17 : 3 + KEY + 3;
    const lineY = (i: number) => top + i * LINE_H;
    // (1 px spare: a glyph box is a pixel wider than its measured advance)
    const lines = wrapWidths(text, (i) => (lineY(i) < 3 + KEY ? beside : colR - tx) - 1);
    const h = Math.max(portrait ? PORTRAIT + 8 : 0, 3 + KEY + 2, lineY(lines.length) - 3 + (tap ? 9 : 4));
    return { x, w, h, tx, colR, portrait, lines, lineY, closeX, skipX, skipW, name };
  }

  /** The panel's height for a line (UI px), before it is said: the tutorial docks it where it covers nothing it points at. */
  measure(text: string, tap = false): number {
    return this.layout(text, tap).h;
  }

  /** Show a line. */
  say(text: string, o: SayOpts): void {
    const s = this.scene;
    const { VH } = s.m;
    this.said = { text, o };
    this.folded = false;
    this.c.removeAll(true);
    this.c.setVisible(true);
    const L = this.layout(text, !!o.tap);
    const { x, w, h, tx } = L;
    const y = o.y === 'bottom' ? VH - h - 2 : o.y;
    this.rect = { x, y, w, h };
    // a tap catcher under the content: presses on the panel never reach the field
    const swallow = s.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive();
    uiBlocker(uiId(swallow, 'tut.narrator'));
    if (o.onTap) swallow.on('pointerup', o.onTap);
    this.c.add(swallow);
    this.c.add(mosaicImage(s, x, y, w, h, 'parchment'));
    if (L.portrait) {
      // the mentor in a bronze-framed square
      this.c.add(mosaicImage(s, x + 3, y + 3, PORTRAIT + 2, PORTRAIT + 2, 'parchmentWell'));
      this.portrait = s.add.image(x + 4, y + 4, 'narrator_0').setOrigin(0, 0);
      setNarratorFrame(this.portrait, 0, NARRATOR_SIZE);
      this.c.add(this.portrait);
      const frame = s.add.graphics();
      frame.lineStyle(1.4, MOSAIC.bronze, 1);
      frame.strokeRect(x + 3, y + 3, PORTRAIT + 2, PORTRAIT + 2);
      this.c.add(frame);
    } else this.portrait = null;
    if (L.name) this.c.add(mtext(s, tx, y + 5, L.name, 'rInk', { size: 7, maxW: L.skipX - 4 - tx }));
    // "Skip" asks first (TUT-2); ✕ only hides the bubble
    this.c.add(new KeyButton(s, L.skipX, y + 3, L.skipW, KEY, { label: t('tut.skipLink'), tip: t('tut.skip'), variant: 'stone', plain: true, id: 'tut.skip', onClick: () => this.keys.skip() }));
    this.c.add(new MIconButton(s, L.closeX, y + 3, KEY, KEY, { icon: 'close', variant: 'neutral', label: t('tut.hide'), tip: t('tut.hideTip'), id: 'tut.hide', onClick: () => this.keys.close() }));
    this.full = L.lines.join('\n');
    this.texts = [];
    let start = 0;
    L.lines.forEach((str, i) => {
      const obj = addText(s, tx, y + L.lineY(i), '', 'pInk');
      const ref = this.c as unknown as Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject;
      uiFrame(obj, ref, w, h, x, y);
      uiColumn(obj, ref, tx, L.colR, 'tut.narrator.text');
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

  /** Fold the bubble into a small "Nikias" key where its keys were (✕ on an action step); the key brings it back. */
  fold(): void {
    if (!this.c.visible || this.folded || !this.said) return;
    const s = this.scene;
    const r = this.rect;
    const label = t('tut.recall');
    const kw = Math.max(KEY, Math.ceil(mw(label, 'light', TEXT_MIN)) + 14);
    const kx = r.x + r.w - 3 - kw;
    this.c.removeAll(true);
    this.texts = [];
    this.portrait = null;
    this.arrow = null;
    this.folded = true;
    this.rect = { x: kx, y: r.y + 3, w: kw, h: KEY };
    this.c.add(new KeyButton(s, kx, r.y + 3, kw, KEY, { label, tip: t('tut.recallTip'), variant: 'bronze', plain: true, id: 'tut.recall', onClick: () => this.unfold() }));
  }

  /** Bring the hidden bubble back, its line whole. */
  unfold(): void {
    if (!this.folded || !this.said) return;
    this.say(this.said.text, { ...this.said.o, instant: true });
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
    this.said = null;
    this.folded = false;
  }

  update(time: number): void {
    // real time (the game loop smooths its delta on slow devices)
    const delta = this.last < 0 ? 16 : Math.min(250, Math.max(0, time - this.last));
    this.last = time;
    if (!this.c.visible || this.folded) return;
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
      setNarratorFrame(this.portrait, f, NARRATOR_SIZE);
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
