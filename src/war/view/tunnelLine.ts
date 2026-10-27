/**
 * W-66 the line at the Tunnel of Shades (./hud/tunnel.ts keeps the clock): in the player's home town a line of shades
 * stands before the tunnel mouth (its +y face), one for each man still to come (at most the floor), the far end fading
 * into the dark. Each rise, the front shade walks into the mouth, flashes and stands there as the soldier he becomes,
 * then fades (online he is at home; offline he joins the map there), and the line steps up one place. Over the tunnel the
 * countdown: "Next shade rises in 7:42, 3/6".
 *
 * The shades use the shades art (./shades.ts: loadShades, SHADE_IDS) once it exists, found by import.meta.glob so this
 * compiles without it; until then they are drawn as souls are (a tinted, glowing idle clip: ./units.ts setShadeSource),
 * and the man at the mouth always is.
 */
import Phaser from 'phaser';
import { START_CLASSES } from '../world/start';
import { tunnelLine } from '../sim/tunnel';
import type { SandboxScene } from './SandboxScene';
import type { TunnelHost } from './hud/tunnel';
import { setShadeSource, type ShadeGhost } from './units';

/** Shades art (./shades.ts), when present: ids, the walk anim, and each shade's feet origin and draw scale. */
interface ShadeArt { ids: readonly string[]; anim(id: string): string; scale(id: string): number; origin(id: string): [number, number] }
const SHADES_MOD = import.meta.glob('./shades.ts');

async function loadShadeArt(scene: Phaser.Scene): Promise<ShadeArt | null> {
  const load = SHADES_MOD['./shades.ts'];
  if (!load) return null;
  try {
    const m = (await load()) as {
      loadShades(s: Phaser.Scene): Promise<unknown>; SHADE_IDS: readonly string[];
      shadeAnim(id: string, dir: 'sw' | 'se'): string; shadeDef(id: string): { originX: number; originY: number; scale: number } | undefined;
    };
    await m.loadShades(scene);
    if (!m.SHADE_IDS?.length) return null;
    return {
      ids: m.SHADE_IDS,
      // the line walks up to the mouth (north-east); the sheets face south: the south-east row reads best
      anim: (id) => m.shadeAnim(id, 'se'),
      scale: (id) => m.shadeDef(id)?.scale ?? 1,
      origin: (id) => { const d = m.shadeDef(id); return [d?.originX ?? 0.5, d?.originY ?? 0.85]; },
    };
  } catch {
    return null;
  }
}

/** Tiles between places in the line; the faint shades past its end. */
const STEP = 0.9;
const TAIL = [0.32, 0.12];
/** A rise (ms after it): the front shade reaches the mouth, flashes, stands as the man, is gone. */
const WALK = 800, FLASH = 1300, GONE = 3400;
const FILL: readonly string[] = START_CLASSES;

export function mountTunnelLine(s: SandboxScene, host: TunnelHost): void {
  let art: ShadeArt | null = null;
  void loadShadeArt(s).then((a) => (art = a));
  const sprites: Phaser.GameObjects.Sprite[] = [];
  const label = s.add.text(0, 0, '', { fontFamily: 'Inter, sans-serif', fontStyle: '600', fontSize: '13px', color: '#d6ecff', stroke: '#05070d', strokeThickness: 4 })
    .setOrigin(0.5, 1).setResolution(2).setDepth(1e6).setVisible(false);
  let ghosts: ShadeGhost[] = [];
  setShadeSource(() => ghosts);

  s.events.on('postupdate', () => {
    const t = host.tunnel(), now = performance.now();
    ghosts = [];
    let used = 0;
    if (!t || !host.ever) {
      for (const sp of sprites) sp.setVisible(false);
      label.setVisible(false);
      return;
    }
    const mouthY = t.y + t.h / 2;
    const at = (i: number) => ({ x: t.x + (i % 2 ? 0.18 : -0.18) * Math.min(1, Math.max(0, i)), y: mouthY + 0.9 + i * STEP });
    // the latest rise still playing: the line steps up from one place back, the front shade becomes the man
    const r = host.rises.length ? host.rises[host.rises.length - 1] : null, el = r ? now - r.at : Infinity;
    const playing = el >= 0 && el < GONE;
    const shift = playing ? Math.max(0, 1 - el / 1000) : 0;
    const n = Math.min(host.pending, 6);
    const shade = (id: number, cls: string, x: number, y: number, alpha: number) => {
      if (alpha <= 0.01) return;
      if (art) {
        const sid = art.ids[id % art.ids.length], key = art.anim(sid), [ox, oy] = art.origin(sid);
        let sp = sprites[used];
        if (!sp) sprites.push((sp = s.add.sprite(0, 0, `shade-${sid}`)));
        used++;
        if (s.anims.exists(key) && sp.anims.currentAnim?.key !== key) sp.play({ key, repeat: -1, startFrame: id % 4 });
        sp.setOrigin(ox, oy).setScale(art.scale(sid)).setAlpha(alpha).setVisible(true)
          .setPosition(Math.round(s.iso.sx(x, y)), Math.round(s.iso.sy(x, y, s.iso.zAt(x, y)))).setDepth(10 + (x + y) / 4096 + 0.24);
      } else ghosts.push({ id, cls, x, y, alpha });
    };
    for (let i = 0; i < n + TAIL.length; i++) {
      const p = at(i + shift), alpha = i < n ? 1 : TAIL[i - n];
      const id = host.rises.length + i + 1; // a shade keeps his look as the line steps up
      shade(id, FILL[id % FILL.length], p.x, p.y, alpha);
    }
    if (playing && r) {
      // the front shade walks into the mouth, flashes, and stands there as the man
      const k = Math.min(1, el / WALK), from = at(shift), x = from.x + (t.x - from.x) * k, y = from.y + (mouthY + 0.3 - from.y) * k;
      if (el < FLASH) shade(0, r.cls, x, y, 1 - Math.max(0, (el - WALK) / (FLASH - WALK)));
      if (el >= WALK) {
        const flash = el < FLASH ? Math.sin(((el - WALK) / (FLASH - WALK)) * Math.PI) : 0;
        const alpha = Math.min(1, (el - WALK) / 300) * (el > GONE - 800 ? (GONE - el) / 800 : 1);
        ghosts.push({ id: 0, cls: r.cls, x: t.x, y: mouthY + 0.3, alpha, solid: true, flash });
      }
    }
    for (let i = used; i < sprites.length; i++) sprites[i].setVisible(false);
    const line = tunnelLine(host.alive, host.nextAt, host.now());
    label.setVisible(!!line);
    if (line) label.setText(line).setPosition(Math.round(s.iso.sx(t.x, t.y)), Math.round(s.iso.sy(t.x, t.y, s.iso.zAt(t.x, t.y)) - 150));
  });
}
