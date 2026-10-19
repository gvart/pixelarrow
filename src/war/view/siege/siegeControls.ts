/**
 * Siege orders for the selected own squads (M2c, W-29), keys and a dev panel box in the HUD (the build panel's style):
 *
 *   C  crew the nearest own engine (uncrewed, built), or uncrew if the squad crews one (U: uncrew)
 *   Y  deploy / pack the stone thrower the squad crews
 *   L  raise ladder: then click an enemy walkway wall or tower face (the crewed siege ladder is carried there)
 *   P  push ladder: then click an enemy ladder raised on an own wall (the squad goes up and pushes it off)
 *   I  ignite: then click an enemy wood building or engine (torches)
 *   O  extinguish: then click a burning own building or engine
 *   Q  fire arrows on / off (archers)
 *   right click an enemy building or engine: attackBuilding (a crewed ram or thrower drives its engine at it)
 *   move / hold to a crewing squad drive its engine (the sim's rule)
 *
 * Build mode's siege tools (ram, stone thrower, siege ladder) are BuildMode tools; buildSiege() lays one out here.
 */
import { BUILDINGS } from '../../sim/economy';
import { SIEGE } from '../../sim/siege';
import type { BuildingSnap, SiegeSnap, SiegeType, SquadId } from '../../types';
import type { SandboxScene } from '../SandboxScene';

export type Armed = 'raise' | 'push' | 'ignite' | 'extinguish';
const TEAM = 0;
const PICK_R = 1.6;
const CREW_FIND = 14;
const ARMED_TEXT: Record<Armed, string> = {
  raise: 'click an enemy wall face to raise the ladder', push: 'click an enemy ladder on your wall',
  ignite: 'click an enemy wood building or engine to set it alight', extinguish: 'click a burning own building or engine',
};
export const SIEGE_NAME: Record<SiegeType, string> = { ram: 'ram', stoneThrower: 'stone thrower', siegeLadder: 'siege ladder' };
export const SIEGE_HELP = 'Siege: C crew / U uncrew · Y deploy / pack · L raise ladder · P push ladder · I ignite · O extinguish · Q fire arrows · right click an enemy building or engine: attack it';

export class SiegeControls {
  armed: Armed | null = null;
  /** Squads told to loose fire arrows (the snapshot does not carry it). */
  readonly fire = new Set<SquadId>();
  status = '';

  constructor(private s: SandboxScene) {
    s.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || s.build.active) return;
      const k = e.key.toLowerCase();
      if (k === 'c') this.crew();
      else if (k === 'u') this.uncrew();
      else if (k === 'y') this.deploy();
      else if (k === 'l') this.arm('raise');
      else if (k === 'p') this.arm('push');
      else if (k === 'i') this.arm('ignite');
      else if (k === 'o') this.arm('extinguish');
      else if (k === 'q') this.fireArrows();
      else if (k === 'escape') this.armed = null;
    });
  }

  /** Selected own squads. */
  own(): SquadId[] {
    return [...this.s.selected].filter((q) => this.s.sim.squads.get(q)?.team === TEAM);
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

  /** C: crew the nearest free own engine; a squad already crewing lets go. */
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

  /** The tile of a building (filter) nearest t within PICK_R. */
  private tileNear(t: { x: number; y: number }, ok: (b: BuildingSnap) => boolean): { b: BuildingSnap; x: number; y: number } | null {
    let best: { b: BuildingSnap; x: number; y: number } | null = null, bd = PICK_R;
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

  /** Right click: attack the enemy engine or building at t with the selected squads; true if there was one. */
  attackAt(t: { x: number; y: number }): boolean {
    if (this.armed) { this.armed = null; this.status = ''; return true; }
    const qs = this.own();
    if (!qs.length) return false;
    const e = this.engineAt(t, true), b = e ? undefined : this.s.build.buildingAt(t);
    if (!e && (!b || b.team === TEAM)) return false;
    for (const q of qs) this.s.sim.order(e ? { kind: 'attackBuilding', squad: q, siege: e.id } : { kind: 'attackBuilding', squad: q, building: b!.id });
    const at = e ?? b!;
    this.s.mark(at.x, at.y, 0xff4040);
    this.status = `attack the ${e ? SIEGE_NAME[e.type] : b!.type}`;
    return true;
  }
}

/** The siege box of the HUD: the selected squad's engine, buttons with their keys, the status line. */
export function siegePanel(s: SandboxScene): void {
  const c: SiegeControls = s.siege;
  const hud = document.getElementById('hud')!;
  const box = document.createElement('div');
  box.id = 'siege';
  box.innerHTML = `<b>siege</b> <span id="geng" class="dim"></span>
    <div class="row"><button id="gcrew">Crew (C)</button> <button id="guncrew">Uncrew (U)</button> <button id="gdeploy">Deploy / pack (Y)</button></div>
    <div class="row"><button id="graise">Raise ladder (L)</button> <button id="gpush">Push ladder (P)</button></div>
    <div class="row"><button id="gignite">Ignite (I)</button> <button id="gdouse">Extinguish (O)</button> <button id="gfire">Fire arrows (Q)</button></div>
    <div class="dim" id="gstatus"></div><div class="dim">right click an enemy building / engine: attack</div>`;
  hud.insertBefore(box, document.getElementById('bsel'));
  const $ = (id: string) => document.getElementById(id) as HTMLButtonElement;
  $('gcrew').onclick = () => c.crew();
  $('guncrew').onclick = () => c.uncrew();
  $('gdeploy').onclick = () => c.deploy();
  $('graise').onclick = () => c.arm('raise');
  $('gpush').onclick = () => c.arm('push');
  $('gignite').onclick = () => c.arm('ignite');
  $('gdouse').onclick = () => c.arm('extinguish');
  $('gfire').onclick = () => c.fireArrows();
  setInterval(() => {
    const qs = c.own();
    box.style.display = qs.length ? '' : 'none';
    if (!qs.length) return;
    const e = c.engineOf(qs[0]);
    $('geng').textContent = e ? `#${qs[0]} crews ${SIEGE_NAME[e.type]} · ${e.state} · hp ${Math.ceil(e.hp)}/${e.maxHp} · crew ${e.crewHere}/${e.crewNeed}${e.burning ? ' · burning' : ''}` : '';
    $('gdeploy').disabled = e?.type !== 'stoneThrower';
    $('guncrew').disabled = !e;
    $('gcrew').textContent = e ? 'Let go (C)' : 'Crew (C)';
    const on = qs.every((q) => c.fire.has(q));
    $('gfire').textContent = `Fire arrows: ${on ? 'on' : 'off'} (Q)`;
    for (const [id, a] of [['graise', 'raise'], ['gpush', 'push'], ['gignite', 'ignite'], ['gdouse', 'extinguish']] as const) $(id).classList.toggle('sel', c.armed === a);
    $('gstatus').textContent = c.status;
  }, 200);
}

/** Toolbar entries of build mode's siege tools: name, cost text. */
export const siegeTools = (): [SiegeType, string][] => (Object.keys(SIEGE) as SiegeType[]).map((t) => [t, `${Object.entries(SIEGE[t].cost).map(([r, v]) => `${v} ${r}`).join(', ')} · crew ${SIEGE[t].crew} · a squad builds it`]);
