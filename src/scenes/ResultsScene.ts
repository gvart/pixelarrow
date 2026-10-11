/**
 * The post-battle report (docs/DESIGN_V2.md "Post-battle report"), the same
 * screen for offline battles, verified online attacks and live duels:
 *  - an animated VICTORY / DEFEAT banner;
 *  - Summary: count-up tiles (time, kills, losses, gold, XP) and the hero of
 *    the battle (MVP) with portrait, kills and damage;
 *  - Heroes: a row per hero with an XP bar that fills (level-ups flash), and
 *    wounds and deaths;
 *  - Spoils: loot cards turning over one by one with their rarity glow; tap a
 *    card to inspect and compare it, then pick.
 * The model is src/game/report.ts. Start with scene.start('Results') after an
 * offline battle (state.last), or with { report, done } for online battles.
 *
 * v5 (RES-01, design/ux/screens-campaign.md C-10): the why line under the
 * banner, painted laurels, losses that count the dead, the knocked out and
 * the fled, no "Hero of the battle" without a kill, notes as chips, a Back
 * that never takes the spoils unseen, the chest empty state, the lair hoard
 * header, the practice fight without a Spoils tab, and the arc's Victory
 * variant (campaign-arc.md R5.4). The rules are in src/ui/results/model.ts.
 */
import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { ScrollArea, addIcon, addText, tappable, Button } from '../ui/kit';
import { ItemIcon, Label, ScrollList, StatBar, addScrollHint, openModal, showTooltip, toast, subjectName } from '../ui/widgets';
import { uiFrame, uiId } from '../ui/layout';
import { ellipsize, wrapText } from '../ui/textfit';
import { MOSAIC, RARITY_INK } from '../ui/tokens';
import { GAP, addParchmentEmpty, MButton, ScreenFrame, SegmentedSwitch, SWITCH_H, mosaicImage, mtext, mw, rarityInk, type Box } from '../ui/mosaic';
import { TEXT_MIN, lineHeight } from '../ui/tokens';
import { ResultTile } from '../ui/results/tile';
import { addNoteChip } from '../ui/results/chips';
import { buildArcVictory } from '../ui/results/arcVictory';
import { CHEST_EMPTY_KEY, LAUREL_KEY, addCutout, cutoutW, preloadResultsArt } from '../ui/results/art';
import { arcPiece, backAction, companyRoll, isArcVictory, noteChips, pagesFor, spoilSections, vsName, type ResultsPage } from '../ui/results/model';
import { bandName } from './WorldScene';
import { COLOR, RARITY_COLOR, RARITY_GLOW, SIZE } from '../ui/theme';
import { addPortrait } from '../ui/sprites';
import { dollFromHero } from '../art/paperdoll';
import { P } from '../art/palette';
import { state } from '../state';
import { itemDef, itemMods, normalizeRarity, rarityRank, type Item, type StatMods } from '../data/items';
import { xpToNext, MAX_LEVEL, type Hero } from '../data/units';
import { takeLoot } from '../game/loot';
import { practiceOf, type Practice } from '../game/campaignBattle';
import { fmtClock } from '../util/format';
import { buildReport, lastBattle, whyLine, WHY_MAX_LINES, type BattleReport, type HeroLine, type UnitStat, type WhyPart } from '../game/report';
import { TICK_RATE } from '../sim/battle';
import { isCaptain } from '../sim/stats';
import { heroClass } from '../sim/stats';
import type { LastBattle } from '../state';
import { haptic, hapticNotify } from '../platform/telegram';
import { uiCoin, uiLevelUp } from '../audio/hooks';
import { sfx } from '../audio';
import { t, tOr, type TKey } from '../i18n';

export interface ResultsData {
  /** Online battles bring their own report... */
  report?: BattleReport;
  /** ...and where to go afterwards. */
  done?: () => void;
}

type Page = ResultsPage;

/** Compare bars: sensible maxima, and the stats where less is better. */
const STAT_MAX: Partial<Record<keyof StatMods, number>> = {
  dmg: 15, reach: 2.5, atkTime: 2, rangedDmg: 10, range: 15, ammo: 30, shotTime: 3, accuracy: 0.3, block: 0.6, blockPierce: 0.3,
  armor: 10, morale: 20, stamina: 30, hp: 30, speed: 0.3, chargeBonus: 1, armorPierce: 0.5, moraleShock: 1, xpBonus: 0.5,
};
const LOWER_BETTER = new Set<keyof StatMods>(['atkTime', 'shotTime']);
const PERCENT = new Set<keyof StatMods>(['accuracy', 'block', 'blockPierce', 'speed', 'chargeBonus', 'armorPierce', 'moraleShock', 'xpBonus']);

export class ResultsScene extends BaseScene {
  /** Picked loot (uids). */
  chosen = new Set<string>();
  private report!: BattleReport;
  private done: (() => void) | null = null;
  /** finish() ran for this report: a second Continue / Back must not leave twice (an online report would land in the campaign's Army). */
  private left = false;
  private page: Page = 'summary';
  private pageLayer: Phaser.GameObjects.Container | null = null;
  private pageArea: ScrollArea | null = null;
  private heroList: ScrollList | null = null;
  private tabs: SegmentedSwitch | null = null;
  private primary: MButton | null = null;
  /** The framed content area (inside the stone band). */
  private box!: Box;
  private counter: Phaser.GameObjects.BitmapText | null = null;
  private seen = new Set<Page>();
  /** Loot cards already turned over, and the cards on show. */
  private revealed = new Set<number>();
  private lootCards: { i: number; c: Phaser.GameObjects.Container; w: number; h: number }[] = [];
  /** Count-ups of the page on show (stopped when the page goes). */
  private pageTweens: Phaser.Tweens.Tween[] = [];
  private revealTimer: Phaser.Time.TimerEvent | null = null;
  /** XP bar animation: cumulative XP shown per hero, and the rows on show. */
  private xpShown = new Map<string, number>();
  private xpRows = new Map<string, { g: Phaser.GameObjects.Graphics; x: number; w: number; lv: Phaser.GameObjects.BitmapText; line: HeroLine; flash: number }>();
  private xpStart = 0;
  private popped = new Set<string>();
  private confetti: { r: Phaser.GameObjects.Rectangle; x: number; y: number; vx: number; vy: number; life: number }[] = [];
  private top = 0;
  private bottom = 0;
  /** A Trial fight (Practice): no spoils, and Continue returns to the beast's sheet. */
  private practice: Practice | undefined;
  /** The arc's Victory variant is on show (campaign-arc.md R5.4); Continue the campaign closes it. */
  arcOpen = false;
  /** Pieces of a lair's hoard at the head of the loot (campaign-arc.md R6). */
  private hoard = 0;
  /** Back said what was taken and the screen is about to go. */
  private leaving = false;
  /** Height of the "vs name" line under the banner. */
  private subH = 10;

