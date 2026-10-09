/**
 * Mythical beasts and world bosses in battle (docs/DESIGN_V2.md "Mythical
 * beasts"). Pure and deterministic like the rest of src/sim: fixed ticks, the
 * battle's seeded RNG, no trigonometry at run time (orbits turn by literal
 * rotation constants), units and parts iterated in id order.
 *
 * The Battle creates a MythSystem only when some unit's stats carry a known
 * `boss` id (src/data/beasts.ts), and calls it from a handful of hooks:
 *
 *   update(u)        every tick for each living beast unit, instead of the
 *                    soldier / animal logic: the beast's own bot AI;
 *   afterMove()      after collisions: parts follow their bodies (hydra heads,
 *                    kraken arms), boulders land, fire burns, severed heads
 *                    regrow, the terror aura saps nearby men;
 *   vis(e)           who can be targeted (circling harpies cannot);
 *   onDamage(...)    immunities and multipliers (the lion's hide), sealing
 *                    a hydra's stumps;
 *   onKill(t)        a body's parts die with it, a severed head starts to regrow;
 *   ghost / weight   collisions (a leaping lion, a charging minotaur and
 *                    flying harpies pass over men; huge bodies are not shoved).
 *
 * Without beasts none of this runs, so old setups replay exactly as before.
 */
import type { Battle } from './battle';
import type { HitDir, MythAct, SimUnit } from './types';
import { MYTHS, MYTH_RULES, isMythId, type MythDef, type MythId } from '../data/beasts';
import { AURAS } from '../data/perks';

const TR = 20; // ticks per second (src/sim/battle.ts TICK_RATE)
const DT = 1 / TR;
const DIR_DMG: Record<HitDir, number> = { front: 1, side: 1.3, rear: 1.6 };
/** Orbit step for circling harpies: a rotation of 0.06 rad per tick (literal constants, no trig at run time). */
const ORBIT_C = 0.9982005399352042;
const ORBIT_S = 0.059964006479444595;

export interface Flight {
  id: number;
  /** The thrower (unit id). */
  from: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t0: number;
  dur: number;
  dmg: number;
  radius: number;
  shove: number;
  shock: number;
  done: boolean;
}

export interface MythState {
  u: SimUnit;
  id: MythId;
  def: MythDef;
  /** Parts: their body; bodies: null. */
  body: SimUnit | null;
  /** Bodies: their parts in anchor order. */
  parts: SimUnit[];
  slot: number;
  nSlots: number;
  /** Cooldowns in ticks: [main special, second, third]. */
  cd: [number, number, number];
  /** Per-beast mode (0 = normal; harpies 0 circle, 1 dive, 2 strike, 3 climb; lion 1 leap; minotaur 1 charge; giants / chimera 1 wind-up). */
  mode: number;
  /** Ticks in the current mode. */
  t: number;
  tx: number;
  ty: number;
  dx: number;
  dy: number;
  /** Charge / leap length left (paces). */
  left: number;
  target: number;
  enraged: boolean;
  /** Ticks of the goat head's fury left. */
  buff: number;
  /** Parts: tick a severed part regrows (-1 none), and whether the stump was sealed. */
  regrowAt: number;
  sealed: boolean;
  /** Head / arm strike lunge (ticks left). */
  lunge: number;
  /** Harpy orbit direction (unit vector) and altitude 0 (ground) .. 1 (high). */
  ox: number;
  oy: number;
  alt: number;
  /** Ticks of stun the beast accepts (its own balk); other stuns slide off. */
  stunOk: number;
  trampled: number[];
  /** Level factor (HP and damage over level 1). */
  k: number;
}

const near = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

export class MythSystem {
  readonly b: Battle;
  readonly st = new Map<number, MythState>();
  /** Boulders in flight (and briefly after landing, for the renderer). */
  flights: Flight[] = [];
  /** Fire and venom: unit id -> ticks left and damage per second (raw), source unit. */
  burns = new Map<number, { until: number; dps: number; src: number }>();
  private nextFlight = 1;

  constructor(b: Battle) {
    this.b = b;
    const bodies = new Map<string, MythState>();
    for (const u of b.units) {
      const id = u.stats.boss;
      if (!isMythId(id)) continue;
      const def = MYTHS[id];
      const s: MythState = {
        u, id, def, body: null, parts: [], slot: 0, nSlots: 1, cd: [0, 0, 0], mode: 0, t: 0, tx: u.x, ty: u.y, dx: u.fx, dy: u.fy, left: 0,
        target: -1, enraged: false, buff: 0, regrowAt: -1, sealed: false, lunge: 0, ox: 1, oy: 0, alt: def.flies ? 1 : 0, stunOk: 0, trampled: [],
        k: Math.max(0.5, u.stats.maxHp / Math.max(1, def.hp)),
      };
      u.rad = def.radius;
      this.st.set(u.id, s);
      if (!def.partOf) bodies.set(`${u.side}:${id}`, s);
    }
    // Parts join the body of their kind on their side; flocks get their slots.
    const flock = new Map<string, MythState[]>();
    for (const s of this.st.values()) {
      if (s.def.partOf) {
        const body = bodies.get(`${s.u.side}:${s.def.partOf}`);
        if (body) {
          s.body = body.u;
          s.slot = body.parts.length;
          body.parts.push(s.u);
        }
      } else if (s.def.flies) {
        const key = `${s.u.side}:${s.id}`;
        flock.set(key, [...(flock.get(key) ?? []), s]);
      }
    }
    for (const body of bodies.values()) for (const p of body.parts) this.st.get(p.id)!.nSlots = body.parts.length;
    for (const list of flock.values()) {
      list.forEach((s, i) => {
        s.slot = i;
        s.nSlots = list.length;
        // stagger the first dives; spread the orbit start round the circle
        s.cd[0] = Math.round((2.5 + i * 1.3) * TR);
        let ox = 1;
        let oy = 0;
        for (let k = 0; k < i * 17; k++) [ox, oy] = [ox * ORBIT_C - oy * ORBIT_S, ox * ORBIT_S + oy * ORBIT_C];
        s.ox = ox;
        s.oy = oy;
      });
    }
    for (const s of this.st.values()) {
      // first specials come a little after contact, not at once
      if (!s.def.flies) {
        const sp = s.def.sp;
        s.cd[0] = Math.round(((sp.hurlCd ?? sp.pounceCd ?? sp.chargeCd ?? sp.breathCd ?? sp.grabCd ?? 4) * (s.id === 'minotaur' ? 0.45 : 0.2)) * TR);
        s.cd[1] = Math.round(((sp.stompCd ?? sp.goatCd ?? 4) * 0.6) * TR);
        s.cd[2] = Math.round(((sp.quakeCd ?? sp.tailCd ?? 4) * 0.7) * TR);
      }
    }
    // Starting wounds (world bosses between clan attacks): a part at 0 HP starts severed and sealed.
    for (const s of this.st.values()) {
      if (s.u.hp <= 0) {
        s.u.hp = 0;
        s.u.state = 'dead';
        s.sealed = true;
      }
    }
    this.arrange();
  }

