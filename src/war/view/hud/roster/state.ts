/**
 * The sandbox's soldier roster (M5g): the local in-memory roster of M5b (../../../sim/roster.ts) until the server keeps
 * persons (M5e). The player's (team 0, not bot) squads spawn with its persons: fit men of the class not on this map
 * (in his home region) first, then new recruits with names. The sim's event log comes in as it happens; a fight ends 5 s after the player's
 * last blow or fall (or on End fight), and its report is written back. Changes off the field (a level-up choice, dev XP)
 * go to the live man too (setPerson), so the next report does not undo them.
 *
 * Net mode (?net=, the live war): the server keeps the persons, so the roster is his (GET /api/war/roster, again every
 * PULL_MS and after a choice) instead of the local seed, and a level-up choice goes up as POST /persons/:id/level.
 *
 * W-68: a captured man is no man of his army any more (the roster notes who took him and where); the captives he holds
 * (net) with ask-to-join and release; dismiss (his soul rises where he stood, ../../soulRise.ts).
 */
import { CIV_CLASSES, CLASSES, isCivClass, isClassId } from '../../../../data/classes';
import { freeName } from '../../../../data/names';
import { bossTrophy, warBoss } from '../../../../data/warBosses';
import { plainDeed, slayerDeed, type PlainDeed } from '../../../sim/deeds';
import { xpToNext } from '../../../../data/units';
import { applyOffer, createRoster, grantXp, levelOffers, makePerson, type LevelOffer, type Roster } from '../../../sim/roster';
import { ATTR_IDS, ATTR_MAX, POINTS_PER_LEVEL, type AttrId } from '../../../../data/perks';
import { ARMY_MAX, SQUAD_MAX } from '../../../sim/soldiers';
import { CAPTIVE } from '../../../sim/captives';
import { ALLIANCES } from '../../../world/alliances';
import { WORLD_REGIONS } from '../../../world/regions';
import type { Item, Slot } from '../../../../data/items';
import type { FightReport, Order, PersonResult, UnitSnap, WarEvent, WarPerson, WarSkillId } from '../../../types';
import type { SandboxScene } from '../../SandboxScene';
import { myTeam } from '../../side';

/** away: fit, in another region (no reserve, W-58: every man stands in some region). */
export type Where = 'field' | 'away' | 'wounded' | 'captive' | 'dead';
/** A person as the panel shows him: where he is, his live man (in the field), his squad and its order, the region's name. */
export interface Row { p: WarPerson; where: Where; unit?: UnitSnap; squad?: number; order?: Order['kind']; region: string }
export interface Note { kind: 'levelUp' | 'capture' | 'dead' | 'info'; pid?: string; text: string }
/** E3: a grave on the home memorial: the fallen man (his record as he fell), where and when (ms). */
export interface Grave { p: WarPerson; region: string; at: number }
/** E3: a guardian's trophy in the home town. */
export interface TrophyRow { boss: string; name: string; region: string; at: number }

/** A fight ends this many ticks after the player's last blow or fall. */
const QUIET = 50;
/** Net mode: the server's roster again this often (ms; his men level in fights the server runs). */
const PULL_MS = 10_000;

/** Net mode: a person as GET /api/war/roster lists him (server/src/war/persons.ts view). */
export interface NetPerson {
  id: string; cls: string; name: string; level: number; xp: number; kills: number; battles: number; attrs: Partial<Record<AttrId, number>>;
  skills?: WarSkillId[]; gear?: Partial<Record<Slot, Item>>; honours?: WarPerson['honours']; state: string; region: string | null;
  pending: { points: number }; perks?: string[]; deeds?: WarPerson['deeds']; scars?: number;
  /** W-68: who holds him, and where (a captive). */
  captorName?: string; heldAt?: string | null;
}

/** W-68: a captive the player holds (GET /api/war/roster `captives`). */
export interface HeldCaptive { id: string; name: string; cls: string; level: number; owner: number; ownerName: string; until: number | null; askAt: number | null; refused: boolean; heldAt: string | null }

/** A region's name by id. */
const regionName = (id: string | null | undefined) => (id ? (WORLD_REGIONS.find((w) => w.id === id)?.name ?? id) : 'the field');

