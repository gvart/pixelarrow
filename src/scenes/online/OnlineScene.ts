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
import { RS } from '../../platform/renderScale';
import Phaser from 'phaser';
import { BaseScene } from '../BaseScene';
import { Meter, addIcon, addText, tappable } from '../../ui/kit';
import { ScrollList, firstTimeHint, showTooltip, toast, type Modal } from '../../ui/widgets';
import { COLOR } from '../../ui/theme';
import { MOSAIC, SPACE } from '../../ui/tokens';
import { FRAME_T } from '../../art/mosaicUi';
import { BottomPanel, MButton, MChip, RoundButton, ScreenFrame, TAB_H, TAP, TOPBAR_H, TabBar, TopBar, goTab, mosaicImage, mtext, mw, type Box, type MButtonOpts, type RoundButtonOpts, type TabId } from '../../ui/mosaic';
import { TAB_FRAME_GAP } from '../../ui/mosaic/tabLayout';
import { openSettings } from '../../ui/settings';
import { openWarSheet, SHEET_TITLE_H } from './warSheet';
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
import { ParchmentMapView, clampCenter, snapZoom, zoomLimits, zoomStep, type WorldMapView } from './regionMapView';
import { duelReturn, showChallenge } from '../../ui/duelInvites';
import { t, tOr, type TKey } from '../../i18n';
import { fmtDuration, fmtNum } from '../../util/format';
import { attackReport, duelReport } from '../../online/report';
import { attackSubmission } from '../../online/battle';
import { showReport } from '../ResultsScene';
import { openBossInfo, openLairInfo, raidSource } from './beastPanel';
import { demoCampSource, liveCampSource, openCampPanel } from './campPanel';
import type { CampSceneData } from '../CampScene';
import { campPlotMarkers, type CampPlotMarker } from '../../online/camps';
import { encounterName } from '../../ui/beastInfo';
import type { EncounterId } from '../../data/beasts';
import { OnlineCoach, coachDue, type CoachHost } from '../../ui/tutorial/onlineCoach';
import type { CoachId } from '../../game/tutorial';

/** Layout (UI pixels). */
const SIT_H = 24;
const MARCH_H = 24;
const STATE_BTN_H = 24;
const GAP = 3;
/** Height of a hex panel action button. */
const ACT_H = 24;

/** Least width of an action button: its label at size 6 and the padding (the icon goes first). */
function btnNeed(a: MButtonOpts): number {
  return Math.ceil(mw(a.label.toUpperCase(), a.variant === 'disabled' ? 'rOff' : 'rCream', 6)) + 14;
}

/** Actions in rows of a panel `w` wide: one row when every label fits, else packed greedily in order. */
function packRows(specs: MButtonOpts[], w: number): MButtonOpts[][] {
  const fits = (r: MButtonOpts[]) => r.reduce((sum, a) => sum + btnNeed(a), 0) + GAP * (r.length - 1) <= w;
  if (!specs.length || fits(specs)) return specs.length ? [specs] : [];
  const out: MButtonOpts[][] = [];
  let cur: MButtonOpts[] = [];
  for (const a of specs) {
    if (cur.length && !fits([...cur, a])) {
      out.push(cur);
      cur = [];
    }
    cur.push(a);
  }
  if (cur.length) out.push(cur);
  return out;
}
/** Fonts of the hex panel's lines (on parchment). */
const PANEL_FONT = { ink: 'pInk', dim: 'pSec', red: 'pBad', good: 'pGood' } as const;

type View = { kind: 'loading'; msg: string } | { kind: 'unavailable'; msg: string; detail: string } | { kind: 'join' } | { kind: 'map' };

/** Staged states of the preview map (layout check, screenshots). */
export type PreviewKind = 'map' | 'own' | 'neutral' | 'far' | 'rival' | 'town' | 'lobby' | 'challenge' | 'join' | 'march' | 'result' | 'lair' | 'lairInfo' | 'boss' | 'bossInfo' | 'market' | 'post' | 'camp';

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

