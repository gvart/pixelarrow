/**
 * The battle hotkeys (design/ux/input-v6.md §1.1, §3; ADR-0012 Decision 3).
 * A hotkey presses the HUD control that does the same thing, found by its
 * uiId, so it runs exactly the button's callback: the same orders reach the
 * sim, the order log and replays (ADR-0001), the same reasons show for a
 * disabled control. Pure: the scene finds and presses the control.
 */
import type { TKey } from '../../i18n';
import type { ActionId } from './actions';
import type { Pt } from './hitTest';
import { FACING_DIRS } from './singleTap';

/** What the scene shows: which control ids are on screen, the ability medallions top to bottom, and the card numerals (key 1 is the first). */
export interface BattleKeyHud {
  has(id: string): boolean;
  readonly medallions: readonly string[];
  readonly numerals: readonly string[];
}

/** Press this control; or say why there is none to press; or null: nothing to do. */
export type BattleKeyTarget = { press: string } | { why: TKey; n?: number } | null;

/** The controls each hotkey presses (the first one shown), and what it says when none is. */
const KEYS: Partial<Record<ActionId, { ids: readonly string[]; why?: TKey }>> = {
  'order.advance': { ids: ['battle.cmd.advance'], why: 'battle.why.noGroup' },
  'order.charge': { ids: ['battle.cmd.charge'], why: 'battle.why.noGroup' },
  'order.hold': { ids: ['battle.cmd.hold'], why: 'battle.why.noGroup' },
  'order.shoot': { ids: ['battle.cmd.loose'], why: 'battle.why.noGroup' },
  'order.fifth': { ids: ['battle.cmd.feint', 'battle.cmd.fallback'], why: 'battle.why.noGroup' },
  'order.then': { ids: ['battle.then'], why: 'input.why.then' },
  'order.undo': { ids: ['battle.undo'], why: 'undo.why.none' },
  'ability.more': { ids: ['battle.more'] },
  'time.pause': { ids: ['battle.pause', 'battle.play'], why: 'pace.locked' },
  'cam.follow': { ids: ['battle.follow'] },
  'menu.battle': { ids: ['battle.menu'] },
  'deploy.fight': { ids: ['battle.fight', 'battle.ready'] },
  'deploy.shape': { ids: ['battle.cat.formation'] },
  'deploy.groups': { ids: ['battle.groups'] },
  'deploy.works': { ids: ['battle.works'] },
};

/** The actions battleKeyTarget answers (the scene registers a handler for each). */
export const PRESS_ACTIONS: readonly ActionId[] = [
  ...(Object.keys(KEYS) as ActionId[]),
  'ability.1',
  'ability.2',
  'ability.3',
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((n) => `group.${n}` as ActionId),
];

export function battleKeyTarget(action: ActionId, hud: BattleKeyHud): BattleKeyTarget {
  const group = /^group\.(\d)$/.exec(action);
  if (group) {
    const n = Number(group[1]);
    const id = `battle.group.${hud.numerals[n - 1]}`;
    return hud.numerals[n - 1] && hud.has(id) ? { press: id } : { why: 'input.why.noGroup', n };
  }
  const ability = /^ability\.(\d)$/.exec(action);
  if (ability) {
    const id = hud.medallions[Number(ability[1]) - 1];
    return id ? { press: id } : null;
  }
  const k = KEYS[action];
  if (!k) return null;
  const id = k.ids.find((x) => hud.has(x));
  return id ? { press: id } : k.why ? { why: k.why } : null;
}

/**
 * The facing one eighth on from `f`, clockwise (dir 1) or anticlockwise (-1) on
 * the field (y down): the next of the eight directions the knob and the pips
 * snap to, counted from the one nearest `f`.
 */
export function turned(f: { x: number; y: number }, dir: 1 | -1): Pt {
  let best = 0;
  FACING_DIRS.forEach((d, i) => {
    if (d.x * f.x + d.y * f.y > FACING_DIRS[best].x * f.x + FACING_DIRS[best].y * f.y) best = i;
  });
  return FACING_DIRS[(best + dir + 8) % 8];
}

/** The arrow pan (§3.5), in UI px: full speed, the ease-in to it, and what a single short press moves. */
export const KEY_PAN = { speed: 600, easeMs: 120, tapPx: 48 } as const;

/** UI px travelled after `ms` held: speed eased in linearly over easeMs, then constant. */
function travel(ms: number): number {
  const t = ms / 1000;
  const e = KEY_PAN.easeMs / 1000;
  return t <= e ? (KEY_PAN.speed * t * t) / (2 * e) : KEY_PAN.speed * (t - e / 2);
}

/**
 * The arrow pan's motion, frame-rate independent: `press` on each arrow key
 * down, `frame` every frame with the arrows held now. Constant speed after a
 * short ease-in, no drift after release, and a press shorter than one step
 * still moves one whole step (tapPx).
 */
export class KeyPan {
  private dir = { x: 0, y: 0 };
  private ms = 0;
  private done = 0;
  private pending = false;

  press(dir: { x: number; y: number }): void {
    this.dir = dir;
    this.ms = 0;
    this.done = 0;
    this.pending = true;
  }

  frame(held: { x: number; y: number }, dtMs: number): { dx: number; dy: number } {
    let step = 0;
    if (held.x || held.y) {
      if (held.x !== this.dir.x || held.y !== this.dir.y) {
        this.dir = held;
        this.ms = 0;
        this.done = 0;
      }
      this.ms += dtMs;
      const to = travel(this.ms);
      step = to - this.done;
      this.done = to;
    } else if (this.pending) {
      // released before a whole step: finish it
      step = Math.max(0, KEY_PAN.tapPx - this.done);
      this.pending = false;
    } else return { dx: 0, dy: 0 };
    if (this.done >= KEY_PAN.tapPx) this.pending = false;
    const len = Math.hypot(this.dir.x, this.dir.y) || 1;
    return { dx: (this.dir.x / len) * step, dy: (this.dir.y / len) * step };
  }
}
