/**
 * Battle visual effects, pooled and capped for mid-range phones:
 * aura ground rings, particle bursts and sparkles, floating ability icons,
 * stun stars, buff pips above heads and floating damage numbers.
 * Reads simulation state only; never touches the sim.
 */
import { uiIgnore } from './layout';
import Phaser from 'phaser';
import { FX_ICON_PX, renderAuraRing, renderDot, renderFxIcon, renderPip, renderStar, isoEllipse } from '../art/fx';
import { VECTOR_ICONS } from '../art/vectorIcons';
import { RS } from '../platform/renderScale';
import { ABILITIES, AURAS, AURA_IDS, type AbilityId, type AuraId } from '../data/perks';
import { willRadius } from '../sim/stats';
import type { SimUnit } from '../sim/types';

const RING_FRAMES = 8;
const MAX_PARTICLES = 240;
const MAX_NUMBERS = 24;
/** Gear and aura motes alive at once (on top of the burst pool's own cap). */
const MAX_MOTES = 48;
const DEPTH_RING = -75000;
const DEPTH_FX = 96000;

interface Particle {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  grav: number;
  life: number;
  max: number;
  live: boolean;
}

interface FloatItem {
  obj: Phaser.GameObjects.Image | Phaser.GameObjects.BitmapText;
  x: number;
  y: number;
  t: number;
  dur: number;
  rise: number;
  live: boolean;
  /** Scale showing the texture at its intended size (smooth icons are drawn denser). */
  scale?: number;
}

interface Overlay {
  rings: Map<AuraId, Phaser.GameObjects.Image>;
  stars: Phaser.GameObjects.Image[];
  pips: Phaser.GameObjects.Image[];
}

const PIP_DEFS: { key: string; kind: 'up' | 'fang' | 'shield'; color: number }[] = [
  { key: 'pip_steady', kind: 'shield', color: AURAS.steady.color },
  { key: 'pip_eagle', kind: 'up', color: AURAS.eagle.color },
  { key: 'pip_warlord', kind: 'up', color: AURAS.warlord.color },
  { key: 'pip_berserk', kind: 'fang', color: 0xe04030 },
];

