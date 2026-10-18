/**
 * Pieces of the duel hub drawn in the v4 "Mosaic & Parchment" language
 * (docs/redesign/V4_SPEC.md): parchment text, stars, the ladder's floor tiles
 * and chest slots, the pixel fresco, league crests, preset chips, a locked
 * card. Pure drawing and small widgets; the scene owns the state.
 */
import Phaser from 'phaser';
import { addIcon, panelK, scaleIcon, type FontKey } from '../../ui/kit';
import { paintIcon, type IconLook } from '../../art/iconStyle';
import { UI_ICONS } from '../../art/uiIcons';
import { VECTOR_ICONS } from '../../art/vectorIcons';
import { uiId } from '../../ui/layout';
import { pulse, hop } from '../../ui/motion';
import { MOSAIC, SPACE, TEXT_MIN } from '../../ui/tokens';
import { LINE_H, wrapText } from '../../ui/textfit';
import { addChestSprite } from '../../art/menuSprites';
import { addCosmetic } from '../../ui/econ/textures';
import { addPortrait } from '../../ui/sprites';
import { dollFromHero } from '../../art/paperdoll';
import { roleColor } from '../../ui/sheet';
import { MBar, ParchmentCard, mosaicImage, mtext, mw, fit } from '../../ui/mosaic';
import { centeredFace, makePressable, put } from '../../ui/mosaic/base';
import type { Hero } from '../../data/units';
import { SEASON } from '../../duel/season';
import type { League, LeagueId } from '../../duel/rating';
import type { ChestState } from '../../duel/ladder';
import { heroClass } from '../../sim/stats';
import { armyPill, armyPillW } from '../../ui/army/parts';
import { fmtCount } from '../../i18n/numbers';

type C = Phaser.GameObjects.Container;

/** Parchment ink fonts under the names the v3 screens used. */
export const PF = { ink: 'pInk', sec: 'pSec', muted: 'pMuted', good: 'pGood', bad: 'pBad', off: 'pOff', head: 'rInk' } as const satisfies Record<string, FontKey>;
export type PFont = keyof typeof PF;

interface PTextOpts {
  align?: 0 | 0.5 | 1;
  size?: number;
  maxW?: number;
}

/** A line of text in parchment ink, added to `parent` (shortened to `maxW`). */
export function ptext(scene: Phaser.Scene, parent: C, x: number, y: number, str: string, font: PFont = 'ink', o: PTextOpts = {}): Phaser.GameObjects.BitmapText {
  const t = mtext(scene, x, y, str, PF[font], o);
  parent.add(t);
  return t;
}

/** The width of `str` in a parchment font. */
export function pw(str: string, font: PFont = 'ink', size = 7): number {
  return mw(str, PF[font], size);
}

/** "x of y" lines wrapped to `maxW` (body text, at most `maxLines`). */
export function pwrap(scene: Phaser.Scene, parent: C, x: number, y: number, str: string, maxW: number, maxLines: number, font: PFont = 'sec', align: 0 | 0.5 = 0): number {
  const wr = wrapText(str, maxW, maxLines);
  const t = ptext(scene, parent, align ? x + maxW / 2 : x, y, wr.lines.join('\n'), font, { align });
  if (align) t.setCenterAlign();
  return wr.lines.length * LINE_H;
}

// ------------------------------------------------------------------ stars

/** Where stars sit: on parchment or grey stone, or on the terracotta of the next floor. */
type StarTone = 'paper' | 'stone' | 'terra';

