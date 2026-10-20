/**
 * M6k trade orders for the selected own squads (docs/WAR.md "Trade"; the sim's TradeOrder): what a holder under the
 * cursor offers for E and the radial (../interact.ts), the command card's Load / Unload / Escort / Salvage (nearest
 * holder within reach), and transfers between two holders (load from one, then unload into the other: chained here,
 * the next order sent once the squad holds again).
 *
 *   own cart       laden: unload into it; soldiers: escort it; civilians: pull it (crew); load from it; let go
 *   enemy cart     capture (stand beside it 5 s, none of theirs within 8); attack; ignite
 *   loot pile      pick up (anyone, first hands win); a smith squad: salvage an item in place
 *   own chest      laden: unload into it; load from it
 *   own store      laden: unload into it; load from it (the home strongroom through it)
 *   enemy chest / store   loot (no owner unit near; a store once its influence is gone)
 * A squad crewing a cart loads and unloads the cart, not its packs (the sim rolls the cart there).
 */
import { itemDef } from '../../../data/items';
import { BUILDINGS } from '../../sim/economy';
import { CART, PILE } from '../../sim/trade';
import type { BuildingSnap, HoldItem, HolderRef, Order, PileSnap, ResourceKind, SiegeSnap, SquadId } from '../../types';
import type { Option } from '../interact';
import type { SandboxScene } from '../SandboxScene';

const TEAM = 0;
const OWNER = 'you';
const PICK = 1.6;
/** The command card's buttons find a holder within this many tiles of the squad. */
const REACH = 14;
export type HolderKind = 'cart' | 'pile' | 'chest' | 'store';
export interface Holder {
  ref: HolderRef; kind: HolderKind; id: number; x: number; y: number; team: number; owner: string; name: string;
  goods: Partial<Record<ResourceKind, number>>; items: number; list: HoldItem[]; loads?: number; cap?: number; left?: number;
}
export const itemName = (it: HoldItem) => { try { return itemDef(it.def).name; } catch { return it.def; } };
export const holderKey = (r: HolderRef) => (r.cart !== undefined ? `c${r.cart}` : r.pile !== undefined ? `p${r.pile}` : `b${r.building}`);
const nice = (t: string) => t.replace(/[A-Z]/g, (c) => ' ' + c.toLowerCase());

export function cartHolder(e: SiegeSnap): Holder {
  return { ref: { cart: e.id }, kind: 'cart', id: e.id, x: e.x, y: e.y, team: e.team, owner: e.owner ?? '', name: e.type, goods: e.cargo ?? {}, items: e.items ?? 0, list: e.list ?? [], loads: e.loads ?? 0, cap: e.cap ?? 0 };
}
export function pileHolder(p: PileSnap): Holder {
  return { ref: { pile: p.id }, kind: 'pile', id: p.id, x: p.x, y: p.y, team: -1, owner: '', name: 'loot pile', goods: p.goods, items: p.items, list: p.list ?? [], loads: p.loads, cap: PILE.max, left: p.left };
}
export function buildingHolder(b: BuildingSnap): Holder | null {
  if (b.goods === undefined || b.state === 'destroyed') return null;
  const chest = b.type === 'chest';
  return { ref: { building: b.id }, kind: chest ? 'chest' : 'store', id: b.id, x: b.x, y: b.y, team: b.team, owner: b.owner ?? '', name: chest ? 'chest' : nice(b.type), goods: b.goods, items: b.items ?? 0, list: b.list ?? [], ...(chest ? { cap: BUILDINGS.chest.chest } : {}) };
}

export class TradeControls {
  /** A pile or cart picked by a click (the holder panel shows it); chests and stores go by the building selection. */
  selected: HolderRef | null = null;
  status = '';
  /** Transfers under way: per squad, the unload to send once its load is done. */
  private chain = new Map<SquadId, { next: Order; started: boolean }>();

  constructor(private s: SandboxScene) {}

  private cur() { return this.s.sim.cur; }

  /** Every holder on the field now. */
  holders(): Holder[] {
    const c = this.cur(), out: Holder[] = [];
    for (const e of c?.sieges ?? []) if ((e.type === 'handcart' || e.type === 'wagon') && e.state !== 'destroyed') out.push(cartHolder(e));
    for (const p of c?.piles ?? []) out.push(pileHolder(p));
    for (const b of c?.buildings ?? []) { const h = buildingHolder(b); if (h) out.push(h); }
    return out;
  }

