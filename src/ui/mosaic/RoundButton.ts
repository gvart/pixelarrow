/**
 * RoundButton: a round stone map button with a bronze rim, an engraved icon, a
 * tiny Cinzel label under it (up to two lines) and an optional red badge. The
 * war map's column at the right edge (Army, Clan, Lobby, Region map).
 */
import Phaser from 'phaser';
import { addIcon, panelK, scaleIcon } from '../kit';
import { uiId } from '../layout';
import { MOSAIC } from '../tokens';
import { MBadge, TAP, centeredFace, fit, makePressable, mtext, mw, put } from './base';

export interface RoundButtonOpts {
  icon: string;
  label: string;
  onClick?: () => void;
  badge?: number | string;
  tip?: string;
  /** Disc diameter in UI px (default 24, at least a touch target). */
  d?: number;
  /** Draw the label under the disc (default true). */
  showLabel?: boolean;
  id?: string;
}

const LABEL_SIZE = 5.5;
const LABEL_LINE = 8;

/** The label as at most two lines that fit `w` (a split at a space, else shortened). */
function labelLines(label: string, w: number): string[] {
  const up = label.toUpperCase();
  if (mw(up, 'rCream', LABEL_SIZE) <= w) return [up];
  const words = up.split(' ');
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    if (mw(a, 'rCream', LABEL_SIZE) <= w && mw(b, 'rCream', LABEL_SIZE) <= w) return [a, b];
  }
  return [fit(up, 'rCream', LABEL_SIZE, w)];
}

function discTexture(scene: Phaser.Scene, d: number): string {
  const K = panelK(scene);
  const key = `panel_mosaic_round_${d}@${K}`;
  if (scene.textures.exists(key)) return key;
  const W = Math.round(d * K);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = W;
  const ctx = canvas.getContext('2d')!;
  const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  const c = W / 2;
  const r = c - K * 0.8;
  ctx.beginPath();
  ctx.arc(c + K * 0.3, c + K * 1.1, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill();
  const rim = ctx.createLinearGradient(c - r, c - r, c + r, c + r);
  rim.addColorStop(0, css(MOSAIC.bronzeHi));
  rim.addColorStop(0.5, css(MOSAIC.bronze));
  rim.addColorStop(1, css(MOSAIC.bronzeLo));
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fillStyle = rim;
  ctx.fill();
  const fr = r - K * 1.8;
  const face = ctx.createRadialGradient(c - fr * 0.3, c - fr * 0.35, fr * 0.1, c, c, fr);
  face.addColorStop(0, css(MOSAIC.stone3));
  face.addColorStop(0.7, css(MOSAIC.stone2));
  face.addColorStop(1, css(MOSAIC.stone1));
  ctx.beginPath();
  ctx.arc(c, c, fr, 0, Math.PI * 2);
  ctx.fillStyle = face;
  ctx.fill();
  ctx.lineWidth = Math.max(1, K * 0.7);
  ctx.strokeStyle = 'rgba(14,10,6,0.8)';
  ctx.stroke();
  scene.textures.addCanvas(key, canvas)!.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return key;
}

export class RoundButton extends Phaser.GameObjects.Container {
  /** Width of the whole control (disc and label) and its height. */
  readonly w: number;
  readonly h: number;
  readonly d: number;
  readonly opts: { label: string; icon: string };

  /** Width and height a button with these options takes (for laying out a column). */
  static size(o: Pick<RoundButtonOpts, 'd' | 'showLabel'>): { w: number; h: number } {
    const d = Math.max(TAP, o.d ?? 24);
    return { w: d + 10, h: d + (o.showLabel === false ? 0 : 2 + 2 * LABEL_LINE) };
  }

  constructor(scene: Phaser.Scene, x: number, y: number, o: RoundButtonOpts) {
    super(scene, Math.round(x), Math.round(y));
    const d = Math.max(TAP, o.d ?? 24);
    this.d = d;
    this.opts = { label: o.label, icon: o.icon };
    const lines = o.showLabel === false ? [] : labelLines(o.label, d + 10);
    this.w = d + 10;
    this.h = d + (lines.length ? 2 + lines.length * LABEL_LINE : 0);
    const face = centeredFace(this.scene, this.w, d);
    this.add(face);
    const x0 = Math.round((this.w - d) / 2);
    const disc = put(face, this.w, d, scene.add.image(x0, 0, discTexture(scene, d)).setOrigin(0, 0).setScale(1 / panelK(scene)));
    void disc;
    const ic = scaleIcon(addIcon(scene, 0, 0, o.icon, 'L'), 1.5);
    ic.setPosition(Math.round((this.w - ic.displayWidth) / 2), Math.round((d - ic.displayHeight) / 2) - 1);
    put(face, this.w, d, ic);
    lines.forEach((l, i) => this.add(mtext(scene, this.w / 2, d + 2 + i * LABEL_LINE, l, 'rCream', { size: LABEL_SIZE, align: 0.5, box: { owner: this, w: this.w, h: this.h } })));
    if (o.badge !== undefined && o.badge !== 0) this.add(new MBadge(scene, x0 + d - 3, 3, o.badge));
    makePressable(this, { face, w: this.w, h: this.h, onTap: () => o.onClick?.(), tip: o.tip ?? o.label });
    uiId(this, o.id ?? `round:${o.label}`);
    scene.add.existing(this);
  }
}
