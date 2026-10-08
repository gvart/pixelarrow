import Phaser from 'phaser';
import { uiMetrics, type UIMetrics } from '../ui/kit';
import { registerScreen, navLayer, showInGameBack, type LayerClose, type ScreenOpts } from '../platform/nav';
import { openSettings } from '../ui/settings';
import { renderGround } from '../art/ground';

/**
 * Common scaffolding: a UI root container scaled to integer pixels, resize
 * handling and back navigation (Telegram's header Back button, see nav.ts).
 */
export abstract class BaseScene extends Phaser.Scene {
  ui!: Phaser.GameObjects.Container;
  m!: UIMetrics;
  private resizeTimer: Phaser.Time.TimerEvent | null = null;

  protected initUi(): void {
    this.m = uiMetrics(this);
    this.ui = this.add.container(0, 0).setScale(this.m.S);
    // Phaser emits 'resize' on every scale.refresh(), even when nothing changed,
    // and Telegram triggers refreshes constantly (viewportChanged / safe-area
    // events, e.g. whenever its header Back button is shown or hidden).
    // Rebuilding the scene then would close every modal and restart the
    // screen just opened, so only react to a real change of the game size.
    let laidOut = { w: this.scale.width, h: this.scale.height };
    const changed = () => this.scale.width !== laidOut.w || this.scale.height !== laidOut.h;
    const onResize = () => {
      this.resizeTimer?.remove();
      this.resizeTimer = null;
      if (!changed()) return;
      this.resizeTimer = this.time.delayedCall(150, () => {
        this.resizeTimer = null;
        if (!changed()) return;
        laidOut = { w: this.scale.width, h: this.scale.height };
        this.onResized();
      });
    };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', onResize);
    });
  }

  /** Default: rebuild the scene with the same data. */
  protected onResized(): void {
    this.scene.restart(this.sys.settings.data);
  }

  /**
   * Register this scene as a navigation screen. `back` goes back one level
   * (omit / null on a root screen: Telegram then shows Close). Telegram's ⋯ →
   * Settings opens the settings modal unless `settings` overrides it.
   */
  protected screen(opts: ScreenOpts): void {
    registerScreen(this, { settings: () => openSettings(this), ...opts });
  }

  /** @deprecated use screen({ back }). */
  protected telegramBack(cb: (() => void) | null): void {
    this.screen({ back: cb });
  }

  /** Make a modal closable with Back; the layer goes away when `container` is destroyed. */
  protected modalLayer(container: Phaser.GameObjects.Container, close: LayerClose): void {
    navLayer(container, close, this);
  }

  /** Draw an in-game back arrow? Not inside Telegram, whose header Back button does it. */
  protected get inGameBack(): boolean {
    return showInGameBack();
  }

  /** Grass backdrop at UI scale. */
  protected addGrassBackdrop(seed = 3): Phaser.GameObjects.Image {
    const { VW, VH } = this.m;
    const key = `grass_${VW}x${VH}_${seed}`;
    if (!this.textures.exists(key)) {
      const pix = renderGround(VW, VH, { originX: 0, originY: VW, fieldW: 1e6, fieldH: 1e6, seed });
      this.textures.addCanvas(key, pix.toCanvas());
    }
    const img = this.add.image(0, 0, key).setOrigin(0, 0);
    this.ui.add(img);
    return img;
  }
}
