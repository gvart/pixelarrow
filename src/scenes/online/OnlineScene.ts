/**
 * Online mode hub: the season map of the player's shard (regions and routes,
 * src/online/world.ts) drawn through a WorldMapView
 * (src/scenes/online/regionMapView.ts), the region panel
 * (march with ETA and energy, attack, garrison, collect; disabled buttons say
 * why), the HUD (season, resources, energy), live army movement from the
 * shard socket, income, the duel lobby, and entry points to the online army
 * and clan screens. Everything comes from the server; this scene only
 * displays it and sends intents. Started with `{ preview }` it shows a local
 * demo shard instead (src/online/demoShard.ts: layout check, screenshots).
 */
import Phaser from 'phaser';
import { BaseScene } from '../BaseScene';
import { Button, Meter, addIcon, addPanel, addScroll, addText, tappable } from '../../ui/kit';
import { Badge, Label, ScrollList, firstTimeHint, openModal, showTooltip, toast, type Modal } from '../../ui/widgets';
import { SIZE, COLOR } from '../../ui/theme';
import { LINE_H, measureText, wrapText } from '../../ui/textfit';
import { uiId, worldRect } from '../../ui/layout';
import { haptic, hapticNotify } from '../../platform/telegram';
import { getMap, hasMap, type WorldGraph } from '../../online/world';
import {
  checkOnline,
  errorText,
  explain,
  onlineApi,
  peekPendingInvite,
  shardSocket,
  type AttackResult,
  type AttackTicket,
  type BossView,
  type MapView,
  type ProfileView,
  type RegionDetail,
  type RegionView,
} from '../../online/client';
import type { DuelOutcome } from '../../online/duelDriver';
import type { BattleSource } from '../../online/battleSource';
import type { LiveArmyMsg, PresencePlayer, ServerMsg } from '../../online/protocol';
import type { Battle } from '../../sim/battle';
import { ONLINE_RULES, RESOURCE_KEYS, type Resources } from '../../online/rules';
import { planMarch, type MarchPlan } from '../../online/marchPlan';
import { regionActions, type Act } from '../../online/regionActions';
import { demoShard, type DemoShard } from '../../online/demoShard';
import { MarkerMapView, clampCenter, zoomLimits, type WorldMapView } from './regionMapView';
import { renderVignette } from '../../art/warTable';
import { duelReturn, showChallenge } from '../../ui/duelInvites';
import { t, tOr, type TKey } from '../../i18n';
import { attackReport, duelReport } from '../../online/report';
import { attackSubmission } from '../../online/battle';
import { showReport } from '../ResultsScene';
import { openBossInfo, openLairInfo, raidSource } from './beastPanel';
import { encounterName } from '../../ui/beastInfo';
import type { EncounterId } from '../../data/beasts';
import { OnlineCoach, coachDue, type CoachHost } from '../../ui/tutorial/onlineCoach';
import type { CoachId } from '../../game/tutorial';

/** Layout (UI pixels). */
const TOP_H = 44;
const BAR_H = 34;
const CHIP_H = 28;

type View = { kind: 'loading'; msg: string } | { kind: 'unavailable'; msg: string; detail: string } | { kind: 'join' } | { kind: 'map' };

/** Staged states of the preview map (layout check, screenshots). */
export type PreviewKind = 'map' | 'own' | 'neutral' | 'far' | 'rival' | 'town' | 'lobby' | 'challenge' | 'join' | 'march' | 'result' | 'lair' | 'lairInfo' | 'boss' | 'bossInfo' | 'market' | 'post';

export interface OnlineSceneData {
  /** Show the outcome of an attack that just came back from the battle scene. */
  attack?: AttackResult | { error: string };
  duel?: DuelOutcome;
  /** Centre the map on this region (loc). */
  focus?: number;
  /** Also select the focused region (a bot notification's deep link). */
  select?: boolean;
  /** Open the duel lobby (deep link). */
  lobby?: boolean;
  /** A local demo shard instead of the server (nothing is sent). */
  preview?: PreviewKind;
  /** Show this coach mark (layout check, screenshots). */
  coach?: CoachId;
}

/** Where the data comes from: the server, or the demo shard. */
interface Source {
  preview: boolean;
  status(): Promise<{ joined: boolean }>;
  join(): Promise<unknown>;
  profile(): Promise<ProfileView>;
  map(): Promise<MapView>;
  region(loc: number): Promise<RegionDetail>;
  march(loc: number): Promise<{ path: number[]; at: number[]; energy: number; arriveAt: number }>;
  stopMarch(): Promise<{ loc: number }>;
  collect(): Promise<{ collected: Resources }>;
  /** World bosses of the shard (shared HP, damage tally). */
  bosses(): Promise<BossView[]>;
}

const liveSource: Source = {
  preview: false,
  status: () => onlineApi.status(),
  join: () => onlineApi.join(),
  profile: () => onlineApi.profile(),
  map: () => onlineApi.map(),
  region: (loc) => onlineApi.region(loc),
  march: (h) => onlineApi.march(h),
  stopMarch: () => onlineApi.stopMarch(),
  collect: () => onlineApi.collect(),
  bosses: () => onlineApi.bosses().then((r) => r.bosses),
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The demo shard as a source: answers locally, marches and collects only change the local copy. */
function previewSource(d: DemoShard): Source {
  const skew = () => d.now - Date.now();
  return {
    preview: true,
    status: async () => ({ joined: true }),
    join: async () => ({}),
    profile: async () => clone({ ...d.profile, now: Date.now() + skew() }),
    map: async () => clone({ ...d.map, now: Date.now() + skew() }),
    region: async (loc) => clone(d.region(loc)),
    march: async (h) => {
      const rival = new Set(d.map.regions.filter((x) => x.owner !== null && x.clan !== d.map.you.clan).map((x) => x.loc));
      const p = planMarch(d.world, (l) => rival.has(l), d.profile.army.loc, h);
      if (!p.ok) throw new Error(t('hex.why.noPath'));
      const now = Date.now() + skew();
      const at = [now];
      for (let i = 1; i < p.path.length; i++) at.push(at[i - 1] + d.world.minutes(p.path[i - 1], p.path[i]) * 60_000);
      const path = p.path;
      d.profile.army = { ...d.profile.army, marching: true, dest: h, arriveAt: at[at.length - 1], path, at };
      d.profile.energy -= p.energy;
      return { path, at, energy: d.profile.energy, arriveAt: at[at.length - 1] };
    },
    stopMarch: async () => {
      d.profile.army = { ...d.profile.army, marching: false, dest: null, arriveAt: null, path: null, at: null };
      return { loc: d.profile.army.loc };
    },
    bosses: async () => clone(d.bosses),
    collect: async () => {
      const got = clone(d.profile.income.pending);
      for (const k of RESOURCE_KEYS) {
        d.profile.resources[k] += got[k];
        d.profile.income.pending[k] = 0;
      }
      return { collected: got };
    },
  };
}

type Gesture = { mode: 'pending' | 'pan'; id: number; sx: number; sy: number; lx: number; ly: number } | null;

/** "12m 30s", "2h 05m" (localized). */
export function fmtTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return t('online.time.s', { s });
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 && m < 10 ? t('online.time.ms', { m, s: s % 60 }) : t('online.time.m', { m });
  const h = Math.floor(m / 60);
  if (h < 48) return t('online.time.hm', { h, m: m % 60 });
  return t('online.time.d', { d: Math.floor(h / 24), h: h % 24 });
}

/** 999, 1.2K, 12K. */
export function fmtNum(n: number): string {
  const v = Math.floor(n);
  if (v < 1000) return `${v}`;
  if (v < 10_000) return `${(Math.floor(v / 100) / 10).toString()}K`;
  return `${Math.floor(v / 1000)}K`;
}

