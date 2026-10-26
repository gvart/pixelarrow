/**
 * W-53 unit control: the player's selection is a set of his men, not of squads (docs/WAR.md "Unit control").
 *
 *   click a man           select him (shift: add or drop him); a click on open ground clears
 *   box                   select every man of yours inside (shift adds)
 *   double-click a man    every man of his class on screen
 *   Ctrl+A                all your men; Esc clears (when no tool, menu or panel takes it)
 *   Ctrl+1-9              the selection becomes control group n; 1-9 selects it again, a second tap centres on it
 *   Alt+1-4               formation line / column / wedge / loose
 *
 * Orders: the selection's lead squad (that of the first man picked) is the one squad id the order code sends to
 * (SiegeControls.own); `address` names the selected men on it unless they are exactly that squad, so the sim gathers
 * them into one squad (one formation) first. Men left out keep their own orders. `s.selected` stays the squads with a
 * selected man (lead first) for the views that draw by squad.
 */
import type { Order, SquadId, UnitId } from '../types';
import type { DrawUnit } from './simClient';
import type { SandboxScene } from './SandboxScene';
import { keys } from '../input/keys';
import type { ActionId } from '../input/actions';

const TEAM = 0;
const DOUBLE_MS = 350;
const SHAPES = ['line', 'column', 'wedge', 'loose'] as const;
/** The formation actions (Alt+1-4 by default), in SHAPES order. */
const FORMS: ActionId[] = ['form.line', 'form.column', 'form.wedge', 'form.loose'];

export class Selection {
  /** Selected own men, in the order picked (the first one's squad leads). */
  readonly units = new Set<UnitId>();
  /** Control groups 1-9: their men as last stored. */
  readonly groups = new Map<number, UnitId[]>();
  private live = new Map<UnitId, DrawUnit>();
  private last = { id: -1, t: 0 };
  private tap = { n: 0, t: 0 };

  constructor(private s: SandboxScene) {
    s.sim.address = (o) => this.address(o);
    // capture: Esc is read before the build tool and the radial close on it
    window.addEventListener('keydown', (e) => this.key(e), true);
  }

  /** Each frame, after the units are drawn in: the fallen and the lost leave the selection and the groups. */
  sync(drawn: DrawUnit[]): void {
    this.live.clear();
    for (const d of drawn) if (d.team === TEAM && d.u.state !== 'dead') this.live.set(d.u.id, d);
    if (!this.s.sim.cur) return;
    for (const id of this.units) if (!this.live.has(id)) this.units.delete(id);
    for (const [n, ids] of this.groups) {
      const left = ids.filter((id) => this.live.has(id));
      if (left.length !== ids.length) left.length ? this.groups.set(n, left) : this.groups.delete(n);
    }
    const sq = this.s.selected;
    sq.clear();
    for (const id of this.units) sq.add(this.live.get(id)!.u.squad);
  }

  /** The squad an order to the selection is sent to (null: nobody selected). */
  lead(): SquadId | null {
    for (const id of this.units) { const d = this.live.get(id); if (d) return d.u.squad; }
    return null;
  }

  /** The selected men drawn now. */
  men(): DrawUnit[] {
    return [...this.units].map((id) => this.live.get(id)).filter((d): d is DrawUnit => !!d);
  }

  /** The lowest control group man `id` is in (0 none). */
  groupOf(id: UnitId): number {
    for (let n = 1; n <= 9; n++) if (this.groups.get(n)?.includes(id)) return n;
    return 0;
  }

  set(ids: Iterable<UnitId>, add = false): void {
    if (!add) this.units.clear();
    for (const id of ids) if (this.live.has(id)) this.units.add(id);
    this.sync([...this.live.values()]);
  }

  clear(): void {
    if (!this.units.size) return;
    this.set([]);
  }

  /** A left click on own man d (null: on nothing of ours). */
  click(d: DrawUnit | null, shift: boolean, now: number): void {
    if (!d) { if (!shift) this.clear(); return; }
    const twice = this.last.id === d.u.id && now - this.last.t < DOUBLE_MS;
    this.last = { id: d.u.id, t: now };
    if (twice) return this.set(this.onScreen().filter((x) => x.u.cls === d.u.cls).map((x) => x.u.id), shift);
    if (shift && this.units.has(d.u.id)) { this.units.delete(d.u.id); this.set([], true); return; }
    this.set([d.u.id], shift);
  }

  /** Control group n stored from the selection (none selected: the group goes). */
  store(n: number): void {
    const ids = [...this.units];
    if (ids.length) this.groups.set(n, ids);
    else this.groups.delete(n);
  }

  /** Control group n selected; a second call soon after centres the camera on it. */
  recall(n: number, now: number): void {
    const ids = this.groups.get(n);
    if (!ids?.length) return;
    this.set(ids);
    if (this.tap.n === n && now - this.tap.t < DOUBLE_MS * 1.3) {
      const ms = this.men();
      if (ms.length) this.s.focus(ms.reduce((a, d) => a + d.x, 0) / ms.length, ms.reduce((a, d) => a + d.y, 0) / ms.length);
    }
    this.tap = { n, t: now };
  }

  /** The order with the selected men named on it, when it goes to the lead squad and they are not exactly that squad. */
  address(o: Order): Order {
    const lead = this.lead();
    if (o.units || !('squad' in o) || o.squad === undefined || o.squad !== lead) return o;
    const ids = this.men().map((d) => d.u.id);
    let inLead = 0;
    for (const d of this.live.values()) if (d.u.squad === lead) inLead++;
    if (ids.length === inLead && this.men().every((d) => d.u.squad === lead)) return o;
    return { ...o, units: ids };
  }

  private onScreen(): DrawUnit[] {
    const cam = this.s.cameras.main;
    return [...this.live.values()].filter((d) => {
      const p = this.s.toScreen(d.x, d.y);
      return p.x >= 0 && p.y >= 0 && p.x <= cam.width && p.y <= cam.height;
    });
  }

  private key(e: KeyboardEvent): void {
    if (e.repeat) return;
    const s = this.s, a = keys.act(e);
    if (!a) return;
    const form = FORMS.indexOf(a);
    if (form >= 0) {
      e.preventDefault();
      const lead = this.lead();
      if (lead !== null) s.sim.order({ kind: 'formation', squad: lead, shape: SHAPES[form] });
      return;
    }
    const set = /^group\.set\.(\d)$/.exec(a), get = /^group\.(\d)$/.exec(a);
    if (set) { e.preventDefault(); this.store(Number(set[1])); return; }
    if (get && !s.build.tool) { this.recall(Number(get[1]), performance.now()); return; }
    if (a === 'sel.all') { e.preventDefault(); this.set(this.live.keys()); return; }
    if (a === 'back' && !s.build.active && !s.build.tool && !s.interact.open && !s.siege.armed) this.clear();
  }
}