/** `n` of `max` stars centred on `cx` (earned: gold with a brown edge; the rest sunken wells), `size` px each. */
export function drawStars(g: Phaser.GameObjects.Graphics, cx: number, y: number, n: number, max = 3, size = 6, tone: StarTone = 'paper'): void {
  const step = size + 1;
  const x0 = Math.round(cx - (max * step - 1) / 2);
  for (let i = 0; i < max; i++) {
    const ox = x0 + i * step + size / 2;
    const oy = y + size / 2;
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? size * 0.24 : size * 0.55;
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      pts.push({ x: ox + Math.cos(a) * r, y: oy + 0.4 + Math.sin(a) * r });
    }
    if (i < n) {
      g.fillStyle(MOSAIC.segDone, 1);
      g.fillPoints(pts, true);
      g.lineStyle(0.6, MOSAIC.ink, 0.9);
      g.strokePoints(pts, true);
    } else {
      g.fillStyle(tone === 'terra' ? MOSAIC.terraLo : MOSAIC.stone0, tone === 'terra' ? 0.9 : 0.8);
      g.fillPoints(pts, true);
      g.lineStyle(0.7, tone === 'terra' ? MOSAIC.cream : tone === 'stone' ? MOSAIC.offText : MOSAIC.parchEdge, 0.9);
      g.strokePoints(pts, true);
    }
  }
}

/** A small triangle, 5 px wide, at x, y (top-left): pointing up when the number grows, green when that is better, red when worse. */
export function drawArrow(g: Phaser.GameObjects.Graphics, x: number, y: number, up: boolean, better: boolean = up): void {
  g.fillStyle(better ? MOSAIC.inkGood : MOSAIC.inkBad, 1);
  if (up) g.fillTriangle(x, y + 5, x + 5, y + 5, x + 2.5, y);
  else g.fillTriangle(x, y, x + 5, y, x + 2.5, y + 5);
}

/** A small chevron (open: pointing down, closed: right) at x, y. */
export function drawChevron(g: Phaser.GameObjects.Graphics, x: number, y: number, open: boolean): void {
  g.fillStyle(MOSAIC.bronze, 1);
  if (open) g.fillTriangle(x, y + 1, x + 7, y + 1, x + 3.5, y + 6);
  else g.fillTriangle(x + 1, y, x + 1, y + 7, x + 6, y + 3.5);
}

/** A gold ring that pulses over a rectangle (the next floor after a first clear). */
export function addFocusRing(scene: Phaser.Scene, parent: C, x: number, y: number, w: number, h: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.lineStyle(1.5, MOSAIC.goldHi, 1);
  g.strokeRoundedRect(x - 1, y - 1, w + 2, h + 2, 3);
  parent.add(g);
  pulse(scene, g, 'alpha', 1, 0.3, 700);
  return g;
}

/** A soft gold glow behind a claimable thing. */
function addGlow(scene: Phaser.Scene, parent: C, x: number, y: number, w: number, h: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(MOSAIC.goldHi, 0.22);
  g.fillRoundedRect(x - 1.5, y - 1.5, w + 3, h + 3, 3);
  g.lineStyle(1, MOSAIC.goldHi, 0.95);
  g.strokeRoundedRect(x - 0.5, y - 0.5, w + 1, h + 1, 3);
  parent.add(g);
  pulse(scene, g, 'alpha', 1, 0.35);
  return g;
}

// ------------------------------------------------------------------ floor tiles and chests

interface FloorTileOpts {
  n: number;
  state: 'cleared' | 'next' | 'locked';
  boss: boolean;
  stars: number;
  onClick: () => void;
  id: string;
}

export const FLOOR_H = 29;

/**
 * One floor of a chapter: its number, a glyph for its state (▸ next, ✓ cleared) and its stars; the next floor is
 * terracotta on a glow, locked ones are grey stone with a padlock. What a replay pays is on the floor's sheet.
 */
