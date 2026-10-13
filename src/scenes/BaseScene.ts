import Phaser from 'phaser';
import { sweepPanels, uiMetrics, type UIMetrics } from '../ui/kit';
import { registerScreen, navLayer, navMotion, screenOpts, showInGameBack, type LayerClose, type ScreenOpts } from '../platform/nav';
import { ENTRY_ALPHA, motion } from '../ui/motion';
import { MOSAIC, MOTION } from '../ui/tokens';
import { openSettings } from '../ui/settings';
import { renderGround } from '../art/ground';

/** The screen before this one showed a field (map or battle): the next one enters through parchment too (R6). */
let leftField = false;

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
    // the screen before this one is gone and this one is built: free the big panels nothing shows any more
    this.events.once('update', () => sweepPanels(this.game));
    this.enterMotion();
  }

  /**
   * The screen enters (F3, battle-readability.md R6):
   * - between UI screens, a short slide (from the right when drilling down,
   *   from the left after Back) with a fade, 220 ms ease-out;
   * - into or out of a field (the map, a battle: a scene with its own world
   *   camera), a 180 ms fade through parchment on every camera.
   * Reduce motion and a relayout (new screen size) enter at once. Nothing
   * here blocks input: the ui starts at ENTRY_ALPHA, not 0 (Phaser skips
   * input under an alpha-0 container, V5-067), and a camera fade is drawn
   * over the scene without touching its hit tests.
   */
  private enterMotion(): void {
    const back = navMotion.back;
    navMotion.back = false;
    const instant = motion.reduced || this.relayingOut;
    const ui = this.ui;
    let slide: Phaser.Tweens.Tween | null = null;
    if (!instant) {
      ui.x = (back ? -6 : 6) * this.m.S;
      ui.alpha = ENTRY_ALPHA;
      slide = this.tweens.add({ targets: ui, x: 0, alpha: 1, duration: MOTION.slide, ease: 'Cubic.easeOut' });
    }
    // the cameras exist once create() has run (the world camera is added after initUi)
    this.events.once('create', () => {
      const field = this.cameras.cameras.length > 1;
      const through = field || leftField;
      leftField = field;
      if (instant || !through) return;
      slide?.remove();
      ui.setPosition(0, ui.y).setAlpha(1);
      const c = Phaser.Display.Color.IntegerToColor(MOSAIC.parch);
      for (const cam of this.cameras.cameras) cam.fadeIn(MOTION.fade, c.red, c.green, c.blue);
    });
  }

  /** Set while the scene restarts for a new screen size (no entry motion then). */
  protected relayingOut = false;

  /** Default: rebuild the scene with the same data. */
  protected onResized(): void {
    this.relayingOut = true;
    this.events.once('create', () => (this.relayingOut = false));
    this.scene.restart(this.sys.settings.data);
  }

  /**
   * Register this scene as a navigation screen. `back` goes back one level
   * (omit / null on a root screen: Telegram then shows Close). A tab hub is
   * always a root (`screenOpts`, ia.md §6): its sub-views declare their own
   * Back through the shells (`hubView`). Telegram's ⋯ → Settings opens the
   * settings modal unless `settings` overrides it.
   */
  protected screen(opts: ScreenOpts): void {
    registerScreen(this, screenOpts(this.scene.key, { settings: () => openSettings(this), ...opts }));
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
