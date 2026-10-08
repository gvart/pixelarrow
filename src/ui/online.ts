/**
 * Online UI bits: the cloud-sync status badge and the
 * supporter cosmetics (golden banner on the world map, golden trim on the army
 * header). All art is generated here so the shared icon set stays untouched.
 */
import Phaser from 'phaser';
import { Pix } from '../art/pixels';
import { P } from '../art/palette';
import { BAND_COLORS, PARTY_FH, PARTY_FINIAL, PARTY_FRAMES, PARTY_FW, renderPartyFigure } from '../art/worldArt';
import { online } from '../platform/cloud';
import { SUPPORTER_BANNER, type SyncStatus } from '../platform/online';

const GOLD = P.gold;
const GOLD_DARK = P.goldDark;
const GOLD_LIGHT = 0xf6e0a0;

const CLOUD = ['....####....', '...#oooo#...', '.###oooo###.', '#oooooooooo#', '#oooooooooo#', '#oooooooooo#', '.##########.'];

function cloudIcon(fill: number, line: number, marks: [number, number][], mark: number): Pix {
  const px = new Pix(12, 7);
  px.bitmap(0, 0, CLOUD, { '#': line, o: fill });
  for (const [x, y] of marks) px.set(x, y, mark);
  return px;
}

/** Small golden standard: pole, finial and a swallow-tailed gold banner (8x12). */
function bannerIcon(): Pix {
  const px = new Pix(8, 12);
  px.bitmap(0, 0, ['.g......', '.#......', '.#ggggg.', '.#gyyyg.', '.#gggg..', '.#gyyyg.', '.#ggggg.', '.#g...g.', '.#......', '.#......', '.#......', '###.....'], {
    '#': 0x6a4a2a,
    g: GOLD,
    y: GOLD_LIGHT,
  });
  return px;
}

/** Registers the sync/supporter textures once per game. */
export function registerOnlineAssets(scene: Phaser.Scene): void {
  if (scene.textures.exists('sync_synced')) return;
  const check: [number, number][] = [[3, 4], [4, 5], [5, 4], [6, 3], [7, 2]];
  const arrow: [number, number][] = [[5, 1], [6, 1], [4, 2], [5, 2], [6, 2], [7, 2], [5, 3], [6, 3], [5, 4], [6, 4], [5, 5], [6, 5]];
  const cross: [number, number][] = [[4, 2], [5, 3], [6, 4], [7, 5], [7, 2], [6, 3], [5, 4], [4, 5]];
  scene.textures.addCanvas('sync_synced', cloudIcon(P.cream, P.ink, check, 0x4f7a3a).toCanvas());
  scene.textures.addCanvas('sync_syncing', cloudIcon(P.cream, P.ink, arrow, 0x4a6b9a).toCanvas());
  scene.textures.addCanvas('sync_offline', cloudIcon(0xbfb0a2, 0x6a5a50, cross, P.red).toCanvas());
  scene.textures.addCanvas('supporter_banner', bannerIcon().toCanvas());
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
  const img = scene.add.image(Math.round(x), Math.round(y), SYNC_TEXTURE[online.status]).setOrigin(0, 0);
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
  parent.add(scene.add.image(Math.round(titleX - titleW / 2 - 12), 5, 'supporter_banner').setOrigin(0, 0));
  parent.add(scene.add.image(Math.round(titleX + titleW / 2 + 4), 5, 'supporter_banner').setOrigin(0, 0).setFlipX(true));
}