/** The server's man as the card's person: his class's fresh hero with the server's level, points, attributes, gear and record. */
export function netPerson(n: NetPerson): WarPerson {
  const base = makePerson(n.id, n.cls, { level: n.level }).hero;
  const hero = {
    ...base, name: n.name || base.name, level: n.level, xp: n.xp, points: n.pending.points, kills: n.kills, battles: n.battles,
    attrs: { ...base.attrs, ...n.attrs }, equip: n.gear ?? {}, perks: (n.perks ?? base.perks) as typeof base.perks,
  };
  return { id: n.id, hero, skills: n.skills ?? [], honours: n.honours ?? [], ...(n.deeds?.length ? { deeds: n.deeds } : {}), ...(n.scars ? { scars: n.scars } : {}) };
}

/** The server's person state as the roster's (training: still his, at home). */
const NET_STATE: Record<string, PersonResult['state']> = { wounded: 'wounded', captive: 'captive', dead: 'dead' };
const rosters = new WeakMap<SandboxScene, SandboxRoster>();

/** The scene's roster (made on first call; call before the scenario spawns, so its squads get persons). */
export function sandboxRoster(s: SandboxScene): SandboxRoster {
  let r = rosters.get(s);
  if (!r) rosters.set(s, (r = new SandboxRoster(s)));
  return r;
}

export class SandboxRoster {
  roster: Roster = createRoster();
  /** Net mode: the region each man stands in (null: at home). */
  private netRegion = new Map<string, string | null>();
  /** Persons sent to the field (until the fight that took them is reported). */
  private sent = new Set<string>();
  private captor = new Map<string, number>();
  /** W-68 net: "Captured by <player> at <region>" by person id; the captives he holds; his fighters (the cap). */
  private taken = new Map<string, string>();
  private held: HeldCaptive[] = [];
  private fighters: number | null = null;
  private names = new Set<string>();
  private n = 0;
  /** E3: where and when each of the fallen fell (the memorial's graves), the trophies of guardians his men slew. */
  private graves = new Map<string, { region: string; at: number }>();
  private won: TrophyRow[] = [];
  /** E3 scenarios: enlisted veterans, handed out before the other fit men of their class. */
  private first = new Set<string>();
  /** The tick of the player's last blow or fall in the current fight (-1: no fight). */
  private lastAction = -1;
  private ending = false;
  onNote: ((n: Note) => void) | null = null;
  onChange: (() => void) | null = null;

  constructor(private s: SandboxScene) {
    if (s.sim.net) {
      void this.pull();
      setInterval(() => void this.pull(), PULL_MS);
    } else this.seed();
    // only the player's own spawns draw his men (an ally's or a garrison's squad on his team stays anonymous)
    s.sim.personsFor = (owner, team, cls, count) => (team === myTeam() && owner === 'you' ? this.take(cls, Math.min(count, SQUAD_MAX)) : undefined);
    const prev = s.sim.onEvents; // the other listeners (sound, mob FX) keep theirs
    s.sim.onEvents = (ev) => (prev?.(ev), this.events(ev));
    setInterval(() => this.watch(), 250);
  }

  /** Veterans to browse before any fight (in the home region): one of each trained class, levels 2..7, a pending level-up among them. */
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

  /** Net mode: the server's roster in place of the one held (the fallen and the captive in their state). */
  async pull(): Promise<void> {
    const r = await this.s.sim.api<{ persons?: NetPerson[]; captives?: HeldCaptive[]; caps?: { fighters: number } }>('GET', 'roster');
    if (!r?.persons) return;
    const ro = createRoster(), gone: PersonResult[] = [];
    this.netRegion.clear();
    this.taken.clear();
    this.held = r.captives ?? [];
    this.fighters = r.caps?.fighters ?? null;
    for (const n of r.persons) {
      const p = netPerson(n);
      ro.add(p);
      this.netRegion.set(p.id, n.region);
      if (n.state === 'captive') this.taken.set(p.id, `Captured by ${n.captorName ?? 'a foe'} at ${regionName(n.heldAt)}`);
      const st = NET_STATE[n.state];
      if (st) gone.push({ pid: p.id, owner: 'you', team: myTeam(), state: st, xp: 0, kills: 0, dmg: 0, levelUps: 0, hero: p.hero });
    }
    ro.apply({ tick: 0, persons: gone, loot: {} });
    this.roster = ro;
    this.onChange?.();
  }

  private recruit(cls: string, o: Parameters<typeof makePerson>[2] = {}): WarPerson {
    const id = `you-${this.n++}`, base = makePerson(id, cls, o);
    const name = freeName(base.hero.culture, (this.n * 7) % 97, this.names);
    this.names.add(name);
    const p = { ...base, hero: { ...base.hero, name } };
    this.roster.add(p);
    return p;
  }