export class FloorTile extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h = FLOOR_H;
  readonly opts: { label: string };

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, o: FloorTileOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.opts = { label: `${o.n}` };
    const next = o.state === 'next';
    const locked = o.state === 'locked';
    if (next) addGlow(scene, this, 0, 0, this.w, this.h);
    const face = centeredFace(scene, this.w, this.h);
    this.add(face);
    const P = <T extends Phaser.GameObjects.GameObject & { x: number; y: number }>(obj: T): T => put(face, this.w, this.h, obj);
    P(mosaicImage(scene, 0, 0, this.w, this.h, next ? 'tileTerra' : locked ? 'tileOff' : 'tileStone'));
    const font: FontKey = locked ? 'rOff' : 'rCream';
    const frame = { owner: this as C, w: this.w, h: this.h };
    const label = `${o.n}`;
    const size = 8;
    const iconW = o.boss ? 11 : 0;
    const lw = mw(label, font, size);
    const mid = this.w / 2;
    // the state in a glyph, not colour alone (G13): "next" a chevron, "cleared" a check (the padlock marks a locked one)
    const glyph = next ? 'chevR' : o.state === 'cleared' ? 'check' : null;
    const GW = 8;
    const withGlyph = !!glyph && 4 + iconW + lw + 2 + GW + 3 <= this.w;
    const x0 = withGlyph ? 4 : Math.round(mid - (iconW + lw) / 2);
    if (o.boss) {
      const sk = scaleIcon(addIcon(scene, 0, 0, 'skull', locked ? 'D' : 'L'), 0.9);
      sk.setPosition(x0, 3);
      P(sk);
    }
    P(mtext(scene, x0 + iconW, 4, label, font, { size, box: frame }));
    if (withGlyph) {
      const gl = scaleIcon(addIcon(scene, 0, 0, glyph!, 'L'), GW / 12);
      gl.setPosition(this.w - GW - 3, 5);
      P(gl);
    }
    const g = scene.add.graphics();
    if (locked) {
      const lk = scaleIcon(addIcon(scene, 0, 0, 'lock', 'D'), 0.75);
      lk.setPosition(Math.round(mid - lk.displayWidth / 2), this.h - 12);
      P(lk);
    } else drawStars(g, mid, this.h - 11, o.stars, 3, 6, next ? 'terra' : 'stone');
    P(g);
    makePressable(this, { face, w: this.w, h: this.h, onTap: o.onClick, inset: 0 });
    uiId(this, o.id);
    scene.add.existing(this);
  }
}

interface ChestSlotOpts {
  state: ChestState;
  /** Stars the chest needs (its label until it is claimed). */
  need: number;
  onClick: () => void;
  id: string;
  tip?: string;
}

export const CHEST_W = 22;
export const CHEST_H = 27;

/** A chapter chest: closed and grey (locked), bright and hopping on a glow (ready), open and empty with a tick (claimed). */
export class ChestSlot extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h = CHEST_H;
  readonly opts: { label: string };

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, o: ChestSlotOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.opts = { label: `${o.need}` };
    if (o.state === 'ready') addGlow(scene, this, 0, 0, this.w, this.h);
    const face = centeredFace(scene, this.w, this.h);
    this.add(face);
    const P = <T extends Phaser.GameObjects.GameObject & { x: number; y: number }>(obj: T): T => put(face, this.w, this.h, obj);
    P(mosaicImage(scene, 0, 0, this.w, this.h, o.state === 'ready' ? 'tileBronze' : o.state === 'claimed' ? 'tileStone' : 'tileOff'));
    const sprite = addChestSprite(scene, Math.round(this.w / 2 - 8), 4, o.state);
    P(sprite);
    if (o.state === 'ready') hop(scene, sprite, 2, 1100 + o.need * 17);
    const frame = { owner: this as C, w: this.w, h: this.h };
    if (o.state === 'claimed') {
      const ck = scaleIcon(addIcon(scene, 0, 0, 'check', 'L'), 0.67);
      ck.setPosition(Math.round(this.w / 2 - ck.displayWidth / 2), this.h - 10);
      P(ck);
    } else P(mtext(scene, this.w / 2, this.h - 10, `${o.need}`, o.state === 'ready' ? 'rGold' : 'rOff', { size: TEXT_MIN, align: 0.5, box: frame }));
    makePressable(this, { face, w: this.w, h: this.h, onTap: o.onClick, tip: o.tip });
    uiId(this, o.id);
    scene.add.existing(this);
  }
}