  get(u: SimUnit): MythState | undefined {
    return this.st.get(u.id);
  }

  /** Whether a beast (or part) is on the field: bodies with parts and their arrangement. */
  isBody(u: SimUnit): boolean {
    const s = this.st.get(u.id);
    return !!s && !s.def.partOf;
  }

  // ------------------------------------------------------------------ hooks: targeting, collisions

  /** 0 = cannot be targeted at all (high in the air), 1 = by missiles only (diving), 2 = by anyone. */
  vis(e: SimUnit): number {
    const s = this.st.get(e.id);
    if (!s || !s.def.flies) return 2;
    if (e.state === 'routing') return 0;
    return s.mode === 2 ? 2 : s.mode === 1 ? 1 : 0;
  }

  /** Passes over / through men this tick (no collisions). */
  ghost(u: SimUnit): boolean {
    const s = this.st.get(u.id);
    if (!s) return false;
    if (s.def.flies) return s.mode !== 2 || u.state === 'routing';
    if (s.id === 'nemean_lion' || s.id === 'minotaur') return s.mode === 1;
    return false;
  }

  /** Shove weight of a unit against others (beasts barely move; men are pushed round them). */
  weight(u: SimUnit, w: number): number {
    const s = this.st.get(u.id);
    return s ? s.def.weight : w;
  }

  /** Two units of the same beast never push each other (a hydra and its heads). */
  linked(a: SimUnit, c: SimUnit): boolean {
    const sa = this.st.get(a.id);
    const sb = this.st.get(c.id);
    return !!sa && !!sb && a.side === c.side;
  }

  /** A part's body (if alive and within a few paces of u), else the unit itself. */
  bodyOf(e: SimUnit, u: SimUnit): SimUnit {
    const s = this.st.get(e.id);
    const body = s?.body;
    if (!body || body.state !== 'ready' || near(body, u) > 9) return e;
    return body;
  }

  /** Lay the beasts out on their side of the field (deployment): parts in front of their body. */
  arrange(): void {
    for (const s of this.st.values()) {
      if (s.def.partOf || s.parts.length === 0) continue;
      const u = s.u;
      if (s.def.speed === 0) {
        // rooted at the far edge of its side (the kraken in the shallows)
        u.x = this.b.width / 2;
        u.y = u.side === 1 ? u.rad + 0.4 : this.b.height - u.rad - 0.4;
        u.fx = 0;
        u.fy = u.side === 1 ? 1 : -1;
      }
      this.anchorParts(s);
    }
  }

  // ------------------------------------------------------------------ hooks: damage and death

  /** Raw damage after a beast's immunities; <= 0 means the blow did nothing. */
  onDamage(t: SimUnit, by: SimUnit, raw: number, ranged: boolean): number {
    const s = this.st.get(t.id);
    if (!s) return raw;
    if (ranged) {
      if (s.def.missile <= 0 && by.stats.boss === undefined) {
        this.event(t, 'immune', by.x, by.y, 0, [by.id]);
        return 0;
      }
      if (by.stats.boss === undefined) raw *= s.def.missile;
      if (s.def.flies && (s.mode === 1 || s.mode === 2)) raw *= s.def.sp.diveMissile ?? 1;
    } else if (s.parts.length && by.side !== t.side) {
      // a blade on the body seals the fresh stumps: those heads will not grow back
      for (const p of s.parts) {
        const ps = this.st.get(p.id)!;
        if (p.state === 'dead' && !ps.sealed && ps.regrowAt > this.b.tick) {
          ps.sealed = true;
          this.event(p, 'seal', t.x, t.y, 0, [p.id]);
        }
      }
    }
    return raw;
  }

  /** A beast (or part) was struck down. */
  onKill(t: SimUnit): void {
    const s = this.st.get(t.id);
    if (!s) return;
    if (s.body) {
      if (s.body.state !== 'dead' && s.def.sp.regrow !== 0) {
        const regrow = MYTHS[s.def.partOf!].sp.regrow ?? 0;
        s.regrowAt = regrow > 0 ? this.b.tick + Math.round(regrow * TR) : -1;
        s.sealed = regrow <= 0;
      }
      this.event(t, 'sever', t.x, t.y, 0, []);
      return;
    }
    // the body falls: its heads and arms die with it
    for (const p of s.parts) {
      const ps = this.st.get(p.id)!;
      ps.sealed = true;
      ps.regrowAt = -1;
      if (p.state === 'dead') continue;
      p.hp = 0;
      p.state = 'dead';
      p.engaged = false;
      p.killedBy = t.killedBy;
      this.b.events.push({ type: 'death', tick: this.b.tick, unit: p.id, by: -1 });
    }
    this.flights = this.flights.filter((f) => f.from !== t.id || f.done);
  }

  // ------------------------------------------------------------------ hook: one beast's tick

  update(u: SimUnit): void {
    const s = this.st.get(u.id)!;
    for (let i = 0; i < 3; i++) if (s.cd[i] > 0) s.cd[i]--;
    if (s.buff > 0) s.buff--;
    if (u.stun > 0) {
      if (s.stunOk > 0) {
        s.stunOk--;
        u.stun--;
        u.engaged = false;
        return;
      }
      u.stun = 0; // bashes and charges do not stagger a monster
    }
    s.t++;
    if (s.body) {
      this.updatePart(s);
      return;
    }
    switch (s.id) {
      case 'hydra':
      case 'kraken':
        this.updateHydraBody(s);
        break;
      case 'cyclops':
      case 'titan':
        this.updateGiant(s);
        break;
      case 'harpy':
        this.updateHarpy(s);
        break;
      case 'nemean_lion':
        this.updateLion(s);
        break;
      case 'minotaur':
        this.updateMinotaur(s);
        break;
      case 'chimera':
        this.updateChimera(s);
        break;
      default:
        this.melee(s, 1);
    }
  }

  // ------------------------------------------------------------------ after movement: parts, boulders, fire, terror