  constructor() {
    super('Results');
  }

  preload(): void {
    preloadResultsArt(this);
  }

  create(data: ResultsData = {}): void {
    this.initUi();
    this.done = data.done ?? null;
    const last: LastBattle | null = data.report ? null : state.last;
    this.practice = practiceOf(last);
    this.hoard = last?.hoard ?? 0;
    this.left = false;
    this.leaving = false;
    this.pageLayer = null;
    this.pageArea = null;
    this.heroList = null;
    this.tabs = null;
    this.counter = null;
    this.lootCards = [];
    this.pageTweens = [];
    this.revealTimer = null;
    this.xpRows = new Map();
    this.confetti = [];
    const report = data.report ?? this.offlineReport();
    if (!report) {
      this.scene.start('Army', {});
      return;
    }
    const fresh = this.report !== report;
    this.report = report;
    if (fresh) {
      this.chosen = new Set(this.chosen);
      this.seen = new Set();
      this.revealed = new Set();
      this.xpShown = new Map();
      this.popped = new Set();
      this.page = 'summary';
    }
    // the host beaten: its Victory screen first, until Continue the campaign (AR-04: 'won', then continueArc)
    this.arcOpen = last?.partyId !== undefined && isArcVictory(state.campaign.world.s.arc.stage, report.result);
    const { VW, VH } = this.m;
    // a full-screen sheet: the framed page, no top bar, no tab bar
    const frame = new ScreenFrame(this, VW, VH, { topBar: false });
    this.ui.add(frame);
    this.box = frame.content;
    this.screen({ back: () => this.back() });

    const bannerH = VH < 300 ? 30 : VH < 380 ? 38 : 46;
    this.buildBanner(bannerH);
    const x0 = this.box.x + 4;
    const W = this.box.w - 8;
    let ty = this.box.y + 4 + bannerH + 4 + this.subH + 4;
    // why it went this way (battle-readability.md R5): under the banner, wrapped, never cut
    const why = this.arcOpen ? '' : this.whyText(data.report !== undefined);
    if (why) {
      const line = new Label(this, this.box.x + this.box.w / 2, ty - 2, why, { maxW: W - 4, maxLines: WHY_MAX_LINES, font: 'pInk', align: 0.5 });
      uiId(line, 'results.why');
      this.ui.add(line);
      ty += line.h + 4;
    }
    // Reopened after the app closed mid-battle: the battle was fought out (V5-011).
    // In the layout under the banner, not a toast over it (it covered the header).
    if (!data.report && state.notice === 'battle.abandoned') {
      const note = new Label(this, this.box.x + this.box.w / 2, ty - 2, t('battle.abandoned'), { maxW: W - 4, maxLines: 4, font: 'pSec', align: 0.5 });
      uiId(note, 'results.abandoned');
      this.ui.add(note);
      ty += note.h + 4;
      state.notice = null;
    }
    const BTN_H = 28;
    this.bottom = this.box.y + this.box.h - 4 - BTN_H - 5;
    if (this.arcOpen) {
      this.top = ty;
      this.pageLayer = this.add.container(0, 0);
      this.ui.add(this.pageLayer);
      this.buildArc();
      this.primary = new MButton(this, x0, this.box.y + this.box.h - 4 - BTN_H, W, BTN_H, { label: t('results.arc.continue'), icon: 'flag', variant: 'primaryHero', id: 'results.primary', onClick: () => this.closeArc() });
      this.ui.add(this.primary);
    } else {
      const pages = pagesFor(!!this.practice);
      if (!pages.includes(this.page)) this.page = 'summary';
      this.tabs = new SegmentedSwitch(this, x0, ty, W, {
        options: pages.map((p) => ({ id: p, label: t(`results.tab.${p}` as TKey), icon: W >= 156 ? (p === 'summary' ? 'trophy' : p === 'heroes' ? 'people' : 'chest') : undefined })),
        selected: this.page,
        id: 'results.tab',
        onChange: (id) => this.showPage(id as Page),
      });
      this.ui.add(this.tabs);
      this.top = ty + SWITCH_H + 5;
      this.primary = new MButton(this, x0, this.box.y + this.box.h - 4 - BTN_H, W, BTN_H, { label: t('results.continue'), icon: 'check', variant: 'primaryHero', id: 'results.primary', onClick: () => this.onPrimary() });
      this.ui.add(this.primary);
      this.showPage(this.page);
    }
    if (fresh) {
      if (report.gold > 0) this.time.delayedCall(700, uiCoin);
      hapticNotify(report.result === 'victory' ? 'success' : report.result === 'draw' ? 'warning' : 'error');
    }
  }

  /** The arc's Victory variant (campaign-arc.md R5.4): the company roll and the set piece. */
  private buildArc(): void {
    const { area, w } = this.pageScroll();
    const roll = companyRoll(this.report);
    const piece = arcPiece(this.report.loot);
    const h = buildArcVictory(this, area.content, area, w, { ...roll, piece, onPiece: () => this.inspect(0) });
    area.setContentHeight(h);
  }

  /** Continue the campaign: the post-game begins ('won' becomes 'post') and the normal report follows, on its Spoils. */
  closeArc(): void {
    if (!this.arcOpen) return;
    this.arcOpen = false;
    state.campaign.continueArc();
    void state.save();
    this.page = this.report.loot.length > 0 ? 'spoils' : 'summary';
    this.scene.restart({});
  }

