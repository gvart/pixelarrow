/**
 * Item powers, set special lines and the named items' extras in battle
 * (docs/ITEMS.md "Powers", "Sets", "Named legendaries"). Deterministic like
 * the rest of src/sim: every chance is drawn from the battle's seeded RNG,
 * state lives here per unit and goes into Battle.hash().
 *
 * The Battle creates a PowerSystem only when some unit carries a power, a set
 * special or a named extra, and calls it from a handful of hooks:
 *
 *   tick()                 timers, the auras (Steadfast, Bond of the Band,
 *                          Born to Rule) and War Cry;
 *   dmgOut / onHit         the wearer's own weapon hits: damage multipliers,
 *                          Blood Price, Wolf's Hunger, Sunder, Rend Armour;
 *   dmgIn / afterDamage    any damage taken: Heel of Achilles, Retribution,
 *                          Second Wind;
 *   onKill                 Battle Frenzy, Terror;
 *   aegis / eagleEye       the shield roll; extraShots after a shot (Twin
 *                          Shot, Rain of Arrows); charge hooks (Momentum,
 *                          Unshaken, War Cry's shock).
 *
 * Without any of these none of it runs, so old setups replay exactly as before.
 */
import type { Battle } from './battle';
import type { HitDir, SimUnit } from './types';
import { POWERS, type PowerGrade, type PowerId } from '../data/affixes';
import { SET_RULES, type SetSpecial } from '../data/sets';

const TR = 20; // ticks per second (src/sim/battle.ts TICK_RATE)
/** HP fractions: Second Wind fires below the first, Last Stand holds below the second, Executioner bites below the third. */
export const POWER_RULES = { secondWindAt: 0.3, lastStandAt: 0.25, executeAt: 0.3, rendStacks: 2 };
/** The same proc shows its icon over one man at most this often (ticks); display only, the sim is unaffected. */
const PROC_FX_GAP = 30;

export type ProcId = PowerId | SetSpecial;

interface PState {
  /** Powers carried, with their numbers at the carried grade. */
  pow: Map<PowerId, PowerGrade>;
  sets: Set<SetSpecial>;
  frenzyT: number;
  frenzy: number;
  /** Sunder suffered: ticks left, and the max HP taken away (given back when it ends). */
  sunderT: number;
  sunderHp: number;
  /** Rend Armour suffered: ticks left, stacks, armour taken away. */
  rendT: number;
  rendN: number;
  rendArmor: number;
  /** Second Wind spent; War Cry sounded. */
  windUsed: boolean;
  cried: boolean;
  /** Aegis: ticks until the next sure block (0 = ready). */
  aegisCd: number;
  /** Rain of Arrows: shots loosed. */
  shots: number;
  // auras, refreshed every half second
  /** Morale damage taken shrinks by this (Steadfast). */
  steady: number;
  /** Other Sacred Band wearers close by (Bond of the Band). */
  bond: number;
  /** Within Born to Rule's reach; his group cannot rout while the king stands. */
  rule: boolean;
  noRout: boolean;
  /** Display only: last tick each proc showed its icon. */
  shown: Map<ProcId, number>;
}

function fresh(): PState {
  return {
    pow: new Map(), sets: new Set(), frenzyT: 0, frenzy: 0, sunderT: 0, sunderHp: 0, rendT: 0, rendN: 0, rendArmor: 0,
    windUsed: false, cried: false, aegisCd: 0, shots: 0, steady: 0, bond: 0, rule: false, noRout: false, shown: new Map(),
  };
}

/** Whether any unit's stats carry something this system runs. */
export function hasPowers(stats: readonly { powers?: unknown; setSpecials?: unknown; missileWard?: number; shroud?: number }[]): boolean {
  return stats.some((s) => (Array.isArray(s.powers) && s.powers.length > 0) || (Array.isArray(s.setSpecials) && s.setSpecials.length > 0) || !!s.missileWard || !!s.shroud);
}