  /** The holder a ref names now (null: gone). */
  get(ref: HolderRef): Holder | null {
    const c = this.cur();
    if (ref.cart !== undefined) { const e = c?.sieges?.find((x) => x.id === ref.cart && x.state !== 'destroyed'); return e ? cartHolder(e) : null; }
    if (ref.pile !== undefined) { const p = c?.piles?.find((x) => x.id === ref.pile); return p ? pileHolder(p) : null; }
    const b = c?.buildings?.find((x) => x.id === ref.building);
    return b ? buildingHolder(b) : null;
  }

  /** The holder under tile point t: a cart or pile within PICK, else the chest or store whose footprint holds it. */
  at(t: { x: number; y: number }): Holder | null {
    let best: Holder | null = null, bd = PICK;
    for (const e of this.cur()?.sieges ?? []) if ((e.type === 'handcart' || e.type === 'wagon') && e.state !== 'destroyed') {
      const d = Math.hypot(e.x - t.x, e.y - t.y);
      if (d < bd) (bd = d), (best = cartHolder(e));
    }
    for (const p of this.cur()?.piles ?? []) {
      const d = Math.hypot(Math.floor(p.x) + 0.5 - t.x, Math.floor(p.y) + 0.5 - t.y);
      if (d < bd) (bd = d), (best = pileHolder(p));
    }
    if (best) return best;
    const b = this.s.build.buildingAt(t);
    return b ? buildingHolder(b) : null;
  }

  mine(h: Holder): boolean {
    return h.kind === 'store' ? h.team === TEAM : h.kind === 'pile' || h.owner === OWNER;
  }

  /** Own squads' men with a load in their packs, or crewing a cart with cargo. */
  laden(own: SquadId[]): boolean {
    const set = new Set(own);
    if (this.s.drawn.some((d) => set.has(d.u.squad) && !!d.u.pack && d.u.state !== 'dead')) return true;
    return own.some((q) => { const e = this.s.siege.engineOf(q); return !!e?.loads; });
  }

  private civ(q: SquadId): boolean {
    return this.s.drawn.some((d) => d.u.squad === q && d.u.cls.startsWith('civ_'));
  }

  private smiths(own: SquadId[]): SquadId[] {
    return own.filter((q) => this.s.drawn.some((d) => d.u.squad === q && d.u.cls === 'civ_smith' && d.u.state !== 'dead'));
  }

  private send(own: SquadId[], f: (q: SquadId) => Order, at: { x: number; y: number }, label: string, colour = 0x60d060): void {
    for (const q of own) { this.chain.delete(q); this.s.sim.order(f(q)); }
    this.s.mark(at.x, at.y, colour);
    this.status = label;
    this.s.siege.status = label;
  }

  load(own: SquadId[], h: Holder, res?: ResourceKind): void {
    this.send(own, (squad) => ({ kind: 'load', squad, from: h.ref, ...(res ? { res } : {}) }), h, `load from ${h.name}`);
  }
  unload(own: SquadId[], h: Holder, res?: ResourceKind): void {
    this.send(own, (squad) => ({ kind: 'unload', squad, to: h.ref, ...(res ? { res } : {}) }), h, `unload into ${h.name}`, 0xffb050);
  }
  escort(own: SquadId[], h: Holder): void {
    this.send(own.filter((q) => !this.civ(q)), (squad) => ({ kind: 'escort', squad, cart: h.id }), h, `escort ${h.name}`, 0x80c0ff);
  }
  salvage(own: SquadId[], h: Holder, it: HoldItem): void {
    this.send(this.smiths(own), (squad) => ({ kind: 'salvagePile', squad, pile: h.id, uid: it.uid }), h, `salvage ${itemName(it)}`, 0xffd060);
  }
  /** Move a squad's men to stand beside a foe cart (capture: none of its side within 8 for 5 s). */
  capture(h: Holder): void {
    this.s.moveTo({ x: h.x, y: h.y });
    this.status = `capture ${h.name}: stand beside it ${CART.capture / 10} s`;
  }
  /** Load from `a`, then unload into `b` (good `res` or everything). */
  transfer(own: SquadId[], a: Holder, b: Holder, res?: ResourceKind): void {
    this.load(own, a, res);
    for (const q of own) this.chain.set(q, { next: { kind: 'unload', squad: q, to: b.ref, ...(res ? { res } : {}) }, started: false });
    this.status = `${a.name} → ${b.name}`;
  }

  /** Called a few times a second: a chained squad whose load finished (holds again) unloads. */
  tick(): void {
    for (const [q, c] of this.chain) {
      const o = this.s.sim.squads.get(q)?.order;
      if (o === undefined) { this.chain.delete(q); continue; }
      if (o === 'load') c.started = true;
      else if (c.started && o === 'hold') { this.chain.delete(q); this.s.sim.order(c.next); }
    }
  }

