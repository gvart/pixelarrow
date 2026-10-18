/**
 * The focus manager (ADR-0012 Decision 4, design/ux/input-v6.md §4). Pure: no DOM, no Phaser
 * (src/ui/focusRing.ts registers the kit's controls, follows the NavStack and draws the ring).
 *
 * - Scopes: one per NavStack screen and one per `navLayer`, bottom to top (`setStack`). Focus lives
 *   only in the top scope (the trap); each scope keeps its own focused control, so closing a layer
 *   returns focus to the control that opened it, or to the default when that control is gone.
 * - Reading order (Tab): by the top edge in 8 UI px bands, then left to right, wrapping.
 * - Arrows: the nearest control that lies that way within a 45° cone, by distance plus the off-axis
 *   gap (weighted; a wide card straight below a small button is in line). Inside a group (a tab bar, a segmented control, a grid) arrows stay
 *   in the group along its axis, and the group is one Tab stop. A stepper takes Left/Right itself.
 * - The default control: in a scope with a destructive button, the safe choice (never the danger
 *   button); else the primary; else the first in reading order. A field scope (the battle, a map)
 *   starts with nothing focused: arrows pan there until Tab puts focus on the HUD.
 * - Focus-visible: `visible` is set by a keyboard focus action and cleared by any pointer press. The
 *   first Tab or arrow only shows the ring where focus already is.
 * Rects are read only when navigating (never per frame), so registration costs a closure.
 */

export type Dir = 'up' | 'down' | 'left' | 'right';

/** A rect in UI px. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What a control is for, when choosing the default: the safe choice beats the primary in a destructive dialog. */
export type FocusRole = 'primary' | 'danger' | 'safe';

export interface Focusable {
  /** A stable key (the control's uiId): focus finds the control again after its screen is rebuilt. */
  key?: string;
  /** The scope the control lives in now (read lazily: a control is built before it is added to its sheet). */
  scope(): object | null;
  /** Where it is now, in UI px; null while it is hidden or gone. */
  rect(): Rect | null;
  enabled(): boolean;
  /** Group identity (a tab bar, a grid): arrows stay inside it, Tab leaves it. A group with `follow: true` selects as focus moves. */
  group?: unknown;
  role?: FocusRole;
  onActivate(): void;
  /** The group's current member (the selected tab or segment): Tab into the group lands here. */
  current?(): boolean;
  /** Left/Right (or any direction) handled by the control itself (a stepper): true when it took it. */
  onAdjust?(d: Dir): boolean;
  /** Comes after every other control in reading order (a nav rail down the left edge: nav last, landscape-v6 §4). */
  tail?: boolean;
  /** The pane it sits in (0, the default, is the first): panes are read left to right, each top to bottom (landscape-v6 §4). */
  pane?: number;
}

interface ScopeState {
  focused: Focusable | null;
  /** The focused control's key, kept when it is destroyed so a rebuild finds it again. */
  key?: string;
}

/** Reading-order band height, UI px (input-v6.md §4.2). */
const BAND = 8;
/** How much the off-axis offset counts against a candidate for an arrow (input-v6.md §4.3). */
const OFF_AXIS = 3;

const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

function readingOrder(a: { r: Rect; f?: Focusable }, b: { r: Rect; f?: Focusable }): number {
  return Number(!!a.f?.tail) - Number(!!b.f?.tail) || (a.f?.pane ?? 0) - (b.f?.pane ?? 0) || Math.floor(a.r.y / BAND) - Math.floor(b.r.y / BAND) || a.r.x - b.r.x || a.r.y - b.r.y;
}

/**
 * Along-axis distance (centre to centre) and off-axis gap (between the two rects' spans across the
 * axis: 0 when they overlap, so a wide card straight below a small button counts as in line) from
 * `from` to `to` going `d`, or null when `to` is not that way (outside the 45° cone).
 */
function along(from: Rect, to: Rect, d: Dir): { a: number; o: number } | null {
  const f = centre(from);
  const t = centre(to);
  const h = d === 'left' || d === 'right';
  const a = h ? (d === 'right' ? t.x - f.x : f.x - t.x) : d === 'down' ? t.y - f.y : f.y - t.y;
  const [f0, f1, t0, t1] = h ? [from.y, from.y + from.h, to.y, to.y + to.h] : [from.x, from.x + from.w, to.x, to.x + to.w];
  const o = Math.max(0, t0 - f1, f0 - t1);
  return a > 0 && o <= a ? { a, o } : null;
}

