/**
 * Online mode hub: the seasonal hex map of the player's shard (fog of war,
 * owned / clan / rival land, armies and marches), the hex panel (march,
 * attack, garrison), income, the duel lobby, and entry points to the online
 * army and clan screens. Everything comes from the server; this scene only
 * displays it and sends intents.
 */
import Phaser from 'phaser';
import { BaseScene } from '../BaseScene';
import { Button, addPanel, addText } from '../../ui/kit';
import { P } from '../../art/palette';
import { haptic, hapticNotify } from '../../platform/telegram';
import { hexToPixel, pixelToHex, type Axial } from '../../online/hex';
import {
  checkOnline,
  errorText,
  explain,
  onlineApi,
  peekPendingInvite,
  shardSocket,
  type AttackResult,
  type AttackTicket,
  type HexDetail,
  type HexView,
  type MapView,
  type ProfileView,
} from '../../online/client';
import { duelSource, type DuelOutcome } from '../../online/duelDriver';
import type { BattleSource } from '../../online/battleSource';
import type { ServerMsg, DuelStart, PresencePlayer } from '../../online/protocol';
import type { Battle } from '../../sim/battle';
import { CLAN_COLOR, HEX_COLORS, HEX_NAMES, MINE_COLOR, addResourceBar, button, fmtDuration, lines, openModal, ownerColor, resourceLine, type Modal } from './common';

const HEX = 12; // hex radius in world pixels

type View = { kind: 'loading'; msg: string } | { kind: 'unavailable'; msg: string; detail: string } | { kind: 'join' } | { kind: 'map' };

export interface OnlineSceneData {
  /** Show the outcome of an attack that just came back from the battle scene. */
  attack?: AttackResult | { error: string };
  duel?: DuelOutcome;
  /** Centre the map on this hex. */
  focus?: Axial;
}

type Gesture = { mode: 'pending' | 'pan'; id: number; sx: number; sy: number; lx: number; ly: number } | null;

export class OnlineScene extends BaseScene {
  private view: View = { kind: 'loading', msg: 'Reaching the realm...' };
  profile: ProfileView | null = null;
  map: MapView | null = null;
  private layer!: Phaser.GameObjects.Layer;
  private hexG!: Phaser.GameObjects.Graphics;
  private overG!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.GameObject[] = [];
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private hud!: Phaser.GameObjects.Container;
  private modal: Modal | null = null;
  private panel: Phaser.GameObjects.Container | null = null;
  selected: Axial | null = null;
  detail: HexDetail | null = null;
  private gesture: Gesture = null;
  private pinch: { d0: number; z0: number } | null = null;
  private offSocket: (() => void) | null = null;
  private challenge: { id: string; to: PresencePlayer } | null = null;
  private busy = false;
  private refreshTimer: Phaser.Time.TimerEvent | null = null;
  private data0: OnlineSceneData = {};

  constructor() {
    super('Online');
  }

  create(data: OnlineSceneData): void {
    this.data0 = data ?? {};
    this.selected = null;
    this.detail = null;
    this.cameraPlaced = false;
    this.backdrop = null;
    this.modal = null;
    this.panel = null;
    this.labels = [];
    this.gesture = null;
    this.pinch = null;
    this.challenge = null;
    this.busy = false;
    this.initUi();
    this.screen({ back: () => this.back() });
    this.cameras.main.setBackgroundColor(0x1d1612);
    this.layer = this.add.layer();
    this.hexG = this.add.graphics();
    this.overG = this.add.graphics();
    this.layer.add([this.hexG, this.overG]);
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCam.ignore(this.layer);
    this.cameras.main.ignore(this.ui);
    this.hud = this.add.container(0, 0);
    this.ui.add(this.hud);
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('wheel', (_p: unknown, _o: unknown[], _dx: number, dy: number) => this.zoomBy(dy > 0 ? 0.8 : 1.25));
    this.offSocket = shardSocket.on((m) => this.onSocket(m));
    Object.assign(window, { __shard: shardSocket }); // debug handle (e2e script)
    this.events.once('shutdown', () => {
      this.offSocket?.();
      this.offSocket = null;
      this.refreshTimer?.remove();
    });
    this.render();
    void this.boot();
  }

  protected onResized(): void {
    this.uiCam.setSize(this.scale.width, this.scale.height);
    this.scene.restart({ focus: this.map ? this.cameraHex() : undefined });
  }

  private back(): void {
    if (this.modal) return this.closeModal();
    if (this.selected) return this.select(null);
    shardSocket.close();
    this.scene.start('Menu');
  }

  // ------------------------------------------------------------------ data

