/**
 * A hotkey presses an on-screen control (ADR-0012 Decision 3, input-v6.md §0.6,
 * §3.2): the control gets the press and release a finger would give it, so its
 * own tap code runs, a disabled one says why exactly as a tap does, and the
 * control flashes so the player sees which one the key hit.
 */
import Phaser from 'phaser';

type GO = Phaser.GameObjects.GameObject & { __uiId?: string };

/** The live control with uiId `id` under `root`, or null. */
export function findUi(root: Phaser.GameObjects.Container, id: string): GO | null {
  for (const c of root.list as GO[]) {
    if (!c.active) continue;
    if (c.__uiId === id) return c;
    if (c instanceof Phaser.GameObjects.Container) {
      const hit = findUi(c, id);
      if (hit) return hit;
    }
  }
  return null;
}

/** Press and release `obj` where it is, as a tap (the same handlers a finger runs; nothing else under it is touched). */
export function tapControl(obj: GO): void {
  const at = { x: 0, y: 0 };
  obj.emit('pointerdown', at);
  obj.emit('pointerup', at);
}

/** A short dip and return of the control's alpha: "this key pressed that". */
export function flashControl(scene: Phaser.Scene, obj: GO): void {
  const o = obj as unknown as Phaser.GameObjects.Components.Alpha;
  const to = o.alpha;
  scene.tweens.add({ targets: obj, alpha: { from: to * 0.45, to }, duration: 160, ease: 'Quad.easeOut' });
}