export function registerFxTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('fx_star')) return;
  scene.textures.addCanvas('fx_star', renderStar().toCanvas());
  for (const p of PIP_DEFS) scene.textures.addCanvas(p.key, renderPip(p.kind, p.color).toCanvas());
  scene.textures.addCanvas('fx_dot1', renderDot(1, 0xffffff).toCanvas());
  scene.textures.addCanvas('fx_dot2', renderDot(2, 0xffffff).toCanvas());
  // smooth icons drawn at the screen's density for the closest camera zoom (3x); floatIcon scales them down
  const fxN = FX_ICON_PX * RS * 3;
  for (const id of Object.keys(ABILITIES) as AbilityId[]) {
    const def = ABILITIES[id];
    scene.textures.addCanvas(`fxicon_${id}`, renderFxIcon(VECTOR_ICONS[def.icon] ?? VECTOR_ICONS.star, fxN))!.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
  scene.textures.addCanvas('fxicon_levelup', renderFxIcon(VECTOR_ICONS.star, fxN))!.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

export class BattleFx {
  private parts: Particle[] = [];
  private floats: FloatItem[] = [];
  private numbers: FloatItem[] = [];
  private overlays = new Map<number, Overlay>();
  private waves: { img: Phaser.GameObjects.Image; x: number; y: number; t: number; dur: number }[] = [];
  showNumbers = true;

  constructor(private scene: Phaser.Scene, private layer: Phaser.GameObjects.Layer) {
    registerFxTextures(scene);
  }

  private ringKey(aura: AuraId, r: number, frame: number): string {
    const rr = Math.round(r * 4) / 4;
    const key = `aura_${aura}_${rr}_${frame}`;
    if (!this.scene.textures.exists(key)) this.scene.textures.addCanvas(key, renderAuraRing(rr, AURAS[aura].color, frame, RING_FRAMES).toCanvas());
    return key;
  }

  // ------------------------------------------------------------ particles

  /** A burst of square particles at a world point (pixels). */
  burst(x: number, y: number, color: number, n: number, o: { speed?: number; up?: number; grav?: number; life?: number; big?: boolean; small?: boolean } = {}): void {
    const speed = o.speed ?? 40;
    for (let i = 0; i < n; i++) {
      let p = this.parts.find((q) => !q.live);
      if (!p) {
        if (this.parts.length >= MAX_PARTICLES) return;
        const img = this.scene.add.image(0, 0, 'fx_dot1').setDepth(DEPTH_FX);
        this.layer.add(img);
        p = { img, x: 0, y: 0, vx: 0, vy: 0, grav: 0, life: 0, max: 1, live: false };
        this.parts.push(p);
      }
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      const v = speed * (0.5 + Math.random() * 0.6);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v * 0.5 - (o.up ?? 20);
      p.grav = o.grav ?? 60;
      p.max = (o.life ?? 0.6) * (0.7 + Math.random() * 0.5);
      p.life = p.max;
      p.live = true;
      p.img.setTexture(o.big || (!o.small && Math.random() < 0.3) ? 'fx_dot2' : 'fx_dot1').setTint(color).setVisible(true).setAlpha(1);
    }
  }

  /** One slow rising mote (legendary gear, aura cosmetics): drifts up, flickers out. Capped separately. */
  mote(x: number, y: number, color: number): void {
    let live = 0;
    for (const p of this.parts) if (p.live && p.grav === -5) live++;
    if (live >= MAX_MOTES) return;
    this.burst(x, y, color, 1, { speed: 3, up: 9, grav: -5, life: 1.1, small: true });
  }

  /** Slow rising sparkles (morale up). */
  sparkle(x: number, y: number, color: number, n = 3): void {
    this.burst(x, y, color, n, { speed: 8, up: 18, grav: -6, life: 0.9 });
  }

  /** An expanding ring on the ground (shout wave). */
  wave(x: number, y: number, aura: AuraId, r: number): void {
    const img = this.scene.add.image(x, y, this.ringKey(aura, r, 0)).setDepth(DEPTH_RING + 1);
    this.layer.add(img);
    this.waves.push({ img, x, y, t: 0, dur: 0.6 });
  }

  // ------------------------------------------------------------ floating icons & numbers

  floatIcon(x: number, y: number, key: string): void {
    const img = this.scene.add.image(Math.round(x), Math.round(y), key).setDepth(DEPTH_FX + 2);
    const scale = img.width > FX_ICON_PX ? FX_ICON_PX / img.width : 1;
    img.setScale(scale);
    this.layer.add(img);
    this.floats.push({ obj: img, x, y, t: 0, dur: 1.1, rise: 14, live: true, scale });
  }

  floatText(x: number, y: number, text: string, tint = 0xffffff, dur = 0.8): void {
    if (!this.showNumbers) return;
    let f = this.numbers.find((q) => !q.live);
    if (!f) {
      if (this.numbers.length >= MAX_NUMBERS) f = this.numbers.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
      else {
        const t = this.scene.add.bitmapText(0, 0, 'font_title', '', 7).setOrigin(0.5, 1).setDepth(DEPTH_FX + 1);
        // damage numbers are battle effects, not UI text (the layout check skips them)
        uiIgnore(t);
        this.layer.add(t);
        f = { obj: t, x: 0, y: 0, t: 0, dur: 1, rise: 10, live: false };
        this.numbers.push(f);
      }
    }
    const t = f.obj as Phaser.GameObjects.BitmapText;
    t.setText(text).setTint(tint).setVisible(true).setAlpha(1);
    f.x = x + (Math.random() - 0.5) * 6;
    f.y = y;
    f.t = 0;
    f.dur = dur;
    f.rise = 10;
    f.live = true;
  }

  // ------------------------------------------------------------ per-unit overlays

  private overlay(id: number): Overlay {
    let o = this.overlays.get(id);
    if (!o) {
      o = { rings: new Map(), stars: [], pips: [] };
      this.overlays.set(id, o);
    }
    return o;
  }

  /**
   * Per frame, for every visible unit: aura rings under holders, stars over
   * stunned men, buff pips over buffed ones. (rx, ry) = feet in world pixels.
   */
  unit(u: SimUnit, rx: number, ry: number, timeMs: number, alive: boolean): void {
    const o = this.overlays.get(u.id);
    if (!alive) {
      if (o) this.clearOverlay(o);
      return;
    }
    // aura rings
    const holds = u.state === 'ready' && u.stats.auras.length > 0;
    if (holds || (o && o.rings.size > 0)) {
      const ov = this.overlay(u.id);
      for (const id of AURA_IDS) {
        const has = holds && u.stats.auras.includes(id);
        let img = ov.rings.get(id);
        if (!has) {
          if (img) {
            img.destroy();
            ov.rings.delete(id);
          }
          continue;
        }
        const frame = Math.floor(timeMs / 110 + u.id * 3) % RING_FRAMES;
        const key = this.ringKey(id, AURAS[id].radius + willRadius(u.stats), frame);
        if (!img) {
          img = this.scene.add.image(rx, ry, key).setDepth(DEPTH_RING);
          this.layer.add(img);
          ov.rings.set(id, img);
        }
        img.setTexture(key).setPosition(Math.round(rx), Math.round(ry));
        // stepped pulse (no smooth fade)
        img.setAlpha([0.55, 0.7, 0.85, 0.7][Math.floor(timeMs / 260 + u.id) % 4]);
      }
    }
    // height of the head above the feet (riders sit high, animals are low)
    const head = u.stats.mount ? 54 : u.stats.kind === 'animal' ? (u.rad > 0.45 ? 30 : 16) : 37;
    // stun stars
    // only a real daze (a bash, a balked charge, a bear's blow), not the brief check of a charge
    const stunned = u.stun > 16 && u.state === 'ready';
    if (stunned || (o && o.stars.length)) {
      const ov = this.overlay(u.id);
      const n = stunned ? 3 : 0;
      while (ov.stars.length < n) {
        const s = this.scene.add.image(0, 0, 'fx_star').setDepth(DEPTH_FX);
        this.layer.add(s);
        ov.stars.push(s);
      }
      while (ov.stars.length > n) ov.stars.pop()!.destroy();
      ov.stars.forEach((s, i) => {
        const a = timeMs / 160 + (i * Math.PI * 2) / 3;
        s.setPosition(Math.round(rx + Math.cos(a) * 6), Math.round(ry - head + Math.sin(a) * 2));
        s.setDepth(Math.sin(a) > 0 ? DEPTH_FX : ry - 1);
      });
    }
    // buff pips: auras touching him and berserk
    const pips: string[] = [];
    if (u.state === 'ready') {
      if (u.aura & AURAS.steady.bit) pips.push('pip_steady');
      if (u.aura & AURAS.eagle.bit) pips.push('pip_eagle');
      if (u.aura & AURAS.warlord.bit) pips.push('pip_warlord');
      if (u.berserk > 0) pips.unshift('pip_berserk');
      pips.length = Math.min(pips.length, 2);
    }
    if (pips.length || (o && o.pips.length)) {
      const ov = this.overlay(u.id);
      while (ov.pips.length < pips.length) {
        const p = this.scene.add.image(0, 0, pips[0]).setDepth(DEPTH_FX - 1);
        this.layer.add(p);
        ov.pips.push(p);
      }
      while (ov.pips.length > pips.length) ov.pips.pop()!.destroy();
      const x0 = Math.round(rx - (pips.length - 1) * 3.5);
      ov.pips.forEach((p, i) => p.setTexture(pips[i]).setPosition(x0 + i * 7, Math.round(ry - head - 8)));
    }
  }

  private clearOverlay(o: Overlay): void {
    for (const r of o.rings.values()) r.destroy();
    o.rings.clear();
    for (const s of o.stars) s.destroy();
    o.stars = [];
    for (const p of o.pips) p.destroy();
    o.pips = [];
  }

  // ------------------------------------------------------------ frame update

  update(dtMs: number): void {
    const dt = Math.min(0.1, dtMs / 1000);
    for (const p of this.parts) {
      if (!p.live) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.live = false;
        p.img.setVisible(false);
        continue;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.img.setPosition(Math.round(p.x), Math.round(p.y));
      // stepped fade
      const f = p.life / p.max;
      p.img.setAlpha(f > 0.5 ? 1 : f > 0.25 ? 0.66 : 0.33);
    }
    for (const list of [this.floats, this.numbers]) {
      for (const f of list) {
        if (!f.live) continue;
        f.t += dt;
        const k = f.t / f.dur;
        if (k >= 1) {
          f.live = false;
          if (list === this.floats) f.obj.destroy();
          else f.obj.setVisible(false);
          continue;
        }
        // pop up fast, then hang; stepped alpha at the end
        const rise = f.rise * Math.min(1, k * 3);
        f.obj.setPosition(Math.round(f.x), Math.round(f.y - rise));
        f.obj.setAlpha(k < 0.7 ? 1 : k < 0.85 ? 0.6 : 0.3);
        if (list === this.floats) f.obj.setScale((f.scale ?? 1) * (k < 0.08 ? 2 : 1));
      }
    }
    this.floats = this.floats.filter((f) => f.live);
    for (const w of this.waves) {
      w.t += dt;
      const k = w.t / w.dur;
      // grow in whole-pixel steps from a third of the radius to full size
      w.img.setScale(Math.round((0.35 + 0.65 * Math.min(1, k)) * 8) / 8);
      w.img.setAlpha(k < 0.6 ? 0.9 : k < 0.8 ? 0.6 : 0.3);
      if (k >= 1) w.img.destroy();
    }
    this.waves = this.waves.filter((w) => w.t < w.dur);
  }

  /** Iso radius in pixels for a shout of field radius r (for placing sparkles). */
  static radiusPx(r: number): { rx: number; ry: number } {
    return isoEllipse(r);
  }
}
