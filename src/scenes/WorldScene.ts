import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, addIcon, addPanel, addText } from '../ui/kit';
import { BAND_COLORS, WTILE, renderMarker, renderPartyFigure, renderSettlement, renderWorldMap } from '../art/worldArt';
import { P } from '../art/palette';
import { state, randomSeed } from '../state';
import { haptic, hapticNotify } from '../platform/telegram';
import { CULTURE_LABEL } from '../data/names';
import { addSyncBadge, playerPartyTexture } from '../ui/online';
import { perkSlots } from '../data/perks';
import { dangerAt, regionName, type SettlementDef } from '../world/map';
import { THREAT_COLOR, THREAT_LABEL, WORLD_RULES, threatLevel, type PartyState, type PlayerInfo, type World } from '../world/world';

/** Game hours per real second while travelling / waiting. */
const TRAVEL_SPEED = 1.6;
const WAIT_SPEED = 4;

interface BandView {
  p: PartyState;
  spr: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  plate: Phaser.GameObjects.Container;
  key: string;
  lastX: number;
  flip: boolean;
}

type Gesture = { mode: 'pending' | 'pan'; id: number; sx: number; sy: number; lx: number; ly: number } | null;

export class WorldScene extends BaseScene {
  private w!: World;
  private layer!: Phaser.GameObjects.Layer;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private party!: Phaser.GameObjects.Sprite;
  private partyShadow!: Phaser.GameObjects.Ellipse;
  private bands = new Map<number, BandView>();
  private routeG!: Phaser.GameObjects.Graphics;
  private marker!: Phaser.GameObjects.Image;
  private night!: Phaser.GameObjects.Rectangle;
  private hud!: Phaser.GameObjects.Container;
  private clockText!: Phaser.GameObjects.BitmapText;
  private goldText!: Phaser.GameObjects.BitmapText;
  private armyText!: Phaser.GameObjects.BitmapText;
  private regionText!: Phaser.GameObjects.BitmapText;
  private hintText!: Phaser.GameObjects.BitmapText;
  private waitBtn!: Button;
  private followBtn!: Button;
  private dialog: Phaser.GameObjects.Container | null = null;
  private banner: Phaser.GameObjects.Container | null = null;
  private waiting = false;
  private follow = true;
  private gesture: Gesture = null;
  private pinch: { d0: number; z0: number; cx: number; cy: number } | null = null;
  private info!: PlayerInfo;
  private saveTimer = 0;
  private flip = false;

  constructor() {
    super('World');
  }

