/**
 * Online UI bits: the cloud-sync status badge and the
 * supporter cosmetics (golden banner on the world map, golden trim on the army
 * header). All art is generated here so the shared icon set stays untouched.
 */
import Phaser from 'phaser';
import { panelK } from './kit';
import { P } from '../art/palette';
import { BAND_COLORS, PARTY_FH, PARTY_FINIAL, PARTY_FRAMES, PARTY_FW, renderPartyFigure } from '../art/worldArt';
import { online } from '../platform/cloud';
import { SUPPORTER_BANNER, type SyncStatus } from '../platform/online';

const GOLD = P.gold;
const GOLD_DARK = P.goldDark;
const GOLD_LIGHT = 0xf6e0a0;

type Ctx = CanvasRenderingContext2D;
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** A canvas of w x h UI px at K atlas px per UI px, drawn in UI-px units. */
function drawCanvas(w: number, h: number, K: number, draw: (ctx: Ctx) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(w * K);
  c.height = Math.round(h * K);
  const ctx = c.getContext('2d')!;
  ctx.scale(K, K);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  return c;
}

/** Smooth cloud badge (12x7 UI px) with a mark: a check, an up arrow or a cross. */
function cloudIcon(K: number, fill: [string, string], mark: 'check' | 'arrow' | 'cross', markColor: number): HTMLCanvasElement {
  return drawCanvas(12, 7, K, (ctx) => {
    const cloud = new Path2D();
    cloud.arc(6, 3.2, 2.4, Math.PI, 0);
    cloud.arc(9.3, 4.3, 1.8, -Math.PI / 2, Math.PI / 2);
    cloud.lineTo(2.7, 6.1);
    cloud.arc(2.7, 4.3, 1.8, Math.PI / 2, (3 * Math.PI) / 2);
    cloud.closePath();
    ctx.save();
    ctx.translate(0, 0.45);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill(cloud);
    ctx.restore();
    const g = ctx.createLinearGradient(0, 0.8, 0, 6.2);
    g.addColorStop(0, fill[0]);
    g.addColorStop(1, fill[1]);
    ctx.fillStyle = g;
    ctx.fill(cloud);
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = '#1a120c';
    ctx.stroke(cloud);
    ctx.strokeStyle = hex(markColor);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    if (mark === 'check') {
      ctx.moveTo(4.4, 4.2);
      ctx.lineTo(5.6, 5.2);
      ctx.lineTo(7.8, 2.9);
    } else if (mark === 'arrow') {
      ctx.moveTo(6, 5.4);
      ctx.lineTo(6, 2.4);
      ctx.moveTo(4.7, 3.6);
      ctx.lineTo(6, 2.3);
      ctx.lineTo(7.3, 3.6);
    } else {
      ctx.moveTo(4.7, 2.8);
      ctx.lineTo(7.3, 5.2);
      ctx.moveTo(7.3, 2.8);
      ctx.lineTo(4.7, 5.2);
    }
    ctx.stroke();
  });
}

/** Small golden standard (8x12 UI px): wooden pole, gold finial and a swallow-tailed gold banner. */
function bannerIcon(K: number): HTMLCanvasElement {
  return drawCanvas(8, 12, K, (ctx) => {
    // pole and foot
    ctx.fillStyle = '#5a3818';
    ctx.fillRect(1.2, 1.2, 0.9, 10.3);
    ctx.fillRect(0.4, 11, 2.6, 0.8);
    // finial
    ctx.beginPath();
    ctx.arc(1.65, 0.9, 0.75, 0, Math.PI * 2);
    ctx.fillStyle = hex(GOLD_LIGHT);
    ctx.fill();
    // swallow-tailed banner, lit from the top
    const b = new Path2D('M2.1 2 L7.4 2 L7.4 8.4 L6 7.2 L4.75 8.4 L3.5 7.2 L2.1 8.4 Z');
    const g = ctx.createLinearGradient(0, 2, 0, 8.4);
    g.addColorStop(0, hex(GOLD_LIGHT));
    g.addColorStop(0.5, hex(GOLD));
    g.addColorStop(1, hex(GOLD_DARK));
    ctx.fillStyle = g;
    ctx.fill(b);
    ctx.lineWidth = 0.45;
    ctx.strokeStyle = '#3a2410';
    ctx.stroke(b);
    // a woven band across it
    ctx.fillStyle = 'rgba(120,70,20,0.55)';
    ctx.fillRect(2.4, 4.1, 4.7, 0.6);
  });
}

