/**
 * Online UI bits: the cloud-sync status badge, the shop modal and the
 * supporter cosmetics (golden banner on the world map, golden trim on the army
 * header). All art is generated here so the shared icon set stays untouched.
 */
import Phaser from 'phaser';
import { Pix } from '../art/pixels';
import { P } from '../art/palette';
import { BAND_COLORS, renderPartyFigure } from '../art/worldArt';
import { Button, addIcon, addText } from './kit';
import { online } from '../platform/cloud';
import { SUPPORTER_BANNER, type SyncStatus } from '../platform/online';
import { hapticNotify } from '../platform/telegram';
import type { Product } from '../platform/api';

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
    // Taller finial and a light glint on the banner for each frame.
    for (const ox of [0, 12]) {
      px.set(ox + 9, 2, GOLD_LIGHT);
      px.set(ox + 10, 1, GOLD_LIGHT);
    }
    const tex = scene.textures.addCanvas(key, px.toCanvas())!;
    tex.add(0, 0, 0, 0, 12, 16);
    tex.add(1, 0, 12, 0, 12, 16);
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

// ------------------------------------------------------------------ shop

export interface ModalHost {
  /** Opens (replacing any open one) a parchment modal; returns its container and inner frame. */
  modal(h: number, title: string): { c: Phaser.GameObjects.Container; x: number; y: number; w: number };
  close(): void;
  /** True while this modal is still the one on screen. */
  isOpen(c: Phaser.GameObjects.Container): boolean;
}

type ShopView =
  | { kind: 'loading' }
  | { kind: 'outside' }
  | { kind: 'error'; msg: string }
  | { kind: 'list'; products: Product[]; note?: string; busy?: string };

/** Shop modal: products from the API, Telegram Stars checkout, confirmation. */
export function openShop(scene: Phaser.Scene, host: ModalHost): void {
  registerOnlineAssets(scene);
  let view: ShopView = online.available ? { kind: 'loading' } : { kind: 'outside' };
  let current: Phaser.GameObjects.Container | null = null;
  const live = () => !!current && current.active && host.isOpen(current);

  const render = () => {
    const lines = (c: Phaser.GameObjects.Container, x: number, y: number, w: number, text: string[]) =>
      text.forEach((t, i) => c.add(addText(scene, x + w / 2, y + i * 10, t, 'ink', 0.5)));
    if (view.kind !== 'list') {
      const text =
        view.kind === 'loading'
          ? ['Opening the market...']
          : view.kind === 'outside'
            ? ['The shop is available', 'in Telegram.', '', 'Open Pixelarrow from', 'the Telegram bot.']
            : [view.msg, 'Try again later.'];
      const { c, x, y, w } = host.modal(48 + text.length * 10 + 20, 'Shop');
      current = c;
      lines(c, x, y + 28, w, text);
      c.add(new Button(scene, x + w / 2 - 35, y + 30 + text.length * 10 + 6, 70, 22, { label: 'Close', icon: 'check', onClick: () => host.close() }));
      return;
    }
    const rowH = 66;
    const extra = view.note || view.busy ? 14 : 0;
    const { c, x, y, w } = host.modal(32 + Math.max(1, view.products.length) * rowH + extra + 34, 'Shop');
    current = c;
    if (view.products.length === 0) lines(c, x, y + 34, w, ['Nothing for sale yet.']);
    view.products.forEach((p, i) => {
      const ry = y + 26 + i * rowH;
      if (p.id === SUPPORTER_BANNER) c.add(scene.add.image(x + 12, ry + 3, 'supporter_banner').setOrigin(0, 0).setScale(2));
      else c.add(addIcon(scene, x + 10, ry + 4, 'star'));
      c.add(addText(scene, x + 34, ry + 2, p.title, 'red', 0, w - 44));
      c.add(addText(scene, x + 34, ry + 12, p.description, 'ink', 0, w - 44).setLineSpacing(1));
      const owned = online.has(p.id);
      c.add(addIcon(scene, x + 34, ry + 46, 'star'));
      c.add(addText(scene, x + 48, ry + 48, `${p.stars} Stars`, 'ink'));
      const b = new Button(scene, x + w - 62, ry + 42, 52, 20, {
        label: owned ? 'Owned' : 'Buy',
        style: owned ? 'buttonSel' : 'button',
        onClick: () => (owned || (view.kind === 'list' && view.busy) ? undefined : void buy(p)),
      });
      if (!owned && view.kind === 'list' && view.busy) b.setEnabled(false);
      c.add(b);
    });
    const by = y + 32 + Math.max(1, view.products.length) * rowH;
    if (view.busy || view.note) c.add(addText(scene, x + w / 2, by - 4, (view.busy ?? view.note)!, view.busy ? 'dim' : 'red', 0.5, w - 16));
    c.add(new Button(scene, x + w / 2 - 35, by + extra, 70, 22, { label: 'Close', icon: 'check', onClick: () => host.close() }));
  };

  const buy = async (p: Product) => {
    if (view.kind !== 'list') return;
    const products = view.products;
    view = { kind: 'list', products, busy: 'Preparing invoice...' };
    render();
    const res = await online.buy(p.id, (stage) => {
      if (!live()) return;
      view = { kind: 'list', products, busy: stage === 'confirming' ? 'Confirming payment...' : stage === 'paying' ? 'Waiting for Telegram...' : 'Preparing invoice...' };
      render();
    });
    const note: Record<typeof res, string> = {
      granted: 'Thank you! Your golden banner flies.',
      owned: 'You already own this.',
      pending: 'Paid. The banner arrives shortly.',
      cancelled: '',
      failed: 'Payment failed.',
      offline: 'The shop is offline. Try later.',
      unavailable: 'Available in Telegram.',
    };
    if (res === 'granted') hapticNotify('success');
    else if (res === 'failed' || res === 'offline') hapticNotify('error');
    if (!live()) return;
    view = { kind: 'list', products, note: note[res] || undefined };
    render();
  };

  render();
  if (view.kind === 'loading') {
    void (async () => {
      const [products] = await Promise.all([online.products(), online.signIn().then((ok) => (ok ? online.refreshEntitlements() : false))]);
      if (!live()) return;
      view = products ? { kind: 'list', products } : { kind: 'error', msg: 'The shop is closed.' };
      render();
    })();
  }
}
