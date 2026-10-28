/**
 * micro: health bars over the men, and one man picked out of his block (docs/WAR.md "Unit control").
 *
 * Bars: thin pixel bars over each man, all in one Graphics a frame, snapped to screen pixels (crisp at every zoom).
 *   your own men     green, while hurt or while their squad is selected
 *   foes             red, while hurt
 *   allies, pacts    yellow (roaming folk, and the men of the players the region's `allies` message names), while hurt
 *   Alt held         every man's bar (Dota-style)
 * Guardians are left out (their own bar and name plate, ./guardians.ts).
 *
 * The picked man: exactly one of your men selected (a click on him, ./select.ts) gets a gold ring (./units.ts picked) and
 * his card docked in the command panel (./hud/manCard.ts, mounted by ./hud/hud.ts) with his micro orders: fall back, to
 * the rear rank, rejoin (the sim's `man` order), each on a hotkey (src/war/input `order.fallBack`, `order.rear`, `order.rejoin`).
 * A click in the gaps of one of your blocks (not on a man) selects the whole block; Esc or open ground clears.
 */
import Phaser from 'phaser';
import type { UnitId } from '../types';
import type { DrawUnit } from './simClient';
import type { SandboxScene } from './SandboxScene';
import type { UnitLayer } from './units';
import { alliesBy, BAR, barOf, setAllyOf, type BarTone } from './microRules';
import { myTeam } from './side';
import { MAN_ACTS, ManCard, type ManAct, type ManInfo } from './hud/manCard';
import { keys } from '../input/keys';
import { sandboxRoster, SandboxRoster } from './hud/roster/state';
import { ITEMS } from '../../data/items';

export class Micro {
  private g: Phaser.GameObjects.Graphics;
  readonly card: ManCard;
  /** Alt held: every bar. */
  alt = false;
  /** The man picked out of his block (exactly one of yours selected), or null. */
  picked: DrawUnit | null = null;

  constructor(private s: SandboxScene, private units: UnitLayer) {
    this.g = s.add.graphics().setDepth(10.95);
    this.card = new ManCard((a) => this.act(a));
    const alt = (e: KeyboardEvent, on: boolean) => {
      if (e.key !== 'Alt') return;
      this.alt = on;
      if (on) e.preventDefault(); // no browser menu bar focus on a lone Alt
    };
    window.addEventListener('keydown', (e) => alt(e, true));
    window.addEventListener('keyup', (e) => alt(e, false));
    window.addEventListener('blur', () => (this.alt = false));
    // online: the players whose men are friends (his alliance, pacts and truces) get yellow bars
    s.sim.serverTaps.add((m) => { if (m.t === 'allies') setAllyOf(alliesBy(m.players)); });
    // the picked man's orders on their hotkeys
    window.addEventListener('keydown', (e) => {
      const a = keys.act(e), x = MAN_ACTS.find((m) => m.key === a);
      if (!x || !this.picked || e.repeat) return;
      e.preventDefault();
      if (this.card.can(x.a)) this.act(x.a);
    });
  }

  /** The micro order a for the picked man. */
  act(a: ManAct): void {
    const d = this.picked;
    if (!d) return;
    this.s.sim.order({ kind: 'man', squad: d.u.squad, unit: d.u.id, act: a });
    this.s.mark(d.x, d.y, a === 'fallBack' ? 0xffd34a : 0x60d060);
  }

  /** Each frame after the units are drawn: who is picked, the bars, the card. */
  update(drawn: readonly DrawUnit[], selected: ReadonlySet<UnitId>, view: { x: number; y: number; right: number; bottom: number }, zoom: number, hide: ReadonlySet<number>): void {
    const s = this.s, mine = myTeam();
    const one = selected.size === 1 ? drawn.find((d) => selected.has(d.u.id) && d.team === mine && d.u.state !== 'dead') ?? null : null;
    this.picked = s.sim.replay ? null : one;
    this.units.picked = this.picked?.u.id ?? -1;
    this.bars(drawn, view, zoom, hide);
    this.showCard(drawn);
  }

  private bars(drawn: readonly DrawUnit[], view: { x: number; y: number; right: number; bottom: number }, zoom: number, hide: ReadonlySet<number>): void {
    const g = this.g.clear(), mine = myTeam(), sq = this.s.selected, px = 1 / zoom;
    // screen px snapping: world = view origin + whole screen px / zoom
    const sx = (x: number) => view.x + Math.round((x - view.x) * zoom) * px, sy = (y: number) => view.y + Math.round((y - view.y) * zoom) * px;
    // a little bigger zoomed in (whole screen px)
    const wp = Math.round(BAR.w * Math.max(1, Math.sqrt(zoom))), hp = Math.max(BAR.h, Math.round(BAR.h * Math.sqrt(zoom)));
    const w = wp * px, h = hp * px, rows: { x: number; y: number; k: number; tone: BarTone }[] = [];
    for (const d of drawn) {
      if (hide.has(d.u.id)) continue;
      const tone = barOf(d, mine, sq, this.alt, this.s.sim.squads.get(d.u.squad)?.owner);
      if (!tone) continue;
      const f = this.units.feet(d), up = this.above(d);
      if (f.x < view.x - 20 || f.x > view.right + 20 || f.y < view.y || f.y > view.bottom + up) continue;
      rows.push({ x: sx(f.x) - Math.round(wp / 2) * px, y: sy(f.y - up), k: Math.max(0, Math.min(1, d.u.hp / d.u.maxHp)), tone });
    }
    if (!rows.length) return;
    // a 1 px dark frame, the lost share, then the fill by tone (one fill style each)
    g.fillStyle(BAR.back, 0.9);
    for (const r of rows) g.fillRect(r.x - px, r.y - px, w + 2 * px, h + 2 * px);
    g.fillStyle(BAR.lost, 1);
    for (const r of rows) g.fillRect(r.x, r.y, w, h);
    for (const tone of ['own', 'foe', 'ally'] as const) {
      g.fillStyle(tone === 'own' ? BAR.green : tone === 'foe' ? BAR.red : BAR.yellow, 1);
      for (const r of rows) if (r.tone === tone && r.k > 0) g.fillRect(r.x, r.y, Math.max(1, Math.round(wp * r.k)) * px, h);
    }
  }

  /** World px over a man's feet his bar floats at: just over his head (a soldier is 2 BODY tall), at his sheet's scale. */
  private above(d: DrawUnit): number {
    return BAR.above * this.units.scaleOf(d.u.cls);
  }

  private showCard(drawn: readonly DrawUnit[]): void {
    const d = this.picked, s = this.s;
    if (!d) return this.card.hide();
    const u = d.u, p = u.pid ? sandboxRoster(s).roster.get(u.pid) : undefined;
    const mates = drawn.filter((x) => x.u.squad === u.squad && x.u.state !== 'dead').length;
    const civ = !!s.sim.squads.get(u.squad)?.civ;
    const info: ManInfo = {
      id: u.id, name: p?.hero.name ?? SandboxRoster.className(u.cls), cls: SandboxRoster.className(u.cls), level: u.level ?? p?.hero.level,
      hp: u.hp, maxHp: u.maxHp, back: !!u.back,
      kit: p ? Object.values(p.hero.equip).flatMap((it) => (it && ITEMS[it.def] ? [ITEMS[it.def].name] : [])) : [],
      off: civ ? { fallBack: 'civilians work, not fight', rear: 'civilians work, not fight', rejoin: 'civilians work, not fight' } : mates < 2 ? { rear: 'alone in his squad' } : {},
    };
    this.card.show(info);
  }
}