export class PowerSystem {
  private st: PState[];
  /** Units that project an aura or wait to sound War Cry (iterated each refresh). */
  private auraSrc: number[] = [];

  constructor(private b: Battle) {
    this.st = b.units.map((u) => {
      const s = fresh();
      for (const p of Array.isArray(u.stats.powers) ? u.stats.powers : []) {
        // setups come from clients: unknown powers are ignored, grades clamped
        if (!p || typeof p.id !== 'string' || !(p.id in POWERS)) continue;
        s.pow.set(p.id, POWERS[p.id].grades[p.grade === 1 ? 1 : 0]);
      }
      for (const sp of Array.isArray(u.stats.setSpecials) ? u.stats.setSpecials : []) if (typeof sp === 'string' && sp in SET_RULES_KEYS) s.sets.add(sp);
      if (s.pow.has('steadfast') || s.sets.has('bond_of_the_band') || s.sets.has('born_to_rule') || s.sets.has('war_cry')) this.auraSrc.push(u.id);
      return s;
    });
  }

  private g(u: SimUnit, id: PowerId): PowerGrade | undefined {
    return this.st[u.id]?.pow.get(id);
  }

  private has(u: SimUnit, sp: SetSpecial): boolean {
    return this.st[u.id]?.sets.has(sp) ?? false;
  }

  /** A proc for the renderer (the power's icon over the man). */
  private proc(u: SimUnit, id: ProcId, targets: number[] = []): void {
    const s = this.st[u.id];
    const last = s.shown.get(id);
    if (last !== undefined && this.b.tick - last < PROC_FX_GAP) return;
    s.shown.set(id, this.b.tick);
    this.b.events.push({ type: 'proc', tick: this.b.tick, unit: u.id, power: id, targets });
  }

  // ------------------------------------------------------------------ every tick

  tick(): void {
    const b = this.b;
    for (const u of b.units) {
      const s = this.st[u.id];
      if (s.frenzyT > 0) s.frenzyT--;
      if (s.aegisCd > 0) s.aegisCd--;
      if (s.rendT > 0 && --s.rendT === 0) {
        s.rendN = 0;
        s.rendArmor = 0;
      }
      if (s.sunderT > 0 && --s.sunderT === 0) {
        u.stats.maxHp += s.sunderHp;
        s.sunderHp = 0;
      }
    }
    for (const id of this.auraSrc) this.warCry(b.units[id]);
    if (b.tick % 10 === 1) this.auras();
  }

  /** War Cry: the first time the foe comes within reach, the enemies there lose heart. */
  private warCry(u: SimUnit): void {
    const s = this.st[u.id];
    if (s.cried || u.state !== 'ready' || !s.sets.has('war_cry')) return;
    const R = SET_RULES.warCry;
    const r2 = R.radius * R.radius;
    const hit: number[] = [];
    for (const e of this.b.units) {
      if (e.side === u.side || e.state !== 'ready') continue;
      if ((e.x - u.x) ** 2 + (e.y - u.y) ** 2 <= r2) hit.push(e.id);
    }
    if (!hit.length) return;
    s.cried = true;
    for (const id of hit) {
      const e = this.b.units[id];
      e.morale -= R.morale * this.b.ml(e);
    }
    this.proc(u, 'war_cry', hit);
  }