const RES_ICON: Record<keyof Resources, string> = { gold: 'coin', food: 'food', wood: 'wood', bronze: 'bronze', recruits: 'people' };

export class OnlineScene extends BaseScene {
  private view: View = { kind: 'loading', msg: '' };
  profile: ProfileView | null = null;
  map: MapView | null = null;
  private layer!: Phaser.GameObjects.Layer;
  board!: WorldMapView;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private hud!: Phaser.GameObjects.Container;
  private panel: Phaser.GameObjects.Container | null = null;
  private panelTop = 0;
  private modal: Modal | null = null;
  selected: number | null = null;
  detail: RegionDetail | null = null;
  private plan: MarchPlan | null = null;
  private gesture: Gesture = null;
  private pinch: { d0: number; z0: number; wx: number; wy: number } | null = null;
  private offSocket: (() => void) | null = null;
  private challenge: { id: string; to: PresencePlayer } | null = null;
  private busy = false;
  private refreshTimer: Phaser.Time.TimerEvent | null = null;
  private data0: OnlineSceneData = {};
  private src: Source = liveSource;
  private demo: DemoShard | null = null;
  private cameraPlaced = false;
  private backdrop: Phaser.GameObjects.Image | null = null;
  private candle: Phaser.GameObjects.Image | null = null;
  private chipText: Phaser.GameObjects.BitmapText | null = null;
  private chipTimer: Phaser.Time.TimerEvent | null = null;
  private duelBadge: Badge | null = null;
  private lobbyOpen = false;
  private boardBuilt = false;
  /** World bosses of the shard (HP bars on the map, the raid panel). */
  bosses: BossView[] = [];
  /** First visit: the coach marks (src/ui/tutorial/onlineCoach.ts). */
  coach: OnlineCoach | null = null;

  constructor() {
    super('Online');
  }

