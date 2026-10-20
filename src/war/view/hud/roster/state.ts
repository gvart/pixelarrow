/**
 * The sandbox's soldier roster (M5g): the local in-memory roster of M5b (../../../sim/roster.ts) until the server keeps
 * persons (M5e). The player's (team 0, not bot) squads spawn with its persons: fit men of the class from the reserve
 * first, then new recruits with names. The sim's event log comes in as it happens; a fight ends 5 s after the player's
 * last blow or fall (or on End fight), and its report is written back. Changes off the field (a level-up choice, dev XP)
 * go to the live man too (setPerson), so the next report does not undo them.
 */
import { CIV_CLASSES, CLASSES, isCivClass, isClassId } from '../../../../data/classes';
import { freeName } from '../../../../data/names';
import { xpToNext } from '../../../../data/units';
import { applyOffer, createRoster, grantXp, levelOffers, makePerson, type LevelOffer, type Roster } from '../../../sim/roster';
import { SQUAD_MAX } from '../../../sim/soldiers';
import type { FightReport, PersonResult, UnitSnap, WarEvent, WarPerson } from '../../../types';
import type { SandboxScene } from '../../SandboxScene';

export type Where = 'field' | 'reserve' | 'wounded' | 'captive' | 'dead';
/** A person as the panel shows him: where he is, his live man (in the field) and his squad. */
export interface Row { p: WarPerson; where: Where; unit?: UnitSnap; squad?: number }
export interface Note { kind: 'levelUp' | 'capture' | 'dead' | 'info'; pid?: string; text: string }

/** A fight ends this many ticks after the player's last blow or fall. */
const QUIET = 50;
const rosters = new WeakMap<SandboxScene, SandboxRoster>();

/** The scene's roster (made on first call; call before the scenario spawns, so its squads get persons). */
export function sandboxRoster(s: SandboxScene): SandboxRoster {
  let r = rosters.get(s);
  if (!r) rosters.set(s, (r = new SandboxRoster(s)));
  return r;
}

export class SandboxRoster {
  readonly roster: Roster = createRoster();
  /** Persons sent to the field (until the fight that took them is reported). */
  private sent = new Set<string>();
  private captor = new Map<string, number>();
  private names = new Set<string>();
  private n = 0;
  /** The tick of the player's last blow or fall in the current fight (-1: no fight). */
  private lastAction = -1;
  private ending = false;
  onNote: ((n: Note) => void) | null = null;
  onChange: (() => void) | null = null;

  constructor(private s: SandboxScene) {
    this.seed();
    s.sim.personsFor = (owner, team, cls, count) => (team === 0 && owner !== 'bot' ? this.take(cls, Math.min(count, SQUAD_MAX)) : undefined);
    s.sim.onEvents = (ev) => this.events(ev);
    setInterval(() => this.watch(), 250);
  }

  /** A veteran reserve to browse before any fight: one of each trained class, levels 2..7, a pending level-up among them. */
  private seed(): void {
    const seed: [string, number, number, string?][] = [
      ['hoplite', 6, 1, 'Held the Ford'], ['hoplite', 4, 1], ['archer', 7, 2, 'Veteran of Kleisoura'], ['celt_sword', 3, 0], ['slinger', 2, 0], ['javelineer', 5, 1],
    ];
    for (const [cls, level, tier, honour] of seed) {
      const p = this.recruit(cls, { level, tier, rarity: level >= 6 ? 'rare' : level >= 4 ? 'uncommon' : 'common' });
      if (honour) this.roster.update({ ...p, honours: [{ name: honour, stat: cls === 'archer' ? 'accuracy' : 'block' }] });
    }
    // one man just levelled: his slot and points wait for a choice
    const fresh = this.recruit('militia', { level: 2 });
    this.roster.update(grantXp({ ...fresh, skills: [] }, xpToNext(2)));
    // M5h household: a civilian of each class with a few profession nodes (the smith can make a sword), points left to spend
    const civs: [string, number, string[]][] = [
      ['civ_smith', 4, ['bladesmith']], ['civ_cook', 3, ['baker']], ['civ_physician', 3, ['herbalist']],
      ['civ_engineer', 2, []], ['civ_merchant', 2, ['packer']], ['civ_forager', 3, ['charcoalBurner']],
    ];
    for (const [cls, level, perks] of civs) {
      const p = this.recruit(cls, { level });
      this.roster.update({ ...p, hero: { ...p.hero, perks: perks as unknown as typeof p.hero.perks } }); // node ids ride in perks (src/data/professions.ts)
    }
  }

  private recruit(cls: string, o: Parameters<typeof makePerson>[2] = {}): WarPerson {
    const id = `you-${this.n++}`, base = makePerson(id, cls, o);
    const name = freeName(base.hero.culture, (this.n * 7) % 97, this.names);
    this.names.add(name);
    const p = { ...base, hero: { ...base.hero, name } };
    this.roster.add(p);
    return p;
  }