  /** Steadfast, Bond of the Band and Born to Rule: who stands near whom (every half second). */
  private auras(): void {
    const b = this.b;
    for (const s of this.st) {
      s.steady = 0;
      s.bond = 0;
      s.rule = false;
      s.noRout = false;
    }
    const kingGroups = new Set<number>();
    for (const id of this.auraSrc) {
      const src = b.units[id];
      if (src.state !== 'ready') continue;
      const ss = this.st[id];
      const sf = ss.pow.get('steadfast');
      const sfR = (sf?.extra ?? 0) ** 2;
      const bond = ss.sets.has('bond_of_the_band');
      const bondR = SET_RULES.bond.radius ** 2;
      const king = ss.sets.has('born_to_rule');
      const kingR = SET_RULES.born.radius ** 2;
      if (king) kingGroups.add(src.group);
      for (const a of b.units) {
        if (a.side !== src.side || a.state !== 'ready') continue;
        const d2 = (a.x - src.x) ** 2 + (a.y - src.y) ** 2;
        const sa = this.st[a.id];
        if (sf && d2 <= sfR) sa.steady = Math.max(sa.steady, sf.value ?? 0);
        if (bond && a !== src && d2 <= bondR && sa.sets.has('bond_of_the_band')) sa.bond = Math.min(SET_RULES.bond.max, sa.bond + 1);
        if (king && d2 <= kingR) sa.rule = true;
      }
    }
    if (kingGroups.size) for (const a of b.units) if (kingGroups.has(a.group)) this.st[a.id].noRout = true;
  }

  // ------------------------------------------------------------------ morale

  /** Morale damage multiplier (Steadfast). */
  ml(u: SimUnit): number {
    return 1 - this.st[u.id].steady;
  }

  /**
   * Whether a man keeps his feet whatever his morale (Last Stand, Born to
   * Rule's group), and the morale an ally of the king counts on top of his own.
   */
  rout(u: SimUnit): { hold: boolean; bonus: number } {
    const s = this.st[u.id];
    const ls = s.pow.has('last_stand') && u.hp < u.stats.maxHp * POWER_RULES.lastStandAt;
    if (ls) this.proc(u, 'last_stand');
    return { hold: ls || s.noRout, bonus: s.rule ? SET_RULES.born.morale : 0 };
  }

  // ------------------------------------------------------------------ dealing damage

  /** Attack tempo multiplier (Battle Frenzy): cooldowns are divided by it. */
  tempo(u: SimUnit): number {
    const s = this.st[u.id];
    return s.frenzyT > 0 ? 1 + s.frenzy : 1;
  }

  /** The wearer's own blow or missile on t: damage multipliers, and Blood Price on melee. */
  dmgOut(u: SimUnit, t: SimUnit, dmg: number, ranged: boolean): number {
    const s = this.st[u.id];
    let m = 1;
    const ls = s.pow.get('last_stand');
    // (an arrow still in flight when its archer fell does not count as his last stand)
    if (ls && u.hp > 0 && u.hp < u.stats.maxHp * POWER_RULES.lastStandAt) m += ls.value ?? 0;
    const ex = s.pow.get('executioner');
    if (ex && t.hp < t.stats.maxHp * POWER_RULES.executeAt) {
      m += ex.value ?? 0;
      this.proc(u, 'executioner', [t.id]);
    }
    if (s.bond) m += s.bond * SET_RULES.bond.dmg;
    if (s.rule) m += SET_RULES.born.dmg;
    const bp = ranged ? undefined : s.pow.get('blood_price');
    if (bp && this.b.rng.chance(bp.chance ?? 0)) {
      m *= 2;
      u.hp = Math.max(1, u.hp - u.stats.maxHp * (bp.extra ?? 0));
      this.proc(u, 'blood_price', [t.id]);
    }
    return dmg * m;
  }

