/**
 * Neutral-region marks (W-12, src/war/sim/mobs.ts): each lair as its den (W-67, public/war/lairs/, composed by
 * scripts/art/lairs/compose.mjs: a wolf hollow by a rib cage, a boar wallow, a bear's cave mouth, bandit tents round a
 * fire, a jackal burrow, an ibex rock ledge, a lion's thorn-bush lie with bones, a serpent's reed nest), greyed and
 * stripped once cleared (the fire out, the tent down, the eggs broken; the greybox ring until the art has loaded); its
 * aggro and leash radii with the `mobs` overlay, and each claim point as a banner on a pole: grey while locked (a guard
 * lair of its zone lives), white when open, a progress bar while a squad channels (red when foes interrupt), the owner's
 * colour once claimed. Over each banner a label names it and its state ("Claim point / Guarded", "Claiming 12/30 s",
 * "Held: Dodona"; ./hud/explain.ts), kept the same size on screen at any zoom; the hover card says what to do
 * (./hud/claimCard.ts).
 */
import Phaser from 'phaser';
import type { BossSnap, ClaimSnap, LairSnap, WarlordSnap } from '../types';
import { TEAM_COLOR } from './units';
import { HH, HW } from './iso';
import { myTeam, slot } from './side';
import { depthOf } from '../sim/depth';
import { claimLord, claimView } from './hud/explain';
import type { SandboxScene } from './SandboxScene';

const DEN: Record<LairSnap['kind'], number> = { wolf: 0x9aa0a8, boar: 0x8a6a4a, bear: 0x5a4030, bandit: 0xc09040, jackal: 0xc8a868, ibex: 0xd8d0b8, lion: 0xb08848, serpent: 0x5a6a40, scorpion: 0xa07838, harpy: 0x8a8090, cyclops: 0x6a6058, drake: 0x7a3a28 };
const R2 = Math.SQRT2;
const LABEL: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Inter, sans-serif', fontSize: '13px', fontStyle: 'bold', color: '#f0e0b0', stroke: '#140c08', strokeThickness: 4, align: 'center' };
const LABEL_TONE = { good: '#9ed46a', bad: '#ff7a5a', warn: '#e0b867', '': '#f4ead0' } as const;

export class NeutralLayer {
  /** The `mobs` overlay: aggro (inner) and leash (outer) rings, guard radius dashed. */
  debug = false;
  private g: Phaser.GameObjects.Graphics;
  private banners: Phaser.GameObjects.Graphics[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  /** W-67: the dens (pooled by lair index) and their art once loaded, by `<kind>-<live|cleared>`: texture and origin. */
  private dens: Phaser.GameObjects.Image[] = [];
  private art = new Map<string, { key: string; ox: number; oy: number }>();

  constructor(private scene: Phaser.Scene, private feet: (p: { x: number; y: number }) => { x: number; y: number }, private depthAt: (x: number, y: number) => number) {
    this.g = scene.add.graphics().setDepth(9.05);
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const j = (await (await fetch('war/lairs/lairs.json')).json()) as { lairs: Record<string, Record<string, { file: string; w: number; h: number; anchor: { x: number; y: number } }>> };
      await Promise.all(Object.entries(j.lairs).flatMap(([kind, st]) => Object.entries(st).map(async ([state, a]) => {
        const key = `lair-${kind}-${state}`;
        if (!this.scene.textures.exists(key)) {
          const im = new Image();
          await new Promise((ok, fail) => { im.onload = ok; im.onerror = fail; im.src = `war/lairs/${a.file}`; });
          if (!this.scene.textures.exists(key)) this.scene.textures.addImage(key, im);
        }
        this.art.set(`${kind}-${state}`, { key, ox: a.anchor.x / a.w, oy: a.anchor.y / a.h });
      })));
    } catch (e) {
      console.warn('[neutral] lair art', e);
    }
  }