  private async boot(): Promise<void> {
    const ok = await checkOnline();
    if (!this.sys.isActive()) return;
    if (!ok.ok) {
      this.view = { kind: 'unavailable', msg: 'Online unavailable', detail: ok.message };
      return this.render();
    }
    try {
      const st = await onlineApi.status();
      if (!this.sys.isActive()) return;
      if (!st.joined) {
        if (peekPendingInvite()) {
          // A clan invite: join the clan (that also places the newcomer in its shard).
          this.scene.start('OnlineClan', {});
          return;
        }
        this.view = { kind: 'join' };
        return this.render();
      }
      await this.reload();
      shardSocket.open();
      if (peekPendingInvite()) this.scene.start('OnlineClan', {});
      else this.afterReturn();
    } catch (e) {
      this.fail(e);
    }
  }

  private fail(e: unknown): void {
    if (!this.sys.isActive()) return;
    const x = explain(e);
    this.view = { kind: 'unavailable', msg: 'Online unavailable', detail: x.message };
    this.render();
  }

  async reload(): Promise<void> {
    const [profile, map] = await Promise.all([onlineApi.profile(), onlineApi.map()]);
    if (!this.sys.isActive()) return;
    this.profile = profile;
    this.map = map;
    this.view = { kind: 'map' };
    this.render();
    if (this.selected) void this.loadDetail(this.selected);
    // Marches resolve on the server's clock: refresh when the army arrives.
    this.refreshTimer?.remove();
    const arrive = profile.army.marching && profile.army.arriveAt ? profile.army.arriveAt - profile.now : 0;
    if (arrive > 0) this.refreshTimer = this.time.delayedCall(Math.min(arrive + 400, 600_000), () => void this.reload().catch(() => undefined));
  }

  private afterReturn(): void {
    const d = this.data0;
    if (d.attack) this.showAttackResult(d.attack);
    else if (d.duel) this.showDuelResult(d.duel);
    this.data0 = {};
  }

  private async joinSeason(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.view = { kind: 'loading', msg: 'Raising your army...' };
    this.render();
    try {
      await onlineApi.join();
      await this.reload();
      shardSocket.open();
      hapticNotify('success');
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
    }
  }

  // ------------------------------------------------------------------ render

  private render(): void {
    this.hud.removeAll(true);
    // Dialogs (a challenge, the lobby, a result) survive a map refresh.
    if (this.view.kind !== 'map') this.closeModal();
    this.panel = null;
    const { VW } = this.m;
    if (this.view.kind !== 'map' || !this.profile || !this.map) {
      this.hexG.clear();
      this.overG.clear();
      this.clearLabels();
      if (!this.backdrop) this.backdrop = this.addGrassBackdrop(17).setAlpha(0.5);
      this.ui.sendToBack(this.backdrop);
      const v = this.view;
      const H = this.hud;
      if (v.kind === 'loading') {
        const md = this.openModalIn(H, 70, 'Online');
        lines(this, md.c, VW / 2, md.y + 32, [v.msg], 'ink');
        button(this, md.c, VW / 2 - 35, md.y + 44, 70, 20, 'Back', () => this.back(), { icon: 'back' });
      } else if (v.kind === 'unavailable') {
        const md = this.openModalIn(H, 112, v.msg);
        const y = lines(this, md.c, VW / 2, md.y + 30, [v.detail, '', 'The campaign is still yours', 'to play offline.'], 'ink', md.w - 16);
        button(this, md.c, VW / 2 - 50, y + 4, 100, 22, 'Back to menu', () => this.back(), { icon: 'back' });
      } else if (v.kind === 'join') {
        const md = this.openModalIn(H, 170, 'Season war');
        const y = lines(this, md.c, VW / 2, md.y + 28, ['A shared map of hexes.', 'Every hex is held by locals', 'or beasts: beat them to claim it.', 'Hold farms, forests, mines and', 'towns; join a clan; take forts', 'and capitals before the season', 'ends. Your online army is new', 'and separate from the campaign.'], 'ink', md.w - 12);
        button(this, md.c, md.x + 10, y + 6, md.w / 2 - 15, 24, 'Back', () => this.back(), { icon: 'back' });
        button(this, md.c, md.x + md.w / 2 + 5, y + 6, md.w / 2 - 15, 24, 'Join', () => void this.joinSeason(), { icon: 'flag', sel: true });
      }
      return;
    }
    this.backdrop?.destroy();
    this.backdrop = null;
    this.drawMap();
    this.buildHud();
    if (this.data0.focus) this.centerOn(this.data0.focus);
    else if (!this.cameraPlaced) this.centerOn(this.profile.army);
    this.cameraPlaced = true;
  }