  create(data: OnlineSceneData): void {
    this.data0 = data ?? {};
    this.selected = null;
    this.detail = null;
    this.plan = null;
    this.cameraPlaced = false;
    this.backdrop = null;
    this.modal = null;
    this.panel = null;
    this.gesture = null;
    this.pinch = null;
    this.challenge = null;
    this.busy = false;
    this.lobbyOpen = false;
    this.boardBuilt = false;
    this.coach = null;
    this.chipText = null;
    this.duelBadge = null;
    this.demo = this.data0.preview ? demoShard() : null;
    this.src = this.demo ? previewSource(this.demo) : liveSource;
    this.view = { kind: 'loading', msg: t('online.reaching') };
    this.initUi();
    this.screen({ back: () => this.back() });
    this.cameras.main.setBackgroundColor(0x1d1410);
    this.layer = this.add.layer();
    this.board = new MarkerMapView(this, this.layer, 0);
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCam.ignore(this.layer);
    this.cameras.main.ignore(this.ui);
    this.addAtmosphere();
    this.hud = this.add.container(0, 0);
    this.ui.add(this.hud);
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown[], _dx: number, dy: number) => this.zoomAt(dy > 0 ? 0.8 : 1.25, p.x, p.y));
    if (!this.demo) {
      this.offSocket = shardSocket.on((m) => this.onSocket(m));
      Object.assign(window, { __shard: shardSocket }); // debug handle (e2e script)
    }
    duelReturn.to = (game, outcome) => {
      // a finished duel gets the battle report; an aborted one the map's message
      const report = outcome ? duelReport(outcome) : null;
      if (report) showReport(game, report, () => backToOnline(game, {}));
      else backToOnline(game, outcome ? { duel: outcome } : {});
    };
    this.events.once('shutdown', () => {
      this.offSocket?.();
      this.offSocket = null;
      this.refreshTimer?.remove();
      this.board.destroy();
    });
    this.render();
    void this.boot();
  }

  protected onResized(): void {
    this.uiCam.setSize(this.scale.width, this.scale.height);
    this.scene.restart({ focus: this.map ? this.cameraHex() : undefined, preview: this.data0.preview });
  }

  private back(): void {
    if (this.modal) return this.closeModal();
    if (this.selected) return this.select(null);
    if (!this.demo) shardSocket.close();
    this.scene.start('Menu');
  }

  // ------------------------------------------------------------------ atmosphere

  /** Candle-light vignette over the table (under the HUD). */
  private addAtmosphere(): void {
    const { VW, VH } = this.m;
    const vk = `wt_vignette_${VW}x${VH}`;
    if (!this.textures.exists(vk)) this.textures.addCanvas(vk, renderVignette(VW, VH).toCanvas());
    // one full-screen overlay (cheap on phones): dark warm corners, a faint candle warmth, flickering
    this.candle = this.add.image(0, 0, vk).setOrigin(0, 0);
    this.ui.add(this.candle);
  }

  update(time: number, delta: number): void {
    if (this.view.kind === 'map' && this.boardBuilt) this.board.update(time, delta);
    if (this.coach) {
      this.coach.refresh();
      this.coach.update(time);
    }
    if (this.candle) this.candle.setAlpha(0.9 + Math.sin(time / 170) * 0.05 + Math.sin(time / 53) * 0.04);
  }

  // ------------------------------------------------------------------ data

  private async boot(): Promise<void> {
    if (!this.demo) {
      const ok = await checkOnline();
      if (!this.sys.isActive()) return;
      if (!ok.ok) {
        this.view = { kind: 'unavailable', msg: t('online.unavailable'), detail: ok.message };
        return this.render();
      }
    }
    try {
      const st = await this.src.status();
      if (!this.sys.isActive()) return;
      if (!st.joined || this.data0.preview === 'join') {
        if (!this.demo && peekPendingInvite()) {
          // A clan invite: join the clan (that also places the newcomer in its shard).
          this.scene.start('OnlineClan', {});
          return;
        }
        this.view = { kind: 'join' };
        return this.render();
      }
      await this.reload();
      if (!this.demo) shardSocket.open();
      if (!this.demo && peekPendingInvite()) this.scene.start('OnlineClan', {});
      else this.afterReturn();
    } catch (e) {
      this.fail(e);
    }
  }

  private fail(e: unknown): void {
    if (!this.sys.isActive()) return;
    const x = explain(e);
    this.view = { kind: 'unavailable', msg: t('online.unavailable'), detail: x.message };
    this.render();
  }

  async reload(): Promise<void> {
    const [profile, map] = await Promise.all([this.src.profile(), this.src.map()]);
    if (!this.sys.isActive()) return;
    this.profile = profile;
    this.map = map;
    this.view = { kind: 'map' };
    const own = profile.army.marching && profile.army.path && profile.army.at ? { path: profile.army.path, at: profile.army.at } : null;
    this.board.build(map, own);
    this.boardBuilt = true;
    this.board.setRoute(own ? own.path : null, true);
    this.bosses = await this.src.bosses().catch(() => [] as BossView[]);
    if (!this.sys.isActive()) return;
    this.board.setBossBars(this.bosses.map((b) => ({ loc: b.loc, f: b.maxHp > 0 ? b.hp / b.maxHp : 0, dead: b.status === 'dead' })));
    this.render();
    if (this.selected !== null) void this.loadDetail(this.selected);
    // Marches resolve on the server's clock: refresh when the army arrives.
    this.refreshTimer?.remove();
    const arrive = profile.army.marching && profile.army.arriveAt ? profile.army.arriveAt - profile.now : 0;
    if (arrive > 0) this.refreshTimer = this.time.delayedCall(Math.min(arrive + 400, 600_000), () => void this.reload().catch(() => undefined));
  }

  private afterReturn(): void {
    const d = this.data0;
    if (d.attack) this.showAttackResult(d.attack);
    else if (d.duel) this.showDuelResult(d.duel);
    else if (d.select && d.focus !== undefined) this.select(d.focus);
    else if (d.lobby) this.openLobby();
    this.stagePreview();
    if (d.coach || (!d.preview && coachDue())) this.coach = new OnlineCoach(this.coachHost(), this.ui, d.coach);
    else if (!d.preview) firstTimeHint(this, 'online-map', t('online.hint'));
    this.data0 = { preview: d.preview };
  }

  /** Preview staging: select a hex, open the lobby, a challenge... */
  private stagePreview(): void {
    const demo = this.demo;
    const k = this.data0.preview;
    if (!demo || !k) return;
    const spot = k === 'own' ? demo.spots.own : k === 'neutral' ? demo.spots.neutralNext : k === 'far' ? demo.spots.neutralFar : k === 'rival' ? demo.spots.rival : k === 'town' ? demo.spots.town : k === 'lair' || k === 'lairInfo' ? demo.spots.lair : k === 'boss' || k === 'bossInfo' ? demo.spots.boss : k === 'market' ? demo.spots.market : k === 'post' ? demo.spots.post : null;
    if (spot !== null) this.select(spot);
    if ((k === 'lairInfo' || k === 'bossInfo') && spot !== null) this.openBeast(spot);
    if (k === 'lobby') this.openLobby();
    if (k === 'challenge') showChallenge(this.game, 'preview', { id: 102, name: 'Brasidas' });
    if (k === 'march') void this.march(demo.spots.neutralFar);
    if (k === 'result')
      this.showAttackResult({
        won: true,
        captured: false,
        siege: { wins: 1, needed: 2 },
        winner: 0,
        ticks: 2400,
        hash: '',
        loc: demo.spots.neutralNext,
        defenderKind: 'npc',
        gold: 38,
        plunder: { gold: 0, food: 0, wood: 0, bronze: 0, recruits: 0 },
        loot: [],
        attacker: { dead: [], wounded: [], heroes: [{ name: 'Leonidas', died: false, xp: 30, levelsGained: 1, wounded: true }] },
        defender: { dead: 7, total: 9 },
      });
  }

  private async joinSeason(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.view = { kind: 'loading', msg: t('online.raising') };
    this.render();
    try {
      await this.src.join();
      await this.reload();
      if (!this.demo) shardSocket.open();
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
    this.panel = null;
    this.chipText = null;
    this.duelBadge = null;
    if (this.view.kind !== 'map' || !this.profile || !this.map) {
      this.closeModal();
      this.renderState();
      return;
    }
    this.backdrop?.destroy();
    this.backdrop = null;
    this.buildHud();
    if (!this.cameraPlaced) {
      const lim = zoomLimits(this.m.S);
      this.cameras.main.setZoom(lim.start);
      this.centerOn(this.data0.focus ?? this.profile.army.loc);
      this.cameraPlaced = true;
    }
  }

  /** Loading / unavailable / join: a parchment card over the grass. */
  private renderState(): void {
    const { VW, VH } = this.m;
    if (!this.backdrop) {
      this.backdrop = this.addGrassBackdrop(17).setAlpha(0.5);
      this.ui.sendToBack(this.backdrop);
    }
    const v = this.view;
    const H = this.hud;
    const w = Math.min(VW - 16, 200);
    const x = Math.round((VW - w) / 2);
    let lines: string[] = [];
    let title = t('online.title');
    const buttons: { label: string; icon: string; primary?: boolean; onClick: () => void }[] = [];
    if (v.kind === 'loading') {
      lines = wrapText(v.msg, w - 20, 3).lines;
      buttons.push({ label: t('common.back'), icon: 'back', onClick: () => this.back() });
    } else if (v.kind === 'unavailable') {
      title = v.msg;
      lines = wrapText(`${v.detail} ${t('online.offlineStill')}`, w - 20, 6).lines;
      buttons.push({ label: t('online.backToMenu'), icon: 'back', primary: true, onClick: () => this.back() });
    } else if (v.kind === 'join') {
      const room = Math.max(3, Math.floor((VH - 16 - 26 - SIZE.btnH - 18) / LINE_H));
      lines = wrapText(t('online.joinBody'), w - 20, room).lines;
      buttons.push({ label: t('common.back'), icon: 'back', onClick: () => this.back() });
      buttons.push({ label: t('online.join'), icon: 'flag', primary: true, onClick: () => void this.joinSeason() });
    }
    const h = Math.min(VH - 16, 26 + lines.length * LINE_H + 10 + SIZE.btnH + 12);
    const y = Math.round((VH - h) / 2);
    addScroll(this, H, x, y, w, h);
    H.add(addText(this, VW / 2, y + 12, title, 'red', 0.5));
    if (lines.length) {
      const body = addText(this, VW / 2, y + 28, lines.join('\n'), 'ink', 0.5);
      body.setCenterAlign();
      H.add(body);
    }
    const bw = buttons.length > 1 ? Math.floor((w - 12 - SIZE.gap) / 2) : Math.min(w - 12, 110);
    buttons.forEach((b, i) => {
      const bx = buttons.length > 1 ? x + 6 + i * (bw + SIZE.gap) : Math.round((VW - bw) / 2);
      H.add(new Button(this, bx, y + h - SIZE.btnH - 9, bw, SIZE.btnH, { label: b.label, icon: b.icon, variant: b.primary ? 'primary' : 'secondary', onClick: b.onClick }));
    });
  }

  private buildHud(): void {
    const { VW, VH } = this.m;
    const H = this.hud;
    const p = this.profile!;
    // ---- top: season, energy, centre-on-army; resources below
    H.add(addPanel(this, 0, 0, VW, TOP_H, 'parch'));
    let x0 = 4;
    if (this.inGameBack) {
      H.add(new Button(this, 3, 2, SIZE.btnMinW, SIZE.btnH, { icon: 'back', onClick: () => this.back(), id: 'online.back' }));
      x0 = 30;
    }
    H.add(new Button(this, VW - 27, 2, SIZE.btnMinW, SIZE.btnH, { icon: 'map', iconOnly: true, label: t('online.centre'), onClick: () => this.centerOn(this.profile!.army.loc, true), id: 'online.centre' }));
    const energy = Math.floor(p.energy);
    const ew = 12 + 3 + measureText(`${energy}`) + 10;
    const energyBtn = new Button(this, VW - 27 - SIZE.gap - ew, 2, ew, SIZE.btnH, {
      icon: 'bolt',
      label: `${energy}`,
      font: energy < ONLINE_RULES.energyPerAttack ? 'red' : 'ink',
      tip: t('online.energyTip', { n: energy, max: p.energyMax, rate: ONLINE_RULES.energyPerHour }),
      onClick: () => showTooltip(this, t('online.energyTip', { n: energy, max: p.energyMax, rate: ONLINE_RULES.energyPerHour }), energyBtn),
      id: 'online.energy',
    });
    H.add(energyBtn);
    const days = Math.max(0, Math.ceil((p.season.endsAt - p.now) / 86_400_000));
    const titleW = VW - 27 - SIZE.gap - ew - 4 - x0;
    const long = t('online.season', { n: p.season.id, d: days });
    const title = measureText(long) <= titleW ? long : t('online.seasonShort', { n: p.season.id, d: days });
    H.add(new Label(this, x0, 10, title, { maxW: titleW, font: 'red', expandable: false }));
    // resources: an inset strip (tap: full numbers)
    const ry = TOP_H - 17;
    H.add(addPanel(this, 3, ry, VW - 6, 15, 'inset'));
    const keys = (VW >= 200 ? RESOURCE_KEYS : RESOURCE_KEYS.filter((k) => k !== 'recruits')) as (keyof Resources)[];
    const cell = Math.floor((VW - 10) / keys.length);
    keys.forEach((k, i) => {
      const cx = 6 + i * cell;
      H.add(addIcon(this, cx, ry + 1, RES_ICON[k]));
      H.add(addText(this, cx + 14, ry + 4, k === 'recruits' ? `${Math.floor(p.resources[k])}` : fmtNum(p.resources[k]), 'ink'));
    });
    // ---- marching chip
    if (p.army.marching && p.army.arriveAt) {
      const cy = TOP_H + 2;
      H.add(addPanel(this, 3, cy, VW - 6, CHIP_H - 2, 'inset'));
      const hw = Math.max(44, measureText(t('online.halt')) + 12);
      H.add(new Button(this, VW - 4 - hw - 1, cy + 1, hw, SIZE.btnH, { label: t('online.halt'), tip: t('online.haltTip'), onClick: () => void this.halt(), id: 'online.halt' }));
      H.add(addIcon(this, 7, cy + 7, 'clock'));
      this.chipText = addText(this, 22, cy + 9, '', 'ink');
      H.add(this.chipText);
      const upd = () => {
        if (!this.chipText?.scene || !this.profile?.army.arriveAt) return;
        const left = this.profile.army.arriveAt - this.board.armies.serverTime(Date.now());
        const s = t('online.marching', { t: fmtTime(left) });
        this.chipText.setText(s.length && measureText(s) > VW - hw - 34 ? fmtTime(left) : s);
      };
      upd();
      this.chipTimer?.remove();
      this.chipTimer = this.time.addEvent({ delay: 1000, loop: true, callback: upd });
    }
    // ---- bottom bar: Army, Clan, Duels, Collect
    const by = VH - BAR_H;
    H.add(addPanel(this, 0, by, VW, BAR_H, 'parch'));
    const n = 4;
    const bw = Math.floor((VW - 8 - (n - 1) * SIZE.gap) / n);
    const pend = p.income.pending;
    const pendSum = RESOURCE_KEYS.reduce((a, k) => a + pend[k], 0);
    const online = this.demo ? 3 : shardSocket.players.filter((x) => x.id !== shardSocket.me?.id).length;
    const items: { label: string; icon: string; tip: string; onClick: () => void; primary?: boolean; disabled?: string; badge?: number | string }[] = [
      { label: t('online.bar.army'), icon: 'people', tip: t('online.bar.armyTip'), onClick: () => !this.demo && this.scene.start('OnlineArmy', {}) },
      { label: t('online.bar.clan'), icon: 'flag', tip: t('online.bar.clanTip'), onClick: () => !this.demo && this.scene.start('OnlineClan', {}) },
      { label: t('online.bar.duels'), icon: 'swords', tip: t('online.bar.duelsTip'), onClick: () => this.openLobby(), badge: online },
      {
        label: t('online.bar.collect'),
        icon: 'coin',
        tip: `${t('online.bar.collectTip')}: ${resLine(pend)}`,
        onClick: () => void this.collect(),
        primary: pendSum >= 1 && !this.selected,
        disabled: pendSum >= 1 ? undefined : t('online.collectNone'),
        badge: pendSum >= 1 ? '!' : 0,
      },
    ];
    items.forEach((it, i) => {
      const bx = 4 + i * (bw + SIZE.gap);
      // narrow screens: icons only (the label becomes the long-press tip) rather than "AR…"
      const iconOnly = measureText(it.label, it.primary) > bw - 6;
      const b = new Button(this, bx, by + 3, bw, 28, { label: it.label, icon: it.icon, iconOnly, tip: iconOnly ? `${it.label}: ${it.tip}` : it.tip, variant: it.primary ? 'primary' : 'secondary', onClick: it.onClick, disabledReason: it.disabled });
      if (it.disabled) b.setEnabled(false, it.disabled);
      H.add(b);
      if (it.badge !== undefined) {
        const badge = new Badge(this, bx + bw - 5, by + 7, it.badge);
        H.add(badge);
        if (i === 2) this.duelBadge = badge;
      }
    });
    if (this.selected) this.buildPanel();
    this.coach?.refresh();
  }

  /** Free map area between the top HUD (and the march chip) and the panel / bottom bar, in UI px. */
  private mapArea(): { top: number; bottom: number } {
    const top = TOP_H + (this.profile?.army.marching ? CHIP_H : 0);
    const bottom = this.panel ? this.panelTop : this.m.VH - BAR_H;
    return { top, bottom };
  }

  // ------------------------------------------------------------------ hex panel

  /** The world graph of this shard's map. */
  get world(): WorldGraph {
    const id = this.map?.shard.map ?? this.profile?.shard.map;
    return id && hasMap(id) ? getMap(id) : getMap();
  }

  select(h: number | null): void {
    this.selected = h;
    this.detail = null;
    this.plan = null;
    this.board.setSelected(h);
    if (this.view.kind !== 'map') return;
    if (h !== null && this.profile && this.map) {
      const you = this.map.you;
      const rival = new Set(this.map.regions.filter((x) => x.owner !== null && x.owner !== you.id && (you.clan === null || x.clan !== you.clan)).map((x) => x.loc));
      this.plan = planMarch(this.world, (l) => rival.has(l), this.profile.army.loc, h);
    }
    const own = this.profile?.army.marching && this.profile.army.path ? this.profile.army.path : null;
    if (own) this.board.setRoute(own, true);
    else this.board.setRoute(this.plan && this.plan.ok ? this.plan.path : null, false);
    this.hud.removeAll(true);
    this.panel = null;
    this.buildHud();
    if (h !== null) {
      this.ensureVisible(h);
      void this.loadDetail(h);
    }
  }

  private async loadDetail(h: number): Promise<void> {
    try {
      const d = await this.src.region(h);
      if (!this.sys.isActive() || this.selected !== h) return;
      this.detail = d;
      this.hud.removeAll(true);
      this.panel = null;
      this.buildHud();
      this.ensureVisible(h);
    } catch (e) {
      if (!this.sys.isActive()) return;
      toast(this, errorText(e), 'bad');
    }
  }

  private hexName(h: Pick<RegionView, 'loc' | 'occupant' | 'lair' | 'boss'>): string {
    if (h.boss) return encounterLabel(h.boss);
    const name = this.world.has(h.loc) ? this.world.info(h.loc).name : t('hex.neutral');
    if (h.lair) return `${name} · ${encounterLabel(h.lair)}`;
    return name;
  }

  private buildPanel(): void {
    const { VW, VH } = this.m;
    const h = this.selected!;
    const d = this.detail;
    const p = this.profile!;
    const map = this.map!;
    const view = d?.region ?? this.board.known(h);
    if (!view) return;
    const x = 4;
    const W = VW - 8;
    const tw = W - 12;
    // ---- the lines of the panel (text, font)
    const rows: { text: string; font: 'ink' | 'dim' | 'red' | 'good'; kind?: 'yields' | 'siege' }[] = [];
    const owner = view.owner === null ? (view.occupant === 'none' ? t('hex.impassable') : t('hex.neutral')) : view.owner === map.you.id ? (view.home ? t('hex.yourHome') : t('hex.yours')) : `${d?.ownerName ?? map.players[String(view.owner)] ?? '?'}${(d?.clan?.tag ?? (view.clan !== null ? map.clans[String(view.clan)]?.tag : undefined)) ? ` [${d?.clan?.tag ?? map.clans[String(view.clan)]?.tag}]` : ''}`;
    const ownerLine = view.owner !== null && view.owner !== map.you.id && view.home ? t('hex.home', { name: owner }) : owner;
    rows.push({ text: d?.locked ? `${ownerLine} · ${t('hex.underAttack')}` : ownerLine, font: d?.locked ? 'red' : 'dim' });
    if (!d) rows.push({ text: t('hex.scouting'), font: 'dim' });
    else {
      if (view.occupant !== 'none') rows.push({ text: '', font: 'ink', kind: 'yields' });
      if (d.defenders) {
        const def = view.occupant === 'beast' ? 'beast' : view.def;
        const label = d.defenders.kind === 'garrison' ? null : def ? tOr(`def.${def}`, d.siege?.label ?? def) : d.siege?.label ?? null;
        rows.push({
          text: d.defenders.kind === 'militia' ? t('hex.militiaFoe') : label ? t('hex.defenders', { label, n: d.defenders.count, p: d.defenders.power }) : t('hex.garrisonFoe', { n: d.defenders.count, p: d.defenders.power }),
          font: 'ink',
        });
      }
      if (d.siege && d.siege.needed > 1) rows.push({ text: t('hex.siege', { wins: d.siege.wins, needed: d.siege.needed }), font: 'ink', kind: 'siege' });
      const boss = this.bossAt(h);
      if (boss) rows.push({ text: `${encounterLabel(boss.boss)} · ${t('boss.status', { pct: Math.ceil((100 * boss.hp) / Math.max(1, boss.maxHp)) })}`, font: boss.status === 'dead' ? 'dim' : 'red' });
      if (d.lair && !d.lair.home && d.lair.returnsAt) rows.push({ text: t('hex.lairBack', { t: fmtTime(d.lair.returnsAt - Date.now()) }), font: 'dim' });
      if (d.garrison) rows.push({ text: d.garrison.length ? t('hex.garrison', { names: d.garrison.map((g) => g.hero.name).join(', ') }) : t('hex.noGarrison'), font: 'ink' });
      if (d.income) rows.push({ text: t('hex.waiting', { res: resLine(d.income) }), font: 'good' });
      if (view.post) rows.push({ text: t(`merchant.kind.${view.post}` as TKey), font: 'good' });
    }
    // ---- actions
    const acts: Act[] = d
      ? regionActions({
          owner: view.owner,
          ours: d.ours,
          mine: d.mine,
          home: view.home,
          passable: view.occupant !== 'none',
          locked: d.locked,
          canAttack: d.canAttack,
          canGarrison: d.canGarrison,
          waiting: d.income ? RESOURCE_KEYS.reduce((a, k) => a + d.income![k], 0) : 0,
          here: p.army.loc === h && !p.army.marching,
          adjacent: this.world.adjacent(p.army.loc, h),
          marching: p.army.marching,
          energy: p.energy,
          plan: this.plan ?? { ok: false, reason: 'unknown' },
        })
      : [];
    const rowH = 11;
    // the info rows sit in one tap area (full text on long-press) at least a touch target tall
    const infoH = Math.max(SIZE.btnH, rows.length * rowH + 2);
    const ph = 8 + 11 + infoH + (acts.length ? SIZE.gap + 1 + SIZE.btnH : 0) + 8;
    const py = VH - BAR_H - ph - 1;
    this.panelTop = py;
    const c = this.add.container(0, 0);
    this.hud.add(c);
    this.panel = c;
    c.add(addPanel(this, x, py, W, ph, 'parch'));
    // a tap-catcher behind the content: taps on the panel never reach the map; long-press: the full text
    const full = [`${this.hexName(view)} · ${view.tier}`, ...rows.map((r) => (r.kind === 'yields' && d ? `${t('hex.perHour')}: ${resLine(d.yields, true)}` : r.text))].join('\n');
    const titleText = t('hex.title', { name: this.hexName(view), tier: view.tier });
    c.add(new Label(this, x + 6, py + 7, titleText, { maxW: tw - 26, font: 'red', expandable: false }));
    c.add(new Button(this, x + W - 27, py + 3, SIZE.btnMinW, SIZE.btnH, { icon: 'close', iconOnly: true, label: t('common.close'), onClick: () => this.select(null), id: 'online.closePanel' }));
    let y = py + 8 + 13;
    for (const r of rows) {
      if (r.kind === 'yields' && d) this.yieldsRow(c, x + 6, y, tw, d.yields);
      else if (r.kind === 'siege' && d?.siege) {
        const txt = addText(this, x + 6, y, r.text, 'ink');
        c.add(txt);
        const mw = Math.min(60, tw - txt.width - 8);
        if (mw > 12) c.add(new Meter(this, x + 6 + txt.width + 5, y + 1, mw, 5, COLOR.xp).setValue(d.siege.wins, d.siege.needed));
      } else c.add(new Label(this, x + 6, y, r.text, { maxW: tw, font: r.font, expandable: false }));
      y += rowH;
    }
    const infoTop = py + 8 + 11;
    // left of the close button's column, so the two never touch
    const zone = this.add.zone(x + 2, infoTop, W - 4 - SIZE.btnMinW - SIZE.gap - 3, infoH).setOrigin(0, 0).setInteractive();
    uiId(zone, 'online.hexInfo');
    tappable(zone, null, () => showTooltip(this, full, { x: x + 6, y: infoTop, w: tw, h: infoH }), full);
    c.addAt(zone, 1);
    // a lair or a world boss: its info panel (how it fights, the raid) on one more button
    const beastBtn = !!d && (!!d.lair || !!this.bossAt(h));
    // a town or a trading post: its merchant (docs/DUELS.md "War-map shops on the map")
    const merchantBtn = !!d?.merchant;
    if (!acts.length && !beastBtn && !merchantBtn) return;
    const by = infoTop + infoH + SIZE.gap + 1;
    const n = acts.length + (beastBtn ? 1 : 0) + (merchantBtn ? 1 : 0);
    const bw = Math.floor((W - 12 - (n - 1) * SIZE.gap) / n);
    // slot i of n; the last one takes the rounding remainder
    const slot = (i: number) => ({ bx: x + 6 + i * (bw + SIZE.gap), bw: i === n - 1 ? W - 12 - i * (bw + SIZE.gap) : bw });
    // the merchant first (left): the primary action stays at the right, under the thumb
    const first = merchantBtn ? 1 : 0;
    if (merchantBtn) {
      const sl = slot(0);
      c.add(new Button(this, sl.bx, by, sl.bw, SIZE.btnH, { label: t('hex.act.merchant'), icon: 'amphora', tip: t('hex.merchantTip'), onClick: () => this.openMerchant(h), id: 'online.act.merchant' }));
    }
    acts.forEach((a, i) => {
      const spec = this.actSpec(a, h);
      const sl = slot(first + i);
      const b = new Button(this, sl.bx, by, sl.bw, SIZE.btnH, {
        label: spec.label,
        icon: spec.icon,
        variant: a.primary ? 'primary' : 'secondary',
        tip: spec.tip,
        onClick: spec.onClick,
        disabledReason: a.reason ? t(`hex.why.${a.reason}` as TKey, a.params) : undefined,
        id: `online.act.${a.id}`,
      });
      if (!a.enabled) b.setEnabled(false);
      c.add(b);
    });
    if (beastBtn) {
      const sl = slot(n - 1);
      c.add(new Button(this, sl.bx, by, sl.bw, SIZE.btnH, { label: t('hex.act.beast'), icon: 'beast', tip: t('hex.beastTip'), onClick: () => this.openBeast(h), id: 'online.act.beast' }));
    }
  }

  /** The merchant screen of a town or a trading post (Back returns to this hex, selected). */
  openMerchant(h: number): void {
    this.scene.start('Merchant', { loc: h, demo: !!this.demo, back: { scene: 'Online', data: { focus: h, select: true, preview: this.demo ? 'map' : undefined } } });
  }

  private bossAt(h: number): BossView | null {
    return this.bosses.find((b) => b.loc === h) ?? null;
  }

  /** The beast info panel of a lair or a world boss (with Attack / Raid). */
  openBeast(h: number): void {
    const d = this.detail;
    const p = this.profile;
    if (!p) return;
    this.closeModal();
    const boss = this.bossAt(h);
    if (boss) {
      const why = boss.status === 'dead' ? t('boss.why.dead') : (p.army.loc !== h && !this.world.adjacent(p.army.loc, h)) || p.army.marching ? t('boss.why.far') : undefined;
      this.modal = openBossInfo(this, boss, { raid: () => void this.raid(boss), disabled: why });
      return;
    }
    if (!d?.lair) return;
    const lair = d.lair;
    this.modal = openLairInfo(this, lair.enc as EncounterId, lair.level, {
      returnsIn: !lair.home && lair.returnsAt ? fmtTime(lair.returnsAt - Date.now()) : undefined,
      attack: lair.home ? { run: () => void this.attack(h), disabled: d.canAttack ? undefined : t('boss.why.far') } : undefined,
    });
  }

  private async raid(b: BossView): Promise<void> {
    if (this.demo) {
      toast(this, t('online.preview'));
      return;
    }
    const tk = await this.act(() => onlineApi.raidStart(b.boss));
    if (!tk || !this.sys.isActive()) return;
    this.scene.start('Battle', { source: raidSource(this.game, tk) });
  }

  private actSpec(a: Act, h: number): { label: string; icon: string; tip?: string; onClick: () => void } {
    switch (a.id) {
      case 'march': {
        const pl = this.plan && this.plan.ok ? this.plan : null;
        return {
          label: pl ? t('hex.act.marchEta', { t: fmtTime(pl.minutes * 60_000) }) : t('hex.act.march'),
          icon: 'advance',
          tip: pl ? t('hex.marchTip', { t: fmtTime(pl.minutes * 60_000), e: pl.energy }) : undefined,
          onClick: () => void this.march(h),
        };
      }
      case 'attack':
        return { label: t('hex.act.attack'), icon: 'swords', tip: t('hex.attackTip', { e: ONLINE_RULES.energyPerAttack }), onClick: () => void this.attack(h) };
      case 'garrison':
        return { label: t('hex.act.garrison'), icon: 'helmet', tip: t('hex.garrisonTip'), onClick: () => !this.demo && this.scene.start('OnlineArmy', { garrison: h }) };
      case 'collect':
        return { label: t('hex.act.collect'), icon: 'coin', tip: t('online.bar.collectTip'), onClick: () => void this.collect() };
    }
  }

  /** "PER HOUR [icon]+6 [icon]+2": only what the hex yields, as far as it fits. */
  private yieldsRow(c: Phaser.GameObjects.Container, x: number, y: number, w: number, r: Resources): void {
    const head = t('hex.perHour');
    const items = RESOURCE_KEYS.filter((k) => r[k] > 0);
    if (!items.length) {
      c.add(addText(this, x, y, t('hex.noIncome'), 'dim'));
      return;
    }
    c.add(addText(this, x, y, head, 'dim'));
    let cx = x + measureText(head) + 5;
    for (const k of items) {
      const v = k === 'recruits' ? `+${Math.round(r[k] * 10) / 10}` : `+${Math.floor(r[k])}`;
      const need = 13 + measureText(v) + 4;
      if (cx + need > x + w) break;
      c.add(addIcon(this, cx, y - 3, RES_ICON[k]));
      c.add(addText(this, cx + 13, y, v, 'good'));
      cx += need;
    }
  }

  // ------------------------------------------------------------------ actions

  private async act<T>(fn: () => Promise<T>): Promise<T | null> {
    if (this.busy) return null;
    this.busy = true;
    try {
      return await fn();
    } catch (e) {
      if (this.sys.isActive()) {
        toast(this, errorText(e), 'bad');
        hapticNotify('error');
      }
      return null;
    } finally {
      this.busy = false;
    }
  }

  private async march(h: number): Promise<void> {
    const r = await this.act(() => this.src.march(h));
    if (!r || !this.sys.isActive()) return;
    haptic('medium');
    toast(this, t('online.onMarch', { n: r.path.length - 1, t: fmtTime(r.arriveAt - this.board.armies.serverTime(Date.now())) }), 'good');
    this.board.armies.ownMarch(r.path, r.at);
    await this.reload().catch((e) => this.fail(e));
  }

  private async halt(): Promise<void> {
    const r = await this.act(() => this.src.stopMarch());
    if (!r) return;
    await this.reload().catch((e) => this.fail(e));
  }

  private async collect(): Promise<void> {
    const r = await this.act(() => this.src.collect());
    if (!r || !this.sys.isActive()) return;
    hapticNotify('success');
    toast(this, t('online.collected', { res: resLine(r.collected, true) }), 'good');
    await this.reload().catch((e) => this.fail(e));
  }

  private async attack(h: number): Promise<void> {
    if (this.demo) {
      toast(this, t('online.preview'));
      return;
    }
    const tk = await this.act(() => onlineApi.attackStart(h));
    if (!tk || !this.sys.isActive()) return;
    this.scene.start('Battle', { source: attackSource(this.game, tk, this.detail?.siege?.label ?? (tk.defenderKind === 'garrison' ? t('online.theGarrison') : t('online.theDefenders'))) });
  }

  // ------------------------------------------------------------------ results

  private closeModal(): void {
    const m = this.modal;
    this.modal = null;
    this.lobbyOpen = false;
    m?.close();
  }

  /** A modal with centred lines of text and a Close button. */
  private infoModal(title: string, lines: string[]): void {
    const { VW } = this.m;
    this.closeModal();
    const w = Math.min(VW - 16, 200);
    const wrapped = lines.flatMap((l) => wrapText(l, w - 20, 3).lines);
    const h = 26 + wrapped.length * LINE_H + 10 + SIZE.btnH + 12;
    const md = openModal(this, { title, w, h, onClose: () => this.modal === md && (this.modal = null) });
    this.modal = md;
    const body = addText(this, VW / 2, md.y + 28, wrapped.join('\n'), 'ink', 0.5);
    body.setCenterAlign();
    md.c.add(body);
    const bw = Math.min(w - 12, 90);
    md.c.add(new Button(this, Math.round((VW - bw) / 2), md.y + md.h - SIZE.btnH - 9, bw, SIZE.btnH, { label: t('common.close'), icon: 'check', variant: 'primary', onClick: () => this.closeModal() }));
  }

  private showAttackResult(r: AttackResult | { error: string }): void {
    if ('error' in r) {
      this.infoModal(t('result.notCounted'), [r.error]);
      return;
    }
    const title = r.captured ? t('result.taken') : r.won ? t('result.victory') : t('result.defeat');
    const out: string[] = [];
    if (r.siege && r.won && !r.captured) out.push(t('result.wave', { wins: r.siege.wins, needed: r.siege.needed }));
    out.push(t('result.slain', { dead: r.defender.dead, total: r.defender.total }));
    out.push(r.plunder.gold ? t('result.goldPlunder', { n: r.gold, p: r.plunder.gold }) : t('result.gold', { n: r.gold }));
    if (r.loot.length) out.push(t('result.loot', { n: r.loot.length }));
    const fallen = r.attacker.heroes.filter((h) => h.died).map((h) => h.name);
    if (fallen.length) out.push(t('result.fallen', { names: fallen.join(', ') }));
    const wounded = r.attacker.heroes.filter((h) => h.wounded).length;
    if (wounded) out.push(t('result.wounded', { n: wounded }));
    const lv = r.attacker.heroes.filter((h) => h.levelsGained > 0).map((h) => h.name);
    if (lv.length) out.push(t('result.levelUp', { names: lv.join(', ') }));
    out.push(t('result.verified'));
    this.infoModal(title, out);
    hapticNotify(r.won ? 'success' : 'error');
  }

  private showDuelResult(o: DuelOutcome): void {
    const opp = o.names[o.side === 0 ? 1 : 0];
    let title = t('duel.over');
    const out: string[] = [];
    if (o.desync) out.push(t('duel.desync'));
    else if (o.aborted && !o.result) out.push(o.aborted === 'opponent_left' || o.aborted === 'left' ? t('duel.left', { name: opp }) : t('duel.cancelled'));
    else if (o.result) {
      title = o.result.winner === o.side ? t('duel.won') : o.result.winner === -1 ? t('duel.drawn') : t('duel.lost');
      out.push(t('duel.vs', { name: opp }), o.result.verified ? t('result.verified') : t('duel.differs'), t('duel.friendly'));
    } else out.push(t('duel.noAnswer'));
    this.infoModal(title, out);
  }

  // ------------------------------------------------------------------ socket: presence, live armies, lobby

  private onSocket(m: ServerMsg): void {
    if (!this.sys.isActive()) return;
    switch (m.type) {
      case 'welcome':
      case 'presence':
      case 'join':
      case 'leave':
        this.duelBadge?.setCount(shardSocket.players.filter((x) => x.id !== shardSocket.me?.id).length);
        if (this.lobbyOpen) this.openLobby();
        return;
      case 'army_march':
      case 'army_pos':
      case 'army_arrive':
      case 'army_hide':
        this.onLiveArmy(m);
        return;
      case 'challenge_sent':
        this.challenge = { id: m.id, to: m.to };
        if (this.lobbyOpen) this.openLobby();
        return;
      case 'challenge_closed':
        if (this.challenge?.id === m.id) {
          this.challenge = null;
          if (m.reason !== 'cancelled') toast(this, t(`duel.closed.${m.reason}`), 'bad');
        }
        if (this.lobbyOpen) this.openLobby();
        return;
      case 'error':
        toast(this, m.message, 'bad');
        return;
      default:
        return;
    }
  }

  /** Another army moved in sight (or yours, from another device): the board animates it. */
  private onLiveArmy(m: LiveArmyMsg): void {
    if (this.view.kind !== 'map' || !this.boardBuilt) return;
    this.board.armies.apply(m, Date.now());
    if (m.player === this.map?.you.id && m.type !== 'army_march') void this.reload().catch(() => undefined);
  }

  /** The lobby players (the demo invents a few). */
  private lobbyPlayers(): PresencePlayer[] {
    if (this.demo) return [{ id: 102, name: 'Brasidas' }, { id: 201, name: 'Kleon', busy: true }, { id: 203, name: 'Myrto' }];
    return shardSocket.players.filter((p) => p.id !== shardSocket.me?.id);
  }

  openLobby(): void {
    const { VW, VH } = this.m;
    this.closeModal();
    const others = this.lobbyPlayers();
    const rows = Math.max(1, others.length);
    const w = Math.min(VW - 16, 200);
    const listH = Math.min(rows * (SIZE.rowH + SIZE.gap), Math.max(SIZE.rowH, VH - 16 - 26 - 18 - SIZE.btnH - 20));
    const noteL = wrapText(t('duel.lobbyNote'), w - 20, 2).lines;
    const h = 26 + listH + 6 + noteL.length * LINE_H + 8 + SIZE.btnH + 10;
    const md = openModal(this, { title: t('duel.lobby'), w, h, onClose: () => {
      if (this.modal === md) this.modal = null;
      this.lobbyOpen = false;
    } });
    this.modal = md;
    this.lobbyOpen = true;
    const connected = this.demo ? true : shardSocket.connected;
    if (!connected || !others.length) {
      const msg = !connected ? t('duel.connecting') : t('duel.nobody');
      const wr = wrapText(msg, w - 20, 2);
      const tx = addText(this, VW / 2, md.y + 30, wr.lines.join('\n'), 'dim', 0.5);
      tx.setCenterAlign();
      md.c.add(tx);
    } else {
      new ScrollList(this, md.c, md.x + 6, md.y + 26, w - 12, listH, {
        count: others.length,
        rowH: SIZE.rowH,
        render: (i, row, rw, rh) => {
          const pl = others[i];
          row.add(addPanel(this, 0, 0, rw, rh, 'inset'));
          const pending = this.challenge?.to.id === pl.id;
          const label = pl.busy ? t('duel.busy') : pending ? t('duel.cancel') : t('duel.challenge');
          const bw = Math.min(rw - 50, Math.max(56, measureText(label) + 14));
          row.add(new Label(this, 6, 9, pl.name, { maxW: rw - bw - 14, expandable: false }));
          const b = new Button(this, rw - bw - 1, 1, bw, SIZE.btnH, {
            label,
            variant: pending ? 'primary' : 'secondary',
            onClick: () => {
              if (this.demo) {
                toast(this, t('online.preview'));
                return;
              }
              if (pending && this.challenge) shardSocket.send({ type: 'challenge_cancel', id: this.challenge.id });
              else shardSocket.send({ type: 'challenge', to: pl.id });
            },
          });
          if (pl.busy) b.setEnabled(false, t('duel.busy'));
          row.add(b);
        },
      });
    }
    const note = addText(this, VW / 2, md.y + 26 + listH + 6, noteL.join('\n'), 'dim', 0.5);
    note.setCenterAlign();
    md.c.add(note);
    const bw = Math.min(w - 12, 90);
    md.c.add(new Button(this, Math.round((VW - bw) / 2), md.y + h - SIZE.btnH - 9, bw, SIZE.btnH, { label: t('common.close'), icon: 'check', onClick: () => this.closeModal() }));
  }

  // ------------------------------------------------------------------ coach marks

  /** What the first-visit coach marks point at. */
  private coachHost(): CoachHost {
    const neighbour = (): number | null => {
      const p = this.profile;
      const m = this.map;
      if (!p || !m) return null;
      const free = m.regions.filter((x) => this.world.adjacent(p.army.loc, x.loc) && x.occupant !== 'none' && x.owner === null);
      return free[0]?.loc ?? null;
    };
    const find = (id: string): Phaser.GameObjects.GameObject | null => {
      let hit: Phaser.GameObjects.GameObject | null = null;
      const walk = (list: Phaser.GameObjects.GameObject[]) => {
        for (const o of list) {
          if (hit) return;
          const any = o as unknown as { __uiId?: string; opts?: { label?: string }; visible?: boolean; list?: Phaser.GameObjects.GameObject[] };
          if (any.visible === false) continue;
          if (any.__uiId === id || any.opts?.label === id) hit = o;
          else if (any.list) walk(any.list);
        }
      };
      walk(this.hud.list);
      return hit;
    };
    return {
      scene: this,
      homeRect: () => (this.map ? hexRect(this, this.map.you.home) : null),
      neighbourRect: () => {
        const n = neighbour();
        return n !== null ? hexRect(this, n) : null;
      },
      mapRect: () => {
        const a = this.mapArea();
        return { x: 0, y: a.top, w: this.m.VW, h: a.bottom - a.top };
      },
      neighbourOpen: () => this.selected !== null && !!this.profile && !!this.detail && this.world.adjacent(this.profile.army.loc, this.selected),
      element: (id: string) => {
        const o = find(id) as (Phaser.GameObjects.GameObject & { w?: number; h?: number; getBounds?: () => Phaser.Geom.Rectangle }) | null;
        if (!o || !o.getBounds) return null;
        const S = this.m.S;
        const b = o.getBounds();
        const zone = o instanceof Phaser.GameObjects.Zone;
        const r = typeof o.w === 'number' && typeof o.h === 'number' && !zone ? worldRect(o as unknown as Phaser.GameObjects.Components.Transform, 0, 0, o.w, o.h) : { x: b.x, y: b.y, w: b.width, h: b.height };
        return { x: Math.round(r.x / S), y: Math.round(r.y / S), w: Math.round(r.w / S), h: Math.round(r.h / S) };
      },
      busy: () => !!this.modal || this.view.kind !== 'map',
    };
  }

  // ------------------------------------------------------------------ camera & input

  private cameraHex(): number | undefined {
    const cam = this.cameras.main;
    return this.board.pick(cam.midPoint.x, cam.midPoint.y) ?? this.profile?.army.loc;
  }

  /** Centre a region in the free map area (between the HUD and the panel). */
  centerOn(h: number, smooth = false): void {
    const cam = this.cameras.main;
    const S = this.m.S;
    const c = this.board.anchor(h);
    const { top, bottom } = this.mapArea();
    const wantY = ((top + bottom) / 2) * S;
    const dy = (this.scale.height / 2 - wantY) / cam.zoom;
    const target = this.clampPoint(c.x, c.y + dy);
    if (smooth) cam.pan(target.x, target.y, 260, 'Sine.easeInOut');
    else cam.centerOn(target.x, target.y);
  }

  /** Pan so a selected hex is not hidden under the panel. */
  private ensureVisible(h: number): void {
    const cam = this.cameras.main;
    const S = this.m.S;
    const c = this.board.anchor(h);
    const sy = (c.y - cam.worldView.y) * cam.zoom;
    const { top, bottom } = this.mapArea();
    if (sy < top * S + 12 || sy > bottom * S - 12) this.centerOn(h, true);
  }

  private clampPoint(x: number, y: number): { x: number; y: number } {
    return clampCenter(x, y, this.board.bounds());
  }

  private clampCamera(): void {
    const cam = this.cameras.main;
    const mid = { x: cam.scrollX + cam.width / 2, y: cam.scrollY + cam.height / 2 };
    const c = this.clampPoint(mid.x, mid.y);
    if (c.x !== mid.x || c.y !== mid.y) cam.centerOn(c.x, c.y);
  }

  /** Zoom keeping the world point under (sx, sy) in place. */
  private zoomAt(f: number, sx: number, sy: number): void {
    if (this.view.kind !== 'map') return;
    const cam = this.cameras.main;
    const lim = zoomLimits(this.m.S);
    const before = cam.getWorldPoint(sx, sy);
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * f, lim.min, lim.max));
    cam.preRender();
    const after = cam.getWorldPoint(sx, sy);
    cam.scrollX += before.x - after.x;
    cam.scrollY += before.y - after.y;
    this.clampCamera();
  }

  private overUi(p: Phaser.Input.Pointer): boolean {
    const { S } = this.m;
    const y = p.y / S;
    if (this.modal) return true;
    const { top, bottom } = this.mapArea();
    return y < top || y > bottom;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.view.kind !== 'map') return;
    const a = this.input.pointer1;
    const b = this.input.pointer2;
    if (a.isDown && b.isDown) {
      this.gesture = null;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const w = this.cameras.main.getWorldPoint(mx, my);
      this.pinch = { d0: Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y), z0: this.cameras.main.zoom, wx: w.x, wy: w.y };
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
      const cam = this.cameras.main;
      const lim = zoomLimits(this.m.S);
      const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
      cam.setZoom(Phaser.Math.Clamp(this.pinch.z0 * (d / Math.max(1, this.pinch.d0)), lim.min, lim.max));
      cam.preRender();
      // keep the pinched point under the fingers' midpoint
      const w = cam.getWorldPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      cam.scrollX += this.pinch.wx - w.x;
      cam.scrollY += this.pinch.wy - w.y;
      this.clampCamera();
      return;
    }
    const g = this.gesture;
    if (!g || g.id !== p.id || !p.isDown) return;
    if (g.mode === 'pending' && Math.abs(p.x - g.sx) + Math.abs(p.y - g.sy) > 10) g.mode = 'pan';
    if (g.mode === 'pan') {
      const cam = this.cameras.main;
      cam.scrollX -= (p.x - g.lx) / cam.zoom;
      cam.scrollY -= (p.y - g.ly) / cam.zoom;
      this.clampCamera();
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
    const h = this.board.pick(w.x, w.y);
    if (h === null || !this.board.known(h)) return this.select(null);
    haptic('light');
    this.select(this.selected === h ? null : h);
  }
}