  draw(lairs: LairSnap[], claims: ClaimSnap[], zoom: number, bosses: readonly BossSnap[] = [], warlords?: readonly WarlordSnap[]): void {
    const g = this.g.clear(), k = 1 / zoom, w = Math.max(1, 1.5 * k);
    lairs.forEach((l, i) => {
      const f = this.feet(l), cleared = l.state === 'cleared';
      const art = this.art.get(`${l.kind}-${cleared ? 'cleared' : 'live'}`);
      const den = this.dens[i] ?? this.dens[this.dens.push(this.scene.add.image(0, 0, '__DEFAULT').setVisible(false)) - 1];
      if (art) {
        // the den over a soft trodden patch, sorted with the units round it
        g.fillStyle(0x1a140c, cleared ? 0.16 : 0.28).fillEllipse(f.x, f.y + 4, 3.4 * HW, 3.4 * HH);
        den.setTexture(art.key).setOrigin(art.ox, art.oy).setPosition(Math.round(f.x), Math.round(f.y)).setDepth(10 + this.depthAt(l.x, l.y) / 4096 + 0.24).setVisible(true);
      } else {
        den.setVisible(false);
        greybox(g, l, f, cleared, w);
      }
      if (this.debug) {
        g.lineStyle(w, 0xff6040, 0.8).strokeEllipse(f.x, f.y, 2 * l.aggro * HW * R2, 2 * l.aggro * HH * R2);
        g.lineStyle(w, 0xffd040, 0.6).strokeEllipse(f.x, f.y, 2 * l.leash * HW * R2, 2 * l.leash * HH * R2);
        if (l.guard) g.lineStyle(w, 0x80c0ff, 0.5).strokeEllipse(f.x, f.y, 2 * l.guard * HW * R2, 2 * l.guard * HH * R2);
      }
    });
    for (let i = lairs.length; i < this.dens.length; i++) this.dens[i].setVisible(false);
    claims.forEach((c, i) => {
      const b = this.banners[i] ?? this.banners[this.banners.push(this.scene.add.graphics()) - 1];
      const f = this.feet(c), top = f.y - 90;
      b.clear().setDepth(10 + this.depthAt(c.x, c.y) / 4096 + 0.25);
      const cloth = c.state === 'claimed' ? (TEAM_COLOR[slot(c.team)] ?? 0xcccccc) : c.state === 'locked' ? 0x707070 : 0xf0f0e0;
      b.fillStyle(0x000000, 0.3).fillEllipse(f.x, f.y, 26, 12);
      b.fillStyle(0x5a4028, 1).fillRect(f.x - 2, top, 4, 90); // pole
      b.fillStyle(cloth, 1).fillTriangle(f.x + 2, top, f.x + 40, top + 12, f.x + 2, top + 26);
      if (c.state === 'locked') b.lineStyle(2, 0x303030, 1).lineBetween(f.x + 8, top + 6, f.x + 26, top + 20);
      // a held point being taken shows the attacker's channel the same way (red while reset or held off)
      const run = c.state === 'channel' || c.taking === 'channel', stop = c.state === 'contested' || c.taking === 'contested' || c.taking === 'defended';
      if (run || stop) {
        const bw = Math.max(48, 48 * k * 0.5), bx = f.x - bw / 2, by = top - 14;
        b.fillStyle(0x101010, 0.85).fillRect(bx, by, bw, 7);
        b.fillStyle(stop ? 0xff4040 : 0xffe070, 1).fillRect(bx + 1, by + 1, (bw - 2) * (stop ? 1 : c.progress), 5);
      }
      const lord = claimLord(warlords, i);
      const v = claimView(c, myTeam(), depthOf((this.scene as SandboxScene).region), lairs, [], lord);
      const t = this.labels[i] ?? this.labels[this.labels.push(this.scene.add.text(0, 0, '', LABEL).setOrigin(0.5, 1).setResolution(2)) - 1];
      const text = `Claim point\n${v.label}`;
      if (t.text !== text) t.setText(text);
      // a living guardian standing on the point hides its label (it would draw over him; the hover card still tells), and
      // a warlord's holding is named once, by his own label over his war banner (./warlords.ts)
      const guarded = bosses.some((g) => g.state !== 'slain' && g.state !== 'away' && Math.abs(g.x - c.x) < 5 && Math.abs(g.y - c.y) < 5);
      t.setColor(LABEL_TONE[v.tone]).setScale(k).setPosition(f.x + 10, top - 16).setDepth(b.depth + 0.01).setVisible(!guarded && !lord);
    });
  }
}

/** A den before its art has loaded: a dark patch, a ring, bones or a tent and fire, struck through once cleared. */
function greybox(g: Phaser.GameObjects.Graphics, l: LairSnap, f: { x: number; y: number }, cleared: boolean, w: number): void {
  g.fillStyle(0x201810, cleared ? 0.25 : 0.45).fillEllipse(f.x, f.y, 3 * HW, 3 * HH);
  g.lineStyle(w * 2, DEN[l.kind], cleared ? 0.35 : 0.9).strokeEllipse(f.x, f.y, 3 * HW, 3 * HH);
  if (l.kind === 'bandit') {
    g.fillStyle(0x6a5030, cleared ? 0.4 : 1).fillTriangle(f.x - 18, f.y, f.x + 18, f.y, f.x, f.y - 26); // tent
    if (!cleared) g.fillStyle(0xff9030, 0.9).fillCircle(f.x + 26, f.y + 4, 4); // camp fire
  } else for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, x = f.x + Math.cos(a) * HW * 1.1, y = f.y + Math.sin(a) * HH * 1.1;
    g.lineStyle(w * 1.5, 0xe8e0d0, cleared ? 0.3 : 0.8).lineBetween(x - 4, y, x + 4, y - 2); // bones
  }
  if (cleared) g.lineStyle(w * 2, 0x60d060, 0.8).lineBetween(f.x - 20, f.y - 10, f.x + 20, f.y + 10).lineBetween(f.x - 20, f.y + 10, f.x + 20, f.y - 10);
}