  private cameraPlaced = false;
  private backdrop: Phaser.GameObjects.Image | null = null;

  private openModalIn(_parent: Phaser.GameObjects.Container, h: number, title: string): Modal {
    const md = openModal(this, this.hud, this.m.VW, this.m.VH, h, title);
    return md;
  }

  private clearLabels(): void {
    for (const l of this.labels) l.destroy();
    this.labels = [];
  }

  private hexCorners(c: { x: number; y: number }, r = HEX - 0.6): Phaser.Math.Vector2[] {
    const out: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30);
      out.push(new Phaser.Math.Vector2(c.x + r * Math.cos(a), c.y + r * Math.sin(a)));
    }
    return out;
  }

  private ownerTint(h: HexView): number | null {
    const map = this.map!;
    if (h.owner === null) return null;
    if (h.owner === map.you.id) return MINE_COLOR;
    if (map.you.clan !== null && h.clan === map.you.clan) return CLAN_COLOR;
    return ownerColor(h.clan ?? h.owner);
  }

  private drawMap(): void {
    const g = this.hexG;
    const o = this.overG;
    g.clear();
    o.clear();
    this.clearLabels();
    const map = this.map!;
    for (const h of map.hexes) {
      const c = hexToPixel(h, HEX);
      const pts = this.hexCorners(c);
      g.fillStyle(HEX_COLORS[h.type], 1);
      g.fillPoints(pts, true);
      // texture dots: trees, hill ridges, furrows
      g.fillStyle(0x000000, 0.13);
      if (h.type === 'forest') for (const [dx, dy] of [[-4, -2], [3, -4], [0, 3], [-3, 5], [5, 2]]) g.fillCircle(c.x + dx, c.y + dy, 2);
      if (h.type === 'hills' || h.type === 'mine') g.fillTriangle(c.x - 5, c.y + 3, c.x, c.y - 4, c.x + 5, c.y + 3);
      if (h.type === 'farmland') for (let k = -4; k <= 4; k += 4) g.fillRect(c.x - 6, c.y + k, 12, 1);
      if (h.type === 'mountain') g.fillTriangle(c.x - 7, c.y + 5, c.x, c.y - 7, c.x + 7, c.y + 5);
      g.lineStyle(1, 0x000000, 0.18);
      g.strokePoints(pts, true);
      const tint = this.ownerTint(h);
      if (tint !== null) {
        o.fillStyle(tint, 0.28);
        o.fillPoints(pts, true);
        o.lineStyle(2, tint, 0.95);
        o.strokePoints(this.hexCorners(c, HEX - 1.6), true);
      }
      if (h.type === 'town' || h.capital) {
        o.fillStyle(0xf0e0c8, 1);
        o.fillRect(c.x - 4, c.y - 2, 3, 4);
        o.fillRect(c.x + 1, c.y - 3, 3, 5);
        o.fillStyle(0x8a3a2a, 1);
        o.fillRect(c.x - 4, c.y - 3, 3, 1);
        o.fillRect(c.x + 1, c.y - 4, 3, 1);
      }
      if (h.fort) {
        o.fillStyle(0x5a4a40, 1);
        o.fillRect(c.x - 4, c.y - 4, 8, 7);
        o.fillStyle(0x3a2a24, 1);
        for (let k = -4; k <= 2; k += 3) o.fillRect(c.x + k, c.y - 6, 2, 2);
      }
      if (h.capital) {
        o.fillStyle(P.gold, 1);
        o.fillCircle(c.x, c.y - 7, 2.5);
      }
      if (h.type === 'ruins') {
        o.fillStyle(0xe8e0d0, 1);
        for (const dx of [-4, -1, 2]) o.fillRect(c.x + dx, c.y - 3, 2, 6);
      }
      if (h.home) {
        o.fillStyle(0xf6e8dc, 1);
        o.fillTriangle(c.x - 4, c.y + 1, c.x, c.y - 4, c.x + 4, c.y + 1);
        o.fillRect(c.x - 3, c.y + 1, 6, 4);
      }
      if (h.garrison) {
        const t = addText(this, c.x + 3, c.y + 3, `${h.garrison}`, 'light').setScale(0.75);
        this.layer.add(t);
        this.labels.push(t);
      }
    }
    // armies and the marching route
    const you = map.you.army;
    const mine = map.armies.find((a) => a.player === map.you.id);
    if (mine?.path && you.marching) {
      o.lineStyle(2, 0xfff4d8, 0.9);
      const pts = mine.path.map(([q, r]) => hexToPixel({ q, r }, HEX));
      for (let i = 1; i < pts.length; i++) o.lineBetween(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
      const end = pts[pts.length - 1];
      o.fillStyle(0xfff4d8, 1);
      o.fillCircle(end.x, end.y, 3);
    }
    for (const a of map.armies) {
      const c = hexToPixel(a, HEX);
      const own = a.player === map.you.id;
      o.fillStyle(0x000000, 0.35);
      o.fillEllipse(c.x, c.y + 6, 9, 3);
      o.fillStyle(own ? MINE_COLOR : 0xb03a2a, 1);
      o.fillRect(c.x - 1, c.y - 9, 1, 14);
      o.fillTriangle(c.x, c.y - 9, c.x + 7, c.y - 6, c.x, c.y - 3);
      o.lineStyle(1, 0x1d140f, 1);
      o.strokeTriangle(c.x, c.y - 9, c.x + 7, c.y - 6, c.x, c.y - 3);
    }
    if (this.selected) {
      const c = hexToPixel(this.selected, HEX);
      o.lineStyle(2, 0xffffff, 1);
      o.strokePoints(this.hexCorners(c, HEX - 0.5), true);
    }
  }

  private buildHud(): void {
    const { VW, VH } = this.m;
    const H = this.hud;
    const p = this.profile!;
    H.add(addPanel(this, 0, 0, VW, 40, 'parch'));
    if (this.inGameBack) H.add(new Button(this, 3, 2, 24, 20, { icon: 'back', onClick: () => this.back() }));
    H.add(addText(this, 31, 4, `Season ${p.season.id} - shard ${p.shard.id}`, 'red'));
    const left = Math.max(0, p.season.endsAt - p.now);
    H.add(addText(this, 31, 13, `${Math.floor(left / 86_400_000)}d left - ${p.clan ? `[${p.clan.tag}] ` : ''}${p.wins}/${p.battles} won`, 'dim'));
    H.add(new Button(this, VW - 27, 2, 24, 20, { icon: 'map', onClick: () => this.centerOn(this.profile!.army) }));
    addResourceBar(this, H, 3, 24, VW - 6, p.resources, p.energy, p.energyMax);
    // army status line
    const status = p.army.marching && p.army.arriveAt ? `Marching - arrives in ${fmtDuration(p.army.arriveAt - p.now)}` : `Army at ${p.army.q},${p.army.r} - ${p.heroes.filter((h) => !h.garrison).length} men`;
    H.add(addPanel(this, 3, 42, VW - 6, 12, 'inset'));
    H.add(addText(this, VW / 2, 44, status, 'ink', 0.5));
    // bottom bar
    const by = VH - 30;
    H.add(addPanel(this, 0, by - 2, VW, 32, 'parch'));
    const n = 4;
    const bw = Math.floor((VW - 8 - (n - 1) * 3) / n);
    const pend = p.income.pending;
    const online = shardSocket.players.filter((x) => x.id !== shardSocket.me?.id).length;
    const items: [string, string, () => void, boolean?][] = [
      ['Army', 'people', () => this.scene.start('OnlineArmy', {})],
      ['Clan', 'flag', () => this.scene.start('OnlineClan', {})],
      [`Duel ${online}`, 'swords', () => this.openLobby()],
      [`+${Math.floor(pend.gold)}`, 'coin', () => void this.collect(), pend.gold + pend.food + pend.wood + pend.bronze >= 1],
    ];
    items.forEach(([label, icon, cb, sel], i) => H.add(new Button(this, 4 + i * (bw + 3), by + 2, bw, 26, { label, icon, onClick: cb, style: sel ? 'buttonSel' : 'button' })));
    if (this.selected) this.buildPanel();
  }

  // ------------------------------------------------------------------ hex panel

  select(h: Axial | null): void {
    this.selected = h;
    this.detail = null;
    if (this.view.kind !== 'map') return;
    this.drawMap();
    this.hud.removeAll(true);
    this.buildHud();
    if (h) void this.loadDetail(h);
  }

  private async loadDetail(h: Axial): Promise<void> {
    try {
      const d = await onlineApi.hex(h);
      if (!this.sys.isActive() || !this.selected || this.selected.q !== h.q || this.selected.r !== h.r) return;
      this.detail = d;
      this.hud.removeAll(true);
      this.buildHud();
    } catch (e) {
      if (!this.sys.isActive()) return;
      this.toast(errorText(e));
    }
  }

  private buildPanel(): void {
    const { VW, VH } = this.m;
    const h = this.selected!;
    const d = this.detail;
    const ph = 112;
    const py = VH - 34 - ph;
    const c = this.add.container(0, 0);
    this.hud.add(c);
    this.panel = c;
    c.add(addPanel(this, 3, py, VW - 6, ph, 'parch'));
    c.add(new Button(this, VW - 24, py + 3, 18, 16, { icon: 'close', onClick: () => this.select(null) }));
    if (!d) {
      c.add(addText(this, 10, py + 8, `Hex ${h.q},${h.r}...`, 'dim'));
      return;
    }
    const hx = d.hex;
    const title = `${hx.capital ? 'Capital - ' : hx.fort ? 'Fort - ' : ''}${HEX_NAMES[hx.type]} (tier ${hx.tier})`;
    c.add(addText(this, 9, py + 6, title, 'red'));
    const owner = hx.owner === null ? (hx.occupant === 'none' ? 'Impassable' : 'Neutral') : d.mine ? 'Yours' : `${d.ownerName ?? '?'}${d.clan?.tag ? ` [${d.clan.tag}]` : ''}`;
    c.add(addText(this, 9, py + 16, `${owner}${hx.home ? ' - home' : ''} - ${hx.site}`, 'ink', 0, VW - 40));
    const yl = resourceLine(d.yields, true).split(' ').filter((x) => !/[+]0$/.test(x)).join(' ');
    c.add(addText(this, 9, py + 26, `Per hour: ${yl || 'nothing'} - march ${Number.isFinite(d.marchMinutes) ? `${d.marchMinutes}m` : '-'}`, 'dim', 0, VW - 20));
    let y = py + 36;
    if (d.defenders) {
      const who = d.siege?.label ?? (d.defenders.kind === 'garrison' ? 'Garrison' : d.defenders.kind === 'militia' ? 'Militia' : 'Defenders');
      c.add(addText(this, 9, y, `${who}: ${d.defenders.count} men, power ${d.defenders.power}`, 'ink', 0, VW - 20));
      y += 10;
    }
    if (d.siege && d.siege.needed > 1) {
      c.add(addText(this, 9, y, `Siege: ${d.siege.wins}/${d.siege.needed} victories in a row`, 'ink'));
      y += 10;
    }
    if (d.garrison) {
      c.add(addText(this, 9, y, `Garrison: ${d.garrison.length ? d.garrison.map((g) => g.hero.name).join(', ') : 'none (militia defends)'}`, 'ink', 0, VW - 20));
      y += 10;
    }
    if (d.income) {
      c.add(addText(this, 9, y, `Waiting: ${resourceLine(d.income)}`, 'dim'));
      y += 10;
    }
    if (d.locked) c.add(addText(this, VW - 10, py + 6, 'Under attack!', 'red', 1));
    // actions
    const p = this.profile!;
    const here = p.army.q === h.q && p.army.r === h.r && !p.army.marching;
    const acts: [string, string, () => void, boolean][] = [];
    if (d.canAttack) acts.push(['Attack', 'swords', () => void this.attack(h), true]);
    if (d.canGarrison) acts.push(['Garrison', 'shield', () => this.scene.start('OnlineArmy', { garrison: h }), false]);
    const rival = hx.owner !== null && !d.ours;
    if (!here && hx.occupant !== 'none' && !rival && (d.ours || hx.owner === null)) acts.push(['March', 'advance', () => void this.march(h), false]);
    if (p.army.marching) acts.push(['Halt', 'hold', () => void this.halt(), false]);
    const bw = Math.floor((VW - 14 - (Math.max(1, acts.length) - 1) * 3) / Math.max(1, acts.length));
    acts.forEach(([label, icon, cb, sel], i) => c.add(new Button(this, 7 + i * (bw + 3), py + ph - 28, bw, 24, { label, icon, onClick: cb, style: sel ? 'buttonSel' : 'button' })));
    if (acts.length === 0) c.add(addText(this, VW / 2, py + ph - 20, hx.occupant === 'none' ? 'Nobody can go there' : 'Stand next to a hex to attack it', 'dim', 0.5));
  }

  // ------------------------------------------------------------------ actions

  private toast(msg: string, ms = 2200): void {
    const { VW } = this.m;
    const c = this.add.container(0, 0);
    const t = addText(this, VW / 2, 62, msg, 'red', 0.5, VW - 30);
    const w = Math.min(VW - 10, Math.max(80, t.width + 16));
    c.add(addPanel(this, Math.round((VW - w) / 2), 57, w, t.height + 10, 'parch'));
    c.add(t);
    this.ui.add(c);
    this.time.delayedCall(ms, () => c.destroy());
  }

  private async act<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
    if (this.busy) return null;
    this.busy = true;
    try {
      return await fn();
    } catch (e) {
      if (this.sys.isActive()) {
        this.toast(errorText(e));
        hapticNotify('error');
      }
      return null;
    } finally {
      this.busy = false;
      void label;
    }
  }

  private async march(h: Axial): Promise<void> {
    const r = await this.act('march', () => onlineApi.march(h));
    if (!r || !this.sys.isActive()) return;
    haptic('medium');
    this.toast(`On the march: ${r.path.length - 1} hexes, ${fmtDuration(r.arriveAt - Date.now())}`);
    await this.reload().catch((e) => this.fail(e));
  }

  private async halt(): Promise<void> {
    const r = await this.act('halt', () => onlineApi.stopMarch());
    if (!r) return;
    await this.reload().catch((e) => this.fail(e));
  }

  private async collect(): Promise<void> {
    const r = await this.act('collect', () => onlineApi.collect());
    if (!r || !this.sys.isActive()) return;
    hapticNotify('success');
    this.toast(`Collected ${resourceLine(r.collected, true)}`);
    await this.reload().catch((e) => this.fail(e));
  }

  private async attack(h: Axial): Promise<void> {
    const t = await this.act('attack', () => onlineApi.attackStart(h));
    if (!t || !this.sys.isActive()) return;
    this.scene.start('Battle', { source: attackSource(this.game, t, this.detail?.siege?.label ?? (t.defenderKind === 'garrison' ? 'the garrison' : 'the defenders')) });
  }

  // ------------------------------------------------------------------ results

  /** A parchment modal that Back (Telegram's or ours) closes. */
  private openM(h: number, title: string): Modal {
    const md = openModal(this, this.ui, this.m.VW, this.m.VH, h, title);
    this.modalLayer(md.c, () => this.closeModal());
    return md;
  }

  private closeModal(): void {
    this.modal?.c.destroy();
    this.modal = null;
  }

  private showAttackResult(r: AttackResult | { error: string }): void {
    const { VW } = this.m;
    if ('error' in r) {
      this.modal = this.openM(96, 'Battle not counted');
      const y = lines(this, this.modal.c, VW / 2, this.modal.y + 30, [r.error], 'ink', this.modal.w - 16);
      button(this, this.modal.c, VW / 2 - 35, y + 6, 70, 22, 'Close', () => this.closeModal(), { icon: 'check' });
      return;
    }
    const title = r.captured ? 'Hex taken!' : r.won ? 'Victory' : 'Defeat';
    const out: string[] = [];
    if (r.siege && r.won && !r.captured) out.push(`Siege ${r.siege.wins}/${r.siege.needed}: they send another wave`);
    out.push(`Enemies slain: ${r.defender.dead}/${r.defender.total}`);
    out.push(`Gold +${r.gold}${r.plunder.gold ? ` (plunder ${r.plunder.gold})` : ''}`);
    if (r.loot.length) out.push(`Loot: ${r.loot.length} items to your stash`);
    const fallen = r.attacker.heroes.filter((h) => h.died).map((h) => h.name);
    if (fallen.length) out.push(`Fallen: ${fallen.join(', ')}`);
    const wounded = r.attacker.heroes.filter((h) => h.wounded).length;
    if (wounded) out.push(`${wounded} wounded (rest 2h)`);
    const lv = r.attacker.heroes.filter((h) => h.levelsGained > 0).map((h) => h.name);
    if (lv.length) out.push(`Level up: ${lv.join(', ')}`);
    out.push('Verified by the server');
    this.modal = this.openM(44 + out.length * 11 + 30, title);
    const y = lines(this, this.modal.c, VW / 2, this.modal.y + 28, out, 'ink', this.modal.w - 14);
    button(this, this.modal.c, VW / 2 - 35, y + 4, 70, 22, 'Close', () => this.closeModal(), { icon: 'check' });
    hapticNotify(r.won ? 'success' : 'error');
  }

  private showDuelResult(o: DuelOutcome): void {
    const { VW } = this.m;
    const opp = o.names[o.side === 0 ? 1 : 0];
    let title = 'Duel over';
    const out: string[] = [];
    if (o.desync) out.push('The two battles went out of sync.', 'The duel does not count.');
    else if (o.aborted && !o.result) out.push(o.aborted === 'opponent_left' || o.aborted === 'left' ? `${opp} left the duel.` : 'The duel was cancelled.');
    else if (o.result) {
      title = o.result.winner === o.side ? 'Duel won!' : o.result.winner === -1 ? 'Duel drawn' : 'Duel lost';
      out.push(`vs ${opp}`, o.result.verified ? 'Verified by the server' : 'Server replay differs!', 'Friendly duel: no losses.');
    } else out.push('No answer from the server.');
    this.modal = this.openM(44 + out.length * 11 + 30, title);
    const y = lines(this, this.modal.c, VW / 2, this.modal.y + 28, out, 'ink', this.modal.w - 14);
    button(this, this.modal.c, VW / 2 - 35, y + 4, 70, 22, 'Close', () => this.closeModal(), { icon: 'check' });
  }

  // ------------------------------------------------------------------ duels

  private onSocket(m: ServerMsg): void {
    if (!this.sys.isActive()) return;
    switch (m.type) {
      case 'welcome':
      case 'presence':
      case 'join':
      case 'leave':
        if (this.view.kind === 'map' && !this.modal) {
          this.hud.removeAll(true);
          this.buildHud();
        } else if (this.lobbyOpen) this.openLobby();
        return;
      case 'challenged':
        this.showChallenge(m.id, m.from);
        return;
      case 'challenge_sent':
        this.challenge = { id: m.id, to: m.to };
        if (this.lobbyOpen) this.openLobby();
        return;
      case 'challenge_closed':
        if (this.challenge?.id === m.id) this.challenge = null;
        if (m.reason !== 'cancelled') this.toast(`Challenge ${m.reason}`);
        if (this.lobbyOpen) this.openLobby();
        else if (this.modal && this.incoming === m.id) this.closeModal();
        return;
      case 'duel_start':
        this.startDuel(m);
        return;
      case 'error':
        this.toast(m.message);
        return;
      default:
        return;
    }
  }

  private lobbyOpen = false;
  private incoming: string | null = null;

  openLobby(): void {
    const { VW } = this.m;
    this.closeModal();
    const others = shardSocket.players.filter((p) => p.id !== shardSocket.me?.id).slice(0, 8);
    const rows = Math.max(1, others.length);
    this.modal = this.openM(60 + rows * 24 + 30, 'Players online');
    this.lobbyOpen = true;
    const md = this.modal;
    if (!shardSocket.connected) lines(this, md.c, VW / 2, md.y + 30, ['Connecting...'], 'dim');
    else if (others.length === 0) lines(this, md.c, VW / 2, md.y + 30, ['Nobody else is here now.', 'Invite your clan!'], 'dim');
    others.forEach((p, i) => {
      const ry = md.y + 26 + i * 24;
      md.c.add(addPanel(this, md.x + 6, ry, md.w - 12, 22, 'inset'));
      md.c.add(addText(this, md.x + 12, ry + 7, p.name, 'ink'));
      const pending = this.challenge?.to.id === p.id;
      const b = new Button(this, md.x + md.w - 70, ry + 2, 60, 18, {
        label: p.busy ? 'Busy' : pending ? 'Cancel' : 'Challenge',
        style: p.busy ? 'buttonOff' : pending ? 'buttonSel' : 'button',
        onClick: () => {
          if (p.busy) return;
          if (pending && this.challenge) shardSocket.send({ type: 'challenge_cancel', id: this.challenge.id });
          else shardSocket.send({ type: 'challenge', to: p.id });
        },
      });
      md.c.add(b);
    });
    lines(this, md.c, VW / 2, md.y + 30 + rows * 24, ['Friendly duels: nothing is lost.'], 'dim');
    button(this, md.c, VW / 2 - 35, md.y + md.h - 30, 70, 22, 'Close', () => {
      this.lobbyOpen = false;
      this.closeModal();
    }, { icon: 'check' });
  }

  private showChallenge(id: string, from: PresencePlayer): void {
    const { VW } = this.m;
    this.closeModal();
    this.lobbyOpen = false;
    this.incoming = id;
    this.modal = this.openM(96, 'A challenge!');
    const md = this.modal;
    lines(this, md.c, VW / 2, md.y + 30, [`${from.name} challenges you`, 'to a friendly duel.'], 'ink');
    button(this, md.c, md.x + 10, md.y + 58, md.w / 2 - 15, 24, 'Decline', () => {
      shardSocket.send({ type: 'challenge_reply', id, accept: false });
      this.closeModal();
    }, { icon: 'close' });
    button(this, md.c, md.x + md.w / 2 + 5, md.y + 58, md.w / 2 - 15, 24, 'Fight', () => {
      shardSocket.send({ type: 'challenge_reply', id, accept: true });
      this.closeModal();
      this.toast('Preparing the field...');
    }, { icon: 'swords', sel: true });
    hapticNotify('warning');
  }

  private startDuel(m: DuelStart): void {
    const game = this.game;
    this.challenge = null;
    this.lobbyOpen = false;
    const source = duelSource(
      m,
      (outcome) => backToOnline(game, { duel: outcome }),
      () => backToOnline(game, {}),
    );
    this.scene.start('Battle', { source });
  }

  // ------------------------------------------------------------------ camera & input

  private cameraHex(): Axial {
    const cam = this.cameras.main;
    return pixelToHex(cam.midPoint.x, cam.midPoint.y, HEX);
  }

  centerOn(h: Axial): void {
    const cam = this.cameras.main;
    if (cam.zoom < 1.5) cam.setZoom(Math.max(2, this.m.S));
    const c = hexToPixel(h, HEX);
    cam.centerOn(c.x, c.y);
  }

  private zoomBy(f: number): void {
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * f, 1, 6));
  }

  private overUi(p: Phaser.Input.Pointer): boolean {
    const { S, VH } = this.m;
    const y = p.y / S;
    if (y < 56 || y > VH - 32) return true;
    if (this.modal) return true;
    if (this.panel && this.selected && y > VH - 34 - 112) return true;
    return false;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.view.kind !== 'map') return;
    const a = this.input.pointer1;
    const b = this.input.pointer2;
    if (a.isDown && b.isDown) {
      this.gesture = null;
      this.pinch = { d0: Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y), z0: this.cameras.main.zoom };
      return;
    }
    if (this.overUi(p)) return;
    this.gesture = { mode: 'pending', id: p.id, sx: p.x, sy: p.y, lx: p.x, ly: p.y };
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (this.pinch) {
      const a = this.input.pointer1;
      const b = this.input.pointer2;
      if (!a.isDown || !b.isDown) return;
      const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
      this.cameras.main.setZoom(Phaser.Math.Clamp(this.pinch.z0 * (d / Math.max(1, this.pinch.d0)), 1, 6));
      return;
    }
    const g = this.gesture;
    if (!g || g.id !== p.id || !p.isDown) return;
    if (g.mode === 'pending' && Math.abs(p.x - g.sx) + Math.abs(p.y - g.sy) > 10) g.mode = 'pan';
    if (g.mode === 'pan') {
      const cam = this.cameras.main;
      cam.scrollX -= (p.x - g.lx) / cam.zoom;
      cam.scrollY -= (p.y - g.ly) / cam.zoom;
    }
    g.lx = p.x;
    g.ly = p.y;
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (this.pinch) {
      if (!this.input.pointer1.isDown || !this.input.pointer2.isDown) this.pinch = null;
      this.gesture = null;
      return;
    }
    const g = this.gesture;
    this.gesture = null;
    if (!g || g.id !== p.id || g.mode !== 'pending' || !this.map) return;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const h = pixelToHex(w.x, w.y, HEX);
    const known = this.map.hexes.find((x) => x.q === h.q && x.r === h.r);
    if (!known) return this.select(null);
    haptic('light');
    this.select(this.selected && this.selected.q === h.q && this.selected.r === h.r ? null : h);
  }
}