  afterMove(): void {
    const b = this.b;
    for (const s of this.st.values()) {
      if (s.def.partOf || s.parts.length === 0) continue;
      this.anchorParts(s);
      if (s.u.state === 'dead') continue;
      // severed parts regrow (unless sealed); wounded ones heal when left alone
      const sp = s.def.sp;
      for (const p of s.parts) {
        const ps = this.st.get(p.id)!;
        if (p.state === 'dead') {
          if (!ps.sealed && ps.regrowAt >= 0 && b.tick >= ps.regrowAt) {
            p.state = 'ready';
            p.hp = p.stats.maxHp;
            p.killedBy = -1;
            p.ko = false;
            p.cooldown = 20;
            p.lastHitTick = b.tick;
            ps.regrowAt = -1;
            this.event(p, 'regrow', p.x, p.y, 0, [p.id]);
          }
          continue;
        }
        if (p.hp < p.stats.maxHp && b.tick - p.lastHitTick > (sp.healDelay ?? 5) * TR) p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * (sp.healRate ?? 0.1) * DT);
      }
    }
    // boulders land
    for (const f of this.flights) {
      if (f.done || b.tick < f.t0 + f.dur) continue;
      f.done = true;
      this.impact(f);
    }
    if (b.tick % 20 === 0) this.flights = this.flights.filter((f) => !f.done || b.tick - (f.t0 + f.dur) < 30);
    // fire and venom burn every half second
    if (b.tick % 10 === 0 && this.burns.size) {
      for (const [id, bn] of [...this.burns]) {
        const t = b.units[id];
        if (!t || !b.isAlive(t) || b.tick >= bn.until) {
          this.burns.delete(id);
          continue;
        }
        b.applyDamage(t, b.units[bn.src], bn.dps * 0.5 / 0.34, 'side', true, 1.4, 1);
      }
    }
    // terror: men near a monster lose heart (Will and Steady Presence resist)
    if (b.tick % 10 === 5) {
      for (const s of this.st.values()) {
        if (s.def.terror <= 0 || s.u.state !== 'ready') continue;
        const r2 = (s.def.terrorRadius + s.u.rad) ** 2;
        for (const e of b.units) {
          if (e.side === s.u.side || e.state !== 'ready' || e.stats.boss !== undefined) continue;
          if ((e.x - s.u.x) ** 2 + (e.y - s.u.y) ** 2 > r2) continue;
          e.morale -= s.def.terror * 0.5 * this.resolve(e) * (s.enraged ? 1.3 : 1);
        }
      }
    }
  }

  /** How much of a beast's terror reaches a man: Will and a Steady Presence aura steel him. */
  resolve(e: SimUnit): number {
    const will = Math.max(0.3, 1 - (e.stats.will - 5) * MYTH_RULES.terrorWill);
    return this.b.ml(e) * will * (e.aura & AURAS.steady.bit ? MYTH_RULES.terrorSteady : 1);
  }

  // ------------------------------------------------------------------ helpers

  private event(u: SimUnit, act: MythAct, tx: number, ty: number, dur: number, targets: number[]): void {
    this.b.events.push({ type: 'myth', tick: this.b.tick, unit: u.id, act, x: u.x, y: u.y, tx, ty, dur, targets });
  }

  /** Living enemies a beast can see and reach (not harpies high in the air). */
  private foes(u: SimUnit, melee: boolean): SimUnit[] {
    const out: SimUnit[] = [];
    for (const e of this.b.units) {
      if (e.side === u.side || e.state !== 'ready') continue;
      const v = this.vis(e);
      if (v === 0 || (melee && v < 2)) continue;
      out.push(e);
    }
    return out;
  }

  private nearest(u: SimUnit, list: SimUnit[]): { e: SimUnit | null; d: number } {
    let e: SimUnit | null = null;
    let d = Infinity;
    for (const x of list) {
      const dd = near(u, x) - x.rad;
      if (dd < d) {
        d = dd;
        e = x;
      }
    }
    return { e, d };
  }

  /** Walk towards a point at a speed (field units / s), turning as it goes. */
  private walk(u: SimUnit, tx: number, ty: number, speed: number, turn = 3): void {
    const dx = tx - u.x;
    const dy = ty - u.y;
    const l = Math.sqrt(dx * dx + dy * dy);
    if (l < 1e-6) return;
    const step = Math.min(speed * DT, l);
    const mx = (dx / l) * step;
    const my = (dy / l) * step;
    this.b.turnToward(u, dx, dy, turn);
    u.vx = mx;
    u.vy = my;
    this.b.moveUnit(u, mx, my);
    this.clampIn(u);
  }

  /** Move without terrain checks (leaps, flight, charges). */
  private fly(u: SimUnit, mx: number, my: number): void {
    u.vx = mx;
    u.vy = my;
    u.x += mx;
    u.y += my;
    this.clampIn(u);
  }

  private clampIn(u: SimUnit): void {
    const r = Math.min(u.rad, 3);
    u.x = Math.max(r, Math.min(this.b.width - r, u.x));
    u.y = Math.max(r, Math.min(this.b.height - r, u.y));
  }

  /** Field units per second at the beast's pace (enraged beasts are faster). */
  private pace(s: MythState): number {
    return s.u.stats.speed * (s.enraged ? s.def.sp.enrageSpeed ?? 1 : 1);
  }

  /** Damage multiplier from fury (enrage, the goat head). */
  private fury(s: MythState): number {
    return (s.enraged ? s.def.sp.enrageDmg ?? 1 : 1) * (s.buff > 0 ? s.def.sp.goatDmg ?? 1 : 1);
  }

  private reachTo(u: SimUnit, e: SimUnit): number {
    return u.stats.reach + u.rad + e.rad;
  }

  /**
   * A beast's blow: a hit roll, the shield, then the damage. `pierce` is how
   * much of a shield's block it ignores; `sure` blows always land (still blockable
   * from the front unless unblockable).
   */
  strike(s: MythState, t: SimUnit, mult: number, o: { pierce?: number; sure?: boolean; unblockable?: boolean; shock?: number; cd?: boolean; ap?: number } = {}): boolean {
    const b = this.b;
    const u = s.u;
    if (o.cd !== false) {
      const tempo = s.enraged ? s.def.sp.enrageTempo ?? 1 : 1;
      u.cooldown = Math.round((u.stats.atkTime * TR) / tempo);
    }
    u.lastAttackTick = b.tick;
    u.targetId = t.id;
    const dir = b.hitDirection(t, u.x, u.y);
    b.contactEvent(b.groups[u.group]);
    b.contactEvent(b.groups[t.group]);
    if (!o.sure && !b.rng.chance(0.62 + (t.stamina < 30 ? 0.08 : 0))) return false;
    if (!o.unblockable && b.blocks(t, u, dir, o.pierce ?? 0.15, false)) {
      t.stamina = Math.max(0, t.stamina - 7);
      t.lastBlockTick = b.tick;
      t.wear.shield += 1;
      t.morale -= 1.5 * b.ml(t);
      b.events.push({ type: 'block', tick: b.tick, unit: t.id, by: u.id });
      return false;
    }
    const dmg = u.stats.dmg * mult * this.fury(s) * b.rng.range(0.8, 1.2) * DIR_DMG[dir];
    b.applyDamage(t, u, dmg, dir, false, MYTH_RULES.blowMorale + u.stats.moraleShock, o.ap);
    // the men around the victim see it
    const shock = o.shock ?? MYTH_RULES.blowShock;
    for (const m of b.units) {
      if (m === t || m.side !== t.side || m.state !== 'ready') continue;
      if ((m.x - t.x) ** 2 + (m.y - t.y) ** 2 < 2.6) m.morale -= shock * b.ml(m);
    }
    return true;
  }

  /** Plain melee: strike the best enemy in reach (the one hitting it, else the closest), or close in. Returns whether something was in reach. */
  private melee(s: MythState, sweep: number, prefer?: (e: SimUnit) => number): boolean {
    const u = s.u;
    const list = this.foes(u, true);
    let best: SimUnit | null = null;
    let bs = -Infinity;
    for (const e of list) {
      const d = near(u, e);
      if (d > this.reachTo(u, e)) continue;
      const front = d > 1e-6 ? ((e.x - u.x) * u.fx + (e.y - u.y) * u.fy) / d : 1;
      const sc = front * 1.5 - d + (e.id === u.targetId ? 0.6 : 0) + (prefer ? prefer(e) : 0);
      if (sc > bs) {
        bs = sc;
        best = e;
      }
    }
    u.engaged = !!best;
    if (!best) return false;
    this.b.turnToward(u, best.x - u.x, best.y - u.y, 4);
    if (u.cooldown <= 0) {
      this.strike(s, best, 1);
      // big blows sweep through more than one man
      let extra = sweep - 1;
      for (const e of list) {
        if (extra <= 0) break;
        if (e === best || e.state !== 'ready') continue;
        if (near(u, e) <= this.reachTo(u, e) && ((e.x - u.x) * u.fx + (e.y - u.y) * u.fy) > 0) {
          this.strike(s, e, 0.8, { cd: false });
          extra--;
        }
      }
    }
    return true;
  }

  /** Close in on the nearest enemy (or a chosen one). */
  private chase(s: MythState, e: SimUnit | null, mult = 1): void {
    if (!e) return;
    const u = s.u;
    const d = near(u, e);
    if (d > this.reachTo(u, e) * 0.85) this.walk(u, e.x, e.y, this.pace(s) * mult, 3);
    else this.b.turnToward(u, e.x - u.x, e.y - u.y, 3);
  }

  /** Enemies (ready) within r of a point. */
  private countNear(side: number, x: number, y: number, r: number): number {
    let n = 0;
    const r2 = r * r;
    for (const e of this.b.units) if (e.side !== side && e.state === 'ready' && this.vis(e) > 0 && (e.x - x) ** 2 + (e.y - y) ** 2 <= r2) n++;
    return n;
  }

  // ------------------------------------------------------------------ the hydra and the kraken (a body with heads / arms)

  private anchorParts(s: MythState): void {
    const u = s.u;
    const sp = s.def.sp;
    const n = s.parts.length;
    const rx = -u.fy;
    const ry = u.fx;
    for (let i = 0; i < n; i++) {
      const p = s.parts[i];
      const ps = this.st.get(p.id)!;
      const lat = n > 1 ? (i / (n - 1) - 0.5) * 2 : 0;
      const fwd = (sp.neck ?? 1.5) * (1 - 0.22 * lat * lat);
      let x = u.x + u.fx * fwd + rx * lat * (sp.spread ?? 1);
      let y = u.y + u.fy * fwd + ry * lat * (sp.spread ?? 1);
      if (ps.lunge > 0 && p.state === 'ready') {
        const t = this.b.units[ps.target];
        if (t) {
          const k = (ps.lunge > 4 ? 8 - ps.lunge : ps.lunge) / 4;
          const dx = t.x - x;
          const dy = t.y - y;
          const l = Math.sqrt(dx * dx + dy * dy) || 1;
          const reach = Math.min(0.6, Math.max(0, l - p.rad - t.rad - 0.1));
          x += (dx / l) * reach * k;
          y += (dy / l) * reach * k;
        }
      }
      p.vx = x - p.x;
      p.vy = y - p.y;
      p.x = x;
      p.y = y;
      if (p.state !== 'ready' || ps.lunge <= 0) {
        p.fx = u.fx;
        p.fy = u.fy;
      }
    }
  }

  private updateHydraBody(s: MythState): void {
    const u = s.u;
    const list = this.foes(u, false);
    if (!list.length) return;
    // face the thickest of the fight, so the heads bear on it
    let cx = 0;
    let cy = 0;
    let n = 0;
    const reachAll = (s.def.sp.neck ?? 1.5) + 3.2;
    for (const e of list) {
      const d = near(u, e);
      if (d > reachAll + 2) continue;
      const w = 1 / (0.5 + d);
      cx += e.x * w;
      cy += e.y * w;
      n += w;
    }
    const { e: ne, d: nd } = this.nearest(u, list);
    if (n > 0) this.b.turnToward(u, cx / n - u.x, cy / n - u.y, 1.6);
    else if (ne) this.b.turnToward(u, ne.x - u.x, ne.y - u.y, 1.6);
    u.engaged = n > 0 && nd < reachAll;
    // the body itself crushes and thrashes at anyone who comes close (its coils, the kraken's beak)
    if (u.stats.dmg > 0 && u.cooldown <= 0) {
      for (const e of list) {
        if (this.vis(e) < 2 || near(u, e) > this.reachTo(u, e)) continue;
        this.strike(s, e, 1, { pierce: 0.2 });
        break;
      }
    }
    if (s.def.speed > 0 && ne && nd > (s.def.sp.neck ?? 1.5) + 0.6) this.walk(u, ne.x, ne.y, this.pace(s), 1.6);
  }

  private updatePart(s: MythState): void {
    const u = s.u;
    const body = s.body!;
    if (s.lunge > 0) s.lunge--;
    if (body.state === 'dead') return;
    const list = this.foes(u, true);
    let best: SimUnit | null = null;
    let bs = -Infinity;
    for (const e of list) {
      const d = near(u, e);
      if (d > this.reachTo(u, e) + 0.4) continue;
      const sc = -d + (e.id === s.target ? 0.8 : 0) + (e.lastAttackTick > this.b.tick - 30 && e.targetId === u.id ? 1 : 0);
      if (sc > bs) {
        bs = sc;
        best = e;
      }
    }
    u.engaged = !!best;
    if (!best) return;
    s.target = best.id;
    this.b.turnToward(u, best.x - u.x, best.y - u.y, 6);
    if (u.cooldown > 0) return;
    s.lunge = 8;
    if (s.id === 'kraken_arm' && s.cd[0] <= 0) {
      // the arm coils round a man, crushes him and drags him towards the maw
      s.cd[0] = Math.round((s.def.sp.grabCd ?? 7) * TR);
      if (this.strike(s, best, 1.4, { sure: true, unblockable: true, shock: 5 }) && best.state === 'ready') {
        best.stun = Math.max(best.stun, 36);
        const dx = body.x - best.x;
        const dy = body.y - best.y;
        const l = Math.sqrt(dx * dx + dy * dy) || 1;
        best.x += (dx / l) * Math.min(1, Math.max(0, l - body.rad - best.rad - 0.2));
        best.y += (dy / l) * Math.min(1, Math.max(0, l - body.rad - best.rad - 0.2));
      }
      this.event(u, 'grab', best.x, best.y, 0, [best.id]);
      return;
    }
    this.strike(s, best, 1, { pierce: 0.1 });
  }

  // ------------------------------------------------------------------ the cyclops and the titan

  private updateGiant(s: MythState): void {
    const u = s.u;
    const sp = s.def.sp;
    this.checkEnrage(s);
    if (s.mode === 1) {
      // winding up a throw: the boulder leaves the hand on the 12th tick
      this.b.turnToward(u, s.tx - u.x, s.ty - u.y, 5);
      if (s.t >= 12) {
        this.hurl(s);
        s.mode = 0;
        s.t = 0;
      }
      return;
    }
    const k = s.k;
    const crowd = this.countNear(u.side, u.x, u.y, (sp.stompRadius ?? 2) + u.rad * 0.6);
    if (s.cd[1] <= 0 && crowd >= (sp.stompMin ?? 3)) {
      // stamp: everyone close is knocked flat
      s.cd[1] = Math.round((sp.stompCd ?? 7) * TR * (s.enraged ? 0.75 : 1));
      const hit: number[] = [];
      const r = (sp.stompRadius ?? 2) + u.rad * 0.6;
      for (const e of this.b.units) {
        if (e.side === u.side || !this.b.isAlive(e) || this.vis(e) < 2) continue;
        const d = near(u, e) - e.rad;
        if (d > r) continue;
        hit.push(e.id);
        this.b.shove(e, u, 0.7);
        if (e.state === 'ready') e.stun = Math.max(e.stun, 14);
        e.morale -= 6 * this.b.ml(e);
        this.b.applyDamage(e, u, (sp.stompDmg ?? 14) * k * this.fury(s) * this.b.rng.range(0.85, 1.15), this.b.hitDirection(e, u.x, u.y), false, 1.3);
      }
      u.lastAttackTick = this.b.tick;
      this.event(u, 'stomp', u.x, u.y, 0, hit);
      return;
    }
    if (s.id === 'titan' && s.cd[2] <= 0 && this.countNear(u.side, u.x, u.y, sp.quakeRadius ?? 8) >= 4) {
      // the earth shakes under the whole army
      s.cd[2] = Math.round((sp.quakeCd ?? 22) * TR);
      const hit: number[] = [];
      const r2 = (sp.quakeRadius ?? 8) ** 2;
      for (const e of this.b.units) {
        if (e.side === u.side || e.state !== 'ready' || this.vis(e) < 2) continue;
        if ((e.x - u.x) ** 2 + (e.y - u.y) ** 2 > r2) continue;
        hit.push(e.id);
        e.stun = Math.max(e.stun, 12);
        e.morale -= 7 * this.resolve(e);
        this.b.applyDamage(e, u, 6 * k, 'side', true, 1, 1);
      }
      u.lastAttackTick = this.b.tick;
      this.event(u, 'quake', u.x, u.y, 0, hit);
      return;
    }
    if (this.melee(s, s.id === 'titan' ? 3 : 2)) return;
    const list = this.foes(u, false);
    if (!list.length) return;
    // boulders at the tightest knot of men in range
    if (s.cd[0] <= 0) {
      const aim = this.cluster(u, list, sp.hurlMin ?? 4, sp.hurlMax ?? 14, 1.8);
      if (aim) {
        s.mode = 1;
        s.t = 0;
        s.tx = aim.x;
        s.ty = aim.y;
        return;
      }
    }
    const { e } = this.nearest(u, list);
    this.chase(s, e);
  }

  /** The enemy standing among the most others within [min, max] of u (tight ranks first). */
  private cluster(u: SimUnit, list: SimUnit[], min: number, max: number, r: number, skip?: { x: number; y: number }): { x: number; y: number; n: number } | null {
    let best: { x: number; y: number; n: number } | null = null;
    let bs = -Infinity;
    for (const e of list) {
      const d = near(u, e);
      if (d < min || d > max) continue;
      if (skip && (e.x - skip.x) ** 2 + (e.y - skip.y) ** 2 < 9) continue;
      const n = this.countNear(u.side, e.x, e.y, r);
      const sc = n - d * 0.03;
      if (sc > bs) {
        bs = sc;
        best = { x: e.x, y: e.y, n };
      }
    }
    return best;
  }

  private hurl(s: MythState): void {
    const u = s.u;
    const sp = s.def.sp;
    const b = this.b;
    s.cd[0] = Math.round((sp.hurlCd ?? 8) * TR * (s.enraged ? 0.75 : 1));
    u.lastAttackTick = b.tick;
    const aims = [{ x: s.tx, y: s.ty }];
    if ((sp.hurlCount ?? 1) > 1) {
      const second = this.cluster(u, this.foes(u, false), sp.hurlMin ?? 4, sp.hurlMax ?? 14, 1.8, aims[0]);
      aims.push(second ? { x: second.x, y: second.y } : { x: s.tx + 1.5, y: s.ty });
    }
    for (const a of aims) {
      const tx = Math.max(0.5, Math.min(b.width - 0.5, a.x + b.rng.range(-0.7, 0.7)));
      const ty = Math.max(0.5, Math.min(b.height - 0.5, a.y + b.rng.range(-0.7, 0.7)));
      const d = Math.sqrt((tx - u.x) ** 2 + (ty - u.y) ** 2);
      const f: Flight = {
        id: this.nextFlight++, from: u.id, sx: u.x, sy: u.y, tx, ty, t0: b.tick, dur: Math.max(14, Math.round((d / 8) * TR)),
        dmg: (sp.hurlDmg ?? 30) * s.k * this.fury(s), radius: sp.hurlRadius ?? 1.8, shove: sp.hurlShove ?? 1.3, shock: sp.hurlShock ?? 12, done: false,
      };
      this.flights.push(f);
      b.events.push({ type: 'myth', tick: b.tick, unit: u.id, act: 'hurl', x: u.x, y: u.y, tx, ty, dur: f.dur, targets: [f.id] });
    }
  }

  /** A boulder lands: men within its radius are struck, thrown aside and stunned; the ranks around it shaken. */
  private impact(f: Flight): void {
    const b = this.b;
    const src = b.units[f.from];
    const hit: number[] = [];
    for (const e of b.units) {
      if (e.side === src.side || !b.isAlive(e) || this.vis(e) < 2) continue;
      const d = Math.max(0, Math.sqrt((e.x - f.tx) ** 2 + (e.y - f.ty) ** 2) - e.rad);
      if (d > f.radius * 2.2) continue;
      if (d > f.radius) {
        if (e.state === 'ready') e.morale -= f.shock * 0.3 * this.b.ml(e);
        continue;
      }
      const k = 1 - (0.6 * d) / f.radius;
      hit.push(e.id);
      // thrown away from the impact (straight out from the centre)
      const dx = e.x - f.tx;
      const dy = e.y - f.ty;
      const l = Math.sqrt(dx * dx + dy * dy);
      const push = f.shove * (1 - d / f.radius) + 0.2;
      const nx = l > 1e-6 ? dx / l : e.id % 2 ? 1 : -1;
      const ny = l > 1e-6 ? dy / l : 0;
      const sx = Math.max(e.rad, Math.min(b.width - e.rad, e.x + nx * push));
      const sy = Math.max(e.rad, Math.min(b.height - e.rad, e.y + ny * push));
      if (!b.terrain || !b.terrain.blocked(sx, sy)) {
        e.x = sx;
        e.y = sy;
      }
      if (e.state === 'ready') {
        e.stun = Math.max(e.stun, 18);
        e.momentum = 0;
        e.morale -= f.shock * k * this.b.ml(e);
      }
      // a boulder is a missile too (the Nemean pelt)
      b.applyDamage(e, src, f.dmg * k * b.rng.range(0.85, 1.15) * (b.pw ? b.pw.missileIn(e) : 1), b.hitDirection(e, f.sx, f.sy), true, 1.2, 0.3);
    }
    b.events.push({ type: 'myth', tick: b.tick, unit: src.id, act: 'boulder', x: src.x, y: src.y, tx: f.tx, ty: f.ty, dur: 0, targets: hit });
  }

  private checkEnrage(s: MythState): void {
    const sp = s.def.sp;
    if (s.enraged || !sp.enrageAt || s.u.hp > s.u.stats.maxHp * sp.enrageAt) return;
    s.enraged = true;
    s.cd[0] = Math.min(s.cd[0], 20);
    this.event(s.u, 'enrage', s.u.x, s.u.y, 0, []);
  }

  // ------------------------------------------------------------------ harpies

  private updateHarpy(s: MythState): void {
    const u = s.u;
    const b = this.b;
    const sp = s.def.sp;
    if (u.state === 'routing') {
      // flee shrieking into the sky, off its own edge
      s.alt = Math.min(1, s.alt + 0.08);
      u.engaged = false;
      const home = u.side === 0 ? 1 : -1;
      this.fly(u, 0, home * u.stats.speed * 1.5 * DT);
      this.b.turnToward(u, 0, home, 6);
      if (u.y <= u.rad + 0.05 || u.y >= b.height - u.rad - 0.05) u.state = 'fled';
      return;
    }
    const list = this.foes(u, false).filter((e) => e.stats.boss === undefined);
    if (!list.length) return;
    // where the prey is: the enemy's missile-men if any, else the whole army
    let cx = 0;
    let cy = 0;
    let n = 0;
    for (const e of list) {
      const w = e.stats.role !== 'melee' ? 3 : 1;
      cx += e.x * w;
      cy += e.y * w;
      n += w;
    }
    cx /= n;
    cy /= n;
    const R = 3.2 + s.slot * 0.3;
    if (s.mode === 0 || s.mode === 3) {
      [s.ox, s.oy] = [s.ox * ORBIT_C - s.oy * ORBIT_S, s.ox * ORBIT_S + s.oy * ORBIT_C];
      const px = Math.max(1, Math.min(b.width - 1, cx + s.ox * R));
      const py = Math.max(1, Math.min(b.height - 1, cy + s.oy * R * 0.8));
      const dx = px - u.x;
      const dy = py - u.y;
      const l = Math.sqrt(dx * dx + dy * dy);
      const step = Math.min(l, u.stats.speed * 1.4 * DT);
      if (l > 1e-6) {
        this.fly(u, (dx / l) * step, (dy / l) * step);
        this.b.turnToward(u, dx, dy, 5);
      }
      u.engaged = false;
      if (s.mode === 3) {
        s.alt = Math.min(1, s.alt + 0.07);
        if (s.t > 14) {
          s.mode = 0;
          s.t = 0;
        }
        return;
      }
      s.alt = 1;
      if (s.cd[0] > 0) return;
      const prey = this.prey(s, list);
      if (!prey) return;
      s.mode = 1;
      s.t = 0;
      s.target = prey.id;
      s.left = near(u, prey);
      this.event(u, 'dive', prey.x, prey.y, 0, [prey.id]);
      return;
    }
    const prey = b.units[s.target];
    if (s.mode === 1) {
      if (!prey || prey.state !== 'ready' || s.t > 50) {
        s.mode = 3;
        s.t = 0;
        return;
      }
      const dx = prey.x - u.x;
      const dy = prey.y - u.y;
      const l = Math.sqrt(dx * dx + dy * dy);
      s.alt = Math.max(0, Math.min(1, (l - 0.8) / Math.max(1, s.left)));
      this.b.turnToward(u, dx, dy, 10);
      if (l <= this.reachTo(u, prey) + 0.1) {
        s.mode = 2;
        s.t = 0;
        s.alt = 0;
        // talons first: a shrieking blow that shakes everyone round
        this.strike(s, prey, 1.5, { sure: true, shock: 5 });
        this.event(u, 'strike', prey.x, prey.y, 0, [prey.id]);
        return;
      }
      const step = Math.min(l - this.reachTo(u, prey) * 0.8, (sp.diveSpeed ?? 9) * DT);
      if (step > 0) this.fly(u, (dx / l) * step, (dy / l) * step);
      return;
    }
    // mode 2: on the ground, clawing, then off again
    s.alt = 0;
    this.b.updateMorale(u, 1);
    if (s.t > (sp.strikeTime ?? 2.4) * TR || u.state !== 'ready') {
      s.mode = 3;
      s.t = 0;
      s.cd[0] = Math.round(((sp.diveCd ?? 5) + s.slot * 0.2) * TR);
      this.event(u, 'climb', u.x, u.y, 0, []);
      return;
    }
    if (!this.melee(s, 1, (e) => (e.stats.role !== 'melee' ? 1 : 0)) && prey && prey.state === 'ready') this.chase(s, prey);
  }

  /** Harpies dive on missile-men and the rear of the army, never the front line. */
  private prey(s: MythState, list: SimUnit[]): SimUnit | null {
    const u = s.u;
    // the enemy army's centre and the way it faces (towards us)
    let cx = 0;
    let cy = 0;
    for (const e of list) {
      cx += e.x;
      cy += e.y;
    }
    cx /= list.length;
    cy /= list.length;
    const home = list[0].side === 0 ? 1 : -1; // their rear is towards their own edge
    let best: SimUnit | null = null;
    let bs = -Infinity;
    for (const e of list) {
      const d = near(u, e);
      if (d > 16) continue;
      let crowd = 0;
      for (const m of list) if (m !== e && m.stats.role === 'melee' && (m.x - e.x) ** 2 + (m.y - e.y) ** 2 < 2.2) crowd++;
      const depth = (e.y - cy) * home;
      const sc = (e.stats.role !== 'melee' ? 4 : 0) + depth * 0.4 - d * 0.08 - crowd * 0.5 + (e.id === s.target ? 0.5 : 0) + (1 - e.hp / e.stats.maxHp);
      if (sc > bs) {
        bs = sc;
        best = e;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ the Nemean lion

  private updateLion(s: MythState): void {
    const u = s.u;
    const b = this.b;
    const sp = s.def.sp;
    if (s.mode === 1) {
      const t = b.units[s.target];
      if (!t || t.state !== 'ready' || s.t > 26) {
        s.mode = 0;
        s.cd[0] = Math.round((sp.pounceCd ?? 6) * TR * 0.5);
        return;
      }
      const dx = t.x - u.x;
      const dy = t.y - u.y;
      const l = Math.sqrt(dx * dx + dy * dy);
      this.b.turnToward(u, dx, dy, 12);
      if (l <= u.rad + t.rad + 0.35) {
        // lands on him: borne down, mauled, the men round him aghast
        s.mode = 0;
        s.cd[0] = Math.round((sp.pounceCd ?? 6) * TR);
        // Unshaken: the lion's leap neither bears him down nor bites as deep
        const ch = b.pw ? b.pw.chargeTaken(t) : null;
        this.strike(s, t, (sp.pounceDmg ?? 2) * (ch?.dmg ?? 1), { sure: true, pierce: 0.35, shock: 4 });
        if (t.state === 'ready') {
          if (!ch || ch.stuns) t.stun = Math.max(t.stun, 30);
          t.morale -= 10 * b.ml(t);
          b.shove(t, u, 0.4);
        }
        this.event(u, 'land', t.x, t.y, 0, [t.id]);
        return;
      }
      const step = Math.min(l - (u.rad + t.rad + 0.3), 9 * DT);
      if (step > 0) this.fly(u, (dx / l) * step, (dy / l) * step);
      return;
    }
    const list = this.foes(u, false);
    if (!list.length) return;
    // a man standing alone within leaping distance: the lion pounces
    if (s.cd[0] <= 0) {
      let best: SimUnit | null = null;
      let bs = -Infinity;
      for (const e of list) {
        const d = near(u, e);
        if (d < 2.4 || d > (sp.pounceRange ?? 7)) continue;
        let friends = 0;
        for (const m of list) if (m !== e && (m.x - e.x) ** 2 + (m.y - e.y) ** 2 < 4.8) friends++;
        if (friends > 1) continue;
        const sc = -friends * 2 - d * 0.3 + (e.stats.role !== 'melee' ? 1 : 0) + (1 - e.hp / e.stats.maxHp);
        if (sc > bs) {
          bs = sc;
          best = e;
        }
      }
      if (best) {
        s.mode = 1;
        s.t = 0;
        s.target = best.id;
        this.event(u, 'pounce', best.x, best.y, 0, [best.id]);
        return;
      }
    }
    if (this.melee(s, 1, (e) => (e.stats.shield === 'none' ? 0.8 : 0))) return;
    // hunt: the man with the fewest friends near him
    let prey: SimUnit | null = null;
    let ps = -Infinity;
    for (const e of list) {
      let friends = 0;
      for (const m of list) if (m !== e && (m.x - e.x) ** 2 + (m.y - e.y) ** 2 < 4.8) friends++;
      const sc = -near(u, e) * 0.5 - friends * 0.7;
      if (sc > ps) {
        ps = sc;
        prey = e;
      }
    }
    this.chase(s, prey, near(u, prey!) > 4 ? 1.5 : 1);
  }

  // ------------------------------------------------------------------ the minotaur

  private updateMinotaur(s: MythState): void {
    const u = s.u;
    const b = this.b;
    const sp = s.def.sp;
    this.checkEnrage(s);
    if (s.mode === 1) {
      const speed = 2 * (sp.chargeSpeed ?? 3) * (s.enraged ? sp.enrageSpeed ?? 1 : 1);
      const step = Math.min(s.left, speed * DT);
      this.fly(u, s.dx * step, s.dy * step);
      s.left -= step;
      this.b.turnToward(u, s.dx, s.dy, 10);
      const hit: number[] = [];
      for (const e of b.units) {
        if (e.side === u.side || !b.isAlive(e) || this.vis(e) < 2 || s.trampled.includes(e.id)) continue;
        if (near(u, e) > u.rad + e.rad + 0.2) continue;
        s.trampled.push(e.id);
        const g = b.groups[e.group];
        const braced = e.state === 'ready' && g.shieldWall && e.stats.canShieldWall && e.stats.weapon === 'spear' && this.facing(e, u) > 0.3 && (!b.terrain || !b.terrain.at(e.x, e.y).noWall);
        if (braced) {
          // a hedge of braced spears: the bull is stopped dead and takes the points
          let counter = 0;
          const spears = [e];
          for (const m of b.units) {
            if (spears.length >= 3) break;
            if (m === e || m.side !== e.side || m.state !== 'ready' || m.stats.weapon !== 'spear') continue;
            if ((m.x - e.x) ** 2 + (m.y - e.y) ** 2 < 2 && b.groups[m.group].shieldWall && this.facing(m, u) > 0.2) spears.push(m);
          }
          for (const m of spears) {
            counter += m.stats.dmg * (1 + m.stats.chargeBonus * MYTH_RULES.braceCounter) * b.rng.range(0.8, 1.2);
            m.lastAttackTick = b.tick;
          }
          s.mode = 0;
          s.left = 0;
          s.stunOk = MYTH_RULES.braceStun;
          u.stun = MYTH_RULES.braceStun;
          e.stamina = Math.max(0, e.stamina - 12);
          e.morale -= 3 * b.ml(e);
          this.event(u, 'balk', e.x, e.y, 0, spears.map((m) => m.id));
          b.applyDamage(u, e, counter * 1.4, 'front', false, 1);
          return;
        }
        hit.push(e.id);
        const ch = b.pw ? b.pw.chargeTaken(e) : null;
        if (e.state === 'ready') {
          if (!ch || ch.stuns) e.stun = Math.max(e.stun, 16);
          e.momentum = 0;
          e.morale -= 8 * b.ml(e);
        }
        // tossed aside, off the line of the charge
        const side = (e.x - u.x) * -s.dy + (e.y - u.y) * s.dx >= 0 ? 1 : -1;
        const sx = Math.max(e.rad, Math.min(b.width - e.rad, e.x - s.dy * side * 0.9));
        const sy = Math.max(e.rad, Math.min(b.height - e.rad, e.y + s.dx * side * 0.9));
        if (!b.terrain || !b.terrain.blocked(sx, sy)) {
          e.x = sx;
          e.y = sy;
        }
        b.contactEvent(b.groups[u.group]);
        b.applyDamage(e, u, (sp.chargeDmg ?? 20) * s.k * this.fury(s) * b.rng.range(0.85, 1.15) * (ch?.dmg ?? 1), b.hitDirection(e, u.x, u.y), false, 1.6);
      }
      if (hit.length) {
        u.lastAttackTick = b.tick;
        this.event(u, 'trample', u.x, u.y, 0, hit);
      }
      if (s.left <= 0 || s.t > 60) {
        s.mode = 0;
        s.t = 0;
      }
      return;
    }
    const list = this.foes(u, false);
    if (!list.length) return;
    if (s.cd[0] <= 0) {
      const aim = this.cluster(u, list, sp.chargeMin ?? 3, sp.chargeMax ?? 12, 1.6);
      if (aim) {
        const dx = aim.x - u.x;
        const dy = aim.y - u.y;
        const l = Math.sqrt(dx * dx + dy * dy) || 1;
        s.mode = 1;
        s.t = 0;
        s.dx = dx / l;
        s.dy = dy / l;
        s.left = l + 3;
        s.trampled = [];
        s.cd[0] = Math.round((sp.chargeCd ?? 9) * TR * (s.enraged ? 0.5 : 1));
        this.event(u, 'charge', aim.x, aim.y, 0, []);
        return;
      }
    }
    if (this.melee(s, 2)) return;
    this.chase(s, this.nearest(u, list).e);
  }

  /** How squarely e faces u (1 = straight at it). */
  private facing(e: SimUnit, u: SimUnit): number {
    const dx = u.x - e.x;
    const dy = u.y - e.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    return (dx * e.fx + dy * e.fy) / d;
  }

  // ------------------------------------------------------------------ the chimera

  private updateChimera(s: MythState): void {
    const u = s.u;
    const sp = s.def.sp;
    if (s.mode === 1) {
      this.b.turnToward(u, s.dx, s.dy, 8);
      if (s.t >= 10) {
        this.breathe(s);
        s.mode = 0;
        s.t = 0;
      }
      return;
    }
    const list = this.foes(u, false);
    if (!list.length) return;
    // the serpent tail lashes at anyone behind or beside the beast
    if (s.cd[2] <= 0) {
      for (const e of list) {
        if (this.vis(e) < 2) continue;
        const d = near(u, e);
        if (d > this.reachTo(u, e) + 0.5) continue;
        const front = ((e.x - u.x) * u.fx + (e.y - u.y) * u.fy) / (d || 1);
        if (front > -0.2) continue;
        s.cd[2] = Math.round((sp.tailCd ?? 2) * TR);
        if (this.strike(s, e, (sp.tailDmg ?? 16) / Math.max(1, u.stats.dmg / s.k), { cd: false, pierce: 0.3 })) this.burn(e, u, (sp.burnDps ?? 2) * 0.7 * s.k, 2);
        this.event(u, 'tail', e.x, e.y, 0, [e.id]);
        break;
      }
    }
    // the goat head bleats: fury and a second wind
    if (s.cd[1] <= 0 && this.countNear(u.side, u.x, u.y, 3) >= 2) {
      s.cd[1] = Math.round((sp.goatCd ?? 15) * TR);
      s.buff = Math.round((sp.goatTime ?? 6) * TR);
      u.hp = Math.min(u.stats.maxHp, u.hp + u.stats.maxHp * 0.04);
      const hit: number[] = [];
      for (const e of list) {
        if ((e.x - u.x) ** 2 + (e.y - u.y) ** 2 > 16) continue;
        e.morale -= 2 * this.resolve(e);
        hit.push(e.id);
      }
      this.event(u, 'goat', u.x, u.y, 0, hit);
    }
    // fire on the thickest knot of men in front
    if (s.cd[0] <= 0) {
      const R = sp.breathRange ?? 4.5;
      const cone = sp.breathCone ?? 0.55;
      let best: { dx: number; dy: number; n: number } | null = null;
      for (const e of list) {
        const d = near(u, e);
        if (d > R + u.rad || d < 1e-6) continue;
        const dx = (e.x - u.x) / d;
        const dy = (e.y - u.y) / d;
        let n = 0;
        for (const m of list) {
          const dm = near(u, m);
          if (dm > R + u.rad + m.rad || dm < 1e-6) continue;
          if (((m.x - u.x) * dx + (m.y - u.y) * dy) / dm >= cone) n++;
        }
        if (!best || n > best.n) best = { dx, dy, n };
      }
      if (best && (best.n >= 2 || u.hp < u.stats.maxHp * 0.5)) {
        s.mode = 1;
        s.t = 0;
        s.dx = best.dx;
        s.dy = best.dy;
        s.cd[0] = Math.round((sp.breathCd ?? 8) * TR);
        return;
      }
    }
    if (this.melee(s, 1)) return;
    this.chase(s, this.nearest(u, list).e);
  }

  private breathe(s: MythState): void {
    const u = s.u;
    const b = this.b;
    const sp = s.def.sp;
    const R = sp.breathRange ?? 4.5;
    const cone = sp.breathCone ?? 0.55;
    const hit: number[] = [];
    for (const e of b.units) {
      if (e.side === u.side || !b.isAlive(e) || this.vis(e) < 1) continue;
      const d = near(u, e);
      if (d > R + u.rad + e.rad || d < 1e-6) continue;
      if (((e.x - u.x) * s.dx + (e.y - u.y) * s.dy) / d < cone) continue;
      hit.push(e.id);
      // a shield wall turned to the flames takes the worst of it
      const g = b.groups[e.group];
      const walled = g.shieldWall && e.stats.canShieldWall && this.facing(e, u) > 0.3;
      const k = walled ? 0.5 : 1;
      if (e.state === 'ready') e.morale -= 6 * k * this.resolve(e);
      b.applyDamage(e, u, (sp.breathDmg ?? 9) * s.k * this.fury(s) * k * b.rng.range(0.85, 1.15), b.hitDirection(e, u.x, u.y), true, 1.5, 0.6);
      if (b.isAlive(e)) this.burn(e, u, (sp.burnDps ?? 2.5) * s.k * k, sp.burnTime ?? 3);
    }
    u.lastAttackTick = b.tick;
    b.contactEvent(b.groups[u.group]);
    b.events.push({ type: 'myth', tick: b.tick, unit: u.id, act: 'breath', x: u.x, y: u.y, tx: u.x + s.dx * (R + u.rad), ty: u.y + s.dy * (R + u.rad), dur: 0, targets: hit });
  }

  private burn(e: SimUnit, src: SimUnit, dps: number, secs: number): void {
    const cur = this.burns.get(e.id);
    const until = this.b.tick + Math.round(secs * TR);
    if (cur && cur.until > until && cur.dps >= dps) return;
    this.burns.set(e.id, { until, dps: Math.max(dps, cur && cur.until > this.b.tick ? cur.dps : 0), src: src.id });
  }

  // ------------------------------------------------------------------ state fingerprint

  hash(mix: (v: number) => void): void {
    for (const s of this.st.values()) {
      mix(s.mode);
      mix(s.t);
      mix(s.cd[0]);
      mix(s.cd[1]);
      mix(s.cd[2]);
      mix(s.buff);
      mix(s.regrowAt);
      mix(s.sealed ? 1 : 0);
      mix(s.enraged ? 1 : 0);
    }
    for (const f of this.flights) {
      mix(f.tx);
      mix(f.ty);
    }
    for (const [id, bn] of this.burns) {
      mix(id);
      mix(bn.until);
    }
  }
}

/** Whether a setup's units include a mythical beast (the Battle then creates a MythSystem). */
export function hasMyth(stats: readonly { boss?: string }[]): boolean {
  return stats.some((s) => isMythId(s.boss));
}