  /** n persons of cls for a spawn: fit men of the class not on this map first, then recruits. */
  private take(cls: string, n: number): WarPerson[] {
    const out = this.roster.fit().filter((p) => p.hero.cls === (isClassId(cls) || isCivClass(cls) ? cls : 'militia') && !this.sent.has(p.id))
      .sort((a, b) => Number(this.first.has(b.id)) - Number(this.first.has(a.id))).slice(0, n);
    while (out.length < n) out.push(this.recruit(cls));
    for (const p of out) this.sent.add(p.id);
    this.onChange?.();
    return out;
  }

  /** Every person, where he is now: on this map, or (fit, not sent) in the player's home region. */
  rows(): Row[] {
    const live = new Map<string, UnitSnap>();
    for (const u of this.s.sim.cur?.units ?? []) if (u.pid) live.set(u.pid, u);
    const here = this.s.region?.name ?? 'this region', homeId = ALLIANCES[myTeam()]?.home;
    const home = WORLD_REGIONS.find((w) => w.id === homeId)?.name ?? 'your home';
    return this.roster.all().map((p) => {
      const st = this.roster.state(p.id), unit = live.get(p.id);
      if (st !== 'fit') return { p, where: st === 'captive' ? 'captive' : st, region: here };
      // net mode: any live man of his is in the field (the server sent him); at rest he stands where the server says
      const at = this.netRegion.get(p.id), away = at ? (WORLD_REGIONS.find((w) => w.id === at)?.name ?? at) : home;
      if (!unit || !(this.sent.has(p.id) || this.s.sim.net)) return { p, where: 'away', region: away };
      if (unit.state === 'dead') return { p, where: unit.wounded ? 'wounded' : 'dead', unit, squad: unit.squad, region: here };
      return { p, where: 'field', unit, squad: unit.squad, order: this.s.sim.squads.get(unit.squad)?.order, region: here };
    });
  }

  /** The army (W-58): his fighters counted against ARMY_MAX (civilians are the household; the fallen and, W-68, the captive do not count). */
  army(): { men: number; max: number } {
    return { men: this.roster.all().filter((p) => !isCivClass(p.hero.cls) && this.roster.state(p.id) !== 'dead' && this.roster.state(p.id) !== 'captive').length, max: ARMY_MAX };
  }

  /** W-68: the note on a man of his taken captive: "Captured by <player> at <region>" (offline: by team n). */
  takenNote(pid: string): string {
    return this.taken.get(pid) ?? `Captured by team ${this.captor.get(pid) ?? '?'} at ${this.s.region?.name ?? 'the field'}`;
  }

  /** W-68 net: the captives he holds. */
  captives(): readonly HeldCaptive[] {
    return this.held;
  }

  /** W-68: is his army full (ask-to-join refused)? */
  full(): boolean {
    return (this.fighters ?? this.army().men) >= ARMY_MAX;
  }

  /** W-68 net: ask a captive to join, or release him; the answer as a note, then the roster again. */
  async captive(id: string, act: 'join' | 'release'): Promise<void> {
    const c = this.held.find((x) => x.id === id);
    const r = await this.s.sim.api<{ joined?: boolean; error?: string | { message?: string } }>('POST', `captives/${id}/${act}`);
    const e = r?.error;
    if (e) this.onNote?.({ kind: 'info', text: typeof e === 'string' ? e : (e.message ?? 'refused') });
    else if (act === 'release') this.onNote?.({ kind: 'info', text: `${c?.name ?? 'He'} is free: his soul rises to a shrine` });
    else this.onNote?.({ kind: 'info', text: r?.joined ? `${c?.name ?? 'He'} joins your army` : `${c?.name ?? 'He'} refuses to serve you` });
    await this.pull();
  }

  /** W-68: may he be dismissed (a soldier of his, fit or wounded)? */
  dismissable(r: Row): boolean {
    return !isCivClass(r.p.hero.cls) && (r.where === 'field' || r.where === 'away' || r.where === 'wounded');
  }