  /** After the wearer's blow or missile dealt `dealt` to t: Wolf's Hunger, Sunder, Rend Armour. */
  onHit(u: SimUnit, t: SimUnit, dealt: number, ranged: boolean): void {
    if (dealt <= 0) return;
    const s = this.st[u.id];
    const hu = ranged ? undefined : s.pow.get('hunger');
    if (hu && this.b.isAlive(u)) u.hp = Math.min(u.stats.maxHp, u.hp + dealt * (hu.value ?? 0));
    if (t.state === 'dead') return;
    const su = s.pow.get('sunder');
    if (su && this.b.rng.chance(su.chance ?? 0)) {
      const ts = this.st[t.id];
      // a man (or a beast) is sundered once at a time: a new proc only refreshes it
      if (ts.sunderT <= 0) {
        ts.sunderHp = t.stats.maxHp * (su.value ?? 0);
        t.stats.maxHp -= ts.sunderHp;
        t.hp = Math.min(t.hp, t.stats.maxHp);
      }
      ts.sunderT = Math.round((su.time ?? 0) * TR);
      this.proc(u, 'sunder', [t.id]);
    }
    const re = s.pow.get('rend');
    if (re && this.b.rng.chance(re.chance ?? 0)) {
      const ts = this.st[t.id];
      if (ts.rendN < POWER_RULES.rendStacks) {
        ts.rendN++;
        ts.rendArmor += re.value ?? 0;
      }
      ts.rendT = Math.round((re.time ?? 0) * TR);
      this.proc(u, 'rend', [t.id]);
    }
  }

  /** On a kill: Battle Frenzy, Terror. */
  onKill(by: SimUnit, t: SimUnit): void {
    const s = this.st[by.id];
    const fr = s.pow.get('frenzy');
    if (fr && by.state === 'ready') {
      s.frenzyT = Math.round((fr.time ?? 0) * TR);
      s.frenzy = fr.value ?? 0;
      this.proc(by, 'frenzy');
    }
    const te = s.pow.get('terror');
    if (te) {
      const r2 = (te.extra ?? 0) ** 2;
      const hit: number[] = [];
      for (const e of this.b.units) {
        if (e.side === by.side || e.state !== 'ready') continue;
        if ((e.x - t.x) ** 2 + (e.y - t.y) ** 2 > r2) continue;
        e.morale -= (te.value ?? 0) * this.b.ml(e);
        hit.push(e.id);
      }
      this.proc(by, 'terror', hit);
    }
  }

  // ------------------------------------------------------------------ taking damage

  /** Armour taken away by Rend Armour. */
  rended(t: SimUnit): number {
    return this.st[t.id].rendArmor;
  }

  /** Max HP Sunder holds back from t (given back when it ends). */
  sundered(t: SimUnit): number {
    return this.st[t.id].sunderHp;
  }

  /** Raw damage on t by direction (Heel of Achilles). */
  dmgIn(t: SimUnit, raw: number, dir: HitDir): number {
    if (!this.has(t, 'heel_of_achilles')) return raw;
    return raw * (dir === 'rear' ? SET_RULES.heel.rear : SET_RULES.heel.front);
  }

  /** A missile's damage on t (the Nemean pelt). */
  missileIn(t: SimUnit): number {
    return 1 - (t.stats.missileWard ?? 0);
  }

  /** Accuracy an enemy missile loses against t (the Helm of Hades). */
  shroud(t: SimUnit): number {
    return t.stats.shroud ?? 0;
  }

  /** After t took `dmg` from by: Retribution on melee attackers, Second Wind. */
  afterDamage(t: SimUnit, by: SimUnit, dmg: number, ranged: boolean): void {
    const s = this.st[t.id];
    const rt = s.pow.get('retribution');
    if (rt && !ranged && by !== t && by.side !== t.side && this.b.isAlive(by)) {
      // a flat share of the blow: armour does not stop it, and it never reflects again
      const back = dmg * (rt.value ?? 0);
      by.hp -= back;
      by.lastHitTick = this.b.tick;
      t.dmgDealt += back;
      this.b.events.push({ type: 'hit', tick: this.b.tick, unit: by.id, by: t.id, dmg: back, dir: 'front', ranged: false });
      this.proc(t, 'retribution', [by.id]);
      if (by.hp <= 0) this.b.kill(by, t);
    }
    const sw = s.pow.get('second_wind');
    if (sw && !s.windUsed && t.hp > 0 && this.b.isAlive(t) && t.hp < t.stats.maxHp * POWER_RULES.secondWindAt) {
      s.windUsed = true;
      t.hp = Math.min(t.stats.maxHp, t.hp + t.stats.maxHp * (sw.value ?? 0));
      t.stamina = Math.min(t.stats.stamina, t.stamina + (sw.extra ?? 0));
      this.proc(t, 'second_wind');
    }
  }