  /** System Back: never takes the spoils unseen (audit RES-6, NAV N8). */
  back(): void {
    if (this.leaving || this.left) return;
    if (this.arcOpen) return this.closeArc();
    if (backAction({ page: this.page, loot: this.report.loot.length, seenSpoils: this.seen.has('spoils') }) === 'spoils') return this.showPage('spoils');
    // on the Spoils: Onward, saying what was taken
    if (this.done || this.report.picks <= 0) return this.finish();
    this.leaving = true;
    const n = this.chosen.size;
    toast(this, n > 0 ? t('results.taken', { n }) : t('results.leftBehind'), n > 0 ? 'good' : 'info', 900);
    this.time.delayedCall(700, () => this.finish());
  }

  /**
   * The why-line text. An online report is built away from the scene that
   * fought it, so it gets the line here from that battle's log (same length
   * in seconds); otherwise the report's own line (a defeat's fallback at least).
   */
  private whyText(online: boolean): string {
    const r = this.report;
    let parts: WhyPart[] = r.why ?? [];
    const log = lastBattle.log;
    if (online && log && Math.round(log.ticks / TICK_RATE) === r.duration) parts = whyLine(log, lastBattle.side, r.result, { enemyRetreated: r.enemyRetreated });
    return parts.map((p) => t(p.key as TKey, p.params)).join(' ');
  }

  /** The offline battle that just ended (state.last), as a report. */
  private offlineReport(): BattleReport | null {
    const last = state.last;
    if (!last) return null;
    const o = last.outcome;
    const camp = state.campaign;
    const heroes: Hero[] = last.before ?? [...camp.data.heroes, ...last.fallen];
    let stats: UnitStat[] | undefined = last.stats;
    if (!stats) {
      // an old save's last battle: rebuild what the outcome knows
      stats = o.heroes.map((h) => ({ heroId: h.heroId, side: 0, kills: h.kills, dmg: 0, dead: h.died || !!h.wounded, ko: !!h.wounded, killedBy: h.died ? 1 : -1 }) as UnitStat);
      for (let i = 0; i < o.enemyTotal; i++) stats.push({ heroId: `foe${i}`, side: 1, kills: 0, dmg: 0, dead: i < o.enemyKilled, ko: false, killedBy: i < o.enemyKilled ? 0 : -1 });
    }
    const cache = this.report && (this.report as BattleReport & { src?: unknown }).src === last ? this.report : null;
    if (cache) return cache;
    const r = buildReport({
      result: o.retreated ? 'retreat' : o.victory ? 'victory' : o.draw ? 'draw' : 'defeat',
      vs: t('battle.vs', { name: vsName(last, bandName) }),
      ticks: last.ticks ?? 0,
      side: 0,
      stats,
      heroes,
      outcomes: o.heroes,
      gold: o.gold,
      loot: o.loot,
      picks: o.picks,
      // this battle's log, if the battle just ended in this session (not a report reopened from a save)
      log: lastBattle.log && lastBattle.log.ticks === last.ticks ? lastBattle.log : null,
      captains: last.enemy.heroes.filter(isCaptain).map((h) => h.id),
      // the captain's bounty, already in the gold (settleBattle carries it, ai-doctrines.md R6.4)
      bounty: last.bounty ?? 0,
    });
    (r as BattleReport & { src?: unknown }).src = last;
    return r;
  }

  // ------------------------------------------------------------------ banner

