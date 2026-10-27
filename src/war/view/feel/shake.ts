/**
 * E4 camera shake, shared by every source (the guardians' beats in ../bossFx.ts, wall breaks and rams in ./feel.ts): one
 * decaying trauma (squared, so small knocks barely move and big ones punch), smooth sines (no per-frame random), scaled
 * by the zoom; a source far from the view's centre adds less (falloff), off screen nothing. One offset a frame, so two
 * sources never stack two shakes. The player can turn it off (Settings > Display: `war.screenShake`): no shake, no nudge.
 * View only: the camera's scroll moves for the frame and is put back before the next one moves it.
 */
export const SHAKE_KEY = 'war.screenShake';

/** Is screen shake on (stored; default on)? */
export function shakeOn(): boolean {
  try {
    return localStorage.getItem(SHAKE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setShakeOn(on: boolean): void {
  try {
    localStorage.setItem(SHAKE_KEY, on ? '1' : '0');
  } catch {
    /* blocked storage: this session only */
  }
  camShake.enabled = on;
}

/**
 * How much of a shake at world px (x, y) reaches the camera: 1 at the view's centre, 0 a third of a screen past its
 * corner (the source unseen).
 */
export function shakeFalloff(x: number, y: number, v: { x: number; y: number; right: number; bottom: number }): number {
  const cx = (v.x + v.right) / 2, cy = (v.y + v.bottom) / 2, span = Math.hypot(v.right - v.x, v.bottom - v.y) * 0.65;
  return Math.max(0, 1 - Math.hypot(x - cx, y - cy) / (span * 1.3));
}

interface Cam { scrollX: number; scrollY: number; zoom: number }

export class CameraShake {
  enabled = shakeOn();
  trauma = 0;
  /** Trauma lost a second. */
  decay = 1.4;
  /** Screen px at full trauma. */
  maxPx = 16;
  private shook = { x: 0, y: 0 };
  private out = { x: 0, y: 0 };

  /** Add trauma (0..1), already scaled by the source's falloff. */
  add(amount: number): void {
    if (amount > 0) this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Undo last frame's offset (call before the camera moves). */
  undo(cam: Cam): void {
    cam.scrollX -= this.shook.x;
    cam.scrollY -= this.shook.y;
    this.shook.x = this.shook.y = 0;
  }

  /** This frame's shake in world px (decays the trauma; zero while shake is off). */
  offset(dt: number, now: number, zoom: number): { x: number; y: number } {
    this.trauma = Math.max(0, this.trauma - (dt / 1000) * this.decay);
    const o = this.out, s = this.trauma * this.trauma, amp = this.enabled ? (this.maxPx * s) / Math.max(0.35, zoom) : 0;
    o.x = amp * (Math.sin(now / 21) * 0.7 + Math.sin(now / 13.7) * 0.3);
    o.y = amp * 0.8 * (Math.sin(now / 17.3) * 0.7 + Math.sin(now / 9.1) * 0.3);
    return o;
  }

  /** Move the camera by (x, y) for this frame (undone by `undo`). */
  apply(cam: Cam, x: number, y: number): void {
    if (!this.enabled) x = y = 0;
    this.shook.x = x;
    this.shook.y = y;
    cam.scrollX += x;
    cam.scrollY += y;
  }
}

/** The one shaker of the view. */
export const camShake = new CameraShake();