// ------------------------------------------------------------------ crests and faces

/** League id to the pill colour of its name (a pill with light text on parchment). */
const LEAGUE_COLOR: Record<LeagueId, number> = {
  bronze: MOSAIC.bronze,
  silver: MOSAIC.slabLo,
  gold: MOSAIC.bronzeLo,
  hoplite: MOSAIC.terraLo,
  strategos: MOSAIC.tealLo,
  legend: MOSAIC.teal,
};

/**
 * A league's name on a pill in its colour, cream at 6.5 (A11Y-09; the kit's
 * `addPill` writes 6). `right`: x is the pill's right edge. Returns its width.
 */
export function addLeaguePill(scene: Phaser.Scene, parent: C, x: number, y: number, league: League, label: string, maxW: number, right = false): number {
  const s = fit(label, 'onAccent', TEXT_MIN, maxW - 8);
  return armyPill(scene, parent, right ? x - armyPillW(s) : x, y, s, LEAGUE_COLOR[league.id], maxW);
}

/** A league's crest (the season reward art) in a parchment well, or an hourglass during the placements. */
export function addCrest(scene: Phaser.Scene, parent: C, x: number, y: number, size: number, league: League | null): void {
  parent.add(mosaicImage(scene, x, y, size, size, 'parchmentWell'));
  if (league) {
    const cos = SEASON.rewards[league.id].cosmetic;
    parent.add(addCosmetic(scene, x + 1, y + 1, cos, cos.startsWith('duel_banner') ? 'banner' : 'emblem', size - 2));
    return;
  }
  const ic = scaleIcon(addIcon(scene, 0, 0, 'hourglass'), Math.max(1, (size - 6) / 12));
  ic.setPosition(Math.round(x + (size - ic.displayWidth) / 2), Math.round(y + (size - ic.displayHeight) / 2));
  parent.add(ic);
}

/** A fighter in pixels: a parchment well, the paper doll and a stripe in the role's colour. */
export function addFace(scene: Phaser.Scene, parent: C, x: number, y: number, size: number, hero: Hero, dim = false): void {
  parent.add(mosaicImage(scene, x, y, size, size, 'parchmentWell'));
  const p = addPortrait(scene, dollFromHero(hero), x + 1, y + 1, { size: size - 2 });
  if (dim) p.setAlpha(0.5);
  parent.add(p);
  const stripe = scene.add.rectangle(x + 2, y + size - 4, size - 4, 2, roleColor(heroClass(hero).role)).setOrigin(0, 0);
  parent.add(stripe);
}

// ------------------------------------------------------------------ chips and cards

interface PresetChipOpts {
  label?: string;
  /** Icons of what the preset fights on. */
  uses?: string[];
  /** The "+" chip of a new preset (an icon instead of a label). */
  plus?: boolean;
  selected?: boolean;
  /** The edited preset: a pen in its corner says a tap opens its tools (the Preset sheet). */
  tools?: boolean;
  onClick: () => void;
  tip?: string;
  id: string;
}

export const PRESET_H = 29;