/** A region's marker on screen (UI px). */
function hexRect(scene: OnlineScene, h: number): { x: number; y: number; w: number; h: number } {
  const cam = scene.cameras.main;
  const S = scene.m.S;
  const c = scene.board.anchor(h);
  const x = ((c.x - cam.worldView.x) * cam.zoom) / S;
  const y = ((c.y - cam.worldView.y) * cam.zoom) / S;
  const w = (20 * cam.zoom) / S;
  const hh = (20 * cam.zoom) / S;
  return { x: Math.round(x - w / 2), y: Math.round(y - hh / 2), w: Math.round(w), h: Math.round(hh) };
}

/** "G+12 F+6 W+4" (only non-zero, localized initials are not needed: icons carry the meaning elsewhere). */
function resLine(r: Resources, plus = true): string {
  const out = RESOURCE_KEYS.filter((k) => r[k] >= (k === 'recruits' ? 0.1 : 1)).map((k) => `${t(`res.${k}` as TKey)} ${plus ? '+' : ''}${k === 'recruits' ? Math.floor(r[k] * 10) / 10 : Math.floor(r[k])}`);
  return out.join(', ') || '0';
}

function encounterLabel(id: string): string {
  return encounterName(id as EncounterId);
}

/** Stops whatever runs and opens the online map (from the battle scene's callbacks). */
export function backToOnline(game: Phaser.Game, data: OnlineSceneData): void {
  for (const sc of game.scene.getScenes(true)) game.scene.stop(sc.scene.key);
  game.scene.start('Online', data);
}

/** The battle scene's source for an attack: submit the order log, then back to the map with the verdict. */
export function attackSource(game: Phaser.Game, tk: AttackTicket, label: string): BattleSource {
  return {
    setup: tk.setup,
    heroes: [...tk.attackers, ...tk.defenders],
    side: 0,
    label: t('battle.vs', { name: label }),
    onFinish(sim: Battle, deployOrders: number) {
      const sub = attackSubmission(sim, deployOrders);
      onlineApi
        .attackSubmit(tk.ticket, sub.orders, sub.deployOrders, sub.claim)
        .then((r) => showReport(game, attackReport(r, this.label), () => backToOnline(game, { focus: tk.region.loc })))
        .catch((e) => backToOnline(game, { attack: { error: errorText(e) }, focus: tk.region.loc }));
    },
    onLeave() {
      // Leaving deployment gives the attack up (no losses; a short cooldown on this hex).
      void onlineApi.attackAbandon(tk.ticket).catch(() => undefined);
      backToOnline(game, { focus: tk.region.loc });
    },
  };
}