/** A display node: a control or a container, with its parent container (Phaser's `parentContainer`). */
export interface Nested {
  parentContainer?: Nested | null;
}

/** The outermost layer container among `o` and its parents, or null when it is in no layer. */
export function outermostLayer(o: Nested, layers: { has(o: object): boolean }): object | null {
  let outer: object | null = null;
  for (let c: Nested | null | undefined = o; c; c = c.parentContainer) if (layers.has(c)) outer = c;
  return outer;
}

/**
 * The focus scopes, bottom to top, from the NavStack: the top screen, then each of its layers. A layer
 * inside another layer (a sheet's Back guard) is the same scope as the one holding it.
 */
export function scopeStack(screen: object | null, layerKeys: readonly object[], layers: { has(o: object): boolean }): object[] {
  const stack: object[] = screen ? [screen] : [];
  for (const k of layerKeys) {
    const s = outermostLayer(k as Nested, layers) ?? k;
    if (stack[stack.length - 1] !== s) stack.push(s);
  }
  return stack;
}

const follows = (g: unknown) => !!g && typeof g === 'object' && (g as { follow?: boolean }).follow === true;

export class FocusManager {
  private readonly all = new Set<Focusable>();
  private stack: object[] = [];
  private readonly states = new Map<object, ScopeState>();
  private isField: (scope: object) => boolean = () => false;
  /** The ring shows (focus-visible). */
  visible = false;
  /** Called after anything that may move or show the ring. */
  onChange: () => void = () => {};

  /** Register a control; the returned function removes it. */
  add(f: Focusable): () => void {
    this.all.add(f);
    return () => {
      this.all.delete(f);
      for (const st of this.states.values()) if (st.focused === f) st.focused = null;
      this.onChange();
    };
  }

  /**
   * The scopes from the bottom (the screen) to the top (the newest layer). `field` tells which
   * scopes start with nothing focused (the battle and the maps). A scope that left the stack forgets
   * its focus: a sheet opened again starts from its default.
   */
  setStack(stack: readonly object[], field?: (scope: object) => boolean): void {
    if (field) this.isField = field;
    this.stack = [...stack];
    for (const s of [...this.states.keys()]) if (!this.stack.includes(s)) this.states.delete(s);
    this.onChange();
  }

  get top(): object | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  private state(scope: object): ScopeState {
    let st = this.states.get(scope);
    if (!st) this.states.set(scope, (st = { focused: null }));
    return st;
  }

  /** The top scope's shown controls in reading order. */
  order(): Focusable[] {
    const top = this.top;
    if (!top) return [];
    const out: { f: Focusable; r: Rect }[] = [];
    for (const f of this.all) {
      if (f.scope() !== top) continue;
      const r = f.rect();
      if (r) out.push({ f, r });
    }
    return out.sort(readingOrder).map((x) => x.f);
  }

  private live(f: Focusable | null, top: object): f is Focusable {
    return !!f && this.all.has(f) && f.scope() === top && !!f.rect();
  }

  /** The focused control of the top scope (its default when nothing was focused yet; none in a field scope). */
  get focused(): Focusable | null {
    const top = this.top;
    if (!top) return null;
    const st = this.state(top);
    if (this.live(st.focused, top)) return st.focused;
    st.focused = null;
    const list = this.order();
    const again = st.key ? list.find((f) => f.key === st.key) : undefined;
    if (again) return this.set(again);
    if (this.isField(top) || !list.length) return null;
    return this.set(this.defaultOf(list));
  }

  private defaultOf(list: Focusable[]): Focusable {
    if (list.some((f) => f.role === 'danger')) return list.find((f) => f.role === 'safe') ?? list.find((f) => f.role !== 'danger') ?? list[0];
    return list.find((f) => f.role === 'primary') ?? list[0];
  }

  private set(f: Focusable | null): Focusable | null {
    const top = this.top;
    if (!top) return null;
    const st = this.state(top);
    st.focused = f;
    st.key = f?.key;
    this.onChange();
    return f;
  }