/** A preset of the Team view: its name and what it fights on; the edited one is lit. */
export class PresetChip extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h = PRESET_H;
  readonly opts: { label: string };

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, o: PresetChipOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.opts = { label: o.label ?? o.tip ?? 'preset' };
    const face = centeredFace(scene, this.w, this.h);
    this.add(face);
    const P = <T extends Phaser.GameObjects.GameObject & { x: number; y: number }>(obj: T): T => put(face, this.w, this.h, obj);
    P(mosaicImage(scene, 0, 0, this.w, this.h, o.selected ? 'parchmentSel' : 'parchment'));
    const frame = { owner: this as C, w: this.w, h: this.h };
    if (o.plus) {
      const ic = scaleIcon(addIcon(scene, 0, 0, 'plus'), 1.2);
      ic.setPosition(Math.round((this.w - ic.displayWidth) / 2), Math.round((this.h - ic.displayHeight) / 2));
      P(ic);
    } else {
      const pen = o.tools ? 10 : 0;
      P(mtext(scene, (this.w - pen) / 2, 4, fit(o.label ?? '', 'pInk', 7, this.w - 6 - pen), o.selected ? 'rInk' : 'pInk', { size: 7, align: 0.5, box: frame }));
      if (pen) {
        const ic = scaleIcon(addIcon(scene, 0, 0, 'pen'), 8 / 12);
        ic.setPosition(this.w - 11, 4);
        P(ic);
      }
      const uses = o.uses ?? [];
      const iw = 8;
      let ix = Math.round(this.w / 2 - (uses.length * (iw + 2) - 2) / 2);
      for (const u of uses) {
        const ic = scaleIcon(addIcon(scene, 0, 0, u), iw / 12);
        ic.setPosition(ix, 17);
        P(ic);
        ix += iw + 2;
      }
    }
    makePressable(this, { face, w: this.w, h: this.h, onTap: o.onClick, tip: o.tip });
    uiId(this, o.id);
    scene.add.existing(this);
  }
}

interface LockedCardOpts {
  title: string;
  icon: string;
  reason: string;
  progress?: { value: number; max: number; label: string };
  how?: string;
}

/** A mode that is not open yet: a dimmed card with a padlock, why, how far along and what to do (never live stats). Returns its height. */
export function addLockedCard(scene: Phaser.Scene, parent: C, x: number, y: number, w: number, o: LockedCardOpts): number {
  const inner = w - SPACE.lg * 2;
  const how = o.how ? wrapText(o.how, inner, 3) : null;
  const reason = wrapText(o.reason, inner, 3);
  const h = SPACE.md + 14 + reason.lines.length * LINE_H + 4 + (o.progress ? 17 + 4 : 0) + (how ? how.lines.length * LINE_H + 2 : 0) + SPACE.md;
  const card = new ParchmentCard(scene, x, y, w, h, { id: `locked:${o.title}` });
  parent.add(card);
  const lk = scaleIcon(addIcon(scene, 0, 0, 'lock', 'D'), 0.9);
  lk.setPosition(SPACE.lg, SPACE.md);
  card.add(lk);
  ptext(scene, card, SPACE.lg + 14, SPACE.md + 1, fit(o.title, 'rInk', 7.5, inner - 14), 'head', { size: 7.5 });
  let ly = SPACE.md + 14;
  const rt = ptext(scene, card, SPACE.lg, ly, reason.lines.join('\n'), 'off');
  uiId(rt, 'locked.reason');
  ly += reason.lines.length * LINE_H + 4;
  if (o.progress) {
    card.add(new MBar(scene, SPACE.lg, ly, inner, { label: o.progress.label, right: `${o.progress.value} / ${o.progress.max}`, value: o.progress.value, max: o.progress.max, color: MOSAIC.gold, h: 4 }));
    ly += 17 + 4;
  }
  if (how) ptext(scene, card, SPACE.lg, ly, how.lines.join('\n'), 'sec');
  return h;
}

/**
 * The medal of a top-three rank: gold, silver and bronze (DUE-3: third place is
 * the bronze token, never terracotta, which means "do this"). Cinzel ink on gold
 * and silver; cream on the dark bronze, as on a bronze button (art bible 4.3).
 */
export const RANK_MEDALS: readonly { fill: number; font: FontKey }[] = [
  { fill: MOSAIC.segDone, font: 'rInk' },
  { fill: MOSAIC.offText, font: 'rInk' },
  { fill: MOSAIC.bronze, font: 'rCream' },
];