  /** The holder of kind `kinds` nearest the selected squads (within REACH), passing `ok`. */
  nearest(own: SquadId[], ok: (h: Holder) => boolean): Holder | null {
    const men = this.s.drawn.filter((d) => own.includes(d.u.squad) && d.u.state !== 'dead');
    if (!men.length) return null;
    const cx = men.reduce((a, d) => a + d.x, 0) / men.length, cy = men.reduce((a, d) => a + d.y, 0) / men.length;
    let best: Holder | null = null, bd = REACH;
    for (const h of this.holders()) {
      if (!ok(h)) continue;
      const d = Math.hypot(h.x - cx, h.y - cy);
      if (d < bd) (bd = d), (best = h);
    }
    return best;
  }

  /** May own squads take from h (as the sim's mayTake, minus what the view cannot see)? */
  canTake(h: Holder): boolean {
    return h.kind === 'pile' || (h.kind === 'cart' ? h.owner === OWNER : true);
  }
  canPut(h: Holder): boolean {
    return h.kind === 'store' ? h.team === TEAM : h.kind !== 'pile' && h.owner === OWNER;
  }
  hasAny(h: Holder): boolean {
    return h.items > 0 || Object.values(h.goods).some((n) => (n ?? 0) > 0.05);
  }

  /** Context options for holder h (E / radial), recommended first; [] when h offers nothing to these squads. */
  options(h: Holder, own: SquadId[], move: Option): Option[] {
    const o: Option[] = [], s = this.s, laden = this.laden(own), mine = this.mine(h), empty = !this.hasAny(h);
    const opt = (label: string, icon: string, run: () => void, off?: string): Option => ({ label, icon, run, off });
    const full = h.cap !== undefined && h.loads !== undefined && h.loads >= h.cap - 1e-6 ? `${h.name} is full` : undefined;
    if (h.kind === 'cart') {
      if (h.team !== TEAM) {
        o.push(opt(`capture ${h.name}`, 'act-escort', () => this.capture(h)));
        return [...o, move];
      }
      const crewing = own.some((q) => s.siege.engineOf(q)?.id === h.id);
      const e = s.sim.cur?.sieges?.find((x) => x.id === h.id);
      const soldiers = own.some((q) => !this.civ(q));
      const unl = opt(`unload into ${h.name}`, 'act-unload', () => this.unload(own, h), !laden || crewing ? 'nothing in their packs' : full);
      const esc = opt(`escort ${h.name}`, 'act-escort', () => this.escort(own, h), !soldiers ? 'civilians do not escort' : undefined);
      const pull = crewing
        ? opt(`let go of ${h.name}`, 'act-crew', () => { for (const q of own) s.sim.order({ kind: 'uncrew', squad: q }); })
        : opt(`${h.name === 'wagon' ? 'drive' : 'pull'} ${h.name}`, 'act-crew', () => { s.sim.order({ kind: 'crew', squad: own[0], siege: h.id }); s.mark(h.x, h.y, 0x60d060); }, e && e.crew >= 0 ? 'already crewed' : undefined);
      const lf = opt(`load from ${h.name}`, 'act-load', () => this.load(own, h), empty ? `${h.name} is empty` : crewing ? 'crewing it' : undefined);
      if (laden && !crewing) o.push(unl);
      if (soldiers) o.push(esc, pull); else o.push(pull, esc);
      if (!(laden && !crewing)) o.push(unl);
      o.push(lf);
      return [...o, move];
    }
    if (h.kind === 'pile') {
      o.push(opt('pick up loot', 'act-load', () => this.load(own, h), empty ? 'nothing left' : undefined));
      const sm = this.smiths(own);
      for (const it of h.list.slice(0, 3)) o.push(opt(`salvage ${itemName(it)}`, 'act-build', () => this.salvage(own, h, it), sm.length ? undefined : 'needs a smith'));
      return [...o, move];
    }
    if (!mine) {
      o.push(opt(`loot ${h.name}`, 'act-load', () => this.load(own, h), empty ? 'nothing in it' : undefined));
      return o;
    }
    const unl = opt(`unload into ${h.name}`, 'act-unload', () => this.unload(own, h), !laden ? 'nothing carried' : full);
    const lf = opt(`load from ${h.name}`, 'act-load', () => this.load(own, h), empty ? `${h.name} is empty` : undefined);
    return laden ? [unl, lf] : [lf, unl];
  }
}