  /** n persons of cls for a spawn: fit reserve men of the class first, then recruits. */
  private take(cls: string, n: number): WarPerson[] {
    const out = this.roster.fit().filter((p) => p.hero.cls === (isClassId(cls) || isCivClass(cls) ? cls : 'militia') && !this.sent.has(p.id)).slice(0, n);
    while (out.length < n) out.push(this.recruit(cls));
    for (const p of out) this.sent.add(p.id);
    this.onChange?.();
    return out;
  }

  /** Every person, where he is now. */
  rows(): Row[] {
    const live = new Map<string, UnitSnap>();
    for (const u of this.s.sim.cur?.units ?? []) if (u.pid) live.set(u.pid, u);
    return this.roster.all().map((p) => {
      const st = this.roster.state(p.id), unit = live.get(p.id);
      if (st !== 'fit') return { p, where: st === 'captive' ? 'captive' : st };
      if (!unit || !this.sent.has(p.id)) return { p, where: 'reserve' };
      if (unit.state === 'dead') return { p, where: unit.wounded ? 'wounded' : 'dead', unit, squad: unit.squad };
      return { p, where: 'field', unit, squad: unit.squad };
    });
  }

  captorOf(pid: string): number | undefined {
    return this.captor.get(pid);
  }

  offers(pid: string): LevelOffer[] {
    const p = this.roster.get(pid);
    return p && this.roster.state(pid) !== 'dead' ? levelOffers(p) : [];
  }

  /** Take a level-up offer: the roster and the live man. */
  choose(pid: string, o: LevelOffer): void {
    const p = this.roster.get(pid);
    if (!p) return;
    this.put(applyOffer(p, o));
  }

  /** Dev: one level's worth of XP. */
  devXp(pid: string): void {
    const p = this.roster.get(pid);
    if (!p || this.roster.state(pid) === 'dead') return;
    const q = grantXp(p, xpToNext(p.hero.level));
    this.put(q);
    if (q.hero.level > p.hero.level) this.onNote?.({ kind: 'levelUp', pid, text: `${q.hero.name} reached level ${q.hero.level}` });
  }

  /** A person changed off the field (gear, profession nodes): the roster and his live man. */
  edit(p: WarPerson): void {
    this.put(p);
  }

  private put(p: WarPerson): void {
    this.roster.update(p);
    this.s.sim.setPerson(p);
    this.onChange?.();
  }

  /** End the fight now (the panel's button; also 5 s after the last blow). */
  endFight(): void {
    if (this.ending) return;
    this.ending = true;
    this.lastAction = -1;
    void this.s.sim.endFight().then((r) => {
      this.ending = false;
      if (r) this.report(r);
    });
  }

  private report(r: FightReport): void {
    const mine = r.persons.filter((x) => this.roster.get(x.pid));
    this.roster.apply({ ...r, persons: mine });
    for (const x of mine) {
      if (x.state !== 'fit') this.sent.delete(x.pid);
      if (x.state === 'captive' && x.captor !== undefined) this.captor.set(x.pid, x.captor);
    }
    const dead: PersonResult[] = mine.filter((x) => x.state === 'dead');
    for (const x of dead.slice(0, 3)) this.onNote?.({ kind: 'dead', pid: x.pid, text: `${x.hero.name} fell` });
    if (dead.length > 3) this.onNote?.({ kind: 'dead', text: `${dead.length - 3} more fell` });
    this.onChange?.();
  }

  /** The sim's event log: level-ups and captures of the player's men become notes; his blows and falls keep the fight on. */
  private events(ev: WarEvent[]): void {
    const own = new Set((this.s.sim.cur?.squads ?? []).filter((q) => q.team === 0).map((q) => q.id));
    const unit = new Map((this.s.sim.cur?.units ?? []).map((u) => [u.id, u]));
    for (const e of ev) {
      if (e.kind === 'levelUp' && this.roster.get(e.pid)) {
        const name = this.roster.get(e.pid)!.hero.name;
        this.onNote?.({ kind: 'levelUp', pid: e.pid, text: `${name} reached level ${e.level}` });
      } else if (e.kind === 'capture' && this.roster.get(e.pid)) {
        this.onNote?.({ kind: 'capture', pid: e.pid, text: `${this.roster.get(e.pid)!.hero.name} taken captive` });
      } else if (e.kind === 'fall') {
        const a = unit.get(e.unit), b = unit.get(e.by);
        if ((a && own.has(a.squad)) || (b && own.has(b.squad))) this.lastAction = e.t;
      }
    }
  }

  /** 4 Hz: a man of the player striking keeps the fight on; QUIET ticks after, it ends. */
  private watch(): void {
    const cur = this.s.sim.cur;
    if (!cur) return;
    const own = new Set(cur.squads.filter((q) => q.team === 0).map((q) => q.id));
    if (cur.units.some((u) => own.has(u.squad) && u.pid && u.state === 'attack')) this.lastAction = cur.tick;
    if (this.lastAction >= 0 && cur.tick - this.lastAction > QUIET) this.endFight();
  }

  /** Class display name. */
  static className(cls: string | undefined): string {
    if (isCivClass(cls)) return CIV_CLASSES[cls].name;
    return CLASSES[isClassId(cls ?? '') ? (cls as keyof typeof CLASSES) : 'militia'].name;
  }
}
