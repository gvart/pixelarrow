/**
 * Veteran and elite markers under the selected men (M5g, docs/WAR.md "Anti-oversaturation": elites and veterans get a
 * visible marker): a terracotta pip under a veteran (level 3..5), two gold pips under an elite (level 6 up or an elite
 * class), black-outlined like the red-figure kit, a few screen px at any zoom. Sprite zoom only (dots and banners carry none).
 */
import Phaser from 'phaser';
import { CLASSES, isClassId } from '../../../../data/classes';
import type { SandboxScene } from '../../SandboxScene';
import { SPRITE_ZOOM } from '../../units';

export type Rank = 'recruit' | 'veteran' | 'elite';
export const rankOf = (cls: string | undefined, level: number): Rank =>
  level >= 6 || (isClassId(cls ?? '') && CLASSES[cls as keyof typeof CLASSES].role === 'elite') ? 'elite' : level >= 3 ? 'veteran' : 'recruit';

export function markers(s: SandboxScene): void {
  const g = s.add.graphics().setDepth(9.5); // over the ground and the rings (9), under the men (10+)
  s.events.on('postupdate', () => {
    g.clear();
    const z = s.cameras.main.zoom;
    if (z < SPRITE_ZOOM || !s.selected.size) return;
    const px = 1 / z; // one screen px in world px
    const pip = (x: number, y: number, r: number, fill: number) => {
      g.fillStyle(0x0e0907, 1).fillPoints([new Phaser.Math.Vector2(x, y - r - px), new Phaser.Math.Vector2(x + r + px, y), new Phaser.Math.Vector2(x, y + r + px), new Phaser.Math.Vector2(x - r - px, y)], true);
      g.fillStyle(fill, 1).fillPoints([new Phaser.Math.Vector2(x, y - r), new Phaser.Math.Vector2(x + r, y), new Phaser.Math.Vector2(x, y + r), new Phaser.Math.Vector2(x - r, y)], true);
    };
    for (const d of s.drawn) {
      const u = d.u;
      if (!s.selected.has(u.squad) || u.state === 'dead' || !u.level) continue;
      const rank = rankOf(u.cls, u.level);
      if (rank === 'recruit') continue;
      const x = s.iso.sx(d.x, d.y), y = s.iso.sy(d.x, d.y, s.iso.zAt(d.x, d.y)) + 7 * px, r = 2.5 * px;
      if (rank === 'veteran') pip(x, y, r, 0xde8a4e);
      else (pip(x - 3.5 * px, y, r, 0xe0b867), pip(x + 3.5 * px, y, r, 0xe0b867));
    }
  });
}
