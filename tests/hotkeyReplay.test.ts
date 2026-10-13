/**
 * V6-INP-02 (ADR-0012 test strategy, ADR-0001): a battle driven by hotkeys
 * gives the same order log, and so the same replay hash, as the same inputs
 * through the buttons. A hotkey resolves to an action (KeyRouter, default
 * bindings), the action to the HUD control that does the same thing
 * (battleKeyTarget), and the control's own callback runs. The HUD here is a
 * stand-in whose callbacks issue the orders the battle scene's buttons issue
 * (order keys, Then…, Undo, group cards, Pause, Speed) on a real sim.
 */
import { describe, expect, it } from 'vitest';
import { armySpec } from '../src/game/armySpec';
import { classSquad } from '../src/dev/classBalance';
import { Battle } from '../src/sim/battle';
import { replayBattle } from '../src/sim/replay';
import { Rng } from '../src/sim/rng';
import type { BattleSetup, Order } from '../src/sim/types';
import { battleKeyTarget, PRESS_ACTIONS } from '../src/ui/input/battleKeys';
import { KeyRouter, activeContexts, type KeyInput } from '../src/ui/input/keys';
import { stepSpeed } from '../src/ui/input/pace';
import { UndoHistory, inverseOf } from '../src/ui/input/undo';
import { ThenQueue, type ThenKey } from '../src/ui/orderQueue';

function setup(seed: number): BattleSetup {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  // ours: hoplites (group 1 on the cards) and archers (group 2); theirs: hoplites
  const mine = armySpec([...classSquad(rng, ids, 'hoplite', 4, 3, 0), ...classSquad(rng, ids, 'archer', 4, 3, 1)], false);
  return { seed, armies: [mine, armySpec(classSquad(rng, ids, 'hoplite', 6, 3, 0), false)] };
}

/** The battle scene's buttons, reduced to the orders their callbacks issue. */
class Hud {
  readonly b: Battle;
  sel = 0;
  paused = false;
  speed = 1;
  private arming = -1;
  private thenOffer = -1;
  private readonly undo = new UndoHistory(1);
  private readonly thenQ = new ThenQueue();

  constructor(seed: number) {
    this.b = new Battle(setup(seed));
    this.b.issue(0, { kind: 'form', group: 0, cx: 8, cy: 30, fx: 0, fy: -1, frontage: 2 });
    this.b.issue(0, { kind: 'form', group: 1, cx: 16, cy: 31, fx: 0, fy: -1, frontage: 2 });
    this.b.issue(1, { kind: 'form', group: 4, cx: 12, cy: 2, fx: 0, fy: 1, frontage: 3 });
    this.b.startBattle();
  }

  private mine(): number[] {
    return this.b.groups.filter((g) => g.side === 0 && !g.disbanded && this.b.activeMembers(g.id).length > 0).map((g) => g.id);
  }

  private issue(o: Order): void {
    this.undo.push(inverseOf(o, this.b) ?? [], [this.sel], this.b.tick);
    this.b.issue(0, o);
    this.thenOffer = o.kind === 'form' ? this.sel : -1;
    this.arming = -1;
  }

  private orderKey(key: ThenKey): void {
    if (this.arming === this.sel) {
      this.thenQ.arm(this.sel, key, this.b);
      this.arming = -1;
      this.thenOffer = -1;
    } else this.issue(key === 'loose' ? { kind: 'loose', group: this.sel, on: !this.b.groups[this.sel].fireAtWill } : { kind: 'order', group: this.sel, order: key });
  }

  /** What is on screen now, by uiId, with its callback. */
  controls(): Map<string, () => void> {
    const c = new Map<string, () => void>();
    this.mine().forEach((gid, i) => c.set(`battle.group.${i + 1}`, () => (this.sel = gid)));
    for (const k of ['advance', 'charge', 'hold', 'loose', 'fallback'] as const) c.set(`battle.cmd.${k}`, () => this.orderKey(k));
    if (this.thenOffer === this.sel || this.arming === this.sel) c.set('battle.then', () => (this.arming = this.arming >= 0 ? -1 : this.sel));
    if (this.undo.size) c.set('battle.undo', () => this.undo.pop(this.b.tick)?.orders.forEach((o) => this.b.issue(0, o)));
    c.set(this.paused ? 'battle.play' : 'battle.pause', () => (this.paused = !this.paused));
    return c;
  }