/** Rank medal of a leaderboard row (gold, silver, bronze for the top three; a sunken well below) and its number, never under 6.5. */
export function addRankMedal(scene: Phaser.Scene, parent: C, cx: number, cy: number, rank: number): void {
  const medal = rank <= 3 ? RANK_MEDALS[rank - 1] : null;
  const label = fmtCount(rank);
  const g = scene.add.graphics();
  if (medal) {
    g.fillStyle(MOSAIC.ink, 1);
    g.fillCircle(cx, cy, 9);
    g.fillStyle(medal.fill, 1);
    g.fillCircle(cx, cy, 8);
    g.lineStyle(1, MOSAIC.cream, 0.5);
    g.beginPath();
    g.arc(cx, cy, 6, Math.PI * 1.05, Math.PI * 1.6);
    g.strokePath();
  } else {
    // three digits and more: the well widens rather than the number shrinking
    const hw = label.length > 2 ? 12 : 10;
    g.fillStyle(MOSAIC.well, 1);
    g.fillRoundedRect(cx - hw, cy - 8, hw * 2, 16, 4);
    g.lineStyle(0.7, MOSAIC.parchEdge, 0.6);
    g.strokeRoundedRect(cx - hw, cy - 8, hw * 2, 16, 4);
  }
  parent.add(g);
  const size = label.length > 2 ? TEXT_MIN : 7;
  const rk = mtext(scene, cx, cy - 4, label, medal ? medal.font : 'pSec', { size, align: 0.5 });
  parent.add(rk);
}

/**
 * An icon drawn at the size it is shown (DUE-6): a kit icon scaled up from its
 * 12 UI px texture blurs, so this paints its own texture at `size` UI px times
 * the screen's density, once per size. The image is centred on (x, y).
 */
export function addCrispIcon(scene: Phaser.Scene, x: number, y: number, name: string, size: number, look: IconLook = 'light'): Phaser.GameObjects.Image {
  const parts = UI_ICONS[name] ?? VECTOR_ICONS[name];
  const k = panelK(scene);
  const key = `crisp_${look}_${name}_${size}`;
  if (parts && !scene.textures.exists(key)) scene.textures.addCanvas(key, paintIcon(name, parts, look, Math.round(size * k)))!.setFilter(Phaser.Textures.FilterMode.LINEAR);
  if (!parts) return scaleIcon(addIcon(scene, x, y, name, look === 'light' ? 'L' : look === 'dim' ? 'D' : ''), size / 12).setOrigin(0.5, 0.5);
  const img = scene.add.image(Math.round(x), Math.round(y), key).setOrigin(0.5, 0.5);
  return img.setScale(size / img.width);
}

// ------------------------------------------------------------------ numbers

interface InlineNumber {
  icon: string;
  value: string;
  word?: string;
}

/** A row of icon + number (+ word) pairs from `x` to `x + w` on parchment; words go from the right before a number is dropped. */
export function inlineNumbers(scene: Phaser.Scene, parent: C, x: number, y: number, w: number, nums: InlineNumber[]): void {
  const keep = nums.map(() => true);
  const widths = () => nums.map((n, i) => 15 + pw(n.value) + (keep[i] && n.word ? 3 + pw(n.word, 'sec') : 0));
  let ws = widths();
  const total = () => ws.reduce((a, b) => a + b, 0) + 8 * (nums.length - 1);
  for (let i = nums.length - 1; i >= 0 && total() > w; i--) {
    keep[i] = false;
    ws = widths();
  }
  let cx = x;
  nums.forEach((n, i) => {
    if (cx + ws[i] > x + w + 1) return;
    parent.add(addIcon(scene, cx, y - 2, n.icon));
    ptext(scene, parent, cx + 15, y, n.value, 'ink');
    if (keep[i] && n.word) ptext(scene, parent, cx + 15 + pw(n.value) + 3, y, n.word, 'sec');
    cx += ws[i] + 8;
  });
}