  /**
   * W-68: dismiss him: his gear drops where he stands, his soul rises (`rise`: the view plays it where his man stood) and
   * waits at a shrine for anyone to claim, not this player for CAPTIVE.barMs. Online the server does it; offline the sim.
   */
  async dismiss(pid: string, rise: (cls: string, x: number, y: number, pid: string) => void): Promise<void> {
    const row = this.rows().find((x) => x.p.id === pid);
    if (!row || !this.dismissable(row)) return;
    const u = row.unit && row.unit.state !== 'dead' ? row.unit : undefined;
    if (this.s.sim.net) {
      const r = await this.s.sim.api<{ error?: string | { message?: string } }>('POST', `persons/${pid}/dismiss`);
      const e = r?.error;
      if (e) return void this.onNote?.({ kind: 'info', pid, text: typeof e === 'string' ? e : (e.message ?? 'refused') });
    } else {
      const p = makePerson(pid, row.p.hero.cls ?? 'militia', { level: row.p.hero.level });
      this.s.sim.dismiss({ ...row.p, hero: { ...row.p.hero, equip: p.hero.equip } }, CAPTIVE.soulMs / 100, { owner: 'you', ticks: CAPTIVE.barMs / 100 });
      this.roster.remove(pid);
      this.sent.delete(pid);
    }
    if (u) rise(row.p.hero.cls ?? 'militia', u.x, u.y, pid);
    this.onNote?.({ kind: 'info', text: `${row.p.hero.name} is dismissed: his soul rises to the sky` });
    if (this.s.sim.net) await this.pull();
    else this.onChange?.();
  }

  /** W-66 offline: a man the Tunnel of Shades raised (level 1, starter gear), the first one the next spawn of his class takes. */
  raise(cls: string): WarPerson {
    const p = this.recruit(cls);
    this.first.add(p.id);
    this.onChange?.();
    return p;
  }

  /** W-66: the classes of his fallen fighters, latest first (the tunnel raises their like). */
  fallenClasses(): string[] {
    return [...this.graves].sort((a, b) => b[1].at - a[1].at).map(([id]) => this.roster.get(id)?.hero.cls ?? '').filter((c) => c && !isCivClass(c));
  }

  /** What he may take now: an open skill slot first, and his unspent points beside it (a pending skill does not hold them back). */
  offers(pid: string): LevelOffer[] {
    const p = this.roster.get(pid);
    if (!p || this.roster.state(pid) === 'dead') return [];
    const os = levelOffers(p), n = Math.min(p.hero.points, POINTS_PER_LEVEL);
    if (os[0]?.kind === 'skill' && n > 0) for (const attr of ATTR_IDS) if (p.hero.attrs[attr] < ATTR_MAX) os.push({ kind: 'attr', attr, n });
    return os;
  }

  /** Take a level-up offer: the roster and the live man (net mode: the server keeps it, then his roster comes again). */
  choose(pid: string, o: LevelOffer): void {
    const p = this.roster.get(pid);
    if (!p) return;
    const q = applyOffer(p, o);
    if (!this.s.sim.net) return this.put(q);
    this.roster.update(q); // shown at once; the pull puts the server's word over it
    this.onChange?.();
    const body = o.kind === 'skill' ? { skill: o.skill } : { attrs: { [o.attr]: q.hero.attrs[o.attr] - p.hero.attrs[o.attr] } };
    // a refusal (he is in the field, no points left): { error: { code, message } }, or a bare string off the wire
    void this.s.sim.api<{ error?: string | { message?: string } }>('POST', `persons/${pid}/level`, body).then((r) => {
      const e = r?.error;
      if (e) this.onNote?.({ kind: 'info', pid, text: typeof e === 'string' ? e : (e.message ?? 'refused') });
      return this.pull();
    });
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
    for (const x of dead) this.graves.set(x.pid, { region: this.s.region?.name ?? 'the field', at: Date.now() });
    for (const x of dead.slice(0, 3)) this.onNote?.({ kind: 'dead', pid: x.pid, text: `${x.hero.name} fell` });
    if (dead.length > 3) this.onNote?.({ kind: 'dead', text: `${dead.length - 3} more fell` });
    this.onChange?.();
  }