  /** Focus the first control in reading order (no ring change). */
  focusFirst(): void {
    this.set(this.order()[0] ?? null);
  }

  /**
   * The first Tab or arrow shows the ring where focus is (true: that was all it did). With nothing
   * focused in a field scope, the HUD gets focus at its first control.
   */
  private reveal(): boolean {
    if (this.visible && this.focused) return false;
    this.visible = true;
    if (!this.focused) this.focusFirst();
    this.onChange();
    return true;
  }

  /** Tab: the next control in reading order; a group is one stop. False with nothing to focus. */
  next(): boolean {
    return this.step(1);
  }

  /** Shift+Tab. */
  prev(): boolean {
    return this.step(-1);
  }

  private step(by: 1 | -1): boolean {
    const list = this.order();
    if (!list.length) return false;
    if (this.reveal()) return true;
    const cur = this.focused!;
    const i = list.indexOf(cur);
    const g = cur.group;
    for (let k = 1; k <= list.length; k++) {
      const f = list[(((i + by * k) % list.length) + list.length) % list.length];
      if (g !== undefined && f.group === g) continue;
      this.set(this.entryOf(f, list));
      return true;
    }
    return true;
  }

  /** Where Tab lands on reaching `f`: in a group, its current member (the selected tab), else its first, whichever way Tab came in. */
  entryOf(f: Focusable, list = this.order()): Focusable {
    if (f.group === undefined) return f;
    const mates = list.filter((x) => x.group === f.group);
    return mates.find((x) => x.current?.()) ?? mates[0] ?? f;
  }

  /** An arrow: the control adjusts itself, or focus moves that way (group first). False with nothing to focus. */
  move(d: Dir): boolean {
    const list = this.order();
    if (!list.length) return false;
    if (this.reveal()) return true;
    const cur = this.focused!;
    if (cur.onAdjust?.(d)) {
      this.onChange();
      return true;
    }
    const from = cur.rect()!;
    const best = (cands: Focusable[]) => {
      let pick: Focusable | null = null;
      let score = Infinity;
      for (const f of cands) {
        if (f === cur) continue;
        const r = f.rect();
        const m = r && along(from, r, d);
        if (!m) continue;
        const s = m.a + OFF_AXIS * m.o;
        if (s < score) [pick, score] = [f, s];
      }
      return pick;
    };
    const g = cur.group;
    if (g !== undefined) {
      const mates = list.filter((f) => f.group === g && (!follows(g) || f.enabled()));
      const inGroup = best(mates);
      if (inGroup) {
        this.set(inGroup);
        if (follows(g)) inGroup.onActivate();
        return true;
      }
      // the group's end along its own axis: stay; across it (up from a tab bar): leave the group
      const back: Dir = d === 'left' ? 'right' : d === 'right' ? 'left' : d === 'up' ? 'down' : 'up';
      if (mates.some((f) => f !== cur && f.rect() && along(from, f.rect()!, back))) return true;
    }
    const to = best(list);
    if (to) this.set(to);
    return true;
  }

  /** Focus `f` by keyboard (PageDown chose it): the ring shows. Only in the top scope. */
  keyFocus(f: Focusable): void {
    if (f.scope() !== this.top || !this.all.has(f)) return;
    this.visible = true;
    this.set(f);
  }

  /** Enter or Space: activate the focused control. False with nothing focused. */
  activate(): boolean {
    const f = this.focused;
    if (!f) return false;
    f.onActivate();
    return true;
  }

  /** Any pointer press: the ring hides (the position is kept); in a field scope the focus goes too (field mode). */
  pointer(): void {
    this.visible = false;
    const top = this.top;
    if (top && this.isField(top)) this.states.set(top, { focused: null });
    this.onChange();
  }

  /** A click on a control focuses it, without the ring (not in a field scope, and only in the top scope). */
  pointerFocus(f: Focusable): void {
    const top = this.top;
    if (!top || this.isField(top) || f.scope() !== top || !this.all.has(f)) return;
    this.set(f);
  }

  /** Esc in a field scope with the HUD focused: back to field mode (true). False otherwise (Esc goes back). */
  leaveField(): boolean {
    const top = this.top;
    if (!top || !this.isField(top) || !this.state(top).focused) return false;
    this.set(null);
    this.visible = false;
    this.onChange();
    return true;
  }
}