  private buildBanner(h: number): void {
    const r = this.report;
    const cx = this.box.x + this.box.w / 2;
    const cy = this.box.y + 4 + h / 2;
    const c = this.add.container(cx, cy);
    this.ui.add(c);
    const w = Math.min(this.box.w - 8, 220);
    const win = r.result === 'victory';
    // a victory: a teal plaque between two gilded laurel branches; anything else on grey stone (terracotta stays for the next action)
    c.add(mosaicImage(this, -w / 2, -h / 2, w, h, win ? 'plaque' : 'tileOff'));
    // painted laurel branches inside the plaque's ends (AS-05, audit RES-2); dimmed when the day was lost
    const lh = Math.min(36, h - 6);
    const lw = cutoutW(LAUREL_KEY, lh);
    const left = addCutout(this, LAUREL_KEY, -w / 2 + 5, -lh / 2, lh);
    const right = addCutout(this, LAUREL_KEY, w / 2 - 5 - lw, -lh / 2, lh);
    if (left && right) c.add([left.setAlpha(win ? 1 : 0.45), right.setFlipX(true).setAlpha(win ? 1 : 0.45)]);
    const room = w - 2 * (lw + 8);
    const word = t(`results.${r.result}` as TKey).toUpperCase();
    const size = [13, 12, 11, 10, 9, 8].find((z) => mw(word, 'rCream', z) <= room) ?? 8;
    c.add(uiFrame(mtext(this, 0, Math.round(-(size * 11) / 14 - 1), word, 'rCream', { size, align: 0.5, maxW: room }), c, w, h, -w / 2, -h / 2));
    // "vs name · verified · Practice: no spoils": wrapped, never cut (G14)
    const sub: string[] = [r.vs];
    if (r.verified !== null) sub.push(t(r.verified ? 'results.verified' : 'results.unverified'));
    if (this.practice) sub.push(t('results.practice'));
    const subLine = mtext(this, cx, this.box.y + 4 + h + 4, sub.join(' · '), 'pSec', { size: TEXT_MIN, align: 0.5, maxW: this.box.w - 12, wrap: true, box: { owner: this.ui, w: this.m.VW, h: this.m.VH } });
    subLine.setCenterAlign();
    uiId(subLine, 'results.vs');
    this.ui.add(subLine);
    this.subH = Math.ceil(subLine.text.split('\n').length * lineHeight(TEXT_MIN));
    if (!this.seen.has('summary')) {
      // drop in, bounce, then a shine sweeps across
      c.setScale(0.3).setAlpha(0);
      this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 420, ease: 'Back.easeOut' });
      const shine = this.add.rectangle(-w / 2, 0, 6, h - 6, 0xffffff, 0.35).setOrigin(0.5);
      c.add(shine);
      this.tweens.add({ targets: shine, x: w / 2, duration: 700, delay: 450, ease: 'Sine.easeInOut', onComplete: () => shine.destroy() });
      if (win) this.time.delayedCall(420, () => this.burst(cx, cy, w, [P.gold, 0xfff0a0, P.cream], 40));
      else if (r.result === 'defeat') this.time.delayedCall(420, () => this.tweens.add({ targets: c, x: cx + 2, duration: 40, yoyo: true, repeat: 3 }));
      sfx.play(win ? 'coin' : 'warning');
    }
  }

  private burst(x: number, y: number, w: number, colors: number[], n: number): void {
    for (let i = 0; i < n && this.confetti.length < 160; i++) {
      const r = this.add.rectangle(0, 0, i % 3 ? 1 : 2, i % 4 ? 1 : 2, colors[i % colors.length]).setOrigin(0, 0);
      this.ui.add(r);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const v = 30 + Math.random() * 50;
      this.confetti.push({ r, x: x + (Math.random() - 0.5) * w, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.9 + Math.random() * 0.9 });
    }
  }

  // ------------------------------------------------------------------ pages

  private clearPage(): void {
    for (const tw of this.pageTweens) tw.stop();
    this.pageTweens = [];
    this.revealTimer?.remove();
    this.revealTimer = null;
    this.heroList?.destroy();
    this.heroList = null;
    this.pageArea?.destroy();
    this.pageArea = null;
    this.pageLayer?.destroy();
    this.pageLayer = null;
    this.lootCards = [];
    this.xpRows.clear();
    this.counter = null;
  }

  showPage(p: Page): void {
    this.clearPage();
    this.page = p;
    this.tabs?.pick(p, false);
    const first = !this.seen.has(p);
    this.seen.add(p);
    this.pageLayer = this.add.container(0, 0);
    this.ui.add(this.pageLayer);
    if (this.primary) this.ui.bringToTop(this.primary);
    if (p === 'summary') this.buildSummary(first);
    else if (p === 'heroes') this.buildHeroes(first);
    else this.buildSpoils();
    this.updatePrimary();
  }

  private updatePrimary(): void {
    const r = this.report;
    const b = this.primary;
    if (!b) return;
    if (this.page !== 'spoils' && r.loot.length > 0 && !this.seen.has('spoils')) {
      b.setLabel(t('results.toSpoils')).setIcon('chest');
    } else if (r.picks > 0) {
      b.setLabel(`${t('results.take')} ${this.chosen.size}/${r.picks}`).setIcon('check');
    } else b.setLabel(t('results.continue')).setIcon('check');
  }

  private onPrimary(): void {
    if (this.page !== 'spoils' && this.report.loot.length > 0 && !this.seen.has('spoils')) this.showPage('spoils');
    else this.finish();
  }

  /** A scrolling page between the tabs and the bottom button. */
  private pageScroll(): { area: ScrollArea; x: number; w: number } {
    const { S } = this.m;
    const area = new ScrollArea(this, this.pageLayer!, this.box.x + 4, this.top, this.box.w - 8, this.bottom - this.top, S);
    this.pageArea = area;
    addScrollHint(this, this.pageLayer!, area, MOSAIC.parch);
    return { area, x: 0, w: this.box.w - 8 - 4 };
  }

  private buildSummary(animate: boolean): void {
    const r = this.report;
    const { area, w } = this.pageScroll();
    const c = area.content;
    const gap = GAP;
    const tw = Math.floor((w - 2 * gap) / 3);
    const roomy = this.bottom - this.top >= 200;
    const th = roomy ? 46 : 36;
    const tiles: { icon: string; key: string; tip: TKey; value: number; prefix?: string; clock?: boolean; tone?: 'ink' | 'good' | 'bad' }[] = [
      { icon: 'hourglass', key: 'time', tip: 'results.tip.time', value: r.duration, clock: true },
      { icon: 'swords', key: 'kills', tip: 'results.tip.kills', value: r.kills },
      // dead, knocked out and fled (PLAY B4)
      { icon: 'skull', key: 'losses', tip: 'results.tip.lost', value: r.losses, tone: r.losses > 0 ? 'bad' : 'ink' },
      r.glory !== undefined ? { icon: 'laurel', key: 'glory', tip: 'results.tip.glory', value: r.glory, prefix: '+', tone: 'good' } : { icon: 'coin', key: 'gold', tip: 'results.tip.gold', value: r.gold, prefix: '+', tone: 'good' },
      { icon: 'xp', key: 'xp', tip: 'results.tip.xp', value: r.xp, prefix: '+', tone: 'good' },
    ];
    tiles.forEach((tl, i) => {
      const row = Math.floor(i / 3);
      const inRow = row === 0 ? 3 : tiles.length - 3;
      const rowW = inRow * tw + (inRow - 1) * gap;
      const x = Math.round((w - rowW) / 2) + (i % 3) * (tw + gap);
      const y = row * (th + gap);
      const label = t(`results.tile.${tl.key}` as TKey);
      // the clock counts in m:ss
      const tile = new ResultTile(this, x, y, tw, th, { icon: this.iconOr(tl.icon), label, value: tl.value, prefix: tl.prefix, format: tl.clock ? fmtClock : undefined, tone: tl.tone, duration: animate ? 900 : 0, delay: animate ? 150 + i * 160 : 0, sound: animate && !tl.clock, id: `stat.${tl.key}` });
      const tween = tile.start();
      if (tween) this.pageTweens.push(tween);
      c.add(tile);
      const z = this.add.zone(x, y, tw, th).setOrigin(0, 0).setInteractive();
      uiId(z, `results.tile.${tl.key}`);
      const tip = t(tl.tip);
      tappable(z, area, () => showTooltip(this, tip, tile), tip);
      // a mouse shows the same tip on hover (G15)
      z.on('pointerover', (p: Phaser.Input.Pointer) => !p.wasTouch && showTooltip(this, tip, tile));
      c.add(z);
    });
    let y = 2 * (th + gap) + 3;
    // the hero of the battle: only someone with a kill (plan ANSWERS A-36)
    if (r.mvp) y = this.buildMvp(c, y, w, roomy);
    // notes as chips (audit RES-5): promotions, the bounty, practice, the report's own lines
    noteChips(r, { practice: !!this.practice }).forEach((chip, i) => {
      const { c: chipC, h } = addNoteChip(this, c, 0, y, w, chip, area, `results.note${i}`);
      if (animate && chip.tone === 'badge') {
        chipC.setAlpha(0);
        this.tweens.add({ targets: chipC, alpha: 1, y: { from: y + 6, to: y }, duration: 260, delay: 1200, ease: 'Back.easeOut', onStart: () => (uiLevelUp(), haptic('medium')) });
      }
      y += h + 3;
    });
    area.setContentHeight(y);
  }

  private iconOr(name: string): string {
    return this.textures.exists(`icon_${name}`) ? name : 'info';
  }

  /** The hero of the battle: portrait in a gold frame, name, class, kills and damage. */
  private buildMvp(c: Phaser.GameObjects.Container, y: number, w: number, big: boolean): number {
    const mvp = this.report.mvp;
    if (!mvp) return y;
    const h = big ? 60 : 50;
    c.add(mosaicImage(this, 0, y, w, h, 'parchment'));
    // portrait in a bronze frame (twice the size when there is room)
    const fs = h - 10;
    const fx = 5;
    const fy = y + 5;
    const g = this.add.graphics();
    g.fillStyle(MOSAIC.stone1, 1);
    g.fillRect(fx + 2, fy + 2, fs - 4, fs - 4);
    g.lineStyle(1.4, MOSAIC.bronze, 1);
    g.strokeRect(fx - 0.5, fy - 0.5, fs + 1, fs + 1);
    g.lineStyle(0.6, MOSAIC.parchEdge, 1);
    g.strokeRect(fx - 1.5, fy - 1.5, fs + 3, fs + 3);
    c.add(g);
    if (mvp.hero) {
      c.add(addPortrait(this, dollFromHero(mvp.hero), fx + 2, fy + 2, { size: fs - 4 }));
    }
    const tx = fx + fs + 7;
    const tw = w - tx - 6;
    const ty = y + Math.max(4, Math.round((h - 41) / 2));
    const box = { owner: c, w, h: y + h };
    c.add(addIcon(this, tx, ty - 2, 'laurel'));
    const mvpT = t('results.mvp');
    // Cinzel down to the 6.5 floor, then the same words in Inter (mtext)
    c.add(uiId(mtext(this, tx + 14, ty, mvpT, 'rInk', { size: 7, maxW: tw - 14, box }), 'results.mvp'));
    const cls = mvp.hero ? heroClass(mvp.hero) : null;
    c.add(mtext(this, tx, ty + 11, mvp.name, 'pInk', { maxW: tw, box }));
    if (cls) c.add(mtext(this, tx, ty + 21, tOr(`class.${cls.id}.name`, cls.name), 'pSec', { size: TEXT_MIN, maxW: tw, box }));
    c.add(mtext(this, tx, ty + (cls ? 31 : 21), t('results.mvpLine', { kills: t('results.kills', { n: mvp.kills }), dmg: mvp.dmg }), 'pGood', { size: TEXT_MIN, maxW: tw, box }));
    return y + h + 5;
  }

  // ---- heroes

  private buildHeroes(animate: boolean): void {
    const r = this.report;
    if (r.heroes.length === 0) {
      this.pageLayer!.add(mosaicImage(this, this.box.x + 4, this.top, this.box.w - 8, this.bottom - this.top, 'parchment'));
      this.pageLayer!.add(addParchmentEmpty(this, this.box.x + 6, this.top + 2, this.box.w - 12, this.bottom - this.top - 4, { icon: 'people', hint: t('results.noHeroes') }));
      return;
    }
    if (animate) this.xpStart = this.time.now + 300;
    const rowH = 28;
    this.heroList = new ScrollList(this, this.pageLayer!, this.box.x + 4, this.top, this.box.w - 8, this.bottom - this.top, {
      fade: MOSAIC.parch,
      count: r.heroes.length,
      rowH,
      id: (i) => `results.hero${i}`,
      render: (i, row, w) => this.renderHeroRow(r.heroes[i], row, w, rowH),
    });
  }

  private renderHeroRow(h: HeroLine, row: Phaser.GameObjects.Container, w: number, rh: number): void {
    row.add(mosaicImage(this, 0, 0, w, rh, h.died ? 'parchmentWell' : 'parchment'));
    if (h.hero) {
      const img = addPortrait(this, dollFromHero(h.hero), 2, 2, { size: rh - 4 });
      if (h.died) img.setTint(0x8a7a70);
      row.add(img);
    }
    const right = 50;
    const tx = rh + 2;
    const tw = w - tx - right - 4;
    const box = { owner: row, w, h: rh };
    const lvNow = this.levelOf(h);
    row.add(mtext(this, tx, 4, h.name, h.died ? 'pOff' : 'pInk', { maxW: tw - 24, box }));
    const lv = mtext(this, tx + tw, 4, t('battle.lv', { n: lvNow.level }), 'pSec', { align: 1, box });
    row.add(lv);
    const rx = w - 4;
    if (h.died) {
      row.add(addIcon(this, tx, 14, 'skull', 'D'));
      row.add(mtext(this, tx + 15, 16, t('results.kills', { n: h.kills }), 'pOff', { size: TEXT_MIN, maxW: tw - 15, box }));
      row.add(mtext(this, rx, 10, t('results.fallen'), 'pBad', { align: 1, maxW: right, box }));
      return;
    }
    const g = this.add.graphics();
    row.add(g);
    // the bar starts under the name, in the text column (audit RES-3)
    const entry = { g, x: tx, w: tw, lv, line: h, flash: 0 };
    this.xpRows.set(h.heroId, entry);
    // rows come and go as the list scrolls (virtualised)
    g.once('destroy', () => this.xpRows.get(h.heroId) === entry && this.xpRows.delete(h.heroId));
    this.drawXp(h.heroId);
    row.add(mtext(this, rx, 4, t('results.xp', { n: h.xp }), 'pGood', { align: 1, maxW: right, box }));
    const status = h.levelsGained > 0 ? { s: t('results.lvUp', { n: h.levelBefore + h.levelsGained }), f: 'pGood' as const } : h.wounded ? { s: t('results.wounded'), f: 'pBad' as const } : { s: t('results.kills', { n: h.kills }), f: 'pSec' as const };
    row.add(mtext(this, rx, 15, status.s, status.f, { size: TEXT_MIN, align: 1, maxW: right - 2, box }));
    if (h.wounded) row.add(addIcon(this, rx - mw(status.s, status.f, TEXT_MIN) - 14, 13, 'cross'));
  }

  /** Cumulative XP from level 1 (to animate across level boundaries). */
  private totalXp(level: number, xp: number): number {
    let s = xp;
    for (let l = 1; l < level; l++) s += xpToNext(l);
    return s;
  }

  private levelOf(h: HeroLine): { level: number; xp: number } {
    let total = this.xpShown.get(h.heroId) ?? this.totalXp(h.levelBefore, h.xpBefore);
    let level = 1;
    while (level < MAX_LEVEL && total >= xpToNext(level)) {
      total -= xpToNext(level);
      level++;
    }
    return { level, xp: total };
  }

  private drawXp(id: string): void {
    const r = this.xpRows.get(id);
    if (!r) return;
    const { level, xp } = this.levelOf(r.line);
    const g = r.g;
    const x = r.x;
    const y = 16;
    g.clear();
    g.fillStyle(MOSAIC.stone0, 1);
    g.fillRect(x, y, r.w, 6);
    g.fillStyle(MOSAIC.stone2, 1);
    g.fillRect(x + 1, y + 1, r.w - 2, 4);
    const f = level >= MAX_LEVEL ? 1 : Math.min(1, xp / xpToNext(level));
    const fw = Math.round((r.w - 2) * f);
    if (fw > 0) {
      g.fillStyle(r.flash > this.time.now ? 0xffffff : COLOR.xp, 1);
      g.fillRect(x + 1, y + 1, fw, 4);
      g.fillStyle(0xffffff, 0.3);
      g.fillRect(x + 1, y + 1, fw, 1);
    }
    r.lv.setText(t('battle.lv', { n: level }));
  }

  // ---- spoils

  private buildSpoils(): void {
    const r = this.report;
    const top = this.top;
    if (r.loot.length === 0) {
      const hint = this.practice
        ? t('results.noSpoilsPractice')
        : r.result === 'victory' || r.result === 'draw' ? t('results.noSpoilsWin') : r.result === 'retreat' ? t('results.noSpoilsRetreat') : t('results.noSpoilsLoss');
      this.buildSpoilsEmpty(hint);
      return;
    }
    this.counter = addText(this, this.box.x + this.box.w / 2, top + 1, '', 'pInk', 0.5);
    this.pageLayer!.add(this.counter);
    this.refreshCounter();
    this.top = top + 13;
    const { area, w } = this.pageScroll();
    this.top = top;
    const gap = GAP;
    const cols = w >= 3 * 64 + 2 * gap ? 3 : 2;
    const cw = Math.floor((w - (cols - 1) * gap) / cols);
    const ch = 64;
    // a lair's hoard first, under its own header (campaign-arc.md R6)
    let y = 0;
    spoilSections(r.loot.length, this.hoard).forEach((sec) => {
      if (sec.title) {
        const head = mtext(this, 0, y, t(sec.title).toUpperCase(), 'rInk', { size: 7, maxW: w, box: { owner: area.content, w, h: 1e4 } });
        uiId(head, sec.title);
        area.content.add(head);
        y += 12;
      }
      for (let i = sec.from; i < sec.to; i++) {
        const k = i - sec.from;
        const x = (k % cols) * (cw + gap);
        const c = this.add.container(x, y + Math.floor(k / cols) * (ch + gap));
        area.content.add(c);
        this.lootCards.push({ i, c, w: cw, h: ch });
        this.drawCard(i);
      }
      y += Math.ceil((sec.to - sec.from) / cols) * (ch + gap) + 2;
    });
    area.setContentHeight(y - gap - 2);
    this.scheduleReveal();
  }

  /** No spoils (audit RES-4): a compact card with the painted open chest, the title and why. */
  private buildSpoilsEmpty(hint: string): void {
    const x = this.box.x + 4;
    const w = this.box.w - 8;
    const room = this.bottom - this.top;
    const lh = Math.ceil(lineHeight(TEXT_MIN));
    const lines = wrapText(hint, w - 16, 5, false, TEXT_MIN).lines;
    const art = Math.min(56, Math.max(0, room - (12 + 12 + lines.length * lh + 12)));
    const showArt = art >= 28;
    const h = Math.min(room, 8 + (showArt ? art + 4 : 0) + 12 + lines.length * lh + 8);
    const c = this.add.container(x, this.top);
    this.pageLayer!.add(c);
    c.add(mosaicImage(this, 0, 0, w, h, 'parchment'));
    let y = 8;
    if (showArt) {
      const img = addCutout(this, CHEST_EMPTY_KEY, Math.round((w - cutoutW(CHEST_EMPTY_KEY, art)) / 2), y, art);
      if (img) c.add(uiId(img, 'results.chest'));
      y += art + 4;
    }
    const box = { owner: c, w, h };
    c.add(mtext(this, w / 2, y, t('results.tab.spoils'), 'rInk', { size: 7.5, align: 0.5, maxW: w - 8, box }));
    y += 12;
    lines.forEach((l, i) => c.add(mtext(this, w / 2, y + i * lh, l, 'pSec', { size: TEXT_MIN, align: 0.5, box })));
  }

  private refreshCounter(): void {
    const r = this.report;
    if (!this.counter) return;
    const s = r.lootInStash ? t('results.inStash') : r.picks > 0 ? t('results.pick', { n: this.chosen.size, max: r.picks }) : '';
    this.counter.setText(ellipsize(s, this.box.w - 16));
  }

  /** Turn the next hidden card over every 0.35 s. */
  private scheduleReveal(): void {
    const next = this.lootCards.find((c) => !this.revealed.has(c.i));
    if (!next) return;
    this.revealTimer = this.time.delayedCall(this.revealed.size === 0 ? 250 : 350, () => {
      this.revealTimer = null;
      this.flip(next.i);
      this.scheduleReveal();
    });
  }

  private flip(i: number): void {
    const card = this.lootCards.find((c) => c.i === i);
    this.revealed.add(i);
    if (!card) return;
    const it = this.report.loot[i];
    const rar = normalizeRarity(it.rarity);
    const c = card.c;
    const cx = c.x;
    // turn: squeeze to an edge, swap the face, open again
    this.tweens.add({
      targets: c,
      scaleX: 0,
      x: cx + card.w / 2,
      duration: 90,
      ease: 'Sine.easeIn',
      onComplete: () => {
        if (!c.active) return; // the page went away meanwhile
        this.drawCard(i);
        this.tweens.add({ targets: c, scaleX: 1, x: cx, duration: 110, ease: 'Sine.easeOut' });
        // the rarity flashes out around the card
        const glow = this.add.rectangle(card.w / 2, card.h / 2, card.w + 6, card.h + 6, RARITY_GLOW[rar], 0.8).setOrigin(0.5);
        c.addAt(glow, 0);
        this.tweens.add({ targets: glow, alpha: 0, scaleX: 1.25, scaleY: 1.25, duration: 500, onComplete: () => glow.destroy() });
        const rank = rarityRank(rar);
        sfx.play(rank >= 2 ? 'coin' : 'tap');
        if (rank >= 4) haptic('heavy');
        else if (rank >= 2) haptic('light');
      },
    });
  }

  private drawCard(i: number): void {
    const card = this.lootCards.find((c) => c.i === i);
    if (!card) return;
    const { c, w, h } = card;
    c.removeAll(true);
    const area = this.pageArea;
    if (!this.revealed.has(i)) {
      // face down: a dark stone card with a chest
      c.add(mosaicImage(this, 0, 0, w, h, 'tileStone'));
      c.add(addIcon(this, Math.round((w - 12) / 2), Math.round((h - 12) / 2), 'chest', 'L'));
      return;
    }
    const it = this.report.loot[i];
    const rar = normalizeRarity(it.rarity);
    const sel = this.chosen.has(it.uid);
    c.add(mosaicImage(this, 0, 0, w, h, sel ? 'parchmentSel' : 'parchment'));
    // the rarity frame
    const fr = this.add.graphics();
    fr.lineStyle(sel ? 1.6 : 1.1, RARITY_INK[rar], 1);
    fr.strokeRect(1.5, 1.5, w - 3, h - 3);
    c.add(fr);
    c.add(new ItemIcon(this, Math.round((w - 24) / 2), 6, { item: it }, { tip: false }));
    const lines = wrapText(subjectName({ item: it }), w - 8, 2).lines;
    const name = addText(this, w / 2, lines.length > 1 ? 32 : 37, lines.join('\n'), rarityInk(this, rar), 0.5);
    name.setCenterAlign();
    uiFrame(name, c, w, h);
    c.add(name);
    c.add(mtext(this, w / 2, 52, `${t(`rarity.${rar}` as TKey)} ${Math.round(it.cond)}%`, 'pSec', { size: TEXT_MIN, align: 0.5, maxW: w - 8, box: { owner: c, w, h } }));
    if (sel) c.add(addIcon(this, w - 15, 4, 'check'));
    const z = this.add.zone(0, 0, w, h).setOrigin(0, 0).setInteractive();
    uiId(z, `results.loot${i}`);
    tappable(z, area, () => this.inspect(i), t('results.tip.card'));
    c.add(z);
  }

  /** Pick or put back a loot item. */
  toggle(uid: string): void {
    const r = this.report;
    if (r.picks <= 0) return;
    if (this.chosen.has(uid)) this.chosen.delete(uid);
    else if (this.chosen.size < r.picks) this.chosen.add(uid);
    else {
      hapticNotify('warning');
      toast(this, t('results.full', { n: r.picks }), 'bad');
      return;
    }
    haptic('light');
    const i = r.loot.findIndex((x) => x.uid === uid);
    if (i >= 0) {
      this.revealed.add(i);
      this.drawCard(i);
    }
    this.refreshCounter();
    this.updatePrimary();
  }

  /**
   * Item details compared with the best one of the same kind the army has on.
   * One close affordance, the X (audit RES-7, G5); the compare rows carry a
   * signed difference, not colour alone (G13).
   */
  inspect(i: number): void {
    const r = this.report;
    const it = r.loot[i];
    const def = itemDef(it.def);
    const rar = normalizeRarity(it.rarity);
    const { VW, VH, S } = this.m;
    const mdW = Math.min(VW - 12, 210);
    const itemName = subjectName({ item: it });
    // a long name that would shrink the title under the 6.5 floor goes into the body instead
    const nameFits = mw(itemName, 'rInk', TEXT_MIN) <= mdW - 60;
    const md = openModal(this, { title: nameFits ? itemName : t('results.tab.spoils'), w: mdW, h: VH - 16 });
    const { x, y, w } = md.body;
    md.c.add(new ItemIcon(this, x, y, { item: it }));
    const tw = w - 30;
    let ly = y;
    if (!nameFits) {
      const nl = new Label(this, x + 30, y, itemName, { maxW: tw, maxLines: 3, font: rarityInk(this, rar) });
      md.c.add(nl);
      ly += nl.h;
    }
    md.c.add(addText(this, x + 30, ly + 2, ellipsize(`${t(`rarity.${rar}` as TKey)} ${t(`slot.${def.slot}` as TKey)}`, tw), 'ink'));
    md.c.add(addText(this, x + 30, ly + 13, ellipsize(t('results.inspect.cond', { n: Math.round(it.cond) }), tw), 'dim'));
    let cy = Math.max(y + 28, ly + 26);
    // compare with the best item in that slot among the army
    const mine = this.bestEquipped(def.slot);
    const vsText = mine ? t('results.inspect.vs', { name: `${mine.hero.name}: ${subjectName({ item: mine.item })}` }) : t('results.inspect.none', { slot: t(`slot.${def.slot}` as TKey).toLowerCase() });
    const vs = new Label(this, x, cy, vsText, { maxW: w, maxLines: 2, font: 'dim' });
    md.c.add(vs);
    cy += vs.h + 4;
    const btnY = md.y + md.h - 9 - SIZE.btnH;
    const areaBottom = r.picks > 0 ? btnY - 4 : md.y + md.h - 9;
    const area = new ScrollArea(this, md.c, x, cy, w, areaBottom - cy, S);
    const a = itemMods(it);
    const b = mine ? itemMods(mine.item) : {};
    const keys = (Object.keys(STAT_MAX) as (keyof StatMods)[]).filter((k) => (a[k] ?? 0) !== 0 || (b[k] ?? 0) !== 0);
    let sy = 0;
    for (const k of keys) {
      const pct = PERCENT.has(k);
      const fmt = (v: number) => (pct ? `${Math.round(v * 100)}%` : Number.isInteger(v) ? `${v}` : v.toFixed(1));
      const d = (a[k] ?? 0) - (b[k] ?? 0);
      const delta = mine && Math.abs(d) > 1e-6 ? ` ${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}` : '';
      const bar = new StatBar(this, 0, sy, w - 4, { label: `${t(`results.stat.${k}` as TKey)}${delta}`, max: STAT_MAX[k]!, format: fmt, lowerIsBetter: LOWER_BETTER.has(k), color: RARITY_COLOR[rar] });
      if (mine) bar.set(b[k] ?? 0, a[k] ?? 0);
      else bar.set(a[k] ?? 0);
      area.content.add(bar);
      sy += 24;
    }
    area.setContentHeight(sy);
    addScrollHint(this, md.c, area);
    if (r.picks > 0) {
      const picked = this.chosen.has(it.uid);
      const bw = Math.min(md.w - 12, 120);
      md.c.add(
        new Button(this, md.x + Math.round((md.w - bw) / 2), btnY, bw, SIZE.btnH, {
          label: picked ? t('results.inspect.drop') : t('results.inspect.take'),
          icon: picked ? 'close' : 'check',
          variant: 'primary',
          style: 'buttonSel',
          onClick: () => {
            md.close();
            this.toggle(it.uid);
          },
        }),
      );
    }
  }

  private bestEquipped(slot: string): { hero: Hero; item: Item } | null {
    const pool: Hero[] = this.done ? (this.report.heroes.map((h) => h.hero).filter(Boolean) as Hero[]) : state.campaign.data.heroes;
    let best: { hero: Hero; item: Item; score: number } | null = null;
    for (const h of pool) {
      const item = (h.equip as Record<string, Item | null | undefined>)[slot];
      if (!item) continue;
      const score = itemDef(item.def).tier * 10 + rarityRank(item.rarity);
      if (!best || score > best.score) best = { hero: h, item, score };
    }
    return best;
  }

  // ------------------------------------------------------------------ leave

  finish(): void {
    if (this.left) return;
    this.left = true;
    // leaving straight from the Victory variant still moves the arc on
    if (this.arcOpen) {
      this.arcOpen = false;
      state.campaign.continueArc();
    }
    if (this.done) {
      const d = this.done;
      this.done = null;
      d();
      return;
    }
    const last = state.last;
    if (last) {
      const items = takeLoot(last.outcome, [...this.chosen]);
      state.campaign.data.stash.push(...items);
      state.last = null;
      void state.save();
    }
    this.chosen.clear();
    const practice = practiceOf(last);
    if (practice) this.scene.start('BeastTrial', { from: practice.from, open: practice.enc });
    else if (last?.partyId !== undefined) this.scene.start('World', {});
    else this.scene.start('Army', { from: 'World' });
  }

  update(time: number, delta: number): void {
    // XP bars fill at a steady rate once the Heroes page is open; crossing a level flashes and pops
    if (this.page === 'heroes' && time >= this.xpStart) {
      for (const h of this.report.heroes) {
        if (h.died) continue;
        const target = this.totalXp(h.levelBefore, h.xpBefore) + h.xp;
        const cur = this.xpShown.get(h.heroId) ?? this.totalXp(h.levelBefore, h.xpBefore);
        if (cur >= target) continue;
        const before = this.levelOf(h).level;
        this.xpShown.set(h.heroId, Math.min(target, cur + Math.max(1, (h.xp / 1.2) * (delta / 1000))));
        const after = this.levelOf(h).level;
        const row = this.xpRows.get(h.heroId);
        if (after > before && !this.popped.has(`${h.heroId}:${after}`)) {
          this.popped.add(`${h.heroId}:${after}`);
          hapticNotify('success');
          uiLevelUp();
          if (row) {
            row.flash = time + 200;
            row.lv.setFont('font_pGood').setScale(1.6);
            this.time.delayedCall(120, () => row.lv.active && row.lv.setScale(1.2));
            this.time.delayedCall(240, () => row.lv.active && row.lv.setScale(1));
            const m = row.g.getWorldTransformMatrix();
            this.burst(m.tx / this.m.S + row.x + row.w / 2, m.ty / this.m.S + 16, row.w, [P.gold, P.red, 0x6fae5a, 0x6d8fae, P.cream], 20);
          }
        }
        this.drawXp(h.heroId);
      }
    }
    const dt = delta / 1000;
    for (const c of this.confetti) {
      c.life -= dt;
      c.vy += 120 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.r.setPosition(Math.round(c.x), Math.round(c.y)).setVisible(c.life > 0);
    }
    if (this.confetti.length && this.confetti.every((c) => c.life <= 0)) {
      for (const c of this.confetti) c.r.destroy();
      this.confetti = [];
    }
  }
}

/** The report screen for an online battle; `done` leaves it. */
export function showReport(game: Phaser.Game, report: BattleReport, done: () => void): void {
  for (const sc of game.scene.getScenes(true)) game.scene.stop(sc.scene.key);
  game.scene.start('Results', { report, done } satisfies ResultsData);
}