/** Registers the sync/supporter textures once per game (smooth, at this screen's density). */
export function registerOnlineAssets(scene: Phaser.Scene): void {
  if (scene.textures.exists('sync_synced')) return;
  const K = panelK(scene);
  const add = (key: string, c: HTMLCanvasElement) => scene.textures.addCanvas(key, c)!.setFilter(Phaser.Textures.FilterMode.LINEAR);
  add('sync_synced', cloudIcon(K, ['#fffaf0', '#d8cbb0'], 'check', 0x4f8a3a));
  add('sync_syncing', cloudIcon(K, ['#fffaf0', '#d8cbb0'], 'arrow', 0x3f6ea8));
  add('sync_offline', cloudIcon(K, ['#c8bcaa', '#8f826d'], 'cross', 0xb4483a));
  add('supporter_banner', bannerIcon(K));
}

const SYNC_TEXTURE: Record<SyncStatus, string> = {
  synced: 'sync_synced',
  syncing: 'sync_syncing',
  offline: 'sync_offline',
  local: 'sync_offline',
};

/**
 * Cloud-sync badge (12x7 UI pixels) that follows the online status: synced,
 * syncing (blinking) or offline/local. Unsubscribes when the scene shuts down.
 */
export function addSyncBadge(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number): Phaser.GameObjects.Image {
  registerOnlineAssets(scene);
  const img = scene.add.image(Math.round(x), Math.round(y), SYNC_TEXTURE[online.status]).setOrigin(0, 0).setScale(1 / panelK(scene));
  parent.add(img);
  let blink: Phaser.Tweens.Tween | null = null;
  const apply = (s: SyncStatus) => {
    if (!img.active) return;
    img.setTexture(SYNC_TEXTURE[s]);
    blink?.stop();
    blink = null;
    img.setAlpha(s === 'local' ? 0.7 : 1);
    if (s === 'syncing') blink = scene.tweens.add({ targets: img, alpha: 0.35, duration: 450, yoyo: true, repeat: -1 });
  };
  apply(online.status);
  const off = online.onStatus(apply);
  scene.events.once('shutdown', off);
  img.once('destroy', off);
  return img;
}

export function isSupporter(): boolean {
  return online.has(SUPPORTER_BANNER);
}

/** World-map texture for the player's party: golden standard for supporters. */
export function playerPartyTexture(scene: Phaser.Scene): string {
  if (!isSupporter()) return 'wm_band_player';
  const key = 'wm_band_player_gold';
  if (!scene.textures.exists(key)) {
    const px = renderPartyFigure(BAND_COLORS.player, GOLD);
    // A light glint on the finial and the banner in each frame.
    for (let f = 0; f < PARTY_FRAMES; f++) {
      const ox = f * PARTY_FW + PARTY_FINIAL.x;
      const bob = f % 2 ? -1 : 0;
      px.set(ox, PARTY_FINIAL.y + bob, GOLD_LIGHT);
      px.set(ox + 1, PARTY_FINIAL.y + bob + 2, GOLD_LIGHT);
    }
    const tex = scene.textures.addCanvas(key, px.toCanvas())!;
    for (let f = 0; f < PARTY_FRAMES; f++) tex.add(f, 0, f * PARTY_FW, 0, PARTY_FW, PARTY_FH);
  }
  return key;
}

/** Golden trim along a header bar plus the supporter standard beside the title. */
export function addSupporterTrim(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, w: number, h: number, titleX: number, titleW: number): void {
  if (!isSupporter()) return;
  registerOnlineAssets(scene);
  const g = scene.add.graphics();
  g.fillStyle(GOLD, 1);
  g.fillRect(0, h - 2, w, 1);
  g.fillRect(0, 0, w, 1);
  g.fillStyle(GOLD_DARK, 1);
  g.fillRect(0, h - 1, w, 1);
  for (let x = 3; x < w; x += 8) {
    g.fillStyle(GOLD_LIGHT, 1);
    g.fillRect(x, h - 2, 2, 1);
  }
  parent.add(g);
  parent.add(scene.add.image(Math.round(titleX - titleW / 2 - 12), 5, 'supporter_banner').setOrigin(0, 0).setScale(1 / panelK(scene)));
  parent.add(scene.add.image(Math.round(titleX + titleW / 2 + 4), 5, 'supporter_banner').setOrigin(0, 0).setScale(1 / panelK(scene)).setFlipX(true));
}