const RES_ICON: Record<keyof Resources, string> = { gold: 'wargold', food: 'food', wood: 'wood', bronze: 'bronze', recruits: 'people' };

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
  private frame!: ScreenFrame;
  /** The situation line, the resource chips and the map window of the hub shell, UI px. */
  private sit!: Box;
  private chips!: Box;
  private win!: Box;
  /** Rects of the HUD controls over the map (a tap there is not a map tap). */
  private uiRects: Box[] = [];
  /** The hex whose panel last slid in (a rebuild of the same panel does not slide again). */
  private animatedFor: number | null = null;
  /** The open hex panel has its own Collect (so the map's is left out). */
  private panelCollect = false;
  private chipText: Phaser.GameObjects.BitmapText | null = null;
  private chipTimer: Phaser.Time.TimerEvent | null = null;
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
    this.animatedFor = null;
    this.uiRects = [];
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
    this.demo = this.data0.preview ? demoShard() : null;
    this.src = this.demo ? previewSource(this.demo) : liveSource;
    this.view = { kind: 'loading', msg: t('online.reaching') };
    this.initUi();
    this.screen({ back: () => this.back() });
    this.cameras.main.setBackgroundColor(0x1d1410);
    this.layer = this.add.layer();
    this.board = new ParchmentMapView(this, this.layer, 0);
    this.board.onDiscover = (loc, name) => {
      this.centerOn(loc, true);
      toast(this, t('online.discovered', { name }), 'good', 3000);
    };
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCam.ignore(this.layer);
    this.cameras.main.ignore(this.ui);
    this.buildShell();
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown[], _dx: number, dy: number) => this.zoomAt(zoomStep(this.cameras.main.zoom, dy > 0 ? -1 : 1, zoomLimits(this.m.S)) / this.cameras.main.zoom, p.x, p.y));
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
    this.showCampPlots();
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
    if (k === 'camp') {
      this.select(demo.camp.spots.home);
      this.openCamp(demo.camp.spots.home);
    }
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

  // ------------------------------------------------------------------ shell

  /** The framed page of the war hub: the map window, the top bar with the gear, the HUD layer and the tab bar (War lit). */
  private buildShell(): void {
    const { VW, VH } = this.m;
    const c = { x: FRAME_T, y: FRAME_T + TOPBAR_H, w: VW - FRAME_T * 2, h: VH - TAB_H - TAB_FRAME_GAP - FRAME_T * 2 - TOPBAR_H };
    this.sit = { x: c.x + 2, y: c.y + 2, w: c.w - 4, h: SIT_H };
    this.chips = { x: this.sit.x, y: this.sit.y + this.sit.h + 3, w: this.sit.w, h: TAP };
    const wy = this.chips.y + this.chips.h + 3;
    this.win = { x: c.x + 2, y: wy, w: c.w - 4, h: c.y + c.h - 2 - wy };
    this.frame = new ScreenFrame(this, VW, VH, { tabBar: TAB_H, window: this.win });
    this.ui.add(this.frame);
    this.ui.add(new TopBar(this, this.frame.topBar, { title: 'Pixelarrow', id: 'hub.topbar', actions: [{ icon: 'gear', label: t('menu.settings'), onClick: () => openSettings(this) }] }));
    // the map window's carved edge
    const w = this.win;
    const g = this.add.graphics();
    g.lineStyle(2, MOSAIC.stone0, 1);
    g.strokeRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2);
    g.lineStyle(1, MOSAIC.meanderLo, 0.9);
    g.strokeRect(w.x + 2.5, w.y + 2.5, w.w - 5, w.h - 5);
    this.ui.add(g);
    this.hud = this.add.container(0, 0);
    this.ui.add(this.hud);
    this.ui.add(new TabBar(this, VW, VH, { active: 'war', onSelect: (id) => id !== 'war' && this.openTab(id) }));
  }

  private openTab(id: TabId): void {
    if (!this.demo) shardSocket.close();
    goTab(this, id);
  }

  update(time: number, delta: number): void {
    if (this.view.kind === 'map' && this.boardBuilt) this.board.update(time, delta);
    if (this.coach) {
      this.coach.refresh();
      this.coach.update(time);
    }
  }

  // ------------------------------------------------------------------ render

  private render(): void {
    this.hud.removeAll(true);
    this.panel = null;
    this.panelCollect = false;
    this.chipText = null;
    this.uiRects = [];
    if (this.view.kind !== 'map' || !this.profile || !this.map) {
      this.closeModal();
      this.renderState();
      return;
    }
    this.buildHud();
    if (!this.cameraPlaced) {
      const lim = zoomLimits(this.m.S);
      this.cameras.main.setZoom(lim.start);
      this.centerOn(this.data0.focus ?? this.profile.army.loc);
      this.cameraPlaced = true;
    }
  }

  /** Loading / unavailable / join: a parchment card in the map window of the hub shell. */
  private renderState(): void {
    const win = this.win;
    const H = this.hud;
    H.add(mosaicImage(this, win.x, win.y, win.w, win.h, 'paper'));
    const v = this.view;
    const w = Math.min(win.w - 12, 190);
    const x = Math.round(win.x + (win.w - w) / 2);
    const room = Math.max(2, Math.floor((this.frame.content.h - 12 - 30 - 10 - STATE_BTN_H - 12) / LINE_H));
    let lines: string[] = [];
    let title = t('online.title');
    const buttons: { label: string; icon: string; primary?: boolean; onClick: () => void }[] = [];
    if (v.kind === 'loading') {
      lines = wrapText(v.msg, w - 20, Math.min(3, room)).lines;
      buttons.push({ label: t('common.back'), icon: 'back', onClick: () => this.back() });
    } else if (v.kind === 'unavailable') {
      title = v.msg;
      lines = wrapText(`${v.detail} ${t('online.offlineStill')}`, w - 20, Math.min(6, room)).lines;
      buttons.push({ label: t('online.backToMenu'), icon: 'back', primary: true, onClick: () => this.back() });
    } else if (v.kind === 'join') {
      lines = wrapText(t('online.joinBody'), w - 20, room).lines;
      buttons.push({ label: t('common.back'), icon: 'back', onClick: () => this.back() });
      buttons.push({ label: t('online.join'), icon: 'flag', primary: true, onClick: () => void this.joinSeason() });
    }
    const h = Math.min(this.frame.content.h - 8, 30 + lines.length * LINE_H + 10 + STATE_BTN_H + 12);
    const area = this.frame.content;
    const y = area.y + Math.round((area.h - h) / 2);
    const card = this.add.container(x, y);
    H.add(card);
    card.add(mosaicImage(this, 0, 0, w, h, 'parchment'));
    const box = { owner: card, w, h };
    const size = [9, 8.5, 8, 7.5, 7].find((z) => mw(title, 'rInk', z) <= w - 16) ?? 7;
    card.add(mtext(this, w / 2, 10, title, 'rInk', { size, align: 0.5, maxW: w - 16, box }));
    lines.forEach((l, i) => card.add(mtext(this, w / 2, 30 + i * LINE_H, l, 'pInk', { align: 0.5, maxW: w - 12, box })));
    const bw = buttons.length > 1 ? Math.floor((w - 12 - GAP) / 2) : Math.min(w - 12, 120);
    buttons.forEach((b, i) => {
      const bx = buttons.length > 1 ? 6 + i * (bw + GAP) : Math.round((w - bw) / 2);
      card.add(new MButton(this, bx, h - STATE_BTN_H - 9, bw, STATE_BTN_H, { label: b.label, icon: b.icon, variant: b.primary ? 'primary' : 'secondary', onClick: b.onClick }));
    });
  }

  private buildHud(): void {
    const H = this.hud;
    const p = this.profile!;
    const { sit, chips, win } = this;
    // ---- the situation line: what now, in a sentence
    const energy = Math.floor(p.energy);
    const days = Math.max(0, Math.ceil((p.season.endsAt - p.now) / 86_400_000));
    const pend = p.income.pending;
    const pendSum = RESOURCE_KEYS.reduce((a, k) => a + pend[k], 0);
    let sentence: string;
    if (p.army.marching && p.army.arriveAt) sentence = t('online.sit.marching', { t: fmtDuration(p.army.arriveAt - this.board.armies.serverTime(Date.now())) });
    else if (pendSum >= 1) sentence = t('online.sit.collect');
    else if (energy < ONLINE_RULES.energyPerAttack) sentence = t('online.sit.energy', { n: ONLINE_RULES.energyPerHour });
    else sentence = `${t('online.sit.season', { n: p.season.id, d: days })}. ${t('online.sit.hex')}`;
    // ---- the hex panel first (its own primary wins over Collect); on a short screen it covers the situation line and the chips, which are then left out
    if (this.selected) this.buildPanel();
    if (!(this.panel && this.panelTop < chips.y + chips.h + 1)) {
      H.add(mosaicImage(this, sit.x, sit.y, sit.w, sit.h, 'parchment'));
      const sl = wrapText(sentence, sit.w - 16, 2).lines;
      const sy = sit.y + Math.round((sit.h - sl.length * LINE_H) / 2);
      sl.forEach((l, i) => H.add(mtext(this, sit.x + sit.w / 2, sy + i * LINE_H, l, 'pInk', { align: 0.5, maxW: sit.w - 12 })));
      // ---- the resource chips: war gold, food, wood, bronze, (recruits on a wide screen), energy
      const keys = (this.m.VW >= 200 ? RESOURCE_KEYS : RESOURCE_KEYS.filter((k) => k !== 'recruits')) as (keyof Resources)[];
      const items = keys.map((k) => ({ icon: RES_ICON[k], value: k === 'recruits' ? `${Math.floor(p.resources[k])}` : fmtNum(p.resources[k]), tip: `${t(`res.${k}` as TKey)}: ${Math.floor(p.resources[k])}` }));
      items.push({ icon: 'bolt', value: `${energy}`, tip: t('online.energyTip', { n: energy, max: p.energyMax, rate: ONLINE_RULES.energyPerHour }) });
      const cgap = 2;
      const cw = Math.floor((chips.w - cgap * (items.length - 1)) / items.length);
      items.forEach((it, i) => {
        const chip: MChip = new MChip(this, chips.x + i * (cw + cgap), chips.y, { icon: it.icon, value: it.value, surface: 'stone', w: cw, pad: 4, tip: it.tip, onClick: () => showTooltip(this, it.tip, chip), id: `online.chip.${it.icon}` });
        H.add(chip);
      });
    }
    const bottom = this.panel ? this.panelTop : win.y + win.h;
    // ---- marching bar with Halt
    const marching = p.army.marching && p.army.arriveAt;
    if (marching) {
      const bx = win.x + 2;
      const by = win.y + 2;
      const bw = win.w - 4;
      H.add(mosaicImage(this, bx, by, bw, MARCH_H, 'parchment'));
      this.uiRects.push({ x: bx, y: by, w: bw, h: MARCH_H });
      const hw = Math.max(44, mw(t('online.halt'), 'rCream', 7) + 18);
      H.add(new MButton(this, bx + bw - hw - 2, by + 1, hw, TAP, { label: t('online.halt'), variant: 'secondary', tip: t('online.haltTip'), onClick: () => void this.halt(), id: 'online.halt' }));
      H.add(addIcon(this, bx + 6, by + 7, 'clock'));
      this.chipText = addText(this, bx + 20, by + 8, '', 'pInk');
      H.add(this.chipText);
      const room = bw - hw - 30;
      const upd = () => {
        if (!this.chipText?.scene || !this.profile?.army.arriveAt) return;
        const left = this.profile.army.arriveAt - this.board.armies.serverTime(Date.now());
        const s = t('online.marching', { t: fmtDuration(left) });
        this.chipText.setText(s.length && measureText(s) > room ? fmtDuration(left) : s);
      };
      upd();
      this.chipTimer?.remove();
      this.chipTimer = this.time.addEvent({ delay: 1000, loop: true, callback: upd });
    }
    // ---- the round map buttons at the right edge: Army, Clan, Lobby, Region map
    const online = this.demo ? 3 : shardSocket.players.filter((x) => x.id !== shardSocket.me?.id).length;
    const specs: RoundButtonOpts[] = [
      { icon: 'people', label: t('online.bar.army'), tip: t('online.bar.armyTip'), id: 'online.bar.army', onClick: () => !this.demo && this.scene.start('OnlineArmy', {}) },
      { icon: 'flag', label: t('online.bar.clan'), tip: t('online.bar.clanTip'), id: 'online.bar.clan', onClick: () => !this.demo && this.scene.start('OnlineClan', {}) },
      { icon: 'swords', label: t('war.lobby'), tip: t('online.bar.duelsTip'), id: 'online.bar.duels', badge: online, onClick: () => this.openLobby() },
      { icon: 'map', label: t('war.regionMap'), tip: t('online.centre'), id: 'online.centre', onClick: () => this.centerOn(this.profile!.army.loc, true) },
    ];
    const top = win.y + 4 + (marching ? MARCH_H + 2 : 0);
    const avail = bottom - top - 2;
    let showLabel = true;
    let pitch = RoundButton.size({}).h + GAP;
    let n = Math.min(specs.length, Math.floor((avail + GAP) / pitch));
    if (n < specs.length) {
      showLabel = false;
      pitch = RoundButton.size({ showLabel: false }).h + GAP;
      n = Math.min(specs.length, Math.floor((avail + GAP) / pitch));
    }
    const rw = RoundButton.size({ showLabel }).w;
    specs.slice(0, Math.max(0, n)).forEach((s, i) => {
      const b = new RoundButton(this, win.x + win.w - rw - 2, top + i * pitch, { ...s, showLabel });
      H.add(b);
      this.uiRects.push({ x: b.x, y: b.y, w: b.w, h: b.h });
    });
    // ---- Collect: the primary while income waits (a secondary under an open hex panel, whose own primary wins)
    const collectLabel = t('online.bar.collect');
    const cwid = Math.max(60, mw(collectLabel.toUpperCase(), 'rCream', 7) + 34);
    if (!(this.panel && this.panelCollect) && bottom - win.y >= TAP + 6 + (marching ? MARCH_H : 0)) {
      const cb = new MButton(this, win.x + 4, bottom - TAP - 4, cwid, TAP, {
        label: collectLabel,
        icon: 'wargold',
        variant: pendSum < 1 ? 'disabled' : this.selected ? 'secondary' : 'primary',
        tip: `${t('online.bar.collectTip')}: ${resLine(pend)}`,
        id: 'online.bar.collect',
        disabledReason: pendSum >= 1 ? undefined : t('online.collectNone'),
        onClick: () => void this.collect(),
      });
      H.add(cb);
      this.uiRects.push({ x: cb.x, y: cb.y, w: cb.w, h: cb.h });
    }
    this.coach?.refresh();
  }

  /** Free map area between the march bar and the panel / the window's lower edge, in UI px. */
  private mapArea(): { top: number; bottom: number } {
    const top = this.win.y + (this.profile?.army.marching ? MARCH_H + 2 : 0);
    const bottom = this.panel ? this.panelTop : this.win.y + this.win.h;
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
    const { VW } = this.m;
    const h = this.selected!;
    const d = this.detail;
    const p = this.profile!;
    const map = this.map!;
    const view = d?.region ?? this.board.known(h);
    if (!view) return;
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
      if (d.lair && !d.lair.home && d.lair.returnsAt) rows.push({ text: t('hex.lairBack', { t: fmtDuration(d.lair.returnsAt - Date.now()) }), font: 'dim' });
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
    // a lair or a world boss: its info panel (how it fights, the raid) on one more button
    const beastBtn = !!d && (!!d.lair || !!this.bossAt(h));
    // a town or a trading post: its merchant (docs/DUELS.md "War-map shops on the map")
    const merchantBtn = !!d?.merchant;
    // your camp, or your camp plot to pitch one on (docs/DESIGN_V2.md "Camp")
    const campBtn = !!d && ((!!d.camp && d.camp.owner === map.you.id) || (!!d.campPlot && d.mine && !d.camp));
    // the secondary buttons first, the action (the primary) last, at the right under the thumb
    const specs: MButtonOpts[] = [];
    if (merchantBtn) specs.push({ label: t('hex.act.merchant'), icon: 'amphora', variant: 'secondary', tip: t('hex.merchantTip'), onClick: () => this.openMerchant(h), id: 'online.act.merchant' });
    if (campBtn) specs.push({ label: t('hex.act.camp'), icon: 'tent', variant: 'secondary', tip: t('hex.campTip'), onClick: () => this.openCamp(h), id: 'online.act.camp' });
    if (beastBtn) specs.push({ label: t('hex.act.beast'), icon: 'beast', variant: 'secondary', tip: t('hex.beastTip'), onClick: () => this.openBeast(h), id: 'online.act.beast' });
    for (const a of acts) {
      const spec = this.actSpec(a, h);
      specs.push({
        label: spec.label,
        icon: spec.icon,
        variant: !a.enabled ? 'disabled' : a.primary ? 'primary' : 'secondary',
        tip: spec.tip,
        onClick: spec.onClick,
        disabledReason: a.reason ? t(`hex.why.${a.reason}` as TKey, a.params) : undefined,
        id: `online.act.${a.id}`,
      });
    }
    const rowH = LINE_H;
    // the info rows sit in one tap area (full text on long-press)
    // the action rows: all in one row when the labels fit, else packed row by row (a label is never cut)
    const inner = VW - FRAME_T * 2 + 2 - SPACE.md * 2;
    const arows = packRows(specs, inner);
    const actH = arows.length ? arows.length * (ACT_H + GAP) - GAP + 3 : 0;
    // (on a short screen the lines that do not fit are left out; the long-press text has them all)
    let linesH = Math.max(TAP + 2, rows.length * rowH + 2);
    const make = (lh: number) =>
      new BottomPanel(this, VW, this.frame.rect.y + this.frame.rect.h, {
        title: t('hex.title', { name: this.hexName(view), tier: view.tier }),
        bodyH: lh + actH,
        animate: this.animatedFor !== h,
        // (the panel slides away on close: the hub rebuilds after that call, not inside it)
        onClose: () => void this.time.delayedCall(0, () => this.selected === h && this.select(null)),
        id: 'online.panel',
      });
    let panel = make(linesH);
    const maxH = this.frame.content.h - 2;
    if (panel.h > maxH) {
      const over = panel.h - maxH;
      panel.destroy();
      linesH = Math.max(TAP + 2, linesH - Math.ceil(over / rowH) * rowH);
      panel = make(linesH);
    }
    const shown = Math.max(1, Math.floor((linesH - 2) / rowH));
    this.animatedFor = h;
    this.hud.add(panel);
    this.panel = panel;
    this.panelTop = panel.y;
    this.panelCollect = acts.some((a) => a.id === 'collect');
    arows.forEach((row, ri) => {
      const need = row.map((a) => btnNeed(a));
      const extra = Math.floor((inner - need.reduce((x, y) => x + y, 0) - GAP * (row.length - 1)) / row.length);
      let bx = SPACE.md;
      row.forEach((a, i) => {
        const last = i === row.length - 1;
        const bw = last ? panel.w - SPACE.md - bx : need[i] + extra;
        panel.add(new MButton(this, bx, panel.area.y + linesH + 3 + ri * (ACT_H + GAP), bw, ACT_H, a));
        bx += bw + GAP;
      });
    });
    const A = panel.area;
    let y = A.y + 1;
    for (const r of rows.slice(0, shown)) {
      if (r.kind === 'yields' && d) this.yieldsRow(panel, A.x, y, A.w, d.yields);
      else if (r.kind === 'siege' && d?.siege) {
        const txt = mtext(this, A.x, y, r.text, PANEL_FONT[r.font], { maxW: A.w });
        panel.add(txt);
        const mw0 = Math.min(60, A.w - txt.width - 8);
        if (mw0 > 12) panel.add(new Meter(this, A.x + txt.width + 5, y + 1, mw0, 5, COLOR.xp).setValue(d.siege.wins, d.siege.needed));
      } else panel.add(mtext(this, A.x, y, r.text, PANEL_FONT[r.font], { maxW: A.w, box: { owner: panel, w: panel.w, h: panel.h } }));
      y += rowH;
    }
    const full = [`${this.hexName(view)} · ${view.tier}`, ...rows.map((r) => (r.kind === 'yields' && d ? `${t('hex.perHour')}: ${resLine(d.yields, true)}` : r.text))].join('\n');
    const zone = this.add.zone(A.x - 2, A.y + 2, A.w + 4, linesH - 2).setOrigin(0, 0).setInteractive();
    uiId(zone, 'online.hexInfo');
    tappable(zone, null, () => showTooltip(this, full, { x: panel.x + A.x, y: panel.y + A.y + 2, w: A.w, h: linesH - 2 }), full);
    panel.addAt(zone, 1);
  }

  /** The camp panel of your camp (or camp plot) in a region. */
  openCamp(h: number): void {
    this.closeModal();
    const info = this.world.has(h) ? this.world.info(h) : null;
    const heroes = this.profile?.heroes ?? [];
    const demo = this.demo;
    const data: CampSceneData = {
      mode: 'online',
      loc: h,
      name: info?.name ?? `#${h}`,
      coast: !!info?.coast,
      source: demo ? demoCampSource(demo) : liveCampSource,
      demo: !!demo,
      heroes,
      setReserve: async (flags) => {
        if (demo) return;
        await onlineApi.army({}, undefined, flags);
      },
      back: { scene: 'Online', data: { focus: h, select: true, preview: demo ? 'map' : undefined } },
    };
    this.scene.start('Camp', data);
  }

  /** The old scroll panel of a camp (kept for the hex panel's quick look). */
  openCampPanel(h: number): void {
    this.closeModal();
    this.modal = openCampPanel(this, {
      loc: h,
      name: this.world.has(h) ? this.world.info(h).name : `#${h}`,
      source: this.demo ? demoCampSource(this.demo) : liveCampSource,
      onChange: (v) => {
        if (this.profile) this.profile.resources = v.resources;
        void this.reload().catch(() => undefined);
      },
      onClose: () => {
        this.modal = null;
      },
    });
  }

  /** Camps and camp plots in sight to the map renderer (when it draws them). */
  private showCampPlots(): void {
    const map = this.map;
    if (!map) return;
    const view = this.board as WorldMapView & { setCampPlots?: (plots: CampPlotMarker[]) => void };
    if (typeof view.setCampPlots !== 'function') return;
    const forward = (map.camps ?? []).filter((c) => c.owner === map.you.id && !c.home).length;
    view.setCampPlots(campPlotMarkers(this.world, map.regions, map.camps ?? [], map.you.id, forward));
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
      returnsIn: !lair.home && lair.returnsAt ? fmtDuration(lair.returnsAt - Date.now()) : undefined,
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
          label: pl ? t('hex.act.marchEta', { t: fmtDuration(pl.minutes * 60_000) }) : t('hex.act.march'),
          icon: 'advance',
          tip: pl ? t('hex.marchTip', { t: fmtDuration(pl.minutes * 60_000), e: pl.energy }) : undefined,
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
  private yieldsRow(c: BottomPanel, x: number, y: number, w: number, r: Resources): void {
    const box = { owner: c, w: c.w, h: c.h };
    const head = t('hex.perHour');
    const items = RESOURCE_KEYS.filter((k) => r[k] > 0);
    if (!items.length) {
      c.add(mtext(this, x, y, t('hex.noIncome'), 'pSec', { maxW: w, box }));
      return;
    }
    c.add(mtext(this, x, y, head, 'pSec', { box }));
    let cx = x + mw(head, 'pSec') + 5;
    for (const k of items) {
      const v = k === 'recruits' ? `+${Math.round(r[k] * 10) / 10}` : `+${Math.floor(r[k])}`;
      const need = 13 + mw(v, 'pGood') + 4;
      if (cx + need > x + w) break;
      c.add(addIcon(this, cx, y - 3, RES_ICON[k]));
      c.add(mtext(this, cx + 13, y, v, 'pGood', { box }));
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
    toast(this, t('online.onMarch', { n: r.path.length - 1, t: fmtDuration(r.arriveAt - this.board.armies.serverTime(Date.now())) }), 'good');
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

  /** A parchment sheet with centred lines of text and a Close button. */
  private infoModal(title: string, lines: string[]): void {
    const { VW } = this.m;
    this.closeModal();
    const w = Math.min(VW - 16, 200);
    const wrapped = lines.flatMap((l) => wrapText(l, w - 28, 3).lines);
    const h = SHEET_TITLE_H + 6 + wrapped.length * LINE_H + 10 + TAP + 10;
    const md = openWarSheet(this, { title, w, h, onClose: () => this.modal === md && (this.modal = null) });
    this.modal = md;
    wrapped.forEach((l, i) => md.c.add(mtext(this, VW / 2, md.body.y + 2 + i * LINE_H, l, 'pInk', { align: 0.5, maxW: md.body.w })));
    const bw = Math.min(md.body.w, 100);
    md.c.add(new MButton(this, Math.round((VW - bw) / 2), md.y + md.h - TAP - 10, bw, TAP, { label: t('common.close'), icon: 'check', variant: 'primary', onClick: () => this.closeModal() }));
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
    const rowH = TAP + 4;
    const noteL = wrapText(t('duel.lobbyNote'), w - 28, 3).lines;
    const listH = Math.min(rows * (rowH + GAP), Math.max(rowH, VH - 16 - SHEET_TITLE_H - 18 - TAP - 30 - noteL.length * LINE_H));
    const h = SHEET_TITLE_H + 4 + listH + 6 + noteL.length * LINE_H + 8 + TAP + 10;
    const md = openWarSheet(this, { title: t('duel.lobby'), w, h, onClose: () => {
      if (this.modal === md) this.modal = null;
      this.lobbyOpen = false;
    } });
    this.modal = md;
    this.lobbyOpen = true;
    const connected = this.demo ? true : shardSocket.connected;
    if (!connected || !others.length) {
      const msg = !connected ? t('duel.connecting') : t('duel.nobody');
      wrapText(msg, w - 28, 2).lines.forEach((l, i) => md.c.add(mtext(this, VW / 2, md.body.y + 8 + i * LINE_H, l, 'pSec', { align: 0.5, maxW: md.body.w })));
    } else {
      new ScrollList(this, md.c, md.body.x, md.body.y, md.body.w, listH, {
        count: others.length,
        rowH,
        render: (i, row, rw, rh) => {
          const pl = others[i];
          row.add(mosaicImage(this, 0, 0, rw, rh, 'parchment'));
          const pending = this.challenge?.to.id === pl.id;
          const label = pl.busy ? t('duel.busy') : pending ? t('duel.cancel') : t('duel.challenge');
          const bw = Math.min(rw - 50, Math.max(60, mw(label.toUpperCase(), 'rCream', 7) + 18));
          row.add(mtext(this, 7, Math.round((rh - LINE_H) / 2), pl.name, 'pInk', { maxW: rw - bw - 18 }));
          const b = new MButton(this, rw - bw - 2, Math.round((rh - TAP) / 2), bw, TAP, {
            label,
            variant: pl.busy ? 'disabled' : pending ? 'primary' : 'secondary',
            disabledReason: pl.busy ? t('duel.busy') : undefined,
            onClick: () => {
              if (this.demo) {
                toast(this, t('online.preview'));
                return;
              }
              if (pending && this.challenge) shardSocket.send({ type: 'challenge_cancel', id: this.challenge.id });
              else shardSocket.send({ type: 'challenge', to: pl.id });
            },
          });
          row.add(b);
        },
      });
    }
    noteL.forEach((l, i) => md.c.add(mtext(this, VW / 2, md.body.y + listH + 6 + i * LINE_H, l, 'pSec', { align: 0.5, maxW: md.body.w })));
    const bw = Math.min(md.body.w, 100);
    md.c.add(new MButton(this, Math.round((VW - bw) / 2), md.y + h - TAP - 10, bw, TAP, { label: t('common.close'), icon: 'check', variant: 'secondary', onClick: () => this.closeModal() }));
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
      showNeighbour: () => {
        const n = neighbour();
        if (n === null) return false;
        const r = hexRect(this, n);
        const { top, bottom } = this.mapArea();
        if (r.x < 4 || r.x + r.w > this.m.VW - 4 || r.y < top + 4 || r.y + r.h > bottom - 4) this.centerOn(n);
        return true;
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
    if (this.modal) return true;
    const { S } = this.m;
    const x = p.x / S;
    const y = p.y / S;
    const { top, bottom } = this.mapArea();
    const win = this.win;
    if (y < top || y > bottom || x < win.x || x > win.x + win.w) return true;
    return this.uiRects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
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
    if (g.mode === 'pending' && Math.abs(p.x - g.sx) + Math.abs(p.y - g.sy) > 10 * RS) g.mode = 'pan';
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
      if (!this.input.pointer1.isDown || !this.input.pointer2.isDown) {
        this.pinch = null;
        // settle on a pixel-clean zoom (nearest-neighbour, integer texel sizes)
        const cam = this.cameras.main;
        const z = snapZoom(cam.zoom, zoomLimits(this.m.S));
        if (z !== cam.zoom) this.zoomAt(z / cam.zoom, p.x, p.y);
      }
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
