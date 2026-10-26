/**
 * Siege orders for the selected own squads (M2c, W-29), keys and the command card buttons (../hud/hud.ts). The
 * targeted orders (crew / uncrew, raise / push ladder, ignite, extinguish, attack) are the context action of E and right
 * click (../interact.ts, W-30); only the toggles keep their own keys, and the HUD buttons stay as a fallback:
 *
 *   Y  deploy / pack the stone thrower the squad crews
 *   Q  fire arrows on / off (archers)
 *   buttons: Crew (the nearest own engine), Uncrew; Raise ladder, Push ladder, Ignite, Extinguish, Move, Attack arm a click on the map
 *   move / hold to a crewing squad drive its engine (the sim's rule)
 *
 * Build mode's siege tools (ram, stone thrower, siege ladder) are BuildMode tools; buildSiege() lays one out here.
 */
import { BUILDINGS } from '../../sim/economy';
import { SIEGE } from '../../sim/siege';
import type { BuildingSnap, SiegeSnap, SiegeType, SquadId } from '../../types';
import type { SandboxScene } from '../SandboxScene';

export type Armed = 'raise' | 'push' | 'ignite' | 'extinguish' | 'move' | 'attack' | 'attackMove';
const TEAM = 0;
const PICK_R = 1.6;
const CREW_FIND = 14;
const ARMED_TEXT: Record<Armed, string> = {
  move: 'click the map to move there', attack: 'click an enemy squad to attack it',
  attackMove: 'click the map: march there, fighting any foe met on the way',
  raise: 'click an enemy wall face to raise the ladder', push: 'click an enemy ladder on your wall',
  ignite: 'click an enemy wood building or engine to set it alight', extinguish: 'click a burning own building or engine',
};
export const SIEGE_NAME: Record<SiegeType, string> = { ram: 'ram', stoneThrower: 'stone thrower', siegeLadder: 'siege ladder', mantlet: 'mantlet', coveredRam: 'covered ram', oxybeles: 'oxybeles', siegeTower: 'siege tower', handcart: 'handcart', wagon: 'wagon' };
export const SIEGE_HELP = 'Siege: E / right click crews, raises or pushes ladders, ignites, puts out, attacks (as the cursor label says) · Y deploy / pack · Q fire arrows';

export class SiegeControls {
  armed: Armed | null = null;
  /** Squads told to loose fire arrows (the snapshot does not carry it). */
  readonly fire = new Set<SquadId>();
  status = '';

