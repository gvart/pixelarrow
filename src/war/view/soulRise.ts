/**
 * W-68 a dismissed man's soul rises to the sky where he stood (docs/WAR.md "Lifecycle"): his class's idle frame drawn as
 * a soul is (./units.ts setRiseSource: the pale tint over an additive glow), lifting and fading over RISE_MS, inside a
 * soft column of light that grows and fades with it. No new art; a few pooled Graphics; nothing drawn when none plays.
 */
import Phaser from 'phaser';
import type { SandboxScene } from './SandboxScene';
import { setRiseSource, type ShadeGhost } from './units';

/** How long a rise plays (ms), how high the soul goes (px), the beam's height and width (px). */
const RISE_MS = 2600, LIFT = 140, BEAM_H = 300, BEAM_W = 30;

interface Rise { cls: string; x: number; y: number; at: number; id: number }
const scenes = new WeakMap<SandboxScene, Rise[]>();

/** Men dismissed here (person ids): their bodies are not drawn (he left; he did not fall); claimed again, he stands as before. */
export const dismissed = new Set<string>();

/** Play a soul rising at tile (x, y), a man of `cls` (person `pid`: his body goes). */
export function soulRise(s: SandboxScene, cls: string, x: number, y: number, pid?: string): void {
  if (pid) dismissed.add(pid);
  const list = scenes.get(s);
  if (list) list.push({ cls, x, y, at: performance.now(), id: 9000 + list.length });
}

export function mountSoulRise(s: SandboxScene): void {
  if (scenes.has(s)) return;
  const list: Rise[] = [];
  scenes.set(s, list);
  const beams: Phaser.GameObjects.Graphics[] = [];
  let ghosts: ShadeGhost[] = [];
  setRiseSource(() => ghosts);
  s.events.on('postupdate', () => {
    const now = performance.now();
    for (let i = list.length - 1; i >= 0; i--) if (now - list[i].at > RISE_MS) list.splice(i, 1);
    ghosts = [];
    list.forEach((r, i) => {
      const k = (now - r.at) / RISE_MS, ease = 1 - (1 - k) ** 2;
      // the soul: lifts away and fades out over the last two thirds
      ghosts.push({ id: r.id, cls: r.cls, x: r.x, y: r.y, alpha: k < 0.33 ? 1 : Math.max(0, 1 - (k - 0.33) / 0.67), lift: ease * LIFT });
      // the beam: rises in, holds, fades
      let g = beams[i];
      if (!g) beams.push((g = s.add.graphics().setBlendMode(Phaser.BlendModes.ADD)));
      const a = (k < 0.2 ? k / 0.2 : k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1) * 0.35;
      const fx = s.iso.sx(r.x, r.y), fy = s.iso.sy(r.x, r.y, s.iso.zAt(r.x, r.y)), h = BEAM_H * Math.min(1, k * 2.5);
      g.clear().setVisible(true).setDepth(10 + (r.x + r.y) / 4096 + 0.25);
      g.fillGradientStyle(0xbfe3ff, 0xbfe3ff, 0x8fcaff, 0x8fcaff, 0, 0, a, a);
      g.fillRect(fx - BEAM_W / 2, fy - h, BEAM_W, h);
      g.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, 0, 0, a * 0.5, a * 0.5);
      g.fillRect(fx - BEAM_W / 6, fy - h, BEAM_W / 3, h);
      g.fillStyle(0x8fcaff, a * 0.6).fillEllipse(fx, fy, BEAM_W * 1.6, BEAM_W * 0.55);
    });
    for (let i = list.length; i < beams.length; i++) beams[i].setVisible(false);
  });
}