  click(id: string): void {
    const fn = this.controls().get(id);
    if (!fn) throw new Error(`no control ${id}`);
    fn();
  }

  /** A move drag on the field (pointer only, the same in both runs). */
  drag(o: Order): void {
    this.issue(o);
  }

  /** One rendered frame: the sim steps at the chosen speed unless paused, then the Then… queue fires. */
  frame(): void {
    if (this.paused || this.b.phase !== 'battle') return;
    for (let i = 0; i < Math.round(this.speed * 2); i++) this.b.step();
    for (const o of this.thenQ.due(this.b)) this.b.issue(0, o);
  }
}

type Step = { key: string; mods?: Partial<KeyInput>; click: string } | { speedUp: true; key: string } | { drag: Order };

/** select 2, W, a move, F then W, U, Space and Space again, ] (the ADR's script), then Q, E, R, T and Ctrl+Z. */
const SCRIPT: [number, Step][] = [
  [0, { key: 'Digit2', click: 'battle.group.2' }],
  [2, { key: 'KeyW', click: 'battle.cmd.charge' }],
  [4, { key: 'Digit1', click: 'battle.group.1' }],
  [5, { drag: { kind: 'form', group: 0, cx: 10, cy: 22, fx: 0, fy: -1, frontage: 3 } }],
  [6, { key: 'KeyF', click: 'battle.then' }],
  [7, { key: 'KeyW', click: 'battle.cmd.charge' }],
  [9, { key: 'Digit2', click: 'battle.group.2' }],
  [10, { key: 'KeyE', click: 'battle.cmd.hold' }],
  [11, { key: 'KeyU', click: 'battle.undo' }],
  [12, { key: 'Space', click: 'battle.pause' }],
  [20, { key: 'Space', click: 'battle.play' }],
  [21, { speedUp: true, key: 'BracketRight' }],
  [30, { key: 'KeyQ', click: 'battle.cmd.advance' }],
  [32, { key: 'KeyR', click: 'battle.cmd.loose' }],
  [34, { key: 'KeyT', click: 'battle.cmd.fallback' }],
  [36, { key: 'KeyZ', mods: { ctrlKey: true }, click: 'battle.undo' }],
];

function run(path: 'buttons' | 'keys'): Battle {
  const hud = new Hud(7);
  const router = new KeyRouter();
  router.setContexts(activeContexts(['battle.fight', 'battle', 'camera'], 0));
  for (const a of PRESS_ACTIONS)
    router.on(a, () => {
      const c = hud.controls();
      const t = battleKeyTarget(a, { has: (id) => c.has(id), medallions: [], numerals: ['1', '2', '3', '4'] });
      if (t && 'press' in t) hud.click(t.press);
    });
  router.on('time.faster', () => void (hud.speed = stepSpeed('offline', hud.speed, 1) ?? hud.speed));
  const press = (code: string, mods: Partial<KeyInput> = {}) => {
    const ev = { code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, editable: false, composing: false, ...mods };
    expect(router.down(ev)).toBe(true);
    router.up(ev);
  };
  for (let f = 0; f < 40000 && hud.b.phase === 'battle'; f++) {
    for (const [at, s] of SCRIPT) {
      if (at !== f) continue;
      if ('drag' in s) hud.drag(s.drag);
      else if ('speedUp' in s) path === 'keys' ? press(s.key) : (hud.speed = 2);
      else if (path === 'keys') press(s.key, s.mods);
      else hud.click(s.click);
    }
    hud.frame();
  }
  return hud.b;
}

describe('hotkeys replay as buttons (ADR-0001)', () => {
  it('a battle driven by hotkeys gives the button path’s order log and replay hash', () => {
    const byButtons = run('buttons');
    const byKeys = run('keys');
    expect(byKeys.orderLog.length).toBeGreaterThan(10);
    expect(byKeys.orderLog.some((o) => o.order.kind === 'order' && o.order.order === 'charge')).toBe(true);
    expect(byKeys.orderLog).toEqual(byButtons.orderLog);
    expect(byKeys.hash()).toBe(byButtons.hash());
    expect(byKeys.phase).toBe('ended');
    // the log alone gives the battle back: the server's replay ends where the played one did
    const replay = replayBattle(setup(7), byKeys.orderLog, 3);
    expect(replay.summary.hash).toBe(byKeys.hash());
    expect(replay.summary.ticks).toBe(byKeys.tick);
  });
});
