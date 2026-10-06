import Phaser from 'phaser';
import { uiMetrics, type UIMetrics } from '../ui/kit';
import { setBackButton } from '../platform/telegram';
import { renderGround } from '../art/ground';

/** Common scaffolding: a UI root container scaled to integer pixels, resize handling, back button. */
export abstract class BaseScene extends Phaser.Scene {
  ui!: Phaser.GameObjects.Container;
  m!: UIMetrics;
  private resizeTimer: Phaser.Time.TimerEvent | null = null;

  protected initUi(): void {
    this.m = uiMetrics(this);
    this.ui = this.add.container(0, 0).setScale(this.m.S);
    const onResize = () => {
      this.resizeTimer?.remove();
      this.resizeTimer = this.time.delayedCall(150, () => this.onResized());
    };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', onResize);
      setBackButton(null);
    });
  }

  /** Default: rebuild the scene with the same data. */
  protected onResized(): void {
    this.scene.restart(this.sys.settings.data);
  }

  protected telegramBack(cb: (() => void) | null): void {
    setBackButton(cb);
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