/** Stops whatever runs and opens the online map (from the battle scene's callbacks). */
export function backToOnline(game: Phaser.Game, data: OnlineSceneData): void {
  for (const sc of game.scene.getScenes(true)) game.scene.stop(sc.scene.key);
  game.scene.start('Online', data);
}

/** The battle scene's source for an attack: submit the order log, then back to the map with the verdict. */
export function attackSource(game: Phaser.Game, t: AttackTicket, label: string): BattleSource {
  return {
    setup: t.setup,
    heroes: [...t.attackers, ...t.defenders],
    side: 0,
    label: `vs ${label}`,
    onFinish(sim: Battle, deployOrders: number) {
      // Only the player's orders are sent (the bot's come back from the seed); count the player's deployment orders.
      const orders = sim.orderLog.filter((o) => o.side === 0).map((o) => ({ tick: o.tick, side: o.side, order: o.order }));
      const deployed = sim.orderLog.slice(0, deployOrders).filter((o) => o.side === 0).length;
      onlineApi
        .attackSubmit(t.ticket, orders, deployed, { winner: sim.winner ?? -1, ticks: sim.tick, hash: sim.hash() })
        .then((r) => backToOnline(game, { attack: r, focus: t.hex }))
        .catch((e) => backToOnline(game, { attack: { error: errorText(e) }, focus: t.hex }));
    },
    onLeave() {
      // Leaving deployment gives the attack up (no losses; a short cooldown on this hex).
      void onlineApi.attackAbandon(t.ticket).catch(() => undefined);
      backToOnline(game, { focus: t.hex });
    },
  };
}