  /** The sim's event log: level-ups and captures of the player's men become notes; his blows and falls keep the fight on. */
  private events(ev: WarEvent[]): void {
    const own = new Set((this.s.sim.cur?.squads ?? []).filter((q) => q.team === myTeam()).map((q) => q.id));
    const unit = new Map((this.s.sim.cur?.units ?? []).map((u) => [u.id, u]));
    for (const e of ev) {
      if (e.kind === 'levelUp' && this.roster.get(e.pid)) {
        const name = this.roster.get(e.pid)!.hero.name;
        this.onNote?.({ kind: 'levelUp', pid: e.pid, text: `${name} reached level ${e.level}` });
      } else if (e.kind === 'capture' && this.roster.get(e.pid)) {
        this.onNote?.({ kind: 'capture', pid: e.pid, text: `${this.roster.get(e.pid)!.hero.name} taken captive` });
      } else if (e.kind === 'bossSlain' && e.killers.includes('you') && !this.won.some((t) => t.boss === e.boss && t.at === e.t)) {
        // E3: the guardian's trophy goes home with his killers
        this.won.unshift({ boss: e.boss, name: bossTrophy(e.boss), region: this.s.region?.name ?? e.region, at: e.t });
        this.onNote?.({ kind: 'info', text: `Trophy: ${bossTrophy(e.boss)}` });
        this.onChange?.();
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
    const own = new Set(cur.squads.filter((q) => q.team === myTeam()).map((q) => q.id));
    if (cur.units.some((u) => own.has(u.squad) && u.pid && u.state === 'attack')) this.lastAction = cur.tick;
    if (this.lastAction >= 0 && cur.tick - this.lastAction > QUIET) this.endFight();
  }

  /** E3 scenarios: n fit veterans of cls (level, kit tier, deeds, scars) at the head of the roster, for the next spawn of the class. */
  enlist(cls: string, n: number, v: { level: number; tier?: 0 | 1 | 2; deeds?: string[]; scars?: number }): void {
    const deeds = (v.deeds ?? []).map((id) => (id.startsWith('slayer:') ? slayerDeed(id.slice(7)) : plainDeed(id as PlainDeed)));
    const mine = Array.from({ length: n }, (_, k): WarPerson => {
      const p = this.recruit(cls, { level: v.level, tier: v.tier ?? 1, rarity: v.level >= 6 ? 'rare' : 'uncommon' });
      return { ...p, hero: { ...p.hero, kills: 3 + ((k * 7) % 11), battles: 2 + (k % 5) }, ...(deeds.length ? { deeds: deeds.slice(0, 1 + (k % deeds.length)) } : {}), ...(v.scars ? { scars: k % (v.scars + 1) } : {}) };
    });
    for (const q of mine) (this.roster.update(q), this.first.add(q.id));
    this.onChange?.();
  }

  /** E3: the home memorial's graves, newest first. */
  memorial(): Grave[] {
    return this.roster.all().filter((p) => this.roster.state(p.id) === 'dead').map((p) => ({ p, ...(this.graves.get(p.id) ?? { region: 'the field', at: 0 }) })).sort((a, b) => b.at - a.at);
  }

  /** E3: the trophies in the home town, newest first. */
  trophies(): readonly TrophyRow[] {
    return this.won;
  }

  /** E3 scenarios: men who fell before the scenario (graves on the memorial, deeds and all) and trophies won. */
  seedHistory(fallen: { cls: string; level: number; kills: number; battles: number; deeds: string[]; region: string }[], trophies: string[] = []): void {
    for (const [k, f] of fallen.entries()) {
      const p = this.recruit(f.cls, { level: f.level });
      const deeds = f.deeds.map((id) => (id.startsWith('slayer:') ? slayerDeed(id.slice(7)) : plainDeed(id as PlainDeed)));
      this.roster.update({ ...p, hero: { ...p.hero, kills: f.kills, battles: f.battles, equip: {} }, deeds });
      this.roster.apply({ tick: 0, persons: [{ pid: p.id, owner: 'you', team: myTeam(), state: 'dead', xp: 0, kills: 0, dmg: 0, levelUps: 0, hero: this.roster.get(p.id)!.hero }], loot: {} });
      this.graves.set(p.id, { region: f.region, at: Date.now() - (fallen.length - k) * 3_600_000 });
    }
    for (const [k, b] of trophies.entries()) this.won.push({ boss: b, name: bossTrophy(b), region: WORLD_REGIONS.find((w) => w.id === warBoss(b)?.region)?.name ?? '', at: -k });
    this.onChange?.();
  }

  /** Class display name. */
  static className(cls: string | undefined): string {
    if (isCivClass(cls)) return CIV_CLASSES[cls].name;
    return CLASSES[isClassId(cls ?? '') ? (cls as keyof typeof CLASSES) : 'militia'].name;
  }
}