  create(data: { encounter?: number }): void {
    this.bands = new Map();
    this.dialog = null;
    this.banner = null;
    this.waiting = false;
    this.follow = true;
    this.gesture = null;
    this.pinch = null;
    this.initUi();
    const camp = state.campaign;
    this.w = camp.world;
    this.w.s.inside = -1;
    this.info = camp.playerInfo();
    const m = this.w.map;

    // ---- world layer
    this.layer = this.add.layer();
    const key = `worldmap_${m.seed}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, renderWorldMap(m).toCanvas());
    this.layer.add(this.add.image(0, 0, key).setOrigin(0, 0).setDepth(-100000));
    if (!this.textures.exists('wm_marker')) {
      this.textures.addCanvas('wm_marker', renderMarker().toCanvas());
      for (const [k, c] of Object.entries(BAND_COLORS)) {
        const flag = k === 'player' ? P.cream : k === 'pirates' ? 0xe8e0cc : P.red;
        const tex = this.textures.addCanvas(`wm_band_${k}`, renderPartyFigure(c, flag).toCanvas())!;
        tex.add(0, 0, 0, 0, 12, 16);
        tex.add(1, 0, 12, 0, 12, 16);
      }
    }
    for (const s of m.settlements) this.addSettlement(s);
    this.routeG = this.add.graphics().setDepth(-50000);
    this.layer.add(this.routeG);
    this.marker = this.add.image(0, 0, 'wm_marker').setVisible(false).setDepth(-40000);
    this.layer.add(this.marker);
    this.partyShadow = this.add.ellipse(0, 0, 10, 4, 0x1d140f, 0.35);
    this.party = this.add.sprite(0, 0, playerPartyTexture(this), 0).setOrigin(0.4, 1);
    this.layer.add([this.partyShadow, this.party]);

    // ---- cameras
    const cam = this.cameras.main;
    cam.setBounds(-60, -60, m.w * WTILE + 120, m.h * WTILE + 120);
    cam.setBackgroundColor(0x27415e);
    cam.setZoom(2);
    cam.centerOn(this.w.s.x * WTILE, this.w.s.y * WTILE);
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCam.ignore(this.layer);
    cam.ignore(this.ui);

    this.night = this.add.rectangle(0, 0, this.m.VW, this.m.VH, 0x101a38, 0).setOrigin(0, 0);
    this.ui.add(this.night);
    this.hud = this.add.container(0, 0);
    this.ui.add(this.hud);
    this.buildHud();

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);
    this.input.on('wheel', (_p: unknown, _o: unknown[], _dx: number, dy: number) => this.setZoom(Math.round(cam.zoom) + (dy > 0 ? -1 : 1)));
    this.telegramBack(() => (this.dialog ? undefined : this.leaveToMenu()));
    this.events.once('shutdown', () => void state.save());

    this.renderWorld(0);
    if (data?.encounter !== undefined && this.w.party(data.encounter)) this.openEncounter(data.encounter, true);
    else if (this.w.s.time < 9 && camp.data.fought === 0) this.showBanner('Tap the map to march', 2600);
  }

  protected onResized(): void {
    this.scene.restart({});
  }

  private addSettlement(s: SettlementDef): void {
    const key = `wm_set_${s.kind}_${s.id % 2}_${s.coastal ? 1 : 0}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, renderSettlement(s.kind, s.id, s.coastal).toCanvas());
    const x = s.x * WTILE + WTILE / 2;
    const y = s.y * WTILE + WTILE / 2;
    const img = this.add.image(x, y + 4, key).setOrigin(0.5, 1).setDepth(y);
    const label = addText(this, x, y + 6, s.name, s.kind === 'lair' ? 'light' : 'title', 0.5).setDepth(y + 1);
    this.layer.add([img, label]);
  }

  // ================================================================ loop

  update(_t: number, delta: number): void {
    const camp = state.campaign;
    if (!this.dialog && (this.w.moving || this.waiting || this.w.s.destParty >= 0)) {
      const rate = this.waiting ? WAIT_SPEED : TRAVEL_SPEED;
      const hours = Math.min(0.25, delta / 1000) * rate;
      const r = this.w.advance(hours, this.info, this.waiting);
      camp.heal(r.hours, this.waiting ? WORLD_RULES.healCamp : WORLD_RULES.healRoad);
      this.saveTimer += delta;
      if (this.saveTimer > 8000) {
        this.saveTimer = 0;
        void state.save();
      }
      const ev = r.events[0];
      if (ev?.type === 'arrive') {
        this.enterSettlement(ev.settlement);
        return;
      }
      if (ev?.type === 'encounter') {
        this.setWaiting(false);
        this.openEncounter(ev.party, ev.byPlayer);
      }
      this.refreshHud();
    }
    this.renderWorld(delta);
  }

  private renderWorld(_delta: number): void {
    const now = this.time.now;
    const s = this.w.s;
    const px = s.x * WTILE;
    const py = s.y * WTILE;
    const moving = this.w.moving && !this.dialog;
    if (moving && this.w.route.length) {
      const dx = this.w.route[0].x - s.x;
      if (dx < -0.05) this.flip = true;
      else if (dx > 0.05) this.flip = false;
    }
    this.party.setPosition(Math.round(px), Math.round(py) + 2).setDepth(py + 3).setFlipX(this.flip);
    this.party.setFrame(moving ? Math.floor(now / 160) % 2 : 0);
    this.partyShadow.setPosition(Math.round(px), Math.round(py) + 2).setDepth(py + 2);
    // route: dotted line and destination marker
    this.routeG.clear();
    if (this.w.route.length) {
      this.routeG.fillStyle(P.cream, 0.9);
      let ax = px;
      let ay = py;
      let k = 0;
      for (const wp of this.w.route) {
        const bx = wp.x * WTILE;
        const by = wp.y * WTILE;
        const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay)));
        for (let i = 0; i < n; i++, k++) if (k % 4 === 0) this.routeG.fillRect(Math.round(ax + ((bx - ax) * i) / n), Math.round(ay + ((by - ay) * i) / n), 1, 1);
        ax = bx;
        ay = by;
      }
      const last = this.w.route[this.w.route.length - 1];
      this.marker.setVisible(this.w.s.destParty < 0).setPosition(Math.round(last.x * WTILE), Math.round(last.y * WTILE));
    } else this.marker.setVisible(false);
    // bands
    const seen = new Set<number>();
    for (const p of this.w.s.parties) {
      seen.add(p.id);
      let v = this.bands.get(p.id);
      const ratio = p.power / Math.max(1, this.info.power);
      const lvl = threatLevel(ratio);
      const key = `${p.size}_${lvl}`;
      if (!v) {
        const tex = p.name === 'Pirates' ? 'wm_band_pirates' : `wm_band_${p.kind}`;
        const shadow = this.add.ellipse(0, 0, 10, 4, 0x1d140f, 0.35);
        const spr = this.add.sprite(0, 0, tex, 0).setOrigin(0.4, 1);
        const plate = this.add.container(0, 0);
        this.layer.add([shadow, spr, plate]);
        v = { p, spr, shadow, plate, key: '', lastX: p.x, flip: false };
        this.bands.set(p.id, v);
      }
      v.p = p;
      if (v.key !== key) {
        v.key = key;
        v.plate.removeAll(true);
        const label = `${p.size}`;
        const wdt = label.length * 5 + 9;
        v.plate.add(this.add.rectangle(0, 0, wdt, 9, P.outline).setOrigin(0.5, 1));
        v.plate.add(this.add.rectangle(0, -1, wdt - 2, 7, THREAT_COLOR[lvl]).setOrigin(0.5, 1));
        v.plate.add(addText(this, 0, -9, label, 'title', 0.5));
      }
      const bx = p.x * WTILE;
      const by = p.y * WTILE;
      if (p.x < v.lastX - 0.01) v.flip = true;
      else if (p.x > v.lastX + 0.01) v.flip = false;
      const walking = Math.abs(p.x - v.lastX) > 1e-4 && !this.dialog;
      v.lastX = p.x;
      v.spr.setPosition(Math.round(bx), Math.round(by) + 2).setDepth(by + 3).setFlipX(v.flip).setFrame(walking ? Math.floor(now / 170 + p.id) % 2 : 0);
      v.shadow.setPosition(Math.round(bx), Math.round(by) + 2).setDepth(by + 2);
      v.plate.setPosition(Math.round(bx), Math.round(by) - 14).setDepth(by + 4);
      v.spr.setAlpha(p.idle > 0 ? 0.75 : 1);
    }
    for (const [id, v] of this.bands) {
      if (seen.has(id)) continue;
      v.spr.destroy();
      v.shadow.destroy();
      v.plate.destroy();
      this.bands.delete(id);
    }
    // camera follow
    const cam = this.cameras.main;
    if (this.follow && !this.pinch) {
      const k = 1 - Math.exp((-Math.max(16, _delta) / 1000) * 4);
      const cx = cam.midPoint.x + (px - cam.midPoint.x) * k;
      const cy = cam.midPoint.y + (py - cam.midPoint.y) * k;
      cam.centerOn(cx, cy);
    }
    // night: stepped darkness by the hour
    const h = this.w.hour;
    const a = h >= 21 || h < 5 ? 0.38 : h >= 19 || h < 7 ? 0.2 : 0;
    this.night.setFillStyle(0x101a38, a);
  }

  // ================================================================ HUD

  private buildHud(): void {
    const H = this.hud;
    H.removeAll(true);
    const { VW, VH } = this.m;
    H.add(addPanel(this, 0, 0, VW, 26, 'parch'));
    H.add(new Button(this, 3, 3, 24, 20, { icon: 'back', onClick: () => this.leaveToMenu() }));
    this.clockText = addText(this, 31, 4, '', 'red');
    this.regionText = addText(this, 31, 14, '', 'dim');
    H.add([this.clockText, this.regionText]);
    H.add(addIcon(this, VW - 72, 2, 'coin'));
    this.goldText = addText(this, VW - 58, 4, '', 'ink');
    H.add(addIcon(this, VW - 72, 13, 'people'));
    this.armyText = addText(this, VW - 58, 15, '', 'ink');
    H.add([this.goldText, this.armyText]);
    this.followBtn = new Button(this, VW - 28, 3, 25, 20, { icon: 'eye', style: this.follow ? 'buttonSel' : 'button', onClick: () => this.toggleFollow() });
    H.add(this.followBtn);

    const by = VH - 34;
    H.add(addPanel(this, 0, by - 16, VW, VH - by + 16, 'parch'));
    this.hintText = addText(this, VW / 2, by - 12, '', 'ink', 0.5);
    H.add(this.hintText);
    addSyncBadge(this, H, VW - 15, 29);
    const bw = Math.floor((VW - 14) / 3);
    const camp = state.campaign;
    const pending = camp.data.heroes.some((h) => h.points > 0 || h.perks.length < perkSlots(h.level));
    H.add(new Button(this, 4, by, bw, 28, { label: pending ? 'Party !' : 'Party', icon: 'people', onClick: () => this.scene.start('Army', { from: 'World' }) }));
    this.waitBtn = new Button(this, 7 + bw, by, bw, 28, { label: this.waiting ? 'Break' : 'Camp', icon: 'tent', style: this.waiting ? 'buttonSel' : 'button', onClick: () => this.setWaiting(!this.waiting) });
    H.add(this.waitBtn);
    H.add(new Button(this, 10 + 2 * bw, by, bw, 28, { label: 'Stop', icon: 'hold', onClick: () => this.stopTravel() }));
    this.refreshHud();
  }

  private refreshHud(): void {
    const camp = state.campaign;
    const s = this.w.s;
    const day = Math.floor(s.time / 24) + 1;
    const h = Math.floor(s.time % 24);
    this.clockText.setText(`Day ${day}  ${String(h).padStart(2, '0')}:00${h >= 21 || h < 5 ? ' night' : ''}`.toUpperCase());
    const d = dangerAt(this.w.map, s.x, s.y);
    this.regionText.setText(`${regionName(this.w.map, s.x, s.y)} - ${d < 0.3 ? 'safe' : d < 0.6 ? 'risky' : 'wild'}`.toUpperCase());
    this.goldText.setText(`${camp.data.gold}`);
    const wounded = camp.wounded().length;
    this.armyText.setText(`${camp.data.heroes.length - wounded}/${camp.data.heroes.length}`);
    let hint = 'Tap the map to march, a town to enter';
    if (this.waiting) hint = 'Camping: wounds heal, time passes';
    else if (s.destParty >= 0) {
      const p = this.w.party(s.destParty);
      hint = p ? `Pursuing ${p.name}` : hint;
    } else if (s.destSettlement >= 0) hint = `Marching to ${this.w.settlement(s.destSettlement)?.name ?? ''}`;
    else if (this.w.moving) hint = 'On the march';
    this.hintText.setText(hint.toUpperCase());
  }

  private setWaiting(on: boolean): void {
    this.waiting = on;
    if (on) this.w.stop();
    this.waitBtn?.setSelected(on).setLabel(on ? 'Break' : 'Camp');
    this.refreshHud();
  }

  private stopTravel(): void {
    this.w.stop();
    this.setWaiting(false);
    haptic('light');
  }

  private toggleFollow(): void {
    this.follow = !this.follow;
    this.followBtn.setSelected(this.follow);
  }

  private showBanner(msg: string, ms: number): void {
    this.banner?.destroy();
    const { VW } = this.m;
    const c = this.add.container(0, 0);
    const t = addText(this, VW / 2, 33, msg, 'red', 0.5);
    const wdt = Math.max(80, t.width + 20);
    c.add(addPanel(this, Math.round((VW - wdt) / 2), 28, wdt, 18, 'parch'));
    c.add(t);
    this.ui.add(c);
    this.banner = c;
    this.time.delayedCall(ms, () => {
      if (this.banner === c) {
        c.destroy();
        this.banner = null;
      }
    });
  }

  private leaveToMenu(): void {
    void state.save();
    this.scene.start('Menu');
  }

  private enterSettlement(id: number): void {
    this.w.stop();
    this.w.s.inside = id;
    void state.save();
    hapticNotify('success');
    this.scene.start('Settlement', { id });
  }

  // ================================================================ input

  private onDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    const down = this.input.manager.pointers.filter((q) => q.isDown);
    if (down.length >= 2) {
      this.gesture = null;
      const [a, b] = down;
      this.pinch = { d0: Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y), z0: this.cameras.main.zoom, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      return;
    }
    if (over.length > 0 || this.dialog) {
      this.gesture = null;
      return;
    }
    this.gesture = { mode: 'pending', id: p.id, sx: p.x, sy: p.y, lx: p.x, ly: p.y };
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const cam = this.cameras.main;
    if (this.pinch) {
      const down = this.input.manager.pointers.filter((q) => q.isDown);
      if (down.length < 2) return;
      const [a, b] = down;
      const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
      const z = Phaser.Math.Clamp(this.pinch.z0 * (d / Math.max(1, this.pinch.d0)), 1, 4);
      cam.setZoom(z);
      return;
    }
    const g = this.gesture;
    if (!g || p.id !== g.id || !p.isDown) return;
    if (g.mode === 'pending' && Math.abs(p.x - g.sx) + Math.abs(p.y - g.sy) > 12) g.mode = 'pan';
    if (g.mode === 'pan') {
      if (this.follow) this.toggleFollow();
      cam.scrollX -= (p.x - g.lx) / cam.zoom;
      cam.scrollY -= (p.y - g.ly) / cam.zoom;
    }
    g.lx = p.x;
    g.ly = p.y;
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (this.pinch) {
      if (this.input.manager.pointers.filter((q) => q.isDown).length < 2) {
        this.pinch = null;
        this.setZoom(Math.round(this.cameras.main.zoom));
      }
      this.gesture = null;
      return;
    }
    const g = this.gesture;
    this.gesture = null;
    if (!g || p.id !== g.id || g.mode !== 'pending') return;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    this.tapWorld(wp.x, wp.y);
  }

  private setZoom(z: number): void {
    this.tweens.add({ targets: this.cameras.main, zoom: Phaser.Math.Clamp(z, 1, 4), duration: 120 });
  }

  /** Tap at world pixel (x, y): a band, a settlement, or a spot to march to. */
  tapWorld(x: number, y: number): void {
    // bands first (they stand on top)
    let band: PartyState | null = null;
    let bd = 9;
    for (const p of this.w.s.parties) {
      const d = Math.hypot(p.x * WTILE - x, p.y * WTILE - 4 - y);
      if (d < bd) {
        bd = d;
        band = p;
      }
    }
    if (band) {
      const ratio = band.power / Math.max(1, this.info.power);
      this.showBanner(`${band.name}: ${band.size} men, ${THREAT_LABEL[threatLevel(ratio)]}`, 1800);
      this.setWaiting(false);
      this.w.setDestination(Math.floor(band.x), Math.floor(band.y), -1, band.id);
      haptic('light');
      this.refreshHud();
      return;
    }
    let set: SettlementDef | null = null;
    let sd = 11;
    for (const s of this.w.map.settlements) {
      const d = Math.hypot(s.x * WTILE + 4 - x, s.y * WTILE - y);
      if (d < sd) {
        sd = d;
        set = s;
      }
    }
    this.setWaiting(false);
    if (set) {
      if (set.kind === 'lair') {
        this.showBanner(`${set.name}: bands gather here`, 1600);
        this.w.setDestination(set.x, set.y + 1);
      } else if (Math.floor(this.w.s.x) === set.x && Math.floor(this.w.s.y) === set.y) {
        this.enterSettlement(set.id);
        return;
      } else this.w.setDestination(set.x, set.y, set.id);
    } else if (!this.w.setDestination(Math.floor(x / WTILE), Math.floor(y / WTILE))) {
      hapticNotify('error');
      this.showBanner('No way there', 1200);
      return;
    }
    haptic('light');
    if (!this.follow) this.toggleFollow();
    this.refreshHud();
  }

  // ================================================================ encounters

  private closeDialog(): void {
    this.dialog?.destroy();
    this.dialog = null;
  }

  openEncounter(partyId: number, byPlayer: boolean, failedFlee = false): void {
    const camp = state.campaign;
    const p = this.w.party(partyId);
    if (!p) return;
    this.closeDialog();
    this.info = camp.playerInfo();
    const { VW, VH } = this.m;
    const c = this.add.container(0, 0);
    this.ui.add(c);
    this.dialog = c;
    c.add(this.add.rectangle(0, 0, VW, VH, 0x000000, 0.5).setOrigin(0, 0).setInteractive());
    const w = VW - 20;
    const h = 150;
    const x = 10;
    const y = Math.round(VH / 2 - h / 2 - 10);
    c.add(addPanel(this, x, y, w, h, 'parch'));
    const ratio = p.power / Math.max(1, this.info.power);
    const lvl = threatLevel(ratio);
    c.add(addText(this, VW / 2, y + 7, p.name, 'red', 0.5));
    // the band's standard, large
    const tex = p.name === 'Pirates' ? 'wm_band_pirates' : `wm_band_${p.kind}`;
    c.add(this.add.image(x + 26, y + 58, tex, 0).setScale(3).setOrigin(0.5, 1));
    c.add(this.add.rectangle(x + 50, y + 22, 8, 8, THREAT_COLOR[lvl]).setOrigin(0, 0).setStrokeStyle(1, P.outline));
    c.add(addText(this, x + 62, y + 22, `${THREAT_LABEL[lvl]} - ${p.size} men`, 'ink'));
    c.add(addText(this, x + 50, y + 33, `${CULTURE_LABEL[p.culture]}, about Lv ${p.level}`, 'dim'));
    const mood = failedFlee
      ? 'They cut off your escape!'
      : byPlayer
        ? ratio < WORLD_RULES.surrenderRatio
          ? 'Cornered, they throw down their arms.'
          : 'You have caught up with them.'
        : 'They bar your way, weapons drawn!';
    c.add(addText(this, x + 50, y + 46, mood, 'ink', 0, w - 56));
    const fit = camp.fitHeroes().length;
    const wounded = camp.wounded().length;
    c.add(addText(this, x + 8, y + 68, `Your army: ${fit} fit${wounded ? `, ${wounded} wounded` : ''}`, 'dim'));
    const buttons: { label: string; icon: string; sel?: boolean; cb: () => void }[] = [];
    buttons.push({ label: 'Attack', icon: 'swords', sel: true, cb: () => this.attack(p.id) });
    if (camp.canSurrender(p.id) && !failedFlee) {
      buttons.push({
        label: 'Take ransom',
        icon: 'coin',
        cb: () => {
          const g = camp.acceptSurrender(p.id);
          this.closeDialog();
          hapticNotify('success');
          this.showBanner(`They pay ${g} gold and scatter`, 2200);
          void state.save();
          this.refreshHud();
        },
      });
    }
    if (!failedFlee) {
      if (byPlayer && ratio < WORLD_RULES.chaseRatio) {
        buttons.push({
          label: 'Let them go',
          icon: 'back',
          cb: () => {
            p.idle = 1;
            this.w.s.safeUntil = this.w.s.time + 1;
            this.closeDialog();
          },
        });
      } else {
        const chance = Math.round(camp.fleeChance(p.id) * 100);
        buttons.push({
          label: `Flee ${chance}%`,
          icon: 'fallback',
          cb: () => {
            if (camp.tryFlee(p.id)) {
              this.closeDialog();
              hapticNotify('warning');
              this.showBanner('You slip away!', 1800);
              void state.save();
            } else {
              hapticNotify('error');
              this.openEncounter(p.id, byPlayer, true);
            }
          },
        });
      }
    }
    const bw = Math.floor((w - 12 - (buttons.length - 1) * 4) / buttons.length);
    buttons.forEach((b, i) => c.add(new Button(this, x + 6 + i * (bw + 4), y + h - 34, bw, 28, { label: b.label, icon: b.icon, style: b.sel ? 'buttonSel' : 'button', onClick: b.cb })));
    c.add(addText(this, VW / 2, y + 84, ratio > 1.15 ? 'A hard fight. Consider fleeing or resting.' : ratio < 0.85 ? 'You should win this one.' : 'An even match.', ratio > 1.15 ? 'red' : 'ink', 0.5, w - 12));
  }

  private attack(partyId: number): void {
    const camp = state.campaign;
    const p = this.w.party(partyId);
    const enemy = camp.partyEnemy(partyId);
    if (!p || !enemy) return;
    state.pending = { enemy, seed: randomSeed(), partyId, label: p.name };
    void state.save();
    this.scene.start('Battle');
  }
}