  // ------------------------------------------------------------------ shields and missiles

  /** Aegis: a ready shield turns the next front or side hit for sure. */
  aegis(t: SimUnit, dir: HitDir): boolean {
    const ae = this.g(t, 'aegis');
    if (!ae || dir === 'rear' || t.state !== 'ready' || t.stats.shield === 'none' || t.daze > 0) return false;
    const s = this.st[t.id];
    if (s.aegisCd > 0) return false;
    s.aegisCd = Math.round((ae.time ?? 0) * TR);
    this.proc(t, 'aegis');
    return true;
  }

  /** Eagle Eye: this missile ignores the shield (rolled only when there is a shield to ignore). */
  eagleEye(shooter: SimUnit, chance: number): boolean {
    const ee = this.g(shooter, 'eagle_eye');
    if (!ee || chance <= 0 || !this.b.rng.chance(ee.chance ?? 0)) return false;
    this.proc(shooter, 'eagle_eye');
    return true;
  }

  /** Extra block chance (Bond of the Band). */
  blockBonus(t: SimUnit): number {
    return this.st[t.id].bond * SET_RULES.bond.block;
  }

  /** Free missiles after a shot: Rain of Arrows every few shots, Twin Shot by chance. */
  extraShots(u: SimUnit): number {
    const s = this.st[u.id];
    let n = 0;
    if (s.sets.has('rain_of_arrows') && ++s.shots % SET_RULES.rain.every === 0) {
      n += SET_RULES.rain.arrows;
      this.proc(u, 'rain_of_arrows');
    }
    const ts = s.pow.get('twin_shot');
    if (ts && this.b.rng.chance(ts.chance ?? 0)) {
      n++;
      this.proc(u, 'twin_shot');
    }
    return n;
  }

  // ------------------------------------------------------------------ charges

  /** A charge impact by u on t: damage multiplier, extra stun (ticks), extra morale shock, and whether t is stunned at all. */
  charge(u: SimUnit, t: SimUnit): { dmg: number; stun: number; shock: number; stuns: boolean } {
    const mo = this.g(u, 'momentum');
    const un = this.g(t, 'unshaken');
    if (mo) this.proc(u, 'momentum', [t.id]);
    if (un) this.proc(t, 'unshaken');
    return {
      dmg: (1 + (mo?.value ?? 0)) * (1 - (un?.value ?? 0)),
      stun: Math.round((mo?.extra ?? 0) * TR),
      shock: this.has(u, 'war_cry') ? SET_RULES.warCry.shock : 0,
      stuns: !un,
    };
  }

  /** A beast's charge or leap on t (src/sim/myth.ts): damage multiplier and whether it stuns. */
  chargeTaken(t: SimUnit): { dmg: number; stuns: boolean } {
    const un = this.g(t, 'unshaken');
    if (un) this.proc(t, 'unshaken');
    return { dmg: 1 - (un?.value ?? 0), stuns: !un };
  }

  // ------------------------------------------------------------------ state fingerprint

  hash(mix: (v: number) => void): void {
    for (const s of this.st) {
      mix(s.frenzyT);
      mix(s.sunderT);
      mix(s.rendT);
      mix(s.rendN);
      mix(s.aegisCd);
      mix(s.shots);
      mix(s.windUsed ? 1 : 0);
      mix(s.cried ? 1 : 0);
    }
  }
}

const SET_RULES_KEYS: Record<SetSpecial, true> = { war_cry: true, rain_of_arrows: true, bond_of_the_band: true, heel_of_achilles: true, born_to_rule: true };