  constructor(private s: SandboxScene) {
    s.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || s.build.active) return;
      const k = e.key.toLowerCase();
      if (k === 'y') this.deploy();
      else if (k === 'q') this.fireArrows();
      else if (k === 'escape') this.armed = null;
    });
  }

  /** The squad orders to the selection go to: its lead (W-53, ../select.ts names the selected men on them), or none. */
  own(): SquadId[] {
    const q = this.s.sel.lead();
    return q !== null && this.s.sim.squads.get(q)?.team === TEAM ? [q] : [];
  }

  private sieges(): SiegeSnap[] {
    return this.s.sim.cur?.sieges ?? [];
  }

  private buildings(): BuildingSnap[] {
    return this.s.sim.cur?.buildings ?? [];
  }

  /** The engine squad q crews, if any. */
  engineOf(q: SquadId): SiegeSnap | undefined {
    return this.sieges().find((e) => e.crew === q && e.state !== 'destroyed');
  }

  private centre(q: SquadId): { x: number; y: number } | null {
    const men = this.s.drawn.filter((d) => d.u.squad === q && d.u.state !== 'dead');
    if (!men.length) return null;
    return { x: men.reduce((a, d) => a + d.x, 0) / men.length, y: men.reduce((a, d) => a + d.y, 0) / men.length };
  }

  arm(a: Armed): void {
    if (!this.own().length) { this.status = 'select a squad first'; return; }
    this.armed = a;
    this.status = ARMED_TEXT[a];
  }

  /** Crew: the nearest free own engine; a squad already crewing lets go. */
  crew(): void {
    const taken = new Set<number>();
    for (const q of this.own()) {
      if (this.engineOf(q)) { this.s.sim.order({ kind: 'uncrew', squad: q }); continue; }
      const c = this.centre(q);
      if (!c) continue;
      let best: SiegeSnap | null = null, bd = CREW_FIND;
      for (const e of this.sieges()) {
        if (e.team !== TEAM || e.crew >= 0 || taken.has(e.id) || e.state === 'building' || e.state === 'destroyed' || e.state === 'raised') continue;
        const d = Math.hypot(e.x - c.x, e.y - c.y);
        if (d < bd) (bd = d), (best = e);
      }
      if (!best) { this.status = 'no free engine of yours near'; continue; }
      taken.add(best.id);
      this.s.sim.order({ kind: 'crew', squad: q, siege: best.id });
      this.s.mark(best.x, best.y, 0x60d060);
      this.status = `squad #${q} crews the ${SIEGE_NAME[best.type]}`;
    }
  }

  uncrew(): void {
    for (const q of this.own()) if (this.engineOf(q)) this.s.sim.order({ kind: 'uncrew', squad: q });
  }

  /** Y: a crewed stone thrower deploys where it stands, or packs up. */
  deploy(): void {
    let any = false;
    for (const q of this.own()) {
      const e = this.engineOf(q);
      if (e?.type !== 'stoneThrower') continue;
      any = true;
      this.s.sim.order({ kind: 'deploy', squad: q, pack: e.state === 'deployed' || e.state === 'deploying' });
    }
    if (!any) this.status = 'crew a stone thrower first';
  }

  /** Q: fire arrows on / off for the selected squads. */
  fireArrows(): void {
    const qs = this.own(), on = !qs.every((q) => this.fire.has(q));
    for (const q of qs) {
      this.s.sim.order({ kind: 'fireArrows', squad: q, on });
      if (on) this.fire.add(q); else this.fire.delete(q);
    }
    this.status = `fire arrows ${on ? 'on' : 'off'}`;
  }

  /** Build mode's siege tool: the selected own squad builds the engine at t (its cost paid at once). */
  buildSiege(type: SiegeType, t: { x: number; y: number }): boolean {
    const q = this.s.build.squad();
    if (q === null) { this.s.build.status = `${SIEGE_NAME[type]}: select a squad to build it`; return false; }
    const x = Math.floor(t.x) + 0.5, y = Math.floor(t.y) + 0.5;
    this.s.sim.order({ kind: 'buildSiege', squad: q, type, x, y });
    this.s.mark(x, y, 0x60d060);
    return true;
  }

  /** Can an engine be laid out at t (in bounds, off buildings)? */
  canBuild(t: { x: number; y: number }): boolean {
    const r = this.s.region;
    return t.x >= 1 && t.y >= 1 && t.x < r.w - 1 && t.y < r.h - 1 && !this.s.build.buildingAt(t) && !r.water[Math.floor(t.y) * r.w + Math.floor(t.x)];
  }

  /** The engine nearest t within PICK_R (enemy: team != 0, else own), not destroyed. */
  engineAt(t: { x: number; y: number }, enemy: boolean): SiegeSnap | undefined {
    let best: SiegeSnap | undefined, bd = PICK_R;
    for (const e of this.sieges()) {
      if ((e.team !== TEAM) !== enemy || e.state === 'destroyed' || e.state === 'raised') continue;
      const d = Math.hypot(e.x - t.x, e.y - t.y);
      if (d < bd) (bd = d), (best = e);
    }
    return best;
  }

  /** The tile of a building (filter) nearest t within r. */
  tileNear(t: { x: number; y: number }, ok: (b: BuildingSnap) => boolean, r = PICK_R): { b: BuildingSnap; x: number; y: number } | null {
    let best: { b: BuildingSnap; x: number; y: number } | null = null, bd = r;
    for (const b of this.buildings()) {
      if (b.state === 'destroyed' || !ok(b)) continue;
      for (let i = 0; i + 1 < b.tiles.length; i += 2) {
        const d = Math.hypot(b.tiles[i] + 0.5 - t.x, b.tiles[i + 1] + 0.5 - t.y);
        if (d < bd) (bd = d), (best = { b, x: b.tiles[i], y: b.tiles[i + 1] });
      }
    }
    return best;
  }

  /** Left click while armed: the order at t; true if handled. */
  onDown(t: { x: number; y: number }): boolean {
    const a = this.armed;
    if (!a) return false;
    this.armed = null;
    const qs = this.own();
    if (!qs.length) return true;
    if (a === 'move') { this.s.moveTo(t); this.status = ''; return true; }
    if (a === 'attackMove') { this.s.moveTo(t, 'attackMove'); this.status = ''; return true; }
    if (a === 'attack') {
      const foe = this.s.pick(this.s.input.activePointer, false);
      if (foe) this.s.attackSquad(foe);
      this.status = foe ? '' : 'attack: no enemy there';
      return true;
    }
    if (a === 'raise') {
      const w = this.tileNear(t, (b) => b.team !== TEAM && !!BUILDINGS[b.type].walk && !BUILDINGS[b.type].access && (b.state === 'done' || b.state === 'damaged'));
      if (!w) { this.status = 'raise ladder: no enemy walkway wall or tower there'; return true; }
      for (const q of qs) this.s.sim.order({ kind: 'raiseLadder', squad: q, wallTile: [w.x, w.y] });
      this.s.mark(w.x + 0.5, w.y + 0.5, 0xffe070);
      this.status = 'ladder: carried to the wall';
    } else if (a === 'push') {
      const l = this.tileNear(t, (b) => b.siege !== undefined && b.team !== TEAM);
      if (!l) { this.status = 'push ladder: no enemy ladder there'; return true; }
      for (const q of qs) this.s.sim.order({ kind: 'pushLadder', squad: q, ladder: l.b.id });
      this.s.mark(l.x + 0.5, l.y + 0.5, 0xffe070);
    } else {
      const enemy = a === 'ignite', e = this.engineAt(t, enemy);
      const b = e ? null : this.tileNear(t, (q) => (q.team !== TEAM) === enemy && BUILDINGS[q.type].material === 'wood' && (enemy || !!q.burning));
      const target = e ? { siege: e.id } : b ? { building: b.b.id } : null;
      if (!target) { this.status = `${a}: ${enemy ? 'no enemy wood building or engine there' : 'nothing of yours burning there'}`; return true; }
      for (const q of qs) this.s.sim.order({ kind: a, squad: q, ...target });
      const at = e ?? { x: b!.x + 0.5, y: b!.y + 0.5 };
      this.s.mark(at.x, at.y, a === 'ignite' ? 0xff8030 : 0x60b0ff);
    }
    return true;
  }

}

/** Toolbar entries of build mode's siege tools: name, cost text. */
export const siegeTools = (): [SiegeType, string][] => (Object.keys(SIEGE) as SiegeType[]).map((t) => [t, `${Object.entries(SIEGE[t].cost).map(([r, v]) => `${v} ${r}`).join(', ')} · crew ${SIEGE[t].crew} · a squad builds it`]);
